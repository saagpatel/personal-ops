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
import {
	ensureMachineIdentity,
	writeRestoreProvenance,
} from "../src/machine.js";
import { resolvePaths } from "../src/paths.js";
import { writeRecoveryRehearsalStamp } from "../src/recovery.js";
import { buildReviewApprovalFlowCalibrationSummary } from "../src/service/review-approval-calibration.js";
import {
	buildFollowUpBlockWorkflowReport,
	buildNowNextWorkflowReport,
	buildPrepDayWorkflowReport,
} from "../src/service/workflows.js";
import {
	buildWorkspaceHomeSummary,
	PersonalOpsService,
} from "../src/service.js";
import {
	applySurfacedNoiseReduction,
	trackAssistantTopActionOutcome,
	trackWorkflowNowNextOutcome,
	trackWorkspaceHomeOutcome,
} from "../src/surfaced-work.js";
import type {
	ClientIdentity,
	Config,
	DoctorCheck,
	DriveDocRecord,
	DriveFileRecord,
	DriveSheetRecord,
	GithubAccount,
	GithubPullRequest,
	GmailClientConfig,
	GmailHistoryPage,
	GmailMessageMetadata,
	GmailMessageRefPage,
	GoogleCalendarEventMetadata,
	GoogleCalendarEventsPage,
	GoogleCalendarEventWriteInput,
	GoogleCalendarListPage,
	PlanningRecommendation,
	PlanningRecommendationDetail,
	Policy,
	ReviewApprovalFlowOutcomeRecord,
	WorklistReport,
} from "../src/types.js";
import { CONSOLE_SESSION_COOKIE } from "../src/web-console.js";

interface FixtureOptions {
	allowSend?: boolean;
	accountEmail?: string;
	githubEnabled?: boolean;
	includedGithubRepositories?: string[];
	githubVerifyImpl?: (
		token: string,
		keychainService: string,
	) => Promise<GithubAccount>;
	githubSyncImpl?: (
		token: string,
		repositories: string[],
		viewerLogin: string,
	) => Promise<{
		repositories_scanned_count: number;
		pull_requests: GithubPullRequest[];
	}>;
	driveEnabled?: boolean;
	includedDriveFolders?: string[];
	includedDriveFiles?: string[];
	driveVerifyImpl?: (
		tokensJson: string,
		clientConfig: GmailClientConfig,
	) => Promise<void>;
	driveScopesImpl?: (
		tokensJson: string,
		clientConfig: GmailClientConfig,
	) => Promise<string[]>;
	driveSyncImpl?: (
		tokensJson: string,
		clientConfig: GmailClientConfig,
		config: Config,
	) => Promise<{
		files: DriveFileRecord[];
		docs: DriveDocRecord[];
		sheets: DriveSheetRecord[];
	}>;
	meetingPrepWarningMinutes?: number;
	sendImpl?: (
		providerDraftId: string,
	) => Promise<{ provider_message_id: string; provider_thread_id?: string }>;
	updateImpl?: () => Promise<string>;
	verifyMetadataImpl?: () => Promise<void>;
	verifyCalendarImpl?: () => Promise<void>;
	verifyCalendarWriteImpl?: () => Promise<void>;
	listRefsImpl?: (
		labelId: string,
		pageToken?: string,
	) => Promise<GmailMessageRefPage>;
	metadataImpl?: (messageId: string) => Promise<GmailMessageMetadata>;
	historyImpl?: (
		startHistoryId: string,
		pageToken?: string,
	) => Promise<GmailHistoryPage>;
	listCalendarsImpl?: (pageToken?: string) => Promise<GoogleCalendarListPage>;
	listCalendarEventsImpl?: (
		calendarId: string,
		options: { timeMin: string; timeMax: string; pageToken?: string },
	) => Promise<GoogleCalendarEventsPage>;
	getCalendarEventImpl?: (
		calendarId: string,
		providerEventId: string,
	) => Promise<GoogleCalendarEventMetadata>;
	createCalendarEventImpl?: (
		calendarId: string,
		input: GoogleCalendarEventWriteInput,
	) => Promise<GoogleCalendarEventMetadata>;
	patchCalendarEventImpl?: (
		calendarId: string,
		providerEventId: string,
		input: GoogleCalendarEventWriteInput,
	) => Promise<GoogleCalendarEventMetadata>;
	cancelCalendarEventImpl?: (
		calendarId: string,
		providerEventId: string,
	) => Promise<void>;
	profileHistoryId?: string;
}

function emptyMaintenanceFollowThrough(
	generatedAt = "2026-04-11T10:00:00.000Z",
) {
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
		confidence: emptyMaintenanceConfidence(),
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

let surfacedOutcomeCounter = 0;

function buildAssistantQueueForSurfaceTest(
	actions: Array<{
		action_id: string;
		summary: string;
		state:
			| "proposed"
			| "awaiting_review"
			| "completed"
			| "failed"
			| "blocked"
			| "running";
		why_now?: string;
		command?: string;
		target_type?: string;
		target_id?: string;
	}>,
	generatedAt = "2026-04-13T16:00:00.000Z",
) {
	return {
		generated_at: generatedAt,
		readiness: "ready" as const,
		summary: "Assistant queue test fixture.",
		counts_by_state: {
			proposed: 0,
			running: 0,
			awaiting_review: 0,
			blocked: 0,
			completed: 0,
			failed: 0,
		},
		top_item_summary: actions[0]?.summary ?? null,
		actions: actions.map((action) => ({
			title: action.summary,
			section: "overview" as const,
			batch: false,
			one_click: true,
			review_required: action.state === "awaiting_review",
			signals: ["test_signal"],
			...action,
		})),
	} as any;
}

function buildNowNextReportForSurfaceTest(
	actions: Array<{
		label: string;
		summary: string;
		command: string;
		target_type?: string;
		target_id?: string;
		planning_recommendation_id?: string;
		why_now?: string;
		workflow_personalization?: any;
		surfaced_work_helpfulness?: any;
		surfaced_noise_reduction?: any;
	}>,
	generatedAt = "2026-04-13T16:00:00.000Z",
) {
	return {
		workflow: "now-next" as const,
		generated_at: generatedAt,
		readiness: "ready" as const,
		summary: "Workflow test fixture.",
		sections: [
			{
				title: "Best Next Move",
				items: actions.map((action) => ({ ...action })),
			},
		],
		actions,
		first_repair_step: null,
		maintenance_follow_through: emptyMaintenanceFollowThrough(generatedAt),
		maintenance_escalation: {
			eligible: false,
			step_id: null,
			signal: null,
			summary: null,
			suggested_command: null,
			handoff_count_30d: 0,
			cue: null,
		},
		maintenance_scheduling: emptyMaintenanceScheduling(),
	} as any;
}

function seedClosedSurfacedOutcome(
	service: PersonalOpsService,
	input: {
		surface: "workspace_home" | "assistant_top_action" | "workflow_now_next";
		surfaced_state: string;
		target_type: string;
		target_id: string;
		state: "helpful" | "attempted_failed" | "superseded" | "expired";
		evidence_kind:
			| "repair_progressed"
			| "repair_failed"
			| "assistant_progressed"
			| "assistant_failed"
			| "planning_progressed"
			| "maintenance_completed"
			| "maintenance_handed_off"
			| "superseded"
			| "timed_out";
		surfaced_at?: string;
		closed_at?: string;
		assistant_action_id?: string;
		planning_recommendation_id?: string;
		repair_step_id?: string;
		maintenance_step_id?: string;
	},
) {
	surfacedOutcomeCounter += 1;
	const surfacedAt =
		input.surfaced_at ??
		`2026-04-10T1${surfacedOutcomeCounter % 10}:00:00.000Z`;
	const closedAt =
		input.closed_at ?? `2026-04-10T1${surfacedOutcomeCounter % 10}:30:00.000Z`;
	service.db.upsertSurfacedWorkOutcome({
		outcome_id: `surfaced-outcome-${surfacedOutcomeCounter}`,
		surface: input.surface,
		surfaced_state: input.surfaced_state,
		target_type: input.target_type,
		target_id: input.target_id,
		assistant_action_id: input.assistant_action_id,
		planning_recommendation_id: input.planning_recommendation_id,
		repair_step_id: input.repair_step_id as any,
		maintenance_step_id: input.maintenance_step_id as any,
		summary_snapshot: `${input.target_type}:${input.target_id}`,
		command_snapshot: "personal-ops test",
		surfaced_at: surfacedAt,
		last_seen_at: surfacedAt,
		state: input.state,
		evidence_kind: input.evidence_kind,
		acted_at: closedAt,
		closed_at: closedAt,
	});
}

function withMockedNow<T>(isoTimestamp: string, run: () => T): T {
	const originalNow = Date.now;
	Date.now = () => Date.parse(isoTimestamp);
	let restored = false;
	let deferRestore = false;
	const restore = () => {
		if (!restored) {
			Date.now = originalNow;
			restored = true;
		}
	};
	try {
		const result = run();
		if (result && typeof (result as { then?: unknown }).then === "function") {
			deferRestore = true;
			return (result as unknown as Promise<unknown>).finally(() => {
				restore();
			}) as unknown as T;
		}
		return result;
	} finally {
		if (!deferRestore) {
			restore();
		}
	}
}

function buildWorkflowRecommendation(
	recommendationId: string,
	input: Partial<PlanningRecommendation> &
		Pick<PlanningRecommendation, "kind" | "reason_summary">,
): PlanningRecommendation {
	return {
		recommendation_id: recommendationId,
		kind: input.kind,
		status: input.status ?? "pending",
		priority: input.priority ?? "normal",
		source: input.source ?? "system_generated",
		suggested_by_client: input.suggested_by_client ?? "workflow-test",
		suggested_by_actor: input.suggested_by_actor,
		created_at: input.created_at ?? "2026-04-10T12:00:00.000Z",
		updated_at:
			input.updated_at ?? input.created_at ?? "2026-04-10T12:00:00.000Z",
		reason_summary: input.reason_summary,
		reason_code: input.reason_code ?? "task_due_soon",
		dedupe_key: input.dedupe_key ?? `workflow:${recommendationId}`,
		source_fingerprint:
			input.source_fingerprint ?? `fingerprint:${recommendationId}`,
		rank_score: input.rank_score ?? 500,
		rank_reason: input.rank_reason,
		ranking_version: input.ranking_version ?? "workflow-test",
		group_key: input.group_key,
		group_summary: input.group_summary,
		proposed_title: input.proposed_title,
		proposed_notes: input.proposed_notes,
		proposed_calendar_id: input.proposed_calendar_id,
		proposed_start_at: input.proposed_start_at,
		proposed_end_at: input.proposed_end_at,
		snoozed_until: input.snoozed_until,
		source_task_id: input.source_task_id,
		source_thread_id: input.source_thread_id,
		source_calendar_event_id: input.source_calendar_event_id,
		source_last_seen_at:
			input.source_last_seen_at ?? "2026-04-10T12:00:00.000Z",
		first_action_at: input.first_action_at,
		first_action_type: input.first_action_type,
		close_reason_code: input.close_reason_code,
		closed_by_client: input.closed_by_client,
		closed_by_actor: input.closed_by_actor,
		closed_at: input.closed_at,
		outcome_state: input.outcome_state ?? "none",
		outcome_recorded_at: input.outcome_recorded_at,
		outcome_source: input.outcome_source,
		outcome_summary: input.outcome_summary,
		slot_state: input.slot_state ?? "ready",
		slot_state_reason: input.slot_state_reason,
		slot_reason: input.slot_reason,
		trigger_signals: input.trigger_signals ?? [],
		suppressed_signals: input.suppressed_signals ?? [],
		replan_count: input.replan_count ?? 0,
		last_replanned_at: input.last_replanned_at,
		decision_reason_code: input.decision_reason_code,
		decision_note: input.decision_note,
		applied_task_id: input.applied_task_id,
		applied_calendar_event_id: input.applied_calendar_event_id,
		last_error_code: input.last_error_code,
		last_error_message: input.last_error_message,
	};
}

function buildWorkflowRecommendationDetail(
	recommendation: PlanningRecommendation,
	options: {
		taskDueAt?: string;
		eventStartAt?: string;
	} = {},
): PlanningRecommendationDetail {
	return {
		recommendation,
		task: options.taskDueAt
			? ({
					task_id: recommendation.source_task_id ?? "task-1",
					due_at: options.taskDueAt,
				} as any)
			: undefined,
		thread: recommendation.source_thread_id
			? ({
					thread_id: recommendation.source_thread_id,
				} as any)
			: undefined,
		event: options.eventStartAt
			? ({
					event_id: recommendation.source_calendar_event_id ?? "event-1",
					start_at: options.eventStartAt,
				} as any)
			: undefined,
		applied_task: undefined,
		applied_event: undefined,
		ranking_reason: recommendation.rank_reason,
		slot_reason:
			recommendation.slot_state === "ready"
				? "Slot is ready."
				: "Slot needs manual scheduling.",
		trigger_signals: recommendation.trigger_signals,
		suppressed_signals: recommendation.suppressed_signals,
		source_resolved_since_created: false,
		applied_task_current_state: undefined,
		related_audit_events: [],
	};
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
	fs.writeFileSync(
		path.join(paths.appDir, "package.json"),
		JSON.stringify({ version: "0.1.0-test" }),
		"utf8",
	);

	const config: Config = {
		serviceHost: "127.0.0.1",
		servicePort: 46210,
		allowedOrigins: [],
		autopilotEnabled: true,
		autopilotMode: "continuous",
		autopilotRunIntervalMinutes: 5,
		autopilotWarmOnConsoleOpen: true,
		autopilotWarmOnDesktopOpen: true,
		autopilotProfiles: [
			"day_start",
			"inbox",
			"meetings",
			"planning",
			"outbound",
		],
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
				: {
						provider_message_id: `message-${providerDraftId}`,
						provider_thread_id: "thread-1",
					},
		updateGmailDraft: async () =>
			options.updateImpl ? options.updateImpl() : "provider-draft-1",
		createGmailDraft: async () => "provider-draft-1",
		getGmailProfile: async () => ({
			oauthClient: {} as never,
			profile: {
				emailAddress: accountEmail,
				historyId: options.profileHistoryId ?? "2000",
			},
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
			options.driveScopesImpl
				? options.driveScopesImpl(tokensJson, activeClientConfig)
				: [],
		syncDriveScope: async (tokensJson, activeClientConfig, activeConfig) =>
			options.driveSyncImpl
				? options.driveSyncImpl(tokensJson, activeClientConfig, activeConfig)
				: { files: [], docs: [], sheets: [] },
		getGoogleDoc: async () => null,
		listGmailMessageRefsByLabel: async (
			_tokensJson,
			_clientConfig,
			labelId,
			pageToken,
		) =>
			options.listRefsImpl
				? options.listRefsImpl(labelId, pageToken)
				: { message_ids: [] },
		getGmailMessageMetadata: async (_tokensJson, _clientConfig, messageId) => {
			if (options.metadataImpl) {
				return options.metadataImpl(messageId);
			}
			throw new Error(`No metadata stub for ${messageId}.`);
		},
		listGmailHistory: async (
			_tokensJson,
			_clientConfig,
			startHistoryId,
			pageToken,
		) =>
			options.historyImpl
				? options.historyImpl(startHistoryId, pageToken)
				: { records: [], history_id: startHistoryId },
		listGoogleCalendarSources: async (_tokensJson, _clientConfig, pageToken) =>
			options.listCalendarsImpl
				? options.listCalendarsImpl(pageToken)
				: { calendars: [] },
		listGoogleCalendarEvents: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			calendarOptions,
		) =>
			options.listCalendarEventsImpl
				? options.listCalendarEventsImpl(calendarId, calendarOptions)
				: { events: [] },
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
				: {
						repositories_scanned_count: repositories.length,
						pull_requests: [],
					},
		setKeychainSecret: (serviceName, accountName, secret) => {
			keychainSecrets.set(`${serviceName}:${accountName}`, secret);
		},
		getKeychainSecret: (serviceName, accountName) =>
			keychainSecrets.get(`${serviceName}:${accountName}`) ?? null,
		deleteKeychainSecret: (serviceName, accountName) => {
			keychainSecrets.delete(`${serviceName}:${accountName}`);
		},
		getGoogleCalendarEvent: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			providerEventId,
		) => {
			if (options.getCalendarEventImpl) {
				return options.getCalendarEventImpl(calendarId, providerEventId);
			}
			throw new Error(
				`No calendar get stub for ${calendarId}:${providerEventId}.`,
			);
		},
		createGoogleCalendarEvent: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			input,
		) => {
			if (options.createCalendarEventImpl) {
				return options.createCalendarEventImpl(calendarId, input);
			}
			throw new Error(`No calendar create stub for ${calendarId}.`);
		},
		patchGoogleCalendarEvent: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			providerEventId,
			input,
		) => {
			if (options.patchCalendarEventImpl) {
				return options.patchCalendarEventImpl(
					calendarId,
					providerEventId,
					input,
				);
			}
			throw new Error(
				`No calendar patch stub for ${calendarId}:${providerEventId}.`,
			);
		},
		cancelGoogleCalendarEvent: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			providerEventId,
		) => {
			if (options.cancelCalendarEventImpl) {
				await options.cancelCalendarEventImpl(calendarId, providerEventId);
				return;
			}
			throw new Error(
				`No calendar cancel stub for ${calendarId}:${providerEventId}.`,
			);
		},
		openExternalUrl: () => {},
	});
	service.db.upsertMailAccount(
		accountEmail,
		config.keychainService,
		JSON.stringify({ emailAddress: accountEmail }),
	);

	return { paths, service, accountEmail, config, policy };
}

function createDraft(
	service: PersonalOpsService,
	accountEmail: string,
	overrides: Partial<{
		subject: string;
		body_text: string;
		to: string[];
		providerDraftId: string;
	}> = {},
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

function buildMessage(
	messageId: string,
	accountEmail: string,
	overrides: Partial<GmailMessageMetadata> = {},
): GmailMessageMetadata {
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
	const startAt =
		overrides.start_at ?? new Date(Date.now() + 30 * 60 * 1000).toISOString();
	return {
		event_id: eventId,
		calendar_id: calendarId,
		summary: overrides.summary ?? `Event ${eventId}`,
		status: overrides.status ?? "confirmed",
		start_at: startAt,
		end_at:
			overrides.end_at ??
			new Date(Date.parse(startAt) + 60 * 60 * 1000).toISOString(),
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

function seedMailboxReadyState(
	service: PersonalOpsService,
	accountEmail: string,
	historyId = "ready-1",
): void {
	service.db.upsertMailSyncState(accountEmail, "gmail", {
		status: "ready",
		last_history_id: historyId,
		last_synced_at: new Date().toISOString(),
		last_seeded_at: new Date().toISOString(),
		last_sync_refreshed_count: 0,
		last_sync_deleted_count: 0,
	});
}

function seedPlanningAutopilotFixture(
	service: PersonalOpsService,
	accountEmail: string,
) {
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
	const taskRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
	const followupRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
	const eventRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
	(service as any).refreshPlanningRecommendationReadModel();
	return {
		task,
		taskRecommendation,
		followupRecommendation,
		eventRecommendation,
	};
}

function installReviewSourceFixtures(
	service: PersonalOpsService,
	options?: {
		inboxGroups?: Array<{
			group_id: string;
			summary: string;
			why_now: string;
			score_band: "highest" | "high" | "medium";
			state: string;
		}>;
		planningBundles?: Array<{
			bundle_id: string;
			summary: string;
			why_now: string;
			score_band: "highest" | "high" | "medium";
			state: string;
			apply_ready?: boolean;
		}>;
		outboundGroups?: Array<{
			group_id: string;
			summary: string;
			why_now: string;
			score_band: "highest" | "high" | "medium";
			state: string;
		}>;
		meetingPackets?: Array<{ event_id: string; summary: string }>;
	},
) {
	let inboxGroups =
		options?.inboxGroups ??
		Array.from({ length: 4 }, (_, index) => ({
			group_id: `inbox-group-${index + 1}`,
			summary: `Inbox review group ${index + 1}`,
			why_now: `Inbox reason ${index + 1}`,
			score_band: index === 0 ? "highest" : "high",
			state: "awaiting_review",
		}));
	let planningBundles =
		options?.planningBundles ??
		Array.from({ length: 4 }, (_, index) => ({
			bundle_id: `planning-bundle-${index + 1}`,
			summary: `Planning bundle ${index + 1}`,
			why_now: `Planning reason ${index + 1}`,
			score_band: index === 0 ? "highest" : "high",
			state: "awaiting_review",
			apply_ready: index % 2 === 0,
		}));
	let outboundGroups =
		options?.outboundGroups ??
		Array.from({ length: 4 }, (_, index) => ({
			group_id: `outbound-group-${index + 1}`,
			summary: `Outbound group ${index + 1}`,
			why_now: `Outbound reason ${index + 1}`,
			score_band: index === 0 ? "highest" : "high",
			state: index % 2 === 0 ? "send_ready" : "approval_ready",
		}));
	let meetingPackets =
		options?.meetingPackets ??
		Array.from({ length: 4 }, (_, index) => ({
			event_id: `meeting-event-${index + 1}`,
			summary: `Meeting prep packet ${index + 1}`,
		}));

	(service as any).collectDoctorChecks = async () => [];
	(service as any).getInboxAutopilotReport = async () => ({
		groups: inboxGroups,
	});
	(service as any).getPlanningAutopilotReport = async () => ({
		bundles: planningBundles,
	});
	(service as any).getOutboundAutopilotReport = async () => ({
		groups: outboundGroups,
	});
	(service.db as any).listMeetingPrepPackets = () => meetingPackets;
	(service as any).getCalendarEventDetail = (
		eventId: string,
	): GoogleCalendarEventMetadata =>
		buildCalendarEventMetadata(eventId, "primary", {
			summary: `Meeting ${eventId}`,
			start_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
			end_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
		});

	return {
		setInboxGroups(next: typeof inboxGroups) {
			inboxGroups = next;
		},
		setPlanningBundles(next: typeof planningBundles) {
			planningBundles = next;
		},
		setOutboundGroups(next: typeof outboundGroups) {
			outboundGroups = next;
		},
		setMeetingPackets(next: typeof meetingPackets) {
			meetingPackets = next;
		},
	};
}

const cliIdentity: ClientIdentity = {
	client_id: "operator-cli",
	requested_by: "operator",
	auth_role: "operator",
};
const mcpIdentity: ClientIdentity = {
	client_id: "codex-mcp",
	origin: "assistant-mcp",
	requested_by: "codex",
	auth_role: "assistant",
};

test("service classifies ready, setup_required, and degraded states", () => {
	const { service } = createFixture();
	const classifyState = (
		service as unknown as { classifyState(checks: DoctorCheck[]): string }
	).classifyState.bind(service);

	const passSetupChecks: DoctorCheck[] = [
		{
			id: "oauth_client_configured",
			title: "",
			severity: "pass",
			message: "",
			category: "setup",
		},
		{
			id: "configured_mailbox_present",
			title: "",
			severity: "pass",
			message: "",
			category: "setup",
		},
		{
			id: "keychain_item_present",
			title: "",
			severity: "pass",
			message: "",
			category: "setup",
		},
		{
			id: "connected_mailbox_matches",
			title: "",
			severity: "pass",
			message: "",
			category: "setup",
		},
	];

	assert.equal(classifyState(passSetupChecks), "ready");
	const warnCheck: DoctorCheck = { ...passSetupChecks[0]!, severity: "warn" };
	const failCheck: DoctorCheck = { ...passSetupChecks[0]!, severity: "fail" };
	assert.equal(
		classifyState([warnCheck, ...passSetupChecks.slice(1)]),
		"setup_required",
	);
	assert.equal(
		classifyState([failCheck, ...passSetupChecks.slice(1)]),
		"degraded",
	);
});

test("review open is operator-only and audits the real caller", () => {
	const { service, accountEmail } = createFixture();
	const draft = createDraft(service, accountEmail);
	const review = service.db.createReviewItem(draft.artifact_id);

	assert.throws(
		() => service.openReview(mcpIdentity, review.review_id),
		/operator channel/i,
	);
	const opened = service.openReview(cliIdentity, review.review_id);

	assert.equal(opened.review_item.review_id, review.review_id);
	assert.equal(opened.artifact_id, draft.artifact_id);
	assert.match(opened.gmail_review_url, /mail\.google\.com/);
	const audit = service.listAuditEvents({
		limit: 10,
		action: "review_queue_open",
	});
	assert.equal(audit[0]?.client_id, "operator-cli");
});

test("health is shallow and normalization is daemon-owned", () => {
	const { service, accountEmail } = createFixture();
	const draft = createDraft(service, accountEmail);
	const approval = service.requestApproval(
		cliIdentity,
		draft.artifact_id,
		"Need approval",
	);
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
	const rawDb = (
		service.db as unknown as {
			db: { prepare(sql: string): { run(...args: unknown[]): void } };
		}
	).db;
	rawDb
		.prepare(`UPDATE send_windows SET expires_at = ? WHERE window_id = ?`)
		.run(new Date(Date.now() - 60_000).toISOString(), window.window_id);

	service.health();
	assert.equal(
		service.db.getApprovalRequest(approval.approval_id)?.state,
		"sending",
	);
	assert.equal(service.db.getActiveSendWindow()?.state, "active");

	service.normalizeRuntimeState();
	assert.equal(
		service.db.getApprovalRequest(approval.approval_id)?.state,
		"send_failed",
	);
	assert.equal(service.db.getActiveSendWindow(), null);
});

test("service assembles review detail with related audit events", () => {
	const { service, accountEmail } = createFixture();
	const draft = createDraft(service, accountEmail, {
		subject: "Review detail",
	});
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
	assert.equal(
		fs.existsSync(
			path.join(paths.snapshotsDir, manifest.snapshot_id, "manifest.json"),
		),
		true,
	);

	const snapshots = service.listSnapshots();
	assert.equal(snapshots.length, 1);
	assert.equal(snapshots[0]?.snapshot_id, manifest.snapshot_id);

	const inspection = service.inspectSnapshot(manifest.snapshot_id);
	assert.equal(inspection.manifest.snapshot_id, manifest.snapshot_id);
	assert.equal(
		inspection.files.every((file) => file.exists),
		true,
	);
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
	service.requestApproval(
		cliIdentity,
		approvalDraft.artifact_id,
		"Need approval",
	);
	service.createTask(cliIdentity, {
		title: "Assistant queue planning task",
		kind: "human_reminder",
		priority: "high",
		owner: "operator",
		due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
	});
	service.refreshPlanningRecommendations(cliIdentity);

	const queue = await service.getAssistantActionQueueReport({
		httpReachable: true,
	});
	const actionIds = queue.actions.map((action) => action.action_id);
	const topAttention = queue.actions.find(
		(action) => action.action_id === "assistant.review-top-attention",
	);

	assert.equal(actionIds.includes("assistant.sync-workspace"), true);
	assert.equal(actionIds.includes("assistant.create-snapshot"), true);
	assert.equal(actionIds.includes("assistant.review-top-attention"), false);
	assert.equal(
		actionIds.includes("assistant.review-planning") ||
			actionIds.some((actionId) =>
				actionId.startsWith("assistant.prepare-planning-bundle:"),
			),
		true,
	);
	assert.equal(
		actionIds.some((actionId) =>
			actionId.startsWith("assistant.review-outbound-group:"),
		),
		true,
	);
	assert.equal(actionIds.includes("assistant.review-approvals"), false);
	assert.equal(actionIds.includes("assistant.review-drafts"), true);
	assert.equal(
		queue.actions.find(
			(action) => action.action_id === "assistant.create-snapshot",
		)?.one_click,
		true,
	);
	assert.equal(topAttention, undefined);
});

test("assistant queue runs safe snapshot actions and keeps review actions gated", async () => {
	const { service } = createFixture();

	const snapshotResult = await service.runAssistantQueueAction(
		cliIdentity,
		"assistant.create-snapshot",
	);
	assert.equal(snapshotResult.state, "completed");
	assert.equal(snapshotResult.summary.includes("Created snapshot"), true);
	assert.equal(service.listSnapshots().length, 1);

	await assert.rejects(
		() =>
			service.runAssistantQueueAction(
				cliIdentity,
				"assistant.review-top-attention",
			),
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
	const replyGroups = report.groups.filter(
		(group) => group.kind === "needs_reply",
	);
	const followupGroups = report.groups.filter(
		(group) => group.kind === "waiting_to_nudge",
	);
	const queue = await service.getAssistantActionQueueReport({
		httpReachable: true,
	});

	assert.equal(replyGroups.length, 2);
	assert.equal(followupGroups.length, 2);
	assert.equal(
		report.groups.every((group) => group.threads.length <= 3),
		true,
	);
	assert.equal(
		new Set(
			report.groups.flatMap((group) =>
				group.threads.map((thread) => thread.thread_id),
			),
		).size,
		8,
	);
	assert.equal(
		queue.actions.some((action) =>
			action.action_id.startsWith("assistant.prepare-reply-group:"),
		),
		true,
	);
	assert.equal(
		queue.actions.some((action) =>
			action.action_id.startsWith("assistant.prepare-followup-group:"),
		),
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

	const initialReport = await service.getInboxAutopilotReport({
		httpReachable: true,
	});
	const initialGroup = initialReport.groups.find(
		(group) => group.kind === "needs_reply",
	);
	assert.ok(initialGroup);

	const firstPrepare = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		initialGroup!.group_id,
	);
	assert.equal(firstPrepare.success, true);
	assert.equal(firstPrepare.drafts.length, 1);
	const firstDraft = firstPrepare.drafts[0]!;
	assert.equal(firstDraft.assistant_generated, true);
	assert.equal(firstDraft.assistant_source_thread_id, "thread-reply-refresh");
	assert.equal(firstDraft.assistant_group_id, initialGroup!.group_id);

	const secondPrepare = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		initialGroup!.group_id,
	);
	assert.equal(secondPrepare.success, true);
	assert.equal(secondPrepare.drafts[0]?.artifact_id, firstDraft.artifact_id);
	assert.equal(
		service.db.listDraftArtifactsByAssistantSourceThread("thread-reply-refresh")
			.length,
		1,
	);

	const approval = service.requestApproval(
		cliIdentity,
		firstDraft.artifact_id,
		"Ready for approval",
	);
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

	const refreshedReport = await service.getInboxAutopilotReport({
		httpReachable: true,
	});
	const refreshedGroup = refreshedReport.groups.find(
		(group) => group.kind === "needs_reply",
	);
	assert.ok(refreshedGroup);
	const refreshed = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		refreshedGroup!.group_id,
	);
	const refreshedDraft = refreshed.drafts[0]!;

	assert.equal(refreshedDraft.artifact_id, firstDraft.artifact_id);
	assert.equal(refreshedDraft.subject, "Updated reply needed");
	assert.equal(
		service.db.listDraftArtifactsByAssistantSourceThread("thread-reply-refresh")
			.length,
		1,
	);
	assert.equal(
		service.db.getApprovalRequest(approval.approval_id)?.state,
		"expired",
	);
	assert.equal(
		service.db.getDraftArtifact(firstDraft.artifact_id)?.review_state,
		"pending",
	);
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
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "no_preventive_work" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
			items: [],
		}),
		listPlanningRecommendations:
			service.listPlanningRecommendations.bind(service),
		listNeedsReplyThreads: service.listNeedsReplyThreads.bind(service),
		listFollowupThreads: service.listFollowupThreads.bind(service),
		listUpcomingCalendarEvents:
			service.listUpcomingCalendarEvents.bind(service),
		compareNextActionableRecommendations: () => 0,
		getPlanningRecommendationDetail:
			service.getPlanningRecommendationDetail.bind(service),
		getInboxAutopilotReport: service.getInboxAutopilotReport.bind(service),
		getRelatedDocsForTarget: service.getRelatedDocsForTarget.bind(service),
	};

	const followUpBlock = await buildFollowUpBlockWorkflowReport(fakeService, {
		httpReachable: true,
	});
	const nowNext = await buildNowNextWorkflowReport(fakeService, {
		httpReachable: true,
	});
	const prepDay = await buildPrepDayWorkflowReport(fakeService, {
		httpReachable: true,
	});

	assert.equal(
		followUpBlock.sections[0]?.items[0]?.target_type,
		"inbox_autopilot_group",
	);
	assert.equal(nowNext.actions[0]?.target_type, "inbox_autopilot_group");
	assert.equal(prepDay.actions[0]?.target_type, "inbox_autopilot_group");
});

test("approval request resolves review items and moves draft into approval pending", () => {
	const { service, accountEmail } = createFixture();
	const draft = createDraft(service, accountEmail);
	const review = service.db.createReviewItem(draft.artifact_id);

	const approval = service.requestApproval(
		cliIdentity,
		draft.artifact_id,
		"Need approval",
	);

	assert.equal(approval.state, "pending");
	assert.equal(
		service.db.getDraftArtifact(draft.artifact_id)?.status,
		"approval_pending",
	);
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

	const approval = service.requestApproval(
		cliIdentity,
		draft.artifact_id,
		"Ready for signoff",
	);
	const approveConfirmation = service.confirmApprovalAction(
		cliIdentity,
		approval.approval_id,
		"approve",
	);
	const approved = service.approveRequest(
		mcpIdentity,
		approval.approval_id,
		"Looks good",
		approveConfirmation.confirmation_token,
	);
	assert.equal(approved.approval_request.state, "approved");

	const sendConfirmation = service.confirmApprovalAction(
		cliIdentity,
		approval.approval_id,
		"send",
	);
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
		() =>
			service.sendApprovedDraft(
				mcpIdentity,
				approval.approval_id,
				"Retry",
				sendConfirmation.confirmation_token,
			),
		/cannot be sent from state sent/i,
	);
});

test("send is blocked when allow_send is false and provider is never called", async () => {
	let sendCount = 0;
	const { service, accountEmail } = createFixture({
		allowSend: false,
		sendImpl: async () => {
			sendCount += 1;
			return {
				provider_message_id: "message-1",
				provider_thread_id: "thread-1",
			};
		},
	});
	const draft = createDraft(service, accountEmail);
	const approval = service.requestApproval(
		cliIdentity,
		draft.artifact_id,
		"Need approval",
	);
	service.approveRequest(cliIdentity, approval.approval_id, "Approved in CLI");

	await assert.rejects(
		() =>
			service.sendApprovedDraft(
				cliIdentity,
				approval.approval_id,
				"Still blocked",
			),
		/sending is disabled/i,
	);
	assert.equal(sendCount, 0);
	assert.equal(
		service.db.getApprovalRequest(approval.approval_id)?.state,
		"approved",
	);
});

test("changing a draft after approval request expires the active approval", async () => {
	const { service, accountEmail } = createFixture();
	const draft = createDraft(service, accountEmail);
	const approval = service.requestApproval(
		cliIdentity,
		draft.artifact_id,
		"Need approval",
	);

	await service.updateDraft(cliIdentity, draft.artifact_id, {
		to: ["person@example.com"],
		cc: [],
		bcc: [],
		subject: "Updated subject",
		body_text: "updated body",
	});

	assert.equal(
		service.db.getApprovalRequest(approval.approval_id)?.state,
		"expired",
	);
	assert.equal(service.db.getDraftArtifact(draft.artifact_id)?.status, "draft");
});

test("stale sending approvals recover only through normalization, not read paths", () => {
	const { service, accountEmail } = createFixture({ allowSend: true });
	const draft = createDraft(service, accountEmail);
	const approval = service.requestApproval(
		cliIdentity,
		draft.artifact_id,
		"Need approval",
	);
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
			return {
				provider_message_id: `message-${providerDraftId}`,
				provider_thread_id: "thread-2",
			};
		},
	});
	const draft = createDraft(service, accountEmail);
	const approval = service.requestApproval(
		cliIdentity,
		draft.artifact_id,
		"Need approval",
	);
	service.approveRequest(cliIdentity, approval.approval_id, "Approved");
	const window = service.enableSendWindow(
		cliIdentity,
		15,
		"Supervised live send",
	);
	assert.equal(
		service.getSendWindowStatus().active_window?.window_id,
		window.window_id,
	);

	const sent = await service.sendApprovedDraft(
		cliIdentity,
		approval.approval_id,
		"Sending during timed window",
	);
	assert.equal(sendCount, 1);
	assert.equal(sent.approval_request.state, "sent");
});

test("approval reopen clears send error state and cancel returns draft to draft state", () => {
	const { service, accountEmail } = createFixture();
	const draft = createDraft(service, accountEmail);
	const approval = service.requestApproval(
		cliIdentity,
		draft.artifact_id,
		"Need approval",
	);
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

	const reopened = service.reopenApproval(
		cliIdentity,
		approval.approval_id,
		"Confirmed safe to retry",
	);
	assert.equal(reopened.approval_request.state, "approved");
	assert.equal(reopened.draft.status, "approved");

	const canceled = service.cancelApproval(
		cliIdentity,
		approval.approval_id,
		"No longer needed",
	);
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
			message_ids:
				labelId === "INBOX" ? [oldUnread.message_id] : [oldFollowup.message_id],
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
	assert.equal(
		worklist.items.some((item) => item.kind === "inbox_unread_old"),
		true,
	);
	assert.equal(
		worklist.items.some(
			(item) => item.kind === "planning_recommendation_pending",
		),
		true,
	);
	assert.equal(
		worklist.items.some((item) => item.kind === "thread_stale_followup"),
		false,
	);
	assert.equal(
		worklist.items.some((item) => item.kind === "thread_needs_reply"),
		false,
	);
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
				records: [
					{
						message_ids_to_refresh: [inboxMessage.message_id],
						message_ids_deleted: [],
					},
				],
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
	const snoozed = service.snoozeTask(
		cliIdentity,
		created.task_id,
		new Date(Date.now() + 30 * 60 * 1000).toISOString(),
		"After lunch",
	);
	assert.ok(snoozed.remind_at);
	const completed = service.completeTask(
		cliIdentity,
		created.task_id,
		"Booked",
	);
	assert.equal(completed.state, "completed");
	assert.equal(service.listDueTasks().length, 0);

	const second = service.createTask(cliIdentity, {
		title: "Cancel old gym membership",
		kind: "human_reminder",
		priority: "low",
		owner: "operator",
	});
	const canceled = service.cancelTask(
		cliIdentity,
		second.task_id,
		"No longer needed",
	);
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

	const rawDb = (
		service.db as unknown as {
			db: { prepare(sql: string): { run(...args: unknown[]): void } };
		}
	).db;
	rawDb
		.prepare(
			`UPDATE task_suggestions SET created_at = ?, updated_at = ? WHERE suggestion_id = ?`,
		)
		.run(
			new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
			new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
			stalePending.suggestion_id,
		);

	const accepted = service.acceptTaskSuggestion(
		cliIdentity,
		acceptedSource.suggestion_id,
		"Track this",
	);
	assert.equal(accepted.suggestion.status, "accepted");
	assert.ok(accepted.accepted_task);
	assert.equal(accepted.accepted_task?.source, "accepted_suggestion");
	assert.equal(
		accepted.accepted_task?.source_suggestion_id,
		acceptedSource.suggestion_id,
	);

	const rejected = service.rejectTaskSuggestion(
		cliIdentity,
		rejectedSource.suggestion_id,
		"Not needed",
	);
	assert.equal(rejected.suggestion.status, "rejected");

	const worklist = await service.getWorklistReport({ httpReachable: true });
	assert.equal(
		worklist.items.some(
			(item) =>
				item.kind === "task_suggestion_pending" && item.severity === "warn",
		),
		true,
	);
	assert.equal(
		worklist.items.some((item) => item.kind === "task_due_soon"),
		true,
	);

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
	service.acceptTaskSuggestion(
		cliIdentity,
		acceptedSuggestion.suggestion_id,
		"Keep it",
	);
	service.rejectTaskSuggestion(
		cliIdentity,
		rejectedSuggestion.suggestion_id,
		"Skip it",
	);

	const rawDb = (
		service.db as unknown as {
			db: { prepare(sql: string): { run(...args: unknown[]): void } };
		}
	).db;
	const oldIso = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
	rawDb
		.prepare(`UPDATE tasks SET updated_at = ? WHERE task_id = ?`)
		.run(oldIso, done.task_id);
	rawDb
		.prepare(
			`UPDATE task_suggestions SET updated_at = ? WHERE suggestion_id = ?`,
		)
		.run(oldIso, acceptedSuggestion.suggestion_id);
	rawDb
		.prepare(
			`UPDATE task_suggestions SET updated_at = ? WHERE suggestion_id = ?`,
		)
		.run(oldIso, rejectedSuggestion.suggestion_id);

	assert.equal(
		service
			.listTasks()
			.map((task) => task.task_id)
			.includes(pending.task_id),
		true,
	);
	assert.equal(
		service
			.listTasks()
			.map((task) => task.task_id)
			.includes(done.task_id),
		false,
	);
	assert.equal(service.listTaskSuggestions().length, 0);
	assert.equal(
		service.listTaskSuggestions({ include_resolved: true }).length,
		2,
	);

	const taskPrune = service.pruneTaskHistory(cliIdentity, 30);
	const suggestionPrune = service.pruneTaskSuggestionHistory(cliIdentity, 30);
	assert.equal(taskPrune.removed_count, 1);
	assert.equal(suggestionPrune.removed_count, 2);
	assert.equal(service.db.getTask(done.task_id), null);
	assert.equal(
		service.db.getTaskSuggestion(acceptedSuggestion.suggestion_id),
		null,
	);
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
	assert.equal(
		status.machine.last_restore?.source_machine_label,
		"remote-machine",
	);

	const doctor = await service.runDoctor({ deep: false, httpReachable: true });
	assert.equal(
		doctor.checks.some(
			(check) => check.id === "state_origin_safe" && check.severity === "warn",
		),
		true,
	);
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
		[
			"2026-03-29T18-00-00Z",
			latestDir,
			new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
		],
		[
			"2026-03-27T18-00-00Z",
			path.join(paths.snapshotsDir, "2026-03-27T18-00-00Z"),
			localDate(2, 18),
		],
		[
			"2026-03-27T08-00-00Z",
			path.join(paths.snapshotsDir, "2026-03-27T08-00-00Z"),
			localDate(2, 8),
		],
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
			config_paths: [
				path.join(snapshotDir, "config.toml"),
				path.join(snapshotDir, "policy.toml"),
			],
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
		fs.writeFileSync(
			path.join(snapshotDir, "manifest.json"),
			JSON.stringify(manifest, null, 2),
			"utf8",
		);
	}
	writeRecoveryRehearsalStamp(paths, {
		successful_at: localDate(16, 9),
		app_version: "0.1.0-test",
		command_name: "npm run verify:recovery",
	});

	const doctor = await service.runDoctor({ deep: false, httpReachable: true });
	assert.equal(
		doctor.checks.some(
			(check) => check.id === "snapshot_freshness" && check.severity === "pass",
		),
		true,
	);
	assert.equal(
		doctor.checks.some(
			(check) =>
				check.id === "snapshot_retention_pressure" && check.severity === "warn",
		),
		true,
	);
	assert.equal(
		doctor.checks.some(
			(check) =>
				check.id === "recovery_rehearsal_freshness" &&
				check.severity === "warn",
		),
		true,
	);
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
			message_ids:
				labelId === "INBOX"
					? [inboundRecent.message_id]
					: [outboundWaiting.message_id],
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
	assert.equal(
		report.checks.some(
			(check) =>
				check.id === "mail_history_id_present" && check.severity === "fail",
		),
		true,
	);
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

	service.db.upsertMailAccount(
		accountEmail,
		"personal-ops.gmail.test",
		JSON.stringify({ emailAddress: accountEmail }),
	);
	const report = await service.runDoctor({ deep: true, httpReachable: true });

	const metadataCheck = report.checks.find(
		(check) => check.id === "deep_gmail_metadata_access",
	);
	const calendarCheck = report.checks.find(
		(check) => check.id === "deep_google_calendar_access",
	);
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
	assert.equal(
		(await service.getStatusReport({ httpReachable: true })).calendar
			.sync_status,
		"ready",
	);
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
	assert.equal(
		worklist.items.some((item) => item.kind === "calendar_conflict"),
		true,
	);
	assert.equal(
		worklist.items.some((item) =>
			[
				"task_schedule_pressure",
				"planning_recommendation_pending",
				"planning_recommendation_group",
			].includes(item.kind),
		),
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

	const updated = await service.updateCalendarEvent(
		cliIdentity,
		created.event_id,
		{
			title: "Updated Focus Block",
			location: "Office",
		},
	);
	assert.equal(updated.summary, "Updated Focus Block");
	assert.equal(updated.location, "Office");
	assert.equal(updated.last_write_by_client, "operator-cli");

	const canceled = await service.cancelCalendarEvent(
		cliIdentity,
		created.event_id,
		"No longer needed",
	);
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
				end_at:
					input.end_at ??
					new Date(Date.parse(scheduledStart) + 60 * 60 * 1000).toISOString(),
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

	const scheduled = await service.scheduleTaskOnCalendar(
		cliIdentity,
		task.task_id,
		{
			start_at: scheduledStart,
			end_at: new Date(
				Date.parse(scheduledStart) + 60 * 60 * 1000,
			).toISOString(),
		},
	);
	assert.equal(
		scheduled.task.scheduled_calendar_event_id,
		scheduled.event.event_id,
	);
	assert.equal(scheduled.event.source_task_id, task.task_id);
	await assert.rejects(
		service.scheduleTaskOnCalendar(cliIdentity, task.task_id, {
			start_at: scheduledStart,
			end_at: new Date(
				Date.parse(scheduledStart) + 60 * 60 * 1000,
			).toISOString(),
		}),
		/already has a scheduled calendar event/i,
	);

	const unscheduled = await service.unscheduleTaskFromCalendar(
		cliIdentity,
		task.task_id,
		"Rescheduling later",
	);
	assert.equal(unscheduled.task.scheduled_calendar_event_id, undefined);
	assert.equal(canceledProviderEventId, "provider-task-1");
	assert.equal(service.db.getCalendarEvent(scheduled.event.event_id), null);
});

test("phase-7 worklist and doctor surface scheduling readiness and conflicts", async () => {
	const now = Date.now();
	const busyStart = new Date(now + 60 * 60 * 1000).toISOString();
	let liveEvent = buildCalendarEventMetadata(
		"provider-scheduled-1",
		"primary",
		{
			summary: "Task block",
			start_at: busyStart,
			end_at: new Date(Date.parse(busyStart) + 60 * 60 * 1000).toISOString(),
			source_task_id: "placeholder",
			created_by_personal_ops: true,
			etag: "etag-scheduled-1",
		},
	);
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
					end_at: new Date(
						Date.parse(busyStart) + 90 * 60 * 1000,
					).toISOString(),
					created_by_personal_ops: false,
				}),
			],
		}),
		createCalendarEventImpl: async (_calendarId, input) => {
			liveEvent = buildCalendarEventMetadata(
				"provider-scheduled-1",
				"primary",
				{
					summary: input.title ?? "Task block",
					start_at: input.start_at ?? busyStart,
					end_at:
						input.end_at ??
						new Date(Date.parse(busyStart) + 60 * 60 * 1000).toISOString(),
					source_task_id: input.source_task_id,
					created_by_personal_ops: true,
					etag: "etag-scheduled-1",
				},
			);
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
	assert.equal(
		worklist.items.some(
			(item) => item.kind === "planning_recommendation_pending",
		),
		true,
	);
	assert.equal(
		worklist.items.some(
			(item) =>
				item.kind === "task_unscheduled_due_soon" &&
				item.target_id === unscheduledTask.task_id,
		),
		false,
	);
	assert.equal(
		worklist.items.some(
			(item) =>
				item.kind === "scheduled_task_conflict" &&
				item.target_id === scheduledTask.task_id,
		),
		true,
	);

	const doctor = await service.runDoctor({ deep: true, httpReachable: true });
	assert.equal(
		doctor.checks.some(
			(check) =>
				check.id === "calendar_write_targets_ready" &&
				check.severity === "pass",
		),
		true,
	);
	assert.equal(
		doctor.checks.some(
			(check) =>
				check.id === "deep_google_calendar_write_access" &&
				check.severity === "pass",
		),
		true,
	);
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
	const recommendation = recommendations.find(
		(item) =>
			item.kind === "schedule_task_block" &&
			item.source_task_id === task.task_id,
	);
	assert.ok(recommendation);

	const worklist = await service.getWorklistReport({ httpReachable: true });
	assert.equal(
		worklist.items.some(
			(item) => item.kind === "planning_recommendation_pending",
		),
		true,
	);
	assert.equal(
		worklist.items.some(
			(item) =>
				item.kind === "task_unscheduled_due_soon" &&
				item.target_id === task.task_id,
		),
		false,
	);

	const applied = await service.applyPlanningRecommendation(
		cliIdentity,
		recommendation!.recommendation_id,
		"Looks good",
	);
	assert.equal(applied.recommendation.status, "applied");
	assert.equal(applied.recommendation.applied_task_id, task.task_id);
	assert.equal(
		applied.recommendation.applied_calendar_event_id,
		"primary:planned-task",
	);
	assert.equal(
		service.getTaskDetail(task.task_id).task.scheduled_calendar_event_id !==
			undefined,
		true,
	);
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
		.find(
			(item) =>
				item.kind === "schedule_thread_followup" &&
				item.source_thread_id === "thread-followup-phase8",
		);
	assert.ok(recommendation);

	const applied = await service.applyPlanningRecommendation(
		cliIdentity,
		recommendation!.recommendation_id,
		"Follow up tomorrow",
	);
	assert.equal(applied.recommendation.status, "applied");
	assert.ok(applied.recommendation.applied_task_id);
	const createdTask = service.getTaskDetail(
		applied.recommendation.applied_task_id!,
	).task;
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
		.find(
			(item) =>
				item.kind === "schedule_event_prep" &&
				item.source_calendar_event_id === "primary:event-prep-1",
		);
	assert.ok(recommendation);

	const worklist = await service.getWorklistReport({ httpReachable: true });
	assert.equal(
		worklist.items.some(
			(item) => item.kind === "planning_recommendation_pending",
		),
		true,
	);
	assert.equal(
		worklist.items.some((item) => item.kind === "calendar_event_soon"),
		false,
	);
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
		() =>
			service.applyPlanningRecommendation(
				mcpIdentity,
				detail.recommendation.recommendation_id,
				"Apply this",
			),
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
	assert.equal(
		recommendations.every((item) => item.rank_reason && item.group_key),
		true,
	);

	const groups = service.listPlanningRecommendationGroups();
	assert.equal(groups.length >= 2, true);
	assert.equal(groups[0]?.group_key, "urgent_unscheduled_tasks");

	const worklist = await service.getWorklistReport({ httpReachable: true });
	assert.equal(worklist.planning_groups.length >= 2, true);
	assert.equal(
		worklist.items.some(
			(item) => item.kind === "planning_recommendation_group",
		),
		true,
	);

	const status = await service.getStatusReport({ httpReachable: true });
	assert.equal(status.schema.compatible, true);
	assert.equal(
		status.planning_recommendations.top_group_summary !== null,
		true,
	);
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
		.find(
			(item) =>
				item.kind === "schedule_task_block" &&
				item.source_task_id === task.task_id,
		);
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

	const replanned = service.replanPlanningRecommendation(
		cliIdentity,
		recommendation!.recommendation_id,
		"Pick a safer slot",
	);
	assert.equal(replanned.recommendation.replan_count, 1);
	assert.equal(replanned.recommendation.last_replanned_at !== undefined, true);
	assert.equal(replanned.recommendation.first_action_type, "replan");
	assert.equal(replanned.recommendation.first_action_at !== undefined, true);
	assert.equal(
		replanned.recommendation.slot_reason,
		"replanned_after_conflict",
	);
	assert.notEqual(
		replanned.recommendation.proposed_start_at,
		recommendation!.proposed_start_at,
	);
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
		.find(
			(item) =>
				item.kind === "schedule_task_block" &&
				item.source_task_id === task.task_id,
		);
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
		() =>
			service.replanPlanningRecommendation(
				cliIdentity,
				recommendation!.recommendation_id,
				"Try again",
			),
		/No better time block is currently available/,
	);

	const latest = service.getPlanningRecommendationDetail(
		recommendation!.recommendation_id,
	);
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
		.find(
			(item) =>
				item.kind === "schedule_task_block" &&
				item.source_task_id === task.task_id,
		);
	assert.ok(recommendation);

	service.db.updateTask(task.task_id, {
		state: "canceled",
		decision_note: "No longer needed",
		canceled_at: new Date().toISOString(),
		completed_at: null,
	});
	assert.throws(
		() =>
			service.replanPlanningRecommendation(
				cliIdentity,
				recommendation!.recommendation_id,
				"Try to replan anyway",
			),
		/source no longer needs action/i,
	);

	const detail = service.getPlanningRecommendationDetail(
		recommendation!.recommendation_id,
	);
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
		.find(
			(item) =>
				item.kind === "schedule_task_block" &&
				item.source_task_id === task.task_id,
		);
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
	assert.equal(
		rejected.recommendation.decision_reason_code,
		"handled_elsewhere",
	);
});

test("phase-9 startup preflight rejects incompatible planning schema metadata", () => {
	const { service } = createFixture();
	(
		service.db as {
			getSchemaCompatibility: () => { compatible: boolean; message: string };
		}
	).getSchemaCompatibility = () => ({
		compatible: false,
		message: "Schema 10 is missing planning columns: slot_reason.",
	});

	assert.throws(
		() => service.assertStartupCompatibility(),
		/Startup preflight failed/,
	);
});

test("phase-9 end-of-day snooze rolls forward after work hours", () => {
	const { service } = createFixture();
	const resolved = (service as any).resolvePlanningSnoozeUntil(
		undefined,
		"end-of-day",
		new Date("2026-03-24T19:30:00-07:00"),
	);
	assert.equal(
		Date.parse(resolved) > Date.parse("2026-03-24T19:30:00-07:00"),
		true,
	);
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
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const groupedResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations?grouped=true`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase9-http-test",
				},
			},
		);
		assert.equal(groupedResponse.status, 200);
		const groupedPayload = (await groupedResponse.json()) as {
			planning_recommendation_groups?: Array<{ group_key: string }>;
		};
		assert.equal(
			(groupedPayload.planning_recommendation_groups?.length ?? 0) >= 2,
			true,
		);

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
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
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
		.find(
			(item) =>
				item.kind === "schedule_task_block" &&
				item.source_task_id === completeTask.task_id,
		);
	assert.ok(completeRecommendation);
	await service.applyPlanningRecommendation(
		cliIdentity,
		completeRecommendation!.recommendation_id,
		"Schedule it now",
	);
	service.completeTask(cliIdentity, completeTask.task_id, "Finished the work");
	const completedDetail = service.getPlanningRecommendationDetail(
		completeRecommendation!.recommendation_id,
	);
	assert.equal(completedDetail.recommendation.first_action_type, "apply");
	assert.equal(
		completedDetail.recommendation.first_action_at !== undefined,
		true,
	);
	assert.equal(completedDetail.recommendation.outcome_state, "completed");
	assert.equal(completedDetail.recommendation.outcome_source, "operator");
	assert.equal(
		completedDetail.recommendation.close_reason_code,
		"task_completed",
	);
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
	const createdTask = (service as any).createTaskFromPlanningRecommendation(
		cliIdentity,
		cancelSource,
		{
			title: "Follow up: Cancel outcome",
			kind: "assistant_work",
			priority: "high",
			source_thread_id: "thread-phase10-cancel",
		},
	);
	service.db.updatePlanningRecommendation(cancelSource.recommendation_id, {
		status: "applied",
		applied_task_id: createdTask.task_id,
		outcome_state: "scheduled",
		outcome_recorded_at: new Date().toISOString(),
		outcome_source: "operator",
		outcome_summary: "Scheduled follow-up work from the recommendation.",
	});
	service.cancelTask(cliIdentity, createdTask.task_id, "No longer needed");
	const canceledDetail = service.getPlanningRecommendationDetail(
		cancelSource.recommendation_id,
	);
	assert.equal(canceledDetail.recommendation.outcome_state, "canceled");
	assert.equal(
		canceledDetail.recommendation.close_reason_code,
		"task_canceled",
	);
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
		.sort((left, right) =>
			left.recommendation_id.localeCompare(right.recommendation_id),
		);
	assert.equal(recommendations.length, 2);
	assert.equal(
		new Set(
			recommendations.map(
				(item) =>
					`${item.proposed_start_at ?? "none"}:${item.proposed_end_at ?? "none"}`,
			),
		).size,
		recommendations.length,
	);
	assert.equal(
		recommendations.some((item) => item.slot_state === "ready"),
		true,
	);
	assert.equal(
		recommendations.every((item) =>
			(item.source_last_seen_at ?? "").includes("T"),
		),
		true,
	);

	const groupDetail = service.getPlanningRecommendationGroupDetail(
		"urgent_inbox_followups",
	);
	assert.equal(
		groupDetail.has_manual_scheduling_members,
		recommendations.some(
			(item) => item.slot_state === "needs_manual_scheduling",
		),
	);
	assert.ok(groupDetail.next_actionable_recommendation);
	assert.equal(groupDetail.next_actionable_recommendation?.slot_state, "ready");

	const nextDetail = service.getNextPlanningRecommendationDetail(
		"urgent_inbox_followups",
	);
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
	assert.equal(
		service.db.getPlanningRecommendation(first.recommendation_id)?.status,
		"snoozed",
	);
	assert.equal(
		service.db.getPlanningRecommendation(second.recommendation_id)?.status,
		"snoozed",
	);
	assert.equal(
		service.db.getPlanningRecommendation(first.recommendation_id)
			?.first_action_type,
		"group_snooze",
	);
	assert.equal(
		service.db.getPlanningRecommendation(first.recommendation_id)?.closed_at,
		undefined,
	);

	service.db.updatePlanningRecommendation(first.recommendation_id, {
		status: "pending",
		snoozed_until: null,
	});
	service.db.updatePlanningRecommendation(second.recommendation_id, {
		status: "pending",
		snoozed_until: null,
	});
	const rejectedGroup = service.rejectPlanningRecommendationGroup(
		cliIdentity,
		"urgent_inbox_followups",
		"Handled in another tracker",
		"handled_elsewhere",
	);
	assert.equal(rejectedGroup.counts_by_status.rejected, 2);
	assert.equal(
		service.db.getPlanningRecommendation(first.recommendation_id)
			?.outcome_state,
		"handled_elsewhere",
	);
	assert.equal(
		service.db.getPlanningRecommendation(first.recommendation_id)
			?.first_action_type,
		"group_snooze",
	);
	assert.equal(
		service.db.getPlanningRecommendation(second.recommendation_id)
			?.close_reason_code,
		"rejected_handled_elsewhere",
	);
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
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const nextResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/next`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase10-http-test",
				},
			},
		);
		assert.equal(nextResponse.status, 200);
		const nextPayload = (await nextResponse.json()) as {
			planning_recommendation?: {
				recommendation: { recommendation_id: string };
			};
		};
		assert.equal(Boolean(nextPayload.planning_recommendation), true);

		const groupResponse = await fetch(
			`${baseUrl}/v1/planning-recommendation-groups/urgent_inbox_followups`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase10-http-test",
				},
			},
		);
		assert.equal(groupResponse.status, 200);

		const rejectResponse = await fetch(
			`${baseUrl}/v1/planning-recommendation-groups/urgent_inbox_followups/reject`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"content-type": "application/json",
					"x-personal-ops-client": "phase10-http-test",
				},
				body: JSON.stringify({
					reason_code: "duplicate",
					note: "Not for assistants",
				}),
			},
		);
		assert.equal(rejectResponse.status, 400);
		const rejectPayload = (await rejectResponse.json()) as { error?: string };
		assert.match(rejectPayload.error ?? "", /operator channel/i);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("phase-11 planning analytics summarize backlog, resurfacing, and closure metrics", async () => {
	const now = Date.now();
	const { service } = createFixture();

	const openRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
	const staleManual = service
		.listPlanningRecommendations({ include_resolved: true })
		.find(
			(item) => item.dedupe_key === "schedule_task_block:task-stale-manual",
		);
	assert.ok(staleManual);
	(service.db as any).db
		.prepare(
			`UPDATE planning_recommendations SET created_at = ?, updated_at = ? WHERE recommendation_id = ?`,
		)
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
	const groupDetail = service.getPlanningRecommendationGroupDetail(
		"urgent_inbox_followups",
	);
	const status = await service.getStatusReport({ httpReachable: true });

	assert.equal(summary.open_count, 3);
	assert.equal(summary.stale_count, 2);
	assert.equal(summary.manual_scheduling_count, 1);
	assert.equal(
		summary.most_completed_group?.summary,
		"1 urgent task recommendation completed",
	);
	assert.equal(backlog.total_active_count, 3);
	assert.deepEqual(backlog.filters, {
		group: undefined,
		kind: undefined,
		source: undefined,
		stale_only: false,
		manual_only: false,
		resurfaced_only: false,
	});
	assert.equal(
		backlog.groups.some((group) => group.resurfaced_source_count === 1),
		true,
	);
	assert.equal(
		backlog.groups.some((group) => group.closed_last_30d >= 1),
		true,
	);
	assert.equal(filteredBacklog.total_active_count, 1);
	assert.equal(filteredBacklog.groups.length, 1);
	assert.equal(filteredBacklog.groups[0]?.group_key, "urgent_inbox_followups");
	assert.equal(filteredBacklog.groups[0]?.stale_scheduled_count, 1);
	assert.equal(filteredBacklog.groups[0]?.source_resolved_last_30d, 1);
	assert.equal(groupDetail.stale_scheduled_count, 1);
	assert.equal(groupDetail.resurfaced_source_count, 1);
	assert.equal(groupDetail.closed_last_30d, 2);
	assert.equal(groupDetail.source_resolved_last_30d, 1);
	assert.equal(
		groupDetail.dominant_close_reason_last_30d,
		"rejected_duplicate",
	);
	assert.equal(closure.totals.closed_count, 3);
	assert.equal(closure.totals.completed_count, 1);
	assert.equal(filteredClosure.totals.closed_count, 1);
	assert.equal(filteredClosure.by_close_reason[0]?.key, "task_completed");
	assert.equal(
		closure.by_close_reason.some(
			(breakdown) => breakdown.key === "task_completed",
		),
		true,
	);
	assert.equal(status.tasks.active_count, 0);
	assert.equal(status.tasks.historical_count, 0);
	assert.equal(status.task_suggestions.active_count, 0);
	assert.equal(status.task_suggestions.historical_count, 0);
	assert.equal(status.planning_recommendations.active_count, 3);
	assert.equal(status.planning_recommendations.historical_count, 3);
	assert.equal(status.planning_recommendations.stale_pending_count >= 1, true);
	assert.equal(status.planning_recommendations.stale_scheduled_count, 1);
	assert.equal(status.planning_recommendations.resurfaced_source_count, 1);
	assert.equal(
		status.planning_recommendations.top_backlog_summary !== null,
		true,
	);
	assert.equal(
		status.planning_recommendations.top_closure_summary !== null,
		true,
	);
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
		.find(
			(recommendation) =>
				recommendation.dedupe_key ===
				"schedule_thread_followup:thread-calibrated-open",
		);
	const assistantCreated = service
		.listPlanningRecommendations({ include_resolved: false })
		.find(
			(recommendation) =>
				recommendation.dedupe_key ===
				"schedule_thread_followup:thread-assistant-open",
		);
	const smallSample = service
		.listPlanningRecommendations({ include_resolved: false })
		.find(
			(recommendation) =>
				recommendation.dedupe_key ===
				"schedule_thread_followup:thread-small-sample-open",
		);

	assert.ok(calibrated);
	assert.ok(assistantCreated);
	assert.ok(smallSample);
	assert.match(calibrated!.rank_reason ?? "", /often resolve at the source/i);
	assert.equal(calibrated!.status, "pending");
	assert.equal(calibrated!.closed_at, undefined);
	assert.doesNotMatch(
		assistantCreated!.rank_reason ?? "",
		/often resolve at the source/i,
	);
	assert.doesNotMatch(
		smallSample!.rank_reason ?? "",
		/often resolve at the source/i,
	);
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
		.find(
			(recommendation) =>
				recommendation.dedupe_key === "schedule_task_block:task-open-source-0",
		)?.recommendation_id;
	assert.ok(trackedRecommendationId);
	const before = service.getPlanningRecommendationDetail(
		trackedRecommendationId!,
	).recommendation;

	const hygiene = service.getPlanningRecommendationHygieneReport();
	const candidateOnly = service.getPlanningRecommendationHygieneReport({
		candidate_only: true,
	});
	const backlog = service.getPlanningRecommendationBacklogReport();
	const summary = service.getPlanningRecommendationSummaryReport();
	const status = await service.getStatusReport({ httpReachable: true });
	const groupDetail = service.getPlanningRecommendationGroupDetail(
		"urgent_unscheduled_tasks",
	);
	const closure = service.getPlanningRecommendationClosureReport({
		days: 30,
		group: "urgent_unscheduled_tasks",
	});
	const after = service.getPlanningRecommendationDetail(
		trackedRecommendationId!,
	).recommendation;

	const sourceCandidate = hygiene.families.find(
		(family) =>
			family.kind === "schedule_task_block" &&
			family.source === "system_generated",
	);
	const handledCandidate = hygiene.families.find(
		(family) =>
			family.kind === "schedule_thread_followup" &&
			family.source === "system_generated",
	);
	const completedCandidate = hygiene.families.find(
		(family) =>
			family.kind === "schedule_event_prep" &&
			family.source === "system_generated",
	);
	const mixedCandidate = hygiene.families.find(
		(family) =>
			family.kind === "schedule_task_block" &&
			family.source === "assistant_created",
	);
	const insufficientCandidate = hygiene.families.find(
		(family) =>
			family.kind === "schedule_event_prep" &&
			family.source === "assistant_created",
	);

	assert.ok(sourceCandidate);
	assert.ok(handledCandidate);
	assert.ok(completedCandidate);
	assert.ok(mixedCandidate);
	assert.ok(insufficientCandidate);
	assert.equal(sourceCandidate!.closure_signal, "mostly_source_resolved");
	assert.equal(
		sourceCandidate!.recommended_action,
		"review_source_suppression",
	);
	assert.equal(sourceCandidate!.queue_share_pct, 60);
	assert.match(
		sourceCandidate!.closure_meaning_summary ?? "",
		/source stopped needing action/i,
	);
	assert.equal(handledCandidate!.closure_signal, "mostly_handled_elsewhere");
	assert.equal(
		handledCandidate!.recommended_action,
		"review_externalized_workflow",
	);
	assert.match(
		handledCandidate!.closure_meaning_summary ?? "",
		/leaving the queue/i,
	);
	assert.equal(completedCandidate!.closure_signal, "healthy_completed");
	assert.equal(completedCandidate!.recommended_action, "keep_visible");
	assert.match(
		completedCandidate!.closure_meaning_summary ?? "",
		/stay visible/i,
	);
	assert.equal(mixedCandidate!.closure_signal, "mixed");
	assert.equal(mixedCandidate!.recommended_action, "keep_visible");
	assert.match(mixedCandidate!.closure_meaning_summary ?? "", /mixed/i);
	assert.equal(insufficientCandidate!.closure_signal, "insufficient_history");
	assert.equal(insufficientCandidate!.recommended_action, "need_more_history");
	assert.equal(candidateOnly.families.length, 2);
	assert.equal(
		candidateOnly.families.every((family) =>
			family.recommended_action.startsWith("review_"),
		),
		true,
	);
	assert.equal(
		backlog.groups.find(
			(group) => group.group_key === "urgent_unscheduled_tasks",
		)?.dominates_queue,
		true,
	);
	assert.equal(
		backlog.groups.find(
			(group) => group.group_key === "urgent_unscheduled_tasks",
		)?.queue_share_pct,
		70,
	);
	assert.match(
		backlog.groups.find(
			(group) => group.group_key === "urgent_unscheduled_tasks",
		)?.closure_meaning_summary ?? "",
		/source stopped needing action/i,
	);
	assert.equal(summary.dominant_backlog_group?.queue_share_pct, 70);
	assert.equal(
		summary.top_suppression_candidate?.recommended_action,
		"review_source_suppression",
	);
	assert.match(
		status.planning_recommendations.dominant_backlog_summary ?? "",
		/70% of the open planning queue/i,
	);
	assert.match(
		status.planning_recommendations.top_suppression_candidate_summary ?? "",
		/source-side suppression candidate/i,
	);
	assert.equal(
		status.planning_recommendations.top_hygiene_summary,
		status.planning_recommendations.top_suppression_candidate_summary,
	);
	assert.match(
		groupDetail.closure_meaning_summary ?? "",
		/source stopped needing action/i,
	);
	assert.match(
		closure.totals.closure_meaning_summary ?? "",
		/source stopped needing action/i,
	);
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

	const openRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);

	const trackedRecommendationId = service
		.listPlanningRecommendations({ include_resolved: false })
		.find(
			(recommendation) =>
				recommendation.dedupe_key === "schedule_task_block:task-phase14-open",
		)?.recommendation_id;
	assert.ok(trackedRecommendationId);
	const beforeReview = service.getPlanningRecommendationDetail(
		trackedRecommendationId!,
	).recommendation;

	const initialHygiene = service.getPlanningRecommendationHygieneReport({
		review_needed_only: true,
	});
	assert.equal(initialHygiene.families.length, 1);
	assert.equal(initialHygiene.families[0]?.review_needed, true);
	assert.equal(
		initialHygiene.families[0]?.recommended_action,
		"review_externalized_workflow",
	);

	const initialStatus = await service.getStatusReport({ httpReachable: true });
	assert.equal(initialStatus.planning_recommendations.review_needed_count, 1);
	assert.match(
		initialStatus.planning_recommendations.top_review_needed_summary ?? "",
		/externalized-workflow candidate/i,
	);

	const initialWorklist = await service.getWorklistReport({
		httpReachable: true,
	});
	assert.equal(
		initialWorklist.items.some(
			(item) => item.kind === "planning_hygiene_review_needed",
		),
		true,
	);

	const reviewed = service.reviewPlanningRecommendationHygiene(cliIdentity, {
		group: "urgent_unscheduled_tasks",
		kind: "schedule_task_block",
		source: "system_generated",
		decision: "investigate_externalized_workflow",
		note: "Phase 14 review",
	});
	assert.equal(reviewed.review_needed, false);
	assert.equal(
		reviewed.last_review_decision,
		"investigate_externalized_workflow",
	);
	assert.equal(reviewed.last_review_by_client, "operator-cli");
	assert.equal(reviewed.last_review_by_actor, "operator");
	assert.equal(reviewed.last_review_note, "Phase 14 review");
	assert.match(
		reviewed.review_summary ?? "",
		/Reviewed .*investigate_externalized_workflow/i,
	);

	const afterReview = service.getPlanningRecommendationDetail(
		trackedRecommendationId!,
	).recommendation;
	assert.equal(beforeReview.updated_at, afterReview.updated_at);
	assert.equal(beforeReview.rank_score, afterReview.rank_score);

	const clearedHygiene = service.getPlanningRecommendationHygieneReport({
		review_needed_only: true,
	});
	assert.equal(clearedHygiene.families.length, 0);

	const clearedStatus = await service.getStatusReport({ httpReachable: true });
	assert.equal(clearedStatus.planning_recommendations.review_needed_count, 0);
	assert.equal(
		clearedStatus.planning_recommendations.top_review_needed_summary,
		null,
	);

	const clearedWorklist = await service.getWorklistReport({
		httpReachable: true,
	});
	assert.equal(
		clearedWorklist.items.some(
			(item) => item.kind === "planning_hygiene_review_needed",
		),
		false,
	);

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

	const reopened = service.getPlanningRecommendationHygieneReport({
		review_needed_only: true,
	});
	assert.equal(reopened.families.length, 1);
	assert.equal(reopened.families[0]?.review_needed, true);
	assert.equal(
		reopened.families[0]?.last_review_decision,
		"investigate_externalized_workflow",
	);

	const reopenedWorklist = await service.getWorklistReport({
		httpReachable: true,
	});
	assert.equal(
		reopenedWorklist.items.some(
			(item) => item.kind === "planning_hygiene_review_needed",
		),
		true,
	);
});

test("phase-15 policy proposals add follow-through reporting without mutating recommendations", async () => {
	const now = Date.now();
	const staleReviewAt = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
	const staleEventAt = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
	const { service } = createFixture();
	const familyTargetId =
		"urgent_unscheduled_tasks:schedule_task_block:system_generated";

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
		.find(
			(recommendation) =>
				recommendation.dedupe_key === "schedule_task_block:task-phase15-open",
		)?.recommendation_id;
	assert.ok(trackedRecommendationId);
	const initialFamily = service.getPlanningRecommendationHygieneReport({
		group: "urgent_unscheduled_tasks",
	}).families[0];
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

	const reviewedFresh = service.getPlanningRecommendationHygieneReport({
		group: "urgent_unscheduled_tasks",
	}).families[0];
	assert.ok(reviewedFresh);
	assert.equal(reviewedFresh.follow_through_state, "reviewed_fresh");
	assert.equal(
		reviewedFresh.last_review_decision,
		"investigate_externalized_workflow",
	);

	const rawDb = (service.db as any).db;
	rawDb
		.prepare(
			`UPDATE audit_events
       SET timestamp = ?
       WHERE action = 'planning_recommendation_hygiene_review'
         AND target_type = 'planning_recommendation_family'
         AND target_id = ?`,
		)
		.run(staleEventAt, familyTargetId);
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
		.run(staleReviewAt, staleReviewAt, staleReviewAt, staleReviewAt);

	const reviewedStale = service.getPlanningRecommendationHygieneReport({
		group: "urgent_unscheduled_tasks",
	}).families[0];
	assert.ok(reviewedStale);
	assert.equal(reviewedStale.follow_through_state, "reviewed_stale");

	const staleWorklist = await service.getWorklistReport({
		httpReachable: true,
	});
	assert.equal(
		staleWorklist.items.some(
			(item) => item.kind === "planning_hygiene_followthrough_needed",
		),
		true,
	);

	const beforeProposal = service.getPlanningRecommendationDetail(
		trackedRecommendationId!,
	).recommendation;

	const proposed = service.recordPlanningRecommendationHygieneProposal(
		cliIdentity,
		{
			group: "urgent_unscheduled_tasks",
			kind: "schedule_task_block",
			source: "system_generated",
			note: "Track explicit follow-through",
		},
	);
	assert.equal(proposed.proposal_status, "proposed");
	assert.equal(proposed.follow_through_state, "proposal_open");
	assert.equal(proposed.proposal_type, "externalized_workflow_tuning");
	assert.equal(proposed.proposal_note, "Track explicit follow-through");

	const afterProposal = service.getPlanningRecommendationDetail(
		trackedRecommendationId!,
	).recommendation;
	assert.equal(beforeProposal.updated_at, afterProposal.updated_at);
	assert.equal(beforeProposal.rank_score, afterProposal.rank_score);
	assert.equal(beforeProposal.ranking_version, afterProposal.ranking_version);

	const tuningOpen = service.getPlanningRecommendationTuningReport();
	assert.equal(tuningOpen.proposal_open_count, 1);
	assert.equal(tuningOpen.proposal_stale_count, 0);
	assert.equal(
		tuningOpen.attention_families[0]?.follow_through_state,
		"proposal_open",
	);
	const openWorklist = await service.getWorklistReport({ httpReachable: true });
	assert.equal(
		openWorklist.items.some(
			(item) => item.kind === "planning_hygiene_followthrough_needed",
		),
		false,
	);

	const proposalId =
		service.db.listPlanningHygienePolicyProposals()[0]?.proposal_id;
	assert.ok(proposalId);
	rawDb
		.prepare(
			`UPDATE planning_hygiene_policy_proposals SET updated_at = ? WHERE proposal_id = ?`,
		)
		.run(staleReviewAt, proposalId);

	const staleProposal = service.getPlanningRecommendationHygieneReport({
		group: "urgent_unscheduled_tasks",
	}).families[0];
	assert.ok(staleProposal);
	assert.equal(staleProposal.follow_through_state, "proposal_stale");
	assert.equal(staleProposal.proposal_stale, true);

	const tuningStale = service.getPlanningRecommendationTuningReport();
	assert.equal(tuningStale.proposal_open_count, 0);
	assert.equal(tuningStale.proposal_stale_count, 1);
	assert.equal(
		tuningStale.attention_families[0]?.follow_through_state,
		"proposal_stale",
	);

	const staleStatus = await service.getStatusReport({ httpReachable: true });
	assert.equal(staleStatus.planning_recommendations.proposal_stale_count, 1);
	assert.match(
		staleStatus.planning_recommendations.top_proposal_stale_summary ?? "",
		/externalized-workflow candidate/i,
	);
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
		trigger_signals: [
			"task_due_soon",
			"task_high_priority",
			"task_unscheduled",
		],
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

	const operatorHygiene = service.getPlanningRecommendationHygieneReport({
		group: "urgent_unscheduled_tasks",
	});
	assert.equal(
		operatorHygiene.families[0]?.proposal_note,
		"Operator-only proposal detail",
	);
	assert.equal(operatorHygiene.families[0]?.proposal_by_client, "operator-cli");
	assert.equal(operatorHygiene.families[0]?.proposal_by_actor, "operator");
	assert.equal(
		operatorHygiene.families[0]?.last_review_by_client,
		"operator-cli",
	);
	assert.equal(operatorHygiene.families[0]?.last_review_by_actor, "operator");
	assert.equal(
		operatorHygiene.families[0]?.last_review_note,
		"Operator review for redaction",
	);
	assert.match(
		operatorHygiene.families[0]?.review_summary ?? "",
		/Operator review for redaction/,
	);

	const assistantHygiene = service.getPlanningRecommendationHygieneReport(
		{ group: "urgent_unscheduled_tasks" },
		{ assistant_safe: assistantIdentity.auth_role === "assistant" },
	);
	assert.equal(assistantHygiene.families[0]?.last_review_by_client, null);
	assert.equal(assistantHygiene.families[0]?.last_review_by_actor, null);
	assert.equal(assistantHygiene.families[0]?.last_review_note, null);
	assert.match(
		assistantHygiene.families[0]?.review_summary ?? "",
		/investigate_externalized_workflow/,
	);
	assert.doesNotMatch(
		assistantHygiene.families[0]?.review_summary ?? "",
		/Operator review for redaction/,
	);
	assert.equal(assistantHygiene.families[0]?.proposal_note, null);
	assert.equal(assistantHygiene.families[0]?.proposal_by_client, null);
	assert.equal(assistantHygiene.families[0]?.proposal_by_actor, null);
	assert.equal(assistantHygiene.families[0]?.proposal_status, "proposed");

	const operatorTuning = service.getPlanningRecommendationTuningReport();
	assert.equal(operatorTuning.attention_families.length, 1);
	assert.equal(
		operatorTuning.attention_families[0]?.follow_through_state,
		"proposal_open",
	);
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
		operatorClosedTuning.recently_closed_families[0]
			?.last_follow_through_state_before_exit,
		"proposal_open",
	);

	const assistantClosedTuning = service.getPlanningRecommendationTuningReport({
		assistant_safe: assistantIdentity.auth_role === "assistant",
	});
	assert.equal(assistantClosedTuning.recently_closed_families.length, 0);

	const formatted =
		formatPlanningRecommendationTuningReport(operatorClosedTuning);
	assert.match(formatted, /Attention Families/);
	assert.match(formatted, /Recently Closed Families/);
});

test("phase-16 dismissed proposals stay out of attention until new evidence reopens review-needed state", async () => {
	const now = Date.now();
	const { service } = createFixture();
	const familyTargetId =
		"urgent_unscheduled_tasks:schedule_task_block:system_generated";

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
	const dismissed = service.dismissPlanningRecommendationHygieneProposal(
		cliIdentity,
		{
			group: "urgent_unscheduled_tasks",
			kind: "schedule_task_block",
			source: "system_generated",
			note: "Dismiss for now",
		},
	);
	assert.equal(dismissed.follow_through_state, "proposal_dismissed");

	const dismissedTuning = service.getPlanningRecommendationTuningReport();
	assert.equal(dismissedTuning.proposal_dismissed_count, 1);
	assert.equal(dismissedTuning.attention_families.length, 0);

	const dismissedWorklist = await service.getWorklistReport({
		httpReachable: true,
	});
	assert.equal(
		dismissedWorklist.items.some(
			(item) => item.kind === "planning_hygiene_followthrough_needed",
		),
		false,
	);

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

	const reopened = service.getPlanningRecommendationHygieneReport({
		group: "urgent_unscheduled_tasks",
	}).families[0];
	assert.equal(reopened?.follow_through_state, "review_needed");

	const reopenedTuning = service.getPlanningRecommendationTuningReport();
	assert.equal(
		reopenedTuning.attention_families[0]?.follow_through_state,
		"review_needed",
	);
	assert.equal(reopenedTuning.proposal_dismissed_count, 0);

	const reopenedWorklist = await service.getWorklistReport({
		httpReachable: true,
	});
	assert.equal(
		reopenedWorklist.items.some(
			(item) => item.kind === "planning_hygiene_followthrough_needed",
		),
		true,
	);
});

test("phase-17 policy report separates active backlog from archived and superseded history", () => {
	const now = Date.now();
	const { service } = createFixture();
	const rawDb = (service.db as any).db;

	const createClosedFamilyRows = (
		kind:
			| "schedule_task_block"
			| "schedule_thread_followup"
			| "schedule_event_prep",
		groupKey:
			| "urgent_unscheduled_tasks"
			| "urgent_inbox_followups"
			| "near_term_meeting_prep",
		outcomeState: "handled_elsewhere" | "source_resolved",
		prefix: string,
		source: "system_generated" | "assistant_created" = "system_generated",
	) => {
		for (const suffix of ["a", "b", "c"]) {
			service.db.createPlanningRecommendation(cliIdentity, {
				kind,
				status:
					outcomeState === "handled_elsewhere" ? "rejected" : "superseded",
				priority: "high",
				source,
				source_task_id:
					kind === "schedule_task_block"
						? `${prefix}-task-${suffix}`
						: undefined,
				source_thread_id:
					kind === "schedule_thread_followup"
						? `${prefix}-thread-${suffix}`
						: undefined,
				source_calendar_event_id:
					kind === "schedule_event_prep"
						? `${prefix}-event-${suffix}`
						: undefined,
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
				first_action_type:
					outcomeState === "handled_elsewhere" ? "reject" : "apply",
				closed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
				close_reason_code:
					outcomeState === "handled_elsewhere"
						? "rejected_handled_elsewhere"
						: "source_resolved",
				slot_state: "ready",
				trigger_signals: [prefix],
				suppressed_signals: [],
				resolved_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
			});
		}
	};

	createClosedFamilyRows(
		"schedule_task_block",
		"urgent_unscheduled_tasks",
		"handled_elsewhere",
		"phase17-active",
	);
	const activeRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
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

	createClosedFamilyRows(
		"schedule_thread_followup",
		"urgent_inbox_followups",
		"handled_elsewhere",
		"phase17-archived",
	);
	const archivedRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
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

	createClosedFamilyRows(
		"schedule_event_prep",
		"near_term_meeting_prep",
		"source_resolved",
		"phase17-superseded",
	);
	const supersededRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
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

	for (const recommendationId of [
		archivedRecommendation.recommendation_id,
		supersededRecommendation.recommendation_id,
	]) {
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

	const archivedHistory = service.archivePlanningRecommendationPolicy(
		cliIdentity,
		{
			group: "urgent_inbox_followups",
			kind: "schedule_thread_followup",
			source: "system_generated",
			note: "Archive the inactive workflow tuning idea",
		},
	);
	const supersededHistory = service.supersedePlanningRecommendationPolicy(
		cliIdentity,
		{
			group: "near_term_meeting_prep",
			kind: "schedule_event_prep",
			source: "system_generated",
			note: "Superseded by newer meeting-prep guidance",
		},
	);

	assert.equal(archivedHistory.governance_event_type, "policy_archived");
	assert.equal(supersededHistory.governance_event_type, "policy_superseded");

	const policyReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
	assert.equal(policyReport.active_proposed_count, 1);
	assert.equal(policyReport.active_dismissed_for_now_count, 0);
	assert.equal(policyReport.archived_count, 1);
	assert.equal(policyReport.superseded_count, 1);
	assert.equal(policyReport.active_policy_backlog.length, 1);
	assert.equal(
		policyReport.active_policy_backlog[0]?.follow_through_state,
		"proposal_open",
	);
	assert.equal(
		policyReport.active_policy_backlog[0]?.group_key,
		"urgent_unscheduled_tasks",
	);
	assert.equal(policyReport.policy_history_recent_events.length, 2);
	assert.equal(
		policyReport.policy_history_recent_events.some(
			(item) => item.governance_event_type === "policy_archived",
		),
		true,
	);
	assert.equal(
		policyReport.policy_history_recent_events.some(
			(item) => item.governance_event_type === "policy_superseded",
		),
		true,
	);
	assert.match(policyReport.top_archived_summary ?? "", /archived/i);
	assert.match(policyReport.top_superseded_summary ?? "", /superseded/i);

	const tuning = service.getPlanningRecommendationTuningReport();
	assert.equal(tuning.proposal_open_count, 1);
	assert.equal(tuning.proposal_dismissed_count, 0);
	assert.equal(
		tuning.attention_families.every(
			(family) => family.group_key === "urgent_unscheduled_tasks",
		),
		true,
	);

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

	const operatorActiveDetail = service.getPlanningRecommendationDetail(
		recommendation.recommendation_id,
	);
	assert.equal(
		operatorActiveDetail.related_audit_events.some(
			(event) => event.action === "planning_recommendation_hygiene_review",
		),
		true,
	);
	assert.equal(
		operatorActiveDetail.related_audit_events.some(
			(event) =>
				event.action === "planning_recommendation_hygiene_proposal_recorded",
		),
		true,
	);

	const assistantActiveDetail = service.getPlanningRecommendationDetail(
		recommendation.recommendation_id,
		{
			assistant_safe: true,
		},
	);
	assert.equal(
		assistantActiveDetail.related_audit_events.some(
			(event) => event.action === "planning_recommendation_hygiene_review",
		),
		false,
	);
	assert.equal(
		assistantActiveDetail.related_audit_events.some(
			(event) =>
				event.action === "planning_recommendation_hygiene_proposal_recorded",
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

	const operatorClosedDetail = service.getPlanningRecommendationDetail(
		recommendation.recommendation_id,
	);
	assert.equal(
		operatorClosedDetail.related_audit_events.some(
			(event) => event.action === "planning_recommendation_policy_archived",
		),
		true,
	);

	const assistantClosedDetail = service.getPlanningRecommendationDetail(
		recommendation.recommendation_id,
		{
			assistant_safe: true,
		},
	);
	assert.equal(
		assistantClosedDetail.related_audit_events.some(
			(event) => event.action === "planning_recommendation_policy_archived",
		),
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
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const summaryResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/summary`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase11-http-test",
				},
			},
		);
		assert.equal(summaryResponse.status, 200);
		const summaryPayload = (await summaryResponse.json()) as {
			planning_recommendation_summary?: { closed_last_30d: number };
		};
		assert.equal(
			summaryPayload.planning_recommendation_summary?.closed_last_30d,
			3,
		);

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
			planning_recommendation_backlog?: {
				filters: { manual_only: boolean; source?: string };
			};
		};
		assert.equal(
			backlogPayload.planning_recommendation_backlog?.filters.manual_only,
			true,
		);
		assert.equal(
			backlogPayload.planning_recommendation_backlog?.filters.source,
			"system_generated",
		);

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
		assert.equal(
			closurePayload.planning_recommendation_closure?.filters.source,
			"system_generated",
		);
		assert.equal(
			closurePayload.planning_recommendation_closure?.filters.close_reason,
			"rejected_handled_elsewhere",
		);
		assert.equal(
			closurePayload.planning_recommendation_closure?.totals
				.handled_elsewhere_count,
			3,
		);

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
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.filters.group,
			"urgent_inbox_followups",
		);
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.filters.candidate_only,
			true,
		);
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.families.length,
			1,
		);
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.families[0]
				?.recommended_action,
			"review_externalized_workflow",
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
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
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
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
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.filters.group,
			"urgent_unscheduled_tasks",
		);
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.filters
				.review_needed_only,
			true,
		);
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.families.length,
			1,
		);
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.families[0]
				?.review_needed,
			true,
		);
		assert.equal(
			hygienePayload.planning_recommendation_hygiene?.families[0]
				?.recommended_action,
			"review_externalized_workflow",
		);

		const assistantReviewResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/hygiene/review`,
			{
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
			},
		);
		assert.equal(assistantReviewResponse.status, 400);
		const assistantReviewPayload = (await assistantReviewResponse.json()) as {
			error?: string;
		};
		assert.match(assistantReviewPayload.error ?? "", /operator channel/i);

		const operatorReviewResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/hygiene/review`,
			{
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
			},
		);
		assert.equal(operatorReviewResponse.status, 200);
		const operatorReviewPayload = (await operatorReviewResponse.json()) as {
			planning_recommendation_hygiene_family?: {
				review_needed: boolean;
				last_review_decision?: string;
				last_review_by_client?: string;
				last_review_by_actor?: string;
			};
		};
		assert.equal(
			operatorReviewPayload.planning_recommendation_hygiene_family
				?.review_needed,
			false,
		);
		assert.equal(
			operatorReviewPayload.planning_recommendation_hygiene_family
				?.last_review_decision,
			"investigate_externalized_workflow",
		);
		assert.equal(
			operatorReviewPayload.planning_recommendation_hygiene_family
				?.last_review_by_client,
			"phase14-http-test",
		);
		assert.equal(
			operatorReviewPayload.planning_recommendation_hygiene_family
				?.last_review_by_actor,
			"operator-http",
		);

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
		assert.equal(
			reviewedHygienePayload.planning_recommendation_hygiene?.families.length,
			0,
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
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

	const openRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);

	service.reviewPlanningRecommendationHygiene(cliIdentity, {
		group: "urgent_unscheduled_tasks",
		kind: "schedule_task_block",
		source: "system_generated",
		decision: "investigate_externalized_workflow",
		note: "Phase 15 HTTP review",
	});

	const server = createHttpServer(service, config, policy);
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const assistantTuningResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/tuning`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase15-http-test",
				},
			},
		);
		assert.equal(assistantTuningResponse.status, 200);
		const assistantTuningPayload = (await assistantTuningResponse.json()) as {
			planning_recommendation_tuning?: { reviewed_fresh_count: number };
		};
		assert.equal(
			assistantTuningPayload.planning_recommendation_tuning
				?.reviewed_fresh_count,
			1,
		);

		const assistantRecordResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/hygiene/proposals/record`,
			{
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
			},
		);
		assert.equal(assistantRecordResponse.status, 400);
		const assistantRecordPayload = (await assistantRecordResponse.json()) as {
			error?: string;
		};
		assert.match(assistantRecordPayload.error ?? "", /operator channel/i);

		const operatorRecordResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/hygiene/proposals/record`,
			{
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
			},
		);
		assert.equal(operatorRecordResponse.status, 200);
		const operatorRecordPayload = (await operatorRecordResponse.json()) as {
			planning_recommendation_hygiene_family?: {
				proposal_status?: string;
				follow_through_state?: string;
				proposal_by_client?: string;
				proposal_by_actor?: string;
			};
		};
		assert.equal(
			operatorRecordPayload.planning_recommendation_hygiene_family
				?.proposal_status,
			"proposed",
		);
		assert.equal(
			operatorRecordPayload.planning_recommendation_hygiene_family
				?.follow_through_state,
			"proposal_open",
		);
		assert.equal(
			operatorRecordPayload.planning_recommendation_hygiene_family
				?.proposal_by_client,
			"phase15-http-test",
		);
		assert.equal(
			operatorRecordPayload.planning_recommendation_hygiene_family
				?.proposal_by_actor,
			"operator-http",
		);

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
		assert.equal(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.last_review_by_client,
			null,
		);
		assert.equal(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.last_review_by_actor,
			null,
		);
		assert.equal(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.last_review_note,
			null,
		);
		assert.match(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.review_summary ?? "",
			/investigate_externalized_workflow/,
		);
		assert.doesNotMatch(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.review_summary ?? "",
			/Phase 15 HTTP review/,
		);
		assert.equal(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.proposal_status,
			"proposed",
		);
		assert.equal(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.proposal_note,
			null,
		);
		assert.equal(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.proposal_by_client,
			null,
		);
		assert.equal(
			assistantHygienePayload.planning_recommendation_hygiene?.families[0]
				?.proposal_by_actor,
			null,
		);

		const operatorDismissResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/hygiene/proposals/dismiss`,
			{
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
			},
		);
		assert.equal(operatorDismissResponse.status, 200);
		const operatorDismissPayload = (await operatorDismissResponse.json()) as {
			planning_recommendation_hygiene_family?: {
				proposal_status?: string;
				follow_through_state?: string;
			};
		};
		assert.equal(
			operatorDismissPayload.planning_recommendation_hygiene_family
				?.proposal_status,
			"dismissed",
		);
		assert.equal(
			operatorDismissPayload.planning_recommendation_hygiene_family
				?.follow_through_state,
			"proposal_dismissed",
		);

		const reviewedTuningResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/tuning`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase15-http-test",
				},
			},
		);
		assert.equal(reviewedTuningResponse.status, 200);
		const reviewedTuningPayload = (await reviewedTuningResponse.json()) as {
			planning_recommendation_tuning?: {
				proposal_dismissed_count: number;
				proposal_open_count: number;
				recently_closed_families?: unknown[];
			};
		};
		assert.equal(
			reviewedTuningPayload.planning_recommendation_tuning?.proposal_open_count,
			0,
		);
		assert.equal(
			reviewedTuningPayload.planning_recommendation_tuning
				?.proposal_dismissed_count,
			1,
		);
		assert.equal(
			reviewedTuningPayload.planning_recommendation_tuning
				?.recently_closed_families?.length,
			0,
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

		const operatorHistoryResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/tuning`,
			{
				headers: {
					authorization: `Bearer ${config.apiToken}`,
					"x-personal-ops-client": "phase15-http-test",
				},
			},
		);
		assert.equal(operatorHistoryResponse.status, 200);
		const operatorHistoryPayload = (await operatorHistoryResponse.json()) as {
			planning_recommendation_tuning?: {
				recently_closed_families?: Array<{
					final_proposal_status?: string | null;
				}>;
			};
		};
		assert.equal(
			operatorHistoryPayload.planning_recommendation_tuning
				?.recently_closed_families?.length,
			1,
		);
		assert.equal(
			operatorHistoryPayload.planning_recommendation_tuning
				?.recently_closed_families?.[0]?.final_proposal_status,
			"dismissed",
		);

		const assistantHistoryResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/tuning`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase15-http-test",
				},
			},
		);
		assert.equal(assistantHistoryResponse.status, 200);
		const assistantHistoryPayload = (await assistantHistoryResponse.json()) as {
			planning_recommendation_tuning?: { recently_closed_families?: unknown[] };
		};
		assert.equal(
			assistantHistoryPayload.planning_recommendation_tuning
				?.recently_closed_families?.length,
			0,
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
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

	const openRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);

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
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const operatorDetailResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/${openRecommendation.recommendation_id}`,
			{
				headers: {
					authorization: `Bearer ${config.apiToken}`,
					"x-personal-ops-client": "phase17-http-test",
				},
			},
		);
		assert.equal(operatorDetailResponse.status, 200);
		const operatorDetailPayload = (await operatorDetailResponse.json()) as {
			planning_recommendation?: {
				related_audit_events?: Array<{ action?: string }>;
			};
		};
		assert.equal(
			operatorDetailPayload.planning_recommendation?.related_audit_events?.some(
				(event) => event.action === "planning_recommendation_hygiene_review",
			),
			true,
		);
		assert.equal(
			operatorDetailPayload.planning_recommendation?.related_audit_events?.some(
				(event) =>
					event.action === "planning_recommendation_hygiene_proposal_recorded",
			),
			true,
		);

		const assistantDetailResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/${openRecommendation.recommendation_id}`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase17-http-test",
				},
			},
		);
		assert.equal(assistantDetailResponse.status, 200);
		const assistantDetailPayload = (await assistantDetailResponse.json()) as {
			planning_recommendation?: {
				related_audit_events?: Array<{ action?: string }>;
			};
		};
		assert.equal(
			assistantDetailPayload.planning_recommendation?.related_audit_events?.some(
				(event) => event.action === "planning_recommendation_hygiene_review",
			),
			false,
		);
		assert.equal(
			assistantDetailPayload.planning_recommendation?.related_audit_events?.some(
				(event) =>
					event.action === "planning_recommendation_hygiene_proposal_recorded",
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

		const assistantPolicyResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/policy`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase17-http-test",
				},
			},
		);
		assert.equal(assistantPolicyResponse.status, 400);
		const assistantPolicyPayload = (await assistantPolicyResponse.json()) as {
			error?: string;
		};
		assert.match(assistantPolicyPayload.error ?? "", /operator channel/i);

		const operatorArchiveResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/policy/archive`,
			{
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
			},
		);
		assert.equal(operatorArchiveResponse.status, 200);
		const operatorArchivePayload = (await operatorArchiveResponse.json()) as {
			planning_recommendation_policy?: {
				archived_count?: number;
				policy_history_recent_events?: Array<{
					governance_event_type?: string;
				}>;
			};
		};
		assert.equal(
			operatorArchivePayload.planning_recommendation_policy?.archived_count,
			1,
		);
		assert.equal(
			operatorArchivePayload.planning_recommendation_policy
				?.policy_history_recent_events?.[0]?.governance_event_type,
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
		const assistantClosedDetailPayload =
			(await assistantClosedDetailResponse.json()) as {
				planning_recommendation?: {
					related_audit_events?: Array<{ action?: string }>;
				};
			};
		assert.equal(
			assistantClosedDetailPayload.planning_recommendation?.related_audit_events?.some(
				(event) => event.action === "planning_recommendation_policy_archived",
			),
			false,
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
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
	service.completeTask(
		cliIdentity,
		task.task_id,
		"Operator-only completion note",
	);
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
	assert.equal(
		operatorEvents.some(
			(event) => event.action === "planning_recommendation_policy_archived",
		),
		true,
	);
	assert.equal(
		operatorEvents.some((event) => event.action === "future_sensitive_action"),
		true,
	);

	const assistantEvents = service.listAuditEvents(
		{ limit: 20 },
		{ assistant_safe: true },
	);
	assert.equal(
		assistantEvents.some(
			(event) => event.action === "planning_recommendation_policy_archived",
		),
		false,
	);
	assert.equal(
		assistantEvents.some((event) => event.action === "future_sensitive_action"),
		false,
	);

	const createEvent = assistantEvents.find(
		(event) => event.action === "task_create",
	);
	assert.ok(createEvent);
	assert.equal(createEvent.metadata_redacted, true);
	assert.equal(createEvent.summary, "Task created.");
	const createMetadata = JSON.parse(createEvent.metadata_json) as Record<
		string,
		unknown
	>;
	assert.equal("title" in createMetadata, false);
	assert.equal(createMetadata.kind, "human_reminder");
	assert.equal(createMetadata.priority, "high");

	const completeEvent = assistantEvents.find(
		(event) => event.action === "task_complete",
	);
	assert.ok(completeEvent);
	assert.equal(completeEvent.summary, "Task completed.");
	const completeMetadata = JSON.parse(completeEvent.metadata_json) as Record<
		string,
		unknown
	>;
	assert.deepEqual(completeMetadata, {});

	const syncEvent = assistantEvents.find(
		(event) => event.action === "mailbox_sync",
	);
	assert.ok(syncEvent);
	assert.match(syncEvent.summary ?? "", /Mailbox sync succeeded/i);
	const syncMetadata = JSON.parse(syncEvent.metadata_json) as {
		sync_result?: {
			messages_refreshed?: number;
			messages_deleted?: number;
			threads_recomputed?: number;
			duration_ms?: number;
		};
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
		kind:
			| "schedule_task_block"
			| "schedule_thread_followup"
			| "schedule_event_prep",
		groupKey:
			| "urgent_unscheduled_tasks"
			| "urgent_inbox_followups"
			| "near_term_meeting_prep",
		reviewDecision:
			| "investigate_externalized_workflow"
			| "investigate_source_suppression",
		proposalStatus: "proposed" | "dismissed" = "proposed",
	) => {
		const createClosedRows = () => {
			for (const suffix of ["a", "b", "c"]) {
				service.db.createPlanningRecommendation(cliIdentity, {
					kind,
					status: "rejected",
					priority: "high",
					source: "system_generated",
					source_task_id:
						kind === "schedule_task_block"
							? `${prefix}-task-${suffix}`
							: undefined,
					source_thread_id:
						kind === "schedule_thread_followup"
							? `${prefix}-thread-${suffix}`
							: undefined,
					source_calendar_event_id:
						kind === "schedule_event_prep"
							? `${prefix}-event-${suffix}`
							: undefined,
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
		const openRecommendation = service.db.createPlanningRecommendation(
			cliIdentity,
			{
				kind,
				status: "pending",
				priority: "high",
				source: "system_generated",
				source_task_id:
					kind === "schedule_task_block" ? `${prefix}-open-task` : undefined,
				source_thread_id:
					kind === "schedule_thread_followup"
						? `${prefix}-open-thread`
						: undefined,
				source_calendar_event_id:
					kind === "schedule_event_prep" ? `${prefix}-open-event` : undefined,
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
			},
		);
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

	const governanceEvents =
		service.db.listPlanningHygienePolicyGovernanceEvents();
	const archivedEvent = governanceEvents.find(
		(event) => event.group_key === "urgent_inbox_followups",
	);
	const supersededEvent = governanceEvents.find(
		(event) => event.group_key === "near_term_meeting_prep",
	);
	assert.ok(archivedEvent);
	assert.ok(supersededEvent);
	rawDb
		.prepare(
			`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`,
		)
		.run(
			new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(),
			archivedEvent.governance_event_id,
		);
	rawDb
		.prepare(
			`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`,
		)
		.run(
			new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString(),
			supersededEvent.governance_event_id,
		);
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

	const policyReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
	assert.equal(policyReport.recent_policy_exit_count, 1);
	assert.equal(policyReport.retention_candidate_count, 2);
	assert.equal(policyReport.recent_policy_exits.length, 1);
	assert.equal(
		policyReport.recent_policy_exits[0]?.group_key,
		"urgent_unscheduled_tasks",
	);
	assert.match(
		policyReport.recent_policy_exits[0]?.exit_summary ?? "",
		/Archive or supersede/i,
	);
	assert.equal(policyReport.retention_candidates.length, 2);
	assert.equal(
		policyReport.retention_candidates.some(
			(item) => item.governance_event_type === "policy_archived",
		),
		true,
	);
	assert.equal(
		policyReport.retention_candidates.some(
			(item) => item.governance_event_type === "policy_superseded",
		),
		true,
	);

	const status = await service.getStatusReport({ httpReachable: true });
	assert.equal(
		"policy_recent_exit_count" in status.planning_recommendations,
		false,
	);
	assert.equal(
		"policy_retention_candidate_count" in status.planning_recommendations,
		false,
	);
	assert.equal(
		"top_policy_recent_exit_summary" in status.planning_recommendations,
		false,
	);
	assert.equal(
		"top_policy_retention_candidate_summary" in status.planning_recommendations,
		false,
	);
	assert.doesNotMatch(
		status.planning_recommendations.top_policy_attention_summary ?? "",
		/operator review note|Supersede note/i,
	);

	const worklist = await service.getWorklistReport({ httpReachable: true });
	assert.equal(
		worklist.items.some(
			(item) => item.kind === "planning_policy_governance_needed",
		),
		true,
	);
	assert.equal(
		worklist.items.some(
			(item) => item.kind === "planning_policy_retention_review_needed",
		),
		false,
	);
	const governanceItem = worklist.items.find(
		(item) => item.kind === "planning_policy_governance_needed",
	);
	assert.doesNotMatch(governanceItem?.summary ?? "", /proposal note/i);

	service.archivePlanningRecommendationPolicy(cliIdentity, {
		group: "urgent_unscheduled_tasks",
		kind: "schedule_task_block",
		source: "system_generated",
		note: "Archive the recent exit after review",
	});
	const afterGovernanceReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
	assert.equal(afterGovernanceReport.recent_policy_exit_count, 0);

	const dryRun = service.prunePlanningRecommendationPolicyHistory(cliIdentity, {
		older_than_days: 30,
		event_type: "all",
		dry_run: true,
	});
	assert.equal(dryRun.dry_run, true);
	assert.equal(dryRun.candidate_count, 2);
	assert.equal(dryRun.pruned_count, 0);
	assert.equal(
		service.db.listPlanningHygienePolicyGovernanceEvents().length,
		3,
	);

	const pruneResult = service.prunePlanningRecommendationPolicyHistory(
		cliIdentity,
		{
			older_than_days: 30,
			event_type: "all",
		},
	);
	assert.equal(pruneResult.pruned_count, 2);
	assert.equal(
		service.db.listPlanningHygienePolicyGovernanceEvents().length,
		1,
	);
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

	const postPruneReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
	assert.equal(postPruneReport.retention_candidate_count, 0);
	assert.equal(postPruneReport.recent_policy_exit_count, 0);
});

test("phase-19 policy report groups repeated governance history without mutating raw events", async () => {
	const now = Date.now();
	const { service } = createFixture();
	const rawDb = (service.db as any).db;

	const createPolicyFamily = (
		dedupeSuffix: string,
		kind:
			| "schedule_task_block"
			| "schedule_thread_followup"
			| "schedule_event_prep",
		groupKey:
			| "urgent_unscheduled_tasks"
			| "urgent_inbox_followups"
			| "near_term_meeting_prep",
		decision:
			| "investigate_externalized_workflow"
			| "investigate_source_suppression",
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

		const openRecommendation = service.db.createPlanningRecommendation(
			cliIdentity,
			{
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
			},
		);

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

	const governanceEvents =
		service.db.listPlanningHygienePolicyGovernanceEvents();
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
		.prepare(
			`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`,
		)
		.run(
			new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(),
			archivedMixedEvent.governance_event_id,
		);
	rawDb
		.prepare(
			`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`,
		)
		.run(
			new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
			supersededMixedEvent.governance_event_id,
		);
	rawDb
		.prepare(
			`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`,
		)
		.run(
			new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
			pruneFamilyEvent.governance_event_id,
		);

	const policyReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
	assert.equal(policyReport.policy_history_family_count, 2);
	assert.equal(policyReport.repeated_policy_family_count, 1);
	assert.equal(policyReport.mixed_outcome_policy_family_count, 1);
	assert.equal(policyReport.policy_history_recent_events.length, 3);
	const mixedFamily = policyReport.policy_history_families.find(
		(item) =>
			item.group_key === "urgent_inbox_followups" &&
			item.kind === "schedule_thread_followup",
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
		(item) =>
			item.group_key === "near_term_meeting_prep" &&
			item.kind === "schedule_event_prep",
	);
	assert.ok(pruneFamily);
	assert.equal(pruneFamily.recommended_action, "prune_old_history");
	assert.match(pruneFamily.summary, /retention review/i);
	assert.equal(
		policyReport.top_repeated_policy_family_summary,
		mixedFamily.summary,
	);
	assert.equal(
		policyReport.top_mixed_outcome_policy_family_summary,
		mixedFamily.summary,
	);
	assert.equal(
		policyReport.top_retention_candidate_summary,
		pruneFamily.summary,
	);
	assert.equal(
		policyReport.policy_history_recent_events.some(
			(item) =>
				item.governance_note ===
				"Archive note should stay out of grouped summaries",
		),
		true,
	);

	const formatted = formatPlanningRecommendationPolicyReport(policyReport);
	const formattedCompressedOnly =
		formatted.split("Recent Raw Governance Events")[0] ?? formatted;
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
	assert.doesNotMatch(
		formattedCompressedOnly,
		/Archive note should stay out of grouped summaries/,
	);
	assert.doesNotMatch(formatted, /Top active proposed:/);
	assert.doesNotMatch(formatted, /Top recent policy exit:/);

	const status = await service.getStatusReport({ httpReachable: true });
	assert.equal(
		"top_policy_retention_candidate_summary" in status.planning_recommendations,
		false,
	);
	assert.doesNotMatch(
		status.planning_recommendations.top_policy_attention_summary ?? "",
		/Retention note/i,
	);

	const worklist = await service.getWorklistReport({ httpReachable: true });
	const governanceItem = worklist.items.find(
		(item) => item.kind === "planning_policy_governance_needed",
	);
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
	const operatorTaskCreate = operatorEvents.find(
		(event) => event.action === "task_create",
	);
	assert.ok(operatorTaskCreate);
	assert.equal(operatorTaskCreate.assistant_safe_category, undefined);
	assert.equal(
		operatorEvents.some(
			(event) => event.action === "planning_recommendation_policy_archived",
		),
		true,
	);
	assert.equal(
		operatorEvents.some((event) => event.action === "future_operator_action"),
		true,
	);

	const assistantEvents = service.listAuditEvents(
		{ limit: 20 },
		{ assistant_safe: true },
	);
	assert.equal(
		assistantEvents.some(
			(event) => event.action === "planning_recommendation_policy_archived",
		),
		false,
	);
	assert.equal(
		assistantEvents.some((event) => event.action === "future_operator_action"),
		false,
	);
	const assistantTaskCreate = assistantEvents.find(
		(event) => event.action === "task_create",
	);
	assert.ok(assistantTaskCreate);
	assert.equal(assistantTaskCreate.assistant_safe_category, "task");
	assert.equal(assistantTaskCreate.metadata_redacted, true);
	assert.equal(assistantTaskCreate.summary, "Task created.");
	const assistantTaskCreateMetadata = JSON.parse(
		assistantTaskCreate.metadata_json,
	) as Record<string, unknown>;
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

	const openRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
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

	const governanceEvents =
		service.db.listPlanningHygienePolicyGovernanceEvents();
	const archiveEvent = governanceEvents.find(
		(event) =>
			event.group_key === "near_term_meeting_prep" &&
			event.kind === "schedule_event_prep" &&
			event.event_type === "policy_archived",
	);
	assert.ok(archiveEvent);
	rawDb
		.prepare(
			`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`,
		)
		.run(
			new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(),
			archiveEvent.governance_event_id,
		);

	const policyReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
	assert.equal(policyReport.policy_attention_kind, "recent_exit");
	assert.match(
		policyReport.policy_attention_summary ?? "",
		/archive|supersede/i,
	);
	assert.equal(
		policyReport.policy_attention_command,
		"personal-ops recommendation policy",
	);
	assert.equal("policy_history" in policyReport, false);
	const formattedPolicy =
		formatPlanningRecommendationPolicyReport(policyReport);
	assert.match(formattedPolicy, /Primary Policy Attention/);

	const operatorPolicyJson = JSON.parse(JSON.stringify(policyReport)) as Record<
		string,
		unknown
	>;
	assert.equal("policy_history" in operatorPolicyJson, false);

	const status = await service.getStatusReport({ httpReachable: true });
	assert.equal(
		status.planning_recommendations.policy_attention_kind,
		"recent_exit",
	);
	assert.ok(status.planning_recommendations.top_policy_attention_summary);
	assert.equal(
		"top_policy_recent_exit_summary" in status.planning_recommendations,
		false,
	);
	assert.equal(
		"top_policy_retention_candidate_summary" in status.planning_recommendations,
		false,
	);
	const formattedStatus = formatStatusReport(status);
	assert.match(formattedStatus, /Policy attention:/);
	assert.doesNotMatch(formattedStatus, /Top policy recent exit:/);
	assert.doesNotMatch(formattedStatus, /Top policy retention candidate:/);

	const worklist = await service.getWorklistReport({ httpReachable: true });
	const policyItems = worklist.items.filter(
		(item) =>
			item.kind === "planning_policy_governance_needed" ||
			item.kind === "planning_policy_retention_review_needed",
	);
	assert.equal(policyItems.length, 1);
	assert.equal(policyItems[0]?.kind, "planning_policy_governance_needed");
	assert.doesNotMatch(
		policyItems[0]?.summary ?? "",
		/archive note|supersede note/i,
	);
});

test("phase-23 policy attention stays aligned across policy, status, and worklist", async () => {
	const now = Date.now();

	const getPolicyStatusKeys = (
		status: Awaited<ReturnType<PersonalOpsService["getStatusReport"]>>,
	) =>
		Object.keys(status.planning_recommendations)
			.filter(
				(key) =>
					key === "policy_attention_kind" ||
					key === "top_policy_attention_summary",
			)
			.sort();

	const createClosedPolicyFamily = (
		service: ReturnType<typeof createFixture>["service"],
		rawDb: any,
		input: {
			suffix: string;
			kind:
				| "schedule_task_block"
				| "schedule_thread_followup"
				| "schedule_event_prep";
			group_key:
				| "urgent_unscheduled_tasks"
				| "urgent_inbox_followups"
				| "near_term_meeting_prep";
			review_decision:
				| "investigate_externalized_workflow"
				| "investigate_source_suppression";
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

		const openRecommendation = service.db.createPlanningRecommendation(
			cliIdentity,
			{
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
			},
		);

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

		const policyReport =
			service.getPlanningRecommendationPolicyReport(cliIdentity);
		assert.equal(policyReport.policy_attention_kind, "history_churn");
		assert.equal(policyReport.recent_policy_exit_count, 0);
		assert.equal(policyReport.retention_candidate_count, 0);

		const status = await service.getStatusReport({ httpReachable: true });
		assert.equal(
			status.planning_recommendations.policy_attention_kind,
			"history_churn",
		);
		assert.equal(
			status.planning_recommendations.top_policy_attention_summary,
			policyReport.policy_attention_summary,
		);
		assert.equal(
			"policy_recent_exit_count" in status.planning_recommendations,
			false,
		);
		assert.equal(
			"policy_retention_candidate_count" in status.planning_recommendations,
			false,
		);
		assert.deepEqual(getPolicyStatusKeys(status), [
			"policy_attention_kind",
			"top_policy_attention_summary",
		]);

		const worklist = await service.getWorklistReport({ httpReachable: true });
		const policyItems = worklist.items.filter(
			(item) =>
				item.kind === "planning_policy_governance_needed" ||
				item.kind === "planning_policy_retention_review_needed",
		);
		assert.equal(policyItems.length, 1);
		assert.equal(policyItems[0]?.kind, "planning_policy_governance_needed");
		assert.equal(
			policyItems[0]?.summary,
			policyReport.policy_attention_summary,
		);
		assert.equal(
			policyItems[0]?.suggested_command,
			"personal-ops recommendation policy",
		);
		assert.doesNotMatch(
			policyItems[0]?.summary ?? "",
			/archive note|supersede note/i,
		);
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
			.prepare(
				`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`,
			)
			.run(
				new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
				governanceEvent.governance_event_id,
			);

		const policyReport =
			service.getPlanningRecommendationPolicyReport(cliIdentity);
		assert.equal(policyReport.policy_attention_kind, "retention_candidate");
		assert.equal(policyReport.recent_policy_exit_count, 0);
		assert.equal(policyReport.retention_candidate_count, 1);

		const status = await service.getStatusReport({ httpReachable: true });
		assert.equal(
			status.planning_recommendations.policy_attention_kind,
			"retention_candidate",
		);
		assert.equal(
			status.planning_recommendations.top_policy_attention_summary,
			policyReport.policy_attention_summary,
		);
		assert.equal(
			"policy_recent_exit_count" in status.planning_recommendations,
			false,
		);
		assert.equal(
			"policy_retention_candidate_count" in status.planning_recommendations,
			false,
		);
		assert.deepEqual(getPolicyStatusKeys(status), [
			"policy_attention_kind",
			"top_policy_attention_summary",
		]);

		const worklist = await service.getWorklistReport({ httpReachable: true });
		const policyItems = worklist.items.filter(
			(item) =>
				item.kind === "planning_policy_governance_needed" ||
				item.kind === "planning_policy_retention_review_needed",
		);
		assert.equal(policyItems.length, 1);
		assert.equal(
			policyItems[0]?.kind,
			"planning_policy_retention_review_needed",
		);
		assert.equal(
			policyItems[0]?.summary,
			policyReport.policy_attention_summary,
		);
		assert.equal(
			policyItems[0]?.suggested_command,
			"personal-ops recommendation policy",
		);
		assert.doesNotMatch(policyItems[0]?.summary ?? "", /retention note/i);
	}

	{
		const { service } = createFixture();
		const policyReport =
			service.getPlanningRecommendationPolicyReport(cliIdentity);
		assert.equal(policyReport.policy_attention_kind, "none");
		assert.equal(policyReport.recent_policy_exit_count, 0);
		assert.equal(policyReport.retention_candidate_count, 0);

		const status = await service.getStatusReport({ httpReachable: true });
		assert.equal(status.planning_recommendations.policy_attention_kind, "none");
		assert.equal(
			status.planning_recommendations.top_policy_attention_summary,
			policyReport.policy_attention_summary,
		);
		assert.equal(
			"policy_recent_exit_count" in status.planning_recommendations,
			false,
		);
		assert.equal(
			"policy_retention_candidate_count" in status.planning_recommendations,
			false,
		);
		assert.deepEqual(getPolicyStatusKeys(status), [
			"policy_attention_kind",
			"top_policy_attention_summary",
		]);

		const worklist = await service.getWorklistReport({ httpReachable: true });
		const policyItems = worklist.items.filter(
			(item) =>
				item.kind === "planning_policy_governance_needed" ||
				item.kind === "planning_policy_retention_review_needed",
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

	const report = await service.getPrepDayWorkflowReport({
		httpReachable: true,
	});

	assert.equal(report.workflow, "prep-day");
	assert.deepEqual(
		report.sections.map((section: any) => section.title),
		[
			"Overall State",
			"Top Attention",
			"Time-Sensitive Items",
			"Maintenance Window",
			"Next Commands",
		],
	);
	assert.ok(report.actions.length <= 3);
	assert.equal(report.sections[4]?.items.length, report.actions.length);
	if (report.readiness !== "ready") {
		assert.ok(report.first_repair_step);
		assert.equal(report.actions[0]?.command, report.first_repair_step);
	}
});

test("phase 18 worklist and prep-day surface a maintenance window only during calm healthy periods", async () => {
	const { service } = createFixture();
	const worklist: WorklistReport = {
		generated_at: new Date().toISOString(),
		state: "ready",
		counts_by_severity: { critical: 0, warn: 0, info: 0 },
		send_window: { active: false },
		planning_groups: [],
		maintenance_window: {
			eligible_now: true,
			deferred_reason: null,
			count: 1,
			top_step_id: "install_wrappers",
			bundle: {
				bundle_id: "maintenance-window:install_wrappers",
				title: "Preventive maintenance window",
				summary:
					"Refresh wrappers before the next drift is a good calm-window maintenance task right now.",
				recommended_commands: ["personal-ops install wrappers"],
				recommendations: [
					{
						step_id: "install_wrappers",
						title: "Refresh wrappers before the next drift",
						reason: "Wrapper drift has repeated on this machine.",
						suggested_command: "personal-ops install wrappers",
						urgency: "watch",
						last_resolved_at: "2026-04-06T18:05:00.000Z",
						repeat_count_30d: 2,
					},
				],
			},
		},
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
			placement: "calm_window",
			step_id: "install_wrappers",
			summary:
				"Refresh wrappers before the next drift is a good calm-window maintenance task right now.",
			suggested_command: "personal-ops maintenance session",
			reason:
				"Keep this for a calm window; do not displace active operator work.",
			bundle_step_ids: ["install_wrappers"],
		},
		maintenance_operating_block: {
			eligible: true,
			block: "calm_window",
			step_id: "install_wrappers",
			summary:
				"Keep this maintenance for a calm window; do not displace active operator work.",
			suggested_command: "personal-ops maintenance session",
			reason:
				"Keep this for a calm window; do not displace active operator work.",
			confidence_level: null,
			bundle_step_ids: ["install_wrappers"],
		},
		items: [],
	};
	const fakeService = {
		getStatusReport: async () => ({
			state: "ready",
			mailbox: {
				connected: "machine@example.com",
				configured: "machine@example.com",
			},
		}),
		getWorklistReport: async () => worklist,
		listPlanningRecommendations:
			service.listPlanningRecommendations.bind(service),
		listNeedsReplyThreads: service.listNeedsReplyThreads.bind(service),
		listFollowupThreads: service.listFollowupThreads.bind(service),
		listUpcomingCalendarEvents:
			service.listUpcomingCalendarEvents.bind(service),
		compareNextActionableRecommendations: () => 0,
		getPlanningRecommendationDetail:
			service.getPlanningRecommendationDetail.bind(service),
		getPlanningAutopilotReport:
			service.getPlanningAutopilotReport.bind(service),
		getOutboundAutopilotReport:
			service.getOutboundAutopilotReport.bind(service),
		getInboxAutopilotReport: service.getInboxAutopilotReport.bind(service),
		getRelatedDocsForTarget: service.getRelatedDocsForTarget.bind(service),
		getRelatedFilesForTarget: service.getRelatedFilesForTarget.bind(service),
	};

	const report = await buildPrepDayWorkflowReport(fakeService, {
		httpReachable: true,
	});
	const maintenanceSection = report.sections.find(
		(section) => section.title === "Maintenance Window",
	);

	assert.equal(worklist.maintenance_window.eligible_now, true);
	assert.equal(worklist.maintenance_window.top_step_id, "install_wrappers");
	assert.equal(
		maintenanceSection?.items[0]?.command,
		"personal-ops maintenance session",
	);
	assert.equal(
		report.actions.some(
			(action) => action.command === "personal-ops install wrappers",
		),
		false,
	);
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
	const staleFollowup = buildMessage(
		"msg-phase5-stale-followup",
		accountEmail,
		{
			thread_id: "thread-phase5-stale-followup",
			history_id: "7102",
			internal_date: String(now - 90 * 60 * 60 * 1000),
			label_ids: ["SENT"],
			from_header: `Machine <${accountEmail}>`,
			to_header: "friend@example.com",
			subject: "Checking back in",
		},
	);
	const messages = new Map([
		[needsReply.message_id, needsReply],
		[staleFollowup.message_id, staleFollowup],
	]);

	const { service } = createFixture({
		accountEmail,
		profileHistoryId: "7199",
		listRefsImpl: async (labelId) => ({
			message_ids:
				labelId === "INBOX"
					? [needsReply.message_id]
					: [staleFollowup.message_id],
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

	const report = await service.getFollowUpBlockWorkflowReport({
		httpReachable: true,
	});
	const needsReplySection = report.sections.find(
		(section) => section.title === "Needs Reply",
	);
	const waitingSection = report.sections.find(
		(section) => section.title === "Waiting To Nudge",
	);

	assert.equal(report.workflow, "follow-up-block");
	assert.equal(
		needsReplySection?.items[0]?.target_type,
		"inbox_autopilot_group",
	);
	assert.match(
		JSON.stringify(needsReplySection?.items ?? []),
		/Prepare reply block|reply draft/i,
	);
	assert.match(
		JSON.stringify(waitingSection?.items ?? []),
		/Checking back in|follow-up|Prepare follow-up block/i,
	);
	assert.ok(
		report.actions.some(
			(action) => action.target_type === "inbox_autopilot_group",
		),
	);
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

	const todayReport = await service.getPrepMeetingsWorkflowReport({
		httpReachable: true,
		scope: "today",
	});
	const next24Report = await service.getPrepMeetingsWorkflowReport({
		httpReachable: true,
		scope: "next_24h",
	});
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
			web_view_link:
				"https://docs.google.com/document/d/doc-meeting-packet/edit",
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
			web_view_link:
				"https://docs.google.com/document/d/doc-meeting-packet/edit",
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
		maintenance_window: {
			eligible_now: false,
			deferred_reason: "active_repair_pending",
			count: 0,
			top_step_id: null,
			bundle: null,
		},
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
		maintenance_scheduling: emptyMaintenanceScheduling(),
		items: [
			{
				item_id: "repair-1",
				kind: "system_degraded",
				severity: "critical",
				title: "Daemon needs repair",
				summary:
					"The daemon is unreachable and should be restarted before normal operator work.",
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
		mailbox: {
			connected: "machine@example.com",
			configured: "machine@example.com",
		},
	});

	const report = await service.getNowNextWorkflowReport({
		httpReachable: true,
	});

	assert.equal(report.workflow, "now-next");
	assert.equal(report.first_repair_step, "personal-ops doctor");
	assert.equal(report.actions[0]?.command, "personal-ops doctor");
	assert.match(
		report.sections[0]?.items[0]?.summary ?? "",
		/daemon is unreachable/i,
	);
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
		maintenance_window: {
			eligible_now: false,
			deferred_reason: "concrete_work_present",
			count: 0,
			top_step_id: null,
			bundle: null,
		},
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
		maintenance_scheduling: emptyMaintenanceScheduling(),
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
				suggested_command:
					"personal-ops recommendation hygiene --review-needed-only",
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
		mailbox: {
			connected: "machine@example.com",
			configured: "machine@example.com",
		},
	});

	const report = await service.getPrepDayWorkflowReport({
		httpReachable: true,
	});

	assert.equal(report.workflow, "prep-day");
	assert.equal(report.actions[0]?.command, "personal-ops task show task-1");
	assert.notEqual(
		report.actions[0]?.command,
		"personal-ops recommendation hygiene --review-needed-only",
	);
	assert.match(report.actions[0]?.why_now ?? "", /task|due window/i);
});

test("phase 21 worklist ordering keeps maintenance escalation behind repair and urgent concrete work", () => {
	const { service } = createFixture();
	const compareAttentionItems = (service as any).compareAttentionItems.bind(
		service,
	) as (
		left: WorklistReport["items"][number],
		right: WorklistReport["items"][number],
	) => number;

	const criticalRepair = {
		item_id: "repair-21",
		kind: "system_degraded",
		severity: "critical" as const,
		title: "System repair needed",
		summary: "Repair needs attention first.",
		target_type: "system",
		target_id: "personal-ops",
		created_at: "2026-04-12T20:00:00.000Z",
		suggested_command: "personal-ops doctor",
		metadata_json: "{}",
	};
	const urgentTask = {
		item_id: "task-21",
		kind: "task_due_soon" as const,
		severity: "warn" as const,
		title: "Task due soon",
		summary: "A real task is due soon.",
		target_type: "task",
		target_id: "task-21",
		created_at: "2026-04-12T20:00:00.000Z",
		suggested_command: "personal-ops task show task-21",
		metadata_json: "{}",
	};
	const maintenanceEscalation = {
		item_id: "maintenance-escalation:install_wrappers",
		kind: "maintenance_escalation" as const,
		severity: "warn" as const,
		title: "Maintenance escalation",
		summary:
			"This maintenance family keeps turning into repair and should be handled deliberately.",
		target_type: "system",
		target_id: "maintenance:install_wrappers",
		created_at: "2026-04-12T20:00:00.000Z",
		suggested_command: "personal-ops maintenance session",
		metadata_json: "{}",
	};
	const governanceWarn = {
		item_id: "governance-21",
		kind: "planning_policy_governance_needed" as const,
		severity: "warn" as const,
		title: "Governance review needed",
		summary: "A quiet planning family needs review.",
		target_type: "planning_recommendation_family",
		target_id: "family-21",
		created_at: "2026-04-12T20:00:00.000Z",
		suggested_command:
			"personal-ops recommendation hygiene --review-needed-only",
		metadata_json: "{}",
	};

	assert.ok(compareAttentionItems(criticalRepair, maintenanceEscalation) < 0);
	assert.ok(compareAttentionItems(urgentTask, maintenanceEscalation) < 0);
	assert.ok(compareAttentionItems(maintenanceEscalation, governanceWarn) < 0);
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

	const report = await service.getPrepMeetingsWorkflowReport({
		httpReachable: true,
		scope: "next_24h",
	});
	const prepNeeded = report.sections.find(
		(section) => section.title === "Prep Needed",
	);
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

	const openRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);

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
	assert.equal(
		"policy_recent_exit_count" in status.planning_recommendations,
		false,
	);
	assert.equal(
		"policy_retention_candidate_count" in status.planning_recommendations,
		false,
	);
	assert.equal(
		status.planning_recommendations.policy_attention_kind,
		"recent_exit",
	);
	assert.ok(status.planning_recommendations.top_policy_attention_summary);
	assert.deepEqual(
		Object.keys(status.planning_recommendations)
			.filter(
				(key) =>
					key === "policy_attention_kind" ||
					key === "top_policy_attention_summary",
			)
			.sort(),
		["policy_attention_kind", "top_policy_attention_summary"],
	);

	const formattedStatus = formatStatusReport(status);
	assert.match(formattedStatus, /Policy attention:/);
	assert.doesNotMatch(formattedStatus, /Policy recent exits:/);
	assert.doesNotMatch(formattedStatus, /Policy retention candidates:/);
	assert.doesNotMatch(
		formattedStatus,
		/review note should stay private|proposal note should stay private/i,
	);
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
	const assistantAudit = service.listAuditEvents(
		{ limit: 10 },
		{ assistant_safe: true },
	);
	const assistantTaskCreate = assistantAudit.find(
		(event) => event.action === "task_create",
	);
	assert.ok(assistantTaskCreate);
	assert.equal(assistantTaskCreate.assistant_safe_category, "task");
	assert.equal(assistantTaskCreate.metadata_redacted, true);
	assert.equal(
		operatorAudit.some((event) => "assistant_safe_category" in event),
		false,
	);
	assert.equal(
		operatorAudit.some((event) => event.metadata_redacted === true),
		false,
	);
	assert.equal(
		assistantAudit.some((event) => event.action === "future_operator_action"),
		false,
	);

	const status = await service.getStatusReport({ httpReachable: true });
	const policyReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
	const worklist = await service.getWorklistReport({ httpReachable: true });
	const formattedStatus = formatStatusReport(status);
	const formattedPolicy =
		formatPlanningRecommendationPolicyReport(policyReport);
	const policyItems = worklist.items.filter(
		(item) =>
			item.kind === "planning_policy_governance_needed" ||
			item.kind === "planning_policy_retention_review_needed",
	);

	assert.ok(
		status.planning_recommendations.top_policy_attention_summary !== undefined,
	);
	assert.equal(
		status.planning_recommendations.policy_attention_kind,
		policyReport.policy_attention_kind,
	);
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
		metadata: {
			note: "Should remain invisible to filtered assistant audit reads",
		},
	});

	const assistantDefault = service.listAuditEvents(
		{ limit: 20 },
		{ assistant_safe: true },
	);
	assert.equal(
		assistantDefault.some((event) => event.action === "mailbox_sync"),
		true,
	);
	assert.equal(
		assistantDefault.some((event) => event.action === "task_create"),
		true,
	);
	assert.equal(
		assistantDefault.some((event) => event.action === "task_suggestion_create"),
		true,
	);
	assert.equal(
		assistantDefault.some(
			(event) => event.action === "planning_recommendation_create",
		),
		true,
	);
	assert.equal(
		assistantDefault.some(
			(event) => event.action === "planning_recommendation_policy_archived",
		),
		false,
	);

	const assistantSync = service.listAuditEvents(
		{ limit: 20, category: "sync" },
		{ assistant_safe: true },
	);
	assert.deepEqual(
		assistantSync.map((event) => event.action),
		["mailbox_sync"],
	);
	assert.equal(
		assistantSync.every((event) => event.assistant_safe_category === "sync"),
		true,
	);
	assert.equal(
		assistantSync.every((event) => event.metadata_redacted === true),
		true,
	);

	const assistantTask = service.listAuditEvents(
		{ limit: 20, category: "task" },
		{ assistant_safe: true },
	);
	assert.deepEqual(
		assistantTask.map((event) => event.action),
		["task_create"],
	);
	assert.equal(
		assistantTask.every((event) => event.assistant_safe_category === "task"),
		true,
	);

	const assistantSuggestion = service.listAuditEvents(
		{ limit: 20, category: "task_suggestion" },
		{ assistant_safe: true },
	);
	assert.deepEqual(
		assistantSuggestion.map((event) => event.action),
		["task_suggestion_create"],
	);
	assert.equal(
		assistantSuggestion.every(
			(event) => event.assistant_safe_category === "task_suggestion",
		),
		true,
	);

	const assistantPlanning = service.listAuditEvents(
		{ limit: 20, category: "planning" },
		{ assistant_safe: true },
	);
	assert.deepEqual(
		assistantPlanning.map((event) => event.action),
		["planning_recommendation_create"],
	);
	assert.equal(
		assistantPlanning.every(
			(event) => event.assistant_safe_category === "planning",
		),
		true,
	);

	const operatorSync = service.listAuditEvents({ limit: 20, category: "sync" });
	assert.deepEqual(
		operatorSync.map((event) => event.action),
		["mailbox_sync"],
	);
	assert.equal(operatorSync[0]?.summary, undefined);
	assert.equal(operatorSync[0]?.metadata_redacted, undefined);
	assert.equal(operatorSync[0]?.assistant_safe_category, undefined);

	const operatorPlanning = service.listAuditEvents({
		limit: 20,
		category: "planning",
	});
	assert.deepEqual(
		operatorPlanning.map((event) => event.action),
		["planning_recommendation_create"],
	);
	assert.equal(
		operatorPlanning.some(
			(event) => event.action === "planning_recommendation_policy_archived",
		),
		false,
	);
});

test("phase-29 evidence review keeps policy formatter ordered while suppressing empty cue rows", () => {
	const { service } = createFixture();
	const policyReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
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
	const policyReport =
		service.getPlanningRecommendationPolicyReport(cliIdentity);
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

	const openRecommendation = service.db.createPlanningRecommendation(
		cliIdentity,
		{
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
		},
	);
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
	const governanceEvent =
		service.db.listPlanningHygienePolicyGovernanceEvents()[0];
	assert.ok(governanceEvent);
	rawDb
		.prepare(
			`UPDATE planning_hygiene_policy_governance_events SET recorded_at = ? WHERE governance_event_id = ?`,
		)
		.run(
			new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString(),
			governanceEvent.governance_event_id,
		);

	const server = createHttpServer(service, config, policy);
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const assistantAuditResponse = await fetch(
			`${baseUrl}/v1/audit/events?limit=20`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase18-http-test",
				},
			},
		);
		assert.equal(assistantAuditResponse.status, 200);
		const assistantAuditPayload = (await assistantAuditResponse.json()) as {
			events?: Array<{
				action?: string;
				metadata_redacted?: boolean;
				summary?: string;
				metadata_json?: string;
			}>;
		};
		assert.equal(
			assistantAuditPayload.events?.some(
				(event) => event.action === "planning_recommendation_policy_archived",
			),
			false,
		);
		const assistantTaskCreate = assistantAuditPayload.events?.find(
			(event) => event.action === "task_create",
		);
		assert.equal(assistantTaskCreate?.metadata_redacted, true);
		assert.equal(assistantTaskCreate?.summary, "Task created.");
		const assistantTaskCreateMetadata = JSON.parse(
			assistantTaskCreate?.metadata_json ?? "{}",
		) as Record<string, unknown>;
		assert.equal("title" in assistantTaskCreateMetadata, false);

		const operatorAuditResponse = await fetch(
			`${baseUrl}/v1/audit/events?limit=20`,
			{
				headers: {
					authorization: `Bearer ${config.apiToken}`,
					"x-personal-ops-client": "phase18-http-test",
				},
			},
		);
		assert.equal(operatorAuditResponse.status, 200);
		const operatorAuditPayload = (await operatorAuditResponse.json()) as {
			events?: Array<{ action?: string; metadata_json?: string }>;
		};
		assert.equal(
			operatorAuditPayload.events?.some(
				(event) => event.action === "planning_recommendation_policy_archived",
			),
			true,
		);

		const assistantPruneResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/policy/prune`,
			{
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
			},
		);
		assert.equal(assistantPruneResponse.status, 400);
		const assistantPrunePayload = (await assistantPruneResponse.json()) as {
			error?: string;
		};
		assert.match(assistantPrunePayload.error ?? "", /operator channel/i);

		const operatorPruneResponse = await fetch(
			`${baseUrl}/v1/planning-recommendations/policy/prune`,
			{
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
			},
		);
		assert.equal(operatorPruneResponse.status, 200);
		const operatorPrunePayload = (await operatorPruneResponse.json()) as {
			planning_recommendation_policy_prune?: {
				dry_run?: boolean;
				candidate_count?: number;
				pruned_count?: number;
			};
		};
		assert.equal(
			operatorPrunePayload.planning_recommendation_policy_prune?.dry_run,
			true,
		);
		assert.equal(
			operatorPrunePayload.planning_recommendation_policy_prune
				?.candidate_count,
			1,
		);
		assert.equal(
			operatorPrunePayload.planning_recommendation_policy_prune?.pruned_count,
			0,
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
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
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const assistantDefaultResponse = await fetch(
			`${baseUrl}/v1/audit/events?limit=20`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase31-http-test",
				},
			},
		);
		assert.equal(assistantDefaultResponse.status, 200);
		const assistantDefaultPayload = (await assistantDefaultResponse.json()) as {
			events?: Array<{
				action?: string;
				assistant_safe_category?: string;
				metadata_redacted?: boolean;
			}>;
		};
		assert.deepEqual(
			[
				...(assistantDefaultPayload.events?.map((event) => event.action) ?? []),
			].sort(),
			["mailbox_sync", "planning_recommendation_create"],
		);
		assert.equal(
			assistantDefaultPayload.events?.every(
				(event) => event.metadata_redacted === true,
			),
			true,
		);

		const assistantPlanningResponse = await fetch(
			`${baseUrl}/v1/audit/events?limit=20&category=planning`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase31-http-test",
				},
			},
		);
		assert.equal(assistantPlanningResponse.status, 200);
		const assistantPlanningPayload =
			(await assistantPlanningResponse.json()) as {
				events?: Array<{
					action?: string;
					assistant_safe_category?: string;
					metadata_redacted?: boolean;
				}>;
			};
		assert.deepEqual(
			assistantPlanningPayload.events?.map((event) => event.action),
			["planning_recommendation_create"],
		);
		assert.equal(
			assistantPlanningPayload.events?.every(
				(event) => event.assistant_safe_category === "planning",
			),
			true,
		);
		assert.equal(
			assistantPlanningPayload.events?.every(
				(event) => event.metadata_redacted === true,
			),
			true,
		);

		const operatorSyncResponse = await fetch(
			`${baseUrl}/v1/audit/events?limit=20&category=sync`,
			{
				headers: {
					authorization: `Bearer ${config.apiToken}`,
					"x-personal-ops-client": "phase31-http-test",
				},
			},
		);
		assert.equal(operatorSyncResponse.status, 200);
		const operatorSyncPayload = (await operatorSyncResponse.json()) as {
			events?: Array<{
				action?: string;
				summary?: string;
				metadata_redacted?: boolean;
				assistant_safe_category?: string;
			}>;
		};
		assert.deepEqual(
			operatorSyncPayload.events?.map((event) => event.action),
			["mailbox_sync"],
		);
		assert.equal(operatorSyncPayload.events?.[0]?.summary, undefined);
		assert.equal(operatorSyncPayload.events?.[0]?.metadata_redacted, undefined);
		assert.equal(
			operatorSyncPayload.events?.[0]?.assistant_safe_category,
			undefined,
		);

		const invalidCategoryResponse = await fetch(
			`${baseUrl}/v1/audit/events?limit=20&category=bogus`,
			{
				headers: {
					authorization: `Bearer ${config.assistantApiToken}`,
					"x-personal-ops-client": "phase31-http-test",
				},
			},
		);
		assert.equal(invalidCategoryResponse.status, 400);
		const invalidCategoryPayload = (await invalidCategoryResponse.json()) as {
			error?: string;
		};
		assert.match(
			invalidCategoryPayload.error ?? "",
			/category must be one of: sync, task, task_suggestion, planning/i,
		);

		for (const unsupportedParam of [
			"action",
			"target_type",
			"target_id",
			"client",
		]) {
			const unsupportedResponse = await fetch(
				`${baseUrl}/v1/audit/events?limit=20&${unsupportedParam}=ignored`,
				{
					headers: {
						authorization: `Bearer ${config.assistantApiToken}`,
						"x-personal-ops-client": "phase31-http-test",
					},
				},
			);
			assert.equal(unsupportedResponse.status, 400);
			const unsupportedPayload = (await unsupportedResponse.json()) as {
				error?: string;
			};
			assert.match(
				unsupportedPayload.error ?? "",
				/unsupported query parameter/i,
			);
			assert.match(
				unsupportedPayload.error ?? "",
				new RegExp(`\\b${unsupportedParam}\\b`, "i"),
			);
			assert.match(
				unsupportedPayload.error ?? "",
				/only limit and category are supported/i,
			);
		}
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("phase-31 mcp audit tool only exposes limit and category inputs", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf8",
	);
	const auditToolSchema = source.match(
		/name: "audit_events_recent"[\s\S]*?properties: \{([\s\S]*?)\n\s*\},\n\s*additionalProperties: false,/,
	);
	assert.ok(auditToolSchema);
	const schemaBody = auditToolSchema[1] ?? "";
	assert.match(schemaBody, /limit: \{ type: "number" \}/);
	assert.match(schemaBody, /category:/);
	assert.doesNotMatch(schemaBody, /action: \{ type: "string" \}/);
	assert.doesNotMatch(schemaBody, /target_type: \{ type: "string" \}/);
	assert.doesNotMatch(schemaBody, /target_id: \{ type: "string" \}/);
	assert.doesNotMatch(schemaBody, /client: \{ type: "string" \}/);
	assert.match(
		source,
		/assertAllowedToolArgs\(args, \["limit", "category"\], "audit_events_recent"\)/,
	);
	assert.doesNotMatch(source, /search\.set\("action", args\.action\)/);
	assert.doesNotMatch(
		source,
		/search\.set\("target_type", args\.target_type\)/,
	);
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

	const account = await service.loginGithubPat(
		GITHUB_TEST_IDENTITY,
		"ghp_test_token",
	);
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
	assert.equal(
		worklist.items.some((item) => item.kind === "github_review_requested"),
		true,
	);
	assert.equal(
		worklist.items.some((item) => item.kind === "github_pr_checks_failing"),
		true,
	);

	const server = createHttpServer(service, config, {
		notificationsTitlePrefix: "Personal Ops",
		allowSend: false,
		auditDefaultLimit: 50,
	});
	await new Promise<void>((resolve) =>
		server.listen(0, config.serviceHost, () => resolve()),
	);
	try {
		const address = server.address();
		assert(address && typeof address === "object");
		const baseUrl = `http://${config.serviceHost}:${address.port}`;
		const statusResponse = await fetch(`${baseUrl}/v1/github/status`, {
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"x-personal-ops-client": "github-http-test",
			},
		});
		assert.equal(statusResponse.status, 200);
		const statusPayload = (await statusResponse.json()) as {
			github: { review_requested_count: number };
		};
		assert.equal(statusPayload.github.review_requested_count, 1);

		const pullsResponse = await fetch(`${baseUrl}/v1/github/pulls`, {
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"x-personal-ops-client": "github-http-test",
			},
		});
		assert.equal(pullsResponse.status, 200);
		const pullsPayload = (await pullsResponse.json()) as {
			pull_requests: Array<{ pr_key: string }>;
		};
		assert.deepEqual(
			pullsPayload.pull_requests.map((pull) => pull.pr_key),
			["acme/api#18", "acme/api#12"],
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("phase-7 workflows rank github pull request work above governance noise in healthy state", async () => {
	const fakeService = {
		getStatusReport: async () => ({
			state: "ready",
			mailbox: {
				connected: "machine@example.com",
				configured: "machine@example.com",
			},
		}),
		getWorklistReport: async () => ({
			generated_at: "2026-03-29T12:00:00.000Z",
			state: "ready",
			counts_by_severity: { critical: 0, warn: 1, info: 1 },
			send_window: { active: false },
			planning_groups: [],
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "concrete_work_present" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
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

	const nowNext = await buildNowNextWorkflowReport(fakeService, {
		httpReachable: true,
	});
	const prepDay = await buildPrepDayWorkflowReport(fakeService, {
		httpReachable: true,
	});

	assert.equal(nowNext.actions[0]?.target_type, "github_pull_request");
	assert.equal(nowNext.actions[0]?.target_id, "acme/api#18");
	assert.equal(prepDay.actions[0]?.target_type, "github_pull_request");
});

test("phase 27 keeps workflow personalization ineligible when history is too thin", async () => {
	const followupRecommendation = buildWorkflowRecommendation(
		"followup-pending",
		{
			kind: "schedule_thread_followup",
			reason_summary: "Reply to an active thread.",
			rank_score: 540,
			source_thread_id: "thread-1",
			trigger_signals: ["reply_needed"],
		},
	);
	const detailById = new Map([
		[
			followupRecommendation.recommendation_id,
			buildWorkflowRecommendationDetail(followupRecommendation),
		],
	]);
	const fakeService = {
		config: { workdayStartLocal: "09:00", workdayEndLocal: "18:00" },
		getStatusReport: async () => ({
			state: "ready",
			mailbox: {
				connected: "machine@example.com",
				configured: "machine@example.com",
			},
		}),
		getWorklistReport: async () => ({
			generated_at: "2026-04-12T16:00:00.000Z",
			state: "ready",
			counts_by_severity: { critical: 0, warn: 0, info: 0 },
			send_window: { active: false },
			planning_groups: [],
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "concrete_work_present" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
			items: [],
		}),
		listPlanningRecommendations: (options?: {
			status?: string;
			include_resolved?: boolean;
		}) =>
			options?.include_resolved
				? [followupRecommendation]
				: [followupRecommendation],
		getInboxAutopilotReport: async () => ({
			generated_at: "2026-04-12T16:00:00.000Z",
			readiness: "ready",
			summary: "No inbox autopilot groups are active.",
			top_item_summary: null,
			prepared_draft_count: 0,
			groups: [],
		}),
		getPlanningAutopilotReport: async () => ({
			generated_at: "2026-04-12T16:00:00.000Z",
			readiness: "ready",
			summary: "Planning autopilot unavailable.",
			top_item_summary: null,
			prepared_bundle_count: 0,
			bundles: [],
		}),
		getOutboundAutopilotReport: async () => ({
			generated_at: "2026-04-12T16:00:00.000Z",
			readiness: "ready",
			summary: "Outbound autopilot unavailable.",
			top_item_summary: null,
			send_window: {
				active: false,
				effective_send_enabled: false,
				permanent_send_enabled: false,
			},
			groups: [],
		}),
		listNeedsReplyThreads: () => [],
		listFollowupThreads: () => [],
		listUpcomingCalendarEvents: () => [],
		compareNextActionableRecommendations: () => 0,
		getPlanningRecommendationDetail: (id: string) => detailById.get(id),
		getRelatedDocsForTarget: () => [],
		getRelatedFilesForTarget: () => [],
	};

	const report = withMockedNow("2026-04-12T16:00:00.000Z", () =>
		buildNowNextWorkflowReport(fakeService, { httpReachable: true }),
	);
	const nowNext = await report;

	assert.equal(
		nowNext.actions[0]?.workflow_personalization?.eligible ?? false,
		false,
	);
	assert.equal(nowNext.workflow_personalization?.eligible ?? false, false);
});

test("phase 27 de-emphasizes task work early in the day when history strongly prefers late-day task execution", async () => {
	const earlyWorkdayNow = new Date(2026, 3, 12, 9, 0, 0).toISOString();
	const lateTaskHistory = [
		new Date(2026, 3, 10, 16, 30, 0).toISOString(),
		new Date(2026, 3, 9, 16, 45, 0).toISOString(),
		new Date(2026, 3, 8, 17, 10, 0).toISOString(),
	];
	const earlyFollowupHistory = [
		new Date(2026, 3, 10, 9, 30, 0).toISOString(),
		new Date(2026, 3, 9, 9, 40, 0).toISOString(),
		new Date(2026, 3, 8, 9, 50, 0).toISOString(),
	];
	const taskRecommendation = buildWorkflowRecommendation("task-pending", {
		kind: "schedule_task_block",
		reason_summary: "Protect time for the current task block.",
		rank_score: 560,
		source_task_id: "task-1",
		trigger_signals: ["task_due_today"],
	});
	const followupRecommendation = buildWorkflowRecommendation(
		"followup-pending",
		{
			kind: "schedule_thread_followup",
			reason_summary: "Reply to the open client thread.",
			rank_score: 530,
			reason_code: "needs_reply",
			source_thread_id: "thread-1",
			trigger_signals: ["reply_needed"],
		},
	);
	const recommendationHistory = [
		buildWorkflowRecommendation("task-history-1", {
			kind: "schedule_task_block",
			reason_summary: "Historical late-day task block.",
			status: "applied",
			first_action_at: lateTaskHistory[0],
			source_task_id: "task-history-1",
		}),
		buildWorkflowRecommendation("task-history-2", {
			kind: "schedule_task_block",
			reason_summary: "Historical late-day task block.",
			status: "applied",
			first_action_at: lateTaskHistory[1],
			source_task_id: "task-history-2",
		}),
		buildWorkflowRecommendation("task-history-3", {
			kind: "schedule_task_block",
			reason_summary: "Historical late-day task block.",
			status: "applied",
			first_action_at: lateTaskHistory[2],
			source_task_id: "task-history-3",
		}),
		buildWorkflowRecommendation("followup-history-1", {
			kind: "schedule_thread_followup",
			reason_summary: "Historical follow-up block.",
			status: "applied",
			first_action_at: earlyFollowupHistory[0],
			source_thread_id: "thread-history-1",
		}),
		buildWorkflowRecommendation("followup-history-2", {
			kind: "schedule_thread_followup",
			reason_summary: "Historical follow-up block.",
			status: "applied",
			first_action_at: earlyFollowupHistory[1],
			source_thread_id: "thread-history-2",
		}),
		buildWorkflowRecommendation("followup-history-3", {
			kind: "schedule_thread_followup",
			reason_summary: "Historical follow-up block.",
			status: "applied",
			first_action_at: earlyFollowupHistory[2],
			source_thread_id: "thread-history-3",
		}),
	];
	const detailById = new Map([
		[
			taskRecommendation.recommendation_id,
			buildWorkflowRecommendationDetail(taskRecommendation, {
				taskDueAt: "2026-04-12T20:00:00.000Z",
			}),
		],
		[
			followupRecommendation.recommendation_id,
			buildWorkflowRecommendationDetail(followupRecommendation),
		],
	]);
	const fakeService = {
		config: { workdayStartLocal: "09:00", workdayEndLocal: "18:00" },
		getStatusReport: async () => ({
			state: "ready",
			mailbox: {
				connected: "machine@example.com",
				configured: "machine@example.com",
			},
		}),
		getWorklistReport: async () => ({
			generated_at: earlyWorkdayNow,
			state: "ready",
			counts_by_severity: { critical: 0, warn: 0, info: 0 },
			send_window: { active: false },
			planning_groups: [],
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "concrete_work_present" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
			items: [],
		}),
		listPlanningRecommendations: (options?: {
			status?: string;
			include_resolved?: boolean;
		}) =>
			options?.include_resolved
				? [taskRecommendation, followupRecommendation, ...recommendationHistory]
				: [taskRecommendation, followupRecommendation],
		getInboxAutopilotReport: async () => ({
			generated_at: earlyWorkdayNow,
			readiness: "ready",
			summary: "No inbox autopilot groups are active.",
			top_item_summary: null,
			prepared_draft_count: 0,
			groups: [],
		}),
		getPlanningAutopilotReport: async () => ({
			generated_at: earlyWorkdayNow,
			readiness: "ready",
			summary: "Planning autopilot unavailable.",
			top_item_summary: null,
			prepared_bundle_count: 0,
			bundles: [],
		}),
		getOutboundAutopilotReport: async () => ({
			generated_at: earlyWorkdayNow,
			readiness: "ready",
			summary: "Outbound autopilot unavailable.",
			top_item_summary: null,
			send_window: {
				active: false,
				effective_send_enabled: false,
				permanent_send_enabled: false,
			},
			groups: [],
		}),
		listNeedsReplyThreads: () => [],
		listFollowupThreads: () => [],
		listUpcomingCalendarEvents: () => [],
		compareNextActionableRecommendations: (
			left: PlanningRecommendation,
			right: PlanningRecommendation,
		) => right.rank_score - left.rank_score,
		getPlanningRecommendationDetail: (id: string) => detailById.get(id),
		getRelatedDocsForTarget: () => [],
		getRelatedFilesForTarget: () => [],
	};

	const nowNext = await withMockedNow(earlyWorkdayNow, () =>
		buildNowNextWorkflowReport(fakeService, { httpReachable: true }),
	);
	const prepDay = await withMockedNow(earlyWorkdayNow, () =>
		buildPrepDayWorkflowReport(fakeService, { httpReachable: true }),
	);

	assert.equal(nowNext.actions[0]?.target_id, "followup-pending");
	assert.equal(nowNext.actions[0]?.workflow_personalization?.fit, "favored");
	assert.equal(prepDay.actions[0]?.target_id, "followup-pending");
	assert.equal(
		prepDay.sections.some((section) =>
			section.items.some(
				(item) =>
					item.workflow_personalization?.fit === "defer" ||
					item.workflow_personalization?.fit === "favored",
			),
		),
		true,
	);
});

test("phase 27 suppresses workflow personalization when the current time is outside the configured workday", async () => {
	const taskRecommendation = buildWorkflowRecommendation("task-pending", {
		kind: "schedule_task_block",
		reason_summary: "Protect time for the current task block.",
		rank_score: 560,
		source_task_id: "task-1",
		trigger_signals: ["task_due_today"],
	});
	const detailById = new Map([
		[
			taskRecommendation.recommendation_id,
			buildWorkflowRecommendationDetail(taskRecommendation, {
				taskDueAt: "2026-04-12T20:00:00.000Z",
			}),
		],
	]);
	const history = [
		buildWorkflowRecommendation("task-history-1", {
			kind: "schedule_task_block",
			reason_summary: "Historical task block.",
			status: "applied",
			first_action_at: "2026-04-10T16:30:00.000Z",
			source_task_id: "task-history-1",
		}),
		buildWorkflowRecommendation("task-history-2", {
			kind: "schedule_task_block",
			reason_summary: "Historical task block.",
			status: "applied",
			first_action_at: "2026-04-09T16:45:00.000Z",
			source_task_id: "task-history-2",
		}),
		buildWorkflowRecommendation("task-history-3", {
			kind: "schedule_task_block",
			reason_summary: "Historical task block.",
			status: "applied",
			first_action_at: "2026-04-08T17:10:00.000Z",
			source_task_id: "task-history-3",
		}),
	];
	const fakeService = {
		config: { workdayStartLocal: "09:00", workdayEndLocal: "18:00" },
		getStatusReport: async () => ({
			state: "ready",
			mailbox: {
				connected: "machine@example.com",
				configured: "machine@example.com",
			},
		}),
		getWorklistReport: async () => ({
			generated_at: "2026-04-12T05:00:00.000Z",
			state: "ready",
			counts_by_severity: { critical: 0, warn: 0, info: 0 },
			send_window: { active: false },
			planning_groups: [],
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "concrete_work_present" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
			items: [],
		}),
		listPlanningRecommendations: (options?: {
			status?: string;
			include_resolved?: boolean;
		}) =>
			options?.include_resolved
				? [taskRecommendation, ...history]
				: [taskRecommendation],
		getInboxAutopilotReport: async () => ({
			generated_at: "2026-04-12T05:00:00.000Z",
			readiness: "ready",
			summary: "No inbox autopilot groups are active.",
			top_item_summary: null,
			prepared_draft_count: 0,
			groups: [],
		}),
		getPlanningAutopilotReport: async () => ({
			generated_at: "2026-04-12T05:00:00.000Z",
			readiness: "ready",
			summary: "Planning autopilot unavailable.",
			top_item_summary: null,
			prepared_bundle_count: 0,
			bundles: [],
		}),
		getOutboundAutopilotReport: async () => ({
			generated_at: "2026-04-12T05:00:00.000Z",
			readiness: "ready",
			summary: "Outbound autopilot unavailable.",
			top_item_summary: null,
			send_window: {
				active: false,
				effective_send_enabled: false,
				permanent_send_enabled: false,
			},
			groups: [],
		}),
		listNeedsReplyThreads: () => [],
		listFollowupThreads: () => [],
		listUpcomingCalendarEvents: () => [],
		compareNextActionableRecommendations: () => 0,
		getPlanningRecommendationDetail: (id: string) => detailById.get(id),
		getRelatedDocsForTarget: () => [],
		getRelatedFilesForTarget: () => [],
	};

	const nowNext = await withMockedNow("2026-04-12T05:00:00.000Z", () =>
		buildNowNextWorkflowReport(fakeService, { httpReachable: true }),
	);

	assert.equal(
		nowNext.actions[0]?.workflow_personalization?.eligible ?? false,
		false,
	);
	assert.equal(nowNext.workflow_personalization?.eligible ?? false, false);
});

test("phase 30 now-next exposes stable planning identity and helpfulness for tracked top surfaced work", async () => {
	const trackedRecommendation = buildWorkflowRecommendation(
		"phase30-followup",
		{
			kind: "schedule_thread_followup",
			reason_summary: "Reply to the open client thread.",
			rank_score: 580,
			reason_code: "needs_reply",
			source_thread_id: "thread-phase30",
			trigger_signals: ["reply_needed"],
		},
	);
	const detailById = new Map([
		[
			trackedRecommendation.recommendation_id,
			buildWorkflowRecommendationDetail(trackedRecommendation),
		],
	]);
	const fakeService = {
		config: { workdayStartLocal: "09:00", workdayEndLocal: "18:00" },
		getStatusReport: async () => ({
			state: "ready",
			mailbox: {
				connected: "machine@example.com",
				configured: "machine@example.com",
			},
		}),
		getWorklistReport: async () => ({
			generated_at: "2026-04-13T16:00:00.000Z",
			state: "ready",
			counts_by_severity: { critical: 0, warn: 0, info: 0 },
			send_window: { active: false },
			planning_groups: [],
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "concrete_work_present" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
			items: [],
		}),
		listPlanningRecommendations: (options?: { include_resolved?: boolean }) =>
			options?.include_resolved
				? [trackedRecommendation]
				: [trackedRecommendation],
		getInboxAutopilotReport: async () => ({
			generated_at: "2026-04-13T16:00:00.000Z",
			readiness: "ready",
			summary: "Inbox autopilot idle.",
			top_item_summary: null,
			prepared_draft_count: 0,
			groups: [],
		}),
		getPlanningAutopilotReport: async () => ({
			generated_at: "2026-04-13T16:00:00.000Z",
			readiness: "ready",
			summary: "Planning autopilot idle.",
			top_item_summary: null,
			prepared_bundle_count: 0,
			bundles: [],
		}),
		getOutboundAutopilotReport: async () => ({
			generated_at: "2026-04-13T16:00:00.000Z",
			readiness: "ready",
			summary: "Outbound autopilot idle.",
			top_item_summary: null,
			send_window: {
				active: false,
				effective_send_enabled: false,
				permanent_send_enabled: false,
			},
			groups: [],
		}),
		listNeedsReplyThreads: () => [],
		listFollowupThreads: () => [],
		listUpcomingCalendarEvents: () => [],
		compareNextActionableRecommendations: (
			left: PlanningRecommendation,
			right: PlanningRecommendation,
		) => right.rank_score - left.rank_score,
		getPlanningRecommendationDetail: (id: string) => detailById.get(id),
		getRelatedDocsForTarget: () => [],
		getRelatedFilesForTarget: () => [],
	};

	const nowNext = await withMockedNow("2026-04-13T16:00:00.000Z", () =>
		buildNowNextWorkflowReport(fakeService, { httpReachable: true }),
	);
	const topAction = nowNext.actions[0] as any;

	assert.equal(topAction.target_id, "phase30-followup");
	assert.equal(topAction.planning_recommendation_id, "phase30-followup");
	assert.deepEqual(topAction.surfaced_work_helpfulness, {
		eligible: true,
		surface: "workflow_now_next",
		target_type: "planning_recommendation",
		target_id: "phase30-followup",
		level: "unproven",
		summary:
			"This surfaced work does not have enough recent outcome history yet.",
		sample_count_30d: 0,
		helpful_count_30d: 0,
		attempted_failed_count_30d: 0,
		superseded_count_30d: 0,
		expired_count_30d: 0,
		helpful_rate_30d: 0,
	});
});

test("phase 30 now-next skips surfaced-work tracking when the top action lacks stable planning-backed identity", async () => {
	const untrackedRecommendation = buildWorkflowRecommendation(
		"phase30-untracked",
		{
			kind: "schedule_task_block",
			reason_summary: "Protect time for operator work.",
			rank_score: 580,
			trigger_signals: ["task_due_today"],
		},
	);
	const detailById = new Map([
		[
			untrackedRecommendation.recommendation_id,
			buildWorkflowRecommendationDetail(untrackedRecommendation),
		],
	]);
	const fakeService = {
		config: { workdayStartLocal: "09:00", workdayEndLocal: "18:00" },
		getStatusReport: async () => ({
			state: "ready",
			mailbox: {
				connected: "machine@example.com",
				configured: "machine@example.com",
			},
		}),
		getWorklistReport: async () => ({
			generated_at: "2026-04-13T16:00:00.000Z",
			state: "ready",
			counts_by_severity: { critical: 0, warn: 0, info: 0 },
			send_window: { active: false },
			planning_groups: [],
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "concrete_work_present" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
			items: [],
		}),
		listPlanningRecommendations: (options?: { include_resolved?: boolean }) =>
			options?.include_resolved
				? [untrackedRecommendation]
				: [untrackedRecommendation],
		getInboxAutopilotReport: async () => ({
			generated_at: "2026-04-13T16:00:00.000Z",
			readiness: "ready",
			summary: "Inbox autopilot idle.",
			top_item_summary: null,
			prepared_draft_count: 0,
			groups: [],
		}),
		getPlanningAutopilotReport: async () => ({
			generated_at: "2026-04-13T16:00:00.000Z",
			readiness: "ready",
			summary: "Planning autopilot idle.",
			top_item_summary: null,
			prepared_bundle_count: 0,
			bundles: [],
		}),
		getOutboundAutopilotReport: async () => ({
			generated_at: "2026-04-13T16:00:00.000Z",
			readiness: "ready",
			summary: "Outbound autopilot idle.",
			top_item_summary: null,
			send_window: {
				active: false,
				effective_send_enabled: false,
				permanent_send_enabled: false,
			},
			groups: [],
		}),
		listNeedsReplyThreads: () => [],
		listFollowupThreads: () => [],
		listUpcomingCalendarEvents: () => [],
		compareNextActionableRecommendations: (
			left: PlanningRecommendation,
			right: PlanningRecommendation,
		) => right.rank_score - left.rank_score,
		getPlanningRecommendationDetail: (id: string) => detailById.get(id),
		getRelatedDocsForTarget: () => [],
		getRelatedFilesForTarget: () => [],
	};

	const nowNext = await withMockedNow("2026-04-13T16:00:00.000Z", () =>
		buildNowNextWorkflowReport(fakeService, { httpReachable: true }),
	);
	const topAction = nowNext.actions[0] as any;

	assert.equal(topAction.target_id, "phase30-untracked");
	assert.equal(topAction.planning_recommendation_id, undefined);
	assert.equal(topAction.surfaced_work_helpfulness, undefined);
});

test("phase 30 assistant queue surfaces helpfulness for the current top actionable assistant action", async () => {
	const { service, accountEmail } = createFixture();
	createDraft(service, accountEmail, {
		subject: "Assistant queue draft",
		providerDraftId: "provider-draft-assistant-queue",
	});
	service.createTask(cliIdentity, {
		title: "Assistant queue planning task",
		kind: "human_reminder",
		priority: "high",
		owner: "operator",
		due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
	});
	service.refreshPlanningRecommendations(cliIdentity);

	const queue = await service.getAssistantActionQueueReport({
		httpReachable: true,
	});
	const topAction = queue.actions[0] as any;

	assert.ok(topAction?.action_id);
	assert.deepEqual(topAction?.surfaced_work_helpfulness, {
		eligible: true,
		surface: "assistant_top_action",
		target_type: "assistant_action",
		target_id: topAction.action_id,
		level: "unproven",
		summary:
			"This surfaced work does not have enough recent outcome history yet.",
		sample_count_30d: 0,
		helpful_count_30d: 0,
		attempted_failed_count_30d: 0,
		superseded_count_30d: 0,
		expired_count_30d: 0,
		helpful_rate_30d: 0,
	});
});

test("phase 30 workspace home repair focus opens tracking and closes helpful on repair progress", async () => {
	const { service } = createFixture();
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const report = {
		...baseStatus,
		generated_at: "2026-04-13T16:00:00.000Z",
		state: "ready" as const,
		first_repair_step: "install_wrappers" as const,
	};
	const assistantQueue = buildAssistantQueueForSurfaceTest(
		[],
		report.generated_at,
	);
	const nowNext = buildNowNextReportForSurfaceTest([], report.generated_at);
	const workspaceHome = buildWorkspaceHomeSummary({
		status: report,
		assistantQueue,
		nowNextWorkflow: nowNext,
	});

	trackWorkspaceHomeOutcome(service, {
		report,
		workspace_home: workspaceHome,
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});
	assert.equal(
		service.db.listSurfacedWorkOutcomes({
			surface: "workspace_home",
			state: "open",
			target_type: "repair_step",
			target_id: "install_wrappers",
		}).length,
		1,
	);

	service.db.createRepairExecution({
		step_id: "install_wrappers",
		started_at: "2026-04-13T16:05:00.000Z",
		completed_at: "2026-04-13T16:10:00.000Z",
		requested_by_client: "operator-cli",
		requested_by_actor: "operator",
		trigger_source: "repair_run",
		before_first_step_id: "install_wrappers",
		after_first_step_id: "install_check",
		outcome: "resolved",
		resolved_target_step: true,
		message: "Repair progressed.",
	});

	trackWorkspaceHomeOutcome(service, {
		report: { ...report, generated_at: "2026-04-13T16:15:00.000Z" },
		workspace_home: workspaceHome,
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});

	const closed = service.db.listSurfacedWorkOutcomes({
		surface: "workspace_home",
		target_type: "repair_step",
		target_id: "install_wrappers",
		states: ["helpful"],
	});
	assert.equal(closed.length, 1);
	assert.equal(closed[0]?.evidence_kind, "repair_progressed");
});

test("phase 30 workspace home repair focus closes attempted_failed on matching failed repair execution", async () => {
	const { service } = createFixture();
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const report = {
		...baseStatus,
		generated_at: "2026-04-13T16:00:00.000Z",
		state: "ready" as const,
		first_repair_step: "install_wrappers" as const,
	};
	const assistantQueue = buildAssistantQueueForSurfaceTest(
		[],
		report.generated_at,
	);
	const nowNext = buildNowNextReportForSurfaceTest([], report.generated_at);
	const workspaceHome = buildWorkspaceHomeSummary({
		status: report,
		assistantQueue,
		nowNextWorkflow: nowNext,
	});

	trackWorkspaceHomeOutcome(service, {
		report,
		workspace_home: workspaceHome,
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});

	service.db.createRepairExecution({
		step_id: "install_wrappers",
		started_at: "2026-04-13T16:05:00.000Z",
		completed_at: "2026-04-13T16:10:00.000Z",
		requested_by_client: "operator-cli",
		requested_by_actor: "operator",
		trigger_source: "repair_run",
		before_first_step_id: "install_wrappers",
		after_first_step_id: "install_wrappers",
		outcome: "failed",
		resolved_target_step: false,
		message: "Repair failed.",
	});

	trackWorkspaceHomeOutcome(service, {
		report: { ...report, generated_at: "2026-04-13T16:15:00.000Z" },
		workspace_home: workspaceHome,
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});

	const closed = service.db.listSurfacedWorkOutcomes({
		surface: "workspace_home",
		target_type: "repair_step",
		target_id: "install_wrappers",
		states: ["attempted_failed"],
	});
	assert.equal(closed.length, 1);
	assert.equal(closed[0]?.evidence_kind, "repair_failed");
});

test("phase 30 assistant top action closes helpful, failed, superseded, and expired across lifecycle changes", () => {
	const { service } = createFixture();

	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.sync-workspace",
					summary: "Refresh local context.",
					state: "proposed",
					command: "personal-ops assistant run assistant.sync-workspace",
				},
			],
			"2026-04-13T16:00:00.000Z",
		),
	);
	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.sync-workspace",
					summary: "Refresh local context.",
					state: "completed",
					command: "personal-ops assistant run assistant.sync-workspace",
				},
			],
			"2026-04-13T16:20:00.000Z",
		),
	);

	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.create-snapshot",
					summary: "Create a snapshot.",
					state: "proposed",
					command: "personal-ops assistant run assistant.create-snapshot",
				},
			],
			"2026-04-13T17:00:00.000Z",
		),
	);
	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.create-snapshot",
					summary: "Create a snapshot.",
					state: "failed",
					command: "personal-ops assistant run assistant.create-snapshot",
				},
			],
			"2026-04-13T17:20:00.000Z",
		),
	);

	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.review-planning",
					summary: "Review planning.",
					state: "proposed",
					command: "personal-ops recommendation list",
				},
			],
			"2026-04-13T18:00:00.000Z",
		),
	);
	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.review-approvals",
					summary: "Review approvals.",
					state: "proposed",
					command: "personal-ops approval pending",
				},
			],
			"2026-04-13T18:10:00.000Z",
		),
	);

	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.review-drafts",
					summary: "Review drafts.",
					state: "proposed",
					command: "personal-ops mail draft list",
				},
			],
			"2026-04-13T19:00:00.000Z",
		),
	);
	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest([], "2026-04-14T20:30:00.000Z"),
	);

	const allClosed = service.db.listSurfacedWorkOutcomes({
		surface: "assistant_top_action",
		states: ["helpful", "attempted_failed", "superseded", "expired"],
	});
	assert.equal(
		allClosed.find((record) => record.target_id === "assistant.sync-workspace")
			?.state,
		"helpful",
	);
	assert.equal(
		allClosed.find((record) => record.target_id === "assistant.create-snapshot")
			?.state,
		"attempted_failed",
	);
	assert.equal(
		allClosed.find((record) => record.target_id === "assistant.review-planning")
			?.state,
		"superseded",
	);
	assert.equal(
		allClosed.find((record) => record.target_id === "assistant.review-drafts")
			?.state,
		"expired",
	);
});

test("phase 30 assistant top action closes from durable run evidence even when the action disappears", () => {
	const { service } = createFixture();

	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.sync-workspace",
					summary: "Refresh local context.",
					state: "proposed",
					command: "personal-ops assistant run assistant.sync-workspace",
				},
			],
			"2026-04-13T16:00:00.000Z",
		),
	);
	service.db.recordAuditEvent({
		client_id: "operator-cli",
		action: "assistant_action_run",
		target_type: "assistant_action",
		target_id: "assistant.sync-workspace",
		outcome: "success",
		metadata: {
			started_at: "2026-04-13T16:05:00.000Z",
			completed_at: "2026-04-13T16:10:00.000Z",
			summary: "Workspace refresh completed.",
		},
	});

	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest([], "2026-04-13T16:15:00.000Z"),
	);

	const closed = service.db.listSurfacedWorkOutcomes({
		surface: "assistant_top_action",
		target_type: "assistant_action",
		target_id: "assistant.sync-workspace",
		states: ["helpful"],
	});
	assert.equal(closed.length, 1);
	assert.equal(closed[0]?.evidence_kind, "assistant_progressed");
});

test("phase 30 resurfacing the same top assistant action updates the open record instead of duplicating it", () => {
	const { service } = createFixture();

	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.sync-workspace",
					summary: "Refresh local context.",
					state: "proposed",
					command: "personal-ops assistant run assistant.sync-workspace",
				},
			],
			"2026-04-13T16:00:00.000Z",
		),
	);
	trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.sync-workspace",
					summary: "Refresh local context.",
					state: "proposed",
					command: "personal-ops assistant run assistant.sync-workspace",
				},
			],
			"2026-04-13T17:00:00.000Z",
		),
	);

	const open = service.db.listSurfacedWorkOutcomes({
		surface: "assistant_top_action",
		target_type: "assistant_action",
		target_id: "assistant.sync-workspace",
		state: "open",
	});
	assert.equal(open.length, 1);
	assert.equal(open[0]?.last_seen_at, "2026-04-13T17:00:00.000Z");
});

test("phase 30 workflow now-next closes helpful when the tracked recommendation gains first action", () => {
	const { service } = createFixture();
	const recommendation = service.db.createPlanningRecommendation(cliIdentity, {
		kind: "schedule_thread_followup",
		priority: "high",
		source: "system_generated",
		reason_summary: "Reply to the open thread.",
		reason_code: "needs_reply",
		dedupe_key: "phase30:workflow:tracked",
		source_fingerprint: "phase30:workflow:tracked",
		rank_score: 560,
		ranking_version: "phase30-test",
		slot_state: "ready",
		outcome_state: "none",
		source_thread_id: "thread-phase30-tracked",
		source_last_seen_at: "2026-04-13T16:00:00.000Z",
		trigger_signals: ["reply_needed"],
		suppressed_signals: [],
	});

	trackWorkflowNowNextOutcome(
		service,
		buildNowNextReportForSurfaceTest(
			[
				{
					label: "Reply to the open thread",
					summary: "Reply to the open thread.",
					command: "personal-ops workflow now-next",
					target_type: "planning_recommendation",
					target_id: recommendation.recommendation_id,
					planning_recommendation_id: recommendation.recommendation_id,
				},
			],
			"2026-04-13T16:00:00.000Z",
		),
	);

	service.db.updatePlanningRecommendation(recommendation.recommendation_id, {
		first_action_at: "2026-04-13T16:25:00.000Z",
	});
	trackWorkflowNowNextOutcome(
		service,
		buildNowNextReportForSurfaceTest([], "2026-04-13T16:30:00.000Z"),
	);

	const closed = service.db.listSurfacedWorkOutcomes({
		surface: "workflow_now_next",
		target_type: "planning_recommendation",
		target_id: recommendation.recommendation_id,
		states: ["helpful"],
	});
	assert.equal(closed.length, 1);
	assert.equal(closed[0]?.evidence_kind, "planning_progressed");
});

test("phase 30 maintenance workspace focus closes helpful on successful completion and attempted_failed on repair handoff", async () => {
	const { service } = createFixture();
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const maintenanceReport = {
		...baseStatus,
		generated_at: "2026-04-13T16:00:00.000Z",
		state: "ready" as const,
		first_repair_step: null,
		maintenance_repair_convergence: {
			...emptyMaintenanceRepairConvergence(),
			eligible: true,
			step_id: "install_wrappers" as const,
			state: "maintenance_owned" as const,
			driver: "active_commitment" as const,
			summary:
				"This recurring family is still maintenance-owned and should be handled through the maintenance session.",
			why: "It belongs in maintenance.",
			primary_command: "personal-ops maintenance session",
		},
	};
	const assistantQueue = buildAssistantQueueForSurfaceTest(
		[],
		maintenanceReport.generated_at,
	);
	const nowNext = buildNowNextReportForSurfaceTest(
		[],
		maintenanceReport.generated_at,
	);
	const maintenanceHome = buildWorkspaceHomeSummary({
		status: maintenanceReport,
		assistantQueue,
		nowNextWorkflow: nowNext,
	});
	trackWorkspaceHomeOutcome(service, {
		report: maintenanceReport,
		workspace_home: maintenanceHome,
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});

	service.db.createRepairExecution({
		step_id: "install_wrappers",
		started_at: "2026-04-13T16:05:00.000Z",
		completed_at: "2026-04-13T16:10:00.000Z",
		requested_by_client: "operator-cli",
		requested_by_actor: "operator",
		trigger_source: "maintenance_run",
		before_first_step_id: "install_wrappers",
		after_first_step_id: null,
		outcome: "resolved",
		resolved_target_step: true,
		message: "Maintenance completed.",
	});
	trackWorkspaceHomeOutcome(service, {
		report: {
			...baseStatus,
			generated_at: "2026-04-13T16:15:00.000Z",
			first_repair_step: null,
		},
		workspace_home: buildWorkspaceHomeSummary({
			status: {
				...baseStatus,
				generated_at: "2026-04-13T16:15:00.000Z",
				first_repair_step: null,
			},
			assistantQueue,
			nowNextWorkflow: nowNext,
		}),
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});

	const helpful = service.db.listSurfacedWorkOutcomes({
		surface: "workspace_home",
		target_type: "maintenance_step",
		target_id: "install_wrappers",
		states: ["helpful"],
	});
	assert.equal(helpful.length, 1);
	assert.equal(helpful[0]?.evidence_kind, "maintenance_completed");

	const handoffReport = {
		...maintenanceReport,
		generated_at: "2026-04-13T17:00:00.000Z",
	};
	const handoffHome = buildWorkspaceHomeSummary({
		status: handoffReport,
		assistantQueue,
		nowNextWorkflow: nowNext,
	});
	trackWorkspaceHomeOutcome(service, {
		report: handoffReport,
		workspace_home: handoffHome,
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});
	service.db.createRepairExecution({
		step_id: "install_wrappers",
		started_at: "2026-04-13T17:05:00.000Z",
		completed_at: "2026-04-13T17:10:00.000Z",
		requested_by_client: "operator-cli",
		requested_by_actor: "operator",
		trigger_source: "maintenance_run",
		before_first_step_id: "install_wrappers",
		after_first_step_id: "install_check",
		outcome: "resolved",
		resolved_target_step: true,
		message: "Maintenance handed off to repair.",
	});
	trackWorkspaceHomeOutcome(service, {
		report: {
			...baseStatus,
			generated_at: "2026-04-13T17:15:00.000Z",
			first_repair_step: null,
		},
		workspace_home: buildWorkspaceHomeSummary({
			status: {
				...baseStatus,
				generated_at: "2026-04-13T17:15:00.000Z",
				first_repair_step: null,
			},
			assistantQueue,
			nowNextWorkflow: nowNext,
		}),
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});

	const failed = service.db.listSurfacedWorkOutcomes({
		surface: "workspace_home",
		target_type: "maintenance_step",
		target_id: "install_wrappers",
		states: ["attempted_failed"],
	});
	assert.equal(failed.length, 1);
	assert.equal(failed[0]?.evidence_kind, "maintenance_handed_off");
});

test("phase 30 helpfulness levels compute as unproven, helpful, mixed, and weak", () => {
	const { service } = createFixture();

	seedClosedSurfacedOutcome(service, {
		surface: "workflow_now_next",
		surfaced_state: "workflow",
		target_type: "planning_recommendation",
		target_id: "rec-unproven",
		planning_recommendation_id: "rec-unproven",
		state: "helpful",
		evidence_kind: "planning_progressed",
	});

	for (const index of [1, 2, 3]) {
		seedClosedSurfacedOutcome(service, {
			surface: "workflow_now_next",
			surfaced_state: "workflow",
			target_type: "planning_recommendation",
			target_id: "rec-helpful",
			planning_recommendation_id: "rec-helpful",
			state: index === 3 ? "expired" : "helpful",
			evidence_kind: index === 3 ? "timed_out" : "planning_progressed",
		});
	}
	for (const state of ["helpful", "attempted_failed", "expired"] as const) {
		seedClosedSurfacedOutcome(service, {
			surface: "workflow_now_next",
			surfaced_state: "workflow",
			target_type: "planning_recommendation",
			target_id: "rec-mixed",
			planning_recommendation_id: "rec-mixed",
			state,
			evidence_kind:
				state === "helpful"
					? "planning_progressed"
					: state === "attempted_failed"
						? "assistant_failed"
						: "timed_out",
		});
	}
	for (const state of ["attempted_failed", "expired", "superseded"] as const) {
		seedClosedSurfacedOutcome(service, {
			surface: "workflow_now_next",
			surfaced_state: "workflow",
			target_type: "planning_recommendation",
			target_id: "rec-weak",
			planning_recommendation_id: "rec-weak",
			state,
			evidence_kind:
				state === "attempted_failed"
					? "assistant_failed"
					: state === "expired"
						? "timed_out"
						: "superseded",
		});
	}

	const makeSummary = (recommendationId: string) =>
		trackWorkflowNowNextOutcome(
			service,
			buildNowNextReportForSurfaceTest(
				[
					{
						label: "Top action",
						summary: "Top action summary.",
						command: "personal-ops workflow now-next",
						target_type: "planning_recommendation",
						target_id: recommendationId,
						planning_recommendation_id: recommendationId,
					},
				],
				"2026-04-13T18:00:00.000Z",
			),
		).helpfulness;

	assert.equal(makeSummary("rec-unproven")?.level, "unproven");
	assert.equal(makeSummary("rec-helpful")?.level, "helpful");
	assert.equal(makeSummary("rec-mixed")?.level, "mixed");
	assert.equal(makeSummary("rec-weak")?.level, "weak");
});

test("phase 30 workspace-home and assistant queue summaries agree on helpfulness for the same surfaced assistant action", async () => {
	const { service, accountEmail } = createFixture();
	createDraft(service, accountEmail, {
		subject: "Assistant queue proof",
		providerDraftId: "provider-draft-assistant-proof",
	});
	service.createTask(cliIdentity, {
		title: "Assistant queue helpfulness task",
		kind: "human_reminder",
		priority: "high",
		owner: "operator",
		due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
	});
	service.refreshPlanningRecommendations(cliIdentity);

	const initialQueue = await service.getAssistantActionQueueReport({
		httpReachable: true,
	});
	const actionId = initialQueue.actions[0]!.action_id;
	seedClosedSurfacedOutcome(service, {
		surface: "assistant_top_action",
		surfaced_state: "proposed",
		target_type: "assistant_action",
		target_id: actionId,
		assistant_action_id: actionId,
		state: "helpful",
		evidence_kind: "assistant_progressed",
	});
	seedClosedSurfacedOutcome(service, {
		surface: "workspace_home",
		surfaced_state: "assistant",
		target_type: "assistant_action",
		target_id: actionId,
		assistant_action_id: actionId,
		state: "helpful",
		evidence_kind: "assistant_progressed",
	});
	seedClosedSurfacedOutcome(service, {
		surface: "assistant_top_action",
		surfaced_state: "proposed",
		target_type: "assistant_action",
		target_id: actionId,
		assistant_action_id: actionId,
		state: "expired",
		evidence_kind: "timed_out",
	});

	const queue = await service.getAssistantActionQueueReport({
		httpReachable: true,
	});
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const statusLike = {
		...baseStatus,
		first_repair_step: null,
	};
	const workspaceTracked = trackWorkspaceHomeOutcome(service, {
		report: statusLike,
		workspace_home: buildWorkspaceHomeSummary({
			status: statusLike,
			assistantQueue: queue,
			nowNextWorkflow: buildNowNextReportForSurfaceTest(
				[],
				statusLike.generated_at,
			),
		}),
		assistant_queue: queue,
		now_next_workflow: buildNowNextReportForSurfaceTest(
			[],
			statusLike.generated_at,
		),
	}).report;

	assert.equal(queue.actions[0]?.surfaced_work_helpfulness?.level, "helpful");
	assert.equal(
		workspaceTracked.workspace_home?.surfaced_work_helpfulness?.level,
		"helpful",
	);
	assert.equal(
		queue.actions[0]?.surfaced_work_helpfulness?.summary,
		workspaceTracked.workspace_home?.surfaced_work_helpfulness?.summary,
	);
});

test("phase 31 suppresses duplicate assistant top-action copy when it matches the workspace focus", async () => {
	const { service } = createFixture();
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const assistantQueue = trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.review-top-attention",
					summary: "Review the prepared assistant action.",
					state: "awaiting_review",
					command: "personal-ops assistant queue",
				},
			],
			"2026-04-13T20:00:00.000Z",
		),
	).queue;
	const nowNext = buildNowNextReportForSurfaceTest(
		[],
		"2026-04-13T20:00:00.000Z",
	);
	const workspaceHome = buildWorkspaceHomeSummary({
		status: {
			...baseStatus,
			generated_at: "2026-04-13T20:00:00.000Z",
			first_repair_step: null,
		},
		assistantQueue,
		nowNextWorkflow: nowNext,
	});
	const trackedStatus = trackWorkspaceHomeOutcome(service, {
		report: {
			...baseStatus,
			generated_at: "2026-04-13T20:00:00.000Z",
			first_repair_step: null,
		},
		workspace_home: workspaceHome,
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	}).report;

	const reduced = applySurfacedNoiseReduction({
		status: trackedStatus,
		assistant_queue: assistantQueue,
		now_next_workflow: nowNext,
	});

	assert.equal(
		reduced.status.workspace_home.surfaced_noise_reduction?.disposition,
		"primary",
	);
	assert.equal(
		reduced.assistant_queue?.actions[0]?.surfaced_noise_reduction?.disposition,
		"suppressed_duplicate",
	);
	assert.equal(
		reduced.assistant_queue?.actions[0]?.surfaced_noise_reduction?.summary,
		"This matches the current workspace focus.",
	);
	assert.equal(
		reduced.assistant_queue?.actions[0]?.surfaced_noise_reduction
			?.show_helpfulness,
		false,
	);
	assert.equal(
		reduced.assistant_queue?.actions[0]?.command,
		"personal-ops assistant queue",
	);
});

test("phase 31 suppresses duplicate workflow copy when now-next matches the workspace focus", async () => {
	const { service } = createFixture();
	const recommendation = service.db.createPlanningRecommendation(cliIdentity, {
		kind: "schedule_thread_followup",
		priority: "high",
		source: "system_generated",
		reason_summary: "Reply to the open thread.",
		reason_code: "needs_reply",
		dedupe_key: "phase31:workflow:duplicate",
		source_fingerprint: "phase31:workflow:duplicate",
		rank_score: 600,
		ranking_version: "phase31-test",
		slot_state: "ready",
		outcome_state: "none",
		source_thread_id: "thread-phase31-duplicate",
		source_last_seen_at: "2026-04-13T20:00:00.000Z",
		trigger_signals: ["reply_needed"],
		suppressed_signals: [],
	});
	const workflow = trackWorkflowNowNextOutcome(
		service,
		buildNowNextReportForSurfaceTest(
			[
				{
					label: "Reply to the open thread",
					summary: "Reply to the open thread.",
					command:
						"personal-ops recommendation show phase31:workflow:duplicate",
					target_type: "planning_recommendation",
					target_id: recommendation.recommendation_id,
					planning_recommendation_id: recommendation.recommendation_id,
					why_now: "A live conversation still needs your reply.",
				},
			],
			"2026-04-13T20:00:00.000Z",
		),
	).report;
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const assistantQueue = buildAssistantQueueForSurfaceTest(
		[],
		workflow.generated_at,
	);
	const trackedStatus = trackWorkspaceHomeOutcome(service, {
		report: {
			...baseStatus,
			generated_at: workflow.generated_at,
			first_repair_step: null,
		},
		workspace_home: buildWorkspaceHomeSummary({
			status: {
				...baseStatus,
				generated_at: workflow.generated_at,
				first_repair_step: null,
			},
			assistantQueue,
			nowNextWorkflow: workflow,
		}),
		assistant_queue: assistantQueue,
		now_next_workflow: workflow,
	}).report;

	const reduced = applySurfacedNoiseReduction({
		status: trackedStatus,
		assistant_queue: assistantQueue,
		now_next_workflow: workflow,
	});

	assert.equal(
		reduced.now_next_workflow?.actions[0]?.surfaced_noise_reduction
			?.disposition,
		"suppressed_duplicate",
	);
	assert.equal(
		reduced.now_next_workflow?.actions[0]?.surfaced_noise_reduction
			?.show_why_now,
		false,
	);
	assert.equal(
		reduced.now_next_workflow?.actions[0]?.command,
		"personal-ops recommendation show phase31:workflow:duplicate",
	);
	assert.equal(
		reduced.now_next_workflow?.sections[0]?.items[0]?.surfaced_noise_reduction
			?.disposition,
		"suppressed_duplicate",
	);
});

test("phase 31 quiets weak and mixed secondary cues but keeps helpful and unproven cues visible", async () => {
	const { service } = createFixture();
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const assistantQueue = trackAssistantTopActionOutcome(
		service,
		buildAssistantQueueForSurfaceTest(
			[
				{
					action_id: "assistant.review-top-attention",
					summary: "Review the prepared assistant action.",
					state: "awaiting_review",
					command: "personal-ops assistant queue",
				},
			],
			"2026-04-13T20:00:00.000Z",
		),
	).queue;
	const workspaceHome = buildWorkspaceHomeSummary({
		status: {
			...baseStatus,
			generated_at: "2026-04-13T20:00:00.000Z",
			first_repair_step: null,
		},
		assistantQueue,
		nowNextWorkflow: buildNowNextReportForSurfaceTest(
			[],
			"2026-04-13T20:00:00.000Z",
		),
	});
	const trackedStatus = trackWorkspaceHomeOutcome(service, {
		report: {
			...baseStatus,
			generated_at: "2026-04-13T20:00:00.000Z",
			first_repair_step: null,
		},
		workspace_home: workspaceHome,
		assistant_queue: assistantQueue,
		now_next_workflow: buildNowNextReportForSurfaceTest(
			[],
			"2026-04-13T20:00:00.000Z",
		),
	}).report;

	const makeWorkflow = (level: "weak" | "mixed" | "helpful" | "unproven") =>
		buildNowNextReportForSurfaceTest(
			[
				{
					label: `Workflow ${level}`,
					summary: `Workflow ${level} summary.`,
					command: `personal-ops workflow ${level}`,
					target_type: "planning_recommendation",
					target_id: `workflow-${level}`,
					planning_recommendation_id: `workflow-${level}`,
					why_now: `Why ${level}.`,
					workflow_personalization: {
						eligible: true,
						category: "followup",
						preferred_window: "early_day",
						current_window: "early_day",
						fit: "favored",
						reason: "aligned_with_habit",
						summary:
							"This is a good fit for how you usually handle this kind of work.",
						sample_count_30d: 3,
					},
					surfaced_work_helpfulness: {
						eligible: true,
						surface: "workflow_now_next",
						target_type: "planning_recommendation",
						target_id: `workflow-${level}`,
						level,
						summary:
							level === "helpful"
								? "Recent outcomes suggest this surfaced work is usually acted on."
								: level === "mixed"
									? "Recent outcomes are mixed; this surfaced work is sometimes acted on and sometimes passed over."
									: level === "weak"
										? "Recent outcomes suggest this surfaced work is often surfaced without follow-through."
										: "This surfaced work does not have enough recent outcome history yet.",
						sample_count_30d: level === "unproven" ? 0 : 4,
						helpful_count_30d:
							level === "helpful" ? 3 : level === "mixed" ? 2 : 0,
						attempted_failed_count_30d:
							level === "mixed" ? 1 : level === "weak" ? 2 : 0,
						superseded_count_30d: 0,
						expired_count_30d: level === "weak" ? 2 : 0,
						helpful_rate_30d:
							level === "helpful" ? 0.75 : level === "mixed" ? 0.5 : 0,
					},
				},
			],
			"2026-04-13T20:00:00.000Z",
		);

	assert.equal(
		applySurfacedNoiseReduction({
			status: trackedStatus,
			assistant_queue: assistantQueue,
			now_next_workflow: makeWorkflow("weak"),
		}).now_next_workflow?.actions[0]?.surfaced_noise_reduction?.disposition,
		"quieted",
	);
	assert.equal(
		applySurfacedNoiseReduction({
			status: trackedStatus,
			assistant_queue: assistantQueue,
			now_next_workflow: makeWorkflow("mixed"),
		}).now_next_workflow?.actions[0]?.surfaced_noise_reduction?.disposition,
		"quieted",
	);
	assert.equal(
		applySurfacedNoiseReduction({
			status: trackedStatus,
			assistant_queue: assistantQueue,
			now_next_workflow: makeWorkflow("helpful"),
		}).now_next_workflow?.actions[0]?.surfaced_noise_reduction?.disposition,
		"supporting",
	);
	assert.equal(
		applySurfacedNoiseReduction({
			status: trackedStatus,
			assistant_queue: assistantQueue,
			now_next_workflow: makeWorkflow("unproven"),
		}).now_next_workflow?.actions[0]?.surfaced_noise_reduction?.disposition,
		"supporting",
	);
});

test("phase 31 keeps weak surfaced work visible when no stronger workspace focus exists", async () => {
	const { service } = createFixture();
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const status = {
		...baseStatus,
		workspace_home: {
			...baseStatus.workspace_home,
			state: "caught_up" as const,
			title: "The workspace is caught up",
			summary:
				"No urgent repair, assistant-prepared, workflow, or maintenance focus is currently leading.",
			why_now: null,
			primary_command: null,
			assistant_action_id: null,
			workflow: null,
			surfaced_work_helpfulness: undefined,
		},
	};
	const workflow = buildNowNextReportForSurfaceTest(
		[
			{
				label: "Weak workflow item",
				summary: "Weak workflow item.",
				command: "personal-ops workflow weak",
				target_type: "planning_recommendation",
				target_id: "weak-only",
				planning_recommendation_id: "weak-only",
				why_now: "Fallback weak item.",
				surfaced_work_helpfulness: {
					eligible: true,
					surface: "workflow_now_next",
					target_type: "planning_recommendation",
					target_id: "weak-only",
					level: "weak",
					summary:
						"Recent outcomes suggest this surfaced work is often surfaced without follow-through.",
					sample_count_30d: 4,
					helpful_count_30d: 0,
					attempted_failed_count_30d: 2,
					superseded_count_30d: 1,
					expired_count_30d: 1,
					helpful_rate_30d: 0,
				},
			},
		],
		"2026-04-13T20:00:00.000Z",
	);

	const reduced = applySurfacedNoiseReduction({
		status,
		assistant_queue: buildAssistantQueueForSurfaceTest(
			[],
			"2026-04-13T20:00:00.000Z",
		),
		now_next_workflow: workflow,
	});

	assert.equal(
		reduced.now_next_workflow?.actions[0]?.surfaced_noise_reduction
			?.disposition,
		"supporting",
	);
	assert.equal(
		reduced.now_next_workflow?.actions[0]?.surfaced_noise_reduction
			?.show_helpfulness,
		true,
	);
});

test("phase 32 derives grouped outbound handoff states across review, approval, recovery, send, and caught up", async () => {
	const accountEmail = "machine@example.com";
	const { service } = createFixture({
		accountEmail,
		sendImpl: async (providerDraftId) => ({
			provider_message_id: `sent-${providerDraftId}`,
			provider_thread_id: `thread-${providerDraftId}`,
		}),
	});
	seedMailboxReadyState(service, accountEmail, "phase32-review-approval-flow");
	const now = Date.now();

	service.db.upsertMailMessage(
		accountEmail,
		buildMessage("phase32-review-approval-flow", accountEmail, {
			thread_id: "thread-phase32-review-approval-flow",
			history_id: "phase32-review-approval-flow",
			internal_date: String(now - 60 * 60 * 1000),
			label_ids: ["INBOX", "UNREAD"],
			from_header: "Client <client@example.com>",
			subject: "Phase 32 review and approval flow",
		}),
		new Date(now - 60 * 60 * 1000).toISOString(),
	);

	const inboxReport = await service.getInboxAutopilotReport({
		httpReachable: true,
	});
	const replyGroup = inboxReport.groups.find(
		(group) => group.kind === "needs_reply",
	);
	assert.ok(replyGroup);

	const prepared = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		replyGroup!.group_id,
	);
	const review = service.db.getLatestReviewItemForArtifact(
		prepared.drafts[0]!.artifact_id,
	);
	assert.ok(review);

	const reviewNeeded = await service.getStatusReport({ httpReachable: true });
	assert.equal(
		(reviewNeeded as any).review_approval_flow?.state,
		"review_needed",
	);
	assert.equal(
		(reviewNeeded as any).review_approval_flow?.target_type,
		"outbound_autopilot_group",
	);
	assert.equal(
		(reviewNeeded as any).review_approval_flow?.outbound_group_id,
		replyGroup!.group_id,
	);

	service.openReview(cliIdentity, review!.review_id);
	service.resolveReview(
		cliIdentity,
		review!.review_id,
		"Reviewed for grouped phase 32 handoff",
	);

	const approvalNeeded = await service.getStatusReport({ httpReachable: true });
	assert.equal(
		(approvalNeeded as any).review_approval_flow?.state,
		"approval_needed",
	);
	assert.equal(
		(approvalNeeded as any).review_approval_flow?.outbound_group_id,
		replyGroup!.group_id,
	);

	await service.requestApprovalForOutboundGroup(
		cliIdentity,
		replyGroup!.group_id,
		"Request grouped approval",
	);
	await service.approveOutboundGroup(
		cliIdentity,
		replyGroup!.group_id,
		"Approve grouped phase 32 work",
		true,
	);

	const recoveryNeeded = await service.getStatusReport({ httpReachable: true });
	assert.equal(
		(recoveryNeeded as any).review_approval_flow?.state,
		"recovery_needed",
	);
	assert.equal(
		(recoveryNeeded as any).review_approval_flow?.outbound_group_id,
		replyGroup!.group_id,
	);

	service.enableSendWindow(cliIdentity, 15, "Phase 32 grouped send");
	const sendReady = await service.getStatusReport({ httpReachable: true });
	assert.equal((sendReady as any).review_approval_flow?.state, "send_ready");
	assert.equal(
		(sendReady as any).review_approval_flow?.outbound_group_id,
		replyGroup!.group_id,
	);

	await service.sendOutboundGroup(
		cliIdentity,
		replyGroup!.group_id,
		"Send grouped phase 32 work",
		true,
	);

	const caughtUp = await service.getStatusReport({ httpReachable: true });
	assert.equal((caughtUp as any).review_approval_flow?.state, "caught_up");
});

test("phase 36 keeps grouped outbound as the canonical assistant handoff and suppresses duplicate draft and approval queue actions", async () => {
	const accountEmail = "machine@example.com";
	const { service } = createFixture({ accountEmail });
	seedMailboxReadyState(service, accountEmail, "phase36-prepared-handoff");
	const now = Date.now();

	service.db.upsertMailMessage(
		accountEmail,
		buildMessage("phase36-prepared-handoff", accountEmail, {
			thread_id: "thread-phase36-prepared-handoff",
			history_id: "phase36-prepared-handoff",
			internal_date: String(now - 60 * 60 * 1000),
			label_ids: ["INBOX", "UNREAD"],
			from_header: "Client <client@example.com>",
			subject: "Phase 36 prepared handoff",
		}),
		new Date(now - 60 * 60 * 1000).toISOString(),
	);

	const inboxReport = await service.getInboxAutopilotReport({
		httpReachable: true,
	});
	const replyGroup = inboxReport.groups.find(
		(group) => group.kind === "needs_reply",
	);
	assert.ok(replyGroup);

	const prepared = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		replyGroup!.group_id,
	);
	const review = service.db.getLatestReviewItemForArtifact(
		prepared.drafts[0]!.artifact_id,
	);
	assert.ok(review);
	service.openReview(cliIdentity, review!.review_id);
	service.resolveReview(
		cliIdentity,
		review!.review_id,
		"Reviewed for grouped phase 36 handoff",
	);
	await service.requestApprovalForOutboundGroup(
		cliIdentity,
		replyGroup!.group_id,
		"Request grouped approval",
	);

	const status = await service.getStatusReport({ httpReachable: true });
	const queue = await service.getAssistantActionQueueReport({
		httpReachable: true,
	});
	const flow = (status as any).review_approval_flow;
	const topAction = queue.actions[0];

	assert.equal(flow?.eligible, true);
	assert.equal(flow?.state, "approval_needed");
	assert.equal(flow?.target_type, "outbound_autopilot_group");
	assert.equal(flow?.target_id, replyGroup!.group_id);
	assert.equal(flow?.assistant_action_id, topAction?.action_id);
	assert.equal(
		topAction?.action_id,
		`assistant.review-outbound-group:${replyGroup!.group_id}`,
	);
	assert.equal(topAction?.target_type, flow?.target_type);
	assert.equal(topAction?.target_id, flow?.target_id);
	assert.equal((status as any).workspace_home?.state, "repair");
	assert.equal(
		(status as any).workspace_home?.summary?.includes(
			"Follow personal-ops install wrappers",
		),
		true,
	);
	assert.equal(
		(status as any).workspace_home?.secondary_summary,
		topAction?.summary,
	);
	assert.equal(
		(status as any).workspace_home?.review_approval_flow?.summary,
		flow?.summary,
	);
	assert.equal(
		(status as any).workspace_home?.review_approval_flow?.supporting_summary,
		flow?.supporting_summary,
	);
	assert.equal(
		(status as any).workspace_home?.review_approval_flow?.assistant_action_id,
		topAction?.action_id,
	);
	assert.equal(
		queue.actions.some(
			(action) => action.action_id === "assistant.review-top-attention",
		),
		false,
	);
	assert.equal(
		queue.actions.some(
			(action) =>
				action.action_id ===
				`assistant.review-draft-group:${replyGroup!.group_id}`,
		),
		false,
	);
	assert.equal(
		queue.actions.some(
			(action) => action.action_id === "assistant.review-approvals",
		),
		false,
	);
	assert.equal(
		queue.actions.some(
			(action) => action.action_id === "assistant.review-drafts",
		),
		false,
	);
});

test("phase 33 tracks review handoff follow-through and closes progressed flow outcomes", async () => {
	const accountEmail = "machine@example.com";
	const { service } = createFixture({ accountEmail });
	seedMailboxReadyState(
		service,
		accountEmail,
		"phase33-review-calibration-track",
	);
	const now = Date.now();

	service.db.upsertMailMessage(
		accountEmail,
		buildMessage("phase33-review-calibration-track", accountEmail, {
			thread_id: "thread-phase33-review-calibration-track",
			history_id: "phase33-review-calibration-track",
			internal_date: String(now - 60 * 60 * 1000),
			label_ids: ["INBOX", "UNREAD"],
			from_header: "Client <client@example.com>",
			subject: "Phase 33 review calibration tracking",
		}),
		new Date(now - 60 * 60 * 1000).toISOString(),
	);

	const inboxReport = await service.getInboxAutopilotReport({
		httpReachable: true,
	});
	const replyGroup = inboxReport.groups.find(
		(group) => group.kind === "needs_reply",
	);
	assert.ok(replyGroup);

	const prepared = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		replyGroup!.group_id,
	);
	const review = service.db.getLatestReviewItemForArtifact(
		prepared.drafts[0]!.artifact_id,
	);
	assert.ok(review);

	const reviewNeeded = await service.getStatusReport({ httpReachable: true });
	assert.equal(
		(reviewNeeded as any).review_approval_flow?.state,
		"review_needed",
	);
	assert.equal(
		service.db.listReviewApprovalFlowOutcomes({ state: "open" }).length,
		1,
	);
	assert.equal(
		service.db.listReviewApprovalFlowOutcomes({ state: "open" })[0]
			?.surfaced_state,
		"review_needed",
	);

	service.openReview(cliIdentity, review!.review_id);
	service.resolveReview(
		cliIdentity,
		review!.review_id,
		"Reviewed for phase 33 tracking",
	);

	const approvalNeeded = await service.getStatusReport({ httpReachable: true });
	assert.equal(
		(approvalNeeded as any).review_approval_flow?.state,
		"approval_needed",
	);
	const helpfulOutcomes = service.db.listReviewApprovalFlowOutcomes({
		state: "helpful",
	});
	assert.equal(helpfulOutcomes.length, 1);
	assert.equal(helpfulOutcomes[0]?.evidence_kind, "review_progressed");
	assert.equal(
		(approvalNeeded as any).review_approval_flow?.calibration?.status,
		"insufficient_evidence",
	);
});

test("phase 33 review approval calibration chooses bounded next adjustments from recent outcomes", () => {
	const record = (
		suffix: string,
		overrides: Partial<ReviewApprovalFlowOutcomeRecord> = {},
	): ReviewApprovalFlowOutcomeRecord => ({
		outcome_id: `flow-${suffix}`,
		surfaced_state: "review_needed",
		target_type: "outbound_autopilot_group",
		target_id: `target-${suffix}`,
		summary_snapshot: "Review the current grouped handoff.",
		surfaced_at: "2026-04-13T10:00:00.000Z",
		last_seen_at: "2026-04-13T10:05:00.000Z",
		state: "helpful",
		evidence_kind: "review_progressed",
		acted_at: "2026-04-13T10:05:00.000Z",
		closed_at: "2026-04-13T10:05:00.000Z",
		...overrides,
	});

	const working = buildReviewApprovalFlowCalibrationSummary([
		record("working-1"),
		record("working-2", {
			surfaced_state: "approval_needed",
			evidence_kind: "approval_progressed",
		}),
		record("working-3", {
			surfaced_state: "send_ready",
			evidence_kind: "send_completed",
		}),
	]);
	assert.equal(working.status, "working");
	assert.equal(working.recommendation_kind, "keep_current_handoff");

	const batching = buildReviewApprovalFlowCalibrationSummary([
		record("batch-helpful"),
		record("batch-stalled-1", {
			target_type: "approval_request",
			state: "expired",
			evidence_kind: "timed_out",
			surfaced_state: "approval_needed",
		}),
		record("batch-stalled-2", {
			target_type: "draft_artifact",
			state: "superseded",
			evidence_kind: "superseded",
			surfaced_state: "approval_needed",
		}),
		record("batch-stalled-3", {
			target_type: "approval_request",
			state: "expired",
			evidence_kind: "timed_out",
			surfaced_state: "send_ready",
		}),
	]);
	assert.equal(batching.recommendation_kind, "consider_more_batching");

	const tuning = buildReviewApprovalFlowCalibrationSummary([
		record("tuning-helpful"),
		record("tuning-stalled-1", {
			target_type: "review_item",
			state: "expired",
			evidence_kind: "timed_out",
			surfaced_state: "review_needed",
		}),
		record("tuning-stalled-2", {
			target_type: "draft_artifact",
			state: "superseded",
			evidence_kind: "superseded",
			surfaced_state: "review_needed",
		}),
		record("tuning-stalled-3", {
			state: "attempted_failed",
			evidence_kind: "regressed_to_recovery",
			surfaced_state: "review_needed",
		}),
	]);
	assert.equal(tuning.recommendation_kind, "consider_review_tuning");

	const surfaceAdjustment = buildReviewApprovalFlowCalibrationSummary([
		record("surface-helpful"),
		record("surface-stalled-1", {
			state: "expired",
			evidence_kind: "timed_out",
			surfaced_state: "approval_needed",
		}),
		record("surface-stalled-2", {
			state: "superseded",
			evidence_kind: "superseded",
			surfaced_state: "send_ready",
		}),
		record("surface-stalled-3", {
			state: "attempted_failed",
			evidence_kind: "regressed_to_recovery",
			surfaced_state: "approval_needed",
		}),
	]);
	assert.equal(
		surfaceAdjustment.recommendation_kind,
		"consider_decision_surface_adjustment",
	);
});

test("phase 27 suppresses workflow personalization when workflow readiness is not ready", async () => {
	const taskRecommendation = buildWorkflowRecommendation("task-pending", {
		kind: "schedule_task_block",
		reason_summary: "Protect time for the current task block.",
		rank_score: 560,
		source_task_id: "task-1",
		trigger_signals: ["task_due_today"],
	});
	const detailById = new Map([
		[
			taskRecommendation.recommendation_id,
			buildWorkflowRecommendationDetail(taskRecommendation, {
				taskDueAt: "2026-04-12T20:00:00.000Z",
			}),
		],
	]);
	const history = [
		buildWorkflowRecommendation("task-history-1", {
			kind: "schedule_task_block",
			reason_summary: "Historical task block.",
			status: "applied",
			first_action_at: "2026-04-10T16:30:00.000Z",
			source_task_id: "task-history-1",
		}),
		buildWorkflowRecommendation("task-history-2", {
			kind: "schedule_task_block",
			reason_summary: "Historical task block.",
			status: "applied",
			first_action_at: "2026-04-09T16:45:00.000Z",
			source_task_id: "task-history-2",
		}),
		buildWorkflowRecommendation("task-history-3", {
			kind: "schedule_task_block",
			reason_summary: "Historical task block.",
			status: "applied",
			first_action_at: "2026-04-08T17:10:00.000Z",
			source_task_id: "task-history-3",
		}),
	];
	const fakeService = {
		config: { workdayStartLocal: "09:00", workdayEndLocal: "18:00" },
		getStatusReport: async () => ({
			state: "degraded",
			mailbox: {
				connected: "machine@example.com",
				configured: "machine@example.com",
			},
		}),
		getWorklistReport: async () => ({
			generated_at: "2026-04-12T16:00:00.000Z",
			state: "degraded",
			counts_by_severity: { critical: 1, warn: 0, info: 0 },
			send_window: { active: false },
			planning_groups: [],
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "concrete_work_present" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
			items: [],
		}),
		listPlanningRecommendations: (options?: {
			status?: string;
			include_resolved?: boolean;
		}) =>
			options?.include_resolved
				? [taskRecommendation, ...history]
				: [taskRecommendation],
		getInboxAutopilotReport: async () => ({
			generated_at: "2026-04-12T16:00:00.000Z",
			readiness: "degraded",
			summary: "Inbox autopilot unavailable.",
			top_item_summary: null,
			prepared_draft_count: 0,
			groups: [],
		}),
		getPlanningAutopilotReport: async () => ({
			generated_at: "2026-04-12T16:00:00.000Z",
			readiness: "degraded",
			summary: "Planning autopilot unavailable.",
			top_item_summary: null,
			prepared_bundle_count: 0,
			bundles: [],
		}),
		getOutboundAutopilotReport: async () => ({
			generated_at: "2026-04-12T16:00:00.000Z",
			readiness: "degraded",
			summary: "Outbound autopilot unavailable.",
			top_item_summary: null,
			send_window: {
				active: false,
				effective_send_enabled: false,
				permanent_send_enabled: false,
			},
			groups: [],
		}),
		listNeedsReplyThreads: () => [],
		listFollowupThreads: () => [],
		listUpcomingCalendarEvents: () => [],
		compareNextActionableRecommendations: () => 0,
		getPlanningRecommendationDetail: (id: string) => detailById.get(id),
		getRelatedDocsForTarget: () => [],
		getRelatedFilesForTarget: () => [],
	};

	const nowNext = await withMockedNow("2026-04-12T16:00:00.000Z", () =>
		buildNowNextWorkflowReport(fakeService, { httpReachable: true }),
	);

	assert.equal(
		nowNext.actions[0]?.workflow_personalization?.eligible ?? false,
		false,
	);
	assert.equal(nowNext.workflow_personalization?.eligible ?? false, false);
});

test("phase 29 workspace home gives repair absolute precedence over assistant, workflow, and maintenance", async () => {
	const { service } = createFixture();
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const summary = buildWorkspaceHomeSummary({
		status: {
			...baseStatus,
			state: "ready",
			first_repair_step: "personal-ops repair plan",
			maintenance_repair_convergence: {
				...emptyMaintenanceRepairConvergence(),
				eligible: true,
				step_id: "install_wrappers",
				state: "repair_owned",
				driver: "active_repair",
				summary:
					"This recurring family is now active repair and should be treated through the repair plan, not as a parallel maintenance item.",
				why: "The same family is already in repair, so maintenance should stay referential.",
				primary_command: "personal-ops repair plan",
				active_repair_step_id: "install_wrappers",
			},
		},
		assistantQueue: {
			generated_at: "2026-04-13T10:00:00.000Z",
			readiness: "ready",
			summary: "Assistant queue is ready.",
			counts_by_state: {
				proposed: 1,
				running: 0,
				awaiting_review: 0,
				blocked: 0,
				completed: 0,
				failed: 0,
			},
			top_item_summary: "Assistant action summary",
			actions: [
				{
					action_id: "assistant.review-top-attention",
					title: "Review top attention",
					summary: "Assistant action summary",
					state: "proposed",
					section: "overview",
					batch: false,
					one_click: false,
					review_required: true,
					why_now: "Assistant action why now.",
					command: "personal-ops assistant queue",
					signals: ["assistant"],
				},
			],
		},
		nowNextWorkflow: {
			workflow: "now-next",
			generated_at: "2026-04-13T10:00:00.000Z",
			readiness: "ready",
			summary: "Workflow summary",
			sections: [],
			actions: [
				{
					label: "Top workflow action",
					summary: "Workflow action summary",
					command: "personal-ops workflow now-next",
					why_now: "Workflow why now.",
				},
			],
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
		},
	});

	assert.equal(summary.state, "repair");
	assert.equal(summary.title, "Repair comes first");
	assert.equal(summary.primary_command, "personal-ops repair plan");
	assert.match(summary.summary ?? "", /active repair/i);
});

test("phase 29 workspace home falls through assistant, workflow, maintenance, then caught up", async () => {
	const { service } = createFixture();
	const baseStatus = await service.getStatusReport({ httpReachable: true });
	const maintenanceStatus = {
		...baseStatus,
		state: "ready" as const,
		first_repair_step: null,
		maintenance_repair_convergence: {
			...emptyMaintenanceRepairConvergence(),
			eligible: true,
			step_id: "install_wrappers" as const,
			state: "maintenance_owned" as const,
			driver: "active_commitment" as const,
			summary:
				"This recurring family is still maintenance-owned and should be handled through the maintenance session.",
			why: "It belongs in the maintenance session but is not active repair.",
			primary_command: "personal-ops maintenance session",
		},
	};
	const assistantQueue = {
		generated_at: "2026-04-13T10:00:00.000Z",
		readiness: "ready" as const,
		summary: "Assistant queue is ready.",
		counts_by_state: {
			proposed: 1,
			running: 0,
			awaiting_review: 0,
			blocked: 0,
			completed: 0,
			failed: 0,
		},
		top_item_summary: "Assistant action summary",
		actions: [
			{
				action_id: "assistant.review-top-attention",
				title: "Review top attention",
				summary: "Assistant action summary",
				state: "proposed" as const,
				section: "overview" as const,
				batch: false,
				one_click: false,
				review_required: true,
				why_now: "Assistant action why now.",
				command: "personal-ops assistant queue",
				signals: ["assistant"],
			},
		],
	};
	const workflow = {
		workflow: "now-next" as const,
		generated_at: "2026-04-13T10:00:00.000Z",
		readiness: "ready" as const,
		summary: "Workflow summary",
		sections: [],
		actions: [
			{
				label: "Top workflow action",
				summary: "Workflow action summary",
				command: "personal-ops workflow now-next",
				why_now: "Workflow why now.",
			},
		],
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
		maintenance_scheduling: emptyMaintenanceScheduling(),
	};

	const assistantSummary = buildWorkspaceHomeSummary({
		status: maintenanceStatus,
		assistantQueue,
		nowNextWorkflow: workflow,
	});
	assert.equal(assistantSummary.state, "assistant");
	assert.equal(
		assistantSummary.assistant_action_id,
		"assistant.review-top-attention",
	);

	const workflowSummary = buildWorkspaceHomeSummary({
		status: maintenanceStatus,
		assistantQueue: {
			...assistantQueue,
			counts_by_state: {
				proposed: 0,
				running: 0,
				awaiting_review: 0,
				blocked: 0,
				completed: 0,
				failed: 0,
			},
			top_item_summary: null,
			actions: [],
		},
		nowNextWorkflow: workflow,
	});
	assert.equal(workflowSummary.state, "workflow");
	assert.equal(workflowSummary.workflow, "now-next");

	const maintenanceSummary = buildWorkspaceHomeSummary({
		status: maintenanceStatus,
		assistantQueue: {
			...assistantQueue,
			counts_by_state: {
				proposed: 0,
				running: 0,
				awaiting_review: 0,
				blocked: 0,
				completed: 0,
				failed: 0,
			},
			top_item_summary: null,
			actions: [],
		},
		nowNextWorkflow: { ...workflow, actions: [] },
	});
	assert.equal(maintenanceSummary.state, "maintenance");
	assert.equal(
		maintenanceSummary.primary_command,
		"personal-ops maintenance session",
	);

	const caughtUpSummary = buildWorkspaceHomeSummary({
		status: {
			...maintenanceStatus,
			maintenance_repair_convergence: emptyMaintenanceRepairConvergence(),
			maintenance_decision_explanation: emptyMaintenanceDecisionExplanation(),
		},
		assistantQueue: {
			...assistantQueue,
			counts_by_state: {
				proposed: 0,
				running: 0,
				awaiting_review: 0,
				blocked: 0,
				completed: 0,
				failed: 0,
			},
			top_item_summary: null,
			actions: [],
		},
		nowNextWorkflow: { ...workflow, actions: [] },
	});
	assert.equal(caughtUpSummary.state, "caught_up");
	assert.match(caughtUpSummary.title ?? "", /caught up/i);
	assert.match(caughtUpSummary.summary ?? "", /no urgent repair/i);

	const suppressedMaintenanceSummary = buildWorkspaceHomeSummary({
		status: {
			...maintenanceStatus,
			maintenance_repair_convergence: emptyMaintenanceRepairConvergence(),
			maintenance_decision_explanation: {
				...emptyMaintenanceDecisionExplanation(),
				eligible: true,
				step_id: "install_wrappers",
				state: "suppressed",
				driver: "readiness_blocked",
				summary:
					"This maintenance family is currently suppressed because the system is not ready for maintenance guidance.",
			},
		},
		assistantQueue: {
			...assistantQueue,
			counts_by_state: {
				proposed: 0,
				running: 0,
				awaiting_review: 0,
				blocked: 0,
				completed: 0,
				failed: 0,
			},
			top_item_summary: null,
			actions: [],
		},
		nowNextWorkflow: { ...workflow, actions: [] },
	});
	assert.equal(suppressedMaintenanceSummary.state, "caught_up");
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
			assert.deepEqual(activeConfig.includedDriveFiles, [
				"doc-123",
				"file-456",
				"sheet-789",
			]);
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
						web_view_link:
							"https://docs.google.com/spreadsheets/d/sheet-789/edit",
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
						web_view_link:
							"https://docs.google.com/spreadsheets/d/sheet-789/edit",
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
	await new Promise<void>((resolve) =>
		server.listen(0, config.serviceHost, () => resolve()),
	);
	try {
		const address = server.address();
		assert(address && typeof address === "object");
		const baseUrl = `http://${config.serviceHost}:${address.port}`;

		const statusResponse = await fetch(`${baseUrl}/v1/drive/status`, {
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"x-personal-ops-client": "drive-http-test",
			},
		});
		assert.equal(statusResponse.status, 200);
		const statusPayload = (await statusResponse.json()) as {
			drive: { indexed_doc_count: number; indexed_sheet_count: number };
		};
		assert.equal(statusPayload.drive.indexed_doc_count, 1);
		assert.equal(statusPayload.drive.indexed_sheet_count, 1);

		const filesResponse = await fetch(`${baseUrl}/v1/drive/files`, {
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"x-personal-ops-client": "drive-http-test",
			},
		});
		assert.equal(filesResponse.status, 200);
		const filesPayload = (await filesResponse.json()) as {
			files: Array<{ file_id: string }>;
		};
		assert.deepEqual(
			filesPayload.files.map((file) => file.file_id),
			["doc-123", "sheet-789", "file-456"],
		);

		const docResponse = await fetch(`${baseUrl}/v1/drive/docs/doc-123`, {
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"x-personal-ops-client": "drive-http-test",
			},
		});
		assert.equal(docResponse.status, 200);
		const docPayload = (await docResponse.json()) as {
			doc: { file_id: string; snippet?: string };
		};
		assert.equal(docPayload.doc.file_id, "doc-123");
		assert.match(docPayload.doc.snippet ?? "", /Agenda/);

		const sheetResponse = await fetch(`${baseUrl}/v1/drive/sheets/sheet-789`, {
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"x-personal-ops-client": "drive-http-test",
			},
		});
		assert.equal(sheetResponse.status, 200);
		const sheetPayload = (await sheetResponse.json()) as {
			sheet: { file_id: string; tab_names: string[] };
		};
		assert.equal(sheetPayload.sheet.file_id, "sheet-789");
		assert.deepEqual(sheetPayload.sheet.tab_names, ["Prep", "Status"]);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("assistant-led phase 5 related files prefer explicit links, shared parents, and recent fallback", async () => {
	const syncedAt = "2026-03-29T15:00:00.000Z";
	const { service, accountEmail } = createFixture({
		driveEnabled: true,
		includedDriveFiles: [
			"doc-calendar",
			"doc-task",
			"doc-draft",
			"doc-fallback",
			"sheet-sibling",
		],
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
			web_view_link:
				"https://docs.google.com/spreadsheets/d/sheet-sibling/edit",
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
			web_view_link:
				"https://docs.google.com/spreadsheets/d/sheet-sibling/edit",
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
		body_text:
			"Text draft link https://docs.google.com/document/d/doc-draft/edit",
	});

	(
		service as unknown as { refreshDriveLinkProvenance(): void }
	).refreshDriveLinkProvenance();

	const eventDocs = service.getRelatedDocsForTarget(
		"calendar_event",
		"event-drive",
	);
	const eventFiles = service.getRelatedFilesForTarget(
		"calendar_event",
		"event-drive",
		{ allowFallback: true, maxItems: 3 },
	);
	const taskDocs = service.getRelatedDocsForTarget("task", task.task_id);
	const draftDocs = service.getRelatedDocsForTarget(
		"draft_artifact",
		draft.artifact_id,
	);
	const fallbackDocs = service.getRelatedDocsForTarget("task", "missing-task", {
		allowFallback: true,
		fallbackLimit: 1,
	});

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
	assert.deepEqual(
		fallbackDocs.map((doc) => doc.file_id),
		["doc-fallback"],
	);
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
			web_view_link:
				"https://docs.google.com/spreadsheets/d/sheet-meeting/edit",
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
			web_view_link:
				"https://docs.google.com/spreadsheets/d/sheet-meeting/edit",
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
		notes:
			"Packet https://docs.google.com/document/d/doc-meeting/edit and tracker https://docs.google.com/spreadsheets/d/sheet-meeting/edit",
	});

	(
		service as unknown as { refreshDriveLinkProvenance(): void }
	).refreshDriveLinkProvenance();
	const report = await service.getPrepMeetingsWorkflowReport({
		httpReachable: true,
		scope: "next_24h",
	});
	const text = JSON.stringify(report.sections);

	assert.match(text, /Drive enriched meeting/);
	assert.match(text, /Meeting packet/);
	assert.match(text, /Meeting tracker/);
});

test("assistant-led phase 6 planning autopilot forms bounded bundles across task, follow-up, and event prep work", async () => {
	const { service, accountEmail } = createFixture();
	seedPlanningAutopilotFixture(service, accountEmail);

	const report = await service.getPlanningAutopilotReport({
		httpReachable: true,
	});

	assert.equal(report.bundles.length, 3);
	assert.deepEqual(report.bundles.map((bundle) => bundle.kind).sort(), [
		"event_prep",
		"task_block",
		"thread_followup",
	]);
	assert.equal(
		report.bundles.every((bundle) => bundle.recommendation_ids.length <= 3),
		true,
	);
	assert.equal(
		report.bundles.every((bundle) => bundle.next_commands.length >= 2),
		true,
	);
});

test("assistant-led phase 6 planning autopilot reuses inbox autopilot groups and meeting packets during bundle prep", async () => {
	const { service, accountEmail } = createFixture();
	seedPlanningAutopilotFixture(service, accountEmail);

	const report = await service.getPlanningAutopilotReport({
		httpReachable: true,
	});
	const followupBundle = report.bundles.find(
		(bundle) => bundle.kind === "thread_followup",
	);
	const eventBundle = report.bundles.find(
		(bundle) => bundle.kind === "event_prep",
	);
	assert.ok(followupBundle);
	assert.ok(eventBundle);

	const preparedFollowup = await service.preparePlanningAutopilotBundle(
		cliIdentity,
		followupBundle!.bundle_id,
	);
	const preparedEvent = await service.preparePlanningAutopilotBundle(
		cliIdentity,
		eventBundle!.bundle_id,
	);

	assert.equal(preparedFollowup.success, true);
	assert.equal(preparedEvent.success, true);
	assert.equal(
		preparedFollowup.bundle.related_artifacts.some(
			(artifact) => artifact.artifact_type === "inbox_autopilot_group",
		),
		true,
	);
	assert.equal(
		preparedEvent.bundle.related_artifacts.some(
			(artifact) => artifact.artifact_type === "meeting_prep_packet",
		),
		true,
	);
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

	const report = await service.getPlanningAutopilotReport({
		httpReachable: true,
	});
	const taskBundle = report.bundles.find(
		(bundle) => bundle.kind === "task_block",
	);
	assert.ok(taskBundle);

	await service.preparePlanningAutopilotBundle(
		cliIdentity,
		taskBundle!.bundle_id,
	);
	await assert.rejects(
		() =>
			service.applyPlanningAutopilotBundle(
				cliIdentity,
				taskBundle!.bundle_id,
				"Apply task bundle",
				false,
			),
		/confirmation/i,
	);

	const applied = await service.applyPlanningAutopilotBundle(
		cliIdentity,
		taskBundle!.bundle_id,
		"Apply task bundle",
		true,
	);
	const auditEvents = service.listAuditEvents({
		limit: 20,
		action: "planning_autopilot_bundle_apply",
	});

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

	const report = await service.getPlanningAutopilotReport({
		httpReachable: true,
	});
	const taskBundle = report.bundles.find(
		(bundle) => bundle.kind === "task_block",
	);
	assert.ok(taskBundle);
	await service.preparePlanningAutopilotBundle(
		cliIdentity,
		taskBundle!.bundle_id,
	);

	const nowNext = await service.getNowNextWorkflowReport({
		httpReachable: true,
	});
	const firstConcreteAction = nowNext.actions.find(
		(action: any) => action.target_type !== "system",
	);

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

	const inboxReport = await service.getInboxAutopilotReport({
		httpReachable: true,
	});
	const replyGroup = inboxReport.groups.find(
		(group) => group.kind === "needs_reply",
	);
	assert.ok(replyGroup);

	const prepared = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		replyGroup!.group_id,
	);
	const preparedDraft = prepared.drafts[0]!;
	const review = service.db.getLatestReviewItemForArtifact(
		preparedDraft.artifact_id,
	);
	assert.ok(review);
	service.openReview(cliIdentity, review!.review_id);
	service.resolveReview(
		cliIdentity,
		review!.review_id,
		"Reviewed for outbound finish-work",
	);

	const orphanDraft = createDraft(service, accountEmail, {
		subject: "Orphan approval draft",
		to: ["orphan@example.com"],
		providerDraftId: "provider-draft-orphan",
	});
	const orphanApproval = service.requestApproval(
		cliIdentity,
		orphanDraft.artifact_id,
		"Need singleton approval",
	);

	const report = await service.getOutboundAutopilotReport({
		httpReachable: true,
	});
	const groupedReply = report.groups.find(
		(group) => group.group_id === replyGroup!.group_id,
	);
	const singleton = report.groups.find(
		(group) => group.kind === "single_draft",
	);
	const queue = await service.getAssistantActionQueueReport({
		httpReachable: true,
	});

	assert.ok(groupedReply);
	assert.equal(groupedReply?.state, "approval_ready");
	assert.equal(groupedReply?.kind, "reply_block");
	assert.ok(singleton);
	assert.equal(
		singleton?.approval_ids.includes(orphanApproval.approval_id),
		true,
	);
	assert.equal(
		queue.actions.some((action) =>
			action.action_id.startsWith("assistant.review-outbound-group:"),
		),
		true,
	);
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

	const inboxReport = await service.getInboxAutopilotReport({
		httpReachable: true,
	});
	const replyGroup = inboxReport.groups.find(
		(group) => group.kind === "needs_reply",
	);
	assert.ok(replyGroup);
	const prepared = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		replyGroup!.group_id,
	);
	const review = service.db.getLatestReviewItemForArtifact(
		prepared.drafts[0]!.artifact_id,
	);
	assert.ok(review);
	service.openReview(cliIdentity, review!.review_id);
	service.resolveReview(
		cliIdentity,
		review!.review_id,
		"Reviewed for grouped send",
	);

	const requested = await service.requestApprovalForOutboundGroup(
		cliIdentity,
		replyGroup!.group_id,
		"Request grouped approval",
	);
	assert.equal(requested.completed_approval_ids.length, 1);

	await assert.rejects(
		() =>
			service.approveOutboundGroup(
				cliIdentity,
				replyGroup!.group_id,
				"Approve grouped work",
				false,
			),
		/confirmation/i,
	);

	const approved = await service.approveOutboundGroup(
		cliIdentity,
		replyGroup!.group_id,
		"Approve grouped work",
		true,
	);
	assert.equal(approved.completed_approval_ids.length, 1);

	await assert.rejects(
		() =>
			service.sendOutboundGroup(
				cliIdentity,
				replyGroup!.group_id,
				"Send grouped work",
				true,
			),
		/send window|disabled/i,
	);

	service.enableSendWindow(cliIdentity, 15, "Allow grouped outbound send");
	await assert.rejects(
		() =>
			service.sendOutboundGroup(
				cliIdentity,
				replyGroup!.group_id,
				"Send grouped work",
				false,
			),
		/confirmation/i,
	);

	const sent = await service.sendOutboundGroup(
		cliIdentity,
		replyGroup!.group_id,
		"Send grouped work",
		true,
	);
	const refreshedGroup = await service.getOutboundAutopilotGroup(
		replyGroup!.group_id,
	);
	const audit = service.listAuditEvents({
		limit: 20,
		target_type: "outbound_autopilot_group",
	});

	assert.equal(sent.completed_approval_ids.length, 1);
	assert.equal(refreshedGroup.state, "completed");
	assert.equal(
		audit.some((event) => event.action === "outbound_autopilot_group_approve"),
		true,
	);
	assert.equal(
		audit.some((event) => event.action === "outbound_autopilot_group_send"),
		true,
	);
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

	const inboxReport = await service.getInboxAutopilotReport({
		httpReachable: true,
	});
	const replyGroup = inboxReport.groups.find(
		(group) => group.kind === "needs_reply",
	);
	assert.ok(replyGroup);
	const prepared = await service.prepareInboxAutopilotGroup(
		cliIdentity,
		replyGroup!.group_id,
	);
	const review = service.db.getLatestReviewItemForArtifact(
		prepared.drafts[0]!.artifact_id,
	);
	assert.ok(review);
	service.openReview(cliIdentity, review!.review_id);
	service.resolveReview(
		cliIdentity,
		review!.review_id,
		"Reviewed for outbound workflow",
	);
	await service.requestApprovalForOutboundGroup(
		cliIdentity,
		replyGroup!.group_id,
		"Request grouped approval",
	);

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
			maintenance_window: {
				eligible_now: false,
				deferred_reason: "no_preventive_work" as const,
				count: 0,
				top_step_id: null,
				bundle: null,
			},
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
			maintenance_scheduling: emptyMaintenanceScheduling(),
			items: [],
		}),
		listPlanningRecommendations:
			service.listPlanningRecommendations.bind(service),
		listNeedsReplyThreads: service.listNeedsReplyThreads.bind(service),
		listFollowupThreads: service.listFollowupThreads.bind(service),
		listUpcomingCalendarEvents:
			service.listUpcomingCalendarEvents.bind(service),
		compareNextActionableRecommendations: () => 0,
		getPlanningRecommendationDetail:
			service.getPlanningRecommendationDetail.bind(service),
		getPlanningAutopilotReport:
			service.getPlanningAutopilotReport.bind(service),
		getOutboundAutopilotReport:
			service.getOutboundAutopilotReport.bind(service),
		getInboxAutopilotReport: service.getInboxAutopilotReport.bind(service),
		getRelatedDocsForTarget: service.getRelatedDocsForTarget.bind(service),
		getRelatedFilesForTarget: service.getRelatedFilesForTarget.bind(service),
	};

	const nowNext = await buildNowNextWorkflowReport(fakeService, {
		httpReachable: true,
	});
	const prepDay = await buildPrepDayWorkflowReport(fakeService, {
		httpReachable: true,
	});

	assert.equal(nowNext.actions[0]?.target_type, "outbound_autopilot_group");
	assert.equal(
		prepDay.actions.some(
			(action) => action.target_type === "outbound_autopilot_group",
		),
		true,
	);
});

test("assistant-led phase 9 review packages stay bounded to one active package per surface", async () => {
	const { service } = createFixture();
	installReviewSourceFixtures(service);

	await service.refreshReviewReadModel("test-bounded");
	const report = await service.getReviewPackageReport();

	assert.equal(report.packages.length, 4);
	assert.deepEqual([...report.packages.map((pkg) => pkg.surface)].sort(), [
		"inbox",
		"meetings",
		"outbound",
		"planning",
	]);
	assert.deepEqual(
		report.packages.map((pkg) => pkg.items.length),
		[3, 3, 3, 3],
	);
	assert.equal(new Set(report.packages.map((pkg) => pkg.surface)).size, 4);
});

test("assistant-led phase 9 review package identity ignores presentation-only copy changes", async () => {
	const { service } = createFixture();
	const fixtures = installReviewSourceFixtures(service, {
		inboxGroups: [
			{
				group_id: "stable-inbox-group",
				summary: "Original inbox summary",
				why_now: "Original inbox why now",
				score_band: "highest",
				state: "awaiting_review",
			},
		],
		planningBundles: [],
		outboundGroups: [],
		meetingPackets: [],
	});

	await service.refreshReviewReadModel("test-copy-stable-initial");
	const initial = await service.getReviewPackageReport();
	const initialInbox = initial.packages.find((pkg) => pkg.surface === "inbox");
	assert.ok(initialInbox);

	fixtures.setInboxGroups([
		{
			group_id: "stable-inbox-group",
			summary: "Updated inbox summary",
			why_now: "Updated inbox why now",
			score_band: "highest",
			state: "awaiting_review",
		},
	]);

	await service.refreshReviewReadModel("test-copy-stable-refresh");
	const refreshed = await service.getReviewPackageReport();
	const refreshedInbox = refreshed.packages.find(
		(pkg) => pkg.surface === "inbox",
	);
	assert.ok(refreshedInbox);

	assert.equal(refreshedInbox?.package_id, initialInbox?.package_id);
	assert.equal(
		refreshedInbox?.source_fingerprint,
		initialInbox?.source_fingerprint,
	);
	assert.equal(refreshedInbox?.summary, "Updated inbox summary");
	assert.equal(refreshedInbox?.why_now, "Updated inbox why now");
});

test("assistant-led phase 9 review reads reuse one refresh and serve stored state while recomputing", async () => {
	const { service } = createFixture();
	const staleAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
	service.db.upsertReviewPackage({
		package_id: "review-package:seed",
		surface: "inbox",
		state: "review_ready",
		summary: "Stored review package",
		why_now: "Stored review why now",
		score_band: "high",
		signals: ["seeded"],
		prepared_at: staleAt,
		stale_at: staleAt,
		source_fingerprint: "seed-fingerprint",
		member_ids: ["seed-item"],
		next_commands: ["personal-ops inbox autopilot"],
		items: [
			{
				package_item_id: "inbox_autopilot_group:seed-item",
				item_type: "inbox_autopilot_group",
				item_id: "seed-item",
				title: "Stored item",
				summary: "Stored item summary",
				command: "personal-ops inbox autopilot",
				underlying_state: "awaiting_review",
			},
		],
		source_keys: ["inbox:seed-item"],
		is_current: true,
	});
	service.db.upsertReviewReadModelState({
		refresh_state: "fresh",
		last_refresh_started_at: staleAt,
		last_refresh_finished_at: staleAt,
		last_refresh_trigger: "seed",
		last_refresh_error: null,
	});

	let inboxRefreshCount = 0;
	let releaseRefresh!: () => void;
	const refreshGate = new Promise<void>((resolve) => {
		releaseRefresh = () => resolve();
	});
	(service as any).collectDoctorChecks = async () => [];
	(service as any).getInboxAutopilotReport = async () => {
		inboxRefreshCount += 1;
		await refreshGate;
		return {
			groups: [
				{
					group_id: "fresh-group",
					summary: "Fresh review package",
					why_now: "Fresh review why now",
					score_band: "highest",
					state: "awaiting_review",
				},
			],
		};
	};
	(service as any).getPlanningAutopilotReport = async () => ({ bundles: [] });
	(service as any).getOutboundAutopilotReport = async () => ({ groups: [] });
	(service.db as any).listMeetingPrepPackets = () => [];

	const [packagesDuringRefresh, tuningDuringRefresh] = await Promise.all([
		service.getReviewPackageReport(),
		service.getReviewTuningReport(),
	]);

	assert.equal(inboxRefreshCount, 1);
	assert.equal(
		packagesDuringRefresh.packages[0]?.package_id,
		"review-package:seed",
	);
	assert.equal(packagesDuringRefresh.refresh_state, "refreshing");
	assert.equal(tuningDuringRefresh.refresh_state, "refreshing");

	releaseRefresh();
	await (service as any).reviewReadModelRefreshInFlight;

	const refreshed = await service.getReviewPackageReport();
	assert.equal(inboxRefreshCount, 1);
	assert.equal(refreshed.packages[0]?.summary, "Fresh review package");
	assert.notEqual(refreshed.packages[0]?.package_id, "review-package:seed");
});

test("assistant-led phase 9 review packages remain a derived overlay and never alter the worklist", async () => {
	const accountEmail = "machine@example.com";
	const { service } = createFixture({ accountEmail });
	seedPlanningAutopilotFixture(service, accountEmail);

	const projectWorklist = (report: WorklistReport) =>
		report.items.map((item) => ({
			kind: item.kind,
			severity: item.severity,
			target_id: item.target_id ?? null,
			summary: item.summary,
		}));

	const before = await service.getWorklistReport({ httpReachable: true });
	service.db.upsertReviewPackage({
		package_id: "review-package:overlay-only",
		surface: "planning",
		state: "review_ready",
		summary: "Overlay planning package",
		why_now: "This should never become a worklist source.",
		score_band: "high",
		signals: ["planning_review_ready"],
		prepared_at: new Date().toISOString(),
		stale_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
		source_fingerprint: "overlay-only",
		member_ids: ["bundle-1"],
		next_commands: ["personal-ops review package review-package:overlay-only"],
		items: [
			{
				package_item_id: "planning_autopilot_bundle:bundle-1",
				item_type: "planning_autopilot_bundle",
				item_id: "bundle-1",
				title: "Overlay planning item",
				summary: "Overlay planning summary",
				command: "personal-ops planning autopilot --bundle bundle-1",
				underlying_state: "awaiting_review",
			},
		],
		source_keys: ["planning:bundle-1"],
		is_current: true,
	});
	service.db.upsertReviewReadModelState({
		refresh_state: "fresh",
		last_refresh_started_at: new Date().toISOString(),
		last_refresh_finished_at: new Date().toISOString(),
		last_refresh_trigger: "seed",
		last_refresh_error: null,
	});
	const after = await service.getWorklistReport({ httpReachable: true });

	assert.deepEqual(projectWorklist(after), projectWorklist(before));
	assert.equal(
		after.items.some((item) => item.kind.includes("review")),
		false,
	);
});

test("assistant-led phase 9 item-level feedback only annotates the targeted review item", async () => {
	const { service } = createFixture();
	installReviewSourceFixtures(service, {
		inboxGroups: [
			{
				group_id: "feedback-group-1",
				summary: "Feedback group 1",
				why_now: "Feedback reason 1",
				score_band: "highest",
				state: "awaiting_review",
			},
			{
				group_id: "feedback-group-2",
				summary: "Feedback group 2",
				why_now: "Feedback reason 2",
				score_band: "high",
				state: "awaiting_review",
			},
		],
		planningBundles: [],
		outboundGroups: [],
		meetingPackets: [],
	});

	await service.refreshReviewReadModel("test-item-feedback");
	const initial = await service.getReviewPackageReport();
	const pkg = initial.packages.find(
		(candidate) => candidate.surface === "inbox",
	);
	assert.ok(pkg);
	assert.equal(pkg?.items.length, 2);

	const targetedItem = pkg!.items[1]!;
	await service.submitReviewPackageFeedback(cliIdentity, pkg!.package_id, {
		package_item_id: targetedItem.package_item_id,
		reason: "not_useful",
		note: "Only this item was noisy.",
	});

	const refreshed = await service.getReviewPackage(pkg!.package_id);
	assert.equal(refreshed.items[0]?.current_feedback_reason, undefined);
	assert.equal(refreshed.items[1]?.current_feedback_reason, "not_useful");
	assert.equal(refreshed.state, "review_ready");
});

test("assistant-led phase 9 tuning approvals preserve evidence and only change the review overlay", async () => {
	const { service } = createFixture();
	installReviewSourceFixtures(service, {
		inboxGroups: [
			{
				group_id: "suppression-group",
				summary: "Suppression group",
				why_now: "Suppression why now",
				score_band: "highest",
				state: "awaiting_review",
			},
		],
		planningBundles: [],
		outboundGroups: [],
		meetingPackets: [],
	});

	await service.refreshReviewReadModel("test-tuning-overlay-initial");
	const initialReport = await service.getReviewPackageReport();
	const inboxPackage = initialReport.packages.find(
		(pkg) => pkg.surface === "inbox",
	);
	assert.ok(inboxPackage);
	const beforeWorklist = await service.getWorklistReport({
		httpReachable: true,
	});

	service.db.upsertReviewTuningProposal({
		proposal_id: "review-tuning:test-suppression",
		proposal_family_key: "source_suppression:inbox:inbox:suppression-group",
		evidence_fingerprint: "evidence-suppression-1",
		proposal_kind: "source_suppression",
		surface: "inbox",
		scope_key: "inbox:suppression-group",
		summary: "Suppress noisy inbox review source",
		evidence_window_days: 14,
		evidence_count: 4,
		positive_count: 0,
		negative_count: 4,
		unused_stale_count: 0,
		status: "proposed",
		evidence_json: JSON.stringify({
			source_key: "inbox:suppression-group",
			negative_count: 4,
		}),
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
	});
	service.db.upsertReviewReadModelState({
		refresh_state: "fresh",
		last_refresh_started_at: new Date().toISOString(),
		last_refresh_finished_at: new Date().toISOString(),
		last_refresh_trigger: "seed",
		last_refresh_error: null,
	});

	await service.approveReviewTuningProposal(
		cliIdentity,
		"review-tuning:test-suppression",
		"Suppress this noisy inbox source.",
	);

	const approved = service.db.getReviewTuningProposalRecord(
		"review-tuning:test-suppression",
	);
	assert.ok(approved);
	assert.equal(approved?.status, "approved");
	assert.equal(
		approved?.evidence_json,
		JSON.stringify({
			source_key: "inbox:suppression-group",
			negative_count: 4,
		}),
	);

	const refreshedReport = await service.getReviewPackageReport();
	assert.equal(
		refreshedReport.packages.some((pkg) => pkg.surface === "inbox"),
		false,
	);
	const afterWorklist = await service.getWorklistReport({
		httpReachable: true,
	});
	assert.deepEqual(
		afterWorklist.items.map((item) => ({
			kind: item.kind,
			target_id: item.target_id ?? null,
			summary: item.summary,
		})),
		beforeWorklist.items.map((item) => ({
			kind: item.kind,
			target_id: item.target_id ?? null,
			summary: item.summary,
		})),
	);
});

test("assistant-led phase 10 review report summarizes package cycles, proposals, and notification conversions", async () => {
	const { service } = createFixture();
	installReviewSourceFixtures(service, {
		inboxGroups: [
			{
				group_id: "report-inbox-group",
				summary: "Report inbox group",
				why_now: "Report inbox why now",
				score_band: "highest",
				state: "awaiting_review",
			},
		],
		planningBundles: [],
		outboundGroups: [],
		meetingPackets: [],
	});

	await service.refreshReviewReadModel("test-review-report");
	const packageReport = await service.getReviewPackageReport();
	const inboxPackage = packageReport.packages.find(
		(pkg) => pkg.surface === "inbox",
	);
	assert.ok(inboxPackage);

	const cycle = service.db.getOpenReviewPackageCycle(inboxPackage!.package_id);
	assert.ok(cycle);

	await service.recordReviewNotificationEvents(cliIdentity, [
		{
			kind: "review_package_inbox",
			decision: "fired",
			source: "desktop",
			surface: "inbox",
			package_id: inboxPackage!.package_id,
			package_cycle_id: cycle!.package_cycle_id,
			current_count: 1,
			previous_count: 0,
			cooldown_minutes: 30,
		},
		{
			kind: "review_tuning_proposal",
			decision: "suppressed",
			source: "desktop",
			proposal_id: "review-tuning:report-reopened",
			suppression_reason: "cooldown",
			current_count: 1,
			previous_count: 0,
			cooldown_minutes: 30,
		},
	]);

	await service.getReviewPackage(inboxPackage!.package_id);
	await service.submitReviewPackageFeedback(
		cliIdentity,
		inboxPackage!.package_id,
		{
			reason: "useful",
			note: "Reviewed this package.",
		},
	);

	const now = new Date().toISOString();
	const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
	service.db.upsertReviewTuningProposal({
		proposal_id: "review-tuning:report-dismissed",
		proposal_family_key:
			"notification_cooldown_override:inbox:inbox:report-inbox-group",
		evidence_fingerprint: "report-dismissed",
		proposal_kind: "notification_cooldown_override",
		surface: "inbox",
		scope_key: "inbox:report-inbox-group",
		summary: "Dismissed cooldown proposal",
		evidence_window_days: 14,
		evidence_count: 3,
		positive_count: 0,
		negative_count: 3,
		unused_stale_count: 0,
		status: "dismissed",
		evidence_json: JSON.stringify({ source_key: "inbox:report-inbox-group" }),
		created_at: now,
		updated_at: now,
		expires_at: future,
		dismissed_at: now,
		dismissed_by_client: cliIdentity.client_id,
		dismissed_by_actor: cliIdentity.requested_by,
		dismissed_note: "Not yet.",
	});
	service.db.upsertReviewTuningProposal({
		proposal_id: "review-tuning:report-reopened",
		proposal_family_key:
			"notification_cooldown_override:inbox:inbox:report-inbox-group",
		evidence_fingerprint: "report-reopened",
		proposal_kind: "notification_cooldown_override",
		surface: "inbox",
		scope_key: "inbox:report-inbox-group",
		summary: "Reopened cooldown proposal",
		evidence_window_days: 14,
		evidence_count: 4,
		positive_count: 0,
		negative_count: 4,
		unused_stale_count: 0,
		status: "proposed",
		evidence_json: JSON.stringify({ source_key: "inbox:report-inbox-group" }),
		created_at: now,
		updated_at: now,
		expires_at: future,
	});
	service.db.upsertReviewTuningProposal({
		proposal_id: "review-tuning:report-approved",
		proposal_family_key: "surface_priority_offset:inbox:inbox",
		evidence_fingerprint: "report-approved",
		proposal_kind: "surface_priority_offset",
		surface: "inbox",
		scope_key: "inbox",
		summary: "Approved priority offset proposal",
		evidence_window_days: 14,
		evidence_count: 5,
		positive_count: 0,
		negative_count: 5,
		unused_stale_count: 0,
		status: "approved",
		evidence_json: JSON.stringify({ surface: "inbox" }),
		created_at: now,
		updated_at: now,
		expires_at: future,
		approved_at: now,
		approved_by_client: cliIdentity.client_id,
		approved_by_actor: cliIdentity.requested_by,
		approved_note: "Approved for reporting.",
	});
	service.db.upsertReviewTuningState({
		proposal_id: "review-tuning:report-approved",
		proposal_kind: "surface_priority_offset",
		surface: "inbox",
		scope_key: "inbox",
		value_json: JSON.stringify({ offset: -200 }),
		status: "active",
		starts_at: now,
		expires_at: future,
		note: "Active for reporting.",
	});

	const report = await service.getReviewReport({
		window_days: 14,
		surface: "inbox",
	});

	assert.equal(report.summary.created_count, 1);
	assert.equal(report.summary.opened_count, 1);
	assert.equal(report.summary.acted_on_count, 1);
	assert.equal(report.summary.completed_count, 1);
	assert.equal(report.summary.open_rate, 1);
	assert.equal(report.summary.acted_on_rate, 1);
	assert.equal(report.summary.notification_open_conversion_rate, 1);
	assert.equal(report.summary.notification_action_conversion_rate, 1);
	assert.equal(report.notification_performance.fired_count, 1);
	assert.equal(report.notification_performance.suppressed_count, 1);
	assert.equal(report.notification_performance.cooldown_hit_count, 1);
	assert.equal(report.proposal_outcomes.proposed_count, 3);
	assert.equal(report.proposal_outcomes.approved_count, 1);
	assert.equal(report.proposal_outcomes.dismissed_count, 1);
	assert.equal(report.proposal_outcomes.reopened_count, 1);
	assert.deepEqual(report.proposal_outcomes.active_state_counts, [
		{
			proposal_kind: "surface_priority_offset",
			surface: "inbox",
			count: 1,
		},
	]);
});

test("assistant-led phase 10 review report attributes legacy feedback to the matching package cycle", async () => {
	const { service } = createFixture();
	installReviewSourceFixtures(service, {
		inboxGroups: [
			{
				group_id: "legacy-feedback-group-1",
				summary: "Legacy feedback group 1",
				why_now: "Legacy feedback reason 1",
				score_band: "highest",
				state: "awaiting_review",
			},
			{
				group_id: "legacy-feedback-group-2",
				summary: "Legacy feedback group 2",
				why_now: "Legacy feedback reason 2",
				score_band: "high",
				state: "awaiting_review",
			},
		],
		planningBundles: [],
		outboundGroups: [],
		meetingPackets: [],
	});

	await service.refreshReviewReadModel("test-review-report-legacy");
	const packageReport = await service.getReviewPackageReport();
	const inboxPackage = packageReport.packages.find(
		(pkg) => pkg.surface === "inbox",
	);
	assert.ok(inboxPackage);

	const targetedItem = inboxPackage!.items[1]!;
	service.db.createReviewFeedbackEvent({
		package_id: inboxPackage!.package_id,
		surface: "inbox",
		package_item_id: targetedItem.package_item_id,
		reason: "not_useful",
		note: "Legacy feedback event without cycle id.",
		actor: cliIdentity.requested_by ?? null,
		client_id: cliIdentity.client_id,
		source_fingerprint: inboxPackage!.source_fingerprint,
	});
	service.db.markReviewPackageStaleUnused(inboxPackage!.package_id);
	service.db.markReviewPackageCycleStaleUnused(inboxPackage!.package_id);

	const report = await service.getReviewReport({
		window_days: 14,
		surface: "inbox",
	});
	const targetedSource = report.top_noisy_sources.find(
		(source) => source.scope_key === "inbox:legacy-feedback-group-2",
	);
	const siblingSource = report.top_noisy_sources.find(
		(source) => source.scope_key === "inbox:legacy-feedback-group-1",
	);

	assert.equal(report.summary.created_count, 1);
	assert.equal(report.summary.stale_unused_count, 1);
	assert.equal(report.summary.opened_count, 0);
	assert.equal(report.summary.stale_unused_rate, 1);
	assert.equal(targetedSource?.negative_feedback_count, 1);
	assert.equal(targetedSource?.stale_unused_count, 1);
	assert.equal(siblingSource?.negative_feedback_count, 0);
	assert.equal(siblingSource?.stale_unused_count, 1);
});

test("assistant-led phase 11 review trends backfill daily snapshots once and keep them idempotent", async () => {
	const { service } = createFixture();
	installReviewSourceFixtures(service, {
		inboxGroups: [
			{
				group_id: "trend-backfill-group",
				summary: "Trend backfill group",
				why_now: "Trend backfill why now",
				score_band: "highest",
				state: "awaiting_review",
			},
		],
		planningBundles: [],
		outboundGroups: [],
		meetingPackets: [],
	});

	await service.refreshReviewReadModel("test-review-trends-backfill");
	const initial = await service.getReviewTrends({ days: 7 });
	assert.equal(initial.points.length, 7);

	const globalSnapshots = service.db.listReviewMetricSnapshots({
		scope_type: "global",
		scope_key: "global",
	});
	assert.equal(globalSnapshots.length, 7);

	const repeated = await service.getReviewTrends({ days: 7 });
	assert.equal(repeated.points.length, 7);
	assert.equal(
		service.db.listReviewMetricSnapshots({
			scope_type: "global",
			scope_key: "global",
		}).length,
		7,
	);
	assert.equal(initial.points.at(-1)?.created_count, 1);
});

test("assistant-led phase 11 review trends compute week-over-week deltas and top trend surface from snapshots", async () => {
	const { service } = createFixture();
	const today = new Date();
	for (let offset = 7; offset >= 0; offset -= 1) {
		const snapshotDate = new Date(
			today.getTime() - offset * 24 * 60 * 60 * 1000,
		)
			.toISOString()
			.slice(0, 10);
		const inboxOpen = offset === 7 ? 0.2 : offset === 0 ? 0.5 : 0.25;
		const planningOpen = offset === 7 ? 0.1 : offset === 0 ? 0.8 : 0.2;
		service.db.upsertReviewMetricSnapshot({
			snapshot_date: snapshotDate,
			scope_type: "global",
			scope_key: "global",
			metrics: {
				created_count: 2,
				opened_count: 1,
				acted_on_count: 1,
				completed_count: 1,
				stale_unused_count: 0,
				open_rate: inboxOpen,
				acted_on_rate: offset === 0 ? 0.6 : 0.3,
				stale_unused_rate: offset === 0 ? 0.1 : 0.2,
				fired_notification_count: 1,
				suppressed_notification_count: 0,
				cooldown_hit_count: 0,
				notification_open_conversion_rate: 0.5,
				notification_action_conversion_rate: offset === 0 ? 0.7 : 0.2,
				noisy_source_count: 1,
				open_tuning_proposal_count: 1,
				active_tuning_state_count: 0,
			},
		});
		service.db.upsertReviewMetricSnapshot({
			snapshot_date: snapshotDate,
			scope_type: "surface",
			scope_key: "inbox",
			metrics: {
				created_count: 2,
				opened_count: 1,
				acted_on_count: 1,
				completed_count: 1,
				stale_unused_count: 0,
				open_rate: inboxOpen,
				acted_on_rate: offset === 0 ? 0.4 : 0.2,
				stale_unused_rate: 0.2,
				fired_notification_count: 1,
				suppressed_notification_count: 0,
				cooldown_hit_count: 0,
				notification_open_conversion_rate: 0.4,
				notification_action_conversion_rate: offset === 0 ? 0.4 : 0.2,
				noisy_source_count: 1,
				open_tuning_proposal_count: 1,
				active_tuning_state_count: 0,
			},
		});
		service.db.upsertReviewMetricSnapshot({
			snapshot_date: snapshotDate,
			scope_type: "surface",
			scope_key: "planning",
			metrics: {
				created_count: 2,
				opened_count: 1,
				acted_on_count: 1,
				completed_count: 1,
				stale_unused_count: 0,
				open_rate: planningOpen,
				acted_on_rate: offset === 0 ? 0.7 : 0.2,
				stale_unused_rate: offset === 0 ? 0.05 : 0.25,
				fired_notification_count: 1,
				suppressed_notification_count: 0,
				cooldown_hit_count: 0,
				notification_open_conversion_rate: 0.4,
				notification_action_conversion_rate: offset === 0 ? 0.8 : 0.2,
				noisy_source_count: 1,
				open_tuning_proposal_count: 0,
				active_tuning_state_count: 0,
			},
		});
	}

	const trends = await service.getReviewTrends({ days: 14 });
	assert.equal(trends.points.length, 14);
	assert.equal(trends.summary.top_review_trend_surface, "planning");
	assert.equal(trends.summary.week_over_week_open_rate_delta, 0.3);
	assert.equal(
		trends.summary.week_over_week_notification_action_conversion_delta,
		0.5,
	);
});

test("assistant-led phase 11 review impact compares approved tuning before and after approval windows", async () => {
	const { service } = createFixture();
	const now = Date.now();
	const approvedAt = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString();
	const preStart = new Date(
		Date.parse(approvedAt) - 6 * 24 * 60 * 60 * 1000,
	).toISOString();
	const preSecond = new Date(
		Date.parse(approvedAt) - 5 * 24 * 60 * 60 * 1000,
	).toISOString();
	const postStart = new Date(
		Date.parse(approvedAt) + 1 * 24 * 60 * 60 * 1000,
	).toISOString();
	const postSecond = new Date(
		Date.parse(approvedAt) + 2 * 24 * 60 * 60 * 1000,
	).toISOString();
	const future = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();

	for (const [packageId, startedAt, openedAt, actedOnAt, staleUnusedAt] of [
		["impact-pre-1", preStart, undefined, undefined, preStart],
		["impact-pre-2", preSecond, undefined, undefined, preSecond],
		["impact-post-1", postStart, postStart, postStart, undefined],
		["impact-post-2", postSecond, postSecond, postSecond, undefined],
	] as const) {
		service.db.ensureOpenReviewPackageCycle({
			package_id: packageId,
			surface: "inbox",
			source_fingerprint: packageId,
			summary: packageId,
			why_now: packageId,
			score_band: "high",
			member_ids: [packageId],
			items: [
				{
					package_item_id: `group:${packageId}`,
					item_type: "inbox_autopilot_group",
					item_id: packageId,
					title: packageId,
					summary: packageId,
					command: "personal-ops inbox autopilot",
					underlying_state: "awaiting_review",
				},
			],
			source_keys: ["inbox:impact-source"],
			seen_at: startedAt,
			opened_at: openedAt ?? null,
			acted_on_at: actedOnAt ?? null,
			completed_at: actedOnAt ?? null,
			stale_unused_at: staleUnusedAt ?? null,
		});
	}

	const postCycle =
		service.db.getLatestReviewPackageCycleForPackage("impact-post-2");
	assert.ok(postCycle);
	service.db.createReviewNotificationEvent({
		kind: "review_package_inbox",
		decision: "fired",
		source: "desktop",
		surface: "inbox",
		package_id: "impact-post-2",
		package_cycle_id: postCycle!.package_cycle_id,
		current_count: 1,
		previous_count: 0,
		cooldown_minutes: 30,
		client_id: cliIdentity.client_id,
		actor: cliIdentity.requested_by ?? null,
	});

	service.db.upsertReviewTuningProposal({
		proposal_id: "review-tuning:impact-source",
		proposal_family_key: "source_suppression:inbox:inbox:impact-source",
		evidence_fingerprint: "impact-source",
		proposal_kind: "source_suppression",
		surface: "inbox",
		scope_key: "inbox:impact-source",
		summary: "Suppress impact source",
		evidence_window_days: 14,
		evidence_count: 4,
		positive_count: 0,
		negative_count: 4,
		unused_stale_count: 2,
		status: "approved",
		evidence_json: JSON.stringify({ scope_key: "inbox:impact-source" }),
		created_at: approvedAt,
		updated_at: approvedAt,
		expires_at: future,
		approved_at: approvedAt,
		approved_by_client: cliIdentity.client_id,
		approved_by_actor: cliIdentity.requested_by,
		approved_note: "Approved for impact reporting.",
	});

	const impact = await service.getReviewImpact({ days: 30, surface: "inbox" });
	const comparison = impact.comparisons.find(
		(entry) => entry.proposal_id === "review-tuning:impact-source",
	);
	assert.ok(comparison);
	assert.equal(comparison?.confidence, "directional");
	assert.ok((comparison?.acted_on_rate_delta ?? 0) > 0);
	assert.ok((comparison?.stale_unused_rate_delta ?? 0) < 0);
});

test("assistant-led phase 11 weekly review feeds additive status deltas and operator recommendations", async () => {
	const { service } = createFixture();
	const today = new Date();
	for (let offset = 7; offset >= 0; offset -= 1) {
		const snapshotDate = new Date(
			today.getTime() - offset * 24 * 60 * 60 * 1000,
		)
			.toISOString()
			.slice(0, 10);
		service.db.upsertReviewMetricSnapshot({
			snapshot_date: snapshotDate,
			scope_type: "global",
			scope_key: "global",
			metrics: {
				created_count: 3,
				opened_count: 2,
				acted_on_count: 2,
				completed_count: 1,
				stale_unused_count: 1,
				open_rate: offset === 7 ? 0.3 : 0.6,
				acted_on_rate: offset === 7 ? 0.2 : 0.55,
				stale_unused_rate: offset === 7 ? 0.35 : 0.1,
				fired_notification_count: 2,
				suppressed_notification_count: 1,
				cooldown_hit_count: 1,
				notification_open_conversion_rate: 0.3,
				notification_action_conversion_rate: offset === 7 ? 0.2 : 0.6,
				noisy_source_count: 1,
				open_tuning_proposal_count: 1,
				active_tuning_state_count: 1,
			},
		});
		service.db.upsertReviewMetricSnapshot({
			snapshot_date: snapshotDate,
			scope_type: "surface",
			scope_key: "planning",
			metrics: {
				created_count: 2,
				opened_count: 1,
				acted_on_count: 1,
				completed_count: 1,
				stale_unused_count: 0,
				open_rate: offset === 7 ? 0.2 : 0.7,
				acted_on_rate: offset === 7 ? 0.2 : 0.7,
				stale_unused_rate: offset === 7 ? 0.4 : 0.1,
				fired_notification_count: 1,
				suppressed_notification_count: 0,
				cooldown_hit_count: 0,
				notification_open_conversion_rate: 0.3,
				notification_action_conversion_rate: offset === 7 ? 0.2 : 0.8,
				noisy_source_count: 1,
				open_tuning_proposal_count: 0,
				active_tuning_state_count: 1,
			},
		});
	}

	service.db.upsertReviewTuningProposal({
		proposal_id: "review-tuning:weekly-approved",
		proposal_family_key: "surface_priority_offset:planning:planning",
		evidence_fingerprint: "weekly-approved",
		proposal_kind: "surface_priority_offset",
		surface: "planning",
		scope_key: "planning",
		summary: "Planning tuning approval",
		evidence_window_days: 14,
		evidence_count: 6,
		positive_count: 0,
		negative_count: 6,
		unused_stale_count: 0,
		status: "approved",
		evidence_json: JSON.stringify({ surface: "planning" }),
		created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
		updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
		expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
		approved_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
		approved_by_client: cliIdentity.client_id,
		approved_by_actor: cliIdentity.requested_by,
		approved_note: "Approved for weekly view.",
	});
	service.db.upsertReviewTuningState({
		proposal_id: "review-tuning:weekly-approved",
		proposal_kind: "surface_priority_offset",
		surface: "planning",
		scope_key: "planning",
		value_json: JSON.stringify({ offset: -200 }),
		status: "active",
		starts_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
		expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
		note: "Active for weekly test.",
	});
	service.db.createReviewNotificationEvent({
		kind: "review_package_planning",
		decision: "suppressed",
		source: "desktop",
		surface: "planning",
		suppression_reason: "cooldown",
		current_count: 1,
		previous_count: 1,
		cooldown_minutes: 30,
		client_id: cliIdentity.client_id,
		actor: cliIdentity.requested_by ?? null,
	});
	service.db.createReviewFeedbackEvent({
		package_id: "weekly-noisy",
		surface: "planning",
		reason: "wrong_priority",
		note: "Still noisy.",
		actor: cliIdentity.requested_by ?? null,
		client_id: cliIdentity.client_id,
		source_fingerprint: "weekly-noisy",
	});

	const weekly = await service.getReviewWeekly({ days: 14 });
	assert.equal(weekly.top_review_trend_surface, "planning");
	assert.ok(weekly.week_over_week_action_rate_delta > 0);
	assert.ok(
		weekly.recommendations.some(
			(entry) => entry.kind === "keep_current_tuning",
		),
	);

	const status = await service.getStatusReport({ httpReachable: true });
	assert.equal(status.review.top_review_trend_surface, "planning");
	assert.ok(status.review.week_over_week_action_rate_delta > 0);
});

test("assistant-led phase 12 review calibration targets inherit and flag off-track surfaces", async () => {
	const { service } = createFixture();
	const now = Date.now();
	const currentTimes = [
		new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
		new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
		new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
	];

	const makeCycle = (
		packageId: string,
		seenAt: string,
		input: { opened?: boolean; acted?: boolean; stale?: boolean },
	) =>
		service.db.ensureOpenReviewPackageCycle({
			package_id: packageId,
			surface: "inbox",
			source_fingerprint: packageId,
			summary: packageId,
			why_now: packageId,
			score_band: "high",
			member_ids: [packageId],
			items: [
				{
					package_item_id: `group:${packageId}`,
					item_type: "inbox_autopilot_group",
					item_id: packageId,
					title: packageId,
					summary: packageId,
					command: "personal-ops inbox autopilot",
					underlying_state: input.stale ? "stale" : "awaiting_review",
				},
			],
			source_keys: ["inbox:calibration-source"],
			seen_at: seenAt,
			opened_at: input.opened ? seenAt : null,
			acted_on_at: input.acted ? seenAt : null,
			completed_at: input.acted ? seenAt : null,
			stale_unused_at: input.stale ? seenAt : null,
		});

	const staleCycleOne = makeCycle("calibration-stale-1", currentTimes[0]!, {
		stale: true,
	});
	const staleCycleTwo = makeCycle("calibration-stale-2", currentTimes[1]!, {
		stale: true,
	});
	makeCycle("calibration-acted", currentTimes[2]!, {
		opened: true,
		acted: true,
	});

	for (const cycle of [staleCycleOne, staleCycleTwo]) {
		service.db.createReviewFeedbackEvent({
			package_id: cycle.package_id,
			package_cycle_id: cycle.package_cycle_id,
			surface: "inbox",
			package_item_id: cycle.items[0]!.package_item_id,
			reason: "not_useful",
			note: "Still too noisy.",
			actor: cliIdentity.requested_by ?? null,
			client_id: cliIdentity.client_id,
			source_fingerprint: cycle.source_fingerprint,
		});
		service.db.createReviewNotificationEvent({
			kind: "review_package_inbox",
			decision: "fired",
			source: "desktop",
			surface: "inbox",
			package_id: cycle.package_id,
			package_cycle_id: cycle.package_cycle_id,
			current_count: 1,
			previous_count: 0,
			cooldown_minutes: 30,
			client_id: cliIdentity.client_id,
			actor: cliIdentity.requested_by ?? null,
		});
	}
	service.db.createReviewNotificationEvent({
		kind: "review_package_inbox",
		decision: "fired",
		source: "desktop",
		surface: "inbox",
		package_id: staleCycleTwo.package_id,
		package_cycle_id: staleCycleTwo.package_cycle_id,
		current_count: 1,
		previous_count: 0,
		cooldown_minutes: 30,
		client_id: cliIdentity.client_id,
		actor: cliIdentity.requested_by ?? null,
	});

	service.updateReviewCalibrationTarget(cliIdentity, "global", {
		min_acted_on_rate: 0.6,
		max_stale_unused_rate: 0.2,
		max_negative_feedback_rate: 0.2,
		min_notification_action_conversion_rate: 0.5,
		max_notifications_per_7d: 2,
	});
	service.updateReviewCalibrationTarget(cliIdentity, "inbox", {
		max_notifications_per_7d: 1,
	});

	const targets = service.getReviewCalibrationTargets();
	assert.equal(
		targets.configured_targets.find((target) => target.scope_key === "global")
			?.min_acted_on_rate,
		0.6,
	);
	assert.equal(
		targets.effective_targets.find((target) => target.scope_key === "inbox")
			?.max_notifications_per_7d,
		1,
	);
	assert.equal(
		targets.effective_targets.find((target) => target.scope_key === "meetings")
			?.max_notifications_per_7d,
		2,
	);
	assert.equal(
		targets.effective_targets.find((target) => target.scope_key === "inbox")
			?.min_acted_on_rate,
		0.6,
	);

	const calibration = await service.getReviewCalibration({ surface: "inbox" });
	const inboxSummary = calibration.surfaces[0];
	assert.ok(inboxSummary);
	assert.equal(inboxSummary?.status, "off_track");
	assert.equal(calibration.surfaces_off_track_count >= 1, true);
	assert.equal(calibration.notification_budget_pressure_count >= 1, true);
	assert.equal(
		inboxSummary?.metrics.find(
			(metric) => metric.metric === "stale_unused_rate",
		)?.status,
		"off_track",
	);
	assert.equal(
		inboxSummary?.metrics.find(
			(metric) => metric.metric === "negative_feedback_rate",
		)?.status,
		"off_track",
	);
	assert.equal(
		inboxSummary?.metrics.find(
			(metric) => metric.metric === "notifications_per_7d",
		)?.status,
		"off_track",
	);
	assert.ok(
		inboxSummary?.recommendations.some(
			(entry) => entry.kind === "tighten_notification_budget",
		),
	);
	assert.ok(
		inboxSummary?.recommendations.some(
			(entry) => entry.kind === "inspect_source_suppression",
		),
	);
	assert.ok(
		inboxSummary?.recommendations.some(
			(entry) => entry.kind === "review_package_composition",
		),
	);
	assert.equal(
		inboxSummary?.top_noisy_sources[0]?.scope_key,
		"inbox:calibration-source",
	);
	assert.equal(inboxSummary?.effective_target.max_notifications_per_7d, 1);

	const resetTargets = service.resetReviewCalibrationTarget(
		cliIdentity,
		"inbox",
	);
	assert.equal(
		resetTargets.effective_targets.find(
			(target) => target.scope_key === "inbox",
		)?.max_notifications_per_7d,
		2,
	);

	const status = await service.getStatusReport({ httpReachable: true });
	assert.equal(status.review.calibration_status, "off_track");
	assert.equal(status.review.surfaces_off_track_count >= 1, true);
	assert.equal(status.review.top_calibration_surface, "inbox");
});

test("assistant-led phase 12 review calibration keeps current tuning when recent impact is positive", async () => {
	const { service } = createFixture();
	const now = Date.now();
	const approvedAt = new Date(now - 16 * 24 * 60 * 60 * 1000).toISOString();
	const preStart = new Date(
		Date.parse(approvedAt) - 6 * 24 * 60 * 60 * 1000,
	).toISOString();
	const preSecond = new Date(
		Date.parse(approvedAt) - 5 * 24 * 60 * 60 * 1000,
	).toISOString();
	const postStart = new Date(
		Date.parse(approvedAt) + 1 * 24 * 60 * 60 * 1000,
	).toISOString();
	const postSecond = new Date(
		Date.parse(approvedAt) + 2 * 24 * 60 * 60 * 1000,
	).toISOString();
	const recentOne = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
	const recentTwo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
	const recentThree = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
	const future = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();

	for (const [packageId, startedAt, acted, stale] of [
		["phase12-pre-1", preStart, false, true],
		["phase12-pre-2", preSecond, false, true],
		["phase12-post-1", postStart, true, false],
		["phase12-post-2", postSecond, true, false],
		["phase12-recent-1", recentOne, true, false],
		["phase12-recent-2", recentTwo, true, false],
		["phase12-recent-3", recentThree, true, false],
	] as const) {
		service.db.ensureOpenReviewPackageCycle({
			package_id: packageId,
			surface: "inbox",
			source_fingerprint: packageId,
			summary: packageId,
			why_now: packageId,
			score_band: "high",
			member_ids: [packageId],
			items: [
				{
					package_item_id: `group:${packageId}`,
					item_type: "inbox_autopilot_group",
					item_id: packageId,
					title: packageId,
					summary: packageId,
					command: "personal-ops inbox autopilot",
					underlying_state: acted ? "reviewed" : "stale",
				},
			],
			source_keys: ["inbox:phase12-positive"],
			seen_at: startedAt,
			opened_at: acted ? startedAt : null,
			acted_on_at: acted ? startedAt : null,
			completed_at: acted ? startedAt : null,
			stale_unused_at: stale ? startedAt : null,
		});
	}

	const notificationCycle =
		service.db.getLatestReviewPackageCycleForPackage("phase12-recent-2");
	assert.ok(notificationCycle);
	service.db.createReviewNotificationEvent({
		kind: "review_package_inbox",
		decision: "fired",
		source: "desktop",
		surface: "inbox",
		package_id: "phase12-recent-2",
		package_cycle_id: notificationCycle!.package_cycle_id,
		current_count: 1,
		previous_count: 0,
		cooldown_minutes: 30,
		client_id: cliIdentity.client_id,
		actor: cliIdentity.requested_by ?? null,
	});
	const notificationCycleTwo =
		service.db.getLatestReviewPackageCycleForPackage("phase12-recent-3");
	assert.ok(notificationCycleTwo);
	service.db.createReviewNotificationEvent({
		kind: "review_package_inbox",
		decision: "fired",
		source: "desktop",
		surface: "inbox",
		package_id: "phase12-recent-3",
		package_cycle_id: notificationCycleTwo!.package_cycle_id,
		current_count: 1,
		previous_count: 0,
		cooldown_minutes: 30,
		client_id: cliIdentity.client_id,
		actor: cliIdentity.requested_by ?? null,
	});

	service.db.upsertReviewTuningProposal({
		proposal_id: "review-tuning:phase12-keep",
		proposal_family_key: "source_suppression:inbox:inbox:phase12-positive",
		evidence_fingerprint: "phase12-keep",
		proposal_kind: "source_suppression",
		surface: "inbox",
		scope_key: "inbox:phase12-positive",
		summary: "Keep suppressing the noisiest inbox source",
		evidence_window_days: 14,
		evidence_count: 4,
		positive_count: 0,
		negative_count: 4,
		unused_stale_count: 2,
		status: "approved",
		evidence_json: JSON.stringify({ scope_key: "inbox:phase12-positive" }),
		created_at: approvedAt,
		updated_at: approvedAt,
		expires_at: future,
		approved_at: approvedAt,
		approved_by_client: cliIdentity.client_id,
		approved_by_actor: cliIdentity.requested_by,
		approved_note: "Approved for calibration.",
	});
	service.updateReviewCalibrationTarget(cliIdentity, "global", {
		min_acted_on_rate: 0.5,
		max_stale_unused_rate: 0.5,
		max_negative_feedback_rate: 0.25,
		min_notification_action_conversion_rate: 0,
		max_notifications_per_7d: 5,
	});

	const calibration = await service.getReviewCalibration({ surface: "inbox" });
	const inboxSummary = calibration.surfaces[0];
	assert.ok(inboxSummary);
	assert.equal(inboxSummary?.status, "on_track");
	assert.ok((inboxSummary?.recent_tuning_impact.length ?? 0) > 0);
	assert.ok(
		inboxSummary?.recommendations.some(
			(entry) => entry.kind === "keep_current_tuning",
		),
	);
});

test("assistant-led phase 12 review calibration treats any fired notifications as off-track when the budget is zero", async () => {
	const { service } = createFixture();
	const seenAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
	const cycle = service.db.ensureOpenReviewPackageCycle({
		package_id: "phase12-zero-budget",
		surface: "meetings",
		source_fingerprint: "phase12-zero-budget",
		summary: "phase12-zero-budget",
		why_now: "phase12-zero-budget",
		score_band: "high",
		member_ids: ["phase12-zero-budget"],
		items: [
			{
				package_item_id: "meeting:phase12-zero-budget",
				item_type: "meeting_prep_packet",
				item_id: "phase12-zero-budget",
				title: "phase12-zero-budget",
				summary: "phase12-zero-budget",
				command: "personal-ops workflows prep-meetings",
				underlying_state: "review_ready",
			},
		],
		source_keys: ["meetings:phase12-zero-budget"],
		seen_at: seenAt,
	});
	service.db.createReviewNotificationEvent({
		kind: "review_package_meetings",
		decision: "fired",
		source: "desktop",
		surface: "meetings",
		package_id: cycle.package_id,
		package_cycle_id: cycle.package_cycle_id,
		current_count: 1,
		previous_count: 0,
		cooldown_minutes: 30,
		client_id: cliIdentity.client_id,
		actor: cliIdentity.requested_by ?? null,
	});

	service.updateReviewCalibrationTarget(cliIdentity, "meetings", {
		max_notifications_per_7d: 0,
		min_acted_on_rate: 0,
		max_stale_unused_rate: 1,
		max_negative_feedback_rate: 1,
		min_notification_action_conversion_rate: 0,
	});

	const calibration = await service.getReviewCalibration({
		surface: "meetings",
	});
	const meetings = calibration.surfaces[0];
	assert.ok(meetings);
	assert.equal(
		meetings?.metrics.find((metric) => metric.metric === "notifications_per_7d")
			?.status,
		"off_track",
	);
});

test("assistant-led phase 12 review calibration routes stay operator-only and reject browser target mutation", async () => {
	const { service, config, policy } = createFixture();
	const server = createHttpServer(service, config, policy);
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const assistantRead = await fetch(`${baseUrl}/v1/review/calibration`, {
			headers: {
				authorization: `Bearer ${config.assistantApiToken}`,
				"x-personal-ops-client": "phase12-http-test",
			},
		});
		assert.equal(assistantRead.status, 403);

		const operatorRead = await fetch(`${baseUrl}/v1/review/calibration`, {
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"x-personal-ops-client": "phase12-http-test",
			},
		});
		assert.equal(operatorRead.status, 200);

		const operatorTargetRead = await fetch(
			`${baseUrl}/v1/review/calibration/targets`,
			{
				headers: {
					authorization: `Bearer ${config.apiToken}`,
					"x-personal-ops-client": "phase12-http-test",
				},
			},
		);
		assert.equal(operatorTargetRead.status, 200);

		const operatorWrite = await fetch(
			`${baseUrl}/v1/review/calibration/targets/global`,
			{
				method: "PUT",
				headers: {
					authorization: `Bearer ${config.apiToken}`,
					"content-type": "application/json",
					"x-personal-ops-client": "phase12-http-test",
					"x-personal-ops-requested-by": "operator-http",
				},
				body: JSON.stringify({ max_notifications_per_7d: 4 }),
			},
		);
		assert.equal(operatorWrite.status, 200);
		const operatorPayload = (await operatorWrite.json()) as {
			review_calibration_target?: { max_notifications_per_7d: number };
		};
		assert.equal(
			operatorPayload.review_calibration_target?.max_notifications_per_7d,
			4,
		);

		const operatorSurfaceWrite = await fetch(
			`${baseUrl}/v1/review/calibration/targets/inbox`,
			{
				method: "PUT",
				headers: {
					authorization: `Bearer ${config.apiToken}`,
					"content-type": "application/json",
					"x-personal-ops-client": "phase12-http-test",
					"x-personal-ops-requested-by": "operator-http",
				},
				body: JSON.stringify({ max_notifications_per_7d: 3 }),
			},
		);
		assert.equal(operatorSurfaceWrite.status, 200);

		const sessionGrantResponse = await fetch(`${baseUrl}/v1/console/session`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"x-personal-ops-client": "phase12-http-test",
			},
		});
		assert.equal(sessionGrantResponse.status, 200);
		const sessionGrant = (await sessionGrantResponse.json()) as {
			console_session?: { grant: string; launch_url: string };
		};
		const sessionLaunchResponse = await fetch(
			`${baseUrl}/console/session/${sessionGrant.console_session!.grant}`,
			{
				redirect: "manual",
			},
		);
		const cookie = sessionLaunchResponse.headers.get("set-cookie");
		assert.ok(cookie);
		const browserCookie = cookie!.split(";")[0]!;

		const browserRead = await fetch(`${baseUrl}/v1/review/calibration`, {
			headers: {
				cookie: browserCookie,
			},
		});
		assert.equal(browserRead.status, 200);

		const browserTargetRead = await fetch(
			`${baseUrl}/v1/review/calibration/targets`,
			{
				headers: {
					cookie: browserCookie,
				},
			},
		);
		assert.equal(browserTargetRead.status, 200);

		const browserWrite = await fetch(
			`${baseUrl}/v1/review/calibration/targets/global`,
			{
				method: "PUT",
				headers: {
					cookie: browserCookie,
					"content-type": "application/json",
				},
				body: JSON.stringify({ max_notifications_per_7d: 3 }),
			},
		);
		assert.equal(browserWrite.status, 403);

		const browserReset = await fetch(
			`${baseUrl}/v1/review/calibration/targets/inbox`,
			{
				method: "DELETE",
				headers: {
					cookie: browserCookie,
				},
			},
		);
		assert.equal(browserReset.status, 403);

		const operatorReset = await fetch(
			`${baseUrl}/v1/review/calibration/targets/inbox`,
			{
				method: "DELETE",
				headers: {
					authorization: `Bearer ${config.apiToken}`,
					"x-personal-ops-client": "phase12-http-test",
					"x-personal-ops-requested-by": "operator-http",
				},
			},
		);
		assert.equal(operatorReset.status, 200);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("http routes treat malformed console cookies as unauthorized instead of bad requests", async () => {
	const { service, config, policy } = createFixture();
	const server = createHttpServer(service, config, policy);
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const response = await fetch(`${baseUrl}/v1/status`, {
			headers: {
				cookie: `${CONSOLE_SESSION_COOKIE}=%E0%A4%A`,
			},
		});
		assert.equal(response.status, 401);
		const payload = (await response.json()) as { error?: string };
		assert.match(
			payload.error ?? "",
			/console session expired|missing or invalid bearer token/i,
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("http routes reject oversized json request bodies with a bounded error", async () => {
	const { service, config, policy } = createFixture();
	const server = createHttpServer(service, config, policy);
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const oversizedDraft = {
		subject: "Oversized draft",
		body_text: "x".repeat(1024 * 1024 + 64),
	};

	try {
		const response = await fetch(`${baseUrl}/v1/mail/drafts`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"content-type": "application/json",
				"x-personal-ops-client": "http-boundary-test",
			},
			body: JSON.stringify(oversizedDraft),
		});
		assert.equal(response.status, 413);
		const payload = (await response.json()) as { error?: string };
		assert.match(payload.error ?? "", /json request body exceeds/i);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("assistant-led phase 12 cli exposes review calibration commands", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/cli.ts"),
		"utf8",
	);
	assert.match(source, /command\("calibration"\)/);
	assert.match(source, /\/v1\/review\/calibration/);
	assert.match(source, /command\("targets"\)/);
	assert.match(source, /command\("set"\)/);
	assert.match(source, /command\("reset"\)/);
	assert.match(source, /--min-notification-action-rate/);
	assert.match(source, /\/v1\/review\/calibration\/targets/);
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

	const initialStatus = await service.getAutopilotStatusReport({
		httpReachable: true,
	});
	assert.equal(
		initialStatus.profiles.some((profile) => profile.profile === "inbox"),
		true,
	);

	const report = await service.runAutopilot(cliIdentity, {
		trigger: "manual",
		requestedProfile: "inbox",
		httpReachable: true,
		manual: true,
	});
	const inboxProfile = report.profiles.find(
		(profile) => profile.profile === "inbox",
	);
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
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "drive_status"/);
	assert.match(source, /name: "drive_files"/);
	assert.match(source, /name: "drive_doc_get"/);
	assert.match(source, /name: "drive_sheet_get"/);
	assert.match(source, /requestJson\("GET", "\/v1\/drive\/status"\)/);
	assert.match(source, /requestJson\("GET", "\/v1\/drive\/files"\)/);
	// Template literal args may be formatted across lines by the linter
	assert.match(
		source,
		/v1\/drive\/docs\/\$\{encodeURIComponent\(String\(args\.file_id\)\)\}/,
	);
	assert.match(
		source,
		/v1\/drive\/sheets\/\$\{encodeURIComponent\(String\(args\.file_id\)\)\}/,
	);
	assert.doesNotMatch(source, /name: "drive_sync"/);
});

test("F1 notification_feed mcp tool is wired", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "notification_feed"/);
	assert.match(source, /v1\/hub\/feed/);
});

test("F3 ai_activity_summary mcp tool is wired", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "ai_activity_summary"/);
	assert.match(source, /v1\/bridge\/summary/);
});

test("F4 portfolio_health mcp tool is wired", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "portfolio_health"/);
	assert.match(source, /v1\/portfolio\/health/);
});

test("F6 agent_performance_summary mcp tool is wired", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "agent_performance_summary"/);
	assert.match(source, /v1\/evals\/summary/);
});

test("F5 mcp_security_posture mcp tool is wired", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "mcp_security_posture"/);
	assert.match(source, /v1\/security\/posture/);
});

test("Tier 1.1 morning briefing http route is wired", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/http.ts"),
		"utf8",
	);
	assert.match(source, /v1\/workflows\/morning/);
	assert.match(source, /getMorningBriefing/);
});

test("Tier 1.1 morning workflow cli command is wired", () => {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), "src/cli/commands/runtime.ts"),
		"utf8",
	);
	assert.match(source, /command\("morning"\)/);
	assert.match(source, /formatMorningBriefing/);
	assert.match(source, /Notes.*personal-ops/);
});

test("Tier 1.1 formatMorningBriefing renders all sections", async () => {
	const { formatMorningBriefing } = (await import(
		path.resolve(process.cwd(), "dist/src/formatters/workflows.js")
	)) as { formatMorningBriefing: (b: unknown) => string };
	const briefing = formatMorningBriefing({
		date: "2026-04-14",
		calendar: {
			event_count: 2,
			events: [
				{
					event_id: "e1",
					summary: "Standup",
					start_at: new Date(Date.now() + 3600_000).toISOString(),
					end_at: new Date(Date.now() + 5400_000).toISOString(),
					is_all_day: false,
					attendee_count: 3,
				},
			],
			next_event_summary: "Standup",
			next_event_start_at: new Date(Date.now() + 3600_000).toISOString(),
			conflict_count: 0,
		},
		inbox: {
			followup_count: 5,
			classified_briefing_line: "1 act today · 2 waiting on someone",
			act_today_threads: [
				{
					thread_id: "t1",
					subject: "Budget Q2",
					from: "alice@example.com",
					last_message_at: new Date().toISOString(),
				},
			],
		},
		tasks: {
			overdue_count: 1,
			overdue: [
				{
					task_id: "tk1",
					title: "Write proposal",
					due_at: "2026-04-12",
					priority: "high",
				},
			],
		},
		portfolio_pulse: {
			available: true,
			briefing_line: "114 repos · 21 parked",
			stalest: {
				display_name: "OldProject",
				last_activity_at: "2026-02-01T00:00:00Z",
				context_quality: "boilerplate",
			},
		},
		ai_cost: { briefing_line: "AI 2026-04: $650 · 3 sessions" },
		alerts: { urgent_count: 0, events: [] },
	});
	assert.match(briefing, /Morning Briefing/);
	assert.match(briefing, /CALENDAR/);
	assert.match(briefing, /Standup/);
	assert.match(briefing, /INBOX/);
	assert.match(briefing, /Budget Q2/);
	assert.match(briefing, /TASKS/);
	assert.match(briefing, /Write proposal/);
	assert.match(briefing, /PORTFOLIO/);
	assert.match(briefing, /OldProject/);
	assert.match(briefing, /AI ACTIVITY/);
	assert.match(briefing, /\$650/);
});

test("Tier 1.2 inbox_classified mcp tool is wired", () => {
	const mcpSource = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf8",
	);
	assert.match(mcpSource, /inbox_classified/);
	assert.match(mcpSource, /v1\/inbox\/classified/);
});

test("Tier 1.2 GET /v1/inbox/classified route is wired", () => {
	const httpSource = fs.readFileSync(
		path.resolve(process.cwd(), "src/http.ts"),
		"utf8",
	);
	assert.match(httpSource, /v1\/inbox\/classified/);
	assert.match(httpSource, /getClassifiedInbox/);
});

test("Tier 1.2 getClassifiedInbox is wired in service", () => {
	const serviceSource = fs.readFileSync(
		path.resolve(process.cwd(), "src/service.ts"),
		"utf8",
	);
	assert.match(serviceSource, /getClassifiedInbox/);
	assert.match(serviceSource, /InboxClassifierService/);
});

test("Tier 1.2 formatClassifiedInbox renders both buckets", async () => {
	const { formatClassifiedInbox } = (await import(
		path.resolve(process.cwd(), "dist/src/formatters/inbox.js")
	)) as { formatClassifiedInbox: (c: unknown) => string };
	const output = formatClassifiedInbox({
		act_today: [
			{
				thread: {
					thread_id: "abc123",
					mailbox: "user@example.com",
					last_message_at: String(Date.now()),
					message_count: 2,
					unread_count: 1,
					in_inbox: true,
					last_synced_at: new Date().toISOString(),
				},
				latest_message: {
					message_id: "m1",
					thread_id: "abc123",
					mailbox: "user@example.com",
					internal_date: String(Date.now()),
					label_ids: ["INBOX"],
					subject: "Urgent proposal review",
					from_header: "bob@client.com",
					is_unread: true,
					is_sent: false,
					is_inbox: true,
					last_synced_at: new Date().toISOString(),
				},
				derived_kind: "needs_reply",
				last_direction: "inbound",
			},
		],
		waiting_on_someone: [],
		total_classified: 3,
		briefing_line: "1 act today · 0 waiting on someone",
	});
	assert.match(output, /Classified Inbox/);
	assert.match(output, /Act Today/);
	assert.match(output, /Urgent proposal review/);
	assert.match(output, /Waiting on Someone/);
	assert.match(output, /3 threads classified/);
});

test("Tier 1.3 meeting_contact_brief mcp tool is wired", () => {
	const schemaBody = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf-8",
	);
	assert.match(schemaBody, /meeting_contact_brief/);
	assert.match(schemaBody, /event_id/);
});

test("Tier 1.3 GET /v1/workflows/meeting-brief route is wired", () => {
	const httpBody = fs.readFileSync(
		path.resolve(process.cwd(), "src/http.ts"),
		"utf-8",
	);
	assert.match(httpBody, /\/v1\/workflows\/meeting-brief/);
	assert.match(httpBody, /getMeetingContactBrief/);
});

test("Tier 1.3 getMeetingContactBrief is wired in service", () => {
	const serviceBody = fs.readFileSync(
		path.resolve(process.cwd(), "src/service.ts"),
		"utf-8",
	);
	assert.match(serviceBody, /getMeetingContactBrief/);
	assert.match(serviceBody, /buildMeetingContactBrief/);
});

test("Tier 1.3 formatMeetingContactBrief renders brief", async () => {
	const { formatMeetingContactBrief } = (await import(
		path.resolve(process.cwd(), "dist/src/formatters/workflows.js")
	)) as { formatMeetingContactBrief: (b: unknown) => string };
	const now = new Date().toISOString();
	const endAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
	const output = formatMeetingContactBrief({
		event_id: "evt-001",
		title: "Q2 Planning",
		start_at: now,
		end_at: endAt,
		location: "Zoom",
		attendee_contexts: [
			{
				email: "alice@example.com",
				display_name: "Alice",
				response_status: "accepted",
				recent_messages: [
					{
						subject: "Re: prep notes",
						date: now,
						direction: "inbound",
					},
				],
				message_count: 1,
			},
		],
		minutes_until: 25,
		generated_at: now,
	});
	assert.match(output, /Meeting Brief/);
	assert.match(output, /Q2 Planning/);
	assert.match(output, /Alice/);
	assert.match(output, /Zoom/);
	assert.match(output, /prep notes/);
});

test("Tier 1.4 end_of_day_digest mcp tool is wired", () => {
	const schemaBody = fs.readFileSync(
		path.resolve(process.cwd(), "src/mcp-server.ts"),
		"utf-8",
	);
	assert.match(schemaBody, /end_of_day_digest/);
});

test("Tier 1.4 GET /v1/workflows/end-of-day route is wired", () => {
	const httpBody = fs.readFileSync(
		path.resolve(process.cwd(), "src/http.ts"),
		"utf-8",
	);
	assert.match(httpBody, /\/v1\/workflows\/end-of-day/);
	assert.match(httpBody, /getEndOfDayDigest/);
});

test("Tier 1.4 getEndOfDayDigest is wired in service", () => {
	const serviceBody = fs.readFileSync(
		path.resolve(process.cwd(), "src/service.ts"),
		"utf-8",
	);
	assert.match(serviceBody, /getEndOfDayDigest/);
	assert.match(serviceBody, /listTasksCompletedSince/);
	assert.match(serviceBody, /getMailActivityToday/);
});

test("Tier 1.4 formatEndOfDayDigest renders all sections", async () => {
	const { formatEndOfDayDigest } = (await import(
		path.resolve(process.cwd(), "dist/src/formatters/workflows.js")
	)) as { formatEndOfDayDigest: (d: unknown) => string };
	const now = new Date().toISOString();
	const output = formatEndOfDayDigest({
		date: "2026-04-14",
		calendar: {
			meetings_today: 2,
			meeting_minutes: 90,
			events: [
				{
					event_id: "e1",
					summary: "Standup",
					start_at: now,
					end_at: now,
					is_all_day: false,
					attendee_count: 4,
				},
			],
		},
		inbox: {
			inbound_today: 12,
			outbound_today: 5,
			needs_reply_count: 3,
		},
		tasks: {
			completed_today: [
				{ task_id: "t1", title: "Ship the PR", completed_at: now },
			],
			overdue_open_count: 1,
		},
		approvals: { pending_count: 2 },
		ai_cost: { briefing_line: "$4.20 today across 3 sessions" },
	});
	assert.match(output, /End-of-Day Digest/);
	assert.match(output, /2026-04-14/);
	assert.match(output, /Standup/);
	assert.match(output, /12 received/);
	assert.match(output, /Ship the PR/);
	assert.match(output, /2 approval/);
	assert.match(output, /\$4\.20/);
});
