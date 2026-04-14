import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "playwright";
import { ensureRuntimeFiles, loadConfig, loadPolicy } from "../src/config.js";
import { PersonalOpsDb } from "../src/db.js";
import { createHttpServer } from "../src/http.js";
import { Logger } from "../src/logger.js";
import { PersonalOpsService } from "../src/service.js";
import type {
  ClientIdentity,
  Config,
  GmailClientConfig,
  GmailMessageMetadata,
  GoogleCalendarEventMetadata,
  GoogleCalendarEventWriteInput,
  Paths,
} from "../src/types.js";

const nativeFetch = globalThis.fetch.bind(globalThis);

const TEST_IDENTITY: ClientIdentity = {
  client_id: "console-test",
  requested_by: "console-test",
  auth_role: "operator",
};

function isRetryableConsoleFetchError(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }
  const cause = error.cause;
  return cause instanceof Error && "code" in cause && cause.code === "ECONNRESET";
}

async function fetchWithRetry(
  input: Parameters<typeof nativeFetch>[0],
  init?: Parameters<typeof nativeFetch>[1],
): Promise<Response> {
  try {
    return await nativeFetch(input, init);
  } catch (error) {
    if (!isRetryableConsoleFetchError(error)) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    return nativeFetch(input, init);
  }
}

const fetch = fetchWithRetry;

function buildChildEnv(overrides: Record<string, string>): Record<string, string> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return {
    ...inherited,
    ...overrides,
  };
}

function withRuntimeEnv<T>(env: Record<string, string>, fn: () => T): T {
  const keys = ["HOME", "PERSONAL_OPS_APP_DIR", "PERSONAL_OPS_CONFIG_DIR", "PERSONAL_OPS_STATE_DIR", "PERSONAL_OPS_LOG_DIR"];
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

async function reservePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function writeConfig(paths: Paths, port: number, mailbox = ""): void {
  fs.writeFileSync(
    paths.configFile,
    `[service]
host = "127.0.0.1"
port = ${port}

[http]
allowed_origins = []

[gmail]
account_email = "${mailbox}"
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
keychain_service = "personal-ops.gmail.console-test"
oauth_client_file = "${paths.oauthClientFile}"
`,
    "utf8",
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
  providerEventId: string,
  calendarId: string,
  overrides: Partial<GoogleCalendarEventMetadata> = {},
): GoogleCalendarEventMetadata {
  const startAt = overrides.start_at ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endAt = overrides.end_at ?? new Date(Date.now() + 90 * 60 * 1000).toISOString();
  return {
    event_id: `${calendarId}:${providerEventId}`,
    calendar_id: calendarId,
    summary: overrides.summary ?? "Console test event",
    notes: overrides.notes,
    location: overrides.location,
    start_at: startAt,
    end_at: endAt,
    status: overrides.status ?? "confirmed",
    html_link: overrides.html_link ?? `https://calendar.google.com/calendar/event?eid=${providerEventId}`,
    organizer_email: overrides.organizer_email ?? "owner@example.com",
    attendee_count: overrides.attendee_count ?? 0,
    source_task_id: overrides.source_task_id,
    created_by_personal_ops: overrides.created_by_personal_ops ?? true,
    etag: overrides.etag ?? `etag-${providerEventId}`,
    is_all_day: overrides.is_all_day ?? false,
    is_busy: overrides.is_busy ?? true,
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

async function createConsoleFixture(options: { mailbox?: string } = {}) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-console-test-"));
  const homeDir = path.join(baseDir, "home");
  fs.mkdirSync(homeDir, { recursive: true });
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const env = buildChildEnv({
    HOME: homeDir,
    PERSONAL_OPS_APP_DIR: appDir,
    PERSONAL_OPS_CONFIG_DIR: path.join(homeDir, ".config", "personal-ops"),
    PERSONAL_OPS_STATE_DIR: path.join(homeDir, "Library", "Application Support", "personal-ops"),
    PERSONAL_OPS_LOG_DIR: path.join(homeDir, "Library", "Logs", "personal-ops"),
  });
  const paths = withRuntimeEnv(env, () => ensureRuntimeFiles());
  const port = await reservePort();
  const mailbox = options.mailbox ?? "machine@example.com";
  writeConfig(paths, port, mailbox);
  const config = withRuntimeEnv(env, () => loadConfig(paths));
  const policy = withRuntimeEnv(env, () => loadPolicy(paths));
  const logger = new Logger(paths);
  const clientConfig: GmailClientConfig = {
    client_id: "client-id",
    client_secret: "client-secret",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    redirect_uris: ["http://127.0.0.1"],
  };
  const service = new PersonalOpsService(paths, config, policy, logger, {
    loadStoredGmailTokens: async () => ({
      email: mailbox,
      clientConfig,
      tokensJson: JSON.stringify({ refresh_token: "refresh-token" }),
    }),
    verifyGoogleCalendarWriteAccess: async () => {},
    createGmailDraft: async () => "provider-draft-1",
    updateGmailDraft: async () => "provider-draft-1",
    createGoogleCalendarEvent: async (_tokensJson, _clientConfig, calendarId, input: GoogleCalendarEventWriteInput) =>
      buildCalendarEventMetadata("console-planning-autopilot", calendarId, {
        summary: input.title ?? "Console planning autopilot",
        start_at: input.start_at!,
        end_at: input.end_at!,
        source_task_id: input.source_task_id,
      }),
    openExternalUrl: () => {},
  });
  if (mailbox) {
    service.db.upsertMailAccount(mailbox, config.keychainService, JSON.stringify({ emailAddress: mailbox }));
  }
  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(config.servicePort, config.serviceHost, () => resolve()));
  return {
    baseDir,
    config,
    env,
    paths,
    service,
    server,
  };
}

function parseMcpJson(
  result: { content?: Array<{ type: string; text?: string }>; toolResult?: unknown },
  label: string,
): any {
  const textPayload = result.content?.find((item) => item.type === "text")?.text;
  assert.ok(textPayload, `${label} should return text content.`);
  return JSON.parse(textPayload);
}

function seedInboxAutopilotFixture(paths: Paths, mailbox: string): void {
  const db = new PersonalOpsDb(paths.databaseFile);
  try {
    db.upsertMailAccount(mailbox, "personal-ops.gmail.console-test", JSON.stringify({ emailAddress: mailbox }));
    db.upsertMailSyncState(mailbox, "gmail", {
      status: "ready",
      last_history_id: "console-autopilot",
      last_synced_at: new Date().toISOString(),
      last_seeded_at: new Date().toISOString(),
      last_sync_refreshed_count: 1,
      last_sync_deleted_count: 0,
    });
    const now = Date.now();
    db.upsertMailMessage(
      mailbox,
      buildMessage("reply-console", mailbox, {
        thread_id: "thread-console-reply",
        history_id: "reply-console-1",
        internal_date: String(now - 2 * 60 * 60 * 1000),
        label_ids: ["INBOX", "UNREAD"],
        from_header: "Client <client@example.com>",
        subject: "Console reply needed",
      }),
      new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    );
  } finally {
    db.close();
  }
}

function seedPlanningFixture(paths: Paths): { recommendationId: string } {
  const db = new PersonalOpsDb(paths.databaseFile);
  try {
    const task = db.createTask(TEST_IDENTITY, {
      title: "Console planning fixture task",
      kind: "human_reminder",
      priority: "high",
      owner: "operator",
      due_at: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(),
    });
    return {
      recommendationId: task.task_id,
    };
  } finally {
    db.close();
  }
}

function seedPlanningAutopilotFixture(service: PersonalOpsService): { bundleRecommendationId: string } {
  const mailbox = service.db.getMailAccount()?.email ?? "machine@example.com";
  service.db.replaceCalendarSources(
    mailbox,
    "google",
    [
      {
        calendar_id: "primary",
        provider: "google",
        account: mailbox,
        title: "Primary",
        is_primary: true,
        is_selected: true,
        access_role: "owner",
        updated_at: new Date().toISOString(),
      },
    ],
    new Date().toISOString(),
  );
  const task = service.db.createTask(TEST_IDENTITY, {
    title: "Console planning autopilot task",
    kind: "human_reminder",
    priority: "high",
    owner: "operator",
    due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  const recommendation = service.db.createPlanningRecommendation(TEST_IDENTITY, {
    kind: "schedule_task_block",
    priority: "high",
    source: "system_generated",
    source_task_id: task.task_id,
    proposed_start_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    proposed_end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    proposed_title: "Console planning bundle",
    reason_code: "due_soon",
    reason_summary: "Protect time for the console bundle task.",
    dedupe_key: `schedule_task_block:${task.task_id}`,
    source_fingerprint: `task:${task.task_id}:console`,
    source_last_seen_at: new Date().toISOString(),
    slot_state: "ready",
    slot_reason: "earliest_free_in_business_window",
    trigger_signals: ["due_soon"],
    suppressed_signals: [],
    group_key: "urgent_unscheduled_tasks",
    group_summary: "Urgent task blocks can be time-boxed",
  });
  (service as unknown as { refreshPlanningRecommendationReadModel(): void }).refreshPlanningRecommendationReadModel();
  return { bundleRecommendationId: recommendation.recommendation_id };
}

function seedMeetingPrepFixture(paths: Paths, mailbox: string): string {
  const db = new PersonalOpsDb(paths.databaseFile);
  try {
    db.upsertMailAccount(mailbox, "personal-ops.gmail.console-test", JSON.stringify({ emailAddress: mailbox }));
    db.upsertCalendarSyncState(mailbox, "google", {
      status: "ready",
      last_synced_at: new Date().toISOString(),
      last_seeded_at: new Date().toISOString(),
      calendars_refreshed_count: 1,
      events_refreshed_count: 1,
    });
    const eventId = "primary:console-meeting-packet";
    db.upsertCalendarEvent({
      event_id: eventId,
      provider_event_id: "console-meeting-packet",
      calendar_id: "primary",
      provider: "google",
      account: mailbox,
      summary: "Console prep meeting",
      status: "confirmed",
      start_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      end_at: new Date(Date.now() + 150 * 60 * 1000).toISOString(),
      is_all_day: false,
      is_busy: true,
      created_by_personal_ops: false,
      attendee_count: 2,
      organizer_email: "organizer@example.com",
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    });
    return eventId;
  } finally {
    db.close();
  }
}

function cookieValue(setCookieHeader: string | null): string {
  assert.ok(setCookieHeader, "expected set-cookie header");
  const cookie = setCookieHeader.split(";")[0];
  assert.ok(cookie, "expected cookie value");
  return cookie;
}

test("Phase 6 console session grants are single-use and allow browser-safe workflow access", async () => {
  const fixture = await createConsoleFixture();
  try {
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    assert.equal(grantResponse.status, 200);
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    assert.match(grantPayload.console_session.launch_url, /\/console\/session\//);

    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    assert.equal(consumeResponse.status, 302);
    assert.equal(consumeResponse.headers.get("location"), "/console");
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const statusResponse = await fetch(`${baseUrl}/v1/status`, {
      headers: {
        cookie,
      },
    });
    assert.equal(statusResponse.status, 200);

    const workflowResponse = await fetch(`${baseUrl}/v1/workflows/prep-day`, {
      headers: {
        cookie,
      },
    });
    assert.equal(workflowResponse.status, 200);
    const workflowPayload = (await workflowResponse.json()) as { workflow?: { workflow?: string; sections?: unknown[] } };
    assert.equal(workflowPayload.workflow?.workflow, "prep-day");
    assert.ok(Array.isArray(workflowPayload.workflow?.sections));

    const nowNextResponse = await fetch(`${baseUrl}/v1/workflows/now-next`, {
      headers: {
        cookie,
      },
    });
    assert.equal(nowNextResponse.status, 200);
    const nowNextPayload = (await nowNextResponse.json()) as { workflow?: { workflow?: string; actions?: unknown[] } };
    assert.equal(nowNextPayload.workflow?.workflow, "now-next");
    assert.ok(Array.isArray(nowNextPayload.workflow?.actions));

    const secondConsume = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    assert.equal(secondConsume.status, 302);
    assert.equal(secondConsume.headers.get("location"), "/console?locked=1");
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("phase 18 console browser-safe status includes the calm-window maintenance bundle", async () => {
  const fixture = await createConsoleFixture();
  try {
    const originalGetStatusReport = fixture.service.getStatusReport.bind(fixture.service);
    fixture.service.getStatusReport = async (options: { httpReachable: boolean }) => {
      const status = await originalGetStatusReport(options);
      const maintenanceWindow = {
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
      };
      return {
        ...status,
        workspace_home: {
          ready: true,
          state: "maintenance",
          title: "Upkeep is the main focus right now",
          summary: "This recurring family behaves like early repair and should be treated as repair-priority upkeep when surfaced.",
          why_now: "This recurring family should be handled through the maintenance session before it becomes active repair again.",
          primary_command: "personal-ops maintenance session",
          secondary_summary: "Review the strongest assistant-prepared action after upkeep is clear.",
          assistant_action_id: null,
          workflow: null,
          maintenance_state: "repair_priority_upkeep",
        },
        maintenance_window: maintenanceWindow,
        maintenance_confidence: {
          eligible: true,
          step_id: "install_wrappers",
          level: "high",
          trend: "rising",
          summary:
            "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
          suggested_command: "personal-ops maintenance session",
          defer_count: 0,
          handoff_count_30d: 2,
          cooldown_active: false,
        },
        maintenance_escalation: {
          eligible: true,
          step_id: "install_wrappers",
          signal: "handed_off_to_repair",
          summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
          suggested_command: "personal-ops maintenance session",
          handoff_count_30d: 2,
          cue: {
            item_id: "maintenance-escalation:install_wrappers",
            kind: "maintenance_escalation",
            severity: "warn",
            title: "Maintenance escalation",
            summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
            target_type: "system",
            target_id: "maintenance:install_wrappers",
            suggested_command: "personal-ops maintenance session",
            signals: ["maintenance_escalation", "install_wrappers"],
          },
        },
        maintenance_follow_through: {
          ...status.maintenance_follow_through,
          escalation: {
            eligible: true,
            step_id: "install_wrappers",
            signal: "handed_off_to_repair",
            summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
            suggested_command: "personal-ops maintenance session",
            handoff_count_30d: 2,
            cue: {
              item_id: "maintenance-escalation:install_wrappers",
              kind: "maintenance_escalation",
              severity: "warn",
              title: "Maintenance escalation",
              summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
              target_type: "system",
              target_id: "maintenance:install_wrappers",
              suggested_command: "personal-ops maintenance session",
              signals: ["maintenance_escalation", "install_wrappers"],
            },
          },
          summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
          confidence: {
            eligible: true,
            step_id: "install_wrappers",
            level: "high",
            trend: "rising",
            summary:
              "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
            suggested_command: "personal-ops maintenance session",
            defer_count: 0,
            handoff_count_30d: 2,
            cooldown_active: false,
          },
        },
        maintenance_scheduling: {
          eligible: true,
          placement: "now",
          step_id: "install_wrappers",
          summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
          suggested_command: "personal-ops maintenance session",
          reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
          bundle_step_ids: ["install_wrappers"],
          confidence: {
            eligible: true,
            step_id: "install_wrappers",
            level: "high",
            trend: "rising",
            summary:
              "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
            suggested_command: "personal-ops maintenance session",
            defer_count: 0,
            handoff_count_30d: 2,
            cooldown_active: false,
          },
          operating_block: {
            eligible: true,
            block: "current_block",
            step_id: "install_wrappers",
            summary: "This maintenance work belongs in the current operating block and should be handled before lower-priority upkeep.",
            suggested_command: "personal-ops maintenance session",
            reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
            confidence_level: "high",
            bundle_step_ids: ["install_wrappers"],
          },
        },
        maintenance_operating_block: {
          eligible: true,
          block: "current_block",
          step_id: "install_wrappers",
          summary: "This maintenance work belongs in the current operating block and should be handled before lower-priority upkeep.",
          suggested_command: "personal-ops maintenance session",
          reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
          confidence_level: "high",
          bundle_step_ids: ["install_wrappers"],
        },
        maintenance_decision_explanation: {
          eligible: true,
          step_id: "install_wrappers",
          state: "do_now",
          driver: "escalation",
          summary: "This maintenance work belongs in the current operating block.",
          why_now: "The system is ready, this family is surfaced for the current block, and there is no higher-priority urgent work ahead of it.",
          why_not_higher: "It still stays below active repair and truly urgent operator work.",
          suggested_command: "personal-ops maintenance session",
          confidence_level: "high",
          operating_block: "current_block",
          reasons: ["escalation_active", "confidence_rising", "scheduled_for_current_block"],
          bundle_step_ids: ["install_wrappers"],
        },
        maintenance_repair_convergence: {
          eligible: true,
          step_id: "install_wrappers",
          state: "repair_priority_upkeep",
          driver: "repeated_handoff",
          summary: "This recurring family behaves like early repair and should be treated as repair-priority upkeep when surfaced.",
          why: "This family has repeatedly handed off into repair, so maintenance should carry stronger ownership language.",
          primary_command: "personal-ops maintenance session",
          repair_command: "personal-ops repair plan",
          maintenance_command: "personal-ops maintenance session",
          handoff_count_30d: 2,
          active_repair_step_id: null,
          bundle_step_ids: ["install_wrappers"],
        },
        repair_plan: {
          ...status.repair_plan,
          maintenance_window: maintenanceWindow,
          maintenance_confidence: {
            eligible: true,
            step_id: "install_wrappers",
            level: "high",
            trend: "rising",
            summary:
              "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
            suggested_command: "personal-ops maintenance session",
            defer_count: 0,
            handoff_count_30d: 2,
            cooldown_active: false,
          },
          maintenance_escalation: {
            eligible: true,
            step_id: "install_wrappers",
            signal: "handed_off_to_repair",
            summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
            suggested_command: "personal-ops maintenance session",
            handoff_count_30d: 2,
            cue: {
              item_id: "maintenance-escalation:install_wrappers",
              kind: "maintenance_escalation",
              severity: "warn",
              title: "Maintenance escalation",
              summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
              target_type: "system",
              target_id: "maintenance:install_wrappers",
              suggested_command: "personal-ops maintenance session",
              signals: ["maintenance_escalation", "install_wrappers"],
            },
          },
          maintenance_follow_through: {
            ...status.repair_plan.maintenance_follow_through,
            escalation: {
              eligible: true,
              step_id: "install_wrappers",
              signal: "handed_off_to_repair",
              summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
              suggested_command: "personal-ops maintenance session",
              handoff_count_30d: 2,
              cue: {
                item_id: "maintenance-escalation:install_wrappers",
                kind: "maintenance_escalation",
                severity: "warn",
                title: "Maintenance escalation",
                summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
                target_type: "system",
                target_id: "maintenance:install_wrappers",
                suggested_command: "personal-ops maintenance session",
                signals: ["maintenance_escalation", "install_wrappers"],
              },
            },
            summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
            confidence: {
              eligible: true,
              step_id: "install_wrappers",
              level: "high",
              trend: "rising",
              summary:
                "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
              suggested_command: "personal-ops maintenance session",
              defer_count: 0,
              handoff_count_30d: 2,
              cooldown_active: false,
            },
          },
          maintenance_scheduling: {
            eligible: true,
            placement: "now",
            step_id: "install_wrappers",
            summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
            suggested_command: "personal-ops maintenance session",
            reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
            bundle_step_ids: ["install_wrappers"],
            confidence: {
              eligible: true,
              step_id: "install_wrappers",
              level: "high",
              trend: "rising",
              summary:
                "This maintenance family keeps resurfacing or handing off into repair and should be treated as repair-priority upkeep when surfaced.",
              suggested_command: "personal-ops maintenance session",
              defer_count: 0,
              handoff_count_30d: 2,
              cooldown_active: false,
            },
            operating_block: {
              eligible: true,
              block: "current_block",
              step_id: "install_wrappers",
              summary: "This maintenance work belongs in the current operating block and should be handled before lower-priority upkeep.",
              suggested_command: "personal-ops maintenance session",
              reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
              confidence_level: "high",
              bundle_step_ids: ["install_wrappers"],
            },
          },
          maintenance_operating_block: {
            eligible: true,
            block: "current_block",
            step_id: "install_wrappers",
            summary: "This maintenance work belongs in the current operating block and should be handled before lower-priority upkeep.",
            suggested_command: "personal-ops maintenance session",
            reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
            confidence_level: "high",
            bundle_step_ids: ["install_wrappers"],
          },
          maintenance_decision_explanation: {
            eligible: true,
            step_id: "install_wrappers",
            state: "do_now",
            driver: "escalation",
            summary: "This maintenance work belongs in the current operating block.",
            why_now: "The system is ready, this family is surfaced for the current block, and there is no higher-priority urgent work ahead of it.",
            why_not_higher: "It still stays below active repair and truly urgent operator work.",
            suggested_command: "personal-ops maintenance session",
            confidence_level: "high",
            operating_block: "current_block",
            reasons: ["escalation_active", "confidence_rising", "scheduled_for_current_block"],
            bundle_step_ids: ["install_wrappers"],
          },
          maintenance_repair_convergence: {
            eligible: true,
            step_id: "install_wrappers",
            state: "repair_priority_upkeep",
            driver: "repeated_handoff",
            summary: "This recurring family behaves like early repair and should be treated as repair-priority upkeep when surfaced.",
            why: "This family has repeatedly handed off into repair, so maintenance should carry stronger ownership language.",
            primary_command: "personal-ops maintenance session",
            repair_command: "personal-ops repair plan",
            maintenance_command: "personal-ops maintenance session",
            handoff_count_30d: 2,
            active_repair_step_id: null,
            bundle_step_ids: ["install_wrappers"],
          },
        },
      };
    };

    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    assert.equal(grantResponse.status, 200);
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const statusResponse = await fetch(`${baseUrl}/v1/status`, {
      headers: { cookie },
    });
    assert.equal(statusResponse.status, 200);
    const payload = (await statusResponse.json()) as {
      status?: {
        workspace_home?: {
          state?: string | null;
          title?: string | null;
          primary_command?: string | null;
        };
        maintenance_window?: {
          eligible_now?: boolean;
          bundle?: { title?: string; recommended_commands?: string[] };
        };
        maintenance_escalation?: {
          eligible?: boolean;
          step_id?: string | null;
          suggested_command?: string | null;
        };
        maintenance_scheduling?: {
          eligible?: boolean;
          placement?: string | null;
          step_id?: string | null;
        };
        maintenance_confidence?: {
          eligible?: boolean;
          step_id?: string | null;
          level?: string | null;
        };
        maintenance_operating_block?: {
          eligible?: boolean;
          step_id?: string | null;
          block?: string | null;
        };
        maintenance_decision_explanation?: {
          eligible?: boolean;
          step_id?: string | null;
          state?: string | null;
          driver?: string | null;
        };
        maintenance_repair_convergence?: {
          eligible?: boolean;
          step_id?: string | null;
          state?: string | null;
          driver?: string | null;
        };
      };
    };

    assert.equal(payload.status?.maintenance_window?.eligible_now, true);
    assert.equal(payload.status?.workspace_home?.state, "maintenance");
    assert.equal(payload.status?.workspace_home?.title, "Upkeep is the main focus right now");
    assert.equal(payload.status?.workspace_home?.primary_command, "personal-ops maintenance session");
    assert.equal(payload.status?.maintenance_window?.bundle?.title, "Preventive maintenance window");
    assert.equal(payload.status?.maintenance_window?.bundle?.recommended_commands?.[0], "personal-ops install wrappers");
    assert.equal(payload.status?.maintenance_escalation?.eligible, true);
    assert.equal(payload.status?.maintenance_escalation?.step_id, "install_wrappers");
    assert.equal(payload.status?.maintenance_escalation?.suggested_command, "personal-ops maintenance session");
    assert.equal(payload.status?.maintenance_scheduling?.eligible, true);
    assert.equal(payload.status?.maintenance_scheduling?.placement, "now");
    assert.equal(payload.status?.maintenance_scheduling?.step_id, "install_wrappers");
    assert.equal(payload.status?.maintenance_confidence?.eligible, true);
    assert.equal(payload.status?.maintenance_confidence?.step_id, "install_wrappers");
    assert.equal(payload.status?.maintenance_confidence?.level, "high");
    assert.equal(payload.status?.maintenance_operating_block?.eligible, true);
    assert.equal(payload.status?.maintenance_operating_block?.step_id, "install_wrappers");
    assert.equal(payload.status?.maintenance_operating_block?.block, "current_block");
    assert.equal(payload.status?.maintenance_decision_explanation?.eligible, true);
    assert.equal(payload.status?.maintenance_decision_explanation?.step_id, "install_wrappers");
    assert.equal(payload.status?.maintenance_decision_explanation?.state, "do_now");
    assert.equal(payload.status?.maintenance_decision_explanation?.driver, "escalation");
    assert.equal(payload.status?.maintenance_repair_convergence?.eligible, true);
    assert.equal(payload.status?.maintenance_repair_convergence?.step_id, "install_wrappers");
    assert.equal(payload.status?.maintenance_repair_convergence?.state, "repair_priority_upkeep");
    assert.equal(payload.status?.maintenance_repair_convergence?.driver, "repeated_handoff");
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("assistant-led Phase 4 console session route is operator-only and stays blocked for browser sessions", async () => {
  const fixture = await createConsoleFixture();
  try {
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/console/session`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "desktop-test",
      },
    });
    assert.equal(grantResponse.status, 200);
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    assert.match(grantPayload.console_session.launch_url, /\/console\/session\//);

    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const blockedResponse = await fetch(`${baseUrl}/v1/console/session`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(blockedResponse.status, 403);
    const blockedPayload = (await blockedResponse.json()) as { error?: string };
    assert.match(blockedPayload.error ?? "", /browser-safe/i);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("Phase 2 console sessions can create snapshots and run narrow planning actions only", async () => {
  const fixture = await createConsoleFixture();
  try {
    const planning = seedPlanningFixture(fixture.paths);
    fixture.service.refreshPlanningRecommendations(TEST_IDENTITY);
    const recommendationId =
      fixture.service.listPlanningRecommendations().find((item) => item.source_task_id === planning.recommendationId)
        ?.recommendation_id ?? null;
    assert.ok(recommendationId);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const snapshotResponse = await fetch(`${baseUrl}/v1/snapshots`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(snapshotResponse.status, 200);
    const snapshotPayload = (await snapshotResponse.json()) as { snapshot: { snapshot_id: string } };
    assert.ok(snapshotPayload.snapshot.snapshot_id);

    const planningResponse = await fetch(
      `${baseUrl}/v1/planning-recommendations/${encodeURIComponent(recommendationId)}/snooze`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ preset: "tomorrow-morning", note: "Console test snooze" }),
      },
    );
    assert.equal(planningResponse.status, 200);
    const planningPayload = (await planningResponse.json()) as {
      planning_recommendation: { recommendation: { status: string; recommendation_id: string } };
    };
    assert.equal(planningPayload.planning_recommendation.recommendation.status, "snoozed");
    assert.equal(planningPayload.planning_recommendation.recommendation.recommendation_id, recommendationId);

    const mutationResponse = await fetch(`${baseUrl}/v1/send-window/enable`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ minutes: 15, reason: "test" }),
    });
    assert.equal(mutationResponse.status, 403);
    const mutationPayload = (await mutationResponse.json()) as { error?: string };
    assert.match(mutationPayload.error ?? "", /browser-safe console actions/i);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("assistant-led Phase 1 console sessions can read the assistant queue and run safe assistant actions only", async () => {
  const fixture = await createConsoleFixture();
  try {
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const queueResponse = await fetch(`${baseUrl}/v1/assistant/actions`, {
      headers: {
        cookie,
      },
    });
    assert.equal(queueResponse.status, 200);
    const queuePayload = (await queueResponse.json()) as {
      assistant_queue: { actions: Array<{ action_id: string }> };
    };
    assert.equal(queuePayload.assistant_queue.actions.some((action) => action.action_id === "assistant.create-snapshot"), true);

    const runResponse = await fetch(`${baseUrl}/v1/assistant/actions/assistant.create-snapshot/run`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(runResponse.status, 200);
    const runPayload = (await runResponse.json()) as { assistant_run: { state: string } };
    assert.equal(runPayload.assistant_run.state, "completed");

    const reviewRunResponse = await fetch(`${baseUrl}/v1/assistant/actions/assistant.review-top-attention/run`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(reviewRunResponse.status, 400);
    const reviewRunPayload = (await reviewRunResponse.json()) as { error?: string };
    assert.match(reviewRunPayload.error ?? "", /requires operator review/i);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("phase 27 console payloads carry workflow-first personalization through now-next and assistant queue", async () => {
  const fixture = await createConsoleFixture();
  const originalNow = Date.now;
  try {
    const serviceAny = fixture.service as any;
    serviceAny.collectDoctorChecks = async () => [];
    serviceAny.classifyState = () => "ready";
    const favoredNow = new Date(2026, 3, 12, 10, 15, 0).toISOString();
    const followupHistoryTimestamps = [
      new Date(2026, 3, 10, 9, 30, 0).toISOString(),
      new Date(2026, 3, 9, 9, 40, 0).toISOString(),
      new Date(2026, 3, 8, 9, 50, 0).toISOString(),
    ];
    fixture.service.db.createPlanningRecommendation(TEST_IDENTITY, {
      kind: "schedule_thread_followup",
      status: "pending",
      priority: "normal",
      source: "system_generated",
      reason_summary: "Reply to the open client thread.",
      reason_code: "needs_reply",
      dedupe_key: "console:followup:pending",
      source_fingerprint: "console:followup:pending",
      rank_score: 560,
      ranking_version: "console-test",
      slot_state: "ready",
      outcome_state: "none",
      source_thread_id: "thread-console-personalization",
      source_last_seen_at: "2026-04-12T09:55:00.000Z",
      trigger_signals: ["reply_needed"],
      suppressed_signals: [],
    });
    for (const timestamp of followupHistoryTimestamps) {
      fixture.service.db.createPlanningRecommendation(TEST_IDENTITY, {
        kind: "schedule_thread_followup",
        status: "applied",
        priority: "normal",
        source: "system_generated",
        reason_summary: "Historical follow-up block.",
        reason_code: "needs_reply",
        dedupe_key: `console:followup:${timestamp}`,
        source_fingerprint: `console:followup:${timestamp}`,
        rank_score: 500,
        ranking_version: "console-test",
        slot_state: "ready",
        outcome_state: "completed",
        source_thread_id: `history-${timestamp}`,
        source_last_seen_at: timestamp,
        first_action_at: timestamp,
        trigger_signals: ["reply_needed"],
        suppressed_signals: [],
      });
    }

    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-personalization-test",
      },
    });
    assert.equal(grantResponse.status, 200);
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    Date.now = () => Date.parse(favoredNow);

    const workflowResponse = await fetch(`${baseUrl}/v1/workflows/now-next`, {
      headers: { cookie },
    });
    assert.equal(workflowResponse.status, 200);
    const workflowPayload = (await workflowResponse.json()) as {
      workflow?: { actions?: Array<{ workflow_personalization?: { fit?: string | null } }> };
    };

    const assistantResponse = await fetch(`${baseUrl}/v1/assistant/actions`, {
      headers: { cookie },
    });
    assert.equal(assistantResponse.status, 200);
    const assistantPayload = (await assistantResponse.json()) as {
      assistant_queue?: { actions?: Array<{ action_id?: string; workflow_personalization?: { fit?: string | null } }> };
    };

    assert.equal(workflowPayload.workflow?.actions?.[0]?.workflow_personalization?.fit, "favored");
    assert.equal(
      assistantPayload.assistant_queue?.actions?.find((action) => action.action_id === "assistant.review-top-attention")?.workflow_personalization?.fit,
      "favored",
    );
  } finally {
    Date.now = originalNow;
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("phase 31 console endpoints carry duplicate suppression and balanced quieting for top surfaced work", async () => {
  const fixture = await createConsoleFixture();
  try {
    const serviceAny = fixture.service as any;
    const originalStatus = await fixture.service.getStatusReport({ httpReachable: true });
    const originalQueue = await fixture.service.getAssistantActionQueueReport({ httpReachable: true });
    const originalWorkflow = await fixture.service.getNowNextWorkflowReport({ httpReachable: true });
    const topAssistant = originalQueue.actions.find((action) => action.action_id === "assistant.review-top-attention") ?? originalQueue.actions[0]!;

    serviceAny.getStatusReport = async () => ({
      ...originalStatus,
      workspace_home: {
        ...originalStatus.workspace_home,
        ready: true,
        state: "assistant",
        title: "Assistant-prepared work is ready",
        summary: topAssistant.summary,
        why_now: topAssistant.why_now,
        primary_command: topAssistant.command ?? "personal-ops assistant queue",
        assistant_action_id: topAssistant.action_id,
        surfaced_work_helpfulness: {
          eligible: true,
          surface: "workspace_home",
          target_type: "assistant_action",
          target_id: topAssistant.action_id,
          level: "helpful",
          summary: "Recent outcomes suggest this surfaced work is usually acted on.",
          sample_count_30d: 4,
          helpful_count_30d: 3,
          attempted_failed_count_30d: 0,
          superseded_count_30d: 1,
          expired_count_30d: 0,
          helpful_rate_30d: 0.75,
        },
      },
    });
    serviceAny.getNowNextWorkflowReport = async () => ({
      ...originalWorkflow,
      actions: originalWorkflow.actions.map((action: any, index: number) =>
        index === 0
          ? {
              ...action,
              summary: "Quiet secondary workflow item.",
              why_now: "This is still available if the focus changes.",
              target_type: "planning_recommendation",
              target_id: "phase31-console-quiet",
              planning_recommendation_id: "phase31-console-quiet",
              workflow_personalization: {
                eligible: true,
                category: "followup",
                preferred_window: "early_day",
                current_window: "early_day",
                fit: "favored",
                reason: "aligned_with_habit",
                summary: "This is a good fit for how you usually handle this kind of work.",
                sample_count_30d: 3,
              },
              surfaced_work_helpfulness: {
                eligible: true,
                surface: "workflow_now_next",
                target_type: "planning_recommendation",
                target_id: "phase31-console-quiet",
                level: "weak",
                summary: "Recent outcomes suggest this surfaced work is often surfaced without follow-through.",
                sample_count_30d: 4,
                helpful_count_30d: 0,
                attempted_failed_count_30d: 2,
                superseded_count_30d: 1,
                expired_count_30d: 1,
                helpful_rate_30d: 0,
              },
            }
          : action,
      ),
      sections: originalWorkflow.sections.map((section: any) =>
        section.title === "Best Next Move"
          ? {
              ...section,
              items: section.items.map((item: any, index: number) =>
                index === 0
                  ? {
                      ...item,
                      summary: "Quiet secondary workflow item.",
                      why_now: "This is still available if the focus changes.",
                      target_type: "planning_recommendation",
                      target_id: "phase31-console-quiet",
                      planning_recommendation_id: "phase31-console-quiet",
                      workflow_personalization: {
                        eligible: true,
                        category: "followup",
                        preferred_window: "early_day",
                        current_window: "early_day",
                        fit: "favored",
                        reason: "aligned_with_habit",
                        summary: "This is a good fit for how you usually handle this kind of work.",
                        sample_count_30d: 3,
                      },
                      surfaced_work_helpfulness: {
                        eligible: true,
                        surface: "workflow_now_next",
                        target_type: "planning_recommendation",
                        target_id: "phase31-console-quiet",
                        level: "weak",
                        summary: "Recent outcomes suggest this surfaced work is often surfaced without follow-through.",
                        sample_count_30d: 4,
                        helpful_count_30d: 0,
                        attempted_failed_count_30d: 2,
                        superseded_count_30d: 1,
                        expired_count_30d: 1,
                        helpful_rate_30d: 0,
                      },
                    }
                  : item,
              ),
            }
          : section,
      ),
    });

    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-phase31-test",
      },
    });
    assert.equal(grantResponse.status, 200);
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const assistantResponse = await fetch(`${baseUrl}/v1/assistant/actions`, {
      headers: { cookie },
    });
    assert.equal(assistantResponse.status, 200);
    const assistantPayload = (await assistantResponse.json()) as {
      assistant_queue?: { actions?: Array<{ action_id?: string; surfaced_noise_reduction?: { disposition?: string; show_helpfulness?: boolean; summary?: string | null } }> };
    };

    const workflowResponse = await fetch(`${baseUrl}/v1/workflows/now-next`, {
      headers: { cookie },
    });
    assert.equal(workflowResponse.status, 200);
    const workflowPayload = (await workflowResponse.json()) as {
      workflow?: { actions?: Array<{ surfaced_noise_reduction?: { disposition?: string; show_helpfulness?: boolean; summary?: string | null } }> };
    };

    assert.equal(
      assistantPayload.assistant_queue?.actions?.find((action) => action.action_id === topAssistant.action_id)?.surfaced_noise_reduction?.disposition,
      "suppressed_duplicate",
    );
    assert.equal(
      assistantPayload.assistant_queue?.actions?.find((action) => action.action_id === topAssistant.action_id)?.surfaced_noise_reduction?.show_helpfulness,
      false,
    );
    assert.equal(workflowPayload.workflow?.actions?.[0]?.surfaced_noise_reduction?.disposition, "quieted");
    assert.equal(workflowPayload.workflow?.actions?.[0]?.surfaced_noise_reduction?.summary, "This stays available, but recent follow-through has been weak.");
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("phase 32 console status payload keeps grouped outbound as the primary review and approval handoff", async () => {
  const mailbox = "machine@example.com";
  const fixture = await createConsoleFixture({ mailbox });
  try {
    seedInboxAutopilotFixture(fixture.paths, mailbox);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-phase32-test",
      },
    });
    assert.equal(grantResponse.status, 200);
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const inboxResponse = await fetch(`${baseUrl}/v1/inbox/autopilot`, { headers: { cookie } });
    const inboxPayload = (await inboxResponse.json()) as {
      inbox_autopilot: { groups: Array<{ group_id: string }> };
    };
    const inboxGroupId = inboxPayload.inbox_autopilot.groups[0]?.group_id;
    assert.ok(inboxGroupId);

    const prepareResponse = await fetch(
      `${baseUrl}/v1/inbox/autopilot/groups/${encodeURIComponent(inboxGroupId!)}/prepare`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(prepareResponse.status, 200);

    const reviewNeededResponse = await fetch(`${baseUrl}/v1/status`, { headers: { cookie } });
    assert.equal(reviewNeededResponse.status, 200);
    const reviewNeededPayload = (await reviewNeededResponse.json()) as { status: Record<string, unknown> };
    assert.equal((reviewNeededPayload.status as any).review_approval_flow?.state, "review_needed");

    const draftsResponse = await fetch(`${baseUrl}/v1/mail/drafts`, { headers: { cookie } });
    const draftsPayload = (await draftsResponse.json()) as { drafts: Array<{ artifact_id: string }> };
    const draftId = draftsPayload.drafts[0]?.artifact_id;
    assert.ok(draftId);

    const reviewsResponse = await fetch(`${baseUrl}/v1/review-queue`, { headers: { cookie } });
    const reviewsPayload = (await reviewsResponse.json()) as {
      review_items: Array<{ review_id: string; artifact_id: string }>;
    };
    const reviewId = reviewsPayload.review_items.find((review) => review.artifact_id === draftId)?.review_id;
    assert.ok(reviewId);

    await fetch(`${baseUrl}/v1/review-queue/${encodeURIComponent(reviewId!)}/open`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    await fetch(`${baseUrl}/v1/review-queue/${encodeURIComponent(reviewId!)}/resolve`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "Reviewed for phase 32 console flow" }),
    });

    const outboundResponse = await fetch(`${baseUrl}/v1/outbound/autopilot`, { headers: { cookie } });
    assert.equal(outboundResponse.status, 200);
    const outboundPayload = (await outboundResponse.json()) as {
      outbound_autopilot: { groups: Array<{ group_id: string }> };
    };
    const outboundGroupId = outboundPayload.outbound_autopilot.groups[0]?.group_id;
    assert.ok(outboundGroupId);

    const approvalNeededResponse = await fetch(`${baseUrl}/v1/status`, { headers: { cookie } });
    assert.equal(approvalNeededResponse.status, 200);
    const approvalNeededPayload = (await approvalNeededResponse.json()) as { status: Record<string, unknown> };
    assert.equal((approvalNeededPayload.status as any).review_approval_flow?.state, "approval_needed");
    assert.equal((approvalNeededPayload.status as any).review_approval_flow?.outbound_group_id, outboundGroupId);

    const requestApprovalResponse = await fetch(
      `${baseUrl}/v1/outbound/autopilot/groups/${encodeURIComponent(outboundGroupId!)}/request-approval`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ note: "Ready for grouped approval" }),
      },
    );
    assert.equal(requestApprovalResponse.status, 200);

    const approveResponse = await fetch(
      `${baseUrl}/v1/outbound/autopilot/groups/${encodeURIComponent(outboundGroupId!)}/approve`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ note: "Approve grouped outbound work", confirmed: true }),
      },
    );
    assert.equal(approveResponse.status, 200);

    const recoveryResponse = await fetch(`${baseUrl}/v1/status`, { headers: { cookie } });
    assert.equal(recoveryResponse.status, 200);
    const recoveryPayload = (await recoveryResponse.json()) as { status: Record<string, unknown> };
    assert.equal((recoveryPayload.status as any).review_approval_flow?.state, "recovery_needed");
    assert.equal((recoveryPayload.status as any).review_approval_flow?.outbound_group_id, outboundGroupId);

    fixture.service.enableSendWindow(TEST_IDENTITY, 15, "Console phase 32 grouped send");

    const sendReadyResponse = await fetch(`${baseUrl}/v1/status`, { headers: { cookie } });
    assert.equal(sendReadyResponse.status, 200);
    const sendReadyPayload = (await sendReadyResponse.json()) as { status: Record<string, unknown> };
    assert.equal((sendReadyPayload.status as any).review_approval_flow?.state, "send_ready");
    assert.equal((sendReadyPayload.status as any).review_approval_flow?.outbound_group_id, outboundGroupId);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("assistant-led Phase 2 console sessions can prepare inbox autopilot drafts, review them, and request approval", async () => {
  const mailbox = "machine@example.com";
  const fixture = await createConsoleFixture({ mailbox });
  try {
    seedInboxAutopilotFixture(fixture.paths, mailbox);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const autopilotResponse = await fetch(`${baseUrl}/v1/inbox/autopilot`, {
      headers: { cookie },
    });
    assert.equal(autopilotResponse.status, 200);
    const autopilotPayload = (await autopilotResponse.json()) as {
      inbox_autopilot: { groups: Array<{ group_id: string; kind: string }> };
    };
    assert.equal(autopilotPayload.inbox_autopilot.groups.length > 0, true);
    const groupId = autopilotPayload.inbox_autopilot.groups[0]?.group_id;
    assert.ok(groupId);

    const prepareResponse = await fetch(
      `${baseUrl}/v1/inbox/autopilot/groups/${encodeURIComponent(groupId)}/prepare`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(prepareResponse.status, 200);
    const preparePayload = (await prepareResponse.json()) as {
      inbox_autopilot_group: { drafts: Array<{ artifact_id: string; review_state: string }> };
    };
    const draftId = preparePayload.inbox_autopilot_group.drafts[0]?.artifact_id;
    assert.ok(draftId);

    const draftsResponse = await fetch(`${baseUrl}/v1/mail/drafts`, {
      headers: { cookie },
    });
    const draftsPayload = (await draftsResponse.json()) as { drafts: Array<{ artifact_id: string }> };
    assert.equal(draftsPayload.drafts.some((draft) => draft.artifact_id === draftId), true);

    const reviewsResponse = await fetch(`${baseUrl}/v1/review-queue`, {
      headers: { cookie },
    });
    assert.equal(reviewsResponse.status, 200);
    const reviewsPayload = (await reviewsResponse.json()) as {
      review_items: Array<{ review_id: string; artifact_id: string; state: string }>;
    };
    const reviewId = reviewsPayload.review_items.find((review) => review.artifact_id === draftId)?.review_id;
    assert.ok(reviewId);

    const openResponse = await fetch(`${baseUrl}/v1/review-queue/${encodeURIComponent(reviewId!)}/open`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(openResponse.status, 200);

    const resolveResponse = await fetch(`${baseUrl}/v1/review-queue/${encodeURIComponent(reviewId!)}/resolve`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "Reviewed in console test" }),
    });
    assert.equal(resolveResponse.status, 200);

    const approvalResponse = await fetch(`${baseUrl}/v1/mail/drafts/${encodeURIComponent(draftId!)}/request-approval`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "Ready for approval" }),
    });
    assert.equal(approvalResponse.status, 200);
    const approvalPayload = (await approvalResponse.json()) as {
      approval_request: { artifact_id: string; state: string };
    };
    assert.equal(approvalPayload.approval_request.artifact_id, draftId);
    assert.equal(approvalPayload.approval_request.state, "pending");

    const sendResponse = await fetch(`${baseUrl}/v1/approval-queue/test-approval/send`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "still blocked" }),
    });
    assert.equal(sendResponse.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("phase 34 console replaces the generic review focus note when the proof gate is met", async () => {
  const mailbox = "machine@example.com";
  const fixture = await createConsoleFixture({ mailbox });
  try {
    seedInboxAutopilotFixture(fixture.paths, mailbox);

    const inboxReport = await fixture.service.getInboxAutopilotReport({ httpReachable: true });
    const replyGroup = inboxReport.groups.find((group) => group.kind === "needs_reply");
    assert.ok(replyGroup);

    const prepared = await fixture.service.prepareInboxAutopilotGroup(TEST_IDENTITY, replyGroup!.group_id);
    const draftId = prepared.drafts[0]?.artifact_id;
    assert.ok(draftId);
    const review = fixture.service.db.getLatestReviewItemForArtifact(draftId!);
    assert.ok(review);

    fixture.service.openReview(TEST_IDENTITY, review!.review_id);
    fixture.service.resolveReview(TEST_IDENTITY, review!.review_id, "Reviewed for phase 34 console proof");

    let providerDraftCounter = 2;
    (fixture.service as any).dependencies.createGmailDraft = async () => `provider-draft-${providerDraftCounter++}`;
    const secondaryDraft = await fixture.service.createDraft(TEST_IDENTITY, {
      to: ["secondary@example.com"],
      cc: [],
      bcc: [],
      subject: "Phase 34 secondary approval",
      body_text: "Secondary approval handoff.",
    });
    const secondaryReview = fixture.service.db.getLatestReviewItemForArtifact(secondaryDraft.artifact_id);
    assert.ok(secondaryReview);
    fixture.service.openReview(TEST_IDENTITY, secondaryReview!.review_id);
    fixture.service.resolveReview(TEST_IDENTITY, secondaryReview!.review_id, "Reviewed for secondary approval proof");
    const secondaryApproval = fixture.service.requestApproval(
      TEST_IDENTITY,
      secondaryDraft.artifact_id,
      "Secondary approval handoff",
    );
    const secondaryApprovalConfirmation = fixture.service.confirmApprovalAction(
      TEST_IDENTITY,
      secondaryApproval.approval_id,
      "approve",
    );
    fixture.service.approveRequest(
      TEST_IDENTITY,
      secondaryApproval.approval_id,
      "Approve secondary support handoff",
      secondaryApprovalConfirmation.confirmation_token,
    );
    fixture.service.enableSendWindow(TEST_IDENTITY, 15, "Allow secondary send-ready support");

    const approvalNeeded = await fixture.service.getStatusReport({ httpReachable: true });
    const flow = (approvalNeeded as any).review_approval_flow;
    assert.equal(flow?.state, "approval_needed");
    assert.ok(flow?.target_type);
    assert.ok(flow?.target_id);
    assert.equal(flow?.supporting_summary, "This prepared work is approved and ready to send.");

    const record = (
      suffix: string,
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      outcome_id: `phase34-console-${suffix}`,
      surfaced_state: "approval_needed",
      target_type: flow.target_type,
      target_id: flow.target_id,
      review_id: flow.review_id,
      approval_id: flow.approval_id,
      outbound_group_id: flow.outbound_group_id,
      assistant_action_id: flow.assistant_action_id,
      summary_snapshot: flow.summary,
      command_snapshot: flow.primary_command,
      surfaced_at: "2026-04-13T10:00:00.000Z",
      last_seen_at: "2026-04-13T10:05:00.000Z",
      state: "helpful",
      evidence_kind: "approval_progressed",
      acted_at: "2026-04-13T10:05:00.000Z",
      closed_at: "2026-04-13T10:05:00.000Z",
      ...overrides,
    });

    for (const entry of [
      record("helpful"),
      record("expired", {
        state: "expired",
        evidence_kind: "timed_out",
        surfaced_state: "approval_needed",
        acted_at: undefined,
        closed_at: "2026-04-13T11:05:00.000Z",
      }),
      record("superseded", {
        state: "superseded",
        evidence_kind: "superseded",
        surfaced_state: "send_ready",
        acted_at: undefined,
        closed_at: "2026-04-13T12:05:00.000Z",
      }),
      record("recovery", {
        state: "attempted_failed",
        evidence_kind: "regressed_to_recovery",
        surfaced_state: "approval_needed",
        acted_at: undefined,
        closed_at: "2026-04-13T13:05:00.000Z",
      }),
    ]) {
      fixture.service.db.upsertReviewApprovalFlowOutcome(entry as any);
    }

    const calibrated = await fixture.service.getStatusReport({ httpReachable: true });
    assert.equal((calibrated as any).review_approval_flow?.calibration?.status, "attention_needed");
    assert.equal(
      (calibrated as any).review_approval_flow?.calibration?.recommendation_kind,
      "consider_decision_surface_adjustment",
    );

    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(grantPayload.console_session.launch_url, { waitUntil: "commit" });
      await page.waitForFunction(() => document.documentElement.dataset.consoleReady === "1");
      await page.locator(".nav").getByRole("button", { name: "Overview", exact: true }).click();
      await page.waitForFunction(() => {
        const bodyText = document.body.textContent ?? "";
        return bodyText.includes("Review and approval: This prepared work is approved and ready to send.");
      });
      const bodyText = (await page.locator("body").textContent()) ?? "";
      assert.match(bodyText, /Review and approval: This prepared work is approved and ready to send\./);
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("phase 34 mcp approval tools execute the real confirmation-token seam", async () => {
  const mailbox = "machine@example.com";
  const fixture = await createConsoleFixture({ mailbox });
  try {
    (fixture.service as any).dependencies.sendGmailDraft = async (
      _tokensJson: string,
      _clientConfig: unknown,
      providerDraftId: string,
    ) => ({
      provider_message_id: `sent-${providerDraftId}`,
      provider_thread_id: `thread-${providerDraftId}`,
    });
    seedInboxAutopilotFixture(fixture.paths, mailbox);

    const inboxReport = await fixture.service.getInboxAutopilotReport({ httpReachable: true });
    const replyGroup = inboxReport.groups.find((group) => group.kind === "needs_reply");
    assert.ok(replyGroup);
    const prepared = await fixture.service.prepareInboxAutopilotGroup(TEST_IDENTITY, replyGroup!.group_id);
    const draftId = prepared.drafts[0]?.artifact_id;
    assert.ok(draftId);
    const review = fixture.service.db.getLatestReviewItemForArtifact(draftId!);
    assert.ok(review);

    fixture.service.openReview(TEST_IDENTITY, review!.review_id);
    fixture.service.resolveReview(TEST_IDENTITY, review!.review_id, "Reviewed for phase 34 MCP proof");
    const approval = fixture.service.requestApproval(TEST_IDENTITY, draftId!, "Ready for MCP approval");
    const approveConfirmation = fixture.service.confirmApprovalAction(TEST_IDENTITY, approval.approval_id, "approve");

    const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(appDir, "dist", "src", "mcp-server.js")],
      cwd: appDir,
      env: fixture.env,
      stderr: "pipe",
    });
    const client = new Client({ name: "phase34-mcp-test", version: "0.0.0" }, { capabilities: {} });
    try {
      await client.connect(transport);

      const pending = parseMcpJson(await client.callTool({ name: "approval_queue_pending", arguments: {} }), "approval_queue_pending");
      assert.equal(
        pending.approval_requests.some((item: { approval_id: string }) => item.approval_id === approval.approval_id),
        true,
      );

      const approveResult = parseMcpJson(
        await client.callTool({
          name: "approval_request_approve",
          arguments: {
            approval_id: approval.approval_id,
            note: "Approve via MCP seam test",
            confirmation_token: approveConfirmation.confirmation_token,
          },
        }),
        "approval_request_approve",
      );
      assert.equal(approveResult.approval.approval_request.state, "approved");

      fixture.service.enableSendWindow(TEST_IDENTITY, 15, "Allow MCP grouped send");
      const sendConfirmation = fixture.service.confirmApprovalAction(TEST_IDENTITY, approval.approval_id, "send");
      const sendResult = parseMcpJson(
        await client.callTool({
          name: "approval_request_send",
          arguments: {
            approval_id: approval.approval_id,
            note: "Send via MCP seam test",
            confirmation_token: sendConfirmation.confirmation_token,
          },
        }),
        "approval_request_send",
      );
      assert.equal(sendResult.approval.approval_request.state, "sent");
    } finally {
      await transport.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("assistant-led Phase 3 console sessions can prepare a meeting packet through the browser-safe route", async () => {
  const mailbox = "machine@example.com";
  const fixture = await createConsoleFixture({ mailbox });
  try {
    const eventId = seedMeetingPrepFixture(fixture.paths, mailbox);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const detailResponse = await fetch(`${baseUrl}/v1/workflows/prep-meetings/${encodeURIComponent(eventId)}`, {
      headers: { cookie },
    });
    assert.equal(detailResponse.status, 200);

    const prepareResponse = await fetch(
      `${baseUrl}/v1/workflows/prep-meetings/${encodeURIComponent(eventId)}/prepare`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(prepareResponse.status, 200);
    const preparePayload = (await prepareResponse.json()) as {
      meeting_prep_packet: { packet: { event_id: string; state: string; agenda: string[] } };
    };
    assert.equal(preparePayload.meeting_prep_packet.packet.event_id, eventId);
    assert.equal(preparePayload.meeting_prep_packet.packet.state, "awaiting_review");
    assert.equal(preparePayload.meeting_prep_packet.packet.agenda.length > 0, true);

    const blockedResponse = await fetch(`${baseUrl}/v1/mail/drafts/test-draft/send`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(blockedResponse.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("Phase 2 console sessions can run allowed planning group actions", async () => {
  const fixture = await createConsoleFixture();
  try {
    seedPlanningFixture(fixture.paths);
    fixture.service.refreshPlanningRecommendations(TEST_IDENTITY);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const groupListResponse = await fetch(`${baseUrl}/v1/planning-recommendation-groups`, {
      headers: {
        cookie,
      },
    });
    assert.equal(groupListResponse.status, 200);
    const groupsPayload = (await groupListResponse.json()) as {
      planning_recommendation_groups: Array<{ group_key: string }>;
    };
    assert.ok(groupsPayload.planning_recommendation_groups.length > 0);
    const groupKey = groupsPayload.planning_recommendation_groups[0]?.group_key;
    assert.ok(groupKey);

    const groupSnoozeResponse = await fetch(
      `${baseUrl}/v1/planning-recommendation-groups/${encodeURIComponent(groupKey)}/snooze`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ preset: "tomorrow-morning", note: "Group console snooze" }),
      },
    );
    assert.equal(groupSnoozeResponse.status, 200);
    const groupPayload = (await groupSnoozeResponse.json()) as {
      planning_recommendation_group: { group_key: string };
    };
    assert.equal(groupPayload.planning_recommendation_group.group_key, groupKey);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("assistant-led Phase 6 console sessions can prepare and apply planning bundles through browser-safe routes", async () => {
  const fixture = await createConsoleFixture();
  try {
    seedPlanningAutopilotFixture(fixture.service);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const reportResponse = await fetch(`${baseUrl}/v1/planning/autopilot`, {
      headers: { cookie },
    });
    assert.equal(reportResponse.status, 200);
    const reportPayload = (await reportResponse.json()) as {
      planning_autopilot: { bundles: Array<{ bundle_id: string }> };
    };
    const bundleId = reportPayload.planning_autopilot.bundles[0]?.bundle_id;
    assert.ok(bundleId);

    const prepareResponse = await fetch(
      `${baseUrl}/v1/planning/autopilot/bundles/${encodeURIComponent(bundleId)}/prepare`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(prepareResponse.status, 200);
    const preparePayload = (await prepareResponse.json()) as {
      planning_autopilot_bundle: { bundle?: { bundle_id: string; state: string; apply_ready: boolean } };
    };
    const preparedBundle = preparePayload.planning_autopilot_bundle.bundle ?? (preparePayload.planning_autopilot_bundle as any);
    assert.equal(preparedBundle.bundle_id, bundleId);
    assert.equal(preparedBundle.state, "awaiting_review");
    assert.equal(preparedBundle.apply_ready, true);

    const applyResponse = await fetch(
      `${baseUrl}/v1/planning/autopilot/bundles/${encodeURIComponent(bundleId)}/apply`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ note: "Console bundle apply", confirmed: true }),
      },
    );
    assert.equal(applyResponse.status, 200);

    const blockedResponse = await fetch(`${baseUrl}/v1/approval-queue/test-approval/send`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "still blocked" }),
    });
    assert.equal(blockedResponse.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("assistant-led Phase 7 console sessions can request approval, approve, and send grouped outbound work", async () => {
  const mailbox = "machine@example.com";
  const fixture = await createConsoleFixture({ mailbox });
  try {
    (fixture.service as any).dependencies.sendGmailDraft = async (_tokensJson: string, _clientConfig: unknown, providerDraftId: string) => ({
      provider_message_id: `sent-${providerDraftId}`,
      provider_thread_id: `thread-${providerDraftId}`,
    });
    seedInboxAutopilotFixture(fixture.paths, mailbox);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const inboxResponse = await fetch(`${baseUrl}/v1/inbox/autopilot`, { headers: { cookie } });
    const inboxPayload = (await inboxResponse.json()) as {
      inbox_autopilot: { groups: Array<{ group_id: string }> };
    };
    const inboxGroupId = inboxPayload.inbox_autopilot.groups[0]?.group_id;
    assert.ok(inboxGroupId);

    const prepareResponse = await fetch(
      `${baseUrl}/v1/inbox/autopilot/groups/${encodeURIComponent(inboxGroupId!)}/prepare`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(prepareResponse.status, 200);

    const draftsResponse = await fetch(`${baseUrl}/v1/mail/drafts`, { headers: { cookie } });
    const draftsPayload = (await draftsResponse.json()) as { drafts: Array<{ artifact_id: string }> };
    const draftId = draftsPayload.drafts[0]?.artifact_id;
    assert.ok(draftId);

    const reviewsResponse = await fetch(`${baseUrl}/v1/review-queue`, { headers: { cookie } });
    const reviewsPayload = (await reviewsResponse.json()) as {
      review_items: Array<{ review_id: string; artifact_id: string }>;
    };
    const reviewId = reviewsPayload.review_items.find((review) => review.artifact_id === draftId)?.review_id;
    assert.ok(reviewId);

    await fetch(`${baseUrl}/v1/review-queue/${encodeURIComponent(reviewId!)}/open`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    await fetch(`${baseUrl}/v1/review-queue/${encodeURIComponent(reviewId!)}/resolve`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "Reviewed in console" }),
    });

    const outboundResponse = await fetch(`${baseUrl}/v1/outbound/autopilot`, { headers: { cookie } });
    assert.equal(outboundResponse.status, 200);
    const outboundPayload = (await outboundResponse.json()) as {
      outbound_autopilot: { groups: Array<{ group_id: string; state: string }> };
    };
    const outboundGroupId = outboundPayload.outbound_autopilot.groups[0]?.group_id;
    assert.ok(outboundGroupId);

    const requestApprovalResponse = await fetch(
      `${baseUrl}/v1/outbound/autopilot/groups/${encodeURIComponent(outboundGroupId!)}/request-approval`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ note: "Ready for grouped approval" }),
      },
    );
    assert.equal(requestApprovalResponse.status, 200);

    const approveResponse = await fetch(
      `${baseUrl}/v1/outbound/autopilot/groups/${encodeURIComponent(outboundGroupId!)}/approve`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ note: "Approve grouped outbound work", confirmed: true }),
      },
    );
    assert.equal(approveResponse.status, 200);

    const blockedSendResponse = await fetch(
      `${baseUrl}/v1/outbound/autopilot/groups/${encodeURIComponent(outboundGroupId!)}/send`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ note: "Blocked send", confirmed: true }),
      },
    );
    assert.equal(blockedSendResponse.status, 400);

    fixture.service.enableSendWindow(TEST_IDENTITY, 15, "Console test grouped send");

    const sendResponse = await fetch(
      `${baseUrl}/v1/outbound/autopilot/groups/${encodeURIComponent(outboundGroupId!)}/send`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ note: "Send grouped outbound work", confirmed: true }),
      },
    );
    assert.equal(sendResponse.status, 200);

    const sendWindowMutationResponse = await fetch(`${baseUrl}/v1/send-window/enable`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ minutes: 15, reason: "still blocked" }),
    });
    assert.equal(sendWindowMutationResponse.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("assistant-led Phase 8 console sessions can read autopilot freshness while manual runs stay operator-only", async () => {
  const mailbox = "machine@example.com";
  const fixture = await createConsoleFixture({ mailbox });
  try {
    seedInboxAutopilotFixture(fixture.paths, mailbox);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const statusResponse = await fetch(`${baseUrl}/v1/autopilot/status`, {
      headers: {
        cookie,
      },
    });
    assert.equal(statusResponse.status, 200);
    const statusPayload = (await statusResponse.json()) as {
      autopilot: { enabled: boolean; profiles: Array<{ profile: string; state: string }> };
    };
    assert.equal(statusPayload.autopilot.enabled, true);
    assert.equal(statusPayload.autopilot.profiles.some((profile) => profile.profile === "inbox"), true);

    const blockedRunResponse = await fetch(`${baseUrl}/v1/autopilot/run`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(blockedRunResponse.status, 403);

    const operatorRunResponse = await fetch(`${baseUrl}/v1/autopilot/run/inbox`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(operatorRunResponse.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("Phase 2 console sessions stay blocked from approvals and task mutations", async () => {
  const fixture = await createConsoleFixture();
  try {
    seedPlanningFixture(fixture.paths);
    fixture.service.refreshPlanningRecommendations(TEST_IDENTITY);
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const approvalResponse = await fetch(`${baseUrl}/v1/approval-queue/test-approval/approve`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "nope" }),
    });
    assert.equal(approvalResponse.status, 403);

    const taskResponse = await fetch(`${baseUrl}/v1/tasks/test-task/complete`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ note: "nope" }),
    });
    assert.equal(taskResponse.status, 403);

    const policyResponse = await fetch(`${baseUrl}/v1/planning-recommendations/policy/archive`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ group: "g", kind: "schedule_task_block", source: "system_generated", note: "nope" }),
    });
    assert.equal(policyResponse.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("Phase 2 console shell and static assets are served from the daemon", async () => {
  const fixture = await createConsoleFixture();
  try {
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const shellResponse = await fetch(`${baseUrl}/console`);
    assert.equal(shellResponse.status, 200);
    assert.match(shellResponse.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await shellResponse.text(), /Operator Console/);

    const stylesResponse = await fetch(`${baseUrl}/console/assets/styles.css`);
    assert.equal(stylesResponse.status, 200);
    assert.match(stylesResponse.headers.get("content-type") ?? "", /text\/css/);

    const scriptResponse = await fetch(`${baseUrl}/console/assets/app.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type") ?? "", /text\/javascript/);
    const scriptText = await scriptResponse.text();
    assert.match(scriptText, /This approval belongs to the current grouped handoff\./);
    assert.match(scriptText, /This grouped handoff owns the forward path for review, approval, and send across the drafts below\./);
    assert.match(scriptText, /Review packages and tuning stay secondary here/i);

    const siblingModuleResponse = await fetch(`${baseUrl}/console/review-approval-presentation.js`);
    assert.equal(siblingModuleResponse.status, 200);
    assert.match(siblingModuleResponse.headers.get("content-type") ?? "", /text\/javascript/);
    assert.match(
      await siblingModuleResponse.text(),
      /consider_decision_surface_adjustment/,
    );

    const faviconResponse = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(faviconResponse.status, 204);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});
