import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatDoctorReport,
  formatNowReport,
  formatStatusReport,
  formatWorklistReport,
} from "../src/formatters.js";
import { formatGoogleLoginError as formatCliGoogleLoginError } from "../src/cli/http-client.js";
import { Logger } from "../src/logger.js";
import { resolvePaths } from "../src/paths.js";
import { PersonalOpsService } from "../src/service.js";
import type { ClientIdentity, Config, Paths, Policy } from "../src/types.js";

const cliIdentity: ClientIdentity = {
  client_id: "operator-cli",
  requested_by: "operator",
  auth_role: "operator",
};

function repoAppDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function withRuntimeEnv<T>(env: Record<string, string>, fn: () => T): T {
  const keys = [
    "HOME",
    "PERSONAL_OPS_CONFIG_DIR",
    "PERSONAL_OPS_STATE_DIR",
    "PERSONAL_OPS_LOG_DIR",
    "PERSONAL_OPS_APP_DIR",
    "PERSONAL_OPS_LAUNCH_AGENT_LABEL",
  ];
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    process.env[key] = env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createTempEnv(label: string) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `personal-ops-cli-ux-${label}-`));
  const home = path.join(base, "home");
  fs.mkdirSync(home, { recursive: true });
  const env = {
    HOME: home,
    PERSONAL_OPS_CONFIG_DIR: path.join(home, ".config", "personal-ops"),
    PERSONAL_OPS_STATE_DIR: path.join(home, "Library", "Application Support", "personal-ops"),
    PERSONAL_OPS_LOG_DIR: path.join(home, "Library", "Logs", "personal-ops"),
    PERSONAL_OPS_APP_DIR: repoAppDir(),
    PERSONAL_OPS_LAUNCH_AGENT_LABEL: `com.d.personal-ops.test.${label}.${Date.now()}`,
  };
  const paths = withRuntimeEnv(env, () => resolvePaths());
  fs.mkdirSync(paths.configDir, { recursive: true });
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.mkdirSync(paths.logDir, { recursive: true });
  fs.mkdirSync(paths.snapshotsDir, { recursive: true });
  return { base, env, paths };
}

function writeFixtureFiles(paths: Paths, port: number) {
  fs.writeFileSync(
    paths.configFile,
    `[service]
host = "127.0.0.1"
port = ${port}

[http]
allowed_origins = []

[gmail]
account_email = "machine@example.com"
review_url = "https://mail.google.com/mail/u/0/#drafts"

[calendar]
enabled = true
provider = "google"
included_calendar_ids = []
sync_past_days = 30
sync_future_days = 90
sync_interval_minutes = 5
workday_start_local = "09:00"
workday_end_local = "18:00"
meeting_prep_warning_minutes = 30
day_overload_event_threshold = 6
schedule_pressure_free_minutes_threshold = 60

[auth]
keychain_service = "personal-ops.gmail.test"
oauth_client_file = "${paths.oauthClientFile}"
`,
    "utf8",
  );
  fs.writeFileSync(
    paths.policyFile,
    `[notifications]
title_prefix = "Personal Ops"

[security]
allow_send = false

[audit]
default_limit = 50
`,
    "utf8",
  );
  fs.writeFileSync(
    paths.oauthClientFile,
    JSON.stringify({
      installed: {
        client_id: "client-id",
        client_secret: "client-secret",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        redirect_uris: ["http://127.0.0.1"],
      },
    }),
    "utf8",
  );
  fs.writeFileSync(paths.apiTokenFile, "test-token", "utf8");
  fs.writeFileSync(paths.assistantApiTokenFile, "assistant-token", "utf8");
  fs.writeFileSync(paths.appLogFile, '{"event":"test"}\n', "utf8");
}

function createServiceFixture() {
  const { env, paths } = createTempEnv("service");
  writeFixtureFiles(paths, 46210);

  const config: Config = {
    serviceHost: "127.0.0.1",
    servicePort: 46210,
    allowedOrigins: [],
    gmailAccountEmail: "machine@example.com",
    gmailReviewUrl: "https://mail.google.com/mail/u/0/#drafts",
    calendarEnabled: true,
    calendarProvider: "google",
    includedCalendarIds: [],
    calendarSyncPastDays: 30,
    calendarSyncFutureDays: 90,
    calendarSyncIntervalMinutes: 5,
    workdayStartLocal: "09:00",
    workdayEndLocal: "18:00",
    meetingPrepWarningMinutes: 30,
    dayOverloadEventThreshold: 6,
    schedulePressureFreeMinutesThreshold: 60,
    keychainService: "personal-ops.gmail.test",
    oauthClientFile: paths.oauthClientFile,
    apiToken: "test-token",
    assistantApiToken: "assistant-token",
  };
  const policy: Policy = {
    notificationsTitlePrefix: "Personal Ops",
    allowSend: false,
    auditDefaultLimit: 50,
  };

  return withRuntimeEnv(env, () => {
    const logger = new Logger(paths);
    const service = new PersonalOpsService(paths, config, policy, logger, {
      loadStoredGmailTokens: async () => ({
        email: "machine@example.com",
        clientConfig: {
          client_id: "client-id",
          client_secret: "client-secret",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          redirect_uris: ["http://127.0.0.1"],
        },
        tokensJson: JSON.stringify({ refresh_token: "refresh-token" }),
      }),
      inspectLaunchAgent: () => ({
        exists: true,
        loaded: true,
        running: true,
        label: env.PERSONAL_OPS_LAUNCH_AGENT_LABEL,
        plistPath: path.join(path.dirname(paths.logDir), "LaunchAgents", `${env.PERSONAL_OPS_LAUNCH_AGENT_LABEL}.plist`),
        programPath: path.join(paths.appDir, "dist", "src", "daemon.js"),
        workingDirectory: paths.appDir,
        stdoutPath: paths.appLogFile,
        stderrPath: paths.appLogFile,
      }),
      verifyGmailMetadataAccess: async () => {},
      verifyGoogleCalendarAccess: async () => {},
      verifyGoogleCalendarWriteAccess: async () => {},
      listGoogleCalendarSources: async () => ({ calendars: [] }),
      listGoogleCalendarEvents: async () => ({ events: [] }),
    });
    return { env, paths, service };
  });
}

function cliEntryPath() {
  return path.join(repoAppDir(), "dist", "src", "cli.js");
}

test("Phase 4 formatters emphasize start-here guidance and the new now summary", async () => {
  const { service } = createServiceFixture();
  service.createTask(cliIdentity, {
    title: "Follow up on overdue note",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });

  const status = await service.getStatusReport({ httpReachable: true });
  const worklist = await service.getWorklistReport({ httpReachable: true });
  const doctor = await service.runDoctor({ deep: false, httpReachable: true });

  const formattedStatus = formatStatusReport(status);
  const formattedWorklist = formatWorklistReport(worklist);
  const formattedDoctor = formatDoctorReport(doctor);
  const formattedNow = formatNowReport(status, worklist);

  assert.match(formattedStatus, /Start Here/);
  assert.match(formattedStatus, /Next attention:/);
  assert.match(formattedStatus, /Policy attention:/);
  assert.match(formattedStatus, /Top hygiene summary:/);
  assert.match(formattedWorklist, /Start Here/);
  assert.match(formattedWorklist, /Items/);
  assert.match(formattedWorklist, /next:/);
  assert.match(formattedDoctor, /Personal Ops Doctor:/);
  assert.match(formattedDoctor, /Summary:/);
  assert.match(formattedNow, /Personal Ops Now:/);
  assert.match(formattedNow, /Next Steps/);
  assert.match(formattedNow, /personal-ops worklist/);
});

test("Phase 4 top-level help highlights the main operator path and the now shortcut", () => {
  const { env, paths } = createTempEnv("help");
  writeFixtureFiles(paths, 46211);

  const output = execFileSync(process.execPath, [cliEntryPath(), "--help"], {
    cwd: repoAppDir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  assert.match(output, /Start here:/i);
  assert.match(output, /personal-ops install check/);
  assert.match(output, /personal-ops now/);
  assert.match(output, /status \[options\]\s+Show the full operator readiness summary for the local/i);
});

test("Phase 4 daemon-unreachable errors point the operator to the next local checks", () => {
  const { env, paths } = createTempEnv("unreachable");
  writeFixtureFiles(paths, 49999);

  assert.throws(
    () =>
      execFileSync(process.execPath, [cliEntryPath(), "status"], {
        cwd: repoAppDir(),
        env: { ...process.env, ...env },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    (error) => {
      const stderr = String((error as { stderr?: string }).stderr ?? "");
      assert.match(stderr, /Could not reach the local personal-ops daemon/i);
      assert.match(stderr, /personal-ops install check/);
      assert.match(stderr, /personal-ops doctor/);
      assert.match(stderr, /launchctl kickstart -k/);
      assert.match(stderr, /personal-opsd/);
      return true;
    },
  );
});

test("Phase 6 auth login errors point the operator to config and re-auth recovery", () => {
  const startError = formatCliGoogleLoginError("start", new Error("OAuth client file is not valid JSON."));
  const completeError = formatCliGoogleLoginError(
    "complete",
    new Error("Google did not return a refresh token. Remove the existing grant and try again."),
  );

  assert.match(startError.message, /Could not start the Google login flow/i);
  assert.match(startError.message, /install check/i);
  assert.match(startError.message, /OAuth client JSON/i);
  assert.match(completeError.message, /could not save the grant/i);
  assert.match(completeError.message, /auth gmail login/i);
  assert.match(completeError.message, /auth google login/i);
  assert.match(completeError.message, /doctor --deep/i);
});
