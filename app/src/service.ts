import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import {
  completeGoogleAuth,
  completeGmailAuth,
  loadStoredGmailTokens,
  startGoogleAuth,
  startGmailAuth,
} from "./auth.js";
import {
  cancelGoogleCalendarEvent,
  createGoogleCalendarEvent,
  getGoogleCalendarEvent,
  listGoogleCalendarEvents,
  listGoogleCalendarSources,
  patchGoogleCalendarEvent,
  verifyGoogleCalendarAccess,
  verifyGoogleCalendarWriteAccess,
} from "./calendar.js";
import { CURRENT_SCHEMA_VERSION, PersonalOpsDb } from "./db.js";
import {
  buildDriveTopItemSummary,
  getGoogleDoc,
  isGoogleDocMimeType,
  isGoogleSheetMimeType,
  syncDriveScope,
  verifyGoogleDriveAccess,
  verifyGoogleDriveScopes,
} from "./drive.js";
import { getDesktopStatusReport } from "./desktop.js";
import { evaluateWrapperHealth } from "./install-artifacts.js";
import { buildInstallCheckReport, getInstallArtifactPaths, readInstallManifest } from "./install.js";
import { getLaunchAgentLabel, inspectLaunchAgent as inspectInstalledLaunchAgent } from "./launchagent.js";
import {
  createGmailDraft,
  getGmailMessageMetadata,
  getGmailProfile,
  listGmailHistory,
  listGmailMessageRefsByLabel,
  sendGmailDraft,
  updateGmailDraft,
  verifyGmailMetadataAccess,
} from "./gmail.js";
import { syncGithubPullRequests, verifyGithubToken } from "./github.js";
import {
  getLatestSnapshotSummary as getLatestSnapshotSummaryFromPaths,
  pruneSnapshots,
  readRecoveryRehearsalStamp,
  readSnapshotManifest as readSnapshotManifestFromPaths,
  recoveryRehearsalAgeHours,
  RECOVERY_REHEARSAL_WARN_HOURS,
  SNAPSHOT_FAIL_HOURS,
  SNAPSHOT_WARN_HOURS,
  snapshotAgeHours,
} from "./recovery.js";
import { Logger } from "./logger.js";
import { describeStateOrigin, readMachineIdentity, readRestoreProvenance } from "./machine.js";
import { sendMacNotification } from "./notifications.js";
import { buildMaintenanceFollowThroughSummary, buildMaintenanceWindowSummary, buildRepairPlan } from "./repair-plan.js";
import {
  deleteKeychainSecret,
  getKeychainSecret,
  setKeychainSecret,
} from "./keychain.js";
import {
  explainGoogleGrantFailure,
  probeKeychainSecret,
  validateOAuthClientFile,
  validateSecretFilePermissions,
  validateSecretTextFile,
} from "./secrets.js";
import { listAuditEvents as listAuditEventsFromModule } from "./service/audit.js";
import { buildAssistantActionQueueReport, runAssistantAction } from "./service/assistant.js";
import { buildAutopilotStatusReport, runAutopilotCoordinator } from "./service/autopilot.js";
import { buildInboxAutopilotReport, prepareInboxAutopilotGroup } from "./service/inbox-autopilot.js";
import { getMeetingPrepPacketDetail, prepareMeetingPrepPacket } from "./service/meeting-prep.js";
import {
  approveOutboundGroup,
  buildOutboundAutopilotReport,
  getOutboundAutopilotGroupDetail,
  requestApprovalForOutboundGroup,
  sendOutboundGroup,
} from "./service/outbound-autopilot.js";
import {
  applyPlanningAutopilotBundle,
  buildPlanningAutopilotReport,
  getPlanningAutopilotBundleDetail,
  preparePlanningAutopilotBundle,
} from "./service/planning-autopilot.js";
import {
  approveReviewTuningProposal,
  buildReviewCalibration,
  buildReviewImpact,
  buildReviewReport,
  buildReviewTrends,
  buildReviewWeekly,
  buildStoredReviewPackageReport,
  buildStoredReviewTuningReport,
  dismissReviewTuningProposal,
  getReviewCalibrationTargets,
  getReviewNotificationSnapshot,
  getReviewPackageDetail,
  recordReviewNotificationEvents,
  refreshReviewReadModel,
  resetReviewCalibrationTarget,
  reviewReadModelNeedsRefresh,
  submitReviewPackageFeedback,
  updateReviewCalibrationTarget,
} from "./service/review-intelligence.js";
import {
  createSnapshot as createSnapshotFromModule,
  inspectSnapshot as inspectSnapshotFromModule,
  listSnapshots as listSnapshotsFromModule,
} from "./service/install.js";
import { buildDoctorReport, buildStatusReport } from "./service/status.js";
import {
  buildNowNextWorkflowReport,
  buildFollowUpBlockWorkflowReport,
  buildPrepDayWorkflowReport,
  buildPrepMeetingsWorkflowReport,
} from "./service/workflows.js";
import { readServiceVersion } from "./version.js";
import {
  AttentionItem,
  AttentionSeverity,
  ApprovalAction,
  ApprovalConfirmation,
  ApprovalDetail,
  ApprovalRequest,
  ApprovalRequestFilter,
  AutopilotProfile,
  AutopilotStatusReport,
  AutopilotTrigger,
  AssistantActionQueueReport,
  AssistantActionRunResult,
  ApprovalRiskFlags,
  AuditEvent,
  AuditEventFilter,
  CalendarEventWriteInput,
  CalendarConflict,
  CalendarDayView,
  CalendarEvent,
  CalendarTaskScheduleResult,
  OwnedCalendarSummary,
  CalendarSource,
  CalendarStatusReport,
  CalendarSyncState,
  ClientIdentity,
  Config,
  DoctorCheck,
  DoctorReport,
  DraftArtifact,
  DraftInput,
  DriveDocRecord,
  DriveFileRecord,
  DriveSheetRecord,
  DriveStatusReport,
  GmailClientConfig,
  GoogleCalendarEventsPage,
  GoogleCalendarEventMetadata,
  GoogleCalendarEventWriteInput,
  GithubAccount,
  GithubPullRequest,
  GithubStatusReport,
  GoogleCalendarListPage,
  GmailHistoryPage,
  GmailMessageMetadata,
  FreeTimeWindow,
  InboxStatusReport,
  InboxAutopilotReport,
  InboxThreadKind,
  InboxThreadSummary,
  MailMessage,
  MailSyncState,
  MailThread,
  MailThreadDetail,
  GmailSendResult,
  Paths,
  Policy,
  PolicySnapshot,
  PlanningHygienePolicyGovernanceEvent,
  PlanningHygienePolicyGovernanceEventType,
  PlanningHygienePolicyProposal,
  PlanningHygienePolicyProposalStatus,
  PlanningHygienePolicyProposalType,
  PlanningRecommendation,
  PlanningRecommendationBacklogFilters,
  PlanningRecommendationBacklogGroupReport,
  PlanningRecommendationBacklogReport,
  PlanningRecommendationCloseReasonCode,
  PlanningRecommendationClosureSignal,
  PlanningRecommendationClosureBreakdown,
  PlanningRecommendationClosureReport,
  PlanningRecommendationDetail,
  PlanningRecommendationFilter,
  PlanningRecommendationFirstActionType,
  PlanningRecommendationFollowThroughState,
  PlanningRecommendationGroup,
  PlanningRecommendationGroupDetail,
  PlanningRecommendationGroupKind,
  PlanningRecommendationHygieneFamilyReport,
  PlanningRecommendationHygieneFilters,
  PlanningRecommendationHygieneReviewDecision,
  PlanningRecommendationHygieneReport,
  PlanningRecommendationKind,
  PlanningRecommendationOutcomeState,
  PlanningRecommendationPolicyBacklogItem,
  PlanningRecommendationPolicyExitItem,
  PlanningRecommendationPolicyHistoryFamilyItem,
  PlanningRecommendationPolicyHistoryItem,
  PlanningRecommendationPolicyPruneResult,
  PlanningRecommendationPolicyReport,
  PlanningRecommendationPolicyRetentionItem,
  PlanningRecommendationRecommendedAction,
  PlanningRecommendationSource,
  PlanningRecommendationSummaryReport,
  PlanningRecommendationStatus,
  PlanningRecommendationSlotState,
  PlanningRecommendationTuningFamilyReport,
  PlanningRecommendationTuningHistoryReport,
  PlanningRecommendationTuningReport,
  PlanningAutopilotBundle,
  PlanningAutopilotReport,
  MeetingPrepPacket,
  OutboundAutopilotActionResult,
  OutboundAutopilotGroup,
  OutboundAutopilotReport,
  RelatedDriveDoc,
  RelatedDriveFile,
  ReviewCalibrationReport,
  ReviewCalibrationTarget,
  ReviewCalibrationTargetsReport,
  ReviewDetail,
  ReviewFeedbackReason,
  ReviewNotificationDecision,
  ReviewNotificationKind,
  ReviewPackage,
  ReviewPackageReport,
  ReviewPackageSurface,
  ReviewImpactReport,
  ReviewReport,
  ReviewTrendsReport,
  ReviewTuningProposal,
  ReviewTuningReport,
  ReviewWeeklyReport,
  SendWindow,
  ServiceState,
  ServiceStatusReport,
  SnapshotInspection,
  SnapshotManifest,
  SnapshotSummary,
  TaskDetail,
  TaskItem,
  TaskSuggestion,
  TaskSuggestionDetail,
  WorklistReport,
} from "./types.js";

interface DoctorOptions {
  deep: boolean;
  httpReachable: boolean;
}

interface StoredGmailAuth {
  email: string;
  clientConfig: GmailClientConfig;
  tokensJson: string;
}

interface ApprovalContext {
  approval: ApprovalRequest;
  draft: DraftArtifact;
}

interface InboxSyncStats {
  refreshed: number;
  deleted: number;
  threads_recomputed: number;
  duration_ms: number;
  history_id?: string;
}

interface CalendarSyncStats {
  calendars_refreshed: number;
  events_refreshed: number;
  duration_ms: number;
}

interface PersonalOpsDependencies {
  startGmailAuth: typeof startGmailAuth;
  startGoogleAuth: typeof startGoogleAuth;
  completeGmailAuth: typeof completeGmailAuth;
  completeGoogleAuth: typeof completeGoogleAuth;
  loadStoredGmailTokens: (config: Config, db: PersonalOpsDb) => Promise<StoredGmailAuth>;
  createGmailDraft: typeof createGmailDraft;
  updateGmailDraft: typeof updateGmailDraft;
  sendGmailDraft: typeof sendGmailDraft;
  getGmailProfile: typeof getGmailProfile;
  verifyGmailMetadataAccess: typeof verifyGmailMetadataAccess;
  listGmailMessageRefsByLabel: typeof listGmailMessageRefsByLabel;
  getGmailMessageMetadata: typeof getGmailMessageMetadata;
  listGmailHistory: typeof listGmailHistory;
  verifyGoogleCalendarAccess: typeof verifyGoogleCalendarAccess;
  verifyGoogleCalendarWriteAccess: typeof verifyGoogleCalendarWriteAccess;
  verifyGoogleDriveAccess: typeof verifyGoogleDriveAccess;
  verifyGoogleDriveScopes: typeof verifyGoogleDriveScopes;
  syncDriveScope: typeof syncDriveScope;
  getGoogleDoc: typeof getGoogleDoc;
  listGoogleCalendarSources: typeof listGoogleCalendarSources;
  listGoogleCalendarEvents: typeof listGoogleCalendarEvents;
  getGoogleCalendarEvent: typeof getGoogleCalendarEvent;
  createGoogleCalendarEvent: typeof createGoogleCalendarEvent;
  patchGoogleCalendarEvent: typeof patchGoogleCalendarEvent;
  cancelGoogleCalendarEvent: typeof cancelGoogleCalendarEvent;
  verifyGithubToken: typeof verifyGithubToken;
  syncGithubPullRequests: typeof syncGithubPullRequests;
  setKeychainSecret: typeof setKeychainSecret;
  getKeychainSecret: typeof getKeychainSecret;
  deleteKeychainSecret: typeof deleteKeychainSecret;
  openExternalUrl: (url: string) => void;
  inspectLaunchAgent: typeof inspectInstalledLaunchAgent;
}

const SETUP_REQUIRED_IDS = new Set([
  "oauth_client_configured",
  "configured_mailbox_present",
  "keychain_service_configured",
  "keychain_item_present",
  "connected_mailbox_matches",
]);

const APPROVAL_TTL_HOURS = 24;
const CONFIRMATION_TTL_MINUTES = 10;
const SENDING_RECOVERY_MINUTES = 15;
const SEND_WINDOW_DEFAULT_MINUTES = 15;
const SEND_WINDOW_MIN_MINUTES = 1;
const SEND_WINDOW_MAX_MINUTES = 60;
const APPROVAL_EXPIRING_WARNING_MINUTES = 30;
const SEND_WINDOW_EXPIRING_WARNING_MINUTES = 5;
const PENDING_APPROVAL_WARNING_HOURS = 4;
const REVIEW_WARNING_HOURS = 24;
const INBOX_UNREAD_WARNING_HOURS = 24;
const FOLLOWUP_WARNING_HOURS = 72;
const RECENT_ACTIVITY_HOURS = 24;
const CALENDAR_EVENT_SOON_MINUTES = 30;
const TASK_DUE_SOON_HOURS = 24;
const TASK_IN_PROGRESS_STALE_HOURS = 72;
const TASK_SUGGESTION_WARN_HOURS = 24;
const PLANNING_TASK_BLOCK_MINUTES = 60;
const PLANNING_FOLLOWUP_MINUTES = 30;
const PLANNING_PREP_MINUTES = 30;
const PLANNING_SNOOZE_WARNING_MINUTES = 60;
const PLANNING_RANKING_VERSION = "phase6-v1";
const PLANNING_STALE_PENDING_HOURS = 24;
const PLANNING_STALE_SCHEDULED_HOURS = 24;
const PLANNING_RESURFACED_LOOKBACK_DAYS = 30;
const PLANNING_CLOSED_RECENT_DAYS_SHORT = 7;
const PLANNING_CLOSED_RECENT_DAYS_LONG = 30;
const PLANNING_FOLLOW_THROUGH_STALE_DAYS = 7;
const PLANNING_POLICY_RETENTION_SUPERSEDED_DAYS = 30;
const PLANNING_POLICY_RETENTION_ARCHIVED_DAYS = 90;
const DEFAULT_INBOX_LIMIT = 50;
const MAX_INBOX_LIMIT = 200;

interface PlanningRecommendationCandidate {
  kind: PlanningRecommendationKind;
  priority: TaskItem["priority"];
  source_task_id?: string | undefined;
  source_thread_id?: string | undefined;
  source_calendar_event_id?: string | undefined;
  proposed_calendar_id?: string | undefined;
  proposed_start_at?: string | undefined;
  proposed_end_at?: string | undefined;
  proposed_title: string;
  proposed_notes?: string | undefined;
  reason_code: string;
  reason_summary: string;
  dedupe_key: string;
  source_fingerprint: string;
  source_last_seen_at?: string | undefined;
  slot_state: PlanningRecommendationSlotState;
  slot_state_reason?: string | undefined;
  slot_reason: string;
  trigger_signals: string[];
  suppressed_signals: string[];
  group_kind: PlanningRecommendationGroupKind;
}

interface PlanningAnalyticsBundle {
  summary: PlanningRecommendationSummaryReport;
  backlog: PlanningRecommendationBacklogReport;
  closure: PlanningRecommendationClosureReport;
  hygiene: PlanningRecommendationHygieneReport;
  tuning: PlanningRecommendationTuningReport;
}

interface AuditEventReadOptions {
  assistant_safe?: boolean | undefined;
}

type AssistantSafeAuditCategory = "sync" | "task" | "task_suggestion" | "planning";

interface AssistantSafeAuditShape {
  category: AssistantSafeAuditCategory;
  summary: string;
  metadata: Record<string, unknown>;
}

interface PlanningRecommendationPolicyPruneInput {
  older_than_days: number;
  event_type?: "archived" | "superseded" | "all" | undefined;
  dry_run?: boolean | undefined;
}

interface PlanningRecommendationReadOptions {
  assistant_safe?: boolean | undefined;
}

interface PlanningRecommendationClosureFilters {
  days: number;
  group?: string | undefined;
  kind?: PlanningRecommendationKind | undefined;
  source?: PlanningRecommendationSource | undefined;
  close_reason?: string | undefined;
}

interface PlanningRecommendationClosureFilterInput {
  days?: number | undefined;
  group?: string | undefined;
  kind?: PlanningRecommendationKind | undefined;
  source?: PlanningRecommendationSource | undefined;
  close_reason?: string | undefined;
}

interface PlanningRecommendationHygieneFilterInput {
  group?: string | undefined;
  kind?: PlanningRecommendationKind | undefined;
  source?: PlanningRecommendationSource | undefined;
  candidate_only?: boolean | undefined;
  review_needed_only?: boolean | undefined;
}

interface PlanningRecommendationHygieneReviewInput {
  group: string;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  decision: PlanningRecommendationHygieneReviewDecision;
  note?: string | undefined;
}

interface PlanningRecommendationHygieneProposalInput {
  group: string;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  note?: string | undefined;
}

interface PlanningRecommendationPolicyGovernanceInput {
  group: string;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  note?: string | undefined;
}

interface PlanningClosureMix {
  closed_last_30d: number;
  completed_last_30d: number;
  handled_elsewhere_last_30d: number;
  source_resolved_last_30d: number;
  dominant_close_reason_last_30d: string | null;
}

interface PlanningRecommendationFamilyStats {
  family_key: string;
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  open_count: number;
  stale_count: number;
  manual_scheduling_count: number;
  resurfaced_source_count: number;
  closed_last_30d: number;
  completed_last_30d: number;
  handled_elsewhere_last_30d: number;
  source_resolved_last_30d: number;
  dominant_close_reason_last_30d: string | null;
  closure_signal: PlanningRecommendationClosureSignal;
  recommended_action: PlanningRecommendationRecommendedAction;
  signal_updated_at: string | null;
  review_needed: boolean;
  last_review_at: string | null;
  last_review_decision: PlanningRecommendationHygieneReviewDecision | null;
  last_review_by_client: string | null;
  last_review_by_actor: string | null;
  last_review_note: string | null;
  review_summary: string | null;
  follow_through_state: PlanningRecommendationFollowThroughState | null;
  proposal_type: PlanningHygienePolicyProposalType | null;
  proposal_status: PlanningHygienePolicyProposalStatus | null;
  proposal_created_at: string | null;
  proposal_updated_at: string | null;
  proposal_note: string | null;
  proposal_by_client: string | null;
  proposal_by_actor: string | null;
  proposal_stale: boolean;
  review_age_days: number | null;
  proposal_age_days: number | null;
  last_active_at: string | null;
  last_closed_at: string | null;
  closure_meaning_summary: string | null;
  queue_share_pct: number;
  summary: string;
}

interface PlanningRecommendationHygieneReviewState {
  last_review_at: string;
  last_review_decision: PlanningRecommendationHygieneReviewDecision;
  last_review_by_client: string | null;
  last_review_by_actor: string | null;
  last_review_note: string | null;
}

interface PlanningRecommendationProposalSelection {
  review_needed: number;
  reviewed_fresh: number;
  reviewed_stale: number;
  proposal_open: number;
  proposal_stale: number;
  proposal_dismissed: number;
  top_review_needed?: PlanningRecommendationFamilyStats | undefined;
  top_reviewed_stale?: PlanningRecommendationFamilyStats | undefined;
  top_proposal_open?: PlanningRecommendationFamilyStats | undefined;
  top_proposal_stale?: PlanningRecommendationFamilyStats | undefined;
}

interface PlanningRecommendationTuningSelection extends PlanningRecommendationProposalSelection {
  attention_families: PlanningRecommendationFamilyStats[];
  recently_closed_families: PlanningRecommendationTuningHistoryReport[];
}

interface PlanningRecommendationPolicySelection {
  active_proposed_count: number;
  active_dismissed_for_now_count: number;
  archived_count: number;
  superseded_count: number;
  top_active_proposed: PlanningRecommendationPolicyBacklogItem | null;
  top_active_dismissed: PlanningRecommendationPolicyBacklogItem | null;
  top_archived: PlanningRecommendationPolicyHistoryItem | null;
  top_superseded: PlanningRecommendationPolicyHistoryItem | null;
  active_policy_backlog: PlanningRecommendationPolicyBacklogItem[];
}

interface PlanningRecommendationPolicyHistoryFamilySelection {
  family: PlanningRecommendationPolicyHistoryFamilyItem;
  raw_events: PlanningRecommendationPolicyHistoryItem[];
  retention_candidates: PlanningRecommendationPolicyRetentionItem[];
}

interface PlanningRecommendationPolicyAttentionSelection {
  kind: "recent_exit" | "history_churn" | "retention_candidate" | "none";
  summary: string | null;
  worklist_kind: "planning_policy_governance_needed" | "planning_policy_retention_review_needed" | null;
  state_marker: string | null;
  group_key: string | null;
  kind_value: PlanningRecommendationKind | null;
  source: PlanningRecommendationSource | null;
  governance_event_id: string | null;
  governance_event_type: PlanningHygienePolicyGovernanceEventType | null;
}

interface PlanningCalibrationStats {
  closed_count: number;
  completed_count: number;
  handled_elsewhere_count: number;
  source_resolved_count: number;
}

const defaultDependencies: PersonalOpsDependencies = {
  startGmailAuth,
  startGoogleAuth,
  completeGmailAuth,
  completeGoogleAuth,
  loadStoredGmailTokens,
  createGmailDraft,
  updateGmailDraft,
  sendGmailDraft,
  getGmailProfile,
  verifyGmailMetadataAccess,
  listGmailMessageRefsByLabel,
  getGmailMessageMetadata,
  listGmailHistory,
  verifyGoogleCalendarAccess,
  verifyGoogleCalendarWriteAccess,
  verifyGoogleDriveAccess,
  verifyGoogleDriveScopes,
  syncDriveScope,
  getGoogleDoc,
  listGoogleCalendarSources,
  listGoogleCalendarEvents,
  getGoogleCalendarEvent,
  createGoogleCalendarEvent,
  patchGoogleCalendarEvent,
  cancelGoogleCalendarEvent,
  verifyGithubToken,
  syncGithubPullRequests,
  setKeychainSecret,
  getKeychainSecret,
  deleteKeychainSecret,
  openExternalUrl: (url) => {
    execFileSync("open", [url]);
  },
  inspectLaunchAgent: inspectInstalledLaunchAgent,
};

type AutopilotRunRequest = {
  trigger: AutopilotTrigger;
  requestedProfile: AutopilotProfile | null;
  httpReachable: boolean;
  manual: boolean;
};

export class PersonalOpsService {
  readonly db: PersonalOpsDb;
  private readonly dependencies: PersonalOpsDependencies;
  private mailboxSyncInFlight: Promise<InboxStatusReport> | null = null;
  private calendarSyncInFlight: Promise<CalendarStatusReport> | null = null;
  private githubSyncInFlight: Promise<GithubStatusReport> | null = null;
  private driveSyncInFlight: Promise<DriveStatusReport> | null = null;
  private readonly assistantActionStartedAt = new Map<string, string>();
  private autopilotRunInFlight: Promise<AutopilotStatusReport> | null = null;
  private queuedAutopilotRequest: AutopilotRunRequest | null = null;
  private reviewReadModelRefreshInFlight: Promise<void> | null = null;
  private reviewReadModelRefreshDepth = 0;

  constructor(
    private readonly paths: Paths,
    private readonly config: Config,
    private readonly policy: Policy,
    private readonly logger: Logger,
    dependencies: Partial<PersonalOpsDependencies> = {},
  ) {
    this.db = new PersonalOpsDb(paths.databaseFile);
    this.dependencies = {
      ...defaultDependencies,
      ...dependencies,
    };
    fs.mkdirSync(this.paths.snapshotsDir, { recursive: true });
  }

  assertStartupCompatibility() {
    const compatibility = this.db.getSchemaCompatibility();
    if (!compatibility.compatible) {
      throw new Error(`Startup preflight failed: ${compatibility.message}`);
    }
  }

  health() {
    const activeSendWindow = this.db.getActiveSendWindow();
    const approvalCounts = this.db.countApprovalStates();
    return {
      status: "ok",
      service: {
        host: this.config.serviceHost,
        port: this.config.servicePort,
        send_enabled: this.policy.allowSend || Boolean(activeSendWindow),
      },
      gmail: {
        oauth_client_configured: this.isOAuthClientConfigured(),
        mailbox: this.db.getMailAccount()?.email ?? null,
        review_url: this.config.gmailReviewUrl,
      },
      review_queue: {
        pending_count: this.db.listPendingReviewItems().length,
      },
      approval_queue: {
        pending_count: approvalCounts.pending,
        approved_count: approvalCounts.approved,
        send_failed_count: approvalCounts.send_failed,
      },
      calendar: {
        enabled: this.config.calendarEnabled,
        provider: this.config.calendarProvider,
        sync_status: this.config.gmailAccountEmail
          ? this.db.getCalendarSyncState(this.config.gmailAccountEmail)?.status ?? "idle"
          : "idle",
      },
      github: this.getGithubStatusReport(),
      drive: this.getDriveStatusReport(),
      send_window: activeSendWindow
        ? {
            active: true,
            expires_at: activeSendWindow.expires_at,
          }
        : {
            active: false,
            expires_at: null,
          },
      paths: {
        config_dir: this.paths.configDir,
        state_dir: this.paths.stateDir,
        log_dir: this.paths.logDir,
      },
    };
  }

  async getStatusReport(options: { httpReachable: boolean; skipDerived?: boolean }): Promise<ServiceStatusReport> {
    return buildStatusReport(this, {
      ...options,
      skipDerived: Boolean(options.skipDerived) || this.reviewReadModelRefreshDepth > 0,
    });
  }

  async getAutopilotStatusReport(
    options: { httpReachable: boolean; triggerWarm?: AutopilotTrigger | null } = { httpReachable: true },
  ): Promise<AutopilotStatusReport> {
    return buildAutopilotStatusReport(this, options);
  }

  private startReviewReadModelRefresh(trigger: string): Promise<void> {
    if (this.reviewReadModelRefreshInFlight) {
      return this.reviewReadModelRefreshInFlight;
    }
    this.reviewReadModelRefreshInFlight = (async () => {
      this.reviewReadModelRefreshDepth += 1;
      try {
        await refreshReviewReadModel(this, trigger);
      } finally {
        this.reviewReadModelRefreshDepth = Math.max(0, this.reviewReadModelRefreshDepth - 1);
        this.reviewReadModelRefreshInFlight = null;
      }
    })();
    return this.reviewReadModelRefreshInFlight;
  }

  async ensureReviewReadModel(options: { trigger: string; wait_for_fresh?: boolean; force?: boolean }): Promise<void> {
    const state = this.db.getReviewReadModelState();
    const needsRefresh = options.force || reviewReadModelNeedsRefresh(this);
    if (!needsRefresh) {
      return;
    }
    const refresh = this.startReviewReadModelRefresh(options.trigger);
    if (options.wait_for_fresh || !state?.last_refresh_finished_at) {
      await refresh;
    }
  }

  async refreshReviewReadModel(trigger = "manual"): Promise<void> {
    await this.ensureReviewReadModel({ trigger, wait_for_fresh: true, force: true });
  }

  async getReviewPackageReport(): Promise<ReviewPackageReport> {
    await this.ensureReviewReadModel({ trigger: "review_packages_read" });
    return buildStoredReviewPackageReport(this);
  }

  async getReviewPackage(packageId: string): Promise<ReviewPackage> {
    await this.ensureReviewReadModel({ trigger: "review_package_detail_read", wait_for_fresh: true });
    return getReviewPackageDetail(this, packageId);
  }

  async submitReviewPackageFeedback(
    identity: ClientIdentity,
    packageId: string,
    input: { reason: ReviewFeedbackReason; note: string; package_item_id?: string },
  ): Promise<ReviewPackage> {
    return submitReviewPackageFeedback(this, identity, packageId, input);
  }

  async getReviewTuningReport(): Promise<ReviewTuningReport> {
    await this.ensureReviewReadModel({ trigger: "review_tuning_read" });
    return buildStoredReviewTuningReport(this);
  }

  async getReviewReport(options: { window_days?: number; surface?: ReviewPackageSurface } = {}): Promise<ReviewReport> {
    return buildReviewReport(this, options);
  }

  async getReviewTrends(options: { days?: number; surface?: ReviewPackageSurface } = {}): Promise<ReviewTrendsReport> {
    return buildReviewTrends(this, options);
  }

  async getReviewImpact(options: { days?: number; surface?: ReviewPackageSurface } = {}): Promise<ReviewImpactReport> {
    return buildReviewImpact(this, options);
  }

  async getReviewWeekly(options: { days?: number } = {}): Promise<ReviewWeeklyReport> {
    return buildReviewWeekly(this, options);
  }

  async getReviewCalibration(options: { surface?: ReviewPackageSurface } = {}): Promise<ReviewCalibrationReport> {
    return buildReviewCalibration(this, options);
  }

  getReviewCalibrationTargets(): ReviewCalibrationTargetsReport {
    return getReviewCalibrationTargets(this);
  }

  updateReviewCalibrationTarget(
    identity: ClientIdentity,
    scopeKey: string,
    updates: {
      min_acted_on_rate?: number;
      max_stale_unused_rate?: number;
      max_negative_feedback_rate?: number;
      min_notification_action_conversion_rate?: number;
      max_notifications_per_7d?: number;
    },
  ): ReviewCalibrationTarget {
    return updateReviewCalibrationTarget(this, identity, scopeKey, updates);
  }

  resetReviewCalibrationTarget(identity: ClientIdentity, scopeKey: string): ReviewCalibrationTargetsReport {
    return resetReviewCalibrationTarget(this, identity, scopeKey);
  }

  async approveReviewTuningProposal(identity: ClientIdentity, proposalId: string, note: string): Promise<ReviewTuningProposal> {
    return approveReviewTuningProposal(this, identity, proposalId, note);
  }

  async dismissReviewTuningProposal(identity: ClientIdentity, proposalId: string, note: string): Promise<ReviewTuningProposal> {
    return dismissReviewTuningProposal(this, identity, proposalId, note);
  }

  getReviewNotificationSnapshot() {
    return getReviewNotificationSnapshot(this);
  }

  async recordReviewNotificationEvents(
    identity: ClientIdentity,
    events: Array<{
      kind: ReviewNotificationKind;
      decision: ReviewNotificationDecision;
      source: "desktop";
      surface?: ReviewPackageSurface;
      package_id?: string;
      package_cycle_id?: string;
      proposal_id?: string;
      suppression_reason?: "cooldown" | "permission_denied";
      current_count: number;
      previous_count: number;
      cooldown_minutes: number;
    }>,
  ): Promise<void> {
    return recordReviewNotificationEvents(this, identity, events);
  }

  isAutopilotRunning(): boolean {
    return this.autopilotRunInFlight !== null;
  }

  async runAutopilot(
    identity: ClientIdentity | null,
    options: { trigger: AutopilotTrigger; requestedProfile?: AutopilotProfile | null; httpReachable: boolean; manual?: boolean },
  ): Promise<AutopilotStatusReport> {
    const request: AutopilotRunRequest = {
      trigger: options.trigger,
      requestedProfile: options.requestedProfile ?? null,
      httpReachable: options.httpReachable,
      manual: Boolean(options.manual),
    };

    if (request.manual) {
      if (!identity) {
        throw new Error("Manual autopilot runs require an operator identity.");
      }
      this.assertOperatorOnly(identity, "run autopilot");
      this.db.registerClient(identity);
    }

    if (this.autopilotRunInFlight) {
      this.queuedAutopilotRequest = this.mergeAutopilotRequests(this.queuedAutopilotRequest, request);
      return this.autopilotRunInFlight;
    }

    this.autopilotRunInFlight = (async () => {
      let current: AutopilotRunRequest | null = request;
      let latest = await this.getAutopilotStatusReport({ httpReachable: request.httpReachable });
      while (current) {
        latest = await runAutopilotCoordinator(this, current);
        current = this.queuedAutopilotRequest;
        this.queuedAutopilotRequest = null;
      }
      return latest;
    })();

    try {
      return await this.autopilotRunInFlight;
    } finally {
      this.autopilotRunInFlight = null;
    }
  }

  scheduleAutopilotRun(
    trigger: AutopilotTrigger,
    options: { requestedProfile?: AutopilotProfile; httpReachable?: boolean; manual?: boolean } = {},
  ): void {
    if (!this.config.autopilotEnabled || this.config.autopilotMode === "off") {
      return;
    }
    const request: AutopilotRunRequest = {
      trigger,
      requestedProfile: options.requestedProfile ?? null,
      httpReachable: options.httpReachable ?? true,
      manual: Boolean(options.manual),
    };
    if (this.autopilotRunInFlight) {
      this.queuedAutopilotRequest = this.mergeAutopilotRequests(this.queuedAutopilotRequest, request);
      return;
    }
    void this.runAutopilot(null, request).catch((error) => {
      this.logger.error("autopilot_run_failed", {
        trigger,
        profile: options.requestedProfile ?? "all",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async getNowNextWorkflowReport(options: { httpReachable: boolean }) {
    return buildNowNextWorkflowReport(this, options);
  }

  async getPrepDayWorkflowReport(options: { httpReachable: boolean }) {
    return buildPrepDayWorkflowReport(this, options);
  }

  async getFollowUpBlockWorkflowReport(options: { httpReachable: boolean }) {
    return buildFollowUpBlockWorkflowReport(this, options);
  }

  async getInboxAutopilotReport(options: { httpReachable: boolean }): Promise<InboxAutopilotReport> {
    return buildInboxAutopilotReport(this, options);
  }

  async getOutboundAutopilotReport(options: { httpReachable: boolean }): Promise<OutboundAutopilotReport> {
    return buildOutboundAutopilotReport(this, options);
  }

  async getOutboundAutopilotGroup(groupId: string): Promise<OutboundAutopilotGroup> {
    return getOutboundAutopilotGroupDetail(this, groupId);
  }

  async getPlanningAutopilotReport(options: { httpReachable: boolean }): Promise<PlanningAutopilotReport> {
    return buildPlanningAutopilotReport(this, options);
  }

  async getPlanningAutopilotBundle(bundleId: string): Promise<PlanningAutopilotBundle> {
    return getPlanningAutopilotBundleDetail(this, bundleId);
  }

  async getPrepMeetingsWorkflowReport(options: { httpReachable: boolean; scope: "today" | "next_24h" }) {
    return buildPrepMeetingsWorkflowReport(this, options);
  }

  async getMeetingPrepPacket(eventId: string): Promise<MeetingPrepPacket> {
    return getMeetingPrepPacketDetail(this, eventId);
  }

  async prepareMeetingPrepPacket(
    identity: ClientIdentity,
    eventId: string,
    options: {
      autopilotMetadata?: {
        autopilot_run_id?: string;
        autopilot_profile?: AutopilotProfile;
        autopilot_trigger?: AutopilotTrigger;
        autopilot_prepared_at?: string;
      };
    } = {},
  ) {
    return prepareMeetingPrepPacket(this, identity, eventId, options);
  }

  async preparePlanningAutopilotBundle(
    identity: ClientIdentity,
    bundleId: string,
    options: {
      autopilotMetadata?: {
        autopilot_run_id?: string;
        autopilot_profile?: AutopilotProfile;
        autopilot_trigger?: AutopilotTrigger;
        autopilot_prepared_at?: string;
      };
    } = {},
  ) {
    return preparePlanningAutopilotBundle(this, identity, bundleId, options);
  }

  async requestApprovalForOutboundGroup(identity: ClientIdentity, groupId: string, note: string): Promise<OutboundAutopilotActionResult> {
    return requestApprovalForOutboundGroup(this, identity, groupId, note);
  }

  async approveOutboundGroup(
    identity: ClientIdentity,
    groupId: string,
    note: string,
    confirmed: boolean,
  ): Promise<OutboundAutopilotActionResult> {
    return approveOutboundGroup(this, identity, groupId, note, confirmed);
  }

  async sendOutboundGroup(
    identity: ClientIdentity,
    groupId: string,
    note: string,
    confirmed: boolean,
  ): Promise<OutboundAutopilotActionResult> {
    return sendOutboundGroup(this, identity, groupId, note, confirmed);
  }

  async applyPlanningAutopilotBundle(identity: ClientIdentity, bundleId: string, note: string, confirmed: boolean) {
    return applyPlanningAutopilotBundle(this, identity, bundleId, note, confirmed);
  }

  async getAssistantActionQueueReport(options: { httpReachable: boolean }): Promise<AssistantActionQueueReport> {
    return buildAssistantActionQueueReport(this, options);
  }

  getAssistantActionStartedAt(actionId: string): string | null {
    return this.assistantActionStartedAt.get(actionId) ?? null;
  }

  async runTrackedAssistantAction<T>(actionId: string, run: () => Promise<T>): Promise<T> {
    const startedAt = new Date().toISOString();
    this.assistantActionStartedAt.set(actionId, startedAt);
    try {
      return await run();
    } finally {
      this.assistantActionStartedAt.delete(actionId);
    }
  }

  async runAssistantQueueAction(identity: ClientIdentity, actionId: string): Promise<AssistantActionRunResult> {
    this.assertOperatorOnly(identity, "run this assistant action");
    this.db.registerClient(identity);
    return runAssistantAction(this, identity, actionId);
  }

  async prepareInboxAutopilotGroup(
    identity: ClientIdentity,
    groupId: string,
    options: {
      autopilotMetadata?: {
        autopilot_run_id?: string;
        autopilot_profile?: AutopilotProfile;
        autopilot_trigger?: AutopilotTrigger;
        autopilot_prepared_at?: string;
      };
    } = {},
  ) {
    return prepareInboxAutopilotGroup(this, identity, groupId, options);
  }

  async runDoctor(options: DoctorOptions): Promise<DoctorReport> {
    return buildDoctorReport(this, options);
  }

  getSendWindowStatus(): { active_window: SendWindow | null; effective_send_enabled: boolean; permanent_send_enabled: boolean } {
    const activeWindow = this.db.getActiveSendWindow();
    return {
      active_window: activeWindow,
      effective_send_enabled: this.isSendEnabled(activeWindow),
      permanent_send_enabled: this.policy.allowSend,
    };
  }

  getInboxStatusReport(): InboxStatusReport {
    const mailbox = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    const sync = mailbox ? this.db.getMailSyncState(mailbox) : null;
    const unread = this.listUnreadInboxThreads(MAX_INBOX_LIMIT).length;
    const followups = this.listFollowupThreads(MAX_INBOX_LIMIT).length;
    return {
      mailbox,
      sync,
      unread_thread_count: unread,
      followup_thread_count: followups,
      total_thread_count: this.db.countMailThreads(),
    };
  }

  getCalendarStatusReport(): CalendarStatusReport {
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    const sync = account ? this.db.getCalendarSyncState(account) : null;
    const upcoming = this.listUpcomingCalendarEvents(1, 1)[0];
    const conflicts = this.listCalendarConflicts(1);
    return {
      account,
      enabled: this.config.calendarEnabled,
      provider: this.config.calendarProvider,
      sync,
      calendars_synced_count: account ? this.db.countCalendarSources(account) : 0,
      events_synced_count: account ? this.db.countCalendarEvents(account) : 0,
      owned_writable_calendar_count: account ? this.db.countOwnedCalendarSources(account) : 0,
      personal_ops_active_event_count: account ? this.db.countPersonalOpsCalendarEvents(account) : 0,
      linked_scheduled_task_count: this.db.countTasksWithScheduledEvent(true),
      next_upcoming_event: upcoming,
      conflict_count_next_24h: conflicts.length,
    };
  }

  getGithubStatusReport(): GithubStatusReport {
    const account = this.db.getGithubAccount();
    const sync = this.db.getGithubSyncState();
    const pulls = this.db.listGithubPullRequests({ attention_only: true });
    const reviewRequestedCount = pulls.filter((pull) => pull.attention_kind === "github_review_requested").length;
    const authoredAttentionCount = pulls.filter(
      (pull) =>
        pull.attention_kind === "github_pr_checks_failing" ||
        pull.attention_kind === "github_pr_changes_requested" ||
        pull.attention_kind === "github_pr_merge_ready",
    ).length;
    return {
      enabled: this.config.githubEnabled,
      connected_login: account?.login ?? null,
      authenticated: Boolean(
        account && this.dependencies.getKeychainSecret(this.config.githubKeychainService, account.keychain_account),
      ),
      sync_status: this.config.githubEnabled ? sync?.status ?? "not_configured" : "not_configured",
      last_synced_at: sync?.last_synced_at ?? null,
      included_repository_count: this.config.includedGithubRepositories.length,
      review_requested_count: reviewRequestedCount,
      authored_pr_attention_count: authoredAttentionCount,
      top_item_summary: pulls[0]?.attention_summary ?? null,
    };
  }

  getDriveStatusReport(): DriveStatusReport {
    const mailAccount = this.db.getMailAccount();
    const sync = this.db.getDriveSyncState();
    const docs = this.db.listDriveDocs();
    const sheets = this.db.listDriveSheets();
    const files = this.db.listDriveFiles();
    const authenticated = Boolean(
      mailAccount && this.dependencies.getKeychainSecret(this.config.keychainService, mailAccount.email),
    );
    const report: DriveStatusReport = {
      enabled: this.config.driveEnabled,
      authenticated,
      sync_status: this.config.driveEnabled ? sync?.status ?? "not_configured" : "not_configured",
      last_synced_at: sync?.last_synced_at ?? null,
      included_folder_count: this.config.includedDriveFolders.length,
      included_file_count: this.config.includedDriveFiles.length,
      indexed_file_count: files.length,
      indexed_doc_count: docs.length,
      indexed_sheet_count: sheets.length,
      top_item_summary: null,
    };
    report.top_item_summary = buildDriveTopItemSummary(report);
    return report;
  }

  listDriveFiles(): DriveFileRecord[] {
    return this.db.listDriveFiles();
  }

  getDriveDoc(fileId: string): DriveDocRecord {
    const doc = this.db.getDriveDoc(fileId);
    if (!doc) {
      throw new Error(`Drive doc ${fileId} was not found.`);
    }
    return doc;
  }

  listDriveSheets(): DriveSheetRecord[] {
    return this.db.listDriveSheets();
  }

  getDriveSheet(fileId: string): DriveSheetRecord {
    const sheet = this.db.getDriveSheet(fileId);
    if (!sheet) {
      throw new Error(`Drive sheet ${fileId} was not found.`);
    }
    return sheet;
  }

  listGithubReviews(): GithubPullRequest[] {
    return this.db.listGithubPullRequests({ attention_kind: "github_review_requested" });
  }

  listGithubPulls(): GithubPullRequest[] {
    return this.db.listGithubPullRequests({ attention_only: true });
  }

  getGithubPull(prKey: string): GithubPullRequest {
    const pullRequest = this.db.getGithubPullRequest(prKey);
    if (!pullRequest) {
      throw new Error(`GitHub pull request ${prKey} was not found.`);
    }
    return pullRequest;
  }

  async loginGithubPat(identity: ClientIdentity, token: string): Promise<GithubAccount> {
    this.assertOperatorOnly(identity, "connect GitHub");
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error("GitHub token is required.");
    }
    const account = await this.dependencies.verifyGithubToken(normalizedToken, this.config.githubKeychainService);
    const previous = this.db.getGithubAccount();
    this.dependencies.setKeychainSecret(this.config.githubKeychainService, account.keychain_account, normalizedToken);
    this.db.upsertGithubAccount(account);
    if (previous && previous.keychain_account !== account.keychain_account) {
      this.dependencies.deleteKeychainSecret(previous.keychain_service, previous.keychain_account);
    }
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "github_auth_login",
      target_type: "github_account",
      target_id: account.login,
      outcome: "success",
      metadata: { login: account.login },
    });
    return account;
  }

  logoutGithub(identity: ClientIdentity): { cleared: boolean; login: string | null } {
    this.assertOperatorOnly(identity, "disconnect GitHub");
    const account = this.db.getGithubAccount();
    if (account) {
      this.dependencies.deleteKeychainSecret(account.keychain_service, account.keychain_account);
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "github_auth_logout",
        target_type: "github_account",
        target_id: account.login,
        outcome: "success",
        metadata: { login: account.login },
      });
    }
    this.db.clearGithubAccount();
    this.db.replaceGithubPullRequests([]);
    this.db.upsertGithubSyncState({
      status: "idle",
      last_synced_at: null,
      last_error_code: null,
      last_error_message: null,
      last_sync_duration_ms: null,
      repositories_scanned_count: 0,
      pull_requests_refreshed_count: 0,
    });
    return { cleared: Boolean(account), login: account?.login ?? null };
  }

  async syncGithub(identity: ClientIdentity): Promise<GithubStatusReport> {
    if (this.githubSyncInFlight) {
      return await this.githubSyncInFlight;
    }
    const run = this.performGithubSync(identity);
    this.githubSyncInFlight = run;
    try {
      return await run;
    } finally {
      if (this.githubSyncInFlight === run) {
        this.githubSyncInFlight = null;
      }
    }
  }

  async syncDrive(identity: ClientIdentity): Promise<DriveStatusReport> {
    if (this.driveSyncInFlight) {
      return await this.driveSyncInFlight;
    }
    const run = this.performDriveSync(identity);
    this.driveSyncInFlight = run;
    try {
      return await run;
    } finally {
      if (this.driveSyncInFlight === run) {
        this.driveSyncInFlight = null;
      }
    }
  }

  async syncMailboxMetadata(identity: ClientIdentity): Promise<InboxStatusReport> {
    if (this.mailboxSyncInFlight) {
      return await this.mailboxSyncInFlight;
    }
    const run = this.performMailboxSync(identity);
    this.mailboxSyncInFlight = run;
    try {
      return await run;
    } finally {
      if (this.mailboxSyncInFlight === run) {
        this.mailboxSyncInFlight = null;
      }
    }
  }

  async syncCalendarMetadata(identity: ClientIdentity): Promise<CalendarStatusReport> {
    if (this.calendarSyncInFlight) {
      return await this.calendarSyncInFlight;
    }
    const run = this.performCalendarSync(identity);
    this.calendarSyncInFlight = run;
    try {
      return await run;
    } finally {
      if (this.calendarSyncInFlight === run) {
        this.calendarSyncInFlight = null;
      }
    }
  }

  listCalendarSources(): CalendarSource[] {
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    return account ? this.db.listCalendarSources(account) : [];
  }

  listOwnedCalendarSources(): OwnedCalendarSummary[] {
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    if (!account) return [];
    return this.db.listOwnedCalendarSources(account).map((source) => ({
      calendar_id: source.calendar_id,
      title: source.title,
      is_primary: source.is_primary,
      time_zone: source.time_zone,
    }));
  }

  listUpcomingCalendarEvents(days = 7, limit = 20): CalendarEvent[] {
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    if (!account) return [];
    const now = new Date();
    const until = new Date(now.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000);
    return this.db
      .listCalendarEvents({
        account,
        ends_after: now.toISOString(),
        starts_before: until.toISOString(),
      })
      .filter((event) => event.status !== "cancelled")
      .sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at))
      .slice(0, limit);
  }

  listCalendarConflicts(days = 7): CalendarConflict[] {
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    if (!account) return [];
    const now = new Date();
    const until = new Date(now.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000);
    return this.computeCalendarConflicts(
      this.db.listCalendarEvents({
        account,
        ends_after: now.toISOString(),
        starts_before: until.toISOString(),
      }),
    );
  }

  getFreeTimeWindows(day: string): FreeTimeWindow[] {
    return this.computeFreeTimeWindows(day);
  }

  getCalendarDayView(day: string): CalendarDayView {
    const { start, end } = this.getLocalDayBounds(day);
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    const events = account
      ? this.db
          .listCalendarEvents({ account, ends_after: start.toISOString(), starts_before: end.toISOString() })
          .filter((event) => event.status !== "cancelled")
      : [];
    const workday = this.getWorkdayBounds(day);
    return {
      day,
      workday_start_at: workday.start.toISOString(),
      workday_end_at: workday.end.toISOString(),
      events,
      conflicts: this.computeCalendarConflicts(events),
      free_time_windows: this.computeFreeTimeWindows(day, events),
      overloaded: this.isDayOverloaded(day, events),
    };
  }

  getCalendarEventDetail(eventId: string): CalendarEvent {
    const event = this.db.getCalendarEvent(eventId);
    if (!event) {
      throw new Error(`Calendar event ${eventId} was not found.`);
    }
    return event;
  }

  async createCalendarEvent(identity: ClientIdentity, input: CalendarEventWriteInput): Promise<CalendarEvent> {
    this.assertOperatorOnly(identity, "create this calendar event");
    const title = String(input.title ?? "").trim();
    if (!title) {
      throw new Error("Calendar event title is required.");
    }
    const { startAt, endAt } = this.assertTimedCalendarRange(input.start_at, input.end_at);
    this.db.registerClient(identity);
    const { stored, target } = await this.loadCalendarWriteContext(input.calendar_id);
    const created = await this.dependencies.createGoogleCalendarEvent(stored.tokensJson, stored.clientConfig, target.calendar_id, {
      title,
      start_at: startAt,
      end_at: endAt,
      location: input.location?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      created_by_client: identity.client_id,
    });
    const now = new Date().toISOString();
    const event = this.db.upsertCalendarEvent(
      this.toLocalCalendarEvent(stored.email, target.calendar_id, created, {
        synced_at: now,
        last_write_at: now,
        last_write_by_client: identity.client_id,
      }),
    );
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "calendar_event_create",
      target_type: "calendar_event",
      target_id: event.event_id,
      outcome: "success",
      metadata: {
        calendar_id: event.calendar_id,
        provider_event_id: event.provider_event_id,
        changed_fields: ["summary", "start_at", "end_at", "location", "notes"],
      },
    });
    return event;
  }

  async updateCalendarEvent(identity: ClientIdentity, eventId: string, input: CalendarEventWriteInput): Promise<CalendarEvent> {
    this.assertOperatorOnly(identity, "update this calendar event");
    const current = this.db.getCalendarEvent(eventId);
    if (!current) {
      throw new Error(`Calendar event ${eventId} was not found.`);
    }
    this.assertCalendarEventMutable(current);
    const normalized = this.normalizeCalendarUpdateInput(current, input);
    const changedFields = Object.keys(normalized.changed);
    if (changedFields.length === 0) {
      throw new Error("At least one calendar event field must be provided.");
    }
    this.db.registerClient(identity);
    const { stored, target } = await this.loadCalendarWriteContext(current.calendar_id);
    const live = await this.dependencies.getGoogleCalendarEvent(
      stored.tokensJson,
      stored.clientConfig,
      current.calendar_id,
      current.provider_event_id,
    );
    this.assertCalendarEventIsCurrent(current, live);
    const updatedProvider = await this.dependencies.patchGoogleCalendarEvent(
      stored.tokensJson,
      stored.clientConfig,
      target.calendar_id,
      current.provider_event_id,
      normalized.patch,
    );
    const now = new Date().toISOString();
    const updated = this.db.upsertCalendarEvent(
      this.toLocalCalendarEvent(stored.email, current.calendar_id, updatedProvider, {
        synced_at: now,
        last_write_at: now,
        last_write_by_client: identity.client_id,
        source_task_id: current.source_task_id ?? updatedProvider.source_task_id,
      }),
    );
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "calendar_event_update",
      target_type: "calendar_event",
      target_id: updated.event_id,
      outcome: "success",
      metadata: {
        calendar_id: updated.calendar_id,
        provider_event_id: updated.provider_event_id,
        changed_fields: changedFields,
        linked_task_id: updated.source_task_id ?? null,
      },
    });
    return updated;
  }

  async cancelCalendarEvent(identity: ClientIdentity, eventId: string, note: string): Promise<CalendarEvent> {
    this.assertOperatorOnly(identity, "cancel this calendar event");
    this.assertRequiredNote(note, "cancel");
    const current = this.db.getCalendarEvent(eventId);
    if (!current) {
      throw new Error(`Calendar event ${eventId} was not found.`);
    }
    if (!current.created_by_personal_ops) {
      throw new Error("Only personal-ops created calendar events can be canceled from this command.");
    }
    this.assertCalendarEventMutable(current);
    this.db.registerClient(identity);
    const { stored, target } = await this.loadCalendarWriteContext(current.calendar_id);
    const live = await this.dependencies.getGoogleCalendarEvent(
      stored.tokensJson,
      stored.clientConfig,
      current.calendar_id,
      current.provider_event_id,
    );
    this.assertCalendarEventIsCurrent(current, live);
    await this.dependencies.cancelGoogleCalendarEvent(
      stored.tokensJson,
      stored.clientConfig,
      target.calendar_id,
      current.provider_event_id,
    );
    this.db.deleteCalendarEvent(current.event_id);
    if (current.source_task_id) {
      this.db.updateTask(current.source_task_id, { scheduled_calendar_event_id: null });
    }
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "calendar_event_cancel",
      target_type: "calendar_event",
      target_id: current.event_id,
      outcome: "success",
      metadata: {
        calendar_id: current.calendar_id,
        provider_event_id: current.provider_event_id,
        linked_task_id: current.source_task_id ?? null,
        note: note.trim(),
        changed_fields: ["status"],
      },
    });
    return current;
  }

  async scheduleTaskOnCalendar(
    identity: ClientIdentity,
    taskId: string,
    input: CalendarEventWriteInput,
    options?: { refreshPlanningRecommendations?: boolean },
  ): Promise<CalendarTaskScheduleResult> {
    this.assertOperatorOnly(identity, "schedule this task");
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    if (!["pending", "in_progress"].includes(task.state)) {
      throw new Error(`Task ${taskId} cannot be scheduled from state ${task.state}.`);
    }
    if (task.scheduled_calendar_event_id) {
      throw new Error(`Task ${taskId} already has a scheduled calendar event.`);
    }
    const title = String(input.title ?? task.title).trim();
    if (!title) {
      throw new Error("Task schedule title is required.");
    }
    const { startAt, endAt } = this.assertTimedCalendarRange(input.start_at, input.end_at);
    this.db.registerClient(identity);
    const { stored, target } = await this.loadCalendarWriteContext(input.calendar_id);
    const created = await this.dependencies.createGoogleCalendarEvent(stored.tokensJson, stored.clientConfig, target.calendar_id, {
      title,
      start_at: startAt,
      end_at: endAt,
      location: input.location?.trim() || undefined,
      notes: input.notes?.trim() || task.notes || undefined,
      source_task_id: task.task_id,
      created_by_client: identity.client_id,
    });
    const now = new Date().toISOString();
    const event = this.db.upsertCalendarEvent(
      this.toLocalCalendarEvent(stored.email, target.calendar_id, created, {
        synced_at: now,
        source_task_id: task.task_id,
        last_write_at: now,
        last_write_by_client: identity.client_id,
      }),
    );
    const updatedTask = this.db.updateTask(task.task_id, {
      scheduled_calendar_event_id: event.event_id,
    })!;
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "calendar_task_schedule",
      target_type: "task",
      target_id: task.task_id,
      outcome: "success",
      metadata: {
        calendar_id: event.calendar_id,
        event_id: event.event_id,
        provider_event_id: event.provider_event_id,
        linked_task_id: task.task_id,
      },
    });
    if (options?.refreshPlanningRecommendations !== false) {
      this.refreshPlanningRecommendationsInternal(identity);
    }
    return {
      task: updatedTask,
      event,
    };
  }

  async unscheduleTaskFromCalendar(identity: ClientIdentity, taskId: string, note: string): Promise<CalendarTaskScheduleResult> {
    this.assertOperatorOnly(identity, "unschedule this task");
    this.assertRequiredNote(note, "unschedule");
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    if (!task.scheduled_calendar_event_id) {
      throw new Error(`Task ${taskId} does not have a scheduled calendar event.`);
    }
    const event = this.db.getCalendarEvent(task.scheduled_calendar_event_id);
    if (!event) {
      this.db.updateTask(task.task_id, {
        scheduled_calendar_event_id: null,
        decision_note: note.trim(),
      })!;
      throw new Error(`Task ${taskId} linked event ${task.scheduled_calendar_event_id} is missing locally.`);
    }
    if (!event.created_by_personal_ops) {
      throw new Error("Only personal-ops created task events can be unscheduled from this command.");
    }
    this.assertCalendarEventMutable(event);
    this.db.registerClient(identity);
    const { stored, target } = await this.loadCalendarWriteContext(event.calendar_id);
    const live = await this.dependencies.getGoogleCalendarEvent(
      stored.tokensJson,
      stored.clientConfig,
      event.calendar_id,
      event.provider_event_id,
    );
    this.assertCalendarEventIsCurrent(event, live);
    await this.dependencies.cancelGoogleCalendarEvent(
      stored.tokensJson,
      stored.clientConfig,
      target.calendar_id,
      event.provider_event_id,
    );
    this.db.deleteCalendarEvent(event.event_id);
    const updatedTask = this.db.updateTask(task.task_id, {
      scheduled_calendar_event_id: null,
      decision_note: note.trim(),
    })!;
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "calendar_task_unschedule",
      target_type: "task",
      target_id: task.task_id,
      outcome: "success",
      metadata: {
        calendar_id: event.calendar_id,
        event_id: event.event_id,
        provider_event_id: event.provider_event_id,
        linked_task_id: task.task_id,
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationsInternal(identity);
    return {
      task: updatedTask,
      event,
    };
  }

  private async performMailboxSync(identity: ClientIdentity): Promise<InboxStatusReport> {
    this.assertOperatorOnly(identity, "sync mailbox metadata");
    this.db.registerClient(identity);
    const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
    this.assertStoredMailboxMatches(stored.email);
    await this.dependencies.verifyGmailMetadataAccess(stored.tokensJson, stored.clientConfig);
    const priorSyncState = this.db.getMailSyncState(stored.email);
    const now = new Date().toISOString();
    this.db.upsertMailSyncState(stored.email, "gmail", {
      status: "syncing",
      last_error_code: null,
      last_error_message: null,
      last_synced_at: now,
    });
    const syncStartedAt = Date.now();
    try {
      let stats: InboxSyncStats;
      if (
        !priorSyncState?.last_seeded_at ||
        !priorSyncState.last_history_id ||
        priorSyncState.last_error_code === "history_invalid"
      ) {
        stats = await this.seedMailboxMetadata(stored.email, stored.tokensJson, stored.clientConfig);
      } else {
        try {
          stats = await this.incrementalMailboxSync(
            stored.email,
            priorSyncState.last_history_id,
            stored.tokensJson,
            stored.clientConfig,
          );
        } catch (error) {
          if (!this.isHistoryInvalidError(error) && !/History id is stale/i.test(error instanceof Error ? error.message : "")) {
            throw error;
          }
          stats = await this.seedMailboxMetadata(stored.email, stored.tokensJson, stored.clientConfig);
        }
      }
      const syncedAt = new Date().toISOString();
      const profile = await this.dependencies.getGmailProfile(stored.tokensJson, stored.clientConfig);
      const persistedSyncState = this.db.getMailSyncState(stored.email);
      const durationMs = Date.now() - syncStartedAt;
      this.db.upsertMailSyncState(stored.email, "gmail", {
        status: "ready",
        last_history_id:
          persistedSyncState?.last_history_id ??
          (profile.profile.historyId ? String(profile.profile.historyId) : priorSyncState?.last_history_id ?? null),
        last_synced_at: syncedAt,
        last_sync_duration_ms: durationMs,
        last_sync_refreshed_count: stats.refreshed,
        last_sync_deleted_count: stats.deleted,
        last_error_code: null,
        last_error_message: null,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "mailbox_sync",
        target_type: "mail_sync_state",
        target_id: stored.email,
        outcome: "success",
        metadata: {
          mailbox: stored.email,
          requested_by: identity.requested_by ?? null,
          sync_result: {
            messages_refreshed: stats.refreshed,
            messages_deleted: stats.deleted,
            threads_recomputed: stats.threads_recomputed,
            duration_ms: durationMs,
            history_id: stats.history_id ?? persistedSyncState?.last_history_id ?? null,
          },
          stats: this.getInboxStatusReport(),
        },
      });
      this.refreshPlanningRecommendationsInternal(this.systemPlanningIdentity("mailbox-sync"));
      return this.getInboxStatusReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mailbox sync failed.";
      const code = this.isHistoryInvalidError(error) || /History/i.test(message) ? "history_invalid" : "sync_error";
      this.db.upsertMailSyncState(stored.email, "gmail", {
        status: "degraded",
        last_sync_duration_ms: Date.now() - syncStartedAt,
        last_error_code: code,
        last_error_message: message,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "mailbox_sync",
        target_type: "mail_sync_state",
        target_id: stored.email,
        outcome: "failure",
        metadata: {
          mailbox: stored.email,
          error_code: code,
        },
      });
      throw error;
    }
  }

  private async performCalendarSync(identity: ClientIdentity): Promise<CalendarStatusReport> {
    this.assertOperatorOnly(identity, "sync calendar metadata");
    if (!this.config.calendarEnabled) {
      return this.getCalendarStatusReport();
    }
    this.db.registerClient(identity);
    const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
    this.assertStoredMailboxMatches(stored.email);
    await this.dependencies.verifyGoogleCalendarAccess(stored.tokensJson, stored.clientConfig);
    const priorSyncState = this.db.getCalendarSyncState(stored.email);
    const syncStartedAt = Date.now();
    this.db.upsertCalendarSyncState(stored.email, this.config.calendarProvider, {
      status: "syncing",
      last_error_code: null,
      last_error_message: null,
    });
    try {
      const stats = await this.refreshCalendarWindow(stored.email, stored.tokensJson, stored.clientConfig);
      const syncedAt = new Date().toISOString();
      this.db.upsertCalendarSyncState(stored.email, this.config.calendarProvider, {
        status: "ready",
        last_synced_at: syncedAt,
        last_seeded_at: priorSyncState?.last_seeded_at ?? syncedAt,
        last_sync_duration_ms: stats.duration_ms,
        calendars_refreshed_count: stats.calendars_refreshed,
        events_refreshed_count: stats.events_refreshed,
        last_error_code: null,
        last_error_message: null,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "calendar_sync",
        target_type: "calendar_sync_state",
        target_id: stored.email,
        outcome: "success",
        metadata: {
          account: stored.email,
          provider: this.config.calendarProvider,
          sync_result: {
            calendars_refreshed: stats.calendars_refreshed,
            events_refreshed: stats.events_refreshed,
            duration_ms: stats.duration_ms,
          },
          stats: this.getCalendarStatusReport(),
        },
      });
      this.refreshPlanningRecommendationsInternal(this.systemPlanningIdentity("calendar-sync"));
      return this.getCalendarStatusReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Calendar sync failed.";
      this.db.upsertCalendarSyncState(stored.email, this.config.calendarProvider, {
        status: "degraded",
        last_sync_duration_ms: Date.now() - syncStartedAt,
        last_error_code: "calendar_sync_error",
        last_error_message: message,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "calendar_sync",
        target_type: "calendar_sync_state",
        target_id: stored.email,
        outcome: "failure",
        metadata: {
          account: stored.email,
          error_message: message,
        },
      });
      throw error;
    }
  }

  private async performGithubSync(identity: ClientIdentity): Promise<GithubStatusReport> {
    this.assertOperatorOnly(identity, "sync GitHub pull request context");
    if (!this.config.githubEnabled) {
      return this.getGithubStatusReport();
    }
    this.db.registerClient(identity);
    const account = this.db.getGithubAccount();
    if (!account) {
      throw new Error("GitHub is enabled, but no connected GitHub login is recorded. Run `personal-ops auth github login`.");
    }
    if (this.config.includedGithubRepositories.length === 0) {
      throw new Error("GitHub is enabled, but github.included_repositories is empty in config.toml.");
    }
    const token = this.dependencies.getKeychainSecret(this.config.githubKeychainService, account.keychain_account);
    if (!token) {
      throw new Error("GitHub is enabled, but no Keychain token was found. Run `personal-ops auth github login`.");
    }
    const syncStartedAt = Date.now();
    this.db.upsertGithubSyncState({
      status: "syncing",
      last_error_code: null,
      last_error_message: null,
    });
    try {
      const synced = await this.dependencies.syncGithubPullRequests(
        token,
        this.config.includedGithubRepositories,
        account.login,
      );
      const syncedAt = new Date().toISOString();
      this.db.replaceGithubPullRequests(synced.pull_requests);
      this.db.upsertGithubSyncState({
        status: "ready",
        last_synced_at: syncedAt,
        last_error_code: null,
        last_error_message: null,
        last_sync_duration_ms: Date.now() - syncStartedAt,
        repositories_scanned_count: synced.repositories_scanned_count,
        pull_requests_refreshed_count: synced.pull_requests.length,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "github_sync",
        target_type: "github_sync_state",
        target_id: "github",
        outcome: "success",
        metadata: {
          login: account.login,
          repositories_scanned_count: synced.repositories_scanned_count,
          pull_requests_refreshed_count: synced.pull_requests.length,
        },
      });
      return this.getGithubStatusReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub sync failed.";
      this.db.upsertGithubSyncState({
        status: "degraded",
        last_error_code: "github_sync_error",
        last_error_message: message,
        last_sync_duration_ms: Date.now() - syncStartedAt,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "github_sync",
        target_type: "github_sync_state",
        target_id: "github",
        outcome: "failure",
        metadata: {
          login: account.login,
          error_message: message,
        },
      });
      throw error;
    }
  }

  private async performDriveSync(identity: ClientIdentity): Promise<DriveStatusReport> {
    this.assertOperatorOnly(identity, "sync Drive and Docs context");
    if (!this.config.driveEnabled) {
      return this.getDriveStatusReport();
    }
    this.db.registerClient(identity);
    const mailAccount = this.db.getMailAccount();
    if (!mailAccount) {
      throw new Error("Drive is enabled, but no Google mailbox is connected. Run `personal-ops auth google login`.");
    }
    if (this.config.includedDriveFolders.length === 0 && this.config.includedDriveFiles.length === 0) {
      throw new Error("Drive is enabled, but drive.included_folders and drive.included_files are both empty in config.toml.");
    }
    const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
    const syncStartedAt = Date.now();
    this.db.upsertDriveSyncState({
      status: "syncing",
      last_error_code: null,
      last_error_message: null,
    });
    try {
      await this.dependencies.verifyGoogleDriveAccess(stored.tokensJson, stored.clientConfig);
      const synced = await this.dependencies.syncDriveScope(stored.tokensJson, stored.clientConfig, this.config);
      const syncedAt = new Date().toISOString();
      this.db.replaceDriveFiles(synced.files);
      this.db.replaceDriveDocs(synced.docs);
      this.db.replaceDriveSheets(synced.sheets);
      this.db.upsertDriveSyncState({
        status: "ready",
        last_synced_at: syncedAt,
        last_error_code: null,
        last_error_message: null,
        last_sync_duration_ms: Date.now() - syncStartedAt,
        files_indexed_count: synced.files.length,
        docs_indexed_count: synced.docs.length,
        sheets_indexed_count: synced.sheets.length,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "drive_sync",
        target_type: "drive_sync_state",
        target_id: "google_drive",
        outcome: "success",
        metadata: {
          indexed_file_count: synced.files.length,
          indexed_doc_count: synced.docs.length,
          indexed_sheet_count: synced.sheets.length,
        },
      });
      this.refreshDriveLinkProvenance();
      return this.getDriveStatusReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Drive sync failed.";
      this.db.upsertDriveSyncState({
        status: "degraded",
        last_error_code: "drive_sync_error",
        last_error_message: message,
        last_sync_duration_ms: Date.now() - syncStartedAt,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "drive_sync",
        target_type: "drive_sync_state",
        target_id: "google_drive",
        outcome: "failure",
        metadata: { error_message: message },
      });
      throw error;
    }
  }

  listRecentDriveDocs(limit = 10): DriveDocRecord[] {
    return this.db.listDriveDocs().slice(0, Math.max(0, limit));
  }

  listRecentDriveFiles(limit = 10): RelatedDriveFile[] {
    const files = this.db
      .listDriveFiles()
      .filter((file) => file.mime_type !== "application/vnd.google-apps.folder")
      .slice(0, Math.max(0, limit));
    return files
      .map((file) => this.buildRelatedDriveFile(file.file_id, "recent_file_fallback"))
      .filter((file): file is RelatedDriveFile => Boolean(file));
  }

  getRelatedFilesForTarget(
    targetType: string | undefined,
    targetId: string | undefined,
    options: { allowFallback?: boolean; fallbackLimit?: number; maxItems?: number } = {},
  ): RelatedDriveFile[] {
    if (!this.config.driveEnabled || !targetType || !targetId) {
      return [];
    }
    const maxItems = Math.max(1, options.maxItems ?? 5);
    const sourceType = this.mapTargetTypeToDriveSourceType(targetType);
    const explicit = sourceType ? this.listExplicitRelatedFiles(sourceType, targetId) : [];
    const sharedParent = sourceType
      ? this.listSharedParentRelatedFiles(sourceType, targetId, explicit, maxItems)
      : [];
    const combined: RelatedDriveFile[] = [];
    const seen = new Set<string>();
    for (const item of [...explicit, ...sharedParent]) {
      if (seen.has(item.file_id)) {
        continue;
      }
      seen.add(item.file_id);
      combined.push(item);
      if (combined.length >= maxItems) {
        return combined;
      }
    }
    if (!options.allowFallback) {
      return combined;
    }
    const fallback = this.listRecentDriveFiles(options.fallbackLimit ?? this.config.driveRecentDocsLimit);
    for (const item of fallback) {
      if (seen.has(item.file_id)) {
        continue;
      }
      seen.add(item.file_id);
      combined.push(item);
      if (combined.length >= maxItems) {
        break;
      }
    }
    return combined;
  }

  getRelatedDocsForTarget(
    targetType: string | undefined,
    targetId: string | undefined,
    options: { allowFallback?: boolean; fallbackLimit?: number } = {},
  ): RelatedDriveDoc[] {
    const relatedOptions: { allowFallback?: boolean; fallbackLimit?: number } = {};
    if (options.allowFallback !== undefined) {
      relatedOptions.allowFallback = options.allowFallback;
    }
    if (options.fallbackLimit !== undefined) {
      relatedOptions.fallbackLimit = options.fallbackLimit;
    }
    return this.getRelatedFilesForTarget(targetType, targetId, relatedOptions)
      .filter((file) => file.file_kind === "doc")
      .map((file) => ({
        file_id: file.file_id,
        title: file.title,
        web_view_link: file.web_view_link,
        snippet: file.snippet,
        mime_type: file.mime_type,
        match_type: file.match_type === "recent_file_fallback" ? "recent_doc_fallback" : file.match_type,
        source_type: file.source_type,
        source_id: file.source_id,
      }));
  }

  private mapTargetTypeToDriveSourceType(targetType: string): "calendar_event" | "task" | "draft" | null {
    if (targetType === "calendar_event") {
      return "calendar_event";
    }
    if (targetType === "task") {
      return "task";
    }
    if (targetType === "draft_artifact" || targetType === "draft") {
      return "draft";
    }
    return null;
  }

  private listExplicitRelatedDocs(sourceType: "calendar_event" | "task" | "draft", sourceId: string): RelatedDriveDoc[] {
    return this.listExplicitRelatedFiles(sourceType, sourceId)
      .filter((file) => file.file_kind === "doc")
      .map((file) => ({
        file_id: file.file_id,
        title: file.title,
        web_view_link: file.web_view_link,
        snippet: file.snippet,
        mime_type: file.mime_type,
        match_type: file.match_type,
        source_type: file.source_type,
        source_id: file.source_id,
      }));
  }

  private listExplicitRelatedFiles(sourceType: "calendar_event" | "task" | "draft", sourceId: string): RelatedDriveFile[] {
    const files: RelatedDriveFile[] = [];
    const seen = new Set<string>();
    for (const match of this.db.listDriveLinkProvenance(sourceType, sourceId)) {
      if (seen.has(match.file_id)) {
        continue;
      }
      const related = this.buildRelatedDriveFile(match.file_id, "explicit_link", match.source_type, match.source_id);
      if (!related) {
        continue;
      }
      seen.add(match.file_id);
      files.push(related);
    }
    return files;
  }

  private listSharedParentRelatedFiles(
    sourceType: "calendar_event" | "task" | "draft",
    sourceId: string,
    explicit: RelatedDriveFile[],
    maxItems: number,
  ): RelatedDriveFile[] {
    const explicitIds = new Set(explicit.map((item) => item.file_id));
    const parentIds = new Set<string>();
    for (const item of explicit) {
      const file = this.db.getDriveFile(item.file_id);
      for (const parent of file?.parents ?? []) {
        parentIds.add(parent);
      }
    }
    if (parentIds.size === 0) {
      return [];
    }
    return this.db
      .listDriveFiles()
      .filter((file) => {
        if (explicitIds.has(file.file_id) || file.mime_type === "application/vnd.google-apps.folder") {
          return false;
        }
        return file.parents.some((parent) => parentIds.has(parent));
      })
      .sort((left, right) => {
        const leftPriority = isGoogleDocMimeType(left.mime_type) || isGoogleSheetMimeType(left.mime_type) ? 0 : 1;
        const rightPriority = isGoogleDocMimeType(right.mime_type) || isGoogleSheetMimeType(right.mime_type) ? 0 : 1;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        const leftTime = Date.parse(left.drive_modified_time ?? left.updated_at);
        const rightTime = Date.parse(right.drive_modified_time ?? right.updated_at);
        return rightTime - leftTime || left.name.localeCompare(right.name);
      })
      .slice(0, Math.max(0, maxItems))
      .map((file) => this.buildRelatedDriveFile(file.file_id, "shared_parent_folder", sourceType, sourceId))
      .filter((file): file is RelatedDriveFile => Boolean(file));
  }

  private buildRelatedDriveFile(
    fileId: string,
    matchType: RelatedDriveFile["match_type"],
    sourceType?: RelatedDriveFile["source_type"],
    sourceId?: string,
  ): RelatedDriveFile | null {
    const file = this.db.getDriveFile(fileId);
    const doc = this.db.getDriveDoc(fileId);
    const sheet = this.db.getDriveSheet(fileId);
    if (!file && !doc && !sheet) {
      return null;
    }
    const mimeType = doc?.mime_type ?? sheet?.mime_type ?? file?.mime_type ?? "application/octet-stream";
    const fileKind: RelatedDriveFile["file_kind"] = doc
      ? "doc"
      : sheet
        ? "sheet"
        : "file";
    return {
      file_id: fileId,
      title: doc?.title ?? sheet?.title ?? file?.name ?? fileId,
      web_view_link: doc?.web_view_link ?? sheet?.web_view_link ?? file?.web_view_link,
      snippet: doc?.snippet ?? sheet?.snippet,
      mime_type: mimeType,
      file_kind: fileKind,
      match_type: matchType,
      source_type: sourceType,
      source_id: sourceId,
      tab_names: sheet?.tab_names,
      header_preview: sheet?.header_preview,
    };
  }

  private refreshDriveLinkProvenance(): void {
    if (!this.config.driveEnabled) {
      this.db.replaceDriveLinkProvenance([]);
      return;
    }
    const knownIds = new Set(this.db.listDriveFiles().map((file) => file.file_id));
    const discoveredAt = new Date().toISOString();
    const matches: Array<{
      source_type: "calendar_event" | "task" | "draft";
      source_id: string;
      file_id: string;
      match_type: "explicit_link";
      matched_url?: string | undefined;
      discovered_at: string;
    }> = [];
    const mailbox = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    const calendarEvents = mailbox ? this.db.listCalendarEvents({ account: mailbox, limit: 500 }) : [];
    for (const event of calendarEvents) {
      for (const match of this.extractDriveMatchesFromText(event.notes)) {
        if (!knownIds.has(match.fileId)) {
          continue;
        }
        matches.push({
          source_type: "calendar_event",
          source_id: event.event_id,
          file_id: match.fileId,
          match_type: "explicit_link",
          matched_url: match.url,
          discovered_at: discoveredAt,
        });
      }
    }
    for (const task of this.db.listTasks()) {
      for (const match of this.extractDriveMatchesFromText(task.notes)) {
        if (!knownIds.has(match.fileId)) {
          continue;
        }
        matches.push({
          source_type: "task",
          source_id: task.task_id,
          file_id: match.fileId,
          match_type: "explicit_link",
          matched_url: match.url,
          discovered_at: discoveredAt,
        });
      }
    }
    for (const draft of this.db.listDraftArtifacts()) {
      const combined = [draft.body_text, this.stripHtml(draft.body_html)].filter(Boolean).join("\n");
      for (const match of this.extractDriveMatchesFromText(combined)) {
        if (!knownIds.has(match.fileId)) {
          continue;
        }
        matches.push({
          source_type: "draft",
          source_id: draft.artifact_id,
          file_id: match.fileId,
          match_type: "explicit_link",
          matched_url: match.url,
          discovered_at: discoveredAt,
        });
      }
    }
    this.db.replaceDriveLinkProvenance(matches);
  }

  private stripHtml(value: string | undefined): string {
    if (!value) {
      return "";
    }
    return value.replace(/<[^>]+>/g, " ");
  }

  private extractDriveMatchesFromText(value: string | undefined): Array<{ fileId: string; url?: string }> {
    if (!value) {
      return [];
    }
    const matches: Array<{ fileId: string; url?: string }> = [];
    const seen = new Set<string>();
    const patterns = [
      /https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/g,
      /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/g,
      /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/g,
      /https:\/\/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/g,
      /https:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/g,
    ];
    for (const pattern of patterns) {
      for (const match of value.matchAll(pattern)) {
        const fileId = match[1]?.trim();
        if (!fileId || seen.has(fileId)) {
          continue;
        }
        seen.add(fileId);
        matches.push({ fileId, url: match[0] });
      }
    }
    return matches;
  }

  listUnreadInboxThreads(limit = DEFAULT_INBOX_LIMIT): InboxThreadSummary[] {
    return this.listInboxThreadSummaries(this.normalizeInboxLimit(limit), (summary) => summary.thread.unread_count > 0);
  }

  listFollowupThreads(limit = DEFAULT_INBOX_LIMIT): InboxThreadSummary[] {
    return this.listInboxThreadSummaries(
      this.normalizeInboxLimit(limit),
      (summary) => summary.derived_kind === "stale_followup",
      (left, right) => Number(left.thread.last_message_at) - Number(right.thread.last_message_at),
    );
  }

  listNeedsReplyThreads(limit = DEFAULT_INBOX_LIMIT): InboxThreadSummary[] {
    return this.listInboxThreadSummaries(
      this.normalizeInboxLimit(limit),
      (summary) => summary.last_direction === "inbound" && summary.thread.in_inbox,
    );
  }

  listRecentThreads(limit = DEFAULT_INBOX_LIMIT): InboxThreadSummary[] {
    const cutoff = Date.now() - RECENT_ACTIVITY_HOURS * 60 * 60 * 1000;
    return this.listInboxThreadSummaries(
      this.normalizeInboxLimit(limit),
      (summary) => Number(summary.thread.last_message_at) >= cutoff,
    );
  }

  getInboxThreadDetail(threadId: string): MailThreadDetail {
    const thread = this.db.getMailThread(threadId);
    if (!thread) {
      throw new Error(`Mailbox thread ${threadId} was not found.`);
    }
    const summary = this.buildInboxThreadSummary(thread);
    return {
      thread,
      messages: this.db.listMailMessagesByThread(threadId),
      derived_kind: summary.derived_kind,
      last_direction: summary.last_direction,
      suggested_next_command: this.suggestedInboxCommand(summary),
    };
  }

  enableSendWindow(identity: ClientIdentity, minutes: number, reason: string): SendWindow {
    this.assertOperatorOnly(identity, "enable a send window");
    this.assertRequiredNote(reason, "enable this send window");
    this.normalizeRuntimeState();
    const normalizedMinutes = this.normalizeSendWindowMinutes(minutes);
    const activeWindow = this.db.getActiveSendWindow();
    if (activeWindow) {
      throw new Error(`Send window ${activeWindow.window_id} is already active until ${activeWindow.expires_at}.`);
    }
    this.db.registerClient(identity);
    const expiresAt = new Date(Date.now() + normalizedMinutes * 60 * 1000).toISOString();
    const window = this.db.createSendWindow(identity, expiresAt, reason.trim());
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "send_window_enable",
      target_type: "send_window",
      target_id: window.window_id,
      outcome: "success",
      metadata: {
        expires_at: expiresAt,
        reason: reason.trim(),
        minutes: normalizedMinutes,
      },
    });
    return window;
  }

  disableSendWindow(identity: ClientIdentity, reason: string): SendWindow {
    this.assertOperatorOnly(identity, "disable a send window");
    this.assertRequiredNote(reason, "disable this send window");
    this.db.registerClient(identity);
    this.normalizeRuntimeState();
    const activeWindow = this.db.getActiveSendWindow();
    if (!activeWindow) {
      throw new Error("No active send window exists.");
    }
    const disabledAt = new Date().toISOString();
    const updated = this.db.updateSendWindow(activeWindow.window_id, {
      state: "disabled",
      disabled_at: disabledAt,
      disabled_by_client: identity.client_id,
      disabled_by_actor: identity.requested_by ?? null,
      disable_reason: reason.trim(),
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "send_window_disable",
      target_type: "send_window",
      target_id: activeWindow.window_id,
      outcome: "success",
      metadata: {
        disabled_at: disabledAt,
        reason: reason.trim(),
      },
    });
    return updated!;
  }

  listTasks(options: { state?: TaskItem["state"] | undefined; include_history?: boolean | undefined } = {}): TaskItem[] {
    return this.db.listTasks({
      state: options.state,
      activeOnly: !options.include_history && !options.state,
    });
  }

  getTaskDetail(taskId: string): TaskDetail {
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return {
      task,
      related_audit_events: this.getRelatedAuditEvents(taskId),
    };
  }

  createTask(
    identity: ClientIdentity,
    input: {
      title: string;
      notes?: string | undefined;
      kind: TaskItem["kind"];
      priority: TaskItem["priority"];
      owner: TaskItem["owner"];
      due_at?: string | undefined;
      remind_at?: string | undefined;
    },
  ): TaskItem {
    this.assertOperatorOnly(identity, "create a committed task");
    if (!input.title.trim()) {
      throw new Error("Task title is required.");
    }
    this.db.registerClient(identity);
    const task = this.db.createTask(identity, {
      title: input.title.trim(),
      notes: input.notes?.trim() || undefined,
      kind: input.kind,
      priority: input.priority,
      owner: input.owner,
      due_at: input.due_at ?? null,
      remind_at: input.remind_at ?? null,
      source: "manual",
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_create",
      target_type: "task",
      target_id: task.task_id,
      outcome: "success",
      metadata: {
        title: task.title,
        owner: task.owner,
        kind: task.kind,
        priority: task.priority,
      },
    });
    this.refreshPlanningRecommendationsInternal(identity);
    return task;
  }

  updateTask(
    identity: ClientIdentity,
    taskId: string,
    updates: {
      title?: string | undefined;
      notes?: string | undefined;
      kind?: TaskItem["kind"] | undefined;
      priority?: TaskItem["priority"] | undefined;
      owner?: TaskItem["owner"] | undefined;
      due_at?: string | null | undefined;
      remind_at?: string | null | undefined;
    },
  ): TaskItem {
    this.assertOperatorOnly(identity, "update this task");
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    if (!["pending", "in_progress"].includes(task.state)) {
      throw new Error(`Task ${taskId} cannot be updated from state ${task.state}.`);
    }
    this.db.registerClient(identity);
    const updated = this.db.updateTask(taskId, {
      title: updates.title?.trim(),
      notes: updates.notes === undefined ? undefined : updates.notes?.trim() || null,
      kind: updates.kind,
      priority: updates.priority,
      owner: updates.owner,
      due_at: updates.due_at === undefined ? undefined : updates.due_at,
      remind_at: updates.remind_at === undefined ? undefined : updates.remind_at,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_update",
      target_type: "task",
      target_id: taskId,
      outcome: "success",
      metadata: {
        changes: Object.keys(updates),
      },
    });
    this.refreshPlanningRecommendationsInternal(identity);
    return updated!;
  }

  startTask(identity: ClientIdentity, taskId: string): TaskItem {
    this.assertOperatorOnly(identity, "start this task");
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    if (task.state !== "pending") {
      throw new Error(`Task ${taskId} cannot be started from state ${task.state}.`);
    }
    this.db.registerClient(identity);
    const updated = this.db.updateTask(taskId, { state: "in_progress", completed_at: null, canceled_at: null });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_start",
      target_type: "task",
      target_id: taskId,
      outcome: "success",
      metadata: {},
    });
    this.refreshPlanningRecommendationsInternal(identity);
    return updated!;
  }

  completeTask(identity: ClientIdentity, taskId: string, note: string): TaskItem {
    this.assertOperatorOnly(identity, "complete this task");
    this.assertRequiredNote(note, "complete");
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    if (!["pending", "in_progress"].includes(task.state)) {
      throw new Error(`Task ${taskId} cannot be completed from state ${task.state}.`);
    }
    this.db.registerClient(identity);
    const updated = this.db.updateTask(taskId, {
      state: "completed",
      decision_note: note.trim(),
      completed_at: new Date().toISOString(),
      canceled_at: null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_complete",
      target_type: "task",
      target_id: taskId,
      outcome: "success",
      metadata: {
        note: note.trim(),
      },
    });
    this.updateRecommendationOutcomeFromTask(updated!, "completed", note.trim(), identity.client_id, identity.requested_by);
    this.refreshPlanningRecommendationsInternal(identity);
    return updated!;
  }

  cancelTask(identity: ClientIdentity, taskId: string, note: string): TaskItem {
    this.assertOperatorOnly(identity, "cancel this task");
    this.assertRequiredNote(note, "cancel");
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    if (!["pending", "in_progress"].includes(task.state)) {
      throw new Error(`Task ${taskId} cannot be canceled from state ${task.state}.`);
    }
    this.db.registerClient(identity);
    const updated = this.db.updateTask(taskId, {
      state: "canceled",
      decision_note: note.trim(),
      canceled_at: new Date().toISOString(),
      completed_at: null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_cancel",
      target_type: "task",
      target_id: taskId,
      outcome: "success",
      metadata: {
        note: note.trim(),
      },
    });
    this.updateRecommendationOutcomeFromTask(updated!, "canceled", note.trim(), identity.client_id, identity.requested_by);
    this.refreshPlanningRecommendationsInternal(identity);
    return updated!;
  }

  snoozeTask(identity: ClientIdentity, taskId: string, until: string, note: string): TaskItem {
    this.assertOperatorOnly(identity, "snooze this task");
    this.assertRequiredNote(note, "snooze");
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }
    if (!["pending", "in_progress"].includes(task.state)) {
      throw new Error(`Task ${taskId} cannot be snoozed from state ${task.state}.`);
    }
    const updated = this.db.updateTask(taskId, {
      remind_at: until,
      decision_note: note.trim(),
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_snooze",
      target_type: "task",
      target_id: taskId,
      outcome: "success",
      metadata: {
        until,
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationsInternal(identity);
    return updated!;
  }

  listDueTasks(): TaskItem[] {
    const threshold = new Date(Date.now() + TASK_DUE_SOON_HOURS * 60 * 60 * 1000).toISOString();
    return this.db.listTasks({ dueBefore: threshold }).sort((left, right) => {
      const leftDue = left.due_at ? Date.parse(left.due_at) : Number.POSITIVE_INFINITY;
      const rightDue = right.due_at ? Date.parse(right.due_at) : Number.POSITIVE_INFINITY;
      return leftDue - rightDue;
    });
  }

  listOverdueTasks(): TaskItem[] {
    const now = new Date().toISOString();
    return this.db.listTasks({ overdueBefore: now }).sort((left, right) => {
      const leftDue = left.due_at ? Date.parse(left.due_at) : Number.POSITIVE_INFINITY;
      const rightDue = right.due_at ? Date.parse(right.due_at) : Number.POSITIVE_INFINITY;
      return leftDue - rightDue;
    });
  }

  listTaskSuggestions(options: { status?: TaskSuggestion["status"] | undefined; include_resolved?: boolean | undefined } = {}): TaskSuggestion[] {
    if (options.status !== undefined) {
      return this.db.listTaskSuggestions({ status: options.status });
    }
    return options.include_resolved ? this.db.listTaskSuggestions() : this.db.listTaskSuggestions({ status: "pending" });
  }

  pruneTaskHistory(
    identity: ClientIdentity,
    olderThanDays: number,
    states: Array<"completed" | "canceled"> = ["completed", "canceled"],
  ): { removed_count: number; older_than_days: number; states: string[] } {
    this.assertOperatorOnly(identity, "prune task history");
    if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
      throw new Error("olderThanDays must be zero or greater.");
    }
    this.db.registerClient(identity);
    const cutoffIso = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const removed = this.db.pruneTasks(states, cutoffIso);
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_prune",
      target_type: "task",
      target_id: "history-prune",
      outcome: "success",
      metadata: {
        removed_count: removed,
        older_than_days: olderThanDays,
        states,
      },
    });
    return { removed_count: removed, older_than_days: olderThanDays, states };
  }

  pruneTaskSuggestionHistory(
    identity: ClientIdentity,
    olderThanDays: number,
    statuses: Array<"accepted" | "rejected"> = ["accepted", "rejected"],
  ): { removed_count: number; older_than_days: number; statuses: string[] } {
    this.assertOperatorOnly(identity, "prune task suggestion history");
    if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
      throw new Error("olderThanDays must be zero or greater.");
    }
    this.db.registerClient(identity);
    const cutoffIso = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const removed = this.db.pruneTaskSuggestions(statuses, cutoffIso);
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_suggestion_prune",
      target_type: "task_suggestion",
      target_id: "history-prune",
      outcome: "success",
      metadata: {
        removed_count: removed,
        older_than_days: olderThanDays,
        statuses,
      },
    });
    return { removed_count: removed, older_than_days: olderThanDays, statuses };
  }

  getTaskSuggestionDetail(suggestionId: string): TaskSuggestionDetail {
    const suggestion = this.db.getTaskSuggestion(suggestionId);
    if (!suggestion) {
      throw new Error(`Task suggestion ${suggestionId} was not found.`);
    }
    return {
      suggestion,
      accepted_task: suggestion.accepted_task_id ? this.db.getTask(suggestion.accepted_task_id) ?? undefined : undefined,
      related_audit_events: this.getRelatedAuditEvents(suggestionId, suggestion.accepted_task_id),
    };
  }

  createTaskSuggestion(
    identity: ClientIdentity,
    input: {
      title: string;
      notes?: string | undefined;
      kind: TaskItem["kind"];
      priority: TaskItem["priority"];
      due_at?: string | undefined;
      remind_at?: string | undefined;
    },
  ): TaskSuggestion {
    if (!input.title.trim()) {
      throw new Error("Task suggestion title is required.");
    }
    this.db.registerClient(identity);
    const suggestion = this.db.createTaskSuggestion(identity, {
      title: input.title.trim(),
      notes: input.notes?.trim() || undefined,
      kind: input.kind,
      priority: input.priority,
      due_at: input.due_at ?? null,
      remind_at: input.remind_at ?? null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_suggestion_create",
      target_type: "task_suggestion",
      target_id: suggestion.suggestion_id,
      outcome: "success",
      metadata: {
        title: suggestion.title,
        kind: suggestion.kind,
        priority: suggestion.priority,
      },
    });
    return suggestion;
  }

  acceptTaskSuggestion(identity: ClientIdentity, suggestionId: string, note: string): TaskSuggestionDetail {
    this.assertOperatorOnly(identity, "accept this task suggestion");
    this.assertRequiredNote(note, "accept");
    const suggestion = this.db.getTaskSuggestion(suggestionId);
    if (!suggestion) {
      throw new Error(`Task suggestion ${suggestionId} was not found.`);
    }
    if (suggestion.status !== "pending") {
      throw new Error(`Task suggestion ${suggestionId} cannot be accepted from status ${suggestion.status}.`);
    }
    this.db.registerClient(identity);
    const task = this.db.createTask(identity, {
      title: suggestion.title,
      notes: suggestion.notes,
      kind: suggestion.kind,
      priority: suggestion.priority,
      owner: "operator",
      due_at: suggestion.due_at ?? null,
      remind_at: suggestion.remind_at ?? null,
      source: "accepted_suggestion",
      source_suggestion_id: suggestion.suggestion_id,
      decision_note: note.trim(),
    });
    this.db.updateTaskSuggestion(suggestionId, {
      status: "accepted",
      accepted_task_id: task.task_id,
      decision_note: note.trim(),
      resolved_at: new Date().toISOString(),
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_suggestion_accept",
      target_type: "task_suggestion",
      target_id: suggestionId,
      outcome: "success",
      metadata: {
        task_id: task.task_id,
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationsInternal(identity);
    return this.getTaskSuggestionDetail(suggestionId);
  }

  rejectTaskSuggestion(identity: ClientIdentity, suggestionId: string, note: string): TaskSuggestionDetail {
    this.assertOperatorOnly(identity, "reject this task suggestion");
    this.assertRequiredNote(note, "reject");
    const suggestion = this.db.getTaskSuggestion(suggestionId);
    if (!suggestion) {
      throw new Error(`Task suggestion ${suggestionId} was not found.`);
    }
    if (suggestion.status !== "pending") {
      throw new Error(`Task suggestion ${suggestionId} cannot be rejected from status ${suggestion.status}.`);
    }
    this.db.registerClient(identity);
    this.db.updateTaskSuggestion(suggestionId, {
      status: "rejected",
      decision_note: note.trim(),
      resolved_at: new Date().toISOString(),
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_suggestion_reject",
      target_type: "task_suggestion",
      target_id: suggestionId,
      outcome: "success",
      metadata: {
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationsInternal(identity);
    return this.getTaskSuggestionDetail(suggestionId);
  }

  listPlanningRecommendations(
    options: {
      status?: PlanningRecommendationStatus | undefined;
      kind?: PlanningRecommendationKind | undefined;
      include_resolved?: boolean | undefined;
    } = {},
  ): PlanningRecommendation[] {
    return this.db.listPlanningRecommendations({
      status: options.status,
      kind: options.kind,
      include_resolved: options.include_resolved,
    });
  }

  listPlanningRecommendationGroups(
    options: {
      status?: PlanningRecommendationStatus | undefined;
      kind?: PlanningRecommendationKind | undefined;
      include_resolved?: boolean | undefined;
    } = {},
  ): PlanningRecommendationGroup[] {
    return this.groupPlanningRecommendations(this.listPlanningRecommendations(options));
  }

  getPlanningRecommendationGroupDetail(groupKey: string): PlanningRecommendationGroupDetail {
    const recommendations = this.db
      .listPlanningRecommendations({ include_resolved: true })
      .filter((recommendation) => recommendation.group_key === groupKey);
    if (recommendations.length === 0) {
      throw new Error(`Planning recommendation group ${groupKey} was not found.`);
    }
    return this.buildPlanningRecommendationGroupDetail(groupKey, recommendations);
  }

  getNextPlanningRecommendationDetail(
    groupKey?: string,
    options: PlanningRecommendationReadOptions = {},
  ): PlanningRecommendationDetail | null {
    const recommendations = this.db
      .listPlanningRecommendations({ include_resolved: false })
      .filter((recommendation) => recommendation.status === "pending")
      .filter((recommendation) => !groupKey || recommendation.group_key === groupKey)
      .sort((left, right) => this.compareNextActionableRecommendations(left, right));
    const next = recommendations[0];
    return next ? this.getPlanningRecommendationDetail(next.recommendation_id, options) : null;
  }

  getPlanningRecommendationSummaryReport(): PlanningRecommendationSummaryReport {
    const analytics = this.computePlanningAnalytics();
    return analytics.summary;
  }

  getPlanningRecommendationBacklogReport(
    filters: string | PlanningRecommendationBacklogFilters = {},
  ): PlanningRecommendationBacklogReport {
    const normalizedFilters = this.normalizePlanningBacklogFilters(filters);
    return this.computePlanningAnalytics(PLANNING_CLOSED_RECENT_DAYS_LONG, normalizedFilters).backlog;
  }

  getPlanningRecommendationClosureReport(
    filters: number | PlanningRecommendationClosureFilterInput = PLANNING_CLOSED_RECENT_DAYS_LONG,
  ): PlanningRecommendationClosureReport {
    const normalizedFilters = this.normalizePlanningClosureFilters(filters);
    return this.computePlanningAnalytics(normalizedFilters.days, {}, normalizedFilters).closure;
  }

  getPlanningRecommendationHygieneReport(
    filters: PlanningRecommendationHygieneFilterInput = {},
    options: PlanningRecommendationReadOptions = {},
  ): PlanningRecommendationHygieneReport {
    const normalizedFilters = this.normalizePlanningHygieneFilters(filters);
    const report = this.computePlanningAnalytics(
      PLANNING_CLOSED_RECENT_DAYS_LONG,
      {},
      { days: PLANNING_CLOSED_RECENT_DAYS_LONG },
      normalizedFilters,
    ).hygiene;
    return this.shapePlanningRecommendationHygieneReport(report, options);
  }

  getPlanningRecommendationTuningReport(
    options: PlanningRecommendationReadOptions = {},
  ): PlanningRecommendationTuningReport {
    const report = this.computePlanningAnalytics().tuning;
    return this.shapePlanningRecommendationTuningReport(report, options);
  }

  getPlanningRecommendationPolicyReport(identity: ClientIdentity): PlanningRecommendationPolicyReport {
    this.assertOperatorOnly(identity, "read planning policy governance");
    const report = this.buildPlanningPolicyReport();
    this.db.registerClient(identity);
    return report;
  }

  reviewPlanningRecommendationHygiene(
    identity: ClientIdentity,
    input: PlanningRecommendationHygieneReviewInput,
  ): PlanningRecommendationHygieneFamilyReport {
    this.assertOperatorOnly(identity, "review this planning hygiene family");
    const report = this.getPlanningRecommendationHygieneReport({
      group: input.group,
      kind: input.kind,
      source: input.source,
    });
    const family = report.families.find(
      (item) => item.group_key === input.group && item.kind === input.kind && item.source === input.source,
    );
    if (!family) {
      throw new Error("The requested planning hygiene family was not found.");
    }
    if (!["review_externalized_workflow", "review_source_suppression"].includes(family.recommended_action)) {
      throw new Error("Only current planning hygiene candidates can be reviewed.");
    }
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_hygiene_review",
      target_type: "planning_recommendation_family",
      target_id: this.getPlanningRecommendationFamilyAuditTargetId(family.group_key, family.kind, family.source),
      outcome: "success",
      metadata: {
        group_key: family.group_key,
        group_kind: family.group_kind,
        kind: family.kind,
        source: family.source,
        decision: input.decision,
        note: input.note?.trim() || null,
        reviewed_by_actor: identity.requested_by ?? null,
        recommended_action_at_review: family.recommended_action,
        closure_signal_at_review: family.closure_signal,
        queue_share_pct_at_review: family.queue_share_pct,
      },
    });
    const updated = this.getPlanningRecommendationHygieneReport({
      group: input.group,
      kind: input.kind,
      source: input.source,
    }).families.find((item) => item.group_key === input.group && item.kind === input.kind && item.source === input.source);
    if (!updated) {
      throw new Error("The reviewed planning hygiene family could not be reloaded.");
    }
    return updated;
  }

  recordPlanningRecommendationHygieneProposal(
    identity: ClientIdentity,
    input: PlanningRecommendationHygieneProposalInput,
  ): PlanningRecommendationHygieneFamilyReport {
    return this.upsertPlanningRecommendationHygieneProposal(identity, input, "proposed");
  }

  dismissPlanningRecommendationHygieneProposal(
    identity: ClientIdentity,
    input: PlanningRecommendationHygieneProposalInput,
  ): PlanningRecommendationHygieneFamilyReport {
    return this.upsertPlanningRecommendationHygieneProposal(identity, input, "dismissed");
  }

  archivePlanningRecommendationPolicy(
    identity: ClientIdentity,
    input: PlanningRecommendationPolicyGovernanceInput,
  ): PlanningRecommendationPolicyHistoryItem {
    return this.recordPlanningRecommendationPolicyGovernance(identity, input, "policy_archived");
  }

  supersedePlanningRecommendationPolicy(
    identity: ClientIdentity,
    input: PlanningRecommendationPolicyGovernanceInput,
  ): PlanningRecommendationPolicyHistoryItem {
    return this.recordPlanningRecommendationPolicyGovernance(identity, input, "policy_superseded");
  }

  prunePlanningRecommendationPolicyHistory(
    identity: ClientIdentity,
    input: PlanningRecommendationPolicyPruneInput,
  ): PlanningRecommendationPolicyPruneResult {
    this.assertOperatorOnly(identity, "prune planning policy history");
    if (!Number.isFinite(input.older_than_days) || input.older_than_days < 0) {
      throw new Error("older_than_days must be zero or greater.");
    }
    const eventType = input.event_type ?? "all";
    const eventTypes = this.resolvePlanningPolicyPruneEventTypes(eventType);
    const cutoffIso = new Date(Date.now() - input.older_than_days * 24 * 60 * 60 * 1000).toISOString();
    const familyStats = this.listPlanningRecommendationFamilyStats();
    const candidates = this.db
      .listPlanningHygienePolicyGovernanceEventsBefore(cutoffIso, eventTypes)
      .map((event) => this.toPlanningPolicyRetentionItem(event, familyStats))
      .sort((left, right) => this.comparePlanningPolicyRetentionItems(left, right));
    const dryRun = Boolean(input.dry_run);
    const prunedCount = dryRun ? 0 : this.db.prunePlanningHygienePolicyGovernanceEventsBefore(cutoffIso, eventTypes);
    this.db.registerClient(identity);
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_policy_prune",
      target_type: "planning_recommendation_policy_history",
      target_id: eventType,
      outcome: "success",
      metadata: {
        older_than_days: input.older_than_days,
        event_type: eventType,
        dry_run: dryRun,
        candidate_count: candidates.length,
        pruned_count: prunedCount,
      },
    });
    return {
      dry_run: dryRun,
      older_than_days: input.older_than_days,
      event_type: eventType,
      candidate_count: candidates.length,
      pruned_count: prunedCount,
      candidates: candidates.slice(0, 10),
    };
  }

  private upsertPlanningRecommendationHygieneProposal(
    identity: ClientIdentity,
    input: PlanningRecommendationHygieneProposalInput,
    status: PlanningHygienePolicyProposalStatus,
  ): PlanningRecommendationHygieneFamilyReport {
    this.assertOperatorOnly(identity, "update this planning hygiene proposal");
    const report = this.getPlanningRecommendationHygieneReport({
      group: input.group,
      kind: input.kind,
      source: input.source,
    });
    const family = report.families.find(
      (item) => item.group_key === input.group && item.kind === input.kind && item.source === input.source,
    );
    if (!family) {
      throw new Error("The requested planning hygiene family was not found.");
    }
    if (!this.isPlanningHygieneCandidateAction(family.recommended_action)) {
      throw new Error("Only current planning hygiene candidates can have policy proposals.");
    }
    if (!family.last_review_at || family.review_needed) {
      throw new Error("A current operator hygiene review is required before updating a policy proposal.");
    }
    const proposalType = this.derivePlanningHygieneProposalType(family.recommended_action);
    if (!proposalType) {
      throw new Error("The requested planning hygiene family does not map to a proposal type.");
    }
    const proposal = this.db.upsertPlanningHygienePolicyProposal(identity, {
      group_key: family.group_key,
      kind: family.kind,
      source: family.source,
      proposal_type: proposalType,
      status,
      basis_signal_updated_at: family.signal_updated_at ?? null,
      note: input.note?.trim() ? input.note.trim() : null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action:
        status === "proposed"
          ? "planning_recommendation_hygiene_proposal_recorded"
          : "planning_recommendation_hygiene_proposal_dismissed",
      target_type: "planning_recommendation_family",
      target_id: this.getPlanningRecommendationFamilyAuditTargetId(family.group_key, family.kind, family.source),
      outcome: "success",
      metadata: {
        group_key: family.group_key,
        group_kind: family.group_kind,
        kind: family.kind,
        source: family.source,
        proposal_id: proposal.proposal_id,
        proposal_type: proposal.proposal_type,
        status: proposal.status,
        note: proposal.note ?? null,
        basis_signal_updated_at: proposal.basis_signal_updated_at,
        updated_by_actor: identity.requested_by ?? null,
      },
    });
    const updated = this.getPlanningRecommendationHygieneReport({
      group: input.group,
      kind: input.kind,
      source: input.source,
    }).families.find((item) => item.group_key === input.group && item.kind === input.kind && item.source === input.source);
    if (!updated) {
      throw new Error("The updated planning hygiene family could not be reloaded.");
    }
    return updated;
  }

  private recordPlanningRecommendationPolicyGovernance(
    identity: ClientIdentity,
    input: PlanningRecommendationPolicyGovernanceInput,
    eventType: PlanningHygienePolicyGovernanceEventType,
  ): PlanningRecommendationPolicyHistoryItem {
    this.assertOperatorOnly(identity, "update planning policy governance");
    if (eventType === "policy_superseded") {
      this.assertRequiredNote(input.note ?? "", "supersede this planning policy");
    }
    const familyStats = this.listPlanningRecommendationFamilyStats();
    const family = familyStats.find(
      (item) => item.group_key === input.group && item.kind === input.kind && item.source === input.source,
    );
    if (!family) {
      throw new Error("The requested planning policy family was not found.");
    }
    if (family.open_count > 0) {
      throw new Error("Only inactive planning policy families can be archived or superseded.");
    }
    const proposal = this.db.getPlanningHygienePolicyProposal(input.group, input.kind, input.source);
    if (!proposal) {
      throw new Error("An explicit planning hygiene proposal is required before policy governance can be updated.");
    }
    const governanceEvent = this.db.createPlanningHygienePolicyGovernanceEvent(identity, {
      proposal_id: proposal.proposal_id,
      group_key: family.group_key,
      kind: family.kind,
      source: family.source,
      event_type: eventType,
      basis_signal_updated_at: family.signal_updated_at ?? proposal.basis_signal_updated_at ?? null,
      follow_through_state_snapshot: family.follow_through_state,
      proposal_status_snapshot: family.proposal_status,
      note: input.note?.trim() ? input.note.trim() : null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action:
        eventType === "policy_archived"
          ? "planning_recommendation_policy_archived"
          : "planning_recommendation_policy_superseded",
      target_type: "planning_recommendation_family",
      target_id: this.getPlanningRecommendationFamilyAuditTargetId(family.group_key, family.kind, family.source),
      outcome: "success",
      metadata: {
        governance_event_id: governanceEvent.governance_event_id,
        proposal_id: proposal.proposal_id,
        group_key: family.group_key,
        group_kind: family.group_kind,
        kind: family.kind,
        source: family.source,
        event_type: governanceEvent.event_type,
        proposal_status_snapshot: governanceEvent.proposal_status_snapshot,
        follow_through_state_snapshot: governanceEvent.follow_through_state_snapshot,
        basis_signal_updated_at: governanceEvent.basis_signal_updated_at,
        note: governanceEvent.note ?? null,
        recorded_by_actor: identity.requested_by ?? null,
      },
    });
    return this.toPlanningPolicyHistoryItem(family, proposal, governanceEvent);
  }

  getPlanningRecommendationDetail(
    recommendationId: string,
    options: PlanningRecommendationReadOptions = {},
  ): PlanningRecommendationDetail {
    const recommendation = this.db.getPlanningRecommendation(recommendationId);
    if (!recommendation) {
      throw new Error(`Planning recommendation ${recommendationId} was not found.`);
    }
    const appliedTask = recommendation.applied_task_id ? this.db.getTask(recommendation.applied_task_id) ?? undefined : undefined;
    const detail = {
      recommendation,
      task: recommendation.source_task_id ? this.db.getTask(recommendation.source_task_id) ?? undefined : undefined,
      thread: recommendation.source_thread_id ? this.db.getMailThread(recommendation.source_thread_id) ?? undefined : undefined,
      event: recommendation.source_calendar_event_id
        ? this.db.getCalendarEvent(recommendation.source_calendar_event_id) ?? undefined
        : undefined,
      applied_task: appliedTask,
      applied_event: recommendation.applied_calendar_event_id
        ? this.db.getCalendarEvent(recommendation.applied_calendar_event_id) ?? undefined
        : undefined,
      ranking_reason: recommendation.rank_reason,
      slot_reason: recommendation.slot_reason,
      trigger_signals: recommendation.trigger_signals,
      suppressed_signals: recommendation.suppressed_signals,
      source_resolved_since_created: recommendation.outcome_state === "source_resolved",
      applied_task_current_state: appliedTask?.state,
      related_audit_events: this.getRelatedAuditEvents(
        recommendationId,
        this.getPlanningRecommendationFamilyAuditTargetId(
          recommendation.group_key ?? "urgent_unscheduled_tasks",
          recommendation.kind,
          recommendation.source,
        ),
        recommendation.source_task_id,
        recommendation.source_thread_id,
        recommendation.source_calendar_event_id,
        recommendation.applied_task_id,
        recommendation.applied_calendar_event_id,
      ),
    };
    return this.shapePlanningRecommendationDetail(detail, options);
  }

  createPlanningRecommendation(
    identity: ClientIdentity,
    input: {
      kind: PlanningRecommendationKind;
      task_id: string;
      start_at: string;
      end_at: string;
      calendar_id?: string | undefined;
      title?: string | undefined;
      notes?: string | undefined;
      priority?: TaskItem["priority"] | undefined;
    },
  ): PlanningRecommendationDetail {
    if (input.kind !== "schedule_task_block") {
      throw new Error("Assistants may only create schedule_task_block recommendations in Phase 9.");
    }
    const task = this.db.getTask(input.task_id);
    if (!task) {
      throw new Error(`Task ${input.task_id} was not found.`);
    }
    if (!["pending", "in_progress"].includes(task.state)) {
      throw new Error(`Task ${task.task_id} cannot be recommended from state ${task.state}.`);
    }
    if (task.scheduled_calendar_event_id) {
      throw new Error(`Task ${task.task_id} already has a scheduled calendar event.`);
    }
    const { startAt, endAt } = this.assertTimedCalendarRange(input.start_at, input.end_at);
    if (!this.isTimeRangeUsable(startAt, endAt, undefined)) {
      throw new Error("The proposed planning window conflicts with the current shared calendar state.");
    }
    this.db.registerClient(identity);
    const candidate: PlanningRecommendationCandidate = {
      kind: "schedule_task_block",
      priority: input.priority ?? task.priority,
      source_task_id: task.task_id,
      proposed_calendar_id: input.calendar_id,
      proposed_start_at: startAt,
      proposed_end_at: endAt,
      proposed_title: String(input.title ?? task.title).trim() || task.title,
      proposed_notes: input.notes?.trim() || task.notes,
      reason_code: "assistant_requested",
      reason_summary: `Assistant suggested a task block for ${task.title}.`,
      dedupe_key: this.makeRecommendationDedupeKey("schedule_task_block", { task_id: task.task_id }),
      source_fingerprint: this.makeTaskRecommendationFingerprint(task),
      source_last_seen_at: task.updated_at,
      slot_state: "ready",
      slot_reason: "assistant_requested_slot",
      trigger_signals: ["assistant_requested", "task_active", "task_unscheduled"],
      suppressed_signals: ["task_unscheduled_due_soon"],
      group_kind: "urgent_unscheduled_tasks",
    };
    const recommendation = this.upsertPlanningRecommendation(identity, {
      ...candidate,
      source: "assistant_created",
    });
    this.refreshPlanningRecommendationReadModel();
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_create",
      target_type: "planning_recommendation",
      target_id: recommendation.recommendation_id,
      outcome: "success",
      metadata: {
        kind: recommendation.kind,
        source: recommendation.source,
        task_id: task.task_id,
      },
    });
    return this.getPlanningRecommendationDetail(recommendation.recommendation_id);
  }

  replanPlanningRecommendation(identity: ClientIdentity, recommendationId: string, note: string): PlanningRecommendationDetail {
    this.assertOperatorOnly(identity, "replan this planning recommendation");
    this.assertRequiredNote(note, "replan");
    this.db.registerClient(identity);
    const recommendation = this.db.getPlanningRecommendation(recommendationId);
    if (!recommendation) {
      throw new Error(`Planning recommendation ${recommendationId} was not found.`);
    }
    if (!["pending", "snoozed"].includes(recommendation.status)) {
      throw new Error(
        `Planning recommendation ${recommendation.recommendation_id} cannot be replanned from status ${recommendation.status}.`,
      );
    }
    const replanned = this.replanRecommendation(identity, recommendation, note.trim());
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_replan",
      target_type: "planning_recommendation",
      target_id: recommendationId,
      outcome: "success",
      metadata: {
        kind: replanned.recommendation.kind,
        note: note.trim(),
        proposed_start_at: replanned.recommendation.proposed_start_at ?? null,
        proposed_end_at: replanned.recommendation.proposed_end_at ?? null,
      },
    });
    return replanned;
  }

  refreshPlanningRecommendations(identity: ClientIdentity): {
    refreshed_count: number;
    pending_count: number;
    superseded_count: number;
    expired_count: number;
  } {
    this.assertOperatorOnly(identity, "refresh planning recommendations");
    this.db.registerClient(identity);
    const result = this.refreshPlanningRecommendationsInternal(identity);
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_refresh",
      target_type: "planning_recommendation",
      target_id: "queue",
      outcome: "success",
      metadata: result,
    });
    return result;
  }

  async applyPlanningRecommendation(
    identity: ClientIdentity,
    recommendationId: string,
    note: string,
  ): Promise<PlanningRecommendationDetail> {
    this.assertOperatorOnly(identity, "apply this planning recommendation");
    this.assertRequiredNote(note, "apply");
    this.db.registerClient(identity);
    const recommendation = this.db.getPlanningRecommendation(recommendationId);
    if (!recommendation) {
      throw new Error(`Planning recommendation ${recommendationId} was not found.`);
    }
    if (!["pending", "snoozed"].includes(recommendation.status)) {
      throw new Error(
        `Planning recommendation ${recommendation.recommendation_id} cannot be applied from status ${recommendation.status}.`,
      );
    }

    if (recommendation.kind === "schedule_task_block") {
      await this.applyTaskBlockRecommendation(identity, recommendation, note.trim());
    } else if (recommendation.kind === "schedule_thread_followup") {
      await this.applyThreadFollowupRecommendation(identity, recommendation, note.trim());
    } else {
      await this.applyEventPrepRecommendation(identity, recommendation, note.trim());
    }

    const refreshed = this.getPlanningRecommendationDetail(recommendationId);
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_apply",
      target_type: "planning_recommendation",
      target_id: recommendationId,
      outcome: "success",
      metadata: {
        kind: refreshed.recommendation.kind,
        applied_task_id: refreshed.recommendation.applied_task_id ?? null,
        applied_calendar_event_id: refreshed.recommendation.applied_calendar_event_id ?? null,
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationsInternal(identity);
    return this.getPlanningRecommendationDetail(recommendationId);
  }

  rejectPlanningRecommendation(
    identity: ClientIdentity,
    recommendationId: string,
    note: string,
    reasonCode?: string,
  ): PlanningRecommendationDetail {
    this.assertOperatorOnly(identity, "reject this planning recommendation");
    this.assertRequiredNote(note, "reject");
    this.db.registerClient(identity);
    const recommendation = this.db.getPlanningRecommendation(recommendationId);
    if (!recommendation) {
      throw new Error(`Planning recommendation ${recommendationId} was not found.`);
    }
    if (!["pending", "snoozed"].includes(recommendation.status)) {
      throw new Error(
        `Planning recommendation ${recommendation.recommendation_id} cannot be rejected from status ${recommendation.status}.`,
      );
    }
    const normalizedReasonCode = this.normalizePlanningDecisionReasonCode(reasonCode);
    this.applyPlanningRecommendationRejection(recommendation, note.trim(), normalizedReasonCode, identity);
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_reject",
      target_type: "planning_recommendation",
      target_id: recommendationId,
      outcome: "success",
      metadata: {
        kind: recommendation.kind,
        reason_code: normalizedReasonCode,
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationReadModel();
    return this.getPlanningRecommendationDetail(recommendationId);
  }

  snoozePlanningRecommendation(
    identity: ClientIdentity,
    recommendationId: string,
    until: string | undefined,
    note: string,
    preset?: string,
  ): PlanningRecommendationDetail {
    this.assertOperatorOnly(identity, "snooze this planning recommendation");
    this.assertRequiredNote(note, "snooze");
    this.db.registerClient(identity);
    const recommendation = this.db.getPlanningRecommendation(recommendationId);
    if (!recommendation) {
      throw new Error(`Planning recommendation ${recommendationId} was not found.`);
    }
    if (!["pending", "snoozed"].includes(recommendation.status)) {
      throw new Error(
        `Planning recommendation ${recommendation.recommendation_id} cannot be snoozed from status ${recommendation.status}.`,
      );
    }
    const snoozedUntil = this.resolvePlanningSnoozeUntil(until, preset);
    this.recordPlanningRecommendationFirstAction(recommendation, "snooze", identity);
    this.db.updatePlanningRecommendation(recommendationId, {
      status: "snoozed",
      snoozed_until: snoozedUntil,
      decision_note: note.trim(),
      resolved_at: null,
      last_error_code: null,
      last_error_message: null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_snooze",
      target_type: "planning_recommendation",
      target_id: recommendationId,
      outcome: "success",
      metadata: {
        kind: recommendation.kind,
        until: snoozedUntil,
        preset: preset ?? null,
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationReadModel();
    return this.getPlanningRecommendationDetail(recommendationId);
  }

  snoozePlanningRecommendationGroup(
    identity: ClientIdentity,
    groupKey: string,
    until: string | undefined,
    note: string,
    preset?: string,
  ): PlanningRecommendationGroupDetail {
    this.assertOperatorOnly(identity, "snooze this planning recommendation group");
    this.assertRequiredNote(note, "snooze");
    this.db.registerClient(identity);
    const recommendations = this.db
      .listPlanningRecommendations({ include_resolved: false })
      .filter((recommendation) => recommendation.group_key === groupKey && recommendation.status === "pending");
    if (recommendations.length === 0) {
      throw new Error(`Planning recommendation group ${groupKey} has no pending recommendations.`);
    }
    const snoozedUntil = this.resolvePlanningSnoozeUntil(until, preset);
    for (const recommendation of recommendations) {
      this.recordPlanningRecommendationFirstAction(recommendation, "group_snooze", identity);
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        status: "snoozed",
        snoozed_until: snoozedUntil,
        decision_note: note.trim(),
        resolved_at: null,
        last_error_code: null,
        last_error_message: null,
      });
    }
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_group_snooze",
      target_type: "planning_recommendation_group",
      target_id: groupKey,
      outcome: "success",
      metadata: {
        recommendation_ids: recommendations.map((recommendation) => recommendation.recommendation_id),
        until: snoozedUntil,
        preset: preset ?? null,
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationReadModel();
    return this.getPlanningRecommendationGroupDetail(groupKey);
  }

  rejectPlanningRecommendationGroup(
    identity: ClientIdentity,
    groupKey: string,
    note: string,
    reasonCode: string,
  ): PlanningRecommendationGroupDetail {
    this.assertOperatorOnly(identity, "reject this planning recommendation group");
    this.assertRequiredNote(note, "reject");
    this.db.registerClient(identity);
    const normalizedReasonCode = this.normalizePlanningGroupRejectReasonCode(reasonCode);
    const recommendations = this.db
      .listPlanningRecommendations({ include_resolved: false })
      .filter((recommendation) => recommendation.group_key === groupKey && recommendation.status === "pending");
    if (recommendations.length === 0) {
      throw new Error(`Planning recommendation group ${groupKey} has no pending recommendations.`);
    }
    for (const recommendation of recommendations) {
      this.applyPlanningRecommendationRejection(recommendation, note.trim(), normalizedReasonCode, identity, "group_reject");
    }
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "planning_recommendation_group_reject",
      target_type: "planning_recommendation_group",
      target_id: groupKey,
      outcome: "success",
      metadata: {
        recommendation_ids: recommendations.map((recommendation) => recommendation.recommendation_id),
        reason_code: normalizedReasonCode,
        note: note.trim(),
      },
    });
    this.refreshPlanningRecommendationReadModel();
    return this.getPlanningRecommendationGroupDetail(groupKey);
  }

  async getWorklistReport(options: { httpReachable: boolean }): Promise<WorklistReport> {
    const activeSendWindow = this.db.getActiveSendWindow();
    const checks = await this.collectDoctorChecks({ deep: false, httpReachable: options.httpReachable });
    const state = this.classifyState(checks);
    const items = this.buildAttentionItems(state, activeSendWindow);
    const planningGroups = this.groupPlanningRecommendations(
      this.db.listPlanningRecommendations({ include_resolved: false }).filter((item) => item.status === "pending"),
    );
    const countsBySeverity = items.reduce<Record<AttentionSeverity, number>>(
      (accumulator, item) => {
        accumulator[item.severity] += 1;
        return accumulator;
      },
      { info: 0, warn: 0, critical: 0 },
    );
    const latestSnapshot = this.getLatestSnapshotSummary();
    const installCheck = buildInstallCheckReport(this.paths);
    const desktopStatus = await getDesktopStatusReport(this.paths);
    const recoveryRehearsal = readRecoveryRehearsalStamp(this.paths);
    const prune = pruneSnapshots(this.paths, { dryRun: true });
    const provenance = readRestoreProvenance(this.paths);
    const recentRepairExecutions = this.db.listRepairExecutions({ days: 30, limit: 100 });
    const repairPlan = buildRepairPlan({
      generated_at: new Date().toISOString(),
      install_check: installCheck,
      doctor: {
        checks,
        state,
        deep: false,
      },
      desktop: desktopStatus,
      latest_snapshot_id: latestSnapshot?.snapshot_id ?? null,
      latest_snapshot_age_hours: snapshotAgeHours(latestSnapshot ?? null),
      snapshot_age_limit_hours: SNAPSHOT_WARN_HOURS,
      prune_candidate_count: prune.prune_candidates,
      recovery_rehearsal_missing: recoveryRehearsal.status !== "configured" || !recoveryRehearsal.stamp,
      machine_state_origin: describeStateOrigin(provenance.status === "configured" ? provenance.provenance : null),
      recent_repair_executions: recentRepairExecutions,
    });
    const maintenanceWindow = buildMaintenanceWindowSummary({
      generated_at: new Date().toISOString(),
      state,
      worklist_items: items,
      repair_plan: repairPlan,
      recent_repair_executions: recentRepairExecutions,
    });
    const maintenanceFollowThrough = buildMaintenanceFollowThroughSummary({
      generated_at: new Date().toISOString(),
      maintenance_window: maintenanceWindow,
      repair_plan: repairPlan,
      recent_repair_executions: recentRepairExecutions,
    });
    return {
      generated_at: new Date().toISOString(),
      state,
      counts_by_severity: countsBySeverity,
      send_window: {
        active: Boolean(activeSendWindow),
        window: activeSendWindow ?? undefined,
      },
      planning_groups: planningGroups,
      maintenance_window: maintenanceWindow,
      maintenance_follow_through: maintenanceFollowThrough,
      items,
    };
  }

  async runAttentionSweep(options: { httpReachable: boolean }) {
    this.normalizeRuntimeState();
    this.refreshPlanningRecommendationsInternal(this.systemPlanningIdentity("attention-sweep"));
    const worklist = await this.getWorklistReport(options);
    const notifyable = worklist.items.filter((item) => {
      if (
        [
          "approval_send_failed",
          "approval_expiring",
          "send_window_expiring",
          "system_degraded",
          "sync_degraded",
          "calendar_sync_degraded",
          "calendar_event_soon",
          "calendar_conflict",
          "task_overdue",
          "task_reminder_due",
          "task_schedule_pressure",
        ].includes(item.kind)
      ) {
        return true;
      }
      return item.kind === "task_suggestion_pending" && item.severity === "warn";
    });
    for (const item of notifyable) {
      const metadata = JSON.parse(item.metadata_json) as Record<string, unknown>;
      const stateMarker = typeof metadata.state_marker === "string" ? metadata.state_marker : item.created_at;
      sendMacNotification(
        this.db,
        this.logger,
        this.policy,
        `attention:${item.item_id}:${stateMarker}`,
        item.title,
        item.summary,
        item.target_id,
      );
    }
    return worklist;
  }

  normalizeRuntimeState(): void {
    this.expireElapsedSendWindows();
    this.recoverStaleSendingApprovals();
  }

  startGoogleAuth(callbackPort: number) {
    return this.dependencies.startGoogleAuth(this.config, callbackPort);
  }

  completeGoogleAuth(state: string, code: string) {
    return this.dependencies.completeGoogleAuth(this.config, this.db, this.logger, state, code);
  }

  startGmailAuth(callbackPort: number) {
    return this.startGoogleAuth(callbackPort);
  }

  completeGmailAuth(state: string, code: string) {
    return this.completeGoogleAuth(state, code);
  }

  listDrafts() {
    return this.db.listDraftArtifacts();
  }

  async createDraft(
    identity: ClientIdentity,
    input: DraftInput,
    options: {
      assistantMetadata?: {
        assistant_generated?: boolean;
        assistant_source_thread_id?: string;
        assistant_group_id?: string;
        assistant_why_now?: string;
        autopilot_run_id?: string;
        autopilot_profile?: AutopilotProfile;
        autopilot_trigger?: AutopilotTrigger;
        autopilot_prepared_at?: string;
      };
    } = {},
  ): Promise<DraftArtifact> {
    this.db.registerClient(identity);
    const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
    const providerDraftId = await this.dependencies.createGmailDraft(stored.tokensJson, stored.clientConfig, stored.email, input);
    const draft = this.db.createDraftArtifact(identity, stored.email, providerDraftId, input, options.assistantMetadata);
    const review = this.db.createReviewItem(draft.artifact_id);
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "mail_draft_create",
      target_type: "draft_artifact",
      target_id: draft.artifact_id,
      outcome: "success",
      metadata: {
        review_id: review.review_id,
        mailbox: stored.email,
        subject: draft.subject,
      },
    });
    sendMacNotification(
      this.db,
      this.logger,
      this.policy,
      `draft-review:${draft.artifact_id}`,
      "Draft Ready",
      draft.subject || "A new Gmail draft is ready for review.",
      draft.artifact_id,
    );
    this.logger.info("draft_created", { artifact_id: draft.artifact_id, client_id: identity.client_id });
    return draft;
  }

  async updateDraft(
    identity: ClientIdentity,
    artifactId: string,
    input: DraftInput,
    options: {
      assistantMetadata?: {
        assistant_generated?: boolean;
        assistant_source_thread_id?: string | null;
        assistant_group_id?: string | null;
        assistant_why_now?: string | null;
        autopilot_run_id?: string | null;
        autopilot_profile?: AutopilotProfile | null;
        autopilot_trigger?: AutopilotTrigger | null;
        autopilot_prepared_at?: string | null;
      };
    } = {},
  ): Promise<DraftArtifact> {
    this.db.registerClient(identity);
    const existing = this.db.getDraftArtifact(artifactId);
    if (!existing) {
      throw new Error(`Draft artifact ${artifactId} was not found.`);
    }
    const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
    await this.dependencies.updateGmailDraft(
      stored.tokensJson,
      stored.clientConfig,
      stored.email,
      existing.provider_draft_id,
      input,
    );
    const updated = this.db.updateDraftArtifact(artifactId, input, options.assistantMetadata);
    if (!updated) {
      throw new Error(`Draft artifact ${artifactId} could not be updated locally.`);
    }

    const activeApproval = this.db.getActiveApprovalForArtifact(artifactId);
    if (activeApproval) {
      this.db.updateApprovalRequest(activeApproval.approval_id, {
        state: "expired",
        decision_note: "Draft changed after approval request.",
        confirmation_digest: null,
        confirmation_expires_at: null,
      });
      this.db.updateDraftLifecycle(artifactId, {
        status: "draft",
        approved_at: null,
        approved_by_client: null,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "approval_request_expire",
        target_type: "approval_request",
        target_id: activeApproval.approval_id,
        outcome: "success",
        metadata: {
          artifact_id: artifactId,
          reason: "draft_updated",
        },
      });
    }

    const latestReview = this.db.getLatestReviewItemForArtifact(artifactId);
    const review =
      !latestReview || latestReview.state === "resolved"
        ? this.db.createReviewItem(artifactId)
        : latestReview;
    this.db.updateDraftLifecycle(
      artifactId,
      activeApproval
        ? {
            review_state: review.state === "opened" ? "opened" : "pending",
            status: "draft",
          }
        : {
            review_state: review.state === "opened" ? "opened" : "pending",
          },
    );

    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "mail_draft_update",
      target_type: "draft_artifact",
      target_id: updated.artifact_id,
      outcome: "success",
      metadata: {
        mailbox: stored.email,
        subject: updated.subject,
        invalidated_approval_id: activeApproval?.approval_id ?? null,
        review_id: review.review_id,
      },
    });
    sendMacNotification(
      this.db,
      this.logger,
      this.policy,
      `draft-review:${artifactId}:${review.review_id}`,
      "Draft Updated",
      updated.subject || "A Gmail draft was updated and is ready for review.",
      artifactId,
    );
    this.logger.info("draft_updated", { artifact_id: updated.artifact_id, client_id: identity.client_id });
    return this.db.getDraftArtifact(artifactId)!;
  }

  listReviewQueue() {
    return this.db.listReviewItems();
  }

  listPendingReviewQueue() {
    return this.db.listPendingReviewItems();
  }

  getReviewDetail(reviewId: string): ReviewDetail {
    const review = this.db.getReviewItem(reviewId);
    if (!review) {
      throw new Error(`Review item ${reviewId} was not found.`);
    }
    const draft = this.db.getDraftArtifact(review.artifact_id);
    if (!draft) {
      throw new Error(`Draft artifact ${review.artifact_id} linked to review ${reviewId} was not found.`);
    }
    return {
      review_item: review,
      draft,
      related_audit_events: this.getRelatedAuditEvents(draft.artifact_id),
    };
  }

  openReview(identity: ClientIdentity, reviewId: string) {
    this.assertOperatorOnly(identity, "open this review item");
    this.db.registerClient(identity);
    const existing = this.db.getReviewItem(reviewId);
    if (!existing) {
      throw new Error(`Review item ${reviewId} was not found.`);
    }
    if (!["pending", "opened"].includes(existing.state)) {
      throw new Error(`Review item ${reviewId} cannot be opened from state ${existing.state}.`);
    }
    const review = this.db.markReviewOpened(reviewId) ?? this.db.getReviewItem(reviewId);
    if (!review) {
      throw new Error(`Review item ${reviewId} was not found.`);
    }
    this.db.updateDraftLifecycle(review.artifact_id, { review_state: "opened" });
    this.dependencies.openExternalUrl(this.config.gmailReviewUrl);
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "review_queue_open",
      target_type: "review_item",
      target_id: review.review_id,
      outcome: "success",
      metadata: {
        artifact_id: review.artifact_id,
        requested_by: identity.requested_by ?? null,
      },
    });
    return {
      review_item: review,
      artifact_id: review.artifact_id,
      gmail_review_url: this.config.gmailReviewUrl,
    };
  }

  resolveReview(identity: ClientIdentity, reviewId: string, note: string) {
    this.assertOperatorOnly(identity, "resolve this review item");
    this.assertRequiredNote(note, "resolve this review item");
    this.db.registerClient(identity);
    const review = this.db.getReviewItem(reviewId);
    if (!review) {
      throw new Error(`Review item ${reviewId} was not found.`);
    }
    if (!["pending", "opened"].includes(review.state)) {
      throw new Error(`Review item ${reviewId} cannot be resolved from state ${review.state}.`);
    }
    const resolved = this.db.markReviewResolved(reviewId);
    this.db.updateDraftLifecycle(review.artifact_id, { review_state: "resolved" });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "review_queue_resolve",
      target_type: "review_item",
      target_id: reviewId,
      outcome: "success",
      metadata: {
        artifact_id: review.artifact_id,
        note: note.trim(),
      },
    });
    return {
      review_item: resolved,
      artifact_id: review.artifact_id,
      note: note.trim(),
    };
  }

  requestApproval(identity: ClientIdentity, artifactId: string, note?: string): ApprovalRequest {
    this.db.registerClient(identity);
    const draft = this.db.getDraftArtifact(artifactId);
    if (!draft) {
      throw new Error(`Draft artifact ${artifactId} was not found.`);
    }
    if (draft.status === "sent" || draft.status === "sending") {
      throw new Error(`Draft artifact ${artifactId} cannot enter approval from status ${draft.status}.`);
    }
    const activeApproval = this.db.getActiveApprovalForArtifact(artifactId);
    if (activeApproval) {
      throw new Error(`Draft artifact ${artifactId} already has an active approval request.`);
    }

    const draftDigest = this.computeDraftDigest(draft);
    const approval = this.db.createApprovalRequest(
      artifactId,
      identity,
      new Date(Date.now() + APPROVAL_TTL_HOURS * 60 * 60 * 1000).toISOString(),
      draftDigest,
      JSON.stringify(this.computeRiskFlags(draft)),
      this.buildPolicySnapshot(),
      note,
    );
    this.db.updateDraftLifecycle(artifactId, {
      status: "approval_pending",
      review_state: "resolved",
    });
    this.db.resolveReviewItemsForArtifact(artifactId);

    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "approval_request_create",
      target_type: "approval_request",
      target_id: approval.approval_id,
      outcome: "success",
      metadata: {
        artifact_id: artifactId,
        draft_digest: draftDigest,
        correlation_id: randomUUID(),
      },
    });
    sendMacNotification(
      this.db,
      this.logger,
      this.policy,
      `approval-request:${approval.approval_id}`,
      "Approval Requested",
      draft.subject || "A draft is waiting for send approval.",
      approval.approval_id,
    );
    return approval;
  }

  listApprovalQueue(filter: Partial<ApprovalRequestFilter> = {}) {
    const approvals = this.db.listApprovalRequests({
      limit: filter.limit ?? 100,
      state: filter.state,
    });
    return approvals.map((approval) => {
      const draft = this.db.getDraftArtifact(approval.artifact_id);
      return {
        ...approval,
        draft_subject: draft?.subject ?? "",
        recipient_count: draft ? draft.to.length + draft.cc.length + draft.bcc.length : 0,
      };
    });
  }

  getApprovalDetail(approvalId: string): ApprovalDetail {
    const { approval, draft } = this.getApprovalContext(approvalId);
    return {
      approval_request: approval,
      draft,
      related_audit_events: this.getRelatedAuditEvents(draft.artifact_id, approval.approval_id),
    };
  }

  confirmApprovalAction(identity: ClientIdentity, approvalId: string, action: ApprovalAction): ApprovalConfirmation {
    this.db.registerClient(identity);
    if (identity.auth_role === "assistant") {
      throw new Error("Confirmation tokens can only be issued from the operator channel.");
    }
    const context = this.getApprovalContext(approvalId);
    this.assertApprovalActionAllowed(context, action);
    this.assertApprovalFresh(context);
    this.assertDraftMatchesApproval(context);

    const token = randomBytes(18).toString("hex");
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MINUTES * 60 * 1000).toISOString();
    this.db.updateApprovalRequest(approvalId, {
      confirmation_digest: this.computeConfirmationDigest(approvalId, action, context.approval.draft_digest, token),
      confirmation_expires_at: expiresAt,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "approval_request_confirm",
      target_type: "approval_request",
      target_id: approvalId,
      outcome: "success",
      metadata: {
        artifact_id: context.draft.artifact_id,
        action,
        correlation_id: randomUUID(),
        draft_digest: context.approval.draft_digest,
      },
    });
    return {
      approval_id: approvalId,
      action,
      confirmation_token: token,
      confirmation_expires_at: expiresAt,
    };
  }

  approveRequest(
    identity: ClientIdentity,
    approvalId: string,
    note: string,
    confirmationToken?: string,
  ): ApprovalDetail {
    this.assertRequiredNote(note, "approve");
    this.db.registerClient(identity);
    const context = this.getApprovalContext(approvalId);
    this.assertApprovalActionAllowed(context, "approve");
    this.assertApprovalFresh(context);
    this.assertDraftMatchesApproval(context);
    this.assertStepUpIfRequired(identity, context, "approve", confirmationToken);

    const now = new Date().toISOString();
    this.db.updateApprovalRequest(approvalId, {
      state: "approved",
      approved_at: now,
      approved_by_client: identity.client_id,
      approved_by_actor: identity.requested_by ?? null,
      decision_note: note,
      confirmation_digest: null,
      confirmation_expires_at: null,
      last_error_code: null,
      last_error_message: null,
    });
    this.db.updateDraftLifecycle(context.draft.artifact_id, {
      status: "approved",
      approved_at: now,
      approved_by_client: identity.client_id,
      last_send_error_code: null,
      last_send_error_message: null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "approval_request_approve",
      target_type: "approval_request",
      target_id: approvalId,
      outcome: "success",
      metadata: {
        artifact_id: context.draft.artifact_id,
        correlation_id: randomUUID(),
        draft_digest: context.approval.draft_digest,
      },
    });
    return this.getApprovalDetail(approvalId);
  }

  rejectRequest(identity: ClientIdentity, approvalId: string, note: string): ApprovalDetail {
    this.assertRequiredNote(note, "reject");
    this.db.registerClient(identity);
    const context = this.getApprovalContext(approvalId);
    if (!["pending", "approved", "send_failed"].includes(context.approval.state)) {
      throw new Error(`Approval request ${approvalId} cannot be rejected from state ${context.approval.state}.`);
    }

    const now = new Date().toISOString();
    this.db.updateApprovalRequest(approvalId, {
      state: "rejected",
      rejected_at: now,
      rejected_by_client: identity.client_id,
      rejected_by_actor: identity.requested_by ?? null,
      decision_note: note,
      confirmation_digest: null,
      confirmation_expires_at: null,
    });
    this.db.updateDraftLifecycle(context.draft.artifact_id, {
      status: "rejected",
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "approval_request_reject",
      target_type: "approval_request",
      target_id: approvalId,
      outcome: "success",
      metadata: {
        artifact_id: context.draft.artifact_id,
        correlation_id: randomUUID(),
        draft_digest: context.approval.draft_digest,
      },
    });
    return this.getApprovalDetail(approvalId);
  }

  reopenApproval(identity: ClientIdentity, approvalId: string, note: string): ApprovalDetail {
    this.assertOperatorOnly(identity, "reopen this approval");
    this.assertRequiredNote(note, "reopen this approval");
    this.db.registerClient(identity);
    const context = this.getApprovalContext(approvalId);
    if (context.approval.state !== "send_failed") {
      throw new Error(`Approval request ${approvalId} cannot be reopened from state ${context.approval.state}.`);
    }
    this.db.updateApprovalRequest(approvalId, {
      state: "approved",
      decision_note: note.trim(),
      last_error_code: null,
      last_error_message: null,
      confirmation_digest: null,
      confirmation_expires_at: null,
    });
    this.db.updateDraftLifecycle(context.draft.artifact_id, {
      status: "approved",
      last_send_error_code: null,
      last_send_error_message: null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "approval_request_reopen",
      target_type: "approval_request",
      target_id: approvalId,
      outcome: "success",
      metadata: {
        artifact_id: context.draft.artifact_id,
        note: note.trim(),
      },
    });
    return this.getApprovalDetail(approvalId);
  }

  cancelApproval(identity: ClientIdentity, approvalId: string, note: string): ApprovalDetail {
    this.assertOperatorOnly(identity, "cancel this approval");
    this.assertRequiredNote(note, "cancel this approval");
    this.db.registerClient(identity);
    const context = this.getApprovalContext(approvalId);
    if (!["pending", "approved", "send_failed"].includes(context.approval.state)) {
      throw new Error(`Approval request ${approvalId} cannot be canceled from state ${context.approval.state}.`);
    }
    const now = new Date().toISOString();
    this.db.updateApprovalRequest(approvalId, {
      state: "rejected",
      rejected_at: now,
      rejected_by_client: identity.client_id,
      rejected_by_actor: identity.requested_by ?? null,
      decision_note: note.trim(),
      confirmation_digest: null,
      confirmation_expires_at: null,
      last_error_code: null,
      last_error_message: null,
    });
    this.db.updateDraftLifecycle(context.draft.artifact_id, {
      status: "draft",
      approved_at: null,
      approved_by_client: null,
      last_send_error_code: null,
      last_send_error_message: null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "approval_request_cancel",
      target_type: "approval_request",
      target_id: approvalId,
      outcome: "success",
      metadata: {
        artifact_id: context.draft.artifact_id,
        note: note.trim(),
      },
    });
    return this.getApprovalDetail(approvalId);
  }

  async sendApprovedDraft(
    identity: ClientIdentity,
    approvalId: string,
    note: string,
    confirmationToken?: string,
  ): Promise<ApprovalDetail> {
    this.assertRequiredNote(note, "send");
    this.db.registerClient(identity);
    this.normalizeRuntimeState();
    const activeSendWindow = this.db.getActiveSendWindow();
    if (!this.isSendEnabled(activeSendWindow)) {
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "approval_request_send",
        target_type: "approval_request",
        target_id: approvalId,
        outcome: "blocked",
        metadata: {
          correlation_id: randomUUID(),
          reason: "send_disabled",
          send_window_id: activeSendWindow?.window_id ?? null,
        },
      });
      throw new Error(
        "Sending is disabled. Enable a timed send window or temporarily turn on allow_send before attempting a live send.",
      );
    }

    const context = this.getApprovalContext(approvalId);
    this.assertApprovalActionAllowed(context, "send");
    this.assertApprovalFresh(context);
    this.assertDraftMatchesApproval(context);
    this.assertStepUpIfRequired(identity, context, "send", confirmationToken);

    const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
    this.assertStoredMailboxMatches(stored.email);

    const correlationId = randomUUID();
    const attemptCount = context.draft.send_attempt_count + 1;
    const sendStartedAt = new Date().toISOString();

    this.db.updateApprovalRequest(approvalId, {
      state: "sending",
      send_note: note,
      confirmation_digest: null,
      confirmation_expires_at: null,
      last_error_code: null,
      last_error_message: null,
    });
    this.db.updateDraftLifecycle(context.draft.artifact_id, {
      status: "sending",
      review_state: "resolved",
      send_attempt_count: attemptCount,
      last_send_attempt_at: sendStartedAt,
      last_send_error_code: null,
      last_send_error_message: null,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "approval_request_send_started",
      target_type: "approval_request",
      target_id: approvalId,
      outcome: "success",
      metadata: {
        artifact_id: context.draft.artifact_id,
        correlation_id: correlationId,
        draft_digest: context.approval.draft_digest,
        attempt_count: attemptCount,
      },
    });

    try {
      const sendResult = await this.dependencies.sendGmailDraft(
        stored.tokensJson,
        stored.clientConfig,
        context.draft.provider_draft_id,
      );
      const sentAt = new Date().toISOString();
      this.db.updateApprovalRequest(approvalId, {
        state: "sent",
        send_note: note,
        last_error_code: null,
        last_error_message: null,
      });
      this.db.updateDraftLifecycle(context.draft.artifact_id, {
        status: "sent",
        review_state: "resolved",
        sent_at: sentAt,
        sent_by_client: identity.client_id,
        provider_message_id: sendResult.provider_message_id,
        provider_thread_id: sendResult.provider_thread_id ?? null,
        last_send_error_code: null,
        last_send_error_message: null,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "approval_request_send",
        target_type: "approval_request",
        target_id: approvalId,
        outcome: "success",
        metadata: {
          artifact_id: context.draft.artifact_id,
          correlation_id: correlationId,
          draft_digest: context.approval.draft_digest,
          attempt_count: attemptCount,
          provider_message_id: sendResult.provider_message_id,
          provider_thread_id: sendResult.provider_thread_id ?? null,
        },
      });
      sendMacNotification(
        this.db,
        this.logger,
        this.policy,
        `approval-send:${approvalId}`,
        "Send Succeeded",
        context.draft.subject || "A Gmail draft was accepted for sending.",
        approvalId,
      );
      return this.getApprovalDetail(approvalId);
    } catch (error) {
      const { code, message } = this.parseSendError(error);
      this.db.updateApprovalRequest(approvalId, {
        state: "send_failed",
        send_note: note,
        last_error_code: code,
        last_error_message: message,
      });
      this.db.updateDraftLifecycle(context.draft.artifact_id, {
        status: "send_failed",
        last_send_error_code: code,
        last_send_error_message: message,
      });
      this.db.recordAuditEvent({
        client_id: identity.client_id,
        action: "approval_request_send",
        target_type: "approval_request",
        target_id: approvalId,
        outcome: "failure",
        metadata: {
          artifact_id: context.draft.artifact_id,
          correlation_id: correlationId,
          draft_digest: context.approval.draft_digest,
          attempt_count: attemptCount,
          error_code: code,
        },
      });
      sendMacNotification(
        this.db,
        this.logger,
        this.policy,
        `approval-send-failed:${approvalId}:${attemptCount}`,
        "Send Failed",
        message,
        approvalId,
      );
      throw new Error(message);
    }
  }

  listAuditEvents(
    filter: Partial<AuditEventFilter> & { limit?: number },
    options: AuditEventReadOptions = {},
  ): AuditEvent[] {
    return listAuditEventsFromModule(this, filter, options);
  }

  async createSnapshot(stateOverride?: ServiceState): Promise<SnapshotManifest> {
    return createSnapshotFromModule(this, stateOverride);
  }

  listSnapshots(): SnapshotSummary[] {
    return listSnapshotsFromModule(this);
  }

  inspectSnapshot(snapshotId: string): SnapshotInspection {
    return inspectSnapshotFromModule(this, snapshotId);
  }

  private summarizeChecks(checks: DoctorCheck[]) {
    return checks.reduce(
      (accumulator, check) => {
        accumulator[check.severity] += 1;
        return accumulator;
      },
      { pass: 0, warn: 0, fail: 0 },
    );
  }

  private classifyState(checks: DoctorCheck[]): ServiceState {
    const hasFail = checks.some((check) => check.severity === "fail");
    if (hasFail) {
      return "degraded";
    }
    const setupIncomplete = checks.some(
      (check) => SETUP_REQUIRED_IDS.has(check.id) && check.severity !== "pass",
    );
    return setupIncomplete ? "setup_required" : "ready";
  }

  private async collectDoctorChecks(options: DoctorOptions): Promise<DoctorCheck[]> {
    const checks: DoctorCheck[] = [];
    const mailAccount = this.db.getMailAccount();
    const launchAgent = this.inspectLaunchAgent();
    const installArtifacts = getInstallArtifactPaths(this.paths);
    const installManifest = readInstallManifest(this.paths);
    const wrapperHealth = evaluateWrapperHealth(this.paths, installManifest);
    const oauthValidation = validateOAuthClientFile(this.config.oauthClientFile);
    const oauthPermissions = validateSecretFilePermissions(this.config.oauthClientFile, "OAuth client file");
    const localApiToken = validateSecretTextFile(this.paths.apiTokenFile, "Local API token");
    const assistantApiToken = validateSecretTextFile(this.paths.assistantApiTokenFile, "Assistant API token");
    const localApiTokenPermissions = validateSecretFilePermissions(this.paths.apiTokenFile, "Local API token");
    const assistantApiTokenPermissions = validateSecretFilePermissions(this.paths.assistantApiTokenFile, "Assistant API token");
    const machineIdentity = readMachineIdentity(this.paths);
    const restoreProvenance = readRestoreProvenance(this.paths);
    const githubAccount = this.db.getGithubAccount();
    const githubSync = this.db.getGithubSyncState();
    const githubToken = githubAccount
      ? this.dependencies.getKeychainSecret(this.config.githubKeychainService, githubAccount.keychain_account)
      : null;
    const driveSync = this.db.getDriveSyncState();
    const driveToken = mailAccount
      ? this.dependencies.getKeychainSecret(this.config.keychainService, mailAccount.email)
      : null;
    const wrapperCheck = (
      severity: "pass" | "warn" | "fail",
      id: string,
      title: string,
      message: string,
    ): DoctorCheck => {
      if (severity === "fail") {
        return this.failCheck(id, title, message, "integration");
      }
      if (severity === "warn") {
        return this.warnCheck(id, title, message, "integration");
      }
      return this.passCheck(id, title, message, "integration");
    };

    checks.push(this.fileCheck("config_file_valid", "Config file", this.paths.configFile, true));
    checks.push(this.fileCheck("policy_file_valid", "Policy file", this.paths.policyFile, true));
    checks.push(
      oauthValidation.status === "configured"
        ? this.passCheck("oauth_client_file_valid", "OAuth client file validity", "OAuth client JSON is well-formed for Desktop OAuth.", "setup")
        : oauthValidation.status === "missing" || oauthValidation.status === "placeholder"
          ? this.warnCheck("oauth_client_file_valid", "OAuth client file validity", oauthValidation.message, "setup")
          : this.failCheck("oauth_client_file_valid", "OAuth client file validity", oauthValidation.message, "setup"),
    );
    checks.push(
      oauthValidation.status === "configured"
        ? this.passCheck("oauth_client_configured", "OAuth client", oauthValidation.message, "setup")
        : oauthValidation.status === "missing" || oauthValidation.status === "placeholder"
          ? this.warnCheck("oauth_client_configured", "OAuth client", oauthValidation.message, "setup")
          : this.failCheck("oauth_client_configured", "OAuth client", oauthValidation.message, "setup"),
    );
    checks.push(
      oauthPermissions.status === "too_broad"
        ? this.warnCheck("oauth_client_permissions_secure", "OAuth client permissions", oauthPermissions.message, "setup")
        : oauthPermissions.status === "secure"
          ? this.passCheck("oauth_client_permissions_secure", "OAuth client permissions", oauthPermissions.message, "setup")
          : oauthValidation.status === "missing"
            ? this.warnCheck(
                "oauth_client_permissions_secure",
                "OAuth client permissions",
                "OAuth client permissions cannot be checked until the file exists.",
                "setup",
              )
            : this.failCheck("oauth_client_permissions_secure", "OAuth client permissions", oauthPermissions.message, "setup"),
    );
    checks.push(
      this.config.gmailAccountEmail
        ? this.passCheck(
            "configured_mailbox_present",
            "Configured mailbox",
            `Configured mailbox is ${this.config.gmailAccountEmail}.`,
            "setup",
          )
        : this.warnCheck(
            "configured_mailbox_present",
            "Configured mailbox",
            "Configured mailbox email is still blank in config.toml.",
            "setup",
          ),
    );
    checks.push(
      this.config.keychainService.trim()
        ? this.passCheck("keychain_service_configured", "Keychain service", `Keychain service is ${this.config.keychainService}.`, "setup")
        : this.warnCheck(
            "keychain_service_configured",
            "Keychain service",
            "auth.keychain_service is blank in config.toml. Restore the default or set the intended Keychain service before re-auth.",
            "setup",
          ),
    );
    checks.push(
      this.config.githubEnabled
        ? this.passCheck("github_enabled", "GitHub integration", "GitHub integration is enabled.", "integration")
        : this.passCheck("github_enabled", "GitHub integration", "GitHub integration is disabled.", "integration"),
    );
    checks.push(
      !this.config.githubEnabled
        ? this.passCheck(
            "github_repository_scope_configured",
            "GitHub repository scope",
            "GitHub repository scope is not required while the integration is disabled.",
            "integration",
          )
        : this.config.includedGithubRepositories.length > 0
          ? this.passCheck(
              "github_repository_scope_configured",
              "GitHub repository scope",
              `${this.config.includedGithubRepositories.length} GitHub repositor${this.config.includedGithubRepositories.length === 1 ? "y is" : "ies are"} included.`,
              "integration",
            )
          : this.warnCheck(
              "github_repository_scope_configured",
              "GitHub repository scope",
              "GitHub is enabled, but github.included_repositories is empty in config.toml.",
              "integration",
            ),
    );
    checks.push(
      !this.config.githubEnabled
        ? this.passCheck(
            "github_token_present",
            "GitHub token",
            "GitHub token is not required while the integration is disabled.",
            "integration",
          )
        : githubToken
          ? this.passCheck("github_token_present", "GitHub token", "GitHub Keychain token is present.", "integration")
          : this.warnCheck(
              "github_token_present",
              "GitHub token",
              "GitHub is enabled, but no PAT is stored in Keychain. Run `personal-ops auth github login`.",
              "integration",
            ),
    );
    checks.push(
      !this.config.githubEnabled
        ? this.passCheck(
            "github_connected_login_recorded",
            "GitHub connected login",
            "GitHub connected login is not required while the integration is disabled.",
            "integration",
          )
        : githubAccount
          ? this.passCheck(
              "github_connected_login_recorded",
              "GitHub connected login",
              `GitHub is connected as ${githubAccount.login}.`,
              "integration",
            )
          : this.warnCheck(
              "github_connected_login_recorded",
              "GitHub connected login",
              "GitHub is enabled, but no connected GitHub login is recorded. Run `personal-ops auth github login`.",
              "integration",
            ),
    );
    const githubStaleMinutes = Math.max(15, this.config.githubSyncIntervalMinutes * 3);
    checks.push(
      !this.config.githubEnabled
        ? this.passCheck("github_sync_fresh", "GitHub sync freshness", "GitHub sync is not required while the integration is disabled.", "integration")
        : githubSync?.status === "degraded"
          ? this.warnCheck(
              "github_sync_fresh",
              "GitHub sync freshness",
              githubSync.last_error_message ?? "GitHub sync is degraded. Run `personal-ops github sync now`.",
              "integration",
            )
          : !githubSync?.last_synced_at
            ? this.warnCheck(
                "github_sync_fresh",
                "GitHub sync freshness",
                "GitHub has not synced yet. Run `personal-ops github sync now` after login.",
                "integration",
              )
            : Date.now() - Date.parse(githubSync.last_synced_at) > githubStaleMinutes * 60_000
              ? this.warnCheck(
                  "github_sync_fresh",
                  "GitHub sync freshness",
                  `GitHub sync is stale. Last synced at ${githubSync.last_synced_at}. Run \`personal-ops github sync now\`.`,
                  "integration",
                )
              : this.passCheck(
                  "github_sync_fresh",
                  "GitHub sync freshness",
                  `GitHub sync is fresh as of ${githubSync.last_synced_at}.`,
                  "integration",
                ),
    );
    checks.push(
      this.config.driveEnabled
        ? this.passCheck("drive_enabled", "Drive integration", "Drive integration is enabled.", "integration")
        : this.passCheck("drive_enabled", "Drive integration", "Drive integration is disabled.", "integration"),
    );
    checks.push(
      !this.config.driveEnabled
        ? this.passCheck(
            "drive_scope_configured",
            "Drive scope",
            "Drive scope is not required while the integration is disabled.",
            "integration",
          )
        : this.config.includedDriveFolders.length + this.config.includedDriveFiles.length > 0
          ? this.passCheck(
              "drive_scope_configured",
              "Drive scope",
              `${this.config.includedDriveFolders.length} folder scope item(s) and ${this.config.includedDriveFiles.length} file scope item(s) are configured.`,
              "integration",
            )
          : this.warnCheck(
              "drive_scope_configured",
              "Drive scope",
              "Drive is enabled, but drive.included_folders and drive.included_files are both empty in config.toml.",
              "integration",
            ),
    );
    checks.push(
      !this.config.driveEnabled
        ? this.passCheck(
            "drive_token_present",
            "Drive token",
            "Drive token is not required while the integration is disabled.",
            "integration",
          )
        : driveToken
          ? this.passCheck("drive_token_present", "Drive token", "Google token is present for Drive, Docs, and Sheets reads.", "integration")
          : this.warnCheck(
              "drive_token_present",
              "Drive token",
              "Drive is enabled, but no Google token is available. Run `personal-ops auth google login`.",
              "integration",
            ),
    );
    const driveStaleMinutes = Math.max(30, this.config.driveSyncIntervalMinutes * 3);
    checks.push(
      !this.config.driveEnabled
        ? this.passCheck("drive_sync_fresh", "Drive sync freshness", "Drive sync is not required while the integration is disabled.", "integration")
        : driveSync?.status === "degraded"
          ? this.warnCheck(
              "drive_sync_fresh",
              "Drive sync freshness",
              driveSync.last_error_message ?? "Drive sync is degraded. Run `personal-ops drive sync now`.",
              "integration",
            )
          : !driveSync?.last_synced_at
            ? this.warnCheck(
                "drive_sync_fresh",
                "Drive sync freshness",
                "Drive has not synced yet. Run `personal-ops drive sync now` after login.",
                "integration",
              )
            : Date.now() - Date.parse(driveSync.last_synced_at) > driveStaleMinutes * 60_000
              ? this.warnCheck(
                  "drive_sync_fresh",
                  "Drive sync freshness",
                  `Drive sync is stale. Last synced at ${driveSync.last_synced_at}. Run \`personal-ops drive sync now\`.`,
                  "integration",
                )
              : this.passCheck(
                  "drive_sync_fresh",
                  "Drive sync freshness",
                  `Drive sync is fresh as of ${driveSync.last_synced_at}.`,
                  "integration",
                ),
    );
    checks.push(
      machineIdentity.status === "configured"
        ? this.passCheck(
            "machine_identity_exists",
            "Machine identity",
            `Machine identity exists for ${machineIdentity.identity?.machine_label}.`,
            "setup",
          )
        : this.warnCheck("machine_identity_exists", "Machine identity", machineIdentity.message, "setup"),
    );
    checks.push(
      machineIdentity.status === "configured"
        ? this.passCheck(
            "machine_identity_valid",
            "Machine identity validity",
            `Machine identity is valid for ${machineIdentity.identity?.machine_label}.`,
            "setup",
          )
        : this.warnCheck(
            "machine_identity_valid",
            "Machine identity validity",
            machineIdentity.status === "missing"
              ? "Machine identity cannot be validated until it is initialized."
              : machineIdentity.message,
            "setup",
          ),
    );
    if (restoreProvenance.status === "configured" && restoreProvenance.provenance) {
      const stateOrigin = describeStateOrigin(restoreProvenance.provenance);
      checks.push(
        stateOrigin === "restored_cross_machine"
          ? this.warnCheck(
              "state_origin_safe",
              "State origin",
              `State was restored from ${restoreProvenance.provenance.source_machine_label ?? "another machine"}. Rerun \`personal-ops doctor --deep\` and local auth checks before trusting live access.`,
              "setup",
            )
          : stateOrigin === "unknown_legacy_restore"
            ? this.warnCheck(
                "state_origin_safe",
                "State origin",
                "State was restored from a legacy snapshot with unknown machine provenance.",
                "setup",
              )
            : this.passCheck(
                "state_origin_safe",
                "State origin",
                "Latest recorded restore provenance is same-machine.",
                "setup",
              ),
      );
    } else if (restoreProvenance.status === "invalid") {
      checks.push(this.warnCheck("state_origin_safe", "State origin", restoreProvenance.message, "setup"));
    } else {
      checks.push(this.passCheck("state_origin_safe", "State origin", "No cross-machine restore provenance is recorded.", "setup"));
    }
    checks.push(this.snapshotFreshnessCheck(this.getLatestSnapshotSummary()));
    checks.push(this.snapshotRetentionPressureCheck());
    checks.push(this.recoveryRehearsalFreshnessCheck());
    checks.push(
      options.httpReachable
        ? this.passCheck("daemon_http_reachable", "Daemon HTTP", "Daemon responded on localhost.", "runtime")
        : this.failCheck("daemon_http_reachable", "Daemon HTTP", "Daemon did not respond on localhost.", "runtime"),
    );
    checks.push(
      launchAgent.exists
        ? this.passCheck("launch_agent_exists", "LaunchAgent file", "LaunchAgent plist exists.", "runtime")
        : this.failCheck("launch_agent_exists", "LaunchAgent file", "LaunchAgent plist is missing.", "runtime"),
    );
    checks.push(
      launchAgent.running
        ? this.passCheck("launch_agent_running", "LaunchAgent state", "LaunchAgent is loaded and running.", "runtime")
        : this.failCheck("launch_agent_running", "LaunchAgent state", "LaunchAgent is not loaded or not running.", "runtime"),
    );
    for (const wrapper of wrapperHealth) {
      const label = wrapper.label;
      checks.push(
        wrapperCheck(
          wrapper.exists ? "pass" : wrapper.severity,
          wrapper.key === "codex_mcp" || wrapper.key === "claude_mcp"
            ? `${wrapper.key}_launcher_exists`
            : `${wrapper.key}_wrapper_exists`,
          label,
          wrapper.exists ? `${label} exists at ${wrapper.wrapperPath}.` : wrapper.reason,
        ),
      );
      checks.push(
        wrapperCheck(
          wrapper.nodeExecutable && wrapper.nodeExecutableExists ? "pass" : wrapper.severity,
          `${wrapper.key}_wrapper_node_executable`,
          `${label} Node`,
          wrapper.nodeExecutable && wrapper.nodeExecutableExists
            ? `${label} uses ${wrapper.nodeExecutable}.`
            : wrapper.reason,
        ),
      );
      checks.push(
        wrapperCheck(
          wrapper.targetFile && wrapper.targetExists && wrapper.targetFile === wrapper.expectedTarget ? "pass" : wrapper.severity,
          `${wrapper.key}_wrapper_target_valid`,
          `${label} target`,
          wrapper.targetFile && wrapper.targetExists && wrapper.targetFile === wrapper.expectedTarget
            ? `${label} points to ${wrapper.targetFile}.`
            : wrapper.reason,
        ),
      );
      checks.push(
        wrapper.provenancePresent
          ? this.passCheck(
              `${wrapper.key}_wrapper_provenance_present`,
              `${label} provenance`,
              `${label} provenance is recorded in the install manifest.`,
              "integration",
            )
          : this.warnCheck(
              `${wrapper.key}_wrapper_provenance_present`,
              `${label} provenance`,
              wrapper.reason,
              "integration",
            ),
      );
      checks.push(
        wrapper.current
          ? this.passCheck(
              `${wrapper.key}_wrapper_current`,
              `${label} freshness`,
              `${label} matches the current checkout.`,
              "integration",
            )
          : this.warnCheck(
              `${wrapper.key}_wrapper_current`,
              `${label} freshness`,
              wrapper.reason,
              "integration",
            ),
      );
    }
    if (launchAgent.exists) {
      checks.push(
        launchAgent.programPath === installArtifacts.daemonWrapperPath
          ? this.passCheck(
              "launch_agent_target_valid",
              "LaunchAgent target",
              `LaunchAgent points to ${installArtifacts.daemonWrapperPath}.`,
              "integration",
            )
          : this.failCheck(
              "launch_agent_target_valid",
              "LaunchAgent target",
              `LaunchAgent points to ${launchAgent.programPath ?? "nothing"}, expected ${installArtifacts.daemonWrapperPath}.`,
              "integration",
            ),
      );
      checks.push(
        launchAgent.workingDirectory === this.paths.appDir
          ? this.passCheck(
              "launch_agent_workdir_valid",
              "LaunchAgent working directory",
              `LaunchAgent uses ${this.paths.appDir}.`,
              "integration",
            )
          : this.failCheck(
              "launch_agent_workdir_valid",
              "LaunchAgent working directory",
              `LaunchAgent uses ${launchAgent.workingDirectory ?? "nothing"}, expected ${this.paths.appDir}.`,
              "integration",
            ),
      );
    }
    checks.push(this.fileCheck("sqlite_readable", "SQLite state", this.paths.databaseFile, true));
    checks.push(this.directoryWritableCheck("log_dir_writable", "Log directory", this.paths.logDir));
    checks.push(
      localApiToken.status === "configured"
        ? this.passCheck("local_api_token_exists", "Local API token", localApiToken.message, "runtime")
        : this.failCheck("local_api_token_exists", "Local API token", localApiToken.message, "runtime"),
    );
    checks.push(
      localApiToken.status === "configured"
        ? this.passCheck("local_api_token_nonempty", "Local API token contents", "Local API token file is non-empty.", "runtime")
        : localApiToken.status === "empty"
          ? this.failCheck("local_api_token_nonempty", "Local API token contents", localApiToken.message, "runtime")
          : this.failCheck(
              "local_api_token_nonempty",
              "Local API token contents",
              "Local API token cannot be validated until the file is readable.",
              "runtime",
            ),
    );
    checks.push(
      localApiTokenPermissions.status === "too_broad"
        ? this.warnCheck("local_api_token_permissions_secure", "Local API token permissions", localApiTokenPermissions.message, "runtime")
        : localApiTokenPermissions.status === "secure"
          ? this.passCheck("local_api_token_permissions_secure", "Local API token permissions", localApiTokenPermissions.message, "runtime")
          : this.failCheck("local_api_token_permissions_secure", "Local API token permissions", localApiTokenPermissions.message, "runtime"),
    );
    checks.push(
      assistantApiToken.status === "configured"
        ? this.passCheck("assistant_api_token_exists", "Assistant API token", assistantApiToken.message, "runtime")
        : this.failCheck("assistant_api_token_exists", "Assistant API token", assistantApiToken.message, "runtime"),
    );
    checks.push(
      assistantApiToken.status === "configured"
        ? this.passCheck("assistant_api_token_nonempty", "Assistant API token contents", "Assistant API token file is non-empty.", "runtime")
        : assistantApiToken.status === "empty"
          ? this.failCheck("assistant_api_token_nonempty", "Assistant API token contents", assistantApiToken.message, "runtime")
          : this.failCheck(
              "assistant_api_token_nonempty",
              "Assistant API token contents",
              "Assistant API token cannot be validated until the file is readable.",
              "runtime",
            ),
    );
    checks.push(
      assistantApiTokenPermissions.status === "too_broad"
        ? this.warnCheck(
            "assistant_api_token_permissions_secure",
            "Assistant API token permissions",
            assistantApiTokenPermissions.message,
            "runtime",
          )
        : assistantApiTokenPermissions.status === "secure"
          ? this.passCheck(
              "assistant_api_token_permissions_secure",
              "Assistant API token permissions",
              assistantApiTokenPermissions.message,
              "runtime",
            )
          : this.failCheck(
              "assistant_api_token_permissions_secure",
              "Assistant API token permissions",
              assistantApiTokenPermissions.message,
              "runtime",
            ),
    );
    checks.push(
      this.passCheck(
        "send_policy_gate",
        "Send policy",
        this.policy.allowSend ? "Live sending is enabled." : "Live sending is disabled by policy.",
        "runtime",
      ),
    );
    const latestSendWindow = this.db.getLatestSendWindow();
    const activeSendWindow = this.db.getActiveSendWindow();
    checks.push(
      this.db.getSchemaVersion() >= CURRENT_SCHEMA_VERSION
        ? this.passCheck("schema_version_current", "Schema version", `Schema version is ${this.db.getSchemaVersion()}.`, "runtime")
        : this.failCheck(
            "schema_version_current",
            "Schema version",
            `Schema version ${this.db.getSchemaVersion()} is below required version ${CURRENT_SCHEMA_VERSION}.`,
            "runtime",
          ),
    );
    const schemaCompatibility = this.db.getSchemaCompatibility();
    checks.push(
      schemaCompatibility.compatible
        ? this.passCheck("schema_runtime_compatible", "Schema compatibility", schemaCompatibility.message, "runtime")
        : this.failCheck("schema_runtime_compatible", "Schema compatibility", schemaCompatibility.message, "runtime"),
    );
    checks.push(
      latestSendWindow
        ? this.passCheck(
            "send_window_table_readable",
            "Send window table",
            `Latest send window state is ${latestSendWindow.state}.`,
            "runtime",
          )
        : this.passCheck("send_window_table_readable", "Send window table", "Send window table is readable.", "runtime"),
    );
    try {
      this.db.listApprovalRequests({ limit: 1 });
      checks.push(this.passCheck("approval_queue_readable", "Approval queue", "Approval queue is readable.", "runtime"));
    } catch (error) {
      checks.push(
        this.failCheck(
          "approval_queue_readable",
          "Approval queue",
          error instanceof Error ? error.message : "Approval queue could not be read.",
          "runtime",
        ),
      );
    }
    try {
      this.db.listTasks({ limit: 1 });
      checks.push(this.passCheck("task_table_readable", "Task table", "Task table is readable.", "runtime"));
    } catch (error) {
      checks.push(
        this.failCheck(
          "task_table_readable",
          "Task table",
          error instanceof Error ? error.message : "Task table could not be read.",
          "runtime",
        ),
      );
    }
    try {
      this.db.listTaskSuggestions({ limit: 1 });
      checks.push(
        this.passCheck("task_suggestion_table_readable", "Task suggestion table", "Task suggestion table is readable.", "runtime"),
      );
    } catch (error) {
      checks.push(
        this.failCheck(
          "task_suggestion_table_readable",
          "Task suggestion table",
          error instanceof Error ? error.message : "Task suggestion table could not be read.",
          "runtime",
        ),
      );
    }
    checks.push(this.passCheck("task_reminder_sweep_healthy", "Task reminder sweep", "Task reminder sweep is active.", "runtime"));
    try {
      const calendarAccount = this.config.gmailAccountEmail ? this.config.gmailAccountEmail : mailAccount?.email ?? null;
      const calendarSyncState = calendarAccount ? this.db.getCalendarSyncState(calendarAccount) : null;
      this.db.listCalendarSources(calendarAccount || undefined);
      this.db.listCalendarEvents(calendarAccount ? { account: calendarAccount, limit: 1 } : { limit: 1 });
      checks.push(this.passCheck("calendar_tables_readable", "Calendar tables", "Calendar tables are readable.", "runtime"));
      const brokenTaskLinks = this.db
        .listTasks({ activeOnly: true })
        .filter((task) => task.scheduled_calendar_event_id && !this.db.getCalendarEvent(task.scheduled_calendar_event_id));
      checks.push(
        brokenTaskLinks.length === 0
          ? this.passCheck(
              "calendar_task_links_readable",
              "Calendar task links",
              "Task and calendar linkage rows are consistent.",
              "runtime",
            )
          : this.failCheck(
              "calendar_task_links_readable",
              "Calendar task links",
              `Scheduled task links are missing local events for: ${brokenTaskLinks.map((task) => task.task_id).join(", ")}.`,
              "runtime",
            ),
      );
      checks.push(
        calendarSyncState
          ? this.passCheck(
              "calendar_sync_state_readable",
              "Calendar sync state",
              `Calendar sync row is readable for ${calendarSyncState.account}.`,
              "runtime",
            )
          : this.warnCheck("calendar_sync_state_readable", "Calendar sync state", "No calendar sync row exists yet.", "runtime"),
      );
      if (!this.config.calendarEnabled) {
        checks.push(this.warnCheck("calendar_enabled", "Calendar subsystem", "Calendar syncing is disabled in config.", "setup"));
      } else if (this.config.includedCalendarIds.length === 0) {
        checks.push(
          this.passCheck(
            "calendar_selection_config_valid",
            "Calendar selection",
            "Calendar selection will use all visible subscribed calendars.",
            "setup",
          ),
        );
      } else {
        const availableIds = new Set(this.db.listCalendarSources(calendarAccount || undefined).map((source) => source.calendar_id));
        const missing = this.config.includedCalendarIds.filter((calendarId) => !availableIds.has(calendarId));
        checks.push(
          missing.length === 0
            ? this.passCheck(
                "calendar_selection_config_valid",
                "Calendar selection",
                "Configured calendar ids are resolvable.",
                "setup",
              )
            : this.warnCheck(
                "calendar_selection_config_valid",
                "Calendar selection",
                `Configured calendar ids not yet resolved locally: ${missing.join(", ")}.`,
                "setup",
              ),
        );
      }
      if (!this.config.calendarEnabled) {
        checks.push(this.warnCheck("calendar_sync_ready", "Calendar sync readiness", "Calendar syncing is disabled.", "runtime"));
        checks.push(
          this.warnCheck("calendar_write_targets_ready", "Calendar write targets", "Calendar writes are disabled with calendar syncing.", "runtime"),
        );
      } else if (calendarSyncState?.status === "ready") {
        checks.push(
          this.passCheck(
            "calendar_sync_ready",
            "Calendar sync readiness",
            `Calendar sync is ready for ${calendarSyncState.account}.`,
            "runtime",
          ),
        );
        const ownedCalendars = this.db.listOwnedCalendarSources(calendarAccount || undefined);
        checks.push(
          ownedCalendars.length > 0
            ? this.passCheck(
                "calendar_write_targets_ready",
                "Calendar write targets",
                `${ownedCalendars.length} owned writable calendar(s) are available.`,
                "runtime",
              )
            : this.failCheck(
                "calendar_write_targets_ready",
                "Calendar write targets",
                "No owned writable calendars are available for operator scheduling.",
                "runtime",
              ),
        );
      } else if (calendarSyncState?.status === "degraded") {
        checks.push(
          this.failCheck(
            "calendar_sync_ready",
            "Calendar sync readiness",
            calendarSyncState.last_error_message ?? "Calendar sync is degraded and needs a fresh sync.",
            "runtime",
          ),
        );
        checks.push(
          this.failCheck(
            "calendar_write_targets_ready",
            "Calendar write targets",
            "Calendar sync is degraded, so writable calendar readiness cannot be trusted.",
            "runtime",
          ),
        );
      } else {
        checks.push(
          this.warnCheck(
            "calendar_sync_ready",
            "Calendar sync readiness",
            "Calendar sync has not completed yet.",
            "runtime",
          ),
        );
        checks.push(
          this.warnCheck(
            "calendar_write_targets_ready",
            "Calendar write targets",
            "Calendar sync has not completed yet, so writable calendars are not confirmed.",
            "runtime",
          ),
        );
      }
    } catch (error) {
      checks.push(
        this.failCheck(
          "calendar_tables_readable",
          "Calendar tables",
          error instanceof Error ? error.message : "Calendar tables could not be read.",
          "runtime",
        ),
      );
      checks.push(
        this.failCheck(
          "calendar_sync_state_readable",
          "Calendar sync state",
          error instanceof Error ? error.message : "Calendar sync state could not be read.",
          "runtime",
        ),
      );
      checks.push(
        this.failCheck(
          "calendar_selection_config_valid",
          "Calendar selection",
          error instanceof Error ? error.message : "Calendar selection could not be validated.",
          "setup",
        ),
      );
      checks.push(
        this.failCheck(
          "calendar_sync_ready",
          "Calendar sync readiness",
          error instanceof Error ? error.message : "Calendar sync readiness could not be evaluated.",
          "runtime",
        ),
      );
      checks.push(
        this.failCheck(
          "calendar_write_targets_ready",
          "Calendar write targets",
          error instanceof Error ? error.message : "Calendar write targets could not be validated.",
          "runtime",
        ),
      );
      checks.push(
        this.failCheck(
          "calendar_task_links_readable",
          "Calendar task links",
          error instanceof Error ? error.message : "Calendar task links could not be validated.",
          "runtime",
        ),
      );
    }
    try {
      const syncState = this.config.gmailAccountEmail ? this.db.getMailSyncState(this.config.gmailAccountEmail) : null;
      this.db.countMailThreads();
      this.db.listMailMessagesByThread("__doctor_probe__");
      checks.push(this.passCheck("mail_index_readable", "Mail index", "Mailbox metadata tables are readable.", "runtime"));
      if (this.config.gmailAccountEmail) {
        checks.push(
          syncState
            ? this.passCheck("mail_sync_state_readable", "Mail sync state", `Sync row is readable for ${syncState.mailbox}.`, "runtime")
            : this.warnCheck("mail_sync_state_readable", "Mail sync state", "No mailbox sync row exists yet.", "runtime"),
        );
        if (syncState?.last_seeded_at) {
          checks.push(
            syncState.last_synced_at
              ? this.passCheck(
                  "mail_seed_state_valid",
                  "Mail seed state",
                  `Mailbox seed is present and last synced at ${syncState.last_synced_at}.`,
                  "runtime",
                )
              : this.failCheck(
                  "mail_seed_state_valid",
                  "Mail seed state",
                  "Mailbox seed exists but the last synced timestamp is missing.",
                  "runtime",
                ),
          );
        } else {
          checks.push(this.warnCheck("mail_seed_state_valid", "Mail seed state", "Mailbox seed has not completed yet.", "runtime"));
        }
        if (syncState?.status === "ready") {
          checks.push(
            syncState.last_history_id
              ? this.passCheck(
                  "mail_history_id_present",
                  "Mail history cursor",
                  `Mailbox sync is ready with history id ${syncState.last_history_id}.`,
                  "runtime",
                )
              : this.failCheck(
                  "mail_history_id_present",
                  "Mail history cursor",
                  "Mailbox sync is ready but no history id is stored.",
                  "runtime",
                ),
          );
        } else if (syncState?.status === "degraded") {
          checks.push(
            this.failCheck(
              "mail_history_id_present",
              "Mail history cursor",
              syncState.last_error_message ?? "Mailbox sync is degraded and needs a fresh sync.",
              "runtime",
            ),
          );
        } else {
          checks.push(
            this.warnCheck(
              "mail_history_id_present",
              "Mail history cursor",
              "Mailbox sync is not ready yet, so no history cursor was required.",
              "runtime",
            ),
          );
        }
      }
    } catch (error) {
      checks.push(
        this.failCheck(
          "mail_index_readable",
          "Mail index",
          error instanceof Error ? error.message : "Mailbox metadata tables could not be read.",
          "runtime",
        ),
      );
      checks.push(
        this.failCheck(
          "mail_sync_state_readable",
          "Mail sync state",
          error instanceof Error ? error.message : "Mailbox sync state could not be read.",
          "runtime",
        ),
      );
      checks.push(
        this.failCheck(
          "mail_seed_state_valid",
          "Mail seed state",
          error instanceof Error ? error.message : "Mailbox seed state could not be read.",
          "runtime",
        ),
      );
      checks.push(
        this.failCheck(
          "mail_history_id_present",
          "Mail history cursor",
          error instanceof Error ? error.message : "Mailbox history state could not be read.",
          "runtime",
        ),
      );
    }
    if (activeSendWindow) {
      checks.push(
        Date.parse(activeSendWindow.expires_at) > Date.now()
          ? this.passCheck(
              "send_window_consistency",
              "Send window consistency",
              `Active send window ${activeSendWindow.window_id} is valid until ${activeSendWindow.expires_at}.`,
              "runtime",
            )
          : this.failCheck(
              "send_window_consistency",
              "Send window consistency",
              `Active send window ${activeSendWindow.window_id} should have expired already.`,
              "runtime",
            ),
      );
    } else {
      checks.push(
        this.passCheck("send_window_consistency", "Send window consistency", "No active send window is present.", "runtime"),
      );
    }
    if (latestSendWindow?.state === "active" && Date.parse(latestSendWindow.expires_at) <= Date.now()) {
      checks.push(
        this.warnCheck(
          "send_window_expiry_hygiene",
          "Send window expiry hygiene",
          `Latest send window ${latestSendWindow.window_id} expired and should be normalized by the daemon sweep.`,
          "runtime",
        ),
      );
    } else {
      checks.push(
        this.passCheck(
          "send_window_expiry_hygiene",
          "Send window expiry hygiene",
          "Send window expiry state is clean.",
          "runtime",
        ),
      );
    }

    if (!mailAccount) {
      checks.push(
        this.warnCheck(
          "keychain_item_present",
          "Keychain token",
          "No connected mailbox record exists yet, so no Keychain token was verified.",
          "setup",
        ),
      );
      checks.push(
        this.warnCheck(
          "connected_mailbox_matches",
          "Connected mailbox",
          "No connected mailbox record exists in the local database yet.",
          "setup",
        ),
      );
    } else {
      const keychainProbe = probeKeychainSecret(this.config.keychainService, mailAccount.email);
      checks.push(
        keychainProbe.status === "present"
          ? this.passCheck(
              "keychain_item_present",
              "Keychain token",
              keychainProbe.message,
              "setup",
            )
          : this.failCheck(
              "keychain_item_present",
              "Keychain token",
              keychainProbe.message,
              "setup",
            ),
      );

      if (!this.config.gmailAccountEmail) {
        checks.push(
          this.warnCheck(
            "connected_mailbox_matches",
            "Connected mailbox",
            `Connected mailbox is ${mailAccount.email}, but config mailbox is blank.`,
            "setup",
          ),
        );
      } else if (this.config.gmailAccountEmail === mailAccount.email) {
        checks.push(
          this.passCheck(
            "connected_mailbox_matches",
            "Connected mailbox",
            `Connected mailbox matches configured mailbox (${mailAccount.email}).`,
            "setup",
          ),
        );
      } else {
        checks.push(
          this.failCheck(
            "connected_mailbox_matches",
            "Connected mailbox",
            `Connected mailbox ${mailAccount.email} does not match configured mailbox ${this.config.gmailAccountEmail}.`,
            "setup",
          ),
        );
      }
    }
    if (options.deep) {
      if (!mailAccount) {
        checks.push(
          this.warnCheck(
            "deep_gmail_profile_matches",
            "Deep Gmail verification",
            "Skipped because no connected mailbox record exists.",
            "setup",
          ),
        );
        checks.push(
          this.warnCheck(
            "deep_gmail_metadata_access",
            "Deep Gmail metadata access",
            "Skipped because no connected mailbox record exists.",
            "setup",
          ),
        );
        checks.push(
          this.warnCheck(
            "deep_google_calendar_access",
            "Deep Google Calendar access",
            "Skipped because no connected mailbox record exists.",
            "setup",
          ),
        );
        checks.push(
          this.warnCheck(
            "deep_google_calendar_write_access",
            "Deep Google Calendar write access",
            "Skipped because no connected mailbox record exists.",
            "setup",
          ),
        );
      } else {
        try {
          const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
          this.assertStoredMailboxMatches(stored.email);
          const profile = await this.dependencies.getGmailProfile(stored.tokensJson, stored.clientConfig);
          const profileEmail = profile.profile.emailAddress ?? "";
          if (profileEmail && (!this.config.gmailAccountEmail || profileEmail === this.config.gmailAccountEmail)) {
            checks.push(
              this.passCheck(
                "deep_gmail_profile_matches",
                "Deep Gmail verification",
                `Live Gmail profile check succeeded for ${profileEmail}.`,
                "runtime",
              ),
            );
          } else {
            checks.push(
              this.failCheck(
                "deep_gmail_profile_matches",
                "Deep Gmail verification",
                `Live Gmail profile ${profileEmail} does not match configured mailbox ${this.config.gmailAccountEmail}.`,
                "runtime",
              ),
            );
          }
        } catch (error) {
          checks.push(
            this.failCheck(
              "deep_gmail_profile_matches",
              "Deep Gmail verification",
              explainGoogleGrantFailure(error, mailAccount.email),
              "runtime",
            ),
          );
        }
        try {
          const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
          this.assertStoredMailboxMatches(stored.email);
          await this.dependencies.verifyGmailMetadataAccess(stored.tokensJson, stored.clientConfig);
          checks.push(
            this.passCheck(
              "deep_gmail_metadata_access",
              "Deep Gmail metadata access",
              `Live Gmail metadata check succeeded for ${stored.email}.`,
              "runtime",
            ),
          );
        } catch (error) {
          checks.push(
            this.failCheck(
              "deep_gmail_metadata_access",
              "Deep Gmail metadata access",
              explainGoogleGrantFailure(error, mailAccount.email),
              "runtime",
            ),
          );
        }
        try {
          const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
          this.assertStoredMailboxMatches(stored.email);
          await this.dependencies.verifyGoogleCalendarAccess(stored.tokensJson, stored.clientConfig);
          checks.push(
            this.passCheck(
              "deep_google_calendar_access",
              "Deep Google Calendar access",
              `Live Google Calendar read check succeeded for ${stored.email}.`,
              "runtime",
            ),
          );
        } catch (error) {
          checks.push(
            this.failCheck(
              "deep_google_calendar_access",
              "Deep Google Calendar access",
              explainGoogleGrantFailure(error, mailAccount.email),
              "runtime",
            ),
          );
        }
        try {
          const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
          this.assertStoredMailboxMatches(stored.email);
          await this.dependencies.verifyGoogleCalendarWriteAccess(stored.tokensJson, stored.clientConfig);
          checks.push(
            this.passCheck(
              "deep_google_calendar_write_access",
              "Deep Google Calendar write access",
              `Live Google Calendar write-scope check succeeded for ${stored.email}.`,
              "runtime",
            ),
          );
        } catch (error) {
          checks.push(
            this.failCheck(
              "deep_google_calendar_write_access",
              "Deep Google Calendar write access",
              explainGoogleGrantFailure(error, mailAccount.email),
              "runtime",
            ),
          );
        }
        if (!this.config.driveEnabled) {
          checks.push(
            this.passCheck(
              "deep_google_drive_access",
              "Deep Google Drive access",
              "Drive integration is disabled, so Drive access is not required.",
              "integration",
            ),
          );
        } else {
          try {
            const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
            this.assertStoredMailboxMatches(stored.email);
            const scopes = await this.dependencies.verifyGoogleDriveScopes(stored.tokensJson, stored.clientConfig);
            const missing = [
              "https://www.googleapis.com/auth/drive.metadata.readonly",
              "https://www.googleapis.com/auth/documents.readonly",
              "https://www.googleapis.com/auth/spreadsheets.readonly",
            ].filter((scope) => !scopes.includes(scope));
            if (missing.length === 0) {
              checks.push(
                this.passCheck(
                  "deep_google_drive_access",
                  "Deep Google Drive access",
                  `Live Drive, Docs, and Sheets scope check succeeded for ${stored.email}.`,
                  "integration",
                ),
              );
            } else {
              checks.push(
                this.failCheck(
                  "deep_google_drive_access",
                  "Deep Google Drive access",
                  `Google grant is missing required Drive/Docs/Sheets scopes: ${missing.join(", ")}. Run \`personal-ops auth google login\` again.`,
                  "integration",
                ),
              );
            }
          } catch (error) {
            checks.push(
              this.failCheck(
                "deep_google_drive_access",
                "Deep Google Drive access",
                explainGoogleGrantFailure(error, mailAccount.email),
                "integration",
              ),
            );
          }
        }
      }
    }

    return checks;
  }

  private getApprovalContext(approvalId: string): ApprovalContext {
    const approval = this.db.getApprovalRequest(approvalId);
    if (!approval) {
      throw new Error(`Approval request ${approvalId} was not found.`);
    }
    const draft = this.db.getDraftArtifact(approval.artifact_id);
    if (!draft) {
      throw new Error(`Draft artifact ${approval.artifact_id} linked to approval ${approvalId} was not found.`);
    }
    return { approval, draft };
  }

  private getRelatedAuditEvents(...targetIds: Array<string | undefined>): AuditEvent[] {
    const ids = new Set(targetIds.filter((value): value is string => Boolean(value)));
    return this.listAuditEvents({ limit: 200 }).filter((event) => {
      if (ids.has(event.target_id)) {
        return true;
      }
      try {
        const metadata = JSON.parse(event.metadata_json) as Record<string, unknown>;
        return Object.values(metadata).some((value) => typeof value === "string" && ids.has(value));
      } catch {
        return false;
      }
    }).slice(0, 20);
  }

  private computeDraftDigest(draft: DraftArtifact): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
          body_text: draft.body_text ?? "",
          body_html: draft.body_html ?? "",
        }),
      )
      .digest("hex");
  }

  private computeRiskFlags(draft: DraftArtifact): ApprovalRiskFlags {
    const recipients = [...draft.to, ...draft.cc, ...draft.bcc];
    const mailbox = this.config.gmailAccountEmail || draft.mailbox;
    const mailboxDomain = mailbox.includes("@") ? mailbox.split("@").at(-1)?.toLowerCase() ?? "" : "";
    const recipientDomains = recipients
      .map((recipient) => recipient.split("@").at(-1)?.toLowerCase() ?? "")
      .filter(Boolean);
    return {
      multiple_recipients: recipients.length > 1,
      cc_present: draft.cc.length > 0,
      bcc_present: draft.bcc.length > 0,
      external_recipient_present: mailboxDomain
        ? recipientDomains.some((domain) => domain !== mailboxDomain)
        : recipients.length > 0,
      empty_body: !`${draft.body_text ?? ""}${draft.body_html ?? ""}`.trim(),
    };
  }

  private buildPolicySnapshot(): PolicySnapshot {
    return {
      allow_send: this.policy.allowSend,
      approval_ttl_hours: APPROVAL_TTL_HOURS,
    };
  }

  private summarizeApprovalQueue(approvals: ApprovalRequest[]) {
    return approvals.reduce(
      (counts, approval) => {
        if (approval.state === "pending") counts.pending += 1;
        if (approval.state === "approved") counts.approved += 1;
        if (approval.state === "sending") counts.sending += 1;
        if (approval.state === "send_failed") counts.send_failed += 1;
        return counts;
      },
      { pending: 0, approved: 0, sending: 0, send_failed: 0 },
    );
  }

  private normalizeInboxLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit) || !limit || limit <= 0) {
      return DEFAULT_INBOX_LIMIT;
    }
    return Math.min(Math.floor(limit), MAX_INBOX_LIMIT);
  }

  private listInboxThreadSummaries(
    limit: number,
    predicate?: (summary: InboxThreadSummary) => boolean,
    sorter?: (left: InboxThreadSummary, right: InboxThreadSummary) => number,
  ): InboxThreadSummary[] {
    const summaries = this.db
      .listMailThreads(MAX_INBOX_LIMIT)
      .map((thread) => this.buildInboxThreadSummary(thread))
      .filter((summary) => !predicate || predicate(summary));
    const ordered = sorter
      ? [...summaries].sort(sorter)
      : summaries.sort((left, right) => Number(right.thread.last_message_at) - Number(left.thread.last_message_at));
    return ordered.slice(0, limit);
  }

  private buildInboxThreadSummary(thread: MailThread): InboxThreadSummary {
    const messages = this.db.listMailMessagesByThread(thread.thread_id);
    const latestMessage = messages[0];
    const lastDirection = this.getLastDirection(messages, thread.mailbox);
    return {
      thread,
      latest_message: latestMessage,
      derived_kind: this.deriveInboxThreadKind(thread, messages, thread.mailbox),
      last_direction: lastDirection,
    };
  }

  private deriveInboxThreadKind(thread: MailThread, messages: MailMessage[], mailbox: string): InboxThreadKind {
    const latestMessage = messages[0];
    if (!latestMessage) {
      return "recent_activity";
    }
    const latestTime = Number(thread.last_message_at || latestMessage.internal_date || 0);
    const unreadOldCutoff = Date.now() - INBOX_UNREAD_WARNING_HOURS * 60 * 60 * 1000;
    const followupCutoff = Date.now() - FOLLOWUP_WARNING_HOURS * 60 * 60 * 1000;
    const recentCutoff = Date.now() - RECENT_ACTIVITY_HOURS * 60 * 60 * 1000;
    const latestIsMachine = this.isMachineAuthored(latestMessage, mailbox);
    const hasNewerInbound = messages.some(
      (message) => Number(message.internal_date) > Number(latestMessage.internal_date) && !this.isMachineAuthored(message, mailbox),
    );

    if (thread.in_inbox && thread.unread_count > 0 && latestTime <= unreadOldCutoff) {
      return "unread_old";
    }
    if (thread.in_inbox && !latestIsMachine && (thread.unread_count > 0 || latestTime <= unreadOldCutoff)) {
      return "needs_reply";
    }
    if (latestIsMachine && !hasNewerInbound && latestTime <= followupCutoff) {
      return "stale_followup";
    }
    if (latestIsMachine && !hasNewerInbound) {
      return "waiting_on_other_party";
    }
    if (latestTime >= recentCutoff) {
      return "recent_activity";
    }
    return latestIsMachine ? "waiting_on_other_party" : "needs_reply";
  }

  private getLastDirection(
    messages: MailMessage[],
    mailbox: string,
  ): "inbound" | "outbound" | "unknown" {
    const latestMessage = messages[0];
    if (!latestMessage) {
      return "unknown";
    }
    return this.isMachineAuthored(latestMessage, mailbox) ? "outbound" : "inbound";
  }

  private suggestedInboxCommand(summary: InboxThreadSummary): string {
    if (summary.derived_kind === "stale_followup") {
      return `personal-ops inbox followups --limit 20`;
    }
    if (summary.last_direction === "inbound") {
      return `personal-ops inbox needs-reply --limit 20`;
    }
    return `personal-ops inbox recent --limit 20`;
  }

  private isSendEnabled(activeWindow?: SendWindow | null): boolean {
    return this.policy.allowSend || Boolean(activeWindow);
  }

  private normalizeSendWindowMinutes(minutes: number): number {
    if (!Number.isFinite(minutes)) {
      return SEND_WINDOW_DEFAULT_MINUTES;
    }
    if (minutes < SEND_WINDOW_MIN_MINUTES || minutes > SEND_WINDOW_MAX_MINUTES) {
      throw new Error(
        `Send window minutes must be between ${SEND_WINDOW_MIN_MINUTES} and ${SEND_WINDOW_MAX_MINUTES}.`,
      );
    }
    return Math.floor(minutes);
  }

  private assertOperatorOnly(identity: ClientIdentity, action: string) {
    if (identity.auth_role === "assistant") {
      throw new Error(`Only the operator channel may ${action}.`);
    }
  }

  private buildAttentionItems(state: ServiceState, activeSendWindow: SendWindow | null): AttentionItem[] {
    const now = Date.now();
    const items: AttentionItem[] = [];
    const mailbox = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    const sync = mailbox ? this.db.getMailSyncState(mailbox) : null;
    const calendarSync = mailbox ? this.db.getCalendarSyncState(mailbox) : null;
    const activeRecommendations = this.db.listPlanningRecommendations({ include_resolved: false });
    const activeRecommendationKeys = this.buildActiveRecommendationKeySet(activeRecommendations);
    const planningGroups = this.groupPlanningRecommendations(activeRecommendations);
    const planningAnalytics = this.computePlanningAnalytics();
    const planningPolicyReport = this.buildPlanningPolicyReport();
    if (state === "degraded") {
      items.push({
        item_id: "system:degraded",
        kind: "system_degraded",
        severity: "critical",
        title: "System needs attention",
        summary: "System needs attention: run personal-ops doctor",
        target_type: "system",
        target_id: "personal-ops",
        created_at: new Date().toISOString(),
        due_at: new Date().toISOString(),
        suggested_command: "personal-ops doctor",
        metadata_json: JSON.stringify({ state_marker: "degraded" }),
      });
    }

    if (sync?.status === "degraded") {
      items.push({
        item_id: `sync:${sync.mailbox}:degraded`,
        kind: "sync_degraded",
        severity: "critical",
        title: "Mailbox sync degraded",
        summary: sync.last_error_message ?? "Mailbox metadata sync needs attention.",
        target_type: "mail_sync_state",
        target_id: sync.mailbox,
        created_at: sync.updated_at,
        due_at: sync.updated_at,
        suggested_command: "personal-ops inbox sync now",
        metadata_json: JSON.stringify({ state_marker: sync.updated_at, sync_state: sync.status }),
      });
    }

    if (calendarSync?.status === "degraded") {
      items.push({
        item_id: `calendar-sync:${calendarSync.account}:degraded`,
        kind: "calendar_sync_degraded",
        severity: "critical",
        title: "Calendar sync degraded",
        summary: calendarSync.last_error_message ?? "Calendar sync needs attention.",
        target_type: "calendar_sync_state",
        target_id: calendarSync.account,
        created_at: calendarSync.updated_at,
        due_at: calendarSync.updated_at,
        suggested_command: "personal-ops calendar sync now",
        metadata_json: JSON.stringify({ state_marker: calendarSync.updated_at, calendar_sync_state: calendarSync.status }),
      });
    }

    for (const pullRequest of this.db.listGithubPullRequests({ attention_only: true })) {
      if (!pullRequest.attention_kind) {
        continue;
      }
      const severity: AttentionSeverity =
        pullRequest.attention_kind === "github_pr_merge_ready" ? "info" : "warn";
      const title =
        pullRequest.attention_kind === "github_review_requested"
          ? "GitHub review requested"
          : pullRequest.attention_kind === "github_pr_checks_failing"
            ? "GitHub checks failing"
            : pullRequest.attention_kind === "github_pr_changes_requested"
              ? "GitHub changes requested"
              : "GitHub PR merge ready";
      items.push({
        item_id: `github:${pullRequest.pr_key}:${pullRequest.attention_kind}`,
        kind: pullRequest.attention_kind,
        severity,
        title,
        summary: pullRequest.attention_summary ?? `${pullRequest.repository}#${pullRequest.number} ${pullRequest.title}`,
        target_type: "github_pull_request",
        target_id: pullRequest.pr_key,
        created_at: pullRequest.created_at,
        due_at: pullRequest.updated_at,
        suggested_command: `personal-ops github pr ${pullRequest.pr_key}`,
        metadata_json: JSON.stringify({
          state_marker: pullRequest.updated_at,
          repository: pullRequest.repository,
          number: pullRequest.number,
          attention_kind: pullRequest.attention_kind,
          check_state: pullRequest.check_state,
          review_state: pullRequest.review_state,
        }),
      });
    }

    for (const review of this.db.listReviewItems()) {
      if (!["pending", "opened"].includes(review.state)) {
        continue;
      }
      const createdAt = Date.parse(review.created_at);
      const dueAt = new Date(createdAt + REVIEW_WARNING_HOURS * 60 * 60 * 1000).toISOString();
      const severity: AttentionSeverity = createdAt <= now - REVIEW_WARNING_HOURS * 60 * 60 * 1000 ? "warn" : "info";
      items.push({
        item_id: `review:${review.review_id}`,
        kind: "review_pending",
        severity,
        title: "Draft review pending",
        summary: review.subject ? `Review draft: ${review.subject}` : "Review draft awaiting attention",
        target_type: "review_item",
        target_id: review.review_id,
        created_at: review.created_at,
        due_at: dueAt,
        suggested_command: `personal-ops review show ${review.review_id}`,
        metadata_json: JSON.stringify({ state_marker: review.created_at, review_state: review.state }),
      });
    }

    for (const approval of this.listApprovalQueue({ limit: 500 })) {
      const draft = this.db.getDraftArtifact(approval.artifact_id);
      const createdAt = approval.requested_at;
      if (approval.state === "pending") {
        const dueAt = new Date(Date.parse(createdAt) + PENDING_APPROVAL_WARNING_HOURS * 60 * 60 * 1000).toISOString();
        const severity: AttentionSeverity =
          Date.parse(createdAt) <= now - PENDING_APPROVAL_WARNING_HOURS * 60 * 60 * 1000 ? "warn" : "info";
        items.push({
          item_id: `approval:${approval.approval_id}:pending`,
          kind: "approval_pending",
          severity,
          title: "Approval pending",
          summary: draft?.subject ? `Approval pending: ${draft.subject}` : "Approval pending",
          target_type: "approval_request",
          target_id: approval.approval_id,
          created_at: createdAt,
          due_at: dueAt,
          suggested_command: `personal-ops approval show ${approval.approval_id}`,
          metadata_json: JSON.stringify({ state_marker: approval.updated_at, approval_state: approval.state }),
        });
      }
      if (approval.state === "approved") {
        const expiresAt = Date.parse(approval.expires_at);
        if (expiresAt <= now + APPROVAL_EXPIRING_WARNING_MINUTES * 60 * 1000) {
          items.push({
            item_id: `approval:${approval.approval_id}:expiring`,
            kind: "approval_expiring",
            severity: "warn",
            title: "Approval expires soon",
            summary: "Approval expires soon: review or cancel",
            target_type: "approval_request",
            target_id: approval.approval_id,
            created_at: approval.updated_at,
            due_at: approval.expires_at,
            suggested_command: `personal-ops approval show ${approval.approval_id}`,
            metadata_json: JSON.stringify({ state_marker: approval.expires_at, approval_state: approval.state }),
          });
        }
      }
      if (approval.state === "send_failed") {
        items.push({
          item_id: `approval:${approval.approval_id}:send_failed`,
          kind: "approval_send_failed",
          severity: "critical",
          title: "Send failed",
          summary: approval.last_error_message
            ? `Send failed: ${approval.last_error_message}`
            : "Send failed: inspect Sent mail before reopen",
          target_type: "approval_request",
          target_id: approval.approval_id,
          created_at: approval.updated_at,
          due_at: approval.updated_at,
          suggested_command: `personal-ops approval reopen ${approval.approval_id} --note "Confirmed safe to retry"`,
          metadata_json: JSON.stringify({ state_marker: approval.updated_at, approval_state: approval.state }),
        });
      }
    }

    for (const group of planningGroups) {
      const topRecommendation = group.recommendations[0];
      if (!topRecommendation) {
        continue;
      }
      items.push({
        item_id: `planning-group:${group.group_key}`,
        kind: "planning_recommendation_group",
        severity: topRecommendation.priority === "high" ? "warn" : "info",
        title: "Planning group pending",
        summary: group.group_summary,
        target_type: "planning_recommendation_group",
        target_id: group.group_key,
        created_at: topRecommendation.created_at,
        due_at: topRecommendation.proposed_start_at,
        sort_rank: topRecommendation.rank_score,
        suggested_command: `personal-ops recommendation group show ${group.group_key}`,
        metadata_json: JSON.stringify({
          state_marker: topRecommendation.updated_at,
          group_key: group.group_key,
          pending_count: group.pending_count,
          ready_count: group.ready_count,
          manual_scheduling_count: group.manual_scheduling_count,
          recommendation_ids: group.recommendation_ids,
        }),
      });
    }

    const topReviewNeededFamily = this.getTopPlanningReviewNeededFamily(planningAnalytics.hygiene.families);
    if (planningAnalytics.summary.review_needed_count > 0 && topReviewNeededFamily) {
      const dominatingGroup = planningAnalytics.backlog.groups.find(
        (group) => group.group_key === topReviewNeededFamily.group_key,
      );
      const stateMarker = topReviewNeededFamily.signal_updated_at ?? new Date().toISOString();
      items.push({
        item_id: `planning-hygiene:${topReviewNeededFamily.group_key}:${topReviewNeededFamily.kind}:${topReviewNeededFamily.source}:review-needed`,
        kind: "planning_hygiene_review_needed",
        severity:
          topReviewNeededFamily.queue_share_pct >= 50 || Boolean(dominatingGroup?.dominates_queue) ? "warn" : "info",
        title: "Planning hygiene review needed",
        summary: topReviewNeededFamily.summary,
        target_type: "planning_recommendation_family",
        target_id: this.getPlanningRecommendationFamilyAuditTargetId(
          topReviewNeededFamily.group_key,
          topReviewNeededFamily.kind,
          topReviewNeededFamily.source,
        ),
        created_at: stateMarker,
        due_at: stateMarker,
        sort_rank:
          this.suppressionCandidatePriority(topReviewNeededFamily.recommended_action) * 1000 +
          Math.round(topReviewNeededFamily.queue_share_pct * 10),
        suggested_command: "personal-ops recommendation hygiene --review-needed-only",
        metadata_json: JSON.stringify({
          state_marker: stateMarker,
          review_needed_count: planningAnalytics.summary.review_needed_count,
          group_key: topReviewNeededFamily.group_key,
          kind: topReviewNeededFamily.kind,
          source: topReviewNeededFamily.source,
          recommended_action: topReviewNeededFamily.recommended_action,
        }),
      });
    }

    const topFollowThroughFamily = planningAnalytics.tuning.attention_families.find(
      (family) =>
        family.follow_through_state === "proposal_stale" ||
        family.follow_through_state === "reviewed_stale" ||
        family.follow_through_state === "review_needed",
    );
    if (topFollowThroughFamily) {
      const stateMarker =
        topFollowThroughFamily.proposal_updated_at ??
        topFollowThroughFamily.last_review_at ??
        topFollowThroughFamily.signal_updated_at ??
        new Date().toISOString();
      items.push({
        item_id: `planning-hygiene:${topFollowThroughFamily.group_key}:${topFollowThroughFamily.kind}:${topFollowThroughFamily.source}:followthrough`,
        kind: "planning_hygiene_followthrough_needed",
        severity: "warn",
        title: "Planning hygiene follow-through needed",
        summary: this.buildPlanningFollowThroughWorklistSummary(topFollowThroughFamily),
        target_type: "planning_recommendation_family",
        target_id: this.getPlanningRecommendationFamilyAuditTargetId(
          topFollowThroughFamily.group_key,
          topFollowThroughFamily.kind,
          topFollowThroughFamily.source,
        ),
        created_at: stateMarker,
        due_at: stateMarker,
        sort_rank:
          this.planningFollowThroughAttentionPriority(topFollowThroughFamily.follow_through_state) * 1000 +
          Math.round(topFollowThroughFamily.queue_share_pct * 10),
        suggested_command: "personal-ops recommendation tuning",
        metadata_json: JSON.stringify({
          state_marker: stateMarker,
          group_key: topFollowThroughFamily.group_key,
          kind: topFollowThroughFamily.kind,
          source: topFollowThroughFamily.source,
          follow_through_state: topFollowThroughFamily.follow_through_state,
          proposal_status: topFollowThroughFamily.proposal_status,
        }),
      });
    }

    const policyAttention = this.selectPlanningPolicyAttention({
      recentPolicyExits: planningPolicyReport.recent_policy_exits,
      policyHistoryFamilies: planningPolicyReport.policy_history_families,
      retentionCandidates: planningPolicyReport.retention_candidates,
    });
    if (policyAttention.worklist_kind === "planning_policy_governance_needed") {
      const stateMarker = policyAttention.state_marker ?? new Date().toISOString();
      items.push({
        item_id: `planning-policy:${policyAttention.group_key}:${policyAttention.kind_value}:${policyAttention.source}:governance`,
        kind: "planning_policy_governance_needed",
        severity: "info",
        title: "Planning policy governance needed",
        summary: policyAttention.summary ?? "Review the current policy attention item.",
        target_type: "planning_recommendation_family",
        target_id: this.getPlanningRecommendationFamilyAuditTargetId(
          policyAttention.group_key ?? "",
          policyAttention.kind_value ?? "schedule_task_block",
          policyAttention.source ?? "system_generated",
        ),
        created_at: stateMarker,
        due_at: stateMarker,
        suggested_command: "personal-ops recommendation policy",
        metadata_json: JSON.stringify({
          state_marker: stateMarker,
          governance_kind: policyAttention.kind,
          group_key: policyAttention.group_key,
          kind: policyAttention.kind_value,
          source: policyAttention.source,
        }),
      });
    }

    if (policyAttention.worklist_kind === "planning_policy_retention_review_needed") {
      const stateMarker = policyAttention.state_marker ?? new Date().toISOString();
      items.push({
        item_id: `planning-policy:${policyAttention.governance_event_id}:retention`,
        kind: "planning_policy_retention_review_needed",
        severity: "info",
        title: "Planning policy retention review needed",
        summary: policyAttention.summary ?? "Review the current policy retention candidate.",
        target_type: "planning_recommendation_policy_history",
        target_id: policyAttention.governance_event_id ?? "",
        created_at: stateMarker,
        due_at: stateMarker,
        suggested_command: "personal-ops recommendation policy",
        metadata_json: JSON.stringify({
          state_marker: stateMarker,
          governance_kind: "retention_candidate",
          governance_event_type: policyAttention.governance_event_type,
          group_key: policyAttention.group_key,
          kind: policyAttention.kind_value,
          source: policyAttention.source,
        }),
      });
    }

    const rawPlanningItemsByGroup = new Map<string, number>();
    for (const recommendation of activeRecommendations) {
      const snoozedUntilMs = recommendation.snoozed_until ? Date.parse(recommendation.snoozed_until) : Number.NaN;
      if (
        recommendation.status === "snoozed" &&
        Number.isFinite(snoozedUntilMs) &&
        snoozedUntilMs <= now + PLANNING_SNOOZE_WARNING_MINUTES * 60 * 1000
      ) {
        items.push({
          item_id: `planning-recommendation:${recommendation.recommendation_id}:snooze-expiring`,
          kind: "planning_recommendation_snooze_expiring",
          severity: "info",
          title: "Planning recommendation snooze ends soon",
          summary: recommendation.reason_summary,
          target_type: "planning_recommendation",
          target_id: recommendation.recommendation_id,
          created_at: recommendation.updated_at,
          due_at: recommendation.snoozed_until,
          sort_rank: recommendation.rank_score,
          suggested_command: `personal-ops recommendation show ${recommendation.recommendation_id}`,
          metadata_json: JSON.stringify({ state_marker: recommendation.updated_at, recommendation_status: recommendation.status }),
        });
      }
      if (recommendation.status !== "pending") {
        continue;
      }
      if (recommendation.group_key) {
        const currentCount = rawPlanningItemsByGroup.get(recommendation.group_key) ?? 0;
        if (currentCount >= 2) {
          continue;
        }
        rawPlanningItemsByGroup.set(recommendation.group_key, currentCount + 1);
      }
      items.push({
        item_id: `planning-recommendation:${recommendation.recommendation_id}:pending`,
        kind: "planning_recommendation_pending",
        severity: recommendation.priority === "high" ? "warn" : "info",
        title: "Planning recommendation pending",
        summary: recommendation.reason_summary,
        target_type: "planning_recommendation",
        target_id: recommendation.recommendation_id,
        created_at: recommendation.created_at,
        due_at: recommendation.proposed_start_at,
        sort_rank: recommendation.rank_score,
        suggested_command: `personal-ops recommendation show ${recommendation.recommendation_id}`,
        metadata_json: JSON.stringify({
          state_marker: recommendation.updated_at,
          recommendation_status: recommendation.status,
          rank_score: recommendation.rank_score,
          group_key: recommendation.group_key ?? null,
        }),
      });
    }

    for (const task of this.db.listTasks()) {
      if (["completed", "canceled"].includes(task.state)) {
        continue;
      }
      const dueAtMs = task.due_at ? Date.parse(task.due_at) : Number.NaN;
      const remindAtMs = task.remind_at ? Date.parse(task.remind_at) : Number.NaN;
      const staleThresholdMs = Date.parse(task.updated_at) + TASK_IN_PROGRESS_STALE_HOURS * 60 * 60 * 1000;
      const subject = task.title;
      const linkedEvent =
        task.scheduled_calendar_event_id ? this.db.getCalendarEvent(task.scheduled_calendar_event_id) : null;
      const hasActiveLinkedEvent = Boolean(linkedEvent && linkedEvent.status !== "cancelled");
      if (Number.isFinite(dueAtMs) && dueAtMs < now) {
        items.push({
          item_id: `task:${task.task_id}:overdue`,
          kind: "task_overdue",
          severity: task.priority === "high" ? "critical" : "warn",
          title: "Task is overdue",
          summary: `Task overdue: ${subject}`,
          target_type: "task",
          target_id: task.task_id,
          created_at: task.created_at,
          due_at: task.due_at,
          suggested_command: `personal-ops task show ${task.task_id}`,
          metadata_json: JSON.stringify({ state_marker: task.updated_at, task_state: task.state }),
        });
        continue;
      }
      if (
        task.priority === "high" &&
        Number.isFinite(dueAtMs) &&
        dueAtMs <= now + TASK_DUE_SOON_HOURS * 60 * 60 * 1000 &&
        !hasActiveLinkedEvent &&
        !activeRecommendationKeys.has(this.makeRecommendationDedupeKey("schedule_task_block", { task_id: task.task_id }))
      ) {
        items.push({
          item_id: `task:${task.task_id}:unscheduled_due_soon`,
          kind: "task_unscheduled_due_soon",
          severity: dueAtMs <= now + 12 * 60 * 60 * 1000 ? "critical" : "warn",
          title: "High-priority task is due soon without a time block",
          summary: `Schedule time for: ${subject}`,
          target_type: "task",
          target_id: task.task_id,
          created_at: task.created_at,
          due_at: task.due_at,
          suggested_command: `personal-ops calendar schedule-task ${task.task_id} --start-at <utc> --end-at <utc>`,
          metadata_json: JSON.stringify({ state_marker: task.due_at, task_state: task.state }),
        });
      }
      if (Number.isFinite(remindAtMs) && remindAtMs <= now) {
        items.push({
          item_id: `task:${task.task_id}:reminder_due`,
          kind: "task_reminder_due",
          severity: "warn",
          title: "Task reminder is due",
          summary: `Reminder due: ${subject}`,
          target_type: "task",
          target_id: task.task_id,
          created_at: task.created_at,
          due_at: task.remind_at,
          suggested_command: `personal-ops task show ${task.task_id}`,
          metadata_json: JSON.stringify({ state_marker: task.remind_at, task_state: task.state }),
        });
      } else if (Number.isFinite(dueAtMs) && dueAtMs <= now + TASK_DUE_SOON_HOURS * 60 * 60 * 1000) {
        items.push({
          item_id: `task:${task.task_id}:due_soon`,
          kind: "task_due_soon",
          severity: task.priority === "high" ? "warn" : "info",
          title: "Task due soon",
          summary: `Task due soon: ${subject}`,
          target_type: "task",
          target_id: task.task_id,
          created_at: task.created_at,
          due_at: task.due_at,
          suggested_command: `personal-ops task show ${task.task_id}`,
          metadata_json: JSON.stringify({ state_marker: task.due_at, task_state: task.state }),
        });
      }
      if (task.state === "in_progress" && staleThresholdMs <= now) {
        items.push({
          item_id: `task:${task.task_id}:stale`,
          kind: "task_in_progress_stale",
          severity: "info",
          title: "In-progress task is stale",
          summary: `In-progress task needs a refresh: ${subject}`,
          target_type: "task",
          target_id: task.task_id,
          created_at: task.updated_at,
          due_at: new Date(staleThresholdMs).toISOString(),
          suggested_command: `personal-ops task show ${task.task_id}`,
          metadata_json: JSON.stringify({ state_marker: task.updated_at, task_state: task.state }),
        });
      }
      if (linkedEvent && Date.parse(linkedEvent.end_at) < now) {
        items.push({
          item_id: `task:${task.task_id}:scheduled_stale`,
          kind: "scheduled_task_stale",
          severity: "info",
          title: "Scheduled task block is in the past",
          summary: `Task still active after its reserved time: ${subject}`,
          target_type: "task",
          target_id: task.task_id,
          created_at: linkedEvent.end_at,
          due_at: linkedEvent.end_at,
          suggested_command: `personal-ops task show ${task.task_id}`,
          metadata_json: JSON.stringify({ state_marker: linkedEvent.end_at, linked_event_id: linkedEvent.event_id }),
        });
      }
      if (linkedEvent && this.hasCalendarConflictForEvent(linkedEvent)) {
        items.push({
          item_id: `task:${task.task_id}:scheduled_conflict`,
          kind: "scheduled_task_conflict",
          severity: "warn",
          title: "Scheduled task block conflicts with another event",
          summary: `Reserved task time conflicts on the calendar: ${subject}`,
          target_type: "task",
          target_id: task.task_id,
          created_at: linkedEvent.start_at,
          due_at: linkedEvent.start_at,
          suggested_command: `personal-ops calendar event ${linkedEvent.event_id}`,
          metadata_json: JSON.stringify({ state_marker: linkedEvent.updated_at, linked_event_id: linkedEvent.event_id }),
        });
      }
      if (
        task.state === "pending" &&
        task.priority === "high" &&
        task.due_at &&
        Date.parse(task.due_at) <= now + TASK_DUE_SOON_HOURS * 60 * 60 * 1000 &&
        !hasActiveLinkedEvent &&
        !activeRecommendationKeys.has(this.makeRecommendationDedupeKey("schedule_task_block", { task_id: task.task_id }))
      ) {
        const freeMinutes = this.computeFreeMinutesBefore(task.due_at);
        if (freeMinutes < this.config.schedulePressureFreeMinutesThreshold) {
          const dueAtMs = Date.parse(task.due_at);
          items.push({
            item_id: `task:${task.task_id}:schedule_pressure`,
            kind: "task_schedule_pressure",
            severity: dueAtMs <= now + 12 * 60 * 60 * 1000 ? "critical" : "warn",
            title: "High-priority task needs schedule room",
            summary: `High-priority task may not fit before due time: ${task.title}`,
            target_type: "task",
            target_id: task.task_id,
            created_at: task.created_at,
            due_at: task.due_at,
            suggested_command: `personal-ops task show ${task.task_id}`,
            metadata_json: JSON.stringify({ state_marker: task.due_at, free_minutes: freeMinutes }),
          });
        }
      }
    }

    for (const suggestion of this.db.listTaskSuggestions({ status: "pending" })) {
      const createdAt = Date.parse(suggestion.created_at);
      const dueAt = new Date(createdAt + TASK_SUGGESTION_WARN_HOURS * 60 * 60 * 1000).toISOString();
      const severity: AttentionSeverity =
        suggestion.priority === "high" && createdAt <= now - TASK_SUGGESTION_WARN_HOURS * 60 * 60 * 1000
          ? "warn"
          : createdAt <= now - TASK_SUGGESTION_WARN_HOURS * 60 * 60 * 1000
            ? "warn"
            : "info";
      items.push({
        item_id: `task-suggestion:${suggestion.suggestion_id}:pending`,
        kind: "task_suggestion_pending",
        severity,
        title: "Task suggestion pending",
        summary: `Suggested task: ${suggestion.title}`,
        target_type: "task_suggestion",
        target_id: suggestion.suggestion_id,
        created_at: suggestion.created_at,
        due_at: dueAt,
        suggested_command: `personal-ops suggestion show ${suggestion.suggestion_id}`,
        metadata_json: JSON.stringify({ state_marker: suggestion.updated_at, suggestion_status: suggestion.status }),
      });
    }

    for (const summary of this.listInboxThreadSummaries(MAX_INBOX_LIMIT)) {
      const latestAtIso = this.mailTimestampToIso(summary.thread.last_message_at, summary.thread.last_synced_at);
      const hasPlanningRecommendation =
        (summary.derived_kind === "needs_reply" || summary.derived_kind === "stale_followup") &&
        activeRecommendationKeys.has(
          this.makeRecommendationDedupeKey("schedule_thread_followup", { thread_id: summary.thread.thread_id }),
        );
      if (summary.derived_kind === "unread_old") {
        items.push({
          item_id: `thread:${summary.thread.thread_id}:unread_old`,
          kind: "inbox_unread_old",
          severity: "warn",
          title: "Unread inbox thread is aging",
          summary: summary.latest_message?.subject
            ? `Inbox thread: ${summary.latest_message.subject}`
            : "An inbox thread is aging without a reply.",
          target_type: "mail_thread",
          target_id: summary.thread.thread_id,
          created_at: latestAtIso,
          due_at: latestAtIso,
          suggested_command: `personal-ops inbox thread ${summary.thread.thread_id}`,
          metadata_json: JSON.stringify({ state_marker: summary.thread.last_message_at, thread_kind: "unread_old" }),
        });
      } else if (summary.derived_kind === "needs_reply" && !hasPlanningRecommendation) {
        const dueAt = new Date(Date.parse(latestAtIso) + INBOX_UNREAD_WARNING_HOURS * 60 * 60 * 1000).toISOString();
        items.push({
          item_id: `thread:${summary.thread.thread_id}:needs_reply`,
          kind: "thread_needs_reply",
          severity: "info",
          title: "Inbox thread may need a reply",
          summary: summary.latest_message?.subject
            ? `Inbox thread: ${summary.latest_message.subject}`
            : "An inbox thread may need attention.",
          target_type: "mail_thread",
          target_id: summary.thread.thread_id,
          created_at: latestAtIso,
          due_at: dueAt,
          suggested_command: `personal-ops inbox thread ${summary.thread.thread_id}`,
          metadata_json: JSON.stringify({ state_marker: summary.thread.last_message_at, thread_kind: "needs_reply" }),
        });
      } else if (summary.derived_kind === "stale_followup" && !hasPlanningRecommendation) {
        items.push({
          item_id: `thread:${summary.thread.thread_id}:stale_followup`,
          kind: "thread_stale_followup",
          severity: "warn",
          title: "Follow-up thread is stale",
          summary: summary.latest_message?.subject
            ? `Sent follow-up awaiting reply: ${summary.latest_message.subject}`
            : "A sent follow-up may need attention.",
          target_type: "mail_thread",
          target_id: summary.thread.thread_id,
          created_at: latestAtIso,
          due_at: latestAtIso,
          suggested_command: `personal-ops inbox thread ${summary.thread.thread_id}`,
          metadata_json: JSON.stringify({ state_marker: summary.thread.last_message_at, thread_kind: "stale_followup" }),
        });
      }
    }

    if (mailbox && this.config.calendarEnabled) {
      const upcomingEvents = this.listUpcomingCalendarEvents(1, MAX_INBOX_LIMIT);
      for (const event of upcomingEvents) {
        if (event.is_all_day || event.status === "cancelled") {
          continue;
        }
        if (
          activeRecommendationKeys.has(
            this.makeRecommendationDedupeKey("schedule_event_prep", { calendar_event_id: event.event_id }),
          )
        ) {
          continue;
        }
        const startMs = Date.parse(event.start_at);
        if (startMs > now + this.config.meetingPrepWarningMinutes * 60 * 1000) {
          break;
        }
        items.push({
          item_id: `calendar-event:${event.event_id}:soon`,
          kind: "calendar_event_soon",
          severity: startMs <= now + 15 * 60 * 1000 ? "warn" : "info",
          title: "Event starting soon",
          summary: event.summary ? `Starts soon: ${event.summary}` : "An event is starting soon.",
          target_type: "calendar_event",
          target_id: event.event_id,
          created_at: event.updated_at,
          due_at: event.start_at,
          suggested_command: `personal-ops calendar event ${event.event_id}`,
          metadata_json: JSON.stringify({ state_marker: event.start_at }),
        });
      }

      const upcomingConflicts = this.listCalendarConflicts(1);
      for (const conflict of upcomingConflicts) {
        items.push({
          item_id: `calendar-conflict:${conflict.conflict_id}`,
          kind: "calendar_conflict",
          severity: "warn",
          title: "Calendar conflict",
          summary: `${conflict.left_event.summary ?? "Event"} overlaps ${conflict.right_event.summary ?? "event"}`,
          target_type: "calendar_conflict",
          target_id: conflict.conflict_id,
          created_at: conflict.overlap_start_at,
          due_at: conflict.overlap_start_at,
          suggested_command: `personal-ops calendar day ${conflict.day}`,
          metadata_json: JSON.stringify({ state_marker: conflict.overlap_start_at }),
        });
      }

      const overloadedDays = new Set<string>();
      for (const event of this.listUpcomingCalendarEvents(7, 500)) {
        const day = this.formatLocalDay(new Date(event.start_at));
        if (overloadedDays.has(day) || !this.isDayOverloaded(day)) {
          continue;
        }
        overloadedDays.add(day);
        items.push({
          item_id: `calendar-day:${day}:overloaded`,
          kind: "calendar_day_overloaded",
          severity: "warn",
          title: "Calendar day looks overloaded",
          summary: `Calendar load is high on ${day}.`,
          target_type: "calendar_day",
          target_id: day,
          created_at: new Date(`${day}T00:00:00`).toISOString(),
          due_at: new Date(`${day}T09:00:00`).toISOString(),
          suggested_command: `personal-ops calendar day ${day}`,
          metadata_json: JSON.stringify({ state_marker: day }),
        });
      }
    }

    if (activeSendWindow) {
      const expiresAt = Date.parse(activeSendWindow.expires_at);
      if (expiresAt <= now + SEND_WINDOW_EXPIRING_WARNING_MINUTES * 60 * 1000) {
        items.push({
          item_id: `send-window:${activeSendWindow.window_id}:expiring`,
          kind: "send_window_expiring",
          severity: "warn",
          title: "Send window expires soon",
          summary: "Send window expires soon: complete or reopen later",
          target_type: "send_window",
          target_id: activeSendWindow.window_id,
          created_at: activeSendWindow.enabled_at,
          due_at: activeSendWindow.expires_at,
          suggested_command: "personal-ops send-window status",
          metadata_json: JSON.stringify({ state_marker: activeSendWindow.expires_at, send_window_state: activeSendWindow.state }),
        });
      }
    }

    return items.sort((left, right) => this.compareAttentionItems(left, right));
  }

  private systemPlanningIdentity(trigger: string): ClientIdentity {
    return {
      client_id: "personal-ops-system",
      requested_by: trigger,
      origin: "daemon",
      auth_role: "operator",
    };
  }

  private mergeAutopilotRequests(
    existing: AutopilotRunRequest | null,
    next: AutopilotRunRequest,
  ) {
    if (!existing) {
      return next;
    }
    if (!existing.requestedProfile || !next.requestedProfile || existing.requestedProfile !== next.requestedProfile) {
      return {
        trigger: next.manual ? next.trigger : existing.manual ? existing.trigger : "sync",
        requestedProfile: null,
        httpReachable: existing.httpReachable || next.httpReachable,
        manual: existing.manual || next.manual,
      };
    }
    return {
      trigger: next.manual ? next.trigger : existing.trigger,
      requestedProfile: existing.requestedProfile,
      httpReachable: existing.httpReachable || next.httpReachable,
      manual: existing.manual || next.manual,
    };
  }

  private buildActiveRecommendationKeySet(recommendations: PlanningRecommendation[]): Set<string> {
    return new Set(
      recommendations
        .filter((recommendation) => ["pending", "snoozed"].includes(recommendation.status))
        .map((recommendation) => recommendation.dedupe_key),
    );
  }

  private makeRecommendationDedupeKey(
    kind: PlanningRecommendationKind,
    ids: { task_id?: string; thread_id?: string; calendar_event_id?: string },
  ): string {
    if (kind === "schedule_task_block" && ids.task_id) {
      return `${kind}:${ids.task_id}`;
    }
    if (kind === "schedule_thread_followup" && ids.thread_id) {
      return `${kind}:${ids.thread_id}`;
    }
    if (kind === "schedule_event_prep" && ids.calendar_event_id) {
      return `${kind}:${ids.calendar_event_id}`;
    }
    throw new Error(`Cannot build dedupe key for ${kind}.`);
  }

  private makeTaskRecommendationFingerprint(task: TaskItem): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          task_id: task.task_id,
          state: task.state,
          priority: task.priority,
          due_at: task.due_at ?? null,
          remind_at: task.remind_at ?? null,
          updated_at: task.updated_at,
          scheduled_calendar_event_id: task.scheduled_calendar_event_id ?? null,
        }),
      )
      .digest("hex");
  }

  private makeThreadRecommendationFingerprint(summary: InboxThreadSummary): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          thread_id: summary.thread.thread_id,
          last_message_at: summary.thread.last_message_at,
          unread_count: summary.thread.unread_count,
          derived_kind: summary.derived_kind,
          last_direction: summary.last_direction,
        }),
      )
      .digest("hex");
  }

  private makeEventRecommendationFingerprint(event: CalendarEvent): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          event_id: event.event_id,
          summary: event.summary ?? null,
          start_at: event.start_at,
          end_at: event.end_at,
          updated_at: event.updated_at,
          status: event.status,
        }),
      )
      .digest("hex");
  }

  private groupPlanningRecommendations(recommendations: PlanningRecommendation[]): PlanningRecommendationGroup[] {
    const grouped = new Map<string, PlanningRecommendation[]>();
    for (const recommendation of recommendations) {
      if (recommendation.status !== "pending" || !recommendation.group_key) {
        continue;
      }
      const current = grouped.get(recommendation.group_key) ?? [];
      current.push(recommendation);
      grouped.set(recommendation.group_key, current);
    }
    return [...grouped.entries()]
      .map(([groupKey, items]) => {
        const ordered = [...items].sort((left, right) => this.compareNextActionableRecommendations(left, right));
        const top = ordered[0]!;
        return {
          group_key: groupKey,
          group_kind: this.asPlanningRecommendationGroupKind(groupKey),
          group_summary: this.describeRecommendationGroup(this.asPlanningRecommendationGroupKind(groupKey), ordered.length),
          pending_count: ordered.length,
          ready_count: ordered.filter((item) => item.slot_state === "ready").length,
          manual_scheduling_count: ordered.filter((item) => item.slot_state === "needs_manual_scheduling").length,
          top_recommendation_id: top.recommendation_id,
          top_rank_score: top.rank_score,
          top_rank_reason: top.rank_reason,
          recommendation_ids: ordered.map((item) => item.recommendation_id),
          recommendations: ordered,
        };
      })
      .sort((left, right) => right.top_rank_score - left.top_rank_score || left.group_summary.localeCompare(right.group_summary));
  }

  private buildPlanningRecommendationGroupDetail(
    groupKey: string,
    recommendations: PlanningRecommendation[],
  ): PlanningRecommendationGroupDetail {
    const ordered = [...recommendations].sort((left, right) => this.compareNextActionableRecommendations(left, right));
    const countsByStatus: Record<PlanningRecommendationStatus, number> = {
      pending: 0,
      applied: 0,
      rejected: 0,
      snoozed: 0,
      expired: 0,
      superseded: 0,
    };
    const countsByOutcomeState: Record<PlanningRecommendationOutcomeState, number> = {
      none: 0,
      scheduled: 0,
      completed: 0,
      canceled: 0,
      dismissed: 0,
      handled_elsewhere: 0,
      source_resolved: 0,
    };
    const countsBySlotState: Record<PlanningRecommendationSlotState, number> = {
      ready: 0,
      needs_manual_scheduling: 0,
    };
    for (const recommendation of ordered) {
      countsByStatus[recommendation.status] += 1;
      countsByOutcomeState[recommendation.outcome_state] += 1;
      countsBySlotState[recommendation.slot_state] += 1;
    }
    const pendingCount = countsByStatus.pending;
    const groupKind = this.asPlanningRecommendationGroupKind(groupKey);
    const nextActionableRecommendation = ordered.find((recommendation) => recommendation.status === "pending");
    const unresolvedRecommendations = ordered.filter((recommendation) => ["pending", "snoozed", "applied"].includes(recommendation.status));
    const oldestUnresolvedRecommendation = [...unresolvedRecommendations].sort(
      (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
    )[0];
    const stalePendingCount = unresolvedRecommendations.filter((recommendation) => this.isPlanningRecommendationStalePending(recommendation)).length;
    const staleScheduledCount = unresolvedRecommendations.filter((recommendation) =>
      this.isPlanningRecommendationStaleScheduled(recommendation),
    ).length;
    const resurfacedSourceCount = unresolvedRecommendations.filter((recommendation) =>
      this.isPlanningRecommendationResurfaced(recommendation, recommendations),
    ).length;
    const completedLast30d = recommendations.filter((recommendation) =>
      this.isPlanningRecommendationOutcomeWithinDays(recommendation, "completed", PLANNING_CLOSED_RECENT_DAYS_LONG),
    ).length;
    const handledElsewhereLast30d = recommendations.filter((recommendation) =>
      this.isPlanningRecommendationOutcomeWithinDays(
        recommendation,
        "handled_elsewhere",
        PLANNING_CLOSED_RECENT_DAYS_LONG,
      ),
    ).length;
    const closureMix = this.buildPlanningClosureMix(recommendations);
    return {
      group_key: groupKey,
      group_kind: groupKind,
      group_summary: this.describeRecommendationGroup(groupKind, Math.max(1, pendingCount || ordered.length)),
      recommendations: ordered,
      counts_by_status: countsByStatus,
      counts_by_outcome_state: countsByOutcomeState,
      counts_by_slot_state: countsBySlotState,
      top_recommendation: ordered[0],
      next_actionable_recommendation: nextActionableRecommendation,
      oldest_unresolved_recommendation: oldestUnresolvedRecommendation,
      has_manual_scheduling_members: countsBySlotState.needs_manual_scheduling > 0,
      stale_pending_count: stalePendingCount,
      stale_scheduled_count: staleScheduledCount,
      resurfaced_source_count: resurfacedSourceCount,
      median_open_age_hours: this.calculateMedianHoursSince(
        unresolvedRecommendations.map((recommendation) => recommendation.created_at),
      ),
      closed_last_30d: closureMix.closed_last_30d,
      completed_last_30d: completedLast30d,
      handled_elsewhere_last_30d: handledElsewhereLast30d,
      source_resolved_last_30d: closureMix.source_resolved_last_30d,
      dominant_close_reason_last_30d: closureMix.dominant_close_reason_last_30d,
      closure_meaning_summary: this.buildClosureMeaningSummary({
        closedCount: closureMix.closed_last_30d,
        completedCount: closureMix.completed_last_30d,
        handledElsewhereCount: closureMix.handled_elsewhere_last_30d,
        sourceResolvedCount: closureMix.source_resolved_last_30d,
      }),
    };
  }

  private computePlanningAnalytics(
    days = PLANNING_CLOSED_RECENT_DAYS_LONG,
    backlogFilters: PlanningRecommendationBacklogFilters = {},
    closureFilters?: PlanningRecommendationClosureFilters,
    hygieneFilters: PlanningRecommendationHygieneFilters = {},
  ): PlanningAnalyticsBundle {
    const generatedAt = new Date().toISOString();
    const recommendations = this.db.listPlanningRecommendations({ include_resolved: true });
    const openRecommendations = recommendations.filter((recommendation) => this.isPlanningRecommendationOpen(recommendation));
    const normalizedBacklogFilters = this.normalizePlanningBacklogFilters(backlogFilters);
    const normalizedClosureFilters = this.normalizePlanningClosureFilters(closureFilters ?? { days });
    const normalizedHygieneFilters = this.normalizePlanningHygieneFilters(hygieneFilters);
    const hygieneReviewStates = this.listPlanningHygieneReviewStates();
    const hygieneProposalStates = this.listPlanningHygieneProposalStates();
    const familyStats = this.buildPlanningFamilyStats(
      recommendations,
      openRecommendations,
      hygieneReviewStates,
      hygieneProposalStates,
    );
    const activeFamilyStats = familyStats.filter((family) => family.open_count > 0);
    const groups = this.buildPlanningBacklogGroups(
      recommendations,
      openRecommendations,
      normalizedBacklogFilters,
      activeFamilyStats,
    );
    const closure = this.buildPlanningClosureReport(generatedAt, normalizedClosureFilters, recommendations);
    const hygiene = this.buildPlanningHygieneReport(generatedAt, normalizedHygieneFilters, activeFamilyStats);
    const followThrough = this.selectPlanningFollowThroughFamilies(activeFamilyStats, familyStats);
    const mostCompletedGroup = [...closure.by_group].sort(
      (left, right) => right.completed_count - left.completed_count || right.closed_count - left.closed_count || left.key.localeCompare(right.key),
    )[0];
    const dominantBacklogGroup = [...groups].sort(
      (left, right) =>
        right.queue_share_pct - left.queue_share_pct ||
        right.active_count - left.active_count ||
        left.group_summary.localeCompare(right.group_summary),
    )[0];
    const topSuppressionCandidate = [...hygiene.families]
      .filter((family) => ["review_source_suppression", "review_externalized_workflow"].includes(family.recommended_action))
      .sort(
      (left, right) =>
        this.suppressionCandidatePriority(right.recommended_action) - this.suppressionCandidatePriority(left.recommended_action) ||
        right.queue_share_pct - left.queue_share_pct ||
        right.open_count - left.open_count ||
        right.closed_last_30d - left.closed_last_30d ||
        left.summary.localeCompare(right.summary),
    )[0];
    const topReviewNeededCandidate = this.getTopPlanningReviewNeededFamily(hygiene.families);
    return {
      summary: {
        generated_at: generatedAt,
        open_count: openRecommendations.length,
        stale_count: groups.reduce((total, group) => total + group.stale_pending_count + group.stale_scheduled_count, 0),
        manual_scheduling_count: openRecommendations.filter((recommendation) => recommendation.slot_state === "needs_manual_scheduling").length,
        closed_last_7d: recommendations.filter((recommendation) => this.isRecommendationClosedWithinDays(recommendation, PLANNING_CLOSED_RECENT_DAYS_SHORT)).length,
        closed_last_30d: recommendations.filter((recommendation) => this.isRecommendationClosedWithinDays(recommendation, PLANNING_CLOSED_RECENT_DAYS_LONG)).length,
        most_backlogged_group: groups[0]
          ? {
              group_kind: groups[0].group_kind,
              count: groups[0].active_count,
              summary: groups[0].group_summary,
            }
          : undefined,
        most_completed_group:
          mostCompletedGroup && mostCompletedGroup.completed_count > 0
            ? {
                group_kind: this.asPlanningRecommendationGroupKind(mostCompletedGroup.key),
                completed_count: mostCompletedGroup.completed_count,
                summary: this.describeCompletedRecommendationGroup(
                  this.asPlanningRecommendationGroupKind(mostCompletedGroup.key),
                  mostCompletedGroup.completed_count,
                ),
              }
            : undefined,
        dominant_backlog_group:
          dominantBacklogGroup && dominantBacklogGroup.active_count > 0
            ? {
                group_kind: dominantBacklogGroup.group_kind,
                count: dominantBacklogGroup.active_count,
                queue_share_pct: dominantBacklogGroup.queue_share_pct,
                summary: dominantBacklogGroup.group_summary,
              }
            : undefined,
        top_suppression_candidate: topSuppressionCandidate
          ? {
              group_kind: topSuppressionCandidate.group_kind,
              kind: topSuppressionCandidate.kind,
              source: topSuppressionCandidate.source,
              recommended_action: topSuppressionCandidate.recommended_action,
              summary: topSuppressionCandidate.summary,
            }
          : undefined,
        review_needed_count: hygiene.families.filter((family) => family.review_needed).length,
        top_review_needed_candidate: topReviewNeededCandidate
          ? {
              group_kind: topReviewNeededCandidate.group_kind,
              kind: topReviewNeededCandidate.kind,
              source: topReviewNeededCandidate.source,
              recommended_action: topReviewNeededCandidate.recommended_action,
              summary: topReviewNeededCandidate.summary,
            }
          : undefined,
        reviewed_fresh_count: followThrough.reviewed_fresh,
        reviewed_stale_count: followThrough.reviewed_stale,
        proposal_open_count: followThrough.proposal_open,
        proposal_stale_count: followThrough.proposal_stale,
        proposal_dismissed_count: followThrough.proposal_dismissed,
        top_reviewed_stale_candidate: followThrough.top_reviewed_stale
          ? {
              group_kind: followThrough.top_reviewed_stale.group_kind,
              kind: followThrough.top_reviewed_stale.kind,
              source: followThrough.top_reviewed_stale.source,
              recommended_action: followThrough.top_reviewed_stale.recommended_action,
              summary: followThrough.top_reviewed_stale.summary,
            }
          : undefined,
        top_proposal_open_candidate: followThrough.top_proposal_open
          ? {
              group_kind: followThrough.top_proposal_open.group_kind,
              kind: followThrough.top_proposal_open.kind,
              source: followThrough.top_proposal_open.source,
              recommended_action: followThrough.top_proposal_open.recommended_action,
              summary: followThrough.top_proposal_open.summary,
            }
          : undefined,
        top_proposal_stale_candidate: followThrough.top_proposal_stale
          ? {
              group_kind: followThrough.top_proposal_stale.group_kind,
              kind: followThrough.top_proposal_stale.kind,
              source: followThrough.top_proposal_stale.source,
              recommended_action: followThrough.top_proposal_stale.recommended_action,
              summary: followThrough.top_proposal_stale.summary,
            }
          : undefined,
      },
      backlog: {
        generated_at: generatedAt,
        total_active_count: groups.reduce((total, group) => total + group.active_count, 0),
        filters: normalizedBacklogFilters,
        groups,
      },
      closure,
      hygiene,
      tuning: this.buildPlanningTuningReport(generatedAt, followThrough),
    };
  }

  private buildPlanningBacklogGroups(
    recommendations: PlanningRecommendation[],
    openRecommendations: PlanningRecommendation[],
    filters: PlanningRecommendationBacklogFilters,
    familyStats: PlanningRecommendationFamilyStats[],
  ): PlanningRecommendationBacklogGroupReport[] {
    const grouped = new Map<string, PlanningRecommendation[]>();
    const filteredOpenRecommendations = openRecommendations.filter((recommendation) =>
      this.matchesPlanningBacklogRecommendationFilters(recommendation, recommendations, filters),
    );
    const totalOpenRecommendations = openRecommendations.length;
    for (const recommendation of filteredOpenRecommendations) {
      const groupKey = recommendation.group_key ?? "urgent_unscheduled_tasks";
      const current = grouped.get(groupKey) ?? [];
      current.push(recommendation);
      grouped.set(groupKey, current);
    }
    return [...grouped.entries()]
      .map(([groupKey, items]) => {
        const ordered = [...items].sort((left, right) => this.compareNextActionableRecommendations(left, right));
        const countsByKind: Record<PlanningRecommendationKind, number> = {
          schedule_task_block: 0,
          schedule_thread_followup: 0,
          schedule_event_prep: 0,
        };
        for (const item of ordered) {
          countsByKind[item.kind] += 1;
        }
        const closureMix = this.buildPlanningClosureMix(
          recommendations.filter((recommendation) => (recommendation.group_key ?? "urgent_unscheduled_tasks") === groupKey),
        );
        const queueSharePct =
          totalOpenRecommendations === 0 ? 0 : Number(((ordered.length / totalOpenRecommendations) * 100).toFixed(1));
        const matchingFamilyStats = familyStats.filter((family) => family.group_key === groupKey);
        const reviewNeededCount = matchingFamilyStats.filter((family) => family.follow_through_state === "review_needed").length;
        const reviewedStaleCount = matchingFamilyStats.filter((family) => family.follow_through_state === "reviewed_stale").length;
        const proposalOpenCount = matchingFamilyStats.filter((family) => family.follow_through_state === "proposal_open").length;
        const proposalStaleCount = matchingFamilyStats.filter((family) => family.follow_through_state === "proposal_stale").length;
        const proposalDismissedCount = matchingFamilyStats.filter((family) => family.follow_through_state === "proposal_dismissed").length;
        return {
          group_key: groupKey,
          group_kind: this.asPlanningRecommendationGroupKind(groupKey),
          group_summary: this.describeRecommendationGroup(this.asPlanningRecommendationGroupKind(groupKey), ordered.length),
          active_count: ordered.length,
          counts_by_kind: countsByKind,
          stale_pending_count: ordered.filter((recommendation) => this.isPlanningRecommendationStalePending(recommendation)).length,
          stale_scheduled_count: ordered.filter((recommendation) => this.isPlanningRecommendationStaleScheduled(recommendation)).length,
          manual_scheduling_count: ordered.filter((recommendation) => recommendation.slot_state === "needs_manual_scheduling").length,
          resurfaced_source_count: ordered.filter((recommendation) =>
            this.isPlanningRecommendationResurfaced(recommendation, recommendations),
          ).length,
          median_open_age_hours: this.calculateMedianHoursSince(ordered.map((recommendation) => recommendation.created_at)),
          closed_last_30d: closureMix.closed_last_30d,
          completed_last_30d: closureMix.completed_last_30d,
          handled_elsewhere_last_30d: closureMix.handled_elsewhere_last_30d,
          source_resolved_last_30d: closureMix.source_resolved_last_30d,
          dominant_close_reason_last_30d: closureMix.dominant_close_reason_last_30d,
          queue_share_pct: queueSharePct,
          dominates_queue: queueSharePct >= 60,
          closure_meaning_summary: this.summarizeFamilyClosureMeaning(matchingFamilyStats),
          top_next_action_summary: ordered[0]?.reason_summary ?? null,
          review_needed_count: reviewNeededCount,
          reviewed_stale_count: reviewedStaleCount,
          proposal_open_count: proposalOpenCount,
          proposal_stale_count: proposalStaleCount,
          proposal_dismissed_count: proposalDismissedCount,
          tuning_summary: this.buildPlanningBacklogTuningSummary({
            reviewNeededCount,
            reviewedStaleCount,
            proposalOpenCount,
            proposalStaleCount,
            proposalDismissedCount,
          }),
        };
      })
      .sort(
        (left, right) =>
          right.active_count - left.active_count ||
          right.manual_scheduling_count - left.manual_scheduling_count ||
          right.stale_pending_count +
            right.stale_scheduled_count -
            (left.stale_pending_count + left.stale_scheduled_count) ||
          left.group_summary.localeCompare(right.group_summary),
      );
  }

  private buildPlanningClosureReport(
    generatedAt: string,
    filters: PlanningRecommendationClosureFilters,
    recommendations: PlanningRecommendation[],
  ): PlanningRecommendationClosureReport {
    const filteredRecommendations = recommendations.filter((recommendation) =>
      this.matchesPlanningClosureFilters(recommendation, filters),
    );
    const byGroup = this.buildPlanningClosureBreakdowns(
      filteredRecommendations,
      (recommendation) => recommendation.group_key ?? "ungrouped",
      filters.days,
    );
    const byKind = this.buildPlanningClosureBreakdowns(filteredRecommendations, (recommendation) => recommendation.kind, filters.days);
    const byCloseReason = this.buildPlanningClosureBreakdowns(
      filteredRecommendations.filter((recommendation) => recommendation.close_reason_code),
      (recommendation) => recommendation.close_reason_code ?? "unknown",
      filters.days,
    );
    const bySource = this.buildPlanningClosureBreakdowns(filteredRecommendations, (recommendation) => recommendation.source, filters.days);
    return {
      generated_at: generatedAt,
      days: filters.days,
      filters: {
        group: filters.group,
        kind: filters.kind,
        source: filters.source,
        close_reason: filters.close_reason,
      },
      totals: this.buildPlanningClosureBreakdown("all", filteredRecommendations, filters.days),
      by_group: byGroup,
      by_kind: byKind,
      by_close_reason: byCloseReason,
      by_source: bySource,
    };
  }

  private buildPlanningClosureBreakdowns(
    recommendations: PlanningRecommendation[],
    keyFor: (recommendation: PlanningRecommendation) => string,
    days: number,
  ): PlanningRecommendationClosureBreakdown[] {
    const grouped = new Map<string, PlanningRecommendation[]>();
    for (const recommendation of recommendations) {
      const key = keyFor(recommendation);
      const current = grouped.get(key) ?? [];
      current.push(recommendation);
      grouped.set(key, current);
    }
    return [...grouped.entries()]
      .map(([key, rows]) => this.buildPlanningClosureBreakdown(key, rows, days))
      .sort(
        (left, right) =>
          right.closed_count - left.closed_count ||
          right.first_action_count - left.first_action_count ||
          right.created_count - left.created_count ||
          left.key.localeCompare(right.key),
      );
  }

  private buildPlanningClosureBreakdown(
    key: string,
    recommendations: PlanningRecommendation[],
    days: number,
  ): PlanningRecommendationClosureBreakdown {
    const completedCount = recommendations.filter((recommendation) =>
      this.isPlanningRecommendationOutcomeWithinDays(recommendation, "completed", days),
    ).length;
    const canceledCount = recommendations.filter((recommendation) =>
      this.isPlanningRecommendationOutcomeWithinDays(recommendation, "canceled", days),
    ).length;
    const dismissedCount = recommendations.filter((recommendation) =>
      this.isPlanningRecommendationOutcomeWithinDays(recommendation, "dismissed", days),
    ).length;
    const handledElsewhereCount = recommendations.filter((recommendation) =>
      this.isPlanningRecommendationOutcomeWithinDays(recommendation, "handled_elsewhere", days),
    ).length;
    const sourceResolvedCount = recommendations.filter((recommendation) =>
      this.isPlanningRecommendationOutcomeWithinDays(recommendation, "source_resolved", days),
    ).length;
    return {
      key,
      created_count: recommendations.filter((recommendation) => this.isTimestampWithinDays(recommendation.created_at, days)).length,
      first_action_count: recommendations.filter((recommendation) => this.isTimestampWithinDays(recommendation.first_action_at, days)).length,
      closed_count: recommendations.filter((recommendation) => this.isTimestampWithinDays(recommendation.closed_at, days)).length,
      completed_count: completedCount,
      canceled_count: canceledCount,
      dismissed_count: dismissedCount,
      handled_elsewhere_count: handledElsewhereCount,
      source_resolved_count: sourceResolvedCount,
      median_time_to_first_action_minutes: this.calculateMedianMinutesBetween(
        recommendations
          .filter((recommendation) => this.isTimestampWithinDays(recommendation.first_action_at, days))
          .map((recommendation) => ({ start: recommendation.created_at, end: recommendation.first_action_at })),
      ),
      median_time_to_close_minutes: this.calculateMedianMinutesBetween(
        recommendations
          .filter((recommendation) => this.isTimestampWithinDays(recommendation.closed_at, days))
          .map((recommendation) => ({ start: recommendation.created_at, end: recommendation.closed_at })),
      ),
      closure_meaning_summary: this.buildClosureMeaningSummary({
        closedCount: recommendations.filter((recommendation) => this.isTimestampWithinDays(recommendation.closed_at, days)).length,
        completedCount,
        handledElsewhereCount,
        sourceResolvedCount,
      }),
    };
  }

  private normalizePlanningBacklogFilters(
    filters: string | PlanningRecommendationBacklogFilters,
  ): PlanningRecommendationBacklogFilters {
    if (typeof filters === "string") {
      return filters ? { group: filters } : {};
    }
    return {
      group: filters.group,
      kind: filters.kind,
      source: filters.source,
      stale_only: Boolean(filters.stale_only),
      manual_only: Boolean(filters.manual_only),
      resurfaced_only: Boolean(filters.resurfaced_only),
    };
  }

  private normalizePlanningClosureFilters(
    filters:
      | number
      | PlanningRecommendationClosureFilterInput
      | undefined,
  ): PlanningRecommendationClosureFilters {
    if (typeof filters === "number") {
      return { days: filters };
    }
    return {
      days: filters?.days ?? PLANNING_CLOSED_RECENT_DAYS_LONG,
      group: filters?.group,
      kind: filters?.kind,
      source: filters?.source,
      close_reason: filters?.close_reason,
    };
  }

  private normalizePlanningHygieneFilters(
    filters: PlanningRecommendationHygieneFilterInput,
  ): PlanningRecommendationHygieneFilters {
    return {
      group: filters.group,
      kind: filters.kind,
      source: filters.source,
      candidate_only: Boolean(filters.candidate_only),
      review_needed_only: Boolean(filters.review_needed_only),
    };
  }

  private matchesPlanningBacklogRecommendationFilters(
    recommendation: PlanningRecommendation,
    recommendations: PlanningRecommendation[],
    filters: PlanningRecommendationBacklogFilters,
  ): boolean {
    if (filters.group && recommendation.group_key !== filters.group) {
      return false;
    }
    if (filters.kind && recommendation.kind !== filters.kind) {
      return false;
    }
    if (filters.source && recommendation.source !== filters.source) {
      return false;
    }
    if (filters.stale_only && !this.isPlanningRecommendationStalePending(recommendation) && !this.isPlanningRecommendationStaleScheduled(recommendation)) {
      return false;
    }
    if (filters.manual_only && recommendation.slot_state !== "needs_manual_scheduling") {
      return false;
    }
    if (filters.resurfaced_only && !this.isPlanningRecommendationResurfaced(recommendation, recommendations)) {
      return false;
    }
    return true;
  }

  private matchesPlanningClosureFilters(
    recommendation: PlanningRecommendation,
    filters: PlanningRecommendationClosureFilters,
  ): boolean {
    if (filters.group && recommendation.group_key !== filters.group) {
      return false;
    }
    if (filters.kind && recommendation.kind !== filters.kind) {
      return false;
    }
    if (filters.source && recommendation.source !== filters.source) {
      return false;
    }
    if (filters.close_reason && recommendation.close_reason_code !== filters.close_reason) {
      return false;
    }
    return (
      this.isTimestampWithinDays(recommendation.created_at, filters.days) ||
      this.isTimestampWithinDays(recommendation.first_action_at, filters.days) ||
      this.isTimestampWithinDays(recommendation.closed_at, filters.days)
    );
  }

  private matchesPlanningHygieneFamilyFilters(
    family: PlanningRecommendationFamilyStats,
    filters: PlanningRecommendationHygieneFilters,
  ): boolean {
    if (filters.group && family.group_key !== filters.group) {
      return false;
    }
    if (filters.kind && family.kind !== filters.kind) {
      return false;
    }
    if (filters.source && family.source !== filters.source) {
      return false;
    }
    if (
      filters.candidate_only &&
      !["review_externalized_workflow", "review_source_suppression"].includes(family.recommended_action)
    ) {
      return false;
    }
    if (filters.review_needed_only && !family.review_needed) {
      return false;
    }
    return true;
  }

  private getPlanningRecommendationFamilyKey(recommendation: PlanningRecommendation): string {
    return [
      recommendation.group_key ?? "urgent_unscheduled_tasks",
      recommendation.kind,
      recommendation.source,
    ].join("::");
  }

  private getPlanningRecommendationFamilyAuditTargetId(
    groupKey: string,
    kind: PlanningRecommendationKind,
    source: PlanningRecommendationSource,
  ): string {
    return [groupKey, kind, source].join(":");
  }

  private listPlanningHygieneReviewStates(): Map<string, PlanningRecommendationHygieneReviewState> {
    const states = new Map<string, PlanningRecommendationHygieneReviewState>();
    for (const event of this.listAuditEvents({
      limit: 5000,
      action: "planning_recommendation_hygiene_review",
      target_type: "planning_recommendation_family",
    })) {
      if (states.has(event.target_id)) {
        continue;
      }
      const metadata = this.parseAuditMetadata(event);
      const decision = this.asPlanningHygieneReviewDecision(metadata.decision);
      if (!decision) {
        continue;
      }
      states.set(event.target_id, {
        last_review_at: event.timestamp,
        last_review_decision: decision,
        last_review_by_client: event.client_id,
        last_review_by_actor: typeof metadata.reviewed_by_actor === "string" ? metadata.reviewed_by_actor : null,
        last_review_note: typeof metadata.note === "string" && metadata.note.trim() ? metadata.note : null,
      });
    }
    return states;
  }

  private listPlanningHygieneProposalStates(): Map<string, PlanningHygienePolicyProposal> {
    const states = new Map<string, PlanningHygienePolicyProposal>();
    for (const proposal of this.db.listPlanningHygienePolicyProposals()) {
      states.set(
        this.getPlanningRecommendationFamilyAuditTargetId(proposal.group_key, proposal.kind, proposal.source),
        proposal,
      );
    }
    return states;
  }

  private isPlanningHygieneCandidateAction(action: PlanningRecommendationRecommendedAction): boolean {
    return action === "review_externalized_workflow" || action === "review_source_suppression";
  }

  private derivePlanningHygieneProposalType(
    action: PlanningRecommendationRecommendedAction,
  ): PlanningHygienePolicyProposalType | null {
    if (action === "review_source_suppression") {
      return "source_suppression_tuning";
    }
    if (action === "review_externalized_workflow") {
      return "externalized_workflow_tuning";
    }
    return null;
  }

  private calculateAgeDays(timestamp?: string | null): number | null {
    if (!timestamp) {
      return null;
    }
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Number((((Date.now() - parsed) / (24 * 60 * 60 * 1000))).toFixed(1));
  }

  private derivePlanningFollowThroughState(input: {
    recommendedAction: PlanningRecommendationRecommendedAction;
    reviewNeeded: boolean;
    reviewAgeDays: number | null;
    proposalStatus: PlanningHygienePolicyProposalStatus | null;
    proposalStale: boolean;
  }): PlanningRecommendationFollowThroughState | null {
    if (!this.isPlanningHygieneCandidateAction(input.recommendedAction)) {
      return null;
    }
    if (input.reviewNeeded) {
      return "review_needed";
    }
    if (input.proposalStatus === "proposed" && input.proposalStale) {
      return "proposal_stale";
    }
    if (input.proposalStatus === "proposed") {
      return "proposal_open";
    }
    if (input.reviewAgeDays !== null && input.reviewAgeDays >= PLANNING_FOLLOW_THROUGH_STALE_DAYS) {
      return "reviewed_stale";
    }
    if (input.proposalStatus === "dismissed") {
      return "proposal_dismissed";
    }
    return "reviewed_fresh";
  }

  private computePlanningHygieneSignalUpdatedAt(recommendations: PlanningRecommendation[]): string | null {
    const timestamps = recommendations
      .flatMap((recommendation) => {
        const values: string[] = [];
        if (this.isPlanningRecommendationOpen(recommendation) && recommendation.updated_at) {
          values.push(recommendation.updated_at);
        }
        if (this.isRecommendationClosedWithinDays(recommendation, PLANNING_CLOSED_RECENT_DAYS_LONG) && recommendation.closed_at) {
          values.push(recommendation.closed_at);
        }
        return values;
      })
      .filter((value) => Number.isFinite(Date.parse(value)));
    if (timestamps.length === 0) {
      return null;
    }
    return timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  }

  private selectLatestPlanningTimestamp(values: Array<string | null | undefined>): string | null {
    const timestamps = values.filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))));
    if (timestamps.length === 0) {
      return null;
    }
    return timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  }

  private buildPlanningHygieneReviewSummary(
    reviewState: PlanningRecommendationHygieneReviewState | undefined,
  ): string | null {
    if (!reviewState) {
      return null;
    }
    const actor = reviewState.last_review_by_actor ? ` by ${reviewState.last_review_by_actor}` : "";
    const note = reviewState.last_review_note ? ` Note: ${reviewState.last_review_note}` : "";
    return `Reviewed ${reviewState.last_review_at}${actor}: ${reviewState.last_review_decision}.${note}`;
  }

  private asPlanningHygieneReviewDecision(value: unknown): PlanningRecommendationHygieneReviewDecision | null {
    const decision = String(value ?? "");
    if (
      decision === "keep_visible" ||
      decision === "investigate_externalized_workflow" ||
      decision === "investigate_source_suppression" ||
      decision === "dismiss_for_now"
    ) {
      return decision;
    }
    return null;
  }

  private buildPlanningFamilyStats(
    recommendations: PlanningRecommendation[],
    openRecommendations: PlanningRecommendation[],
    hygieneReviewStates: Map<string, PlanningRecommendationHygieneReviewState>,
    hygieneProposalStates: Map<string, PlanningHygienePolicyProposal>,
  ): PlanningRecommendationFamilyStats[] {
    const openCounts = new Map<string, number>();
    const staleCounts = new Map<string, number>();
    const manualCounts = new Map<string, number>();
    const resurfacedCounts = new Map<string, number>();
    const totalOpenRecommendations = openRecommendations.length;
    for (const recommendation of openRecommendations) {
      const key = this.getPlanningRecommendationFamilyKey(recommendation);
      openCounts.set(key, (openCounts.get(key) ?? 0) + 1);
      if (this.isPlanningRecommendationStalePending(recommendation) || this.isPlanningRecommendationStaleScheduled(recommendation)) {
        staleCounts.set(key, (staleCounts.get(key) ?? 0) + 1);
      }
      if (recommendation.slot_state === "needs_manual_scheduling") {
        manualCounts.set(key, (manualCounts.get(key) ?? 0) + 1);
      }
      if (this.isPlanningRecommendationResurfaced(recommendation, recommendations)) {
        resurfacedCounts.set(key, (resurfacedCounts.get(key) ?? 0) + 1);
      }
    }
    const grouped = new Map<string, PlanningRecommendation[]>();
    for (const recommendation of recommendations) {
      const key = this.getPlanningRecommendationFamilyKey(recommendation);
      const current = grouped.get(key) ?? [];
      current.push(recommendation);
      grouped.set(key, current);
    }
    return [...grouped.entries()]
      .map(([familyKey, rows]) => {
        const sample = rows[0]!;
        const groupKey = sample.group_key ?? "urgent_unscheduled_tasks";
        const groupKind = this.asPlanningRecommendationGroupKind(groupKey);
        const closureMix = this.buildPlanningClosureMix(rows);
        const closureSignal = this.classifyPlanningClosureSignal(closureMix);
        const recommendedAction = this.recommendActionForClosureSignal(closureSignal);
        const openCount = openCounts.get(familyKey) ?? 0;
        const queueSharePct =
          totalOpenRecommendations === 0 ? 0 : Number(((openCount / totalOpenRecommendations) * 100).toFixed(1));
        const signalUpdatedAt = this.computePlanningHygieneSignalUpdatedAt(rows);
        const familyAuditTargetId = this.getPlanningRecommendationFamilyAuditTargetId(groupKey, sample.kind, sample.source);
        const reviewState = hygieneReviewStates.get(familyAuditTargetId);
        const proposalState = hygieneProposalStates.get(familyAuditTargetId);
        const reviewNeeded =
          this.isPlanningHygieneCandidateAction(recommendedAction) &&
          (!reviewState ||
            !signalUpdatedAt ||
            Date.parse(reviewState.last_review_at) < Date.parse(signalUpdatedAt));
        const reviewAgeDays = this.calculateAgeDays(reviewState?.last_review_at ?? null);
        const proposalAgeDays = this.calculateAgeDays(proposalState?.updated_at ?? null);
        const proposalStale = Boolean(
          proposalState?.status === "proposed" &&
            ((signalUpdatedAt &&
              proposalState.basis_signal_updated_at &&
              Date.parse(signalUpdatedAt) > Date.parse(proposalState.basis_signal_updated_at)) ||
              (proposalAgeDays !== null && proposalAgeDays >= PLANNING_FOLLOW_THROUGH_STALE_DAYS)),
        );
        const followThroughState = this.derivePlanningFollowThroughState({
          recommendedAction,
          reviewNeeded,
          reviewAgeDays,
          proposalStatus: proposalState?.status ?? null,
          proposalStale,
        });
        const closureMeaningSummary = this.buildClosureMeaningSummary({
          closedCount: closureMix.closed_last_30d,
          completedCount: closureMix.completed_last_30d,
          handledElsewhereCount: closureMix.handled_elsewhere_last_30d,
          sourceResolvedCount: closureMix.source_resolved_last_30d,
        });
        return {
          family_key: familyKey,
          group_key: groupKey,
          group_kind: groupKind,
          kind: sample.kind,
          source: sample.source,
          open_count: openCount,
          queue_share_pct: queueSharePct,
          stale_count: staleCounts.get(familyKey) ?? 0,
          manual_scheduling_count: manualCounts.get(familyKey) ?? 0,
          resurfaced_source_count: resurfacedCounts.get(familyKey) ?? 0,
          closed_last_30d: closureMix.closed_last_30d,
          completed_last_30d: closureMix.completed_last_30d,
          handled_elsewhere_last_30d: closureMix.handled_elsewhere_last_30d,
          source_resolved_last_30d: closureMix.source_resolved_last_30d,
          dominant_close_reason_last_30d: closureMix.dominant_close_reason_last_30d,
          closure_signal: closureSignal,
          recommended_action: recommendedAction,
          signal_updated_at: signalUpdatedAt,
          review_needed: reviewNeeded,
          last_review_at: reviewState?.last_review_at ?? null,
          last_review_decision: reviewState?.last_review_decision ?? null,
          last_review_by_client: reviewState?.last_review_by_client ?? null,
          last_review_by_actor: reviewState?.last_review_by_actor ?? null,
          last_review_note: reviewState?.last_review_note ?? null,
          review_summary: this.buildPlanningHygieneReviewSummary(reviewState),
          follow_through_state: followThroughState,
          proposal_type: proposalState?.proposal_type ?? this.derivePlanningHygieneProposalType(recommendedAction),
          proposal_status: proposalState?.status ?? null,
          proposal_created_at: proposalState?.created_at ?? null,
          proposal_updated_at: proposalState?.updated_at ?? null,
          proposal_note: proposalState?.note ?? null,
          proposal_by_client: proposalState?.updated_by_client ?? null,
          proposal_by_actor: proposalState?.updated_by_actor ?? null,
          proposal_stale: proposalStale,
          review_age_days: reviewAgeDays,
          proposal_age_days: proposalAgeDays,
          last_active_at: this.selectLatestPlanningTimestamp(rows.map((recommendation) => recommendation.updated_at ?? recommendation.created_at)),
          last_closed_at: this.selectLatestPlanningTimestamp(rows.map((recommendation) => recommendation.closed_at)),
          closure_meaning_summary: closureMeaningSummary,
          summary: this.buildPlanningHygieneSummary({
            groupKind,
            kind: sample.kind,
            source: sample.source,
            recommendedAction,
            queueSharePct,
            openCount,
            closureMix,
          }),
        };
      })
      .sort(
        (left, right) =>
          this.suppressionCandidatePriority(right.recommended_action) - this.suppressionCandidatePriority(left.recommended_action) ||
          right.queue_share_pct - left.queue_share_pct ||
          right.open_count - left.open_count ||
          right.closed_last_30d - left.closed_last_30d ||
          left.summary.localeCompare(right.summary),
      );
  }

  private buildPlanningHygieneReport(
    generatedAt: string,
    filters: PlanningRecommendationHygieneFilters,
    familyStats: PlanningRecommendationFamilyStats[],
  ): PlanningRecommendationHygieneReport {
    const families = familyStats
      .filter((family) => this.matchesPlanningHygieneFamilyFilters(family, filters))
      .map(
        (family): PlanningRecommendationHygieneFamilyReport => ({
          group_key: family.group_key,
          group_kind: family.group_kind,
          kind: family.kind,
          source: family.source,
          open_count: family.open_count,
          queue_share_pct: family.queue_share_pct,
          stale_count: family.stale_count,
          manual_scheduling_count: family.manual_scheduling_count,
          resurfaced_source_count: family.resurfaced_source_count,
          closed_last_30d: family.closed_last_30d,
          completed_last_30d: family.completed_last_30d,
          handled_elsewhere_last_30d: family.handled_elsewhere_last_30d,
          source_resolved_last_30d: family.source_resolved_last_30d,
          dominant_close_reason_last_30d: family.dominant_close_reason_last_30d,
          closure_signal: family.closure_signal,
          recommended_action: family.recommended_action,
          signal_updated_at: family.signal_updated_at,
          review_needed: family.review_needed,
          last_review_at: family.last_review_at,
          last_review_decision: family.last_review_decision,
          last_review_by_client: family.last_review_by_client,
          last_review_by_actor: family.last_review_by_actor,
          last_review_note: family.last_review_note,
          review_summary: family.review_summary,
          follow_through_state: family.follow_through_state,
          proposal_type: family.proposal_type,
          proposal_status: family.proposal_status,
          proposal_created_at: family.proposal_created_at,
          proposal_updated_at: family.proposal_updated_at,
          proposal_note: family.proposal_note,
          proposal_by_client: family.proposal_by_client,
          proposal_by_actor: family.proposal_by_actor,
          proposal_stale: family.proposal_stale,
          review_age_days: family.review_age_days,
          proposal_age_days: family.proposal_age_days,
          closure_meaning_summary: family.closure_meaning_summary,
          summary: family.summary,
        }),
      );
    return {
      generated_at: generatedAt,
      window_days: PLANNING_CLOSED_RECENT_DAYS_LONG,
      filters,
      families,
    };
  }

  private shapePlanningRecommendationHygieneReport(
    report: PlanningRecommendationHygieneReport,
    options: PlanningRecommendationReadOptions,
  ): PlanningRecommendationHygieneReport {
    if (!options.assistant_safe) {
      return report;
    }
    return {
      ...report,
      families: report.families.map((family) => ({
        ...family,
        last_review_by_client: null,
        last_review_by_actor: null,
        last_review_note: null,
        review_summary: this.buildAssistantSafePlanningReviewSummary(family),
        proposal_note: null,
        proposal_by_client: null,
        proposal_by_actor: null,
      })),
    };
  }

  private shapePlanningRecommendationTuningReport(
    report: PlanningRecommendationTuningReport,
    options: PlanningRecommendationReadOptions,
  ): PlanningRecommendationTuningReport {
    if (!options.assistant_safe) {
      return report;
    }
    return {
      ...report,
      recently_closed_families: [],
    };
  }

  private shapePlanningRecommendationDetail(
    detail: PlanningRecommendationDetail,
    options: PlanningRecommendationReadOptions,
  ): PlanningRecommendationDetail {
    if (!options.assistant_safe) {
      return detail;
    }
    const hiddenActions = new Set([
      "planning_recommendation_hygiene_review",
      "planning_recommendation_hygiene_proposal_recorded",
      "planning_recommendation_hygiene_proposal_dismissed",
      "planning_recommendation_policy_archived",
      "planning_recommendation_policy_superseded",
    ]);
    return {
      ...detail,
      related_audit_events: detail.related_audit_events.filter((event) => !hiddenActions.has(event.action)),
    };
  }

  private buildAssistantSafePlanningReviewSummary(
    family: Pick<
      PlanningRecommendationHygieneFamilyReport,
      "last_review_at" | "last_review_decision"
    >,
  ): string | null {
    if (!family.last_review_at || !family.last_review_decision) {
      return null;
    }
    return `Reviewed ${family.last_review_at}: ${family.last_review_decision}.`;
  }

  private shapeAuditEventForAssistant(event: AuditEvent): AuditEvent | null {
    const metadata = this.parseAuditEventMetadata(event.metadata_json);
    const shaped = this.buildAssistantSafeAuditShape(event.action, event.outcome, metadata);
    if (!shaped) {
      return null;
    }
    return {
      ...event,
      metadata_json: JSON.stringify(shaped.metadata),
      summary: shaped.summary,
      metadata_redacted: true,
      assistant_safe_category: shaped.category,
    };
  }

  private parseAuditEventMetadata(metadataJson: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(metadataJson) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private buildAssistantSafeAuditShape(
    action: string,
    outcome: string,
    metadata: Record<string, unknown>,
  ): AssistantSafeAuditShape | null {
    const policy = this.getAssistantSafeAuditPolicy(action);
    return policy ? policy(outcome, metadata) : null;
  }

  private listAssistantSafeAuditActionsForCategory(category: AssistantSafeAuditCategory): string[] {
    return Object.entries(this.getAssistantSafeAuditPolicies())
      .filter(([, policy]) => policy("success", {}).category === category)
      .map(([action]) => action);
  }

  private getAssistantSafeAuditPolicy(
    action: string,
  ): ((outcome: string, metadata: Record<string, unknown>) => AssistantSafeAuditShape) | null {
    const policies = this.getAssistantSafeAuditPolicies();
    return policies[action] ?? null;
  }

  private getAssistantSafeAuditPolicies(): Record<
    string,
    (outcome: string, metadata: Record<string, unknown>) => AssistantSafeAuditShape
  > {
    return {
      mailbox_sync: (eventOutcome, eventMetadata) => {
        const result = this.readAuditObject(eventMetadata.sync_result);
        return {
          category: "sync",
          summary:
            eventOutcome === "success"
              ? `Mailbox sync succeeded with ${this.readAuditNumber(result?.messages_refreshed)} refreshed and ${this.readAuditNumber(result?.messages_deleted)} deleted.`
              : "Mailbox sync failed.",
          metadata:
            eventOutcome === "success"
              ? {
                  sync_result: {
                    messages_refreshed: this.readAuditNumber(result?.messages_refreshed),
                    messages_deleted: this.readAuditNumber(result?.messages_deleted),
                    threads_recomputed: this.readAuditNumber(result?.threads_recomputed),
                    duration_ms: this.readAuditNumber(result?.duration_ms),
                  },
                }
              : {},
        };
      },
      calendar_sync: (eventOutcome, eventMetadata) => {
        const result = this.readAuditObject(eventMetadata.sync_result);
        return {
          category: "sync",
          summary:
            eventOutcome === "success"
              ? `Calendar sync succeeded with ${this.readAuditNumber(result?.events_refreshed)} events refreshed.`
              : "Calendar sync failed.",
          metadata:
            eventOutcome === "success"
              ? {
                  provider: typeof eventMetadata.provider === "string" ? eventMetadata.provider : null,
                  sync_result: {
                    calendars_refreshed: this.readAuditNumber(result?.calendars_refreshed),
                    events_refreshed: this.readAuditNumber(result?.events_refreshed),
                    duration_ms: this.readAuditNumber(result?.duration_ms),
                  },
                }
              : {},
        };
      },
      task_create: (_eventOutcome, eventMetadata) => ({
        category: "task",
        summary: "Task created.",
        metadata: {
          owner: typeof eventMetadata.owner === "string" ? eventMetadata.owner : null,
          kind: typeof eventMetadata.kind === "string" ? eventMetadata.kind : null,
          priority: typeof eventMetadata.priority === "string" ? eventMetadata.priority : null,
        },
      }),
      task_update: (_eventOutcome, eventMetadata) => ({
        category: "task",
        summary: `Task updated (${this.readAuditArray(eventMetadata.changes).length} fields).`,
        metadata: {
          changes: this.readAuditArray(eventMetadata.changes).filter((value): value is string => typeof value === "string"),
        },
      }),
      task_start: () => ({ category: "task", summary: "Task started.", metadata: {} }),
      task_complete: () => ({ category: "task", summary: "Task completed.", metadata: {} }),
      task_cancel: () => ({ category: "task", summary: "Task canceled.", metadata: {} }),
      task_snooze: (_eventOutcome, eventMetadata) => ({
        category: "task",
        summary: "Task snoozed.",
        metadata: {
          until: typeof eventMetadata.until === "string" ? eventMetadata.until : null,
        },
      }),
      task_suggestion_create: (_eventOutcome, eventMetadata) => ({
        category: "task_suggestion",
        summary: "Task suggestion created.",
        metadata: {
          kind: typeof eventMetadata.kind === "string" ? eventMetadata.kind : null,
          priority: typeof eventMetadata.priority === "string" ? eventMetadata.priority : null,
        },
      }),
      task_suggestion_accept: (_eventOutcome, eventMetadata) => ({
        category: "task_suggestion",
        summary: "Task suggestion accepted.",
        metadata: {
          task_id: typeof eventMetadata.task_id === "string" ? eventMetadata.task_id : null,
        },
      }),
      task_suggestion_reject: () => ({
        category: "task_suggestion",
        summary: "Task suggestion rejected.",
        metadata: {},
      }),
      planning_recommendation_create: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: "Planning recommendation created.",
        metadata: {
          kind: typeof eventMetadata.kind === "string" ? eventMetadata.kind : null,
          source: typeof eventMetadata.source === "string" ? eventMetadata.source : null,
          task_id: typeof eventMetadata.task_id === "string" ? eventMetadata.task_id : null,
        },
      }),
      planning_recommendation_replan: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: "Planning recommendation replanned.",
        metadata: {
          kind: typeof eventMetadata.kind === "string" ? eventMetadata.kind : null,
          proposed_start_at: typeof eventMetadata.proposed_start_at === "string" ? eventMetadata.proposed_start_at : null,
          proposed_end_at: typeof eventMetadata.proposed_end_at === "string" ? eventMetadata.proposed_end_at : null,
        },
      }),
      planning_recommendation_refresh: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: "Planning recommendation queue refreshed.",
        metadata: {
          refreshed_count: this.readAuditNumber(eventMetadata.refreshed_count),
          pending_count: this.readAuditNumber(eventMetadata.pending_count),
          superseded_count: this.readAuditNumber(eventMetadata.superseded_count),
          expired_count: this.readAuditNumber(eventMetadata.expired_count),
        },
      }),
      planning_recommendation_apply: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: "Planning recommendation applied.",
        metadata: {
          kind: typeof eventMetadata.kind === "string" ? eventMetadata.kind : null,
          applied_task_id: typeof eventMetadata.applied_task_id === "string" ? eventMetadata.applied_task_id : null,
        },
      }),
      planning_recommendation_reject: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: "Planning recommendation rejected.",
        metadata: {
          kind: typeof eventMetadata.kind === "string" ? eventMetadata.kind : null,
          reason_code: typeof eventMetadata.reason_code === "string" ? eventMetadata.reason_code : null,
        },
      }),
      planning_recommendation_snooze: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: "Planning recommendation snoozed.",
        metadata: {
          kind: typeof eventMetadata.kind === "string" ? eventMetadata.kind : null,
          until: typeof eventMetadata.until === "string" ? eventMetadata.until : null,
          preset: typeof eventMetadata.preset === "string" ? eventMetadata.preset : null,
        },
      }),
      planning_recommendation_group_snooze: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: "Planning recommendation group snoozed.",
        metadata: {
          until: typeof eventMetadata.until === "string" ? eventMetadata.until : null,
          preset: typeof eventMetadata.preset === "string" ? eventMetadata.preset : null,
          recommendation_count: this.readAuditArray(eventMetadata.recommendation_ids).length,
        },
      }),
      planning_recommendation_group_reject: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: "Planning recommendation group rejected.",
        metadata: {
          reason_code: typeof eventMetadata.reason_code === "string" ? eventMetadata.reason_code : null,
          recommendation_count: this.readAuditArray(eventMetadata.recommendation_ids).length,
        },
      }),
      planning_recommendation_outcome_update: (_eventOutcome, eventMetadata) => ({
        category: "planning",
        summary: `Planning recommendation marked ${typeof eventMetadata.outcome_state === "string" ? eventMetadata.outcome_state : "updated"}.`,
        metadata: {
          outcome_state: typeof eventMetadata.outcome_state === "string" ? eventMetadata.outcome_state : null,
          outcome_source: typeof eventMetadata.outcome_source === "string" ? eventMetadata.outcome_source : null,
        },
      }),
    };
  }

  private readAuditObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private readAuditArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private readAuditNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  private listPlanningRecommendationFamilyStats(): PlanningRecommendationFamilyStats[] {
    const recommendations = this.db.listPlanningRecommendations({ include_resolved: true });
    const openRecommendations = recommendations.filter((recommendation) => this.isPlanningRecommendationOpen(recommendation));
    return this.buildPlanningFamilyStats(
      recommendations,
      openRecommendations,
      this.listPlanningHygieneReviewStates(),
      this.listPlanningHygieneProposalStates(),
    );
  }

  private buildPlanningPolicyReport(): PlanningRecommendationPolicyReport {
    const generatedAt = new Date().toISOString();
    const familyStats = this.listPlanningRecommendationFamilyStats();
    const latestGovernanceEvents = this.listLatestPlanningPolicyGovernanceEvents();
    const activeBacklogFamilies = familyStats
      .filter((family) => family.open_count > 0)
      .filter((family) => family.proposal_status === "proposed" || family.proposal_status === "dismissed")
      .filter(
        (family) =>
          family.follow_through_state === "proposal_open" ||
          family.follow_through_state === "proposal_stale" ||
          family.follow_through_state === "proposal_dismissed",
      )
      .sort((left, right) => this.comparePlanningPolicyBacklogFamilies(left, right));
    const activeBacklog = activeBacklogFamilies.slice(0, 10).map((family) => this.toPlanningPolicyBacklogItem(family));
    const allGovernanceEvents = this.db.listPlanningHygienePolicyGovernanceEvents();
    const allPolicyHistory = this.buildPlanningPolicyHistoryRecentEvents(allGovernanceEvents, familyStats);
    const policyHistoryFamilies = this.buildPlanningPolicyHistoryFamilies(allGovernanceEvents, familyStats);
    const governanceWatchlist = policyHistoryFamilies.filter(
      (item) => item.family.recommended_action === "review_policy_churn" || item.family.recommended_action === "prune_old_history",
    );
    const recentPolicyExits = this.buildPlanningPolicyRecentExits(familyStats, latestGovernanceEvents);
    const retentionCandidates = this.buildPlanningPolicyRetentionCandidates(familyStats);
    const activeProposedRows = activeBacklog.filter((item) => item.proposal_status === "proposed");
    const activeDismissedRows = activeBacklog.filter((item) => item.proposal_status === "dismissed");
    const archivedRows = allPolicyHistory.filter((item) => item.governance_event_type === "policy_archived");
    const supersededRows = allPolicyHistory.filter((item) => item.governance_event_type === "policy_superseded");
    const policyAttention = this.selectPlanningPolicyAttention({
      recentPolicyExits,
      policyHistoryFamilies,
      retentionCandidates,
    });
    return {
      generated_at: generatedAt,
      active_proposed_count: activeBacklogFamilies.filter((family) => family.proposal_status === "proposed").length,
      active_dismissed_for_now_count: familyStats.filter(
        (family) => family.open_count > 0 && family.proposal_status === "dismissed",
      ).length,
      archived_count: archivedRows.length,
      superseded_count: supersededRows.length,
      recent_policy_exit_count: recentPolicyExits.length,
      retention_candidate_count: retentionCandidates.length,
      policy_history_family_count: policyHistoryFamilies.length,
      repeated_policy_family_count: policyHistoryFamilies.filter((item) => item.family.total_governance_events >= 2).length,
      mixed_outcome_policy_family_count: policyHistoryFamilies.filter((item) => item.family.has_mixed_governance_outcomes).length,
      policy_attention_kind: policyAttention.kind,
      policy_attention_summary: policyAttention.summary,
      policy_attention_command: "personal-ops recommendation policy",
      top_active_proposed_summary: activeProposedRows[0]?.summary ?? activeBacklogFamilies.find((family) => family.proposal_status === "proposed")?.summary ?? null,
      top_active_dismissed_summary:
        activeDismissedRows[0]?.summary ?? activeBacklogFamilies.find((family) => family.proposal_status === "dismissed")?.summary ?? null,
      top_archived_summary: archivedRows[0] ? this.sanitizePlanningPolicySummary(archivedRows[0].summary) : null,
      top_superseded_summary: supersededRows[0] ? this.sanitizePlanningPolicySummary(supersededRows[0].summary) : null,
      top_recent_policy_exit_summary: recentPolicyExits[0]?.exit_summary ?? null,
      top_retention_candidate_summary:
        governanceWatchlist.find((item) => item.family.recommended_action === "prune_old_history")?.family.summary ??
        retentionCandidates[0]?.summary ??
        null,
      top_repeated_policy_family_summary:
        policyHistoryFamilies.find((item) => item.family.total_governance_events >= 2)?.family.summary ?? null,
      top_mixed_outcome_policy_family_summary:
        policyHistoryFamilies.find((item) => item.family.has_mixed_governance_outcomes)?.family.summary ?? null,
      active_policy_backlog: activeBacklog,
      recent_policy_exits: recentPolicyExits.slice(0, 10),
      policy_history_families: policyHistoryFamilies.slice(0, 10).map((item) => item.family),
      policy_history_recent_events: allPolicyHistory.slice(0, 20),
      retention_candidates: retentionCandidates.slice(0, 10),
    };
  }

  // This is the single shared policy-attention choice used by policy reporting,
  // compact status, and worklist pressure so those surfaces do not drift apart.
  private selectPlanningPolicyAttention(input: {
    recentPolicyExits: PlanningRecommendationPolicyExitItem[];
    policyHistoryFamilies: Array<
      PlanningRecommendationPolicyHistoryFamilySelection | PlanningRecommendationPolicyHistoryFamilyItem
    >;
    retentionCandidates: PlanningRecommendationPolicyRetentionItem[];
  }): PlanningRecommendationPolicyAttentionSelection {
    const topRecentExit = input.recentPolicyExits[0];
    if (topRecentExit) {
      return {
        kind: "recent_exit",
        summary: topRecentExit.exit_summary,
        worklist_kind: "planning_policy_governance_needed",
        state_marker:
          topRecentExit.last_closed_at ??
          topRecentExit.last_active_at ??
          topRecentExit.proposal_updated_at ??
          topRecentExit.last_review_at ??
          new Date().toISOString(),
        group_key: topRecentExit.group_key,
        kind_value: topRecentExit.kind,
        source: topRecentExit.source,
        governance_event_id: null,
        governance_event_type: null,
      };
    }
    const topHistoryChurn = input.policyHistoryFamilies
      .map((item) => ("family" in item ? item.family : item))
      .find((item) => item.recommended_action === "review_policy_churn");
    if (topHistoryChurn) {
      return {
        kind: "history_churn",
        summary: topHistoryChurn.summary,
        worklist_kind: "planning_policy_governance_needed",
        state_marker: topHistoryChurn.latest_governance_recorded_at,
        group_key: topHistoryChurn.group_key,
        kind_value: topHistoryChurn.kind,
        source: topHistoryChurn.source,
        governance_event_id: null,
        governance_event_type: null,
      };
    }
    const topRetentionCandidate = input.retentionCandidates[0];
    if (topRetentionCandidate) {
      return {
        kind: "retention_candidate",
        summary: topRetentionCandidate.summary,
        worklist_kind: "planning_policy_retention_review_needed",
        state_marker: topRetentionCandidate.governance_recorded_at,
        group_key: topRetentionCandidate.group_key,
        kind_value: topRetentionCandidate.kind,
        source: topRetentionCandidate.source,
        governance_event_id: topRetentionCandidate.governance_event_id,
        governance_event_type: topRetentionCandidate.governance_event_type,
      };
    }
    return {
      kind: "none",
      summary: null,
      worklist_kind: null,
      state_marker: null,
      group_key: null,
      kind_value: null,
      source: null,
      governance_event_id: null,
      governance_event_type: null,
    };
  }

  private buildPlanningPolicyHistoryRecentEvents(
    events: PlanningHygienePolicyGovernanceEvent[],
    familyStats: PlanningRecommendationFamilyStats[],
  ): PlanningRecommendationPolicyHistoryItem[] {
    return events
      .map((event) => {
        const family = familyStats.find(
          (item) => item.group_key === event.group_key && item.kind === event.kind && item.source === event.source,
        );
        if (!family || family.open_count > 0) {
          return null;
        }
        const proposal = this.db.getPlanningHygienePolicyProposal(event.group_key, event.kind, event.source);
        return this.toPlanningPolicyHistoryItem(family, proposal, event);
      })
      .filter((item): item is PlanningRecommendationPolicyHistoryItem => Boolean(item))
      .sort((left, right) =>
        Date.parse(right.governance_recorded_at) - Date.parse(left.governance_recorded_at) ||
        left.group_key.localeCompare(right.group_key) ||
        left.kind.localeCompare(right.kind) ||
        left.source.localeCompare(right.source),
      );
  }

  private buildPlanningPolicyHistoryFamilies(
    events: PlanningHygienePolicyGovernanceEvent[],
    familyStats: PlanningRecommendationFamilyStats[],
  ): PlanningRecommendationPolicyHistoryFamilySelection[] {
    const rawEvents = this.buildPlanningPolicyHistoryRecentEvents(events, familyStats);
    const rawEventsByFamily = new Map<string, PlanningRecommendationPolicyHistoryItem[]>();
    for (const item of rawEvents) {
      const familyKey = this.getPlanningRecommendationFamilyAuditTargetId(item.group_key, item.kind, item.source);
      const existing = rawEventsByFamily.get(familyKey);
      if (existing) {
        existing.push(item);
      } else {
        rawEventsByFamily.set(familyKey, [item]);
      }
    }
    const retentionCandidates = this.buildPlanningPolicyRetentionCandidates(familyStats);
    const retentionByFamily = new Map<string, PlanningRecommendationPolicyRetentionItem[]>();
    for (const item of retentionCandidates) {
      const familyKey = this.getPlanningRecommendationFamilyAuditTargetId(item.group_key, item.kind, item.source);
      const existing = retentionByFamily.get(familyKey);
      if (existing) {
        existing.push(item);
      } else {
        retentionByFamily.set(familyKey, [item]);
      }
    }
    return [...rawEventsByFamily.entries()]
      .map(([familyKey, groupedRawEvents]) => {
        const [groupKey, kind, source] = familyKey.split(":") as [
          string,
          PlanningRecommendationKind,
          PlanningRecommendationSource,
        ];
        const family =
          familyStats.find((item) => item.group_key === groupKey && item.kind === kind && item.source === source) ?? null;
        if (!family) {
          return null;
        }
        const proposal = this.db.getPlanningHygienePolicyProposal(groupKey, kind, source);
        const groupedRetentionCandidates = retentionByFamily.get(familyKey) ?? [];
        return {
          family: this.toPlanningPolicyHistoryFamilyItem(family, proposal, groupedRawEvents, groupedRetentionCandidates),
          raw_events: groupedRawEvents,
          retention_candidates: groupedRetentionCandidates,
        };
      })
      .filter((item): item is PlanningRecommendationPolicyHistoryFamilySelection => Boolean(item))
      .sort((left, right) => this.comparePlanningPolicyHistoryFamilyItems(left.family, right.family));
  }

  private buildPlanningPolicyRecentExits(
    familyStats: PlanningRecommendationFamilyStats[],
    latestGovernanceEvents: Map<string, PlanningHygienePolicyGovernanceEvent>,
  ): PlanningRecommendationPolicyExitItem[] {
    return familyStats
      .filter((family) => family.open_count === 0)
      .filter((family) => this.isTimestampWithinDays(family.last_closed_at ?? undefined, PLANNING_CLOSED_RECENT_DAYS_LONG))
      .filter((family) => this.db.getPlanningHygienePolicyProposal(family.group_key, family.kind, family.source))
      .filter((family) => {
        const familyKey = this.getPlanningRecommendationFamilyAuditTargetId(family.group_key, family.kind, family.source);
        return !latestGovernanceEvents.has(familyKey);
      })
      .sort(
        (left, right) =>
          Date.parse(right.last_closed_at ?? "") - Date.parse(left.last_closed_at ?? "") ||
          Date.parse(right.last_active_at ?? "") - Date.parse(left.last_active_at ?? "") ||
          left.group_key.localeCompare(right.group_key) ||
          left.kind.localeCompare(right.kind) ||
          left.source.localeCompare(right.source),
      )
      .map((family) => this.toPlanningPolicyExitItem(family));
  }

  private buildPlanningPolicyRetentionCandidates(
    familyStats: PlanningRecommendationFamilyStats[],
  ): PlanningRecommendationPolicyRetentionItem[] {
    return this.db
      .listPlanningHygienePolicyGovernanceEvents()
      .map((event) => this.toPlanningPolicyRetentionItem(event, familyStats))
      .filter((item) =>
        item.governance_event_type === "policy_superseded"
          ? item.age_days >= PLANNING_POLICY_RETENTION_SUPERSEDED_DAYS
          : item.age_days >= PLANNING_POLICY_RETENTION_ARCHIVED_DAYS,
      )
      .sort((left, right) => this.comparePlanningPolicyRetentionItems(left, right));
  }

  private listLatestPlanningPolicyGovernanceEvents(): Map<string, PlanningHygienePolicyGovernanceEvent> {
    const latest = new Map<string, PlanningHygienePolicyGovernanceEvent>();
    for (const event of this.db.listPlanningHygienePolicyGovernanceEvents()) {
      const familyKey = this.getPlanningRecommendationFamilyAuditTargetId(event.group_key, event.kind, event.source);
      if (!latest.has(familyKey)) {
        latest.set(familyKey, event);
      }
    }
    return latest;
  }

  private planningPolicyBacklogPriority(
    state: PlanningRecommendationFollowThroughState | null,
  ): number {
    if (state === "proposal_stale") {
      return 3;
    }
    if (state === "proposal_open") {
      return 2;
    }
    if (state === "proposal_dismissed") {
      return 1;
    }
    return 0;
  }

  private comparePlanningPolicyBacklogFamilies(
    left: PlanningRecommendationFamilyStats,
    right: PlanningRecommendationFamilyStats,
  ): number {
    return (
      this.planningPolicyBacklogPriority(right.follow_through_state) -
        this.planningPolicyBacklogPriority(left.follow_through_state) ||
      this.comparePlanningFollowThroughFamilies(left, right)
    );
  }

  private toPlanningPolicyBacklogItem(
    family: PlanningRecommendationFamilyStats,
  ): PlanningRecommendationPolicyBacklogItem {
    return {
      group_key: family.group_key,
      group_kind: family.group_kind,
      kind: family.kind,
      source: family.source,
      proposal_type: family.proposal_type ?? this.derivePlanningHygieneProposalType(family.recommended_action)!,
      proposal_status: family.proposal_status ?? "proposed",
      follow_through_state: family.follow_through_state as "proposal_open" | "proposal_stale" | "proposal_dismissed",
      open_count: family.open_count,
      queue_share_pct: family.queue_share_pct,
      summary: family.summary,
      last_review_at: family.last_review_at,
      last_review_decision: family.last_review_decision,
      proposal_updated_at: family.proposal_updated_at,
      proposal_age_days: family.proposal_age_days,
      proposal_stale: family.proposal_stale,
    };
  }

  private toPlanningPolicyHistoryItem(
    family: PlanningRecommendationFamilyStats,
    proposal: PlanningHygienePolicyProposal | null,
    event: PlanningHygienePolicyGovernanceEvent,
  ): PlanningRecommendationPolicyHistoryItem {
    const actionLabel = event.event_type === "policy_archived" ? "archived" : "superseded";
    const noteSummary = event.note?.trim() ? ` Note: ${event.note.trim()}` : "";
    return {
      governance_event_id: event.governance_event_id,
      group_key: family.group_key,
      group_kind: family.group_kind,
      kind: family.kind,
      source: family.source,
      proposal_type: proposal?.proposal_type ?? family.proposal_type,
      final_proposal_status: event.proposal_status_snapshot ?? proposal?.status ?? family.proposal_status,
      last_follow_through_state: event.follow_through_state_snapshot ?? family.follow_through_state,
      governance_event_type: event.event_type,
      governance_recorded_at: event.recorded_at,
      governance_recorded_by_client: event.recorded_by_client,
      governance_recorded_by_actor: event.recorded_by_actor ?? null,
      governance_note: event.note ?? null,
      basis_signal_updated_at: event.basis_signal_updated_at,
      last_review_at: family.last_review_at,
      proposal_updated_at: proposal?.updated_at ?? family.proposal_updated_at,
      last_active_at: family.last_active_at,
      last_closed_at: family.last_closed_at,
      summary: `${family.summary} This policy idea was ${actionLabel} on ${event.recorded_at}.${noteSummary}`,
    };
  }

  private toPlanningPolicyExitItem(
    family: PlanningRecommendationFamilyStats,
  ): PlanningRecommendationPolicyExitItem {
    return {
      group_key: family.group_key,
      group_kind: family.group_kind,
      kind: family.kind,
      source: family.source,
      proposal_type: family.proposal_type,
      proposal_status: family.proposal_status,
      last_follow_through_state: family.follow_through_state,
      last_review_at: family.last_review_at,
      proposal_updated_at: family.proposal_updated_at,
      last_active_at: family.last_active_at,
      last_closed_at: family.last_closed_at,
      exit_summary: `${this.buildPlanningClosedFamilyExitSummary(family)} Archive or supersede this inactive policy idea when ready.`,
    };
  }

  private toPlanningPolicyRetentionItem(
    event: PlanningHygienePolicyGovernanceEvent,
    familyStats: PlanningRecommendationFamilyStats[] = this.listPlanningRecommendationFamilyStats(),
  ): PlanningRecommendationPolicyRetentionItem {
    const family =
      familyStats.find(
        (item) => item.group_key === event.group_key && item.kind === event.kind && item.source === event.source,
      ) ?? null;
    const ageDays = this.calculateAgeDays(event.recorded_at);
    const threshold =
      event.event_type === "policy_superseded"
        ? PLANNING_POLICY_RETENTION_SUPERSEDED_DAYS
        : PLANNING_POLICY_RETENTION_ARCHIVED_DAYS;
    const familyLabel = family?.summary ?? `${this.humanizePlanningKind(event.kind)} (${event.source.replaceAll("_", " ")})`;
    return {
      governance_event_id: event.governance_event_id,
      group_key: event.group_key,
      group_kind: family?.group_kind ?? this.asPlanningRecommendationGroupKind(event.group_key),
      kind: event.kind,
      source: event.source,
      governance_event_type: event.event_type,
      governance_recorded_at: event.recorded_at,
      age_days: ageDays ?? 0,
      summary: `${familyLabel} has a ${event.event_type} history entry that is ${ageDays ?? "unknown"} days old (review threshold ${threshold} days).`,
    };
  }

  private toPlanningPolicyHistoryFamilyItem(
    family: PlanningRecommendationFamilyStats,
    proposal: PlanningHygienePolicyProposal | null,
    rawEvents: PlanningRecommendationPolicyHistoryItem[],
    retentionCandidates: PlanningRecommendationPolicyRetentionItem[],
  ): PlanningRecommendationPolicyHistoryFamilyItem {
    const newestEvent = rawEvents[0]!;
    const oldestEvent = rawEvents[rawEvents.length - 1]!;
    const archivedCount = rawEvents.filter((item) => item.governance_event_type === "policy_archived").length;
    const supersededCount = rawEvents.filter((item) => item.governance_event_type === "policy_superseded").length;
    const hasMixedGovernanceOutcomes = archivedCount > 0 && supersededCount > 0;
    const recentGovernanceEvents30d = rawEvents.filter((item) =>
      this.isTimestampWithinDays(item.governance_recorded_at, PLANNING_CLOSED_RECENT_DAYS_LONG),
    ).length;
    const recentGovernanceEvents90d = rawEvents.filter((item) =>
      this.isTimestampWithinDays(item.governance_recorded_at, PLANNING_CLOSED_RECENT_DAYS_LONG * 3),
    ).length;
    const highChurn = recentGovernanceEvents90d >= 2;
    const recommendedAction = hasMixedGovernanceOutcomes || highChurn
      ? "review_policy_churn"
      : retentionCandidates.length > 0
        ? "prune_old_history"
        : "monitor";
    return {
      group_key: family.group_key,
      group_kind: family.group_kind,
      kind: family.kind,
      source: family.source,
      proposal_type: proposal?.proposal_type ?? family.proposal_type,
      total_governance_events: rawEvents.length,
      archived_count: archivedCount,
      superseded_count: supersededCount,
      first_governance_recorded_at: oldestEvent.governance_recorded_at,
      latest_governance_recorded_at: newestEvent.governance_recorded_at,
      latest_governance_event_type: newestEvent.governance_event_type,
      last_closed_at: family.last_closed_at,
      last_active_at: family.last_active_at,
      latest_final_proposal_status: newestEvent.final_proposal_status,
      has_mixed_governance_outcomes: hasMixedGovernanceOutcomes,
      recent_governance_events_30d: recentGovernanceEvents30d,
      recent_governance_events_90d: recentGovernanceEvents90d,
      recommended_action: recommendedAction,
      summary: this.buildPlanningPolicyHistoryFamilySummary(
        family,
        rawEvents.length,
        archivedCount,
        supersededCount,
        hasMixedGovernanceOutcomes,
        recentGovernanceEvents90d,
        retentionCandidates.length,
      ),
      governance_event_ids: rawEvents.map((item) => item.governance_event_id),
    };
  }

  private comparePlanningPolicyRetentionItems(
    left: PlanningRecommendationPolicyRetentionItem,
    right: PlanningRecommendationPolicyRetentionItem,
  ): number {
    return (
      Date.parse(left.governance_recorded_at) - Date.parse(right.governance_recorded_at) ||
      left.group_key.localeCompare(right.group_key) ||
      left.kind.localeCompare(right.kind) ||
      left.source.localeCompare(right.source)
    );
  }

  private buildPlanningPolicyHistoryFamilySummary(
    family: PlanningRecommendationFamilyStats,
    totalEvents: number,
    archivedCount: number,
    supersededCount: number,
    hasMixedGovernanceOutcomes: boolean,
    recentGovernanceEvents90d: number,
    retentionCandidateCount: number,
  ): string {
    const pieces = [
      `${family.summary} has ${totalEvents} governance ${totalEvents === 1 ? "event" : "events"}`,
      `(${archivedCount} archived, ${supersededCount} superseded).`,
    ];
    if (hasMixedGovernanceOutcomes) {
      pieces.push("Mixed archive and supersede outcomes suggest policy churn.");
    } else if (recentGovernanceEvents90d >= 2) {
      pieces.push(`It has repeated governance churn with ${recentGovernanceEvents90d} events in the last 90 days.`);
    } else if (retentionCandidateCount > 0) {
      pieces.push(`${retentionCandidateCount} older governance ${retentionCandidateCount === 1 ? "entry is" : "entries are"} ready for retention review.`);
    } else {
      pieces.push("No immediate governance cleanup is needed.");
    }
    return pieces.join(" ");
  }

  private sanitizePlanningPolicySummary(summary: string): string {
    return summary.replace(/ Note: .*$/u, "").trim();
  }

  private comparePlanningPolicyHistoryFamilyItems(
    left: PlanningRecommendationPolicyHistoryFamilyItem,
    right: PlanningRecommendationPolicyHistoryFamilyItem,
  ): number {
    const leftRepeatedPressure =
      (left.recent_governance_events_90d >= 2 ? 1000 : 0) + left.recent_governance_events_90d * 10 + left.total_governance_events;
    const rightRepeatedPressure =
      (right.recent_governance_events_90d >= 2 ? 1000 : 0) +
      right.recent_governance_events_90d * 10 +
      right.total_governance_events;
    return (
      rightRepeatedPressure - leftRepeatedPressure ||
      Number(right.has_mixed_governance_outcomes) - Number(left.has_mixed_governance_outcomes) ||
      Date.parse(right.latest_governance_recorded_at) - Date.parse(left.latest_governance_recorded_at) ||
      left.group_key.localeCompare(right.group_key) ||
      left.kind.localeCompare(right.kind) ||
      left.source.localeCompare(right.source)
    );
  }

  private resolvePlanningPolicyPruneEventTypes(
    eventType: "archived" | "superseded" | "all",
  ): PlanningHygienePolicyGovernanceEventType[] {
    if (eventType === "archived") {
      return ["policy_archived"];
    }
    if (eventType === "superseded") {
      return ["policy_superseded"];
    }
    return [];
  }

  private buildPlanningTuningReport(
    generatedAt: string,
    selection: PlanningRecommendationTuningSelection,
  ): PlanningRecommendationTuningReport {
    return {
      generated_at: generatedAt,
      review_needed_count: selection.review_needed,
      reviewed_fresh_count: selection.reviewed_fresh,
      reviewed_stale_count: selection.reviewed_stale,
      proposal_open_count: selection.proposal_open,
      proposal_stale_count: selection.proposal_stale,
      proposal_dismissed_count: selection.proposal_dismissed,
      top_review_needed_summary: selection.top_review_needed?.summary ?? null,
      top_reviewed_stale_summary: selection.top_reviewed_stale?.summary ?? null,
      top_proposal_open_summary: selection.top_proposal_open?.summary ?? null,
      top_proposal_stale_summary: selection.top_proposal_stale?.summary ?? null,
      attention_families: selection.attention_families.map((family) => this.toPlanningTuningAttentionFamily(family)),
      recently_closed_families: selection.recently_closed_families,
    };
  }

  private buildPlanningClosureMix(recommendations: PlanningRecommendation[]): PlanningClosureMix {
    const recent = recommendations.filter((recommendation) =>
      this.isRecommendationClosedWithinDays(recommendation, PLANNING_CLOSED_RECENT_DAYS_LONG),
    );
    const closeReasonCounts = new Map<string, number>();
    for (const recommendation of recent) {
      const key = recommendation.close_reason_code ?? "unknown";
      closeReasonCounts.set(key, (closeReasonCounts.get(key) ?? 0) + 1);
    }
    const dominantCloseReason = [...closeReasonCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0]?.[0] ?? null;
    return {
      closed_last_30d: recent.length,
      completed_last_30d: recent.filter((recommendation) => recommendation.outcome_state === "completed").length,
      handled_elsewhere_last_30d: recent.filter((recommendation) => recommendation.outcome_state === "handled_elsewhere").length,
      source_resolved_last_30d: recent.filter((recommendation) => recommendation.outcome_state === "source_resolved").length,
      dominant_close_reason_last_30d: dominantCloseReason,
    };
  }

  private classifyPlanningClosureSignal(
    closureMix: PlanningClosureMix,
  ): PlanningRecommendationClosureSignal {
    if (closureMix.closed_last_30d < 3) {
      return "insufficient_history";
    }
    if (closureMix.source_resolved_last_30d / closureMix.closed_last_30d >= 0.6) {
      return "mostly_source_resolved";
    }
    if (closureMix.handled_elsewhere_last_30d / closureMix.closed_last_30d >= 0.5) {
      return "mostly_handled_elsewhere";
    }
    if (closureMix.completed_last_30d / closureMix.closed_last_30d >= 0.5) {
      return "healthy_completed";
    }
    return "mixed";
  }

  private recommendActionForClosureSignal(
    closureSignal: PlanningRecommendationClosureSignal,
  ): PlanningRecommendationRecommendedAction {
    if (closureSignal === "mostly_source_resolved") {
      return "review_source_suppression";
    }
    if (closureSignal === "mostly_handled_elsewhere") {
      return "review_externalized_workflow";
    }
    if (closureSignal === "insufficient_history") {
      return "need_more_history";
    }
    return "keep_visible";
  }

  private buildClosureMeaningSummary(counts: {
    closedCount: number;
    completedCount: number;
    handledElsewhereCount: number;
    sourceResolvedCount: number;
  }): string | null {
    if (counts.closedCount === 0) {
      return null;
    }
    if (counts.sourceResolvedCount > counts.handledElsewhereCount && counts.sourceResolvedCount > counts.completedCount) {
      return "Recent closures mostly indicate the source stopped needing action, which points to source-side suppression or dedupe tuning.";
    }
    if (counts.handledElsewhereCount > counts.sourceResolvedCount && counts.handledElsewhereCount > counts.completedCount) {
      return "Recent closures mostly indicate work is leaving the queue, which points to workflow-routing or visibility tuning.";
    }
    if (counts.completedCount > counts.sourceResolvedCount && counts.completedCount > counts.handledElsewhereCount) {
      return "Recent closures mostly indicate the family is completing as intended and should stay visible.";
    }
    return "Recent closures are mixed, so this family likely needs observation before tuning.";
  }

  private buildPlanningHygieneSummary(input: {
    groupKind: PlanningRecommendationGroupKind;
    kind: PlanningRecommendationKind;
    source: PlanningRecommendationSource;
    recommendedAction: PlanningRecommendationRecommendedAction;
    queueSharePct: number;
    openCount: number;
    closureMix: PlanningClosureMix;
  }): string {
    const groupSummary = this.describeRecommendationGroup(input.groupKind, Math.max(1, input.openCount));
    const familyLabel = `${this.humanizePlanningKind(input.kind)} (${input.source.replaceAll("_", " ")})`;
    if (input.recommendedAction === "review_source_suppression") {
      return `${familyLabel} in ${groupSummary} looks like a source-side suppression candidate (${input.queueSharePct}% of open queue, ${input.closureMix.source_resolved_last_30d} source resolved in 30d).`;
    }
    if (input.recommendedAction === "review_externalized_workflow") {
      return `${familyLabel} in ${groupSummary} looks like an externalized-workflow candidate (${input.queueSharePct}% of open queue, ${input.closureMix.handled_elsewhere_last_30d} handled elsewhere in 30d).`;
    }
    if (input.recommendedAction === "need_more_history") {
      return `${familyLabel} in ${groupSummary} needs more closure history before queue tuning is recommended.`;
    }
    return `${familyLabel} in ${groupSummary} is closing in a healthy or mixed way and should stay visible for now.`;
  }

  private summarizeFamilyClosureMeaning(families: PlanningRecommendationFamilyStats[]): string | null {
    const top = [...families].sort(
      (left, right) =>
        this.suppressionCandidatePriority(right.recommended_action) - this.suppressionCandidatePriority(left.recommended_action) ||
        right.closed_last_30d - left.closed_last_30d ||
        left.summary.localeCompare(right.summary),
    )[0];
    return top?.closure_meaning_summary ?? null;
  }

  private comparePlanningFollowThroughFamilies(
    left: PlanningRecommendationFamilyStats,
    right: PlanningRecommendationFamilyStats,
  ): number {
    const leftAge = left.follow_through_state === "proposal_stale" || left.follow_through_state === "proposal_open"
      ? left.proposal_age_days ?? -1
      : left.review_age_days ?? -1;
    const rightAge = right.follow_through_state === "proposal_stale" || right.follow_through_state === "proposal_open"
      ? right.proposal_age_days ?? -1
      : right.review_age_days ?? -1;
    return (
      right.queue_share_pct - left.queue_share_pct ||
      right.open_count - left.open_count ||
      rightAge - leftAge ||
      right.closed_last_30d - left.closed_last_30d ||
      left.group_key.localeCompare(right.group_key) ||
      left.kind.localeCompare(right.kind) ||
      left.source.localeCompare(right.source) ||
      left.summary.localeCompare(right.summary)
    );
  }

  private planningFollowThroughAttentionPriority(state: PlanningRecommendationFollowThroughState | null): number {
    if (state === "proposal_stale") {
      return 4;
    }
    if (state === "reviewed_stale") {
      return 3;
    }
    if (state === "review_needed") {
      return 2;
    }
    if (state === "proposal_open") {
      return 1;
    }
    return 0;
  }

  private toPlanningTuningAttentionFamily(
    family: PlanningRecommendationFamilyStats,
  ): PlanningRecommendationTuningFamilyReport {
    return {
      group_key: family.group_key,
      group_kind: family.group_kind,
      kind: family.kind,
      source: family.source,
      recommended_action: family.recommended_action,
      follow_through_state: family.follow_through_state as Exclude<
        PlanningRecommendationFollowThroughState,
        "proposal_dismissed"
      >,
      open_count: family.open_count,
      queue_share_pct: family.queue_share_pct,
      manual_scheduling_count: family.manual_scheduling_count,
      summary: family.summary,
      signal_updated_at: family.signal_updated_at,
      last_review_at: family.last_review_at,
      review_age_days: family.review_age_days,
      proposal_type: family.proposal_type,
      proposal_status: family.proposal_status,
      proposal_updated_at: family.proposal_updated_at,
      proposal_age_days: family.proposal_age_days,
      proposal_stale: family.proposal_stale,
    };
  }

  private comparePlanningAttentionFamilies(
    left: PlanningRecommendationFamilyStats,
    right: PlanningRecommendationFamilyStats,
  ): number {
    return (
      this.planningFollowThroughAttentionPriority(right.follow_through_state) -
        this.planningFollowThroughAttentionPriority(left.follow_through_state) ||
      this.comparePlanningFollowThroughFamilies(left, right)
    );
  }

  private buildPlanningRecentlyClosedFamilies(
    families: PlanningRecommendationFamilyStats[],
  ): PlanningRecommendationTuningHistoryReport[] {
    return [...families]
      .filter((family) => family.open_count === 0)
      .filter((family) => family.closed_last_30d > 0)
      .filter(
        (family) =>
          (family.last_review_at !== null && (family.review_age_days ?? Number.POSITIVE_INFINITY) <= PLANNING_CLOSED_RECENT_DAYS_LONG) ||
          (family.proposal_updated_at !== null &&
            (family.proposal_age_days ?? Number.POSITIVE_INFINITY) <= PLANNING_CLOSED_RECENT_DAYS_LONG),
      )
      .filter((family) => family.follow_through_state !== null)
      .sort(
        (left, right) =>
          Date.parse(right.last_closed_at ?? "") - Date.parse(left.last_closed_at ?? "") ||
          Date.parse(right.last_active_at ?? "") - Date.parse(left.last_active_at ?? "") ||
          left.group_key.localeCompare(right.group_key) ||
          left.kind.localeCompare(right.kind) ||
          left.source.localeCompare(right.source),
      )
      .slice(0, 10)
      .map((family) => ({
        group_key: family.group_key,
        group_kind: family.group_kind,
        kind: family.kind,
        source: family.source,
        last_follow_through_state_before_exit: family.follow_through_state,
        last_review_decision: family.last_review_decision,
        proposal_type: family.proposal_type,
        final_proposal_status: family.proposal_status,
        last_review_at: family.last_review_at,
        proposal_updated_at: family.proposal_updated_at,
        last_active_at: family.last_active_at,
        last_closed_at: family.last_closed_at,
        recent_closed_count: family.closed_last_30d,
        recent_handled_elsewhere_count: family.handled_elsewhere_last_30d,
        recent_source_resolved_count: family.source_resolved_last_30d,
        exit_summary: this.buildPlanningClosedFamilyExitSummary(family),
      }));
  }

  private buildPlanningClosedFamilyExitSummary(family: PlanningRecommendationFamilyStats): string {
    const familyLabel = `${this.humanizePlanningKind(family.kind)} (${family.source.replaceAll("_", " ")})`;
    return `${familyLabel} left the active queue after ${family.closed_last_30d} recent closure${family.closed_last_30d === 1 ? "" : "s"} (${family.handled_elsewhere_last_30d} handled elsewhere, ${family.source_resolved_last_30d} source resolved).`;
  }

  private buildPlanningFollowThroughWorklistSummary(
    family: PlanningRecommendationFamilyStats | PlanningRecommendationTuningFamilyReport,
  ): string {
    if (family.follow_through_state === "proposal_stale") {
      return `${family.summary} Proposal follow-through is stale (${family.proposal_age_days ?? "unknown"} days since proposal update).`;
    }
    if (family.follow_through_state === "reviewed_stale") {
      return `${family.summary} Review follow-through is stale (${family.review_age_days ?? "unknown"} days since last review).`;
    }
    if (family.follow_through_state === "review_needed") {
      return `${family.summary} Operator review is needed before tuning follow-through can continue.`;
    }
    return family.summary;
  }

  private selectPlanningFollowThroughFamilies(
    activeFamilies: PlanningRecommendationFamilyStats[],
    allFamilies: PlanningRecommendationFamilyStats[],
  ): PlanningRecommendationTuningSelection {
    const rows = [...activeFamilies].filter((family) => family.follow_through_state !== null);
    const byState = (state: PlanningRecommendationFollowThroughState) =>
      rows
        .filter((family) => family.follow_through_state === state)
        .sort((left, right) => this.comparePlanningFollowThroughFamilies(left, right));
    return {
      review_needed: rows.filter((family) => family.follow_through_state === "review_needed").length,
      reviewed_fresh: rows.filter((family) => family.follow_through_state === "reviewed_fresh").length,
      reviewed_stale: rows.filter((family) => family.follow_through_state === "reviewed_stale").length,
      proposal_open: rows.filter((family) => family.follow_through_state === "proposal_open").length,
      proposal_stale: rows.filter((family) => family.follow_through_state === "proposal_stale").length,
      proposal_dismissed: rows.filter((family) => family.follow_through_state === "proposal_dismissed").length,
      top_review_needed: byState("review_needed")[0] as PlanningRecommendationFamilyStats | undefined,
      top_reviewed_stale: byState("reviewed_stale")[0] as PlanningRecommendationFamilyStats | undefined,
      top_proposal_open: byState("proposal_open")[0] as PlanningRecommendationFamilyStats | undefined,
      top_proposal_stale: byState("proposal_stale")[0] as PlanningRecommendationFamilyStats | undefined,
      attention_families: rows
        .filter((family) =>
          family.follow_through_state === "proposal_stale" ||
          family.follow_through_state === "reviewed_stale" ||
          family.follow_through_state === "review_needed" ||
          family.follow_through_state === "proposal_open",
        )
        .sort((left, right) => this.comparePlanningAttentionFamilies(left, right))
        .slice(0, 10),
      recently_closed_families: this.buildPlanningRecentlyClosedFamilies(allFamilies),
    };
  }

  private buildPlanningBacklogTuningSummary(counts: {
    reviewNeededCount: number;
    reviewedStaleCount: number;
    proposalOpenCount: number;
    proposalStaleCount: number;
    proposalDismissedCount: number;
  }): string | null {
    if (
      counts.reviewNeededCount === 0 &&
      counts.reviewedStaleCount === 0 &&
      counts.proposalOpenCount === 0 &&
      counts.proposalStaleCount === 0 &&
      counts.proposalDismissedCount === 0
    ) {
      return null;
    }
    return [
      `${counts.reviewNeededCount} review-needed`,
      `${counts.reviewedStaleCount} reviewed-stale`,
      `${counts.proposalOpenCount} proposal-open`,
      `${counts.proposalStaleCount} proposal-stale`,
      `${counts.proposalDismissedCount} proposal-dismissed`,
    ].join(", ");
  }

  private parseAuditMetadata(event: AuditEvent): Record<string, unknown> {
    try {
      return JSON.parse(event.metadata_json) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private suppressionCandidatePriority(action: PlanningRecommendationRecommendedAction): number {
    if (action === "review_source_suppression") {
      return 3;
    }
    if (action === "review_externalized_workflow") {
      return 2;
    }
    if (action === "keep_visible") {
      return 1;
    }
    return 0;
  }

  private getPlanningCalibrationFamilyKey(recommendation: PlanningRecommendation): string {
    return this.getPlanningRecommendationFamilyKey(recommendation);
  }

  private buildPlanningCalibrationMap(
    recommendations: PlanningRecommendation[],
  ): Map<string, PlanningCalibrationStats> {
    const grouped = new Map<string, PlanningRecommendation[]>();
    for (const recommendation of recommendations) {
      if (
        recommendation.source !== "system_generated" ||
        !this.isRecommendationClosedWithinDays(recommendation, PLANNING_CLOSED_RECENT_DAYS_LONG)
      ) {
        continue;
      }
      const key = this.getPlanningCalibrationFamilyKey(recommendation);
      const current = grouped.get(key) ?? [];
      current.push(recommendation);
      grouped.set(key, current);
    }
    return new Map(
      [...grouped.entries()].map(([key, rows]) => [
        key,
        {
          closed_count: rows.length,
          completed_count: rows.filter((recommendation) => recommendation.outcome_state === "completed").length,
          handled_elsewhere_count: rows.filter((recommendation) => recommendation.outcome_state === "handled_elsewhere").length,
          source_resolved_count: rows.filter((recommendation) => recommendation.outcome_state === "source_resolved").length,
        },
      ]),
    );
  }

  private isPlanningRecommendationOpen(recommendation: PlanningRecommendation): boolean {
    return !recommendation.closed_at && ["pending", "snoozed", "applied"].includes(recommendation.status);
  }

  private isPlanningRecommendationStalePending(recommendation: PlanningRecommendation): boolean {
    return (
      recommendation.status === "pending" &&
      this.isTimestampOlderThanHours(recommendation.created_at, PLANNING_STALE_PENDING_HOURS)
    );
  }

  private isPlanningRecommendationStaleScheduled(recommendation: PlanningRecommendation): boolean {
    if (recommendation.status !== "applied" || recommendation.outcome_state !== "scheduled" || recommendation.closed_at) {
      return false;
    }
    const scheduledAt =
      recommendation.outcome_recorded_at ?? recommendation.first_action_at ?? recommendation.resolved_at ?? recommendation.created_at;
    return this.isTimestampOlderThanHours(scheduledAt, PLANNING_STALE_SCHEDULED_HOURS);
  }

  private isPlanningRecommendationResurfaced(
    recommendation: PlanningRecommendation,
    recommendations: PlanningRecommendation[],
  ): boolean {
    const cutoffMs = Date.now() - PLANNING_RESURFACED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const createdMs = Date.parse(recommendation.created_at);
    return recommendations.some((candidate) => {
      if (candidate.recommendation_id === recommendation.recommendation_id || candidate.dedupe_key !== recommendation.dedupe_key) {
        return false;
      }
      const closedMs = Date.parse(candidate.closed_at ?? "");
      return Number.isFinite(closedMs) && closedMs >= cutoffMs && closedMs <= createdMs;
    });
  }

  private isPlanningRecommendationOutcomeWithinDays(
    recommendation: PlanningRecommendation,
    outcomeState: PlanningRecommendationOutcomeState,
    days: number,
  ): boolean {
    return (
      recommendation.outcome_state === outcomeState &&
      this.isTimestampWithinDays(recommendation.closed_at ?? recommendation.outcome_recorded_at, days)
    );
  }

  private isRecommendationClosedWithinDays(recommendation: PlanningRecommendation, days: number): boolean {
    return this.isTimestampWithinDays(recommendation.closed_at, days);
  }

  private isTimestampOlderThanHours(timestamp: string | undefined, hours: number): boolean {
    const value = Date.parse(timestamp ?? "");
    return Number.isFinite(value) && Date.now() - value >= hours * 60 * 60 * 1000;
  }

  private isTimestampWithinDays(timestamp: string | undefined, days: number): boolean {
    const value = Date.parse(timestamp ?? "");
    return Number.isFinite(value) && value >= Date.now() - days * 24 * 60 * 60 * 1000;
  }

  private calculateMedianHoursSince(timestamps: Array<string | undefined>): number | null {
    const values = timestamps
      .map((timestamp) => Date.parse(timestamp ?? ""))
      .filter((value) => Number.isFinite(value))
      .map((value) => (Date.now() - value) / (60 * 60 * 1000));
    return this.calculateMedian(values);
  }

  private calculateMedianMinutesBetween(
    timestamps: Array<{ start: string | undefined; end: string | undefined }>,
  ): number | null {
    const values = timestamps
      .map(({ start, end }) => {
        const startMs = Date.parse(start ?? "");
        const endMs = Date.parse(end ?? "");
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
          return null;
        }
        return (endMs - startMs) / (60 * 1000);
      })
      .filter((value): value is number => value !== null);
    return this.calculateMedian(values);
  }

  private calculateMedian(values: number[]): number | null {
    if (values.length === 0) {
      return null;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return Number(sorted[middle]!.toFixed(1));
    }
    return Number((((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2).toFixed(1));
  }

  private summarizePlanningBacklog(report: PlanningRecommendationBacklogReport): string | null {
    const top = report.groups[0];
    if (!top) {
      return null;
    }
    const staleCount = top.stale_pending_count + top.stale_scheduled_count;
    return `${top.group_summary} (${top.active_count} open, ${top.manual_scheduling_count} manual, ${staleCount} stale)`;
  }

  private summarizePlanningClosure(report: PlanningRecommendationClosureReport): string | null {
    if (report.totals.closed_count === 0) {
      return null;
    }
    return `${report.totals.closed_count} closed in ${report.days}d (${report.totals.completed_count} completed, ${report.totals.handled_elsewhere_count} handled elsewhere)`;
  }

  private summarizePlanningDominantBacklog(report: PlanningRecommendationBacklogReport): string | null {
    const candidate = [...report.groups].sort(
      (left, right) =>
        right.queue_share_pct - left.queue_share_pct ||
        right.active_count - left.active_count ||
        left.group_summary.localeCompare(right.group_summary),
    )[0];
    if (!candidate || candidate.active_count === 0) {
      return null;
    }
    return `${candidate.group_summary} holds ${candidate.queue_share_pct}% of the open planning queue (${candidate.active_count} open)`;
  }

  private getTopPlanningReviewNeededFamily(
    families: Array<PlanningRecommendationHygieneFamilyReport | PlanningRecommendationFamilyStats>,
  ) {
    return [...families]
      .filter((family) => family.review_needed)
      .sort(
        (left, right) =>
          this.suppressionCandidatePriority(right.recommended_action) - this.suppressionCandidatePriority(left.recommended_action) ||
          right.queue_share_pct - left.queue_share_pct ||
          right.closed_last_30d - left.closed_last_30d ||
          left.summary.localeCompare(right.summary),
      )[0];
  }

  private summarizePlanningReviewNeeded(report: PlanningRecommendationHygieneReport): string | null {
    return this.getTopPlanningReviewNeededFamily(report.families)?.summary ?? null;
  }

  private summarizePlanningSuppressionCandidate(report: PlanningRecommendationHygieneReport): string | null {
    const candidate = report.families.find((family) =>
      ["review_source_suppression", "review_externalized_workflow"].includes(family.recommended_action),
    );
    if (!candidate) {
      return null;
    }
    return candidate.summary;
  }

  private summarizePlanningHygiene(report: PlanningRecommendationHygieneReport): string | null {
    return this.summarizePlanningReviewNeeded(report) ?? this.summarizePlanningSuppressionCandidate(report);
  }

  private describeCompletedRecommendationGroup(groupKind: PlanningRecommendationGroupKind, count: number): string {
    if (groupKind === "urgent_unscheduled_tasks") {
      return `${count} urgent task recommendation${count === 1 ? "" : "s"} completed`;
    }
    if (groupKind === "urgent_inbox_followups") {
      return `${count} inbox follow-up recommendation${count === 1 ? "" : "s"} completed`;
    }
    return `${count} meeting prep recommendation${count === 1 ? "" : "s"} completed`;
  }

  private asPlanningRecommendationGroupKind(value: string): PlanningRecommendationGroupKind {
    if (value === "urgent_unscheduled_tasks" || value === "urgent_inbox_followups" || value === "near_term_meeting_prep") {
      return value;
    }
    return "urgent_unscheduled_tasks";
  }

  private describeRecommendationGroup(groupKind: PlanningRecommendationGroupKind, count: number): string {
    if (groupKind === "urgent_unscheduled_tasks") {
      return `${count} urgent task${count === 1 ? "" : "s"} still ${count === 1 ? "has" : "have"} no block`;
    }
    if (groupKind === "urgent_inbox_followups") {
      return `${count} urgent inbox follow-up${count === 1 ? "" : "s"} could be time-blocked`;
    }
    return `${count} meeting${count === 1 ? "" : "s"} likely need prep`;
  }

  private humanizePlanningKind(value: PlanningRecommendationKind): string {
    return value.replaceAll("_", " ");
  }

  private calculateRecommendationRank(
    recommendation: PlanningRecommendation,
    groupSize: number,
    calibration?: PlanningCalibrationStats,
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];
    if (recommendation.kind === "schedule_task_block") {
      score += 300;
      reasons.push("urgent task pressure");
    } else if (recommendation.kind === "schedule_thread_followup") {
      score += 200;
      reasons.push("inbox follow-up");
    } else {
      score += 140;
      reasons.push("meeting prep");
    }

    if (recommendation.priority === "high") {
      score += 60;
      reasons.push("high priority");
    } else if (recommendation.priority === "normal") {
      score += 20;
    }

    if (recommendation.reason_code === "needs_reply") {
      score += 35;
      reasons.push("reply is needed");
    } else if (recommendation.reason_code === "stale_followup") {
      score += 10;
      reasons.push("follow-up is stale");
    } else if (recommendation.reason_code === "task_schedule_pressure") {
      score += 30;
    } else if (recommendation.reason_code === "assistant_requested") {
      score += 20;
      reasons.push("assistant requested the block");
    } else if (recommendation.reason_code === "meeting_prep") {
      score += 15;
    }

    const proposedStartMs = Date.parse(recommendation.proposed_start_at ?? "");
    if (Number.isFinite(proposedStartMs)) {
      const hoursAway = Math.max(0, (proposedStartMs - Date.now()) / (60 * 60_000));
      if (hoursAway <= 2) {
        score += 40;
        reasons.push("slot is soon");
      } else if (hoursAway <= 24) {
        score += 20;
      }
    }

    if (recommendation.kind === "schedule_task_block" && recommendation.source_task_id) {
      const task = this.db.getTask(recommendation.source_task_id);
      const dueMs = Date.parse(task?.due_at ?? "");
      if (Number.isFinite(dueMs)) {
        const hoursUntilDue = (dueMs - Date.now()) / (60 * 60_000);
        if (hoursUntilDue <= 2) {
          score += 80;
          reasons.push("deadline is very close");
        } else if (hoursUntilDue <= 8) {
          score += 40;
          reasons.push("deadline is today");
        }
      }
    }

    if (recommendation.kind === "schedule_event_prep" && recommendation.source_calendar_event_id) {
      const event = this.db.getCalendarEvent(recommendation.source_calendar_event_id);
      const eventStartMs = Date.parse(event?.start_at ?? "");
      if (Number.isFinite(eventStartMs)) {
        const hoursUntilEvent = (eventStartMs - Date.now()) / (60 * 60_000);
        if (hoursUntilEvent <= 2) {
          score += 90;
          reasons.push("meeting is imminent");
        } else if (hoursUntilEvent <= 6) {
          score += 45;
          reasons.push("meeting is later today");
        } else if (hoursUntilEvent > 24) {
          score -= 80;
          reasons.push("meeting is not close enough yet");
        }
      }
    }

    const freshnessMs = Date.parse(recommendation.source_last_seen_at ?? "");
    if (Number.isFinite(freshnessMs)) {
      const hoursOld = Math.max(0, (Date.now() - freshnessMs) / (60 * 60_000));
      if (hoursOld <= 2) {
        score += 20;
        reasons.push("source is fresh");
      } else if (hoursOld <= 24) {
        score += 10;
      }
    }

    if (recommendation.slot_state === "needs_manual_scheduling") {
      score -= 35;
      reasons.push("a unique slot still needs operator input");
    }

    if (groupSize > 1) {
      score -= Math.min(20, (groupSize - 1) * 5);
      reasons.push(groupSize > 2 ? "similar items also exist" : "grouped with a similar item");
    }

    if (
      recommendation.source === "system_generated" &&
      calibration &&
      calibration.closed_count >= 3
    ) {
      if (calibration.source_resolved_count / calibration.closed_count >= 0.6) {
        score -= 20;
        reasons.push("similar items often resolve at the source");
      }
      if (calibration.handled_elsewhere_count / calibration.closed_count >= 0.5) {
        score -= 15;
        reasons.push("similar items are often handled elsewhere");
      }
      if (calibration.completed_count / calibration.closed_count >= 0.5) {
        score += 10;
        reasons.push("similar items often complete successfully");
      }
    }

    return {
      score,
      reason: `${this.humanizePlanningKind(recommendation.kind)} ranked here because ${reasons.join(", ")}.`,
    };
  }

  private refreshPlanningRecommendationReadModel() {
    const activeRecommendations = this.db.listPlanningRecommendations({ include_resolved: false });
    const calibrationByFamily = this.buildPlanningCalibrationMap(
      this.db.listPlanningRecommendations({ include_resolved: true }),
    );
    const pendingGroups = this.groupPlanningRecommendations(activeRecommendations);
    const groupCounts = new Map(pendingGroups.map((group) => [group.group_key, group.pending_count]));
    for (const recommendation of activeRecommendations) {
      const groupKind = this.asPlanningRecommendationGroupKind(recommendation.group_key ?? "urgent_unscheduled_tasks");
      const groupSize = groupCounts.get(groupKind) ?? (recommendation.status === "pending" ? 1 : 0);
      const familyKey = this.getPlanningCalibrationFamilyKey(recommendation);
      const rank = this.calculateRecommendationRank(recommendation, groupSize, calibrationByFamily.get(familyKey));
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        rank_score: rank.score,
        rank_reason: rank.reason,
        ranking_version: PLANNING_RANKING_VERSION,
        group_key: groupKind,
        group_summary: this.describeRecommendationGroup(groupKind, Math.max(1, groupSize)),
      });
    }
  }

  private compareNextActionableRecommendations(left: PlanningRecommendation, right: PlanningRecommendation): number {
    const statusRank = (recommendation: PlanningRecommendation) => (recommendation.status === "pending" ? 0 : recommendation.status === "snoozed" ? 1 : 2);
    const leftStatus = statusRank(left);
    const rightStatus = statusRank(right);
    if (leftStatus !== rightStatus) {
      return leftStatus - rightStatus;
    }
    const leftSlot = left.slot_state === "ready" ? 0 : 1;
    const rightSlot = right.slot_state === "ready" ? 0 : 1;
    if (leftSlot !== rightSlot) {
      return leftSlot - rightSlot;
    }
    if (left.rank_score !== right.rank_score) {
      return right.rank_score - left.rank_score;
    }
    return Date.parse(left.created_at) - Date.parse(right.created_at);
  }

  private buildTaskBlockCandidate(task: TaskItem, options?: {
    source?: PlanningRecommendation["source"];
    proposed_calendar_id?: string | undefined;
    proposed_start_at?: string | undefined;
    proposed_end_at?: string | undefined;
    proposed_title?: string | undefined;
    proposed_notes?: string | undefined;
    reason_code?: string | undefined;
    reason_summary?: string | undefined;
    slot_reason?: string | undefined;
    excluded_slots?: Array<{ start_at: string; end_at: string }> | undefined;
    allow_unslotted?: boolean | undefined;
  }): PlanningRecommendationCandidate | null {
    if (!["pending", "in_progress"].includes(task.state) || task.scheduled_calendar_event_id) {
      return null;
    }
    let slot = null as { start_at: string; end_at: string } | null;
    if (options?.proposed_start_at && options?.proposed_end_at) {
      slot = { start_at: options.proposed_start_at, end_at: options.proposed_end_at };
    } else if (task.priority === "high" && task.due_at) {
      slot = this.findFreeWindow({
        durationMinutes: PLANNING_TASK_BLOCK_MINUTES,
        notBefore: new Date().toISOString(),
        notAfter: task.due_at,
        preferLatest: false,
        excludedRanges: options?.excluded_slots,
      });
    }
    if (!slot && !options?.allow_unslotted) {
      return null;
    }
    return {
      kind: "schedule_task_block",
      priority: options?.source === "assistant_created" ? task.priority : task.priority,
      source_task_id: task.task_id,
      proposed_calendar_id: options?.proposed_calendar_id,
      proposed_start_at: slot?.start_at,
      proposed_end_at: slot?.end_at,
      proposed_title: String(options?.proposed_title ?? task.title).trim() || task.title,
      proposed_notes: options?.proposed_notes ?? task.notes,
      reason_code: options?.reason_code ?? "task_schedule_pressure",
      reason_summary: options?.reason_summary ?? `Reserve time for high-priority task: ${task.title}`,
      dedupe_key: this.makeRecommendationDedupeKey("schedule_task_block", { task_id: task.task_id }),
      source_fingerprint: this.makeTaskRecommendationFingerprint(task),
      source_last_seen_at: task.updated_at,
      slot_state: slot ? "ready" : "needs_manual_scheduling",
      slot_state_reason: slot ? undefined : "no_unique_window_after_group_reservation",
      slot_reason: options?.slot_reason ?? "earliest_free_before_due",
      trigger_signals: options?.source === "assistant_created"
        ? ["assistant_requested", "task_active", "task_unscheduled"]
        : ["task_due_soon", "task_high_priority", "task_unscheduled"],
      suppressed_signals: ["task_unscheduled_due_soon"],
      group_kind: "urgent_unscheduled_tasks",
    };
  }

  private buildThreadFollowupCandidate(
    summary: InboxThreadSummary,
    options?: {
      excluded_slots?: Array<{ start_at: string; end_at: string }> | undefined;
      allow_unslotted?: boolean | undefined;
    },
  ): PlanningRecommendationCandidate | null {
    if (!["needs_reply", "stale_followup"].includes(summary.derived_kind) || this.hasActiveTaskForThread(summary.thread.thread_id)) {
      return null;
    }
    const deadlineDays = summary.derived_kind === "needs_reply" ? 1 : 2;
    const findSlot = (daysAhead: number) =>
      this.findFreeWindow({
        durationMinutes: PLANNING_FOLLOWUP_MINUTES,
        notBefore: new Date().toISOString(),
        notAfter: this.computeBusinessDeadline(daysAhead),
        preferLatest: false,
        excludedRanges: options?.excluded_slots,
      });
    let slot = findSlot(deadlineDays);
    if (!slot) {
      // Keep reply/follow-up planning bounded, but allow one additional business day
      // so grouped recommendations can avoid unnecessary manual-scheduling collisions.
      slot = findSlot(deadlineDays + 1);
    }
    if (!slot && !options?.allow_unslotted) {
      return null;
    }
    const subject = summary.latest_message?.subject?.trim() || "Inbox follow-up";
    return {
      kind: "schedule_thread_followup",
      priority: summary.derived_kind === "needs_reply" ? "high" : "normal",
      source_thread_id: summary.thread.thread_id,
      proposed_start_at: slot?.start_at,
      proposed_end_at: slot?.end_at,
      proposed_title: `Follow up: ${subject}`,
      reason_code: summary.derived_kind,
      reason_summary:
        summary.derived_kind === "needs_reply"
          ? `Set aside time to reply to ${subject}.`
          : `Set aside time for stale follow-up: ${subject}.`,
      dedupe_key: this.makeRecommendationDedupeKey("schedule_thread_followup", {
        thread_id: summary.thread.thread_id,
      }),
      source_fingerprint: this.makeThreadRecommendationFingerprint(summary),
      source_last_seen_at: this.mailTimestampToIso(summary.latest_message?.internal_date ?? "", summary.thread.last_synced_at),
      slot_state: slot ? "ready" : "needs_manual_scheduling",
      slot_state_reason: slot ? undefined : "no_unique_window_after_group_reservation",
      slot_reason: "earliest_free_in_business_window",
      trigger_signals: [summary.derived_kind, "thread_needs_time_block"],
      suppressed_signals: [summary.derived_kind],
      group_kind: "urgent_inbox_followups",
    };
  }

  private buildEventPrepCandidate(
    event: CalendarEvent,
    options?: {
      excluded_slots?: Array<{ start_at: string; end_at: string }> | undefined;
      allow_unslotted?: boolean | undefined;
    },
  ): PlanningRecommendationCandidate | null {
    if (
      event.is_all_day ||
      event.status === "cancelled" ||
      event.created_by_personal_ops ||
      event.source_task_id ||
      this.hasActiveTaskForEvent(event.event_id) ||
      Date.parse(event.start_at) <= Date.now()
    ) {
      return null;
    }
    const slot = this.findFreeWindow({
      durationMinutes: PLANNING_PREP_MINUTES,
      notBefore: new Date().toISOString(),
      notAfter: event.start_at,
      preferLatest: true,
      excludedRanges: options?.excluded_slots,
    });
    if (!slot && !options?.allow_unslotted) {
      return null;
    }
    const title = event.summary?.trim() || "Upcoming event";
    return {
      kind: "schedule_event_prep",
      priority: "normal",
      source_calendar_event_id: event.event_id,
      proposed_start_at: slot?.start_at,
      proposed_end_at: slot?.end_at,
      proposed_title: `Prep: ${title}`,
      proposed_notes: event.notes,
      reason_code: "meeting_prep",
      reason_summary: `Reserve prep time for ${title}.`,
      dedupe_key: this.makeRecommendationDedupeKey("schedule_event_prep", {
        calendar_event_id: event.event_id,
      }),
      source_fingerprint: this.makeEventRecommendationFingerprint(event),
      source_last_seen_at: event.updated_at,
      slot_state: slot ? "ready" : "needs_manual_scheduling",
      slot_state_reason: slot ? undefined : "no_unique_window_after_group_reservation",
      slot_reason: "latest_free_before_event",
      trigger_signals: ["calendar_event_soon", "meeting_prep_needed"],
      suppressed_signals: ["calendar_event_soon"],
      group_kind: "near_term_meeting_prep",
    };
  }

  private replanRecommendation(
    identity: ClientIdentity,
    recommendation: PlanningRecommendation,
    note: string,
  ): PlanningRecommendationDetail {
    if (!this.isRecommendationSourceRelevant(recommendation)) {
      this.markPlanningRecommendationSourceResolved(
        recommendation,
        "The planning recommendation source no longer needs action.",
        "operator",
        identity.client_id,
        identity.requested_by,
      );
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        decision_note: note,
      });
      throw new Error("The planning recommendation source no longer needs action.");
    }
    const nextCandidate = this.buildCandidateFromRecommendation(recommendation);
    if (!nextCandidate) {
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        last_error_code: "slot_unavailable",
        last_error_message: "No better time block is currently available.",
      });
      throw new Error("No better time block is currently available.");
    }
    if (
      nextCandidate.proposed_start_at === recommendation.proposed_start_at &&
      nextCandidate.proposed_end_at === recommendation.proposed_end_at
    ) {
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        last_error_code: "slot_unchanged",
        last_error_message: "Replan did not find a different time block.",
      });
      throw new Error("No better time block is currently available.");
    }
    this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
      priority: nextCandidate.priority,
      source_task_id: nextCandidate.source_task_id ?? null,
      source_thread_id: nextCandidate.source_thread_id ?? null,
      source_calendar_event_id: nextCandidate.source_calendar_event_id ?? null,
      proposed_calendar_id: nextCandidate.proposed_calendar_id ?? null,
      proposed_start_at: nextCandidate.proposed_start_at,
      proposed_end_at: nextCandidate.proposed_end_at,
      proposed_title: nextCandidate.proposed_title,
      proposed_notes: nextCandidate.proposed_notes ?? null,
      reason_code: nextCandidate.reason_code,
      reason_summary: nextCandidate.reason_summary,
      source_fingerprint: nextCandidate.source_fingerprint,
      source_last_seen_at: nextCandidate.source_last_seen_at ?? null,
      slot_state: nextCandidate.slot_state,
      slot_state_reason: nextCandidate.slot_state_reason ?? null,
      slot_reason: "replanned_after_conflict",
      trigger_signals: nextCandidate.trigger_signals,
      suppressed_signals: nextCandidate.suppressed_signals,
      group_key: nextCandidate.group_kind,
      group_summary: this.describeRecommendationGroup(nextCandidate.group_kind, 1),
      status: "pending",
      snoozed_until: null,
      last_error_code: null,
      last_error_message: null,
      resolved_at: null,
      replan_count: recommendation.replan_count + 1,
      last_replanned_at: new Date().toISOString(),
    });
    this.recordPlanningRecommendationFirstAction(recommendation, "replan", identity);
    this.refreshPlanningRecommendationReadModel();
    return this.getPlanningRecommendationDetail(recommendation.recommendation_id);
  }

  private buildCandidateFromRecommendation(recommendation: PlanningRecommendation): PlanningRecommendationCandidate | null {
    const excludedSlots =
      recommendation.proposed_start_at && recommendation.proposed_end_at
        ? [{
            start_at: recommendation.proposed_start_at,
            end_at: recommendation.proposed_end_at,
          }]
        : undefined;
    if (recommendation.kind === "schedule_task_block") {
      const task = recommendation.source_task_id ? this.db.getTask(recommendation.source_task_id) : null;
      if (!task) {
        return null;
      }
      return this.buildTaskBlockCandidate(task, {
        source: recommendation.source,
        proposed_calendar_id: recommendation.proposed_calendar_id,
        proposed_title: recommendation.proposed_title,
        proposed_notes: recommendation.proposed_notes,
        reason_code: recommendation.source === "assistant_created" ? "assistant_requested" : recommendation.reason_code,
        reason_summary:
          recommendation.source === "assistant_created"
            ? `Assistant suggested a task block for ${task.title}.`
            : recommendation.reason_summary,
        excluded_slots: excludedSlots,
      });
    }
    if (recommendation.kind === "schedule_thread_followup") {
      const thread = recommendation.source_thread_id ? this.db.getMailThread(recommendation.source_thread_id) : null;
      if (!thread) {
        return null;
      }
      return this.buildThreadFollowupCandidate(this.buildInboxThreadSummary(thread), { excluded_slots: excludedSlots });
    }
    const event = recommendation.source_calendar_event_id
      ? this.db.getCalendarEvent(recommendation.source_calendar_event_id)
      : null;
    if (!event) {
      return null;
    }
    return this.buildEventPrepCandidate(event, { excluded_slots: excludedSlots });
  }

  private upsertPlanningRecommendation(
    identity: ClientIdentity,
    input: PlanningRecommendationCandidate & { source: PlanningRecommendation["source"] },
  ): PlanningRecommendation {
    const existing = this.db.getLatestPlanningRecommendationByDedupeKey(input.dedupe_key);
    const now = new Date().toISOString();
    if (existing) {
      const sameFingerprint = existing.source_fingerprint === input.source_fingerprint;
      const snoozeExpired = !existing.snoozed_until || Date.parse(existing.snoozed_until) <= Date.now();
      if (existing.status === "rejected" && sameFingerprint) {
        return existing;
      }
      if (existing.status === "snoozed" && sameFingerprint && !snoozeExpired) {
        return existing;
      }
      if (["pending", "snoozed"].includes(existing.status)) {
        return this.db.updatePlanningRecommendation(existing.recommendation_id, {
          kind: input.kind,
          status: existing.status === "snoozed" && sameFingerprint && !snoozeExpired ? "snoozed" : "pending",
          priority: input.priority,
          source_task_id: input.source_task_id ?? null,
          source_thread_id: input.source_thread_id ?? null,
          source_calendar_event_id: input.source_calendar_event_id ?? null,
          proposed_calendar_id: input.proposed_calendar_id ?? null,
          proposed_start_at: input.proposed_start_at,
          proposed_end_at: input.proposed_end_at,
          proposed_title: input.proposed_title,
          proposed_notes: input.proposed_notes ?? null,
          reason_code: input.reason_code,
          reason_summary: input.reason_summary,
          source_fingerprint: input.source_fingerprint,
          source_last_seen_at: input.source_last_seen_at ?? null,
          outcome_state: existing.outcome_state,
          outcome_recorded_at: existing.outcome_recorded_at ?? null,
          outcome_source: existing.outcome_source ?? null,
          outcome_summary: existing.outcome_summary ?? null,
          slot_state: input.slot_state,
          slot_state_reason: input.slot_state_reason ?? null,
          slot_reason: input.slot_reason,
          trigger_signals: input.trigger_signals,
          suppressed_signals: input.suppressed_signals,
          group_key: input.group_kind,
          group_summary: this.describeRecommendationGroup(input.group_kind, 1),
          snoozed_until: existing.status === "snoozed" && sameFingerprint && !snoozeExpired ? existing.snoozed_until ?? null : null,
          resolved_at: null,
          last_error_code: null,
          last_error_message: null,
        })!;
      }
      if (!sameFingerprint && ["applied", "expired", "superseded", "rejected"].includes(existing.status)) {
        return this.db.createPlanningRecommendation(identity, {
          ...input,
          status: "pending",
          source_last_seen_at: input.source_last_seen_at ?? null,
          outcome_state: "none",
          slot_state: input.slot_state,
          slot_state_reason: input.slot_state_reason ?? null,
          slot_reason: input.slot_reason,
          trigger_signals: input.trigger_signals,
          suppressed_signals: input.suppressed_signals,
          group_key: input.group_kind,
          group_summary: this.describeRecommendationGroup(input.group_kind, 1),
        });
      }
      if (existing.status === "rejected" && !sameFingerprint) {
        return this.db.createPlanningRecommendation(identity, {
          ...input,
          status: "pending",
          source_last_seen_at: input.source_last_seen_at ?? null,
          outcome_state: "none",
          slot_state: input.slot_state,
          slot_state_reason: input.slot_state_reason ?? null,
          slot_reason: input.slot_reason,
          trigger_signals: input.trigger_signals,
          suppressed_signals: input.suppressed_signals,
          group_key: input.group_kind,
          group_summary: this.describeRecommendationGroup(input.group_kind, 1),
        });
      }
      if (existing.status === "applied") {
        return existing;
      }
    }
    return this.db.createPlanningRecommendation(identity, {
      ...input,
      status: "pending",
      source_last_seen_at: input.source_last_seen_at ?? null,
      outcome_state: "none",
      slot_state: input.slot_state,
      slot_state_reason: input.slot_state_reason ?? null,
      slot_reason: input.slot_reason,
      trigger_signals: input.trigger_signals,
      suppressed_signals: input.suppressed_signals,
      group_key: input.group_kind,
      group_summary: this.describeRecommendationGroup(input.group_kind, 1),
    });
  }

  private refreshPlanningRecommendationsInternal(identity: ClientIdentity): {
    refreshed_count: number;
    pending_count: number;
    superseded_count: number;
    expired_count: number;
  } {
    const candidates = this.collectPlanningRecommendationCandidates();
    const candidateKeys = new Set(candidates.map((candidate) => candidate.dedupe_key));
    let refreshed = 0;
    for (const candidate of candidates) {
      this.upsertPlanningRecommendation(identity, {
        ...candidate,
        source: "system_generated",
      });
      refreshed += 1;
    }

    for (const recommendation of this.db.listPlanningRecommendations({ include_resolved: false })) {
      if (candidateKeys.has(recommendation.dedupe_key)) {
        continue;
      }
      if (!this.isRecommendationSourceRelevant(recommendation)) {
        this.markPlanningRecommendationSourceResolved(
          recommendation,
          recommendation.outcome_summary ?? "The source no longer needs planning action.",
          "system",
          "system",
          identity.requested_by,
        );
        continue;
      }
      if (!this.isRecommendationSlotUsable(recommendation)) {
        const expiredAt = new Date().toISOString();
        this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
          status: "expired",
          resolved_at: expiredAt,
          last_error_code: null,
          last_error_message: null,
        });
        this.closePlanningRecommendation(recommendation.recommendation_id, "expired", {
          client_id: identity.client_id,
          requested_by: identity.requested_by,
        }, expiredAt);
      }
    }

    this.refreshPlanningRecommendationReadModel();

    const counts = this.db.countPlanningRecommendationStates();
    return {
      refreshed_count: refreshed,
      pending_count: counts.pending,
      superseded_count: counts.superseded,
      expired_count: counts.expired,
    };
  }

  private collectPlanningRecommendationCandidates(): PlanningRecommendationCandidate[] {
    return [
      ...this.collectTaskBlockRecommendationCandidates(),
      ...this.collectThreadFollowupRecommendationCandidates(),
      ...this.collectEventPrepRecommendationCandidates(),
    ];
  }

  private collectTaskBlockRecommendationCandidates(): PlanningRecommendationCandidate[] {
    const now = Date.now();
    const candidates: PlanningRecommendationCandidate[] = [];
    const reservedSlots: Array<{ start_at: string; end_at: string }> = [];
    const tasks = this.db
      .listTasks({ activeOnly: true })
      .filter((task) => task.priority === "high" && Boolean(task.due_at) && !task.scheduled_calendar_event_id)
      .sort((left, right) => {
        const leftDue = Date.parse(left.due_at ?? "");
        const rightDue = Date.parse(right.due_at ?? "");
        return leftDue - rightDue || Date.parse(left.created_at) - Date.parse(right.created_at);
      });
    for (const task of tasks) {
      if (task.priority !== "high" || !task.due_at || task.scheduled_calendar_event_id) {
        continue;
      }
      const dueAtMs = Date.parse(task.due_at);
      if (!Number.isFinite(dueAtMs) || dueAtMs > now + TASK_DUE_SOON_HOURS * 60 * 60 * 1000) {
        continue;
      }
      const slot = this.findFreeWindow({
        durationMinutes: PLANNING_TASK_BLOCK_MINUTES,
        notBefore: new Date().toISOString(),
        notAfter: task.due_at,
        preferLatest: false,
        excludedRanges: reservedSlots,
      });
      const candidate = this.buildTaskBlockCandidate(task, {
        proposed_start_at: slot?.start_at,
        proposed_end_at: slot?.end_at,
        excluded_slots: reservedSlots,
        allow_unslotted: true,
      });
      if (candidate) {
        candidates.push(candidate);
        if (candidate.proposed_start_at && candidate.proposed_end_at) {
          reservedSlots.push({ start_at: candidate.proposed_start_at, end_at: candidate.proposed_end_at });
        }
      }
    }
    return candidates;
  }

  private collectThreadFollowupRecommendationCandidates(): PlanningRecommendationCandidate[] {
    const candidates: PlanningRecommendationCandidate[] = [];
    const reservedSlots: Array<{ start_at: string; end_at: string }> = [];
    const summaries = this.listInboxThreadSummaries(
      MAX_INBOX_LIMIT,
      (summary) => ["needs_reply", "stale_followup"].includes(summary.derived_kind),
      (left, right) => {
        const priorityRank = (value: InboxThreadSummary["derived_kind"]) => (value === "needs_reply" ? 0 : 1);
        const priorityDelta = priorityRank(left.derived_kind) - priorityRank(right.derived_kind);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        const leftSeen = Date.parse(this.mailTimestampToIso(left.latest_message?.internal_date ?? "", left.thread.last_synced_at));
        const rightSeen = Date.parse(this.mailTimestampToIso(right.latest_message?.internal_date ?? "", right.thread.last_synced_at));
        return rightSeen - leftSeen;
      },
    );
    for (const summary of summaries) {
      const candidate = this.buildThreadFollowupCandidate(summary, {
        excluded_slots: reservedSlots,
        allow_unslotted: true,
      });
      if (candidate) {
        candidates.push(candidate);
        if (candidate.proposed_start_at && candidate.proposed_end_at) {
          reservedSlots.push({ start_at: candidate.proposed_start_at, end_at: candidate.proposed_end_at });
        }
      }
    }
    return candidates;
  }

  private collectEventPrepRecommendationCandidates(): PlanningRecommendationCandidate[] {
    const candidates: PlanningRecommendationCandidate[] = [];
    const now = Date.now();
    const reservedSlots: Array<{ start_at: string; end_at: string }> = [];
    for (const event of this.listUpcomingCalendarEvents(1, MAX_INBOX_LIMIT)) {
      if (
        event.is_all_day ||
        event.status === "cancelled" ||
        event.created_by_personal_ops ||
        event.source_task_id ||
        Date.parse(event.start_at) <= now
      ) {
        continue;
      }
      if (Date.parse(event.start_at) > now + this.config.meetingPrepWarningMinutes * 60 * 1000) {
        break;
      }
      if (this.hasActiveTaskForEvent(event.event_id)) {
        continue;
      }
      const candidate = this.buildEventPrepCandidate(event, {
        excluded_slots: reservedSlots,
        allow_unslotted: true,
      });
      if (candidate) {
        candidates.push(candidate);
        if (candidate.proposed_start_at && candidate.proposed_end_at) {
          reservedSlots.push({ start_at: candidate.proposed_start_at, end_at: candidate.proposed_end_at });
        }
      }
    }
    return candidates;
  }

  private computeBusinessDeadline(daysAhead: number): string {
    const cursor = new Date();
    let businessDays = 0;
    while (businessDays < Math.max(1, daysAhead)) {
      cursor.setDate(cursor.getDate() + 1);
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        businessDays += 1;
      }
    }
    const deadlineDay = this.formatLocalDay(cursor);
    return this.getWorkdayBounds(deadlineDay).end.toISOString();
  }

  private resolvePlanningSnoozeUntil(until?: string, preset?: string, now = new Date()): string {
    if (until?.trim()) {
      const parsed = Date.parse(until);
      if (!Number.isFinite(parsed) || parsed <= Date.now()) {
        throw new Error("Snooze-until must be a future timestamp.");
      }
      return new Date(parsed).toISOString();
    }
    const normalizedPreset = (preset ?? "").trim().toLowerCase();
    if (!normalizedPreset) {
      throw new Error("Either a snooze preset or snooze-until timestamp is required.");
    }
    let resolvedAt: string | null = null;
    if (["end-of-day", "end_of_day", "eod"].includes(normalizedPreset)) {
      const todayEnd = this.getWorkdayBounds(this.formatLocalDay(now)).end;
      resolvedAt = todayEnd > now ? todayEnd.toISOString() : this.nextBusinessWorkdayBoundary(now, "end");
    }
    if (!resolvedAt && ["tomorrow-morning", "tomorrow_morning"].includes(normalizedPreset)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      resolvedAt = this.getWorkdayBounds(this.formatLocalDay(tomorrow)).start.toISOString();
    }
    if (!resolvedAt && ["next-business-day", "next_business_day"].includes(normalizedPreset)) {
      resolvedAt = this.nextBusinessWorkdayBoundary(now, "start");
    }
    if (!resolvedAt) {
      throw new Error(`Unsupported snooze preset: ${preset}.`);
    }
    if (Date.parse(resolvedAt) <= now.getTime()) {
      throw new Error("Snooze preset must resolve to a future timestamp.");
    }
    return resolvedAt;
  }

  private nextBusinessWorkdayBoundary(from: Date, boundary: "start" | "end"): string {
    const cursor = new Date(from);
    while (true) {
      cursor.setDate(cursor.getDate() + 1);
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        return this.getWorkdayBounds(this.formatLocalDay(cursor))[boundary].toISOString();
      }
    }
  }

  private splitRangeAroundExclusions(
    range: { startMs: number; endMs: number },
    excludedRanges?: Array<{ start_at: string; end_at: string }>,
  ): Array<{ startMs: number; endMs: number }> {
    if (!excludedRanges || excludedRanges.length === 0) {
      return [range];
    }
    let segments: Array<{ startMs: number; endMs: number }> = [range];
    for (const excludedRange of excludedRanges) {
      if (!excludedRange?.start_at || !excludedRange?.end_at) {
        continue;
      }
      const excludedStart = Date.parse(excludedRange.start_at);
      const excludedEnd = Date.parse(excludedRange.end_at);
      if (!Number.isFinite(excludedStart) || !Number.isFinite(excludedEnd) || excludedEnd <= excludedStart) {
        continue;
      }
      const nextSegments: Array<{ startMs: number; endMs: number }> = [];
      for (const segment of segments) {
        if (excludedEnd <= segment.startMs || excludedStart >= segment.endMs) {
          nextSegments.push(segment);
          continue;
        }
        if (excludedStart > segment.startMs) {
          nextSegments.push({ startMs: segment.startMs, endMs: Math.min(excludedStart, segment.endMs) });
        }
        if (excludedEnd < segment.endMs) {
          nextSegments.push({ startMs: Math.max(excludedEnd, segment.startMs), endMs: segment.endMs });
        }
      }
      segments = nextSegments;
      if (segments.length === 0) {
        break;
      }
    }
    return segments;
  }

  private pushFreeWindowCandidates(
    windows: Array<{ start_at: string; end_at: string }>,
    range: { startMs: number; endMs: number },
    durationMs: number,
    preferLatest: boolean,
  ) {
    if (range.endMs - range.startMs < durationMs) {
      return;
    }
    if (preferLatest) {
      windows.push({
        start_at: new Date(range.endMs - durationMs).toISOString(),
        end_at: new Date(range.endMs).toISOString(),
      });
      return;
    }
    windows.push({
      start_at: new Date(range.startMs).toISOString(),
      end_at: new Date(range.startMs + durationMs).toISOString(),
    });
  }

  private findFreeWindow(options: {
    durationMinutes: number;
    notBefore: string;
    notAfter: string;
    preferLatest: boolean;
    excludedRanges?: Array<{ start_at: string; end_at: string }> | undefined;
  }): { start_at: string; end_at: string } | null {
    const notBeforeMs = Date.parse(options.notBefore);
    const notAfterMs = Date.parse(options.notAfter);
    if (!Number.isFinite(notBeforeMs) || !Number.isFinite(notAfterMs) || notAfterMs <= notBeforeMs) {
      return null;
    }
    const earliestStartMs = Math.max(notBeforeMs, Date.now() + 60_000);
    const windows: Array<{ start_at: string; end_at: string }> = [];
    const durationMs = options.durationMinutes * 60_000;
    let cursor = new Date(earliestStartMs);
    while (cursor.getTime() < notAfterMs) {
      const day = this.formatLocalDay(cursor);
      for (const window of this.computeFreeTimeWindows(day)) {
        const windowStart = Math.max(Date.parse(window.start_at), earliestStartMs);
        const windowEnd = Math.min(Date.parse(window.end_at), notAfterMs);
        for (const segment of this.splitRangeAroundExclusions(
          { startMs: windowStart, endMs: windowEnd },
          options.excludedRanges,
        )) {
          this.pushFreeWindowCandidates(windows, segment, durationMs, options.preferLatest);
        }
      }
      cursor = new Date(this.getLocalDayBounds(day).end.getTime());
    }
    if (windows.length === 0) {
      return null;
    }
    return options.preferLatest
      ? windows.sort((left, right) => Date.parse(right.end_at) - Date.parse(left.end_at))[0] ?? null
      : windows.sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at))[0] ?? null;
  }

  private hasActiveTaskForThread(threadId: string): boolean {
    return this.db.listTasks({ activeOnly: true }).some((task) => task.source_thread_id === threadId);
  }

  private hasActiveTaskForEvent(eventId: string): boolean {
    return this.db.listTasks({ activeOnly: true }).some((task) => task.source_calendar_event_id === eventId);
  }

  private isTimeRangeUsable(startAt: string, endAt: string, ignoreEventId?: string): boolean {
    const startMs = Date.parse(startAt);
    const endMs = Date.parse(endAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || startMs < Date.now()) {
      return false;
    }
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    if (!account) {
      return false;
    }
    const conflicts = this.db.listCalendarEvents({
      account,
      ends_after: startAt,
      starts_before: endAt,
    });
    return !conflicts.some((event) => {
      if (event.event_id === ignoreEventId || !event.is_busy || event.status === "cancelled") {
        return false;
      }
      const eventStart = Date.parse(event.start_at);
      const eventEnd = Date.parse(event.end_at);
      return eventEnd > startMs && eventStart < endMs;
    });
  }

  private isRecommendationSourceRelevant(recommendation: PlanningRecommendation): boolean {
    if (recommendation.kind === "schedule_task_block") {
      const task = recommendation.source_task_id ? this.db.getTask(recommendation.source_task_id) : null;
      return Boolean(task && ["pending", "in_progress"].includes(task.state) && !task.scheduled_calendar_event_id);
    }
    if (recommendation.kind === "schedule_thread_followup") {
      const thread = recommendation.source_thread_id ? this.db.getMailThread(recommendation.source_thread_id) : null;
      if (!thread || this.hasActiveTaskForThread(thread.thread_id)) {
        return false;
      }
      const summary = this.buildInboxThreadSummary(thread);
      return ["needs_reply", "stale_followup"].includes(summary.derived_kind);
    }
    const event = recommendation.source_calendar_event_id
      ? this.db.getCalendarEvent(recommendation.source_calendar_event_id)
      : null;
    return Boolean(
      event &&
        !event.is_all_day &&
        event.status !== "cancelled" &&
        !event.created_by_personal_ops &&
        !event.source_task_id &&
        !this.hasActiveTaskForEvent(event.event_id) &&
        Date.parse(event.start_at) > Date.now(),
    );
  }

  private isRecommendationSlotUsable(recommendation: PlanningRecommendation): boolean {
    if (!recommendation.proposed_start_at || !recommendation.proposed_end_at) {
      return false;
    }
    return this.isTimeRangeUsable(recommendation.proposed_start_at, recommendation.proposed_end_at);
  }

  private async applyTaskBlockRecommendation(
    identity: ClientIdentity,
    recommendation: PlanningRecommendation,
    note: string,
  ): Promise<void> {
    const task = recommendation.source_task_id ? this.db.getTask(recommendation.source_task_id) : null;
    if (!task || !["pending", "in_progress"].includes(task.state) || task.scheduled_calendar_event_id) {
      this.markPlanningRecommendationSourceResolved(
        recommendation,
        "The task no longer needs scheduling.",
        "operator",
        identity.client_id,
        identity.requested_by,
      );
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        decision_note: note,
      });
      throw new Error("The task no longer needs scheduling.");
    }
    if (recommendation.slot_state === "needs_manual_scheduling" || !recommendation.proposed_start_at || !recommendation.proposed_end_at) {
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        last_error_code: "manual_scheduling_required",
        last_error_message: "This recommendation needs manual scheduling before it can be applied.",
      });
      throw new Error("This recommendation needs manual scheduling before it can be applied.");
    }
    if (!this.isRecommendationSlotUsable(recommendation)) {
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        last_error_code: "slot_unavailable",
        last_error_message: "The proposed time block is no longer available.",
      });
      throw new Error("The proposed time block is no longer available.");
    }
    const result = await this.scheduleTaskOnCalendar(identity, task.task_id, {
      calendar_id: recommendation.proposed_calendar_id,
      title: recommendation.proposed_title,
      notes: recommendation.proposed_notes,
      start_at: recommendation.proposed_start_at,
      end_at: recommendation.proposed_end_at,
    }, { refreshPlanningRecommendations: false });
    this.db.updateTask(task.task_id, {
      source_planning_recommendation_id: recommendation.recommendation_id,
    });
    this.recordPlanningRecommendationFirstAction(recommendation, "apply", identity);
    this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
      status: "applied",
      decision_note: note,
      applied_task_id: result.task.task_id,
      applied_calendar_event_id: result.event.event_id,
      outcome_state: "scheduled",
      outcome_recorded_at: new Date().toISOString(),
      outcome_source: "operator",
      outcome_summary: `Scheduled ${result.task.title} from the recommendation.`,
      last_error_code: null,
      last_error_message: null,
      resolved_at: new Date().toISOString(),
      snoozed_until: null,
    });
    this.recordPlanningRecommendationOutcomeUpdate(
      recommendation.recommendation_id,
      "scheduled",
      "operator",
      `Scheduled ${result.task.title} from the recommendation.`,
      identity.client_id,
    );
  }

  private async applyThreadFollowupRecommendation(
    identity: ClientIdentity,
    recommendation: PlanningRecommendation,
    note: string,
  ): Promise<void> {
    const thread = recommendation.source_thread_id ? this.db.getMailThread(recommendation.source_thread_id) : null;
    if (!thread || this.hasActiveTaskForThread(thread.thread_id)) {
      this.markPlanningRecommendationSourceResolved(
        recommendation,
        "The thread no longer needs a follow-up recommendation.",
        "operator",
        identity.client_id,
        identity.requested_by,
      );
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        decision_note: note,
      });
      throw new Error("The thread no longer needs a follow-up recommendation.");
    }
    const summary = this.buildInboxThreadSummary(thread);
    if (!["needs_reply", "stale_followup"].includes(summary.derived_kind)) {
      this.markPlanningRecommendationSourceResolved(
        recommendation,
        "The thread no longer needs follow-up scheduling.",
        "operator",
        identity.client_id,
        identity.requested_by,
      );
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        decision_note: note,
      });
      throw new Error("The thread no longer needs follow-up scheduling.");
    }
    if (recommendation.slot_state === "needs_manual_scheduling" || !recommendation.proposed_start_at || !recommendation.proposed_end_at) {
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        last_error_code: "manual_scheduling_required",
        last_error_message: "This recommendation needs manual scheduling before it can be applied.",
      });
      throw new Error("This recommendation needs manual scheduling before it can be applied.");
    }
    if (!this.isRecommendationSlotUsable(recommendation)) {
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        last_error_code: "slot_unavailable",
        last_error_message: "The proposed follow-up block is no longer available.",
      });
      throw new Error("The proposed follow-up block is no longer available.");
    }
    const task = this.createTaskFromPlanningRecommendation(identity, recommendation, {
      title: recommendation.proposed_title ?? "Inbox follow-up",
      notes: recommendation.proposed_notes,
      kind: "assistant_work",
      priority: recommendation.priority,
      source_thread_id: thread.thread_id,
    });
    const result = await this.scheduleTaskOnCalendar(identity, task.task_id, {
      calendar_id: recommendation.proposed_calendar_id,
      title: recommendation.proposed_title,
      notes: recommendation.proposed_notes,
      start_at: recommendation.proposed_start_at,
      end_at: recommendation.proposed_end_at,
    }, { refreshPlanningRecommendations: false });
    this.recordPlanningRecommendationFirstAction(recommendation, "apply", identity);
    this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
      status: "applied",
      decision_note: note,
      applied_task_id: result.task.task_id,
      applied_calendar_event_id: result.event.event_id,
      outcome_state: "scheduled",
      outcome_recorded_at: new Date().toISOString(),
      outcome_source: "operator",
      outcome_summary: `Scheduled follow-up work for ${recommendation.proposed_title ?? "the inbox thread"}.`,
      last_error_code: null,
      last_error_message: null,
      resolved_at: new Date().toISOString(),
      snoozed_until: null,
    });
    this.recordPlanningRecommendationOutcomeUpdate(
      recommendation.recommendation_id,
      "scheduled",
      "operator",
      `Scheduled follow-up work for ${recommendation.proposed_title ?? "the inbox thread"}.`,
      identity.client_id,
    );
  }

  private async applyEventPrepRecommendation(
    identity: ClientIdentity,
    recommendation: PlanningRecommendation,
    note: string,
  ): Promise<void> {
    const event = recommendation.source_calendar_event_id
      ? this.db.getCalendarEvent(recommendation.source_calendar_event_id)
      : null;
    if (!event || event.status === "cancelled" || event.is_all_day || this.hasActiveTaskForEvent(event.event_id)) {
      this.markPlanningRecommendationSourceResolved(
        recommendation,
        "The event no longer needs prep scheduling.",
        "operator",
        identity.client_id,
        identity.requested_by,
      );
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        decision_note: note,
      });
      throw new Error("The event no longer needs prep scheduling.");
    }
    if (recommendation.slot_state === "needs_manual_scheduling" || !recommendation.proposed_start_at || !recommendation.proposed_end_at) {
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        last_error_code: "manual_scheduling_required",
        last_error_message: "This recommendation needs manual scheduling before it can be applied.",
      });
      throw new Error("This recommendation needs manual scheduling before it can be applied.");
    }
    if (!this.isRecommendationSlotUsable(recommendation)) {
      this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
        last_error_code: "slot_unavailable",
        last_error_message: "The proposed prep block is no longer available.",
      });
      throw new Error("The proposed prep block is no longer available.");
    }
    const task = this.createTaskFromPlanningRecommendation(identity, recommendation, {
      title: recommendation.proposed_title ?? "Event prep",
      notes: recommendation.proposed_notes,
      kind: "assistant_work",
      priority: recommendation.priority,
      source_calendar_event_id: event.event_id,
    });
    const result = await this.scheduleTaskOnCalendar(identity, task.task_id, {
      calendar_id: recommendation.proposed_calendar_id,
      title: recommendation.proposed_title,
      notes: recommendation.proposed_notes,
      start_at: recommendation.proposed_start_at,
      end_at: recommendation.proposed_end_at,
    }, { refreshPlanningRecommendations: false });
    this.recordPlanningRecommendationFirstAction(recommendation, "apply", identity);
    this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
      status: "applied",
      decision_note: note,
      applied_task_id: result.task.task_id,
      applied_calendar_event_id: result.event.event_id,
      outcome_state: "scheduled",
      outcome_recorded_at: new Date().toISOString(),
      outcome_source: "operator",
      outcome_summary: `Scheduled prep work for ${recommendation.proposed_title ?? "the upcoming event"}.`,
      last_error_code: null,
      last_error_message: null,
      resolved_at: new Date().toISOString(),
      snoozed_until: null,
    });
    this.recordPlanningRecommendationOutcomeUpdate(
      recommendation.recommendation_id,
      "scheduled",
      "operator",
      `Scheduled prep work for ${recommendation.proposed_title ?? "the upcoming event"}.`,
      identity.client_id,
    );
  }

  private createTaskFromPlanningRecommendation(
    identity: ClientIdentity,
    recommendation: PlanningRecommendation,
    input: {
      title: string;
      notes?: string | undefined;
      kind: TaskItem["kind"];
      priority: TaskItem["priority"];
      source_thread_id?: string | undefined;
      source_calendar_event_id?: string | undefined;
    },
  ): TaskItem {
    const task = this.db.createTask(identity, {
      title: input.title,
      notes: input.notes,
      kind: input.kind,
      priority: input.priority,
      owner: "operator",
      source: "accepted_recommendation",
      source_planning_recommendation_id: recommendation.recommendation_id,
      source_thread_id: input.source_thread_id ?? null,
      source_calendar_event_id: input.source_calendar_event_id ?? null,
      decision_note: recommendation.reason_summary,
    });
    this.db.recordAuditEvent({
      client_id: identity.client_id,
      action: "task_create",
      target_type: "task",
      target_id: task.task_id,
      outcome: "success",
      metadata: {
        title: task.title,
        owner: task.owner,
        kind: task.kind,
        priority: task.priority,
        planning_recommendation_id: recommendation.recommendation_id,
      },
    });
    return task;
  }

  private compareAttentionItems(left: AttentionItem, right: AttentionItem): number {
    const severityRank: Record<AttentionSeverity, number> = { critical: 0, warn: 1, info: 2 };
    const severityDelta = severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    const leftRank = left.sort_rank ?? Number.NEGATIVE_INFINITY;
    const rightRank = right.sort_rank ?? Number.NEGATIVE_INFINITY;
    if (leftRank !== rightRank) {
      return rightRank - leftRank;
    }
    const leftDue = left.due_at ? Date.parse(left.due_at) : Number.POSITIVE_INFINITY;
    const rightDue = right.due_at ? Date.parse(right.due_at) : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }
    return Date.parse(left.created_at) - Date.parse(right.created_at);
  }

  private requiresStepUp(identity: ClientIdentity): boolean {
    return identity.auth_role === "assistant" || identity.origin === "assistant-mcp";
  }

  private assertStepUpIfRequired(
    identity: ClientIdentity,
    context: ApprovalContext,
    action: ApprovalAction,
    confirmationToken?: string,
  ) {
    if (!this.requiresStepUp(identity)) {
      return;
    }
    if (!confirmationToken) {
      throw new Error(`A confirmation token is required to ${action} from MCP.`);
    }
    const expected = this.computeConfirmationDigest(
      context.approval.approval_id,
      action,
      context.approval.draft_digest,
      confirmationToken,
    );
    const consumed = this.db.consumeApprovalConfirmation(context.approval.approval_id, expected, new Date().toISOString());
    if (!consumed) {
      throw new Error("The confirmation token does not match the current approval state.");
    }
  }

  private computeConfirmationDigest(
    approvalId: string,
    action: ApprovalAction,
    draftDigest: string,
    confirmationToken: string,
  ): string {
    return createHash("sha256")
      .update(`${approvalId}:${action}:${draftDigest}:${confirmationToken}`)
      .digest("hex");
  }

  private assertApprovalActionAllowed(context: ApprovalContext, action: ApprovalAction) {
    if (action === "approve" && !["pending", "send_failed"].includes(context.approval.state)) {
      throw new Error(`Approval request ${context.approval.approval_id} cannot be approved from state ${context.approval.state}.`);
    }
    if (action === "send" && context.approval.state !== "approved") {
      throw new Error(`Approval request ${context.approval.approval_id} cannot be sent from state ${context.approval.state}.`);
    }
  }

  private assertApprovalFresh(context: ApprovalContext) {
    if (Date.parse(context.approval.expires_at) < Date.now()) {
      this.expireApprovalContext(context, "approval_expired", "Approval expired before send.");
      throw new Error(`Approval request ${context.approval.approval_id} has expired.`);
    }
  }

  private assertDraftMatchesApproval(context: ApprovalContext) {
    const currentDigest = this.computeDraftDigest(context.draft);
    if (currentDigest !== context.approval.draft_digest) {
      this.expireApprovalContext(context, "draft_changed", "The draft changed after approval was requested.");
      throw new Error("The draft content changed after approval was requested. Request approval again.");
    }
  }

  private assertStoredMailboxMatches(connectedMailbox: string) {
    if (!this.config.gmailAccountEmail) {
      throw new Error("A configured Gmail mailbox is required before live sends can be attempted.");
    }
    if (connectedMailbox !== this.config.gmailAccountEmail) {
      throw new Error(
        `The connected Gmail account (${connectedMailbox}) does not match the configured mailbox (${this.config.gmailAccountEmail}).`,
      );
    }
  }

  private parseSendError(error: unknown): { code: string; message: string } {
    if (error && typeof error === "object") {
      const maybeCode = Reflect.get(error, "code");
      const maybeMessage = Reflect.get(error, "message");
      return {
        code: maybeCode ? String(maybeCode) : "send_error",
        message: maybeMessage ? String(maybeMessage) : "Gmail send failed.",
      };
    }
    return {
      code: "send_error",
      message: error instanceof Error ? error.message : "Gmail send failed.",
    };
  }

  private assertRequiredNote(note: string, action: string) {
    if (!note.trim()) {
      throw new Error(`A note is required to ${action}.`);
    }
  }

  private normalizePlanningDecisionReasonCode(reasonCode?: string): string | null {
    if (!reasonCode?.trim()) {
      return null;
    }
    const normalized = reasonCode.trim().toLowerCase();
    if (!["not_useful", "wrong_priority", "bad_timing", "duplicate", "handled_elsewhere"].includes(normalized)) {
      throw new Error(`Unsupported planning decision reason: ${reasonCode}.`);
    }
    return normalized;
  }

  private normalizePlanningGroupRejectReasonCode(reasonCode: string): "duplicate" | "handled_elsewhere" {
    const normalized = String(reasonCode ?? "").trim().toLowerCase();
    if (normalized !== "duplicate" && normalized !== "handled_elsewhere") {
      throw new Error("Grouped planning rejection only supports duplicate or handled_elsewhere.");
    }
    return normalized;
  }

  private recordPlanningRecommendationFirstAction(
    recommendation: PlanningRecommendation,
    actionType: PlanningRecommendationFirstActionType,
    identity: Pick<ClientIdentity, "client_id" | "requested_by">,
  ) {
    if (recommendation.first_action_at) {
      return;
    }
    this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
      first_action_at: new Date().toISOString(),
      first_action_type: actionType,
    });
  }

  private closePlanningRecommendation(
    recommendationId: string,
    closeReasonCode: PlanningRecommendationCloseReasonCode,
    identity: Pick<ClientIdentity, "client_id" | "requested_by">,
    closedAt = new Date().toISOString(),
  ) {
    const current = this.db.getPlanningRecommendation(recommendationId);
    if (!current || current.closed_at) {
      return;
    }
    this.db.updatePlanningRecommendation(recommendationId, {
      closed_at: closedAt,
      close_reason_code: closeReasonCode,
      closed_by_client: identity.client_id,
      closed_by_actor: identity.requested_by ?? null,
    });
  }

  private applyPlanningRecommendationRejection(
    recommendation: PlanningRecommendation,
    note: string,
    reasonCode: string | null,
    identity: Pick<ClientIdentity, "client_id" | "requested_by">,
    firstActionType: PlanningRecommendationFirstActionType = "reject",
  ) {
    const outcomeState = reasonCode === "handled_elsewhere" ? "handled_elsewhere" : "dismissed";
    const resolvedAt = new Date().toISOString();
    const closeReasonCode: PlanningRecommendationCloseReasonCode =
      reasonCode === "duplicate"
        ? "rejected_duplicate"
        : reasonCode === "handled_elsewhere"
          ? "rejected_handled_elsewhere"
          : "rejected_other";
    this.recordPlanningRecommendationFirstAction(recommendation, firstActionType, identity);
    this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
      status: "rejected",
      decision_reason_code: reasonCode,
      decision_note: note,
      resolved_at: resolvedAt,
      snoozed_until: null,
      last_error_code: null,
      last_error_message: null,
      outcome_state: outcomeState,
      outcome_recorded_at: resolvedAt,
      outcome_source: "operator",
      outcome_summary:
        outcomeState === "handled_elsewhere"
          ? "The operator handled this recommendation outside the queue."
          : "The operator dismissed this recommendation.",
    });
    this.closePlanningRecommendation(recommendation.recommendation_id, closeReasonCode, identity, resolvedAt);
    this.recordPlanningRecommendationOutcomeUpdate(
      recommendation.recommendation_id,
      outcomeState,
      "operator",
      outcomeState === "handled_elsewhere"
        ? "The operator handled this recommendation outside the queue."
        : "The operator dismissed this recommendation.",
      identity.client_id,
    );
  }

  private markPlanningRecommendationSourceResolved(
    recommendation: PlanningRecommendation,
    summary: string,
    outcomeSource: "system" | "operator",
    clientId = "system",
    requestedBy?: string,
  ) {
    const resolvedAt = new Date().toISOString();
    this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
      status: "superseded",
      resolved_at: resolvedAt,
      last_error_code: null,
      last_error_message: null,
      outcome_state: "source_resolved",
      outcome_recorded_at: resolvedAt,
      outcome_source: outcomeSource,
      outcome_summary: summary,
    });
    this.closePlanningRecommendation(
      recommendation.recommendation_id,
      "source_resolved",
      { client_id: clientId, requested_by: requestedBy },
      resolvedAt,
    );
    this.recordPlanningRecommendationOutcomeUpdate(
      recommendation.recommendation_id,
      "source_resolved",
      outcomeSource,
      summary,
      clientId,
    );
  }

  private updateRecommendationOutcomeFromTask(
    task: TaskItem,
    taskOutcome: "completed" | "canceled",
    note: string,
    clientId: string,
    requestedBy?: string,
  ) {
    if (!task.source_planning_recommendation_id) {
      return;
    }
    const recommendation = this.db.getPlanningRecommendation(task.source_planning_recommendation_id);
    if (!recommendation || recommendation.status !== "applied") {
      return;
    }
    const outcomeSummary =
      taskOutcome === "completed"
        ? `The linked task ${task.title} was completed.`
        : `The linked task ${task.title} was canceled.`;
    const closedAt = new Date().toISOString();
    this.db.updatePlanningRecommendation(recommendation.recommendation_id, {
      outcome_state: taskOutcome,
      outcome_recorded_at: closedAt,
      outcome_source: "operator",
      outcome_summary: outcomeSummary,
    });
    this.closePlanningRecommendation(
      recommendation.recommendation_id,
      taskOutcome === "completed" ? "task_completed" : "task_canceled",
      { client_id: clientId, requested_by: requestedBy },
      closedAt,
    );
    this.recordPlanningRecommendationOutcomeUpdate(
      recommendation.recommendation_id,
      taskOutcome,
      "operator",
      `${outcomeSummary} Note: ${note}`,
      clientId,
    );
  }

  private recordPlanningRecommendationOutcomeUpdate(
    recommendationId: string,
    outcomeState: PlanningRecommendationOutcomeState,
    outcomeSource: "operator" | "system",
    summary: string,
    clientId: string,
  ) {
    this.db.recordAuditEvent({
      client_id: clientId,
      action: "planning_recommendation_outcome_update",
      target_type: "planning_recommendation",
      target_id: recommendationId,
      outcome: "success",
      metadata: {
        outcome_state: outcomeState,
        outcome_source: outcomeSource,
        outcome_summary: summary,
      },
    });
  }

  private expireApprovalContext(context: ApprovalContext, code: string, message: string) {
    this.db.updateApprovalRequest(context.approval.approval_id, {
      state: "expired",
      last_error_code: code,
      last_error_message: message,
      confirmation_digest: null,
      confirmation_expires_at: null,
    });
    this.db.updateDraftLifecycle(context.draft.artifact_id, {
      status: "draft",
      approved_at: null,
      approved_by_client: null,
    });
  }

  private expireElapsedSendWindows() {
    const expiredCount = this.db.expireActiveSendWindows(new Date().toISOString());
    if (expiredCount > 0) {
      this.db.recordAuditEvent({
        client_id: "system",
        action: "send_window_expire",
        target_type: "send_window",
        target_id: "system-expire",
        outcome: "success",
        metadata: {
          count: expiredCount,
        },
      });
      this.logger.info("send_window_expired", { count: expiredCount });
    }
  }

  private recoverStaleSendingApprovals() {
    const sendingApprovals = this.db.listApprovalRequests({ state: "sending", limit: 1000 });
    for (const approval of sendingApprovals) {
      const draft = this.db.getDraftArtifact(approval.artifact_id);
      if (!draft) {
        continue;
      }
      const lastAttempt = Date.parse(draft.last_send_attempt_at ?? "");
      if (!Number.isFinite(lastAttempt) || Date.now() - lastAttempt >= SENDING_RECOVERY_MINUTES * 60 * 1000) {
        this.recoverApprovalAsInterrupted({ approval, draft });
      }
    }
  }

  private recoverApprovalAsInterrupted(context: ApprovalContext) {
    const message = "The prior send attempt may have been interrupted. Inspect Sent mail before retrying.";
    this.db.updateApprovalRequest(context.approval.approval_id, {
      state: "send_failed",
      last_error_code: "send_interrupted",
      last_error_message: message,
      confirmation_digest: null,
      confirmation_expires_at: null,
    });
    this.db.updateDraftLifecycle(context.draft.artifact_id, {
      status: "send_failed",
      last_send_error_code: "send_interrupted",
      last_send_error_message: message,
    });
    this.db.recordAuditEvent({
      client_id: "system",
      action: "approval_request_recover",
      target_type: "approval_request",
      target_id: context.approval.approval_id,
      outcome: "success",
      metadata: {
        artifact_id: context.draft.artifact_id,
        reason: "stale_sending_state",
      },
    });
    return {
      approval: this.db.getApprovalRequest(context.approval.approval_id)!,
      draft: this.db.getDraftArtifact(context.draft.artifact_id)!,
    };
  }

  private isMachineAuthored(message: MailMessage, mailbox: string): boolean {
    const from = (message.from_header ?? "").toLowerCase();
    const normalizedMailbox = mailbox.toLowerCase();
    return from.includes(`<${normalizedMailbox}>`) || from.includes(normalizedMailbox);
  }

  private isTrackedMessage(message: GmailMessageMetadata): boolean {
    return message.label_ids.includes("INBOX") || message.label_ids.includes("SENT");
  }

  private mailTimestampToIso(raw: string, fallback: string): string {
    const asNumber = Number(raw);
    return Number.isFinite(asNumber) && asNumber > 0 ? new Date(asNumber).toISOString() : fallback;
  }

  private isHistoryInvalidError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const code = Reflect.get(error, "code");
    const message = Reflect.get(error, "message");
    const text = typeof message === "string" ? message : "";
    return code === 404 || /history/i.test(text) || /startHistoryId/i.test(text);
  }

  private async refreshCalendarWindow(
    account: string,
    tokensJson: string,
    clientConfig: GmailClientConfig,
  ): Promise<CalendarSyncStats> {
    const startedAt = Date.now();
    const syncedAt = new Date().toISOString();
    const allSources: CalendarSource[] = [];
    let pageToken: string | undefined;
    do {
      const page: GoogleCalendarListPage = await this.dependencies.listGoogleCalendarSources(
        tokensJson,
        clientConfig,
        pageToken,
      );
      for (const source of page.calendars) {
        allSources.push({
          calendar_id: source.calendar_id,
          provider: this.config.calendarProvider,
          account,
          title: source.title,
          time_zone: source.time_zone,
          access_role: source.access_role,
          is_primary: source.is_primary,
          is_selected: source.is_selected,
          background_color: source.background_color,
          foreground_color: source.foreground_color,
          updated_at: syncedAt,
        });
      }
      pageToken = page.next_page_token;
    } while (pageToken);

    const selectedSources = allSources.filter((source) => this.isIncludedCalendar(source));
    const now = new Date();
    const timeMin = new Date(now.getTime() - this.config.calendarSyncPastDays * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + this.config.calendarSyncFutureDays * 24 * 60 * 60 * 1000).toISOString();
    const events: CalendarEvent[] = [];

    for (const source of selectedSources) {
      let eventPageToken: string | undefined;
      do {
        const page: GoogleCalendarEventsPage = await this.dependencies.listGoogleCalendarEvents(
          tokensJson,
          clientConfig,
          source.calendar_id,
          eventPageToken
            ? {
                timeMin,
                timeMax,
                pageToken: eventPageToken,
              }
            : {
                timeMin,
                timeMax,
              },
        );
        for (const event of page.events) {
          if (event.status === "cancelled") {
            continue;
          }
          const localEventId = this.makeCalendarEventId(source.calendar_id, event.event_id);
          const existing = this.db.getCalendarEvent(localEventId);
          events.push({
            event_id: localEventId,
            provider_event_id: event.event_id,
            calendar_id: source.calendar_id,
            provider: this.config.calendarProvider,
            account,
            i_cal_uid: event.i_cal_uid,
            etag: event.etag,
            summary: event.summary,
            location: event.location,
            notes: event.notes,
            html_link: event.html_link,
            status: event.status,
            event_type: event.event_type,
            visibility: event.visibility,
            transparency: event.transparency,
            start_at: event.start_at,
            end_at: event.end_at,
            is_all_day: event.is_all_day,
            is_busy: event.is_busy,
            recurring_event_id: event.recurring_event_id,
            organizer_email: event.organizer_email,
            self_response_status: event.self_response_status,
            attendee_count: event.attendee_count,
            source_task_id: event.source_task_id,
            created_by_personal_ops: event.created_by_personal_ops,
            last_write_at: existing?.last_write_at,
            last_write_by_client: existing?.last_write_by_client,
            updated_at: event.updated_at,
            synced_at: syncedAt,
          });
        }
        eventPageToken = page.next_page_token;
      } while (eventPageToken);
    }

    this.db.replaceCalendarSources(account, this.config.calendarProvider, selectedSources, syncedAt);
    this.db.replaceCalendarEvents(account, this.config.calendarProvider, events, syncedAt);
    return {
      calendars_refreshed: selectedSources.length,
      events_refreshed: events.length,
      duration_ms: Date.now() - startedAt,
    };
  }

  private isIncludedCalendar(source: CalendarSource): boolean {
    if (!source.is_selected) {
      return false;
    }
    if (this.config.includedCalendarIds.length === 0) {
      return true;
    }
    return this.config.includedCalendarIds.includes(source.calendar_id);
  }

  private makeCalendarEventId(calendarId: string, providerEventId: string): string {
    return `${calendarId}:${providerEventId}`;
  }

  private async loadCalendarWriteContext(calendarId?: string): Promise<{ stored: StoredGmailAuth; target: CalendarSource }> {
    if (!this.config.calendarEnabled) {
      throw new Error("Calendar writes are unavailable because the calendar subsystem is disabled.");
    }
    const stored = await this.dependencies.loadStoredGmailTokens(this.config, this.db);
    this.assertStoredMailboxMatches(stored.email);
    await this.dependencies.verifyGoogleCalendarWriteAccess(stored.tokensJson, stored.clientConfig);
    const target = this.resolveOwnedCalendarTarget(stored.email, calendarId);
    return { stored, target };
  }

  private resolveOwnedCalendarTarget(account: string, requestedCalendarId?: string): CalendarSource {
    const owned = this.db.listOwnedCalendarSources(account);
    if (owned.length === 0) {
      throw new Error("No owned writable calendars are available for calendar writes.");
    }
    if (requestedCalendarId) {
      const explicit = owned.find((source) => source.calendar_id === requestedCalendarId);
      if (!explicit) {
        throw new Error(`Calendar ${requestedCalendarId} is not writable through personal-ops.`);
      }
      return explicit;
    }
    return owned.find((source) => source.is_primary) ?? owned[0]!;
  }

  private toLocalCalendarEvent(
    account: string,
    calendarId: string,
    event: GoogleCalendarEventMetadata,
    overrides: Partial<CalendarEvent> = {},
  ): CalendarEvent {
    return {
      event_id: overrides.event_id ?? this.makeCalendarEventId(calendarId, event.event_id),
      provider_event_id: event.event_id,
      calendar_id: calendarId,
      provider: this.config.calendarProvider,
      account,
      i_cal_uid: event.i_cal_uid,
      etag: event.etag,
      summary: event.summary,
      location: event.location,
      notes: event.notes,
      html_link: event.html_link,
      status: event.status,
      event_type: event.event_type,
      visibility: event.visibility,
      transparency: event.transparency,
      start_at: event.start_at,
      end_at: event.end_at,
      is_all_day: event.is_all_day,
      is_busy: event.is_busy,
      recurring_event_id: event.recurring_event_id,
      organizer_email: event.organizer_email,
      self_response_status: event.self_response_status,
      attendee_count: event.attendee_count,
      source_task_id: overrides.source_task_id ?? event.source_task_id,
      created_by_personal_ops: overrides.created_by_personal_ops ?? event.created_by_personal_ops,
      last_write_at: overrides.last_write_at,
      last_write_by_client: overrides.last_write_by_client,
      updated_at: event.updated_at,
      synced_at: overrides.synced_at ?? new Date().toISOString(),
      ...overrides,
    };
  }

  private assertTimedCalendarRange(startAtRaw?: string, endAtRaw?: string): { startAt: string; endAt: string } {
    if (!startAtRaw || !endAtRaw) {
      throw new Error("Calendar event start_at and end_at are required.");
    }
    const startAt = new Date(startAtRaw).toISOString();
    const endAt = new Date(endAtRaw).toISOString();
    if (!Number.isFinite(Date.parse(startAt)) || !Number.isFinite(Date.parse(endAt))) {
      throw new Error("Calendar event timestamps must be valid UTC timestamps.");
    }
    if (Date.parse(endAt) <= Date.parse(startAt)) {
      throw new Error("Calendar event end_at must be after start_at.");
    }
    return { startAt, endAt };
  }

  private normalizeCalendarUpdateInput(
    current: CalendarEvent,
    input: CalendarEventWriteInput,
  ): { patch: GoogleCalendarEventWriteInput; changed: Record<string, true> } {
    const patch: GoogleCalendarEventWriteInput = {};
    const changed: Record<string, true> = {};
    if (input.title !== undefined) {
      const title = String(input.title).trim();
      if (!title) {
        throw new Error("Calendar event title cannot be blank.");
      }
      patch.title = title;
      changed.title = true;
    }
    if (input.location !== undefined) {
      patch.location = input.location?.trim() || undefined;
      changed.location = true;
    }
    if (input.notes !== undefined) {
      patch.notes = input.notes?.trim() || undefined;
      changed.notes = true;
    }
    if (input.start_at !== undefined || input.end_at !== undefined) {
      const { startAt, endAt } = this.assertTimedCalendarRange(input.start_at ?? current.start_at, input.end_at ?? current.end_at);
      patch.start_at = startAt;
      patch.end_at = endAt;
      changed.start_at = true;
      changed.end_at = true;
    }
    return { patch, changed };
  }

  private assertCalendarEventMutable(event: CalendarEvent): void {
    if (event.is_all_day) {
      throw new Error("All-day calendar events are not editable through personal-ops in Phase 7.");
    }
    if (event.recurring_event_id) {
      throw new Error("Recurring calendar events are not editable through personal-ops in Phase 7.");
    }
    if (event.event_type && event.event_type !== "default") {
      throw new Error(`Calendar event type ${event.event_type} is not editable through personal-ops in Phase 7.`);
    }
  }

  private assertCalendarEventIsCurrent(local: CalendarEvent, provider: GoogleCalendarEventMetadata): void {
    if (local.etag && provider.etag && local.etag !== provider.etag) {
      throw new Error(`Calendar event ${local.event_id} has changed in Google Calendar. Run personal-ops calendar sync now first.`);
    }
    if (local.updated_at !== provider.updated_at) {
      throw new Error(`Calendar event ${local.event_id} is stale locally. Run personal-ops calendar sync now first.`);
    }
  }

  private computeCalendarConflicts(events: CalendarEvent[]): CalendarConflict[] {
    const busyEvents = events
      .filter((event) => event.is_busy && event.status !== "cancelled")
      .sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at));
    const conflicts: CalendarConflict[] = [];
    for (let index = 0; index < busyEvents.length; index += 1) {
      const left = busyEvents[index]!;
      for (let compareIndex = index + 1; compareIndex < busyEvents.length; compareIndex += 1) {
        const right = busyEvents[compareIndex]!;
        const overlapStart = Math.max(Date.parse(left.start_at), Date.parse(right.start_at));
        const overlapEnd = Math.min(Date.parse(left.end_at), Date.parse(right.end_at));
        if (overlapEnd - overlapStart < 60_000) {
          if (Date.parse(right.start_at) >= Date.parse(left.end_at)) {
            break;
          }
          continue;
        }
        conflicts.push({
          conflict_id: `${left.event_id}|${right.event_id}`,
          day: this.formatLocalDay(new Date(overlapStart)),
          overlap_start_at: new Date(overlapStart).toISOString(),
          overlap_end_at: new Date(overlapEnd).toISOString(),
          left_event: left,
          right_event: right,
        });
      }
    }
    return conflicts;
  }

  private hasCalendarConflictForEvent(event: CalendarEvent): boolean {
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    if (!account) return false;
    const day = this.formatLocalDay(new Date(event.start_at));
    const { start, end } = this.getLocalDayBounds(day);
    return this.computeCalendarConflicts(
      this.db.listCalendarEvents({
        account,
        ends_after: start.toISOString(),
        starts_before: end.toISOString(),
      }),
    ).some((conflict) => conflict.left_event.event_id === event.event_id || conflict.right_event.event_id === event.event_id);
  }

  private computeFreeTimeWindows(day: string, eventsOverride?: CalendarEvent[]): FreeTimeWindow[] {
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    if (!account) return [];
    const workday = this.getWorkdayBounds(day);
    const events =
      eventsOverride ??
      this.db.listCalendarEvents({
        account,
        ends_after: workday.start.toISOString(),
        starts_before: workday.end.toISOString(),
      });
    const busyIntervals = events
      .filter((event) => event.is_busy && event.status !== "cancelled")
      .map((event) => ({
        start: Math.max(Date.parse(event.start_at), workday.start.getTime()),
        end: Math.min(Date.parse(event.end_at), workday.end.getTime()),
      }))
      .filter((interval) => interval.end > interval.start)
      .sort((left, right) => left.start - right.start);

    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of busyIntervals) {
      const current = merged[merged.length - 1];
      if (!current || interval.start > current.end) {
        merged.push({ ...interval });
      } else {
        current.end = Math.max(current.end, interval.end);
      }
    }

    const free: FreeTimeWindow[] = [];
    let cursor = workday.start.getTime();
    for (const interval of merged) {
      if (interval.start > cursor) {
        free.push(this.toFreeTimeWindow(day, cursor, interval.start));
      }
      cursor = Math.max(cursor, interval.end);
    }
    if (cursor < workday.end.getTime()) {
      free.push(this.toFreeTimeWindow(day, cursor, workday.end.getTime()));
    }
    return free.filter((window) => window.duration_minutes > 0);
  }

  private toFreeTimeWindow(day: string, startMs: number, endMs: number): FreeTimeWindow {
    return {
      day,
      start_at: new Date(startMs).toISOString(),
      end_at: new Date(endMs).toISOString(),
      duration_minutes: Math.max(0, Math.round((endMs - startMs) / 60_000)),
    };
  }

  private getLocalDayBounds(day: string): { start: Date; end: Date } {
    const parts = day.split("-");
    const year = Number.isFinite(Number(parts[0])) ? Number(parts[0]) : 1970;
    const month = Number.isFinite(Number(parts[1])) ? Number(parts[1]) : 1;
    const date = Number.isFinite(Number(parts[2])) ? Number(parts[2]) : 1;
    const start = new Date(year, month - 1, date, 0, 0, 0, 0);
    const end = new Date(year, month - 1, date + 1, 0, 0, 0, 0);
    return { start, end };
  }

  private getWorkdayBounds(day: string): { start: Date; end: Date } {
    const parts = day.split("-");
    const year = Number.isFinite(Number(parts[0])) ? Number(parts[0]) : 1970;
    const month = Number.isFinite(Number(parts[1])) ? Number(parts[1]) : 1;
    const date = Number.isFinite(Number(parts[2])) ? Number(parts[2]) : 1;
    const [startHour, startMinute] = this.parseLocalHourMinute(this.config.workdayStartLocal);
    const [endHour, endMinute] = this.parseLocalHourMinute(this.config.workdayEndLocal);
    return {
      start: new Date(year, month - 1, date, startHour, startMinute, 0, 0),
      end: new Date(year, month - 1, date, endHour, endMinute, 0, 0),
    };
  }

  private parseLocalHourMinute(raw: string): [number, number] {
    const parts = raw.split(":");
    const hour = Number.isFinite(Number(parts[0])) ? Number(parts[0]) : 9;
    const minute = Number.isFinite(Number(parts[1])) ? Number(parts[1]) : 0;
    return [hour, minute];
  }

  private formatLocalDay(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const date = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${date}`;
  }

  private isDayOverloaded(day: string, eventsOverride?: CalendarEvent[]): boolean {
    const workday = this.getWorkdayBounds(day);
    const account = (this.config.gmailAccountEmail || this.db.getMailAccount()?.email) ?? null;
    if (!account) return false;
    const events =
      eventsOverride ??
      this.db.listCalendarEvents({
        account,
        ends_after: workday.start.toISOString(),
        starts_before: workday.end.toISOString(),
      });
    const busyCount = events.filter((event) => {
      if (!event.is_busy || event.status === "cancelled") return false;
      const start = Date.parse(event.start_at);
      const end = Date.parse(event.end_at);
      return end > workday.start.getTime() && start < workday.end.getTime();
    }).length;
    return busyCount >= this.config.dayOverloadEventThreshold;
  }

  private computeFreeMinutesBefore(dueAt: string): number {
    const dueMs = Date.parse(dueAt);
    if (!Number.isFinite(dueMs) || dueMs <= Date.now()) {
      return 0;
    }
    let cursor = new Date();
    let total = 0;
    while (cursor.getTime() < dueMs) {
      const day = this.formatLocalDay(cursor);
      for (const window of this.computeFreeTimeWindows(day)) {
        const startMs = Math.max(Date.parse(window.start_at), cursor.getTime());
        const endMs = Math.min(Date.parse(window.end_at), dueMs);
        if (endMs > startMs) {
          total += Math.round((endMs - startMs) / 60_000);
        }
      }
      cursor = new Date(this.getLocalDayBounds(day).end.getTime());
      if (total >= this.config.schedulePressureFreeMinutesThreshold) {
        return total;
      }
    }
    return total;
  }

  private async seedMailboxMetadata(
    mailbox: string,
    tokensJson: string,
    clientConfig: GmailClientConfig,
  ): Promise<InboxSyncStats> {
    const startedAt = Date.now();
    const syncedAt = new Date().toISOString();
    const messageIds = new Set<string>();
    for (const labelId of ["INBOX", "SENT"]) {
      let pageToken: string | undefined;
      do {
        const page = await this.dependencies.listGmailMessageRefsByLabel(tokensJson, clientConfig, labelId, pageToken);
        for (const messageId of page.message_ids) {
          messageIds.add(messageId);
        }
        pageToken = page.next_page_token;
      } while (pageToken);
    }

    this.db.clearMailboxIndex(mailbox);

    let historyId: string | undefined;
    let refreshed = 0;
    const threadIds = new Set<string>();
    for (const messageId of messageIds) {
      const message = await this.dependencies.getGmailMessageMetadata(tokensJson, clientConfig, messageId);
      if (!this.isTrackedMessage(message)) {
        continue;
      }
      this.db.upsertMailMessage(mailbox, message, syncedAt);
      refreshed += 1;
      threadIds.add(message.thread_id);
      if (message.history_id && (!historyId || Number(message.history_id) > Number(historyId))) {
        historyId = message.history_id;
      }
    }

    const profile = await this.dependencies.getGmailProfile(tokensJson, clientConfig);
    const resolvedHistoryId = profile.profile.historyId ? String(profile.profile.historyId) : historyId;
    this.db.upsertMailSyncState(mailbox, "gmail", {
      status: "ready",
      last_history_id: resolvedHistoryId ?? null,
      last_seeded_at: syncedAt,
      last_synced_at: syncedAt,
      last_sync_duration_ms: Date.now() - startedAt,
      last_sync_refreshed_count: refreshed,
      last_sync_deleted_count: 0,
      last_error_code: null,
      last_error_message: null,
    });
    return resolvedHistoryId
      ? {
          refreshed,
          deleted: 0,
          threads_recomputed: threadIds.size,
          duration_ms: Date.now() - startedAt,
          history_id: resolvedHistoryId,
        }
      : {
          refreshed,
          deleted: 0,
          threads_recomputed: threadIds.size,
          duration_ms: Date.now() - startedAt,
        };
  }

  private async incrementalMailboxSync(
    mailbox: string,
    historyId: string,
    tokensJson: string,
    clientConfig: GmailClientConfig,
  ): Promise<InboxSyncStats> {
    const startedAt = Date.now();
    const syncedAt = new Date().toISOString();
    const refreshIds = new Set<string>();
    const deletedIds = new Set<string>();
    const touchedThreadIds = new Set<string>();
    let pageToken: string | undefined;
    let latestHistoryId = historyId;

    try {
      do {
        const page: GmailHistoryPage = await this.dependencies.listGmailHistory(tokensJson, clientConfig, latestHistoryId, pageToken);
        for (const record of page.records) {
          for (const deletedId of record.message_ids_deleted) {
            deletedIds.add(deletedId);
            refreshIds.delete(deletedId);
          }
          for (const refreshId of record.message_ids_to_refresh) {
            if (!deletedIds.has(refreshId)) {
              refreshIds.add(refreshId);
            }
          }
        }
        if (page.history_id) {
          latestHistoryId = page.history_id;
        }
        pageToken = page.next_page_token;
      } while (pageToken);
    } catch (error) {
      if (this.isHistoryInvalidError(error)) {
        throw new Error("History id is stale. Run a full reseed with personal-ops inbox sync now.");
      }
      throw error;
    }

    let deleted = 0;
    for (const messageId of deletedIds) {
      const existing = this.db.getMailMessage(messageId);
      this.db.deleteMailMessage(mailbox, messageId, syncedAt);
      deleted += 1;
      if (existing?.thread_id) {
        touchedThreadIds.add(existing.thread_id);
      }
    }

    let refreshed = 0;
    for (const messageId of refreshIds) {
      try {
        const message = await this.dependencies.getGmailMessageMetadata(tokensJson, clientConfig, messageId);
        if (this.isTrackedMessage(message)) {
          this.db.upsertMailMessage(mailbox, message, syncedAt);
          refreshed += 1;
          touchedThreadIds.add(message.thread_id);
        } else {
          const existing = this.db.getMailMessage(messageId);
          this.db.deleteMailMessage(mailbox, messageId, syncedAt);
          if (existing?.thread_id) {
            touchedThreadIds.add(existing.thread_id);
          }
        }
      } catch (error) {
        const code = Reflect.get(error as object, "code");
        if (code === 404) {
          const existing = this.db.getMailMessage(messageId);
          this.db.deleteMailMessage(mailbox, messageId, syncedAt);
          deleted += 1;
          if (existing?.thread_id) {
            touchedThreadIds.add(existing.thread_id);
          }
          continue;
        }
        throw error;
      }
    }

    this.db.upsertMailSyncState(mailbox, "gmail", {
      status: "ready",
      last_history_id: latestHistoryId,
      last_synced_at: syncedAt,
      last_sync_duration_ms: Date.now() - startedAt,
      last_sync_refreshed_count: refreshed,
      last_sync_deleted_count: deleted,
      last_error_code: null,
      last_error_message: null,
    });
    return latestHistoryId
      ? {
          refreshed,
          deleted,
          threads_recomputed: touchedThreadIds.size,
          duration_ms: Date.now() - startedAt,
          history_id: latestHistoryId,
        }
      : {
          refreshed,
          deleted,
          threads_recomputed: touchedThreadIds.size,
          duration_ms: Date.now() - startedAt,
        };
  }

  private inspectLaunchAgent() {
    return this.dependencies.inspectLaunchAgent(undefined, getLaunchAgentLabel());
  }

  private isOAuthClientConfigured(): boolean {
    return validateOAuthClientFile(this.config.oauthClientFile).status === "configured";
  }

  private getLatestSnapshotSummary(): SnapshotSummary | undefined {
    return getLatestSnapshotSummaryFromPaths(this.paths) ?? undefined;
  }

  private getServiceVersion(): string {
    return readServiceVersion(this.paths.appDir);
  }

  private readSnapshotManifest(snapshotId: string): SnapshotManifest | null {
    return readSnapshotManifestFromPaths(this.paths, snapshotId);
  }

  private fileCheck(id: string, title: string, filePath: string, parseRequired: boolean): DoctorCheck {
    if (!fs.existsSync(filePath)) {
      return this.failCheck(id, title, `${filePath} is missing.`, "runtime");
    }
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      if (parseRequired && filePath.endsWith(".toml")) {
        parseToml(fs.readFileSync(filePath, "utf8"));
      }
      return this.passCheck(id, title, `${path.basename(filePath)} is present and readable.`, "runtime");
    } catch (error) {
      return this.failCheck(
        id,
        title,
        error instanceof Error ? error.message : `${filePath} could not be read.`,
        "runtime",
      );
    }
  }

  private directoryWritableCheck(id: string, title: string, directory: string): DoctorCheck {
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.accessSync(directory, fs.constants.W_OK);
      return this.passCheck(id, title, `${directory} is writable.`, "runtime");
    } catch (error) {
      return this.failCheck(
        id,
        title,
        error instanceof Error ? error.message : `${directory} is not writable.`,
        "runtime",
      );
    }
  }

  private snapshotFreshnessCheck(snapshot: SnapshotSummary | undefined): DoctorCheck {
    if (!snapshot) {
      return this.failCheck(
        "snapshot_freshness",
        "Snapshot freshness",
        "No recovery snapshots were found. Run `personal-ops backup create` before relying on restore.",
        "runtime",
      );
    }
    const createdMs = Date.parse(snapshot.created_at);
    if (!Number.isFinite(createdMs)) {
      return this.warnCheck(
        "snapshot_freshness",
        "Snapshot freshness",
        `Latest snapshot ${snapshot.snapshot_id} has an invalid timestamp. Create a fresh recovery snapshot.`,
        "runtime",
      );
    }
    const ageHours = (Date.now() - createdMs) / (1000 * 60 * 60);
    if (ageHours > SNAPSHOT_FAIL_HOURS) {
      return this.failCheck(
        "snapshot_freshness",
        "Snapshot freshness",
        `Latest snapshot ${snapshot.snapshot_id} is ${ageHours.toFixed(1)}h old, beyond the ${SNAPSHOT_FAIL_HOURS}h recovery limit. Run \`personal-ops backup create\`.`,
        "runtime",
      );
    }
    if (ageHours > SNAPSHOT_WARN_HOURS) {
      return this.warnCheck(
        "snapshot_freshness",
        "Snapshot freshness",
        `Latest snapshot ${snapshot.snapshot_id} is ${ageHours.toFixed(1)}h old. Capture a fresh recovery point with \`personal-ops backup create\`.`,
        "runtime",
      );
    }
    return this.passCheck(
      "snapshot_freshness",
      "Snapshot freshness",
      `Latest snapshot ${snapshot.snapshot_id} is ${ageHours.toFixed(1)}h old and within the 24h target.`,
      "runtime",
    );
  }

  private snapshotRetentionPressureCheck(): DoctorCheck {
    const prune = pruneSnapshots(this.paths, { dryRun: true });
    if (prune.prune_candidates > 0) {
      return this.warnCheck(
        "snapshot_retention_pressure",
        "Snapshot retention",
        `${prune.prune_candidates} snapshot${prune.prune_candidates === 1 ? "" : "s"} can be pruned under the retention policy. Run \`personal-ops backup prune --dry-run\`, then \`personal-ops backup prune --yes\` when it looks right.`,
        "runtime",
      );
    }
    return this.passCheck(
      "snapshot_retention_pressure",
      "Snapshot retention",
      "Snapshot retention is within policy and no prune backlog is waiting.",
      "runtime",
    );
  }

  private recoveryRehearsalFreshnessCheck(): DoctorCheck {
    const rehearsal = readRecoveryRehearsalStamp(this.paths);
    if (rehearsal.status === "invalid") {
      return this.warnCheck("recovery_rehearsal_freshness", "Recovery rehearsal", rehearsal.message, "runtime");
    }
    if (rehearsal.status === "missing" || !rehearsal.stamp) {
      return this.warnCheck(
        "recovery_rehearsal_freshness",
        "Recovery rehearsal",
        "No successful recovery rehearsal is recorded. Run `cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery`.",
        "runtime",
      );
    }
    const ageHours = recoveryRehearsalAgeHours(rehearsal.stamp);
    if (ageHours == null) {
      return this.warnCheck(
        "recovery_rehearsal_freshness",
        "Recovery rehearsal",
        "Recovery rehearsal history exists but the timestamp could not be interpreted. Rerun `npm run verify:recovery`.",
        "runtime",
      );
    }
    if (ageHours > RECOVERY_REHEARSAL_WARN_HOURS) {
      return this.warnCheck(
        "recovery_rehearsal_freshness",
        "Recovery rehearsal",
        `Last successful recovery rehearsal was ${ageHours.toFixed(1)}h ago. Run \`cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery\`.`,
        "runtime",
      );
    }
    return this.passCheck(
      "recovery_rehearsal_freshness",
      "Recovery rehearsal",
      `Last successful recovery rehearsal was ${ageHours.toFixed(1)}h ago via ${rehearsal.stamp.command_name}.`,
      "runtime",
    );
  }

  private passCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
    return { id, title, severity: "pass", message, category };
  }

  private warnCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
    return { id, title, severity: "warn", message, category };
  }

  private failCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
    return { id, title, severity: "fail", message, category };
  }
}
