import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { CURRENT_SCHEMA_VERSION, PersonalOpsDb } from "../src/db.js";

test("database stores drafts, approvals, review items, audit events, and phase-7 state", () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-")), "personal-ops.db");
  const db = new PersonalOpsDb(dbPath);
  assert.equal(db.getSchemaVersion(), CURRENT_SCHEMA_VERSION);

  const draft = db.createDraftArtifact(
    { client_id: "test-client" },
    "machine@example.com",
    "provider-draft-1",
    {
      to: ["person@example.com"],
      cc: [],
      bcc: [],
      subject: "Hello",
      body_text: "world",
    },
  );
  const review = db.createReviewItem(draft.artifact_id);
  const approval = db.createApprovalRequest(
    draft.artifact_id,
    { client_id: "test-client", requested_by: "operator" },
    new Date(Date.now() + 60_000).toISOString(),
    "digest-1",
    JSON.stringify({
      multiple_recipients: false,
      cc_present: false,
      bcc_present: false,
      external_recipient_present: true,
      empty_body: false,
    }),
    { allow_send: false, approval_ttl_hours: 24 },
    "Need approval",
  );

  db.recordAuditEvent({
    client_id: "test-client",
    action: "approval_request_create",
    target_type: "approval_request",
    target_id: approval.approval_id,
    outcome: "success",
    metadata: { artifact_id: draft.artifact_id },
  });

  db.upsertMailSyncState("machine@example.com", "gmail", {
    status: "ready",
    last_history_id: "123",
    last_seeded_at: new Date().toISOString(),
    last_sync_duration_ms: 321,
    last_sync_refreshed_count: 4,
    last_sync_deleted_count: 1,
  });
  db.upsertMailMessage(
    "machine@example.com",
    {
      message_id: "message-1",
      thread_id: "thread-1",
      history_id: "123",
      internal_date: String(Date.now()),
      label_ids: ["INBOX", "UNREAD"],
      from_header: "Sender <sender@example.com>",
      to_header: "machine@example.com",
      subject: "Inbox message",
    },
    new Date().toISOString(),
  );
  db.upsertCalendarSyncState("machine@example.com", "google", {
    status: "ready",
    last_synced_at: new Date().toISOString(),
    calendars_refreshed_count: 1,
    events_refreshed_count: 2,
  });
  db.replaceCalendarSources(
    "machine@example.com",
    "google",
    [
      {
        calendar_id: "primary",
        provider: "google",
        account: "machine@example.com",
        title: "Primary",
        is_primary: true,
        is_selected: true,
        updated_at: new Date().toISOString(),
      },
    ],
    new Date().toISOString(),
  );
  db.replaceCalendarEvents(
    "machine@example.com",
    "google",
    [
      {
        event_id: "primary:event-1",
        provider_event_id: "event-1",
        calendar_id: "primary",
        provider: "google",
        account: "machine@example.com",
        summary: "Standup",
        status: "confirmed",
        start_at: new Date(Date.now() + 60_000).toISOString(),
        end_at: new Date(Date.now() + 30 * 60_000).toISOString(),
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
  const task = db.createTask(
    { client_id: "operator-cli", requested_by: "operator" },
    {
      title: "Follow up with dentist",
      kind: "human_reminder",
      priority: "normal",
      owner: "operator",
      due_at: new Date(Date.now() + 60_000).toISOString(),
      remind_at: new Date(Date.now() + 30_000).toISOString(),
    },
  );
  const suggestion = db.createTaskSuggestion(
    { client_id: "codex-mcp", requested_by: "codex", auth_role: "assistant" },
    {
      title: "Remember to send notes",
      kind: "assistant_work",
      priority: "high",
    },
  );
  const recommendation = db.createPlanningRecommendation(
    { client_id: "personal-ops-system", requested_by: "system", auth_role: "operator" },
    {
      kind: "schedule_task_block",
      priority: "high",
      source: "system_generated",
      source_task_id: task.task_id,
      proposed_start_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      proposed_end_at: new Date(Date.now() + 75 * 60_000).toISOString(),
      proposed_title: task.title,
      reason_code: "task_schedule_pressure",
      reason_summary: "Reserve time for urgent task",
      dedupe_key: `schedule_task_block:${task.task_id}`,
      source_fingerprint: "fingerprint-1",
    },
  );

  assert.equal(review.artifact_id, draft.artifact_id);
  assert.equal(db.listDraftArtifacts().length, 1);
  assert.equal(db.listReviewItems().length, 1);
  assert.equal(db.listApprovalRequests({ limit: 10 }).length, 1);
  assert.equal(db.getActiveApprovalForArtifact(draft.artifact_id)?.approval_id, approval.approval_id);
  assert.equal(db.listAuditEvents({ limit: 10 }).length, 1);
  assert.equal(db.getMailSyncState("machine@example.com")?.status, "ready");
  assert.equal(db.getMailSyncState("machine@example.com")?.last_sync_duration_ms, 321);
  assert.equal(db.listUnreadMailThreads(10).length, 1);
  assert.equal(db.getCalendarSyncState("machine@example.com")?.status, "ready");
  assert.equal(db.listCalendarSources("machine@example.com").length, 1);
  assert.equal(db.listCalendarEvents({ account: "machine@example.com" }).length, 1);
  assert.equal(db.getTask(task.task_id)?.title, "Follow up with dentist");
  assert.equal(db.listTaskSuggestions({ status: "pending" }).length, 1);
  assert.equal(suggestion.status, "pending");
  assert.equal(db.listPlanningRecommendations().length, 1);
  assert.equal(db.getPlanningRecommendation(recommendation.recommendation_id)?.status, "pending");
  assert.equal(db.listTasks({ activeOnly: true }).length, 1);
  db.updateTask(task.task_id, { state: "completed", completed_at: new Date().toISOString() });
  assert.equal(db.pruneTasks(["completed"], new Date(Date.now() + 1000).toISOString()), 1);
  assert.equal(db.listTasks().length, 0);
  assert.equal(db.pruneTaskSuggestions(["pending"], new Date(Date.now() + 1000).toISOString()), 1);
  assert.equal(db.listTaskSuggestions().length, 0);
});

test("database creates a consistent sqlite backup", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const backupPath = path.join(dir, "backup.db");
  const db = new PersonalOpsDb(dbPath);
  db.createDraftArtifact(
    { client_id: "test-client" },
    "machine@example.com",
    "provider-draft-1",
    {
      to: ["person@example.com"],
      cc: [],
      bcc: [],
      subject: "Backup test",
      body_text: "snapshot",
    },
  );
  await db.createBackup(backupPath);
  assert.equal(fs.existsSync(backupPath), true);
  const restored = new PersonalOpsDb(backupPath);
  assert.equal(restored.listDraftArtifacts().length, 1);
  assert.equal(restored.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
});

test("database schema compatibility checks all phase-11 planning columns", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (12);
    CREATE TABLE planning_recommendations (
      recommendation_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      source TEXT NOT NULL,
      suggested_by_client TEXT NOT NULL,
      suggested_by_actor TEXT,
      source_task_id TEXT,
      source_thread_id TEXT,
      source_calendar_event_id TEXT,
      proposed_calendar_id TEXT,
      proposed_start_at TEXT,
      proposed_end_at TEXT,
      proposed_title TEXT,
      proposed_notes TEXT,
      reason_code TEXT NOT NULL,
      reason_summary TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      decision_note TEXT,
      snoozed_until TEXT,
      applied_task_id TEXT,
      applied_calendar_event_id TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      rank_score REAL NOT NULL DEFAULT 0,
      rank_reason TEXT,
      group_key TEXT,
      group_summary TEXT,
      trigger_signals_json TEXT NOT NULL DEFAULT '[]',
      suppressed_signals_json TEXT NOT NULL DEFAULT '[]',
      replan_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  raw.close();

  const db = new PersonalOpsDb(dbPath);
  const compatibility = db.getSchemaCompatibility();
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.message, /first_action_at/);
  assert.match(compatibility.message, /closed_at/);
  assert.match(compatibility.message, /close_reason_code/);
  assert.match(compatibility.message, /closed_by_client/);
  assert.match(compatibility.message, /closed_by_actor/);
});

test("database migrates a schema-v1 install up to the current schema", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (1);
    CREATE TABLE mail_accounts (
      email TEXT PRIMARY KEY,
      keychain_service TEXT NOT NULL,
      keychain_account TEXT NOT NULL,
      profile_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE draft_artifacts (
      artifact_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_draft_id TEXT NOT NULL,
      mailbox TEXT NOT NULL,
      to_json TEXT NOT NULL,
      cc_json TEXT NOT NULL,
      bcc_json TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT,
      body_html TEXT,
      status TEXT NOT NULL,
      review_state TEXT NOT NULL,
      created_by_client TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE review_items (
      review_id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      opened_at TEXT,
      resolved_at TEXT
    );
    CREATE TABLE audit_events (
      event_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      client_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE notification_events (
      dedupe_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      target_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE client_registrations (
      client_id TEXT PRIMARY KEY,
      requested_by TEXT,
      origin TEXT,
      last_seen_at TEXT NOT NULL
    );
  `);
  raw.close();

  const migrated = new PersonalOpsDb(dbPath);
  assert.equal(migrated.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.listApprovalRequests({ limit: 10 }).length, 0);
  assert.equal(migrated.getLatestSendWindow(), null);
  assert.equal(migrated.getMailSyncState("machine@example.com"), null);
  assert.equal(migrated.getCalendarSyncState("machine@example.com"), null);
  assert.equal(migrated.listTasks().length, 0);
  assert.equal(migrated.listTaskSuggestions().length, 0);
  assert.equal(migrated.listPlanningRecommendations({ include_resolved: true }).length, 0);
});

test("database migrates a schema-v8 install up to the current schema without crashing on startup indexes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (8);
    CREATE TABLE tasks (
      task_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      kind TEXT NOT NULL,
      state TEXT NOT NULL,
      priority TEXT NOT NULL,
      created_by_client TEXT NOT NULL,
      created_by_actor TEXT,
      owner TEXT NOT NULL,
      due_at TEXT,
      remind_at TEXT,
      source TEXT NOT NULL,
      source_suggestion_id TEXT,
      decision_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      canceled_at TEXT,
      scheduled_calendar_event_id TEXT
    );
    CREATE INDEX idx_tasks_scheduled_calendar_event_id
      ON tasks(scheduled_calendar_event_id);
  `);
  raw.close();

  const migrated = new PersonalOpsDb(dbPath);
  assert.equal(migrated.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.getTask("missing-task"), null);
  const reopened = new DatabaseSync(dbPath);
  const taskColumns = new Set((reopened.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>).map((row) => row.name));
  reopened.close();
  assert.equal(taskColumns.has("source_planning_recommendation_id"), true);
  assert.equal(taskColumns.has("source_thread_id"), true);
  assert.equal(taskColumns.has("source_calendar_event_id"), true);
  assert.equal(taskColumns.has("scheduled_calendar_event_id"), true);
  assert.equal(migrated.listPlanningRecommendations({ include_resolved: true }).length, 0);
});

test("database migrates a schema-v9 install up to the current schema and keeps planning rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (9);
    CREATE TABLE planning_recommendations (
      recommendation_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      source TEXT NOT NULL,
      suggested_by_client TEXT NOT NULL,
      suggested_by_actor TEXT,
      source_task_id TEXT,
      source_thread_id TEXT,
      source_calendar_event_id TEXT,
      proposed_calendar_id TEXT,
      proposed_start_at TEXT,
      proposed_end_at TEXT,
      proposed_title TEXT,
      proposed_notes TEXT,
      reason_code TEXT NOT NULL,
      reason_summary TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      decision_note TEXT,
      snoozed_until TEXT,
      applied_task_id TEXT,
      applied_calendar_event_id TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );
    INSERT INTO planning_recommendations (
      recommendation_id, kind, status, priority, source, suggested_by_client, reason_code,
      reason_summary, dedupe_key, source_fingerprint, created_at, updated_at
    ) VALUES (
      'rec-1', 'schedule_task_block', 'pending', 'high', 'system_generated', 'personal-ops-system',
      'task_schedule_pressure', 'Reserve time for urgent task', 'schedule_task_block:task-1', 'fp-1',
      '2026-03-24T00:00:00.000Z', '2026-03-24T00:00:00.000Z'
    );
  `);
  raw.close();

  const migrated = new PersonalOpsDb(dbPath);
  assert.equal(migrated.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
  const recommendation = migrated.getPlanningRecommendation("rec-1");
  assert.ok(recommendation);
  assert.equal(recommendation.rank_score, 0);
  assert.deepEqual(recommendation.trigger_signals, []);
  assert.deepEqual(recommendation.suppressed_signals, []);
  assert.equal(recommendation.outcome_state, "none");
  assert.equal(recommendation.slot_state, "ready");
  assert.equal(recommendation.first_action_at, undefined);
  assert.equal(recommendation.closed_at, undefined);
});

test("database migrates a schema-v10 install up to the current schema and preserves planning rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (10);
    CREATE TABLE planning_recommendations (
      recommendation_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      source TEXT NOT NULL,
      suggested_by_client TEXT NOT NULL,
      suggested_by_actor TEXT,
      source_task_id TEXT,
      source_thread_id TEXT,
      source_calendar_event_id TEXT,
      proposed_calendar_id TEXT,
      proposed_start_at TEXT,
      proposed_end_at TEXT,
      proposed_title TEXT,
      proposed_notes TEXT,
      reason_code TEXT NOT NULL,
      reason_summary TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      rank_score REAL NOT NULL DEFAULT 0,
      rank_reason TEXT,
      ranking_version TEXT,
      group_key TEXT,
      group_summary TEXT,
      source_last_seen_at TEXT,
      slot_reason TEXT,
      trigger_signals_json TEXT NOT NULL DEFAULT '[]',
      suppressed_signals_json TEXT NOT NULL DEFAULT '[]',
      replan_count INTEGER NOT NULL DEFAULT 0,
      last_replanned_at TEXT,
      decision_reason_code TEXT,
      decision_note TEXT,
      snoozed_until TEXT,
      applied_task_id TEXT,
      applied_calendar_event_id TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );
    INSERT INTO planning_recommendations (
      recommendation_id, kind, status, priority, source, suggested_by_client, reason_code, reason_summary,
      dedupe_key, source_fingerprint, created_at, updated_at
    ) VALUES (
      'rec-v10', 'schedule_thread_followup', 'pending', 'high', 'system_generated', 'personal-ops-system',
      'needs_reply', 'Set aside time to reply', 'schedule_thread_followup:thread-1', 'fp-thread-1',
      '2026-03-24T00:00:00.000Z', '2026-03-24T00:00:00.000Z'
    );
  `);
  raw.close();

  const migrated = new PersonalOpsDb(dbPath);
  assert.equal(migrated.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
  const recommendation = migrated.getPlanningRecommendation("rec-v10");
  assert.ok(recommendation);
  assert.equal(recommendation.outcome_state, "none");
  assert.equal(recommendation.slot_state, "ready");
  assert.equal(recommendation.first_action_at, undefined);
  assert.equal(recommendation.closed_at, undefined);
});

test("database migrates a schema-v11 install up to the current schema and backfills analytics fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (11);
    CREATE TABLE planning_recommendations (
      recommendation_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      source TEXT NOT NULL,
      suggested_by_client TEXT NOT NULL,
      suggested_by_actor TEXT,
      source_task_id TEXT,
      source_thread_id TEXT,
      source_calendar_event_id TEXT,
      proposed_calendar_id TEXT,
      proposed_start_at TEXT,
      proposed_end_at TEXT,
      proposed_title TEXT,
      proposed_notes TEXT,
      reason_code TEXT NOT NULL,
      reason_summary TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      rank_score REAL NOT NULL DEFAULT 0,
      rank_reason TEXT,
      ranking_version TEXT,
      group_key TEXT,
      group_summary TEXT,
      source_last_seen_at TEXT,
      slot_reason TEXT,
      trigger_signals_json TEXT NOT NULL DEFAULT '[]',
      suppressed_signals_json TEXT NOT NULL DEFAULT '[]',
      replan_count INTEGER NOT NULL DEFAULT 0,
      last_replanned_at TEXT,
      decision_reason_code TEXT,
      decision_note TEXT,
      snoozed_until TEXT,
      applied_task_id TEXT,
      applied_calendar_event_id TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      outcome_state TEXT NOT NULL DEFAULT 'none',
      outcome_recorded_at TEXT,
      outcome_source TEXT,
      outcome_summary TEXT,
      slot_state TEXT NOT NULL DEFAULT 'ready',
      slot_state_reason TEXT
    );
    INSERT INTO planning_recommendations (
      recommendation_id, kind, status, priority, source, suggested_by_client, reason_code, reason_summary,
      dedupe_key, source_fingerprint, created_at, updated_at, resolved_at, decision_reason_code, outcome_state,
      outcome_recorded_at, slot_state
    ) VALUES
    (
      'rec-rejected', 'schedule_thread_followup', 'rejected', 'high', 'system_generated', 'personal-ops-system',
      'needs_reply', 'Handled elsewhere', 'schedule_thread_followup:thread-closed', 'fp-closed',
      '2026-03-20T00:00:00.000Z', '2026-03-21T00:00:00.000Z', '2026-03-21T00:00:00.000Z', 'handled_elsewhere',
      'handled_elsewhere', '2026-03-21T00:00:00.000Z', 'ready'
    ),
    (
      'rec-applied', 'schedule_task_block', 'applied', 'high', 'system_generated', 'personal-ops-system',
      'task_schedule_pressure', 'Scheduled work', 'schedule_task_block:task-closed', 'fp-task',
      '2026-03-22T00:00:00.000Z', '2026-03-22T00:10:00.000Z', '2026-03-22T00:10:00.000Z', NULL,
      'completed', '2026-03-22T01:10:00.000Z', 'ready'
    );
  `);
  raw.close();

  const migrated = new PersonalOpsDb(dbPath);
  assert.equal(migrated.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
  const rejected = migrated.getPlanningRecommendation("rec-rejected");
  const applied = migrated.getPlanningRecommendation("rec-applied");
  assert.ok(rejected);
  assert.ok(applied);
  assert.equal(rejected.close_reason_code, "rejected_handled_elsewhere");
  assert.equal(rejected.closed_at, "2026-03-21T00:00:00.000Z");
  assert.equal(applied.first_action_type, "apply");
  assert.equal(applied.first_action_at, "2026-03-22T00:10:00.000Z");
  assert.equal(applied.close_reason_code, "task_completed");
  assert.equal(applied.closed_at, "2026-03-22T01:10:00.000Z");
});

test("database migrates schema-v12 installs to schema v13 and stores hygiene policy proposals", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (12);
    CREATE TABLE planning_recommendations (
      recommendation_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      source TEXT NOT NULL,
      suggested_by_client TEXT NOT NULL,
      suggested_by_actor TEXT,
      source_task_id TEXT,
      source_thread_id TEXT,
      source_calendar_event_id TEXT,
      proposed_calendar_id TEXT,
      proposed_start_at TEXT,
      proposed_end_at TEXT,
      proposed_title TEXT,
      proposed_notes TEXT,
      reason_code TEXT NOT NULL,
      reason_summary TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      rank_score REAL NOT NULL DEFAULT 0,
      rank_reason TEXT,
      ranking_version TEXT,
      group_key TEXT,
      group_summary TEXT,
      source_last_seen_at TEXT,
      first_action_at TEXT,
      first_action_type TEXT,
      closed_at TEXT,
      close_reason_code TEXT,
      closed_by_client TEXT,
      closed_by_actor TEXT,
      outcome_state TEXT NOT NULL DEFAULT 'none',
      outcome_recorded_at TEXT,
      outcome_source TEXT,
      outcome_summary TEXT,
      slot_state TEXT NOT NULL DEFAULT 'ready',
      slot_state_reason TEXT,
      slot_reason TEXT,
      trigger_signals_json TEXT NOT NULL DEFAULT '[]',
      suppressed_signals_json TEXT NOT NULL DEFAULT '[]',
      replan_count INTEGER NOT NULL DEFAULT 0,
      last_replanned_at TEXT,
      decision_reason_code TEXT,
      decision_note TEXT,
      snoozed_until TEXT,
      applied_task_id TEXT,
      applied_calendar_event_id TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );
  `);
  raw.close();

  const db = new PersonalOpsDb(dbPath);
  assert.equal(db.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
  assert.equal(db.listPlanningHygienePolicyProposals().length, 0);

  const proposal = db.upsertPlanningHygienePolicyProposal(
    { client_id: "operator-cli", requested_by: "operator", auth_role: "operator" },
    {
      group_key: "urgent_unscheduled_tasks",
      kind: "schedule_task_block",
      source: "system_generated",
      proposal_type: "externalized_workflow_tuning",
      status: "proposed",
      basis_signal_updated_at: "2026-03-24T00:00:00.000Z",
      note: "Track this family explicitly",
    },
  );
  assert.equal(proposal.status, "proposed");
  assert.equal(db.listPlanningHygienePolicyProposals().length, 1);

  const dismissed = db.upsertPlanningHygienePolicyProposal(
    { client_id: "operator-cli", requested_by: "operator", auth_role: "operator" },
    {
      group_key: "urgent_unscheduled_tasks",
      kind: "schedule_task_block",
      source: "system_generated",
      proposal_type: "externalized_workflow_tuning",
      status: "dismissed",
      basis_signal_updated_at: "2026-03-25T00:00:00.000Z",
      note: "Not worth pursuing",
    },
  );
  assert.equal(dismissed.proposal_id, proposal.proposal_id);
  assert.equal(dismissed.status, "dismissed");
  assert.equal(dismissed.note, "Not worth pursuing");
});

test("database migrates schema-v13 installs to schema v14 and stores policy governance events", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (13);
    CREATE TABLE planning_hygiene_policy_proposals (
      proposal_id TEXT PRIMARY KEY,
      group_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      proposal_type TEXT NOT NULL,
      status TEXT NOT NULL,
      basis_signal_updated_at TEXT,
      created_at TEXT NOT NULL,
      created_by_client TEXT NOT NULL,
      created_by_actor TEXT,
      updated_at TEXT NOT NULL,
      updated_by_client TEXT NOT NULL,
      updated_by_actor TEXT,
      note TEXT
    );
    CREATE UNIQUE INDEX idx_planning_hygiene_policy_proposals_family
      ON planning_hygiene_policy_proposals(group_key, kind, source);
    INSERT INTO planning_hygiene_policy_proposals (
      proposal_id, group_key, kind, source, proposal_type, status, basis_signal_updated_at,
      created_at, created_by_client, created_by_actor, updated_at, updated_by_client, updated_by_actor, note
    ) VALUES (
      'proposal-1', 'urgent_unscheduled_tasks', 'schedule_task_block', 'system_generated',
      'externalized_workflow_tuning', 'proposed', '2026-03-24T00:00:00.000Z',
      '2026-03-24T00:00:00.000Z', 'operator-cli', 'operator', '2026-03-24T00:00:00.000Z',
      'operator-cli', 'operator', 'Track governance history'
    );
  `);
  raw.close();

  const db = new PersonalOpsDb(dbPath);
  assert.equal(db.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
  const compatibility = db.getSchemaCompatibility();
  assert.equal(compatibility.compatible, true);
  assert.equal(db.listPlanningHygienePolicyGovernanceEvents().length, 0);

  const event = db.createPlanningHygienePolicyGovernanceEvent(
    { client_id: "operator-cli", requested_by: "operator", auth_role: "operator" },
    {
      proposal_id: "proposal-1",
      group_key: "urgent_unscheduled_tasks",
      kind: "schedule_task_block",
      source: "system_generated",
      event_type: "policy_archived",
      basis_signal_updated_at: "2026-03-24T00:00:00.000Z",
      follow_through_state_snapshot: "proposal_open",
      proposal_status_snapshot: "proposed",
      note: "Archive this inactive policy",
    },
  );
  assert.equal(event.event_type, "policy_archived");
  assert.equal(db.listPlanningHygienePolicyGovernanceEvents().length, 1);
  assert.equal(db.listPlanningHygienePolicyGovernanceEvents()[0]?.governance_event_id, event.governance_event_id);
});

test("database migrates schema-v24 installs to schema v25 and stores repair executions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-db-"));
  const dbPath = path.join(dir, "personal-ops.db");
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE schema_meta (version INTEGER NOT NULL);
    INSERT INTO schema_meta (version) VALUES (24);
    CREATE TABLE review_calibration_targets (
      scope_type TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      min_acted_on_rate REAL NOT NULL,
      max_stale_unused_rate REAL NOT NULL,
      max_negative_feedback_rate REAL NOT NULL,
      min_notification_action_conversion_rate REAL NOT NULL,
      max_notifications_per_7d INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by_client TEXT NOT NULL,
      updated_by_actor TEXT,
      PRIMARY KEY(scope_type, scope_key)
    );
  `);
  raw.close();

  const db = new PersonalOpsDb(dbPath);
  assert.equal(db.getSchemaVersion(), CURRENT_SCHEMA_VERSION);
  const execution = db.createRepairExecution({
    step_id: "install_wrappers",
    started_at: "2026-04-07T20:00:00.000Z",
    completed_at: "2026-04-07T20:01:00.000Z",
    requested_by_client: "personal-ops-cli",
    requested_by_actor: "operator",
    trigger_source: "repair_run",
    before_first_step_id: "install_wrappers",
    after_first_step_id: "install_check",
    outcome: "resolved",
    resolved_target_step: true,
    message: "Step resolved.",
  });

  assert.equal(db.getLatestRepairExecution()?.execution_id, execution.execution_id);
  assert.equal(db.listRepairExecutions({ step_id: "install_wrappers", limit: 1 })[0]?.outcome, "resolved");
});
