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
  formatHealthCheckReport,
  formatMaintenanceSessionPlan,
  formatMaintenanceSessionRunResult,
  formatNowReport,
  formatRepairPlanReport,
  formatStatusReport,
  formatWorkflowBundleReport,
  formatWorklistReport,
} from "../src/formatters.js";
import { formatGoogleLoginError as formatCliGoogleLoginError } from "../src/cli/http-client.js";
import { PersonalOpsDb } from "../src/db.js";
import { buildHealthCheckReport } from "../src/health.js";
import { buildInstallCheckReport, fixInstallPermissions, installAll, installWrappers } from "../src/install.js";
import { Logger } from "../src/logger.js";
import { resolvePaths } from "../src/paths.js";
import { writeRecoveryRehearsalStamp } from "../src/recovery.js";
import { PersonalOpsService } from "../src/service.js";
import type { ClientIdentity, Config, Paths, Policy } from "../src/types.js";

const cliIdentity: ClientIdentity = {
  client_id: "operator-cli",
  requested_by: "operator",
  auth_role: "operator",
};

function emptyMaintenanceFollowThrough(generatedAt = "2026-04-11T10:00:00.000Z") {
  return {
    generated_at: generatedAt,
    last_maintenance_outcome: null,
    last_maintenance_step_id: null,
    top_signal: null,
    current_bundle_outcome: null,
    maintenance_pressure_count: 0,
    top_maintenance_pressure_step_id: null,
    pressure: {
      signal: null,
      count: 0,
      top_step_id: null,
      summary: null,
      suggested_command: null,
    },
    escalation: {
      eligible: false,
      step_id: null,
      signal: null,
      summary: null,
      suggested_command: null,
      handoff_count_30d: 0,
      cue: null,
    },
    summary: null,
  };
}

function emptyMaintenanceScheduling() {
  return {
    eligible: false,
    placement: "suppressed" as const,
    step_id: null,
    summary: null,
    suggested_command: null,
    reason: null,
    bundle_step_ids: [],
  };
}

function createLaunchctlStub(initiallyLoaded = false) {
  let loaded = initiallyLoaded;
  return {
    execFileSyncImpl(_file: string, args: readonly string[]) {
      const normalized = args.map((value) => String(value));
      if (normalized[0] === "print") {
        if (!loaded) {
          throw new Error("not loaded");
        }
        return `${normalized[1]} = {\n\tstate = running\n}`;
      }
      if (normalized[0] === "bootout") {
        loaded = false;
        return "";
      }
      if (normalized[0] === "bootstrap" || normalized[0] === "kickstart") {
        loaded = true;
        return "";
      }
      throw new Error(`Unexpected launchctl args: ${normalized.join(" ")}`);
    },
  };
}

function repoAppDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function repoPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoAppDir(), "package.json"), "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0-unknown";
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
  const restoreEnv = () => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
  try {
    const result = fn();
    const maybePromise = result as unknown as PromiseLike<unknown>;
    if (result && typeof maybePromise.then === "function") {
      return Promise.resolve(result).finally(restoreEnv) as T;
    }
    restoreEnv();
    return result;
  } finally {
    if (process.env.HOME !== env.HOME) {
      restoreEnv();
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
    autopilotEnabled: true,
    autopilotMode: "continuous",
    autopilotRunIntervalMinutes: 5,
    autopilotWarmOnConsoleOpen: true,
    autopilotWarmOnDesktopOpen: true,
    autopilotProfiles: ["day_start", "inbox", "meetings", "planning", "outbound"],
    autopilotFailureBackoffMinutes: 15,
    autopilotNotificationCooldownMinutes: 30,
    gmailAccountEmail: "machine@example.com",
    gmailReviewUrl: "https://mail.google.com/mail/u/0/#drafts",
    githubEnabled: false,
    includedGithubRepositories: [],
    githubSyncIntervalMinutes: 10,
    githubKeychainService: "personal-ops.github.test",
    driveEnabled: false,
    includedDriveFolders: [],
    includedDriveFiles: [],
    driveSyncIntervalMinutes: 30,
    driveRecentDocsLimit: 10,
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
        programPath: path.join(env.HOME, ".local", "bin", "personal-opsd"),
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

test("phase 18 formatters surface maintenance windows only during calm periods", async () => {
  const { service } = createServiceFixture();
  const status = await service.getStatusReport({ httpReachable: true });
  const worklist = {
    ...(await service.getWorklistReport({ httpReachable: true })),
    items: [],
    maintenance_window: {
      eligible_now: true,
      deferred_reason: null,
      count: 1,
      top_step_id: "install_wrappers" as const,
      bundle: {
        bundle_id: "maintenance-window:install_wrappers",
        title: "Preventive maintenance window",
        summary: "Refresh wrappers before the next drift is a good calm-window maintenance task right now.",
        recommended_commands: ["personal-ops install wrappers"],
        recommendations: [
          {
            step_id: "install_wrappers" as const,
            title: "Refresh wrappers before the next drift",
            reason: "Wrapper drift has repeated on this machine.",
            suggested_command: "personal-ops install wrappers",
            urgency: "watch" as const,
            last_resolved_at: "2026-04-06T18:05:00.000Z",
            repeat_count_30d: 2,
          },
        ],
      },
    },
    maintenance_scheduling: {
      eligible: true,
      placement: "calm_window" as const,
      step_id: "install_wrappers" as const,
      summary: "Refresh wrappers before the next drift is a good calm-window maintenance task right now.",
      suggested_command: "personal-ops maintenance session",
      reason: "Keep this for a calm window; do not displace active operator work.",
      bundle_step_ids: ["install_wrappers" as const],
    },
  };
  const prepDay = {
    workflow: "prep-day" as const,
    generated_at: new Date().toISOString(),
    readiness: "ready" as const,
    summary: "Ready for the day.",
    first_repair_step: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: {
      eligible: false,
      step_id: null,
      signal: null,
      summary: null,
      suggested_command: null,
      handoff_count_30d: 0,
      cue: null,
    },
    maintenance_scheduling: {
      eligible: true,
      placement: "calm_window" as const,
      step_id: "install_wrappers" as const,
      summary: "Refresh wrappers before the next drift is a good calm-window maintenance task right now.",
      suggested_command: "personal-ops maintenance session",
      reason: "Keep this for a calm window; do not displace active operator work.",
      bundle_step_ids: ["install_wrappers" as const],
    },
    actions: [],
    sections: [
      { title: "Overall State", items: [] },
      { title: "Top Attention", items: [] },
      { title: "Time-Sensitive Items", items: [] },
      {
        title: "Maintenance Window",
        items: [
          {
            label: "Refresh wrappers before the next drift",
            summary: "Wrapper drift has repeated on this machine.",
            command: "personal-ops maintenance session",
            why_now: "This is preventive maintenance for a calm window, not active repair or urgent delivery work.",
            score_band: "medium" as const,
            signals: ["maintenance_window", "install_wrappers"],
          },
        ],
      },
      { title: "Next Commands", items: [] },
    ],
  };

  assert.match(formatWorklistReport(worklist), /Preventive Maintenance/);
  assert.doesNotMatch(formatNowReport(status, worklist), /Calm Window/);
  assert.match(formatWorklistReport(worklist), /personal-ops maintenance session/);
  assert.doesNotMatch(formatNowReport(status, worklist), /personal-ops maintenance session/);
  assert.match(formatWorkflowBundleReport(prepDay), /Maintenance Window/);
  assert.match(formatWorkflowBundleReport(prepDay), /calm window/i);
});

test("phase 19 maintenance session formatters show the calm-window entrypoint and next-step handoff", () => {
  const sessionOutput = formatMaintenanceSessionPlan({
    generated_at: "2026-04-11T10:00:00.000Z",
    eligible_now: true,
    deferred_reason: null,
    bundle_id: "maintenance-window:install_wrappers",
    title: "Preventive maintenance window",
    summary: "A small wrapper refresh fits a calm window right now.",
    start_command: "personal-ops maintenance session",
    first_step_id: "install_wrappers",
    maintenance_follow_through: {
      ...emptyMaintenanceFollowThrough(),
      current_bundle_outcome: {
        signal: "advanced",
        step_id: "install_wrappers",
        occurred_at: "2026-04-11T09:55:00.000Z",
        remaining_step_count: 1,
        summary: "The last maintenance session advanced cleanly and 1 calm-window maintenance step remains.",
      },
      summary: "The last maintenance session advanced cleanly and 1 calm-window maintenance step remains.",
    },
    maintenance_scheduling: emptyMaintenanceScheduling(),
    steps: [
      {
        step_id: "install_wrappers",
        title: "Refresh wrappers before the next drift",
        reason: "Wrapper drift has repeated on this machine.",
        suggested_command: "personal-ops install wrappers",
        blocking: false,
        latest_outcome: "resolved",
        latest_completed_at: "2026-04-10T08:00:00.000Z",
      },
    ],
  });
  const runOutput = formatMaintenanceSessionRunResult({
    generated_at: "2026-04-11T10:05:00.000Z",
    step_id: "install_wrappers",
    executed: true,
    suggested_command: "personal-ops install wrappers",
    outcome: "resolved",
    session_complete: false,
    next_step_id: "install_launchagent",
    next_command: "personal-ops maintenance run next",
    maintenance_follow_through: {
      ...emptyMaintenanceFollowThrough(),
      summary: "The last maintenance session advanced cleanly and 1 calm-window maintenance step remains.",
    },
    message: "Maintenance step resolved. Next safe maintenance step: `personal-ops maintenance run next`.",
  });

  assert.match(sessionOutput, /Maintenance Session/);
  assert.match(sessionOutput, /personal-ops maintenance session/);
  assert.match(sessionOutput, /Follow-Through/);
  assert.match(sessionOutput, /inside session: personal-ops install wrappers/);
  assert.match(runOutput, /Maintenance Run/);
  assert.match(runOutput, /Follow-through:/);
  assert.match(runOutput, /Next command: personal-ops maintenance run next/);
});

test("phase 21 formatter surfaces agree on the same maintenance escalation cue", async () => {
  const { service } = createServiceFixture();
  const status = await service.getStatusReport({ httpReachable: true });
  const escalation = {
    eligible: true,
    step_id: "install_wrappers" as const,
    signal: "handed_off_to_repair" as const,
    summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
    suggested_command: "personal-ops maintenance session",
    handoff_count_30d: 2,
    cue: {
      item_id: "maintenance-escalation:install_wrappers",
      kind: "maintenance_escalation" as const,
      severity: "warn" as const,
      title: "Maintenance escalation",
      summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
      target_type: "system",
      target_id: "maintenance:install_wrappers",
      suggested_command: "personal-ops maintenance session",
      signals: ["maintenance_escalation", "install_wrappers"],
    },
  };
  const followThrough = {
    ...emptyMaintenanceFollowThrough(),
    escalation,
    pressure: {
      signal: "handed_off_to_repair" as const,
      count: 1,
      top_step_id: "install_wrappers" as const,
      summary: "This calm-window maintenance step has repeatedly turned into active repair and likely deserves repair-priority treatment.",
      suggested_command: "personal-ops maintenance session",
    },
    summary: escalation.summary,
  };
  const statusWithEscalation = {
    ...status,
    maintenance_follow_through: followThrough,
    maintenance_escalation: escalation,
    maintenance_scheduling: {
      eligible: true,
      placement: "now" as const,
      step_id: "install_wrappers" as const,
      summary: escalation.summary,
      suggested_command: "personal-ops maintenance session",
      reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
      bundle_step_ids: ["install_wrappers" as const],
    },
    repair_plan: {
      ...status.repair_plan,
      maintenance_follow_through: followThrough,
      maintenance_escalation: escalation,
      maintenance_scheduling: {
        eligible: true,
        placement: "now" as const,
        step_id: "install_wrappers" as const,
        summary: escalation.summary,
        suggested_command: "personal-ops maintenance session",
        reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
        bundle_step_ids: ["install_wrappers" as const],
      },
    },
  };
  const worklist = {
    ...(await service.getWorklistReport({ httpReachable: true })),
    maintenance_follow_through: followThrough,
    maintenance_escalation: escalation,
    maintenance_scheduling: {
      eligible: true,
      placement: "now" as const,
      step_id: "install_wrappers" as const,
      summary: escalation.summary,
      suggested_command: "personal-ops maintenance session",
      reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
      bundle_step_ids: ["install_wrappers" as const],
    },
    items: [
      {
        item_id: "maintenance-escalation:install_wrappers",
        kind: "maintenance_escalation" as const,
        severity: "warn" as const,
        title: "Maintenance escalation",
        summary: escalation.summary,
        target_type: "system",
        target_id: "maintenance:install_wrappers",
        created_at: new Date().toISOString(),
        suggested_command: "personal-ops maintenance session",
        metadata_json: "{}",
      },
    ],
  };
  const prepDay = {
    workflow: "prep-day" as const,
    generated_at: new Date().toISOString(),
    readiness: "ready" as const,
    summary: "Ready for the day.",
    first_repair_step: null,
    maintenance_follow_through: followThrough,
    maintenance_escalation: escalation,
    maintenance_scheduling: {
      eligible: true,
      placement: "now" as const,
      step_id: "install_wrappers" as const,
      summary: escalation.summary,
      suggested_command: "personal-ops maintenance session",
      reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
      bundle_step_ids: ["install_wrappers" as const],
    },
    actions: [],
    sections: [
      { title: "Overall State", items: [] },
      { title: "Top Attention", items: [] },
      { title: "Time-Sensitive Items", items: [] },
      {
        title: "Maintenance Window",
        items: [
          {
            label: "Maintenance escalation",
            summary: escalation.summary,
            command: "personal-ops maintenance session",
            why_now: "This maintenance family has repeatedly turned into active repair and should be handled deliberately before it degrades normal work.",
            score_band: "high" as const,
            signals: ["maintenance_escalation", "install_wrappers"],
          },
        ],
      },
      { title: "Next Commands", items: [] },
    ],
  };
  const session = {
    generated_at: new Date().toISOString(),
    eligible_now: true,
    deferred_reason: null,
    bundle_id: "maintenance-window:install_wrappers",
    title: "Preventive maintenance window",
    summary: "A wrapper refresh fits this calm window right now.",
    start_command: "personal-ops maintenance session",
    first_step_id: "install_wrappers" as const,
    maintenance_follow_through: followThrough,
    maintenance_scheduling: {
      eligible: true,
      placement: "now" as const,
      step_id: "install_wrappers" as const,
      summary: escalation.summary,
      suggested_command: "personal-ops maintenance session",
      reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
      bundle_step_ids: ["install_wrappers" as const],
    },
    steps: [
      {
        step_id: "install_wrappers" as const,
        title: "Refresh wrappers before the next drift",
        reason: "Wrapper drift has repeated on this machine.",
        suggested_command: "personal-ops install wrappers",
        blocking: false,
        latest_outcome: "resolved" as const,
        latest_completed_at: "2026-04-10T08:00:00.000Z",
      },
    ],
  };

  assert.match(formatStatusReport(statusWithEscalation), /Maintenance escalation/i);
  assert.match(formatRepairPlanReport(statusWithEscalation.repair_plan), /install_wrappers/);
  assert.match(formatWorklistReport(worklist), /Maintenance escalation/i);
  assert.match(formatNowReport(statusWithEscalation, worklist), /Maintenance escalation/i);
  assert.match(formatWorkflowBundleReport(prepDay), /Maintenance escalation/i);
  assert.match(formatMaintenanceSessionPlan(session), /Maintenance escalation/i);
  assert.match(formatMaintenanceSessionPlan(session), /personal-ops maintenance session/);
});

test("phase 22 formatter surfaces show maintenance timing only in the intended places", async () => {
  const { service } = createServiceFixture();
  const status = await service.getStatusReport({ httpReachable: true });
  const scheduling = {
    eligible: true,
    placement: "prep_day" as const,
    step_id: "install_wrappers" as const,
    summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
    suggested_command: "personal-ops maintenance session",
    reason: "Plan this into today's maintenance block after time-sensitive work.",
    bundle_step_ids: ["install_wrappers" as const],
  };
  const statusWithScheduling = {
    ...status,
    maintenance_scheduling: scheduling,
    repair_plan: {
      ...status.repair_plan,
      maintenance_scheduling: scheduling,
    },
  };
  const worklist = {
    ...(await service.getWorklistReport({ httpReachable: true })),
    maintenance_scheduling: scheduling,
  };
  const prepDay = {
    workflow: "prep-day" as const,
    generated_at: new Date().toISOString(),
    readiness: "ready" as const,
    summary: "Ready for the day.",
    first_repair_step: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: {
      eligible: false,
      step_id: null,
      signal: null,
      summary: null,
      suggested_command: null,
      handoff_count_30d: 0,
      cue: null,
    },
    maintenance_scheduling: scheduling,
    actions: [],
    sections: [
      { title: "Overall State", items: [] },
      { title: "Top Attention", items: [] },
      { title: "Time-Sensitive Items", items: [] },
      {
        title: "Maintenance Window",
        items: [
          {
            label: "Plan maintenance block",
            summary: scheduling.summary,
            command: "personal-ops maintenance session",
            why_now: scheduling.reason,
            score_band: "medium" as const,
            signals: ["maintenance_scheduling_prep_day", "install_wrappers"],
          },
        ],
      },
      { title: "Next Commands", items: [] },
    ],
  };
  const session = {
    generated_at: new Date().toISOString(),
    eligible_now: false,
    deferred_reason: "concrete_work_present" as const,
    bundle_id: null,
    title: null,
    summary: null,
    start_command: "personal-ops maintenance session",
    first_step_id: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_scheduling: scheduling,
    steps: [],
  };

  assert.match(formatStatusReport(statusWithScheduling), /Maintenance scheduling/i);
  assert.match(formatRepairPlanReport(statusWithScheduling.repair_plan), /prep day/i);
  assert.match(formatWorklistReport(worklist), /Maintenance Scheduling/i);
  assert.doesNotMatch(formatNowReport(statusWithScheduling, worklist), /Maintenance Now/);
  assert.match(formatWorkflowBundleReport(prepDay), /Maintenance scheduling/i);
  assert.match(formatMaintenanceSessionPlan(session), /Scheduling/);
  assert.match(formatMaintenanceSessionPlan(session), /prep day/i);
});

test("Phase 5 workflow formatter renders the bounded day-start sections and repair step", async () => {
  const { service } = createServiceFixture();
  service.createTask(cliIdentity, {
    title: "Reply to operator workflow email",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });

  const report = await service.getPrepDayWorkflowReport({ httpReachable: true });
  const formatted = formatWorkflowBundleReport(report);

  assert.equal(report.workflow, "prep-day");
  assert.match(formatted, /Overall State/);
  assert.match(formatted, /Top Attention/);
  assert.match(formatted, /Time-Sensitive Items/);
  assert.match(formatted, /Next Commands/);
  assert.ok(report.actions.length <= 3);
  if (report.readiness !== "ready") {
    assert.ok(report.first_repair_step);
    assert.match(formatted, /First repair step:/);
  }
});

test("Phase 6 workflow formatter renders now-next guidance with why-now detail", async () => {
  const { service } = createServiceFixture();
  service.createTask(cliIdentity, {
    title: "Prepare operator follow-up",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
  });

  const report = await service.getNowNextWorkflowReport({ httpReachable: true });
  const formatted = formatWorkflowBundleReport(report);

  assert.equal(report.workflow, "now-next");
  assert.match(formatted, /Best Next Move/);
  assert.match(formatted, /Why Now/);
  assert.match(formatted, /Alternatives/);
  assert.match(formatted, /If Blocked/);
  assert.match(formatted, /why now:/);
  assert.match(formatted, /score band:/);
});

test("Phase 4 version command reports the current release identity and upgrade path", () => {
  const { env, paths } = createTempEnv("version");
  writeFixtureFiles(paths, 46211);

  const stdout = execFileSync("node", [cliEntryPath(), "version"], {
    cwd: repoAppDir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  assert.match(stdout, new RegExp(`personal-ops ${repoPackageVersion().replace(/\./g, "\\.")}`));
  assert.match(stdout, /Release tag:\s+v/);
  assert.match(stdout, /Upgrade path/);

  const jsonOutput = execFileSync("node", [cliEntryPath(), "version", "--json"], {
    cwd: repoAppDir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  const parsed = JSON.parse(jsonOutput) as {
    version: { service_version: string; release_tag: string; upgrade_hint: string };
  };
  assert.equal(parsed.version.service_version, repoPackageVersion());
  assert.equal(parsed.version.release_tag, `v${repoPackageVersion()}`);
  assert.match(parsed.version.upgrade_hint, /\.\/bootstrap/);
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
  assert.match(output, /personal-ops health check/);
  assert.match(output, /personal-ops now/);
  assert.match(output, /status \[options\]\s+Show the full operator readiness summary for the local/i);
});

test("health check warns when the daemon is unavailable and no snapshot exists", async () => {
  const { env, paths } = createTempEnv("health-offline");
  writeFixtureFiles(paths, 46212);

  const report = await withRuntimeEnv(env, () =>
    buildHealthCheckReport(
      paths,
      async () => {
        throw new Error("daemon unavailable");
      },
      { deep: false, snapshotAgeLimitHours: 24 },
    ),
  );

  const formatted = formatHealthCheckReport(report);
  assert.equal(report.state, "degraded");
  assert.match(formatted, /ATTENTION NEEDED|DEGRADED/);
  assert.match(formatted, /daemon unavailable/);
  assert.match(formatted, /No snapshots were found/);
});

test("health check stays ready when runtime is healthy and snapshot is fresh", async () => {
  const { service, paths, env } = createServiceFixture();
  const launchctl = createLaunchctlStub();
  await withRuntimeEnv(env, () =>
    installAll(paths, process.execPath, {
      launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
      waitForDaemonReadyImpl: async () => {},
    }),
  );
  fixInstallPermissions(paths);
  await withRuntimeEnv(env, () => service.createSnapshot());
  writeRecoveryRehearsalStamp(paths, {
    successful_at: new Date().toISOString(),
    app_version: "0.1.0-test",
    command_name: "npm run verify:recovery",
  });
  const requestJson = async <T>(method: string, pathname: string): Promise<T> => {
    if (method === "GET" && pathname === "/v1/status") {
      return withRuntimeEnv(env, async () => ({ status: await service.getStatusReport({ httpReachable: true }) } as T));
    }
    if (method === "GET" && pathname === "/v1/doctor") {
      return {
        doctor: {
          generated_at: new Date().toISOString(),
          state: "ready",
          deep: false,
          summary: { pass: 1, warn: 0, fail: 0 },
          checks: [],
        },
      } as T;
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  };

  const report = await withRuntimeEnv(env, () =>
    buildHealthCheckReport(
      paths,
      requestJson,
      {
        deep: false,
        snapshotAgeLimitHours: 24,
      },
      {
        buildInstallCheckReportImpl: (reportPaths) =>
          buildInstallCheckReport(reportPaths, {
            launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
          }),
      },
    ),
  );

  const formatted = formatHealthCheckReport(report);
  assert.equal(report.state, "ready");
  assert.match(formatted, /Personal Ops Health Check: READY/);
  assert.match(formatted, /Everything looks healthy right now/);
});

test("hardening install help includes fix-permissions guidance", () => {
  const { env, paths } = createTempEnv("install-help");
  writeFixtureFiles(paths, 46212);

  const output = execFileSync(process.execPath, [cliEntryPath(), "install", "--help"], {
    cwd: repoAppDir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  assert.match(output, /fix-permissions/i);
  assert.match(output, /owner-only permissions/i);
});

test("phase 15 repair plan command leads with wrapper repair when wrappers are stale", () => {
  const { env, paths } = createTempEnv("repair-plan");
  writeFixtureFiles(paths, 46212);
  withRuntimeEnv(env, () => installWrappers(paths, "/missing/node"));

  const output = execFileSync(process.execPath, [cliEntryPath(), "repair", "plan"], {
    cwd: repoAppDir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  assert.match(output, /Repair Plan/);
  assert.match(output, /personal-ops install wrappers/);
});

test("phase 15 repair run next executes the first executable step only", () => {
  const { env, paths } = createTempEnv("repair-run-next");
  writeFixtureFiles(paths, 46212);
  new PersonalOpsDb(paths.databaseFile).close();
  withRuntimeEnv(env, () => installWrappers(paths, "/missing/node"));

  const output = execFileSync(process.execPath, [cliEntryPath(), "repair", "run", "next"], {
    cwd: repoAppDir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  const report = withRuntimeEnv(env, () => buildInstallCheckReport(paths));
  const db = new PersonalOpsDb(paths.databaseFile);
  const latestExecution = db.getLatestRepairExecution();
  db.close();

  assert.match(output, /Outcome:\s+resolved/i);
  assert.equal(report.checks.some((check) => check.id.includes("_wrapper_") && check.severity !== "pass"), false);
  assert.equal(latestExecution?.trigger_source, "repair_run");
  assert.equal(latestExecution?.outcome, "resolved");
});

test("phase 17 repair run adds preventive follow-up when the same safe repair keeps repeating", () => {
  const { env, paths } = createTempEnv("repair-run-preventive");
  writeFixtureFiles(paths, 46212);
  const db = new PersonalOpsDb(paths.databaseFile);
  db.createRepairExecution({
    step_id: "install_wrappers",
    started_at: "2026-04-01T18:00:00.000Z",
    completed_at: "2026-04-01T18:05:00.000Z",
    requested_by_client: "personal-ops-cli",
    requested_by_actor: "operator",
    trigger_source: "repair_run",
    before_first_step_id: "install_wrappers",
    after_first_step_id: "install_check",
    outcome: "resolved",
    resolved_target_step: true,
    message: "Step resolved.",
  });
  db.close();
  withRuntimeEnv(env, () => installWrappers(paths, "/missing/node"));

  const output = execFileSync(process.execPath, [cliEntryPath(), "repair", "run", "next"], {
    cwd: repoAppDir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  assert.match(output, /Outcome:\s+resolved/i);
  assert.match(output, /Preventive follow-up:/i);
  assert.match(output, /wrapper issue has repeated recently/i);
});

test("phase 15 repair run reports manual-only steps without skipping ahead", () => {
  const { env, paths } = createTempEnv("repair-run-manual");
  writeFixtureFiles(paths, 46212);

  const output = execFileSync(process.execPath, [cliEntryPath(), "repair", "run", "install_check"], {
    cwd: repoAppDir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  assert.match(output, /Manual only:\s+yes/i);
  assert.match(output, /personal-ops install check/);
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
