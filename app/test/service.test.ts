import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  formatPlanningRecommendationPolicyReport,
  formatPlanningRecommendationTuningReport,
  formatStatusReport,
} from "../src/formatters.js";
import { createHttpServer } from "../src/http.js";
import { Logger } from "../src/logger.js";
import { ensureMachineIdentity, writeRestoreProvenance } from "../src/machine.js";
import { resolvePaths } from "../src/paths.js";
import { writeRecoveryRehearsalStamp } from "../src/recovery.js";
import {
  buildFollowUpBlockWorkflowReport,
  buildNowNextWorkflowReport,
  buildPrepDayWorkflowReport,
} from "../src/service/workflows.js";
import { PersonalOpsService } from "../src/service.js";
import {
  GoogleCalendarEventsPage,
  GoogleCalendarListPage,
  GoogleCalendarEventMetadata,
  GoogleCalendarEventWriteInput,
  ClientIdentity,
  Config,
  DriveDocRecord,
  DriveFileRecord,
  DriveSheetRecord,
  DoctorCheck,
  GmailClientConfig,
  GithubAccount,
  GithubPullRequest,
  GmailHistoryPage,
  GmailMessageMetadata,
  GmailMessageRefPage,
  Policy,
  WorklistReport,
} from "../src/types.js";

interface FixtureOptions {
  allowSend?: boolean;
  accountEmail?: string;
  githubEnabled?: boolean;
  includedGithubRepositories?: string[];
  githubVerifyImpl?: (token: string, keychainService: string) => Promise<GithubAccount>;
  githubSyncImpl?: (
    token: string,
    repositories: string[],
    viewerLogin: string,
  ) => Promise<{ repositories_scanned_count: number; pull_requests: GithubPullRequest[] }>;
  driveEnabled?: boolean;
  includedDriveFolders?: string[];
  includedDriveFiles?: string[];
  driveVerifyImpl?: (tokensJson: string, clientConfig: GmailClientConfig) => Promise<void>;
  driveScopesImpl?: (tokensJson: string, clientConfig: GmailClientConfig) => Promise<string[]>;
  driveSyncImpl?: (
    tokensJson: string,
    clientConfig: GmailClientConfig,
    config: Config,
  ) => Promise<{ files: DriveFileRecord[]; docs: DriveDocRecord[]; sheets: DriveSheetRecord[] }>;
  meetingPrepWarningMinutes?: number;
  sendImpl?: (providerDraftId: string) => Promise<{ provider_message_id: string; provider_thread_id?: string }>;
  updateImpl?: () => Promise<string>;
  verifyMetadataImpl?: () => Promise<void>;
  verifyCalendarImpl?: () => Promise<void>;
  verifyCalendarWriteImpl?: () => Promise<void>;
  listRefsImpl?: (labelId: string, pageToken?: string) => Promise<GmailMessageRefPage>;
  metadataImpl?: (messageId: string) => Promise<GmailMessageMetadata>;
  historyImpl?: (startHistoryId: string, pageToken?: string) => Promise<GmailHistoryPage>;
  listCalendarsImpl?: (pageToken?: string) => Promise<GoogleCalendarListPage>;
  listCalendarEventsImpl?: (
    calendarId: string,
    options: { timeMin: string; timeMax: string; pageToken?: string },
  ) => Promise<GoogleCalendarEventsPage>;
  getCalendarEventImpl?: (calendarId: string, providerEventId: string) => Promise<GoogleCalendarEventMetadata>;
  createCalendarEventImpl?: (calendarId: string, input: GoogleCalendarEventWriteInput) => Promise<GoogleCalendarEventMetadata>;
  patchCalendarEventImpl?: (
    calendarId: string,
    providerEventId: string,
    input: GoogleCalendarEventWriteInput,
  ) => Promise<GoogleCalendarEventMetadata>;
  cancelCalendarEventImpl?: (calendarId: string, providerEventId: string) => Promise<void>;
  profileHistoryId?: string;
}

const GITHUB_TEST_IDENTITY: ClientIdentity = {
  client_id: "github-test",
  requested_by: "github-test",
  auth_role: "operator",
};

function createFixture(options: FixtureOptions = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-service-"));
  process.env.PERSONAL_OPS_CONFIG_DIR = path.join(base, "config");
  process.env.PERSONAL_OPS_STATE_DIR = path.join(base, "state");
  process.env.PERSONAL_OPS_LOG_DIR = path.join(base, "logs");
  process.env.PERSONAL_OPS_APP_DIR = path.join(base, "app");

  const paths = resolvePaths();
  fs.mkdirSync(paths.configDir, { recursive: true });
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.mkdirSync(paths.logDir, { recursive: true });
  fs.mkdirSync(paths.appDir, { recursive: true });
  fs.mkdirSync(paths.snapshotsDir, { recursive: true });

  const accountEmail = options.accountEmail ?? "machine@example.com";
  const githubRepositories = options.includedGithubRepositories ?? [];
  const driveFolders = options.includedDriveFolders ?? [];
  const driveFiles = options.includedDriveFiles ?? [];

  fs.writeFileSync(
    paths.configFile,
    `[service]
host = "127.0.0.1"
port = 46210

[http]
allowed_origins = []

[gmail]
account_email = "${accountEmail}"
review_url = "https://mail.google.com/mail/u/0/#drafts"

[github]
enabled = ${options.githubEnabled ? "true" : "false"}
included_repositories = [${githubRepositories.map((value) => `"${value}"`).join(", ")}]
sync_interval_minutes = 10
keychain_service = "personal-ops.github.test"

[drive]
enabled = ${options.driveEnabled ? "true" : "false"}
included_folders = [${driveFolders.map((value) => `"${value}"`).join(", ")}]
included_files = [${driveFiles.map((value) => `"${value}"`).join(", ")}]
sync_interval_minutes = 30
recent_docs_limit = 10

[calendar]
enabled = true
provider = "google"
included_calendar_ids = []
sync_past_days = 30
sync_future_days = 90
sync_interval_minutes = 5
workday_start_local = "09:00"
    workday_end_local = "18:00"
    meeting_prep_warning_minutes = ${options.meetingPrepWarningMinutes ?? 30}
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
allow_send = ${options.allowSend ? "true" : "false"}

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
  fs.writeFileSync(path.join(paths.appDir, "package.json"), JSON.stringify({ version: "0.1.0-test" }), "utf8");

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
    gmailAccountEmail: accountEmail,
    gmailReviewUrl: "https://mail.google.com/mail/u/0/#drafts",
    githubEnabled: options.githubEnabled ?? false,
    includedGithubRepositories: githubRepositories,
    githubSyncIntervalMinutes: 10,
    githubKeychainService: "personal-ops.github.test",
    driveEnabled: options.driveEnabled ?? false,
    includedDriveFolders: driveFolders,
    includedDriveFiles: driveFiles,
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
    meetingPrepWarningMinutes: options.meetingPrepWarningMinutes ?? 30,
    dayOverloadEventThreshold: 6,
    schedulePressureFreeMinutesThreshold: 60,
    keychainService: "personal-ops.gmail.test",
    oauthClientFile: paths.oauthClientFile,
    apiToken: "test-token",
    assistantApiToken: "assistant-token",
  };
  const policy: Policy = {
    notificationsTitlePrefix: "Personal Ops",
    allowSend: options.allowSend ?? false,
    auditDefaultLimit: 50,
  };
  const logger = new Logger(paths);
  const keychainSecrets = new Map<string, string>();

  const clientConfig: GmailClientConfig = {
    client_id: "client-id",
    client_secret: "client-secret",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    redirect_uris: ["http://127.0.0.1"],
  };

  const service = new PersonalOpsService(paths, config, policy, logger, {
    loadStoredGmailTokens: async () => ({
      email: accountEmail,
      clientConfig,
      tokensJson: JSON.stringify({ refresh_token: "refresh-token" }),
    }),
    sendGmailDraft: async (_tokensJson, _clientConfig, providerDraftId) =>
      options.sendImpl
        ? options.sendImpl(providerDraftId)
        : { provider_message_id: `message-${providerDraftId}`, provider_thread_id: "thread-1" },
    updateGmailDraft: async () => (options.updateImpl ? options.updateImpl() : "provider-draft-1"),
    createGmailDraft: async () => "provider-draft-1",
    getGmailProfile: async () => ({
      oauthClient: {} as never,
      profile: { emailAddress: accountEmail, historyId: options.profileHistoryId ?? "2000" },
    }),
    verifyGmailMetadataAccess: async () => {
      if (options.verifyMetadataImpl) {
        await options.verifyMetadataImpl();
      }
    },
    verifyGoogleCalendarAccess: async () => {
      if (options.verifyCalendarImpl) {
        await options.verifyCalendarImpl();
      }
    },
    verifyGoogleCalendarWriteAccess: async () => {
      if (options.verifyCalendarWriteImpl) {
        await options.verifyCalendarWriteImpl();
      }
    },
    verifyGoogleDriveAccess: async (tokensJson, activeClientConfig) => {
      if (options.driveVerifyImpl) {
        await options.driveVerifyImpl(tokensJson, activeClientConfig);
      }
    },
    verifyGoogleDriveScopes: async (tokensJson, activeClientConfig) =>
      options.driveScopesImpl ? options.driveScopesImpl(tokensJson, activeClientConfig) : [],
    syncDriveScope: async (tokensJson, activeClientConfig, activeConfig) =>
      options.driveSyncImpl
        ? options.driveSyncImpl(tokensJson, activeClientConfig, activeConfig)
        : { files: [], docs: [], sheets: [] },
    getGoogleDoc: async () => null,
    listGmailMessageRefsByLabel: async (_tokensJson, _clientConfig, labelId, pageToken) =>
      options.listRefsImpl ? options.listRefsImpl(labelId, pageToken) : { message_ids: [] },
    getGmailMessageMetadata: async (_tokensJson, _clientConfig, messageId) => {
      if (options.metadataImpl) {
        return options.metadataImpl(messageId);
      }
      throw new Error(`No metadata stub for ${messageId}.`);
    },
    listGmailHistory: async (_tokensJson, _clientConfig, startHistoryId, pageToken) =>
      options.historyImpl ? options.historyImpl(startHistoryId, pageToken) : { records: [], history_id: startHistoryId },
    listGoogleCalendarSources: async (_tokensJson, _clientConfig, pageToken) =>
      options.listCalendarsImpl ? options.listCalendarsImpl(pageToken) : { calendars: [] },
    listGoogleCalendarEvents: async (_tokensJson, _clientConfig, calendarId, calendarOptions) =>
      options.listCalendarEventsImpl ? options.listCalendarEventsImpl(calendarId, calendarOptions) : { events: [] },
    verifyGithubToken: async (token, keychainService) =>
      options.githubVerifyImpl
        ? options.githubVerifyImpl(token, keychainService)
        : {
            login: "octocat",
            keychain_service: keychainService,
            keychain_account: "octocat",
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            profile_json: JSON.stringify({ login: "octocat" }),
          },
    syncGithubPullRequests: async (token, repositories, viewerLogin) =>
      options.githubSyncImpl
        ? options.githubSyncImpl(token, repositories, viewerLogin)
        : { repositories_scanned_count: repositories.length, pull_requests: [] },
    setKeychainSecret: (serviceName, accountName, secret) => {
      keychainSecrets.set(`${serviceName}:${accountName}`, secret);
    },
    getKeychainSecret: (serviceName, accountName) => keychainSecrets.get(`${serviceName}:${accountName}`) ?? null,
    deleteKeychainSecret: (serviceName, accountName) => {
      keychainSecrets.delete(`${serviceName}:${accountName}`);
    },
    getGoogleCalendarEvent: async (_tokensJson, _clientConfig, calendarId, providerEventId) => {
      if (options.getCalendarEventImpl) {
        return options.getCalendarEventImpl(calendarId, providerEventId);
      }
      throw new Error(`No calendar get stub for ${calendarId}:${providerEventId}.`);
    },
    createGoogleCalendarEvent: async (_tokensJson, _clientConfig, calendarId, input) => {
      if (options.createCalendarEventImpl) {
        return options.createCalendarEventImpl(calendarId, input);
      }
      throw new Error(`No calendar create stub for ${calendarId}.`);
    },
    patchGoogleCalendarEvent: async (_tokensJson, _clientConfig, calendarId, providerEventId, input) => {
      if (options.patchCalendarEventImpl) {
        return options.patchCalendarEventImpl(calendarId, providerEventId, input);
      }
      throw new Error(`No calendar patch stub for ${calendarId}:${providerEventId}.`);
    },
    cancelGoogleCalendarEvent: async (_tokensJson, _clientConfig, calendarId, providerEventId) => {
      if (options.cancelCalendarEventImpl) {
        await options.cancelCalendarEventImpl(calendarId, providerEventId);
        return;
      }
      throw new Error(`No calendar cancel stub for ${calendarId}:${providerEventId}.`);
    },
    openExternalUrl: () => {},
  });
  service.db.upsertMailAccount(accountEmail, config.keychainService, JSON.stringify({ emailAddress: accountEmail }));

  return { paths, service, accountEmail, config, policy };
}

function createDraft(
  service: PersonalOpsService,
  accountEmail: string,
  overrides: Partial<{ subject: string; body_text: string; to: string[]; providerDraftId: string }> = {},
) {
  return service.db.createDraftArtifact(
    { client_id: "test-client" },
    accountEmail,
    overrides.providerDraftId ?? "provider-draft-1",
    {
      to: overrides.to ?? ["person@example.com"],
      cc: [],
      bcc: [],
      subject: overrides.subject ?? "Test draft",
      body_text: overrides.body_text ?? "hello",
    },
  );
}

function buildMessage(messageId: string, accountEmail: string, overrides: Partial<GmailMessageMetadata> = {}): GmailMessageMetadata {
  return {
    message_id: messageId,
    thread_id: overrides.thread_id ?? `thread-${messageId}`,
    history_id: overrides.history_id ?? "2001",
    internal_date: overrides.internal_date ?? String(Date.now()),
    label_ids: overrides.label_ids ?? ["INBOX"],
    from_header: overrides.from_header ?? "Sender <sender@example.com>",
    to_header: overrides.to_header ?? accountEmail,
    subject: overrides.subject ?? `Subject ${messageId}`,
  };
}

function buildCalendarEventMetadata(
  eventId: string,
  calendarId: string,
  overrides: Partial<GoogleCalendarEventMetadata> = {},
): GoogleCalendarEventMetadata {
  const startAt = overrides.start_at ?? new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    event_id: eventId,
    calendar_id: calendarId,
    summary: overrides.summary ?? `Event ${eventId}`,
    status: overrides.status ?? "confirmed",
    start_at: startAt,
    end_at: overrides.end_at ?? new Date(Date.parse(startAt) + 60 * 60 * 1000).toISOString(),
    is_all_day: overrides.is_all_day ?? false,
    is_busy: overrides.is_busy ?? true,
    attendee_count: overrides.attendee_count ?? 1,
    created_by_personal_ops: overrides.created_by_personal_ops ?? false,
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    i_cal_uid: overrides.i_cal_uid,
    etag: overrides.etag,
    location: overrides.location,
    notes: overrides.notes,
    html_link: overrides.html_link,
    event_type: overrides.event_type,
    visibility: overrides.visibility,
    transparency: overrides.transparency,
    recurring_event_id: overrides.recurring_event_id,
    organizer_email: overrides.organizer_email,
    self_response_status: overrides.self_response_status,
    source_task_id: overrides.source_task_id,
  };
}

function seedMailboxReadyState(service: PersonalOpsService, accountEmail: string, historyId = "ready-1"): void {
  service.db.upsertMailSyncState(accountEmail, "gmail", {
    status: "ready",
    last_history_id: historyId,
    last_synced_at: new Date().toISOString(),
    last_seeded_at: new Date().toISOString(),
    last_sync_refreshed_count: 0,
    last_sync_deleted_count: 0,
  });
}

function seedPlanningAutopilotFixture(service: PersonalOpsService, accountEmail: string) {
  const now = Date.now();
  seedMailboxReadyState(service, accountEmail, "planning-autopilot-ready");
  service.db.upsertCalendarSyncState(accountEmail, "google", {
    status: "ready",
    last_synced_at: new Date().toISOString(),
    last_seeded_at: new Date().toISOString(),
    calendars_refreshed_count: 1,
    events_refreshed_count: 1,
  });
  service.db.replaceCalendarSources(
    accountEmail,
    "google",
    [
      {
        calendar_id: "primary",
        provider: "google",
        account: accountEmail,
        title: "Primary",
        is_primary: true,
        is_selected: true,
        access_role: "owner",
        updated_at: new Date().toISOString(),
      },
    ],
    new Date().toISOString(),
  );
  const task = service.db.createTask(cliIdentity, {
    title: "Bundle task block",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
  });
  service.db.upsertMailMessage(
    accountEmail,
    buildMessage("planning-followup-msg", accountEmail, {
      thread_id: "thread-planning-bundle-followup",
      history_id: "planning-followup-1",
      internal_date: String(now - 80 * 60 * 60 * 1000),
      label_ids: ["SENT"],
      from_header: `Machine <${accountEmail}>`,
      to_header: "client@example.com",
      subject: "Bundle follow-up thread",
    }),
    new Date(now - 80 * 60 * 60 * 1000).toISOString(),
  );
  service.db.upsertCalendarEvent({
    event_id: "primary:planning-bundle-event",
    provider_event_id: "planning-bundle-event",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Bundle prep meeting",
    status: "confirmed",
    start_at: new Date(now + 90 * 60 * 1000).toISOString(),
    end_at: new Date(now + 150 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    attendee_count: 2,
    created_by_personal_ops: false,
    updated_at: new Date(now).toISOString(),
    synced_at: new Date(now).toISOString(),
    notes: "Meeting doc is linked separately.",
  });
  const taskRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    priority: "high",
    source: "system_generated",
    source_task_id: task.task_id,
    proposed_start_at: new Date(now + 30 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 60 * 60 * 1000).toISOString(),
    proposed_title: "Task block bundle",
    reason_code: "due_soon",
    reason_summary: "Protect focused time for the bundle task.",
    dedupe_key: `schedule_task_block:${task.task_id}`,
    source_fingerprint: `task:${task.task_id}:bundle`,
    source_last_seen_at: new Date(now).toISOString(),
    slot_state: "ready",
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["due_soon"],
    suppressed_signals: [],
    group_key: "urgent_unscheduled_tasks",
    group_summary: "Urgent task blocks can be time-boxed",
  });
  const followupRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-planning-bundle-followup",
    proposed_start_at: new Date(now + 75 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 105 * 60 * 1000).toISOString(),
    proposed_title: "Thread follow-up bundle",
    reason_code: "needs_reply",
    reason_summary: "Follow up on the bundled thread.",
    dedupe_key: "schedule_thread_followup:thread-planning-bundle-followup",
    source_fingerprint: "thread:planning-bundle-followup:1",
    source_last_seen_at: new Date(now).toISOString(),
    slot_state: "ready",
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    group_key: "urgent_inbox_followups",
    group_summary: "Urgent inbox follow-ups can be time-blocked",
  });
  const eventRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_event_prep",
    priority: "high",
    source: "system_generated",
    source_calendar_event_id: "primary:planning-bundle-event",
    proposed_start_at: new Date(now + 45 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 75 * 60 * 1000).toISOString(),
    proposed_title: "Meeting prep bundle",
    reason_code: "meeting_soon",
    reason_summary: "Prepare for the bundled meeting.",
    dedupe_key: "schedule_event_prep:primary:planning-bundle-event",
    source_fingerprint: "event:planning-bundle-event:1",
    source_last_seen_at: new Date(now).toISOString(),
    slot_state: "ready",
    slot_reason: "prep_window_available",
    trigger_signals: ["meeting_soon"],
    suppressed_signals: [],
    group_key: "upcoming_meeting_prep",
    group_summary: "Upcoming meeting prep is available",
  });
  (service as any).refreshPlanningRecommendationReadModel();
  return {
    task,
    taskRecommendation,
    followupRecommendation,
    eventRecommendation,
  };
}

const cliIdentity: ClientIdentity = { client_id: "operator-cli", requested_by: "operator", auth_role: "operator" };
const mcpIdentity: ClientIdentity = {
  client_id: "codex-mcp",
  origin: "assistant-mcp",
  requested_by: "codex",
  auth_role: "assistant",
};

test("service classifies ready, setup_required, and degraded states", () => {
  const { service } = createFixture();
  const classifyState = (service as unknown as { classifyState(checks: DoctorCheck[]): string }).classifyState.bind(service);

  const passSetupChecks: DoctorCheck[] = [
    { id: "oauth_client_configured", title: "", severity: "pass", message: "", category: "setup" },
    { id: "configured_mailbox_present", title: "", severity: "pass", message: "", category: "setup" },
    { id: "keychain_item_present", title: "", severity: "pass", message: "", category: "setup" },
    { id: "connected_mailbox_matches", title: "", severity: "pass", message: "", category: "setup" },
  ];

  assert.equal(classifyState(passSetupChecks), "ready");
  const warnCheck: DoctorCheck = { ...passSetupChecks[0]!, severity: "warn" };
  const failCheck: DoctorCheck = { ...passSetupChecks[0]!, severity: "fail" };
  assert.equal(classifyState([warnCheck, ...passSetupChecks.slice(1)]), "setup_required");
  assert.equal(classifyState([failCheck, ...passSetupChecks.slice(1)]), "degraded");
});

test("review open is operator-only and audits the real caller", () => {
  const { service, accountEmail } = createFixture();
  const draft = createDraft(service, accountEmail);
  const review = service.db.createReviewItem(draft.artifact_id);

  assert.throws(() => service.openReview(mcpIdentity, review.review_id), /operator channel/i);
  const opened = service.openReview(cliIdentity, review.review_id);

  assert.equal(opened.review_item.review_id, review.review_id);
  assert.equal(opened.artifact_id, draft.artifact_id);
  assert.match(opened.gmail_review_url, /mail\.google\.com/);
  const audit = service.listAuditEvents({ limit: 10, action: "review_queue_open" });
  assert.equal(audit[0]?.client_id, "operator-cli");
});

test("health is shallow and normalization is daemon-owned", () => {
  const { service, accountEmail } = createFixture();
  const draft = createDraft(service, accountEmail);
  const approval = service.requestApproval(cliIdentity, draft.artifact_id, "Need approval");
  service.approveRequest(cliIdentity, approval.approval_id, "Approved");
  const window = service.enableSendWindow(cliIdentity, 15, "Test window");
  service.db.updateApprovalRequest(approval.approval_id, {
    state: "sending",
    send_note: "Interrupted",
  });
  service.db.updateDraftLifecycle(draft.artifact_id, {
    status: "sending",
    last_send_attempt_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  });
  const rawDb = (service.db as unknown as { db: { prepare(sql: string): { run(...args: unknown[]): void } } }).db;
  rawDb.prepare(`UPDATE send_windows SET expires_at = ? WHERE window_id = ?`).run(
    new Date(Date.now() - 60_000).toISOString(),
    window.window_id,
  );

  service.health();
  assert.equal(service.db.getApprovalRequest(approval.approval_id)?.state, "sending");
  assert.equal(service.db.getActiveSendWindow()?.state, "active");

  service.normalizeRuntimeState();
  assert.equal(service.db.getApprovalRequest(approval.approval_id)?.state, "send_failed");
  assert.equal(service.db.getActiveSendWindow(), null);
});

test("service assembles review detail with related audit events", () => {
  const { service, accountEmail } = createFixture();
  const draft = createDraft(service, accountEmail, { subject: "Review detail" });
  const review = service.db.createReviewItem(draft.artifact_id);
  service.db.recordAuditEvent({
    client_id: "test-client",
    action: "mail_draft_create",
    target_type: "draft_artifact",
    target_id: draft.artifact_id,
    outcome: "success",
    metadata: { artifact_id: draft.artifact_id },
  });

  const detail = service.getReviewDetail(review.review_id);
  assert.equal(detail.review_item.review_id, review.review_id);
  assert.equal(detail.draft.artifact_id, draft.artifact_id);
  assert.equal(detail.related_audit_events.length, 1);
});

test("service creates and inspects snapshots", async () => {
  const { service, paths } = createFixture();
  const manifest = await service.createSnapshot("degraded");
  assert.equal(fs.existsSync(path.join(paths.snapshotsDir, manifest.snapshot_id, "manifest.json")), true);

  const snapshots = service.listSnapshots();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.snapshot_id, manifest.snapshot_id);

  const inspection = service.inspectSnapshot(manifest.snapshot_id);
  assert.equal(inspection.manifest.snapshot_id, manifest.snapshot_id);
  assert.equal(inspection.files.every((file) => file.exists), true);
  assert.equal(inspection.warnings.length > 0, true);
});

test("assistant queue surfaces safe actions and review-gated work", async () => {
  const { service, accountEmail } = createFixture();
  createDraft(service, accountEmail, {
    subject: "Assistant queue draft",
    providerDraftId: "provider-draft-assistant-queue",
  });
  const approvalDraft = createDraft(service, accountEmail, {
    subject: "Approval draft",
    providerDraftId: "provider-draft-approval-queue",
  });
  service.requestApproval(cliIdentity, approvalDraft.artifact_id, "Need approval");
  service.createTask(cliIdentity, {
    title: "Assistant queue planning task",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  service.refreshPlanningRecommendations(cliIdentity);

  const queue = await service.getAssistantActionQueueReport({ httpReachable: true });
  const actionIds = queue.actions.map((action) => action.action_id);

  assert.equal(actionIds.includes("assistant.sync-workspace"), true);
  assert.equal(actionIds.includes("assistant.create-snapshot"), true);
  assert.equal(actionIds.includes("assistant.review-top-attention"), true);
  assert.equal(
    actionIds.includes("assistant.review-planning") || actionIds.some((actionId) => actionId.startsWith("assistant.prepare-planning-bundle:")),
    true,
  );
  assert.equal(actionIds.includes("assistant.review-approvals"), true);
  assert.equal(actionIds.includes("assistant.review-drafts"), true);
  assert.equal(queue.actions.find((action) => action.action_id === "assistant.create-snapshot")?.one_click, true);
  assert.equal(queue.actions.find((action) => action.action_id === "assistant.review-top-attention")?.state, "awaiting_review");
});

test("assistant queue runs safe snapshot actions and keeps review actions gated", async () => {
  const { service } = createFixture();

  const snapshotResult = await service.runAssistantQueueAction(cliIdentity, "assistant.create-snapshot");
  assert.equal(snapshotResult.state, "completed");
  assert.equal(snapshotResult.summary.includes("Created snapshot"), true);
  assert.equal(service.listSnapshots().length, 1);

  await assert.rejects(
    () => service.runAssistantQueueAction(cliIdentity, "assistant.review-top-attention"),
    /requires operator review/i,
  );
});

test("assistant-led phase 2 inbox autopilot groups reply and follow-up work into bounded blocks", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({ accountEmail });
  seedMailboxReadyState(service, accountEmail, "autopilot-groups");
  const syncedAt = new Date().toISOString();
  const now = Date.now();

  for (let index = 0; index < 4; index += 1) {
    service.db.upsertMailMessage(
      accountEmail,
      buildMessage(`reply-${index}`, accountEmail, {
        thread_id: `thread-reply-${index}`,
        history_id: `reply-h-${index}`,
        internal_date: String(now - (index + 2) * 60 * 60 * 1000),
        label_ids: ["INBOX", "UNREAD"],
        from_header: `Reply ${index} <reply-${index}@example.com>`,
        subject: `Need reply ${index}`,
      }),
      syncedAt,
    );
  }

  for (let index = 0; index < 4; index += 1) {
    service.db.upsertMailMessage(
      accountEmail,
      buildMessage(`followup-${index}`, accountEmail, {
        thread_id: `thread-followup-${index}`,
        history_id: `followup-h-${index}`,
        internal_date: String(now - (96 + index) * 60 * 60 * 1000),
        label_ids: ["SENT"],
        from_header: `Machine <${accountEmail}>`,
        to_header: `followup-${index}@example.com`,
        subject: `Follow up ${index}`,
      }),
      syncedAt,
    );
  }

  const report = await service.getInboxAutopilotReport({ httpReachable: true });
  const replyGroups = report.groups.filter((group) => group.kind === "needs_reply");
  const followupGroups = report.groups.filter((group) => group.kind === "waiting_to_nudge");
  const queue = await service.getAssistantActionQueueReport({ httpReachable: true });

  assert.equal(replyGroups.length, 2);
  assert.equal(followupGroups.length, 2);
  assert.equal(report.groups.every((group) => group.threads.length <= 3), true);
  assert.equal(new Set(report.groups.flatMap((group) => group.threads.map((thread) => thread.thread_id))).size, 8);
  assert.equal(
    queue.actions.some((action) => action.action_id.startsWith("assistant.prepare-reply-group:")),
    true,
  );
  assert.equal(
    queue.actions.some((action) => action.action_id.startsWith("assistant.prepare-followup-group:")),
    true,
  );
});

test("assistant-led phase 2 inbox autopilot reuses drafts and refreshes them after new inbound mail", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({ accountEmail });
  seedMailboxReadyState(service, accountEmail, "autopilot-reuse");
  const now = Date.now();

  service.db.upsertMailMessage(
    accountEmail,
    buildMessage("reply-source-1", accountEmail, {
      thread_id: "thread-reply-refresh",
      history_id: "reply-refresh-1",
      internal_date: String(now - 2 * 60 * 60 * 1000),
      label_ids: ["INBOX", "UNREAD"],
      from_header: "Client <client@example.com>",
      subject: "Initial reply needed",
    }),
    new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  );

  const initialReport = await service.getInboxAutopilotReport({ httpReachable: true });
  const initialGroup = initialReport.groups.find((group) => group.kind === "needs_reply");
  assert.ok(initialGroup);

  const firstPrepare = await service.prepareInboxAutopilotGroup(cliIdentity, initialGroup!.group_id);
  assert.equal(firstPrepare.success, true);
  assert.equal(firstPrepare.drafts.length, 1);
  const firstDraft = firstPrepare.drafts[0]!;
  assert.equal(firstDraft.assistant_generated, true);
  assert.equal(firstDraft.assistant_source_thread_id, "thread-reply-refresh");
  assert.equal(firstDraft.assistant_group_id, initialGroup!.group_id);

  const secondPrepare = await service.prepareInboxAutopilotGroup(cliIdentity, initialGroup!.group_id);
  assert.equal(secondPrepare.success, true);
  assert.equal(secondPrepare.drafts[0]?.artifact_id, firstDraft.artifact_id);
  assert.equal(service.db.listDraftArtifactsByAssistantSourceThread("thread-reply-refresh").length, 1);

  const approval = service.requestApproval(cliIdentity, firstDraft.artifact_id, "Ready for approval");
  assert.equal(approval.state, "pending");

  service.db.upsertMailMessage(
    accountEmail,
    buildMessage("reply-source-2", accountEmail, {
      thread_id: "thread-reply-refresh",
      history_id: "reply-refresh-2",
      internal_date: String(now + 60 * 1000),
      label_ids: ["INBOX", "UNREAD"],
      from_header: "Client <client@example.com>",
      subject: "Updated reply needed",
    }),
    new Date(now + 60 * 1000).toISOString(),
  );

  const refreshedReport = await service.getInboxAutopilotReport({ httpReachable: true });
  const refreshedGroup = refreshedReport.groups.find((group) => group.kind === "needs_reply");
  assert.ok(refreshedGroup);
  const refreshed = await service.prepareInboxAutopilotGroup(cliIdentity, refreshedGroup!.group_id);
  const refreshedDraft = refreshed.drafts[0]!;

  assert.equal(refreshedDraft.artifact_id, firstDraft.artifact_id);
  assert.equal(refreshedDraft.subject, "Updated reply needed");
  assert.equal(service.db.listDraftArtifactsByAssistantSourceThread("thread-reply-refresh").length, 1);
  assert.equal(service.db.getApprovalRequest(approval.approval_id)?.state, "expired");
  assert.equal(service.db.getDraftArtifact(firstDraft.artifact_id)?.review_state, "pending");
});

test("assistant-led phase 2 workflows prefer staged inbox autopilot work over raw thread inspection", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({ accountEmail });
  seedMailboxReadyState(service, accountEmail, "autopilot-workflows");
  const now = Date.now();

  service.db.upsertMailMessage(
    accountEmail,
    buildMessage("reply-workflow", accountEmail, {
      thread_id: "thread-workflow-reply",
      history_id: "workflow-reply-1",
      internal_date: String(now - 90 * 60 * 1000),
      label_ids: ["INBOX", "UNREAD"],
      from_header: "Client <client@example.com>",
      subject: "Workflow reply needed",
    }),
    new Date(now - 90 * 60 * 1000).toISOString(),
  );

  const report = await service.getInboxAutopilotReport({ httpReachable: true });
  const group = report.groups[0];
  assert.ok(group);
  await service.prepareInboxAutopilotGroup(cliIdentity, group!.group_id);

  const fakeService = {
    getStatusReport: async () => ({
      state: "ready",
      mailbox: { connected: accountEmail, configured: accountEmail },
    }),
    getWorklistReport: async () => ({
      generated_at: new Date().toISOString(),
      state: "ready",
      counts_by_severity: { critical: 0, warn: 0, info: 0 },
      send_window: { active: false },
      planning_groups: [],
      items: [],
    }),
    listPlanningRecommendations: service.listPlanningRecommendations.bind(service),
    listNeedsReplyThreads: service.listNeedsReplyThreads.bind(service),
    listFollowupThreads: service.listFollowupThreads.bind(service),
    listUpcomingCalendarEvents: service.listUpcomingCalendarEvents.bind(service),
    compareNextActionableRecommendations: () => 0,
    getPlanningRecommendationDetail: service.getPlanningRecommendationDetail.bind(service),
    getInboxAutopilotReport: service.getInboxAutopilotReport.bind(service),
    getRelatedDocsForTarget: service.getRelatedDocsForTarget.bind(service),
  };

  const followUpBlock = await buildFollowUpBlockWorkflowReport(fakeService, { httpReachable: true });
  const nowNext = await buildNowNextWorkflowReport(fakeService, { httpReachable: true });
  const prepDay = await buildPrepDayWorkflowReport(fakeService, { httpReachable: true });

  assert.equal(followUpBlock.sections[0]?.items[0]?.target_type, "inbox_autopilot_group");
  assert.equal(nowNext.actions[0]?.target_type, "inbox_autopilot_group");
  assert.equal(prepDay.actions[0]?.target_type, "inbox_autopilot_group");
});

test("approval request resolves review items and moves draft into approval pending", () => {
  const { service, accountEmail } = createFixture();
  const draft = createDraft(service, accountEmail);
  const review = service.db.createReviewItem(draft.artifact_id);

  const approval = service.requestApproval(cliIdentity, draft.artifact_id, "Need approval");

  assert.equal(approval.state, "pending");
  assert.equal(service.db.getDraftArtifact(draft.artifact_id)?.status, "approval_pending");
  assert.equal(service.db.getReviewItem(review.review_id)?.state, "resolved");
});

test("operator confirmation allows mcp approve and send exactly once", async () => {
  let sendCount = 0;
  const { service, accountEmail } = createFixture({
    allowSend: true,
    sendImpl: async (providerDraftId) => {
      sendCount += 1;
      return {
        provider_message_id: `message-${providerDraftId}`,
        provider_thread_id: "thread-1",
      };
    },
  });
  const draft = createDraft(service, accountEmail);

  const approval = service.requestApproval(cliIdentity, draft.artifact_id, "Ready for signoff");
  const approveConfirmation = service.confirmApprovalAction(cliIdentity, approval.approval_id, "approve");
  const approved = service.approveRequest(
    mcpIdentity,
    approval.approval_id,
    "Looks good",
    approveConfirmation.confirmation_token,
  );
  assert.equal(approved.approval_request.state, "approved");

  const sendConfirmation = service.confirmApprovalAction(cliIdentity, approval.approval_id, "send");
  const sent = await service.sendApprovedDraft(
    mcpIdentity,
    approval.approval_id,
    "Ship it",
    sendConfirmation.confirmation_token,
  );

  assert.equal(sendCount, 1);
  assert.equal(sent.approval_request.state, "sent");
  assert.equal(sent.draft.status, "sent");
  assert.equal(sent.draft.provider_message_id, "message-provider-draft-1");
  assert.equal(sent.draft.send_attempt_count, 1);
  await assert.rejects(
    () => service.sendApprovedDraft(mcpIdentity, approval.approval_id, "Retry", sendConfirmation.confirmation_token),
    /cannot be sent from state sent/i,
  );
});

test("send is blocked when allow_send is false and provider is never called", async () => {
  let sendCount = 0;
  const { service, accountEmail } = createFixture({
    allowSend: false,
    sendImpl: async () => {
      sendCount += 1;
      return { provider_message_id: "message-1", provider_thread_id: "thread-1" };
    },
  });
  const draft = createDraft(service, accountEmail);
  const approval = service.requestApproval(cliIdentity, draft.artifact_id, "Need approval");
  service.approveRequest(cliIdentity, approval.approval_id, "Approved in CLI");

  await assert.rejects(
    () => service.sendApprovedDraft(cliIdentity, approval.approval_id, "Still blocked"),
    /sending is disabled/i,
  );
  assert.equal(sendCount, 0);
  assert.equal(service.db.getApprovalRequest(approval.approval_id)?.state, "approved");
});

test("changing a draft after approval request expires the active approval", async () => {
  const { service, accountEmail } = createFixture();
  const draft = createDraft(service, accountEmail);
  const approval = service.requestApproval(cliIdentity, draft.artifact_id, "Need approval");

  await service.updateDraft(cliIdentity, draft.artifact_id, {
    to: ["person@example.com"],
    cc: [],
    bcc: [],
    subject: "Updated subject",
    body_text: "updated body",
  });

  assert.equal(service.db.getApprovalRequest(approval.approval_id)?.state, "expired");
  assert.equal(service.db.getDraftArtifact(draft.artifact_id)?.status, "draft");
});

test("stale sending approvals recover only through normalization, not read paths", () => {
  const { service, accountEmail } = createFixture({ allowSend: true });
  const draft = createDraft(service, accountEmail);
  const approval = service.requestApproval(cliIdentity, draft.artifact_id, "Need approval");
  service.approveRequest(cliIdentity, approval.approval_id, "Approved");

  service.db.updateApprovalRequest(approval.approval_id, {
    state: "sending",
    send_note: "Interrupted",
  });
  service.db.updateDraftLifecycle(draft.artifact_id, {
    status: "sending",
    last_send_attempt_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  });

  const detailBefore = service.getApprovalDetail(approval.approval_id);
  assert.equal(detailBefore.approval_request.state, "sending");
  assert.equal(detailBefore.draft.status, "sending");

  service.normalizeRuntimeState();

  const detailAfter = service.getApprovalDetail(approval.approval_id);
  assert.equal(detailAfter.approval_request.state, "send_failed");
  assert.equal(detailAfter.draft.status, "send_failed");
});

test("timed send window enables sending without permanent allow_send", async () => {
  let sendCount = 0;
  const { service, accountEmail } = createFixture({
    allowSend: false,
    sendImpl: async (providerDraftId) => {
      sendCount += 1;
      return { provider_message_id: `message-${providerDraftId}`, provider_thread_id: "thread-2" };
    },
  });
  const draft = createDraft(service, accountEmail);
  const approval = service.requestApproval(cliIdentity, draft.artifact_id, "Need approval");
  service.approveRequest(cliIdentity, approval.approval_id, "Approved");
  const window = service.enableSendWindow(cliIdentity, 15, "Supervised live send");
  assert.equal(service.getSendWindowStatus().active_window?.window_id, window.window_id);

  const sent = await service.sendApprovedDraft(cliIdentity, approval.approval_id, "Sending during timed window");
  assert.equal(sendCount, 1);
  assert.equal(sent.approval_request.state, "sent");
});

test("approval reopen clears send error state and cancel returns draft to draft state", () => {
  const { service, accountEmail } = createFixture();
  const draft = createDraft(service, accountEmail);
  const approval = service.requestApproval(cliIdentity, draft.artifact_id, "Need approval");
  service.approveRequest(cliIdentity, approval.approval_id, "Approved");
  service.db.updateApprovalRequest(approval.approval_id, {
    state: "send_failed",
    last_error_code: "429",
    last_error_message: "Gmail quota exceeded",
  });
  service.db.updateDraftLifecycle(draft.artifact_id, {
    status: "send_failed",
    last_send_error_code: "429",
    last_send_error_message: "Gmail quota exceeded",
  });

  const reopened = service.reopenApproval(cliIdentity, approval.approval_id, "Confirmed safe to retry");
  assert.equal(reopened.approval_request.state, "approved");
  assert.equal(reopened.draft.status, "approved");

  const canceled = service.cancelApproval(cliIdentity, approval.approval_id, "No longer needed");
  assert.equal(canceled.approval_request.state, "rejected");
  assert.equal(canceled.draft.status, "draft");
});

test("metadata sync seeds mailbox state and exposes unread and follow-up threads", async () => {
  const accountEmail = "machine@example.com";
  const now = Date.now();
  const oldUnread = buildMessage("msg-inbox", accountEmail, {
    thread_id: "thread-inbox",
    history_id: "3001",
    internal_date: String(now - 26 * 60 * 60 * 1000),
    label_ids: ["INBOX", "UNREAD"],
    from_header: "Client <client@example.com>",
    subject: "Need reply",
  });
  const oldFollowup = buildMessage("msg-sent", accountEmail, {
    thread_id: "thread-followup",
    history_id: "3002",
    internal_date: String(now - 80 * 60 * 60 * 1000),
    label_ids: ["SENT"],
    from_header: `Machine <${accountEmail}>`,
    to_header: "client@example.com",
    subject: "Checking in",
  });
  const messages = new Map([
    [oldUnread.message_id, oldUnread],
    [oldFollowup.message_id, oldFollowup],
  ]);

  const { service } = createFixture({
    accountEmail,
    profileHistoryId: "3999",
    listRefsImpl: async (labelId) => ({
      message_ids: labelId === "INBOX" ? [oldUnread.message_id] : [oldFollowup.message_id],
    }),
    metadataImpl: async (messageId) => {
      const message = messages.get(messageId);
      if (!message) throw new Error(`Unknown message ${messageId}`);
      return message;
    },
  });

  const inbox = await service.syncMailboxMetadata(cliIdentity);
  assert.equal(inbox.sync?.status, "ready");
  assert.equal(inbox.sync?.last_sync_refreshed_count, 2);
  assert.equal(inbox.sync?.last_sync_deleted_count, 0);
  assert.equal(typeof inbox.sync?.last_sync_duration_ms, "number");
  assert.equal(inbox.unread_thread_count, 1);
  assert.equal(inbox.followup_thread_count, 1);
  assert.equal(inbox.total_thread_count, 2);
  assert.equal(service.listUnreadInboxThreads().length, 1);
  assert.equal(service.listFollowupThreads().length, 1);
  assert.equal(service.listNeedsReplyThreads().length, 1);
  assert.equal(service.listRecentThreads().length, 0);
  assert.equal(service.listNeedsReplyThreads()[0]?.derived_kind, "unread_old");

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.items.some((item) => item.kind === "inbox_unread_old"), true);
  assert.equal(worklist.items.some((item) => item.kind === "planning_recommendation_pending"), true);
  assert.equal(worklist.items.some((item) => item.kind === "thread_stale_followup"), false);
  assert.equal(worklist.items.some((item) => item.kind === "thread_needs_reply"), false);
});

test("incremental sync updates metadata and auto-reseeds after invalid history", async () => {
  const accountEmail = "machine@example.com";
  const now = Date.now();
  let inboxMessage = buildMessage("msg-inbox", accountEmail, {
    thread_id: "thread-inbox",
    history_id: "5001",
    internal_date: String(now - 2 * 60 * 60 * 1000),
    label_ids: ["INBOX", "UNREAD"],
    subject: "Initial unread",
  });
  const messages = new Map([[inboxMessage.message_id, inboxMessage]]);
  let historyMode: "good" | "bad" = "good";

  const { service } = createFixture({
    accountEmail,
    profileHistoryId: "6000",
    listRefsImpl: async () => ({ message_ids: [inboxMessage.message_id] }),
    metadataImpl: async (messageId) => {
      const message = messages.get(messageId);
      if (!message) throw new Error(`Unknown message ${messageId}`);
      return message;
    },
    historyImpl: async (startHistoryId) => {
      if (historyMode === "bad") {
        const error = new Error(`Invalid startHistoryId ${startHistoryId}`);
        (error as Error & { code: number }).code = 404;
        throw error;
      }
      return {
        records: [{ message_ids_to_refresh: [inboxMessage.message_id], message_ids_deleted: [] }],
        history_id: "6001",
      };
    },
  });

  await service.syncMailboxMetadata(cliIdentity);
  inboxMessage = {
    ...inboxMessage,
    history_id: "6001",
    label_ids: ["INBOX"],
    subject: "Now read",
  };
  messages.set(inboxMessage.message_id, inboxMessage);

  const synced = await service.syncMailboxMetadata(cliIdentity);
  assert.equal(synced.sync?.last_history_id, "6001");
  assert.equal(service.listUnreadInboxThreads().length, 0);

  historyMode = "bad";
  const recovered = await service.syncMailboxMetadata(cliIdentity);
  assert.equal(recovered.sync?.status, "ready");
  assert.equal(recovered.sync?.last_error_code, undefined);
  assert.equal(recovered.sync?.last_seeded_at !== undefined, true);
});

test("operator task lifecycle flows through create, update, start, complete, cancel, and due views", () => {
  const { service } = createFixture();
  const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const created = service.createTask(cliIdentity, {
    title: "Book travel",
    notes: "Use the work card",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: dueAt,
    remind_at: remindAt,
  });

  const updated = service.updateTask(cliIdentity, created.task_id, {
    notes: "Use the team travel card",
    priority: "normal",
  });
  assert.equal(updated.notes, "Use the team travel card");
  assert.equal(updated.priority, "normal");

  const started = service.startTask(cliIdentity, created.task_id);
  assert.equal(started.state, "in_progress");
  const snoozed = service.snoozeTask(cliIdentity, created.task_id, new Date(Date.now() + 30 * 60 * 1000).toISOString(), "After lunch");
  assert.ok(snoozed.remind_at);
  const completed = service.completeTask(cliIdentity, created.task_id, "Booked");
  assert.equal(completed.state, "completed");
  assert.equal(service.listDueTasks().length, 0);

  const second = service.createTask(cliIdentity, {
    title: "Cancel old gym membership",
    kind: "human_reminder",
    priority: "low",
    owner: "operator",
  });
  const canceled = service.cancelTask(cliIdentity, second.task_id, "No longer needed");
  assert.equal(canceled.state, "canceled");
  assert.equal(service.db.countTaskStates().completed, 1);
  assert.equal(service.db.countTaskStates().canceled, 1);
});

test("assistants can suggest tasks but cannot create committed tasks directly", () => {
  const { service } = createFixture();
  const suggestion = service.createTaskSuggestion(mcpIdentity, {
    title: "Remember to send weekly update",
    kind: "assistant_work",
    priority: "high",
  });
  assert.equal(suggestion.status, "pending");
  assert.throws(
    () =>
      service.createTask(mcpIdentity, {
        title: "Should not work",
        kind: "assistant_work",
        priority: "normal",
        owner: "assistant",
      }),
    /operator channel/i,
  );
});

test("accepting and rejecting task suggestions preserve attribution and feed the worklist", async () => {
  const { service } = createFixture();
  const stalePending = service.createTaskSuggestion(mcpIdentity, {
    title: "Check contract renewal",
    kind: "assistant_work",
    priority: "high",
  });
  const acceptedSource = service.createTaskSuggestion(mcpIdentity, {
    title: "Remember reimbursement deadline",
    kind: "human_reminder",
    priority: "normal",
    due_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  });
  const rejectedSource = service.createTaskSuggestion(mcpIdentity, {
    title: "Do not keep this",
    kind: "assistant_work",
    priority: "low",
  });

  const rawDb = (service.db as unknown as { db: { prepare(sql: string): { run(...args: unknown[]): void } } }).db;
  rawDb.prepare(`UPDATE task_suggestions SET created_at = ?, updated_at = ? WHERE suggestion_id = ?`).run(
    new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    stalePending.suggestion_id,
  );

  const accepted = service.acceptTaskSuggestion(cliIdentity, acceptedSource.suggestion_id, "Track this");
  assert.equal(accepted.suggestion.status, "accepted");
  assert.ok(accepted.accepted_task);
  assert.equal(accepted.accepted_task?.source, "accepted_suggestion");
  assert.equal(accepted.accepted_task?.source_suggestion_id, acceptedSource.suggestion_id);

  const rejected = service.rejectTaskSuggestion(cliIdentity, rejectedSource.suggestion_id, "Not needed");
  assert.equal(rejected.suggestion.status, "rejected");

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.items.some((item) => item.kind === "task_suggestion_pending" && item.severity === "warn"), true);
  assert.equal(worklist.items.some((item) => item.kind === "task_due_soon"), true);

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal(status.service_version, "0.1.0-test");
  assert.equal(status.task_suggestions.pending_count, 1);
  assert.equal(status.tasks.pending_count, 1);
});

test("task and suggestion lists default to active items and support pruning history", () => {
  const { service } = createFixture();
  const pending = service.createTask(cliIdentity, {
    title: "Still active",
    kind: "human_reminder",
    priority: "normal",
    owner: "operator",
  });
  const done = service.createTask(cliIdentity, {
    title: "Done already",
    kind: "human_reminder",
    priority: "normal",
    owner: "operator",
  });
  service.completeTask(cliIdentity, done.task_id, "Finished");

  const acceptedSuggestion = service.createTaskSuggestion(mcpIdentity, {
    title: "Accepted suggestion",
    kind: "assistant_work",
    priority: "normal",
  });
  const rejectedSuggestion = service.createTaskSuggestion(mcpIdentity, {
    title: "Rejected suggestion",
    kind: "assistant_work",
    priority: "normal",
  });
  service.acceptTaskSuggestion(cliIdentity, acceptedSuggestion.suggestion_id, "Keep it");
  service.rejectTaskSuggestion(cliIdentity, rejectedSuggestion.suggestion_id, "Skip it");

  const rawDb = (service.db as unknown as { db: { prepare(sql: string): { run(...args: unknown[]): void } } }).db;
  const oldIso = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  rawDb.prepare(`UPDATE tasks SET updated_at = ? WHERE task_id = ?`).run(oldIso, done.task_id);
  rawDb.prepare(`UPDATE task_suggestions SET updated_at = ? WHERE suggestion_id = ?`).run(oldIso, acceptedSuggestion.suggestion_id);
  rawDb.prepare(`UPDATE task_suggestions SET updated_at = ? WHERE suggestion_id = ?`).run(oldIso, rejectedSuggestion.suggestion_id);

  assert.equal(service.listTasks().map((task) => task.task_id).includes(pending.task_id), true);
  assert.equal(service.listTasks().map((task) => task.task_id).includes(done.task_id), false);
  assert.equal(service.listTaskSuggestions().length, 0);
  assert.equal(service.listTaskSuggestions({ include_resolved: true }).length, 2);

  const taskPrune = service.pruneTaskHistory(cliIdentity, 30);
  const suggestionPrune = service.pruneTaskSuggestionHistory(cliIdentity, 30);
  assert.equal(taskPrune.removed_count, 1);
  assert.equal(suggestionPrune.removed_count, 2);
  assert.equal(service.db.getTask(done.task_id), null);
  assert.equal(service.db.getTaskSuggestion(acceptedSuggestion.suggestion_id), null);
});

test("Phase 7 status and doctor surface cross-machine restore provenance", async () => {
  const { service, paths } = createFixture();
  const machine = ensureMachineIdentity(paths);
  writeRestoreProvenance(paths, {
    restored_at: "2026-03-29T08:10:00.000Z",
    restored_snapshot_id: "snapshot-cross-machine",
    local_machine_id: machine.machine_id,
    local_machine_label: machine.machine_label,
    source_machine_id: "remote-machine",
    source_machine_label: "remote-machine",
    source_hostname: "remote-host",
    cross_machine: true,
    snapshot_created_at: "2026-03-29T08:00:00.000Z",
  });

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal(status.machine.machine_id, machine.machine_id);
  assert.equal(status.machine.state_origin, "restored_cross_machine");
  assert.equal(status.machine.last_restore?.source_machine_label, "remote-machine");

  const doctor = await service.runDoctor({ deep: false, httpReachable: true });
  assert.equal(doctor.checks.some((check) => check.id === "state_origin_safe" && check.severity === "warn"), true);
});

test("Phase 3 doctor surfaces stale recovery posture", async () => {
  const { service, paths } = createFixture();
  const latestDir = path.join(paths.snapshotsDir, "2026-03-29T18-00-00Z");
  const localDate = (daysAgo: number, hour: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  for (const [snapshotId, snapshotDir, createdAt] of [
    ["2026-03-29T18-00-00Z", latestDir, new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()],
    ["2026-03-27T18-00-00Z", path.join(paths.snapshotsDir, "2026-03-27T18-00-00Z"), localDate(2, 18)],
    ["2026-03-27T08-00-00Z", path.join(paths.snapshotsDir, "2026-03-27T08-00-00Z"), localDate(2, 8)],
  ] as const) {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const manifest = {
      snapshot_id: snapshotId,
      created_at: createdAt,
      service_version: "0.1.0",
      schema_version: 14,
      backup_intent: "recovery",
      mailbox: null,
      db_backup_path: path.join(snapshotDir, "personal-ops.db"),
      config_paths: [path.join(snapshotDir, "config.toml"), path.join(snapshotDir, "policy.toml")],
      log_paths: [path.join(snapshotDir, "app.jsonl")],
      daemon_state: "ready",
      notes: [],
    };
    fs.writeFileSync(manifest.db_backup_path, "", "utf8");
    for (const configPath of manifest.config_paths) {
      fs.writeFileSync(configPath, "", "utf8");
    }
    for (const logPath of manifest.log_paths) {
      fs.writeFileSync(logPath, "", "utf8");
    }
    fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  }
  writeRecoveryRehearsalStamp(paths, {
    successful_at: localDate(16, 9),
    app_version: "0.1.0-test",
    command_name: "npm run verify:recovery",
  });

  const doctor = await service.runDoctor({ deep: false, httpReachable: true });
  assert.equal(doctor.checks.some((check) => check.id === "snapshot_freshness" && check.severity === "pass"), true);
  assert.equal(doctor.checks.some((check) => check.id === "snapshot_retention_pressure" && check.severity === "warn"), true);
  assert.equal(doctor.checks.some((check) => check.id === "recovery_rehearsal_freshness" && check.severity === "warn"), true);
});

test("inbox thread detail and status expose derived mailbox state", async () => {
  const accountEmail = "machine@example.com";
  const now = Date.now();
  const inboundRecent = buildMessage("msg-recent", accountEmail, {
    thread_id: "thread-recent",
    history_id: "7001",
    internal_date: String(now - 30 * 60 * 1000),
    label_ids: ["INBOX", "UNREAD"],
    from_header: "Client <client@example.com>",
    subject: "Recent inbound",
  });
  const outboundWaiting = buildMessage("msg-outbound", accountEmail, {
    thread_id: "thread-outbound",
    history_id: "7002",
    internal_date: String(now - 2 * 60 * 60 * 1000),
    label_ids: ["SENT"],
    from_header: `Machine <${accountEmail}>`,
    to_header: "client@example.com",
    subject: "Recent outbound",
  });
  const messages = new Map([
    [inboundRecent.message_id, inboundRecent],
    [outboundWaiting.message_id, outboundWaiting],
  ]);

  const { service } = createFixture({
    accountEmail,
    profileHistoryId: "7999",
    listRefsImpl: async (labelId) => ({
      message_ids: labelId === "INBOX" ? [inboundRecent.message_id] : [outboundWaiting.message_id],
    }),
    metadataImpl: async (messageId) => {
      const message = messages.get(messageId);
      if (!message) throw new Error(`Unknown message ${messageId}`);
      return message;
    },
  });

  await service.syncMailboxMetadata(cliIdentity);
  const needsReply = service.listNeedsReplyThreads();
  const recent = service.listRecentThreads();
  const detail = service.getInboxThreadDetail("thread-recent");
  const status = await service.getStatusReport({ httpReachable: true });

  assert.equal(needsReply.length, 1);
  assert.equal(needsReply[0]?.thread.thread_id, "thread-recent");
  assert.equal(needsReply[0]?.last_direction, "inbound");
  assert.equal(recent.length, 2);
  assert.equal(detail.derived_kind, "needs_reply");
  assert.equal(detail.last_direction, "inbound");
  assert.match(detail.suggested_next_command, /needs-reply/);
  assert.equal(status.inbox.sync_status, "ready");
  assert.equal(status.inbox.total_thread_count, 2);
});

test("doctor degrades when mailbox sync state is degraded", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({ accountEmail });
  service.db.upsertMailSyncState(accountEmail, "gmail", {
    status: "degraded",
    last_error_code: "history_invalid",
    last_error_message: "History id is stale.",
  });

  const report = await service.runDoctor({ deep: false, httpReachable: true });
  assert.equal(report.state, "degraded");
  assert.equal(report.checks.some((check) => check.id === "mail_history_id_present" && check.severity === "fail"), true);
});

test("Phase 6 deep doctor explains stale Google grants with re-auth guidance", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({
    accountEmail,
    verifyMetadataImpl: async () => {
      throw new Error("invalid_grant: Token has been expired or revoked.");
    },
    verifyCalendarImpl: async () => {
      throw new Error("invalid_grant: Token has been expired or revoked.");
    },
    verifyCalendarWriteImpl: async () => {
      throw new Error("invalid_grant: Token has been expired or revoked.");
    },
  });

  service.db.upsertMailAccount(accountEmail, "personal-ops.gmail.test", JSON.stringify({ emailAddress: accountEmail }));
  const report = await service.runDoctor({ deep: true, httpReachable: true });

  const metadataCheck = report.checks.find((check) => check.id === "deep_gmail_metadata_access");
  const calendarCheck = report.checks.find((check) => check.id === "deep_google_calendar_access");
  assert.equal(metadataCheck?.severity, "fail");
  assert.match(metadataCheck?.message ?? "", /stale or revoked/i);
  assert.match(metadataCheck?.message ?? "", /auth gmail login/i);
  assert.equal(calendarCheck?.severity, "fail");
  assert.match(calendarCheck?.message ?? "", /auth google login/i);
});

test("concurrent mailbox sync requests share one in-flight run", async () => {
  const accountEmail = "machine@example.com";
  let listRefsCalls = 0;
  const message = buildMessage("msg-1", accountEmail, {
    thread_id: "thread-1",
    history_id: "8001",
    label_ids: ["INBOX", "UNREAD"],
    from_header: "Client <client@example.com>",
    subject: "Concurrent sync",
  });

  const { service } = createFixture({
    accountEmail,
    profileHistoryId: "8001",
    listRefsImpl: async () => {
      listRefsCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { message_ids: [message.message_id] };
    },
    metadataImpl: async () => message,
  });

  const [first, second] = await Promise.all([
    service.syncMailboxMetadata(cliIdentity),
    service.syncMailboxMetadata(cliIdentity),
  ]);

  assert.equal(first.sync?.status, "ready");
  assert.equal(second.sync?.status, "ready");
  assert.equal(listRefsCalls, 2);
});

test("calendar sync populates sources, events, and status surfaces", async () => {
  const accountEmail = "machine@example.com";
  const now = Date.now();
  const { service } = createFixture({
    accountEmail,
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({
      events: [
        {
          event_id: "event-1",
          calendar_id: "primary",
          summary: "Design review",
          status: "confirmed",
          start_at: new Date(now + 20 * 60 * 1000).toISOString(),
          end_at: new Date(now + 50 * 60 * 1000).toISOString(),
          is_all_day: false,
          is_busy: true,
          attendee_count: 2,
          created_by_personal_ops: false,
          updated_at: new Date(now).toISOString(),
        },
      ],
    }),
  });

  const status = await service.syncCalendarMetadata(cliIdentity);
  assert.equal(status.sync?.status, "ready");
  assert.equal(service.listCalendarSources().length, 1);
  assert.equal(service.listUpcomingCalendarEvents(1, 10).length, 1);
  assert.equal((await service.getStatusReport({ httpReachable: true })).calendar.sync_status, "ready");
});

test("calendar conflict and task schedule pressure appear in the worklist", async () => {
  const accountEmail = "machine@example.com";
  const now = Date.now();
  const { service } = createFixture({
    accountEmail,
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({
      events: [
        {
          event_id: "event-1",
          calendar_id: "primary",
          summary: "Busy block one",
          status: "confirmed",
          start_at: new Date(now + 30 * 60 * 1000).toISOString(),
          end_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
          is_all_day: false,
          is_busy: true,
          attendee_count: 1,
          created_by_personal_ops: false,
          updated_at: new Date(now).toISOString(),
        },
        {
          event_id: "event-2",
          calendar_id: "primary",
          summary: "Busy block two",
          status: "confirmed",
          start_at: new Date(now + 60 * 60 * 1000).toISOString(),
          end_at: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
          is_all_day: false,
          is_busy: true,
          attendee_count: 1,
          created_by_personal_ops: false,
          updated_at: new Date(now).toISOString(),
        },
      ],
    }),
  });

  await service.syncCalendarMetadata(cliIdentity);
  service.createTask(cliIdentity, {
    title: "Finish proposal",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
  });

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.items.some((item) => item.kind === "calendar_conflict"), true);
  assert.equal(
    worklist.items.some((item) => ["task_schedule_pressure", "planning_recommendation_pending", "planning_recommendation_group"].includes(item.kind)),
    true,
  );
});

test("operator can create, update, and cancel personal-ops calendar events on owned calendars", async () => {
  let liveEvent = buildCalendarEventMetadata("provider-event-1", "primary", {
    summary: "Focus Block",
    location: "Desk",
    notes: "Deep work",
    etag: "etag-1",
    created_by_personal_ops: true,
  });
  let canceledProviderEventId: string | null = null;
  const { service } = createFixture({
    verifyCalendarWriteImpl: async () => {},
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({ events: [] }),
    createCalendarEventImpl: async () => liveEvent,
    getCalendarEventImpl: async () => liveEvent,
    patchCalendarEventImpl: async (_calendarId, _providerEventId, input) => {
      liveEvent = buildCalendarEventMetadata("provider-event-1", "primary", {
        ...liveEvent,
        summary: input.title ?? liveEvent.summary,
        location: input.location ?? liveEvent.location,
        notes: input.notes ?? liveEvent.notes,
        start_at: input.start_at ?? liveEvent.start_at,
        end_at: input.end_at ?? liveEvent.end_at,
        updated_at: new Date(Date.now() + 60_000).toISOString(),
        etag: "etag-2",
        created_by_personal_ops: true,
      });
      return liveEvent;
    },
    cancelCalendarEventImpl: async (_calendarId, providerEventId) => {
      canceledProviderEventId = providerEventId;
    },
  });
  (service as any).config.workdayStartLocal = "00:00";
  (service as any).config.workdayEndLocal = "23:59";
  (service as any).config.schedulePressureFreeMinutesThreshold = 180;

  await service.syncCalendarMetadata(cliIdentity);
  const created = await service.createCalendarEvent(cliIdentity, {
    title: "Focus Block",
    start_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    end_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    location: "Desk",
    notes: "Deep work",
  });
  assert.equal(created.created_by_personal_ops, true);
  assert.equal(created.provider_event_id, "provider-event-1");

  const updated = await service.updateCalendarEvent(cliIdentity, created.event_id, {
    title: "Updated Focus Block",
    location: "Office",
  });
  assert.equal(updated.summary, "Updated Focus Block");
  assert.equal(updated.location, "Office");
  assert.equal(updated.last_write_by_client, "operator-cli");

  const canceled = await service.cancelCalendarEvent(cliIdentity, created.event_id, "No longer needed");
  assert.equal(canceledProviderEventId, "provider-event-1");
  assert.equal(canceled.event_id, created.event_id);
  assert.equal(service.db.getCalendarEvent(created.event_id), null);
});

test("task scheduling links one active personal-ops event and can be unscheduled cleanly", async () => {
  const scheduledStart = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  let liveEvent = buildCalendarEventMetadata("provider-task-1", "primary", {
    summary: "Finish proposal",
    start_at: scheduledStart,
    end_at: new Date(Date.parse(scheduledStart) + 60 * 60 * 1000).toISOString(),
    source_task_id: "placeholder",
    created_by_personal_ops: true,
    etag: "etag-task-1",
  });
  let canceledProviderEventId: string | null = null;
  const { service } = createFixture({
    verifyCalendarWriteImpl: async () => {},
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({ events: [] }),
    createCalendarEventImpl: async (_calendarId, input) => {
      liveEvent = buildCalendarEventMetadata("provider-task-1", "primary", {
        summary: input.title ?? "Finish proposal",
        start_at: input.start_at ?? scheduledStart,
        end_at: input.end_at ?? new Date(Date.parse(scheduledStart) + 60 * 60 * 1000).toISOString(),
        source_task_id: input.source_task_id,
        created_by_personal_ops: true,
        etag: "etag-task-1",
      });
      return liveEvent;
    },
    getCalendarEventImpl: async () => liveEvent,
    cancelCalendarEventImpl: async (_calendarId, providerEventId) => {
      canceledProviderEventId = providerEventId;
    },
  });
  (service as any).config.workdayStartLocal = "00:00";
  (service as any).config.workdayEndLocal = "23:59";

  await service.syncCalendarMetadata(cliIdentity);
  const task = service.createTask(cliIdentity, {
    title: "Finish proposal",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  });

  const scheduled = await service.scheduleTaskOnCalendar(cliIdentity, task.task_id, {
    start_at: scheduledStart,
    end_at: new Date(Date.parse(scheduledStart) + 60 * 60 * 1000).toISOString(),
  });
  assert.equal(scheduled.task.scheduled_calendar_event_id, scheduled.event.event_id);
  assert.equal(scheduled.event.source_task_id, task.task_id);
  await assert.rejects(
    service.scheduleTaskOnCalendar(cliIdentity, task.task_id, {
      start_at: scheduledStart,
      end_at: new Date(Date.parse(scheduledStart) + 60 * 60 * 1000).toISOString(),
    }),
    /already has a scheduled calendar event/i,
  );

  const unscheduled = await service.unscheduleTaskFromCalendar(cliIdentity, task.task_id, "Rescheduling later");
  assert.equal(unscheduled.task.scheduled_calendar_event_id, undefined);
  assert.equal(canceledProviderEventId, "provider-task-1");
  assert.equal(service.db.getCalendarEvent(scheduled.event.event_id), null);
});

test("phase-7 worklist and doctor surface scheduling readiness and conflicts", async () => {
  const now = Date.now();
  const busyStart = new Date(now + 60 * 60 * 1000).toISOString();
  let liveEvent = buildCalendarEventMetadata("provider-scheduled-1", "primary", {
    summary: "Task block",
    start_at: busyStart,
    end_at: new Date(Date.parse(busyStart) + 60 * 60 * 1000).toISOString(),
    source_task_id: "placeholder",
    created_by_personal_ops: true,
    etag: "etag-scheduled-1",
  });
  const { service } = createFixture({
    verifyCalendarWriteImpl: async () => {},
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({
      events: [
        buildCalendarEventMetadata("existing-busy", "primary", {
          summary: "Existing busy block",
          start_at: busyStart,
          end_at: new Date(Date.parse(busyStart) + 90 * 60 * 1000).toISOString(),
          created_by_personal_ops: false,
        }),
      ],
    }),
    createCalendarEventImpl: async (_calendarId, input) => {
      liveEvent = buildCalendarEventMetadata("provider-scheduled-1", "primary", {
        summary: input.title ?? "Task block",
        start_at: input.start_at ?? busyStart,
        end_at: input.end_at ?? new Date(Date.parse(busyStart) + 60 * 60 * 1000).toISOString(),
        source_task_id: input.source_task_id,
        created_by_personal_ops: true,
        etag: "etag-scheduled-1",
      });
      return liveEvent;
    },
    getCalendarEventImpl: async () => liveEvent,
  });

  await service.syncCalendarMetadata(cliIdentity);
  const unscheduledTask = service.createTask(cliIdentity, {
    title: "Unscheduled urgent work",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
  });
  const scheduledTask = service.createTask(cliIdentity, {
    title: "Scheduled work",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
  });
  await service.scheduleTaskOnCalendar(cliIdentity, scheduledTask.task_id, {
    start_at: busyStart,
    end_at: new Date(Date.parse(busyStart) + 60 * 60 * 1000).toISOString(),
  });

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.items.some((item) => item.kind === "planning_recommendation_pending"), true);
  assert.equal(
    worklist.items.some((item) => item.kind === "task_unscheduled_due_soon" && item.target_id === unscheduledTask.task_id),
    false,
  );
  assert.equal(worklist.items.some((item) => item.kind === "scheduled_task_conflict" && item.target_id === scheduledTask.task_id), true);

  const doctor = await service.runDoctor({ deep: true, httpReachable: true });
  assert.equal(doctor.checks.some((check) => check.id === "calendar_write_targets_ready" && check.severity === "pass"), true);
  assert.equal(doctor.checks.some((check) => check.id === "deep_google_calendar_write_access" && check.severity === "pass"), true);
});

test("planning recommendations refresh from task pressure and apply through existing scheduling flow", async () => {
  const now = Date.now();
  let createdEvent: GoogleCalendarEventMetadata | null = null;
  const { service } = createFixture({
    verifyCalendarWriteImpl: async () => {},
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({
      events: [],
    }),
    createCalendarEventImpl: async (_calendarId, input) => {
      createdEvent = buildCalendarEventMetadata("planned-task", "primary", {
        summary: input.title ?? "Planned task",
        start_at: input.start_at!,
        end_at: input.end_at!,
        source_task_id: input.source_task_id,
        created_by_personal_ops: true,
        etag: "etag-planned-task",
      });
      return createdEvent;
    },
  });
  (service as any).config.workdayStartLocal = "00:00";
  (service as any).config.workdayEndLocal = "23:59";

  await service.syncCalendarMetadata(cliIdentity);
  const task = service.createTask(cliIdentity, {
    title: "Finish urgent proposal",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
  });

  const refreshed = service.refreshPlanningRecommendations(cliIdentity);
  assert.equal(refreshed.pending_count >= 1, true);

  const recommendations = service.listPlanningRecommendations();
  const recommendation = recommendations.find((item) => item.kind === "schedule_task_block" && item.source_task_id === task.task_id);
  assert.ok(recommendation);

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.items.some((item) => item.kind === "planning_recommendation_pending"), true);
  assert.equal(
    worklist.items.some((item) => item.kind === "task_unscheduled_due_soon" && item.target_id === task.task_id),
    false,
  );

  const applied = await service.applyPlanningRecommendation(cliIdentity, recommendation!.recommendation_id, "Looks good");
  assert.equal(applied.recommendation.status, "applied");
  assert.equal(applied.recommendation.applied_task_id, task.task_id);
  assert.equal(applied.recommendation.applied_calendar_event_id, "primary:planned-task");
  assert.equal(service.getTaskDetail(task.task_id).task.scheduled_calendar_event_id !== undefined, true);
});

test("planning recommendations generate for stale follow-up threads and create linked tasks on apply", async () => {
  const accountEmail = "machine@example.com";
  const now = Date.now();
  const followup = buildMessage("msg-followup", accountEmail, {
    thread_id: "thread-followup-phase8",
    history_id: "9201",
    internal_date: String(now - 80 * 60 * 60 * 1000),
    label_ids: ["SENT"],
    from_header: `Machine <${accountEmail}>`,
    to_header: "client@example.com",
    subject: "Checking back in",
  });
  let createdEvent: GoogleCalendarEventMetadata | null = null;
  const { service } = createFixture({
    accountEmail,
    profileHistoryId: "9201",
    listRefsImpl: async () => ({ message_ids: [followup.message_id] }),
    metadataImpl: async () => followup,
    verifyCalendarWriteImpl: async () => {},
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({ events: [] }),
    createCalendarEventImpl: async (_calendarId, input) => {
      createdEvent = buildCalendarEventMetadata("followup-block", "primary", {
        summary: input.title ?? "Follow-up",
        start_at: input.start_at!,
        end_at: input.end_at!,
        source_task_id: input.source_task_id,
        created_by_personal_ops: true,
        etag: "etag-followup",
      });
      return createdEvent;
    },
  });

  await service.syncMailboxMetadata(cliIdentity);
  await service.syncCalendarMetadata(cliIdentity);
  service.refreshPlanningRecommendations(cliIdentity);

  const recommendation = service
    .listPlanningRecommendations()
    .find((item) => item.kind === "schedule_thread_followup" && item.source_thread_id === "thread-followup-phase8");
  assert.ok(recommendation);

  const applied = await service.applyPlanningRecommendation(cliIdentity, recommendation!.recommendation_id, "Follow up tomorrow");
  assert.equal(applied.recommendation.status, "applied");
  assert.ok(applied.recommendation.applied_task_id);
  const createdTask = service.getTaskDetail(applied.recommendation.applied_task_id!).task;
  assert.equal(createdTask.source, "accepted_recommendation");
  assert.equal(createdTask.source_thread_id, "thread-followup-phase8");
  assert.equal(createdTask.scheduled_calendar_event_id !== undefined, true);
});

test("planning recommendations generate for upcoming event prep and suppress raw event-soon worklist noise", async () => {
  const now = Date.now();
  const { service } = createFixture({
    accountEmail: "machine@example.com",
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({
      events: [
        buildCalendarEventMetadata("event-prep-1", "primary", {
          summary: "Design review",
          start_at: new Date(now + 45 * 60 * 1000).toISOString(),
          end_at: new Date(now + 105 * 60 * 1000).toISOString(),
        }),
      ],
    }),
  });

  (service as any).config.meetingPrepWarningMinutes = 60;
  (service as any).config.workdayStartLocal = "00:00";
  (service as any).config.workdayEndLocal = "23:59";
  await service.syncCalendarMetadata(cliIdentity);
  service.refreshPlanningRecommendations(cliIdentity);

  const recommendation = service
    .listPlanningRecommendations()
    .find((item) => item.kind === "schedule_event_prep" && item.source_calendar_event_id === "primary:event-prep-1");
  assert.ok(recommendation);

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.items.some((item) => item.kind === "planning_recommendation_pending"), true);
  assert.equal(worklist.items.some((item) => item.kind === "calendar_event_soon"), false);
});

test("assistants can create manual planning recommendations but cannot apply them", async () => {
  const now = Date.now();
  const { service } = createFixture({
    listCalendarEventsImpl: async () => ({ events: [] }),
  });
  const task = service.createTask(cliIdentity, {
    title: "Draft the recap",
    kind: "assistant_work",
    priority: "normal",
    owner: "operator",
    due_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
  });

  const detail = service.createPlanningRecommendation(mcpIdentity, {
    kind: "schedule_task_block",
    task_id: task.task_id,
    start_at: new Date(now + 90 * 60 * 1000).toISOString(),
    end_at: new Date(now + 150 * 60 * 1000).toISOString(),
    title: "Draft the recap",
  });
  assert.equal(detail.recommendation.source, "assistant_created");
  assert.equal(detail.recommendation.kind, "schedule_task_block");
  await assert.rejects(
    () => service.applyPlanningRecommendation(mcpIdentity, detail.recommendation.recommendation_id, "Apply this"),
    /operator channel/i,
  );
});

test("phase-9 ranking and grouped planning summaries favor urgent task pressure", async () => {
  const now = Date.now();
  const { service } = createFixture();
  const task = service.db.createTask(cliIdentity, {
    title: "Finish the proposal",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
  });
  service.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    task_id: task.task_id,
    start_at: new Date(now + 60 * 60 * 1000).toISOString(),
    end_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    title: task.title,
    priority: "high",
  });
  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-phase9-needs-reply",
    proposed_start_at: new Date(now + 90 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 120 * 60 * 1000).toISOString(),
    proposed_title: "Follow up: Need your answer",
    reason_code: "needs_reply",
    reason_summary: "Set aside time to reply to Need your answer.",
    dedupe_key: "schedule_thread_followup:thread-phase9-needs-reply",
    source_fingerprint: "thread:phase9-needs-reply:1",
    source_last_seen_at: new Date(now - 10 * 60 * 1000).toISOString(),
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["needs_reply", "thread_needs_time_block"],
    suppressed_signals: ["needs_reply"],
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
  });
  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_event_prep",
    priority: "normal",
    source: "system_generated",
    source_calendar_event_id: "primary:phase9-upcoming",
    proposed_start_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 150 * 60 * 1000).toISOString(),
    proposed_title: "Prep: Design review",
    reason_code: "meeting_prep",
    reason_summary: "Reserve prep time for Design review.",
    dedupe_key: "schedule_event_prep:primary:phase9-upcoming",
    source_fingerprint: "event:phase9-upcoming:1",
    source_last_seen_at: new Date(now - 5 * 60 * 1000).toISOString(),
    slot_reason: "latest_free_before_event",
    trigger_signals: ["calendar_event_soon", "meeting_prep_needed"],
    suppressed_signals: ["calendar_event_soon"],
    group_key: "near_term_meeting_prep",
    group_summary: "1 meeting likely needs prep",
  });
  (service as any).refreshPlanningRecommendationReadModel();

  const recommendations = service.listPlanningRecommendations();
  assert.equal(recommendations.length >= 3, true);
  assert.equal(recommendations[0]?.kind, "schedule_task_block");
  assert.equal(recommendations[0]?.source_task_id, task.task_id);
  assert.equal(recommendations.every((item) => item.rank_reason && item.group_key), true);

  const groups = service.listPlanningRecommendationGroups();
  assert.equal(groups.length >= 2, true);
  assert.equal(groups[0]?.group_key, "urgent_unscheduled_tasks");

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.planning_groups.length >= 2, true);
  assert.equal(worklist.items.some((item) => item.kind === "planning_recommendation_group"), true);

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal(status.schema.compatible, true);
  assert.equal(status.planning_recommendations.top_group_summary !== null, true);
});

test("phase-9 operator can replan a stale recommendation to a new slot", async () => {
  const now = Date.now();
  const accountEmail = "machine@example.com";
  const { service } = createFixture({
    accountEmail,
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({ events: [] }),
  });
  (service as any).config.workdayStartLocal = "00:00";
  (service as any).config.workdayEndLocal = "23:59";
  const task = service.createTask(cliIdentity, {
    title: "Replan this block",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
  });

  await service.syncCalendarMetadata(cliIdentity);
  service.refreshPlanningRecommendations(cliIdentity);
  const recommendation = service
    .listPlanningRecommendations()
    .find((item) => item.kind === "schedule_task_block" && item.source_task_id === task.task_id);
  assert.ok(recommendation);

  service.db.replaceCalendarEvents(
    accountEmail,
    "google",
    [
      {
        event_id: "primary:phase9-replan-busy",
        provider_event_id: "phase9-replan-busy",
        calendar_id: "primary",
        provider: "google",
        account: accountEmail,
        summary: "New conflict",
        status: "confirmed",
        start_at: recommendation!.proposed_start_at!,
        end_at: recommendation!.proposed_end_at!,
        is_all_day: false,
        is_busy: true,
        attendee_count: 1,
        created_by_personal_ops: false,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      },
    ],
    new Date().toISOString(),
  );

  const replanned = service.replanPlanningRecommendation(cliIdentity, recommendation!.recommendation_id, "Pick a safer slot");
  assert.equal(replanned.recommendation.replan_count, 1);
  assert.equal(replanned.recommendation.last_replanned_at !== undefined, true);
  assert.equal(replanned.recommendation.first_action_type, "replan");
  assert.equal(replanned.recommendation.first_action_at !== undefined, true);
  assert.equal(replanned.recommendation.slot_reason, "replanned_after_conflict");
  assert.notEqual(replanned.recommendation.proposed_start_at, recommendation!.proposed_start_at);
});

test("phase-9 replan fails cleanly when no different slot exists", async () => {
  const now = Date.now();
  const accountEmail = "machine@example.com";
  const { service } = createFixture({
    accountEmail,
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({ events: [] }),
  });
  (service as any).config.workdayStartLocal = "00:00";
  (service as any).config.workdayEndLocal = "23:59";
  const task = service.createTask(cliIdentity, {
    title: "No alternate slot",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
  });

  await service.syncCalendarMetadata(cliIdentity);
  service.refreshPlanningRecommendations(cliIdentity);
  const recommendation = service
    .listPlanningRecommendations()
    .find((item) => item.kind === "schedule_task_block" && item.source_task_id === task.task_id);
  assert.ok(recommendation);

  service.db.replaceCalendarEvents(
    accountEmail,
    "google",
    [
      {
        event_id: "primary:phase9-no-alt",
        provider_event_id: "phase9-no-alt",
        calendar_id: "primary",
        provider: "google",
        account: accountEmail,
        summary: "Everything after this is blocked",
        status: "confirmed",
        start_at: recommendation!.proposed_end_at!,
        end_at: task.due_at!,
        is_all_day: false,
        is_busy: true,
        attendee_count: 1,
        created_by_personal_ops: false,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      },
    ],
    new Date().toISOString(),
  );

  assert.throws(
    () => service.replanPlanningRecommendation(cliIdentity, recommendation!.recommendation_id, "Try again"),
    /No better time block is currently available/,
  );

  const latest = service.getPlanningRecommendationDetail(recommendation!.recommendation_id);
  assert.equal(latest.recommendation.last_error_code, "slot_unavailable");
});

test("phase-9 replan closes stale-source recommendations with closure analytics", async () => {
  const now = Date.now();
  const { service } = createFixture({
    listCalendarEventsImpl: async () => ({ events: [] }),
  });
  const task = service.createTask(cliIdentity, {
    title: "Stale source replan",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
  });

  service.refreshPlanningRecommendations(cliIdentity);
  const recommendation = service
    .listPlanningRecommendations()
    .find((item) => item.kind === "schedule_task_block" && item.source_task_id === task.task_id);
  assert.ok(recommendation);

  service.db.updateTask(task.task_id, {
    state: "canceled",
    decision_note: "No longer needed",
    canceled_at: new Date().toISOString(),
    completed_at: null,
  });
  assert.throws(
    () => service.replanPlanningRecommendation(cliIdentity, recommendation!.recommendation_id, "Try to replan anyway"),
    /source no longer needs action/i,
  );

  const detail = service.getPlanningRecommendationDetail(recommendation!.recommendation_id);
  assert.equal(detail.recommendation.status, "superseded");
  assert.equal(detail.recommendation.outcome_state, "source_resolved");
  assert.equal(detail.recommendation.close_reason_code, "source_resolved");
  assert.equal(detail.recommendation.closed_at !== undefined, true);
});

test("phase-9 snooze presets and reject reasons are stored on planning recommendations", async () => {
  const now = Date.now();
  const { service } = createFixture({
    listCalendarEventsImpl: async () => ({ events: [] }),
  });
  const task = service.createTask(cliIdentity, {
    title: "Decide later",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
  });

  service.refreshPlanningRecommendations(cliIdentity);
  const recommendation = service
    .listPlanningRecommendations()
    .find((item) => item.kind === "schedule_task_block" && item.source_task_id === task.task_id);
  assert.ok(recommendation);

  const snoozed = service.snoozePlanningRecommendation(
    cliIdentity,
    recommendation!.recommendation_id,
    undefined,
    "Tomorrow is better",
    "tomorrow-morning",
  );
  assert.equal(snoozed.recommendation.status, "snoozed");
  assert.equal(snoozed.recommendation.snoozed_until !== undefined, true);

  const rejected = service.rejectPlanningRecommendation(
    cliIdentity,
    recommendation!.recommendation_id,
    "Handled outside the queue",
    "handled_elsewhere",
  );
  assert.equal(rejected.recommendation.status, "rejected");
  assert.equal(rejected.recommendation.decision_reason_code, "handled_elsewhere");
});

test("phase-9 startup preflight rejects incompatible planning schema metadata", () => {
  const { service } = createFixture();
  (service.db as { getSchemaCompatibility: () => { compatible: boolean; message: string } }).getSchemaCompatibility = () => ({
    compatible: false,
    message: "Schema 10 is missing planning columns: slot_reason.",
  });

  assert.throws(() => service.assertStartupCompatibility(), /Startup preflight failed/);
});

test("phase-9 end-of-day snooze rolls forward after work hours", () => {
  const { service } = createFixture();
  const resolved = (service as any).resolvePlanningSnoozeUntil(undefined, "end-of-day", new Date("2026-03-24T19:30:00-07:00"));
  assert.equal(Date.parse(resolved) > Date.parse("2026-03-24T19:30:00-07:00"), true);
});

test("phase-9 http grouped planning reads and keeps replan operator-only", async () => {
  const now = Date.now();
  const { service, config, policy } = createFixture();
  const task = service.db.createTask(cliIdentity, {
    title: "HTTP recommendation task",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
  });
  const created = service.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    task_id: task.task_id,
    start_at: new Date(now + 60 * 60 * 1000).toISOString(),
    end_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    title: task.title,
    priority: "high",
  });
  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-phase9-http",
    proposed_start_at: new Date(now + 90 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 120 * 60 * 1000).toISOString(),
    proposed_title: "Follow up: HTTP coverage",
    reason_code: "needs_reply",
    reason_summary: "Set aside time to reply to HTTP coverage.",
    dedupe_key: "schedule_thread_followup:thread-phase9-http",
    source_fingerprint: "thread:phase9-http:1",
    source_last_seen_at: new Date(now - 5 * 60 * 1000).toISOString(),
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["needs_reply", "thread_needs_time_block"],
    suppressed_signals: ["needs_reply"],
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
  });
  (service as any).refreshPlanningRecommendationReadModel();

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const groupedResponse = await fetch(`${baseUrl}/v1/planning-recommendations?grouped=true`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase9-http-test",
      },
    });
    assert.equal(groupedResponse.status, 200);
    const groupedPayload = (await groupedResponse.json()) as {
      planning_recommendation_groups?: Array<{ group_key: string }>;
    };
    assert.equal((groupedPayload.planning_recommendation_groups?.length ?? 0) >= 2, true);

    const replanResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/${created.recommendation.recommendation_id}/replan`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "content-type": "application/json",
          "x-personal-ops-client": "phase9-http-test",
        },
        body: JSON.stringify({ note: "Try to move this" }),
      },
    );
    assert.equal(replanResponse.status, 400);
    const replanPayload = (await replanResponse.json()) as { error?: string };
    assert.match(replanPayload.error ?? "", /operator channel/i);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-10 applied recommendations track linked task completion and cancellation outcomes", async () => {
  const now = Date.now();
  const { service } = createFixture({
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({ events: [] }),
    createCalendarEventImpl: async (calendarId, input) =>
      buildCalendarEventMetadata("phase10-complete-event", calendarId, {
        summary: input.title,
        start_at: input.start_at!,
        end_at: input.end_at!,
        notes: input.notes,
        created_by_personal_ops: true,
      }),
  });
  (service as any).config.workdayStartLocal = "00:00";
  (service as any).config.workdayEndLocal = "23:59";

  const completeTask = service.createTask(cliIdentity, {
    title: "Complete from recommendation",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
  });
  await service.syncCalendarMetadata(cliIdentity);
  service.refreshPlanningRecommendations(cliIdentity);
  const completeRecommendation = service
    .listPlanningRecommendations()
    .find((item) => item.kind === "schedule_task_block" && item.source_task_id === completeTask.task_id);
  assert.ok(completeRecommendation);
  await service.applyPlanningRecommendation(cliIdentity, completeRecommendation!.recommendation_id, "Schedule it now");
  service.completeTask(cliIdentity, completeTask.task_id, "Finished the work");
  const completedDetail = service.getPlanningRecommendationDetail(completeRecommendation!.recommendation_id);
  assert.equal(completedDetail.recommendation.first_action_type, "apply");
  assert.equal(completedDetail.recommendation.first_action_at !== undefined, true);
  assert.equal(completedDetail.recommendation.outcome_state, "completed");
  assert.equal(completedDetail.recommendation.outcome_source, "operator");
  assert.equal(completedDetail.recommendation.close_reason_code, "task_completed");
  assert.equal(completedDetail.recommendation.closed_at !== undefined, true);
  assert.equal(completedDetail.applied_task_current_state, "completed");

  const cancelSource = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-phase10-cancel",
    proposed_start_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 150 * 60 * 1000).toISOString(),
    proposed_title: "Follow up: Cancel outcome",
    reason_code: "needs_reply",
    reason_summary: "Set aside time to reply to Cancel outcome.",
    dedupe_key: "schedule_thread_followup:thread-phase10-cancel",
    source_fingerprint: "thread:phase10-cancel:1",
    source_last_seen_at: new Date(now - 5 * 60 * 1000).toISOString(),
    slot_state: "ready",
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["needs_reply", "thread_needs_time_block"],
    suppressed_signals: ["needs_reply"],
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
  });
  (service as any).refreshPlanningRecommendationReadModel();
  const createdTask = (service as any).createTaskFromPlanningRecommendation(cliIdentity, cancelSource, {
    title: "Follow up: Cancel outcome",
    kind: "assistant_work",
    priority: "high",
    source_thread_id: "thread-phase10-cancel",
  });
  service.db.updatePlanningRecommendation(cancelSource.recommendation_id, {
    status: "applied",
    applied_task_id: createdTask.task_id,
    outcome_state: "scheduled",
    outcome_recorded_at: new Date().toISOString(),
    outcome_source: "operator",
    outcome_summary: "Scheduled follow-up work from the recommendation.",
  });
  service.cancelTask(cliIdentity, createdTask.task_id, "No longer needed");
  const canceledDetail = service.getPlanningRecommendationDetail(cancelSource.recommendation_id);
  assert.equal(canceledDetail.recommendation.outcome_state, "canceled");
  assert.equal(canceledDetail.recommendation.close_reason_code, "task_canceled");
  assert.equal(canceledDetail.recommendation.closed_at !== undefined, true);
  assert.equal(canceledDetail.applied_task_current_state, "canceled");
});

test("phase-10 grouped inbox recommendations avoid slot collisions and expose next action detail", async () => {
  const accountEmail = "machine@example.com";
  const now = new Date();
  const nextBusinessDayAt = (base: Date, hour: number, minute = 0) => {
    const candidate = new Date(base);
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(hour, minute, 0, 0);
    while (candidate.getDay() === 0 || candidate.getDay() === 6) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  };
  const firstBusinessDayStart = nextBusinessDayAt(now, 9, 0);
  const firstBusinessDayEnd = new Date(firstBusinessDayStart);
  firstBusinessDayEnd.setHours(18, 0, 0, 0);
  const secondBusinessDayStart = nextBusinessDayAt(firstBusinessDayStart, 9, 0);
  const secondBusinessDayGapStart = new Date(secondBusinessDayStart);
  secondBusinessDayGapStart.setHours(10, 0, 0, 0);
  const secondBusinessDayGapEnd = new Date(secondBusinessDayStart);
  secondBusinessDayGapEnd.setHours(10, 30, 0, 0);
  const secondBusinessDayEnd = new Date(secondBusinessDayStart);
  secondBusinessDayEnd.setHours(18, 0, 0, 0);

  const inboundA = buildMessage("msg-phase10-a", accountEmail, {
    thread_id: "thread-phase10-a",
    history_id: "9101",
    internal_date: String(Date.now() - 20 * 60 * 1000),
    label_ids: ["INBOX", "UNREAD"],
    from_header: "Client A <a@example.com>",
    subject: "Need reply A",
  });
  const inboundB = buildMessage("msg-phase10-b", accountEmail, {
    thread_id: "thread-phase10-b",
    history_id: "9102",
    internal_date: String(Date.now() - 10 * 60 * 1000),
    label_ids: ["INBOX", "UNREAD"],
    from_header: "Client B <b@example.com>",
    subject: "Need reply B",
  });
  const messages = new Map([
    [inboundA.message_id, inboundA],
    [inboundB.message_id, inboundB],
  ]);

  const { service } = createFixture({
    accountEmail,
    profileHistoryId: "9999",
    listRefsImpl: async () => ({
      message_ids: [inboundA.message_id, inboundB.message_id],
    }),
    metadataImpl: async (messageId) => {
      const message = messages.get(messageId);
      if (!message) throw new Error(`Unknown message ${messageId}`);
      return message;
    },
    listCalendarsImpl: async () => ({
      calendars: [
        {
          calendar_id: "primary",
          title: "Primary",
          is_primary: true,
          is_selected: true,
          access_role: "owner",
        },
      ],
    }),
    listCalendarEventsImpl: async () => ({
      events: [
        buildCalendarEventMetadata("busy-today", "primary", {
          start_at: firstBusinessDayStart.toISOString(),
          end_at: firstBusinessDayEnd.toISOString(),
          summary: "Next business day is blocked",
        }),
        buildCalendarEventMetadata("busy-tomorrow-early", "primary", {
          start_at: secondBusinessDayStart.toISOString(),
          end_at: secondBusinessDayGapStart.toISOString(),
          summary: "Second business day early is blocked",
        }),
        buildCalendarEventMetadata("busy-tomorrow-late", "primary", {
          start_at: secondBusinessDayGapEnd.toISOString(),
          end_at: secondBusinessDayEnd.toISOString(),
          summary: "Second business day late is blocked",
        }),
      ],
    }),
  });

  await service.syncCalendarMetadata(cliIdentity);
  await service.syncMailboxMetadata(cliIdentity);
  service.refreshPlanningRecommendations(cliIdentity);

  const recommendations = service
    .listPlanningRecommendations()
    .filter((item) => item.kind === "schedule_thread_followup")
    .sort((left, right) => left.recommendation_id.localeCompare(right.recommendation_id));
  assert.equal(recommendations.length, 2);
  assert.equal(
    new Set(recommendations.map((item) => `${item.proposed_start_at ?? "none"}:${item.proposed_end_at ?? "none"}`)).size,
    recommendations.length,
  );
  assert.equal(recommendations.some((item) => item.slot_state === "ready"), true);
  assert.equal(recommendations.every((item) => (item.source_last_seen_at ?? "").includes("T")), true);

  const groupDetail = service.getPlanningRecommendationGroupDetail("urgent_inbox_followups");
  assert.equal(
    groupDetail.has_manual_scheduling_members,
    recommendations.some((item) => item.slot_state === "needs_manual_scheduling"),
  );
  assert.ok(groupDetail.next_actionable_recommendation);
  assert.equal(groupDetail.next_actionable_recommendation?.slot_state, "ready");

  const nextDetail = service.getNextPlanningRecommendationDetail("urgent_inbox_followups");
  assert.ok(nextDetail);
  assert.equal(nextDetail?.recommendation.slot_state, "ready");
});

test("phase-10 grouped snooze and reject update only pending group members", () => {
  const now = Date.now();
  const { service } = createFixture();
  const first = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-phase10-group-1",
    proposed_start_at: new Date(now + 60 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 90 * 60 * 1000).toISOString(),
    proposed_title: "Follow up: Group 1",
    reason_code: "needs_reply",
    reason_summary: "Follow up with Group 1.",
    dedupe_key: "schedule_thread_followup:thread-phase10-group-1",
    source_fingerprint: "thread:phase10-group-1:1",
    source_last_seen_at: new Date(now).toISOString(),
    slot_state: "ready",
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    group_key: "urgent_inbox_followups",
    group_summary: "2 urgent inbox follow-ups could be time-blocked",
  });
  const second = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-phase10-group-2",
    proposed_start_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 150 * 60 * 1000).toISOString(),
    proposed_title: "Follow up: Group 2",
    reason_code: "needs_reply",
    reason_summary: "Follow up with Group 2.",
    dedupe_key: "schedule_thread_followup:thread-phase10-group-2",
    source_fingerprint: "thread:phase10-group-2:1",
    source_last_seen_at: new Date(now).toISOString(),
    slot_state: "ready",
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    group_key: "urgent_inbox_followups",
    group_summary: "2 urgent inbox follow-ups could be time-blocked",
  });
  service.db.updatePlanningRecommendation(second.recommendation_id, {
    status: "snoozed",
    snoozed_until: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
  });
  (service as any).refreshPlanningRecommendationReadModel();

  const snoozedGroup = service.snoozePlanningRecommendationGroup(
    cliIdentity,
    "urgent_inbox_followups",
    undefined,
    "Pause the ready items",
    "tomorrow-morning",
  );
  assert.equal(snoozedGroup.counts_by_status.snoozed >= 1, true);
  assert.equal(service.db.getPlanningRecommendation(first.recommendation_id)?.status, "snoozed");
  assert.equal(service.db.getPlanningRecommendation(second.recommendation_id)?.status, "snoozed");
  assert.equal(service.db.getPlanningRecommendation(first.recommendation_id)?.first_action_type, "group_snooze");
  assert.equal(service.db.getPlanningRecommendation(first.recommendation_id)?.closed_at, undefined);

  service.db.updatePlanningRecommendation(first.recommendation_id, { status: "pending", snoozed_until: null });
  service.db.updatePlanningRecommendation(second.recommendation_id, { status: "pending", snoozed_until: null });
  const rejectedGroup = service.rejectPlanningRecommendationGroup(
    cliIdentity,
    "urgent_inbox_followups",
    "Handled in another tracker",
    "handled_elsewhere",
  );
  assert.equal(rejectedGroup.counts_by_status.rejected, 2);
  assert.equal(service.db.getPlanningRecommendation(first.recommendation_id)?.outcome_state, "handled_elsewhere");
  assert.equal(service.db.getPlanningRecommendation(first.recommendation_id)?.first_action_type, "group_snooze");
  assert.equal(service.db.getPlanningRecommendation(second.recommendation_id)?.close_reason_code, "rejected_handled_elsewhere");
  assert.throws(
    () =>
      service.rejectPlanningRecommendationGroup(
        cliIdentity,
        "urgent_inbox_followups",
        "Nope",
        "bad_timing",
      ),
    /only supports duplicate or handled_elsewhere/i,
  );
});

test("phase-10 http next and grouped mutation routes keep assistant permissions unchanged", async () => {
  const now = Date.now();
  const { service, config, policy } = createFixture();
  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-phase10-http-1",
    proposed_start_at: new Date(now + 60 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(now + 90 * 60 * 1000).toISOString(),
    proposed_title: "Follow up: HTTP 1",
    reason_code: "needs_reply",
    reason_summary: "Follow up with HTTP 1.",
    dedupe_key: "schedule_thread_followup:thread-phase10-http-1",
    source_fingerprint: "thread:phase10-http-1:1",
    source_last_seen_at: new Date(now).toISOString(),
    slot_state: "ready",
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
  });
  (service as any).refreshPlanningRecommendationReadModel();

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const nextResponse = await fetch(`${baseUrl}/v1/planning-recommendations/next`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase10-http-test",
      },
    });
    assert.equal(nextResponse.status, 200);
    const nextPayload = (await nextResponse.json()) as { planning_recommendation?: { recommendation: { recommendation_id: string } } };
    assert.equal(Boolean(nextPayload.planning_recommendation), true);

    const groupResponse = await fetch(`${baseUrl}/v1/planning-recommendation-groups/urgent_inbox_followups`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase10-http-test",
      },
    });
    assert.equal(groupResponse.status, 200);

    const rejectResponse = await fetch(`${baseUrl}/v1/planning-recommendation-groups/urgent_inbox_followups/reject`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase10-http-test",
      },
      body: JSON.stringify({ reason_code: "duplicate", note: "Not for assistants" }),
    });
    assert.equal(rejectResponse.status, 400);
    const rejectPayload = (await rejectResponse.json()) as { error?: string };
    assert.match(rejectPayload.error ?? "", /operator channel/i);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-11 planning analytics summarize backlog, resurfacing, and closure metrics", async () => {
  const now = Date.now();
  const { service } = createFixture();

  const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-stale-manual",
    proposed_title: "Manual scheduling needed",
    reason_code: "task_schedule_pressure",
    reason_summary: "Manual scheduling needed.",
    dedupe_key: "schedule_task_block:task-stale-manual",
    source_fingerprint: "fp-stale-manual",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "needs_manual_scheduling",
    slot_state_reason: "no_unique_window_after_group_reservation",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
  });
  const staleManual = service
    .listPlanningRecommendations({ include_resolved: true })
    .find((item) => item.dedupe_key === "schedule_task_block:task-stale-manual");
  assert.ok(staleManual);
  (service.db as any).db
    .prepare(`UPDATE planning_recommendations SET created_at = ?, updated_at = ? WHERE recommendation_id = ?`)
    .run(
      new Date(now - 48 * 60 * 60 * 1000).toISOString(),
      new Date(now - 48 * 60 * 60 * 1000).toISOString(),
      staleManual!.recommendation_id,
    );

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "applied",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-stale-scheduled",
    proposed_title: "Scheduled follow-up",
    reason_code: "needs_reply",
    reason_summary: "Scheduled follow-up.",
    dedupe_key: "schedule_thread_followup:thread-stale-scheduled",
    source_fingerprint: "fp-stale-scheduled",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    outcome_state: "scheduled",
    outcome_recorded_at: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
    first_action_at: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
    first_action_type: "apply",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
  });

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "rejected",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-rejected",
    proposed_title: "Rejected follow-up",
    reason_code: "needs_reply",
    reason_summary: "Rejected follow-up.",
    dedupe_key: "schedule_thread_followup:thread-rejected",
    source_fingerprint: "fp-rejected",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    outcome_state: "dismissed",
    outcome_recorded_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
    first_action_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
    first_action_type: "reject",
    closed_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
    close_reason_code: "rejected_duplicate",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    resolved_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
  });

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "applied",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-completed",
    proposed_title: "Completed block",
    reason_code: "task_schedule_pressure",
    reason_summary: "Completed block.",
    dedupe_key: "schedule_task_block:task-completed",
    source_fingerprint: "fp-completed",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    outcome_state: "completed",
    outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    first_action_at: new Date(now - 10 * 60 * 60 * 1000).toISOString(),
    first_action_type: "apply",
    closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    close_reason_code: "task_completed",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
    resolved_at: new Date(now - 10 * 60 * 60 * 1000).toISOString(),
  });

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "superseded",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-resurface",
    proposed_title: "Older resolved follow-up",
    reason_code: "needs_reply",
    reason_summary: "Older resolved follow-up.",
    dedupe_key: "schedule_thread_followup:thread-resurface",
    source_fingerprint: "fp-resurface-old",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    outcome_state: "source_resolved",
    outcome_recorded_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
    closed_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
    close_reason_code: "source_resolved",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    resolved_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
  });

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-resurface",
    proposed_title: "Resurfaced follow-up",
    reason_code: "needs_reply",
    reason_summary: "Resurfaced follow-up.",
    dedupe_key: "schedule_thread_followup:thread-resurface",
    source_fingerprint: "fp-resurface-new",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
  });

  const summary = service.getPlanningRecommendationSummaryReport();
  const backlog = service.getPlanningRecommendationBacklogReport();
  const filteredBacklog = service.getPlanningRecommendationBacklogReport({
    group: "urgent_inbox_followups",
    stale_only: true,
  });
  const closure = service.getPlanningRecommendationClosureReport();
  const filteredClosure = service.getPlanningRecommendationClosureReport({
    days: 30,
    close_reason: "task_completed",
  });
  const groupDetail = service.getPlanningRecommendationGroupDetail("urgent_inbox_followups");
  const status = await service.getStatusReport({ httpReachable: true });

  assert.equal(summary.open_count, 3);
  assert.equal(summary.stale_count, 2);
  assert.equal(summary.manual_scheduling_count, 1);
  assert.equal(summary.most_completed_group?.summary, "1 urgent task recommendation completed");
  assert.equal(backlog.total_active_count, 3);
  assert.deepEqual(backlog.filters, {
    group: undefined,
    kind: undefined,
    source: undefined,
    stale_only: false,
    manual_only: false,
    resurfaced_only: false,
  });
  assert.equal(backlog.groups.some((group) => group.resurfaced_source_count === 1), true);
  assert.equal(backlog.groups.some((group) => group.closed_last_30d >= 1), true);
  assert.equal(filteredBacklog.total_active_count, 1);
  assert.equal(filteredBacklog.groups.length, 1);
  assert.equal(filteredBacklog.groups[0]?.group_key, "urgent_inbox_followups");
  assert.equal(filteredBacklog.groups[0]?.stale_scheduled_count, 1);
  assert.equal(filteredBacklog.groups[0]?.source_resolved_last_30d, 1);
  assert.equal(groupDetail.stale_scheduled_count, 1);
  assert.equal(groupDetail.resurfaced_source_count, 1);
  assert.equal(groupDetail.closed_last_30d, 2);
  assert.equal(groupDetail.source_resolved_last_30d, 1);
  assert.equal(groupDetail.dominant_close_reason_last_30d, "rejected_duplicate");
  assert.equal(closure.totals.closed_count, 3);
  assert.equal(closure.totals.completed_count, 1);
  assert.equal(filteredClosure.totals.closed_count, 1);
  assert.equal(filteredClosure.by_close_reason[0]?.key, "task_completed");
  assert.equal(closure.by_close_reason.some((breakdown) => breakdown.key === "task_completed"), true);
  assert.equal(status.tasks.active_count, 0);
  assert.equal(status.tasks.historical_count, 0);
  assert.equal(status.task_suggestions.active_count, 0);
  assert.equal(status.task_suggestions.historical_count, 0);
  assert.equal(status.planning_recommendations.active_count, 3);
  assert.equal(status.planning_recommendations.historical_count, 3);
  assert.equal(status.planning_recommendations.stale_pending_count >= 1, true);
  assert.equal(status.planning_recommendations.stale_scheduled_count, 1);
  assert.equal(status.planning_recommendations.resurfaced_source_count, 1);
  assert.equal(status.planning_recommendations.top_backlog_summary !== null, true);
  assert.equal(status.planning_recommendations.top_closure_summary !== null, true);
  assert.equal(status.planning_recommendations.top_hygiene_summary, null);
});

test("phase-12 planning calibration adjusts ranking conservatively", () => {
  const now = Date.now();
  const { service } = createFixture();

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_thread_followup",
      status: "superseded",
      priority: "high",
      source: "system_generated",
      source_thread_id: `thread-calibration-${suffix}`,
      proposed_title: "Resolved elsewhere",
      reason_code: "needs_reply",
      reason_summary: "Resolved elsewhere.",
      dedupe_key: `schedule_thread_followup:thread-calibration-${suffix}`,
      source_fingerprint: `fp-calibration-${suffix}`,
      group_key: "urgent_inbox_followups",
      group_summary: "1 urgent inbox follow-up could be time-blocked",
      outcome_state: "source_resolved",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "source_resolved",
      slot_state: "ready",
      trigger_signals: ["needs_reply"],
      suppressed_signals: [],
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-calibrated-open",
    proposed_title: "Calibrated open follow-up",
    reason_code: "needs_reply",
    reason_summary: "Calibrated open follow-up.",
    dedupe_key: "schedule_thread_followup:thread-calibrated-open",
    source_fingerprint: "fp-calibrated-open",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
  });

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "pending",
    priority: "high",
    source: "assistant_created",
    source_thread_id: "thread-assistant-open",
    proposed_title: "Assistant open follow-up",
    reason_code: "assistant_requested",
    reason_summary: "Assistant open follow-up.",
    dedupe_key: "schedule_thread_followup:thread-assistant-open",
    source_fingerprint: "fp-assistant-open",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    slot_state: "ready",
    trigger_signals: ["assistant_requested"],
    suppressed_signals: [],
  });

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "superseded",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-calibration-small-a",
    proposed_title: "Small sample one",
    reason_code: "needs_reply",
    reason_summary: "Small sample one.",
    dedupe_key: "schedule_thread_followup:thread-calibration-small-a",
    source_fingerprint: "fp-calibration-small-a",
    group_key: "near_term_meeting_prep",
    group_summary: "1 meeting likely need prep",
    outcome_state: "source_resolved",
    outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    close_reason_code: "source_resolved",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "superseded",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-calibration-small-b",
    proposed_title: "Small sample two",
    reason_code: "needs_reply",
    reason_summary: "Small sample two.",
    dedupe_key: "schedule_thread_followup:thread-calibration-small-b",
    source_fingerprint: "fp-calibration-small-b",
    group_key: "near_term_meeting_prep",
    group_summary: "1 meeting likely need prep",
    outcome_state: "source_resolved",
    outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    close_reason_code: "source_resolved",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-small-sample-open",
    proposed_title: "Small sample open follow-up",
    reason_code: "needs_reply",
    reason_summary: "Small sample open follow-up.",
    dedupe_key: "schedule_thread_followup:thread-small-sample-open",
    source_fingerprint: "fp-small-sample-open",
    group_key: "near_term_meeting_prep",
    group_summary: "1 meeting likely need prep",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
  });

  (service as any).refreshPlanningRecommendationReadModel();

  const calibrated = service
    .listPlanningRecommendations({ include_resolved: false })
    .find((recommendation) => recommendation.dedupe_key === "schedule_thread_followup:thread-calibrated-open");
  const assistantCreated = service
    .listPlanningRecommendations({ include_resolved: false })
    .find((recommendation) => recommendation.dedupe_key === "schedule_thread_followup:thread-assistant-open");
  const smallSample = service
    .listPlanningRecommendations({ include_resolved: false })
    .find((recommendation) => recommendation.dedupe_key === "schedule_thread_followup:thread-small-sample-open");

  assert.ok(calibrated);
  assert.ok(assistantCreated);
  assert.ok(smallSample);
  assert.match(calibrated!.rank_reason ?? "", /often resolve at the source/i);
  assert.equal(calibrated!.status, "pending");
  assert.equal(calibrated!.closed_at, undefined);
  assert.doesNotMatch(assistantCreated!.rank_reason ?? "", /often resolve at the source/i);
  assert.doesNotMatch(smallSample!.rank_reason ?? "", /often resolve at the source/i);
});

test("phase-13 planning hygiene reports advisory candidates without mutating queue state", async () => {
  const now = Date.now();
  const { service } = createFixture();

  const createPlanning = (input: Record<string, unknown>) =>
    service.db.createPlanningRecommendation(cliIdentity, {
      priority: "high",
      source: "system_generated",
      reason_code: "task_schedule_pressure",
      reason_summary: "Planning hygiene fixture.",
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
      ...input,
    } as any);

  for (let index = 0; index < 6; index += 1) {
    createPlanning({
      kind: "schedule_task_block",
      status: "pending",
      source: "system_generated",
      source_task_id: `task-open-source-${index}`,
      dedupe_key: `schedule_task_block:task-open-source-${index}`,
      source_fingerprint: `fp-open-source-${index}`,
      proposed_title: `Open source task ${index}`,
      created_at: new Date(now - (index + 1) * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now - (index + 1) * 60 * 60 * 1000).toISOString(),
    });
  }
  for (const suffix of ["a", "b", "c"]) {
    createPlanning({
      kind: "schedule_task_block",
      status: "superseded",
      source: "system_generated",
      source_task_id: `task-closed-source-${suffix}`,
      dedupe_key: `schedule_task_block:task-closed-source-${suffix}`,
      source_fingerprint: `fp-closed-source-${suffix}`,
      proposed_title: `Closed source task ${suffix}`,
      outcome_state: "source_resolved",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "source_resolved",
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  createPlanning({
    kind: "schedule_thread_followup",
    status: "pending",
    source: "system_generated",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    source_thread_id: "thread-open-handled",
    dedupe_key: "schedule_thread_followup:thread-open-handled",
    source_fingerprint: "fp-open-handled",
    proposed_title: "Open handled elsewhere thread",
    reason_code: "needs_reply",
    reason_summary: "Open handled elsewhere thread.",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
  });
  for (const suffix of ["a", "b", "c"]) {
    createPlanning({
      kind: "schedule_thread_followup",
      status: "rejected",
      source: "system_generated",
      group_key: "urgent_inbox_followups",
      group_summary: "1 urgent inbox follow-up could be time-blocked",
      source_thread_id: `thread-closed-handled-${suffix}`,
      dedupe_key: `schedule_thread_followup:thread-closed-handled-${suffix}`,
      source_fingerprint: `fp-closed-handled-${suffix}`,
      proposed_title: `Closed handled elsewhere thread ${suffix}`,
      reason_code: "needs_reply",
      reason_summary: "Closed handled elsewhere thread.",
      trigger_signals: ["needs_reply"],
      suppressed_signals: [],
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      first_action_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  createPlanning({
    kind: "schedule_event_prep",
    status: "pending",
    source: "system_generated",
    group_key: "near_term_meeting_prep",
    group_summary: "1 meeting likely need prep",
    source_calendar_event_id: "event-open-completed",
    dedupe_key: "schedule_event_prep:event-open-completed",
    source_fingerprint: "fp-open-completed",
    proposed_title: "Open completed prep event",
    reason_code: "meeting_prep",
    reason_summary: "Open completed prep event.",
    trigger_signals: ["meeting_prep_needed"],
    suppressed_signals: ["calendar_event_soon"],
  });
  for (const suffix of ["a", "b", "c"]) {
    createPlanning({
      kind: "schedule_event_prep",
      status: "applied",
      source: "system_generated",
      group_key: "near_term_meeting_prep",
      group_summary: "1 meeting likely need prep",
      source_calendar_event_id: `event-closed-completed-${suffix}`,
      dedupe_key: `schedule_event_prep:event-closed-completed-${suffix}`,
      source_fingerprint: `fp-closed-completed-${suffix}`,
      proposed_title: `Closed completed prep event ${suffix}`,
      reason_code: "meeting_prep",
      reason_summary: "Closed completed prep event.",
      trigger_signals: ["meeting_prep_needed"],
      suppressed_signals: ["calendar_event_soon"],
      outcome_state: "completed",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "task_completed",
      first_action_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_type: "apply",
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  createPlanning({
    kind: "schedule_task_block",
    status: "pending",
    source: "assistant_created",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    source_task_id: "task-open-mixed",
    dedupe_key: "schedule_task_block:task-open-mixed",
    source_fingerprint: "fp-open-mixed",
    proposed_title: "Open mixed task",
    reason_code: "assistant_requested",
    reason_summary: "Open mixed task.",
    trigger_signals: ["assistant_requested"],
    suppressed_signals: ["task_unscheduled_due_soon"],
  });
  createPlanning({
    kind: "schedule_task_block",
    status: "applied",
    source: "assistant_created",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    source_task_id: "task-closed-mixed-complete",
    dedupe_key: "schedule_task_block:task-closed-mixed-complete",
    source_fingerprint: "fp-closed-mixed-complete",
    proposed_title: "Closed mixed complete task",
    reason_code: "assistant_requested",
    reason_summary: "Closed mixed complete task.",
    trigger_signals: ["assistant_requested"],
    suppressed_signals: ["task_unscheduled_due_soon"],
    outcome_state: "completed",
    outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    close_reason_code: "task_completed",
    first_action_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    first_action_type: "apply",
    resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });
  createPlanning({
    kind: "schedule_task_block",
    status: "rejected",
    source: "assistant_created",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    source_task_id: "task-closed-mixed-handled",
    dedupe_key: "schedule_task_block:task-closed-mixed-handled",
    source_fingerprint: "fp-closed-mixed-handled",
    proposed_title: "Closed mixed handled task",
    reason_code: "assistant_requested",
    reason_summary: "Closed mixed handled task.",
    trigger_signals: ["assistant_requested"],
    suppressed_signals: ["task_unscheduled_due_soon"],
    outcome_state: "handled_elsewhere",
    outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    close_reason_code: "rejected_handled_elsewhere",
    first_action_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    first_action_type: "reject",
    resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });
  createPlanning({
    kind: "schedule_task_block",
    status: "superseded",
    source: "assistant_created",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    source_task_id: "task-closed-mixed-source",
    dedupe_key: "schedule_task_block:task-closed-mixed-source",
    source_fingerprint: "fp-closed-mixed-source",
    proposed_title: "Closed mixed source task",
    reason_code: "assistant_requested",
    reason_summary: "Closed mixed source task.",
    trigger_signals: ["assistant_requested"],
    suppressed_signals: ["task_unscheduled_due_soon"],
    outcome_state: "source_resolved",
    outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    close_reason_code: "source_resolved",
    resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });

  createPlanning({
    kind: "schedule_event_prep",
    status: "pending",
    source: "assistant_created",
    group_key: "near_term_meeting_prep",
    group_summary: "1 meeting likely need prep",
    source_calendar_event_id: "event-open-insufficient",
    dedupe_key: "schedule_event_prep:event-open-insufficient",
    source_fingerprint: "fp-open-insufficient",
    proposed_title: "Open insufficient prep event",
    reason_code: "meeting_prep",
    reason_summary: "Open insufficient prep event.",
    trigger_signals: ["meeting_prep_needed"],
    suppressed_signals: ["calendar_event_soon"],
  });
  for (const suffix of ["a", "b"]) {
    createPlanning({
      kind: "schedule_event_prep",
      status: "superseded",
      source: "assistant_created",
      group_key: "near_term_meeting_prep",
      group_summary: "1 meeting likely need prep",
      source_calendar_event_id: `event-closed-insufficient-${suffix}`,
      dedupe_key: `schedule_event_prep:event-closed-insufficient-${suffix}`,
      source_fingerprint: `fp-closed-insufficient-${suffix}`,
      proposed_title: `Closed insufficient prep event ${suffix}`,
      reason_code: "meeting_prep",
      reason_summary: "Closed insufficient prep event.",
      trigger_signals: ["meeting_prep_needed"],
      suppressed_signals: ["calendar_event_soon"],
      outcome_state: "source_resolved",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "source_resolved",
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  const trackedRecommendationId = service
    .listPlanningRecommendations({ include_resolved: false })
    .find((recommendation) => recommendation.dedupe_key === "schedule_task_block:task-open-source-0")
    ?.recommendation_id;
  assert.ok(trackedRecommendationId);
  const before = service.getPlanningRecommendationDetail(trackedRecommendationId!).recommendation;

  const hygiene = service.getPlanningRecommendationHygieneReport();
  const candidateOnly = service.getPlanningRecommendationHygieneReport({ candidate_only: true });
  const backlog = service.getPlanningRecommendationBacklogReport();
  const summary = service.getPlanningRecommendationSummaryReport();
  const status = await service.getStatusReport({ httpReachable: true });
  const groupDetail = service.getPlanningRecommendationGroupDetail("urgent_unscheduled_tasks");
  const closure = service.getPlanningRecommendationClosureReport({ days: 30, group: "urgent_unscheduled_tasks" });
  const after = service.getPlanningRecommendationDetail(trackedRecommendationId!).recommendation;

  const sourceCandidate = hygiene.families.find(
    (family) => family.kind === "schedule_task_block" && family.source === "system_generated",
  );
  const handledCandidate = hygiene.families.find(
    (family) => family.kind === "schedule_thread_followup" && family.source === "system_generated",
  );
  const completedCandidate = hygiene.families.find(
    (family) => family.kind === "schedule_event_prep" && family.source === "system_generated",
  );
  const mixedCandidate = hygiene.families.find(
    (family) => family.kind === "schedule_task_block" && family.source === "assistant_created",
  );
  const insufficientCandidate = hygiene.families.find(
    (family) => family.kind === "schedule_event_prep" && family.source === "assistant_created",
  );

  assert.ok(sourceCandidate);
  assert.ok(handledCandidate);
  assert.ok(completedCandidate);
  assert.ok(mixedCandidate);
  assert.ok(insufficientCandidate);
  assert.equal(sourceCandidate!.closure_signal, "mostly_source_resolved");
  assert.equal(sourceCandidate!.recommended_action, "review_source_suppression");
  assert.equal(sourceCandidate!.queue_share_pct, 60);
  assert.match(sourceCandidate!.closure_meaning_summary ?? "", /source stopped needing action/i);
  assert.equal(handledCandidate!.closure_signal, "mostly_handled_elsewhere");
  assert.equal(handledCandidate!.recommended_action, "review_externalized_workflow");
  assert.match(handledCandidate!.closure_meaning_summary ?? "", /leaving the queue/i);
  assert.equal(completedCandidate!.closure_signal, "healthy_completed");
  assert.equal(completedCandidate!.recommended_action, "keep_visible");
  assert.match(completedCandidate!.closure_meaning_summary ?? "", /stay visible/i);
  assert.equal(mixedCandidate!.closure_signal, "mixed");
  assert.equal(mixedCandidate!.recommended_action, "keep_visible");
  assert.match(mixedCandidate!.closure_meaning_summary ?? "", /mixed/i);
  assert.equal(insufficientCandidate!.closure_signal, "insufficient_history");
  assert.equal(insufficientCandidate!.recommended_action, "need_more_history");
  assert.equal(candidateOnly.families.length, 2);
  assert.equal(candidateOnly.families.every((family) => family.recommended_action.startsWith("review_")), true);
  assert.equal(
    backlog.groups.find((group) => group.group_key === "urgent_unscheduled_tasks")?.dominates_queue,
    true,
  );
  assert.equal(
    backlog.groups.find((group) => group.group_key === "urgent_unscheduled_tasks")?.queue_share_pct,
    70,
  );
  assert.match(
    backlog.groups.find((group) => group.group_key === "urgent_unscheduled_tasks")?.closure_meaning_summary ?? "",
    /source stopped needing action/i,
  );
  assert.equal(summary.dominant_backlog_group?.queue_share_pct, 70);
  assert.equal(summary.top_suppression_candidate?.recommended_action, "review_source_suppression");
  assert.match(status.planning_recommendations.dominant_backlog_summary ?? "", /70% of the open planning queue/i);
  assert.match(status.planning_recommendations.top_suppression_candidate_summary ?? "", /source-side suppression candidate/i);
  assert.equal(
    status.planning_recommendations.top_hygiene_summary,
    status.planning_recommendations.top_suppression_candidate_summary,
  );
  assert.match(groupDetail.closure_meaning_summary ?? "", /source stopped needing action/i);
  assert.match(closure.totals.closure_meaning_summary ?? "", /source stopped needing action/i);
  assert.equal(before.updated_at, after.updated_at);
  assert.equal(before.rank_score, after.rank_score);
});

test("phase-14 planning hygiene reviews are audit-derived and re-open when evidence changes", async () => {
  const now = Date.now();
  const { service } = createFixture();

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `task-phase14-closed-${suffix}`,
      proposed_title: `Phase 14 closed task ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 14 closed task ${suffix}.`,
      dedupe_key: `schedule_task_block:task-phase14-closed-${suffix}`,
      source_fingerprint: `fp-phase14-closed-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: ["task_unscheduled_due_soon"],
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase14-open",
    proposed_title: "Phase 14 open task",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 14 open task.",
    dedupe_key: "schedule_task_block:task-phase14-open",
    source_fingerprint: "fp-phase14-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: ["task_unscheduled_due_soon"],
  });

  const trackedRecommendationId = service
    .listPlanningRecommendations({ include_resolved: false })
    .find((recommendation) => recommendation.dedupe_key === "schedule_task_block:task-phase14-open")
    ?.recommendation_id;
  assert.ok(trackedRecommendationId);
  const beforeReview = service.getPlanningRecommendationDetail(trackedRecommendationId!).recommendation;

  const initialHygiene = service.getPlanningRecommendationHygieneReport({ review_needed_only: true });
  assert.equal(initialHygiene.families.length, 1);
  assert.equal(initialHygiene.families[0]?.review_needed, true);
  assert.equal(initialHygiene.families[0]?.recommended_action, "review_externalized_workflow");

  const initialStatus = await service.getStatusReport({ httpReachable: true });
  assert.equal(initialStatus.planning_recommendations.review_needed_count, 1);
  assert.match(initialStatus.planning_recommendations.top_review_needed_summary ?? "", /externalized-workflow candidate/i);

  const initialWorklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(initialWorklist.items.some((item) => item.kind === "planning_hygiene_review_needed"), true);

  const reviewed = service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Phase 14 review",
  });
  assert.equal(reviewed.review_needed, false);
  assert.equal(reviewed.last_review_decision, "investigate_externalized_workflow");
  assert.equal(reviewed.last_review_by_client, "operator-cli");
  assert.equal(reviewed.last_review_by_actor, "operator");
  assert.equal(reviewed.last_review_note, "Phase 14 review");
  assert.match(reviewed.review_summary ?? "", /Reviewed .*investigate_externalized_workflow/i);

  const afterReview = service.getPlanningRecommendationDetail(trackedRecommendationId!).recommendation;
  assert.equal(beforeReview.updated_at, afterReview.updated_at);
  assert.equal(beforeReview.rank_score, afterReview.rank_score);

  const clearedHygiene = service.getPlanningRecommendationHygieneReport({ review_needed_only: true });
  assert.equal(clearedHygiene.families.length, 0);

  const clearedStatus = await service.getStatusReport({ httpReachable: true });
  assert.equal(clearedStatus.planning_recommendations.review_needed_count, 0);
  assert.equal(clearedStatus.planning_recommendations.top_review_needed_summary, null);

  const clearedWorklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(clearedWorklist.items.some((item) => item.kind === "planning_hygiene_review_needed"), false);

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase14-open-new",
    proposed_title: "Phase 14 open task new evidence",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 14 open task new evidence.",
    dedupe_key: "schedule_task_block:task-phase14-open-new",
    source_fingerprint: "fp-phase14-open-new",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: ["task_unscheduled_due_soon"],
  });

  const reopened = service.getPlanningRecommendationHygieneReport({ review_needed_only: true });
  assert.equal(reopened.families.length, 1);
  assert.equal(reopened.families[0]?.review_needed, true);
  assert.equal(reopened.families[0]?.last_review_decision, "investigate_externalized_workflow");

  const reopenedWorklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(reopenedWorklist.items.some((item) => item.kind === "planning_hygiene_review_needed"), true);
});

test("phase-15 policy proposals add follow-through reporting without mutating recommendations", async () => {
  const now = Date.now();
  const { service } = createFixture();
  const familyTargetId = "urgent_unscheduled_tasks:schedule_task_block:system_generated";

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `task-phase15-closed-${suffix}`,
      proposed_title: `Phase 15 closed task ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 15 closed task ${suffix}.`,
      dedupe_key: `schedule_task_block:task-phase15-closed-${suffix}`,
      source_fingerprint: `fp-phase15-closed-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: ["task_unscheduled_due_soon"],
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase15-open",
    proposed_title: "Phase 15 open task",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 15 open task.",
    dedupe_key: "schedule_task_block:task-phase15-open",
    source_fingerprint: "fp-phase15-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: ["task_unscheduled_due_soon"],
  });

  const trackedRecommendationId = service
    .listPlanningRecommendations({ include_resolved: false })
    .find((recommendation) => recommendation.dedupe_key === "schedule_task_block:task-phase15-open")
    ?.recommendation_id;
  assert.ok(trackedRecommendationId);
  const initialFamily = service.getPlanningRecommendationHygieneReport({ group: "urgent_unscheduled_tasks" }).families[0];
  assert.ok(initialFamily);
  assert.equal(initialFamily.follow_through_state, "review_needed");
  assert.equal(initialFamily.proposal_status, null);

  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Phase 15 review",
  });

  const reviewedFresh = service.getPlanningRecommendationHygieneReport({ group: "urgent_unscheduled_tasks" }).families[0];
  assert.ok(reviewedFresh);
  assert.equal(reviewedFresh.follow_through_state, "reviewed_fresh");
  assert.equal(reviewedFresh.last_review_decision, "investigate_externalized_workflow");

  const rawDb = (service.db as any).db;
  rawDb
    .prepare(
      `UPDATE audit_events
       SET timestamp = ?
       WHERE action = 'planning_recommendation_hygiene_review'
         AND target_type = 'planning_recommendation_family'
         AND target_id = ?`,
    )
    .run("2026-03-12T12:00:00.000Z", familyTargetId);
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET updated_at = ?,
           closed_at = CASE WHEN closed_at IS NOT NULL THEN ? ELSE closed_at END,
           outcome_recorded_at = CASE WHEN outcome_recorded_at IS NOT NULL THEN ? ELSE outcome_recorded_at END,
           resolved_at = CASE WHEN resolved_at IS NOT NULL THEN ? ELSE resolved_at END
       WHERE group_key = 'urgent_unscheduled_tasks'
         AND kind = 'schedule_task_block'
         AND source = 'system_generated'`,
    )
    .run(
      "2026-03-10T12:00:00.000Z",
      "2026-03-10T12:00:00.000Z",
      "2026-03-10T12:00:00.000Z",
      "2026-03-10T12:00:00.000Z",
    );

  const reviewedStale = service.getPlanningRecommendationHygieneReport({ group: "urgent_unscheduled_tasks" }).families[0];
  assert.ok(reviewedStale);
  assert.equal(reviewedStale.follow_through_state, "reviewed_stale");

  const staleWorklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(staleWorklist.items.some((item) => item.kind === "planning_hygiene_followthrough_needed"), true);

  const beforeProposal = service.getPlanningRecommendationDetail(trackedRecommendationId!).recommendation;

  const proposed = service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Track explicit follow-through",
  });
  assert.equal(proposed.proposal_status, "proposed");
  assert.equal(proposed.follow_through_state, "proposal_open");
  assert.equal(proposed.proposal_type, "externalized_workflow_tuning");
  assert.equal(proposed.proposal_note, "Track explicit follow-through");

  const afterProposal = service.getPlanningRecommendationDetail(trackedRecommendationId!).recommendation;
  assert.equal(beforeProposal.updated_at, afterProposal.updated_at);
  assert.equal(beforeProposal.rank_score, afterProposal.rank_score);
  assert.equal(beforeProposal.ranking_version, afterProposal.ranking_version);

  const tuningOpen = service.getPlanningRecommendationTuningReport();
  assert.equal(tuningOpen.proposal_open_count, 1);
  assert.equal(tuningOpen.proposal_stale_count, 0);
  assert.equal(tuningOpen.attention_families[0]?.follow_through_state, "proposal_open");
  const openWorklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(openWorklist.items.some((item) => item.kind === "planning_hygiene_followthrough_needed"), false);

  const proposalId = service.db.listPlanningHygienePolicyProposals()[0]?.proposal_id;
  assert.ok(proposalId);
  rawDb
    .prepare(`UPDATE planning_hygiene_policy_proposals SET updated_at = ? WHERE proposal_id = ?`)
    .run("2026-03-10T12:00:00.000Z", proposalId);

  const staleProposal = service.getPlanningRecommendationHygieneReport({ group: "urgent_unscheduled_tasks" }).families[0];
  assert.ok(staleProposal);
  assert.equal(staleProposal.follow_through_state, "proposal_stale");
  assert.equal(staleProposal.proposal_stale, true);

  const tuningStale = service.getPlanningRecommendationTuningReport();
  assert.equal(tuningStale.proposal_open_count, 0);
  assert.equal(tuningStale.proposal_stale_count, 1);
  assert.equal(tuningStale.attention_families[0]?.follow_through_state, "proposal_stale");

  const staleStatus = await service.getStatusReport({ httpReachable: true });
  assert.equal(staleStatus.planning_recommendations.proposal_stale_count, 1);
  assert.match(staleStatus.planning_recommendations.top_proposal_stale_summary ?? "", /externalized-workflow candidate/i);
});

test("phase-15 status counts only active manual-scheduling recommendations", async () => {
  const now = Date.now();
  const { service } = createFixture();

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "superseded",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase15-historical-manual",
    proposed_title: "Historical manual scheduling item",
    reason_code: "task_schedule_pressure",
    reason_summary: "Historical manual scheduling item.",
    dedupe_key: "schedule_task_block:task-phase15-historical-manual",
    source_fingerprint: "fp-phase15-historical-manual",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "needs_manual_scheduling",
    slot_state_reason: "no_unique_window_after_group_reservation",
    slot_reason: "earliest_free_before_due",
    trigger_signals: ["task_due_soon", "task_high_priority", "task_unscheduled"],
    suppressed_signals: ["task_unscheduled_due_soon"],
    outcome_state: "source_resolved",
    outcome_recorded_at: new Date(now - 60 * 1000).toISOString(),
    closed_at: new Date(now - 60 * 1000).toISOString(),
    close_reason_code: "source_resolved",
    resolved_at: new Date(now - 60 * 1000).toISOString(),
  });

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal(status.planning_recommendations.active_count, 0);
  assert.equal(status.planning_recommendations.manual_scheduling_count, 0);
  assert.equal(status.planning_recommendations.blocked_group_summary, null);
});

test("phase-16 assistant-safe hygiene redacts proposal metadata and hides recent tuning history", () => {
  const now = Date.now();
  const { service } = createFixture();
  const assistantIdentity: ClientIdentity = {
    client_id: "assistant-phase16",
    requested_by: "assistant",
    auth_role: "assistant",
  };

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `task-phase16-redact-closed-${suffix}`,
      proposed_title: `Phase 16 redact closed task ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 16 redact closed task ${suffix}.`,
      dedupe_key: `schedule_task_block:task-phase16-redact-closed-${suffix}`,
      source_fingerprint: `fp-phase16-redact-closed-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: ["task_unscheduled_due_soon"],
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  const tracked = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase16-redact-open",
    proposed_title: "Phase 16 redact open task",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 16 redact open task.",
    dedupe_key: "schedule_task_block:task-phase16-redact-open",
    source_fingerprint: "fp-phase16-redact-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: ["task_unscheduled_due_soon"],
  });

  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Operator review for redaction",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Operator-only proposal detail",
  });

  const operatorHygiene = service.getPlanningRecommendationHygieneReport({ group: "urgent_unscheduled_tasks" });
  assert.equal(operatorHygiene.families[0]?.proposal_note, "Operator-only proposal detail");
  assert.equal(operatorHygiene.families[0]?.proposal_by_client, "operator-cli");
  assert.equal(operatorHygiene.families[0]?.proposal_by_actor, "operator");
  assert.equal(operatorHygiene.families[0]?.last_review_by_client, "operator-cli");
  assert.equal(operatorHygiene.families[0]?.last_review_by_actor, "operator");
  assert.equal(operatorHygiene.families[0]?.last_review_note, "Operator review for redaction");
  assert.match(operatorHygiene.families[0]?.review_summary ?? "", /Operator review for redaction/);

  const assistantHygiene = service.getPlanningRecommendationHygieneReport(
    { group: "urgent_unscheduled_tasks" },
    { assistant_safe: assistantIdentity.auth_role === "assistant" },
  );
  assert.equal(assistantHygiene.families[0]?.last_review_by_client, null);
  assert.equal(assistantHygiene.families[0]?.last_review_by_actor, null);
  assert.equal(assistantHygiene.families[0]?.last_review_note, null);
  assert.match(assistantHygiene.families[0]?.review_summary ?? "", /investigate_externalized_workflow/);
  assert.doesNotMatch(assistantHygiene.families[0]?.review_summary ?? "", /Operator review for redaction/);
  assert.equal(assistantHygiene.families[0]?.proposal_note, null);
  assert.equal(assistantHygiene.families[0]?.proposal_by_client, null);
  assert.equal(assistantHygiene.families[0]?.proposal_by_actor, null);
  assert.equal(assistantHygiene.families[0]?.proposal_status, "proposed");

  const operatorTuning = service.getPlanningRecommendationTuningReport();
  assert.equal(operatorTuning.attention_families.length, 1);
  assert.equal(operatorTuning.attention_families[0]?.follow_through_state, "proposal_open");
  assert.equal(operatorTuning.recently_closed_families.length, 0);

  const assistantTuning = service.getPlanningRecommendationTuningReport({
    assistant_safe: assistantIdentity.auth_role === "assistant",
  });
  assert.equal(assistantTuning.attention_families.length, 1);
  assert.equal(assistantTuning.recently_closed_families.length, 0);

  const rawDb = (service.db as any).db;
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET status = 'superseded',
           outcome_state = 'source_resolved',
           outcome_recorded_at = ?,
           closed_at = ?,
           close_reason_code = 'source_resolved',
           resolved_at = ?,
           updated_at = ?
       WHERE recommendation_id = ?`,
    )
    .run(
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      tracked.recommendation_id,
    );

  const operatorClosedTuning = service.getPlanningRecommendationTuningReport();
  assert.equal(operatorClosedTuning.attention_families.length, 0);
  assert.equal(operatorClosedTuning.recently_closed_families.length, 1);
  assert.equal(
    operatorClosedTuning.recently_closed_families[0]?.last_follow_through_state_before_exit,
    "proposal_open",
  );

  const assistantClosedTuning = service.getPlanningRecommendationTuningReport({
    assistant_safe: assistantIdentity.auth_role === "assistant",
  });
  assert.equal(assistantClosedTuning.recently_closed_families.length, 0);

  const formatted = formatPlanningRecommendationTuningReport(operatorClosedTuning);
  assert.match(formatted, /Attention Families/);
  assert.match(formatted, /Recently Closed Families/);
});

test("phase-16 dismissed proposals stay out of attention until new evidence reopens review-needed state", async () => {
  const now = Date.now();
  const { service } = createFixture();
  const familyTargetId = "urgent_unscheduled_tasks:schedule_task_block:system_generated";

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `task-phase16-dismissed-closed-${suffix}`,
      proposed_title: `Phase 16 dismissed closed task ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 16 dismissed closed task ${suffix}.`,
      dedupe_key: `schedule_task_block:task-phase16-dismissed-closed-${suffix}`,
      source_fingerprint: `fp-phase16-dismissed-closed-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: ["task_unscheduled_due_soon"],
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase16-dismissed-open",
    proposed_title: "Phase 16 dismissed open task",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 16 dismissed open task.",
    dedupe_key: "schedule_task_block:task-phase16-dismissed-open",
    source_fingerprint: "fp-phase16-dismissed-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: ["task_unscheduled_due_soon"],
  });

  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Dismissed proposal review",
  });
  const dismissed = service.dismissPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Dismiss for now",
  });
  assert.equal(dismissed.follow_through_state, "proposal_dismissed");

  const dismissedTuning = service.getPlanningRecommendationTuningReport();
  assert.equal(dismissedTuning.proposal_dismissed_count, 1);
  assert.equal(dismissedTuning.attention_families.length, 0);

  const dismissedWorklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(dismissedWorklist.items.some((item) => item.kind === "planning_hygiene_followthrough_needed"), false);

  const rawDb = (service.db as any).db;
  rawDb
    .prepare(
      `UPDATE audit_events
       SET timestamp = ?
       WHERE action = 'planning_recommendation_hygiene_review'
         AND target_type = 'planning_recommendation_family'
         AND target_id = ?`,
    )
    .run("2026-03-10T12:00:00.000Z", familyTargetId);
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET updated_at = ?
       WHERE group_key = 'urgent_unscheduled_tasks'
         AND kind = 'schedule_task_block'
         AND source = 'system_generated'
         AND status = 'pending'`,
    )
    .run("2026-03-24T12:00:00.000Z");

  const reopened = service.getPlanningRecommendationHygieneReport({ group: "urgent_unscheduled_tasks" }).families[0];
  assert.equal(reopened?.follow_through_state, "review_needed");

  const reopenedTuning = service.getPlanningRecommendationTuningReport();
  assert.equal(reopenedTuning.attention_families[0]?.follow_through_state, "review_needed");
  assert.equal(reopenedTuning.proposal_dismissed_count, 0);

  const reopenedWorklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(reopenedWorklist.items.some((item) => item.kind === "planning_hygiene_followthrough_needed"), true);
});

test("phase-17 policy report separates active backlog from archived and superseded history", () => {
  const now = Date.now();
  const { service } = createFixture();
  const rawDb = (service.db as any).db;

  const createClosedFamilyRows = (
    kind: "schedule_task_block" | "schedule_thread_followup" | "schedule_event_prep",
    groupKey: "urgent_unscheduled_tasks" | "urgent_inbox_followups" | "near_term_meeting_prep",
    outcomeState: "handled_elsewhere" | "source_resolved",
    prefix: string,
    source: "system_generated" | "assistant_created" = "system_generated",
  ) => {
    for (const suffix of ["a", "b", "c"]) {
      service.db.createPlanningRecommendation(cliIdentity, {
        kind,
        status: outcomeState === "handled_elsewhere" ? "rejected" : "superseded",
        priority: "high",
        source,
        source_task_id: kind === "schedule_task_block" ? `${prefix}-task-${suffix}` : undefined,
        source_thread_id: kind === "schedule_thread_followup" ? `${prefix}-thread-${suffix}` : undefined,
        source_calendar_event_id: kind === "schedule_event_prep" ? `${prefix}-event-${suffix}` : undefined,
        proposed_title: `${prefix} closed ${suffix}`,
        reason_code: prefix,
        reason_summary: `${prefix} closed ${suffix}.`,
        dedupe_key: `${kind}:${prefix}-${suffix}`,
        source_fingerprint: `${prefix}-fp-${suffix}`,
        group_key: groupKey,
        group_summary: `${prefix} summary`,
        outcome_state: outcomeState,
        outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        first_action_type: outcomeState === "handled_elsewhere" ? "reject" : "apply",
        closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        close_reason_code:
          outcomeState === "handled_elsewhere" ? "rejected_handled_elsewhere" : "source_resolved",
        slot_state: "ready",
        trigger_signals: [prefix],
        suppressed_signals: [],
        resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      });
    }
  };

  createClosedFamilyRows("schedule_task_block", "urgent_unscheduled_tasks", "handled_elsewhere", "phase17-active");
  const activeRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "phase17-active-open",
    proposed_title: "Phase 17 active policy family",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 17 active policy family.",
    dedupe_key: "schedule_task_block:phase17-active-open",
    source_fingerprint: "phase17-active-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
  });
  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Track the active policy family",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Keep this active proposal visible",
  });

  createClosedFamilyRows("schedule_thread_followup", "urgent_inbox_followups", "handled_elsewhere", "phase17-archived");
  const archivedRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_thread_id: "phase17-archived-open",
    proposed_title: "Phase 17 archived policy family",
    reason_code: "needs_reply",
    reason_summary: "Phase 17 archived policy family.",
    dedupe_key: "schedule_thread_followup:phase17-archived-open",
    source_fingerprint: "phase17-archived-open",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
  });
  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_inbox_followups",
    kind: "schedule_thread_followup",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Prepare this family for archive",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_inbox_followups",
    kind: "schedule_thread_followup",
    source: "system_generated",
    note: "Archive after it leaves the queue",
  });

  createClosedFamilyRows("schedule_event_prep", "near_term_meeting_prep", "source_resolved", "phase17-superseded");
  const supersededRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_event_prep",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_calendar_event_id: "phase17-superseded-open",
    proposed_title: "Phase 17 superseded policy family",
    reason_code: "event_prep_warning",
    reason_summary: "Phase 17 superseded policy family.",
    dedupe_key: "schedule_event_prep:phase17-superseded-open",
    source_fingerprint: "phase17-superseded-open",
    group_key: "near_term_meeting_prep",
    group_summary: "1 meeting prep block is recommended soon",
    slot_state: "ready",
    trigger_signals: ["event_prep_warning"],
    suppressed_signals: [],
  });
  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    decision: "investigate_source_suppression",
    note: "Prepare this family for supersede",
  });
  service.dismissPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    note: "Dismiss this family for now",
  });

  createClosedFamilyRows(
    "schedule_thread_followup",
    "urgent_inbox_followups",
    "handled_elsewhere",
    "phase17-no-proposal",
    "assistant_created",
  );

  for (const recommendationId of [archivedRecommendation.recommendation_id, supersededRecommendation.recommendation_id]) {
    rawDb
      .prepare(
        `UPDATE planning_recommendations
         SET status = 'superseded',
             outcome_state = 'source_resolved',
             outcome_recorded_at = ?,
             closed_at = ?,
             close_reason_code = 'source_resolved',
             resolved_at = ?,
             updated_at = ?
         WHERE recommendation_id = ?`,
      )
      .run(
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        recommendationId,
      );
  }

  const archivedHistory = service.archivePlanningRecommendationPolicy(cliIdentity, {
    group: "urgent_inbox_followups",
    kind: "schedule_thread_followup",
    source: "system_generated",
    note: "Archive the inactive workflow tuning idea",
  });
  const supersededHistory = service.supersedePlanningRecommendationPolicy(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    note: "Superseded by newer meeting-prep guidance",
  });

  assert.equal(archivedHistory.governance_event_type, "policy_archived");
  assert.equal(supersededHistory.governance_event_type, "policy_superseded");

  const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  assert.equal(policyReport.active_proposed_count, 1);
  assert.equal(policyReport.active_dismissed_for_now_count, 0);
  assert.equal(policyReport.archived_count, 1);
  assert.equal(policyReport.superseded_count, 1);
  assert.equal(policyReport.active_policy_backlog.length, 1);
  assert.equal(policyReport.active_policy_backlog[0]?.follow_through_state, "proposal_open");
  assert.equal(policyReport.active_policy_backlog[0]?.group_key, "urgent_unscheduled_tasks");
  assert.equal(policyReport.policy_history_recent_events.length, 2);
  assert.equal(
    policyReport.policy_history_recent_events.some((item) => item.governance_event_type === "policy_archived"),
    true,
  );
  assert.equal(
    policyReport.policy_history_recent_events.some((item) => item.governance_event_type === "policy_superseded"),
    true,
  );
  assert.match(policyReport.top_archived_summary ?? "", /archived/i);
  assert.match(policyReport.top_superseded_summary ?? "", /superseded/i);

  const tuning = service.getPlanningRecommendationTuningReport();
  assert.equal(tuning.proposal_open_count, 1);
  assert.equal(tuning.proposal_dismissed_count, 0);
  assert.equal(tuning.attention_families.every((family) => family.group_key === "urgent_unscheduled_tasks"), true);

  assert.throws(
    () =>
      service.archivePlanningRecommendationPolicy(cliIdentity, {
        group: "urgent_inbox_followups",
        kind: "schedule_thread_followup",
        source: "assistant_created",
        note: "Missing explicit proposal should fail",
      }),
    /explicit planning hygiene proposal is required/i,
  );
  assert.throws(
    () =>
      service.archivePlanningRecommendationPolicy(cliIdentity, {
        group: "urgent_unscheduled_tasks",
        kind: "schedule_task_block",
        source: "system_generated",
        note: "Should fail while active",
      }),
    /inactive planning policy families/i,
  );
  assert.throws(
    () =>
      service.supersedePlanningRecommendationPolicy(cliIdentity, {
        group: "near_term_meeting_prep",
        kind: "schedule_event_prep",
        source: "system_generated",
      }),
    /note is required/i,
  );

  const formatted = formatPlanningRecommendationPolicyReport(policyReport);
  assert.match(formatted, /Active Policy Backlog/);
  assert.match(formatted, /Policy History/);
  assert.match(formatted, /policy_archived/);
  assert.match(formatted, /policy_superseded/);
  assert.ok(activeRecommendation.recommendation_id);
});

test("phase-17 planning detail keeps policy audit history for operators and redacts it for assistants", () => {
  const now = Date.now();
  const { service } = createFixture();
  const rawDb = (service.db as any).db;

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `phase17-detail-closed-${suffix}`,
      proposed_title: `Phase 17 detail closed ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 17 detail closed ${suffix}.`,
      dedupe_key: `schedule_task_block:phase17-detail-closed-${suffix}`,
      source_fingerprint: `phase17-detail-closed-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  const recommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "phase17-detail-open",
    proposed_title: "Phase 17 detail open task",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 17 detail open task.",
    dedupe_key: "schedule_task_block:phase17-detail-open",
    source_fingerprint: "phase17-detail-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
  });

  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Operator-only review note",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Operator-only proposal note",
  });

  const operatorActiveDetail = service.getPlanningRecommendationDetail(recommendation.recommendation_id);
  assert.equal(
    operatorActiveDetail.related_audit_events.some((event) => event.action === "planning_recommendation_hygiene_review"),
    true,
  );
  assert.equal(
    operatorActiveDetail.related_audit_events.some(
      (event) => event.action === "planning_recommendation_hygiene_proposal_recorded",
    ),
    true,
  );

  const assistantActiveDetail = service.getPlanningRecommendationDetail(recommendation.recommendation_id, {
    assistant_safe: true,
  });
  assert.equal(
    assistantActiveDetail.related_audit_events.some((event) => event.action === "planning_recommendation_hygiene_review"),
    false,
  );
  assert.equal(
    assistantActiveDetail.related_audit_events.some(
      (event) => event.action === "planning_recommendation_hygiene_proposal_recorded",
    ),
    false,
  );

  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET status = 'superseded',
           outcome_state = 'source_resolved',
           outcome_recorded_at = ?,
           closed_at = ?,
           close_reason_code = 'source_resolved',
           resolved_at = ?,
           updated_at = ?
       WHERE recommendation_id = ?`,
    )
    .run(
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      recommendation.recommendation_id,
    );

  service.archivePlanningRecommendationPolicy(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Archive the inactive detail family",
  });

  const operatorClosedDetail = service.getPlanningRecommendationDetail(recommendation.recommendation_id);
  assert.equal(
    operatorClosedDetail.related_audit_events.some((event) => event.action === "planning_recommendation_policy_archived"),
    true,
  );

  const assistantClosedDetail = service.getPlanningRecommendationDetail(recommendation.recommendation_id, {
    assistant_safe: true,
  });
  assert.equal(
    assistantClosedDetail.related_audit_events.some((event) => event.action === "planning_recommendation_policy_archived"),
    false,
  );
});

test("phase-11 http planning analytics reads stay available to assistants", async () => {
  const now = Date.now();
  const { service, config, policy } = createFixture();
  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "rejected",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-phase11-http",
    proposed_title: "Closure analytics",
    reason_code: "needs_reply",
    reason_summary: "Closure analytics.",
    dedupe_key: "schedule_thread_followup:thread-phase11-http",
    source_fingerprint: "fp-phase11-http",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    outcome_state: "handled_elsewhere",
    outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
    first_action_at: new Date(now - 60 * 60 * 1000).toISOString(),
    first_action_type: "reject",
    closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
    close_reason_code: "rejected_handled_elsewhere",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
    resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
  });
  for (const suffix of ["b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_thread_followup",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_thread_id: `thread-phase11-http-${suffix}`,
      proposed_title: `Closure analytics ${suffix}`,
      reason_code: "needs_reply",
      reason_summary: `Closure analytics ${suffix}.`,
      dedupe_key: `schedule_thread_followup:thread-phase11-http-${suffix}`,
      source_fingerprint: `fp-phase11-http-${suffix}`,
      group_key: "urgent_inbox_followups",
      group_summary: "1 urgent inbox follow-up could be time-blocked",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["needs_reply"],
      suppressed_signals: [],
      resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
    });
  }
  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_thread_followup",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_thread_id: "thread-phase11-http-open",
    proposed_title: "Open hygiene analytics",
    reason_code: "needs_reply",
    reason_summary: "Open hygiene analytics.",
    dedupe_key: "schedule_thread_followup:thread-phase11-http-open",
    source_fingerprint: "fp-phase11-http-open",
    group_key: "urgent_inbox_followups",
    group_summary: "1 urgent inbox follow-up could be time-blocked",
    slot_state: "ready",
    trigger_signals: ["needs_reply"],
    suppressed_signals: [],
  });

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const summaryResponse = await fetch(`${baseUrl}/v1/planning-recommendations/summary`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase11-http-test",
      },
    });
    assert.equal(summaryResponse.status, 200);
    const summaryPayload = (await summaryResponse.json()) as {
      planning_recommendation_summary?: { closed_last_30d: number };
    };
    assert.equal(summaryPayload.planning_recommendation_summary?.closed_last_30d, 3);

    const backlogResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/backlog?group=${encodeURIComponent("urgent_inbox_followups")}&source=system_generated&manual_only=true`,
      {
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "x-personal-ops-client": "phase11-http-test",
        },
      },
    );
    assert.equal(backlogResponse.status, 200);
    const backlogPayload = (await backlogResponse.json()) as {
      planning_recommendation_backlog?: { filters: { manual_only: boolean; source?: string } };
    };
    assert.equal(backlogPayload.planning_recommendation_backlog?.filters.manual_only, true);
    assert.equal(backlogPayload.planning_recommendation_backlog?.filters.source, "system_generated");

    const closureResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/closure?days=30&source=system_generated&close_reason=rejected_handled_elsewhere`,
      {
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "x-personal-ops-client": "phase11-http-test",
        },
      },
    );
    assert.equal(closureResponse.status, 200);
    const closurePayload = (await closureResponse.json()) as {
      planning_recommendation_closure?: {
        filters: { source?: string; close_reason?: string };
        totals: { handled_elsewhere_count: number };
      };
    };
    assert.equal(closurePayload.planning_recommendation_closure?.filters.source, "system_generated");
    assert.equal(
      closurePayload.planning_recommendation_closure?.filters.close_reason,
      "rejected_handled_elsewhere",
    );
    assert.equal(closurePayload.planning_recommendation_closure?.totals.handled_elsewhere_count, 3);

    const hygieneResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/hygiene?group=urgent_inbox_followups&candidate_only=true`,
      {
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "x-personal-ops-client": "phase11-http-test",
        },
      },
    );
    assert.equal(hygieneResponse.status, 200);
    const hygienePayload = (await hygieneResponse.json()) as {
      planning_recommendation_hygiene?: {
        filters: { group?: string; candidate_only?: boolean };
        families: Array<{ recommended_action: string }>;
      };
    };
    assert.equal(hygienePayload.planning_recommendation_hygiene?.filters.group, "urgent_inbox_followups");
    assert.equal(hygienePayload.planning_recommendation_hygiene?.filters.candidate_only, true);
    assert.equal(hygienePayload.planning_recommendation_hygiene?.families.length, 1);
    assert.equal(
      hygienePayload.planning_recommendation_hygiene?.families[0]?.recommended_action,
      "review_externalized_workflow",
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-14 http hygiene review stays operator-only while review-needed reads stay assistant-safe", async () => {
  const now = Date.now();
  const { service, config, policy } = createFixture();

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `task-phase14-http-closed-${suffix}`,
      proposed_title: `Phase 14 HTTP closed task ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 14 HTTP closed task ${suffix}.`,
      dedupe_key: `schedule_task_block:task-phase14-http-closed-${suffix}`,
      source_fingerprint: `fp-phase14-http-closed-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 90 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: ["task_unscheduled_due_soon"],
      resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
    });
  }

  service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase14-http-open",
    proposed_title: "Phase 14 HTTP open task",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 14 HTTP open task.",
    dedupe_key: "schedule_task_block:task-phase14-http-open",
    source_fingerprint: "fp-phase14-http-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: ["task_unscheduled_due_soon"],
  });

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const hygieneResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/hygiene?group=urgent_unscheduled_tasks&review_needed_only=true`,
      {
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "x-personal-ops-client": "phase14-http-test",
        },
      },
    );
    assert.equal(hygieneResponse.status, 200);
    const hygienePayload = (await hygieneResponse.json()) as {
      planning_recommendation_hygiene?: {
        filters: { group?: string; review_needed_only?: boolean };
        families: Array<{ review_needed: boolean; recommended_action: string }>;
      };
    };
    assert.equal(hygienePayload.planning_recommendation_hygiene?.filters.group, "urgent_unscheduled_tasks");
    assert.equal(hygienePayload.planning_recommendation_hygiene?.filters.review_needed_only, true);
    assert.equal(hygienePayload.planning_recommendation_hygiene?.families.length, 1);
    assert.equal(hygienePayload.planning_recommendation_hygiene?.families[0]?.review_needed, true);
    assert.equal(
      hygienePayload.planning_recommendation_hygiene?.families[0]?.recommended_action,
      "review_externalized_workflow",
    );

    const assistantReviewResponse = await fetch(`${baseUrl}/v1/planning-recommendations/hygiene/review`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase14-http-test",
      },
      body: JSON.stringify({
        group: "urgent_unscheduled_tasks",
        kind: "schedule_task_block",
        source: "system_generated",
        decision: "investigate_externalized_workflow",
        note: "Assistant should not be allowed",
      }),
    });
    assert.equal(assistantReviewResponse.status, 400);
    const assistantReviewPayload = (await assistantReviewResponse.json()) as { error?: string };
    assert.match(assistantReviewPayload.error ?? "", /operator channel/i);

    const operatorReviewResponse = await fetch(`${baseUrl}/v1/planning-recommendations/hygiene/review`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase14-http-test",
        "x-personal-ops-requested-by": "operator-http",
      },
      body: JSON.stringify({
        group: "urgent_unscheduled_tasks",
        kind: "schedule_task_block",
        source: "system_generated",
        decision: "investigate_externalized_workflow",
        note: "HTTP review",
      }),
    });
    assert.equal(operatorReviewResponse.status, 200);
    const operatorReviewPayload = (await operatorReviewResponse.json()) as {
      planning_recommendation_hygiene_family?: {
        review_needed: boolean;
        last_review_decision?: string;
        last_review_by_client?: string;
        last_review_by_actor?: string;
      };
    };
    assert.equal(operatorReviewPayload.planning_recommendation_hygiene_family?.review_needed, false);
    assert.equal(
      operatorReviewPayload.planning_recommendation_hygiene_family?.last_review_decision,
      "investigate_externalized_workflow",
    );
    assert.equal(operatorReviewPayload.planning_recommendation_hygiene_family?.last_review_by_client, "phase14-http-test");
    assert.equal(operatorReviewPayload.planning_recommendation_hygiene_family?.last_review_by_actor, "operator-http");

    const reviewedHygieneResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/hygiene?group=urgent_unscheduled_tasks&review_needed_only=true`,
      {
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "x-personal-ops-client": "phase14-http-test",
        },
      },
    );
    assert.equal(reviewedHygieneResponse.status, 200);
    const reviewedHygienePayload = (await reviewedHygieneResponse.json()) as {
      planning_recommendation_hygiene?: { families: unknown[] };
    };
    assert.equal(reviewedHygienePayload.planning_recommendation_hygiene?.families.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-15 http tuning reads stay assistant-safe while proposal mutation stays operator-only", async () => {
  const now = Date.now();
  const { service, config, policy } = createFixture();

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `task-phase15-http-closed-${suffix}`,
      proposed_title: `Phase 15 HTTP closed task ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 15 HTTP closed task ${suffix}.`,
      dedupe_key: `schedule_task_block:task-phase15-http-closed-${suffix}`,
      source_fingerprint: `fp-phase15-http-closed-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 90 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: ["task_unscheduled_due_soon"],
      resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
    });
  }

  const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase15-http-open",
    proposed_title: "Phase 15 HTTP open task",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 15 HTTP open task.",
    dedupe_key: "schedule_task_block:task-phase15-http-open",
    source_fingerprint: "fp-phase15-http-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: ["task_unscheduled_due_soon"],
  });

  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Phase 15 HTTP review",
  });

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const assistantTuningResponse = await fetch(`${baseUrl}/v1/planning-recommendations/tuning`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase15-http-test",
      },
    });
    assert.equal(assistantTuningResponse.status, 200);
    const assistantTuningPayload = (await assistantTuningResponse.json()) as {
      planning_recommendation_tuning?: { reviewed_fresh_count: number };
    };
    assert.equal(assistantTuningPayload.planning_recommendation_tuning?.reviewed_fresh_count, 1);

    const assistantRecordResponse = await fetch(`${baseUrl}/v1/planning-recommendations/hygiene/proposals/record`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase15-http-test",
      },
      body: JSON.stringify({
        group: "urgent_unscheduled_tasks",
        kind: "schedule_task_block",
        source: "system_generated",
        note: "Assistant should not record proposals",
      }),
    });
    assert.equal(assistantRecordResponse.status, 400);
    const assistantRecordPayload = (await assistantRecordResponse.json()) as { error?: string };
    assert.match(assistantRecordPayload.error ?? "", /operator channel/i);

    const operatorRecordResponse = await fetch(`${baseUrl}/v1/planning-recommendations/hygiene/proposals/record`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase15-http-test",
        "x-personal-ops-requested-by": "operator-http",
      },
      body: JSON.stringify({
        group: "urgent_unscheduled_tasks",
        kind: "schedule_task_block",
        source: "system_generated",
        note: "HTTP proposal",
      }),
    });
    assert.equal(operatorRecordResponse.status, 200);
    const operatorRecordPayload = (await operatorRecordResponse.json()) as {
      planning_recommendation_hygiene_family?: {
        proposal_status?: string;
        follow_through_state?: string;
        proposal_by_client?: string;
        proposal_by_actor?: string;
      };
    };
    assert.equal(operatorRecordPayload.planning_recommendation_hygiene_family?.proposal_status, "proposed");
    assert.equal(operatorRecordPayload.planning_recommendation_hygiene_family?.follow_through_state, "proposal_open");
    assert.equal(operatorRecordPayload.planning_recommendation_hygiene_family?.proposal_by_client, "phase15-http-test");
    assert.equal(operatorRecordPayload.planning_recommendation_hygiene_family?.proposal_by_actor, "operator-http");

    const assistantHygieneResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/hygiene?group=urgent_unscheduled_tasks`,
      {
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "x-personal-ops-client": "phase15-http-test",
        },
      },
    );
    assert.equal(assistantHygieneResponse.status, 200);
    const assistantHygienePayload = (await assistantHygieneResponse.json()) as {
      planning_recommendation_hygiene?: {
        families: Array<{
          last_review_by_client?: string | null;
          last_review_by_actor?: string | null;
          last_review_note?: string | null;
          review_summary?: string | null;
          proposal_status?: string;
          proposal_note?: string | null;
          proposal_by_client?: string | null;
          proposal_by_actor?: string | null;
        }>;
      };
    };
    assert.equal(assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.last_review_by_client, null);
    assert.equal(assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.last_review_by_actor, null);
    assert.equal(assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.last_review_note, null);
    assert.match(
      assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.review_summary ?? "",
      /investigate_externalized_workflow/,
    );
    assert.doesNotMatch(
      assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.review_summary ?? "",
      /Phase 15 HTTP review/,
    );
    assert.equal(assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.proposal_status, "proposed");
    assert.equal(assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.proposal_note, null);
    assert.equal(assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.proposal_by_client, null);
    assert.equal(assistantHygienePayload.planning_recommendation_hygiene?.families[0]?.proposal_by_actor, null);

    const operatorDismissResponse = await fetch(`${baseUrl}/v1/planning-recommendations/hygiene/proposals/dismiss`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase15-http-test",
        "x-personal-ops-requested-by": "operator-http",
      },
      body: JSON.stringify({
        group: "urgent_unscheduled_tasks",
        kind: "schedule_task_block",
        source: "system_generated",
        note: "HTTP dismiss",
      }),
    });
    assert.equal(operatorDismissResponse.status, 200);
    const operatorDismissPayload = (await operatorDismissResponse.json()) as {
      planning_recommendation_hygiene_family?: {
        proposal_status?: string;
        follow_through_state?: string;
      };
    };
    assert.equal(operatorDismissPayload.planning_recommendation_hygiene_family?.proposal_status, "dismissed");
    assert.equal(operatorDismissPayload.planning_recommendation_hygiene_family?.follow_through_state, "proposal_dismissed");

    const reviewedTuningResponse = await fetch(`${baseUrl}/v1/planning-recommendations/tuning`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase15-http-test",
      },
    });
    assert.equal(reviewedTuningResponse.status, 200);
    const reviewedTuningPayload = (await reviewedTuningResponse.json()) as {
      planning_recommendation_tuning?: {
        proposal_dismissed_count: number;
        proposal_open_count: number;
        recently_closed_families?: unknown[];
      };
    };
    assert.equal(reviewedTuningPayload.planning_recommendation_tuning?.proposal_open_count, 0);
    assert.equal(reviewedTuningPayload.planning_recommendation_tuning?.proposal_dismissed_count, 1);
    assert.equal(reviewedTuningPayload.planning_recommendation_tuning?.recently_closed_families?.length, 0);

    const rawDb = (service.db as any).db;
    rawDb
      .prepare(
        `UPDATE planning_recommendations
         SET status = 'superseded',
             outcome_state = 'source_resolved',
             outcome_recorded_at = ?,
             closed_at = ?,
             close_reason_code = 'source_resolved',
             resolved_at = ?,
             updated_at = ?
         WHERE recommendation_id = ?`,
      )
      .run(
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        openRecommendation.recommendation_id,
      );

    const operatorHistoryResponse = await fetch(`${baseUrl}/v1/planning-recommendations/tuning`, {
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "x-personal-ops-client": "phase15-http-test",
      },
    });
    assert.equal(operatorHistoryResponse.status, 200);
    const operatorHistoryPayload = (await operatorHistoryResponse.json()) as {
      planning_recommendation_tuning?: { recently_closed_families?: Array<{ final_proposal_status?: string | null }> };
    };
    assert.equal(operatorHistoryPayload.planning_recommendation_tuning?.recently_closed_families?.length, 1);
    assert.equal(
      operatorHistoryPayload.planning_recommendation_tuning?.recently_closed_families?.[0]?.final_proposal_status,
      "dismissed",
    );

    const assistantHistoryResponse = await fetch(`${baseUrl}/v1/planning-recommendations/tuning`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase15-http-test",
      },
    });
    assert.equal(assistantHistoryResponse.status, 200);
    const assistantHistoryPayload = (await assistantHistoryResponse.json()) as {
      planning_recommendation_tuning?: { recently_closed_families?: unknown[] };
    };
    assert.equal(assistantHistoryPayload.planning_recommendation_tuning?.recently_closed_families?.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-17 http policy reads stay operator-only while assistant-safe detail redacts policy history", async () => {
  const now = Date.now();
  const { service, config, policy } = createFixture();

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `task-phase17-http-closed-${suffix}`,
      proposed_title: `Phase 17 HTTP closed task ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 17 HTTP closed task ${suffix}.`,
      dedupe_key: `schedule_task_block:task-phase17-http-closed-${suffix}`,
      source_fingerprint: `fp-phase17-http-closed-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 90 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
      resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
    });
  }

  const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "task-phase17-http-open",
    proposed_title: "Phase 17 HTTP open task",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 17 HTTP open task.",
    dedupe_key: "schedule_task_block:task-phase17-http-open",
    source_fingerprint: "fp-phase17-http-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
  });

  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "HTTP operator review",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "HTTP operator proposal",
  });

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const operatorDetailResponse = await fetch(`${baseUrl}/v1/planning-recommendations/${openRecommendation.recommendation_id}`, {
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "x-personal-ops-client": "phase17-http-test",
      },
    });
    assert.equal(operatorDetailResponse.status, 200);
    const operatorDetailPayload = (await operatorDetailResponse.json()) as {
      planning_recommendation?: { related_audit_events?: Array<{ action?: string }> };
    };
    assert.equal(
      operatorDetailPayload.planning_recommendation?.related_audit_events?.some(
        (event) => event.action === "planning_recommendation_hygiene_review",
      ),
      true,
    );
    assert.equal(
      operatorDetailPayload.planning_recommendation?.related_audit_events?.some(
        (event) => event.action === "planning_recommendation_hygiene_proposal_recorded",
      ),
      true,
    );

    const assistantDetailResponse = await fetch(`${baseUrl}/v1/planning-recommendations/${openRecommendation.recommendation_id}`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase17-http-test",
      },
    });
    assert.equal(assistantDetailResponse.status, 200);
    const assistantDetailPayload = (await assistantDetailResponse.json()) as {
      planning_recommendation?: { related_audit_events?: Array<{ action?: string }> };
    };
    assert.equal(
      assistantDetailPayload.planning_recommendation?.related_audit_events?.some(
        (event) => event.action === "planning_recommendation_hygiene_review",
      ),
      false,
    );
    assert.equal(
      assistantDetailPayload.planning_recommendation?.related_audit_events?.some(
        (event) => event.action === "planning_recommendation_hygiene_proposal_recorded",
      ),
      false,
    );

    const rawDb = (service.db as any).db;
    rawDb
      .prepare(
        `UPDATE planning_recommendations
         SET status = 'superseded',
             outcome_state = 'source_resolved',
             outcome_recorded_at = ?,
             closed_at = ?,
             close_reason_code = 'source_resolved',
             resolved_at = ?,
             updated_at = ?
         WHERE recommendation_id = ?`,
      )
      .run(
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        openRecommendation.recommendation_id,
      );

    const assistantPolicyResponse = await fetch(`${baseUrl}/v1/planning-recommendations/policy`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase17-http-test",
      },
    });
    assert.equal(assistantPolicyResponse.status, 400);
    const assistantPolicyPayload = (await assistantPolicyResponse.json()) as { error?: string };
    assert.match(assistantPolicyPayload.error ?? "", /operator channel/i);

    const operatorArchiveResponse = await fetch(`${baseUrl}/v1/planning-recommendations/policy/archive`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase17-http-test",
        "x-personal-ops-requested-by": "operator-http",
      },
      body: JSON.stringify({
        group: "urgent_unscheduled_tasks",
        kind: "schedule_task_block",
        source: "system_generated",
        note: "Archive the HTTP policy family",
      }),
    });
    assert.equal(operatorArchiveResponse.status, 200);
    const operatorArchivePayload = (await operatorArchiveResponse.json()) as {
      planning_recommendation_policy?: {
        archived_count?: number;
        policy_history_recent_events?: Array<{ governance_event_type?: string }>;
      };
    };
    assert.equal(operatorArchivePayload.planning_recommendation_policy?.archived_count, 1);
    assert.equal(
      operatorArchivePayload.planning_recommendation_policy?.policy_history_recent_events?.[0]?.governance_event_type,
      "policy_archived",
    );

    const assistantClosedDetailResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/${openRecommendation.recommendation_id}`,
      {
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "x-personal-ops-client": "phase17-http-test",
        },
      },
    );
    assert.equal(assistantClosedDetailResponse.status, 200);
    const assistantClosedDetailPayload = (await assistantClosedDetailResponse.json()) as {
      planning_recommendation?: { related_audit_events?: Array<{ action?: string }> };
    };
    assert.equal(
      assistantClosedDetailPayload.planning_recommendation?.related_audit_events?.some(
        (event) => event.action === "planning_recommendation_policy_archived",
      ),
      false,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-18 assistant-safe audit reads omit sensitive events and sanitize visible metadata", () => {
  const { service } = createFixture();
  const task = service.createTask(cliIdentity, {
    title: "Phase 18 audit task",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
  });
  service.completeTask(cliIdentity, task.task_id, "Operator-only completion note");
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "mailbox_sync",
    target_type: "mail_sync_state",
    target_id: "machine@example.com",
    outcome: "success",
    metadata: {
      mailbox: "machine@example.com",
      sync_result: {
        messages_refreshed: 4,
        messages_deleted: 1,
        threads_recomputed: 2,
        duration_ms: 99,
      },
      stats: {
        unread_thread_count: 3,
      },
    },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "planning_recommendation_policy_archived",
    target_type: "planning_recommendation_family",
    target_id: "urgent_unscheduled_tasks:schedule_task_block:system_generated",
    outcome: "success",
    metadata: {
      note: "Hide this operator-only policy action",
    },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "future_sensitive_action",
    target_type: "system",
    target_id: "future",
    outcome: "success",
    metadata: {
      note: "Unknown actions should be hidden",
    },
  });

  const operatorEvents = service.listAuditEvents({ limit: 20 });
  assert.equal(operatorEvents.some((event) => event.action === "planning_recommendation_policy_archived"), true);
  assert.equal(operatorEvents.some((event) => event.action === "future_sensitive_action"), true);

  const assistantEvents = service.listAuditEvents({ limit: 20 }, { assistant_safe: true });
  assert.equal(assistantEvents.some((event) => event.action === "planning_recommendation_policy_archived"), false);
  assert.equal(assistantEvents.some((event) => event.action === "future_sensitive_action"), false);

  const createEvent = assistantEvents.find((event) => event.action === "task_create");
  assert.ok(createEvent);
  assert.equal(createEvent.metadata_redacted, true);
  assert.equal(createEvent.summary, "Task created.");
  const createMetadata = JSON.parse(createEvent.metadata_json) as Record<string, unknown>;
  assert.equal("title" in createMetadata, false);
  assert.equal(createMetadata.kind, "human_reminder");
  assert.equal(createMetadata.priority, "high");

  const completeEvent = assistantEvents.find((event) => event.action === "task_complete");
  assert.ok(completeEvent);
  assert.equal(completeEvent.summary, "Task completed.");
  const completeMetadata = JSON.parse(completeEvent.metadata_json) as Record<string, unknown>;
  assert.deepEqual(completeMetadata, {});

  const syncEvent = assistantEvents.find((event) => event.action === "mailbox_sync");
  assert.ok(syncEvent);
  assert.match(syncEvent.summary ?? "", /Mailbox sync succeeded/i);
  const syncMetadata = JSON.parse(syncEvent.metadata_json) as {
    sync_result?: { messages_refreshed?: number; messages_deleted?: number; threads_recomputed?: number; duration_ms?: number };
    mailbox?: string;
  };
  assert.equal(syncMetadata.mailbox, undefined);
  assert.equal(syncMetadata.sync_result?.messages_refreshed, 4);
  assert.equal(syncMetadata.sync_result?.messages_deleted, 1);
});

test("phase-18 policy report adds recent exits and retention candidates and prune deletes governance history only", async () => {
  const now = Date.now();
  const { service } = createFixture();
  const rawDb = (service.db as any).db;

  const createPolicyFamily = (
    prefix: string,
    kind: "schedule_task_block" | "schedule_thread_followup" | "schedule_event_prep",
    groupKey: "urgent_unscheduled_tasks" | "urgent_inbox_followups" | "near_term_meeting_prep",
    reviewDecision: "investigate_externalized_workflow" | "investigate_source_suppression",
    proposalStatus: "proposed" | "dismissed" = "proposed",
  ) => {
    const createClosedRows = () => {
      for (const suffix of ["a", "b", "c"]) {
        service.db.createPlanningRecommendation(cliIdentity, {
          kind,
          status: "rejected",
          priority: "high",
          source: "system_generated",
          source_task_id: kind === "schedule_task_block" ? `${prefix}-task-${suffix}` : undefined,
          source_thread_id: kind === "schedule_thread_followup" ? `${prefix}-thread-${suffix}` : undefined,
          source_calendar_event_id: kind === "schedule_event_prep" ? `${prefix}-event-${suffix}` : undefined,
          proposed_title: `${prefix} closed ${suffix}`,
          reason_code:
            kind === "schedule_task_block"
              ? "task_schedule_pressure"
              : kind === "schedule_thread_followup"
                ? "needs_reply"
                : "event_prep_warning",
          reason_summary: `${prefix} closed ${suffix}.`,
          dedupe_key: `${kind}:${prefix}-${suffix}`,
          source_fingerprint: `${prefix}-fp-${suffix}`,
          group_key: groupKey,
          group_summary:
            groupKey === "urgent_unscheduled_tasks"
              ? "1 urgent task still has no block"
              : groupKey === "urgent_inbox_followups"
                ? "1 urgent inbox follow-up could be time-blocked"
                : "1 meeting prep block is recommended soon",
          outcome_state: "handled_elsewhere",
          outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
          first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
          first_action_type: "reject",
          closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
          close_reason_code: "rejected_handled_elsewhere",
          slot_state: "ready",
          trigger_signals: [prefix],
          suppressed_signals: [],
          resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        });
      }
    };

    createClosedRows();
    const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
      kind,
      status: "pending",
      priority: "high",
      source: "system_generated",
      source_task_id: kind === "schedule_task_block" ? `${prefix}-open-task` : undefined,
      source_thread_id: kind === "schedule_thread_followup" ? `${prefix}-open-thread` : undefined,
      source_calendar_event_id: kind === "schedule_event_prep" ? `${prefix}-open-event` : undefined,
      proposed_title: `${prefix} open`,
      reason_code:
        kind === "schedule_task_block"
          ? "task_schedule_pressure"
          : kind === "schedule_thread_followup"
            ? "needs_reply"
            : "event_prep_warning",
      reason_summary: `${prefix} open.`,
      dedupe_key: `${kind}:${prefix}-open`,
      source_fingerprint: `${prefix}-open`,
      group_key: groupKey,
      group_summary:
        groupKey === "urgent_unscheduled_tasks"
          ? "1 urgent task still has no block"
          : groupKey === "urgent_inbox_followups"
            ? "1 urgent inbox follow-up could be time-blocked"
            : "1 meeting prep block is recommended soon",
      slot_state: "ready",
      trigger_signals: [prefix],
      suppressed_signals: [],
    });
    service.reviewPlanningRecommendationHygiene(cliIdentity, {
      group: groupKey,
      kind,
      source: "system_generated",
      decision: reviewDecision,
      note: `${prefix} operator review note`,
    });
    if (proposalStatus === "proposed") {
      service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
        group: groupKey,
        kind,
        source: "system_generated",
        note: `${prefix} proposal note`,
      });
    } else {
      service.dismissPlanningRecommendationHygieneProposal(cliIdentity, {
        group: groupKey,
        kind,
        source: "system_generated",
        note: `${prefix} dismiss note`,
      });
    }

    rawDb
      .prepare(
        `UPDATE planning_recommendations
         SET status = 'superseded',
             outcome_state = 'source_resolved',
             outcome_recorded_at = ?,
             closed_at = ?,
             close_reason_code = 'source_resolved',
             resolved_at = ?,
             updated_at = ?
         WHERE recommendation_id = ?`,
      )
      .run(
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        openRecommendation.recommendation_id,
      );

    return openRecommendation;
  };

  createPolicyFamily(
    "phase18-exit",
    "schedule_task_block",
    "urgent_unscheduled_tasks",
    "investigate_externalized_workflow",
  );
  createPolicyFamily(
    "phase18-archived",
    "schedule_thread_followup",
    "urgent_inbox_followups",
    "investigate_externalized_workflow",
  );
  createPolicyFamily(
    "phase18-superseded",
    "schedule_event_prep",
    "near_term_meeting_prep",
    "investigate_source_suppression",
  );

  service.archivePlanningRecommendationPolicy(cliIdentity, {
    group: "urgent_inbox_followups",
    kind: "schedule_thread_followup",
    source: "system_generated",
    note: "Archive note that should stay out of compact summaries",
  });
  service.supersedePlanningRecommendationPolicy(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    note: "Supersede note that should stay out of compact summaries",
  });

  const governanceEvents = service.db.listPlanningHygienePolicyGovernanceEvents();
  const archivedEvent = governanceEvents.find((event) => event.group_key === "urgent_inbox_followups");
  const supersededEvent = governanceEvents.find((event) => event.group_key === "near_term_meeting_prep");
  assert.ok(archivedEvent);
  assert.ok(supersededEvent);
  rawDb
    .prepare(`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`)
    .run(new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(), archivedEvent.governance_event_id);
  rawDb
    .prepare(`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`)
    .run(new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString(), supersededEvent.governance_event_id);
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET outcome_recorded_at = ?,
           closed_at = ?,
           resolved_at = ?,
           updated_at = ?
       WHERE group_key = 'urgent_inbox_followups'
         AND kind = 'schedule_thread_followup'
         AND source = 'system_generated'`,
    )
    .run(
      new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(),
    );
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET outcome_recorded_at = ?,
           closed_at = ?,
           resolved_at = ?,
           updated_at = ?
       WHERE group_key = 'near_term_meeting_prep'
         AND kind = 'schedule_event_prep'
         AND source = 'system_generated'`,
    )
    .run(
      new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString(),
    );

  const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  assert.equal(policyReport.recent_policy_exit_count, 1);
  assert.equal(policyReport.retention_candidate_count, 2);
  assert.equal(policyReport.recent_policy_exits.length, 1);
  assert.equal(policyReport.recent_policy_exits[0]?.group_key, "urgent_unscheduled_tasks");
  assert.match(policyReport.recent_policy_exits[0]?.exit_summary ?? "", /Archive or supersede/i);
  assert.equal(policyReport.retention_candidates.length, 2);
  assert.equal(
    policyReport.retention_candidates.some((item) => item.governance_event_type === "policy_archived"),
    true,
  );
  assert.equal(
    policyReport.retention_candidates.some((item) => item.governance_event_type === "policy_superseded"),
    true,
  );

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal("policy_recent_exit_count" in status.planning_recommendations, false);
  assert.equal("policy_retention_candidate_count" in status.planning_recommendations, false);
  assert.equal("top_policy_recent_exit_summary" in status.planning_recommendations, false);
  assert.equal("top_policy_retention_candidate_summary" in status.planning_recommendations, false);
  assert.doesNotMatch(status.planning_recommendations.top_policy_attention_summary ?? "", /operator review note|Supersede note/i);

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.items.some((item) => item.kind === "planning_policy_governance_needed"), true);
  assert.equal(worklist.items.some((item) => item.kind === "planning_policy_retention_review_needed"), false);
  const governanceItem = worklist.items.find((item) => item.kind === "planning_policy_governance_needed");
  assert.doesNotMatch(governanceItem?.summary ?? "", /proposal note/i);

  service.archivePlanningRecommendationPolicy(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Archive the recent exit after review",
  });
  const afterGovernanceReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  assert.equal(afterGovernanceReport.recent_policy_exit_count, 0);

  const dryRun = service.prunePlanningRecommendationPolicyHistory(cliIdentity, {
    older_than_days: 30,
    event_type: "all",
    dry_run: true,
  });
  assert.equal(dryRun.dry_run, true);
  assert.equal(dryRun.candidate_count, 2);
  assert.equal(dryRun.pruned_count, 0);
  assert.equal(service.db.listPlanningHygienePolicyGovernanceEvents().length, 3);

  const pruneResult = service.prunePlanningRecommendationPolicyHistory(cliIdentity, {
    older_than_days: 30,
    event_type: "all",
  });
  assert.equal(pruneResult.pruned_count, 2);
  assert.equal(service.db.listPlanningHygienePolicyGovernanceEvents().length, 1);
  assert.ok(
    service.db.getPlanningHygienePolicyProposal(
      "urgent_inbox_followups",
      "schedule_thread_followup",
      "system_generated",
    ),
  );
  assert.ok(
    service.db.getPlanningHygienePolicyProposal(
      "near_term_meeting_prep",
      "schedule_event_prep",
      "system_generated",
    ),
  );

  const postPruneReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  assert.equal(postPruneReport.retention_candidate_count, 0);
  assert.equal(postPruneReport.recent_policy_exit_count, 0);
});

test("phase-19 policy report groups repeated governance history without mutating raw events", async () => {
  const now = Date.now();
  const { service } = createFixture();
  const rawDb = (service.db as any).db;

  const createPolicyFamily = (
    dedupeSuffix: string,
    kind: "schedule_task_block" | "schedule_thread_followup" | "schedule_event_prep",
    groupKey: "urgent_unscheduled_tasks" | "urgent_inbox_followups" | "near_term_meeting_prep",
    decision: "investigate_externalized_workflow" | "investigate_source_suppression",
  ) => {
    for (const suffix of ["a", "b", "c"]) {
      service.db.createPlanningRecommendation(cliIdentity, {
        kind,
        status: "rejected",
        priority: "high",
        source: "system_generated",
        source_task_id: `${dedupeSuffix}-${suffix}`,
        proposed_title: `Phase 19 closed ${dedupeSuffix} ${suffix}`,
        reason_code: "task_schedule_pressure",
        reason_summary: `Phase 19 closed ${dedupeSuffix} ${suffix}.`,
        dedupe_key: `${kind}:${dedupeSuffix}-${suffix}`,
        source_fingerprint: `${dedupeSuffix}-${suffix}`,
        group_key: groupKey,
        group_summary: "1 policy-backed family still needs review",
        outcome_state: "handled_elsewhere",
        outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
        first_action_at: new Date(now - 90 * 60 * 60 * 1000).toISOString(),
        first_action_type: "reject",
        closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
        close_reason_code: "rejected_handled_elsewhere",
        slot_state: "ready",
        trigger_signals: ["task_schedule_pressure"],
        suppressed_signals: [],
        resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
      });
    }

    const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
      kind,
      status: "pending",
      priority: "high",
      source: "system_generated",
      source_task_id: `${dedupeSuffix}-open`,
      proposed_title: `Phase 19 policy open ${dedupeSuffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 19 policy open ${dedupeSuffix}.`,
      dedupe_key: `${kind}:${dedupeSuffix}-open`,
      source_fingerprint: `${dedupeSuffix}-open`,
      group_key: groupKey,
      group_summary: "1 policy-backed family still needs review",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
    });

    service.reviewPlanningRecommendationHygiene(cliIdentity, {
      group: groupKey,
      kind,
      source: "system_generated",
      decision,
      note: `Phase 19 review ${dedupeSuffix}`,
    });
    service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
      group: groupKey,
      kind,
      source: "system_generated",
      note: `Phase 19 proposal ${dedupeSuffix}`,
    });
    rawDb
      .prepare(
        `UPDATE planning_recommendations
         SET status = 'superseded',
             outcome_state = 'source_resolved',
             outcome_recorded_at = ?,
             closed_at = ?,
             close_reason_code = 'source_resolved',
             resolved_at = ?,
             updated_at = ?
         WHERE recommendation_id = ?`,
      )
      .run(
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        openRecommendation.recommendation_id,
      );
  };

  createPolicyFamily(
    "phase19-mixed",
    "schedule_thread_followup",
    "urgent_inbox_followups",
    "investigate_externalized_workflow",
  );
  createPolicyFamily(
    "phase19-prune",
    "schedule_event_prep",
    "near_term_meeting_prep",
    "investigate_source_suppression",
  );

  service.archivePlanningRecommendationPolicy(cliIdentity, {
    group: "urgent_inbox_followups",
    kind: "schedule_thread_followup",
    source: "system_generated",
    note: "Archive note should stay out of grouped summaries",
  });
  service.supersedePlanningRecommendationPolicy(cliIdentity, {
    group: "urgent_inbox_followups",
    kind: "schedule_thread_followup",
    source: "system_generated",
    note: "Supersede note should stay out of grouped summaries",
  });
  service.supersedePlanningRecommendationPolicy(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    note: "Retention note should stay out of grouped summaries",
  });

  const governanceEvents = service.db.listPlanningHygienePolicyGovernanceEvents();
  const archivedMixedEvent = governanceEvents.find(
    (event) =>
      event.group_key === "urgent_inbox_followups" &&
      event.kind === "schedule_thread_followup" &&
      event.event_type === "policy_archived",
  );
  const supersededMixedEvent = governanceEvents.find(
    (event) =>
      event.group_key === "urgent_inbox_followups" &&
      event.kind === "schedule_thread_followup" &&
      event.event_type === "policy_superseded",
  );
  const pruneFamilyEvent = governanceEvents.find(
    (event) =>
      event.group_key === "near_term_meeting_prep" &&
      event.kind === "schedule_event_prep" &&
      event.event_type === "policy_superseded",
  );
  assert.ok(archivedMixedEvent);
  assert.ok(supersededMixedEvent);
  assert.ok(pruneFamilyEvent);
  rawDb
    .prepare(`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`)
    .run(new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(), archivedMixedEvent.governance_event_id);
  rawDb
    .prepare(`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`)
    .run(new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), supersededMixedEvent.governance_event_id);
  rawDb
    .prepare(`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`)
    .run(new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(), pruneFamilyEvent.governance_event_id);

  const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  assert.equal(policyReport.policy_history_family_count, 2);
  assert.equal(policyReport.repeated_policy_family_count, 1);
  assert.equal(policyReport.mixed_outcome_policy_family_count, 1);
  assert.equal(policyReport.policy_history_recent_events.length, 3);
  const mixedFamily = policyReport.policy_history_families.find(
    (item) => item.group_key === "urgent_inbox_followups" && item.kind === "schedule_thread_followup",
  );
  assert.ok(mixedFamily);
  assert.equal(mixedFamily.total_governance_events, 2);
  assert.equal(mixedFamily.archived_count, 1);
  assert.equal(mixedFamily.superseded_count, 1);
  assert.equal(mixedFamily.has_mixed_governance_outcomes, true);
  assert.equal(mixedFamily.recommended_action, "review_policy_churn");
  assert.equal(mixedFamily.governance_event_ids.length, 2);
  assert.doesNotMatch(mixedFamily.summary, /Archive note|Supersede note/i);

  const pruneFamily = policyReport.policy_history_families.find(
    (item) => item.group_key === "near_term_meeting_prep" && item.kind === "schedule_event_prep",
  );
  assert.ok(pruneFamily);
  assert.equal(pruneFamily.recommended_action, "prune_old_history");
  assert.match(pruneFamily.summary, /retention review/i);
  assert.equal(policyReport.top_repeated_policy_family_summary, mixedFamily.summary);
  assert.equal(policyReport.top_mixed_outcome_policy_family_summary, mixedFamily.summary);
  assert.equal(policyReport.top_retention_candidate_summary, pruneFamily.summary);
  assert.equal(
    policyReport.policy_history_recent_events.some(
      (item) => item.governance_note === "Archive note should stay out of grouped summaries",
    ),
    true,
  );

  const formatted = formatPlanningRecommendationPolicyReport(policyReport);
  const formattedCompressedOnly = formatted.split("Recent Raw Governance Events")[0] ?? formatted;
  assert.match(formatted, /Primary Policy Attention/);
  assert.match(formatted, /Archived cue:/);
  assert.match(formatted, /Superseded cue:/);
  assert.match(formatted, /Governance Hygiene Watchlist/);
  assert.match(formatted, /Compressed Policy History By Family/);
  assert.match(formatted, /Recent Raw Governance Events/);
  assert.match(formatted, /Retention cue:/);
  assert.match(formatted, /Repeated-family cue:/);
  assert.match(formatted, /Mixed-outcome cue:/);
  assert.doesNotMatch(formatted, /Proposed cue:/);
  assert.doesNotMatch(formatted, /Dismissed cue:/);
  assert.doesNotMatch(formatted, /Recent exit cue:/);
  assert.match(formatted, /review_policy_churn/);
  assert.doesNotMatch(formattedCompressedOnly, /Archive note should stay out of grouped summaries/);
  assert.doesNotMatch(formatted, /Top active proposed:/);
  assert.doesNotMatch(formatted, /Top recent policy exit:/);

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal("top_policy_retention_candidate_summary" in status.planning_recommendations, false);
  assert.doesNotMatch(status.planning_recommendations.top_policy_attention_summary ?? "", /Retention note/i);

  const worklist = await service.getWorklistReport({ httpReachable: true });
  const governanceItem = worklist.items.find((item) => item.kind === "planning_policy_governance_needed");
  assert.ok(governanceItem);
  assert.match(governanceItem.summary, /policy churn|governance events/i);
  assert.doesNotMatch(governanceItem.summary, /Archive note|Supersede note/i);
});

test("phase-20 assistant-safe audit events are categorized and operator audit stays raw", () => {
  const { service } = createFixture();

  const task = service.createTask(cliIdentity, {
    title: "Phase 20 categorized audit task",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
  });
  service.completeTask(cliIdentity, task.task_id, "Completed for phase 20");
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "planning_recommendation_policy_archived",
    target_type: "planning_recommendation_family",
    target_id: "urgent_unscheduled_tasks:schedule_task_block:system_generated",
    outcome: "success",
    metadata: { note: "Hidden from assistants" },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "future_operator_action",
    target_type: "task",
    target_id: task.task_id,
    outcome: "success",
    metadata: { note: "Unknown actions should stay hidden" },
  });

  const operatorEvents = service.listAuditEvents({ limit: 20 });
  const operatorTaskCreate = operatorEvents.find((event) => event.action === "task_create");
  assert.ok(operatorTaskCreate);
  assert.equal(operatorTaskCreate.assistant_safe_category, undefined);
  assert.equal(operatorEvents.some((event) => event.action === "planning_recommendation_policy_archived"), true);
  assert.equal(operatorEvents.some((event) => event.action === "future_operator_action"), true);

  const assistantEvents = service.listAuditEvents({ limit: 20 }, { assistant_safe: true });
  assert.equal(assistantEvents.some((event) => event.action === "planning_recommendation_policy_archived"), false);
  assert.equal(assistantEvents.some((event) => event.action === "future_operator_action"), false);
  const assistantTaskCreate = assistantEvents.find((event) => event.action === "task_create");
  assert.ok(assistantTaskCreate);
  assert.equal(assistantTaskCreate.assistant_safe_category, "task");
  assert.equal(assistantTaskCreate.metadata_redacted, true);
  assert.equal(assistantTaskCreate.summary, "Task created.");
  const assistantTaskCreateMetadata = JSON.parse(assistantTaskCreate.metadata_json) as Record<string, unknown>;
  assert.equal("title" in assistantTaskCreateMetadata, false);
});

test("phase-20 policy attention picks one primary signal for policy, status, and worklist", async () => {
  const now = Date.now();
  const { service } = createFixture();
  const rawDb = (service.db as any).db;

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `phase20-recent-exit-${suffix}`,
      proposed_title: `Phase 20 recent exit ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 20 recent exit ${suffix}.`,
      dedupe_key: `schedule_task_block:phase20-recent-exit-${suffix}`,
      source_fingerprint: `phase20-recent-exit-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 90 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
      resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
    });
  }

  const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "phase20-recent-exit-open",
    proposed_title: "Phase 20 recent exit open",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 20 recent exit open.",
    dedupe_key: "schedule_task_block:phase20-recent-exit-open",
    source_fingerprint: "phase20-recent-exit-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
  });
  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Phase 20 review note",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Phase 20 proposal note",
  });
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET status = 'superseded',
           outcome_state = 'source_resolved',
           outcome_recorded_at = ?,
           closed_at = ?,
           close_reason_code = 'source_resolved',
           resolved_at = ?,
           updated_at = ?
       WHERE recommendation_id = ?`,
    )
    .run(
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      openRecommendation.recommendation_id,
    );

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_event_prep",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `phase20-churn-${suffix}`,
      proposed_title: `Phase 20 churn ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 20 churn ${suffix}.`,
      dedupe_key: `schedule_event_prep:phase20-churn-${suffix}`,
      source_fingerprint: `phase20-churn-${suffix}`,
      group_key: "near_term_meeting_prep",
      group_summary: "1 meeting prep block still needs review",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
      resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });
  }
  const churnOpen = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_event_prep",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "phase20-churn-open",
    proposed_title: "Phase 20 churn open",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 20 churn open.",
    dedupe_key: "schedule_event_prep:phase20-churn-open",
    source_fingerprint: "phase20-churn-open",
    group_key: "near_term_meeting_prep",
    group_summary: "1 meeting prep block still needs review",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
  });
  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    decision: "investigate_source_suppression",
    note: "Phase 20 churn review",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    note: "Phase 20 churn proposal",
  });
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET status = 'superseded',
           outcome_state = 'source_resolved',
           outcome_recorded_at = ?,
           closed_at = ?,
           close_reason_code = 'source_resolved',
           resolved_at = ?,
           updated_at = ?
       WHERE recommendation_id = ?`,
    )
    .run(
      new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      churnOpen.recommendation_id,
    );
  service.archivePlanningRecommendationPolicy(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    note: "Phase 20 archive note should stay private",
  });
  service.supersedePlanningRecommendationPolicy(cliIdentity, {
    group: "near_term_meeting_prep",
    kind: "schedule_event_prep",
    source: "system_generated",
    note: "Phase 20 supersede note should stay private",
  });

  const governanceEvents = service.db.listPlanningHygienePolicyGovernanceEvents();
  const archiveEvent = governanceEvents.find(
    (event) =>
      event.group_key === "near_term_meeting_prep" &&
      event.kind === "schedule_event_prep" &&
      event.event_type === "policy_archived",
  );
  assert.ok(archiveEvent);
  rawDb
    .prepare(`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`)
    .run(new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(), archiveEvent.governance_event_id);

  const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  assert.equal(policyReport.policy_attention_kind, "recent_exit");
  assert.match(policyReport.policy_attention_summary ?? "", /archive|supersede/i);
  assert.equal(policyReport.policy_attention_command, "personal-ops recommendation policy");
  assert.equal("policy_history" in policyReport, false);
  const formattedPolicy = formatPlanningRecommendationPolicyReport(policyReport);
  assert.match(formattedPolicy, /Primary Policy Attention/);

  const operatorPolicyJson = JSON.parse(JSON.stringify(policyReport)) as Record<string, unknown>;
  assert.equal("policy_history" in operatorPolicyJson, false);

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal(status.planning_recommendations.policy_attention_kind, "recent_exit");
  assert.ok(status.planning_recommendations.top_policy_attention_summary);
  assert.equal("top_policy_recent_exit_summary" in status.planning_recommendations, false);
  assert.equal("top_policy_retention_candidate_summary" in status.planning_recommendations, false);
  const formattedStatus = formatStatusReport(status);
  assert.match(formattedStatus, /Policy attention:/);
  assert.doesNotMatch(formattedStatus, /Top policy recent exit:/);
  assert.doesNotMatch(formattedStatus, /Top policy retention candidate:/);

  const worklist = await service.getWorklistReport({ httpReachable: true });
  const policyItems = worklist.items.filter(
    (item) =>
      item.kind === "planning_policy_governance_needed" || item.kind === "planning_policy_retention_review_needed",
  );
  assert.equal(policyItems.length, 1);
  assert.equal(policyItems[0]?.kind, "planning_policy_governance_needed");
  assert.doesNotMatch(policyItems[0]?.summary ?? "", /archive note|supersede note/i);
});

test("phase-23 policy attention stays aligned across policy, status, and worklist", async () => {
  const now = Date.now();

  const getPolicyStatusKeys = (status: Awaited<ReturnType<PersonalOpsService["getStatusReport"]>>) =>
    Object.keys(status.planning_recommendations)
      .filter((key) => key === "policy_attention_kind" || key === "top_policy_attention_summary")
      .sort();

  const createClosedPolicyFamily = (
    service: ReturnType<typeof createFixture>["service"],
    rawDb: any,
    input: {
      suffix: string;
      kind: "schedule_task_block" | "schedule_thread_followup" | "schedule_event_prep";
      group_key: "urgent_unscheduled_tasks" | "urgent_inbox_followups" | "near_term_meeting_prep";
      review_decision: "investigate_externalized_workflow" | "investigate_source_suppression";
    },
  ) => {
    for (const row of ["a", "b", "c"]) {
      service.db.createPlanningRecommendation(cliIdentity, {
        kind: input.kind,
        status: "rejected",
        priority: "high",
        source: "system_generated",
        source_task_id: `${input.suffix}-${row}`,
        proposed_title: `Phase 23 ${input.suffix} ${row}`,
        reason_code: "task_schedule_pressure",
        reason_summary: `Phase 23 ${input.suffix} ${row}.`,
        dedupe_key: `${input.kind}:${input.suffix}-${row}`,
        source_fingerprint: `${input.suffix}-${row}`,
        group_key: input.group_key,
        group_summary: "1 policy family still needs review",
        outcome_state: "handled_elsewhere",
        outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
        first_action_at: new Date(now - 90 * 60 * 60 * 1000).toISOString(),
        first_action_type: "reject",
        closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
        close_reason_code: "rejected_handled_elsewhere",
        slot_state: "ready",
        trigger_signals: ["task_schedule_pressure"],
        suppressed_signals: [],
        resolved_at: new Date(now - 60 * 60 * 60 * 1000).toISOString(),
      });
    }

    const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
      kind: input.kind,
      status: "pending",
      priority: "high",
      source: "system_generated",
      source_task_id: `${input.suffix}-open`,
      proposed_title: `Phase 23 ${input.suffix} open`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 23 ${input.suffix} open.`,
      dedupe_key: `${input.kind}:${input.suffix}-open`,
      source_fingerprint: `${input.suffix}-open`,
      group_key: input.group_key,
      group_summary: "1 policy family still needs review",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
    });

    service.reviewPlanningRecommendationHygiene(cliIdentity, {
      group: input.group_key,
      kind: input.kind,
      source: "system_generated",
      decision: input.review_decision,
      note: `Phase 23 review ${input.suffix}`,
    });
    service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
      group: input.group_key,
      kind: input.kind,
      source: "system_generated",
      note: `Phase 23 proposal ${input.suffix}`,
    });
    rawDb
      .prepare(
        `UPDATE planning_recommendations
         SET status = 'superseded',
             outcome_state = 'source_resolved',
             outcome_recorded_at = ?,
             closed_at = ?,
             close_reason_code = 'source_resolved',
             resolved_at = ?,
             updated_at = ?
         WHERE recommendation_id = ?`,
      )
      .run(
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        openRecommendation.recommendation_id,
      );
  };

  {
    const { service } = createFixture();
    const rawDb = (service.db as any).db;
    createClosedPolicyFamily(service, rawDb, {
      suffix: "history-churn",
      kind: "schedule_event_prep",
      group_key: "near_term_meeting_prep",
      review_decision: "investigate_source_suppression",
    });
    service.archivePlanningRecommendationPolicy(cliIdentity, {
      group: "near_term_meeting_prep",
      kind: "schedule_event_prep",
      source: "system_generated",
      note: "Phase 23 archive note should stay private",
    });
    service.supersedePlanningRecommendationPolicy(cliIdentity, {
      group: "near_term_meeting_prep",
      kind: "schedule_event_prep",
      source: "system_generated",
      note: "Phase 23 supersede note should stay private",
    });

    const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
    assert.equal(policyReport.policy_attention_kind, "history_churn");
    assert.equal(policyReport.recent_policy_exit_count, 0);
    assert.equal(policyReport.retention_candidate_count, 0);

    const status = await service.getStatusReport({ httpReachable: true });
    assert.equal(status.planning_recommendations.policy_attention_kind, "history_churn");
    assert.equal(status.planning_recommendations.top_policy_attention_summary, policyReport.policy_attention_summary);
    assert.equal("policy_recent_exit_count" in status.planning_recommendations, false);
    assert.equal("policy_retention_candidate_count" in status.planning_recommendations, false);
    assert.deepEqual(getPolicyStatusKeys(status), ["policy_attention_kind", "top_policy_attention_summary"]);

    const worklist = await service.getWorklistReport({ httpReachable: true });
    const policyItems = worklist.items.filter(
      (item) =>
        item.kind === "planning_policy_governance_needed" || item.kind === "planning_policy_retention_review_needed",
    );
    assert.equal(policyItems.length, 1);
    assert.equal(policyItems[0]?.kind, "planning_policy_governance_needed");
    assert.equal(policyItems[0]?.summary, policyReport.policy_attention_summary);
    assert.equal(policyItems[0]?.suggested_command, "personal-ops recommendation policy");
    assert.doesNotMatch(policyItems[0]?.summary ?? "", /archive note|supersede note/i);
  }

  {
    const { service } = createFixture();
    const rawDb = (service.db as any).db;
    createClosedPolicyFamily(service, rawDb, {
      suffix: "retention-only",
      kind: "schedule_thread_followup",
      group_key: "urgent_inbox_followups",
      review_decision: "investigate_externalized_workflow",
    });
    service.supersedePlanningRecommendationPolicy(cliIdentity, {
      group: "urgent_inbox_followups",
      kind: "schedule_thread_followup",
      source: "system_generated",
      note: "Phase 23 retention note should stay private",
    });
    const governanceEvent = service.db
      .listPlanningHygienePolicyGovernanceEvents()
      .find(
        (event) =>
          event.group_key === "urgent_inbox_followups" &&
          event.kind === "schedule_thread_followup" &&
          event.event_type === "policy_superseded",
      );
    assert.ok(governanceEvent);
    rawDb
      .prepare(`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`)
      .run(new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(), governanceEvent.governance_event_id);

    const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
    assert.equal(policyReport.policy_attention_kind, "retention_candidate");
    assert.equal(policyReport.recent_policy_exit_count, 0);
    assert.equal(policyReport.retention_candidate_count, 1);

    const status = await service.getStatusReport({ httpReachable: true });
    assert.equal(status.planning_recommendations.policy_attention_kind, "retention_candidate");
    assert.equal(status.planning_recommendations.top_policy_attention_summary, policyReport.policy_attention_summary);
    assert.equal("policy_recent_exit_count" in status.planning_recommendations, false);
    assert.equal("policy_retention_candidate_count" in status.planning_recommendations, false);
    assert.deepEqual(getPolicyStatusKeys(status), ["policy_attention_kind", "top_policy_attention_summary"]);

    const worklist = await service.getWorklistReport({ httpReachable: true });
    const policyItems = worklist.items.filter(
      (item) =>
        item.kind === "planning_policy_governance_needed" || item.kind === "planning_policy_retention_review_needed",
    );
    assert.equal(policyItems.length, 1);
    assert.equal(policyItems[0]?.kind, "planning_policy_retention_review_needed");
    assert.equal(policyItems[0]?.summary, policyReport.policy_attention_summary);
    assert.equal(policyItems[0]?.suggested_command, "personal-ops recommendation policy");
    assert.doesNotMatch(policyItems[0]?.summary ?? "", /retention note/i);
  }

  {
    const { service } = createFixture();
    const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
    assert.equal(policyReport.policy_attention_kind, "none");
    assert.equal(policyReport.recent_policy_exit_count, 0);
    assert.equal(policyReport.retention_candidate_count, 0);

    const status = await service.getStatusReport({ httpReachable: true });
    assert.equal(status.planning_recommendations.policy_attention_kind, "none");
    assert.equal(status.planning_recommendations.top_policy_attention_summary, policyReport.policy_attention_summary);
    assert.equal("policy_recent_exit_count" in status.planning_recommendations, false);
    assert.equal("policy_retention_candidate_count" in status.planning_recommendations, false);
    assert.deepEqual(getPolicyStatusKeys(status), ["policy_attention_kind", "top_policy_attention_summary"]);

    const worklist = await service.getWorklistReport({ httpReachable: true });
    const policyItems = worklist.items.filter(
      (item) =>
        item.kind === "planning_policy_governance_needed" || item.kind === "planning_policy_retention_review_needed",
    );
    assert.equal(policyItems.length, 0);
  }
});

test("phase-5 prep-day workflow stays bounded and leads with a repair step when needed", async () => {
  const { service } = createFixture();
  service.db.createTask(cliIdentity, {
    title: "Reply to the first operator thread",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });

  const report = await service.getPrepDayWorkflowReport({ httpReachable: true });

  assert.equal(report.workflow, "prep-day");
  assert.deepEqual(
    report.sections.map((section) => section.title),
    ["Overall State", "Top Attention", "Time-Sensitive Items", "Next Commands"],
  );
  assert.ok(report.actions.length <= 3);
  assert.equal(report.sections[3]?.items.length, report.actions.length);
  if (report.readiness !== "ready") {
    assert.ok(report.first_repair_step);
    assert.equal(report.actions[0]?.command, report.first_repair_step);
  }
});

test("phase-5 follow-up workflow bundles needs-reply and stale follow-up pressure", async () => {
  const accountEmail = "machine@example.com";
  const now = Date.now();
  const needsReply = buildMessage("msg-phase5-needs-reply", accountEmail, {
    thread_id: "thread-phase5-needs-reply",
    history_id: "7101",
    internal_date: String(now - 30 * 60 * 60 * 1000),
    label_ids: ["INBOX", "UNREAD"],
    subject: "Need an operator reply",
  });
  const staleFollowup = buildMessage("msg-phase5-stale-followup", accountEmail, {
    thread_id: "thread-phase5-stale-followup",
    history_id: "7102",
    internal_date: String(now - 90 * 60 * 60 * 1000),
    label_ids: ["SENT"],
    from_header: `Machine <${accountEmail}>`,
    to_header: "friend@example.com",
    subject: "Checking back in",
  });
  const messages = new Map([
    [needsReply.message_id, needsReply],
    [staleFollowup.message_id, staleFollowup],
  ]);

  const { service } = createFixture({
    accountEmail,
    profileHistoryId: "7199",
    listRefsImpl: async (labelId) => ({
      message_ids: labelId === "INBOX" ? [needsReply.message_id] : [staleFollowup.message_id],
    }),
    metadataImpl: async (messageId) => {
      const message = messages.get(messageId);
      if (!message) {
        throw new Error(`Unknown message ${messageId}`);
      }
      return message;
    },
  });

  await service.syncMailboxMetadata(cliIdentity);
  service.refreshPlanningRecommendations(cliIdentity);

  const report = await service.getFollowUpBlockWorkflowReport({ httpReachable: true });
  const needsReplySection = report.sections.find((section) => section.title === "Needs Reply");
  const waitingSection = report.sections.find((section) => section.title === "Waiting To Nudge");

  assert.equal(report.workflow, "follow-up-block");
  assert.equal(needsReplySection?.items[0]?.target_type, "inbox_autopilot_group");
  assert.match(JSON.stringify(needsReplySection?.items ?? []), /Prepare reply block|reply draft/i);
  assert.match(JSON.stringify(waitingSection?.items ?? []), /Checking back in|follow-up|Prepare follow-up block/i);
  assert.ok(report.actions.some((action) => action.target_type === "inbox_autopilot_group"));
});

test("phase-5 meeting workflow respects today vs next-24h scope", async () => {
  const { service, accountEmail } = createFixture();
  const now = new Date();
  const soonTodayStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(now.getDate() + 1);
  tomorrowStart.setSeconds(0, 0);

  service.db.upsertCalendarEvent({
    event_id: "primary:phase5-today",
    provider_event_id: "phase5-today",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Today workflow meeting",
    status: "confirmed",
    start_at: soonTodayStart.toISOString(),
    end_at: new Date(soonTodayStart.getTime() + 30 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    attendee_count: 1,
    created_by_personal_ops: false,
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  });
  service.db.upsertCalendarEvent({
    event_id: "primary:phase5-tomorrow",
    provider_event_id: "phase5-tomorrow",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Tomorrow workflow meeting",
    status: "confirmed",
    start_at: tomorrowStart.toISOString(),
    end_at: new Date(tomorrowStart.getTime() + 30 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    attendee_count: 1,
    created_by_personal_ops: false,
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  });

  const todayReport = await service.getPrepMeetingsWorkflowReport({ httpReachable: true, scope: "today" });
  const next24Report = await service.getPrepMeetingsWorkflowReport({ httpReachable: true, scope: "next_24h" });
  const todayText = JSON.stringify(todayReport.sections);
  const next24Text = JSON.stringify(next24Report.sections);

  assert.equal(todayReport.workflow, "prep-meetings");
  assert.doesNotMatch(todayText, /Tomorrow workflow meeting/);
  assert.match(next24Text, /Tomorrow workflow meeting/);
});

test("assistant-led phase 3 prepares a bounded meeting packet with grounded context", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({
    accountEmail,
    driveEnabled: true,
    includedDriveFiles: ["doc-meeting-packet"],
  });
  seedMailboxReadyState(service, accountEmail, "meeting-packet");
  service.db.upsertCalendarSyncState(accountEmail, "google", {
    status: "ready",
    last_synced_at: new Date().toISOString(),
    last_seeded_at: new Date().toISOString(),
    calendars_refreshed_count: 1,
    events_refreshed_count: 1,
  });
  service.db.replaceDriveFiles([
    {
      file_id: "doc-meeting-packet",
      name: "Project packet",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-meeting-packet/edit",
      parents: [],
      scope_source: "included_file",
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    },
  ]);
  service.db.replaceDriveDocs([
    {
      file_id: "doc-meeting-packet",
      title: "Project packet",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-meeting-packet/edit",
      snippet: "Agenda and open issues",
      text_content: "Agenda and open issues",
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    },
  ]);
  const eventId = "primary:assistant-led-phase3";
  service.db.upsertCalendarEvent({
    event_id: eventId,
    provider_event_id: "assistant-led-phase3",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Assistant-led project sync",
    status: "confirmed",
    start_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    end_at: new Date(Date.now() + 150 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    created_by_personal_ops: false,
    attendee_count: 3,
    organizer_email: "owner@example.com",
    notes: "Packet https://docs.google.com/document/d/doc-meeting-packet/edit",
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  });
  service.db.replaceDriveLinkProvenance([
    {
      source_type: "calendar_event",
      source_id: eventId,
      file_id: "doc-meeting-packet",
      match_type: "explicit_link",
      matched_url: "https://docs.google.com/document/d/doc-meeting-packet/edit",
      discovered_at: new Date().toISOString(),
    },
  ]);
  service.db.upsertMailMessage(
    accountEmail,
    buildMessage("meeting-thread", accountEmail, {
      thread_id: "thread-meeting-packet",
      history_id: "meeting-thread-1",
      internal_date: String(Date.now() - 60 * 60 * 1000),
      label_ids: ["INBOX"],
      from_header: "Partner <partner@example.com>",
      subject: "Assistant-led project sync follow-up",
    }),
    new Date().toISOString(),
  );
  service.db.createTask(cliIdentity, {
    title: "Finalize project sync checklist",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    source_calendar_event_id: eventId,
  });

  const result = await service.prepareMeetingPrepPacket(cliIdentity, eventId);
  const packet = await service.getMeetingPrepPacket(eventId);

  assert.equal(result.success, true);
  assert.equal(packet.state, "awaiting_review");
  assert.match(packet.summary, /Assistant-led project sync/);
  assert.equal(packet.related_docs.length, 1);
  assert.equal(packet.related_tasks.length, 1);
  assert.equal(packet.related_threads.length, 1);
  assert.equal(packet.agenda.length > 0, true);
});

test("assistant-led phase 3 low-context packets fall back to missing-context guidance", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({ accountEmail });
  seedMailboxReadyState(service, accountEmail, "meeting-packet-low-context");
  service.db.upsertCalendarSyncState(accountEmail, "google", {
    status: "ready",
    last_synced_at: new Date().toISOString(),
    last_seeded_at: new Date().toISOString(),
    calendars_refreshed_count: 1,
    events_refreshed_count: 1,
  });
  const eventId = "primary:assistant-led-phase3-low-context";
  service.db.upsertCalendarEvent({
    event_id: eventId,
    provider_event_id: "assistant-led-phase3-low-context",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Low context meeting",
    status: "confirmed",
    start_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    created_by_personal_ops: false,
    attendee_count: 1,
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  });

  const result = await service.prepareMeetingPrepPacket(cliIdentity, eventId);

  assert.equal(result.packet.related_docs.length, 0);
  assert.equal(result.packet.related_tasks.length, 0);
  assert.equal(result.packet.related_threads.length, 0);
  assert.match(result.packet.agenda[0] ?? "", /Clarify the meeting goal/i);
  assert.match(result.packet.open_questions.join(" "), /primary doc|outcome/i);
});

test("phase-6 now-next leads with the first repair step when readiness is degraded", async () => {
  const { service } = createFixture();
  const degradedWorklist: WorklistReport = {
    generated_at: new Date().toISOString(),
    state: "degraded",
    counts_by_severity: { critical: 1, warn: 0, info: 0 },
    send_window: { active: false },
    planning_groups: [],
    items: [
      {
        item_id: "repair-1",
        kind: "system_degraded",
        severity: "critical",
        title: "Daemon needs repair",
        summary: "The daemon is unreachable and should be restarted before normal operator work.",
        target_type: "system",
        target_id: "personal-ops",
        created_at: new Date().toISOString(),
        suggested_command: "personal-ops doctor",
        metadata_json: "{}",
      },
    ],
  };
  (service as any).getWorklistReport = async () => degradedWorklist;
  (service as any).getStatusReport = async () => ({
    state: "degraded",
    worklist_summary: { top_item_summary: degradedWorklist.items[0]!.summary },
    mailbox: { connected: "machine@example.com", configured: "machine@example.com" },
  });

  const report = await service.getNowNextWorkflowReport({ httpReachable: true });

  assert.equal(report.workflow, "now-next");
  assert.equal(report.first_repair_step, "personal-ops doctor");
  assert.equal(report.actions[0]?.command, "personal-ops doctor");
  assert.match(report.sections[0]?.items[0]?.summary ?? "", /daemon is unreachable/i);
});

test("phase-6 prep-day prefers concrete work over governance review in healthy state", async () => {
  const { service } = createFixture();
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const healthyWorklist: WorklistReport = {
    generated_at: new Date().toISOString(),
    state: "ready",
    counts_by_severity: { critical: 0, warn: 2, info: 0 },
    send_window: { active: false },
    planning_groups: [],
    items: [
      {
        item_id: "governance-1",
        kind: "planning_policy_governance_needed",
        severity: "warn",
        title: "Planning hygiene review needed",
        summary: "A governance review is open for a noisy planning family.",
        target_type: "planning_recommendation_family",
        target_id: "family-1",
        created_at: new Date().toISOString(),
        suggested_command: "personal-ops recommendation hygiene --review-needed-only",
        metadata_json: "{}",
      },
      {
        item_id: "task-1",
        kind: "task_due_soon",
        severity: "warn",
        title: "High-priority task needs attention",
        summary: "A real operator task is due soon.",
        target_type: "task",
        target_id: "task-1",
        created_at: new Date().toISOString(),
        due_at: soon,
        suggested_command: "personal-ops task show task-1",
        metadata_json: "{}",
      },
    ],
  };
  (service as any).getWorklistReport = async () => healthyWorklist;
  (service as any).getStatusReport = async () => ({
    state: "ready",
    worklist_summary: { top_item_summary: healthyWorklist.items[0]!.summary },
    mailbox: { connected: "machine@example.com", configured: "machine@example.com" },
  });

  const report = await service.getPrepDayWorkflowReport({ httpReachable: true });

  assert.equal(report.workflow, "prep-day");
  assert.equal(report.actions[0]?.command, "personal-ops task show task-1");
  assert.notEqual(report.actions[0]?.command, "personal-ops recommendation hygiene --review-needed-only");
  assert.match(report.actions[0]?.why_now ?? "", /task|due window/i);
});

test("phase-6 meeting workflow only surfaces prep when the meeting window is close", async () => {
  const { service, accountEmail } = createFixture();
  const nearStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const farStart = new Date(Date.now() + 10 * 60 * 60 * 1000);

  service.db.upsertCalendarEvent({
    event_id: "primary:phase6-near",
    provider_event_id: "phase6-near",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Near meeting",
    status: "confirmed",
    start_at: nearStart.toISOString(),
    end_at: new Date(nearStart.getTime() + 30 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    attendee_count: 1,
    created_by_personal_ops: false,
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  });
  service.db.upsertCalendarEvent({
    event_id: "primary:phase6-far",
    provider_event_id: "phase6-far",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Far meeting",
    status: "confirmed",
    start_at: farStart.toISOString(),
    end_at: new Date(farStart.getTime() + 30 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    attendee_count: 1,
    created_by_personal_ops: false,
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  });

  const report = await service.getPrepMeetingsWorkflowReport({ httpReachable: true, scope: "today" });
  const prepNeeded = report.sections.find((section) => section.title === "Prep Needed");
  const prepText = JSON.stringify(prepNeeded?.items ?? []);

  assert.match(prepText, /Near meeting/);
  assert.doesNotMatch(prepText, /Far meeting/);
});

test("phase-25 status keeps one compact policy attention signal", async () => {
  const now = Date.now();
  const { service } = createFixture();
  const rawDb = (service.db as any).db;

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `phase24-recent-exit-${suffix}`,
      proposed_title: `Phase 24 recent exit ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 24 recent exit ${suffix}.`,
      dedupe_key: `schedule_task_block:phase24-recent-exit-${suffix}`,
      source_fingerprint: `phase24-recent-exit-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 90 * 60 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
      resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
    });
  }

  const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "phase24-recent-exit-open",
    proposed_title: "Phase 24 recent exit open",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 24 recent exit open.",
    dedupe_key: "schedule_task_block:phase24-recent-exit-open",
    source_fingerprint: "phase24-recent-exit-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
  });

  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Phase 24 review note should stay private",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Phase 24 proposal note should stay private",
  });
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET status = 'superseded',
           outcome_state = 'source_resolved',
           outcome_recorded_at = ?,
           closed_at = ?,
           close_reason_code = 'source_resolved',
           resolved_at = ?,
           updated_at = ?
       WHERE recommendation_id = ?`,
    )
    .run(
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      openRecommendation.recommendation_id,
    );

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal("policy_recent_exit_count" in status.planning_recommendations, false);
  assert.equal("policy_retention_candidate_count" in status.planning_recommendations, false);
  assert.equal(status.planning_recommendations.policy_attention_kind, "recent_exit");
  assert.ok(status.planning_recommendations.top_policy_attention_summary);
  assert.deepEqual(
    Object.keys(status.planning_recommendations)
      .filter((key) => key === "policy_attention_kind" || key === "top_policy_attention_summary")
      .sort(),
    ["policy_attention_kind", "top_policy_attention_summary"],
  );

  const formattedStatus = formatStatusReport(status);
  assert.match(formattedStatus, /Policy attention:/);
  assert.doesNotMatch(formattedStatus, /Policy recent exits:/);
  assert.doesNotMatch(formattedStatus, /Policy retention candidates:/);
  assert.doesNotMatch(formattedStatus, /review note should stay private|proposal note should stay private/i);
  const policyAttentionIndex = formattedStatus.indexOf("Policy attention:");
  const topHygieneIndex = formattedStatus.indexOf("Top hygiene summary:");
  assert.notEqual(policyAttentionIndex, -1);
  assert.notEqual(topHygieneIndex, -1);
  assert.ok(policyAttentionIndex < topHygieneIndex);
});

test("phase-26 assistant-safe audit stays fixed while compact governance surfaces remain stable", async () => {
  const { service } = createFixture();

  const task = service.createTask(cliIdentity, {
    title: "Phase 26 audit stability task",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
  });
  service.completeTask(cliIdentity, task.task_id, "done");
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "future_operator_action",
    target_type: "task",
    target_id: task.task_id,
    outcome: "success",
    metadata: { note: "Unknown actions stay hidden from assistants" },
  });

  const operatorAudit = service.listAuditEvents({ limit: 10 });
  const assistantAudit = service.listAuditEvents({ limit: 10 }, { assistant_safe: true });
  const assistantTaskCreate = assistantAudit.find((event) => event.action === "task_create");
  assert.ok(assistantTaskCreate);
  assert.equal(assistantTaskCreate.assistant_safe_category, "task");
  assert.equal(assistantTaskCreate.metadata_redacted, true);
  assert.equal(operatorAudit.some((event) => "assistant_safe_category" in event), false);
  assert.equal(operatorAudit.some((event) => event.metadata_redacted === true), false);
  assert.equal(assistantAudit.some((event) => event.action === "future_operator_action"), false);

  const status = await service.getStatusReport({ httpReachable: true });
  const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  const worklist = await service.getWorklistReport({ httpReachable: true });
  const formattedStatus = formatStatusReport(status);
  const formattedPolicy = formatPlanningRecommendationPolicyReport(policyReport);
  const policyItems = worklist.items.filter(
    (item) =>
      item.kind === "planning_policy_governance_needed" || item.kind === "planning_policy_retention_review_needed",
  );

  assert.ok(status.planning_recommendations.top_policy_attention_summary !== undefined);
  assert.equal(status.planning_recommendations.policy_attention_kind, policyReport.policy_attention_kind);
  assert.ok(policyItems.length <= 1);
  assert.match(formattedStatus, /Policy attention:/);
  assert.match(formattedPolicy, /Primary Policy Attention/);
  assert.equal(
    policyReport.policy_attention_command,
    "personal-ops recommendation policy",
  );
});

test("phase-31 audit category filter isolates assistant-safe categories without widening visibility", () => {
  const { service } = createFixture();

  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "mailbox_sync",
    target_type: "mailbox",
    target_id: "jayday1104@gmail.com",
    outcome: "success",
    metadata: {
      sync_result: {
        messages_refreshed: 15,
        messages_deleted: 0,
        threads_recomputed: 4,
        duration_ms: 250,
      },
    },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "task_create",
    target_type: "task",
    target_id: "phase31-task",
    outcome: "success",
    metadata: {
      owner: "operator",
      kind: "human_reminder",
      priority: "high",
      title: "Should stay hidden from assistant audit metadata",
    },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "task_suggestion_create",
    target_type: "task_suggestion",
    target_id: "phase31-suggestion",
    outcome: "success",
    metadata: {
      kind: "assistant_work",
      priority: "normal",
    },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "planning_recommendation_create",
    target_type: "planning_recommendation",
    target_id: "phase31-recommendation",
    outcome: "success",
    metadata: {
      kind: "schedule_task_block",
      source: "assistant_created",
      task_id: "phase31-task",
    },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "planning_recommendation_policy_archived",
    target_type: "planning_recommendation_family",
    target_id: "urgent_unscheduled_tasks:schedule_task_block:system_generated",
    outcome: "success",
    metadata: { note: "Should remain invisible to filtered assistant audit reads" },
  });

  const assistantDefault = service.listAuditEvents({ limit: 20 }, { assistant_safe: true });
  assert.equal(assistantDefault.some((event) => event.action === "mailbox_sync"), true);
  assert.equal(assistantDefault.some((event) => event.action === "task_create"), true);
  assert.equal(assistantDefault.some((event) => event.action === "task_suggestion_create"), true);
  assert.equal(assistantDefault.some((event) => event.action === "planning_recommendation_create"), true);
  assert.equal(
    assistantDefault.some((event) => event.action === "planning_recommendation_policy_archived"),
    false,
  );

  const assistantSync = service.listAuditEvents({ limit: 20, category: "sync" }, { assistant_safe: true });
  assert.deepEqual(assistantSync.map((event) => event.action), ["mailbox_sync"]);
  assert.equal(assistantSync.every((event) => event.assistant_safe_category === "sync"), true);
  assert.equal(assistantSync.every((event) => event.metadata_redacted === true), true);

  const assistantTask = service.listAuditEvents({ limit: 20, category: "task" }, { assistant_safe: true });
  assert.deepEqual(assistantTask.map((event) => event.action), ["task_create"]);
  assert.equal(assistantTask.every((event) => event.assistant_safe_category === "task"), true);

  const assistantSuggestion = service.listAuditEvents(
    { limit: 20, category: "task_suggestion" },
    { assistant_safe: true },
  );
  assert.deepEqual(assistantSuggestion.map((event) => event.action), ["task_suggestion_create"]);
  assert.equal(assistantSuggestion.every((event) => event.assistant_safe_category === "task_suggestion"), true);

  const assistantPlanning = service.listAuditEvents({ limit: 20, category: "planning" }, { assistant_safe: true });
  assert.deepEqual(assistantPlanning.map((event) => event.action), ["planning_recommendation_create"]);
  assert.equal(assistantPlanning.every((event) => event.assistant_safe_category === "planning"), true);

  const operatorSync = service.listAuditEvents({ limit: 20, category: "sync" });
  assert.deepEqual(operatorSync.map((event) => event.action), ["mailbox_sync"]);
  assert.equal(operatorSync[0]?.summary, undefined);
  assert.equal(operatorSync[0]?.metadata_redacted, undefined);
  assert.equal(operatorSync[0]?.assistant_safe_category, undefined);

  const operatorPlanning = service.listAuditEvents({ limit: 20, category: "planning" });
  assert.deepEqual(operatorPlanning.map((event) => event.action), ["planning_recommendation_create"]);
  assert.equal(
    operatorPlanning.some((event) => event.action === "planning_recommendation_policy_archived"),
    false,
  );
});

test("phase-29 evidence review keeps policy formatter ordered while suppressing empty cue rows", () => {
  const { service } = createFixture();
  const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  const formatted = formatPlanningRecommendationPolicyReport(policyReport);

  const primaryIndex = formatted.indexOf("Primary Policy Attention");
  const backlogIndex = formatted.indexOf("Active Policy Backlog");
  const exitsIndex = formatted.indexOf("Recent Policy Exits");
  const watchlistIndex = formatted.indexOf("Governance Hygiene Watchlist");
  const historyIndex = formatted.indexOf("Compressed Policy History By Family");
  const rawIndex = formatted.indexOf("Recent Raw Governance Events");
  const retentionIndex = formatted.indexOf("Retention Candidates");

  assert.notEqual(primaryIndex, -1);
  assert.notEqual(backlogIndex, -1);
  assert.notEqual(exitsIndex, -1);
  assert.notEqual(watchlistIndex, -1);
  assert.notEqual(historyIndex, -1);
  assert.notEqual(rawIndex, -1);
  assert.notEqual(retentionIndex, -1);
  assert.ok(primaryIndex < backlogIndex);
  assert.ok(backlogIndex < exitsIndex);
  assert.ok(exitsIndex < watchlistIndex);
  assert.ok(watchlistIndex < historyIndex);
  assert.ok(historyIndex < rawIndex);
  assert.ok(rawIndex < retentionIndex);
  assert.doesNotMatch(formatted, /Proposed cue:/);
  assert.doesNotMatch(formatted, /Dismissed cue:/);
  assert.doesNotMatch(formatted, /Archived cue:/);
  assert.doesNotMatch(formatted, /Superseded cue:/);
  assert.doesNotMatch(formatted, /Recent exit cue:/);
  assert.doesNotMatch(formatted, /Retention cue:/);
  assert.doesNotMatch(formatted, /Repeated-family cue:/);
  assert.doesNotMatch(formatted, /Mixed-outcome cue:/);
  assert.doesNotMatch(formatted, /Active proposed summary:/);
  assert.doesNotMatch(formatted, /Retention summary:/);
  assert.doesNotMatch(formatted, /Top active proposed:/);
  assert.doesNotMatch(formatted, /Top retention candidate:/);
});

test("phase-29 policy formatter hides the entire cue block when every cue is empty", () => {
  const { service } = createFixture();
  const policyReport = service.getPlanningRecommendationPolicyReport(cliIdentity);
  const formatted = formatPlanningRecommendationPolicyReport({
    ...policyReport,
    top_active_proposed_summary: null,
    top_active_dismissed_summary: null,
    top_archived_summary: null,
    top_superseded_summary: null,
    top_recent_policy_exit_summary: null,
    top_retention_candidate_summary: null,
    top_repeated_policy_family_summary: null,
    top_mixed_outcome_policy_family_summary: null,
  });

  assert.doesNotMatch(formatted, /Proposed cue:/);
  assert.doesNotMatch(formatted, /Dismissed cue:/);
  assert.doesNotMatch(formatted, /Archived cue:/);
  assert.doesNotMatch(formatted, /Superseded cue:/);
  assert.doesNotMatch(formatted, /Recent exit cue:/);
  assert.doesNotMatch(formatted, /Retention cue:/);
  assert.doesNotMatch(formatted, /Repeated-family cue:/);
  assert.doesNotMatch(formatted, /Mixed-outcome cue:/);
  assert.match(
    formatted,
    /Mixed-outcome policy families:[^\n]*\n\nActive Policy Backlog/,
  );
});

test("phase-18 http audit reads stay assistant-safe and policy prune stays operator-only", async () => {
  const now = Date.now();
  const { service, config, policy } = createFixture();
  const rawDb = (service.db as any).db;

  const task = service.createTask(cliIdentity, {
    title: "Phase 18 HTTP audit task",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
  });
  service.completeTask(cliIdentity, task.task_id, "HTTP completion note");
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "planning_recommendation_policy_archived",
    target_type: "planning_recommendation_family",
    target_id: "urgent_unscheduled_tasks:schedule_task_block:system_generated",
    outcome: "success",
    metadata: {
      note: "Assistant should not see this policy audit event",
    },
  });

  for (const suffix of ["a", "b", "c"]) {
    service.db.createPlanningRecommendation(cliIdentity, {
      kind: "schedule_task_block",
      status: "rejected",
      priority: "high",
      source: "system_generated",
      source_task_id: `phase18-http-policy-${suffix}`,
      proposed_title: `Phase 18 HTTP closed ${suffix}`,
      reason_code: "task_schedule_pressure",
      reason_summary: `Phase 18 HTTP closed ${suffix}.`,
      dedupe_key: `schedule_task_block:phase18-http-policy-${suffix}`,
      source_fingerprint: `phase18-http-policy-${suffix}`,
      group_key: "urgent_unscheduled_tasks",
      group_summary: "1 urgent task still has no block",
      outcome_state: "handled_elsewhere",
      outcome_recorded_at: new Date(now - 60 * 60 * 1000).toISOString(),
      first_action_at: new Date(now - 90 * 60 * 1000).toISOString(),
      first_action_type: "reject",
      closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
      close_reason_code: "rejected_handled_elsewhere",
      slot_state: "ready",
      trigger_signals: ["task_schedule_pressure"],
      suppressed_signals: [],
      resolved_at: new Date(now - 60 * 60 * 1000).toISOString(),
    });
  }

  const openRecommendation = service.db.createPlanningRecommendation(cliIdentity, {
    kind: "schedule_task_block",
    status: "pending",
    priority: "high",
    source: "system_generated",
    source_task_id: "phase18-http-policy-open",
    proposed_title: "Phase 18 HTTP policy open",
    reason_code: "task_schedule_pressure",
    reason_summary: "Phase 18 HTTP policy open.",
    dedupe_key: "schedule_task_block:phase18-http-policy-open",
    source_fingerprint: "phase18-http-policy-open",
    group_key: "urgent_unscheduled_tasks",
    group_summary: "1 urgent task still has no block",
    slot_state: "ready",
    trigger_signals: ["task_schedule_pressure"],
    suppressed_signals: [],
  });
  service.reviewPlanningRecommendationHygiene(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    decision: "investigate_externalized_workflow",
    note: "Phase 18 HTTP review",
  });
  service.recordPlanningRecommendationHygieneProposal(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Phase 18 HTTP proposal",
  });
  rawDb
    .prepare(
      `UPDATE planning_recommendations
       SET status = 'superseded',
           outcome_state = 'source_resolved',
           outcome_recorded_at = ?,
           closed_at = ?,
           close_reason_code = 'source_resolved',
           resolved_at = ?,
           updated_at = ?
       WHERE recommendation_id = ?`,
    )
    .run(
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      openRecommendation.recommendation_id,
    );
  service.archivePlanningRecommendationPolicy(cliIdentity, {
    group: "urgent_unscheduled_tasks",
    kind: "schedule_task_block",
    source: "system_generated",
    note: "Archive this old policy row",
  });
  const governanceEvent = service.db.listPlanningHygienePolicyGovernanceEvents()[0];
  assert.ok(governanceEvent);
  rawDb
    .prepare(`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`)
    .run(new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString(), governanceEvent.governance_event_id);

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const assistantAuditResponse = await fetch(`${baseUrl}/v1/audit/events?limit=20`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase18-http-test",
      },
    });
    assert.equal(assistantAuditResponse.status, 200);
    const assistantAuditPayload = (await assistantAuditResponse.json()) as {
      events?: Array<{ action?: string; metadata_redacted?: boolean; summary?: string; metadata_json?: string }>;
    };
    assert.equal(
      assistantAuditPayload.events?.some((event) => event.action === "planning_recommendation_policy_archived"),
      false,
    );
    const assistantTaskCreate = assistantAuditPayload.events?.find((event) => event.action === "task_create");
    assert.equal(assistantTaskCreate?.metadata_redacted, true);
    assert.equal(assistantTaskCreate?.summary, "Task created.");
    const assistantTaskCreateMetadata = JSON.parse(assistantTaskCreate?.metadata_json ?? "{}") as Record<string, unknown>;
    assert.equal("title" in assistantTaskCreateMetadata, false);

    const operatorAuditResponse = await fetch(`${baseUrl}/v1/audit/events?limit=20`, {
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "x-personal-ops-client": "phase18-http-test",
      },
    });
    assert.equal(operatorAuditResponse.status, 200);
    const operatorAuditPayload = (await operatorAuditResponse.json()) as {
      events?: Array<{ action?: string; metadata_json?: string }>;
    };
    assert.equal(
      operatorAuditPayload.events?.some((event) => event.action === "planning_recommendation_policy_archived"),
      true,
    );

    const assistantPruneResponse = await fetch(`${baseUrl}/v1/planning-recommendations/policy/prune`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase18-http-test",
      },
      body: JSON.stringify({
        older_than_days: 90,
        event_type: "archived",
        dry_run: true,
      }),
    });
    assert.equal(assistantPruneResponse.status, 400);
    const assistantPrunePayload = (await assistantPruneResponse.json()) as { error?: string };
    assert.match(assistantPrunePayload.error ?? "", /operator channel/i);

    const operatorPruneResponse = await fetch(`${baseUrl}/v1/planning-recommendations/policy/prune`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json",
        "x-personal-ops-client": "phase18-http-test",
        "x-personal-ops-requested-by": "operator-http",
      },
      body: JSON.stringify({
        older_than_days: 90,
        event_type: "archived",
        dry_run: true,
      }),
    });
    assert.equal(operatorPruneResponse.status, 200);
    const operatorPrunePayload = (await operatorPruneResponse.json()) as {
      planning_recommendation_policy_prune?: { dry_run?: boolean; candidate_count?: number; pruned_count?: number };
    };
    assert.equal(operatorPrunePayload.planning_recommendation_policy_prune?.dry_run, true);
    assert.equal(operatorPrunePayload.planning_recommendation_policy_prune?.candidate_count, 1);
    assert.equal(operatorPrunePayload.planning_recommendation_policy_prune?.pruned_count, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-31 http audit category filter stays additive and validates unknown categories", async () => {
  const { service, config, policy } = createFixture();

  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "mailbox_sync",
    target_type: "mailbox",
    target_id: "jayday1104@gmail.com",
    outcome: "success",
    metadata: {
      sync_result: {
        messages_refreshed: 15,
        messages_deleted: 0,
        threads_recomputed: 4,
        duration_ms: 250,
      },
    },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "planning_recommendation_create",
    target_type: "planning_recommendation",
    target_id: "phase31-http-recommendation",
    outcome: "success",
    metadata: {
      kind: "schedule_task_block",
      source: "assistant_created",
      task_id: "phase31-http-task",
    },
  });
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "planning_recommendation_policy_archived",
    target_type: "planning_recommendation_family",
    target_id: "urgent_unscheduled_tasks:schedule_task_block:system_generated",
    outcome: "success",
    metadata: { note: "Should stay out of filtered planning audit reads" },
  });

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const assistantDefaultResponse = await fetch(`${baseUrl}/v1/audit/events?limit=20`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase31-http-test",
      },
    });
    assert.equal(assistantDefaultResponse.status, 200);
    const assistantDefaultPayload = (await assistantDefaultResponse.json()) as {
      events?: Array<{ action?: string; assistant_safe_category?: string; metadata_redacted?: boolean }>;
    };
    assert.deepEqual(
      [...(assistantDefaultPayload.events?.map((event) => event.action) ?? [])].sort(),
      ["mailbox_sync", "planning_recommendation_create"],
    );
    assert.equal(assistantDefaultPayload.events?.every((event) => event.metadata_redacted === true), true);

    const assistantPlanningResponse = await fetch(`${baseUrl}/v1/audit/events?limit=20&category=planning`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase31-http-test",
      },
    });
    assert.equal(assistantPlanningResponse.status, 200);
    const assistantPlanningPayload = (await assistantPlanningResponse.json()) as {
      events?: Array<{ action?: string; assistant_safe_category?: string; metadata_redacted?: boolean }>;
    };
    assert.deepEqual(
      assistantPlanningPayload.events?.map((event) => event.action),
      ["planning_recommendation_create"],
    );
    assert.equal(
      assistantPlanningPayload.events?.every((event) => event.assistant_safe_category === "planning"),
      true,
    );
    assert.equal(assistantPlanningPayload.events?.every((event) => event.metadata_redacted === true), true);

    const operatorSyncResponse = await fetch(`${baseUrl}/v1/audit/events?limit=20&category=sync`, {
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "x-personal-ops-client": "phase31-http-test",
      },
    });
    assert.equal(operatorSyncResponse.status, 200);
    const operatorSyncPayload = (await operatorSyncResponse.json()) as {
      events?: Array<{ action?: string; summary?: string; metadata_redacted?: boolean; assistant_safe_category?: string }>;
    };
    assert.deepEqual(operatorSyncPayload.events?.map((event) => event.action), ["mailbox_sync"]);
    assert.equal(operatorSyncPayload.events?.[0]?.summary, undefined);
    assert.equal(operatorSyncPayload.events?.[0]?.metadata_redacted, undefined);
    assert.equal(operatorSyncPayload.events?.[0]?.assistant_safe_category, undefined);

    const invalidCategoryResponse = await fetch(`${baseUrl}/v1/audit/events?limit=20&category=bogus`, {
      headers: {
        authorization: `Bearer ${config.assistantApiToken}`,
        "x-personal-ops-client": "phase31-http-test",
      },
    });
    assert.equal(invalidCategoryResponse.status, 400);
    const invalidCategoryPayload = (await invalidCategoryResponse.json()) as { error?: string };
    assert.match(
      invalidCategoryPayload.error ?? "",
      /category must be one of: sync, task, task_suggestion, planning/i,
    );

    for (const unsupportedParam of ["action", "target_type", "target_id", "client"]) {
      const unsupportedResponse = await fetch(`${baseUrl}/v1/audit/events?limit=20&${unsupportedParam}=ignored`, {
        headers: {
          authorization: `Bearer ${config.assistantApiToken}`,
          "x-personal-ops-client": "phase31-http-test",
        },
      });
      assert.equal(unsupportedResponse.status, 400);
      const unsupportedPayload = (await unsupportedResponse.json()) as { error?: string };
      assert.match(unsupportedPayload.error ?? "", /unsupported query parameter/i);
      assert.match(unsupportedPayload.error ?? "", new RegExp(`\\b${unsupportedParam}\\b`, "i"));
      assert.match(unsupportedPayload.error ?? "", /only limit and category are supported/i);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-31 mcp audit tool only exposes limit and category inputs", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/mcp-server.ts"), "utf8");
  const auditToolSchema = source.match(
    /name: "audit_events_recent"[\s\S]*?properties: \{([\s\S]*?)\n\s*\},\n\s*additionalProperties: false,/,
  );
  assert.ok(auditToolSchema);
  const schemaBody = auditToolSchema[1] ?? "";
  assert.match(schemaBody, /limit: \{ type: "number" \}/);
  assert.match(schemaBody, /category: \{ type: "string", enum: \["sync", "task", "task_suggestion", "planning"\] \}/);
  assert.doesNotMatch(schemaBody, /action: \{ type: "string" \}/);
  assert.doesNotMatch(schemaBody, /target_type: \{ type: "string" \}/);
  assert.doesNotMatch(schemaBody, /target_id: \{ type: "string" \}/);
  assert.doesNotMatch(schemaBody, /client: \{ type: "string" \}/);
  assert.match(source, /assertAllowedToolArgs\(args, \["limit", "category"\], "audit_events_recent"\)/);
  assert.doesNotMatch(source, /search\.set\("action", args\.action\)/);
  assert.doesNotMatch(source, /search\.set\("target_type", args\.target_type\)/);
  assert.doesNotMatch(source, /search\.set\("target_id", args\.target_id\)/);
  assert.doesNotMatch(source, /search\.set\("client", args\.client\)/);
});

test("phase-7 github login stores verified auth and logout clears it", async () => {
  const { service } = createFixture({
    githubEnabled: true,
    includedGithubRepositories: ["acme/api"],
    githubVerifyImpl: async (_token, keychainService) => ({
      login: "octocat",
      keychain_service: keychainService,
      keychain_account: "octocat",
      connected_at: "2026-03-29T12:00:00.000Z",
      updated_at: "2026-03-29T12:00:00.000Z",
      profile_json: JSON.stringify({ login: "octocat" }),
    }),
  });

  const account = await service.loginGithubPat(GITHUB_TEST_IDENTITY, "ghp_test_token");
  assert.equal(account.login, "octocat");
  assert.equal(service.getGithubStatusReport().connected_login, "octocat");
  assert.equal(service.getGithubStatusReport().authenticated, true);

  const logout = service.logoutGithub(GITHUB_TEST_IDENTITY);
  assert.equal(logout.cleared, true);
  assert.equal(logout.login, "octocat");
  assert.equal(service.getGithubStatusReport().connected_login, null);
  assert.equal(service.getGithubStatusReport().authenticated, false);
});

test("phase-7 github sync feeds status, worklist, and read-only routes", async () => {
  const { service, config } = createFixture({
    githubEnabled: true,
    includedGithubRepositories: ["acme/api"],
    githubSyncImpl: async (_token, repositories, viewerLogin) => {
      assert.deepEqual(repositories, ["acme/api"]);
      assert.equal(viewerLogin, "octocat");
      return {
        repositories_scanned_count: 1,
        pull_requests: [
          {
            pr_key: "acme/api#12",
            repository: "acme/api",
            owner: "acme",
            repo: "api",
            number: 12,
            title: "Review me",
            html_url: "https://github.com/acme/api/pull/12",
            author_login: "teammate",
            is_draft: false,
            state: "OPEN",
            created_at: "2026-03-29T11:00:00.000Z",
            updated_at: "2026-03-29T12:00:00.000Z",
            requested_reviewers: ["octocat"],
            head_sha: "abc123",
            check_state: "unknown",
            review_state: "review_requested",
            mergeable_state: "clean",
            is_review_requested: true,
            is_authored_by_viewer: false,
            attention_kind: "github_review_requested",
            attention_summary: "Review requested: acme/api#12 Review me",
          },
          {
            pr_key: "acme/api#18",
            repository: "acme/api",
            owner: "acme",
            repo: "api",
            number: 18,
            title: "Fix failing checks",
            html_url: "https://github.com/acme/api/pull/18",
            author_login: "octocat",
            is_draft: false,
            state: "OPEN",
            created_at: "2026-03-29T09:00:00.000Z",
            updated_at: "2026-03-29T12:30:00.000Z",
            requested_reviewers: [],
            head_sha: "def456",
            check_state: "failing",
            review_state: "commented",
            mergeable_state: "dirty",
            is_review_requested: false,
            is_authored_by_viewer: true,
            attention_kind: "github_pr_checks_failing",
            attention_summary: "Checks failing: acme/api#18 Fix failing checks",
          },
        ],
      };
    },
  });
  await service.loginGithubPat(GITHUB_TEST_IDENTITY, "ghp_test_token");
  await service.syncGithub(GITHUB_TEST_IDENTITY);

  const status = service.getGithubStatusReport();
  assert.equal(status.review_requested_count, 1);
  assert.equal(status.authored_pr_attention_count, 1);
  assert.match(status.top_item_summary ?? "", /checks failing/i);

  const worklist = await service.getWorklistReport({ httpReachable: true });
  assert.equal(worklist.items.some((item) => item.kind === "github_review_requested"), true);
  assert.equal(worklist.items.some((item) => item.kind === "github_pr_checks_failing"), true);

  const server = createHttpServer(service, config, { notificationsTitlePrefix: "Personal Ops", allowSend: false, auditDefaultLimit: 50 });
  await new Promise<void>((resolve) => server.listen(0, config.serviceHost, () => resolve()));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://${config.serviceHost}:${address.port}`;
    const statusResponse = await fetch(`${baseUrl}/v1/github/status`, {
      headers: { authorization: `Bearer ${config.apiToken}`, "x-personal-ops-client": "github-http-test" },
    });
    assert.equal(statusResponse.status, 200);
    const statusPayload = (await statusResponse.json()) as { github: { review_requested_count: number } };
    assert.equal(statusPayload.github.review_requested_count, 1);

    const pullsResponse = await fetch(`${baseUrl}/v1/github/pulls`, {
      headers: { authorization: `Bearer ${config.apiToken}`, "x-personal-ops-client": "github-http-test" },
    });
    assert.equal(pullsResponse.status, 200);
    const pullsPayload = (await pullsResponse.json()) as { pull_requests: Array<{ pr_key: string }> };
    assert.deepEqual(
      pullsPayload.pull_requests.map((pull) => pull.pr_key),
      ["acme/api#18", "acme/api#12"],
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("phase-7 workflows rank github pull request work above governance noise in healthy state", async () => {
  const fakeService = {
    getStatusReport: async () => ({
      state: "ready",
      mailbox: { connected: "machine@example.com", configured: "machine@example.com" },
    }),
    getWorklistReport: async () => ({
      generated_at: "2026-03-29T12:00:00.000Z",
      state: "ready",
      counts_by_severity: { critical: 0, warn: 1, info: 1 },
      send_window: { active: false },
      planning_groups: [],
      items: [
        {
          item_id: "planning-policy",
          kind: "planning_policy_governance_needed",
          severity: "info",
          title: "Policy review",
          summary: "Review governance tuning",
          target_type: "planning_recommendation_family",
          target_id: "policy-1",
          created_at: "2026-03-29T10:00:00.000Z",
          suggested_command: "personal-ops recommendation policy",
          metadata_json: "{}",
        },
        {
          item_id: "github-pr",
          kind: "github_pr_checks_failing",
          severity: "warn",
          title: "GitHub checks failing",
          summary: "Checks failing: acme/api#18 Fix failing checks",
          target_type: "github_pull_request",
          target_id: "acme/api#18",
          created_at: "2026-03-29T12:30:00.000Z",
          suggested_command: "personal-ops github pr acme/api#18",
          metadata_json: "{}",
        },
      ],
    }),
    listPlanningRecommendations: () => [],
    getInboxAutopilotReport: async () => ({
      generated_at: "2026-03-29T12:00:00.000Z",
      readiness: "ready",
      summary: "No inbox autopilot groups are active.",
      top_item_summary: null,
      prepared_draft_count: 0,
      groups: [],
    }),
    listNeedsReplyThreads: () => [],
    listFollowupThreads: () => [],
    listUpcomingCalendarEvents: () => [],
    compareNextActionableRecommendations: () => 0,
    getPlanningRecommendationDetail: () => null,
    getRelatedDocsForTarget: () => [],
  };

  const nowNext = await buildNowNextWorkflowReport(fakeService, { httpReachable: true });
  const prepDay = await buildPrepDayWorkflowReport(fakeService, { httpReachable: true });

  assert.equal(nowNext.actions[0]?.target_type, "github_pull_request");
  assert.equal(nowNext.actions[0]?.target_id, "acme/api#18");
  assert.equal(prepDay.actions[0]?.target_type, "github_pull_request");
});

test("assistant-led phase 5 drive sync feeds docs, sheets, and read-only routes", async () => {
  const syncedAt = "2026-03-29T14:00:00.000Z";
  const { service, config, policy } = createFixture({
    driveEnabled: true,
    includedDriveFolders: ["folder-123"],
    includedDriveFiles: ["doc-123", "file-456", "sheet-789"],
    driveVerifyImpl: async () => {},
    driveSyncImpl: async (_tokensJson, _clientConfig, activeConfig) => {
      assert.deepEqual(activeConfig.includedDriveFolders, ["folder-123"]);
      assert.deepEqual(activeConfig.includedDriveFiles, ["doc-123", "file-456", "sheet-789"]);
      return {
        files: [
          {
            file_id: "doc-123",
            name: "Operator prep doc",
            mime_type: "application/vnd.google-apps.document",
            web_view_link: "https://docs.google.com/document/d/doc-123/edit",
            parents: [],
            scope_source: "included_file",
            drive_modified_time: syncedAt,
            updated_at: syncedAt,
            synced_at: syncedAt,
          },
          {
            file_id: "file-456",
            name: "Reference PDF",
            mime_type: "application/pdf",
            web_view_link: "https://drive.google.com/file/d/file-456/view",
            parents: [],
            scope_source: "included_file",
            drive_modified_time: syncedAt,
            updated_at: syncedAt,
            synced_at: syncedAt,
          },
          {
            file_id: "sheet-789",
            name: "Prep tracker",
            mime_type: "application/vnd.google-apps.spreadsheet",
            web_view_link: "https://docs.google.com/spreadsheets/d/sheet-789/edit",
            parents: [],
            scope_source: "included_file",
            drive_modified_time: syncedAt,
            updated_at: syncedAt,
            synced_at: syncedAt,
          },
        ],
        docs: [
          {
            file_id: "doc-123",
            title: "Operator prep doc",
            mime_type: "application/vnd.google-apps.document",
            web_view_link: "https://docs.google.com/document/d/doc-123/edit",
            text_content: "Agenda and prep notes",
            snippet: "Agenda and prep notes",
            updated_at: syncedAt,
            synced_at: syncedAt,
          },
        ],
        sheets: [
          {
            file_id: "sheet-789",
            title: "Prep tracker",
            mime_type: "application/vnd.google-apps.spreadsheet",
            web_view_link: "https://docs.google.com/spreadsheets/d/sheet-789/edit",
            tab_names: ["Prep", "Status"],
            header_preview: ["Owner", "Status"],
            cell_preview: [["Sam", "Ready"]],
            snippet: "Headers: Owner | Status Sam | Ready",
            updated_at: syncedAt,
            synced_at: syncedAt,
          },
        ],
      };
    },
  });

  await service.syncDrive(cliIdentity);

  const status = await service.getStatusReport({ httpReachable: true });
  assert.equal(status.drive.enabled, true);
  assert.equal(status.drive.sync_status, "ready");
  assert.equal(status.drive.indexed_file_count, 3);
  assert.equal(status.drive.indexed_doc_count, 1);
  assert.equal(status.drive.indexed_sheet_count, 1);

  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(0, config.serviceHost, () => resolve()));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://${config.serviceHost}:${address.port}`;

    const statusResponse = await fetch(`${baseUrl}/v1/drive/status`, {
      headers: { authorization: `Bearer ${config.apiToken}`, "x-personal-ops-client": "drive-http-test" },
    });
    assert.equal(statusResponse.status, 200);
    const statusPayload = (await statusResponse.json()) as { drive: { indexed_doc_count: number; indexed_sheet_count: number } };
    assert.equal(statusPayload.drive.indexed_doc_count, 1);
    assert.equal(statusPayload.drive.indexed_sheet_count, 1);

    const filesResponse = await fetch(`${baseUrl}/v1/drive/files`, {
      headers: { authorization: `Bearer ${config.apiToken}`, "x-personal-ops-client": "drive-http-test" },
    });
    assert.equal(filesResponse.status, 200);
    const filesPayload = (await filesResponse.json()) as { files: Array<{ file_id: string }> };
    assert.deepEqual(filesPayload.files.map((file) => file.file_id), ["doc-123", "sheet-789", "file-456"]);

    const docResponse = await fetch(`${baseUrl}/v1/drive/docs/doc-123`, {
      headers: { authorization: `Bearer ${config.apiToken}`, "x-personal-ops-client": "drive-http-test" },
    });
    assert.equal(docResponse.status, 200);
    const docPayload = (await docResponse.json()) as { doc: { file_id: string; snippet?: string } };
    assert.equal(docPayload.doc.file_id, "doc-123");
    assert.match(docPayload.doc.snippet ?? "", /Agenda/);

    const sheetResponse = await fetch(`${baseUrl}/v1/drive/sheets/sheet-789`, {
      headers: { authorization: `Bearer ${config.apiToken}`, "x-personal-ops-client": "drive-http-test" },
    });
    assert.equal(sheetResponse.status, 200);
    const sheetPayload = (await sheetResponse.json()) as { sheet: { file_id: string; tab_names: string[] } };
    assert.equal(sheetPayload.sheet.file_id, "sheet-789");
    assert.deepEqual(sheetPayload.sheet.tab_names, ["Prep", "Status"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("assistant-led phase 5 related files prefer explicit links, shared parents, and recent fallback", async () => {
  const syncedAt = "2026-03-29T15:00:00.000Z";
  const { service, accountEmail } = createFixture({
    driveEnabled: true,
    includedDriveFiles: ["doc-calendar", "doc-task", "doc-draft", "doc-fallback", "sheet-sibling"],
  });

  service.db.replaceDriveFiles([
    {
      file_id: "doc-calendar",
      name: "Meeting doc",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-calendar/edit",
      parents: ["folder-shared"],
      scope_source: "included_file",
      drive_modified_time: syncedAt,
      updated_at: syncedAt,
      synced_at: syncedAt,
    },
    {
      file_id: "doc-task",
      name: "Task doc",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-task/edit",
      parents: [],
      scope_source: "included_file",
      drive_modified_time: syncedAt,
      updated_at: syncedAt,
      synced_at: syncedAt,
    },
    {
      file_id: "doc-draft",
      name: "Draft doc",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-draft/edit",
      parents: [],
      scope_source: "included_file",
      drive_modified_time: syncedAt,
      updated_at: syncedAt,
      synced_at: syncedAt,
    },
    {
      file_id: "doc-fallback",
      name: "Fallback doc",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-fallback/edit",
      parents: [],
      scope_source: "included_file",
      drive_modified_time: "2026-03-29T16:00:00.000Z",
      updated_at: "2026-03-29T16:00:00.000Z",
      synced_at: "2026-03-29T16:00:00.000Z",
    },
    {
      file_id: "sheet-sibling",
      name: "Shared tracker",
      mime_type: "application/vnd.google-apps.spreadsheet",
      web_view_link: "https://docs.google.com/spreadsheets/d/sheet-sibling/edit",
      parents: ["folder-shared"],
      scope_source: "included_file",
      drive_modified_time: "2026-03-29T15:30:00.000Z",
      updated_at: "2026-03-29T15:30:00.000Z",
      synced_at: "2026-03-29T15:30:00.000Z",
    },
  ]);
  service.db.replaceDriveDocs([
    {
      file_id: "doc-calendar",
      title: "Meeting doc",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-calendar/edit",
      text_content: "Calendar-linked notes",
      snippet: "Calendar-linked notes",
      updated_at: syncedAt,
      synced_at: syncedAt,
    },
    {
      file_id: "doc-task",
      title: "Task doc",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-task/edit",
      text_content: "Task-linked notes",
      snippet: "Task-linked notes",
      updated_at: syncedAt,
      synced_at: syncedAt,
    },
    {
      file_id: "doc-draft",
      title: "Draft doc",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-draft/edit",
      text_content: "Draft-linked notes",
      snippet: "Draft-linked notes",
      updated_at: syncedAt,
      synced_at: syncedAt,
    },
    {
      file_id: "doc-fallback",
      title: "Fallback doc",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-fallback/edit",
      text_content: "Recent fallback notes",
      snippet: "Recent fallback notes",
      updated_at: "2026-03-29T16:00:00.000Z",
      synced_at: "2026-03-29T16:00:00.000Z",
    },
  ]);
  service.db.replaceDriveSheets([
    {
      file_id: "sheet-sibling",
      title: "Shared tracker",
      mime_type: "application/vnd.google-apps.spreadsheet",
      web_view_link: "https://docs.google.com/spreadsheets/d/sheet-sibling/edit",
      tab_names: ["Prep"],
      header_preview: ["Owner", "Status"],
      cell_preview: [["Sam", "Ready"]],
      snippet: "Headers: Owner | Status",
      updated_at: "2026-03-29T15:30:00.000Z",
      synced_at: "2026-03-29T15:30:00.000Z",
    },
  ]);

  service.db.upsertCalendarEvent({
    event_id: "event-drive",
    provider_event_id: "event-drive",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Drive-linked meeting",
    status: "confirmed",
    start_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    end_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    attendee_count: 1,
    created_by_personal_ops: false,
    updated_at: syncedAt,
    synced_at: syncedAt,
    notes: "Agenda https://docs.google.com/document/d/doc-calendar/edit",
  });
  const task = service.createTask(cliIdentity, {
    title: "Task with doc",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    notes: "See https://docs.google.com/document/d/doc-task/edit",
  });
  const draft = createDraft(service, accountEmail, {
    body_text: "Text draft link https://docs.google.com/document/d/doc-draft/edit",
  });

  (service as unknown as { refreshDriveLinkProvenance(): void }).refreshDriveLinkProvenance();

  const eventDocs = service.getRelatedDocsForTarget("calendar_event", "event-drive");
  const eventFiles = service.getRelatedFilesForTarget("calendar_event", "event-drive", { allowFallback: true, maxItems: 3 });
  const taskDocs = service.getRelatedDocsForTarget("task", task.task_id);
  const draftDocs = service.getRelatedDocsForTarget("draft_artifact", draft.artifact_id);
  const fallbackDocs = service.getRelatedDocsForTarget("task", "missing-task", { allowFallback: true, fallbackLimit: 1 });

  assert.equal(eventDocs[0]?.file_id, "doc-calendar");
  assert.equal(eventDocs[0]?.match_type, "explicit_link");
  assert.deepEqual(
    eventFiles.map((file) => [file.file_id, file.match_type]),
    [
      ["doc-calendar", "explicit_link"],
      ["sheet-sibling", "shared_parent_folder"],
      ["doc-fallback", "recent_file_fallback"],
    ],
  );
  assert.equal(taskDocs[0]?.file_id, "doc-task");
  assert.equal(draftDocs[0]?.file_id, "doc-draft");
  assert.deepEqual(fallbackDocs.map((doc) => doc.file_id), ["doc-fallback"]);
  assert.equal(fallbackDocs[0]?.match_type, "recent_doc_fallback");
});

test("assistant-led phase 5 prep-meetings attaches related files without changing meeting ranking", async () => {
  const { service, accountEmail } = createFixture({
    driveEnabled: true,
    includedDriveFiles: ["doc-meeting", "sheet-meeting"],
  });
  const now = new Date().toISOString();
  const soonStart = new Date(Date.now() + 60 * 60 * 1000);
  service.db.replaceDriveFiles([
    {
      file_id: "doc-meeting",
      name: "Meeting packet",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-meeting/edit",
      parents: [],
      scope_source: "included_file",
      drive_modified_time: now,
      updated_at: now,
      synced_at: now,
    },
    {
      file_id: "sheet-meeting",
      name: "Meeting tracker",
      mime_type: "application/vnd.google-apps.spreadsheet",
      web_view_link: "https://docs.google.com/spreadsheets/d/sheet-meeting/edit",
      parents: [],
      scope_source: "included_file",
      drive_modified_time: now,
      updated_at: now,
      synced_at: now,
    },
  ]);
  service.db.replaceDriveDocs([
    {
      file_id: "doc-meeting",
      title: "Meeting packet",
      mime_type: "application/vnd.google-apps.document",
      web_view_link: "https://docs.google.com/document/d/doc-meeting/edit",
      text_content: "Meeting prep packet",
      snippet: "Meeting prep packet",
      updated_at: now,
      synced_at: now,
    },
  ]);
  service.db.replaceDriveSheets([
    {
      file_id: "sheet-meeting",
      title: "Meeting tracker",
      mime_type: "application/vnd.google-apps.spreadsheet",
      web_view_link: "https://docs.google.com/spreadsheets/d/sheet-meeting/edit",
      tab_names: ["Prep"],
      header_preview: ["Owner", "Status"],
      cell_preview: [["Dana", "Ready"]],
      snippet: "Headers: Owner | Status Dana | Ready",
      updated_at: now,
      synced_at: now,
    },
  ]);
  service.db.upsertCalendarEvent({
    event_id: "primary:drive-phase8-meeting",
    provider_event_id: "drive-phase8-meeting",
    calendar_id: "primary",
    provider: "google",
    account: accountEmail,
    summary: "Drive enriched meeting",
    status: "confirmed",
    start_at: soonStart.toISOString(),
    end_at: new Date(soonStart.getTime() + 30 * 60 * 1000).toISOString(),
    is_all_day: false,
    is_busy: true,
    attendee_count: 1,
    created_by_personal_ops: false,
    updated_at: now,
    synced_at: now,
    notes: "Packet https://docs.google.com/document/d/doc-meeting/edit and tracker https://docs.google.com/spreadsheets/d/sheet-meeting/edit",
  });

  (service as unknown as { refreshDriveLinkProvenance(): void }).refreshDriveLinkProvenance();
  const report = await service.getPrepMeetingsWorkflowReport({ httpReachable: true, scope: "today" });
  const text = JSON.stringify(report.sections);

  assert.match(text, /Drive enriched meeting/);
  assert.match(text, /Meeting packet/);
  assert.match(text, /Meeting tracker/);
});

test("assistant-led phase 6 planning autopilot forms bounded bundles across task, follow-up, and event prep work", async () => {
  const { service, accountEmail } = createFixture();
  seedPlanningAutopilotFixture(service, accountEmail);

  const report = await service.getPlanningAutopilotReport({ httpReachable: true });

  assert.equal(report.bundles.length, 3);
  assert.deepEqual(report.bundles.map((bundle) => bundle.kind).sort(), ["event_prep", "task_block", "thread_followup"]);
  assert.equal(report.bundles.every((bundle) => bundle.recommendation_ids.length <= 3), true);
  assert.equal(report.bundles.every((bundle) => bundle.next_commands.length >= 2), true);
});

test("assistant-led phase 6 planning autopilot reuses inbox autopilot groups and meeting packets during bundle prep", async () => {
  const { service, accountEmail } = createFixture();
  seedPlanningAutopilotFixture(service, accountEmail);

  const report = await service.getPlanningAutopilotReport({ httpReachable: true });
  const followupBundle = report.bundles.find((bundle) => bundle.kind === "thread_followup");
  const eventBundle = report.bundles.find((bundle) => bundle.kind === "event_prep");
  assert.ok(followupBundle);
  assert.ok(eventBundle);

  const preparedFollowup = await service.preparePlanningAutopilotBundle(cliIdentity, followupBundle!.bundle_id);
  const preparedEvent = await service.preparePlanningAutopilotBundle(cliIdentity, eventBundle!.bundle_id);

  assert.equal(preparedFollowup.success, true);
  assert.equal(preparedEvent.success, true);
  assert.equal(preparedFollowup.bundle.related_artifacts.some((artifact) => artifact.artifact_type === "inbox_autopilot_group"), true);
  assert.equal(preparedEvent.bundle.related_artifacts.some((artifact) => artifact.artifact_type === "meeting_prep_packet"), true);
  assert.equal(preparedFollowup.bundle.apply_ready, true);
  assert.equal(preparedEvent.bundle.apply_ready, true);
});

test("assistant-led phase 6 grouped planning apply requires confirmation and records bundle audit history", async () => {
  const { service, accountEmail } = createFixture({
    verifyCalendarWriteImpl: async () => {},
    createCalendarEventImpl: async (_calendarId, input) =>
      buildCalendarEventMetadata("planning-autopilot-apply", "primary", {
        summary: input.title ?? "Planning autopilot apply",
        start_at: input.start_at!,
        end_at: input.end_at!,
        source_task_id: input.source_task_id,
        created_by_personal_ops: true,
        etag: "etag-planning-autopilot-apply",
      }),
  });
  seedPlanningAutopilotFixture(service, accountEmail);

  const report = await service.getPlanningAutopilotReport({ httpReachable: true });
  const taskBundle = report.bundles.find((bundle) => bundle.kind === "task_block");
  assert.ok(taskBundle);

  await service.preparePlanningAutopilotBundle(cliIdentity, taskBundle!.bundle_id);
  await assert.rejects(
    () => service.applyPlanningAutopilotBundle(cliIdentity, taskBundle!.bundle_id, "Apply task bundle", false),
    /confirmation/i,
  );

  const applied = await service.applyPlanningAutopilotBundle(cliIdentity, taskBundle!.bundle_id, "Apply task bundle", true);
  const auditEvents = service.listAuditEvents({ limit: 20, action: "planning_autopilot_bundle_apply" });

  assert.equal(applied.state, "completed");
  assert.equal(auditEvents[0]?.target_id, taskBundle!.bundle_id);
  assert.match(auditEvents[0]?.metadata_json ?? "", /Apply task bundle/);
});

test("assistant-led phase 6 workflows prefer prepared planning bundles when the system is healthy", async () => {
  const { service, accountEmail } = createFixture({
    verifyCalendarWriteImpl: async () => {},
    createCalendarEventImpl: async (_calendarId, input) =>
      buildCalendarEventMetadata("planning-autopilot-workflow", "primary", {
        summary: input.title ?? "Planning autopilot workflow",
        start_at: input.start_at!,
        end_at: input.end_at!,
        source_task_id: input.source_task_id,
        created_by_personal_ops: true,
        etag: "etag-planning-autopilot-workflow",
      }),
  });
  seedPlanningAutopilotFixture(service, accountEmail);

  const report = await service.getPlanningAutopilotReport({ httpReachable: true });
  const taskBundle = report.bundles.find((bundle) => bundle.kind === "task_block");
  assert.ok(taskBundle);
  await service.preparePlanningAutopilotBundle(cliIdentity, taskBundle!.bundle_id);

  const nowNext = await service.getNowNextWorkflowReport({ httpReachable: true });
  const firstConcreteAction = nowNext.actions.find((action) => action.target_type !== "system");

  assert.equal(firstConcreteAction?.target_type, "planning_autopilot_bundle");
});

test("assistant-led phase 7 outbound autopilot groups reviewed inbox work and orphan approvals", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({ accountEmail });
  seedMailboxReadyState(service, accountEmail, "outbound-groups");
  const now = Date.now();

  service.db.upsertMailMessage(
    accountEmail,
    buildMessage("outbound-reply-1", accountEmail, {
      thread_id: "thread-outbound-reply",
      history_id: "outbound-reply-1",
      internal_date: String(now - 90 * 60 * 1000),
      label_ids: ["INBOX", "UNREAD"],
      from_header: "Client <client@example.com>",
      subject: "Outbound reply needed",
    }),
    new Date(now - 90 * 60 * 1000).toISOString(),
  );

  const inboxReport = await service.getInboxAutopilotReport({ httpReachable: true });
  const replyGroup = inboxReport.groups.find((group) => group.kind === "needs_reply");
  assert.ok(replyGroup);

  const prepared = await service.prepareInboxAutopilotGroup(cliIdentity, replyGroup!.group_id);
  const preparedDraft = prepared.drafts[0]!;
  const review = service.db.getLatestReviewItemForArtifact(preparedDraft.artifact_id);
  assert.ok(review);
  service.openReview(cliIdentity, review!.review_id);
  service.resolveReview(cliIdentity, review!.review_id, "Reviewed for outbound finish-work");

  const orphanDraft = createDraft(service, accountEmail, {
    subject: "Orphan approval draft",
    to: ["orphan@example.com"],
    providerDraftId: "provider-draft-orphan",
  });
  const orphanApproval = service.requestApproval(cliIdentity, orphanDraft.artifact_id, "Need singleton approval");

  const report = await service.getOutboundAutopilotReport({ httpReachable: true });
  const groupedReply = report.groups.find((group) => group.group_id === replyGroup!.group_id);
  const singleton = report.groups.find((group) => group.kind === "single_draft");
  const queue = await service.getAssistantActionQueueReport({ httpReachable: true });

  assert.ok(groupedReply);
  assert.equal(groupedReply?.state, "approval_ready");
  assert.equal(groupedReply?.kind, "reply_block");
  assert.ok(singleton);
  assert.equal(singleton?.approval_ids.includes(orphanApproval.approval_id), true);
  assert.equal(queue.actions.some((action) => action.action_id.startsWith("assistant.review-outbound-group:")), true);
});

test("assistant-led phase 7 grouped outbound approval and send stay confirmed, note-required, and audit logged", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({
    accountEmail,
    sendImpl: async (providerDraftId) => ({
      provider_message_id: `sent-${providerDraftId}`,
      provider_thread_id: `thread-${providerDraftId}`,
    }),
  });
  seedMailboxReadyState(service, accountEmail, "outbound-send");
  const now = Date.now();

  service.db.upsertMailMessage(
    accountEmail,
    buildMessage("outbound-send-1", accountEmail, {
      thread_id: "thread-outbound-send",
      history_id: "outbound-send-1",
      internal_date: String(now - 75 * 60 * 1000),
      label_ids: ["INBOX", "UNREAD"],
      from_header: "Client <client@example.com>",
      subject: "Send this reply",
    }),
    new Date(now - 75 * 60 * 1000).toISOString(),
  );

  const inboxReport = await service.getInboxAutopilotReport({ httpReachable: true });
  const replyGroup = inboxReport.groups.find((group) => group.kind === "needs_reply");
  assert.ok(replyGroup);
  const prepared = await service.prepareInboxAutopilotGroup(cliIdentity, replyGroup!.group_id);
  const review = service.db.getLatestReviewItemForArtifact(prepared.drafts[0]!.artifact_id);
  assert.ok(review);
  service.openReview(cliIdentity, review!.review_id);
  service.resolveReview(cliIdentity, review!.review_id, "Reviewed for grouped send");

  const requested = await service.requestApprovalForOutboundGroup(cliIdentity, replyGroup!.group_id, "Request grouped approval");
  assert.equal(requested.completed_approval_ids.length, 1);

  await assert.rejects(
    () => service.approveOutboundGroup(cliIdentity, replyGroup!.group_id, "Approve grouped work", false),
    /confirmation/i,
  );

  const approved = await service.approveOutboundGroup(cliIdentity, replyGroup!.group_id, "Approve grouped work", true);
  assert.equal(approved.completed_approval_ids.length, 1);

  await assert.rejects(
    () => service.sendOutboundGroup(cliIdentity, replyGroup!.group_id, "Send grouped work", true),
    /send window|disabled/i,
  );

  service.enableSendWindow(cliIdentity, 15, "Allow grouped outbound send");
  await assert.rejects(
    () => service.sendOutboundGroup(cliIdentity, replyGroup!.group_id, "Send grouped work", false),
    /confirmation/i,
  );

  const sent = await service.sendOutboundGroup(cliIdentity, replyGroup!.group_id, "Send grouped work", true);
  const refreshedGroup = await service.getOutboundAutopilotGroup(replyGroup!.group_id);
  const audit = service.listAuditEvents({ limit: 20, target_type: "outbound_autopilot_group" });

  assert.equal(sent.completed_approval_ids.length, 1);
  assert.equal(refreshedGroup.state, "completed");
  assert.equal(audit.some((event) => event.action === "outbound_autopilot_group_approve"), true);
  assert.equal(audit.some((event) => event.action === "outbound_autopilot_group_send"), true);
});

test("assistant-led phase 7 workflows prefer grouped outbound finish-work when it is ready", async () => {
  const accountEmail = "machine@example.com";
  const { service } = createFixture({ accountEmail });
  seedMailboxReadyState(service, accountEmail, "outbound-workflows");
  const now = Date.now();

  service.db.upsertMailMessage(
    accountEmail,
    buildMessage("outbound-workflow-1", accountEmail, {
      thread_id: "thread-outbound-workflow",
      history_id: "outbound-workflow-1",
      internal_date: String(now - 60 * 60 * 1000),
      label_ids: ["INBOX", "UNREAD"],
      from_header: "Client <client@example.com>",
      subject: "Outbound workflow reply",
    }),
    new Date(now - 60 * 60 * 1000).toISOString(),
  );

  const inboxReport = await service.getInboxAutopilotReport({ httpReachable: true });
  const replyGroup = inboxReport.groups.find((group) => group.kind === "needs_reply");
  assert.ok(replyGroup);
  const prepared = await service.prepareInboxAutopilotGroup(cliIdentity, replyGroup!.group_id);
  const review = service.db.getLatestReviewItemForArtifact(prepared.drafts[0]!.artifact_id);
  assert.ok(review);
  service.openReview(cliIdentity, review!.review_id);
  service.resolveReview(cliIdentity, review!.review_id, "Reviewed for outbound workflow");
  await service.requestApprovalForOutboundGroup(cliIdentity, replyGroup!.group_id, "Request grouped approval");

  const fakeService = {
    getStatusReport: async () => ({
      state: "ready",
      mailbox: { connected: accountEmail, configured: accountEmail },
    }),
    getWorklistReport: async () => ({
      generated_at: new Date().toISOString(),
      state: "ready",
      counts_by_severity: { critical: 0, warn: 0, info: 0 },
      send_window: { active: false },
      planning_groups: [],
      items: [],
    }),
    listPlanningRecommendations: service.listPlanningRecommendations.bind(service),
    listNeedsReplyThreads: service.listNeedsReplyThreads.bind(service),
    listFollowupThreads: service.listFollowupThreads.bind(service),
    listUpcomingCalendarEvents: service.listUpcomingCalendarEvents.bind(service),
    compareNextActionableRecommendations: () => 0,
    getPlanningRecommendationDetail: service.getPlanningRecommendationDetail.bind(service),
    getPlanningAutopilotReport: service.getPlanningAutopilotReport.bind(service),
    getOutboundAutopilotReport: service.getOutboundAutopilotReport.bind(service),
    getInboxAutopilotReport: service.getInboxAutopilotReport.bind(service),
    getRelatedDocsForTarget: service.getRelatedDocsForTarget.bind(service),
    getRelatedFilesForTarget: service.getRelatedFilesForTarget.bind(service),
  };

  const nowNext = await buildNowNextWorkflowReport(fakeService, { httpReachable: true });
  const prepDay = await buildPrepDayWorkflowReport(fakeService, { httpReachable: true });

  assert.equal(nowNext.actions[0]?.target_type, "outbound_autopilot_group");
  assert.equal(prepDay.actions.some((action) => action.target_type === "outbound_autopilot_group"), true);
});

test("assistant-led phase 8 autopilot warms inbox work and exposes freshness in status", async () => {
  const accountEmail = "machine@example.com";
  const inbound = buildMessage("msg-phase8-autopilot", accountEmail, {
    thread_id: "thread-phase8-autopilot",
    history_id: "phase8-autopilot-1",
    internal_date: String(Date.now() - 15 * 60 * 1000),
    label_ids: ["INBOX", "UNREAD"],
    from_header: "Client <client@example.com>",
    subject: "Autopilot reply needed",
  });
  const { service } = createFixture({
    accountEmail,
    profileHistoryId: "phase8-autopilot-ready",
    listRefsImpl: async () => ({ message_ids: [inbound.message_id] }),
    metadataImpl: async (messageId) => {
      assert.equal(messageId, inbound.message_id);
      return inbound;
    },
  });
  seedMailboxReadyState(service, accountEmail, "phase8-autopilot-ready");
  service.db.upsertCalendarSyncState(accountEmail, "google", {
    status: "ready",
    last_synced_at: new Date().toISOString(),
    last_seeded_at: new Date().toISOString(),
    calendars_refreshed_count: 1,
    events_refreshed_count: 0,
  });
  (service as any).collectDoctorChecks = async () => [];

  await service.syncMailboxMetadata(cliIdentity);

  const initialStatus = await service.getAutopilotStatusReport({ httpReachable: true });
  assert.equal(initialStatus.profiles.some((profile) => profile.profile === "inbox"), true);

  const report = await service.runAutopilot(cliIdentity, {
    trigger: "manual",
    requestedProfile: "inbox",
    httpReachable: true,
    manual: true,
  });
  const inboxProfile = report.profiles.find((profile) => profile.profile === "inbox");
  assert.ok(inboxProfile);
  assert.equal(inboxProfile?.state, "fresh");
  assert.equal(Boolean(inboxProfile?.prepared_at), true);

  const latestRun = service.db.getLatestAutopilotRun();
  assert.ok(latestRun);
  assert.equal(latestRun?.trigger, "manual");
  const storedProfile = service.db.getAutopilotProfileState("inbox");
  assert.equal(storedProfile?.state, "fresh");
  assert.equal(storedProfile?.last_run_id, latestRun?.run_id);
  assert.equal(Boolean(storedProfile?.last_success_at), true);

  const statusReport = await service.getStatusReport({ httpReachable: true });
  assert.equal(statusReport.autopilot?.enabled, true);
  assert.equal(statusReport.autopilot?.running, false);
  assert.equal(Boolean(statusReport.autopilot?.last_success_at), true);
});

test("assistant-led phase 5 mcp drive tools are assistant-safe read-only tools", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/mcp-server.ts"), "utf8");
  assert.match(source, /name: "drive_status"/);
  assert.match(source, /name: "drive_files"/);
  assert.match(source, /name: "drive_doc_get"/);
  assert.match(source, /name: "drive_sheet_get"/);
  assert.match(source, /requestJson\("GET", "\/v1\/drive\/status"\)/);
  assert.match(source, /requestJson\("GET", "\/v1\/drive\/files"\)/);
  assert.match(source, /requestJson\("GET", `\/v1\/drive\/docs\/\$\{encodeURIComponent\(String\(args\.file_id\)\)\}`\)/);
  assert.match(source, /requestJson\("GET", `\/v1\/drive\/sheets\/\$\{encodeURIComponent\(String\(args\.file_id\)\)\}`\)/);
  assert.doesNotMatch(source, /name: "drive_sync"/);
});
