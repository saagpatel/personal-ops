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
import type { ClientIdentity, Config, MaintenanceDecisionReasonCode, Paths, Policy } from "../src/types.js";

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
    commitment: emptyMaintenanceCommitment(),
    defer_memory: emptyMaintenanceDeferMemory(),
    confidence: emptyMaintenanceConfidence(),
    convergence: emptyMaintenanceRepairConvergence(),
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
    commitment: emptyMaintenanceCommitment(),
    defer_memory: emptyMaintenanceDeferMemory(),
    confidence: emptyMaintenanceConfidence(),
    operating_block: emptyMaintenanceOperatingBlock(),
    decision_explanation: emptyMaintenanceDecisionExplanation(),
  };
}

function emptyMaintenanceConfidence() {
  return {
    eligible: false,
    step_id: null,
    level: null,
    trend: null,
    summary: null,
    suggested_command: null,
    defer_count: 0,
    handoff_count_30d: 0,
    cooldown_active: false,
  };
}

function emptyMaintenanceCommitment() {
  return {
    active: false,
    step_id: null,
    placement: null,
    state: null,
    summary: null,
    suggested_command: null,
    defer_count: 0,
    last_presented_at: null,
    bundle_step_ids: [],
  };
}

function emptyMaintenanceDeferMemory() {
  return {
    active: false,
    step_id: null,
    defer_count: 0,
    last_deferred_at: null,
    summary: null,
  };
}

function emptyMaintenanceOperatingBlock() {
  return {
    eligible: false,
    block: "suppressed" as const,
    step_id: null,
    summary: null,
    suggested_command: null,
    reason: null,
    confidence_level: null,
    bundle_step_ids: [],
  };
}

function emptyMaintenanceDecisionExplanation() {
  return {
    eligible: false,
    step_id: null,
    state: "suppressed" as const,
    driver: null,
    summary: null,
    why_now: null,
    why_not_higher: null,
    suggested_command: null,
    confidence_level: null,
    operating_block: null,
    reasons: [],
    bundle_step_ids: [],
  };
}

function emptyMaintenanceRepairConvergence() {
  return {
    eligible: false,
    step_id: null,
    state: "none" as const,
    driver: null,
    summary: null,
    why: null,
    primary_command: null,
    repair_command: "personal-ops repair plan",
    maintenance_command: "personal-ops maintenance session",
    handoff_count_30d: 0,
    active_repair_step_id: null,
    bundle_step_ids: [],
  };
}

function emptyWorkspaceHome() {
  return {
    ready: false,
    state: "caught_up" as const,
    title: "The workspace is caught up",
    summary: "No urgent repair, assistant-prepared, workflow, or maintenance focus is currently leading.",
    why_now: null,
    primary_command: null,
    secondary_summary: null,
    assistant_action_id: null,
    workflow: null,
    maintenance_state: null,
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
    maintenance_operating_block: {
      ...emptyMaintenanceOperatingBlock(),
      eligible: true,
      block: "later_today" as const,
      step_id: "install_wrappers" as const,
      summary: "Budget this maintenance into today's upkeep block after time-sensitive work.",
      suggested_command: "personal-ops maintenance session",
      reason: "Plan this into today's maintenance block after time-sensitive work.",
      confidence_level: null,
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
            label: "Plan maintenance block",
            summary: scheduling.summary,
            command: "personal-ops maintenance session",
            why_now: scheduling.reason,
            score_band: "medium" as const,
            signals: ["maintenance_operating_block_later_today", "install_wrappers"],
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
    maintenance_operating_block: {
      ...emptyMaintenanceOperatingBlock(),
      eligible: true,
      block: "later_today" as const,
      step_id: "install_wrappers" as const,
      summary: "Budget this maintenance into today's upkeep block after time-sensitive work.",
      suggested_command: "personal-ops maintenance session",
      reason: "Plan this into today's maintenance block after time-sensitive work.",
      confidence_level: null,
      bundle_step_ids: ["install_wrappers" as const],
    },
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

test("phase 23 formatter surfaces agree on the same maintenance commitment and defer memory", async () => {
  const { service } = createServiceFixture();
  const status = await service.getStatusReport({ httpReachable: true });
  const commitment = {
    active: true,
    step_id: "install_wrappers" as const,
    placement: "now" as const,
    state: "active" as const,
    summary: "This maintenance block has been deferred multiple times and is no longer just a passive reminder.",
    suggested_command: "personal-ops maintenance session",
    defer_count: 2,
    last_presented_at: "2026-04-12T09:00:00.000Z",
    bundle_step_ids: ["install_wrappers" as const],
  };
  const deferMemory = {
    active: true,
    step_id: "install_wrappers" as const,
    defer_count: 2,
    last_deferred_at: "2026-04-12T09:00:00.000Z",
    summary: "This maintenance block has been deferred multiple times and should be treated as committed upkeep.",
  };
  const statusWithCommitment = {
    ...status,
    maintenance_commitment: commitment,
    maintenance_defer_memory: deferMemory,
    maintenance_follow_through: {
      ...status.maintenance_follow_through,
      commitment,
      defer_memory: deferMemory,
    },
    maintenance_scheduling: {
      ...status.maintenance_scheduling,
      commitment,
      defer_memory: deferMemory,
    },
    repair_plan: {
      ...status.repair_plan,
      maintenance_commitment: commitment,
      maintenance_defer_memory: deferMemory,
      maintenance_follow_through: {
        ...status.repair_plan.maintenance_follow_through,
        commitment,
        defer_memory: deferMemory,
      },
      maintenance_scheduling: {
        ...status.repair_plan.maintenance_scheduling,
        commitment,
        defer_memory: deferMemory,
      },
    },
  };
  const worklist = {
    ...(await service.getWorklistReport({ httpReachable: true })),
    maintenance_commitment: commitment,
    maintenance_defer_memory: deferMemory,
    maintenance_follow_through: {
      ...emptyMaintenanceFollowThrough(),
      commitment,
      defer_memory: deferMemory,
    },
    maintenance_scheduling: {
      ...emptyMaintenanceScheduling(),
      eligible: true,
      placement: "now" as const,
      step_id: "install_wrappers" as const,
      summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
      suggested_command: "personal-ops maintenance session",
      reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
      bundle_step_ids: ["install_wrappers" as const],
      commitment,
      defer_memory: deferMemory,
    },
  };
  const prepDay = {
    workflow: "prep-day" as const,
    generated_at: new Date().toISOString(),
    readiness: "ready" as const,
    summary: "Ready for the day.",
    first_repair_step: null,
    maintenance_follow_through: {
      ...emptyMaintenanceFollowThrough(),
      commitment,
      defer_memory: deferMemory,
    },
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
      ...emptyMaintenanceScheduling(),
      eligible: true,
      placement: "prep_day" as const,
      step_id: "install_wrappers" as const,
      summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
      suggested_command: "personal-ops maintenance session",
      reason: "Plan this into today's maintenance block after time-sensitive work.",
      bundle_step_ids: ["install_wrappers" as const],
      commitment,
      defer_memory: deferMemory,
    },
    maintenance_commitment: commitment,
    maintenance_defer_memory: deferMemory,
    actions: [],
    sections: [],
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
    maintenance_follow_through: {
      ...emptyMaintenanceFollowThrough(),
      commitment,
      defer_memory: deferMemory,
    },
    maintenance_scheduling: {
      ...emptyMaintenanceScheduling(),
      eligible: true,
      placement: "prep_day" as const,
      step_id: "install_wrappers" as const,
      summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
      suggested_command: "personal-ops maintenance session",
      reason: "Plan this into today's maintenance block after time-sensitive work.",
      bundle_step_ids: ["install_wrappers" as const],
      commitment,
      defer_memory: deferMemory,
    },
    maintenance_commitment: commitment,
    maintenance_defer_memory: deferMemory,
    steps: [],
  };

  assert.match(formatStatusReport(statusWithCommitment), /Maintenance commitment/i);
  assert.match(formatRepairPlanReport(statusWithCommitment.repair_plan), /Maintenance commitment/i);
  assert.match(formatWorklistReport(worklist), /Maintenance Commitment/i);
  assert.match(formatWorkflowBundleReport(prepDay), /Maintenance commitment/i);
  assert.match(formatMaintenanceSessionPlan(session), /Deferred 2 times/i);
  assert.match(formatMaintenanceSessionPlan(session), /Defer memory/i);
});

test("phase 24 formatter surfaces agree on maintenance confidence placement", async () => {
  const { service } = createServiceFixture();
  const status = await service.getStatusReport({ httpReachable: true });
  const confidence = {
    eligible: true,
    step_id: "install_wrappers" as const,
    level: "high" as const,
    trend: "rising" as const,
    summary:
      "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
    suggested_command: "personal-ops maintenance session",
    defer_count: 3,
    handoff_count_30d: 2,
    cooldown_active: false,
  };
  const scheduling = {
    ...emptyMaintenanceScheduling(),
    eligible: true,
    placement: "now" as const,
    step_id: "install_wrappers" as const,
    summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
    suggested_command: "personal-ops maintenance session",
    reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
    bundle_step_ids: ["install_wrappers" as const],
    confidence,
  };
  const currentBlock = {
    ...emptyMaintenanceOperatingBlock(),
    eligible: true,
    block: "current_block" as const,
    step_id: "install_wrappers" as const,
    summary: "This maintenance work belongs in the current operating block and should be handled before lower-priority upkeep.",
    suggested_command: "personal-ops maintenance session",
    reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
    confidence_level: "high" as const,
    bundle_step_ids: ["install_wrappers" as const],
  };
  const statusWithConfidence = {
    ...status,
    maintenance_confidence: confidence,
    maintenance_operating_block: currentBlock,
    maintenance_follow_through: {
      ...status.maintenance_follow_through,
      confidence,
    },
    maintenance_scheduling: scheduling,
    repair_plan: {
      ...status.repair_plan,
      maintenance_confidence: confidence,
      maintenance_follow_through: {
        ...status.repair_plan.maintenance_follow_through,
        confidence,
      },
      maintenance_scheduling: {
        ...status.repair_plan.maintenance_scheduling,
        ...scheduling,
      },
      maintenance_operating_block: currentBlock,
    },
  };
  const worklist = {
    ...(await service.getWorklistReport({ httpReachable: true })),
    maintenance_confidence: confidence,
    maintenance_operating_block: currentBlock,
    maintenance_follow_through: {
      ...emptyMaintenanceFollowThrough(),
      confidence,
    },
    maintenance_scheduling: scheduling,
  };
  const nowWorkflow = {
    workflow: "now-next" as const,
    generated_at: new Date().toISOString(),
    readiness: "ready" as const,
    summary: "Now-next is ready.",
    first_repair_step: null,
    maintenance_follow_through: {
      ...emptyMaintenanceFollowThrough(),
      confidence,
    },
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
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: confidence,
    maintenance_operating_block: currentBlock,
    actions: [],
    sections: [],
  };
  const prepDayWorkflow = {
    ...nowWorkflow,
    workflow: "prep-day" as const,
    maintenance_operating_block: {
      ...currentBlock,
      block: "later_today" as const,
      summary: "Budget this maintenance into today's upkeep block after time-sensitive work.",
      reason: "Plan this into today's maintenance block after time-sensitive work.",
      confidence_level: "high" as const,
    },
    maintenance_scheduling: {
      ...scheduling,
      placement: "prep_day" as const,
      reason: "Plan this into today's maintenance block after time-sensitive work.",
    },
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
    maintenance_follow_through: {
      ...emptyMaintenanceFollowThrough(),
      confidence,
    },
    maintenance_scheduling: {
      ...scheduling,
      placement: "prep_day" as const,
      reason: "Plan this into today's maintenance block after time-sensitive work.",
    },
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: confidence,
    maintenance_operating_block: {
      ...currentBlock,
      block: "later_today" as const,
      summary: "Budget this maintenance into today's upkeep block after time-sensitive work.",
      reason: "Plan this into today's maintenance block after time-sensitive work.",
      confidence_level: "high" as const,
    },
    steps: [],
  };

  assert.match(formatStatusReport(statusWithConfidence), /Maintenance confidence/i);
  assert.match(formatRepairPlanReport(statusWithConfidence.repair_plan), /Maintenance confidence/i);
  assert.match(formatWorklistReport(worklist), /Maintenance confidence/i);
  assert.match(formatNowReport(statusWithConfidence, worklist), /repair-priority upkeep/i);
  assert.match(formatWorkflowBundleReport(nowWorkflow), /Maintenance confidence/i);
  assert.match(formatWorkflowBundleReport(prepDayWorkflow), /Maintenance confidence/i);
  assert.match(formatMaintenanceSessionPlan(session), /Maintenance confidence/i);
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

test("phase 27 workflow formatter renders personalization guidance only when the fit materially changes timing", async () => {
  const favored = {
    eligible: true,
    category: "followup" as const,
    preferred_window: "early_day" as const,
    current_window: "early_day" as const,
    fit: "favored" as const,
    reason: "aligned_with_habit" as const,
    summary: "This is a good fit for how you usually handle this kind of work.",
    sample_count_30d: 4,
  };
  const neutral = {
    eligible: true,
    category: "meeting" as const,
    preferred_window: "anytime" as const,
    current_window: "mid_day" as const,
    fit: "neutral" as const,
    reason: "no_strong_pattern" as const,
    summary: "There is no strong timing pattern for this kind of work yet.",
    sample_count_30d: 4,
  };
  const nowNext = {
    workflow: "now-next" as const,
    generated_at: new Date().toISOString(),
    readiness: "ready" as const,
    summary: "Reply to the open client thread.",
    sections: [
      {
        title: "Best Next Move",
        items: [
          {
            label: "Reply to client",
            summary: "Reply to the open client thread.",
            command: "personal-ops recommendation show followup-1",
            why_now: "A live conversation still needs your reply.",
            score_band: "highest" as const,
            signals: ["reply_needed"],
            workflow_personalization: favored,
          },
        ],
      },
      {
        title: "Alternatives",
        items: [
          {
            label: "Prep meeting",
            summary: "Prep the later meeting.",
            command: "personal-ops recommendation show meeting-1",
            why_now: "The meeting is later today.",
            score_band: "high" as const,
            signals: ["meeting_today"],
            workflow_personalization: neutral,
          },
        ],
      },
    ],
    actions: [
      {
        label: "Reply to client",
        summary: "Reply to the open client thread.",
        command: "personal-ops recommendation show followup-1",
        why_now: "A live conversation still needs your reply.",
        score_band: "highest" as const,
        signals: ["reply_needed"],
        workflow_personalization: favored,
      },
    ],
    first_repair_step: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: emptyMaintenanceScheduling(),
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: emptyMaintenanceOperatingBlock(),
    maintenance_decision_explanation: emptyMaintenanceDecisionExplanation(),
    workflow_personalization: favored,
  };

  const formatted = formatWorkflowBundleReport(nowNext);

  assert.match(formatted, /workflow fit: This is a good fit for how you usually handle this kind of work\./i);
  assert.doesNotMatch(formatted, /There is no strong timing pattern for this kind of work yet\./i);
});

test("phase 30 workflow formatter renders surfaced-work helpfulness for the tracked top now-next action only", () => {
  const nowNext = {
    workflow: "now-next" as const,
    generated_at: "2026-04-13T16:00:00.000Z",
    readiness: "ready" as const,
    summary: "Reply to the active client thread.",
    sections: [
      {
        title: "Best Next Move",
        items: [
          {
            label: "Reply to active client",
            summary: "Reply to the active client thread.",
            command: "personal-ops recommendation show followup-1",
            why_now: "A live conversation still needs your reply.",
            score_band: "highest" as const,
            target_type: "planning_recommendation" as const,
            target_id: "followup-1",
            planning_recommendation_id: "followup-1",
            signals: ["reply_needed"],
            surfaced_work_helpfulness: {
              eligible: true,
              surface: "workflow_now_next" as const,
              target_type: "planning_recommendation" as const,
              target_id: "followup-1",
              level: "helpful" as const,
              summary: "Recent outcomes suggest this surfaced work is usually acted on.",
              sample_count_30d: 5,
              helpful_count_30d: 4,
              attempted_failed_count_30d: 0,
              superseded_count_30d: 1,
              expired_count_30d: 0,
              helpful_rate_30d: 0.8,
            },
          },
        ],
      },
      {
        title: "Alternatives",
        items: [
          {
            label: "Prep later meeting",
            summary: "Prep the later meeting.",
            command: "personal-ops recommendation show meeting-1",
            why_now: "The meeting is later today.",
            score_band: "high" as const,
            target_type: "planning_recommendation" as const,
            target_id: "meeting-1",
            planning_recommendation_id: "meeting-1",
            signals: ["meeting_today"],
          },
        ],
      },
    ],
    actions: [
      {
        label: "Reply to active client",
        summary: "Reply to the active client thread.",
        command: "personal-ops recommendation show followup-1",
        why_now: "A live conversation still needs your reply.",
        score_band: "highest" as const,
        target_type: "planning_recommendation" as const,
        target_id: "followup-1",
        planning_recommendation_id: "followup-1",
        signals: ["reply_needed"],
        surfaced_work_helpfulness: {
          eligible: true,
          surface: "workflow_now_next" as const,
          target_type: "planning_recommendation" as const,
          target_id: "followup-1",
          level: "helpful" as const,
          summary: "Recent outcomes suggest this surfaced work is usually acted on.",
          sample_count_30d: 5,
          helpful_count_30d: 4,
          attempted_failed_count_30d: 0,
          superseded_count_30d: 1,
          expired_count_30d: 0,
          helpful_rate_30d: 0.8,
        },
      },
    ],
    first_repair_step: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: emptyMaintenanceScheduling(),
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: emptyMaintenanceOperatingBlock(),
    maintenance_decision_explanation: emptyMaintenanceDecisionExplanation(),
    maintenance_repair_convergence: emptyMaintenanceRepairConvergence(),
    workflow_personalization: undefined,
  };

  const formatted = formatWorkflowBundleReport(nowNext as any);

  assert.match(formatted, /Surface proof: Recent outcomes suggest this surfaced work is usually acted on\./i);
  assert.equal((formatted.match(/Surface proof:/gi) ?? []).length, 1);
});

test("phase 31 workflow formatter quiets duplicate and weak top now-next copy while keeping commands", () => {
  const favored = {
    eligible: true,
    category: "followup" as const,
    preferred_window: "early_day" as const,
    current_window: "early_day" as const,
    fit: "favored" as const,
    reason: "aligned_with_habit" as const,
    summary: "This is a good fit for how you usually handle this kind of work.",
    sample_count_30d: 3,
  };
  const duplicateAndWeakNowNext = {
    workflow: "now-next" as const,
    generated_at: "2026-04-13T16:00:00.000Z",
    readiness: "ready" as const,
    summary: "Reply to the active client thread.",
    sections: [
      {
        title: "Best Next Move",
        items: [
          {
            label: "Reply to active client",
            summary: "Reply to the active client thread.",
            command: "personal-ops recommendation show followup-1",
            why_now: "A live conversation still needs your reply.",
            score_band: "highest" as const,
            target_type: "planning_recommendation" as const,
            target_id: "followup-1",
            planning_recommendation_id: "followup-1",
            signals: ["reply_needed"],
            workflow_personalization: favored,
            surfaced_work_helpfulness: {
              eligible: true,
              surface: "workflow_now_next" as const,
              target_type: "planning_recommendation" as const,
              target_id: "followup-1",
              level: "helpful" as const,
              summary: "Recent outcomes suggest this surfaced work is usually acted on.",
              sample_count_30d: 5,
              helpful_count_30d: 4,
              attempted_failed_count_30d: 0,
              superseded_count_30d: 1,
              expired_count_30d: 0,
              helpful_rate_30d: 0.8,
            },
            surfaced_noise_reduction: {
              eligible: true,
              surface: "workflow_now_next" as const,
              target_type: "planning_recommendation" as const,
              target_id: "followup-1",
              disposition: "suppressed_duplicate" as const,
              reason: "same_target_primary" as const,
              summary: "This matches the current workspace focus.",
              show_helpfulness: false,
              show_why_now: false,
              show_personalization: false,
            },
          },
        ],
      },
      {
        title: "Alternatives",
        items: [
          {
            label: "Draft a follow-up",
            summary: "Draft a follow-up message.",
            command: "personal-ops recommendation show followup-2",
            why_now: "This is still available if the top focus changes.",
            score_band: "high" as const,
            target_type: "planning_recommendation" as const,
            target_id: "followup-2",
            planning_recommendation_id: "followup-2",
            signals: ["followup_needed"],
            workflow_personalization: favored,
            surfaced_work_helpfulness: {
              eligible: true,
              surface: "workflow_now_next" as const,
              target_type: "planning_recommendation" as const,
              target_id: "followup-2",
              level: "weak" as const,
              summary: "Recent outcomes suggest this surfaced work is often surfaced without follow-through.",
              sample_count_30d: 4,
              helpful_count_30d: 0,
              attempted_failed_count_30d: 2,
              superseded_count_30d: 1,
              expired_count_30d: 1,
              helpful_rate_30d: 0,
            },
            surfaced_noise_reduction: {
              eligible: true,
              surface: "workflow_now_next" as const,
              target_type: "planning_recommendation" as const,
              target_id: "followup-2",
              disposition: "quieted" as const,
              reason: "weak_recent_outcomes" as const,
              summary: "This stays available, but recent follow-through has been weak.",
              show_helpfulness: false,
              show_why_now: false,
              show_personalization: false,
            },
          },
        ],
      },
    ],
    actions: [
      {
        label: "Reply to active client",
        summary: "Reply to the active client thread.",
        command: "personal-ops recommendation show followup-1",
        why_now: "A live conversation still needs your reply.",
        score_band: "highest" as const,
        target_type: "planning_recommendation" as const,
        target_id: "followup-1",
        planning_recommendation_id: "followup-1",
        signals: ["reply_needed"],
        workflow_personalization: favored,
        surfaced_noise_reduction: {
          eligible: true,
          surface: "workflow_now_next" as const,
          target_type: "planning_recommendation" as const,
          target_id: "followup-1",
          disposition: "suppressed_duplicate" as const,
          reason: "same_target_primary" as const,
          summary: "This matches the current workspace focus.",
          show_helpfulness: false,
          show_why_now: false,
          show_personalization: false,
        },
      },
    ],
    first_repair_step: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: emptyMaintenanceScheduling(),
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: emptyMaintenanceOperatingBlock(),
    maintenance_decision_explanation: emptyMaintenanceDecisionExplanation(),
    maintenance_repair_convergence: emptyMaintenanceRepairConvergence(),
    workflow_personalization: undefined,
  };

  const formatted = formatWorkflowBundleReport(duplicateAndWeakNowNext as any);

  assert.match(formatted, /Best Next Move[\s\S]*This matches the current workspace focus\./i);
  assert.match(formatted, /Alternatives[\s\S]*This stays available, but recent follow-through has been weak\./i);
  assert.doesNotMatch(formatted, /Best Next Move[\s\S]*why now: A live conversation still needs your reply\./i);
  assert.doesNotMatch(formatted, /Best Next Move[\s\S]*Surface proof:/i);
  assert.doesNotMatch(formatted, /Best Next Move[\s\S]*workflow fit:/i);
  assert.match(formatted, /next: personal-ops recommendation show followup-1/i);
  assert.match(formatted, /next: personal-ops recommendation show followup-2/i);
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

test("phase 25 formatter surfaces show maintenance operating blocks only in the intended workflow windows", async () => {
  const scheduling = {
    ...emptyMaintenanceScheduling(),
    eligible: true,
    placement: "now" as const,
    step_id: "install_wrappers" as const,
    summary: "Escalated upkeep should happen now.",
    suggested_command: "personal-ops maintenance session",
    reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
    bundle_step_ids: ["install_wrappers" as const],
  };
  const currentBlock = {
    ...emptyMaintenanceOperatingBlock(),
    eligible: true,
    block: "current_block" as const,
    step_id: "install_wrappers" as const,
    summary: "This maintenance work belongs in the current operating block and should be handled before lower-priority upkeep.",
    suggested_command: "personal-ops maintenance session",
    reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
    confidence_level: "high" as const,
    bundle_step_ids: ["install_wrappers" as const],
  };
  const laterToday = {
    ...emptyMaintenanceOperatingBlock(),
    eligible: true,
    block: "later_today" as const,
    step_id: "install_wrappers" as const,
    summary: "Budget this maintenance into today's upkeep block after time-sensitive work.",
    suggested_command: "personal-ops maintenance session",
    reason: "Plan this into today's maintenance block after time-sensitive work.",
    confidence_level: "medium" as const,
    bundle_step_ids: ["install_wrappers" as const],
  };
  const { service } = createServiceFixture();
  const baseStatus = await service.getStatusReport({ httpReachable: true });
  const status = {
    ...baseStatus,
    maintenance_operating_block: currentBlock,
    maintenance_scheduling: scheduling,
    maintenance_confidence: {
      ...emptyMaintenanceConfidence(),
      eligible: true,
      step_id: "install_wrappers" as const,
      level: "high" as const,
      trend: "rising" as const,
      summary: "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
      suggested_command: "personal-ops maintenance session",
    },
    repair_plan: {
      ...baseStatus.repair_plan,
      maintenance_operating_block: currentBlock,
      maintenance_scheduling: scheduling,
      maintenance_confidence: {
        ...emptyMaintenanceConfidence(),
        eligible: true,
        step_id: "install_wrappers" as const,
        level: "high" as const,
        trend: "rising" as const,
        summary: "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
        suggested_command: "personal-ops maintenance session",
      },
    },
  };
  const worklist = {
    generated_at: new Date().toISOString(),
    state: "ready" as const,
    counts_by_severity: { critical: 0, warn: 0, info: 0 },
    send_window: { active: false },
    planning_groups: [],
    maintenance_window: { eligible_now: false, deferred_reason: "concrete_work_present" as const, count: 0, top_step_id: null, bundle: null },
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: scheduling,
    maintenance_confidence: status.maintenance_confidence,
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_operating_block: currentBlock,
    items: [],
  };
  const nowNext = {
    workflow: "now-next" as const,
    generated_at: new Date().toISOString(),
    readiness: "ready" as const,
    summary: "Ready now.",
    sections: [],
    actions: [],
    first_repair_step: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: scheduling,
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: status.maintenance_confidence,
    maintenance_operating_block: currentBlock,
  };
  const prepDay = {
    ...nowNext,
    workflow: "prep-day" as const,
    maintenance_operating_block: laterToday,
    maintenance_scheduling: {
      ...scheduling,
      placement: "prep_day" as const,
      reason: "Plan this into today's maintenance block after time-sensitive work.",
    },
  };

  assert.match(formatStatusReport(status), /Maintenance operating block/i);
  assert.match(formatWorklistReport(worklist), /Maintenance Operating Block/i);
  assert.match(formatNowReport(status, worklist), /Maintenance Now/);
  assert.match(formatWorkflowBundleReport(nowNext), /Maintenance operating block \(current block\)/i);
  assert.match(formatWorkflowBundleReport(prepDay), /Maintenance operating block \(later today\)/i);
});

test("phase 26 formatter surfaces agree on maintenance decision explanation wording", async () => {
  const decision = {
    ...emptyMaintenanceDecisionExplanation(),
    eligible: true,
    step_id: "install_wrappers" as const,
    state: "budget_today" as const,
    driver: "commitment" as const,
    summary: "This maintenance work should be budgeted into today's upkeep block.",
    why_now: "The system is ready and this family should be handled today, but not as the immediate next move.",
    why_not_higher: "Time-sensitive work still comes first.",
    suggested_command: "personal-ops maintenance session",
    confidence_level: "medium" as const,
    operating_block: "later_today" as const,
    reasons: ["commitment_active", "scheduled_for_later_today", "urgent_work_ahead"] as MaintenanceDecisionReasonCode[],
    bundle_step_ids: ["install_wrappers" as const],
  };
  const scheduling = {
    ...emptyMaintenanceScheduling(),
    eligible: true,
    placement: "prep_day" as const,
    step_id: "install_wrappers" as const,
    summary: "Escalated upkeep should be budgeted for later today.",
    suggested_command: "personal-ops maintenance session",
    reason: "Plan this into today's maintenance block after time-sensitive work.",
    bundle_step_ids: ["install_wrappers" as const],
    decision_explanation: decision,
  };
  const laterToday = {
    ...emptyMaintenanceOperatingBlock(),
    eligible: true,
    block: "later_today" as const,
    step_id: "install_wrappers" as const,
    summary: "Budget this maintenance into today's upkeep block after time-sensitive work.",
    suggested_command: "personal-ops maintenance session",
    reason: "Plan this into today's maintenance block after time-sensitive work.",
    confidence_level: "medium" as const,
    bundle_step_ids: ["install_wrappers" as const],
  };
  const { service } = createServiceFixture();
  const baseStatus = await service.getStatusReport({ httpReachable: true });
  const status = {
    ...baseStatus,
    maintenance_decision_explanation: decision,
    maintenance_operating_block: laterToday,
    maintenance_scheduling: scheduling,
    repair_plan: {
      ...baseStatus.repair_plan,
      maintenance_decision_explanation: decision,
      maintenance_operating_block: laterToday,
      maintenance_scheduling: scheduling,
    },
  };
  const worklist = {
    generated_at: new Date().toISOString(),
    state: "ready" as const,
    counts_by_severity: { critical: 0, warn: 0, info: 0 },
    send_window: { active: false },
    planning_groups: [],
    maintenance_window: { eligible_now: false, deferred_reason: "concrete_work_present" as const, count: 0, top_step_id: null, bundle: null },
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: scheduling,
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: laterToday,
    maintenance_decision_explanation: decision,
    items: [],
  };
  const nowNext = {
    workflow: "now-next" as const,
    generated_at: new Date().toISOString(),
    readiness: "ready" as const,
    summary: "Ready now.",
    sections: [],
    actions: [],
    first_repair_step: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: {
      ...scheduling,
      placement: "now" as const,
    },
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: {
      ...laterToday,
      block: "current_block" as const,
      summary: "This maintenance work belongs in the current operating block and should be handled before lower-priority upkeep.",
    },
    maintenance_decision_explanation: {
      ...decision,
      state: "do_now" as const,
      summary: "This maintenance work belongs in the current operating block.",
      why_now: "The system is ready, this family is surfaced for the current block, and there is no higher-priority urgent work ahead of it.",
      why_not_higher: "It still stays below active repair and truly urgent operator work.",
      operating_block: "current_block" as const,
    },
  };
  const prepDay = {
    ...nowNext,
    workflow: "prep-day" as const,
    maintenance_scheduling: scheduling,
    maintenance_operating_block: laterToday,
    maintenance_decision_explanation: decision,
  };

  assert.match(formatStatusReport(status), /Maintenance decision/i);
  assert.match(formatRepairPlanReport(status.repair_plan), /Maintenance decision/i);
  assert.match(formatWorklistReport(worklist), /Maintenance decision/i);
  assert.match(formatWorkflowBundleReport(nowNext), /Maintenance decision \(do now\)/i);
  assert.match(formatWorkflowBundleReport(prepDay), /Maintenance decision \(budget today\)/i);
});

test("phase 28 convergence renders one owner across repair, worklist, maintenance session, and workflows", () => {
  const convergence = {
    ...emptyMaintenanceRepairConvergence(),
    eligible: true,
    step_id: "install_wrappers" as const,
    state: "repair_owned" as const,
    driver: "active_repair" as const,
    summary: "This recurring family is now active repair and should be treated through the repair plan, not as a parallel maintenance item.",
    why: "Active repair already owns this recurring family.",
    primary_command: "personal-ops repair plan",
    active_repair_step_id: "install_wrappers" as const,
    bundle_step_ids: ["install_wrappers" as const],
  };
  const operatingBlock = {
    ...emptyMaintenanceOperatingBlock(),
    eligible: true,
    block: "current_block" as const,
    step_id: "install_wrappers" as const,
    summary: "This maintenance work belongs in the current operating block and should be handled before lower-priority upkeep.",
    suggested_command: "personal-ops maintenance session",
    reason: "Current block reason.",
    bundle_step_ids: ["install_wrappers" as const],
  };
  const decision = {
    ...emptyMaintenanceDecisionExplanation(),
    eligible: true,
    step_id: "install_wrappers" as const,
    state: "do_now" as const,
    driver: "operating_block" as const,
    summary: "This maintenance work belongs in the current operating block.",
    why_now: "The system is ready, this family is surfaced for the current block, and there is no higher-priority urgent work ahead of it.",
    why_not_higher: "It still stays below active repair and truly urgent operator work.",
    suggested_command: "personal-ops maintenance session",
    operating_block: "current_block" as const,
    reasons: ["scheduled_for_current_block"],
    bundle_step_ids: ["install_wrappers" as const],
  };
  const scheduling = {
    ...emptyMaintenanceScheduling(),
    eligible: true,
    placement: "now" as const,
    step_id: "install_wrappers" as const,
    summary: "Maintenance is visible now.",
    suggested_command: "personal-ops maintenance session",
    bundle_step_ids: ["install_wrappers" as const],
    operating_block: operatingBlock,
    decision_explanation: decision,
  };
  const repairPlan = {
    generated_at: "2026-04-12T12:00:00.000Z",
    first_step_id: "install_wrappers" as const,
    first_repair_step: "personal-ops repair plan",
    last_execution: null,
    top_recurring_issue: null,
    preventive_maintenance: { recommendations: [], count: 0, top_step_id: null },
    maintenance_window: { eligible_now: true, deferred_reason: null, count: 1, top_step_id: "install_wrappers" as const, bundle: null },
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: scheduling,
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: operatingBlock,
    maintenance_decision_explanation: decision,
    maintenance_repair_convergence: convergence,
    last_repair: null,
    recurring_issue: null,
    steps: [
      {
        id: "install_wrappers" as const,
        title: "Repair wrappers",
        reason: "Repair is pending.",
        suggested_command: "personal-ops repair plan",
        executable: false,
        status: "pending" as const,
        scope: "install" as const,
        blocking: true,
      },
    ],
  };
  const worklist = {
    generated_at: "2026-04-12T12:00:00.000Z",
    state: "ready" as const,
    counts_by_severity: { critical: 0, warn: 1, info: 0 },
    send_window: { active: false },
    planning_groups: [],
    maintenance_window: {
      eligible_now: true,
      deferred_reason: null,
      count: 1,
      top_step_id: "install_wrappers" as const,
      bundle: {
        bundle_id: "bundle-1",
        title: "Preventive maintenance window",
        summary: "Preventive maintenance window",
        recommended_commands: [],
        recommendations: [],
      },
    },
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: scheduling,
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: operatingBlock,
    maintenance_decision_explanation: decision,
    maintenance_repair_convergence: convergence,
    items: [],
  };
  const session = {
    generated_at: "2026-04-12T12:00:00.000Z",
    eligible_now: true,
    deferred_reason: null,
    bundle_id: "bundle-1",
    title: "Preventive maintenance window",
    summary: "Preventive maintenance window",
    start_command: "personal-ops maintenance session",
    steps: [],
    first_step_id: null,
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_scheduling: scheduling,
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: operatingBlock,
    maintenance_decision_explanation: decision,
    maintenance_repair_convergence: convergence,
  };
  const nowNext = {
    workflow: "now-next" as const,
    generated_at: "2026-04-12T12:00:00.000Z",
    readiness: "ready" as const,
    summary: "Repair-owned recurring family.",
    sections: [],
    actions: [],
    first_repair_step: "personal-ops repair plan",
    maintenance_follow_through: emptyMaintenanceFollowThrough(),
    maintenance_escalation: { eligible: false, step_id: null, signal: null, summary: null, suggested_command: null, handoff_count_30d: 0, cue: null },
    maintenance_scheduling: scheduling,
    maintenance_commitment: emptyMaintenanceCommitment(),
    maintenance_defer_memory: emptyMaintenanceDeferMemory(),
    maintenance_confidence: emptyMaintenanceConfidence(),
    maintenance_operating_block: operatingBlock,
    maintenance_decision_explanation: decision,
    maintenance_repair_convergence: convergence,
  };

  assert.match(formatRepairPlanReport(repairPlan as any), /Maintenance\/repair convergence/i);
  assert.match(formatWorklistReport(worklist as any), /personal-ops repair plan/i);
  assert.doesNotMatch(formatWorklistReport(worklist as any), /Start with `personal-ops maintenance session`/i);
  assert.match(formatMaintenanceSessionPlan(session as any), /Start command: personal-ops repair plan/i);
  assert.match(formatWorkflowBundleReport(nowNext as any), /Maintenance convergence \(repair owned\)/i);
});

test("phase 29 status formatter carries one compact workspace focus summary", async () => {
  const { service } = createServiceFixture();
  const baseStatus = await service.getStatusReport({ httpReachable: true });
  const status = {
    ...baseStatus,
    workspace_home: {
      ...emptyWorkspaceHome(),
      ready: true,
      state: "workflow" as const,
      title: "This is the best next move",
      summary: "Reply to the active client thread before the queue widens.",
      why_now: "This is currently the highest-value bounded move.",
      primary_command: "personal-ops workflow now-next",
      workflow: "now-next" as const,
    },
  };

  const formatted = formatStatusReport(status);
  assert.match(formatted, /Workspace focus: This is the best next move: Reply to the active client thread before the queue widens\./i);
});

test("phase 30 status formatter carries surfaced-work helpfulness for the current workspace focus", async () => {
  const { service } = createServiceFixture();
  const baseStatus = await service.getStatusReport({ httpReachable: true });
  const status = {
    ...baseStatus,
    workspace_home: {
      ...emptyWorkspaceHome(),
      ready: true,
      state: "assistant" as const,
      title: "Assistant-prepared work is ready",
      summary: "Review the prepared assistant action.",
      why_now: "This is the highest-value prepared work right now.",
      primary_command: "personal-ops assistant queue",
      assistant_action_id: "assistant.review-top-attention",
      surfaced_work_helpfulness: {
        eligible: true,
        surface: "workspace_home" as const,
        target_type: "assistant_action" as const,
        target_id: "assistant.review-top-attention",
        level: "mixed" as const,
        summary: "Recent outcomes are mixed; this surfaced work is sometimes acted on and sometimes passed over.",
        sample_count_30d: 4,
        helpful_count_30d: 2,
        attempted_failed_count_30d: 1,
        superseded_count_30d: 1,
        expired_count_30d: 0,
        helpful_rate_30d: 0.5,
      },
    },
  };

  const formatted = formatStatusReport(status as any);
  assert.match(formatted, /Workspace focus: Assistant-prepared work is ready: Review the prepared assistant action\./i);
  assert.match(formatted, /Surface proof: Recent outcomes are mixed; this surfaced work is sometimes acted on and sometimes passed over\./i);
});

test("phase 32 status formatter carries one compact review and approval handoff summary", async () => {
  const { service } = createServiceFixture();
  const baseStatus = await service.getStatusReport({ httpReachable: true });
  const status = {
    ...baseStatus,
    workspace_home: {
      ...emptyWorkspaceHome(),
      ready: true,
      state: "assistant" as const,
      title: "Assistant-prepared work is ready",
      summary: "Review the prepared assistant action.",
      why_now: "This is the highest-value prepared work right now.",
      primary_command: "personal-ops assistant queue",
      assistant_action_id: "assistant.review-top-attention",
    },
    review_approval_flow: {
      eligible: true,
      state: "approval_needed" as const,
      summary: "This prepared work is ready for approval handoff.",
      why_now: "The grouped outbound path is already staged and should stay the primary decision surface.",
      primary_command: "personal-ops outbound autopilot --group outbound-1",
      target_type: "outbound_autopilot_group" as const,
      target_id: "outbound-1",
      review_id: null,
      approval_id: "approval-1",
      outbound_group_id: "outbound-1",
      assistant_action_id: "assistant.review-top-attention",
      supporting_summary: "Open review only if the grouped handoff blocks.",
    },
  };

  const formatted = formatStatusReport(status as any);
  assert.match(formatted, /Workspace focus: Assistant-prepared work is ready: Review the prepared assistant action\./i);
  assert.equal((formatted.match(/This prepared work is ready for approval handoff\./gi) ?? []).length, 1);
});
