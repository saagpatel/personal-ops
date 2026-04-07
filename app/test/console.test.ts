import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

const TEST_IDENTITY: ClientIdentity = {
  client_id: "console-test",
  requested_by: "console-test",
  auth_role: "operator",
};

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
    paths,
    service,
    server,
  };
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

    const faviconResponse = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(faviconResponse.status, 204);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});
