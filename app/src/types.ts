export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Paths {
  configDir: string;
  stateDir: string;
  logDir: string;
  appDir: string;
  snapshotsDir: string;
  machineIdentityFile: string;
  restoreProvenanceFile: string;
  recoveryRehearsalFile: string;
  configFile: string;
  policyFile: string;
  oauthClientFile: string;
  apiTokenFile: string;
  assistantApiTokenFile: string;
  databaseFile: string;
  appLogFile: string;
  installManifestFile: string;
}

export interface Config {
  serviceHost: string;
  servicePort: number;
  allowedOrigins: string[];
  gmailAccountEmail: string;
  gmailReviewUrl: string;
  githubEnabled: boolean;
  includedGithubRepositories: string[];
  githubSyncIntervalMinutes: number;
  githubKeychainService: string;
  driveEnabled: boolean;
  includedDriveFolders: string[];
  includedDriveFiles: string[];
  driveSyncIntervalMinutes: number;
  driveRecentDocsLimit: number;
  calendarEnabled: boolean;
  calendarProvider: CalendarProvider;
  includedCalendarIds: string[];
  calendarSyncPastDays: number;
  calendarSyncFutureDays: number;
  calendarSyncIntervalMinutes: number;
  workdayStartLocal: string;
  workdayEndLocal: string;
  meetingPrepWarningMinutes: number;
  dayOverloadEventThreshold: number;
  schedulePressureFreeMinutesThreshold: number;
  keychainService: string;
  oauthClientFile: string;
  apiToken: string;
  assistantApiToken: string;
}

export interface Policy {
  notificationsTitlePrefix: string;
  allowSend: boolean;
  auditDefaultLimit: number;
}

export type TaskKind = "human_reminder" | "assistant_work";
export type TaskState = "pending" | "in_progress" | "completed" | "canceled";
export type TaskPriority = "low" | "normal" | "high";
export type TaskSource = "manual" | "accepted_suggestion" | "accepted_recommendation";
export type TaskOwner = "operator" | "assistant";
export type TaskSuggestionStatus = "pending" | "accepted" | "rejected";
export type PlanningRecommendationKind = "schedule_task_block" | "schedule_thread_followup" | "schedule_event_prep";
export type PlanningRecommendationStatus = "pending" | "applied" | "rejected" | "snoozed" | "expired" | "superseded";
export type PlanningRecommendationSource = "system_generated" | "assistant_created";
export type PlanningRecommendationOutcomeState =
  | "none"
  | "scheduled"
  | "completed"
  | "canceled"
  | "dismissed"
  | "handled_elsewhere"
  | "source_resolved";
export type PlanningRecommendationOutcomeSource = "operator" | "system";
export type PlanningRecommendationSlotState = "ready" | "needs_manual_scheduling";
export type PlanningRecommendationFirstActionType =
  | "apply"
  | "reject"
  | "snooze"
  | "replan"
  | "group_snooze"
  | "group_reject";
export type PlanningRecommendationCloseReasonCode =
  | "task_completed"
  | "task_canceled"
  | "rejected_duplicate"
  | "rejected_handled_elsewhere"
  | "rejected_other"
  | "source_resolved"
  | "expired";
export type PlanningRecommendationGroupKind =
  | "urgent_unscheduled_tasks"
  | "urgent_inbox_followups"
  | "near_term_meeting_prep";
export type PlanningRecommendationClosureSignal =
  | "insufficient_history"
  | "healthy_completed"
  | "mostly_handled_elsewhere"
  | "mostly_source_resolved"
  | "mixed";
export type PlanningRecommendationRecommendedAction =
  | "keep_visible"
  | "review_externalized_workflow"
  | "review_source_suppression"
  | "need_more_history";

export type PlanningRecommendationHygieneReviewDecision =
  | "keep_visible"
  | "investigate_externalized_workflow"
  | "investigate_source_suppression"
  | "dismiss_for_now";
export type PlanningHygienePolicyProposalType =
  | "source_suppression_tuning"
  | "externalized_workflow_tuning";
export type PlanningHygienePolicyProposalStatus = "proposed" | "dismissed";
export type PlanningHygienePolicyGovernanceEventType = "policy_archived" | "policy_superseded";
export type PlanningRecommendationFollowThroughState =
  | "review_needed"
  | "reviewed_fresh"
  | "reviewed_stale"
  | "proposal_open"
  | "proposal_stale"
  | "proposal_dismissed";
export type CalendarProvider = "google";
export type CalendarSyncStatus = "idle" | "syncing" | "ready" | "degraded";
export type GithubSyncStatus = "idle" | "syncing" | "ready" | "degraded";
export type DriveSyncStatus = "idle" | "syncing" | "ready" | "degraded";
export type GithubAttentionKind =
  | "github_review_requested"
  | "github_pr_checks_failing"
  | "github_pr_changes_requested"
  | "github_pr_merge_ready";
export type GithubCheckState = "unknown" | "pending" | "success" | "failing";
export type GithubReviewState = "unknown" | "review_requested" | "changes_requested" | "approved" | "commented";

export interface GithubAccount {
  login: string;
  keychain_service: string;
  keychain_account: string;
  connected_at: string;
  updated_at: string;
  profile_json: string;
}

export interface GithubSyncState {
  provider: "github";
  status: GithubSyncStatus;
  last_synced_at?: string | undefined;
  last_error_code?: string | undefined;
  last_error_message?: string | undefined;
  last_sync_duration_ms?: number | undefined;
  repositories_scanned_count?: number | undefined;
  pull_requests_refreshed_count?: number | undefined;
  updated_at: string;
}

export interface GithubPullRequest {
  pr_key: string;
  repository: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  html_url: string;
  author_login: string;
  is_draft: boolean;
  state: string;
  created_at: string;
  updated_at: string;
  requested_reviewers: string[];
  head_sha: string;
  check_state: GithubCheckState;
  review_state: GithubReviewState;
  mergeable_state?: string | undefined;
  is_review_requested: boolean;
  is_authored_by_viewer: boolean;
  attention_kind?: GithubAttentionKind | undefined;
  attention_summary?: string | undefined;
}

export interface GithubStatusReport {
  enabled: boolean;
  connected_login: string | null;
  authenticated: boolean;
  sync_status: GithubSyncStatus | "not_configured";
  last_synced_at: string | null;
  included_repository_count: number;
  review_requested_count: number;
  authored_pr_attention_count: number;
  top_item_summary: string | null;
}

export interface DriveSyncState {
  provider: "google_drive";
  status: DriveSyncStatus;
  last_synced_at?: string | undefined;
  last_error_code?: string | undefined;
  last_error_message?: string | undefined;
  last_sync_duration_ms?: number | undefined;
  files_indexed_count?: number | undefined;
  docs_indexed_count?: number | undefined;
  sheets_indexed_count?: number | undefined;
  updated_at: string;
}

export type DriveFileScopeSource = "included_file" | "included_folder_descendant";
export type DriveLinkSourceType = "calendar_event" | "task" | "draft";
export type DriveLinkMatchType =
  | "explicit_link"
  | "shared_parent_folder"
  | "recent_doc_fallback"
  | "recent_file_fallback";
export type RelatedDriveFileKind = "doc" | "sheet" | "file";

export interface DriveFileRecord {
  file_id: string;
  name: string;
  mime_type: string;
  web_view_link?: string | undefined;
  icon_link?: string | undefined;
  parents: string[];
  scope_source: DriveFileScopeSource;
  drive_modified_time?: string | undefined;
  created_time?: string | undefined;
  updated_at: string;
  synced_at: string;
}

export interface DriveDocRecord {
  file_id: string;
  title: string;
  mime_type: string;
  web_view_link?: string | undefined;
  snippet?: string | undefined;
  text_content: string;
  updated_at: string;
  synced_at: string;
}

export interface DriveSheetRecord {
  file_id: string;
  title: string;
  mime_type: string;
  web_view_link?: string | undefined;
  tab_names: string[];
  header_preview: string[];
  cell_preview: string[][];
  snippet?: string | undefined;
  updated_at: string;
  synced_at: string;
}

export interface DriveLinkProvenance {
  source_type: DriveLinkSourceType;
  source_id: string;
  file_id: string;
  match_type: DriveLinkMatchType;
  matched_url?: string | undefined;
  discovered_at: string;
}

export interface RelatedDriveDoc {
  file_id: string;
  title: string;
  web_view_link?: string | undefined;
  snippet?: string | undefined;
  mime_type: string;
  match_type: DriveLinkMatchType;
  source_type?: DriveLinkSourceType | undefined;
  source_id?: string | undefined;
}

export interface RelatedDriveFile {
  file_id: string;
  title: string;
  web_view_link?: string | undefined;
  snippet?: string | undefined;
  mime_type: string;
  file_kind: RelatedDriveFileKind;
  match_type: DriveLinkMatchType;
  source_type?: DriveLinkSourceType | undefined;
  source_id?: string | undefined;
  tab_names?: string[] | undefined;
  header_preview?: string[] | undefined;
}

export interface DriveStatusReport {
  enabled: boolean;
  authenticated: boolean;
  sync_status: DriveSyncStatus | "not_configured";
  last_synced_at: string | null;
  included_folder_count: number;
  included_file_count: number;
  indexed_file_count: number;
  indexed_doc_count: number;
  indexed_sheet_count: number;
  top_item_summary: string | null;
}

export interface TaskItem {
  task_id: string;
  title: string;
  notes?: string | undefined;
  kind: TaskKind;
  state: TaskState;
  priority: TaskPriority;
  created_by_client: string;
  created_by_actor?: string | undefined;
  owner: TaskOwner;
  due_at?: string | undefined;
  remind_at?: string | undefined;
  source: TaskSource;
  source_suggestion_id?: string | undefined;
  source_planning_recommendation_id?: string | undefined;
  source_thread_id?: string | undefined;
  source_calendar_event_id?: string | undefined;
  decision_note?: string | undefined;
  created_at: string;
  updated_at: string;
  completed_at?: string | undefined;
  canceled_at?: string | undefined;
  scheduled_calendar_event_id?: string | undefined;
}

export interface TaskSuggestion {
  suggestion_id: string;
  title: string;
  notes?: string | undefined;
  kind: TaskKind;
  priority: TaskPriority;
  due_at?: string | undefined;
  remind_at?: string | undefined;
  suggested_by_client: string;
  suggested_by_actor?: string | undefined;
  status: TaskSuggestionStatus;
  accepted_task_id?: string | undefined;
  decision_note?: string | undefined;
  created_at: string;
  updated_at: string;
  resolved_at?: string | undefined;
}

export interface PlanningRecommendation {
  recommendation_id: string;
  kind: PlanningRecommendationKind;
  status: PlanningRecommendationStatus;
  priority: TaskPriority;
  source: PlanningRecommendationSource;
  suggested_by_client: string;
  suggested_by_actor?: string | undefined;
  source_task_id?: string | undefined;
  source_thread_id?: string | undefined;
  source_calendar_event_id?: string | undefined;
  proposed_calendar_id?: string | undefined;
  proposed_start_at?: string | undefined;
  proposed_end_at?: string | undefined;
  proposed_title?: string | undefined;
  proposed_notes?: string | undefined;
  reason_code: string;
  reason_summary: string;
  dedupe_key: string;
  source_fingerprint: string;
  rank_score: number;
  rank_reason?: string | undefined;
  ranking_version?: string | undefined;
  group_key?: string | undefined;
  group_summary?: string | undefined;
  source_last_seen_at?: string | undefined;
  first_action_at?: string | undefined;
  first_action_type?: PlanningRecommendationFirstActionType | undefined;
  closed_at?: string | undefined;
  close_reason_code?: PlanningRecommendationCloseReasonCode | undefined;
  closed_by_client?: string | undefined;
  closed_by_actor?: string | undefined;
  outcome_state: PlanningRecommendationOutcomeState;
  outcome_recorded_at?: string | undefined;
  outcome_source?: PlanningRecommendationOutcomeSource | undefined;
  outcome_summary?: string | undefined;
  slot_state: PlanningRecommendationSlotState;
  slot_state_reason?: string | undefined;
  slot_reason?: string | undefined;
  trigger_signals: string[];
  suppressed_signals: string[];
  replan_count: number;
  last_replanned_at?: string | undefined;
  decision_reason_code?: string | undefined;
  decision_note?: string | undefined;
  snoozed_until?: string | undefined;
  applied_task_id?: string | undefined;
  applied_calendar_event_id?: string | undefined;
  last_error_code?: string | undefined;
  last_error_message?: string | undefined;
  created_at: string;
  updated_at: string;
  resolved_at?: string | undefined;
}

export interface TaskDetail {
  task: TaskItem;
  related_audit_events: AuditEvent[];
}

export interface TaskSuggestionDetail {
  suggestion: TaskSuggestion;
  accepted_task?: TaskItem | undefined;
  related_audit_events: AuditEvent[];
}

export interface PlanningRecommendationDetail {
  recommendation: PlanningRecommendation;
  task?: TaskItem | undefined;
  thread?: MailThread | undefined;
  event?: CalendarEvent | undefined;
  applied_task?: TaskItem | undefined;
  applied_event?: CalendarEvent | undefined;
  ranking_reason?: string | undefined;
  slot_reason?: string | undefined;
  trigger_signals: string[];
  suppressed_signals: string[];
  source_resolved_since_created: boolean;
  applied_task_current_state?: TaskState | undefined;
  related_audit_events: AuditEvent[];
}

export interface PlanningRecommendationFilter {
  status?: PlanningRecommendationStatus | undefined;
  kind?: PlanningRecommendationKind | undefined;
  include_resolved?: boolean | undefined;
  limit?: number | undefined;
}

export interface PlanningRecommendationGroup {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  group_summary: string;
  pending_count: number;
  ready_count: number;
  manual_scheduling_count: number;
  top_recommendation_id: string;
  top_rank_score: number;
  top_rank_reason?: string | undefined;
  recommendation_ids: string[];
  recommendations: PlanningRecommendation[];
}

export interface PlanningRecommendationGroupDetail {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  group_summary: string;
  recommendations: PlanningRecommendation[];
  counts_by_status: Record<PlanningRecommendationStatus, number>;
  counts_by_outcome_state: Record<PlanningRecommendationOutcomeState, number>;
  counts_by_slot_state: Record<PlanningRecommendationSlotState, number>;
  top_recommendation?: PlanningRecommendation | undefined;
  next_actionable_recommendation?: PlanningRecommendation | undefined;
  oldest_unresolved_recommendation?: PlanningRecommendation | undefined;
  has_manual_scheduling_members: boolean;
  stale_pending_count: number;
  stale_scheduled_count: number;
  resurfaced_source_count: number;
  median_open_age_hours: number | null;
  closed_last_30d: number;
  completed_last_30d: number;
  handled_elsewhere_last_30d: number;
  source_resolved_last_30d: number;
  dominant_close_reason_last_30d: string | null;
  closure_meaning_summary: string | null;
}

export interface PlanningRecommendationSummaryReport {
  generated_at: string;
  open_count: number;
  stale_count: number;
  manual_scheduling_count: number;
  closed_last_7d: number;
  closed_last_30d: number;
  most_backlogged_group?: {
    group_kind: PlanningRecommendationGroupKind;
    count: number;
    summary: string;
  } | undefined;
  most_completed_group?: {
    group_kind: PlanningRecommendationGroupKind;
    completed_count: number;
    summary: string;
  } | undefined;
  dominant_backlog_group?: {
    group_kind: PlanningRecommendationGroupKind;
    count: number;
    queue_share_pct: number;
    summary: string;
  } | undefined;
  top_suppression_candidate?: {
    group_kind: PlanningRecommendationGroupKind;
    kind: PlanningRecommendationKind;
    source: PlanningRecommendationSource;
    recommended_action: PlanningRecommendationRecommendedAction;
    summary: string;
  } | undefined;
  review_needed_count: number;
  top_review_needed_candidate?: {
    group_kind: PlanningRecommendationGroupKind;
    kind: PlanningRecommendationKind;
    source: PlanningRecommendationSource;
    recommended_action: PlanningRecommendationRecommendedAction;
    summary: string;
  } | undefined;
  reviewed_fresh_count: number;
  reviewed_stale_count: number;
  proposal_open_count: number;
  proposal_stale_count: number;
  proposal_dismissed_count: number;
  top_reviewed_stale_candidate?: {
    group_kind: PlanningRecommendationGroupKind;
    kind: PlanningRecommendationKind;
    source: PlanningRecommendationSource;
    recommended_action: PlanningRecommendationRecommendedAction;
    summary: string;
  } | undefined;
  top_proposal_open_candidate?: {
    group_kind: PlanningRecommendationGroupKind;
    kind: PlanningRecommendationKind;
    source: PlanningRecommendationSource;
    recommended_action: PlanningRecommendationRecommendedAction;
    summary: string;
  } | undefined;
  top_proposal_stale_candidate?: {
    group_kind: PlanningRecommendationGroupKind;
    kind: PlanningRecommendationKind;
    source: PlanningRecommendationSource;
    recommended_action: PlanningRecommendationRecommendedAction;
    summary: string;
  } | undefined;
}

export interface PlanningRecommendationBacklogGroupReport {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  group_summary: string;
  active_count: number;
  counts_by_kind: Record<PlanningRecommendationKind, number>;
  stale_pending_count: number;
  stale_scheduled_count: number;
  manual_scheduling_count: number;
  resurfaced_source_count: number;
  median_open_age_hours: number | null;
  closed_last_30d: number;
  completed_last_30d: number;
  handled_elsewhere_last_30d: number;
  source_resolved_last_30d: number;
  dominant_close_reason_last_30d: string | null;
  queue_share_pct: number;
  dominates_queue: boolean;
  closure_meaning_summary: string | null;
  top_next_action_summary: string | null;
  review_needed_count: number;
  reviewed_stale_count: number;
  proposal_open_count: number;
  proposal_stale_count: number;
  proposal_dismissed_count: number;
  tuning_summary: string | null;
}

export interface PlanningRecommendationBacklogFilters {
  group?: string | undefined;
  kind?: PlanningRecommendationKind | undefined;
  source?: PlanningRecommendationSource | undefined;
  stale_only?: boolean | undefined;
  manual_only?: boolean | undefined;
  resurfaced_only?: boolean | undefined;
}

export interface PlanningRecommendationBacklogReport {
  generated_at: string;
  total_active_count: number;
  filters: PlanningRecommendationBacklogFilters;
  groups: PlanningRecommendationBacklogGroupReport[];
}

export interface PlanningRecommendationClosureBreakdown {
  key: string;
  created_count: number;
  first_action_count: number;
  closed_count: number;
  completed_count: number;
  canceled_count: number;
  dismissed_count: number;
  handled_elsewhere_count: number;
  source_resolved_count: number;
  median_time_to_first_action_minutes: number | null;
  median_time_to_close_minutes: number | null;
  closure_meaning_summary: string | null;
}

export interface PlanningRecommendationClosureReport {
  generated_at: string;
  days: number;
  filters: {
    group?: string | undefined;
    kind?: PlanningRecommendationKind | undefined;
    source?: PlanningRecommendationSource | undefined;
    close_reason?: string | undefined;
  };
  totals: PlanningRecommendationClosureBreakdown;
  by_group: PlanningRecommendationClosureBreakdown[];
  by_kind: PlanningRecommendationClosureBreakdown[];
  by_close_reason: PlanningRecommendationClosureBreakdown[];
  by_source: PlanningRecommendationClosureBreakdown[];
}

export interface PlanningRecommendationHygieneFilters {
  group?: string | undefined;
  kind?: PlanningRecommendationKind | undefined;
  source?: PlanningRecommendationSource | undefined;
  candidate_only?: boolean | undefined;
  review_needed_only?: boolean | undefined;
}

export interface PlanningRecommendationHygieneFamilyReport {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  open_count: number;
  queue_share_pct: number;
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
  closure_meaning_summary: string | null;
  summary: string;
}

export interface PlanningRecommendationHygieneReport {
  generated_at: string;
  window_days: number;
  filters: PlanningRecommendationHygieneFilters;
  families: PlanningRecommendationHygieneFamilyReport[];
}

export interface PlanningRecommendationTuningReport {
  generated_at: string;
  review_needed_count: number;
  reviewed_fresh_count: number;
  reviewed_stale_count: number;
  proposal_open_count: number;
  proposal_stale_count: number;
  proposal_dismissed_count: number;
  top_review_needed_summary: string | null;
  top_reviewed_stale_summary: string | null;
  top_proposal_open_summary: string | null;
  top_proposal_stale_summary: string | null;
  attention_families: PlanningRecommendationTuningFamilyReport[];
  recently_closed_families: PlanningRecommendationTuningHistoryReport[];
}

export interface PlanningRecommendationTuningFamilyReport {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  recommended_action: PlanningRecommendationRecommendedAction;
  follow_through_state: Exclude<PlanningRecommendationFollowThroughState, "proposal_dismissed">;
  open_count: number;
  queue_share_pct: number;
  manual_scheduling_count: number;
  summary: string;
  signal_updated_at: string | null;
  last_review_at: string | null;
  review_age_days: number | null;
  proposal_type: PlanningHygienePolicyProposalType | null;
  proposal_status: PlanningHygienePolicyProposalStatus | null;
  proposal_updated_at: string | null;
  proposal_age_days: number | null;
  proposal_stale: boolean;
}

export interface PlanningRecommendationTuningHistoryReport {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  last_follow_through_state_before_exit: PlanningRecommendationFollowThroughState | null;
  last_review_decision: PlanningRecommendationHygieneReviewDecision | null;
  proposal_type: PlanningHygienePolicyProposalType | null;
  final_proposal_status: PlanningHygienePolicyProposalStatus | null;
  last_review_at: string | null;
  proposal_updated_at: string | null;
  last_active_at: string | null;
  last_closed_at: string | null;
  recent_closed_count: number;
  recent_handled_elsewhere_count: number;
  recent_source_resolved_count: number;
  exit_summary: string;
}

export interface PlanningHygienePolicyProposal {
  proposal_id: string;
  group_key: string;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  proposal_type: PlanningHygienePolicyProposalType;
  status: PlanningHygienePolicyProposalStatus;
  basis_signal_updated_at: string | null;
  created_at: string;
  created_by_client: string;
  created_by_actor?: string | undefined;
  updated_at: string;
  updated_by_client: string;
  updated_by_actor?: string | undefined;
  note?: string | undefined;
}

export interface PlanningHygienePolicyGovernanceEvent {
  governance_event_id: string;
  proposal_id: string;
  group_key: string;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  event_type: PlanningHygienePolicyGovernanceEventType;
  basis_signal_updated_at: string | null;
  follow_through_state_snapshot: PlanningRecommendationFollowThroughState | null;
  proposal_status_snapshot: PlanningHygienePolicyProposalStatus | null;
  recorded_at: string;
  recorded_by_client: string;
  recorded_by_actor?: string | undefined;
  note?: string | undefined;
}

export interface PlanningRecommendationPolicyReport {
  generated_at: string;
  active_proposed_count: number;
  active_dismissed_for_now_count: number;
  archived_count: number;
  superseded_count: number;
  recent_policy_exit_count: number;
  retention_candidate_count: number;
  policy_history_family_count: number;
  repeated_policy_family_count: number;
  mixed_outcome_policy_family_count: number;
  policy_attention_kind: "recent_exit" | "history_churn" | "retention_candidate" | "none";
  policy_attention_summary: string | null;
  policy_attention_command: string;
  top_active_proposed_summary: string | null;
  top_active_dismissed_summary: string | null;
  top_archived_summary: string | null;
  top_superseded_summary: string | null;
  top_recent_policy_exit_summary: string | null;
  top_retention_candidate_summary: string | null;
  top_repeated_policy_family_summary: string | null;
  top_mixed_outcome_policy_family_summary: string | null;
  active_policy_backlog: PlanningRecommendationPolicyBacklogItem[];
  recent_policy_exits: PlanningRecommendationPolicyExitItem[];
  policy_history_families: PlanningRecommendationPolicyHistoryFamilyItem[];
  policy_history_recent_events: PlanningRecommendationPolicyHistoryItem[];
  retention_candidates: PlanningRecommendationPolicyRetentionItem[];
}

export interface PlanningRecommendationPolicyBacklogItem {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  proposal_type: PlanningHygienePolicyProposalType;
  proposal_status: PlanningHygienePolicyProposalStatus;
  follow_through_state: "proposal_open" | "proposal_stale" | "proposal_dismissed";
  open_count: number;
  queue_share_pct: number;
  summary: string;
  last_review_at: string | null;
  last_review_decision: PlanningRecommendationHygieneReviewDecision | null;
  proposal_updated_at: string | null;
  proposal_age_days: number | null;
  proposal_stale: boolean;
}

export interface PlanningRecommendationPolicyHistoryItem {
  governance_event_id: string;
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  proposal_type: PlanningHygienePolicyProposalType | null;
  final_proposal_status: PlanningHygienePolicyProposalStatus | null;
  last_follow_through_state: PlanningRecommendationFollowThroughState | null;
  governance_event_type: PlanningHygienePolicyGovernanceEventType;
  governance_recorded_at: string;
  governance_recorded_by_client: string;
  governance_recorded_by_actor: string | null;
  governance_note: string | null;
  basis_signal_updated_at: string | null;
  last_review_at: string | null;
  proposal_updated_at: string | null;
  last_active_at: string | null;
  last_closed_at: string | null;
  summary: string;
}

export interface PlanningRecommendationPolicyHistoryFamilyItem {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  proposal_type: PlanningHygienePolicyProposalType | null;
  total_governance_events: number;
  archived_count: number;
  superseded_count: number;
  first_governance_recorded_at: string;
  latest_governance_recorded_at: string;
  latest_governance_event_type: PlanningHygienePolicyGovernanceEventType;
  last_closed_at: string | null;
  last_active_at: string | null;
  latest_final_proposal_status: PlanningHygienePolicyProposalStatus | null;
  has_mixed_governance_outcomes: boolean;
  recent_governance_events_30d: number;
  recent_governance_events_90d: number;
  recommended_action: "monitor" | "prune_old_history" | "review_policy_churn";
  summary: string;
  governance_event_ids: string[];
}

export interface PlanningRecommendationPolicyExitItem {
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  proposal_type: PlanningHygienePolicyProposalType | null;
  proposal_status: PlanningHygienePolicyProposalStatus | null;
  last_follow_through_state: PlanningRecommendationFollowThroughState | null;
  last_review_at: string | null;
  proposal_updated_at: string | null;
  last_active_at: string | null;
  last_closed_at: string | null;
  exit_summary: string;
}

export interface PlanningRecommendationPolicyRetentionItem {
  governance_event_id: string;
  group_key: string;
  group_kind: PlanningRecommendationGroupKind;
  kind: PlanningRecommendationKind;
  source: PlanningRecommendationSource;
  governance_event_type: PlanningHygienePolicyGovernanceEventType;
  governance_recorded_at: string;
  age_days: number;
  summary: string;
}

export interface PlanningRecommendationPolicyPruneResult {
  dry_run: boolean;
  older_than_days: number;
  event_type: "archived" | "superseded" | "all";
  candidate_count: number;
  pruned_count: number;
  candidates: PlanningRecommendationPolicyRetentionItem[];
}

export interface CalendarSyncState {
  account: string;
  provider: CalendarProvider;
  status: CalendarSyncStatus;
  last_synced_at?: string | undefined;
  last_seeded_at?: string | undefined;
  last_error_code?: string | undefined;
  last_error_message?: string | undefined;
  last_sync_duration_ms?: number | undefined;
  calendars_refreshed_count?: number | undefined;
  events_refreshed_count?: number | undefined;
  updated_at: string;
}

export interface CalendarSource {
  calendar_id: string;
  provider: CalendarProvider;
  account: string;
  title: string;
  time_zone?: string | undefined;
  access_role?: string | undefined;
  is_primary: boolean;
  is_selected: boolean;
  background_color?: string | undefined;
  foreground_color?: string | undefined;
  updated_at: string;
}

export interface CalendarEvent {
  event_id: string;
  provider_event_id: string;
  calendar_id: string;
  provider: CalendarProvider;
  account: string;
  i_cal_uid?: string | undefined;
  etag?: string | undefined;
  summary?: string | undefined;
  location?: string | undefined;
  notes?: string | undefined;
  html_link?: string | undefined;
  status: string;
  event_type?: string | undefined;
  visibility?: string | undefined;
  transparency?: string | undefined;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  is_busy: boolean;
  recurring_event_id?: string | undefined;
  organizer_email?: string | undefined;
  self_response_status?: string | undefined;
  attendee_count: number;
  source_task_id?: string | undefined;
  created_by_personal_ops: boolean;
  last_write_at?: string | undefined;
  last_write_by_client?: string | undefined;
  updated_at: string;
  synced_at: string;
}

export interface CalendarEventWriteInput {
  calendar_id?: string | undefined;
  title?: string | undefined;
  start_at?: string | undefined;
  end_at?: string | undefined;
  location?: string | undefined;
  notes?: string | undefined;
}

export interface CalendarTaskScheduleResult {
  task: TaskItem;
  event: CalendarEvent;
}

export interface OwnedCalendarSummary {
  calendar_id: string;
  title: string;
  is_primary: boolean;
  time_zone?: string | undefined;
}

export interface CalendarConflict {
  conflict_id: string;
  day: string;
  overlap_start_at: string;
  overlap_end_at: string;
  left_event: CalendarEvent;
  right_event: CalendarEvent;
}

export interface FreeTimeWindow {
  day: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
}

export interface CalendarDayView {
  day: string;
  workday_start_at: string;
  workday_end_at: string;
  events: CalendarEvent[];
  conflicts: CalendarConflict[];
  free_time_windows: FreeTimeWindow[];
  overloaded: boolean;
}

export interface CalendarStatusReport {
  account: string | null;
  enabled: boolean;
  provider: CalendarProvider;
  sync: CalendarSyncState | null;
  calendars_synced_count: number;
  events_synced_count: number;
  owned_writable_calendar_count: number;
  personal_ops_active_event_count: number;
  linked_scheduled_task_count: number;
  next_upcoming_event?: CalendarEvent | undefined;
  conflict_count_next_24h: number;
}

export type MailSyncStatus = "idle" | "syncing" | "ready" | "degraded";

export type SendWindowState = "active" | "expired" | "disabled";

export interface SendWindow {
  window_id: string;
  state: SendWindowState;
  enabled_at: string;
  enabled_by_client: string;
  enabled_by_actor?: string | undefined;
  expires_at: string;
  reason: string;
  disabled_at?: string | undefined;
  disabled_by_client?: string | undefined;
  disabled_by_actor?: string | undefined;
  disable_reason?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface ClientIdentity {
  client_id: string;
  session_id?: string | undefined;
  origin?: string | undefined;
  requested_by?: string | undefined;
  auth_role?: "operator" | "assistant" | undefined;
}

export interface DraftInput {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body_text?: string | undefined;
  body_html?: string | undefined;
}

export type DraftArtifactStatus =
  | "draft"
  | "approval_pending"
  | "approved"
  | "sending"
  | "sent"
  | "send_failed"
  | "rejected";

export type DraftReviewState = "pending" | "opened" | "resolved";
export type ReviewItemState = "pending" | "opened" | "resolved";

export interface DraftArtifact extends DraftInput {
  artifact_id: string;
  provider: string;
  provider_draft_id: string;
  provider_message_id?: string | undefined;
  provider_thread_id?: string | undefined;
  assistant_generated: boolean;
  assistant_source_thread_id?: string | undefined;
  assistant_group_id?: string | undefined;
  assistant_why_now?: string | undefined;
  mailbox: string;
  status: DraftArtifactStatus;
  review_state: DraftReviewState;
  created_by_client: string;
  created_at: string;
  updated_at: string;
  approved_at?: string | undefined;
  approved_by_client?: string | undefined;
  sent_at?: string | undefined;
  sent_by_client?: string | undefined;
  send_attempt_count: number;
  last_send_attempt_at?: string | undefined;
  last_send_error_code?: string | undefined;
  last_send_error_message?: string | undefined;
  body_text?: string | undefined;
  body_html?: string | undefined;
}

export interface ReviewItem {
  review_id: string;
  artifact_id: string;
  kind: string;
  state: ReviewItemState;
  created_at: string;
  opened_at?: string | undefined;
  resolved_at?: string | undefined;
  subject?: string | undefined;
}

export type ApprovalRequestState =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "sending"
  | "sent"
  | "send_failed";

export type ApprovalAction = "approve" | "send";

export interface ApprovalRiskFlags {
  multiple_recipients: boolean;
  cc_present: boolean;
  bcc_present: boolean;
  external_recipient_present: boolean;
  empty_body: boolean;
}

export interface PolicySnapshot {
  allow_send: boolean;
  approval_ttl_hours: number;
}

export interface ApprovalRequest {
  approval_id: string;
  artifact_id: string;
  state: ApprovalRequestState;
  requested_at: string;
  requested_by_client: string;
  requested_by_actor?: string | undefined;
  approved_at?: string | undefined;
  approved_by_client?: string | undefined;
  approved_by_actor?: string | undefined;
  rejected_at?: string | undefined;
  rejected_by_client?: string | undefined;
  rejected_by_actor?: string | undefined;
  expires_at: string;
  decision_note?: string | undefined;
  send_note?: string | undefined;
  draft_digest: string;
  risk_flags_json: string;
  policy_snapshot_json: string;
  confirmation_digest?: string | undefined;
  confirmation_expires_at?: string | undefined;
  last_error_code?: string | undefined;
  last_error_message?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface ApprovalDetail {
  approval_request: ApprovalRequest;
  draft: DraftArtifact;
  related_audit_events: AuditEvent[];
}

export interface ApprovalConfirmation {
  approval_id: string;
  action: ApprovalAction;
  confirmation_token: string;
  confirmation_expires_at: string;
}

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  client_id: string;
  action: string;
  target_type: string;
  target_id: string;
  outcome: string;
  metadata_json: string;
  summary?: string | undefined;
  metadata_redacted?: boolean | undefined;
  assistant_safe_category?: AuditEventCategory | undefined;
}

export type AuditEventCategory = "sync" | "task" | "task_suggestion" | "planning";

export interface AuditEventInput {
  client_id: string;
  action: string;
  target_type: string;
  target_id: string;
  outcome: string;
  metadata: unknown;
}

export interface AuditEventFilter {
  limit: number;
  action?: string | undefined;
  actions?: string[] | undefined;
  target_type?: string | undefined;
  target_id?: string | undefined;
  client_id?: string | undefined;
  category?: AuditEventCategory | undefined;
}

export interface ApprovalRequestFilter {
  limit: number;
  state?: ApprovalRequestState | undefined;
}

export type AttentionSeverity = "info" | "warn" | "critical";

export interface AttentionItem {
  item_id: string;
  kind: string;
  severity: AttentionSeverity;
  title: string;
  summary: string;
  target_type: string;
  target_id: string;
  created_at: string;
  due_at?: string | undefined;
  sort_rank?: number | undefined;
  suggested_command: string;
  metadata_json: string;
}

export interface WorklistReport {
  generated_at: string;
  state: ServiceState;
  counts_by_severity: Record<AttentionSeverity, number>;
  send_window: {
    active: boolean;
    window?: SendWindow | undefined;
  };
  planning_groups: PlanningRecommendationGroup[];
  items: AttentionItem[];
}

export type AssistantActionState = "proposed" | "running" | "awaiting_review" | "blocked" | "completed" | "failed";

export type AssistantActionSection = "overview" | "worklist" | "drafts" | "planning" | "approvals" | "backups";

export interface AssistantActionRunReport {
  started_at: string;
  completed_at?: string | undefined;
  outcome: "success" | "failure";
  summary: string;
  details?: string[] | undefined;
}

export interface AssistantActionItem {
  action_id: string;
  title: string;
  summary: string;
  state: AssistantActionState;
  section: AssistantActionSection;
  batch: boolean;
  one_click: boolean;
  review_required: boolean;
  why_now: string;
  command?: string | undefined;
  target_type?: string | undefined;
  target_id?: string | undefined;
  signals: string[];
  blocking_reason?: string | undefined;
  latest_run?: AssistantActionRunReport | undefined;
}

export interface AssistantActionQueueReport {
  generated_at: string;
  readiness: ServiceState;
  summary: string;
  counts_by_state: Record<AssistantActionState, number>;
  top_item_summary: string | null;
  actions: AssistantActionItem[];
}

export interface AssistantActionRunResult {
  action_id: string;
  state: AssistantActionState;
  summary: string;
  details: string[];
  queue: AssistantActionQueueReport;
}

export type InboxAutopilotGroupKind = "needs_reply" | "waiting_to_nudge";

export interface InboxAutopilotThreadSummary {
  thread_id: string;
  subject: string;
  counterparty_summary: string;
  last_message_at: string;
  suggested_command: string;
  draft_artifact_id?: string | undefined;
}

export interface InboxAutopilotGroup {
  group_id: string;
  kind: InboxAutopilotGroupKind;
  state: AssistantActionState;
  summary: string;
  why_now: string;
  score_band: WorkflowScoreBand;
  signals: string[];
  assistant_action_id: string;
  review_required: boolean;
  one_click: boolean;
  threads: InboxAutopilotThreadSummary[];
  draft_artifact_ids: string[];
}

export interface InboxAutopilotReport {
  generated_at: string;
  readiness: ServiceState;
  summary: string;
  top_item_summary: string | null;
  prepared_draft_count: number;
  groups: InboxAutopilotGroup[];
}

export type PlanningAutopilotBundleKind = "task_block" | "thread_followup" | "event_prep";

export interface PlanningAutopilotRelatedArtifact {
  artifact_type: "inbox_autopilot_group" | "meeting_prep_packet" | "task" | "calendar_event" | "related_file";
  artifact_id: string;
  title: string;
  summary: string;
  command: string;
  state?: AssistantActionState | TaskState | undefined;
}

export interface PlanningAutopilotBundleMember {
  recommendation_id: string;
  title: string;
  summary: string;
  status: PlanningRecommendationStatus;
  slot_state: PlanningRecommendationSlotState;
  command: string;
}

export interface PlanningAutopilotBundle {
  bundle_id: string;
  kind: PlanningAutopilotBundleKind;
  state: AssistantActionState;
  summary: string;
  why_now: string;
  score_band: WorkflowScoreBand;
  signals: string[];
  assistant_action_id: string;
  review_required: boolean;
  apply_ready: boolean;
  recommendation_ids: string[];
  prepared_note?: string | undefined;
  execution_preview: string[];
  related_artifacts: PlanningAutopilotRelatedArtifact[];
  next_commands: string[];
  recommendations?: PlanningAutopilotBundleMember[] | undefined;
}

export interface PlanningAutopilotReport {
  generated_at: string;
  readiness: ServiceState;
  summary: string;
  top_item_summary: string | null;
  prepared_bundle_count: number;
  bundles: PlanningAutopilotBundle[];
}

export type OutboundAutopilotGroupKind = "reply_block" | "followup_block" | "single_draft";

export type OutboundAutopilotGroupState =
  | "review_pending"
  | "approval_ready"
  | "approval_pending"
  | "send_ready"
  | "blocked"
  | "completed";

export interface OutboundAutopilotSendWindowSummary {
  active: boolean;
  effective_send_enabled: boolean;
  permanent_send_enabled: boolean;
  window?: SendWindow | undefined;
}

export interface OutboundAutopilotGroup {
  group_id: string;
  kind: OutboundAutopilotGroupKind;
  state: OutboundAutopilotGroupState;
  summary: string;
  why_now: string;
  score_band: WorkflowScoreBand;
  signals: string[];
  source_group_id?: string | undefined;
  review_item_ids: string[];
  draft_artifact_ids: string[];
  approval_ids: string[];
  send_ready_count: number;
  next_commands: string[];
}

export interface OutboundAutopilotReport {
  generated_at: string;
  readiness: ServiceState;
  summary: string;
  top_item_summary: string | null;
  send_window: OutboundAutopilotSendWindowSummary;
  groups: OutboundAutopilotGroup[];
}

export interface OutboundAutopilotActionResult {
  group: OutboundAutopilotGroup;
  summary: string;
  completed_approval_ids: string[];
  failed_approval_id?: string | undefined;
  failed_reason?: string | undefined;
}

export interface MeetingPrepThreadSummary {
  thread_id: string;
  subject: string;
  counterparty_summary: string;
  last_message_at: string;
  suggested_command: string;
}

export interface MeetingPrepTaskSummary {
  task_id: string;
  title: string;
  state: TaskState;
  due_at?: string | undefined;
  suggested_command: string;
}

export interface MeetingPrepRecommendationSummary {
  recommendation_id: string;
  title: string;
  summary: string;
  suggested_command: string;
}

export interface MeetingPrepPacketMeeting {
  event_id: string;
  summary?: string | undefined;
  start_at: string;
  end_at: string;
  location?: string | undefined;
  organizer_email?: string | undefined;
  attendee_count: number;
  notes?: string | undefined;
  html_link?: string | undefined;
}

export interface MeetingPrepPacket {
  event_id: string;
  state: AssistantActionState;
  generated_at: string;
  summary: string;
  why_now: string;
  score_band: WorkflowScoreBand;
  signals: string[];
  meeting: MeetingPrepPacketMeeting;
  agenda: string[];
  prep_checklist: string[];
  open_questions: string[];
  related_docs: RelatedDriveDoc[];
  related_files: RelatedDriveFile[];
  related_threads: MeetingPrepThreadSummary[];
  related_tasks: MeetingPrepTaskSummary[];
  related_recommendations: MeetingPrepRecommendationSummary[];
  next_commands: string[];
  assistant_action_id: string;
}

export interface MeetingPrepPacketRecord {
  event_id: string;
  summary: string;
  why_now: string;
  score_band: WorkflowScoreBand;
  signals: string[];
  meeting: MeetingPrepPacketMeeting;
  agenda: string[];
  prep_checklist: string[];
  open_questions: string[];
  related_docs: RelatedDriveDoc[];
  related_files: RelatedDriveFile[];
  related_threads: MeetingPrepThreadSummary[];
  related_tasks: MeetingPrepTaskSummary[];
  related_recommendations: MeetingPrepRecommendationSummary[];
  next_commands: string[];
  generated_at: string;
  updated_at: string;
}

export interface WorkflowBundleSectionItem {
  label: string;
  summary: string;
  command?: string | undefined;
  target_type?: string | undefined;
  target_id?: string | undefined;
  why_now?: string | undefined;
  score_band?: WorkflowScoreBand | undefined;
  signals?: string[] | undefined;
  related_docs?: RelatedDriveDoc[] | undefined;
  related_files?: RelatedDriveFile[] | undefined;
}

export interface WorkflowBundleSection {
  title: string;
  items: WorkflowBundleSectionItem[];
}

export type WorkflowScoreBand = "highest" | "high" | "medium";

export interface WorkflowBundleAction {
  label: string;
  summary: string;
  command: string;
  target_type?: string | undefined;
  target_id?: string | undefined;
  why_now?: string | undefined;
  score_band?: WorkflowScoreBand | undefined;
  signals?: string[] | undefined;
  related_docs?: RelatedDriveDoc[] | undefined;
  related_files?: RelatedDriveFile[] | undefined;
}

export interface WorkflowBundleReport {
  workflow: "now-next" | "prep-day" | "follow-up-block" | "prep-meetings";
  generated_at: string;
  readiness: ServiceState;
  summary: string;
  sections: WorkflowBundleSection[];
  actions: WorkflowBundleAction[];
  first_repair_step: string | null;
}

export interface MailSyncState {
  mailbox: string;
  provider: string;
  status: MailSyncStatus;
  last_history_id?: string | undefined;
  last_synced_at?: string | undefined;
  last_seeded_at?: string | undefined;
  last_sync_duration_ms?: number | undefined;
  last_sync_refreshed_count?: number | undefined;
  last_sync_deleted_count?: number | undefined;
  last_error_code?: string | undefined;
  last_error_message?: string | undefined;
  updated_at: string;
}

export interface MailThread {
  thread_id: string;
  mailbox: string;
  last_message_at: string;
  message_count: number;
  unread_count: number;
  in_inbox: boolean;
  last_synced_at: string;
}

export interface MailMessage {
  message_id: string;
  thread_id: string;
  mailbox: string;
  history_id?: string | undefined;
  internal_date: string;
  label_ids: string[];
  from_header?: string | undefined;
  to_header?: string | undefined;
  subject?: string | undefined;
  is_unread: boolean;
  is_sent: boolean;
  is_inbox: boolean;
  last_synced_at: string;
}

export interface MailThreadDetail {
  thread: MailThread;
  messages: MailMessage[];
  derived_kind: InboxThreadKind;
  last_direction: "inbound" | "outbound" | "unknown";
  suggested_next_command: string;
}

export type InboxThreadKind =
  | "needs_reply"
  | "waiting_on_other_party"
  | "stale_followup"
  | "unread_old"
  | "recent_activity";

export interface InboxThreadSummary {
  thread: MailThread;
  latest_message?: MailMessage | undefined;
  derived_kind: InboxThreadKind;
  last_direction: "inbound" | "outbound" | "unknown";
}

export interface InboxStatusReport {
  mailbox: string | null;
  sync: MailSyncState | null;
  unread_thread_count: number;
  followup_thread_count: number;
  total_thread_count: number;
}

export type ServiceState = "ready" | "setup_required" | "degraded";
export type DoctorCheckSeverity = "pass" | "warn" | "fail";
export type AssistantKind = "codex" | "claude";
export type RestoreMode = "same_machine" | "cross_machine" | "legacy_unknown";
export type SnapshotRetentionBucket = "latest" | "last_24h" | "daily" | "weekly" | "expired" | "invalid";
export type MachineStateOrigin =
  | "native"
  | "restored_same_machine"
  | "restored_cross_machine"
  | "unknown_legacy_restore";

export interface MachineDescriptor {
  machine_id: string;
  machine_label: string;
  hostname: string;
}

export interface MachineIdentity extends MachineDescriptor {
  initialized_at: string;
  app_dir: string;
}

export interface RestoreProvenance {
  restored_at: string;
  restored_snapshot_id: string;
  local_machine_id: string;
  local_machine_label: string;
  source_machine_id: string | null;
  source_machine_label: string | null;
  source_hostname: string | null;
  cross_machine: boolean;
  snapshot_created_at: string;
}

export interface RecoveryRehearsalStamp {
  successful_at: string;
  app_version: string;
  command_name: string;
}

export interface DoctorCheck {
  id: string;
  title: string;
  severity: DoctorCheckSeverity;
  message: string;
  category: "runtime" | "setup" | "integration";
}

export interface SnapshotSummary {
  snapshot_id: string;
  created_at: string;
  path: string;
  daemon_state: ServiceState;
}

export interface InstallManifest {
  generated_at: string;
  node_executable: string;
  app_dir: string;
  machine_id: string;
  machine_label: string;
  launch_agent_label: string;
  launch_agent_plist_path: string;
  assistant_wrappers: AssistantKind[];
  wrapper_paths: {
    cli: string;
    daemon: string;
    codex_mcp: string;
    claude_mcp: string;
  };
  desktop?: DesktopStatusReport | undefined;
}

export interface InstallCheckReport {
  generated_at: string;
  state: ServiceState;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  checks: DoctorCheck[];
  manifest: InstallManifest | null;
}

export interface DesktopToolchainReport {
  platform_supported: boolean;
  npm_available: boolean;
  cargo_available: boolean;
  rustc_available: boolean;
  xcode_select_available: boolean;
  ready: boolean;
  summary: string;
}

export interface DesktopStatusReport {
  supported: boolean;
  installed: boolean;
  bundle_exists: boolean;
  app_path: string;
  build_bundle_path: string;
  project_path: string;
  toolchain: DesktopToolchainReport;
  daemon_session_handoff_ready: boolean;
  launch_url: string | null;
}

export type InstallPermissionsFixStatus = "updated" | "already_secure" | "missing" | "failed";

export interface InstallPermissionsFixItem {
  label: string;
  path: string;
  status: InstallPermissionsFixStatus;
  message: string;
  previous_mode?: number | undefined;
  current_mode?: number | undefined;
}

export interface InstallPermissionsFixResult {
  generated_at: string;
  summary: {
    updated: number;
    already_secure: number;
    missing: number;
    failed: number;
  };
  files: InstallPermissionsFixItem[];
}

export interface RestoreResult {
  restored_snapshot_id: string;
  rescue_snapshot_id: string;
  restored_database_path: string;
  restored_config: boolean;
  restored_policy: boolean;
  launch_agent_was_running: boolean;
  launch_agent_restarted: boolean;
  restore_mode: RestoreMode;
  cross_machine: boolean;
  source_machine: MachineDescriptor | null;
  local_machine: MachineDescriptor;
  provenance_warning: string | null;
}

export interface SnapshotPruneItem {
  snapshot_id: string;
  created_at: string;
  path: string;
  daemon_state: ServiceState;
  bucket: SnapshotRetentionBucket;
  reason: string;
}

export interface SnapshotPruneResult {
  generated_at: string;
  dry_run: boolean;
  policy_summary: string;
  total_snapshots: number;
  snapshots_kept: number;
  prune_candidates: number;
  snapshots_deleted: number;
  newest_snapshot_id: string | null;
  kept: SnapshotPruneItem[];
  prune_candidate_items: SnapshotPruneItem[];
  deleted_snapshot_ids: string[];
}

export interface ServiceStatusReport {
  generated_at: string;
  service_version: string;
  state: ServiceState;
  daemon_reachable: boolean;
  send_enabled: boolean;
  send_policy: {
    permanent_enabled: boolean;
    window_active: boolean;
    window_expires_at: string | null;
    effective_enabled: boolean;
  };
  mailbox: {
    configured: string | null;
    connected: string | null;
    matches_configuration: boolean;
    oauth_client_configured: boolean;
    keychain_token_present: boolean;
  };
  launch_agent: {
    exists: boolean;
    loaded: boolean;
    label: string;
  };
  machine: {
    machine_id: string | null;
    machine_label: string | null;
    hostname: string | null;
    state_origin: MachineStateOrigin;
    last_restore: RestoreProvenance | null;
    last_snapshot_source_machine: MachineDescriptor | null;
  };
  schema: {
    current_version: number;
    expected_version: number;
    compatible: boolean;
    compatibility_message: string;
  };
  review_queue: {
    pending_count: number;
    opened_count: number;
    total_count: number;
  };
  approval_queue: {
    pending_count: number;
    approved_count: number;
    sending_count: number;
    send_failed_count: number;
    total_count: number;
  };
  tasks: {
    pending_count: number;
    in_progress_count: number;
    completed_count: number;
    canceled_count: number;
    active_count: number;
    historical_count: number;
    total_count: number;
    top_item_summary: string | null;
  };
  task_suggestions: {
    pending_count: number;
    accepted_count: number;
    rejected_count: number;
    active_count: number;
    historical_count: number;
    total_count: number;
    top_item_summary: string | null;
  };
  planning_recommendations: {
    pending_count: number;
    snoozed_count: number;
    applied_count: number;
    rejected_count: number;
    expired_count: number;
    superseded_count: number;
    scheduled_count: number;
    completed_count: number;
    canceled_count: number;
    dismissed_count: number;
    handled_elsewhere_count: number;
    source_resolved_count: number;
    manual_scheduling_count: number;
    stale_pending_count: number;
    stale_scheduled_count: number;
    resurfaced_source_count: number;
    closed_last_7d: number;
    closed_last_30d: number;
    completed_last_30d: number;
    handled_elsewhere_last_30d: number;
    median_time_to_first_action_minutes: number | null;
    median_time_to_close_minutes: number | null;
    active_count: number;
    historical_count: number;
    total_count: number;
    top_group_summary: string | null;
    top_item_summary: string | null;
    top_next_action_summary: string | null;
    blocked_group_summary: string | null;
    top_backlog_summary: string | null;
    top_closure_summary: string | null;
    top_hygiene_summary: string | null;
    dominant_backlog_summary: string | null;
    top_suppression_candidate_summary: string | null;
    review_needed_count: number;
    top_review_needed_summary: string | null;
    reviewed_fresh_count: number;
    reviewed_stale_count: number;
    proposal_open_count: number;
    proposal_stale_count: number;
    proposal_dismissed_count: number;
    top_reviewed_stale_summary: string | null;
    top_proposal_open_summary: string | null;
    top_proposal_stale_summary: string | null;
    policy_attention_kind: "recent_exit" | "history_churn" | "retention_candidate" | "none";
    top_policy_attention_summary: string | null;
    pending_by_group: Record<PlanningRecommendationGroupKind, number>;
  };
  snapshot_latest?: SnapshotSummary | undefined;
  checks_summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  worklist_summary: {
    critical_count: number;
    warn_count: number;
    info_count: number;
    top_item_summary: string | null;
  };
  inbox: {
    sync_status: MailSyncStatus | "not_configured";
    last_history_id: string | null;
    last_synced_at: string | null;
    unread_thread_count: number;
    followup_thread_count: number;
    total_thread_count: number;
    top_item_summary: string | null;
  };
  calendar: {
    enabled: boolean;
    sync_status: CalendarSyncStatus | "not_configured";
    last_synced_at: string | null;
    calendars_synced_count: number;
    events_synced_count: number;
    owned_writable_calendar_count: number;
    personal_ops_active_event_count: number;
    linked_scheduled_task_count: number;
    conflict_count_next_24h: number;
    next_upcoming_event_summary: string | null;
    top_item_summary: string | null;
    top_scheduling_item_summary: string | null;
  };
  github: GithubStatusReport;
  drive: DriveStatusReport;
  desktop: DesktopStatusReport;
}

export interface DoctorReport {
  generated_at: string;
  state: ServiceState;
  deep: boolean;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  checks: DoctorCheck[];
}

export type HealthCheckState = "ready" | "attention_needed" | "degraded";

export interface HealthCheckReport {
  generated_at: string;
  state: HealthCheckState;
  deep: boolean;
  snapshot_age_limit_hours: number | null;
  install_check_state: ServiceState;
  daemon_reachable: boolean;
  doctor_state: ServiceState | null;
  latest_snapshot_age_hours: number | null;
  latest_snapshot_id: string | null;
  prune_candidate_count: number;
  last_recovery_rehearsal_at: string | null;
  recovery_rehearsal_age_hours: number | null;
  next_repair_step: string | null;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  checks: DoctorCheck[];
}

export interface VersionReport {
  service_version: string;
  release_tag: string;
  distribution_model: string;
  release_check_command: string;
  upgrade_hint: string;
}

export interface SnapshotManifest {
  snapshot_id: string;
  created_at: string;
  service_version: string;
  schema_version?: number | undefined;
  backup_intent?: "recovery" | undefined;
  source_machine?: MachineDescriptor | undefined;
  mailbox: string | null;
  db_backup_path: string;
  config_paths: string[];
  log_paths: string[];
  daemon_state: ServiceState;
  notes: string[];
}

export interface SnapshotInspection {
  manifest: SnapshotManifest;
  files: Array<{
    path: string;
    exists: boolean;
    size_bytes: number;
  }>;
  warnings: string[];
}

export interface ReviewDetail {
  review_item: ReviewItem;
  draft: DraftArtifact;
  related_audit_events: AuditEvent[];
}

export interface GmailClientConfig {
  client_id: string;
  client_secret: string;
  auth_uri: string;
  token_uri: string;
  redirect_uris: string[];
}

export interface PendingAuthSession {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
}

export interface GmailSendResult {
  provider_message_id: string;
  provider_thread_id?: string | undefined;
}

export interface GmailMessageMetadata {
  message_id: string;
  thread_id: string;
  history_id?: string | undefined;
  internal_date: string;
  label_ids: string[];
  from_header?: string | undefined;
  to_header?: string | undefined;
  subject?: string | undefined;
}

export interface GmailMessageRefPage {
  message_ids: string[];
  next_page_token?: string | undefined;
}

export interface GmailHistoryRecord {
  message_ids_to_refresh: string[];
  message_ids_deleted: string[];
}

export interface GmailHistoryPage {
  records: GmailHistoryRecord[];
  next_page_token?: string | undefined;
  history_id?: string | undefined;
}

export interface GoogleCalendarListPage {
  calendars: Array<{
    calendar_id: string;
    title: string;
    time_zone?: string | undefined;
    access_role?: string | undefined;
    is_primary: boolean;
    is_selected: boolean;
    background_color?: string | undefined;
    foreground_color?: string | undefined;
  }>;
  next_page_token?: string | undefined;
}

export interface GoogleCalendarEventMetadata {
  event_id: string;
  calendar_id: string;
  i_cal_uid?: string | undefined;
  etag?: string | undefined;
  summary?: string | undefined;
  location?: string | undefined;
  notes?: string | undefined;
  html_link?: string | undefined;
  status: string;
  event_type?: string | undefined;
  visibility?: string | undefined;
  transparency?: string | undefined;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  is_busy: boolean;
  recurring_event_id?: string | undefined;
  organizer_email?: string | undefined;
  self_response_status?: string | undefined;
  attendee_count: number;
  source_task_id?: string | undefined;
  created_by_personal_ops: boolean;
  updated_at: string;
}

export interface GoogleCalendarEventsPage {
  events: GoogleCalendarEventMetadata[];
  next_page_token?: string | undefined;
}

export interface GoogleCalendarEventWriteInput {
  title?: string | undefined;
  start_at?: string | undefined;
  end_at?: string | undefined;
  location?: string | undefined;
  notes?: string | undefined;
  source_task_id?: string | undefined;
  created_by_client?: string | undefined;
}
