import { backup, DatabaseSync, SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ApprovalRequest,
  ApprovalRequestFilter,
  PlanningHygienePolicyGovernanceEvent,
  PlanningHygienePolicyGovernanceEventType,
  PlanningRecommendationCloseReasonCode,
  ApprovalRequestState,
  AuditEvent,
  AuditEventFilter,
  AuditEventInput,
  CalendarEvent,
  CalendarProvider,
  CalendarSource,
  CalendarSyncState,
  CalendarSyncStatus,
  ClientIdentity,
  DraftArtifact,
  DraftArtifactStatus,
  DraftInput,
  DraftReviewState,
  GmailMessageMetadata,
  MailMessage,
  MailSyncState,
  MailSyncStatus,
  MailThread,
  PolicySnapshot,
  PlanningHygienePolicyProposal,
  PlanningHygienePolicyProposalStatus,
  PlanningHygienePolicyProposalType,
  PlanningRecommendation,
  PlanningRecommendationFilter,
  PlanningRecommendationFirstActionType,
  PlanningRecommendationFollowThroughState,
  PlanningRecommendationKind,
  PlanningRecommendationOutcomeState,
  PlanningRecommendationOutcomeSource,
  PlanningRecommendationSource,
  PlanningRecommendationSlotState,
  PlanningRecommendationStatus,
  ReviewItem,
  ReviewItemState,
  SendWindow,
  SendWindowState,
  TaskItem,
  TaskOwner,
  TaskPriority,
  TaskSource,
  TaskState,
  TaskSuggestion,
  TaskSuggestionStatus,
} from "./types.js";

export const CURRENT_SCHEMA_VERSION = 14;
const SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

function nowIso(): string {
  return new Date().toISOString();
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function fromJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export class PersonalOpsDb {
  private readonly db: DatabaseSync;

  constructor(private readonly databaseFile: string) {
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    this.db = new DatabaseSync(databaseFile);
    this.db.exec(`PRAGMA journal_mode = WAL;`);
    this.createBaseSchema();
    this.migrate();
  }

  registerClient(identity: ClientIdentity): void {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO client_registrations (client_id, label, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(client_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, label = excluded.label`,
      )
      .run(identity.client_id, identity.requested_by ?? identity.client_id, now, now);
  }

  upsertMailAccount(email: string, keychainService: string, profileJson: string): void {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO mail_accounts (email, provider, keychain_service, keychain_account, connected_at, profile_json)
         VALUES (?, 'gmail', ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           keychain_service = excluded.keychain_service,
           keychain_account = excluded.keychain_account,
           connected_at = excluded.connected_at,
           profile_json = excluded.profile_json`,
      )
      .run(email, keychainService, email, now, profileJson);
  }

  getMailAccount(): { email: string; keychain_service: string; keychain_account: string; profile_json: string } | null {
    const row = this.db
      .prepare(
        `SELECT email, keychain_service, keychain_account, profile_json
         FROM mail_accounts
         ORDER BY connected_at DESC
         LIMIT 1`,
      )
      .get() as { email: string; keychain_service: string; keychain_account: string; profile_json: string } | undefined;
    return row ?? null;
  }

  getSchemaVersion(): number {
    const row = this.db.prepare(`SELECT version FROM schema_meta LIMIT 1`).get() as { version: number } | undefined;
    return row?.version ?? 1;
  }

  getSchemaCompatibility(): { current_version: number; expected_version: number; compatible: boolean; message: string } {
    const current = this.getSchemaVersion();
    if (current < SCHEMA_VERSION) {
      return {
        current_version: current,
        expected_version: SCHEMA_VERSION,
        compatible: false,
        message: `Schema version ${current} is below required version ${SCHEMA_VERSION}.`,
      };
    }
    const missingColumns: string[] = [];
    for (const column of [
      "rank_score",
      "rank_reason",
      "ranking_version",
      "group_key",
      "group_summary",
      "source_last_seen_at",
      "first_action_at",
      "first_action_type",
      "closed_at",
      "close_reason_code",
      "closed_by_client",
      "closed_by_actor",
      "outcome_state",
      "outcome_recorded_at",
      "outcome_source",
      "outcome_summary",
      "slot_state",
      "slot_state_reason",
      "slot_reason",
      "trigger_signals_json",
      "suppressed_signals_json",
      "replan_count",
      "last_replanned_at",
      "decision_reason_code",
    ]) {
      if (!this.columnExists("planning_recommendations", column)) {
        missingColumns.push(column);
      }
    }
    if (missingColumns.length > 0) {
      return {
        current_version: current,
        expected_version: SCHEMA_VERSION,
        compatible: false,
        message: `Schema ${current} is missing planning columns: ${missingColumns.join(", ")}.`,
      };
    }
    if (!this.tableExists("planning_hygiene_policy_proposals")) {
      return {
        current_version: current,
        expected_version: SCHEMA_VERSION,
        compatible: false,
        message: "Schema is missing planning_hygiene_policy_proposals.",
      };
    }
    const missingProposalColumns: string[] = [];
    for (const column of [
      "proposal_id",
      "group_key",
      "kind",
      "source",
      "proposal_type",
      "status",
      "basis_signal_updated_at",
      "created_at",
      "created_by_client",
      "created_by_actor",
      "updated_at",
      "updated_by_client",
      "updated_by_actor",
      "note",
    ]) {
      if (!this.columnExists("planning_hygiene_policy_proposals", column)) {
        missingProposalColumns.push(column);
      }
    }
    if (missingProposalColumns.length > 0) {
      return {
        current_version: current,
        expected_version: SCHEMA_VERSION,
        compatible: false,
        message: `Schema ${current} is missing proposal columns: ${missingProposalColumns.join(", ")}.`,
      };
    }
    if (!this.tableExists("planning_hygiene_policy_governance_events")) {
      return {
        current_version: current,
        expected_version: SCHEMA_VERSION,
        compatible: false,
        message: "Schema is missing planning_hygiene_policy_governance_events.",
      };
    }
    const missingGovernanceColumns: string[] = [];
    for (const column of [
      "governance_event_id",
      "proposal_id",
      "group_key",
      "kind",
      "source",
      "event_type",
      "basis_signal_updated_at",
      "follow_through_state_snapshot",
      "proposal_status_snapshot",
      "recorded_at",
      "recorded_by_client",
      "recorded_by_actor",
      "note",
    ]) {
      if (!this.columnExists("planning_hygiene_policy_governance_events", column)) {
        missingGovernanceColumns.push(column);
      }
    }
    if (missingGovernanceColumns.length > 0) {
      return {
        current_version: current,
        expected_version: SCHEMA_VERSION,
        compatible: false,
        message: `Schema ${current} is missing governance columns: ${missingGovernanceColumns.join(", ")}.`,
      };
    }
    return {
      current_version: current,
      expected_version: SCHEMA_VERSION,
      compatible: true,
      message: `Schema version ${current} matches expected version ${SCHEMA_VERSION}.`,
    };
  }

  createDraftArtifact(identity: ClientIdentity, mailbox: string, providerDraftId: string, input: DraftInput): DraftArtifact {
    const now = nowIso();
    const artifactId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO draft_artifacts (
          artifact_id, provider, provider_draft_id, mailbox, to_json, cc_json, bcc_json, subject,
          body_text, body_html, status, review_state, created_by_client, created_at, updated_at,
          provider_message_id, provider_thread_id, approved_at, approved_by_client, sent_at, sent_by_client,
          send_attempt_count, last_send_attempt_at, last_send_error_code, last_send_error_message
        ) VALUES (?, 'gmail', ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL)`,
      )
      .run(
        artifactId,
        providerDraftId,
        mailbox,
        toJson(input.to),
        toJson(input.cc),
        toJson(input.bcc),
        input.subject,
        input.body_text ?? null,
        input.body_html ?? null,
        identity.client_id,
        now,
        now,
      );
    return this.getDraftArtifact(artifactId)!;
  }

  updateDraftArtifact(artifactId: string, input: DraftInput): DraftArtifact | null {
    const now = nowIso();
    this.db
      .prepare(
        `UPDATE draft_artifacts
         SET to_json = ?, cc_json = ?, bcc_json = ?, subject = ?, body_text = ?, body_html = ?, updated_at = ?
         WHERE artifact_id = ?`,
      )
      .run(
        toJson(input.to),
        toJson(input.cc),
        toJson(input.bcc),
        input.subject,
        input.body_text ?? null,
        input.body_html ?? null,
        now,
        artifactId,
      );
    return this.getDraftArtifact(artifactId);
  }

  getDraftArtifact(artifactId: string): DraftArtifact | null {
    const row = this.db.prepare(`SELECT * FROM draft_artifacts WHERE artifact_id = ?`).get(artifactId) as Record<string, unknown> | undefined;
    return row ? this.mapDraft(row) : null;
  }

  getDraftArtifactByProviderId(providerDraftId: string): DraftArtifact | null {
    const row = this.db
      .prepare(`SELECT * FROM draft_artifacts WHERE provider_draft_id = ?`)
      .get(providerDraftId) as Record<string, unknown> | undefined;
    return row ? this.mapDraft(row) : null;
  }

  listDraftArtifacts(): DraftArtifact[] {
    const rows = this.db.prepare(`SELECT * FROM draft_artifacts ORDER BY updated_at DESC`).all() as Record<string, unknown>[];
    return rows.map((row) => this.mapDraft(row));
  }

  updateDraftLifecycle(
    artifactId: string,
    updates: {
      status?: DraftArtifactStatus;
      review_state?: DraftReviewState;
      approved_at?: string | null;
      approved_by_client?: string | null;
      sent_at?: string | null;
      sent_by_client?: string | null;
      provider_message_id?: string | null;
      provider_thread_id?: string | null;
      send_attempt_count?: number;
      last_send_attempt_at?: string | null;
      last_send_error_code?: string | null;
      last_send_error_message?: string | null;
    },
  ): DraftArtifact | null {
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };

    if (updates.status) push("status", updates.status);
    if (updates.review_state) push("review_state", updates.review_state);
    if (updates.approved_at !== undefined) push("approved_at", updates.approved_at);
    if (updates.approved_by_client !== undefined) push("approved_by_client", updates.approved_by_client);
    if (updates.sent_at !== undefined) push("sent_at", updates.sent_at);
    if (updates.sent_by_client !== undefined) push("sent_by_client", updates.sent_by_client);
    if (updates.provider_message_id !== undefined) push("provider_message_id", updates.provider_message_id);
    if (updates.provider_thread_id !== undefined) push("provider_thread_id", updates.provider_thread_id);
    if (updates.send_attempt_count !== undefined) push("send_attempt_count", updates.send_attempt_count);
    if (updates.last_send_attempt_at !== undefined) push("last_send_attempt_at", updates.last_send_attempt_at);
    if (updates.last_send_error_code !== undefined) push("last_send_error_code", updates.last_send_error_code);
    if (updates.last_send_error_message !== undefined) push("last_send_error_message", updates.last_send_error_message);
    push("updated_at", nowIso());

    params.push(artifactId);
    this.db.prepare(`UPDATE draft_artifacts SET ${sets.join(", ")} WHERE artifact_id = ?`).run(...params);
    return this.getDraftArtifact(artifactId);
  }

  createReviewItem(artifactId: string): ReviewItem {
    const reviewId = randomUUID();
    this.db
      .prepare(`INSERT INTO review_items (review_id, artifact_id, kind, state, created_at) VALUES (?, ?, 'draft_review', 'pending', ?)`)
      .run(reviewId, artifactId, nowIso());
    return this.getReviewItem(reviewId)!;
  }

  getReviewItem(reviewId: string): ReviewItem | null {
    const row = this.db
      .prepare(
        `SELECT review_items.review_id, review_items.artifact_id, review_items.kind, review_items.state, review_items.created_at,
                review_items.opened_at, review_items.resolved_at, draft_artifacts.subject
         FROM review_items
         JOIN draft_artifacts ON draft_artifacts.artifact_id = review_items.artifact_id
         WHERE review_items.review_id = ?`,
      )
      .get(reviewId) as Record<string, unknown> | undefined;
    return row ? this.mapReview(row) : null;
  }

  listReviewItems(): ReviewItem[] {
    const rows = this.db
      .prepare(
        `SELECT review_items.review_id, review_items.artifact_id, review_items.kind, review_items.state, review_items.created_at,
                review_items.opened_at, review_items.resolved_at, draft_artifacts.subject
         FROM review_items
         JOIN draft_artifacts ON draft_artifacts.artifact_id = review_items.artifact_id
         ORDER BY review_items.created_at DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.mapReview(row));
  }

  listPendingReviewItems(): ReviewItem[] {
    const rows = this.db
      .prepare(
        `SELECT review_items.review_id, review_items.artifact_id, review_items.kind, review_items.state, review_items.created_at,
                review_items.opened_at, review_items.resolved_at, draft_artifacts.subject
         FROM review_items
         JOIN draft_artifacts ON draft_artifacts.artifact_id = review_items.artifact_id
         WHERE review_items.state = 'pending'
         ORDER BY review_items.created_at DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.mapReview(row));
  }

  markReviewOpened(reviewId: string): ReviewItem | null {
    const now = nowIso();
    this.db
      .prepare(`UPDATE review_items SET state = 'opened', opened_at = ?, resolved_at = NULL WHERE review_id = ? AND state = 'pending'`)
      .run(now, reviewId);
    return this.getReviewItem(reviewId);
  }

  markReviewResolved(reviewId: string): ReviewItem | null {
    const now = nowIso();
    this.db
      .prepare(
        `UPDATE review_items
         SET state = 'resolved', resolved_at = ?, opened_at = COALESCE(opened_at, ?)
         WHERE review_id = ? AND state IN ('pending', 'opened')`,
      )
      .run(now, now, reviewId);
    return this.getReviewItem(reviewId);
  }

  resolveReviewItemsForArtifact(artifactId: string): number {
    const now = nowIso();
    const result = this.db
      .prepare(
        `UPDATE review_items
         SET state = 'resolved', resolved_at = ?
         WHERE artifact_id = ? AND state IN ('pending', 'opened')`,
      )
      .run(now, artifactId);
    return Number(result.changes ?? 0);
  }

  createApprovalRequest(
    artifactId: string,
    identity: ClientIdentity,
    expiresAt: string,
    draftDigest: string,
    riskFlags: string,
    policySnapshot: PolicySnapshot,
    note?: string,
  ): ApprovalRequest {
    const approvalId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO approval_requests (
          approval_id, artifact_id, state, requested_at, requested_by_client, requested_by_actor,
          approved_at, approved_by_client, approved_by_actor, rejected_at, rejected_by_client, rejected_by_actor,
          expires_at, decision_note, send_note, draft_digest, risk_flags_json, policy_snapshot_json,
          confirmation_digest, confirmation_expires_at, last_error_code, last_error_message, created_at, updated_at
        ) VALUES (?, ?, 'pending', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        approvalId,
        artifactId,
        now,
        identity.client_id,
        identity.requested_by ?? null,
        expiresAt,
        note ?? null,
        draftDigest,
        riskFlags,
        JSON.stringify(policySnapshot),
        now,
        now,
      );
    return this.getApprovalRequest(approvalId)!;
  }

  getApprovalRequest(approvalId: string): ApprovalRequest | null {
    const row = this.db
      .prepare(`SELECT * FROM approval_requests WHERE approval_id = ?`)
      .get(approvalId) as Record<string, unknown> | undefined;
    return row ? this.mapApproval(row) : null;
  }

  getActiveApprovalForArtifact(artifactId: string): ApprovalRequest | null {
    const row = this.db
      .prepare(
        `SELECT * FROM approval_requests
         WHERE artifact_id = ? AND state IN ('pending', 'approved', 'sending', 'send_failed')
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(artifactId) as Record<string, unknown> | undefined;
    return row ? this.mapApproval(row) : null;
  }

  listApprovalRequests(filter: ApprovalRequestFilter): ApprovalRequest[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.state) {
      clauses.push(`state = ?`);
      params.push(filter.state);
    }
    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM approval_requests ${whereClause} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, filter.limit) as Record<string, unknown>[];
    return rows.map((row) => this.mapApproval(row));
  }

  updateApprovalRequest(
    approvalId: string,
    updates: {
      state?: ApprovalRequestState;
      approved_at?: string | null;
      approved_by_client?: string | null;
      approved_by_actor?: string | null;
      rejected_at?: string | null;
      rejected_by_client?: string | null;
      rejected_by_actor?: string | null;
      decision_note?: string | null;
      send_note?: string | null;
      confirmation_digest?: string | null;
      confirmation_expires_at?: string | null;
      last_error_code?: string | null;
      last_error_message?: string | null;
      draft_digest?: string;
    },
  ): ApprovalRequest | null {
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };

    if (updates.state) push("state", updates.state);
    if (updates.approved_at !== undefined) push("approved_at", updates.approved_at);
    if (updates.approved_by_client !== undefined) push("approved_by_client", updates.approved_by_client);
    if (updates.approved_by_actor !== undefined) push("approved_by_actor", updates.approved_by_actor);
    if (updates.rejected_at !== undefined) push("rejected_at", updates.rejected_at);
    if (updates.rejected_by_client !== undefined) push("rejected_by_client", updates.rejected_by_client);
    if (updates.rejected_by_actor !== undefined) push("rejected_by_actor", updates.rejected_by_actor);
    if (updates.decision_note !== undefined) push("decision_note", updates.decision_note);
    if (updates.send_note !== undefined) push("send_note", updates.send_note);
    if (updates.confirmation_digest !== undefined) push("confirmation_digest", updates.confirmation_digest);
    if (updates.confirmation_expires_at !== undefined) push("confirmation_expires_at", updates.confirmation_expires_at);
    if (updates.last_error_code !== undefined) push("last_error_code", updates.last_error_code);
    if (updates.last_error_message !== undefined) push("last_error_message", updates.last_error_message);
    if (updates.draft_digest !== undefined) push("draft_digest", updates.draft_digest);
    push("updated_at", nowIso());
    params.push(approvalId);

    this.db.prepare(`UPDATE approval_requests SET ${sets.join(", ")} WHERE approval_id = ?`).run(...params);
    return this.getApprovalRequest(approvalId);
  }

  consumeApprovalConfirmation(
    approvalId: string,
    expectedDigest: string,
    notExpiredAfter: string,
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE approval_requests
         SET confirmation_digest = NULL,
             confirmation_expires_at = NULL,
             updated_at = ?
         WHERE approval_id = ?
           AND confirmation_digest = ?
           AND confirmation_expires_at IS NOT NULL
           AND confirmation_expires_at >= ?`,
      )
      .run(nowIso(), approvalId, expectedDigest, notExpiredAfter) as { changes?: number };
    return Number(result.changes ?? 0) > 0;
  }

  countApprovalStates(): Record<ApprovalRequestState, number> {
    const rows = this.db
      .prepare(`SELECT state, COUNT(*) AS count FROM approval_requests GROUP BY state`)
      .all() as Array<{ state: ApprovalRequestState; count: number }>;
    const counts: Record<ApprovalRequestState, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      sending: 0,
      sent: 0,
      send_failed: 0,
    };
    for (const row of rows) {
      counts[row.state] = Number(row.count);
    }
    return counts;
  }

  createSendWindow(
    identity: ClientIdentity,
    expiresAt: string,
    reason: string,
  ): SendWindow {
    const windowId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO send_windows (
          window_id, state, enabled_at, enabled_by_client, enabled_by_actor, expires_at, reason,
          disabled_at, disabled_by_client, disabled_by_actor, disable_reason, created_at, updated_at
        ) VALUES (?, 'active', ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        windowId,
        now,
        identity.client_id,
        identity.requested_by ?? null,
        expiresAt,
        reason,
        now,
        now,
      );
    return this.getSendWindow(windowId)!;
  }

  getSendWindow(windowId: string): SendWindow | null {
    const row = this.db.prepare(`SELECT * FROM send_windows WHERE window_id = ?`).get(windowId) as Record<string, unknown> | undefined;
    return row ? this.mapSendWindow(row) : null;
  }

  getActiveSendWindow(): SendWindow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM send_windows
         WHERE state = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get() as Record<string, unknown> | undefined;
    return row ? this.mapSendWindow(row) : null;
  }

  getLatestSendWindow(): SendWindow | null {
    const row = this.db
      .prepare(`SELECT * FROM send_windows ORDER BY created_at DESC LIMIT 1`)
      .get() as Record<string, unknown> | undefined;
    return row ? this.mapSendWindow(row) : null;
  }

  updateSendWindow(
    windowId: string,
    updates: {
      state?: SendWindowState;
      disabled_at?: string | null;
      disabled_by_client?: string | null;
      disabled_by_actor?: string | null;
      disable_reason?: string | null;
      expires_at?: string;
    },
  ): SendWindow | null {
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };
    if (updates.state !== undefined) push("state", updates.state);
    if (updates.disabled_at !== undefined) push("disabled_at", updates.disabled_at);
    if (updates.disabled_by_client !== undefined) push("disabled_by_client", updates.disabled_by_client);
    if (updates.disabled_by_actor !== undefined) push("disabled_by_actor", updates.disabled_by_actor);
    if (updates.disable_reason !== undefined) push("disable_reason", updates.disable_reason);
    if (updates.expires_at !== undefined) push("expires_at", updates.expires_at);
    push("updated_at", nowIso());
    params.push(windowId);
    this.db.prepare(`UPDATE send_windows SET ${sets.join(", ")} WHERE window_id = ?`).run(...params);
    return this.getSendWindow(windowId);
  }

  expireActiveSendWindows(now: string): number {
    const result = this.db
      .prepare(
        `UPDATE send_windows
         SET state = 'expired', updated_at = ?
         WHERE state = 'active' AND expires_at <= ?`,
      )
      .run(now, now);
    return Number(result.changes ?? 0);
  }

  createTask(
    identity: ClientIdentity,
    input: {
      title: string;
      notes?: string | undefined;
      kind: TaskItem["kind"];
      priority: TaskPriority;
      owner: TaskOwner;
      due_at?: string | null | undefined;
      remind_at?: string | null | undefined;
      source?: TaskSource | undefined;
      source_suggestion_id?: string | null | undefined;
      source_planning_recommendation_id?: string | null | undefined;
      source_thread_id?: string | null | undefined;
      source_calendar_event_id?: string | null | undefined;
      decision_note?: string | null | undefined;
    },
  ): TaskItem {
    const taskId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO tasks (
          task_id, title, notes, kind, state, priority, created_by_client, created_by_actor, owner,
          due_at, remind_at, source, source_suggestion_id, source_planning_recommendation_id, source_thread_id,
          source_calendar_event_id, decision_note, created_at, updated_at, completed_at, canceled_at, scheduled_calendar_event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      )
      .run(
        taskId,
        input.title,
        input.notes ?? null,
        input.kind,
        "pending",
        input.priority,
        identity.client_id,
        identity.requested_by ?? null,
        input.owner,
        input.due_at ?? null,
        input.remind_at ?? null,
        input.source ?? "manual",
        input.source_suggestion_id ?? null,
        input.source_planning_recommendation_id ?? null,
        input.source_thread_id ?? null,
        input.source_calendar_event_id ?? null,
        input.decision_note ?? null,
        now,
        now,
      );
    return this.getTask(taskId)!;
  }

  getTask(taskId: string): TaskItem | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE task_id = ?`).get(taskId) as Record<string, unknown> | undefined;
    return row ? this.mapTask(row) : null;
  }

  listTasks(filter: {
    state?: TaskState | undefined;
    activeOnly?: boolean | undefined;
    dueBefore?: string | undefined;
    overdueBefore?: string | undefined;
    limit?: number | undefined;
  } = {}): TaskItem[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.state) {
      clauses.push(`state = ?`);
      params.push(filter.state);
    }
    if (filter.activeOnly) {
      clauses.push(`state IN ('pending', 'in_progress')`);
    }
    if (filter.dueBefore) {
      clauses.push(`due_at IS NOT NULL AND due_at <= ? AND state IN ('pending', 'in_progress')`);
      params.push(filter.dueBefore);
    }
    if (filter.overdueBefore) {
      clauses.push(`due_at IS NOT NULL AND due_at < ? AND state IN ('pending', 'in_progress')`);
      params.push(filter.overdueBefore);
    }
    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = filter.limit ? `LIMIT ${Math.max(1, Math.floor(filter.limit))}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM tasks ${whereClause} ORDER BY updated_at DESC ${limitClause}`)
      .all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapTask(row));
  }

  pruneTasks(states: TaskState[], olderThanIso: string): number {
    if (states.length === 0) {
      return 0;
    }
    const placeholders = states.map(() => "?").join(", ");
    const result = this.db
      .prepare(`DELETE FROM tasks WHERE state IN (${placeholders}) AND updated_at <= ?`)
      .run(...states, olderThanIso) as { changes?: number };
    return Number(result.changes ?? 0);
  }

  updateTask(
    taskId: string,
    updates: {
      title?: string | undefined;
      notes?: string | null | undefined;
      kind?: TaskItem["kind"] | undefined;
      state?: TaskState | undefined;
      priority?: TaskPriority | undefined;
      owner?: TaskOwner | undefined;
      due_at?: string | null | undefined;
      remind_at?: string | null | undefined;
      decision_note?: string | null | undefined;
      completed_at?: string | null | undefined;
      canceled_at?: string | null | undefined;
      scheduled_calendar_event_id?: string | null | undefined;
      source_planning_recommendation_id?: string | null | undefined;
      source_thread_id?: string | null | undefined;
      source_calendar_event_id?: string | null | undefined;
    },
  ): TaskItem | null {
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };

    if (updates.title !== undefined) push("title", updates.title);
    if (updates.notes !== undefined) push("notes", updates.notes);
    if (updates.kind !== undefined) push("kind", updates.kind);
    if (updates.state !== undefined) push("state", updates.state);
    if (updates.priority !== undefined) push("priority", updates.priority);
    if (updates.owner !== undefined) push("owner", updates.owner);
    if (updates.due_at !== undefined) push("due_at", updates.due_at);
    if (updates.remind_at !== undefined) push("remind_at", updates.remind_at);
    if (updates.decision_note !== undefined) push("decision_note", updates.decision_note);
    if (updates.completed_at !== undefined) push("completed_at", updates.completed_at);
    if (updates.canceled_at !== undefined) push("canceled_at", updates.canceled_at);
    if (updates.scheduled_calendar_event_id !== undefined) {
      push("scheduled_calendar_event_id", updates.scheduled_calendar_event_id);
    }
    if (updates.source_planning_recommendation_id !== undefined) {
      push("source_planning_recommendation_id", updates.source_planning_recommendation_id);
    }
    if (updates.source_thread_id !== undefined) {
      push("source_thread_id", updates.source_thread_id);
    }
    if (updates.source_calendar_event_id !== undefined) {
      push("source_calendar_event_id", updates.source_calendar_event_id);
    }
    push("updated_at", nowIso());
    params.push(taskId);

    this.db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE task_id = ?`).run(...params);
    return this.getTask(taskId);
  }

  countTaskStates(): Record<TaskState, number> {
    const rows = this.db
      .prepare(`SELECT state, COUNT(*) AS count FROM tasks GROUP BY state`)
      .all() as Array<{ state: TaskState; count: number }>;
    const counts: Record<TaskState, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      canceled: 0,
    };
    for (const row of rows) {
      counts[row.state] = Number(row.count);
    }
    return counts;
  }

  countTasksWithScheduledEvent(activeOnly = false): number {
    const row = activeOnly
      ? ((this.db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM tasks
             WHERE scheduled_calendar_event_id IS NOT NULL
               AND state IN ('pending', 'in_progress')`,
          )
          .get() as { count: number }))
      : ((this.db
          .prepare(`SELECT COUNT(*) AS count FROM tasks WHERE scheduled_calendar_event_id IS NOT NULL`)
          .get() as { count: number }));
    return Number(row.count ?? 0);
  }

  createTaskSuggestion(
    identity: ClientIdentity,
    input: {
      title: string;
      notes?: string | undefined;
      kind: TaskItem["kind"];
      priority: TaskPriority;
      due_at?: string | null | undefined;
      remind_at?: string | null | undefined;
    },
  ): TaskSuggestion {
    const suggestionId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO task_suggestions (
          suggestion_id, title, notes, kind, priority, due_at, remind_at, suggested_by_client, suggested_by_actor,
          status, accepted_task_id, decision_note, created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, NULL)`,
      )
      .run(
        suggestionId,
        input.title,
        input.notes ?? null,
        input.kind,
        input.priority,
        input.due_at ?? null,
        input.remind_at ?? null,
        identity.client_id,
        identity.requested_by ?? null,
        now,
        now,
      );
    return this.getTaskSuggestion(suggestionId)!;
  }

  getTaskSuggestion(suggestionId: string): TaskSuggestion | null {
    const row = this.db
      .prepare(`SELECT * FROM task_suggestions WHERE suggestion_id = ?`)
      .get(suggestionId) as Record<string, unknown> | undefined;
    return row ? this.mapTaskSuggestion(row) : null;
  }

  listTaskSuggestions(filter: { status?: TaskSuggestionStatus | undefined; limit?: number | undefined } = {}): TaskSuggestion[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.status) {
      clauses.push(`status = ?`);
      params.push(filter.status);
    }
    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = filter.limit ? `LIMIT ${Math.max(1, Math.floor(filter.limit))}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM task_suggestions ${whereClause} ORDER BY updated_at DESC ${limitClause}`)
      .all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapTaskSuggestion(row));
  }

  pruneTaskSuggestions(statuses: TaskSuggestionStatus[], olderThanIso: string): number {
    if (statuses.length === 0) {
      return 0;
    }
    const placeholders = statuses.map(() => "?").join(", ");
    const result = this.db
      .prepare(`DELETE FROM task_suggestions WHERE status IN (${placeholders}) AND updated_at <= ?`)
      .run(...statuses, olderThanIso) as { changes?: number };
    return Number(result.changes ?? 0);
  }

  updateTaskSuggestion(
    suggestionId: string,
    updates: {
      status?: TaskSuggestionStatus | undefined;
      accepted_task_id?: string | null | undefined;
      decision_note?: string | null | undefined;
      resolved_at?: string | null | undefined;
    },
  ): TaskSuggestion | null {
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };

    if (updates.status !== undefined) push("status", updates.status);
    if (updates.accepted_task_id !== undefined) push("accepted_task_id", updates.accepted_task_id);
    if (updates.decision_note !== undefined) push("decision_note", updates.decision_note);
    if (updates.resolved_at !== undefined) push("resolved_at", updates.resolved_at);
    push("updated_at", nowIso());
    params.push(suggestionId);
    this.db.prepare(`UPDATE task_suggestions SET ${sets.join(", ")} WHERE suggestion_id = ?`).run(...params);
    return this.getTaskSuggestion(suggestionId);
  }

  countTaskSuggestionStates(): Record<TaskSuggestionStatus, number> {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS count FROM task_suggestions GROUP BY status`)
      .all() as Array<{ status: TaskSuggestionStatus; count: number }>;
    const counts: Record<TaskSuggestionStatus, number> = {
      pending: 0,
      accepted: 0,
      rejected: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  createPlanningRecommendation(
    identity: ClientIdentity,
    input: {
      kind: PlanningRecommendationKind;
      status?: PlanningRecommendationStatus | undefined;
      priority: TaskPriority;
      source: PlanningRecommendationSource;
      source_task_id?: string | null | undefined;
      source_thread_id?: string | null | undefined;
      source_calendar_event_id?: string | null | undefined;
      proposed_calendar_id?: string | null | undefined;
      proposed_start_at?: string | null | undefined;
      proposed_end_at?: string | null | undefined;
      proposed_title?: string | null | undefined;
      proposed_notes?: string | null | undefined;
      reason_code: string;
      reason_summary: string;
      dedupe_key: string;
      source_fingerprint: string;
      rank_score?: number | undefined;
      rank_reason?: string | null | undefined;
      ranking_version?: string | null | undefined;
      group_key?: string | null | undefined;
      group_summary?: string | null | undefined;
      source_last_seen_at?: string | null | undefined;
      first_action_at?: string | null | undefined;
      first_action_type?: PlanningRecommendationFirstActionType | null | undefined;
      closed_at?: string | null | undefined;
      close_reason_code?: PlanningRecommendationCloseReasonCode | null | undefined;
      closed_by_client?: string | null | undefined;
      closed_by_actor?: string | null | undefined;
      outcome_state?: PlanningRecommendationOutcomeState | undefined;
      outcome_recorded_at?: string | null | undefined;
      outcome_source?: PlanningRecommendationOutcomeSource | null | undefined;
      outcome_summary?: string | null | undefined;
      slot_state?: PlanningRecommendationSlotState | undefined;
      slot_state_reason?: string | null | undefined;
      slot_reason?: string | null | undefined;
      trigger_signals?: string[] | null | undefined;
      suppressed_signals?: string[] | null | undefined;
      replan_count?: number | undefined;
      last_replanned_at?: string | null | undefined;
      decision_reason_code?: string | null | undefined;
      decision_note?: string | null | undefined;
      snoozed_until?: string | null | undefined;
      applied_task_id?: string | null | undefined;
      applied_calendar_event_id?: string | null | undefined;
      last_error_code?: string | null | undefined;
      last_error_message?: string | null | undefined;
      resolved_at?: string | null | undefined;
    },
  ): PlanningRecommendation {
    const recommendationId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO planning_recommendations (
          recommendation_id, kind, status, priority, source, suggested_by_client, suggested_by_actor,
          source_task_id, source_thread_id, source_calendar_event_id, proposed_calendar_id, proposed_start_at,
          proposed_end_at, proposed_title, proposed_notes, reason_code, reason_summary, dedupe_key, source_fingerprint,
          rank_score, rank_reason, ranking_version, group_key, group_summary, source_last_seen_at, first_action_at,
          first_action_type, closed_at, close_reason_code, closed_by_client, closed_by_actor, outcome_state,
          outcome_recorded_at, outcome_source, outcome_summary, slot_state, slot_state_reason, slot_reason,
          trigger_signals_json, suppressed_signals_json, replan_count, last_replanned_at, decision_reason_code,
          decision_note, snoozed_until, applied_task_id, applied_calendar_event_id, last_error_code, last_error_message,
          created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        recommendationId,
        input.kind,
        input.status ?? "pending",
        input.priority,
        input.source,
        identity.client_id,
        identity.requested_by ?? null,
        input.source_task_id ?? null,
        input.source_thread_id ?? null,
        input.source_calendar_event_id ?? null,
        input.proposed_calendar_id ?? null,
        input.proposed_start_at ?? null,
        input.proposed_end_at ?? null,
        input.proposed_title ?? null,
        input.proposed_notes ?? null,
        input.reason_code,
        input.reason_summary,
        input.dedupe_key,
        input.source_fingerprint,
        input.rank_score ?? 0,
        input.rank_reason ?? null,
        input.ranking_version ?? null,
        input.group_key ?? null,
        input.group_summary ?? null,
        input.source_last_seen_at ?? null,
        input.first_action_at ?? null,
        input.first_action_type ?? null,
        input.closed_at ?? null,
        input.close_reason_code ?? null,
        input.closed_by_client ?? null,
        input.closed_by_actor ?? null,
        input.outcome_state ?? "none",
        input.outcome_recorded_at ?? null,
        input.outcome_source ?? null,
        input.outcome_summary ?? null,
        input.slot_state ?? "ready",
        input.slot_state_reason ?? null,
        input.slot_reason ?? null,
        toJson(input.trigger_signals ?? []),
        toJson(input.suppressed_signals ?? []),
        input.replan_count ?? 0,
        input.last_replanned_at ?? null,
        input.decision_reason_code ?? null,
        input.decision_note ?? null,
        input.snoozed_until ?? null,
        input.applied_task_id ?? null,
        input.applied_calendar_event_id ?? null,
        input.last_error_code ?? null,
        input.last_error_message ?? null,
        now,
        now,
        input.resolved_at ?? null,
      );
    return this.getPlanningRecommendation(recommendationId)!;
  }

  getPlanningRecommendation(recommendationId: string): PlanningRecommendation | null {
    const row = this.db
      .prepare(`SELECT * FROM planning_recommendations WHERE recommendation_id = ?`)
      .get(recommendationId) as Record<string, unknown> | undefined;
    return row ? this.mapPlanningRecommendation(row) : null;
  }

  getLatestPlanningRecommendationByDedupeKey(dedupeKey: string): PlanningRecommendation | null {
    const row = this.db
      .prepare(
        `SELECT * FROM planning_recommendations
         WHERE dedupe_key = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(dedupeKey) as Record<string, unknown> | undefined;
    return row ? this.mapPlanningRecommendation(row) : null;
  }

  listPlanningRecommendations(filter: PlanningRecommendationFilter = {}): PlanningRecommendation[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.status) {
      clauses.push(`status = ?`);
      params.push(filter.status);
    } else if (!filter.include_resolved) {
      clauses.push(`status IN ('pending', 'snoozed')`);
    }
    if (filter.kind) {
      clauses.push(`kind = ?`);
      params.push(filter.kind);
    }
    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = filter.limit ? `LIMIT ${Math.max(1, Math.floor(filter.limit))}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM planning_recommendations ${whereClause} ORDER BY rank_score DESC, updated_at DESC ${limitClause}`)
      .all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapPlanningRecommendation(row));
  }

  updatePlanningRecommendation(
    recommendationId: string,
    updates: {
      kind?: PlanningRecommendationKind | undefined;
      status?: PlanningRecommendationStatus | undefined;
      priority?: TaskPriority | undefined;
      source_task_id?: string | null | undefined;
      source_thread_id?: string | null | undefined;
      source_calendar_event_id?: string | null | undefined;
      proposed_calendar_id?: string | null | undefined;
      proposed_start_at?: string | null | undefined;
      proposed_end_at?: string | null | undefined;
      proposed_title?: string | null | undefined;
      proposed_notes?: string | null | undefined;
      reason_code?: string | undefined;
      reason_summary?: string | undefined;
      source_fingerprint?: string | undefined;
      rank_score?: number | undefined;
      rank_reason?: string | null | undefined;
      ranking_version?: string | null | undefined;
      group_key?: string | null | undefined;
      group_summary?: string | null | undefined;
      source_last_seen_at?: string | null | undefined;
      first_action_at?: string | null | undefined;
      first_action_type?: PlanningRecommendationFirstActionType | null | undefined;
      closed_at?: string | null | undefined;
      close_reason_code?: PlanningRecommendationCloseReasonCode | null | undefined;
      closed_by_client?: string | null | undefined;
      closed_by_actor?: string | null | undefined;
      outcome_state?: PlanningRecommendationOutcomeState | undefined;
      outcome_recorded_at?: string | null | undefined;
      outcome_source?: PlanningRecommendationOutcomeSource | null | undefined;
      outcome_summary?: string | null | undefined;
      slot_state?: PlanningRecommendationSlotState | undefined;
      slot_state_reason?: string | null | undefined;
      slot_reason?: string | null | undefined;
      trigger_signals?: string[] | null | undefined;
      suppressed_signals?: string[] | null | undefined;
      replan_count?: number | undefined;
      last_replanned_at?: string | null | undefined;
      decision_reason_code?: string | null | undefined;
      decision_note?: string | null | undefined;
      snoozed_until?: string | null | undefined;
      applied_task_id?: string | null | undefined;
      applied_calendar_event_id?: string | null | undefined;
      last_error_code?: string | null | undefined;
      last_error_message?: string | null | undefined;
      resolved_at?: string | null | undefined;
    },
  ): PlanningRecommendation | null {
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };

    if (updates.kind !== undefined) push("kind", updates.kind);
    if (updates.status !== undefined) push("status", updates.status);
    if (updates.priority !== undefined) push("priority", updates.priority);
    if (updates.source_task_id !== undefined) push("source_task_id", updates.source_task_id);
    if (updates.source_thread_id !== undefined) push("source_thread_id", updates.source_thread_id);
    if (updates.source_calendar_event_id !== undefined) push("source_calendar_event_id", updates.source_calendar_event_id);
    if (updates.proposed_calendar_id !== undefined) push("proposed_calendar_id", updates.proposed_calendar_id);
    if (updates.proposed_start_at !== undefined) push("proposed_start_at", updates.proposed_start_at);
    if (updates.proposed_end_at !== undefined) push("proposed_end_at", updates.proposed_end_at);
    if (updates.proposed_title !== undefined) push("proposed_title", updates.proposed_title);
    if (updates.proposed_notes !== undefined) push("proposed_notes", updates.proposed_notes);
    if (updates.reason_code !== undefined) push("reason_code", updates.reason_code);
    if (updates.reason_summary !== undefined) push("reason_summary", updates.reason_summary);
    if (updates.source_fingerprint !== undefined) push("source_fingerprint", updates.source_fingerprint);
    if (updates.rank_score !== undefined) push("rank_score", updates.rank_score);
    if (updates.rank_reason !== undefined) push("rank_reason", updates.rank_reason);
    if (updates.ranking_version !== undefined) push("ranking_version", updates.ranking_version);
    if (updates.group_key !== undefined) push("group_key", updates.group_key);
    if (updates.group_summary !== undefined) push("group_summary", updates.group_summary);
    if (updates.source_last_seen_at !== undefined) push("source_last_seen_at", updates.source_last_seen_at);
    if (updates.first_action_at !== undefined) push("first_action_at", updates.first_action_at);
    if (updates.first_action_type !== undefined) push("first_action_type", updates.first_action_type);
    if (updates.closed_at !== undefined) push("closed_at", updates.closed_at);
    if (updates.close_reason_code !== undefined) push("close_reason_code", updates.close_reason_code);
    if (updates.closed_by_client !== undefined) push("closed_by_client", updates.closed_by_client);
    if (updates.closed_by_actor !== undefined) push("closed_by_actor", updates.closed_by_actor);
    if (updates.outcome_state !== undefined) push("outcome_state", updates.outcome_state);
    if (updates.outcome_recorded_at !== undefined) push("outcome_recorded_at", updates.outcome_recorded_at);
    if (updates.outcome_source !== undefined) push("outcome_source", updates.outcome_source);
    if (updates.outcome_summary !== undefined) push("outcome_summary", updates.outcome_summary);
    if (updates.slot_state !== undefined) push("slot_state", updates.slot_state);
    if (updates.slot_state_reason !== undefined) push("slot_state_reason", updates.slot_state_reason);
    if (updates.slot_reason !== undefined) push("slot_reason", updates.slot_reason);
    if (updates.trigger_signals !== undefined) push("trigger_signals_json", toJson(updates.trigger_signals ?? []));
    if (updates.suppressed_signals !== undefined) push("suppressed_signals_json", toJson(updates.suppressed_signals ?? []));
    if (updates.replan_count !== undefined) push("replan_count", updates.replan_count);
    if (updates.last_replanned_at !== undefined) push("last_replanned_at", updates.last_replanned_at);
    if (updates.decision_reason_code !== undefined) push("decision_reason_code", updates.decision_reason_code);
    if (updates.decision_note !== undefined) push("decision_note", updates.decision_note);
    if (updates.snoozed_until !== undefined) push("snoozed_until", updates.snoozed_until);
    if (updates.applied_task_id !== undefined) push("applied_task_id", updates.applied_task_id);
    if (updates.applied_calendar_event_id !== undefined) push("applied_calendar_event_id", updates.applied_calendar_event_id);
    if (updates.last_error_code !== undefined) push("last_error_code", updates.last_error_code);
    if (updates.last_error_message !== undefined) push("last_error_message", updates.last_error_message);
    if (updates.resolved_at !== undefined) push("resolved_at", updates.resolved_at);
    push("updated_at", nowIso());
    params.push(recommendationId);
    this.db.prepare(`UPDATE planning_recommendations SET ${sets.join(", ")} WHERE recommendation_id = ?`).run(...params);
    return this.getPlanningRecommendation(recommendationId);
  }

  getPlanningHygienePolicyProposal(
    groupKey: string,
    kind: PlanningRecommendationKind,
    source: PlanningRecommendationSource,
  ): PlanningHygienePolicyProposal | null {
    const row = this.db
      .prepare(
        `SELECT * FROM planning_hygiene_policy_proposals
         WHERE group_key = ? AND kind = ? AND source = ?`,
      )
      .get(groupKey, kind, source) as Record<string, unknown> | undefined;
    return row ? this.mapPlanningHygienePolicyProposal(row) : null;
  }

  listPlanningHygienePolicyProposals(): PlanningHygienePolicyProposal[] {
    const rows = this.db
      .prepare(`SELECT * FROM planning_hygiene_policy_proposals ORDER BY updated_at DESC`)
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.mapPlanningHygienePolicyProposal(row));
  }

  upsertPlanningHygienePolicyProposal(
    identity: ClientIdentity,
    input: {
      group_key: string;
      kind: PlanningRecommendationKind;
      source: PlanningRecommendationSource;
      proposal_type: PlanningHygienePolicyProposalType;
      status: PlanningHygienePolicyProposalStatus;
      basis_signal_updated_at?: string | null | undefined;
      note?: string | null | undefined;
    },
  ): PlanningHygienePolicyProposal {
    const existing = this.getPlanningHygienePolicyProposal(input.group_key, input.kind, input.source);
    const now = nowIso();
    const proposalId = existing?.proposal_id ?? randomUUID();
    const createdAt = existing?.created_at ?? now;
    const createdByClient = existing?.created_by_client ?? identity.client_id;
    const createdByActor = existing?.created_by_actor ?? identity.requested_by ?? null;
    this.db
      .prepare(
        `INSERT INTO planning_hygiene_policy_proposals (
          proposal_id, group_key, kind, source, proposal_type, status, basis_signal_updated_at,
          created_at, created_by_client, created_by_actor, updated_at, updated_by_client, updated_by_actor, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(group_key, kind, source) DO UPDATE SET
          proposal_type = excluded.proposal_type,
          status = excluded.status,
          basis_signal_updated_at = excluded.basis_signal_updated_at,
          updated_at = excluded.updated_at,
          updated_by_client = excluded.updated_by_client,
          updated_by_actor = excluded.updated_by_actor,
          note = excluded.note`,
      )
      .run(
        proposalId,
        input.group_key,
        input.kind,
        input.source,
        input.proposal_type,
        input.status,
        input.basis_signal_updated_at ?? null,
        createdAt,
        createdByClient,
        createdByActor,
        now,
        identity.client_id,
        identity.requested_by ?? null,
        input.note?.trim() ? input.note.trim() : null,
    );
    return this.getPlanningHygienePolicyProposal(input.group_key, input.kind, input.source)!;
  }

  createPlanningHygienePolicyGovernanceEvent(
    identity: ClientIdentity,
    input: {
      proposal_id: string;
      group_key: string;
      kind: PlanningRecommendationKind;
      source: PlanningRecommendationSource;
      event_type: PlanningHygienePolicyGovernanceEventType;
      basis_signal_updated_at?: string | null | undefined;
      follow_through_state_snapshot?: string | null | undefined;
      proposal_status_snapshot?: PlanningHygienePolicyProposalStatus | null | undefined;
      note?: string | null | undefined;
    },
  ): PlanningHygienePolicyGovernanceEvent {
    const governanceEventId = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO planning_hygiene_policy_governance_events (
          governance_event_id, proposal_id, group_key, kind, source, event_type, basis_signal_updated_at,
          follow_through_state_snapshot, proposal_status_snapshot, recorded_at, recorded_by_client, recorded_by_actor, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        governanceEventId,
        input.proposal_id,
        input.group_key,
        input.kind,
        input.source,
        input.event_type,
        input.basis_signal_updated_at ?? null,
        input.follow_through_state_snapshot ?? null,
        input.proposal_status_snapshot ?? null,
        now,
        identity.client_id,
        identity.requested_by ?? null,
        input.note?.trim() ? input.note.trim() : null,
      );
    return this.getPlanningHygienePolicyGovernanceEvent(governanceEventId)!;
  }

  getPlanningHygienePolicyGovernanceEvent(governanceEventId: string): PlanningHygienePolicyGovernanceEvent | null {
    const row = this.db
      .prepare(`SELECT * FROM planning_hygiene_policy_governance_events WHERE governance_event_id = ?`)
      .get(governanceEventId) as Record<string, unknown> | undefined;
    return row ? this.mapPlanningHygienePolicyGovernanceEvent(row) : null;
  }

  listPlanningHygienePolicyGovernanceEvents(): PlanningHygienePolicyGovernanceEvent[] {
    const rows = this.db
      .prepare(`SELECT * FROM planning_hygiene_policy_governance_events ORDER BY recorded_at DESC`)
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.mapPlanningHygienePolicyGovernanceEvent(row));
  }

  listPlanningHygienePolicyGovernanceEventsBefore(
    olderThanIso: string,
    eventTypes: PlanningHygienePolicyGovernanceEventType[] = [],
  ): PlanningHygienePolicyGovernanceEvent[] {
    const clauses = ["recorded_at <= ?"];
    const params: SQLInputValue[] = [olderThanIso];
    if (eventTypes.length > 0) {
      clauses.push(`event_type IN (${eventTypes.map(() => "?").join(", ")})`);
      params.push(...eventTypes);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM planning_hygiene_policy_governance_events
         WHERE ${clauses.join(" AND ")}
         ORDER BY recorded_at ASC`,
      )
      .all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapPlanningHygienePolicyGovernanceEvent(row));
  }

  prunePlanningHygienePolicyGovernanceEventsBefore(
    olderThanIso: string,
    eventTypes: PlanningHygienePolicyGovernanceEventType[] = [],
  ): number {
    const clauses = ["recorded_at <= ?"];
    const params: SQLInputValue[] = [olderThanIso];
    if (eventTypes.length > 0) {
      clauses.push(`event_type IN (${eventTypes.map(() => "?").join(", ")})`);
      params.push(...eventTypes);
    }
    const result = this.db
      .prepare(`DELETE FROM planning_hygiene_policy_governance_events WHERE ${clauses.join(" AND ")}`)
      .run(...params) as { changes?: number };
    return Number(result.changes ?? 0);
  }

  countPlanningRecommendationStates(): Record<PlanningRecommendationStatus, number> {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS count FROM planning_recommendations GROUP BY status`)
      .all() as Array<{ status: PlanningRecommendationStatus; count: number }>;
    const counts: Record<PlanningRecommendationStatus, number> = {
      pending: 0,
      applied: 0,
      rejected: 0,
      snoozed: 0,
      expired: 0,
      superseded: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }
    return counts;
  }

  countPlanningRecommendationOutcomeStates(): Record<PlanningRecommendationOutcomeState, number> {
    const rows = this.db
      .prepare(`SELECT outcome_state, COUNT(*) AS count FROM planning_recommendations GROUP BY outcome_state`)
      .all() as Array<{ outcome_state: PlanningRecommendationOutcomeState; count: number }>;
    const counts: Record<PlanningRecommendationOutcomeState, number> = {
      none: 0,
      scheduled: 0,
      completed: 0,
      canceled: 0,
      dismissed: 0,
      handled_elsewhere: 0,
      source_resolved: 0,
    };
    for (const row of rows) {
      counts[row.outcome_state] = Number(row.count);
    }
    return counts;
  }

  countPlanningRecommendationSlotStates(): Record<PlanningRecommendationSlotState, number> {
    const rows = this.db
      .prepare(`SELECT slot_state, COUNT(*) AS count FROM planning_recommendations GROUP BY slot_state`)
      .all() as Array<{ slot_state: PlanningRecommendationSlotState; count: number }>;
    const counts: Record<PlanningRecommendationSlotState, number> = {
      ready: 0,
      needs_manual_scheduling: 0,
    };
    for (const row of rows) {
      counts[row.slot_state] = Number(row.count);
    }
    return counts;
  }

  getCalendarSyncState(account: string): CalendarSyncState | null {
    const row = this.db
      .prepare(`SELECT * FROM calendar_sync_state WHERE account = ?`)
      .get(account) as Record<string, unknown> | undefined;
    return row ? this.mapCalendarSyncState(row) : null;
  }

  upsertCalendarSyncState(
    account: string,
    provider: CalendarProvider,
    updates: {
      status?: CalendarSyncStatus;
      last_synced_at?: string | null;
      last_seeded_at?: string | null;
      last_error_code?: string | null;
      last_error_message?: string | null;
      last_sync_duration_ms?: number | null;
      calendars_refreshed_count?: number | null;
      events_refreshed_count?: number | null;
    },
  ): CalendarSyncState {
    const existing = this.getCalendarSyncState(account);
    const now = nowIso();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO calendar_sync_state (
            account, provider, status, last_synced_at, last_seeded_at, last_error_code, last_error_message,
            last_sync_duration_ms, calendars_refreshed_count, events_refreshed_count, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          account,
          provider,
          updates.status ?? "idle",
          updates.last_synced_at ?? null,
          updates.last_seeded_at ?? null,
          updates.last_error_code ?? null,
          updates.last_error_message ?? null,
          updates.last_sync_duration_ms ?? null,
          updates.calendars_refreshed_count ?? null,
          updates.events_refreshed_count ?? null,
          now,
        );
      return this.getCalendarSyncState(account)!;
    }

    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };
    if (updates.status !== undefined) push("status", updates.status);
    if (updates.last_synced_at !== undefined) push("last_synced_at", updates.last_synced_at);
    if (updates.last_seeded_at !== undefined) push("last_seeded_at", updates.last_seeded_at);
    if (updates.last_error_code !== undefined) push("last_error_code", updates.last_error_code);
    if (updates.last_error_message !== undefined) push("last_error_message", updates.last_error_message);
    if (updates.last_sync_duration_ms !== undefined) push("last_sync_duration_ms", updates.last_sync_duration_ms);
    if (updates.calendars_refreshed_count !== undefined) {
      push("calendars_refreshed_count", updates.calendars_refreshed_count);
    }
    if (updates.events_refreshed_count !== undefined) push("events_refreshed_count", updates.events_refreshed_count);
    push("provider", provider);
    push("updated_at", now);
    params.push(account);
    this.db.prepare(`UPDATE calendar_sync_state SET ${sets.join(", ")} WHERE account = ?`).run(...params);
    return this.getCalendarSyncState(account)!;
  }

  replaceCalendarSources(account: string, provider: CalendarProvider, sources: CalendarSource[], syncedAt: string): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM calendar_sources WHERE account = ? AND provider = ?`).run(account, provider);
      const insert = this.db.prepare(
        `INSERT INTO calendar_sources (
          calendar_id, provider, account, title, time_zone, access_role, is_primary, is_selected,
          background_color, foreground_color, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const source of sources) {
        insert.run(
          source.calendar_id,
          provider,
          account,
          source.title,
          source.time_zone ?? null,
          source.access_role ?? null,
          source.is_primary ? 1 : 0,
          source.is_selected ? 1 : 0,
          source.background_color ?? null,
          source.foreground_color ?? null,
          syncedAt,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listCalendarSources(account?: string): CalendarSource[] {
    const rows = account
      ? ((this.db
          .prepare(`SELECT * FROM calendar_sources WHERE account = ? ORDER BY is_primary DESC, title ASC`)
          .all(account) as Record<string, unknown>[]))
      : ((this.db.prepare(`SELECT * FROM calendar_sources ORDER BY is_primary DESC, title ASC`).all() as Record<
          string,
          unknown
        >[]));
    return rows.map((row) => this.mapCalendarSource(row));
  }

  listOwnedCalendarSources(account?: string): CalendarSource[] {
    const rows = account
      ? ((this.db
          .prepare(
            `SELECT * FROM calendar_sources
             WHERE account = ? AND access_role = 'owner'
             ORDER BY is_primary DESC, title ASC`,
          )
          .all(account) as Record<string, unknown>[]))
      : ((this.db
          .prepare(
            `SELECT * FROM calendar_sources
             WHERE access_role = 'owner'
             ORDER BY is_primary DESC, title ASC`,
          )
          .all() as Record<string, unknown>[]));
    return rows.map((row) => this.mapCalendarSource(row));
  }

  countOwnedCalendarSources(account?: string): number {
    const row = account
      ? ((this.db
          .prepare(`SELECT COUNT(*) AS count FROM calendar_sources WHERE account = ? AND access_role = 'owner'`)
          .get(account) as { count: number }))
      : ((this.db
          .prepare(`SELECT COUNT(*) AS count FROM calendar_sources WHERE access_role = 'owner'`)
          .get() as { count: number }));
    return Number(row.count ?? 0);
  }

  countCalendarSources(account?: string): number {
    const row = account
      ? ((this.db.prepare(`SELECT COUNT(*) AS count FROM calendar_sources WHERE account = ?`).get(account) as {
          count: number;
        }))
      : ((this.db.prepare(`SELECT COUNT(*) AS count FROM calendar_sources`).get() as { count: number }));
    return Number(row.count ?? 0);
  }

  replaceCalendarEvents(account: string, provider: CalendarProvider, events: CalendarEvent[], syncedAt: string): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM calendar_events WHERE account = ? AND provider = ?`).run(account, provider);
      const insert = this.db.prepare(
        `INSERT INTO calendar_events (
          event_id, provider_event_id, calendar_id, provider, account, i_cal_uid, etag, summary, location, notes,
          html_link, status, event_type, visibility, transparency, start_at, end_at, is_all_day, is_busy,
          recurring_event_id, organizer_email, self_response_status, attendee_count, source_task_id,
          created_by_personal_ops, last_write_at, last_write_by_client, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const event of events) {
        insert.run(
          event.event_id,
          event.provider_event_id,
          event.calendar_id,
          provider,
          account,
          event.i_cal_uid ?? null,
          event.etag ?? null,
          event.summary ?? null,
          event.location ?? null,
          event.notes ?? null,
          event.html_link ?? null,
          event.status,
          event.event_type ?? null,
          event.visibility ?? null,
          event.transparency ?? null,
          event.start_at,
          event.end_at,
          event.is_all_day ? 1 : 0,
          event.is_busy ? 1 : 0,
          event.recurring_event_id ?? null,
          event.organizer_email ?? null,
          event.self_response_status ?? null,
          event.attendee_count,
          event.source_task_id ?? null,
          event.created_by_personal_ops ? 1 : 0,
          event.last_write_at ?? null,
          event.last_write_by_client ?? null,
          event.updated_at,
          syncedAt,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listCalendarEvents(options: {
    account?: string;
    calendar_id?: string;
    starts_before?: string;
    ends_after?: string;
    limit?: number;
  } = {}): CalendarEvent[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (options.account) {
      clauses.push(`account = ?`);
      params.push(options.account);
    }
    if (options.calendar_id) {
      clauses.push(`calendar_id = ?`);
      params.push(options.calendar_id);
    }
    if (options.starts_before) {
      clauses.push(`start_at <= ?`);
      params.push(options.starts_before);
    }
    if (options.ends_after) {
      clauses.push(`end_at >= ?`);
      params.push(options.ends_after);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = options.limit ? `LIMIT ${Math.max(1, Math.floor(options.limit))}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM calendar_events ${where} ORDER BY start_at ASC ${limit}`)
      .all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapCalendarEvent(row));
  }

  getCalendarEvent(eventId: string): CalendarEvent | null {
    const row = this.db
      .prepare(`SELECT * FROM calendar_events WHERE event_id = ?`)
      .get(eventId) as Record<string, unknown> | undefined;
    return row ? this.mapCalendarEvent(row) : null;
  }

  countCalendarEvents(account?: string): number {
    const row = account
      ? ((this.db.prepare(`SELECT COUNT(*) AS count FROM calendar_events WHERE account = ?`).get(account) as {
          count: number;
        }))
      : ((this.db.prepare(`SELECT COUNT(*) AS count FROM calendar_events`).get() as { count: number }));
    return Number(row.count ?? 0);
  }

  countPersonalOpsCalendarEvents(account?: string): number {
    const row = account
      ? ((this.db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM calendar_events
             WHERE account = ? AND created_by_personal_ops = 1 AND status != 'cancelled'`,
          )
          .get(account) as { count: number }))
      : ((this.db
          .prepare(`SELECT COUNT(*) AS count FROM calendar_events WHERE created_by_personal_ops = 1 AND status != 'cancelled'`)
          .get() as { count: number }));
    return Number(row.count ?? 0);
  }

  upsertCalendarEvent(event: CalendarEvent): CalendarEvent {
    this.db
      .prepare(
        `INSERT INTO calendar_events (
          event_id, provider_event_id, calendar_id, provider, account, i_cal_uid, etag, summary, location, notes,
          html_link, status, event_type, visibility, transparency, start_at, end_at, is_all_day, is_busy,
          recurring_event_id, organizer_email, self_response_status, attendee_count, source_task_id,
          created_by_personal_ops, last_write_at, last_write_by_client, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          provider_event_id = excluded.provider_event_id,
          calendar_id = excluded.calendar_id,
          provider = excluded.provider,
          account = excluded.account,
          i_cal_uid = excluded.i_cal_uid,
          etag = excluded.etag,
          summary = excluded.summary,
          location = excluded.location,
          notes = excluded.notes,
          html_link = excluded.html_link,
          status = excluded.status,
          event_type = excluded.event_type,
          visibility = excluded.visibility,
          transparency = excluded.transparency,
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          is_all_day = excluded.is_all_day,
          is_busy = excluded.is_busy,
          recurring_event_id = excluded.recurring_event_id,
          organizer_email = excluded.organizer_email,
          self_response_status = excluded.self_response_status,
          attendee_count = excluded.attendee_count,
          source_task_id = excluded.source_task_id,
          created_by_personal_ops = excluded.created_by_personal_ops,
          last_write_at = excluded.last_write_at,
          last_write_by_client = excluded.last_write_by_client,
          updated_at = excluded.updated_at,
          synced_at = excluded.synced_at`,
      )
      .run(
        event.event_id,
        event.provider_event_id,
        event.calendar_id,
        event.provider,
        event.account,
        event.i_cal_uid ?? null,
        event.etag ?? null,
        event.summary ?? null,
        event.location ?? null,
        event.notes ?? null,
        event.html_link ?? null,
        event.status,
        event.event_type ?? null,
        event.visibility ?? null,
        event.transparency ?? null,
        event.start_at,
        event.end_at,
        event.is_all_day ? 1 : 0,
        event.is_busy ? 1 : 0,
        event.recurring_event_id ?? null,
        event.organizer_email ?? null,
        event.self_response_status ?? null,
        event.attendee_count,
        event.source_task_id ?? null,
        event.created_by_personal_ops ? 1 : 0,
        event.last_write_at ?? null,
        event.last_write_by_client ?? null,
        event.updated_at,
        event.synced_at,
      );
    return this.getCalendarEvent(event.event_id)!;
  }

  deleteCalendarEvent(eventId: string): void {
    this.db.prepare(`DELETE FROM calendar_events WHERE event_id = ?`).run(eventId);
  }

  getMailSyncState(mailbox: string): MailSyncState | null {
    const row = this.db
      .prepare(`SELECT * FROM mail_sync_state WHERE mailbox = ?`)
      .get(mailbox) as Record<string, unknown> | undefined;
    return row ? this.mapMailSyncState(row) : null;
  }

  upsertMailSyncState(
    mailbox: string,
    provider: string,
    updates: {
      status?: MailSyncStatus;
      last_history_id?: string | null;
      last_synced_at?: string | null;
      last_seeded_at?: string | null;
      last_sync_duration_ms?: number | null;
      last_sync_refreshed_count?: number | null;
      last_sync_deleted_count?: number | null;
      last_error_code?: string | null;
      last_error_message?: string | null;
    },
  ): MailSyncState {
    const existing = this.getMailSyncState(mailbox);
    const now = nowIso();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO mail_sync_state (
            mailbox, provider, status, last_history_id, last_synced_at, last_seeded_at,
            last_sync_duration_ms, last_sync_refreshed_count, last_sync_deleted_count,
            last_error_code, last_error_message, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          mailbox,
          provider,
          updates.status ?? "idle",
          updates.last_history_id ?? null,
          updates.last_synced_at ?? null,
          updates.last_seeded_at ?? null,
          updates.last_sync_duration_ms ?? null,
          updates.last_sync_refreshed_count ?? null,
          updates.last_sync_deleted_count ?? null,
          updates.last_error_code ?? null,
          updates.last_error_message ?? null,
          now,
        );
      return this.getMailSyncState(mailbox)!;
    }

    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };
    if (updates.status !== undefined) push("status", updates.status);
    if (updates.last_history_id !== undefined) push("last_history_id", updates.last_history_id);
    if (updates.last_synced_at !== undefined) push("last_synced_at", updates.last_synced_at);
    if (updates.last_seeded_at !== undefined) push("last_seeded_at", updates.last_seeded_at);
    if (updates.last_sync_duration_ms !== undefined) push("last_sync_duration_ms", updates.last_sync_duration_ms);
    if (updates.last_sync_refreshed_count !== undefined) {
      push("last_sync_refreshed_count", updates.last_sync_refreshed_count);
    }
    if (updates.last_sync_deleted_count !== undefined) push("last_sync_deleted_count", updates.last_sync_deleted_count);
    if (updates.last_error_code !== undefined) push("last_error_code", updates.last_error_code);
    if (updates.last_error_message !== undefined) push("last_error_message", updates.last_error_message);
    push("provider", provider);
    push("updated_at", now);
    params.push(mailbox);
    this.db.prepare(`UPDATE mail_sync_state SET ${sets.join(", ")} WHERE mailbox = ?`).run(...params);
    return this.getMailSyncState(mailbox)!;
  }

  upsertMailMessage(mailbox: string, message: GmailMessageMetadata, syncedAt: string): MailMessage {
    const isUnread = message.label_ids.includes("UNREAD");
    const isInbox = message.label_ids.includes("INBOX");
    const isSent = message.label_ids.includes("SENT");
    this.db
      .prepare(
        `INSERT INTO mail_messages (
          message_id, thread_id, mailbox, history_id, internal_date, label_ids_json,
          from_header, to_header, subject, is_unread, is_sent, is_inbox, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(message_id) DO UPDATE SET
          thread_id = excluded.thread_id,
          mailbox = excluded.mailbox,
          history_id = excluded.history_id,
          internal_date = excluded.internal_date,
          label_ids_json = excluded.label_ids_json,
          from_header = excluded.from_header,
          to_header = excluded.to_header,
          subject = excluded.subject,
          is_unread = excluded.is_unread,
          is_sent = excluded.is_sent,
          is_inbox = excluded.is_inbox,
          last_synced_at = excluded.last_synced_at`,
      )
      .run(
        message.message_id,
        message.thread_id,
        mailbox,
        message.history_id ?? null,
        message.internal_date,
        toJson(message.label_ids),
        message.from_header ?? null,
        message.to_header ?? null,
        message.subject ?? null,
        isUnread ? 1 : 0,
        isSent ? 1 : 0,
        isInbox ? 1 : 0,
        syncedAt,
      );
    this.recomputeMailThread(mailbox, message.thread_id, syncedAt);
    return this.getMailMessage(message.message_id)!;
  }

  getMailMessage(messageId: string): MailMessage | null {
    const row = this.db
      .prepare(`SELECT * FROM mail_messages WHERE message_id = ?`)
      .get(messageId) as Record<string, unknown> | undefined;
    return row ? this.mapMailMessage(row) : null;
  }

  deleteMailMessage(mailbox: string, messageId: string, syncedAt: string): void {
    const existing = this.getMailMessage(messageId);
    this.db.prepare(`DELETE FROM mail_messages WHERE message_id = ? AND mailbox = ?`).run(messageId, mailbox);
    if (existing?.thread_id) {
      this.recomputeMailThread(mailbox, existing.thread_id, syncedAt);
    }
  }

  getMailThread(threadId: string): MailThread | null {
    const row = this.db
      .prepare(`SELECT * FROM mail_threads WHERE thread_id = ?`)
      .get(threadId) as Record<string, unknown> | undefined;
    return row ? this.mapMailThread(row) : null;
  }

  listMailThreads(limit = 100): MailThread[] {
    const rows = this.db
      .prepare(`SELECT * FROM mail_threads ORDER BY last_message_at DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map((row) => this.mapMailThread(row));
  }

  listUnreadMailThreads(limit = 100): MailThread[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mail_threads
         WHERE unread_count > 0 AND in_inbox = 1
         ORDER BY last_message_at DESC
         LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map((row) => this.mapMailThread(row));
  }

  listMailMessagesByThread(threadId: string): MailMessage[] {
    const rows = this.db
      .prepare(`SELECT * FROM mail_messages WHERE thread_id = ? ORDER BY CAST(internal_date AS INTEGER) DESC`)
      .all(threadId) as Record<string, unknown>[];
    return rows.map((row) => this.mapMailMessage(row));
  }

  countMailThreads(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM mail_threads`).get() as { count: number };
    return Number(row.count ?? 0);
  }

  clearMailboxIndex(mailbox: string): void {
    this.db.prepare(`DELETE FROM mail_messages WHERE mailbox = ?`).run(mailbox);
    this.db.prepare(`DELETE FROM mail_threads WHERE mailbox = ?`).run(mailbox);
  }

  private recomputeMailThread(mailbox: string, threadId: string, syncedAt: string): void {
    const row = this.db
      .prepare(
        `SELECT
           MAX(CAST(internal_date AS INTEGER)) AS latest_internal_date,
           COUNT(*) AS message_count,
           SUM(CASE WHEN is_unread = 1 THEN 1 ELSE 0 END) AS unread_count,
           MAX(CASE WHEN is_inbox = 1 THEN 1 ELSE 0 END) AS in_inbox
         FROM mail_messages
         WHERE thread_id = ? AND mailbox = ?`,
      )
      .get(threadId, mailbox) as {
        latest_internal_date: number | null;
        message_count: number;
        unread_count: number;
        in_inbox: number;
      };

    const messageCount = Number(row.message_count ?? 0);
    if (messageCount === 0) {
      this.db.prepare(`DELETE FROM mail_threads WHERE thread_id = ?`).run(threadId);
      return;
    }

    this.db
      .prepare(
        `INSERT INTO mail_threads (
          thread_id, mailbox, last_message_at, message_count, unread_count, in_inbox, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          mailbox = excluded.mailbox,
          last_message_at = excluded.last_message_at,
          message_count = excluded.message_count,
          unread_count = excluded.unread_count,
          in_inbox = excluded.in_inbox,
          last_synced_at = excluded.last_synced_at`,
      )
      .run(
        threadId,
        mailbox,
        String(row.latest_internal_date ?? "0"),
        messageCount,
        Number(row.unread_count ?? 0),
        Number(row.in_inbox ?? 0),
        syncedAt,
      );
  }

  recordAuditEvent(event: AuditEventInput): AuditEvent {
    const stored: AuditEvent = {
      event_id: randomUUID(),
      timestamp: nowIso(),
      client_id: event.client_id,
      action: event.action,
      target_type: event.target_type,
      target_id: event.target_id,
      outcome: event.outcome,
      metadata_json: JSON.stringify(event.metadata ?? {}),
    };
    this.db
      .prepare(
        `INSERT INTO audit_events (event_id, timestamp, client_id, action, target_type, target_id, outcome, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.event_id,
        stored.timestamp,
        stored.client_id,
        stored.action,
        stored.target_type,
        stored.target_id,
        stored.outcome,
        stored.metadata_json,
      );
    return stored;
  }

  listAuditEvents(filter: AuditEventFilter): AuditEvent[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];

    if (filter.actions) {
      if (filter.actions.length === 0) {
        return [];
      }
      clauses.push(`action IN (${filter.actions.map(() => "?").join(", ")})`);
      params.push(...filter.actions);
    }
    if (filter.action) {
      clauses.push(`action = ?`);
      params.push(filter.action);
    }
    if (filter.target_type) {
      clauses.push(`target_type = ?`);
      params.push(filter.target_type);
    }
    if (filter.target_id) {
      clauses.push(`target_id = ?`);
      params.push(filter.target_id);
    }
    if (filter.client_id) {
      clauses.push(`client_id = ?`);
      params.push(filter.client_id);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT * FROM audit_events ${whereClause} ORDER BY timestamp DESC LIMIT ?`)
      .all(...params, filter.limit)
      .map((row: any) => ({
        event_id: String(row.event_id),
        timestamp: String(row.timestamp),
        client_id: String(row.client_id),
        action: String(row.action),
        target_type: String(row.target_type),
        target_id: String(row.target_id),
        outcome: String(row.outcome),
        metadata_json: String(row.metadata_json),
      }));
  }

  async createBackup(destinationFile: string): Promise<number> {
    fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
    return await backup(this.db, destinationFile);
  }

  hasNotification(dedupeKey: string): boolean {
    const row = this.db.prepare(`SELECT dedupe_key FROM notification_events WHERE dedupe_key = ?`).get(dedupeKey);
    return Boolean(row);
  }

  recordNotification(dedupeKey: string, kind: string, targetId: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO notification_events (dedupe_key, kind, target_id, created_at) VALUES (?, ?, ?, ?)`)
      .run(dedupeKey, kind, targetId, nowIso());
  }

  private createBaseSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        version INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mail_accounts (
        email TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        keychain_service TEXT NOT NULL,
        keychain_account TEXT NOT NULL,
        connected_at TEXT NOT NULL,
        profile_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS draft_artifacts (
        artifact_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_draft_id TEXT NOT NULL UNIQUE,
        provider_message_id TEXT,
        provider_thread_id TEXT,
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
        approved_at TEXT,
        approved_by_client TEXT,
        sent_at TEXT,
        sent_by_client TEXT,
        send_attempt_count INTEGER NOT NULL DEFAULT 0,
        last_send_attempt_at TEXT,
        last_send_error_code TEXT,
        last_send_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS review_items (
        review_id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        opened_at TEXT,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        event_id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        client_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dedupe_key TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS client_registrations (
        client_id TEXT PRIMARY KEY,
        label TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approval_requests (
        approval_id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        state TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        requested_by_client TEXT NOT NULL,
        requested_by_actor TEXT,
        approved_at TEXT,
        approved_by_client TEXT,
        approved_by_actor TEXT,
        rejected_at TEXT,
        rejected_by_client TEXT,
        rejected_by_actor TEXT,
        expires_at TEXT NOT NULL,
        decision_note TEXT,
        send_note TEXT,
        draft_digest TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        policy_snapshot_json TEXT NOT NULL,
        confirmation_digest TEXT,
        confirmation_expires_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at
        ON approval_requests(created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_approval_per_artifact
        ON approval_requests(artifact_id)
        WHERE state IN ('pending', 'approved', 'sending', 'send_failed');

      CREATE TABLE IF NOT EXISTS send_windows (
        window_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        enabled_at TEXT NOT NULL,
        enabled_by_client TEXT NOT NULL,
        enabled_by_actor TEXT,
        expires_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        disabled_at TEXT,
        disabled_by_client TEXT,
        disabled_by_actor TEXT,
        disable_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_send_windows_created_at
        ON send_windows(created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_send_window
        ON send_windows(state)
        WHERE state = 'active';

      CREATE TABLE IF NOT EXISTS tasks (
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
        source_planning_recommendation_id TEXT,
        source_thread_id TEXT,
        source_calendar_event_id TEXT,
        decision_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        canceled_at TEXT,
        scheduled_calendar_event_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_state_updated_at
        ON tasks(state, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_tasks_due_at
        ON tasks(due_at, state);

      CREATE INDEX IF NOT EXISTS idx_tasks_remind_at
        ON tasks(remind_at, state);

      CREATE TABLE IF NOT EXISTS task_suggestions (
        suggestion_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        kind TEXT NOT NULL,
        priority TEXT NOT NULL,
        due_at TEXT,
        remind_at TEXT,
        suggested_by_client TEXT NOT NULL,
        suggested_by_actor TEXT,
        status TEXT NOT NULL,
        accepted_task_id TEXT,
        decision_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_task_suggestions_status_updated_at
        ON task_suggestions(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS planning_recommendations (
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

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_status_updated_at
        ON planning_recommendations(status, updated_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_recommendations_active_dedupe_key
        ON planning_recommendations(dedupe_key)
        WHERE status IN ('pending', 'snoozed');

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_source_task_id
        ON planning_recommendations(source_task_id);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_source_thread_id
        ON planning_recommendations(source_thread_id);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_source_calendar_event_id
        ON planning_recommendations(source_calendar_event_id);

      CREATE TABLE IF NOT EXISTS planning_hygiene_policy_proposals (
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

      CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_hygiene_policy_proposals_family
        ON planning_hygiene_policy_proposals(group_key, kind, source);

      CREATE INDEX IF NOT EXISTS idx_planning_hygiene_policy_proposals_status_updated_at
        ON planning_hygiene_policy_proposals(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS planning_hygiene_policy_governance_events (
        governance_event_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        group_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        source TEXT NOT NULL,
        event_type TEXT NOT NULL,
        basis_signal_updated_at TEXT,
        follow_through_state_snapshot TEXT,
        proposal_status_snapshot TEXT,
        recorded_at TEXT NOT NULL,
        recorded_by_client TEXT NOT NULL,
        recorded_by_actor TEXT,
        note TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_planning_hygiene_policy_governance_events_recorded_at
        ON planning_hygiene_policy_governance_events(recorded_at DESC);

      CREATE INDEX IF NOT EXISTS idx_planning_hygiene_policy_governance_events_family
        ON planning_hygiene_policy_governance_events(group_key, kind, source, recorded_at DESC);

      CREATE TABLE IF NOT EXISTS mail_sync_state (
        mailbox TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        last_history_id TEXT,
        last_synced_at TEXT,
        last_seeded_at TEXT,
        last_sync_duration_ms INTEGER,
        last_sync_refreshed_count INTEGER,
        last_sync_deleted_count INTEGER,
        last_error_code TEXT,
        last_error_message TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mail_threads (
        thread_id TEXT PRIMARY KEY,
        mailbox TEXT NOT NULL,
        last_message_at TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        unread_count INTEGER NOT NULL,
        in_inbox INTEGER NOT NULL,
        last_synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mail_threads_last_message_at
        ON mail_threads(last_message_at DESC);

      CREATE INDEX IF NOT EXISTS idx_mail_threads_unread_inbox
        ON mail_threads(in_inbox, unread_count, last_message_at DESC);

      CREATE TABLE IF NOT EXISTS mail_messages (
        message_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        mailbox TEXT NOT NULL,
        history_id TEXT,
        internal_date TEXT NOT NULL,
        label_ids_json TEXT NOT NULL,
        from_header TEXT,
        to_header TEXT,
        subject TEXT,
        is_unread INTEGER NOT NULL,
        is_sent INTEGER NOT NULL,
        is_inbox INTEGER NOT NULL,
        last_synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mail_messages_thread_id
        ON mail_messages(thread_id, internal_date DESC);

      CREATE INDEX IF NOT EXISTS idx_mail_messages_mailbox
        ON mail_messages(mailbox, internal_date DESC);

      CREATE TABLE IF NOT EXISTS calendar_sync_state (
        account TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        last_synced_at TEXT,
        last_seeded_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        last_sync_duration_ms INTEGER,
        calendars_refreshed_count INTEGER,
        events_refreshed_count INTEGER,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS calendar_sources (
        account TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        time_zone TEXT,
        access_role TEXT,
        is_primary INTEGER NOT NULL,
        is_selected INTEGER NOT NULL,
        background_color TEXT,
        foreground_color TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account, calendar_id)
      );

      CREATE INDEX IF NOT EXISTS idx_calendar_sources_title
        ON calendar_sources(title);

      CREATE TABLE IF NOT EXISTS calendar_events (
        event_id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        account TEXT NOT NULL,
        i_cal_uid TEXT,
        summary TEXT,
        location TEXT,
        html_link TEXT,
        status TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        is_all_day INTEGER NOT NULL,
        is_busy INTEGER NOT NULL,
        recurring_event_id TEXT,
        organizer_email TEXT,
        self_response_status TEXT,
        attendee_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        provider_event_id TEXT,
        etag TEXT,
        notes TEXT,
        event_type TEXT,
        visibility TEXT,
        transparency TEXT,
        source_task_id TEXT,
        created_by_personal_ops INTEGER NOT NULL DEFAULT 0,
        last_write_at TEXT,
        last_write_by_client TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at
        ON calendar_events(start_at ASC);

      CREATE INDEX IF NOT EXISTS idx_calendar_events_account_range
        ON calendar_events(account, start_at ASC, end_at ASC);

    `);
    if (this.columnExists("tasks", "scheduled_calendar_event_id")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_calendar_event_id
          ON tasks(scheduled_calendar_event_id);
      `);
    }
    if (this.columnExists("calendar_events", "source_task_id")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_calendar_events_source_task_id
          ON calendar_events(source_task_id);
      `);
    }
    if (this.columnExists("tasks", "source_planning_recommendation_id")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_source_planning_recommendation_id
          ON tasks(source_planning_recommendation_id);
      `);
    }
    if (this.columnExists("tasks", "source_thread_id")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_source_thread_id
          ON tasks(source_thread_id);
      `);
    }
    if (this.columnExists("tasks", "source_calendar_event_id")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_source_calendar_event_id
          ON tasks(source_calendar_event_id);
      `);
    }
    if (this.columnExists("planning_recommendations", "group_key")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_planning_recommendations_group_key
          ON planning_recommendations(group_key);
      `);
    }
    if (this.columnExists("planning_recommendations", "rank_score")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_planning_recommendations_rank_score
          ON planning_recommendations(rank_score DESC);
      `);
    }
    if (this.columnExists("planning_recommendations", "closed_at")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_planning_recommendations_closed_at
          ON planning_recommendations(closed_at DESC);
      `);
    }
    if (this.columnExists("planning_recommendations", "first_action_at")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_planning_recommendations_first_action_at
          ON planning_recommendations(first_action_at DESC);
      `);
    }
    if (this.columnExists("planning_recommendations", "close_reason_code")) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_planning_recommendations_close_reason_code
          ON planning_recommendations(close_reason_code);
      `);
    }
  }

  private migrate() {
    const existing = this.db.prepare(`SELECT version FROM schema_meta LIMIT 1`).get() as { version: number } | undefined;
    if (!existing) {
      const inferred = this.tableExists("planning_hygiene_policy_governance_events")
        ? 14
        : this.tableExists("planning_hygiene_policy_proposals")
        ? 13
        : this.tableExists("planning_recommendations")
        ? this.columnExists("planning_recommendations", "outcome_state")
          ? this.columnExists("planning_recommendations", "first_action_at")
            ? 12
            : 11
          : this.columnExists("planning_recommendations", "rank_score")
            ? 10
            : 9
        : this.tableExists("calendar_events")
        ? this.columnExists("calendar_events", "provider_event_id")
          ? 8
          : 7
        : this.tableExists("task_suggestions")
        ? 6
        : this.tableExists("mail_sync_state")
        ? this.columnExists("mail_sync_state", "last_sync_duration_ms")
          ? 5
          : 4
        : this.tableExists("send_windows")
        ? 3
        : this.tableExists("approval_requests") || this.columnExists("draft_artifacts", "provider_message_id")
          ? 2
          : 1;
      this.db.prepare(`DELETE FROM schema_meta`).run();
      this.db.prepare(`INSERT INTO schema_meta (version) VALUES (?)`).run(inferred);
    }

    let version = this.getSchemaVersion();
    while (version < SCHEMA_VERSION) {
      if (version === 1) {
        this.migrateToV2();
        version = 2;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 2) {
        this.migrateToV3();
        version = 3;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 3) {
        this.migrateToV4();
        version = 4;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 4) {
        this.migrateToV5();
        version = 5;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 5) {
        this.migrateToV6();
        version = 6;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 6) {
        this.migrateToV7();
        version = 7;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 7) {
        this.migrateToV8();
        version = 8;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 8) {
        this.migrateToV9();
        version = 9;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 9) {
        this.migrateToV10();
        version = 10;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 10) {
        this.migrateToV11();
        version = 11;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 11) {
        this.migrateToV12();
        version = 12;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 12) {
        this.migrateToV13();
        version = 13;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else if (version === 13) {
        this.migrateToV14();
        version = 14;
        this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
      } else {
        throw new Error(`Unsupported personal-ops schema version: ${version}`);
      }
    }
  }

  private migrateToV2() {
    this.addColumnIfMissing("draft_artifacts", "provider_message_id", `TEXT`);
    this.addColumnIfMissing("draft_artifacts", "provider_thread_id", `TEXT`);
    this.addColumnIfMissing("draft_artifacts", "approved_at", `TEXT`);
    this.addColumnIfMissing("draft_artifacts", "approved_by_client", `TEXT`);
    this.addColumnIfMissing("draft_artifacts", "sent_at", `TEXT`);
    this.addColumnIfMissing("draft_artifacts", "sent_by_client", `TEXT`);
    this.addColumnIfMissing("draft_artifacts", "send_attempt_count", `INTEGER NOT NULL DEFAULT 0`);
    this.addColumnIfMissing("draft_artifacts", "last_send_attempt_at", `TEXT`);
    this.addColumnIfMissing("draft_artifacts", "last_send_error_code", `TEXT`);
    this.addColumnIfMissing("draft_artifacts", "last_send_error_message", `TEXT`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        approval_id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        state TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        requested_by_client TEXT NOT NULL,
        requested_by_actor TEXT,
        approved_at TEXT,
        approved_by_client TEXT,
        approved_by_actor TEXT,
        rejected_at TEXT,
        rejected_by_client TEXT,
        rejected_by_actor TEXT,
        expires_at TEXT NOT NULL,
        decision_note TEXT,
        send_note TEXT,
        draft_digest TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        policy_snapshot_json TEXT NOT NULL,
        confirmation_digest TEXT,
        confirmation_expires_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at
        ON approval_requests(created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_approval_per_artifact
        ON approval_requests(artifact_id)
        WHERE state IN ('pending', 'approved', 'sending', 'send_failed');
    `);
  }

  private migrateToV3() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS send_windows (
        window_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        enabled_at TEXT NOT NULL,
        enabled_by_client TEXT NOT NULL,
        enabled_by_actor TEXT,
        expires_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        disabled_at TEXT,
        disabled_by_client TEXT,
        disabled_by_actor TEXT,
        disable_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_send_windows_created_at
        ON send_windows(created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_send_window
        ON send_windows(state)
        WHERE state = 'active';
    `);
  }

  private migrateToV4() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mail_sync_state (
        mailbox TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        last_history_id TEXT,
        last_synced_at TEXT,
        last_seeded_at TEXT,
        last_sync_duration_ms INTEGER,
        last_sync_refreshed_count INTEGER,
        last_sync_deleted_count INTEGER,
        last_error_code TEXT,
        last_error_message TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mail_threads (
        thread_id TEXT PRIMARY KEY,
        mailbox TEXT NOT NULL,
        last_message_at TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        unread_count INTEGER NOT NULL,
        in_inbox INTEGER NOT NULL,
        last_synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mail_threads_last_message_at
        ON mail_threads(last_message_at DESC);

      CREATE INDEX IF NOT EXISTS idx_mail_threads_unread_inbox
        ON mail_threads(in_inbox, unread_count, last_message_at DESC);

      CREATE TABLE IF NOT EXISTS mail_messages (
        message_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        mailbox TEXT NOT NULL,
        history_id TEXT,
        internal_date TEXT NOT NULL,
        label_ids_json TEXT NOT NULL,
        from_header TEXT,
        to_header TEXT,
        subject TEXT,
        is_unread INTEGER NOT NULL,
        is_sent INTEGER NOT NULL,
        is_inbox INTEGER NOT NULL,
        last_synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mail_messages_thread_id
        ON mail_messages(thread_id, internal_date DESC);

      CREATE INDEX IF NOT EXISTS idx_mail_messages_mailbox
        ON mail_messages(mailbox, internal_date DESC);
    `);
  }

  private migrateToV5() {
    this.addColumnIfMissing("mail_sync_state", "last_sync_duration_ms", `INTEGER`);
    this.addColumnIfMissing("mail_sync_state", "last_sync_refreshed_count", `INTEGER`);
    this.addColumnIfMissing("mail_sync_state", "last_sync_deleted_count", `INTEGER`);
  }

  private migrateToV6() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
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
        canceled_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_state_updated_at
        ON tasks(state, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_tasks_due_at
        ON tasks(due_at, state);

      CREATE INDEX IF NOT EXISTS idx_tasks_remind_at
        ON tasks(remind_at, state);

      CREATE TABLE IF NOT EXISTS task_suggestions (
        suggestion_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        kind TEXT NOT NULL,
        priority TEXT NOT NULL,
        due_at TEXT,
        remind_at TEXT,
        suggested_by_client TEXT NOT NULL,
        suggested_by_actor TEXT,
        status TEXT NOT NULL,
        accepted_task_id TEXT,
        decision_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_task_suggestions_status_updated_at
        ON task_suggestions(status, updated_at DESC);
    `);
  }

  private migrateToV7() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_sync_state (
        account TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        last_synced_at TEXT,
        last_seeded_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        last_sync_duration_ms INTEGER,
        calendars_refreshed_count INTEGER,
        events_refreshed_count INTEGER,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS calendar_sources (
        account TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        time_zone TEXT,
        access_role TEXT,
        is_primary INTEGER NOT NULL,
        is_selected INTEGER NOT NULL,
        background_color TEXT,
        foreground_color TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account, calendar_id)
      );

      CREATE INDEX IF NOT EXISTS idx_calendar_sources_title
        ON calendar_sources(title);

      CREATE TABLE IF NOT EXISTS calendar_events (
        event_id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        account TEXT NOT NULL,
        i_cal_uid TEXT,
        summary TEXT,
        location TEXT,
        html_link TEXT,
        status TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        is_all_day INTEGER NOT NULL,
        is_busy INTEGER NOT NULL,
        recurring_event_id TEXT,
        organizer_email TEXT,
        self_response_status TEXT,
        attendee_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at
        ON calendar_events(start_at ASC);

      CREATE INDEX IF NOT EXISTS idx_calendar_events_account_range
        ON calendar_events(account, start_at ASC, end_at ASC);
    `);
  }

  private migrateToV8() {
    this.addColumnIfMissing("tasks", "scheduled_calendar_event_id", `TEXT`);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_calendar_event_id
        ON tasks(scheduled_calendar_event_id);
    `);

    this.addColumnIfMissing("calendar_events", "provider_event_id", `TEXT`);
    this.addColumnIfMissing("calendar_events", "etag", `TEXT`);
    this.addColumnIfMissing("calendar_events", "notes", `TEXT`);
    this.addColumnIfMissing("calendar_events", "event_type", `TEXT`);
    this.addColumnIfMissing("calendar_events", "visibility", `TEXT`);
    this.addColumnIfMissing("calendar_events", "transparency", `TEXT`);
    this.addColumnIfMissing("calendar_events", "source_task_id", `TEXT`);
    this.addColumnIfMissing("calendar_events", "created_by_personal_ops", `INTEGER NOT NULL DEFAULT 0`);
    this.addColumnIfMissing("calendar_events", "last_write_at", `TEXT`);
    this.addColumnIfMissing("calendar_events", "last_write_by_client", `TEXT`);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_calendar_events_source_task_id
        ON calendar_events(source_task_id);
    `);
    this.db.exec(`
      UPDATE calendar_events
      SET provider_event_id = COALESCE(provider_event_id, substr(event_id, instr(event_id, ':') + 1)),
          created_by_personal_ops = COALESCE(created_by_personal_ops, 0)
      WHERE provider_event_id IS NULL OR provider_event_id = '';
    `);
  }

  private migrateToV9() {
    this.addColumnIfMissing("tasks", "source_planning_recommendation_id", `TEXT`);
    this.addColumnIfMissing("tasks", "source_thread_id", `TEXT`);
    this.addColumnIfMissing("tasks", "source_calendar_event_id", `TEXT`);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_source_planning_recommendation_id
        ON tasks(source_planning_recommendation_id);

      CREATE INDEX IF NOT EXISTS idx_tasks_source_thread_id
        ON tasks(source_thread_id);

      CREATE INDEX IF NOT EXISTS idx_tasks_source_calendar_event_id
        ON tasks(source_calendar_event_id);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS planning_recommendations (
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

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_status_updated_at
        ON planning_recommendations(status, updated_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_recommendations_active_dedupe_key
        ON planning_recommendations(dedupe_key)
        WHERE status IN ('pending', 'snoozed');

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_source_task_id
        ON planning_recommendations(source_task_id);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_source_thread_id
        ON planning_recommendations(source_thread_id);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_source_calendar_event_id
        ON planning_recommendations(source_calendar_event_id);
    `);
  }

  private migrateToV10() {
    this.addColumnIfMissing("planning_recommendations", "rank_score", `REAL NOT NULL DEFAULT 0`);
    this.addColumnIfMissing("planning_recommendations", "rank_reason", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "ranking_version", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "group_key", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "group_summary", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "source_last_seen_at", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "slot_reason", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "trigger_signals_json", `TEXT NOT NULL DEFAULT '[]'`);
    this.addColumnIfMissing("planning_recommendations", "suppressed_signals_json", `TEXT NOT NULL DEFAULT '[]'`);
    this.addColumnIfMissing("planning_recommendations", "replan_count", `INTEGER NOT NULL DEFAULT 0`);
    this.addColumnIfMissing("planning_recommendations", "last_replanned_at", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "decision_reason_code", `TEXT`);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_group_key
        ON planning_recommendations(group_key);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_rank_score
        ON planning_recommendations(rank_score DESC);
    `);
  }

  private migrateToV11() {
    this.addColumnIfMissing("planning_recommendations", "outcome_state", `TEXT NOT NULL DEFAULT 'none'`);
    this.addColumnIfMissing("planning_recommendations", "outcome_recorded_at", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "outcome_source", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "outcome_summary", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "slot_state", `TEXT NOT NULL DEFAULT 'ready'`);
    this.addColumnIfMissing("planning_recommendations", "slot_state_reason", `TEXT`);
  }

  private migrateToV12() {
    this.addColumnIfMissing("planning_recommendations", "first_action_at", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "first_action_type", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "closed_at", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "close_reason_code", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "closed_by_client", `TEXT`);
    this.addColumnIfMissing("planning_recommendations", "closed_by_actor", `TEXT`);
    this.db.exec(`
      UPDATE planning_recommendations
      SET first_action_at = COALESCE(first_action_at, resolved_at),
          first_action_type = COALESCE(first_action_type, 'apply')
      WHERE status = 'applied'
        AND resolved_at IS NOT NULL
        AND first_action_at IS NULL;

      UPDATE planning_recommendations
      SET first_action_at = COALESCE(first_action_at, resolved_at),
          first_action_type = COALESCE(first_action_type, 'reject')
      WHERE status = 'rejected'
        AND resolved_at IS NOT NULL
        AND first_action_at IS NULL;

      UPDATE planning_recommendations
      SET closed_at = COALESCE(closed_at, outcome_recorded_at, resolved_at),
          close_reason_code = COALESCE(close_reason_code, 'task_completed')
      WHERE status = 'applied'
        AND outcome_state = 'completed'
        AND COALESCE(outcome_recorded_at, resolved_at) IS NOT NULL;

      UPDATE planning_recommendations
      SET closed_at = COALESCE(closed_at, outcome_recorded_at, resolved_at),
          close_reason_code = COALESCE(close_reason_code, 'task_canceled')
      WHERE status = 'applied'
        AND outcome_state = 'canceled'
        AND COALESCE(outcome_recorded_at, resolved_at) IS NOT NULL;

      UPDATE planning_recommendations
      SET closed_at = COALESCE(closed_at, resolved_at),
          close_reason_code = COALESCE(
            close_reason_code,
            CASE
              WHEN decision_reason_code = 'duplicate' THEN 'rejected_duplicate'
              WHEN decision_reason_code = 'handled_elsewhere' THEN 'rejected_handled_elsewhere'
              ELSE 'rejected_other'
            END
          )
      WHERE status = 'rejected'
        AND resolved_at IS NOT NULL;

      UPDATE planning_recommendations
      SET closed_at = COALESCE(closed_at, resolved_at),
          close_reason_code = COALESCE(close_reason_code, 'expired')
      WHERE status = 'expired'
        AND resolved_at IS NOT NULL;

      UPDATE planning_recommendations
      SET closed_at = COALESCE(closed_at, outcome_recorded_at, resolved_at),
          close_reason_code = COALESCE(close_reason_code, 'source_resolved')
      WHERE status = 'superseded'
        AND outcome_state = 'source_resolved'
        AND COALESCE(outcome_recorded_at, resolved_at) IS NOT NULL;
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_closed_at
        ON planning_recommendations(closed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_first_action_at
        ON planning_recommendations(first_action_at DESC);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_close_reason_code
        ON planning_recommendations(close_reason_code);
    `);
  }

  private migrateToV13() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS planning_hygiene_policy_proposals (
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

      CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_hygiene_policy_proposals_family
        ON planning_hygiene_policy_proposals(group_key, kind, source);

      CREATE INDEX IF NOT EXISTS idx_planning_hygiene_policy_proposals_status_updated_at
        ON planning_hygiene_policy_proposals(status, updated_at DESC);
    `);
  }

  private migrateToV14() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS planning_hygiene_policy_governance_events (
        governance_event_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        group_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        source TEXT NOT NULL,
        event_type TEXT NOT NULL,
        basis_signal_updated_at TEXT,
        follow_through_state_snapshot TEXT,
        proposal_status_snapshot TEXT,
        recorded_at TEXT NOT NULL,
        recorded_by_client TEXT NOT NULL,
        recorded_by_actor TEXT,
        note TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_planning_hygiene_policy_governance_events_recorded_at
        ON planning_hygiene_policy_governance_events(recorded_at DESC);

      CREATE INDEX IF NOT EXISTS idx_planning_hygiene_policy_governance_events_family
        ON planning_hygiene_policy_governance_events(group_key, kind, source, recorded_at DESC);
    `);
  }

  private tableExists(name: string): boolean {
    const row = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name) as { name: string } | undefined;
    return Boolean(row);
  }

  private columnExists(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
  }

  private addColumnIfMissing(table: string, column: string, definition: string) {
    if (!this.columnExists(table, column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private mapDraft(row: Record<string, unknown>): DraftArtifact {
    return {
      artifact_id: String(row.artifact_id),
      provider: String(row.provider),
      provider_draft_id: String(row.provider_draft_id),
      provider_message_id: row.provider_message_id ? String(row.provider_message_id) : undefined,
      provider_thread_id: row.provider_thread_id ? String(row.provider_thread_id) : undefined,
      mailbox: String(row.mailbox),
      to: fromJsonArray(String(row.to_json)),
      cc: fromJsonArray(String(row.cc_json)),
      bcc: fromJsonArray(String(row.bcc_json)),
      subject: String(row.subject),
      body_text: row.body_text ? String(row.body_text) : undefined,
      body_html: row.body_html ? String(row.body_html) : undefined,
      status: String(row.status) as DraftArtifactStatus,
      review_state: String(row.review_state) as DraftReviewState,
      created_by_client: String(row.created_by_client),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      approved_at: row.approved_at ? String(row.approved_at) : undefined,
      approved_by_client: row.approved_by_client ? String(row.approved_by_client) : undefined,
      sent_at: row.sent_at ? String(row.sent_at) : undefined,
      sent_by_client: row.sent_by_client ? String(row.sent_by_client) : undefined,
      send_attempt_count: Number(row.send_attempt_count ?? 0),
      last_send_attempt_at: row.last_send_attempt_at ? String(row.last_send_attempt_at) : undefined,
      last_send_error_code: row.last_send_error_code ? String(row.last_send_error_code) : undefined,
      last_send_error_message: row.last_send_error_message ? String(row.last_send_error_message) : undefined,
    };
  }

  private mapReview(row: Record<string, unknown>): ReviewItem {
    return {
      review_id: String(row.review_id),
      artifact_id: String(row.artifact_id),
      kind: String(row.kind),
      state: String(row.state) as ReviewItemState,
      created_at: String(row.created_at),
      opened_at: row.opened_at ? String(row.opened_at) : undefined,
      resolved_at: row.resolved_at ? String(row.resolved_at) : undefined,
      subject: row.subject ? String(row.subject) : undefined,
    };
  }

  private mapApproval(row: Record<string, unknown>): ApprovalRequest {
    return {
      approval_id: String(row.approval_id),
      artifact_id: String(row.artifact_id),
      state: String(row.state) as ApprovalRequestState,
      requested_at: String(row.requested_at),
      requested_by_client: String(row.requested_by_client),
      requested_by_actor: row.requested_by_actor ? String(row.requested_by_actor) : undefined,
      approved_at: row.approved_at ? String(row.approved_at) : undefined,
      approved_by_client: row.approved_by_client ? String(row.approved_by_client) : undefined,
      approved_by_actor: row.approved_by_actor ? String(row.approved_by_actor) : undefined,
      rejected_at: row.rejected_at ? String(row.rejected_at) : undefined,
      rejected_by_client: row.rejected_by_client ? String(row.rejected_by_client) : undefined,
      rejected_by_actor: row.rejected_by_actor ? String(row.rejected_by_actor) : undefined,
      expires_at: String(row.expires_at),
      decision_note: row.decision_note ? String(row.decision_note) : undefined,
      send_note: row.send_note ? String(row.send_note) : undefined,
      draft_digest: String(row.draft_digest),
      risk_flags_json: String(row.risk_flags_json),
      policy_snapshot_json: String(row.policy_snapshot_json),
      confirmation_digest: row.confirmation_digest ? String(row.confirmation_digest) : undefined,
      confirmation_expires_at: row.confirmation_expires_at ? String(row.confirmation_expires_at) : undefined,
      last_error_code: row.last_error_code ? String(row.last_error_code) : undefined,
      last_error_message: row.last_error_message ? String(row.last_error_message) : undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  private mapSendWindow(row: Record<string, unknown>): SendWindow {
    return {
      window_id: String(row.window_id),
      state: String(row.state) as SendWindowState,
      enabled_at: String(row.enabled_at),
      enabled_by_client: String(row.enabled_by_client),
      enabled_by_actor: row.enabled_by_actor ? String(row.enabled_by_actor) : undefined,
      expires_at: String(row.expires_at),
      reason: String(row.reason),
      disabled_at: row.disabled_at ? String(row.disabled_at) : undefined,
      disabled_by_client: row.disabled_by_client ? String(row.disabled_by_client) : undefined,
      disabled_by_actor: row.disabled_by_actor ? String(row.disabled_by_actor) : undefined,
      disable_reason: row.disable_reason ? String(row.disable_reason) : undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  private mapCalendarSyncState(row: Record<string, unknown>): CalendarSyncState {
    return {
      account: String(row.account),
      provider: String(row.provider) as CalendarProvider,
      status: String(row.status) as CalendarSyncStatus,
      last_synced_at: row.last_synced_at ? String(row.last_synced_at) : undefined,
      last_seeded_at: row.last_seeded_at ? String(row.last_seeded_at) : undefined,
      last_error_code: row.last_error_code ? String(row.last_error_code) : undefined,
      last_error_message: row.last_error_message ? String(row.last_error_message) : undefined,
      last_sync_duration_ms:
        row.last_sync_duration_ms === null || row.last_sync_duration_ms === undefined
          ? undefined
          : Number(row.last_sync_duration_ms),
      calendars_refreshed_count:
        row.calendars_refreshed_count === null || row.calendars_refreshed_count === undefined
          ? undefined
          : Number(row.calendars_refreshed_count),
      events_refreshed_count:
        row.events_refreshed_count === null || row.events_refreshed_count === undefined
          ? undefined
          : Number(row.events_refreshed_count),
      updated_at: String(row.updated_at),
    };
  }

  private mapCalendarSource(row: Record<string, unknown>): CalendarSource {
    return {
      calendar_id: String(row.calendar_id),
      provider: String(row.provider) as CalendarProvider,
      account: String(row.account),
      title: String(row.title),
      time_zone: row.time_zone ? String(row.time_zone) : undefined,
      access_role: row.access_role ? String(row.access_role) : undefined,
      is_primary: Boolean(row.is_primary),
      is_selected: Boolean(row.is_selected),
      background_color: row.background_color ? String(row.background_color) : undefined,
      foreground_color: row.foreground_color ? String(row.foreground_color) : undefined,
      updated_at: String(row.updated_at),
    };
  }

  private mapCalendarEvent(row: Record<string, unknown>): CalendarEvent {
    return {
      event_id: String(row.event_id),
      provider_event_id: row.provider_event_id ? String(row.provider_event_id) : String(row.event_id),
      calendar_id: String(row.calendar_id),
      provider: String(row.provider) as CalendarProvider,
      account: String(row.account),
      i_cal_uid: row.i_cal_uid ? String(row.i_cal_uid) : undefined,
      etag: row.etag ? String(row.etag) : undefined,
      summary: row.summary ? String(row.summary) : undefined,
      location: row.location ? String(row.location) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      html_link: row.html_link ? String(row.html_link) : undefined,
      status: String(row.status),
      event_type: row.event_type ? String(row.event_type) : undefined,
      visibility: row.visibility ? String(row.visibility) : undefined,
      transparency: row.transparency ? String(row.transparency) : undefined,
      start_at: String(row.start_at),
      end_at: String(row.end_at),
      is_all_day: Boolean(row.is_all_day),
      is_busy: Boolean(row.is_busy),
      recurring_event_id: row.recurring_event_id ? String(row.recurring_event_id) : undefined,
      organizer_email: row.organizer_email ? String(row.organizer_email) : undefined,
      self_response_status: row.self_response_status ? String(row.self_response_status) : undefined,
      attendee_count: Number(row.attendee_count ?? 0),
      source_task_id: row.source_task_id ? String(row.source_task_id) : undefined,
      created_by_personal_ops: Boolean(row.created_by_personal_ops),
      last_write_at: row.last_write_at ? String(row.last_write_at) : undefined,
      last_write_by_client: row.last_write_by_client ? String(row.last_write_by_client) : undefined,
      updated_at: String(row.updated_at),
      synced_at: String(row.synced_at),
    };
  }

  private mapMailSyncState(row: Record<string, unknown>): MailSyncState {
    return {
      mailbox: String(row.mailbox),
      provider: String(row.provider),
      status: String(row.status) as MailSyncStatus,
      last_history_id: row.last_history_id ? String(row.last_history_id) : undefined,
      last_synced_at: row.last_synced_at ? String(row.last_synced_at) : undefined,
      last_seeded_at: row.last_seeded_at ? String(row.last_seeded_at) : undefined,
      last_sync_duration_ms:
        row.last_sync_duration_ms === null || row.last_sync_duration_ms === undefined
          ? undefined
          : Number(row.last_sync_duration_ms),
      last_sync_refreshed_count:
        row.last_sync_refreshed_count === null || row.last_sync_refreshed_count === undefined
          ? undefined
          : Number(row.last_sync_refreshed_count),
      last_sync_deleted_count:
        row.last_sync_deleted_count === null || row.last_sync_deleted_count === undefined
          ? undefined
          : Number(row.last_sync_deleted_count),
      last_error_code: row.last_error_code ? String(row.last_error_code) : undefined,
      last_error_message: row.last_error_message ? String(row.last_error_message) : undefined,
      updated_at: String(row.updated_at),
    };
  }

  private mapMailThread(row: Record<string, unknown>): MailThread {
    return {
      thread_id: String(row.thread_id),
      mailbox: String(row.mailbox),
      last_message_at: String(row.last_message_at),
      message_count: Number(row.message_count ?? 0),
      unread_count: Number(row.unread_count ?? 0),
      in_inbox: Boolean(row.in_inbox),
      last_synced_at: String(row.last_synced_at),
    };
  }

  private mapMailMessage(row: Record<string, unknown>): MailMessage {
    return {
      message_id: String(row.message_id),
      thread_id: String(row.thread_id),
      mailbox: String(row.mailbox),
      history_id: row.history_id ? String(row.history_id) : undefined,
      internal_date: String(row.internal_date),
      label_ids: fromJsonArray(String(row.label_ids_json)),
      from_header: row.from_header ? String(row.from_header) : undefined,
      to_header: row.to_header ? String(row.to_header) : undefined,
      subject: row.subject ? String(row.subject) : undefined,
      is_unread: Boolean(row.is_unread),
      is_sent: Boolean(row.is_sent),
      is_inbox: Boolean(row.is_inbox),
      last_synced_at: String(row.last_synced_at),
    };
  }

  private mapTask(row: Record<string, unknown>): TaskItem {
    return {
      task_id: String(row.task_id),
      title: String(row.title),
      notes: row.notes ? String(row.notes) : undefined,
      kind: String(row.kind) as TaskItem["kind"],
      state: String(row.state) as TaskState,
      priority: String(row.priority) as TaskPriority,
      created_by_client: String(row.created_by_client),
      created_by_actor: row.created_by_actor ? String(row.created_by_actor) : undefined,
      owner: String(row.owner) as TaskOwner,
      due_at: row.due_at ? String(row.due_at) : undefined,
      remind_at: row.remind_at ? String(row.remind_at) : undefined,
      source: String(row.source) as TaskSource,
      source_suggestion_id: row.source_suggestion_id ? String(row.source_suggestion_id) : undefined,
      source_planning_recommendation_id: row.source_planning_recommendation_id
        ? String(row.source_planning_recommendation_id)
        : undefined,
      source_thread_id: row.source_thread_id ? String(row.source_thread_id) : undefined,
      source_calendar_event_id: row.source_calendar_event_id ? String(row.source_calendar_event_id) : undefined,
      decision_note: row.decision_note ? String(row.decision_note) : undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      completed_at: row.completed_at ? String(row.completed_at) : undefined,
      canceled_at: row.canceled_at ? String(row.canceled_at) : undefined,
      scheduled_calendar_event_id: row.scheduled_calendar_event_id ? String(row.scheduled_calendar_event_id) : undefined,
    };
  }

  private mapTaskSuggestion(row: Record<string, unknown>): TaskSuggestion {
    return {
      suggestion_id: String(row.suggestion_id),
      title: String(row.title),
      notes: row.notes ? String(row.notes) : undefined,
      kind: String(row.kind) as TaskItem["kind"],
      priority: String(row.priority) as TaskPriority,
      due_at: row.due_at ? String(row.due_at) : undefined,
      remind_at: row.remind_at ? String(row.remind_at) : undefined,
      suggested_by_client: String(row.suggested_by_client),
      suggested_by_actor: row.suggested_by_actor ? String(row.suggested_by_actor) : undefined,
      status: String(row.status) as TaskSuggestionStatus,
      accepted_task_id: row.accepted_task_id ? String(row.accepted_task_id) : undefined,
      decision_note: row.decision_note ? String(row.decision_note) : undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      resolved_at: row.resolved_at ? String(row.resolved_at) : undefined,
    };
  }

  private mapPlanningRecommendation(row: Record<string, unknown>): PlanningRecommendation {
    return {
      recommendation_id: String(row.recommendation_id),
      kind: String(row.kind) as PlanningRecommendationKind,
      status: String(row.status) as PlanningRecommendationStatus,
      priority: String(row.priority) as TaskPriority,
      source: String(row.source) as PlanningRecommendationSource,
      suggested_by_client: String(row.suggested_by_client),
      suggested_by_actor: row.suggested_by_actor ? String(row.suggested_by_actor) : undefined,
      source_task_id: row.source_task_id ? String(row.source_task_id) : undefined,
      source_thread_id: row.source_thread_id ? String(row.source_thread_id) : undefined,
      source_calendar_event_id: row.source_calendar_event_id ? String(row.source_calendar_event_id) : undefined,
      proposed_calendar_id: row.proposed_calendar_id ? String(row.proposed_calendar_id) : undefined,
      proposed_start_at: row.proposed_start_at ? String(row.proposed_start_at) : undefined,
      proposed_end_at: row.proposed_end_at ? String(row.proposed_end_at) : undefined,
      proposed_title: row.proposed_title ? String(row.proposed_title) : undefined,
      proposed_notes: row.proposed_notes ? String(row.proposed_notes) : undefined,
      reason_code: String(row.reason_code),
      reason_summary: String(row.reason_summary),
      dedupe_key: String(row.dedupe_key),
      source_fingerprint: String(row.source_fingerprint),
      rank_score: Number(row.rank_score ?? 0),
      rank_reason: row.rank_reason ? String(row.rank_reason) : undefined,
      ranking_version: row.ranking_version ? String(row.ranking_version) : undefined,
      group_key: row.group_key ? String(row.group_key) : undefined,
      group_summary: row.group_summary ? String(row.group_summary) : undefined,
      source_last_seen_at: row.source_last_seen_at ? String(row.source_last_seen_at) : undefined,
      first_action_at: row.first_action_at ? String(row.first_action_at) : undefined,
      first_action_type: row.first_action_type ? (String(row.first_action_type) as PlanningRecommendationFirstActionType) : undefined,
      closed_at: row.closed_at ? String(row.closed_at) : undefined,
      close_reason_code: row.close_reason_code ? (String(row.close_reason_code) as PlanningRecommendationCloseReasonCode) : undefined,
      closed_by_client: row.closed_by_client ? String(row.closed_by_client) : undefined,
      closed_by_actor: row.closed_by_actor ? String(row.closed_by_actor) : undefined,
      outcome_state: String(row.outcome_state ?? "none") as PlanningRecommendationOutcomeState,
      outcome_recorded_at: row.outcome_recorded_at ? String(row.outcome_recorded_at) : undefined,
      outcome_source: row.outcome_source ? (String(row.outcome_source) as PlanningRecommendationOutcomeSource) : undefined,
      outcome_summary: row.outcome_summary ? String(row.outcome_summary) : undefined,
      slot_state: String(row.slot_state ?? "ready") as PlanningRecommendationSlotState,
      slot_state_reason: row.slot_state_reason ? String(row.slot_state_reason) : undefined,
      slot_reason: row.slot_reason ? String(row.slot_reason) : undefined,
      trigger_signals: fromJsonArray(String(row.trigger_signals_json ?? "[]")),
      suppressed_signals: fromJsonArray(String(row.suppressed_signals_json ?? "[]")),
      replan_count: Number(row.replan_count ?? 0),
      last_replanned_at: row.last_replanned_at ? String(row.last_replanned_at) : undefined,
      decision_reason_code: row.decision_reason_code ? String(row.decision_reason_code) : undefined,
      decision_note: row.decision_note ? String(row.decision_note) : undefined,
      snoozed_until: row.snoozed_until ? String(row.snoozed_until) : undefined,
      applied_task_id: row.applied_task_id ? String(row.applied_task_id) : undefined,
      applied_calendar_event_id: row.applied_calendar_event_id ? String(row.applied_calendar_event_id) : undefined,
      last_error_code: row.last_error_code ? String(row.last_error_code) : undefined,
      last_error_message: row.last_error_message ? String(row.last_error_message) : undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      resolved_at: row.resolved_at ? String(row.resolved_at) : undefined,
    };
  }

  private mapPlanningHygienePolicyProposal(row: Record<string, unknown>): PlanningHygienePolicyProposal {
    return {
      proposal_id: String(row.proposal_id),
      group_key: String(row.group_key),
      kind: String(row.kind) as PlanningRecommendationKind,
      source: String(row.source) as PlanningRecommendationSource,
      proposal_type: String(row.proposal_type) as PlanningHygienePolicyProposalType,
      status: String(row.status) as PlanningHygienePolicyProposalStatus,
      basis_signal_updated_at: row.basis_signal_updated_at ? String(row.basis_signal_updated_at) : null,
      created_at: String(row.created_at),
      created_by_client: String(row.created_by_client),
      created_by_actor: row.created_by_actor ? String(row.created_by_actor) : undefined,
      updated_at: String(row.updated_at),
      updated_by_client: String(row.updated_by_client),
      updated_by_actor: row.updated_by_actor ? String(row.updated_by_actor) : undefined,
      note: row.note ? String(row.note) : undefined,
    };
  }

  private mapPlanningHygienePolicyGovernanceEvent(
    row: Record<string, unknown>,
  ): PlanningHygienePolicyGovernanceEvent {
    return {
      governance_event_id: String(row.governance_event_id),
      proposal_id: String(row.proposal_id),
      group_key: String(row.group_key),
      kind: String(row.kind) as PlanningRecommendationKind,
      source: String(row.source) as PlanningRecommendationSource,
      event_type: String(row.event_type) as PlanningHygienePolicyGovernanceEventType,
      basis_signal_updated_at: row.basis_signal_updated_at ? String(row.basis_signal_updated_at) : null,
      follow_through_state_snapshot: row.follow_through_state_snapshot
        ? String(row.follow_through_state_snapshot) as PlanningRecommendationFollowThroughState
        : null,
      proposal_status_snapshot: row.proposal_status_snapshot
        ? String(row.proposal_status_snapshot) as PlanningHygienePolicyProposalStatus
        : null,
      recorded_at: String(row.recorded_at),
      recorded_by_client: String(row.recorded_by_client),
      recorded_by_actor: row.recorded_by_actor ? String(row.recorded_by_actor) : undefined,
      note: row.note ? String(row.note) : undefined,
    };
  }
}
