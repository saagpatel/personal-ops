import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { backup, DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
	type ApprovalRequest,
	type ApprovalRequestFilter,
	type ApprovalRequestState,
	type AuditEvent,
	type AuditEventFilter,
	type AuditEventInput,
	type AutopilotProfile,
	type AutopilotProfileState,
	type AutopilotProfileStateRecord,
	type AutopilotRunOutcome,
	type AutopilotRunRecord,
	type AutopilotTrigger,
	type CalendarAttendee,
	type CalendarEvent,
	type CalendarProvider,
	type CalendarSource,
	type CalendarSyncState,
	type CalendarSyncStatus,
	type ClientIdentity,
	type DraftArtifact,
	type DraftArtifactStatus,
	type DraftInput,
	type DraftReviewState,
	type DriveDocRecord,
	type DriveFileRecord,
	type DriveLinkProvenance,
	type DriveSheetRecord,
	type DriveSyncState,
	type DriveSyncStatus,
	type GithubAccount,
	type GithubPullRequest,
	type GithubSyncState,
	type GithubSyncStatus,
	type GmailMessageMetadata,
	type MailMessage,
	type MailSyncState,
	type MailSyncStatus,
	type MailThread,
	type MaintenanceCommitmentRecord,
	type MaintenanceCommitmentState,
	type MeetingPrepPacketRecord,
	type PlanningHygienePolicyGovernanceEvent,
	type PlanningHygienePolicyGovernanceEventType,
	type PlanningHygienePolicyProposal,
	type PlanningHygienePolicyProposalStatus,
	type PlanningHygienePolicyProposalType,
	type PlanningRecommendation,
	type PlanningRecommendationCloseReasonCode,
	type PlanningRecommendationFilter,
	type PlanningRecommendationFirstActionType,
	type PlanningRecommendationFollowThroughState,
	type PlanningRecommendationKind,
	type PlanningRecommendationOutcomeSource,
	type PlanningRecommendationOutcomeState,
	type PlanningRecommendationSlotState,
	type PlanningRecommendationSource,
	type PlanningRecommendationStatus,
	type PolicySnapshot,
	type RepairExecutionOutcome,
	type RepairExecutionRecord,
	type RepairExecutionTriggerSource,
	type RepairStepId,
	type ReviewApprovalFlowEvidenceKind,
	type ReviewApprovalFlowOutcomeRecord,
	type ReviewApprovalFlowOutcomeState,
	type ReviewCalibrationTarget,
	type ReviewCalibrationTargetScopeKey,
	type ReviewCalibrationTargetScopeType,
	type ReviewFeedbackEvent,
	type ReviewFeedbackReason,
	type ReviewItem,
	type ReviewItemState,
	type ReviewMetricSnapshot,
	type ReviewMetricSnapshotMetrics,
	type ReviewMetricSnapshotScopeKey,
	type ReviewMetricSnapshotScopeType,
	type ReviewNotificationDecision,
	type ReviewNotificationEvent,
	type ReviewNotificationKind,
	ReviewNotificationSnapshot,
	type ReviewNotificationSuppressionReason,
	type ReviewPackage,
	type ReviewPackageCycle,
	type ReviewPackageCycleOutcome,
	type ReviewPackageItem,
	type ReviewPackageState,
	type ReviewPackageSurface,
	type ReviewReadModelRefreshState,
	type ReviewTuningProposal,
	type ReviewTuningProposalKind,
	type ReviewTuningProposalStatus,
	type SendWindow,
	type SendWindowState,
	type SurfacedWorkEvidenceKind,
	type SurfacedWorkOutcomeRecord,
	type SurfacedWorkOutcomeState,
	type SurfacedWorkSurface,
	type TaskItem,
	type TaskOwner,
	type TaskPriority,
	type TaskSource,
	type TaskState,
	type TaskSuggestion,
	type TaskSuggestionStatus,
} from "./types.js";

export const CURRENT_SCHEMA_VERSION = 29;
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

	close(): void {
		this.db.close();
	}

	registerClient(identity: ClientIdentity): void {
		const now = nowIso();
		this.db
			.prepare(
				`INSERT INTO client_registrations (client_id, label, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(client_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, label = excluded.label`,
			)
			.run(
				identity.client_id,
				identity.requested_by ?? identity.client_id,
				now,
				now,
			);
	}

	upsertMailAccount(
		email: string,
		keychainService: string,
		profileJson: string,
	): void {
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

	getMailAccount(): {
		email: string;
		keychain_service: string;
		keychain_account: string;
		profile_json: string;
	} | null {
		const row = this.db
			.prepare(
				`SELECT email, keychain_service, keychain_account, profile_json
         FROM mail_accounts
         ORDER BY connected_at DESC
         LIMIT 1`,
			)
			.get() as
			| {
					email: string;
					keychain_service: string;
					keychain_account: string;
					profile_json: string;
			  }
			| undefined;
		return row ?? null;
	}

	upsertGithubAccount(account: GithubAccount): GithubAccount {
		this.db
			.prepare(
				`INSERT INTO github_accounts (
          provider, login, keychain_service, keychain_account, connected_at, updated_at, profile_json
        ) VALUES ('github', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider) DO UPDATE SET
          login = excluded.login,
          keychain_service = excluded.keychain_service,
          keychain_account = excluded.keychain_account,
          connected_at = excluded.connected_at,
          updated_at = excluded.updated_at,
          profile_json = excluded.profile_json`,
			)
			.run(
				account.login,
				account.keychain_service,
				account.keychain_account,
				account.connected_at,
				account.updated_at,
				account.profile_json,
			);
		return this.getGithubAccount()!;
	}

	getGithubAccount(): GithubAccount | null {
		const row = this.db
			.prepare(
				`SELECT login, keychain_service, keychain_account, connected_at, updated_at, profile_json
         FROM github_accounts
         WHERE provider = 'github'
         LIMIT 1`,
			)
			.get() as Record<string, unknown> | undefined;
		return row ? this.mapGithubAccount(row) : null;
	}

	clearGithubAccount(): void {
		this.db
			.prepare(`DELETE FROM github_accounts WHERE provider = 'github'`)
			.run();
	}

	getSchemaVersion(): number {
		const row = this.db
			.prepare(`SELECT version FROM schema_meta LIMIT 1`)
			.get() as { version: number } | undefined;
		return row?.version ?? 1;
	}

	getSchemaCompatibility(): {
		current_version: number;
		expected_version: number;
		compatible: boolean;
		message: string;
	} {
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
			if (
				!this.columnExists("planning_hygiene_policy_governance_events", column)
			) {
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
		for (const tableName of [
			"github_accounts",
			"github_sync_state",
			"github_pull_requests",
		]) {
			if (!this.tableExists(tableName)) {
				return {
					current_version: current,
					expected_version: SCHEMA_VERSION,
					compatible: false,
					message: `Schema is missing ${tableName}.`,
				};
			}
		}
		for (const tableName of [
			"drive_sync_state",
			"drive_files",
			"drive_docs",
			"drive_link_provenance",
		]) {
			if (!this.tableExists(tableName)) {
				return {
					current_version: current,
					expected_version: SCHEMA_VERSION,
					compatible: false,
					message: `Schema is missing ${tableName}.`,
				};
			}
		}
		if (!this.tableExists("meeting_prep_packets")) {
			return {
				current_version: current,
				expected_version: SCHEMA_VERSION,
				compatible: false,
				message: "Schema is missing meeting_prep_packets.",
			};
		}
		for (const tableName of ["autopilot_runs", "autopilot_profile_state"]) {
			if (!this.tableExists(tableName)) {
				return {
					current_version: current,
					expected_version: SCHEMA_VERSION,
					compatible: false,
					message: `Schema is missing ${tableName}.`,
				};
			}
		}
		for (const tableName of [
			"review_packages",
			"review_package_cycles",
			"review_metric_snapshots",
			"review_feedback_events",
			"review_notification_events",
			"review_tuning_proposals",
			"review_tuning_state",
			"review_read_model_state",
		]) {
			if (!this.tableExists(tableName)) {
				return {
					current_version: current,
					expected_version: SCHEMA_VERSION,
					compatible: false,
					message: `Schema is missing ${tableName}.`,
				};
			}
		}
		if (!this.columnExists("review_feedback_events", "package_cycle_id")) {
			return {
				current_version: current,
				expected_version: SCHEMA_VERSION,
				compatible: false,
				message: "Schema is missing review_feedback_events.package_cycle_id.",
			};
		}
		if (!this.tableExists("surfaced_work_outcomes")) {
			return {
				current_version: current,
				expected_version: SCHEMA_VERSION,
				compatible: false,
				message: "Schema is missing surfaced_work_outcomes.",
			};
		}
		const missingSurfacedOutcomeColumns: string[] = [];
		for (const column of [
			"outcome_id",
			"surface",
			"surfaced_state",
			"target_type",
			"target_id",
			"assistant_action_id",
			"planning_recommendation_id",
			"repair_step_id",
			"maintenance_step_id",
			"summary_snapshot",
			"command_snapshot",
			"surfaced_at",
			"last_seen_at",
			"state",
			"evidence_kind",
			"acted_at",
			"closed_at",
		]) {
			if (!this.columnExists("surfaced_work_outcomes", column)) {
				missingSurfacedOutcomeColumns.push(column);
			}
		}
		if (missingSurfacedOutcomeColumns.length > 0) {
			return {
				current_version: current,
				expected_version: SCHEMA_VERSION,
				compatible: false,
				message: `Schema ${current} is missing surfaced outcome columns: ${missingSurfacedOutcomeColumns.join(", ")}.`,
			};
		}
		if (!this.tableExists("review_approval_flow_outcomes")) {
			return {
				current_version: current,
				expected_version: SCHEMA_VERSION,
				compatible: false,
				message: "Schema is missing review_approval_flow_outcomes.",
			};
		}
		const missingReviewApprovalOutcomeColumns: string[] = [];
		for (const column of [
			"outcome_id",
			"surfaced_state",
			"target_type",
			"target_id",
			"review_id",
			"approval_id",
			"outbound_group_id",
			"assistant_action_id",
			"summary_snapshot",
			"command_snapshot",
			"surfaced_at",
			"last_seen_at",
			"state",
			"evidence_kind",
			"acted_at",
			"closed_at",
		]) {
			if (!this.columnExists("review_approval_flow_outcomes", column)) {
				missingReviewApprovalOutcomeColumns.push(column);
			}
		}
		if (missingReviewApprovalOutcomeColumns.length > 0) {
			return {
				current_version: current,
				expected_version: SCHEMA_VERSION,
				compatible: false,
				message: `Schema ${current} is missing review approval outcome columns: ${missingReviewApprovalOutcomeColumns.join(", ")}.`,
			};
		}
		return {
			current_version: current,
			expected_version: SCHEMA_VERSION,
			compatible: true,
			message: `Schema version ${current} matches expected version ${SCHEMA_VERSION}.`,
		};
	}

	createDraftArtifact(
		identity: ClientIdentity,
		mailbox: string,
		providerDraftId: string,
		input: DraftInput,
		assistantMetadata: {
			assistant_generated?: boolean;
			assistant_source_thread_id?: string;
			assistant_group_id?: string;
			assistant_why_now?: string;
			autopilot_run_id?: string;
			autopilot_profile?: AutopilotProfile;
			autopilot_trigger?: AutopilotTrigger;
			autopilot_prepared_at?: string;
		} = {},
	): DraftArtifact {
		const now = nowIso();
		const artifactId = randomUUID();
		this.db
			.prepare(
				`INSERT INTO draft_artifacts (
          artifact_id, provider, provider_draft_id, mailbox, to_json, cc_json, bcc_json, subject,
          body_text, body_html, status, review_state, created_by_client, created_at, updated_at,
          provider_message_id, provider_thread_id, assistant_generated, assistant_source_thread_id, assistant_group_id, assistant_why_now,
          autopilot_run_id, autopilot_profile, autopilot_trigger, autopilot_prepared_at,
          approved_at, approved_by_client, sent_at, sent_by_client,
          send_attempt_count, last_send_attempt_at, last_send_error_code, last_send_error_message
        ) VALUES (?, 'gmail', ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL)`,
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
				assistantMetadata.assistant_generated ? 1 : 0,
				assistantMetadata.assistant_source_thread_id ?? null,
				assistantMetadata.assistant_group_id ?? null,
				assistantMetadata.assistant_why_now ?? null,
				assistantMetadata.autopilot_run_id ?? null,
				assistantMetadata.autopilot_profile ?? null,
				assistantMetadata.autopilot_trigger ?? null,
				assistantMetadata.autopilot_prepared_at ?? null,
			);
		return this.getDraftArtifact(artifactId)!;
	}

	updateDraftArtifact(
		artifactId: string,
		input: DraftInput,
		assistantMetadata: {
			assistant_generated?: boolean;
			assistant_source_thread_id?: string | null;
			assistant_group_id?: string | null;
			assistant_why_now?: string | null;
			autopilot_run_id?: string | null;
			autopilot_profile?: AutopilotProfile | null;
			autopilot_trigger?: AutopilotTrigger | null;
			autopilot_prepared_at?: string | null;
		} = {},
	): DraftArtifact | null {
		const now = nowIso();
		this.db
			.prepare(
				`UPDATE draft_artifacts
         SET to_json = ?, cc_json = ?, bcc_json = ?, subject = ?, body_text = ?, body_html = ?,
             assistant_generated = ?, assistant_source_thread_id = ?, assistant_group_id = ?, assistant_why_now = ?,
             autopilot_run_id = ?, autopilot_profile = ?, autopilot_trigger = ?, autopilot_prepared_at = ?,
             updated_at = ?
         WHERE artifact_id = ?`,
			)
			.run(
				toJson(input.to),
				toJson(input.cc),
				toJson(input.bcc),
				input.subject,
				input.body_text ?? null,
				input.body_html ?? null,
				assistantMetadata.assistant_generated ? 1 : 0,
				assistantMetadata.assistant_source_thread_id ?? null,
				assistantMetadata.assistant_group_id ?? null,
				assistantMetadata.assistant_why_now ?? null,
				assistantMetadata.autopilot_run_id ?? null,
				assistantMetadata.autopilot_profile ?? null,
				assistantMetadata.autopilot_trigger ?? null,
				assistantMetadata.autopilot_prepared_at ?? null,
				now,
				artifactId,
			);
		return this.getDraftArtifact(artifactId);
	}

	getDraftArtifact(artifactId: string): DraftArtifact | null {
		const row = this.db
			.prepare(`SELECT * FROM draft_artifacts WHERE artifact_id = ?`)
			.get(artifactId) as Record<string, unknown> | undefined;
		return row ? this.mapDraft(row) : null;
	}

	getDraftArtifactByProviderId(providerDraftId: string): DraftArtifact | null {
		const row = this.db
			.prepare(`SELECT * FROM draft_artifacts WHERE provider_draft_id = ?`)
			.get(providerDraftId) as Record<string, unknown> | undefined;
		return row ? this.mapDraft(row) : null;
	}

	listDraftArtifacts(): DraftArtifact[] {
		const rows = this.db
			.prepare(`SELECT * FROM draft_artifacts ORDER BY updated_at DESC`)
			.all() as Record<string, unknown>[];
		return rows.map((row) => this.mapDraft(row));
	}

	listDraftArtifactsByAssistantSourceThread(threadId: string): DraftArtifact[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM draft_artifacts WHERE assistant_source_thread_id = ? ORDER BY updated_at DESC`,
			)
			.all(threadId) as Record<string, unknown>[];
		return rows.map((row) => this.mapDraft(row));
	}

	listDraftArtifactsByAssistantGroup(groupId: string): DraftArtifact[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM draft_artifacts WHERE assistant_group_id = ? ORDER BY updated_at DESC`,
			)
			.all(groupId) as Record<string, unknown>[];
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
		if (updates.approved_at !== undefined)
			push("approved_at", updates.approved_at);
		if (updates.approved_by_client !== undefined)
			push("approved_by_client", updates.approved_by_client);
		if (updates.sent_at !== undefined) push("sent_at", updates.sent_at);
		if (updates.sent_by_client !== undefined)
			push("sent_by_client", updates.sent_by_client);
		if (updates.provider_message_id !== undefined)
			push("provider_message_id", updates.provider_message_id);
		if (updates.provider_thread_id !== undefined)
			push("provider_thread_id", updates.provider_thread_id);
		if (updates.send_attempt_count !== undefined)
			push("send_attempt_count", updates.send_attempt_count);
		if (updates.last_send_attempt_at !== undefined)
			push("last_send_attempt_at", updates.last_send_attempt_at);
		if (updates.last_send_error_code !== undefined)
			push("last_send_error_code", updates.last_send_error_code);
		if (updates.last_send_error_message !== undefined)
			push("last_send_error_message", updates.last_send_error_message);
		push("updated_at", nowIso());

		params.push(artifactId);
		this.db
			.prepare(
				`UPDATE draft_artifacts SET ${sets.join(", ")} WHERE artifact_id = ?`,
			)
			.run(...params);
		return this.getDraftArtifact(artifactId);
	}

	createReviewItem(artifactId: string): ReviewItem {
		const reviewId = randomUUID();
		this.db
			.prepare(
				`INSERT INTO review_items (review_id, artifact_id, kind, state, created_at) VALUES (?, ?, 'draft_review', 'pending', ?)`,
			)
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

	getLatestReviewItemForArtifact(artifactId: string): ReviewItem | null {
		const row = this.db
			.prepare(
				`SELECT review_items.review_id, review_items.artifact_id, review_items.kind, review_items.state, review_items.created_at,
                review_items.opened_at, review_items.resolved_at, draft_artifacts.subject
         FROM review_items
         JOIN draft_artifacts ON draft_artifacts.artifact_id = review_items.artifact_id
         WHERE review_items.artifact_id = ?
         ORDER BY review_items.created_at DESC
         LIMIT 1`,
			)
			.get(artifactId) as Record<string, unknown> | undefined;
		return row ? this.mapReview(row) : null;
	}

	markReviewOpened(reviewId: string): ReviewItem | null {
		const now = nowIso();
		this.db
			.prepare(
				`UPDATE review_items SET state = 'opened', opened_at = ?, resolved_at = NULL WHERE review_id = ? AND state = 'pending'`,
			)
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
			.prepare(
				`SELECT * FROM approval_requests ${whereClause} ORDER BY created_at DESC LIMIT ?`,
			)
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
		if (updates.approved_at !== undefined)
			push("approved_at", updates.approved_at);
		if (updates.approved_by_client !== undefined)
			push("approved_by_client", updates.approved_by_client);
		if (updates.approved_by_actor !== undefined)
			push("approved_by_actor", updates.approved_by_actor);
		if (updates.rejected_at !== undefined)
			push("rejected_at", updates.rejected_at);
		if (updates.rejected_by_client !== undefined)
			push("rejected_by_client", updates.rejected_by_client);
		if (updates.rejected_by_actor !== undefined)
			push("rejected_by_actor", updates.rejected_by_actor);
		if (updates.decision_note !== undefined)
			push("decision_note", updates.decision_note);
		if (updates.send_note !== undefined) push("send_note", updates.send_note);
		if (updates.confirmation_digest !== undefined)
			push("confirmation_digest", updates.confirmation_digest);
		if (updates.confirmation_expires_at !== undefined)
			push("confirmation_expires_at", updates.confirmation_expires_at);
		if (updates.last_error_code !== undefined)
			push("last_error_code", updates.last_error_code);
		if (updates.last_error_message !== undefined)
			push("last_error_message", updates.last_error_message);
		if (updates.draft_digest !== undefined)
			push("draft_digest", updates.draft_digest);
		push("updated_at", nowIso());
		params.push(approvalId);

		this.db
			.prepare(
				`UPDATE approval_requests SET ${sets.join(", ")} WHERE approval_id = ?`,
			)
			.run(...params);
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
			.run(nowIso(), approvalId, expectedDigest, notExpiredAfter) as {
			changes?: number;
		};
		return Number(result.changes ?? 0) > 0;
	}

	countApprovalStates(): Record<ApprovalRequestState, number> {
		const rows = this.db
			.prepare(
				`SELECT state, COUNT(*) AS count FROM approval_requests GROUP BY state`,
			)
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
		const row = this.db
			.prepare(`SELECT * FROM send_windows WHERE window_id = ?`)
			.get(windowId) as Record<string, unknown> | undefined;
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
		if (updates.disabled_at !== undefined)
			push("disabled_at", updates.disabled_at);
		if (updates.disabled_by_client !== undefined)
			push("disabled_by_client", updates.disabled_by_client);
		if (updates.disabled_by_actor !== undefined)
			push("disabled_by_actor", updates.disabled_by_actor);
		if (updates.disable_reason !== undefined)
			push("disable_reason", updates.disable_reason);
		if (updates.expires_at !== undefined)
			push("expires_at", updates.expires_at);
		push("updated_at", nowIso());
		params.push(windowId);
		this.db
			.prepare(`UPDATE send_windows SET ${sets.join(", ")} WHERE window_id = ?`)
			.run(...params);
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
		const row = this.db
			.prepare(`SELECT * FROM tasks WHERE task_id = ?`)
			.get(taskId) as Record<string, unknown> | undefined;
		return row ? this.mapTask(row) : null;
	}

	listTasks(
		filter: {
			state?: TaskState | undefined;
			activeOnly?: boolean | undefined;
			dueBefore?: string | undefined;
			overdueBefore?: string | undefined;
			limit?: number | undefined;
		} = {},
	): TaskItem[] {
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
			clauses.push(
				`due_at IS NOT NULL AND due_at <= ? AND state IN ('pending', 'in_progress')`,
			);
			params.push(filter.dueBefore);
		}
		if (filter.overdueBefore) {
			clauses.push(
				`due_at IS NOT NULL AND due_at < ? AND state IN ('pending', 'in_progress')`,
			);
			params.push(filter.overdueBefore);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const limitClause = filter.limit
			? `LIMIT ${Math.max(1, Math.floor(filter.limit))}`
			: "";
		const rows = this.db
			.prepare(
				`SELECT * FROM tasks ${whereClause} ORDER BY updated_at DESC ${limitClause}`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapTask(row));
	}

	pruneTasks(states: TaskState[], olderThanIso: string): number {
		if (states.length === 0) {
			return 0;
		}
		const placeholders = states.map(() => "?").join(", ");
		const result = this.db
			.prepare(
				`DELETE FROM tasks WHERE state IN (${placeholders}) AND updated_at <= ?`,
			)
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
		if (updates.decision_note !== undefined)
			push("decision_note", updates.decision_note);
		if (updates.completed_at !== undefined)
			push("completed_at", updates.completed_at);
		if (updates.canceled_at !== undefined)
			push("canceled_at", updates.canceled_at);
		if (updates.scheduled_calendar_event_id !== undefined) {
			push("scheduled_calendar_event_id", updates.scheduled_calendar_event_id);
		}
		if (updates.source_planning_recommendation_id !== undefined) {
			push(
				"source_planning_recommendation_id",
				updates.source_planning_recommendation_id,
			);
		}
		if (updates.source_thread_id !== undefined) {
			push("source_thread_id", updates.source_thread_id);
		}
		if (updates.source_calendar_event_id !== undefined) {
			push("source_calendar_event_id", updates.source_calendar_event_id);
		}
		push("updated_at", nowIso());
		params.push(taskId);

		this.db
			.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE task_id = ?`)
			.run(...params);
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
			? (this.db
					.prepare(
						`SELECT COUNT(*) AS count
             FROM tasks
             WHERE scheduled_calendar_event_id IS NOT NULL
               AND state IN ('pending', 'in_progress')`,
					)
					.get() as { count: number })
			: (this.db
					.prepare(
						`SELECT COUNT(*) AS count FROM tasks WHERE scheduled_calendar_event_id IS NOT NULL`,
					)
					.get() as { count: number });
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

	listTaskSuggestions(
		filter: {
			status?: TaskSuggestionStatus | undefined;
			limit?: number | undefined;
		} = {},
	): TaskSuggestion[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (filter.status) {
			clauses.push(`status = ?`);
			params.push(filter.status);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const limitClause = filter.limit
			? `LIMIT ${Math.max(1, Math.floor(filter.limit))}`
			: "";
		const rows = this.db
			.prepare(
				`SELECT * FROM task_suggestions ${whereClause} ORDER BY updated_at DESC ${limitClause}`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapTaskSuggestion(row));
	}

	pruneTaskSuggestions(
		statuses: TaskSuggestionStatus[],
		olderThanIso: string,
	): number {
		if (statuses.length === 0) {
			return 0;
		}
		const placeholders = statuses.map(() => "?").join(", ");
		const result = this.db
			.prepare(
				`DELETE FROM task_suggestions WHERE status IN (${placeholders}) AND updated_at <= ?`,
			)
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
		if (updates.accepted_task_id !== undefined)
			push("accepted_task_id", updates.accepted_task_id);
		if (updates.decision_note !== undefined)
			push("decision_note", updates.decision_note);
		if (updates.resolved_at !== undefined)
			push("resolved_at", updates.resolved_at);
		push("updated_at", nowIso());
		params.push(suggestionId);
		this.db
			.prepare(
				`UPDATE task_suggestions SET ${sets.join(", ")} WHERE suggestion_id = ?`,
			)
			.run(...params);
		return this.getTaskSuggestion(suggestionId);
	}

	countTaskSuggestionStates(): Record<TaskSuggestionStatus, number> {
		const rows = this.db
			.prepare(
				`SELECT status, COUNT(*) AS count FROM task_suggestions GROUP BY status`,
			)
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
			first_action_type?:
				| PlanningRecommendationFirstActionType
				| null
				| undefined;
			closed_at?: string | null | undefined;
			close_reason_code?:
				| PlanningRecommendationCloseReasonCode
				| null
				| undefined;
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

	getPlanningRecommendation(
		recommendationId: string,
	): PlanningRecommendation | null {
		const row = this.db
			.prepare(
				`SELECT * FROM planning_recommendations WHERE recommendation_id = ?`,
			)
			.get(recommendationId) as Record<string, unknown> | undefined;
		return row ? this.mapPlanningRecommendation(row) : null;
	}

	getLatestPlanningRecommendationByDedupeKey(
		dedupeKey: string,
	): PlanningRecommendation | null {
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

	listPlanningRecommendations(
		filter: PlanningRecommendationFilter = {},
	): PlanningRecommendation[] {
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
		const limitClause = filter.limit
			? `LIMIT ${Math.max(1, Math.floor(filter.limit))}`
			: "";
		const rows = this.db
			.prepare(
				`SELECT * FROM planning_recommendations ${whereClause} ORDER BY rank_score DESC, updated_at DESC ${limitClause}`,
			)
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
			first_action_type?:
				| PlanningRecommendationFirstActionType
				| null
				| undefined;
			closed_at?: string | null | undefined;
			close_reason_code?:
				| PlanningRecommendationCloseReasonCode
				| null
				| undefined;
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
		if (updates.source_task_id !== undefined)
			push("source_task_id", updates.source_task_id);
		if (updates.source_thread_id !== undefined)
			push("source_thread_id", updates.source_thread_id);
		if (updates.source_calendar_event_id !== undefined)
			push("source_calendar_event_id", updates.source_calendar_event_id);
		if (updates.proposed_calendar_id !== undefined)
			push("proposed_calendar_id", updates.proposed_calendar_id);
		if (updates.proposed_start_at !== undefined)
			push("proposed_start_at", updates.proposed_start_at);
		if (updates.proposed_end_at !== undefined)
			push("proposed_end_at", updates.proposed_end_at);
		if (updates.proposed_title !== undefined)
			push("proposed_title", updates.proposed_title);
		if (updates.proposed_notes !== undefined)
			push("proposed_notes", updates.proposed_notes);
		if (updates.reason_code !== undefined)
			push("reason_code", updates.reason_code);
		if (updates.reason_summary !== undefined)
			push("reason_summary", updates.reason_summary);
		if (updates.source_fingerprint !== undefined)
			push("source_fingerprint", updates.source_fingerprint);
		if (updates.rank_score !== undefined)
			push("rank_score", updates.rank_score);
		if (updates.rank_reason !== undefined)
			push("rank_reason", updates.rank_reason);
		if (updates.ranking_version !== undefined)
			push("ranking_version", updates.ranking_version);
		if (updates.group_key !== undefined) push("group_key", updates.group_key);
		if (updates.group_summary !== undefined)
			push("group_summary", updates.group_summary);
		if (updates.source_last_seen_at !== undefined)
			push("source_last_seen_at", updates.source_last_seen_at);
		if (updates.first_action_at !== undefined)
			push("first_action_at", updates.first_action_at);
		if (updates.first_action_type !== undefined)
			push("first_action_type", updates.first_action_type);
		if (updates.closed_at !== undefined) push("closed_at", updates.closed_at);
		if (updates.close_reason_code !== undefined)
			push("close_reason_code", updates.close_reason_code);
		if (updates.closed_by_client !== undefined)
			push("closed_by_client", updates.closed_by_client);
		if (updates.closed_by_actor !== undefined)
			push("closed_by_actor", updates.closed_by_actor);
		if (updates.outcome_state !== undefined)
			push("outcome_state", updates.outcome_state);
		if (updates.outcome_recorded_at !== undefined)
			push("outcome_recorded_at", updates.outcome_recorded_at);
		if (updates.outcome_source !== undefined)
			push("outcome_source", updates.outcome_source);
		if (updates.outcome_summary !== undefined)
			push("outcome_summary", updates.outcome_summary);
		if (updates.slot_state !== undefined)
			push("slot_state", updates.slot_state);
		if (updates.slot_state_reason !== undefined)
			push("slot_state_reason", updates.slot_state_reason);
		if (updates.slot_reason !== undefined)
			push("slot_reason", updates.slot_reason);
		if (updates.trigger_signals !== undefined)
			push("trigger_signals_json", toJson(updates.trigger_signals ?? []));
		if (updates.suppressed_signals !== undefined)
			push("suppressed_signals_json", toJson(updates.suppressed_signals ?? []));
		if (updates.replan_count !== undefined)
			push("replan_count", updates.replan_count);
		if (updates.last_replanned_at !== undefined)
			push("last_replanned_at", updates.last_replanned_at);
		if (updates.decision_reason_code !== undefined)
			push("decision_reason_code", updates.decision_reason_code);
		if (updates.decision_note !== undefined)
			push("decision_note", updates.decision_note);
		if (updates.snoozed_until !== undefined)
			push("snoozed_until", updates.snoozed_until);
		if (updates.applied_task_id !== undefined)
			push("applied_task_id", updates.applied_task_id);
		if (updates.applied_calendar_event_id !== undefined)
			push("applied_calendar_event_id", updates.applied_calendar_event_id);
		if (updates.last_error_code !== undefined)
			push("last_error_code", updates.last_error_code);
		if (updates.last_error_message !== undefined)
			push("last_error_message", updates.last_error_message);
		if (updates.resolved_at !== undefined)
			push("resolved_at", updates.resolved_at);
		push("updated_at", nowIso());
		params.push(recommendationId);
		this.db
			.prepare(
				`UPDATE planning_recommendations SET ${sets.join(", ")} WHERE recommendation_id = ?`,
			)
			.run(...params);
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
			.prepare(
				`SELECT * FROM planning_hygiene_policy_proposals ORDER BY updated_at DESC`,
			)
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
		const existing = this.getPlanningHygienePolicyProposal(
			input.group_key,
			input.kind,
			input.source,
		);
		const now = nowIso();
		const proposalId = existing?.proposal_id ?? randomUUID();
		const createdAt = existing?.created_at ?? now;
		const createdByClient = existing?.created_by_client ?? identity.client_id;
		const createdByActor =
			existing?.created_by_actor ?? identity.requested_by ?? null;
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
		return this.getPlanningHygienePolicyProposal(
			input.group_key,
			input.kind,
			input.source,
		)!;
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
			proposal_status_snapshot?:
				| PlanningHygienePolicyProposalStatus
				| null
				| undefined;
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

	getPlanningHygienePolicyGovernanceEvent(
		governanceEventId: string,
	): PlanningHygienePolicyGovernanceEvent | null {
		const row = this.db
			.prepare(
				`SELECT * FROM planning_hygiene_policy_governance_events WHERE governance_event_id = ?`,
			)
			.get(governanceEventId) as Record<string, unknown> | undefined;
		return row ? this.mapPlanningHygienePolicyGovernanceEvent(row) : null;
	}

	listPlanningHygienePolicyGovernanceEvents(): PlanningHygienePolicyGovernanceEvent[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM planning_hygiene_policy_governance_events ORDER BY recorded_at DESC`,
			)
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
			.prepare(
				`DELETE FROM planning_hygiene_policy_governance_events WHERE ${clauses.join(" AND ")}`,
			)
			.run(...params) as { changes?: number };
		return Number(result.changes ?? 0);
	}

	countPlanningRecommendationStates(): Record<
		PlanningRecommendationStatus,
		number
	> {
		const rows = this.db
			.prepare(
				`SELECT status, COUNT(*) AS count FROM planning_recommendations GROUP BY status`,
			)
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

	countPlanningRecommendationOutcomeStates(): Record<
		PlanningRecommendationOutcomeState,
		number
	> {
		const rows = this.db
			.prepare(
				`SELECT outcome_state, COUNT(*) AS count FROM planning_recommendations GROUP BY outcome_state`,
			)
			.all() as Array<{
			outcome_state: PlanningRecommendationOutcomeState;
			count: number;
		}>;
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

	countPlanningRecommendationSlotStates(): Record<
		PlanningRecommendationSlotState,
		number
	> {
		const rows = this.db
			.prepare(
				`SELECT slot_state, COUNT(*) AS count FROM planning_recommendations GROUP BY slot_state`,
			)
			.all() as Array<{
			slot_state: PlanningRecommendationSlotState;
			count: number;
		}>;
		const counts: Record<PlanningRecommendationSlotState, number> = {
			ready: 0,
			needs_manual_scheduling: 0,
		};
		for (const row of rows) {
			counts[row.slot_state] = Number(row.count);
		}
		return counts;
	}

	getGithubSyncState(): GithubSyncState | null {
		const row = this.db
			.prepare(
				`SELECT * FROM github_sync_state WHERE provider = 'github' LIMIT 1`,
			)
			.get() as Record<string, unknown> | undefined;
		return row ? this.mapGithubSyncState(row) : null;
	}

	upsertGithubSyncState(updates: {
		status?: GithubSyncStatus;
		last_synced_at?: string | null;
		last_error_code?: string | null;
		last_error_message?: string | null;
		last_sync_duration_ms?: number | null;
		repositories_scanned_count?: number | null;
		pull_requests_refreshed_count?: number | null;
	}): GithubSyncState {
		const existing = this.getGithubSyncState();
		const now = nowIso();
		if (!existing) {
			this.db
				.prepare(
					`INSERT INTO github_sync_state (
            provider, status, last_synced_at, last_error_code, last_error_message, last_sync_duration_ms,
            repositories_scanned_count, pull_requests_refreshed_count, updated_at
          ) VALUES ('github', ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					updates.status ?? "idle",
					updates.last_synced_at ?? null,
					updates.last_error_code ?? null,
					updates.last_error_message ?? null,
					updates.last_sync_duration_ms ?? null,
					updates.repositories_scanned_count ?? null,
					updates.pull_requests_refreshed_count ?? null,
					now,
				);
			return this.getGithubSyncState()!;
		}
		const sets: string[] = [];
		const params: SQLInputValue[] = [];
		const push = (column: string, value: SQLInputValue) => {
			sets.push(`${column} = ?`);
			params.push(value);
		};
		if (updates.status !== undefined) push("status", updates.status);
		if (updates.last_synced_at !== undefined)
			push("last_synced_at", updates.last_synced_at);
		if (updates.last_error_code !== undefined)
			push("last_error_code", updates.last_error_code);
		if (updates.last_error_message !== undefined)
			push("last_error_message", updates.last_error_message);
		if (updates.last_sync_duration_ms !== undefined)
			push("last_sync_duration_ms", updates.last_sync_duration_ms);
		if (updates.repositories_scanned_count !== undefined) {
			push("repositories_scanned_count", updates.repositories_scanned_count);
		}
		if (updates.pull_requests_refreshed_count !== undefined) {
			push(
				"pull_requests_refreshed_count",
				updates.pull_requests_refreshed_count,
			);
		}
		push("updated_at", now);
		this.db
			.prepare(
				`UPDATE github_sync_state SET ${sets.join(", ")} WHERE provider = 'github'`,
			)
			.run(...params);
		return this.getGithubSyncState()!;
	}

	replaceGithubPullRequests(pullRequests: GithubPullRequest[]): void {
		this.db.exec("BEGIN");
		try {
			this.db.prepare(`DELETE FROM github_pull_requests`).run();
			const insert = this.db.prepare(
				`INSERT INTO github_pull_requests (
          pr_key, repository, owner, repo, number, title, html_url, author_login, is_draft, state, created_at, updated_at,
          requested_reviewers_json, head_sha, check_state, review_state, mergeable_state, is_review_requested,
          is_authored_by_viewer, attention_kind, attention_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			);
			for (const pullRequest of pullRequests) {
				insert.run(
					pullRequest.pr_key,
					pullRequest.repository,
					pullRequest.owner,
					pullRequest.repo,
					pullRequest.number,
					pullRequest.title,
					pullRequest.html_url,
					pullRequest.author_login,
					pullRequest.is_draft ? 1 : 0,
					pullRequest.state,
					pullRequest.created_at,
					pullRequest.updated_at,
					toJson(pullRequest.requested_reviewers),
					pullRequest.head_sha,
					pullRequest.check_state,
					pullRequest.review_state,
					pullRequest.mergeable_state ?? null,
					pullRequest.is_review_requested ? 1 : 0,
					pullRequest.is_authored_by_viewer ? 1 : 0,
					pullRequest.attention_kind ?? null,
					pullRequest.attention_summary ?? null,
				);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	listGithubPullRequests(
		filter: {
			attention_only?: boolean;
			attention_kind?: GithubPullRequest["attention_kind"];
		} = {},
	): GithubPullRequest[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (filter.attention_only) {
			clauses.push(`attention_kind IS NOT NULL`);
		}
		if (filter.attention_kind) {
			clauses.push(`attention_kind = ?`);
			params.push(filter.attention_kind);
		}
		const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM github_pull_requests ${where} ORDER BY updated_at DESC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapGithubPullRequest(row));
	}

	getGithubPullRequest(prKey: string): GithubPullRequest | null {
		const row = this.db
			.prepare(`SELECT * FROM github_pull_requests WHERE pr_key = ?`)
			.get(prKey) as Record<string, unknown> | undefined;
		return row ? this.mapGithubPullRequest(row) : null;
	}

	getDriveSyncState(): DriveSyncState | null {
		const row = this.db
			.prepare(`SELECT * FROM drive_sync_state WHERE provider = 'google_drive'`)
			.get() as Record<string, unknown> | undefined;
		return row ? this.mapDriveSyncState(row) : null;
	}

	upsertDriveSyncState(updates: {
		status?: DriveSyncStatus;
		last_synced_at?: string | null;
		last_error_code?: string | null;
		last_error_message?: string | null;
		last_sync_duration_ms?: number | null;
		files_indexed_count?: number | null;
		docs_indexed_count?: number | null;
		sheets_indexed_count?: number | null;
	}): DriveSyncState {
		const existing = this.getDriveSyncState();
		const now = nowIso();
		if (!existing) {
			this.db
				.prepare(
					`INSERT INTO drive_sync_state (
            provider, status, last_synced_at, last_error_code, last_error_message, last_sync_duration_ms,
            files_indexed_count, docs_indexed_count, sheets_indexed_count, updated_at
          ) VALUES ('google_drive', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					updates.status ?? "idle",
					updates.last_synced_at ?? null,
					updates.last_error_code ?? null,
					updates.last_error_message ?? null,
					updates.last_sync_duration_ms ?? null,
					updates.files_indexed_count ?? null,
					updates.docs_indexed_count ?? null,
					updates.sheets_indexed_count ?? null,
					now,
				);
			return this.getDriveSyncState()!;
		}
		const sets: string[] = [];
		const params: SQLInputValue[] = [];
		const push = (column: string, value: SQLInputValue) => {
			sets.push(`${column} = ?`);
			params.push(value);
		};
		if (updates.status !== undefined) push("status", updates.status);
		if (updates.last_synced_at !== undefined)
			push("last_synced_at", updates.last_synced_at);
		if (updates.last_error_code !== undefined)
			push("last_error_code", updates.last_error_code);
		if (updates.last_error_message !== undefined)
			push("last_error_message", updates.last_error_message);
		if (updates.last_sync_duration_ms !== undefined)
			push("last_sync_duration_ms", updates.last_sync_duration_ms);
		if (updates.files_indexed_count !== undefined)
			push("files_indexed_count", updates.files_indexed_count);
		if (updates.docs_indexed_count !== undefined)
			push("docs_indexed_count", updates.docs_indexed_count);
		if (updates.sheets_indexed_count !== undefined)
			push("sheets_indexed_count", updates.sheets_indexed_count);
		push("updated_at", now);
		this.db
			.prepare(
				`UPDATE drive_sync_state SET ${sets.join(", ")} WHERE provider = 'google_drive'`,
			)
			.run(...params);
		return this.getDriveSyncState()!;
	}

	replaceDriveFiles(files: DriveFileRecord[]): void {
		this.db.exec("BEGIN");
		try {
			this.db.prepare(`DELETE FROM drive_files`).run();
			const insert = this.db.prepare(
				`INSERT INTO drive_files (
          file_id, name, mime_type, web_view_link, icon_link, parents_json, scope_source,
          drive_modified_time, created_time, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			);
			for (const file of files) {
				insert.run(
					file.file_id,
					file.name,
					file.mime_type,
					file.web_view_link ?? null,
					file.icon_link ?? null,
					toJson(file.parents),
					file.scope_source,
					file.drive_modified_time ?? null,
					file.created_time ?? null,
					file.updated_at,
					file.synced_at,
				);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	listDriveFiles(): DriveFileRecord[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM drive_files ORDER BY COALESCE(drive_modified_time, updated_at) DESC, name ASC`,
			)
			.all() as Record<string, unknown>[];
		return rows.map((row) => this.mapDriveFileRecord(row));
	}

	getDriveFile(fileId: string): DriveFileRecord | null {
		const row = this.db
			.prepare(`SELECT * FROM drive_files WHERE file_id = ?`)
			.get(fileId) as Record<string, unknown> | undefined;
		return row ? this.mapDriveFileRecord(row) : null;
	}

	replaceDriveDocs(docs: DriveDocRecord[]): void {
		this.db.exec("BEGIN");
		try {
			this.db.prepare(`DELETE FROM drive_docs`).run();
			const insert = this.db.prepare(
				`INSERT INTO drive_docs (
          file_id, title, mime_type, web_view_link, snippet, text_content, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			);
			for (const doc of docs) {
				insert.run(
					doc.file_id,
					doc.title,
					doc.mime_type,
					doc.web_view_link ?? null,
					doc.snippet ?? null,
					doc.text_content,
					doc.updated_at,
					doc.synced_at,
				);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	getDriveDoc(fileId: string): DriveDocRecord | null {
		const row = this.db
			.prepare(`SELECT * FROM drive_docs WHERE file_id = ?`)
			.get(fileId) as Record<string, unknown> | undefined;
		return row ? this.mapDriveDocRecord(row) : null;
	}

	listDriveDocs(): DriveDocRecord[] {
		const rows = this.db
			.prepare(`SELECT * FROM drive_docs ORDER BY updated_at DESC, title ASC`)
			.all() as Record<string, unknown>[];
		return rows.map((row) => this.mapDriveDocRecord(row));
	}

	replaceDriveSheets(sheets: DriveSheetRecord[]): void {
		this.db.exec("BEGIN");
		try {
			this.db.prepare(`DELETE FROM drive_sheets`).run();
			const insert = this.db.prepare(
				`INSERT INTO drive_sheets (
          file_id, title, mime_type, web_view_link, tab_names_json, header_preview_json, cell_preview_json,
          snippet, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			);
			for (const sheet of sheets) {
				insert.run(
					sheet.file_id,
					sheet.title,
					sheet.mime_type,
					sheet.web_view_link ?? null,
					toJson(sheet.tab_names),
					toJson(sheet.header_preview),
					toJson(sheet.cell_preview),
					sheet.snippet ?? null,
					sheet.updated_at,
					sheet.synced_at,
				);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	getDriveSheet(fileId: string): DriveSheetRecord | null {
		const row = this.db
			.prepare(`SELECT * FROM drive_sheets WHERE file_id = ?`)
			.get(fileId) as Record<string, unknown> | undefined;
		return row ? this.mapDriveSheetRecord(row) : null;
	}

	listDriveSheets(): DriveSheetRecord[] {
		const rows = this.db
			.prepare(`SELECT * FROM drive_sheets ORDER BY updated_at DESC, title ASC`)
			.all() as Record<string, unknown>[];
		return rows.map((row) => this.mapDriveSheetRecord(row));
	}

	replaceDriveLinkProvenance(items: DriveLinkProvenance[]): void {
		this.db.exec("BEGIN");
		try {
			this.db.prepare(`DELETE FROM drive_link_provenance`).run();
			const insert = this.db.prepare(
				`INSERT INTO drive_link_provenance (
          source_type, source_id, file_id, match_type, matched_url, discovered_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
			);
			for (const item of items) {
				insert.run(
					item.source_type,
					item.source_id,
					item.file_id,
					item.match_type,
					item.matched_url ?? null,
					item.discovered_at,
				);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	listDriveLinkProvenance(
		sourceType?: DriveLinkProvenance["source_type"],
		sourceId?: string,
	): DriveLinkProvenance[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (sourceType) {
			clauses.push(`source_type = ?`);
			params.push(sourceType);
		}
		if (sourceId) {
			clauses.push(`source_id = ?`);
			params.push(sourceId);
		}
		const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM drive_link_provenance ${where} ORDER BY discovered_at DESC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapDriveLinkProvenance(row));
	}

	upsertMeetingPrepPacket(
		packet: MeetingPrepPacketRecord,
	): MeetingPrepPacketRecord {
		const now = nowIso();
		this.db
			.prepare(
				`INSERT INTO meeting_prep_packets (
          event_id, summary, why_now, score_band, signals_json, meeting_json, agenda_json, prep_checklist_json,
          open_questions_json, related_docs_json, related_files_json, related_threads_json, related_tasks_json,
          related_recommendations_json, next_commands_json, generated_at, updated_at,
          autopilot_run_id, autopilot_profile, autopilot_trigger, autopilot_prepared_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          summary = excluded.summary,
          why_now = excluded.why_now,
          score_band = excluded.score_band,
          signals_json = excluded.signals_json,
          meeting_json = excluded.meeting_json,
          agenda_json = excluded.agenda_json,
          prep_checklist_json = excluded.prep_checklist_json,
          open_questions_json = excluded.open_questions_json,
          related_docs_json = excluded.related_docs_json,
          related_files_json = excluded.related_files_json,
          related_threads_json = excluded.related_threads_json,
          related_tasks_json = excluded.related_tasks_json,
          related_recommendations_json = excluded.related_recommendations_json,
          next_commands_json = excluded.next_commands_json,
          generated_at = excluded.generated_at,
          updated_at = excluded.updated_at,
          autopilot_run_id = excluded.autopilot_run_id,
          autopilot_profile = excluded.autopilot_profile,
          autopilot_trigger = excluded.autopilot_trigger,
          autopilot_prepared_at = excluded.autopilot_prepared_at`,
			)
			.run(
				packet.event_id,
				packet.summary,
				packet.why_now,
				packet.score_band,
				toJson(packet.signals),
				toJson(packet.meeting),
				toJson(packet.agenda),
				toJson(packet.prep_checklist),
				toJson(packet.open_questions),
				toJson(packet.related_docs),
				toJson(packet.related_files),
				toJson(packet.related_threads),
				toJson(packet.related_tasks),
				toJson(packet.related_recommendations),
				toJson(packet.next_commands),
				packet.generated_at,
				packet.updated_at || now,
				packet.autopilot_run_id ?? null,
				packet.autopilot_profile ?? null,
				packet.autopilot_trigger ?? null,
				packet.autopilot_prepared_at ?? null,
			);
		return this.getMeetingPrepPacket(packet.event_id)!;
	}

	getMeetingPrepPacket(eventId: string): MeetingPrepPacketRecord | null {
		const row = this.db
			.prepare(`SELECT * FROM meeting_prep_packets WHERE event_id = ?`)
			.get(eventId) as Record<string, unknown> | undefined;
		return row ? this.mapMeetingPrepPacketRecord(row) : null;
	}

	listMeetingPrepPackets(): MeetingPrepPacketRecord[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM meeting_prep_packets ORDER BY generated_at DESC, event_id ASC`,
			)
			.all() as Record<string, unknown>[];
		return rows.map((row) => this.mapMeetingPrepPacketRecord(row));
	}

	deleteMeetingPrepPacket(eventId: string): void {
		this.db
			.prepare(`DELETE FROM meeting_prep_packets WHERE event_id = ?`)
			.run(eventId);
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
		if (updates.last_synced_at !== undefined)
			push("last_synced_at", updates.last_synced_at);
		if (updates.last_seeded_at !== undefined)
			push("last_seeded_at", updates.last_seeded_at);
		if (updates.last_error_code !== undefined)
			push("last_error_code", updates.last_error_code);
		if (updates.last_error_message !== undefined)
			push("last_error_message", updates.last_error_message);
		if (updates.last_sync_duration_ms !== undefined)
			push("last_sync_duration_ms", updates.last_sync_duration_ms);
		if (updates.calendars_refreshed_count !== undefined) {
			push("calendars_refreshed_count", updates.calendars_refreshed_count);
		}
		if (updates.events_refreshed_count !== undefined)
			push("events_refreshed_count", updates.events_refreshed_count);
		push("provider", provider);
		push("updated_at", now);
		params.push(account);
		this.db
			.prepare(
				`UPDATE calendar_sync_state SET ${sets.join(", ")} WHERE account = ?`,
			)
			.run(...params);
		return this.getCalendarSyncState(account)!;
	}

	replaceCalendarSources(
		account: string,
		provider: CalendarProvider,
		sources: CalendarSource[],
		syncedAt: string,
	): void {
		this.db.exec("BEGIN");
		try {
			this.db
				.prepare(
					`DELETE FROM calendar_sources WHERE account = ? AND provider = ?`,
				)
				.run(account, provider);
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
			? (this.db
					.prepare(
						`SELECT * FROM calendar_sources WHERE account = ? ORDER BY is_primary DESC, title ASC`,
					)
					.all(account) as Record<string, unknown>[])
			: (this.db
					.prepare(
						`SELECT * FROM calendar_sources ORDER BY is_primary DESC, title ASC`,
					)
					.all() as Record<string, unknown>[]);
		return rows.map((row) => this.mapCalendarSource(row));
	}

	listOwnedCalendarSources(account?: string): CalendarSource[] {
		const rows = account
			? (this.db
					.prepare(
						`SELECT * FROM calendar_sources
             WHERE account = ? AND access_role = 'owner'
             ORDER BY is_primary DESC, title ASC`,
					)
					.all(account) as Record<string, unknown>[])
			: (this.db
					.prepare(
						`SELECT * FROM calendar_sources
             WHERE access_role = 'owner'
             ORDER BY is_primary DESC, title ASC`,
					)
					.all() as Record<string, unknown>[]);
		return rows.map((row) => this.mapCalendarSource(row));
	}

	countOwnedCalendarSources(account?: string): number {
		const row = account
			? (this.db
					.prepare(
						`SELECT COUNT(*) AS count FROM calendar_sources WHERE account = ? AND access_role = 'owner'`,
					)
					.get(account) as { count: number })
			: (this.db
					.prepare(
						`SELECT COUNT(*) AS count FROM calendar_sources WHERE access_role = 'owner'`,
					)
					.get() as { count: number });
		return Number(row.count ?? 0);
	}

	countCalendarSources(account?: string): number {
		const row = account
			? (this.db
					.prepare(
						`SELECT COUNT(*) AS count FROM calendar_sources WHERE account = ?`,
					)
					.get(account) as {
					count: number;
				})
			: (this.db
					.prepare(`SELECT COUNT(*) AS count FROM calendar_sources`)
					.get() as { count: number });
		return Number(row.count ?? 0);
	}

	replaceCalendarEvents(
		account: string,
		provider: CalendarProvider,
		events: CalendarEvent[],
		syncedAt: string,
	): void {
		this.db.exec("BEGIN");
		try {
			this.db
				.prepare(
					`DELETE FROM calendar_events WHERE account = ? AND provider = ?`,
				)
				.run(account, provider);
			const insert = this.db.prepare(
				`INSERT INTO calendar_events (
          event_id, provider_event_id, calendar_id, provider, account, i_cal_uid, etag, summary, location, notes,
          html_link, status, event_type, visibility, transparency, start_at, end_at, is_all_day, is_busy,
          recurring_event_id, organizer_email, self_response_status, attendee_count, attendees_json, source_task_id,
          created_by_personal_ops, last_write_at, last_write_by_client, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
					event.attendees ? JSON.stringify(event.attendees) : null,
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

	listCalendarEvents(
		options: {
			account?: string;
			calendar_id?: string;
			starts_before?: string;
			ends_after?: string;
			limit?: number;
		} = {},
	): CalendarEvent[] {
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
		const limit = options.limit
			? `LIMIT ${Math.max(1, Math.floor(options.limit))}`
			: "";
		const rows = this.db
			.prepare(
				`SELECT * FROM calendar_events ${where} ORDER BY start_at ASC ${limit}`,
			)
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
			? (this.db
					.prepare(
						`SELECT COUNT(*) AS count FROM calendar_events WHERE account = ?`,
					)
					.get(account) as {
					count: number;
				})
			: (this.db
					.prepare(`SELECT COUNT(*) AS count FROM calendar_events`)
					.get() as { count: number });
		return Number(row.count ?? 0);
	}

	countPersonalOpsCalendarEvents(account?: string): number {
		const row = account
			? (this.db
					.prepare(
						`SELECT COUNT(*) AS count
             FROM calendar_events
             WHERE account = ? AND created_by_personal_ops = 1 AND status != 'cancelled'`,
					)
					.get(account) as { count: number })
			: (this.db
					.prepare(
						`SELECT COUNT(*) AS count FROM calendar_events WHERE created_by_personal_ops = 1 AND status != 'cancelled'`,
					)
					.get() as { count: number });
		return Number(row.count ?? 0);
	}

	upsertCalendarEvent(event: CalendarEvent): CalendarEvent {
		this.db
			.prepare(
				`INSERT INTO calendar_events (
          event_id, provider_event_id, calendar_id, provider, account, i_cal_uid, etag, summary, location, notes,
          html_link, status, event_type, visibility, transparency, start_at, end_at, is_all_day, is_busy,
          recurring_event_id, organizer_email, self_response_status, attendee_count, attendees_json, source_task_id,
          created_by_personal_ops, last_write_at, last_write_by_client, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          attendees_json = excluded.attendees_json,
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
				event.attendees ? JSON.stringify(event.attendees) : null,
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
		this.db
			.prepare(`DELETE FROM calendar_events WHERE event_id = ?`)
			.run(eventId);
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
		if (updates.last_history_id !== undefined)
			push("last_history_id", updates.last_history_id);
		if (updates.last_synced_at !== undefined)
			push("last_synced_at", updates.last_synced_at);
		if (updates.last_seeded_at !== undefined)
			push("last_seeded_at", updates.last_seeded_at);
		if (updates.last_sync_duration_ms !== undefined)
			push("last_sync_duration_ms", updates.last_sync_duration_ms);
		if (updates.last_sync_refreshed_count !== undefined) {
			push("last_sync_refreshed_count", updates.last_sync_refreshed_count);
		}
		if (updates.last_sync_deleted_count !== undefined)
			push("last_sync_deleted_count", updates.last_sync_deleted_count);
		if (updates.last_error_code !== undefined)
			push("last_error_code", updates.last_error_code);
		if (updates.last_error_message !== undefined)
			push("last_error_message", updates.last_error_message);
		push("provider", provider);
		push("updated_at", now);
		params.push(mailbox);
		this.db
			.prepare(
				`UPDATE mail_sync_state SET ${sets.join(", ")} WHERE mailbox = ?`,
			)
			.run(...params);
		return this.getMailSyncState(mailbox)!;
	}

	upsertMailMessage(
		mailbox: string,
		message: GmailMessageMetadata,
		syncedAt: string,
	): MailMessage {
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

	deleteMailMessage(
		mailbox: string,
		messageId: string,
		syncedAt: string,
	): void {
		const existing = this.getMailMessage(messageId);
		this.db
			.prepare(`DELETE FROM mail_messages WHERE message_id = ? AND mailbox = ?`)
			.run(messageId, mailbox);
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
			.prepare(
				`SELECT * FROM mail_threads ORDER BY last_message_at DESC LIMIT ?`,
			)
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
			.prepare(
				`SELECT * FROM mail_messages WHERE thread_id = ? ORDER BY CAST(internal_date AS INTEGER) DESC`,
			)
			.all(threadId) as Record<string, unknown>[];
		return rows.map((row) => this.mapMailMessage(row));
	}

	listMailMessagesByParticipant(email: string, limit: number): MailMessage[] {
		const pattern = `%${email}%`;
		const rows = this.db
			.prepare(
				`SELECT * FROM mail_messages
         WHERE from_header LIKE ? OR to_header LIKE ?
         ORDER BY CAST(internal_date AS INTEGER) DESC
         LIMIT ?`,
			)
			.all(pattern, pattern, Math.max(1, Math.floor(limit))) as Record<
			string,
			unknown
		>[];
		return rows.map((row) => this.mapMailMessage(row));
	}

	countOpenThreadsByParticipant(email: string): number {
		const pattern = `%${email}%`;
		const row = this.db
			.prepare(
				`SELECT COUNT(DISTINCT m.thread_id) AS count
         FROM mail_messages m
         WHERE (m.from_header LIKE ? OR m.to_header LIKE ?)
           AND m.is_inbox = 1`,
			)
			.get(pattern, pattern) as { count: number };
		return Number(row.count ?? 0);
	}

	countMeetingsWithAttendee(email: string): number {
		const pattern = `%${email}%`;
		const row = this.db
			.prepare(
				`SELECT COUNT(*) AS count FROM calendar_events
         WHERE attendees_json LIKE ? AND status != 'cancelled'`,
			)
			.get(pattern) as { count: number };
		return Number(row.count ?? 0);
	}

	countMailThreads(): number {
		const row = this.db
			.prepare(`SELECT COUNT(*) AS count FROM mail_threads`)
			.get() as { count: number };
		return Number(row.count ?? 0);
	}

	getMailActivityToday(
		mailbox: string,
		sinceMs: number,
	): { inbound_count: number; outbound_count: number } {
		const row = this.db
			.prepare(
				`SELECT
           SUM(CASE WHEN is_sent = 0 AND is_inbox = 1 THEN 1 ELSE 0 END) AS inbound_count,
           SUM(CASE WHEN is_sent = 1 THEN 1 ELSE 0 END) AS outbound_count
         FROM mail_messages
         WHERE mailbox = ? AND CAST(internal_date AS INTEGER) >= ?`,
			)
			.get(mailbox, sinceMs) as {
			inbound_count: number | null;
			outbound_count: number | null;
		};
		return {
			inbound_count: Number(row.inbound_count ?? 0),
			outbound_count: Number(row.outbound_count ?? 0),
		};
	}

	listTasksCompletedSince(since: string, limit: number): TaskItem[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM tasks
         WHERE state = 'completed' AND completed_at >= ?
         ORDER BY completed_at DESC
         LIMIT ?`,
			)
			.all(since, Math.max(1, Math.floor(limit))) as Record<string, unknown>[];
		return rows.map((row) => this.mapTask(row));
	}

	clearMailboxIndex(mailbox: string): void {
		this.db.prepare(`DELETE FROM mail_messages WHERE mailbox = ?`).run(mailbox);
		this.db.prepare(`DELETE FROM mail_threads WHERE mailbox = ?`).run(mailbox);
	}

	private recomputeMailThread(
		mailbox: string,
		threadId: string,
		syncedAt: string,
	): void {
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
			this.db
				.prepare(`DELETE FROM mail_threads WHERE thread_id = ?`)
				.run(threadId);
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
			.prepare(
				`SELECT * FROM audit_events ${whereClause} ORDER BY timestamp DESC LIMIT ?`,
			)
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
		this.db.exec(`PRAGMA wal_checkpoint(FULL);`);
		return await backup(this.db, destinationFile);
	}

	hasNotification(dedupeKey: string): boolean {
		const row = this.db
			.prepare(
				`SELECT dedupe_key FROM notification_events WHERE dedupe_key = ?`,
			)
			.get(dedupeKey);
		return Boolean(row);
	}

	recordNotification(dedupeKey: string, kind: string, targetId: string): void {
		this.db
			.prepare(
				`INSERT OR IGNORE INTO notification_events (dedupe_key, kind, target_id, created_at) VALUES (?, ?, ?, ?)`,
			)
			.run(dedupeKey, kind, targetId, nowIso());
	}

	createAutopilotRun(
		trigger: AutopilotTrigger,
		requestedProfile?: AutopilotProfile,
	): AutopilotRunRecord {
		const record: AutopilotRunRecord = {
			run_id: randomUUID(),
			trigger,
			requested_profile: requestedProfile,
			started_at: nowIso(),
			outcome: "running",
		};
		this.db
			.prepare(
				`INSERT INTO autopilot_runs (
          run_id, trigger, requested_profile, started_at, completed_at, outcome, summary, error_message
        ) VALUES (?, ?, ?, ?, NULL, 'running', NULL, NULL)`,
			)
			.run(
				record.run_id,
				record.trigger,
				record.requested_profile ?? null,
				record.started_at,
			);
		return record;
	}

	completeAutopilotRun(
		runId: string,
		updates: {
			outcome: Exclude<AutopilotRunOutcome, "running">;
			summary?: string;
			error_message?: string | null;
		},
	): AutopilotRunRecord | null {
		const completedAt = nowIso();
		this.db
			.prepare(
				`UPDATE autopilot_runs
         SET completed_at = ?, outcome = ?, summary = ?, error_message = ?
         WHERE run_id = ?`,
			)
			.run(
				completedAt,
				updates.outcome,
				updates.summary ?? null,
				updates.error_message ?? null,
				runId,
			);
		return this.getAutopilotRun(runId);
	}

	getAutopilotRun(runId: string): AutopilotRunRecord | null {
		const row = this.db
			.prepare(`SELECT * FROM autopilot_runs WHERE run_id = ?`)
			.get(runId) as Record<string, unknown> | undefined;
		return row ? this.mapAutopilotRun(row) : null;
	}

	getLatestAutopilotRun(): AutopilotRunRecord | null {
		const row = this.db
			.prepare(`SELECT * FROM autopilot_runs ORDER BY started_at DESC LIMIT 1`)
			.get() as Record<string, unknown> | undefined;
		return row ? this.mapAutopilotRun(row) : null;
	}

	listAutopilotRuns(limit = 20): AutopilotRunRecord[] {
		const rows = this.db
			.prepare(`SELECT * FROM autopilot_runs ORDER BY started_at DESC LIMIT ?`)
			.all(limit) as Record<string, unknown>[];
		return rows.map((row) => this.mapAutopilotRun(row));
	}

	getAutopilotProfileState(
		profile: AutopilotProfile,
	): AutopilotProfileStateRecord | null {
		const row = this.db
			.prepare(`SELECT * FROM autopilot_profile_state WHERE profile = ?`)
			.get(profile) as Record<string, unknown> | undefined;
		return row ? this.mapAutopilotProfileState(row) : null;
	}

	listAutopilotProfileStates(): AutopilotProfileStateRecord[] {
		const rows = this.db
			.prepare(`SELECT * FROM autopilot_profile_state ORDER BY profile ASC`)
			.all() as Record<string, unknown>[];
		return rows.map((row) => this.mapAutopilotProfileState(row));
	}

	upsertAutopilotProfileState(
		profile: AutopilotProfile,
		updates: {
			state: AutopilotProfileState;
			fingerprint?: string | null;
			prepared_at?: string | null;
			stale_at?: string | null;
			next_eligible_run_at?: string | null;
			last_summary?: string | null;
			last_trigger?: AutopilotTrigger | null;
			last_run_at?: string | null;
			last_success_at?: string | null;
			last_failure_at?: string | null;
			last_run_outcome?: Exclude<AutopilotRunOutcome, "running"> | null;
			consecutive_failures?: number;
			changed_since_last_run?: boolean;
			last_run_id?: string | null;
		},
	): AutopilotProfileStateRecord {
		const existing = this.getAutopilotProfileState(profile);
		const record: AutopilotProfileStateRecord = {
			profile,
			state: updates.state,
			fingerprint: updates.fingerprint ?? existing?.fingerprint,
			prepared_at: updates.prepared_at ?? existing?.prepared_at,
			stale_at: updates.stale_at ?? existing?.stale_at,
			next_eligible_run_at:
				updates.next_eligible_run_at ?? existing?.next_eligible_run_at,
			last_summary: updates.last_summary ?? existing?.last_summary,
			last_trigger: updates.last_trigger ?? existing?.last_trigger,
			last_run_at: updates.last_run_at ?? existing?.last_run_at,
			last_success_at: updates.last_success_at ?? existing?.last_success_at,
			last_failure_at: updates.last_failure_at ?? existing?.last_failure_at,
			last_run_outcome: updates.last_run_outcome ?? existing?.last_run_outcome,
			consecutive_failures:
				updates.consecutive_failures ?? existing?.consecutive_failures ?? 0,
			changed_since_last_run:
				updates.changed_since_last_run ??
				existing?.changed_since_last_run ??
				false,
			last_run_id: updates.last_run_id ?? existing?.last_run_id,
		};
		this.db
			.prepare(
				`INSERT INTO autopilot_profile_state (
          profile, state, fingerprint, prepared_at, stale_at, next_eligible_run_at, last_summary,
          last_trigger, last_run_at, last_success_at, last_failure_at, last_run_outcome,
          consecutive_failures, changed_since_last_run, last_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile) DO UPDATE SET
          state = excluded.state,
          fingerprint = excluded.fingerprint,
          prepared_at = excluded.prepared_at,
          stale_at = excluded.stale_at,
          next_eligible_run_at = excluded.next_eligible_run_at,
          last_summary = excluded.last_summary,
          last_trigger = excluded.last_trigger,
          last_run_at = excluded.last_run_at,
          last_success_at = excluded.last_success_at,
          last_failure_at = excluded.last_failure_at,
          last_run_outcome = excluded.last_run_outcome,
          consecutive_failures = excluded.consecutive_failures,
          changed_since_last_run = excluded.changed_since_last_run,
          last_run_id = excluded.last_run_id`,
			)
			.run(
				record.profile,
				record.state,
				record.fingerprint ?? null,
				record.prepared_at ?? null,
				record.stale_at ?? null,
				record.next_eligible_run_at ?? null,
				record.last_summary ?? null,
				record.last_trigger ?? null,
				record.last_run_at ?? null,
				record.last_success_at ?? null,
				record.last_failure_at ?? null,
				record.last_run_outcome ?? null,
				record.consecutive_failures,
				record.changed_since_last_run ? 1 : 0,
				record.last_run_id ?? null,
			);
		return this.getAutopilotProfileState(profile)!;
	}

	getReviewReadModelState(): {
		model_key: string;
		refresh_state: ReviewReadModelRefreshState;
		last_refresh_started_at?: string | undefined;
		last_refresh_finished_at?: string | undefined;
		last_refresh_trigger?: string | undefined;
		last_refresh_error?: string | undefined;
		updated_at: string;
	} | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_read_model_state WHERE model_key = 'global'`,
			)
			.get() as Record<string, unknown> | undefined;
		if (!row) {
			return null;
		}
		return {
			model_key: String(row.model_key),
			refresh_state: String(row.refresh_state) as ReviewReadModelRefreshState,
			last_refresh_started_at: row.last_refresh_started_at
				? String(row.last_refresh_started_at)
				: undefined,
			last_refresh_finished_at: row.last_refresh_finished_at
				? String(row.last_refresh_finished_at)
				: undefined,
			last_refresh_trigger: row.last_refresh_trigger
				? String(row.last_refresh_trigger)
				: undefined,
			last_refresh_error: row.last_refresh_error
				? String(row.last_refresh_error)
				: undefined,
			updated_at: String(row.updated_at),
		};
	}

	upsertReviewReadModelState(input: {
		refresh_state: ReviewReadModelRefreshState;
		last_refresh_started_at?: string | null;
		last_refresh_finished_at?: string | null;
		last_refresh_trigger?: string | null;
		last_refresh_error?: string | null;
	}): {
		model_key: string;
		refresh_state: ReviewReadModelRefreshState;
		last_refresh_started_at?: string | undefined;
		last_refresh_finished_at?: string | undefined;
		last_refresh_trigger?: string | undefined;
		last_refresh_error?: string | undefined;
		updated_at: string;
	} {
		const existing = this.getReviewReadModelState();
		const now = nowIso();
		this.db
			.prepare(
				`INSERT INTO review_read_model_state (
          model_key, refresh_state, last_refresh_started_at, last_refresh_finished_at, last_refresh_trigger, last_refresh_error, updated_at
        ) VALUES ('global', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(model_key) DO UPDATE SET
          refresh_state = excluded.refresh_state,
          last_refresh_started_at = excluded.last_refresh_started_at,
          last_refresh_finished_at = excluded.last_refresh_finished_at,
          last_refresh_trigger = excluded.last_refresh_trigger,
          last_refresh_error = excluded.last_refresh_error,
          updated_at = excluded.updated_at`,
			)
			.run(
				input.refresh_state,
				input.last_refresh_started_at ??
					existing?.last_refresh_started_at ??
					null,
				input.last_refresh_finished_at ??
					existing?.last_refresh_finished_at ??
					null,
				input.last_refresh_trigger ?? existing?.last_refresh_trigger ?? null,
				input.last_refresh_error ?? existing?.last_refresh_error ?? null,
				now,
			);
		return this.getReviewReadModelState()!;
	}

	getReviewPackage(packageId: string): ReviewPackage | null {
		const row = this.db
			.prepare(`SELECT * FROM review_packages WHERE package_id = ?`)
			.get(packageId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewPackage(row) : null;
	}

	getReviewPackageRecord(packageId: string):
		| (ReviewPackage & {
				source_keys: string[];
				is_current: boolean;
				opened_at?: string | undefined;
				acted_on_at?: string | undefined;
				completed_at?: string | undefined;
				stale_unused_at?: string | undefined;
				current_cycle_reviewed: boolean;
				updated_at: string;
		  })
		| null {
		const row = this.db
			.prepare(`SELECT * FROM review_packages WHERE package_id = ?`)
			.get(packageId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewPackageRecord(row) : null;
	}

	listReviewPackages(
		options: {
			surface?: ReviewPackageSurface;
			state?: ReviewPackageState;
			include_completed?: boolean;
			current_only?: boolean;
		} = {},
	): ReviewPackage[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.surface) {
			clauses.push(`surface = ?`);
			params.push(options.surface);
		}
		if (options.current_only ?? true) {
			clauses.push(`is_current = 1`);
		}
		if (options.state) {
			clauses.push(`state = ?`);
			params.push(options.state);
		} else if (!options.include_completed) {
			clauses.push(`state != 'completed'`);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_packages ${whereClause} ORDER BY prepared_at DESC, package_id ASC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewPackage(row));
	}

	listReviewPackageRecords(
		options: {
			surface?: ReviewPackageSurface;
			include_completed?: boolean;
			current_only?: boolean;
		} = {},
	): Array<
		ReviewPackage & {
			source_keys: string[];
			is_current: boolean;
			opened_at?: string | undefined;
			acted_on_at?: string | undefined;
			completed_at?: string | undefined;
			stale_unused_at?: string | undefined;
			current_cycle_reviewed: boolean;
			updated_at: string;
		}
	> {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.surface) {
			clauses.push(`surface = ?`);
			params.push(options.surface);
		}
		if (options.current_only ?? true) {
			clauses.push(`is_current = 1`);
		}
		if (!options.include_completed) {
			clauses.push(`state != 'completed'`);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_packages ${whereClause} ORDER BY prepared_at DESC, package_id ASC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewPackageRecord(row));
	}

	markAllReviewPackagesNotCurrent(): void {
		this.db
			.prepare(
				`UPDATE review_packages SET is_current = 0, updated_at = ? WHERE is_current = 1`,
			)
			.run(nowIso());
	}

	upsertReviewPackage(
		input: ReviewPackage & {
			source_keys?: string[];
			is_current?: boolean;
			opened_at?: string | null;
			acted_on_at?: string | null;
			completed_at?: string | null;
			stale_unused_at?: string | null;
			current_cycle_reviewed?: boolean;
		},
	): ReviewPackage {
		const existing = this.getReviewPackageRecord(input.package_id);
		const now = nowIso();
		this.db
			.prepare(
				`INSERT INTO review_packages (
          package_id, surface, state, summary, why_now, score_band, signals_json, prepared_at, stale_at,
          source_fingerprint, member_ids_json, next_commands_json, items_json, source_keys_json, is_current,
          opened_at, acted_on_at, completed_at, stale_unused_at, current_cycle_reviewed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(package_id) DO UPDATE SET
          surface = excluded.surface,
          state = excluded.state,
          summary = excluded.summary,
          why_now = excluded.why_now,
          score_band = excluded.score_band,
          signals_json = excluded.signals_json,
          prepared_at = excluded.prepared_at,
          stale_at = excluded.stale_at,
          source_fingerprint = excluded.source_fingerprint,
          member_ids_json = excluded.member_ids_json,
          next_commands_json = excluded.next_commands_json,
          items_json = excluded.items_json,
          source_keys_json = excluded.source_keys_json,
          is_current = excluded.is_current,
          opened_at = COALESCE(review_packages.opened_at, excluded.opened_at),
          acted_on_at = COALESCE(review_packages.acted_on_at, excluded.acted_on_at),
          completed_at = excluded.completed_at,
          stale_unused_at = excluded.stale_unused_at,
          current_cycle_reviewed = excluded.current_cycle_reviewed,
          updated_at = excluded.updated_at`,
			)
			.run(
				input.package_id,
				input.surface,
				input.state,
				input.summary,
				input.why_now,
				input.score_band,
				toJson(input.signals),
				input.prepared_at,
				input.stale_at,
				input.source_fingerprint,
				toJson(input.member_ids),
				toJson(input.next_commands),
				toJson(input.items),
				toJson(input.source_keys ?? existing?.source_keys ?? []),
				(input.is_current ?? true) ? 1 : 0,
				input.opened_at ?? existing?.opened_at ?? null,
				input.acted_on_at ?? existing?.acted_on_at ?? null,
				input.completed_at ?? existing?.completed_at ?? null,
				input.stale_unused_at ?? existing?.stale_unused_at ?? null,
				(input.current_cycle_reviewed ??
					existing?.current_cycle_reviewed ??
					false)
					? 1
					: 0,
				existing?.prepared_at ?? now,
				now,
			);
		return this.getReviewPackage(input.package_id)!;
	}

	markReviewPackageOpened(packageId: string): ReviewPackage | null {
		this.db
			.prepare(
				`UPDATE review_packages SET opened_at = COALESCE(opened_at, ?), updated_at = ? WHERE package_id = ?`,
			)
			.run(nowIso(), nowIso(), packageId);
		return this.getReviewPackage(packageId);
	}

	markReviewPackageActedOn(packageId: string): ReviewPackage | null {
		const now = nowIso();
		this.db
			.prepare(
				`UPDATE review_packages
         SET acted_on_at = COALESCE(acted_on_at, ?), current_cycle_reviewed = 1, updated_at = ?
         WHERE package_id = ?`,
			)
			.run(now, now, packageId);
		return this.getReviewPackage(packageId);
	}

	markReviewPackageCompleted(packageId: string): ReviewPackage | null {
		const now = nowIso();
		this.db
			.prepare(
				`UPDATE review_packages
         SET state = 'completed', completed_at = COALESCE(completed_at, ?), current_cycle_reviewed = 1, updated_at = ?
         WHERE package_id = ?`,
			)
			.run(now, now, packageId);
		return this.getReviewPackage(packageId);
	}

	markReviewPackageStaleUnused(packageId: string): ReviewPackage | null {
		const now = nowIso();
		this.db
			.prepare(
				`UPDATE review_packages
         SET stale_unused_at = COALESCE(stale_unused_at, ?), updated_at = ?
         WHERE package_id = ?`,
			)
			.run(now, now, packageId);
		return this.getReviewPackage(packageId);
	}

	getReviewPackageCycle(packageCycleId: string): ReviewPackageCycle | null {
		const row = this.db
			.prepare(`SELECT * FROM review_package_cycles WHERE package_cycle_id = ?`)
			.get(packageCycleId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewPackageCycle(row) : null;
	}

	getOpenReviewPackageCycle(packageId: string): ReviewPackageCycle | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_package_cycles
         WHERE package_id = ? AND outcome = 'open'
         ORDER BY started_at DESC
         LIMIT 1`,
			)
			.get(packageId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewPackageCycle(row) : null;
	}

	getLatestReviewPackageCycleForPackage(
		packageId: string,
	): ReviewPackageCycle | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_package_cycles
         WHERE package_id = ?
         ORDER BY started_at DESC, updated_at DESC
         LIMIT 1`,
			)
			.get(packageId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewPackageCycle(row) : null;
	}

	listReviewPackageCycles(
		options: {
			surface?: ReviewPackageSurface;
			package_id?: string;
			days?: number;
			include_open?: boolean;
		} = {},
	): ReviewPackageCycle[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.surface) {
			clauses.push(`surface = ?`);
			params.push(options.surface);
		}
		if (options.package_id) {
			clauses.push(`package_id = ?`);
			params.push(options.package_id);
		}
		if (!options.include_open) {
			clauses.push(`outcome != 'open'`);
		}
		if (options.days && options.days > 0) {
			clauses.push(`started_at >= ?`);
			params.push(
				new Date(Date.now() - options.days * 24 * 60 * 60 * 1000).toISOString(),
			);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_package_cycles ${whereClause} ORDER BY started_at DESC, package_cycle_id ASC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewPackageCycle(row));
	}

	ensureOpenReviewPackageCycle(input: {
		package_id: string;
		surface: ReviewPackageSurface;
		source_fingerprint: string;
		summary: string;
		why_now: string;
		score_band: ReviewPackage["score_band"];
		member_ids: string[];
		items: ReviewPackageItem[];
		source_keys: string[];
		seen_at: string;
		opened_at?: string | null;
		acted_on_at?: string | null;
		completed_at?: string | null;
		stale_unused_at?: string | null;
	}): ReviewPackageCycle {
		const existing = this.getOpenReviewPackageCycle(input.package_id);
		const outcome: ReviewPackageCycleOutcome = input.completed_at
			? "completed"
			: input.stale_unused_at
				? "stale_unused"
				: "open";
		const latestClosed =
			!existing && outcome !== "open"
				? this.getLatestReviewPackageCycleForPackage(input.package_id)
				: null;
		const reusableClosedCycle =
			latestClosed &&
			latestClosed.outcome !== "open" &&
			latestClosed.source_fingerprint === input.source_fingerprint &&
			((outcome === "completed" && Boolean(latestClosed.completed_at)) ||
				(outcome === "stale_unused" && Boolean(latestClosed.stale_unused_at)))
				? latestClosed
				: null;
		const packageCycleId =
			existing?.package_cycle_id ??
			reusableClosedCycle?.package_cycle_id ??
			randomUUID();
		const createdAt =
			existing?.created_at ?? reusableClosedCycle?.created_at ?? input.seen_at;
		const endedAt = input.completed_at ?? input.stale_unused_at ?? null;
		this.db
			.prepare(
				`INSERT INTO review_package_cycles (
          package_cycle_id, package_id, surface, source_fingerprint, summary, why_now, score_band,
          member_ids_json, items_json, source_keys_json, started_at, last_seen_at, ended_at, outcome,
          opened_at, acted_on_at, completed_at, stale_unused_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(package_cycle_id) DO UPDATE SET
          package_id = excluded.package_id,
          surface = excluded.surface,
          source_fingerprint = excluded.source_fingerprint,
          summary = excluded.summary,
          why_now = excluded.why_now,
          score_band = excluded.score_band,
          member_ids_json = excluded.member_ids_json,
          items_json = excluded.items_json,
          source_keys_json = excluded.source_keys_json,
          last_seen_at = excluded.last_seen_at,
          ended_at = excluded.ended_at,
          outcome = excluded.outcome,
          opened_at = COALESCE(review_package_cycles.opened_at, excluded.opened_at),
          acted_on_at = COALESCE(review_package_cycles.acted_on_at, excluded.acted_on_at),
          completed_at = COALESCE(review_package_cycles.completed_at, excluded.completed_at),
          stale_unused_at = COALESCE(review_package_cycles.stale_unused_at, excluded.stale_unused_at),
          updated_at = excluded.updated_at`,
			)
			.run(
				packageCycleId,
				input.package_id,
				input.surface,
				input.source_fingerprint,
				input.summary,
				input.why_now,
				input.score_band,
				toJson(input.member_ids),
				toJson(input.items),
				toJson(input.source_keys),
				existing?.started_at ??
					reusableClosedCycle?.started_at ??
					input.seen_at,
				input.seen_at,
				endedAt,
				outcome,
				input.opened_at ??
					existing?.opened_at ??
					reusableClosedCycle?.opened_at ??
					null,
				input.acted_on_at ??
					existing?.acted_on_at ??
					reusableClosedCycle?.acted_on_at ??
					null,
				input.completed_at ??
					existing?.completed_at ??
					reusableClosedCycle?.completed_at ??
					null,
				input.stale_unused_at ??
					existing?.stale_unused_at ??
					reusableClosedCycle?.stale_unused_at ??
					null,
				createdAt,
				input.seen_at,
			);
		return this.getReviewPackageCycle(packageCycleId)!;
	}

	closeReviewPackageCycle(
		packageCycleId: string,
		input: {
			outcome: Exclude<ReviewPackageCycleOutcome, "open">;
			ended_at: string;
			opened_at?: string | null;
			acted_on_at?: string | null;
			completed_at?: string | null;
			stale_unused_at?: string | null;
		},
	): ReviewPackageCycle | null {
		const existing = this.getReviewPackageCycle(packageCycleId);
		if (!existing) {
			return null;
		}
		this.db
			.prepare(
				`UPDATE review_package_cycles
         SET outcome = ?, ended_at = COALESCE(ended_at, ?),
             opened_at = COALESCE(opened_at, ?),
             acted_on_at = COALESCE(acted_on_at, ?),
             completed_at = COALESCE(completed_at, ?),
             stale_unused_at = COALESCE(stale_unused_at, ?),
             updated_at = ?
         WHERE package_cycle_id = ?`,
			)
			.run(
				input.outcome,
				input.ended_at,
				input.opened_at ?? null,
				input.acted_on_at ?? null,
				input.completed_at ?? null,
				input.stale_unused_at ?? null,
				input.ended_at,
				packageCycleId,
			);
		return this.getReviewPackageCycle(packageCycleId);
	}

	markReviewPackageCycleOpened(
		packageId: string,
		openedAt = nowIso(),
	): ReviewPackageCycle | null {
		const cycle = this.getOpenReviewPackageCycle(packageId);
		if (!cycle) {
			return null;
		}
		this.db
			.prepare(
				`UPDATE review_package_cycles
         SET opened_at = COALESCE(opened_at, ?), updated_at = ?
         WHERE package_cycle_id = ?`,
			)
			.run(openedAt, openedAt, cycle.package_cycle_id);
		return this.getReviewPackageCycle(cycle.package_cycle_id);
	}

	markReviewPackageCycleActedOn(
		packageId: string,
		actedOnAt = nowIso(),
	): ReviewPackageCycle | null {
		const cycle = this.getOpenReviewPackageCycle(packageId);
		if (!cycle) {
			return null;
		}
		this.db
			.prepare(
				`UPDATE review_package_cycles
         SET acted_on_at = COALESCE(acted_on_at, ?), updated_at = ?
         WHERE package_cycle_id = ?`,
			)
			.run(actedOnAt, actedOnAt, cycle.package_cycle_id);
		return this.getReviewPackageCycle(cycle.package_cycle_id);
	}

	markReviewPackageCycleCompleted(
		packageId: string,
		completedAt = nowIso(),
	): ReviewPackageCycle | null {
		const cycle = this.getOpenReviewPackageCycle(packageId);
		if (!cycle) {
			return null;
		}
		return this.closeReviewPackageCycle(cycle.package_cycle_id, {
			outcome: "completed",
			ended_at: completedAt,
			opened_at: cycle.opened_at ?? null,
			acted_on_at: cycle.acted_on_at ?? null,
			completed_at: completedAt,
			stale_unused_at: cycle.stale_unused_at ?? null,
		});
	}

	markReviewPackageCycleStaleUnused(
		packageId: string,
		staleUnusedAt = nowIso(),
	): ReviewPackageCycle | null {
		const cycle = this.getOpenReviewPackageCycle(packageId);
		if (!cycle) {
			return null;
		}
		return this.closeReviewPackageCycle(cycle.package_cycle_id, {
			outcome: "stale_unused",
			ended_at: staleUnusedAt,
			opened_at: cycle.opened_at ?? null,
			acted_on_at: cycle.acted_on_at ?? null,
			completed_at: cycle.completed_at ?? null,
			stale_unused_at: staleUnusedAt,
		});
	}

	createReviewFeedbackEvent(input: {
		package_id: string;
		package_cycle_id?: string | null;
		surface: ReviewPackageSurface;
		package_item_id?: string | null;
		reason: ReviewFeedbackReason;
		note: string;
		actor?: string | null;
		client_id: string;
		source_fingerprint: string;
	}): ReviewFeedbackEvent {
		const feedbackEventId = randomUUID();
		const createdAt = nowIso();
		this.db
			.prepare(
				`INSERT INTO review_feedback_events (
          feedback_event_id, package_id, package_cycle_id, surface, package_item_id, reason, note, actor, client_id, source_fingerprint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				feedbackEventId,
				input.package_id,
				input.package_cycle_id ?? null,
				input.surface,
				input.package_item_id ?? null,
				input.reason,
				input.note,
				input.actor ?? null,
				input.client_id,
				input.source_fingerprint,
				createdAt,
			);
		return this.getReviewFeedbackEvent(feedbackEventId)!;
	}

	getReviewFeedbackEvent(feedbackEventId: string): ReviewFeedbackEvent | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_feedback_events WHERE feedback_event_id = ?`,
			)
			.get(feedbackEventId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewFeedbackEvent(row) : null;
	}

	listReviewFeedbackEvents(
		options: {
			surface?: ReviewPackageSurface;
			package_id?: string;
			source_fingerprint?: string;
			days?: number;
		} = {},
	): ReviewFeedbackEvent[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.surface) {
			clauses.push(`surface = ?`);
			params.push(options.surface);
		}
		if (options.package_id) {
			clauses.push(`package_id = ?`);
			params.push(options.package_id);
		}
		if (options.source_fingerprint) {
			clauses.push(`source_fingerprint = ?`);
			params.push(options.source_fingerprint);
		}
		if (options.days && options.days > 0) {
			clauses.push(`created_at >= ?`);
			params.push(
				new Date(Date.now() - options.days * 24 * 60 * 60 * 1000).toISOString(),
			);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_feedback_events ${whereClause} ORDER BY created_at DESC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewFeedbackEvent(row));
	}

	getLatestReviewFeedbackReason(
		packageId: string,
		sourceFingerprint: string,
		packageItemId?: string,
	): ReviewFeedbackReason | undefined {
		const row = this.db
			.prepare(
				`SELECT reason FROM review_feedback_events
         WHERE package_id = ? AND source_fingerprint = ? AND package_item_id IS ?
         ORDER BY created_at DESC
         LIMIT 1`,
			)
			.get(packageId, sourceFingerprint, packageItemId ?? null) as
			| { reason?: string }
			| undefined;
		return row?.reason
			? (String(row.reason) as ReviewFeedbackReason)
			: undefined;
	}

	getCurrentPackageFeedbackReasons(
		packageId: string,
		sourceFingerprint: string,
	): Map<string, ReviewFeedbackReason> {
		const rows = this.db
			.prepare(
				`SELECT package_item_id, reason
         FROM review_feedback_events
         WHERE package_id = ? AND source_fingerprint = ?
         ORDER BY created_at DESC`,
			)
			.all(packageId, sourceFingerprint) as Array<{
			package_item_id: string | null;
			reason: string;
		}>;
		const mapped = new Map<string, ReviewFeedbackReason>();
		for (const row of rows) {
			const key = row.package_item_id ?? "__package__";
			if (!mapped.has(key)) {
				mapped.set(key, row.reason as ReviewFeedbackReason);
			}
		}
		return mapped;
	}

	createReviewNotificationEvent(input: {
		kind: ReviewNotificationKind;
		decision: ReviewNotificationDecision;
		source: "desktop";
		surface?: ReviewPackageSurface | null;
		package_id?: string | null;
		package_cycle_id?: string | null;
		proposal_id?: string | null;
		suppression_reason?: ReviewNotificationSuppressionReason | null;
		current_count: number;
		previous_count: number;
		cooldown_minutes: number;
		client_id: string;
		actor?: string | null;
	}): ReviewNotificationEvent {
		const notificationEventId = randomUUID();
		const createdAt = nowIso();
		this.db
			.prepare(
				`INSERT INTO review_notification_events (
          notification_event_id, source, kind, decision, surface, package_id, package_cycle_id, proposal_id,
          suppression_reason, current_count, previous_count, cooldown_minutes, client_id, actor, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				notificationEventId,
				input.source,
				input.kind,
				input.decision,
				input.surface ?? null,
				input.package_id ?? null,
				input.package_cycle_id ?? null,
				input.proposal_id ?? null,
				input.suppression_reason ?? null,
				input.current_count,
				input.previous_count,
				input.cooldown_minutes,
				input.client_id,
				input.actor ?? null,
				createdAt,
			);
		return this.getReviewNotificationEvent(notificationEventId)!;
	}

	getReviewNotificationEvent(
		notificationEventId: string,
	): ReviewNotificationEvent | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_notification_events WHERE notification_event_id = ?`,
			)
			.get(notificationEventId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewNotificationEvent(row) : null;
	}

	listReviewNotificationEvents(
		options: {
			surface?: ReviewPackageSurface;
			decision?: ReviewNotificationDecision;
			days?: number;
		} = {},
	): ReviewNotificationEvent[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.surface) {
			clauses.push(`surface = ?`);
			params.push(options.surface);
		}
		if (options.decision) {
			clauses.push(`decision = ?`);
			params.push(options.decision);
		}
		if (options.days && options.days > 0) {
			clauses.push(`created_at >= ?`);
			params.push(
				new Date(Date.now() - options.days * 24 * 60 * 60 * 1000).toISOString(),
			);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_notification_events ${whereClause} ORDER BY created_at DESC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewNotificationEvent(row));
	}

	getReviewMetricSnapshot(
		snapshotDate: string,
		scopeType: ReviewMetricSnapshotScopeType,
		scopeKey: ReviewMetricSnapshotScopeKey,
	): ReviewMetricSnapshot | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_metric_snapshots
         WHERE snapshot_date = ? AND scope_type = ? AND scope_key = ?`,
			)
			.get(snapshotDate, scopeType, scopeKey) as
			| Record<string, unknown>
			| undefined;
		return row ? this.mapReviewMetricSnapshot(row) : null;
	}

	upsertReviewMetricSnapshot(input: {
		snapshot_date: string;
		scope_type: ReviewMetricSnapshotScopeType;
		scope_key: ReviewMetricSnapshotScopeKey;
		metrics: ReviewMetricSnapshotMetrics;
		generated_at?: string;
	}): ReviewMetricSnapshot {
		const generatedAt = input.generated_at ?? nowIso();
		this.db
			.prepare(
				`INSERT INTO review_metric_snapshots (
          snapshot_date, scope_type, scope_key, metrics_json, generated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(snapshot_date, scope_type, scope_key) DO UPDATE SET
          metrics_json = excluded.metrics_json,
          generated_at = excluded.generated_at`,
			)
			.run(
				input.snapshot_date,
				input.scope_type,
				input.scope_key,
				toJson(input.metrics),
				generatedAt,
			);
		return this.getReviewMetricSnapshot(
			input.snapshot_date,
			input.scope_type,
			input.scope_key,
		)!;
	}

	listReviewMetricSnapshots(
		options: {
			scope_type?: ReviewMetricSnapshotScopeType;
			scope_key?: ReviewMetricSnapshotScopeKey;
			snapshot_date_from?: string;
			snapshot_date_to?: string;
		} = {},
	): ReviewMetricSnapshot[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.scope_type) {
			clauses.push(`scope_type = ?`);
			params.push(options.scope_type);
		}
		if (options.scope_key) {
			clauses.push(`scope_key = ?`);
			params.push(options.scope_key);
		}
		if (options.snapshot_date_from) {
			clauses.push(`snapshot_date >= ?`);
			params.push(options.snapshot_date_from);
		}
		if (options.snapshot_date_to) {
			clauses.push(`snapshot_date <= ?`);
			params.push(options.snapshot_date_to);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_metric_snapshots ${whereClause}
         ORDER BY snapshot_date ASC, scope_type ASC, scope_key ASC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewMetricSnapshot(row));
	}

	getReviewCalibrationTarget(
		scopeType: ReviewCalibrationTargetScopeType,
		scopeKey: ReviewCalibrationTargetScopeKey,
	): ReviewCalibrationTarget | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_calibration_targets
         WHERE scope_type = ? AND scope_key = ?`,
			)
			.get(scopeType, scopeKey) as Record<string, unknown> | undefined;
		return row ? this.mapReviewCalibrationTarget(row) : null;
	}

	listReviewCalibrationTargets(
		options: {
			scope_type?: ReviewCalibrationTargetScopeType;
			scope_key?: ReviewCalibrationTargetScopeKey;
		} = {},
	): ReviewCalibrationTarget[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.scope_type) {
			clauses.push(`scope_type = ?`);
			params.push(options.scope_type);
		}
		if (options.scope_key) {
			clauses.push(`scope_key = ?`);
			params.push(options.scope_key);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_calibration_targets ${whereClause} ORDER BY scope_type ASC, scope_key ASC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewCalibrationTarget(row));
	}

	upsertReviewCalibrationTarget(input: {
		scope_type: ReviewCalibrationTargetScopeType;
		scope_key: ReviewCalibrationTargetScopeKey;
		min_acted_on_rate: number;
		max_stale_unused_rate: number;
		max_negative_feedback_rate: number;
		min_notification_action_conversion_rate: number;
		max_notifications_per_7d: number;
		created_at?: string;
		updated_by_client: string;
		updated_by_actor?: string | null;
		updated_at?: string;
	}): ReviewCalibrationTarget {
		const createdAt =
			input.created_at ??
			this.getReviewCalibrationTarget(input.scope_type, input.scope_key)
				?.created_at ??
			nowIso();
		const updatedAt = input.updated_at ?? nowIso();
		this.db
			.prepare(
				`INSERT INTO review_calibration_targets (
          scope_type, scope_key, min_acted_on_rate, max_stale_unused_rate, max_negative_feedback_rate,
          min_notification_action_conversion_rate, max_notifications_per_7d, created_at, updated_at, updated_by_client, updated_by_actor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope_type, scope_key) DO UPDATE SET
          min_acted_on_rate = excluded.min_acted_on_rate,
          max_stale_unused_rate = excluded.max_stale_unused_rate,
          max_negative_feedback_rate = excluded.max_negative_feedback_rate,
          min_notification_action_conversion_rate = excluded.min_notification_action_conversion_rate,
          max_notifications_per_7d = excluded.max_notifications_per_7d,
          updated_at = excluded.updated_at,
          updated_by_client = excluded.updated_by_client,
          updated_by_actor = excluded.updated_by_actor`,
			)
			.run(
				input.scope_type,
				input.scope_key,
				input.min_acted_on_rate,
				input.max_stale_unused_rate,
				input.max_negative_feedback_rate,
				input.min_notification_action_conversion_rate,
				input.max_notifications_per_7d,
				createdAt,
				updatedAt,
				input.updated_by_client,
				input.updated_by_actor ?? null,
			);
		return this.getReviewCalibrationTarget(input.scope_type, input.scope_key)!;
	}

	deleteReviewCalibrationTarget(
		scopeType: ReviewCalibrationTargetScopeType,
		scopeKey: ReviewCalibrationTargetScopeKey,
	): boolean {
		const result = this.db
			.prepare(
				`DELETE FROM review_calibration_targets
         WHERE scope_type = ? AND scope_key = ?`,
			)
			.run(scopeType, scopeKey);
		return result.changes > 0;
	}

	upsertReviewTuningProposal(
		input: ReviewTuningProposal & { evidence_json: string },
	): ReviewTuningProposal {
		this.db
			.prepare(
				`INSERT INTO review_tuning_proposals (
          proposal_id, proposal_family_key, evidence_fingerprint, proposal_kind, surface, scope_key, summary, evidence_window_days,
          evidence_count, positive_count, negative_count, unused_stale_count, status, evidence_json, created_at, updated_at,
          expires_at, approved_at, approved_by_client, approved_by_actor, approved_note,
          dismissed_at, dismissed_by_client, dismissed_by_actor, dismissed_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id) DO UPDATE SET
          proposal_family_key = excluded.proposal_family_key,
          evidence_fingerprint = excluded.evidence_fingerprint,
          proposal_kind = excluded.proposal_kind,
          surface = excluded.surface,
          scope_key = excluded.scope_key,
          summary = excluded.summary,
          evidence_window_days = excluded.evidence_window_days,
          evidence_count = excluded.evidence_count,
          positive_count = excluded.positive_count,
          negative_count = excluded.negative_count,
          unused_stale_count = excluded.unused_stale_count,
          status = excluded.status,
          evidence_json = excluded.evidence_json,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          approved_at = excluded.approved_at,
          approved_by_client = excluded.approved_by_client,
          approved_by_actor = excluded.approved_by_actor,
          approved_note = excluded.approved_note,
          dismissed_at = excluded.dismissed_at,
          dismissed_by_client = excluded.dismissed_by_client,
          dismissed_by_actor = excluded.dismissed_by_actor,
          dismissed_note = excluded.dismissed_note`,
			)
			.run(
				input.proposal_id,
				input.proposal_family_key,
				input.evidence_fingerprint,
				input.proposal_kind,
				input.surface,
				input.scope_key,
				input.summary,
				input.evidence_window_days,
				input.evidence_count,
				input.positive_count,
				input.negative_count,
				input.unused_stale_count,
				input.status,
				input.evidence_json,
				input.created_at,
				input.updated_at,
				input.expires_at,
				input.approved_at ?? null,
				input.approved_by_client ?? null,
				input.approved_by_actor ?? null,
				input.approved_note ?? null,
				input.dismissed_at ?? null,
				input.dismissed_by_client ?? null,
				input.dismissed_by_actor ?? null,
				input.dismissed_note ?? null,
			);
		return this.getReviewTuningProposal(input.proposal_id)!;
	}

	getReviewTuningProposal(proposalId: string): ReviewTuningProposal | null {
		const row = this.db
			.prepare(`SELECT * FROM review_tuning_proposals WHERE proposal_id = ?`)
			.get(proposalId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewTuningProposal(row) : null;
	}

	getReviewTuningProposalRecord(
		proposalId: string,
	): (ReviewTuningProposal & { evidence_json: string }) | null {
		const row = this.db
			.prepare(`SELECT * FROM review_tuning_proposals WHERE proposal_id = ?`)
			.get(proposalId) as Record<string, unknown> | undefined;
		return row
			? {
					...this.mapReviewTuningProposal(row),
					evidence_json: String(row.evidence_json ?? "{}"),
				}
			: null;
	}

	listReviewTuningProposals(
		options: {
			status?: ReviewTuningProposalStatus;
			include_expired?: boolean;
		} = {},
	): ReviewTuningProposal[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.status) {
			clauses.push(`status = ?`);
			params.push(options.status);
		} else if (!options.include_expired) {
			clauses.push(`status != 'expired'`);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_tuning_proposals ${whereClause} ORDER BY updated_at DESC, proposal_id ASC`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewTuningProposal(row));
	}

	getLatestReviewTuningProposalByFamily(
		proposalFamilyKey: string,
	): ReviewTuningProposal | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_tuning_proposals
         WHERE proposal_family_key = ?
         ORDER BY created_at DESC
         LIMIT 1`,
			)
			.get(proposalFamilyKey) as Record<string, unknown> | undefined;
		return row ? this.mapReviewTuningProposal(row) : null;
	}

	upsertReviewTuningState(input: {
		proposal_id: string;
		proposal_kind: ReviewTuningProposalKind;
		surface: ReviewPackageSurface;
		scope_key: string;
		value_json: string;
		status: "active" | "dismissed" | "expired";
		starts_at: string;
		expires_at: string;
		note?: string | null;
	}): void {
		this.db
			.prepare(
				`INSERT INTO review_tuning_state (
          proposal_id, proposal_kind, surface, scope_key, value_json, status, starts_at, expires_at, note, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id) DO UPDATE SET
          proposal_kind = excluded.proposal_kind,
          surface = excluded.surface,
          scope_key = excluded.scope_key,
          value_json = excluded.value_json,
          status = excluded.status,
          starts_at = excluded.starts_at,
          expires_at = excluded.expires_at,
          note = excluded.note,
          updated_at = excluded.updated_at`,
			)
			.run(
				input.proposal_id,
				input.proposal_kind,
				input.surface,
				input.scope_key,
				input.value_json,
				input.status,
				input.starts_at,
				input.expires_at,
				input.note ?? null,
				nowIso(),
			);
	}

	listReviewTuningState(
		options: { status?: "active" | "dismissed" | "expired" } = {},
	): Array<{
		proposal_id: string;
		proposal_kind: ReviewTuningProposalKind;
		surface: ReviewPackageSurface;
		scope_key: string;
		value_json: string;
		status: "active" | "dismissed" | "expired";
		starts_at: string;
		expires_at: string;
		note?: string | undefined;
		updated_at: string;
	}> {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.status) {
			clauses.push(`status = ?`);
			params.push(options.status);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		return this.db
			.prepare(
				`SELECT * FROM review_tuning_state ${whereClause} ORDER BY updated_at DESC`,
			)
			.all(...params)
			.map((row: any) => ({
				proposal_id: String(row.proposal_id),
				proposal_kind: String(row.proposal_kind) as ReviewTuningProposalKind,
				surface: String(row.surface) as ReviewPackageSurface,
				scope_key: String(row.scope_key),
				value_json: String(row.value_json),
				status: String(row.status) as "active" | "dismissed" | "expired",
				starts_at: String(row.starts_at),
				expires_at: String(row.expires_at),
				note: row.note ? String(row.note) : undefined,
				updated_at: String(row.updated_at),
			}));
	}

	createRepairExecution(input: {
		step_id: RepairStepId;
		started_at: string;
		completed_at: string;
		requested_by_client: string;
		requested_by_actor?: string | null;
		trigger_source: RepairExecutionTriggerSource;
		before_first_step_id?: RepairStepId | null;
		after_first_step_id?: RepairStepId | null;
		outcome: RepairExecutionOutcome;
		resolved_target_step: boolean;
		message: string;
	}): RepairExecutionRecord {
		const stored: RepairExecutionRecord = {
			execution_id: randomUUID(),
			step_id: input.step_id,
			started_at: input.started_at,
			completed_at: input.completed_at,
			requested_by_client: input.requested_by_client,
			requested_by_actor: input.requested_by_actor ?? undefined,
			trigger_source: input.trigger_source,
			before_first_step_id: input.before_first_step_id ?? undefined,
			after_first_step_id: input.after_first_step_id ?? undefined,
			outcome: input.outcome,
			resolved_target_step: input.resolved_target_step,
			message: input.message,
		};
		this.db
			.prepare(
				`INSERT INTO repair_executions (
          execution_id, step_id, started_at, completed_at, requested_by_client, requested_by_actor,
          trigger_source, before_first_step_id, after_first_step_id, outcome, resolved_target_step, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				stored.execution_id,
				stored.step_id,
				stored.started_at,
				stored.completed_at,
				stored.requested_by_client,
				stored.requested_by_actor ?? null,
				stored.trigger_source,
				stored.before_first_step_id ?? null,
				stored.after_first_step_id ?? null,
				stored.outcome,
				stored.resolved_target_step ? 1 : 0,
				stored.message,
			);
		return stored;
	}

	getLatestRepairExecution(): RepairExecutionRecord | null {
		const row = this.db
			.prepare(
				`SELECT * FROM repair_executions ORDER BY completed_at DESC LIMIT 1`,
			)
			.get() as Record<string, unknown> | undefined;
		return row ? this.mapRepairExecution(row) : null;
	}

	getLatestRepairExecutionForStep(
		stepId: RepairStepId,
	): RepairExecutionRecord | null {
		const row = this.db
			.prepare(
				`SELECT * FROM repair_executions WHERE step_id = ? ORDER BY completed_at DESC LIMIT 1`,
			)
			.get(stepId) as Record<string, unknown> | undefined;
		return row ? this.mapRepairExecution(row) : null;
	}

	listRepairExecutions(
		options: { step_id?: RepairStepId; days?: number; limit?: number } = {},
	): RepairExecutionRecord[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.step_id) {
			clauses.push(`step_id = ?`);
			params.push(options.step_id);
		}
		if (options.days && options.days > 0) {
			clauses.push(`completed_at >= ?`);
			params.push(
				new Date(Date.now() - options.days * 24 * 60 * 60 * 1000).toISOString(),
			);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const limitClause = options.limit
			? ` LIMIT ${Math.max(1, options.limit)}`
			: "";
		const rows = this.db
			.prepare(
				`SELECT * FROM repair_executions ${whereClause} ORDER BY completed_at DESC${limitClause}`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapRepairExecution(row));
	}

	upsertMaintenanceCommitment(
		input: MaintenanceCommitmentRecord,
	): MaintenanceCommitmentRecord {
		const stored: MaintenanceCommitmentRecord = {
			...input,
			bundle_step_ids: [...input.bundle_step_ids],
		};
		this.db
			.prepare(
				`INSERT INTO maintenance_commitments (
          commitment_id, step_id, created_at, updated_at, last_presented_at, last_placement,
          bundle_step_ids_json, state, defer_count, last_deferred_at, fulfilled_at, fulfilled_by_execution_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(commitment_id) DO UPDATE SET
          step_id = excluded.step_id,
          updated_at = excluded.updated_at,
          last_presented_at = excluded.last_presented_at,
          last_placement = excluded.last_placement,
          bundle_step_ids_json = excluded.bundle_step_ids_json,
          state = excluded.state,
          defer_count = excluded.defer_count,
          last_deferred_at = excluded.last_deferred_at,
          fulfilled_at = excluded.fulfilled_at,
          fulfilled_by_execution_id = excluded.fulfilled_by_execution_id`,
			)
			.run(
				stored.commitment_id,
				stored.step_id,
				stored.created_at,
				stored.updated_at,
				stored.last_presented_at,
				stored.last_placement,
				toJson(stored.bundle_step_ids),
				stored.state,
				stored.defer_count,
				stored.last_deferred_at ?? null,
				stored.fulfilled_at ?? null,
				stored.fulfilled_by_execution_id ?? null,
			);
		return stored;
	}

	listMaintenanceCommitments(
		options: {
			step_id?: RepairStepId;
			state?: MaintenanceCommitmentState;
			states?: MaintenanceCommitmentState[];
			limit?: number;
		} = {},
	): MaintenanceCommitmentRecord[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.step_id) {
			clauses.push(`step_id = ?`);
			params.push(options.step_id);
		}
		if (options.state) {
			clauses.push(`state = ?`);
			params.push(options.state);
		} else if (options.states && options.states.length > 0) {
			clauses.push(`state IN (${options.states.map(() => `?`).join(", ")})`);
			params.push(...options.states);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const limitClause = options.limit
			? ` LIMIT ${Math.max(1, options.limit)}`
			: "";
		const rows = this.db
			.prepare(
				`SELECT * FROM maintenance_commitments ${whereClause} ORDER BY updated_at DESC${limitClause}`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapMaintenanceCommitment(row));
	}

	upsertSurfacedWorkOutcome(
		input: SurfacedWorkOutcomeRecord,
	): SurfacedWorkOutcomeRecord {
		const stored: SurfacedWorkOutcomeRecord = { ...input };
		this.db
			.prepare(
				`INSERT INTO surfaced_work_outcomes (
          outcome_id, surface, surfaced_state, target_type, target_id, assistant_action_id,
          planning_recommendation_id, repair_step_id, maintenance_step_id, summary_snapshot,
          command_snapshot, surfaced_at, last_seen_at, state, evidence_kind, acted_at, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(outcome_id) DO UPDATE SET
          surface = excluded.surface,
          surfaced_state = excluded.surfaced_state,
          target_type = excluded.target_type,
          target_id = excluded.target_id,
          assistant_action_id = excluded.assistant_action_id,
          planning_recommendation_id = excluded.planning_recommendation_id,
          repair_step_id = excluded.repair_step_id,
          maintenance_step_id = excluded.maintenance_step_id,
          summary_snapshot = excluded.summary_snapshot,
          command_snapshot = excluded.command_snapshot,
          surfaced_at = excluded.surfaced_at,
          last_seen_at = excluded.last_seen_at,
          state = excluded.state,
          evidence_kind = excluded.evidence_kind,
          acted_at = excluded.acted_at,
          closed_at = excluded.closed_at`,
			)
			.run(
				stored.outcome_id,
				stored.surface,
				stored.surfaced_state,
				stored.target_type,
				stored.target_id,
				stored.assistant_action_id ?? null,
				stored.planning_recommendation_id ?? null,
				stored.repair_step_id ?? null,
				stored.maintenance_step_id ?? null,
				stored.summary_snapshot,
				stored.command_snapshot ?? null,
				stored.surfaced_at,
				stored.last_seen_at,
				stored.state,
				stored.evidence_kind ?? null,
				stored.acted_at ?? null,
				stored.closed_at ?? null,
			);
		return stored;
	}

	listSurfacedWorkOutcomes(
		options: {
			surface?: SurfacedWorkSurface;
			state?: SurfacedWorkOutcomeState;
			states?: SurfacedWorkOutcomeState[];
			target_type?: string;
			target_id?: string;
			assistant_action_id?: string;
			planning_recommendation_id?: string;
			repair_step_id?: RepairStepId;
			maintenance_step_id?: RepairStepId;
			since?: string;
			limit?: number;
		} = {},
	): SurfacedWorkOutcomeRecord[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.surface) {
			clauses.push(`surface = ?`);
			params.push(options.surface);
		}
		if (options.state) {
			clauses.push(`state = ?`);
			params.push(options.state);
		} else if (options.states && options.states.length > 0) {
			clauses.push(`state IN (${options.states.map(() => `?`).join(", ")})`);
			params.push(...options.states);
		}
		if (options.target_type) {
			clauses.push(`target_type = ?`);
			params.push(options.target_type);
		}
		if (options.target_id) {
			clauses.push(`target_id = ?`);
			params.push(options.target_id);
		}
		if (options.assistant_action_id) {
			clauses.push(`assistant_action_id = ?`);
			params.push(options.assistant_action_id);
		}
		if (options.planning_recommendation_id) {
			clauses.push(`planning_recommendation_id = ?`);
			params.push(options.planning_recommendation_id);
		}
		if (options.repair_step_id) {
			clauses.push(`repair_step_id = ?`);
			params.push(options.repair_step_id);
		}
		if (options.maintenance_step_id) {
			clauses.push(`maintenance_step_id = ?`);
			params.push(options.maintenance_step_id);
		}
		if (options.since) {
			clauses.push(`COALESCE(closed_at, surfaced_at) >= ?`);
			params.push(options.since);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const limitClause = options.limit
			? ` LIMIT ${Math.max(1, options.limit)}`
			: "";
		const rows = this.db
			.prepare(
				`SELECT * FROM surfaced_work_outcomes ${whereClause} ORDER BY surfaced_at DESC${limitClause}`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapSurfacedWorkOutcome(row));
	}

	getOpenSurfacedWorkOutcome(
		surface: SurfacedWorkSurface,
		target_type: string,
		target_id: string,
	): SurfacedWorkOutcomeRecord | null {
		const row = this.db
			.prepare(
				`SELECT * FROM surfaced_work_outcomes
         WHERE surface = ? AND target_type = ? AND target_id = ? AND state = 'open'
         ORDER BY surfaced_at DESC
         LIMIT 1`,
			)
			.get(surface, target_type, target_id) as
			| Record<string, unknown>
			| undefined;
		return row ? this.mapSurfacedWorkOutcome(row) : null;
	}

	closeSurfacedWorkOutcome(
		outcomeId: string,
		input: {
			state: Exclude<SurfacedWorkOutcomeState, "open">;
			evidence_kind: SurfacedWorkEvidenceKind;
			acted_at?: string | null;
			closed_at: string;
		},
	): SurfacedWorkOutcomeRecord | null {
		this.db
			.prepare(
				`UPDATE surfaced_work_outcomes
         SET state = ?, evidence_kind = ?, acted_at = COALESCE(acted_at, ?), closed_at = ?
         WHERE outcome_id = ? AND state = 'open'`,
			)
			.run(
				input.state,
				input.evidence_kind,
				input.acted_at ?? null,
				input.closed_at,
				outcomeId,
			);
		const row = this.db
			.prepare(`SELECT * FROM surfaced_work_outcomes WHERE outcome_id = ?`)
			.get(outcomeId) as Record<string, unknown> | undefined;
		return row ? this.mapSurfacedWorkOutcome(row) : null;
	}

	upsertReviewApprovalFlowOutcome(
		input: ReviewApprovalFlowOutcomeRecord,
	): ReviewApprovalFlowOutcomeRecord {
		const stored: ReviewApprovalFlowOutcomeRecord = { ...input };
		this.db
			.prepare(
				`INSERT INTO review_approval_flow_outcomes (
          outcome_id, surfaced_state, target_type, target_id, review_id, approval_id,
          outbound_group_id, assistant_action_id, summary_snapshot, command_snapshot,
          surfaced_at, last_seen_at, state, evidence_kind, acted_at, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(outcome_id) DO UPDATE SET
          surfaced_state = excluded.surfaced_state,
          target_type = excluded.target_type,
          target_id = excluded.target_id,
          review_id = excluded.review_id,
          approval_id = excluded.approval_id,
          outbound_group_id = excluded.outbound_group_id,
          assistant_action_id = excluded.assistant_action_id,
          summary_snapshot = excluded.summary_snapshot,
          command_snapshot = excluded.command_snapshot,
          surfaced_at = excluded.surfaced_at,
          last_seen_at = excluded.last_seen_at,
          state = excluded.state,
          evidence_kind = excluded.evidence_kind,
          acted_at = excluded.acted_at,
          closed_at = excluded.closed_at`,
			)
			.run(
				stored.outcome_id,
				stored.surfaced_state,
				stored.target_type,
				stored.target_id,
				stored.review_id ?? null,
				stored.approval_id ?? null,
				stored.outbound_group_id ?? null,
				stored.assistant_action_id ?? null,
				stored.summary_snapshot,
				stored.command_snapshot ?? null,
				stored.surfaced_at,
				stored.last_seen_at,
				stored.state,
				stored.evidence_kind ?? null,
				stored.acted_at ?? null,
				stored.closed_at ?? null,
			);
		return stored;
	}

	listReviewApprovalFlowOutcomes(
		options: {
			state?: ReviewApprovalFlowOutcomeState;
			states?: ReviewApprovalFlowOutcomeState[];
			target_type?: string;
			target_id?: string;
			review_id?: string;
			approval_id?: string;
			outbound_group_id?: string;
			assistant_action_id?: string;
			since?: string;
			limit?: number;
		} = {},
	): ReviewApprovalFlowOutcomeRecord[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.state) {
			clauses.push(`state = ?`);
			params.push(options.state);
		} else if (options.states && options.states.length > 0) {
			clauses.push(`state IN (${options.states.map(() => `?`).join(", ")})`);
			params.push(...options.states);
		}
		if (options.target_type) {
			clauses.push(`target_type = ?`);
			params.push(options.target_type);
		}
		if (options.target_id) {
			clauses.push(`target_id = ?`);
			params.push(options.target_id);
		}
		if (options.review_id) {
			clauses.push(`review_id = ?`);
			params.push(options.review_id);
		}
		if (options.approval_id) {
			clauses.push(`approval_id = ?`);
			params.push(options.approval_id);
		}
		if (options.outbound_group_id) {
			clauses.push(`outbound_group_id = ?`);
			params.push(options.outbound_group_id);
		}
		if (options.assistant_action_id) {
			clauses.push(`assistant_action_id = ?`);
			params.push(options.assistant_action_id);
		}
		if (options.since) {
			clauses.push(`COALESCE(closed_at, surfaced_at) >= ?`);
			params.push(options.since);
		}
		const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		const limitClause = options.limit
			? ` LIMIT ${Math.max(1, options.limit)}`
			: "";
		const rows = this.db
			.prepare(
				`SELECT * FROM review_approval_flow_outcomes ${whereClause} ORDER BY surfaced_at DESC${limitClause}`,
			)
			.all(...params) as Record<string, unknown>[];
		return rows.map((row) => this.mapReviewApprovalFlowOutcome(row));
	}

	getOpenReviewApprovalFlowOutcome(
		target_type: string,
		target_id: string,
	): ReviewApprovalFlowOutcomeRecord | null {
		const row = this.db
			.prepare(
				`SELECT * FROM review_approval_flow_outcomes
         WHERE target_type = ? AND target_id = ? AND state = 'open'
         ORDER BY surfaced_at DESC
         LIMIT 1`,
			)
			.get(target_type, target_id) as Record<string, unknown> | undefined;
		return row ? this.mapReviewApprovalFlowOutcome(row) : null;
	}

	closeReviewApprovalFlowOutcome(
		outcomeId: string,
		input: {
			state: Exclude<ReviewApprovalFlowOutcomeState, "open">;
			evidence_kind: ReviewApprovalFlowEvidenceKind;
			acted_at?: string | null;
			closed_at: string;
		},
	): ReviewApprovalFlowOutcomeRecord | null {
		this.db
			.prepare(
				`UPDATE review_approval_flow_outcomes
         SET state = ?, evidence_kind = ?, acted_at = COALESCE(acted_at, ?), closed_at = ?
         WHERE outcome_id = ? AND state = 'open'`,
			)
			.run(
				input.state,
				input.evidence_kind,
				input.acted_at ?? null,
				input.closed_at,
				outcomeId,
			);
		const row = this.db
			.prepare(
				`SELECT * FROM review_approval_flow_outcomes WHERE outcome_id = ?`,
			)
			.get(outcomeId) as Record<string, unknown> | undefined;
		return row ? this.mapReviewApprovalFlowOutcome(row) : null;
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
        assistant_generated INTEGER NOT NULL DEFAULT 0,
        assistant_source_thread_id TEXT,
        assistant_group_id TEXT,
        assistant_why_now TEXT,
        autopilot_run_id TEXT,
        autopilot_profile TEXT,
        autopilot_trigger TEXT,
        autopilot_prepared_at TEXT,
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

      CREATE TABLE IF NOT EXISTS meeting_prep_packets (
        event_id TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        why_now TEXT NOT NULL,
        score_band TEXT NOT NULL,
        signals_json TEXT NOT NULL,
        meeting_json TEXT NOT NULL,
        agenda_json TEXT NOT NULL,
        prep_checklist_json TEXT NOT NULL,
        open_questions_json TEXT NOT NULL,
        related_docs_json TEXT NOT NULL,
        related_files_json TEXT NOT NULL,
        related_threads_json TEXT NOT NULL,
        related_tasks_json TEXT NOT NULL,
        related_recommendations_json TEXT NOT NULL,
        next_commands_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        autopilot_run_id TEXT,
        autopilot_profile TEXT,
        autopilot_trigger TEXT,
        autopilot_prepared_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_meeting_prep_packets_generated_at
        ON meeting_prep_packets(generated_at DESC);

      CREATE TABLE IF NOT EXISTS autopilot_runs (
        run_id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        requested_profile TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        outcome TEXT,
        summary TEXT,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_autopilot_runs_started_at
        ON autopilot_runs(started_at DESC);

      CREATE TABLE IF NOT EXISTS autopilot_profile_state (
        profile TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        fingerprint TEXT,
        prepared_at TEXT,
        stale_at TEXT,
        next_eligible_run_at TEXT,
        last_summary TEXT,
        last_trigger TEXT,
        last_run_at TEXT,
        last_success_at TEXT,
        last_failure_at TEXT,
        last_run_outcome TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        changed_since_last_run INTEGER NOT NULL DEFAULT 0,
        last_run_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_autopilot_profile_state_stale_at
        ON autopilot_profile_state(stale_at ASC);

      CREATE TABLE IF NOT EXISTS github_accounts (
        provider TEXT PRIMARY KEY,
        login TEXT NOT NULL,
        keychain_service TEXT NOT NULL,
        keychain_account TEXT NOT NULL,
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        profile_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS github_sync_state (
        provider TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_synced_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        last_sync_duration_ms INTEGER,
        repositories_scanned_count INTEGER,
        pull_requests_refreshed_count INTEGER,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS github_pull_requests (
        pr_key TEXT PRIMARY KEY,
        repository TEXT NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        html_url TEXT NOT NULL,
        author_login TEXT NOT NULL,
        is_draft INTEGER NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        requested_reviewers_json TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        check_state TEXT NOT NULL,
        review_state TEXT NOT NULL,
        mergeable_state TEXT,
        is_review_requested INTEGER NOT NULL,
        is_authored_by_viewer INTEGER NOT NULL,
        attention_kind TEXT,
        attention_summary TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_github_pull_requests_updated_at
        ON github_pull_requests(updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_github_pull_requests_attention_kind
        ON github_pull_requests(attention_kind, updated_at DESC);

      CREATE TABLE IF NOT EXISTS drive_sync_state (
        provider TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_synced_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        last_sync_duration_ms INTEGER,
        files_indexed_count INTEGER,
        docs_indexed_count INTEGER,
        sheets_indexed_count INTEGER,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drive_files (
        file_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        web_view_link TEXT,
        icon_link TEXT,
        parents_json TEXT NOT NULL,
        scope_source TEXT NOT NULL,
        drive_modified_time TEXT,
        created_time TEXT,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drive_docs (
        file_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        web_view_link TEXT,
        snippet TEXT,
        text_content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drive_sheets (
        file_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        web_view_link TEXT,
        tab_names_json TEXT NOT NULL,
        header_preview_json TEXT NOT NULL,
        cell_preview_json TEXT NOT NULL,
        snippet TEXT,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drive_link_provenance (
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        match_type TEXT NOT NULL,
        matched_url TEXT,
        discovered_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_drive_files_updated_at
        ON drive_files(updated_at DESC, name ASC);

      CREATE INDEX IF NOT EXISTS idx_drive_docs_updated_at
        ON drive_docs(updated_at DESC, title ASC);

      CREATE INDEX IF NOT EXISTS idx_drive_sheets_updated_at
        ON drive_sheets(updated_at DESC, title ASC);

      CREATE INDEX IF NOT EXISTS idx_drive_link_provenance_source
        ON drive_link_provenance(source_type, source_id, discovered_at DESC);

      CREATE TABLE IF NOT EXISTS review_packages (
        package_id TEXT PRIMARY KEY,
        surface TEXT NOT NULL,
        state TEXT NOT NULL,
        summary TEXT NOT NULL,
        why_now TEXT NOT NULL,
        score_band TEXT NOT NULL,
        signals_json TEXT NOT NULL,
        prepared_at TEXT NOT NULL,
        stale_at TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        member_ids_json TEXT NOT NULL,
        next_commands_json TEXT NOT NULL,
        items_json TEXT NOT NULL,
        source_keys_json TEXT NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 1,
        opened_at TEXT,
        acted_on_at TEXT,
        completed_at TEXT,
        stale_unused_at TEXT,
        current_cycle_reviewed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_packages_surface_prepared_at
        ON review_packages(surface, prepared_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_packages_stale_at
        ON review_packages(stale_at ASC);

      CREATE INDEX IF NOT EXISTS idx_review_packages_is_current_surface
        ON review_packages(is_current, surface, prepared_at DESC);

      CREATE TABLE IF NOT EXISTS review_package_cycles (
        package_cycle_id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        surface TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        summary TEXT NOT NULL,
        why_now TEXT NOT NULL,
        score_band TEXT NOT NULL,
        member_ids_json TEXT NOT NULL,
        items_json TEXT NOT NULL,
        source_keys_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ended_at TEXT,
        outcome TEXT NOT NULL,
        opened_at TEXT,
        acted_on_at TEXT,
        completed_at TEXT,
        stale_unused_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_package_cycles_package_started_at
        ON review_package_cycles(package_id, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_package_cycles_surface_started_at
        ON review_package_cycles(surface, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_package_cycles_outcome_started_at
        ON review_package_cycles(outcome, started_at DESC);

      CREATE TABLE IF NOT EXISTS review_feedback_events (
        feedback_event_id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        package_cycle_id TEXT,
        surface TEXT NOT NULL,
        package_item_id TEXT,
        reason TEXT NOT NULL,
        note TEXT NOT NULL,
        actor TEXT,
        client_id TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_feedback_events_package_created_at
        ON review_feedback_events(package_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_feedback_events_cycle_created_at
        ON review_feedback_events(package_cycle_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_feedback_events_surface_created_at
        ON review_feedback_events(surface, created_at DESC);

      CREATE TABLE IF NOT EXISTS review_notification_events (
        notification_event_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        decision TEXT NOT NULL,
        surface TEXT,
        package_id TEXT,
        package_cycle_id TEXT,
        proposal_id TEXT,
        suppression_reason TEXT,
        current_count INTEGER NOT NULL,
        previous_count INTEGER NOT NULL,
        cooldown_minutes INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        actor TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_notification_events_created_at
        ON review_notification_events(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_notification_events_surface_created_at
        ON review_notification_events(surface, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_notification_events_cycle_created_at
        ON review_notification_events(package_cycle_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS review_metric_snapshots (
        snapshot_date TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (snapshot_date, scope_type, scope_key)
      );

      CREATE INDEX IF NOT EXISTS idx_review_metric_snapshots_scope_date
        ON review_metric_snapshots(scope_type, scope_key, snapshot_date DESC);

      CREATE TABLE IF NOT EXISTS review_calibration_targets (
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
        PRIMARY KEY (scope_type, scope_key)
      );

      CREATE INDEX IF NOT EXISTS idx_review_calibration_targets_scope
        ON review_calibration_targets(scope_type, scope_key);

      CREATE TABLE IF NOT EXISTS repair_executions (
        execution_id TEXT PRIMARY KEY,
        step_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        requested_by_client TEXT NOT NULL,
        requested_by_actor TEXT,
        trigger_source TEXT NOT NULL,
        before_first_step_id TEXT,
        after_first_step_id TEXT,
        outcome TEXT NOT NULL,
        resolved_target_step INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_repair_executions_completed_at
        ON repair_executions(completed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_repair_executions_step_completed_at
        ON repair_executions(step_id, completed_at DESC);

      CREATE TABLE IF NOT EXISTS maintenance_commitments (
        commitment_id TEXT PRIMARY KEY,
        step_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_presented_at TEXT NOT NULL,
        last_placement TEXT NOT NULL,
        bundle_step_ids_json TEXT NOT NULL,
        state TEXT NOT NULL,
        defer_count INTEGER NOT NULL DEFAULT 0,
        last_deferred_at TEXT,
        fulfilled_at TEXT,
        fulfilled_by_execution_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_maintenance_commitments_updated_at
        ON maintenance_commitments(updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_maintenance_commitments_step_state
        ON maintenance_commitments(step_id, state, updated_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_commitments_active_step
        ON maintenance_commitments(step_id)
        WHERE state = 'active';

      CREATE TABLE IF NOT EXISTS surfaced_work_outcomes (
        outcome_id TEXT PRIMARY KEY,
        surface TEXT NOT NULL,
        surfaced_state TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        assistant_action_id TEXT,
        planning_recommendation_id TEXT,
        repair_step_id TEXT,
        maintenance_step_id TEXT,
        summary_snapshot TEXT NOT NULL,
        command_snapshot TEXT,
        surfaced_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        state TEXT NOT NULL,
        evidence_kind TEXT,
        acted_at TEXT,
        closed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_surfaced_work_outcomes_surface_state_seen
        ON surfaced_work_outcomes(surface, state, last_seen_at DESC);

      CREATE INDEX IF NOT EXISTS idx_surfaced_work_outcomes_target
        ON surfaced_work_outcomes(target_type, target_id, surfaced_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_surfaced_work_outcomes_open_surface_target
        ON surfaced_work_outcomes(surface, target_type, target_id)
        WHERE state = 'open';

      CREATE TABLE IF NOT EXISTS review_approval_flow_outcomes (
        outcome_id TEXT PRIMARY KEY,
        surfaced_state TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        review_id TEXT,
        approval_id TEXT,
        outbound_group_id TEXT,
        assistant_action_id TEXT,
        summary_snapshot TEXT NOT NULL,
        command_snapshot TEXT,
        surfaced_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        state TEXT NOT NULL,
        evidence_kind TEXT,
        acted_at TEXT,
        closed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_review_approval_flow_outcomes_state_seen
        ON review_approval_flow_outcomes(state, last_seen_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_approval_flow_outcomes_target
        ON review_approval_flow_outcomes(target_type, target_id, surfaced_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_review_approval_flow_outcomes_open_target
        ON review_approval_flow_outcomes(target_type, target_id)
        WHERE state = 'open';

      CREATE TABLE IF NOT EXISTS review_tuning_proposals (
        proposal_id TEXT PRIMARY KEY,
        proposal_family_key TEXT NOT NULL,
        evidence_fingerprint TEXT NOT NULL,
        proposal_kind TEXT NOT NULL,
        surface TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        summary TEXT NOT NULL,
        evidence_window_days INTEGER NOT NULL,
        evidence_count INTEGER NOT NULL,
        positive_count INTEGER NOT NULL,
        negative_count INTEGER NOT NULL,
        unused_stale_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        approved_at TEXT,
        approved_by_client TEXT,
        approved_by_actor TEXT,
        approved_note TEXT,
        dismissed_at TEXT,
        dismissed_by_client TEXT,
        dismissed_by_actor TEXT,
        dismissed_note TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_review_tuning_proposals_family_created_at
        ON review_tuning_proposals(proposal_family_key, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_tuning_proposals_status_updated_at
        ON review_tuning_proposals(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS review_tuning_state (
        proposal_id TEXT PRIMARY KEY,
        proposal_kind TEXT NOT NULL,
        surface TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        status TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        note TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_tuning_state_status_expires_at
        ON review_tuning_state(status, expires_at ASC);

      CREATE TABLE IF NOT EXISTS review_read_model_state (
        model_key TEXT PRIMARY KEY,
        refresh_state TEXT NOT NULL,
        last_refresh_started_at TEXT,
        last_refresh_finished_at TEXT,
        last_refresh_trigger TEXT,
        last_refresh_error TEXT,
        updated_at TEXT NOT NULL
      );

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
		const existing = this.db
			.prepare(`SELECT version FROM schema_meta LIMIT 1`)
			.get() as { version: number } | undefined;
		if (!existing) {
			const inferred = this.tableExists("review_approval_flow_outcomes")
				? 28
				: this.tableExists("review_calibration_targets")
					? this.tableExists("repair_executions")
						? 25
						: 24
					: this.tableExists("review_metric_snapshots")
						? 23
						: this.tableExists("review_package_cycles") ||
								this.tableExists("review_notification_events")
							? 22
							: this.tableExists("review_read_model_state")
								? this.tableExists("github_accounts") &&
									this.tableExists("drive_files")
									? 21
									: 14
								: this.tableExists("autopilot_profile_state") &&
										this.tableExists("github_accounts") &&
										this.tableExists("drive_files")
									? 20
									: this.tableExists("drive_files")
										? this.tableExists("drive_sheets")
											? 19
											: this.tableExists("meeting_prep_packets")
												? 18
												: 16
										: this.tableExists("github_pull_requests")
											? 15
											: this.tableExists(
														"planning_hygiene_policy_governance_events",
													)
												? 14
												: this.tableExists("planning_hygiene_policy_proposals")
													? 13
													: this.tableExists("planning_recommendations")
														? this.columnExists(
																"planning_recommendations",
																"outcome_state",
															)
															? this.columnExists(
																	"planning_recommendations",
																	"first_action_at",
																)
																? 12
																: 11
															: this.columnExists(
																		"planning_recommendations",
																		"rank_score",
																	)
																? 10
																: 9
														: this.tableExists("calendar_events")
															? this.columnExists(
																	"calendar_events",
																	"provider_event_id",
																)
																? 8
																: 7
															: this.tableExists("task_suggestions")
																? 6
																: this.tableExists("mail_sync_state")
																	? this.columnExists(
																			"mail_sync_state",
																			"last_sync_duration_ms",
																		)
																		? 5
																		: 4
																	: this.tableExists("send_windows")
																		? 3
																		: this.tableExists("approval_requests") ||
																				this.columnExists(
																					"draft_artifacts",
																					"provider_message_id",
																				)
																			? 2
																			: 1;
			this.db.prepare(`DELETE FROM schema_meta`).run();
			this.db
				.prepare(`INSERT INTO schema_meta (version) VALUES (?)`)
				.run(inferred);
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
			} else if (version === 14) {
				this.migrateToV15();
				version = 15;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 15) {
				this.migrateToV16();
				version = 16;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 16) {
				this.migrateToV17();
				version = 17;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 17) {
				this.migrateToV18();
				version = 18;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 18) {
				this.migrateToV19();
				version = 19;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 19) {
				this.migrateToV20();
				version = 20;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 20) {
				this.migrateToV21();
				version = 21;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 21) {
				this.migrateToV22();
				version = 22;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 22) {
				this.migrateToV23();
				version = 23;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 23) {
				this.migrateToV24();
				version = 24;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 24) {
				this.migrateToV25();
				version = 25;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 25) {
				this.migrateToV26();
				version = 26;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 26) {
				this.migrateToV27();
				version = 27;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 27) {
				this.migrateToV28();
				version = 28;
				this.db.prepare(`UPDATE schema_meta SET version = ?`).run(version);
			} else if (version === 28) {
				this.migrateToV29();
				version = 29;
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
		this.addColumnIfMissing(
			"draft_artifacts",
			"send_attempt_count",
			`INTEGER NOT NULL DEFAULT 0`,
		);
		this.addColumnIfMissing("draft_artifacts", "last_send_attempt_at", `TEXT`);
		this.addColumnIfMissing("draft_artifacts", "last_send_error_code", `TEXT`);
		this.addColumnIfMissing(
			"draft_artifacts",
			"last_send_error_message",
			`TEXT`,
		);

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
		this.addColumnIfMissing(
			"mail_sync_state",
			"last_sync_duration_ms",
			`INTEGER`,
		);
		this.addColumnIfMissing(
			"mail_sync_state",
			"last_sync_refreshed_count",
			`INTEGER`,
		);
		this.addColumnIfMissing(
			"mail_sync_state",
			"last_sync_deleted_count",
			`INTEGER`,
		);
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
		this.addColumnIfMissing(
			"calendar_events",
			"created_by_personal_ops",
			`INTEGER NOT NULL DEFAULT 0`,
		);
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
		this.addColumnIfMissing(
			"tasks",
			"source_planning_recommendation_id",
			`TEXT`,
		);
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
		this.addColumnIfMissing(
			"planning_recommendations",
			"rank_score",
			`REAL NOT NULL DEFAULT 0`,
		);
		this.addColumnIfMissing("planning_recommendations", "rank_reason", `TEXT`);
		this.addColumnIfMissing(
			"planning_recommendations",
			"ranking_version",
			`TEXT`,
		);
		this.addColumnIfMissing("planning_recommendations", "group_key", `TEXT`);
		this.addColumnIfMissing(
			"planning_recommendations",
			"group_summary",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"source_last_seen_at",
			`TEXT`,
		);
		this.addColumnIfMissing("planning_recommendations", "slot_reason", `TEXT`);
		this.addColumnIfMissing(
			"planning_recommendations",
			"trigger_signals_json",
			`TEXT NOT NULL DEFAULT '[]'`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"suppressed_signals_json",
			`TEXT NOT NULL DEFAULT '[]'`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"replan_count",
			`INTEGER NOT NULL DEFAULT 0`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"last_replanned_at",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"decision_reason_code",
			`TEXT`,
		);
		this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_group_key
        ON planning_recommendations(group_key);

      CREATE INDEX IF NOT EXISTS idx_planning_recommendations_rank_score
        ON planning_recommendations(rank_score DESC);
    `);
	}

	private migrateToV11() {
		this.addColumnIfMissing(
			"planning_recommendations",
			"outcome_state",
			`TEXT NOT NULL DEFAULT 'none'`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"outcome_recorded_at",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"outcome_source",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"outcome_summary",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"slot_state",
			`TEXT NOT NULL DEFAULT 'ready'`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"slot_state_reason",
			`TEXT`,
		);
	}

	private migrateToV12() {
		this.addColumnIfMissing(
			"planning_recommendations",
			"first_action_at",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"first_action_type",
			`TEXT`,
		);
		this.addColumnIfMissing("planning_recommendations", "closed_at", `TEXT`);
		this.addColumnIfMissing(
			"planning_recommendations",
			"close_reason_code",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"closed_by_client",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"planning_recommendations",
			"closed_by_actor",
			`TEXT`,
		);
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

	private migrateToV15() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS github_accounts (
        provider TEXT PRIMARY KEY,
        login TEXT NOT NULL,
        keychain_service TEXT NOT NULL,
        keychain_account TEXT NOT NULL,
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        profile_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS github_sync_state (
        provider TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_synced_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        last_sync_duration_ms INTEGER,
        repositories_scanned_count INTEGER,
        pull_requests_refreshed_count INTEGER,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS github_pull_requests (
        pr_key TEXT PRIMARY KEY,
        repository TEXT NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        html_url TEXT NOT NULL,
        author_login TEXT NOT NULL,
        is_draft INTEGER NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        requested_reviewers_json TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        check_state TEXT NOT NULL,
        review_state TEXT NOT NULL,
        mergeable_state TEXT,
        is_review_requested INTEGER NOT NULL,
        is_authored_by_viewer INTEGER NOT NULL,
        attention_kind TEXT,
        attention_summary TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_github_pull_requests_updated_at
        ON github_pull_requests(updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_github_pull_requests_attention_kind
        ON github_pull_requests(attention_kind, updated_at DESC);
    `);
	}

	private migrateToV16() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS drive_sync_state (
        provider TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_synced_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        last_sync_duration_ms INTEGER,
        files_indexed_count INTEGER,
        docs_indexed_count INTEGER,
        sheets_indexed_count INTEGER,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drive_files (
        file_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        web_view_link TEXT,
        icon_link TEXT,
        parents_json TEXT NOT NULL,
        scope_source TEXT NOT NULL,
        drive_modified_time TEXT,
        created_time TEXT,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drive_docs (
        file_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        web_view_link TEXT,
        snippet TEXT,
        text_content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drive_sheets (
        file_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        web_view_link TEXT,
        tab_names_json TEXT NOT NULL,
        header_preview_json TEXT NOT NULL,
        cell_preview_json TEXT NOT NULL,
        snippet TEXT,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drive_link_provenance (
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        match_type TEXT NOT NULL,
        matched_url TEXT,
        discovered_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_drive_files_updated_at
        ON drive_files(updated_at DESC, name ASC);

      CREATE INDEX IF NOT EXISTS idx_drive_docs_updated_at
        ON drive_docs(updated_at DESC, title ASC);

      CREATE INDEX IF NOT EXISTS idx_drive_sheets_updated_at
        ON drive_sheets(updated_at DESC, title ASC);

      CREATE INDEX IF NOT EXISTS idx_drive_link_provenance_source
        ON drive_link_provenance(source_type, source_id, discovered_at DESC);
    `);
	}

	private migrateToV17() {
		this.addColumnIfMissing(
			"draft_artifacts",
			"assistant_generated",
			`INTEGER NOT NULL DEFAULT 0`,
		);
		this.addColumnIfMissing(
			"draft_artifacts",
			"assistant_source_thread_id",
			`TEXT`,
		);
		this.addColumnIfMissing("draft_artifacts", "assistant_group_id", `TEXT`);
		this.addColumnIfMissing("draft_artifacts", "assistant_why_now", `TEXT`);
	}

	private migrateToV18() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS meeting_prep_packets (
        event_id TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        why_now TEXT NOT NULL,
        score_band TEXT NOT NULL,
        signals_json TEXT NOT NULL,
        meeting_json TEXT NOT NULL,
        agenda_json TEXT NOT NULL,
        prep_checklist_json TEXT NOT NULL,
        open_questions_json TEXT NOT NULL,
        related_docs_json TEXT NOT NULL,
        related_threads_json TEXT NOT NULL,
        related_tasks_json TEXT NOT NULL,
        related_recommendations_json TEXT NOT NULL,
        next_commands_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_meeting_prep_packets_generated_at
        ON meeting_prep_packets(generated_at DESC);
    `);
	}

	private migrateToV19() {
		this.addColumnIfMissing(
			"drive_sync_state",
			"sheets_indexed_count",
			`INTEGER`,
		);
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS drive_sheets (
        file_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        web_view_link TEXT,
        tab_names_json TEXT NOT NULL,
        header_preview_json TEXT NOT NULL,
        cell_preview_json TEXT NOT NULL,
        snippet TEXT,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_drive_sheets_updated_at
        ON drive_sheets(updated_at DESC, title ASC);
    `);
		this.addColumnIfMissing(
			"meeting_prep_packets",
			"related_files_json",
			`TEXT NOT NULL DEFAULT '[]'`,
		);
	}

	private migrateToV20() {
		this.addColumnIfMissing("draft_artifacts", "autopilot_run_id", `TEXT`);
		this.addColumnIfMissing("draft_artifacts", "autopilot_profile", `TEXT`);
		this.addColumnIfMissing("draft_artifacts", "autopilot_trigger", `TEXT`);
		this.addColumnIfMissing("draft_artifacts", "autopilot_prepared_at", `TEXT`);
		this.addColumnIfMissing("meeting_prep_packets", "autopilot_run_id", `TEXT`);
		this.addColumnIfMissing(
			"meeting_prep_packets",
			"autopilot_profile",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"meeting_prep_packets",
			"autopilot_trigger",
			`TEXT`,
		);
		this.addColumnIfMissing(
			"meeting_prep_packets",
			"autopilot_prepared_at",
			`TEXT`,
		);
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS autopilot_runs (
        run_id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        requested_profile TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        outcome TEXT,
        summary TEXT,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_autopilot_runs_started_at
        ON autopilot_runs(started_at DESC);

      CREATE TABLE IF NOT EXISTS autopilot_profile_state (
        profile TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        fingerprint TEXT,
        prepared_at TEXT,
        stale_at TEXT,
        next_eligible_run_at TEXT,
        last_summary TEXT,
        last_trigger TEXT,
        last_run_at TEXT,
        last_success_at TEXT,
        last_failure_at TEXT,
        last_run_outcome TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        changed_since_last_run INTEGER NOT NULL DEFAULT 0,
        last_run_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_autopilot_profile_state_stale_at
        ON autopilot_profile_state(stale_at ASC);
    `);
	}

	private migrateToV21() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS review_packages (
        package_id TEXT PRIMARY KEY,
        surface TEXT NOT NULL,
        state TEXT NOT NULL,
        summary TEXT NOT NULL,
        why_now TEXT NOT NULL,
        score_band TEXT NOT NULL,
        signals_json TEXT NOT NULL,
        prepared_at TEXT NOT NULL,
        stale_at TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        member_ids_json TEXT NOT NULL,
        next_commands_json TEXT NOT NULL,
        items_json TEXT NOT NULL,
        source_keys_json TEXT NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 1,
        opened_at TEXT,
        acted_on_at TEXT,
        completed_at TEXT,
        stale_unused_at TEXT,
        current_cycle_reviewed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_packages_surface_prepared_at
        ON review_packages(surface, prepared_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_packages_stale_at
        ON review_packages(stale_at ASC);

      CREATE INDEX IF NOT EXISTS idx_review_packages_is_current_surface
        ON review_packages(is_current, surface, prepared_at DESC);

      CREATE TABLE IF NOT EXISTS review_feedback_events (
        feedback_event_id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        surface TEXT NOT NULL,
        package_item_id TEXT,
        reason TEXT NOT NULL,
        note TEXT NOT NULL,
        actor TEXT,
        client_id TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_feedback_events_package_created_at
        ON review_feedback_events(package_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_feedback_events_surface_created_at
        ON review_feedback_events(surface, created_at DESC);

      CREATE TABLE IF NOT EXISTS review_tuning_proposals (
        proposal_id TEXT PRIMARY KEY,
        proposal_family_key TEXT NOT NULL,
        evidence_fingerprint TEXT NOT NULL,
        proposal_kind TEXT NOT NULL,
        surface TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        summary TEXT NOT NULL,
        evidence_window_days INTEGER NOT NULL,
        evidence_count INTEGER NOT NULL,
        positive_count INTEGER NOT NULL,
        negative_count INTEGER NOT NULL,
        unused_stale_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        approved_at TEXT,
        approved_by_client TEXT,
        approved_by_actor TEXT,
        approved_note TEXT,
        dismissed_at TEXT,
        dismissed_by_client TEXT,
        dismissed_by_actor TEXT,
        dismissed_note TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_review_tuning_proposals_family_created_at
        ON review_tuning_proposals(proposal_family_key, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_tuning_proposals_status_updated_at
        ON review_tuning_proposals(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS review_tuning_state (
        proposal_id TEXT PRIMARY KEY,
        proposal_kind TEXT NOT NULL,
        surface TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        status TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        note TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_tuning_state_status_expires_at
        ON review_tuning_state(status, expires_at ASC);

      CREATE TABLE IF NOT EXISTS review_read_model_state (
        model_key TEXT PRIMARY KEY,
        refresh_state TEXT NOT NULL,
        last_refresh_started_at TEXT,
        last_refresh_finished_at TEXT,
        last_refresh_trigger TEXT,
        last_refresh_error TEXT,
        updated_at TEXT NOT NULL
      );
    `);
		this.addColumnIfMissing(
			"review_packages",
			"is_current",
			`INTEGER NOT NULL DEFAULT 1`,
		);
	}

	private migrateToV22() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS review_package_cycles (
        package_cycle_id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        surface TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        summary TEXT NOT NULL,
        why_now TEXT NOT NULL,
        score_band TEXT NOT NULL,
        member_ids_json TEXT NOT NULL,
        items_json TEXT NOT NULL,
        source_keys_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ended_at TEXT,
        outcome TEXT NOT NULL,
        opened_at TEXT,
        acted_on_at TEXT,
        completed_at TEXT,
        stale_unused_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_package_cycles_package_started_at
        ON review_package_cycles(package_id, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_package_cycles_surface_started_at
        ON review_package_cycles(surface, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_package_cycles_outcome_started_at
        ON review_package_cycles(outcome, started_at DESC);

      CREATE TABLE IF NOT EXISTS review_notification_events (
        notification_event_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        decision TEXT NOT NULL,
        surface TEXT,
        package_id TEXT,
        package_cycle_id TEXT,
        proposal_id TEXT,
        suppression_reason TEXT,
        current_count INTEGER NOT NULL,
        previous_count INTEGER NOT NULL,
        cooldown_minutes INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        actor TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_notification_events_created_at
        ON review_notification_events(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_notification_events_surface_created_at
        ON review_notification_events(surface, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_notification_events_cycle_created_at
        ON review_notification_events(package_cycle_id, created_at DESC);
    `);
		this.addColumnIfMissing(
			"review_feedback_events",
			"package_cycle_id",
			`TEXT`,
		);
		this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_review_feedback_events_cycle_created_at
        ON review_feedback_events(package_cycle_id, created_at DESC);
    `);
	}

	private migrateToV23() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS review_metric_snapshots (
        snapshot_date TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (snapshot_date, scope_type, scope_key)
      );

      CREATE INDEX IF NOT EXISTS idx_review_metric_snapshots_scope_date
        ON review_metric_snapshots(scope_type, scope_key, snapshot_date DESC);
    `);
	}

	private migrateToV24() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS review_calibration_targets (
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
        PRIMARY KEY (scope_type, scope_key)
      );

      CREATE INDEX IF NOT EXISTS idx_review_calibration_targets_scope
        ON review_calibration_targets(scope_type, scope_key);
    `);
	}

	private migrateToV25() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS repair_executions (
        execution_id TEXT PRIMARY KEY,
        step_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        requested_by_client TEXT NOT NULL,
        requested_by_actor TEXT,
        trigger_source TEXT NOT NULL,
        before_first_step_id TEXT,
        after_first_step_id TEXT,
        outcome TEXT NOT NULL,
        resolved_target_step INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_repair_executions_completed_at
        ON repair_executions(completed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_repair_executions_step_completed_at
        ON repair_executions(step_id, completed_at DESC);
    `);
	}

	private migrateToV26() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS maintenance_commitments (
        commitment_id TEXT PRIMARY KEY,
        step_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_presented_at TEXT NOT NULL,
        last_placement TEXT NOT NULL,
        bundle_step_ids_json TEXT NOT NULL,
        state TEXT NOT NULL,
        defer_count INTEGER NOT NULL DEFAULT 0,
        last_deferred_at TEXT,
        fulfilled_at TEXT,
        fulfilled_by_execution_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_maintenance_commitments_updated_at
        ON maintenance_commitments(updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_maintenance_commitments_step_state
        ON maintenance_commitments(step_id, state, updated_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_commitments_active_step
        ON maintenance_commitments(step_id)
        WHERE state = 'active';
    `);
	}

	private migrateToV27() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS surfaced_work_outcomes (
        outcome_id TEXT PRIMARY KEY,
        surface TEXT NOT NULL,
        surfaced_state TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        assistant_action_id TEXT,
        planning_recommendation_id TEXT,
        repair_step_id TEXT,
        maintenance_step_id TEXT,
        summary_snapshot TEXT NOT NULL,
        command_snapshot TEXT,
        surfaced_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        state TEXT NOT NULL,
        evidence_kind TEXT,
        acted_at TEXT,
        closed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_surfaced_work_outcomes_surface_state_seen
        ON surfaced_work_outcomes(surface, state, last_seen_at DESC);

      CREATE INDEX IF NOT EXISTS idx_surfaced_work_outcomes_target
        ON surfaced_work_outcomes(target_type, target_id, surfaced_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_surfaced_work_outcomes_open_surface_target
        ON surfaced_work_outcomes(surface, target_type, target_id)
        WHERE state = 'open';
    `);
	}

	private migrateToV28() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS review_approval_flow_outcomes (
        outcome_id TEXT PRIMARY KEY,
        surfaced_state TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        review_id TEXT,
        approval_id TEXT,
        outbound_group_id TEXT,
        assistant_action_id TEXT,
        summary_snapshot TEXT NOT NULL,
        command_snapshot TEXT,
        surfaced_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        state TEXT NOT NULL,
        evidence_kind TEXT,
        acted_at TEXT,
        closed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_review_approval_flow_outcomes_state_seen
        ON review_approval_flow_outcomes(state, last_seen_at DESC);

      CREATE INDEX IF NOT EXISTS idx_review_approval_flow_outcomes_target
        ON review_approval_flow_outcomes(target_type, target_id, surfaced_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_review_approval_flow_outcomes_open_target
        ON review_approval_flow_outcomes(target_type, target_id)
        WHERE state = 'open';
    `);
	}

	private migrateToV29() {
		this.addColumnIfMissing("calendar_events", "attendees_json", "TEXT");
	}

	private tableExists(name: string): boolean {
		const row = this.db
			.prepare(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
			)
			.get(name) as { name: string } | undefined;
		return Boolean(row);
	}

	private columnExists(table: string, column: string): boolean {
		const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
			name: string;
		}>;
		return rows.some((row) => row.name === column);
	}

	private addColumnIfMissing(
		table: string,
		column: string,
		definition: string,
	) {
		if (!this.columnExists(table, column)) {
			this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
		}
	}

	private mapGithubAccount(row: Record<string, unknown>): GithubAccount {
		return {
			login: String(row.login),
			keychain_service: String(row.keychain_service),
			keychain_account: String(row.keychain_account),
			connected_at: String(row.connected_at),
			updated_at: String(row.updated_at),
			profile_json: String(row.profile_json),
		};
	}

	private mapGithubSyncState(row: Record<string, unknown>): GithubSyncState {
		return {
			provider: "github",
			status: String(row.status) as GithubSyncStatus,
			last_synced_at: row.last_synced_at
				? String(row.last_synced_at)
				: undefined,
			last_error_code: row.last_error_code
				? String(row.last_error_code)
				: undefined,
			last_error_message: row.last_error_message
				? String(row.last_error_message)
				: undefined,
			last_sync_duration_ms:
				row.last_sync_duration_ms === null ||
				row.last_sync_duration_ms === undefined
					? undefined
					: Number(row.last_sync_duration_ms),
			repositories_scanned_count:
				row.repositories_scanned_count === null ||
				row.repositories_scanned_count === undefined
					? undefined
					: Number(row.repositories_scanned_count),
			pull_requests_refreshed_count:
				row.pull_requests_refreshed_count === null ||
				row.pull_requests_refreshed_count === undefined
					? undefined
					: Number(row.pull_requests_refreshed_count),
			updated_at: String(row.updated_at),
		};
	}

	private mapGithubPullRequest(
		row: Record<string, unknown>,
	): GithubPullRequest {
		return {
			pr_key: String(row.pr_key),
			repository: String(row.repository),
			owner: String(row.owner),
			repo: String(row.repo),
			number: Number(row.number),
			title: String(row.title),
			html_url: String(row.html_url),
			author_login: String(row.author_login),
			is_draft: Boolean(row.is_draft),
			state: String(row.state),
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
			requested_reviewers: fromJsonArray(
				String(row.requested_reviewers_json ?? "[]"),
			),
			head_sha: String(row.head_sha),
			check_state: String(row.check_state) as GithubPullRequest["check_state"],
			review_state: String(
				row.review_state,
			) as GithubPullRequest["review_state"],
			mergeable_state: row.mergeable_state
				? String(row.mergeable_state)
				: undefined,
			is_review_requested: Boolean(row.is_review_requested),
			is_authored_by_viewer: Boolean(row.is_authored_by_viewer),
			attention_kind: row.attention_kind
				? (String(row.attention_kind) as GithubPullRequest["attention_kind"])
				: undefined,
			attention_summary: row.attention_summary
				? String(row.attention_summary)
				: undefined,
		};
	}

	private mapDriveSyncState(row: Record<string, unknown>): DriveSyncState {
		return {
			provider: "google_drive",
			status: String(row.status) as DriveSyncStatus,
			last_synced_at: row.last_synced_at
				? String(row.last_synced_at)
				: undefined,
			last_error_code: row.last_error_code
				? String(row.last_error_code)
				: undefined,
			last_error_message: row.last_error_message
				? String(row.last_error_message)
				: undefined,
			last_sync_duration_ms:
				row.last_sync_duration_ms === null ||
				row.last_sync_duration_ms === undefined
					? undefined
					: Number(row.last_sync_duration_ms),
			files_indexed_count:
				row.files_indexed_count === null ||
				row.files_indexed_count === undefined
					? undefined
					: Number(row.files_indexed_count),
			docs_indexed_count:
				row.docs_indexed_count === null || row.docs_indexed_count === undefined
					? undefined
					: Number(row.docs_indexed_count),
			sheets_indexed_count:
				row.sheets_indexed_count === null ||
				row.sheets_indexed_count === undefined
					? undefined
					: Number(row.sheets_indexed_count),
			updated_at: String(row.updated_at),
		};
	}

	private mapDriveFileRecord(row: Record<string, unknown>): DriveFileRecord {
		return {
			file_id: String(row.file_id),
			name: String(row.name),
			mime_type: String(row.mime_type),
			web_view_link: row.web_view_link ? String(row.web_view_link) : undefined,
			icon_link: row.icon_link ? String(row.icon_link) : undefined,
			parents: fromJsonArray(String(row.parents_json ?? "[]")),
			scope_source: String(row.scope_source) as DriveFileRecord["scope_source"],
			drive_modified_time: row.drive_modified_time
				? String(row.drive_modified_time)
				: undefined,
			created_time: row.created_time ? String(row.created_time) : undefined,
			updated_at: String(row.updated_at),
			synced_at: String(row.synced_at),
		};
	}

	private mapDriveDocRecord(row: Record<string, unknown>): DriveDocRecord {
		return {
			file_id: String(row.file_id),
			title: String(row.title),
			mime_type: String(row.mime_type),
			web_view_link: row.web_view_link ? String(row.web_view_link) : undefined,
			snippet: row.snippet ? String(row.snippet) : undefined,
			text_content: String(row.text_content),
			updated_at: String(row.updated_at),
			synced_at: String(row.synced_at),
		};
	}

	private mapDriveSheetRecord(row: Record<string, unknown>): DriveSheetRecord {
		return {
			file_id: String(row.file_id),
			title: String(row.title),
			mime_type: String(row.mime_type),
			web_view_link: row.web_view_link ? String(row.web_view_link) : undefined,
			tab_names: fromJsonArray(String(row.tab_names_json ?? "[]")),
			header_preview: fromJsonArray(String(row.header_preview_json ?? "[]")),
			cell_preview: JSON.parse(String(row.cell_preview_json ?? "[]")),
			snippet: row.snippet ? String(row.snippet) : undefined,
			updated_at: String(row.updated_at),
			synced_at: String(row.synced_at),
		};
	}

	private mapDriveLinkProvenance(
		row: Record<string, unknown>,
	): DriveLinkProvenance {
		return {
			source_type: String(
				row.source_type,
			) as DriveLinkProvenance["source_type"],
			source_id: String(row.source_id),
			file_id: String(row.file_id),
			match_type: String(row.match_type) as DriveLinkProvenance["match_type"],
			matched_url: row.matched_url ? String(row.matched_url) : undefined,
			discovered_at: String(row.discovered_at),
		};
	}

	private mapMeetingPrepPacketRecord(
		row: Record<string, unknown>,
	): MeetingPrepPacketRecord {
		return {
			event_id: String(row.event_id),
			summary: String(row.summary),
			why_now: String(row.why_now),
			score_band: String(
				row.score_band,
			) as MeetingPrepPacketRecord["score_band"],
			signals: JSON.parse(String(row.signals_json ?? "[]")),
			meeting: JSON.parse(String(row.meeting_json ?? "{}")),
			agenda: JSON.parse(String(row.agenda_json ?? "[]")),
			prep_checklist: JSON.parse(String(row.prep_checklist_json ?? "[]")),
			open_questions: JSON.parse(String(row.open_questions_json ?? "[]")),
			related_docs: JSON.parse(String(row.related_docs_json ?? "[]")),
			related_files: JSON.parse(String(row.related_files_json ?? "[]")),
			related_threads: JSON.parse(String(row.related_threads_json ?? "[]")),
			related_tasks: JSON.parse(String(row.related_tasks_json ?? "[]")),
			related_recommendations: JSON.parse(
				String(row.related_recommendations_json ?? "[]"),
			),
			next_commands: JSON.parse(String(row.next_commands_json ?? "[]")),
			generated_at: String(row.generated_at),
			updated_at: String(row.updated_at),
			autopilot_run_id: row.autopilot_run_id
				? String(row.autopilot_run_id)
				: undefined,
			autopilot_profile: row.autopilot_profile
				? (String(row.autopilot_profile) as AutopilotProfile)
				: undefined,
			autopilot_trigger: row.autopilot_trigger
				? (String(row.autopilot_trigger) as AutopilotTrigger)
				: undefined,
			autopilot_prepared_at: row.autopilot_prepared_at
				? String(row.autopilot_prepared_at)
				: undefined,
		};
	}

	private mapDraft(row: Record<string, unknown>): DraftArtifact {
		return {
			artifact_id: String(row.artifact_id),
			provider: String(row.provider),
			provider_draft_id: String(row.provider_draft_id),
			provider_message_id: row.provider_message_id
				? String(row.provider_message_id)
				: undefined,
			provider_thread_id: row.provider_thread_id
				? String(row.provider_thread_id)
				: undefined,
			assistant_generated: Boolean(row.assistant_generated),
			assistant_source_thread_id: row.assistant_source_thread_id
				? String(row.assistant_source_thread_id)
				: undefined,
			assistant_group_id: row.assistant_group_id
				? String(row.assistant_group_id)
				: undefined,
			assistant_why_now: row.assistant_why_now
				? String(row.assistant_why_now)
				: undefined,
			autopilot_run_id: row.autopilot_run_id
				? String(row.autopilot_run_id)
				: undefined,
			autopilot_profile: row.autopilot_profile
				? (String(row.autopilot_profile) as AutopilotProfile)
				: undefined,
			autopilot_trigger: row.autopilot_trigger
				? (String(row.autopilot_trigger) as AutopilotTrigger)
				: undefined,
			autopilot_prepared_at: row.autopilot_prepared_at
				? String(row.autopilot_prepared_at)
				: undefined,
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
			approved_by_client: row.approved_by_client
				? String(row.approved_by_client)
				: undefined,
			sent_at: row.sent_at ? String(row.sent_at) : undefined,
			sent_by_client: row.sent_by_client
				? String(row.sent_by_client)
				: undefined,
			send_attempt_count: Number(row.send_attempt_count ?? 0),
			last_send_attempt_at: row.last_send_attempt_at
				? String(row.last_send_attempt_at)
				: undefined,
			last_send_error_code: row.last_send_error_code
				? String(row.last_send_error_code)
				: undefined,
			last_send_error_message: row.last_send_error_message
				? String(row.last_send_error_message)
				: undefined,
		};
	}

	private mapAutopilotRun(row: Record<string, unknown>): AutopilotRunRecord {
		return {
			run_id: String(row.run_id),
			trigger: String(row.trigger) as AutopilotTrigger,
			requested_profile: row.requested_profile
				? (String(row.requested_profile) as AutopilotProfile)
				: undefined,
			started_at: String(row.started_at),
			completed_at: row.completed_at ? String(row.completed_at) : undefined,
			outcome: row.outcome
				? (String(row.outcome) as AutopilotRunOutcome)
				: undefined,
			summary: row.summary ? String(row.summary) : undefined,
			error_message: row.error_message ? String(row.error_message) : undefined,
		};
	}

	private mapAutopilotProfileState(
		row: Record<string, unknown>,
	): AutopilotProfileStateRecord {
		return {
			profile: String(row.profile) as AutopilotProfile,
			state: String(row.state) as AutopilotProfileState,
			fingerprint: row.fingerprint ? String(row.fingerprint) : undefined,
			prepared_at: row.prepared_at ? String(row.prepared_at) : undefined,
			stale_at: row.stale_at ? String(row.stale_at) : undefined,
			next_eligible_run_at: row.next_eligible_run_at
				? String(row.next_eligible_run_at)
				: undefined,
			last_summary: row.last_summary ? String(row.last_summary) : undefined,
			last_trigger: row.last_trigger
				? (String(row.last_trigger) as AutopilotTrigger)
				: undefined,
			last_run_at: row.last_run_at ? String(row.last_run_at) : undefined,
			last_success_at: row.last_success_at
				? String(row.last_success_at)
				: undefined,
			last_failure_at: row.last_failure_at
				? String(row.last_failure_at)
				: undefined,
			last_run_outcome: row.last_run_outcome
				? (String(row.last_run_outcome) as Exclude<
						AutopilotRunOutcome,
						"running"
					>)
				: undefined,
			consecutive_failures: Number(row.consecutive_failures ?? 0),
			changed_since_last_run: Boolean(row.changed_since_last_run),
			last_run_id: row.last_run_id ? String(row.last_run_id) : undefined,
		};
	}

	private mapReviewPackage(row: Record<string, unknown>): ReviewPackage {
		return {
			package_id: String(row.package_id),
			surface: String(row.surface) as ReviewPackageSurface,
			state: String(row.state) as ReviewPackageState,
			summary: String(row.summary),
			why_now: String(row.why_now),
			score_band: String(row.score_band) as ReviewPackage["score_band"],
			signals: JSON.parse(String(row.signals_json ?? "[]")),
			prepared_at: String(row.prepared_at),
			stale_at: String(row.stale_at),
			source_fingerprint: String(row.source_fingerprint),
			member_ids: JSON.parse(String(row.member_ids_json ?? "[]")),
			next_commands: JSON.parse(String(row.next_commands_json ?? "[]")),
			items: JSON.parse(String(row.items_json ?? "[]")),
		};
	}

	private mapReviewPackageRecord(
		row: Record<string, unknown>,
	): ReviewPackage & {
		source_keys: string[];
		is_current: boolean;
		opened_at?: string | undefined;
		acted_on_at?: string | undefined;
		completed_at?: string | undefined;
		stale_unused_at?: string | undefined;
		current_cycle_reviewed: boolean;
		updated_at: string;
	} {
		return {
			...this.mapReviewPackage(row),
			source_keys: JSON.parse(String(row.source_keys_json ?? "[]")),
			is_current: Boolean(row.is_current),
			opened_at: row.opened_at ? String(row.opened_at) : undefined,
			acted_on_at: row.acted_on_at ? String(row.acted_on_at) : undefined,
			completed_at: row.completed_at ? String(row.completed_at) : undefined,
			stale_unused_at: row.stale_unused_at
				? String(row.stale_unused_at)
				: undefined,
			current_cycle_reviewed: Boolean(row.current_cycle_reviewed),
			updated_at: String(row.updated_at),
		};
	}

	private mapReviewPackageCycle(
		row: Record<string, unknown>,
	): ReviewPackageCycle {
		return {
			package_cycle_id: String(row.package_cycle_id),
			package_id: String(row.package_id),
			surface: String(row.surface) as ReviewPackageSurface,
			source_fingerprint: String(row.source_fingerprint),
			summary: String(row.summary),
			why_now: String(row.why_now),
			score_band: String(row.score_band) as ReviewPackage["score_band"],
			member_ids: JSON.parse(String(row.member_ids_json ?? "[]")),
			items: JSON.parse(String(row.items_json ?? "[]")),
			source_keys: JSON.parse(String(row.source_keys_json ?? "[]")),
			started_at: String(row.started_at),
			last_seen_at: String(row.last_seen_at),
			ended_at: row.ended_at ? String(row.ended_at) : undefined,
			outcome: String(row.outcome) as ReviewPackageCycleOutcome,
			opened_at: row.opened_at ? String(row.opened_at) : undefined,
			acted_on_at: row.acted_on_at ? String(row.acted_on_at) : undefined,
			completed_at: row.completed_at ? String(row.completed_at) : undefined,
			stale_unused_at: row.stale_unused_at
				? String(row.stale_unused_at)
				: undefined,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
		};
	}

	private mapReviewFeedbackEvent(
		row: Record<string, unknown>,
	): ReviewFeedbackEvent {
		return {
			feedback_event_id: String(row.feedback_event_id),
			package_id: String(row.package_id),
			package_cycle_id: row.package_cycle_id
				? String(row.package_cycle_id)
				: undefined,
			surface: String(row.surface) as ReviewPackageSurface,
			package_item_id: row.package_item_id
				? String(row.package_item_id)
				: undefined,
			reason: String(row.reason) as ReviewFeedbackReason,
			note: String(row.note),
			actor: row.actor ? String(row.actor) : undefined,
			client_id: String(row.client_id),
			source_fingerprint: String(row.source_fingerprint),
			created_at: String(row.created_at),
		};
	}

	private mapReviewNotificationEvent(
		row: Record<string, unknown>,
	): ReviewNotificationEvent {
		return {
			notification_event_id: String(row.notification_event_id),
			kind: String(row.kind) as ReviewNotificationKind,
			decision: String(row.decision) as ReviewNotificationDecision,
			source: "desktop",
			surface: row.surface
				? (String(row.surface) as ReviewPackageSurface)
				: undefined,
			package_id: row.package_id ? String(row.package_id) : undefined,
			package_cycle_id: row.package_cycle_id
				? String(row.package_cycle_id)
				: undefined,
			proposal_id: row.proposal_id ? String(row.proposal_id) : undefined,
			suppression_reason: row.suppression_reason
				? (String(
						row.suppression_reason,
					) as ReviewNotificationSuppressionReason)
				: undefined,
			current_count: Number(row.current_count ?? 0),
			previous_count: Number(row.previous_count ?? 0),
			cooldown_minutes: Number(row.cooldown_minutes ?? 0),
			client_id: String(row.client_id),
			actor: row.actor ? String(row.actor) : undefined,
			created_at: String(row.created_at),
		};
	}

	private mapReviewMetricSnapshot(
		row: Record<string, unknown>,
	): ReviewMetricSnapshot {
		return {
			snapshot_date: String(row.snapshot_date),
			scope_type: String(row.scope_type) as ReviewMetricSnapshotScopeType,
			scope_key: String(row.scope_key) as ReviewMetricSnapshotScopeKey,
			metrics: JSON.parse(String(row.metrics_json ?? "{}")),
			generated_at: String(row.generated_at),
		};
	}

	private mapReviewCalibrationTarget(
		row: Record<string, unknown>,
	): ReviewCalibrationTarget {
		return {
			scope_type: String(row.scope_type) as ReviewCalibrationTargetScopeType,
			scope_key: String(row.scope_key) as ReviewCalibrationTargetScopeKey,
			min_acted_on_rate: Number(row.min_acted_on_rate ?? 0),
			max_stale_unused_rate: Number(row.max_stale_unused_rate ?? 0),
			max_negative_feedback_rate: Number(row.max_negative_feedback_rate ?? 0),
			min_notification_action_conversion_rate: Number(
				row.min_notification_action_conversion_rate ?? 0,
			),
			max_notifications_per_7d: Number(row.max_notifications_per_7d ?? 0),
			created_at: String(row.created_at ?? row.updated_at ?? nowIso()),
			updated_at: String(row.updated_at),
			updated_by_client: String(row.updated_by_client),
			updated_by_actor: row.updated_by_actor
				? String(row.updated_by_actor)
				: undefined,
		};
	}

	private mapRepairExecution(
		row: Record<string, unknown>,
	): RepairExecutionRecord {
		return {
			execution_id: String(row.execution_id),
			step_id: String(row.step_id) as RepairStepId,
			started_at: String(row.started_at),
			completed_at: String(row.completed_at),
			requested_by_client: String(row.requested_by_client),
			requested_by_actor: row.requested_by_actor
				? String(row.requested_by_actor)
				: undefined,
			trigger_source: String(
				row.trigger_source,
			) as RepairExecutionTriggerSource,
			before_first_step_id: row.before_first_step_id
				? (String(row.before_first_step_id) as RepairStepId)
				: undefined,
			after_first_step_id: row.after_first_step_id
				? (String(row.after_first_step_id) as RepairStepId)
				: undefined,
			outcome: String(row.outcome) as RepairExecutionOutcome,
			resolved_target_step: Number(row.resolved_target_step ?? 0) === 1,
			message: String(row.message),
		};
	}

	private mapMaintenanceCommitment(
		row: Record<string, unknown>,
	): MaintenanceCommitmentRecord {
		return {
			commitment_id: String(row.commitment_id),
			step_id: String(row.step_id) as RepairStepId,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
			last_presented_at: String(row.last_presented_at),
			last_placement: String(row.last_placement) as "now" | "prep_day",
			bundle_step_ids: fromJsonArray(
				String(row.bundle_step_ids_json ?? "[]"),
			).map((item) => item as RepairStepId),
			state: String(row.state) as MaintenanceCommitmentState,
			defer_count: Number(row.defer_count ?? 0),
			last_deferred_at: row.last_deferred_at
				? String(row.last_deferred_at)
				: undefined,
			fulfilled_at: row.fulfilled_at ? String(row.fulfilled_at) : undefined,
			fulfilled_by_execution_id: row.fulfilled_by_execution_id
				? String(row.fulfilled_by_execution_id)
				: undefined,
		};
	}

	private mapSurfacedWorkOutcome(
		row: Record<string, unknown>,
	): SurfacedWorkOutcomeRecord {
		return {
			outcome_id: String(row.outcome_id),
			surface: String(row.surface) as SurfacedWorkSurface,
			surfaced_state: String(row.surfaced_state),
			target_type: String(row.target_type),
			target_id: String(row.target_id),
			assistant_action_id: row.assistant_action_id
				? String(row.assistant_action_id)
				: undefined,
			planning_recommendation_id: row.planning_recommendation_id
				? String(row.planning_recommendation_id)
				: undefined,
			repair_step_id: row.repair_step_id
				? (String(row.repair_step_id) as RepairStepId)
				: undefined,
			maintenance_step_id: row.maintenance_step_id
				? (String(row.maintenance_step_id) as RepairStepId)
				: undefined,
			summary_snapshot: String(row.summary_snapshot),
			command_snapshot: row.command_snapshot
				? String(row.command_snapshot)
				: undefined,
			surfaced_at: String(row.surfaced_at),
			last_seen_at: String(row.last_seen_at),
			state: String(row.state) as SurfacedWorkOutcomeState,
			evidence_kind: row.evidence_kind
				? (String(row.evidence_kind) as SurfacedWorkEvidenceKind)
				: undefined,
			acted_at: row.acted_at ? String(row.acted_at) : undefined,
			closed_at: row.closed_at ? String(row.closed_at) : undefined,
		};
	}

	private mapReviewApprovalFlowOutcome(
		row: Record<string, unknown>,
	): ReviewApprovalFlowOutcomeRecord {
		return {
			outcome_id: String(row.outcome_id),
			surfaced_state: String(
				row.surfaced_state,
			) as ReviewApprovalFlowOutcomeRecord["surfaced_state"],
			target_type: String(row.target_type),
			target_id: String(row.target_id),
			review_id: row.review_id ? String(row.review_id) : undefined,
			approval_id: row.approval_id ? String(row.approval_id) : undefined,
			outbound_group_id: row.outbound_group_id
				? String(row.outbound_group_id)
				: undefined,
			assistant_action_id: row.assistant_action_id
				? String(row.assistant_action_id)
				: undefined,
			summary_snapshot: String(row.summary_snapshot),
			command_snapshot: row.command_snapshot
				? String(row.command_snapshot)
				: undefined,
			surfaced_at: String(row.surfaced_at),
			last_seen_at: String(row.last_seen_at),
			state: String(row.state) as ReviewApprovalFlowOutcomeState,
			evidence_kind: row.evidence_kind
				? (String(row.evidence_kind) as ReviewApprovalFlowEvidenceKind)
				: undefined,
			acted_at: row.acted_at ? String(row.acted_at) : undefined,
			closed_at: row.closed_at ? String(row.closed_at) : undefined,
		};
	}

	private mapReviewTuningProposal(
		row: Record<string, unknown>,
	): ReviewTuningProposal {
		return {
			proposal_id: String(row.proposal_id),
			proposal_family_key: String(row.proposal_family_key),
			evidence_fingerprint: String(row.evidence_fingerprint),
			proposal_kind: String(row.proposal_kind) as ReviewTuningProposalKind,
			surface: String(row.surface) as ReviewPackageSurface,
			scope_key: String(row.scope_key),
			summary: String(row.summary),
			evidence_window_days: Number(row.evidence_window_days ?? 14),
			evidence_count: Number(row.evidence_count ?? 0),
			positive_count: Number(row.positive_count ?? 0),
			negative_count: Number(row.negative_count ?? 0),
			unused_stale_count: Number(row.unused_stale_count ?? 0),
			status: String(row.status) as ReviewTuningProposalStatus,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
			expires_at: String(row.expires_at),
			approved_at: row.approved_at ? String(row.approved_at) : undefined,
			approved_by_client: row.approved_by_client
				? String(row.approved_by_client)
				: undefined,
			approved_by_actor: row.approved_by_actor
				? String(row.approved_by_actor)
				: undefined,
			approved_note: row.approved_note ? String(row.approved_note) : undefined,
			dismissed_at: row.dismissed_at ? String(row.dismissed_at) : undefined,
			dismissed_by_client: row.dismissed_by_client
				? String(row.dismissed_by_client)
				: undefined,
			dismissed_by_actor: row.dismissed_by_actor
				? String(row.dismissed_by_actor)
				: undefined,
			dismissed_note: row.dismissed_note
				? String(row.dismissed_note)
				: undefined,
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
			requested_by_actor: row.requested_by_actor
				? String(row.requested_by_actor)
				: undefined,
			approved_at: row.approved_at ? String(row.approved_at) : undefined,
			approved_by_client: row.approved_by_client
				? String(row.approved_by_client)
				: undefined,
			approved_by_actor: row.approved_by_actor
				? String(row.approved_by_actor)
				: undefined,
			rejected_at: row.rejected_at ? String(row.rejected_at) : undefined,
			rejected_by_client: row.rejected_by_client
				? String(row.rejected_by_client)
				: undefined,
			rejected_by_actor: row.rejected_by_actor
				? String(row.rejected_by_actor)
				: undefined,
			expires_at: String(row.expires_at),
			decision_note: row.decision_note ? String(row.decision_note) : undefined,
			send_note: row.send_note ? String(row.send_note) : undefined,
			draft_digest: String(row.draft_digest),
			risk_flags_json: String(row.risk_flags_json),
			policy_snapshot_json: String(row.policy_snapshot_json),
			confirmation_digest: row.confirmation_digest
				? String(row.confirmation_digest)
				: undefined,
			confirmation_expires_at: row.confirmation_expires_at
				? String(row.confirmation_expires_at)
				: undefined,
			last_error_code: row.last_error_code
				? String(row.last_error_code)
				: undefined,
			last_error_message: row.last_error_message
				? String(row.last_error_message)
				: undefined,
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
			enabled_by_actor: row.enabled_by_actor
				? String(row.enabled_by_actor)
				: undefined,
			expires_at: String(row.expires_at),
			reason: String(row.reason),
			disabled_at: row.disabled_at ? String(row.disabled_at) : undefined,
			disabled_by_client: row.disabled_by_client
				? String(row.disabled_by_client)
				: undefined,
			disabled_by_actor: row.disabled_by_actor
				? String(row.disabled_by_actor)
				: undefined,
			disable_reason: row.disable_reason
				? String(row.disable_reason)
				: undefined,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
		};
	}

	private mapCalendarSyncState(
		row: Record<string, unknown>,
	): CalendarSyncState {
		return {
			account: String(row.account),
			provider: String(row.provider) as CalendarProvider,
			status: String(row.status) as CalendarSyncStatus,
			last_synced_at: row.last_synced_at
				? String(row.last_synced_at)
				: undefined,
			last_seeded_at: row.last_seeded_at
				? String(row.last_seeded_at)
				: undefined,
			last_error_code: row.last_error_code
				? String(row.last_error_code)
				: undefined,
			last_error_message: row.last_error_message
				? String(row.last_error_message)
				: undefined,
			last_sync_duration_ms:
				row.last_sync_duration_ms === null ||
				row.last_sync_duration_ms === undefined
					? undefined
					: Number(row.last_sync_duration_ms),
			calendars_refreshed_count:
				row.calendars_refreshed_count === null ||
				row.calendars_refreshed_count === undefined
					? undefined
					: Number(row.calendars_refreshed_count),
			events_refreshed_count:
				row.events_refreshed_count === null ||
				row.events_refreshed_count === undefined
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
			background_color: row.background_color
				? String(row.background_color)
				: undefined,
			foreground_color: row.foreground_color
				? String(row.foreground_color)
				: undefined,
			updated_at: String(row.updated_at),
		};
	}

	private mapCalendarEvent(row: Record<string, unknown>): CalendarEvent {
		return {
			event_id: String(row.event_id),
			provider_event_id: row.provider_event_id
				? String(row.provider_event_id)
				: String(row.event_id),
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
			recurring_event_id: row.recurring_event_id
				? String(row.recurring_event_id)
				: undefined,
			organizer_email: row.organizer_email
				? String(row.organizer_email)
				: undefined,
			self_response_status: row.self_response_status
				? String(row.self_response_status)
				: undefined,
			attendee_count: Number(row.attendee_count ?? 0),
			attendees: row.attendees_json
				? (JSON.parse(String(row.attendees_json)) as CalendarAttendee[])
				: undefined,
			source_task_id: row.source_task_id
				? String(row.source_task_id)
				: undefined,
			created_by_personal_ops: Boolean(row.created_by_personal_ops),
			last_write_at: row.last_write_at ? String(row.last_write_at) : undefined,
			last_write_by_client: row.last_write_by_client
				? String(row.last_write_by_client)
				: undefined,
			updated_at: String(row.updated_at),
			synced_at: String(row.synced_at),
		};
	}

	private mapMailSyncState(row: Record<string, unknown>): MailSyncState {
		return {
			mailbox: String(row.mailbox),
			provider: String(row.provider),
			status: String(row.status) as MailSyncStatus,
			last_history_id: row.last_history_id
				? String(row.last_history_id)
				: undefined,
			last_synced_at: row.last_synced_at
				? String(row.last_synced_at)
				: undefined,
			last_seeded_at: row.last_seeded_at
				? String(row.last_seeded_at)
				: undefined,
			last_sync_duration_ms:
				row.last_sync_duration_ms === null ||
				row.last_sync_duration_ms === undefined
					? undefined
					: Number(row.last_sync_duration_ms),
			last_sync_refreshed_count:
				row.last_sync_refreshed_count === null ||
				row.last_sync_refreshed_count === undefined
					? undefined
					: Number(row.last_sync_refreshed_count),
			last_sync_deleted_count:
				row.last_sync_deleted_count === null ||
				row.last_sync_deleted_count === undefined
					? undefined
					: Number(row.last_sync_deleted_count),
			last_error_code: row.last_error_code
				? String(row.last_error_code)
				: undefined,
			last_error_message: row.last_error_message
				? String(row.last_error_message)
				: undefined,
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
			created_by_actor: row.created_by_actor
				? String(row.created_by_actor)
				: undefined,
			owner: String(row.owner) as TaskOwner,
			due_at: row.due_at ? String(row.due_at) : undefined,
			remind_at: row.remind_at ? String(row.remind_at) : undefined,
			source: String(row.source) as TaskSource,
			source_suggestion_id: row.source_suggestion_id
				? String(row.source_suggestion_id)
				: undefined,
			source_planning_recommendation_id: row.source_planning_recommendation_id
				? String(row.source_planning_recommendation_id)
				: undefined,
			source_thread_id: row.source_thread_id
				? String(row.source_thread_id)
				: undefined,
			source_calendar_event_id: row.source_calendar_event_id
				? String(row.source_calendar_event_id)
				: undefined,
			decision_note: row.decision_note ? String(row.decision_note) : undefined,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
			completed_at: row.completed_at ? String(row.completed_at) : undefined,
			canceled_at: row.canceled_at ? String(row.canceled_at) : undefined,
			scheduled_calendar_event_id: row.scheduled_calendar_event_id
				? String(row.scheduled_calendar_event_id)
				: undefined,
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
			suggested_by_actor: row.suggested_by_actor
				? String(row.suggested_by_actor)
				: undefined,
			status: String(row.status) as TaskSuggestionStatus,
			accepted_task_id: row.accepted_task_id
				? String(row.accepted_task_id)
				: undefined,
			decision_note: row.decision_note ? String(row.decision_note) : undefined,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
			resolved_at: row.resolved_at ? String(row.resolved_at) : undefined,
		};
	}

	private mapPlanningRecommendation(
		row: Record<string, unknown>,
	): PlanningRecommendation {
		return {
			recommendation_id: String(row.recommendation_id),
			kind: String(row.kind) as PlanningRecommendationKind,
			status: String(row.status) as PlanningRecommendationStatus,
			priority: String(row.priority) as TaskPriority,
			source: String(row.source) as PlanningRecommendationSource,
			suggested_by_client: String(row.suggested_by_client),
			suggested_by_actor: row.suggested_by_actor
				? String(row.suggested_by_actor)
				: undefined,
			source_task_id: row.source_task_id
				? String(row.source_task_id)
				: undefined,
			source_thread_id: row.source_thread_id
				? String(row.source_thread_id)
				: undefined,
			source_calendar_event_id: row.source_calendar_event_id
				? String(row.source_calendar_event_id)
				: undefined,
			proposed_calendar_id: row.proposed_calendar_id
				? String(row.proposed_calendar_id)
				: undefined,
			proposed_start_at: row.proposed_start_at
				? String(row.proposed_start_at)
				: undefined,
			proposed_end_at: row.proposed_end_at
				? String(row.proposed_end_at)
				: undefined,
			proposed_title: row.proposed_title
				? String(row.proposed_title)
				: undefined,
			proposed_notes: row.proposed_notes
				? String(row.proposed_notes)
				: undefined,
			reason_code: String(row.reason_code),
			reason_summary: String(row.reason_summary),
			dedupe_key: String(row.dedupe_key),
			source_fingerprint: String(row.source_fingerprint),
			rank_score: Number(row.rank_score ?? 0),
			rank_reason: row.rank_reason ? String(row.rank_reason) : undefined,
			ranking_version: row.ranking_version
				? String(row.ranking_version)
				: undefined,
			group_key: row.group_key ? String(row.group_key) : undefined,
			group_summary: row.group_summary ? String(row.group_summary) : undefined,
			source_last_seen_at: row.source_last_seen_at
				? String(row.source_last_seen_at)
				: undefined,
			first_action_at: row.first_action_at
				? String(row.first_action_at)
				: undefined,
			first_action_type: row.first_action_type
				? (String(
						row.first_action_type,
					) as PlanningRecommendationFirstActionType)
				: undefined,
			closed_at: row.closed_at ? String(row.closed_at) : undefined,
			close_reason_code: row.close_reason_code
				? (String(
						row.close_reason_code,
					) as PlanningRecommendationCloseReasonCode)
				: undefined,
			closed_by_client: row.closed_by_client
				? String(row.closed_by_client)
				: undefined,
			closed_by_actor: row.closed_by_actor
				? String(row.closed_by_actor)
				: undefined,
			outcome_state: String(
				row.outcome_state ?? "none",
			) as PlanningRecommendationOutcomeState,
			outcome_recorded_at: row.outcome_recorded_at
				? String(row.outcome_recorded_at)
				: undefined,
			outcome_source: row.outcome_source
				? (String(row.outcome_source) as PlanningRecommendationOutcomeSource)
				: undefined,
			outcome_summary: row.outcome_summary
				? String(row.outcome_summary)
				: undefined,
			slot_state: String(
				row.slot_state ?? "ready",
			) as PlanningRecommendationSlotState,
			slot_state_reason: row.slot_state_reason
				? String(row.slot_state_reason)
				: undefined,
			slot_reason: row.slot_reason ? String(row.slot_reason) : undefined,
			trigger_signals: fromJsonArray(String(row.trigger_signals_json ?? "[]")),
			suppressed_signals: fromJsonArray(
				String(row.suppressed_signals_json ?? "[]"),
			),
			replan_count: Number(row.replan_count ?? 0),
			last_replanned_at: row.last_replanned_at
				? String(row.last_replanned_at)
				: undefined,
			decision_reason_code: row.decision_reason_code
				? String(row.decision_reason_code)
				: undefined,
			decision_note: row.decision_note ? String(row.decision_note) : undefined,
			snoozed_until: row.snoozed_until ? String(row.snoozed_until) : undefined,
			applied_task_id: row.applied_task_id
				? String(row.applied_task_id)
				: undefined,
			applied_calendar_event_id: row.applied_calendar_event_id
				? String(row.applied_calendar_event_id)
				: undefined,
			last_error_code: row.last_error_code
				? String(row.last_error_code)
				: undefined,
			last_error_message: row.last_error_message
				? String(row.last_error_message)
				: undefined,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
			resolved_at: row.resolved_at ? String(row.resolved_at) : undefined,
		};
	}

	private mapPlanningHygienePolicyProposal(
		row: Record<string, unknown>,
	): PlanningHygienePolicyProposal {
		return {
			proposal_id: String(row.proposal_id),
			group_key: String(row.group_key),
			kind: String(row.kind) as PlanningRecommendationKind,
			source: String(row.source) as PlanningRecommendationSource,
			proposal_type: String(
				row.proposal_type,
			) as PlanningHygienePolicyProposalType,
			status: String(row.status) as PlanningHygienePolicyProposalStatus,
			basis_signal_updated_at: row.basis_signal_updated_at
				? String(row.basis_signal_updated_at)
				: null,
			created_at: String(row.created_at),
			created_by_client: String(row.created_by_client),
			created_by_actor: row.created_by_actor
				? String(row.created_by_actor)
				: undefined,
			updated_at: String(row.updated_at),
			updated_by_client: String(row.updated_by_client),
			updated_by_actor: row.updated_by_actor
				? String(row.updated_by_actor)
				: undefined,
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
			event_type: String(
				row.event_type,
			) as PlanningHygienePolicyGovernanceEventType,
			basis_signal_updated_at: row.basis_signal_updated_at
				? String(row.basis_signal_updated_at)
				: null,
			follow_through_state_snapshot: row.follow_through_state_snapshot
				? (String(
						row.follow_through_state_snapshot,
					) as PlanningRecommendationFollowThroughState)
				: null,
			proposal_status_snapshot: row.proposal_status_snapshot
				? (String(
						row.proposal_status_snapshot,
					) as PlanningHygienePolicyProposalStatus)
				: null,
			recorded_at: String(row.recorded_at),
			recorded_by_client: String(row.recorded_by_client),
			recorded_by_actor: row.recorded_by_actor
				? String(row.recorded_by_actor)
				: undefined,
			note: row.note ? String(row.note) : undefined,
		};
	}
}
