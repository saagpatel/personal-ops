import type { DoctorReport, ServiceStatusReport } from "../types.js";
import { getDesktopStatusReport } from "../desktop.js";
import { getKeychainSecret } from "../keychain.js";
import { getLaunchAgentLabel } from "../launchagent.js";
import { describeStateOrigin, readMachineIdentity, readRestoreProvenance } from "../machine.js";

export async function buildStatusReport(service: any, options: { httpReachable: boolean }): Promise<ServiceStatusReport> {
  const checks = await service.collectDoctorChecks({ deep: false, httpReachable: options.httpReachable });
  const summary = service.summarizeChecks(checks);
  const schemaCompatibility = service.db.getSchemaCompatibility();
  const mailAccount = service.db.getMailAccount();
  const launchAgent = service.inspectLaunchAgent();
  const launchAgentLabel = getLaunchAgentLabel();
  const machineIdentity = readMachineIdentity(service.paths);
  const restoreProvenance = readRestoreProvenance(service.paths);
  const reviewItems = service.db.listReviewItems();
  const approvals = service.listApprovalQueue({ limit: 500 });
  const approvalCounts = service.summarizeApprovalQueue(approvals);
  const taskCounts = service.db.countTaskStates();
  const suggestionCounts = service.db.countTaskSuggestionStates();
  const planningCounts = service.db.countPlanningRecommendationStates();
  const planningOutcomeCounts = service.db.countPlanningRecommendationOutcomeStates();
  const planningAnalytics = service.computePlanningAnalytics();
  const planningPolicyReport = service.buildPlanningPolicyReport();
  const activeSendWindow = service.db.getActiveSendWindow();
  const effectiveSendEnabled = service.isSendEnabled(activeSendWindow);
  const pendingCount = reviewItems.filter((item: any) => item.state === "pending").length;
  const openedCount = reviewItems.filter((item: any) => item.state === "opened").length;
  const worklist = await service.getWorklistReport(options);
  const inboxStatus = service.getInboxStatusReport();
  const calendarStatus = service.getCalendarStatusReport();
  const githubStatus = service.getGithubStatusReport();
  const driveStatus = service.getDriveStatusReport();
  const autopilotStatus = await service.getAutopilotStatusReport({ httpReachable: options.httpReachable });
  const desktopStatus = await getDesktopStatusReport(service.paths);
  const topInboxItem =
    worklist.items.find((item: any) =>
      ["sync_degraded", "inbox_unread_old", "thread_needs_reply", "thread_stale_followup"].includes(item.kind),
    ) ?? null;
  const topCalendarItem =
    worklist.items.find((item: any) =>
      [
        "calendar_sync_degraded",
        "calendar_event_soon",
        "calendar_conflict",
        "calendar_day_overloaded",
        "task_schedule_pressure",
        "task_unscheduled_due_soon",
        "scheduled_task_conflict",
        "scheduled_task_stale",
      ].includes(item.kind),
    ) ?? null;
  const topSchedulingItem =
    worklist.items.find((item: any) =>
      ["task_schedule_pressure", "task_unscheduled_due_soon", "scheduled_task_conflict", "scheduled_task_stale"].includes(
        item.kind,
      ),
    ) ?? null;
  const topPlanningRecommendation =
    worklist.items.find((item: any) =>
      ["planning_recommendation_pending", "planning_recommendation_snooze_expiring"].includes(item.kind),
    ) ?? null;
  const topPlanningGroup = worklist.items.find((item: any) => item.kind === "planning_recommendation_group") ?? null;
  const blockedPlanningGroup = worklist.planning_groups.find((group: any) => group.manual_scheduling_count > 0) ?? null;
  const pendingByGroup = {
    urgent_unscheduled_tasks: 0,
    urgent_inbox_followups: 0,
    near_term_meeting_prep: 0,
  };
  for (const group of worklist.planning_groups) {
    pendingByGroup[group.group_kind as keyof typeof pendingByGroup] += group.pending_count;
  }
  const totalPlanningCount = service.db.listPlanningRecommendations({ include_resolved: true }).length;
  const openPlanningCount = planningAnalytics.summary.open_count;
  const latestSnapshot = service.getLatestSnapshotSummary();
  const latestSnapshotManifest = latestSnapshot ? service.readSnapshotManifest(latestSnapshot.snapshot_id) : null;
  const machine = machineIdentity.status === "configured" ? machineIdentity.identity : null;
  const provenance = restoreProvenance.status === "configured" ? restoreProvenance.provenance : null;
  return {
    generated_at: new Date().toISOString(),
    service_version: service.getServiceVersion(),
    state: service.classifyState(checks),
    daemon_reachable: options.httpReachable,
    send_enabled: effectiveSendEnabled,
    send_policy: {
      permanent_enabled: service.policy.allowSend,
      window_active: Boolean(activeSendWindow),
      window_expires_at: activeSendWindow?.expires_at ?? null,
      effective_enabled: effectiveSendEnabled,
    },
    mailbox: {
      configured: service.config.gmailAccountEmail || null,
      connected: mailAccount?.email ?? null,
      matches_configuration: Boolean(
        service.config.gmailAccountEmail && mailAccount?.email && service.config.gmailAccountEmail === mailAccount.email,
      ),
      oauth_client_configured: service.isOAuthClientConfigured(),
      keychain_token_present: Boolean(mailAccount && getKeychainSecret(service.config.keychainService, mailAccount.email)),
    },
    launch_agent: {
      exists: launchAgent.exists,
      loaded: launchAgent.loaded,
      label: launchAgentLabel,
    },
    machine: {
      machine_id: machine?.machine_id ?? null,
      machine_label: machine?.machine_label ?? null,
      hostname: machine?.hostname ?? null,
      state_origin: describeStateOrigin(provenance),
      last_restore: provenance,
      last_snapshot_source_machine: latestSnapshotManifest?.source_machine ?? null,
    },
    schema: {
      current_version: schemaCompatibility.current_version,
      expected_version: schemaCompatibility.expected_version,
      compatible: schemaCompatibility.compatible,
      compatibility_message: schemaCompatibility.message,
    },
    review_queue: {
      pending_count: pendingCount,
      opened_count: openedCount,
      total_count: reviewItems.length,
    },
    approval_queue: {
      pending_count: approvalCounts.pending,
      approved_count: approvalCounts.approved,
      sending_count: approvalCounts.sending,
      send_failed_count: approvalCounts.send_failed,
      total_count: approvals.length,
    },
    tasks: {
      pending_count: taskCounts.pending,
      in_progress_count: taskCounts.in_progress,
      completed_count: taskCounts.completed,
      canceled_count: taskCounts.canceled,
      active_count: taskCounts.pending + taskCounts.in_progress,
      historical_count: taskCounts.completed + taskCounts.canceled,
      total_count: service.db.listTasks().length,
      top_item_summary:
        worklist.items.find((item: any) =>
          ["task_due_soon", "task_overdue", "task_reminder_due", "task_in_progress_stale"].includes(item.kind),
        )?.summary ?? null,
    },
    task_suggestions: {
      pending_count: suggestionCounts.pending,
      accepted_count: suggestionCounts.accepted,
      rejected_count: suggestionCounts.rejected,
      active_count: suggestionCounts.pending,
      historical_count: suggestionCounts.accepted + suggestionCounts.rejected,
      total_count: service.db.listTaskSuggestions().length,
      top_item_summary:
        worklist.items.find((item: any) => item.kind === "task_suggestion_pending")?.summary ?? null,
    },
    planning_recommendations: {
      pending_count: planningCounts.pending,
      snoozed_count: planningCounts.snoozed,
      applied_count: planningCounts.applied,
      rejected_count: planningCounts.rejected,
      expired_count: planningCounts.expired,
      superseded_count: planningCounts.superseded,
      scheduled_count: planningOutcomeCounts.scheduled,
      completed_count: planningOutcomeCounts.completed,
      canceled_count: planningOutcomeCounts.canceled,
      dismissed_count: planningOutcomeCounts.dismissed,
      handled_elsewhere_count: planningOutcomeCounts.handled_elsewhere,
      source_resolved_count: planningOutcomeCounts.source_resolved,
      manual_scheduling_count: planningAnalytics.backlog.groups.reduce(
        (total: number, group: any) => total + group.manual_scheduling_count,
        0,
      ),
      stale_pending_count: planningAnalytics.backlog.groups.reduce(
        (total: number, group: any) => total + group.stale_pending_count,
        0,
      ),
      stale_scheduled_count: planningAnalytics.backlog.groups.reduce(
        (total: number, group: any) => total + group.stale_scheduled_count,
        0,
      ),
      resurfaced_source_count: planningAnalytics.backlog.groups.reduce(
        (total: number, group: any) => total + group.resurfaced_source_count,
        0,
      ),
      closed_last_7d: planningAnalytics.summary.closed_last_7d,
      closed_last_30d: planningAnalytics.summary.closed_last_30d,
      completed_last_30d: planningAnalytics.closure.totals.completed_count,
      handled_elsewhere_last_30d: planningAnalytics.closure.totals.handled_elsewhere_count,
      median_time_to_first_action_minutes: planningAnalytics.closure.totals.median_time_to_first_action_minutes,
      median_time_to_close_minutes: planningAnalytics.closure.totals.median_time_to_close_minutes,
      active_count: openPlanningCount,
      historical_count: totalPlanningCount - openPlanningCount,
      total_count: totalPlanningCount,
      top_group_summary: topPlanningGroup?.summary ?? null,
      top_item_summary: topPlanningRecommendation?.summary ?? null,
      top_next_action_summary: topPlanningRecommendation?.summary ?? null,
      blocked_group_summary: blockedPlanningGroup
        ? `${blockedPlanningGroup.group_summary} (${blockedPlanningGroup.manual_scheduling_count} need manual scheduling)`
        : null,
      top_backlog_summary: service.summarizePlanningBacklog(planningAnalytics.backlog),
      top_closure_summary: service.summarizePlanningClosure(planningAnalytics.closure),
      dominant_backlog_summary: service.summarizePlanningDominantBacklog(planningAnalytics.backlog),
      top_suppression_candidate_summary:
        service.summarizePlanningReviewNeeded(planningAnalytics.hygiene) ??
        service.summarizePlanningSuppressionCandidate(planningAnalytics.hygiene),
      top_hygiene_summary: service.summarizePlanningHygiene(planningAnalytics.hygiene),
      review_needed_count: planningAnalytics.summary.review_needed_count,
      top_review_needed_summary: service.summarizePlanningReviewNeeded(planningAnalytics.hygiene),
      reviewed_fresh_count: planningAnalytics.tuning.reviewed_fresh_count,
      reviewed_stale_count: planningAnalytics.tuning.reviewed_stale_count,
      proposal_open_count: planningAnalytics.tuning.proposal_open_count,
      proposal_stale_count: planningAnalytics.tuning.proposal_stale_count,
      proposal_dismissed_count: planningAnalytics.tuning.proposal_dismissed_count,
      top_reviewed_stale_summary: planningAnalytics.tuning.top_reviewed_stale_summary,
      top_proposal_open_summary: planningAnalytics.tuning.top_proposal_open_summary,
      top_proposal_stale_summary: planningAnalytics.tuning.top_proposal_stale_summary,
      policy_attention_kind: planningPolicyReport.policy_attention_kind,
      top_policy_attention_summary: planningPolicyReport.policy_attention_summary,
      pending_by_group: pendingByGroup,
    },
    snapshot_latest: latestSnapshot,
    checks_summary: summary,
    worklist_summary: {
      critical_count: worklist.counts_by_severity.critical,
      warn_count: worklist.counts_by_severity.warn,
      info_count: worklist.counts_by_severity.info,
      top_item_summary: worklist.items[0]?.summary ?? null,
    },
    inbox: {
      sync_status: inboxStatus.sync?.status ?? "not_configured",
      last_history_id: inboxStatus.sync?.last_history_id ?? null,
      last_synced_at: inboxStatus.sync?.last_synced_at ?? null,
      unread_thread_count: inboxStatus.unread_thread_count,
      followup_thread_count: inboxStatus.followup_thread_count,
      total_thread_count: inboxStatus.total_thread_count,
      top_item_summary: topInboxItem?.summary ?? null,
    },
    calendar: {
      enabled: calendarStatus.enabled,
      sync_status: calendarStatus.sync?.status ?? "not_configured",
      last_synced_at: calendarStatus.sync?.last_synced_at ?? null,
      calendars_synced_count: calendarStatus.calendars_synced_count,
      events_synced_count: calendarStatus.events_synced_count,
      owned_writable_calendar_count: calendarStatus.owned_writable_calendar_count,
      personal_ops_active_event_count: calendarStatus.personal_ops_active_event_count,
      linked_scheduled_task_count: calendarStatus.linked_scheduled_task_count,
      conflict_count_next_24h: calendarStatus.conflict_count_next_24h,
      next_upcoming_event_summary: calendarStatus.next_upcoming_event?.summary ?? null,
      top_item_summary: topCalendarItem?.summary ?? null,
      top_scheduling_item_summary: topSchedulingItem?.summary ?? null,
    },
    github: githubStatus,
    drive: driveStatus,
    autopilot: {
      enabled: autopilotStatus.enabled,
      mode: autopilotStatus.mode,
      readiness: autopilotStatus.readiness,
      running: autopilotStatus.running,
      last_success_at: autopilotStatus.last_success_at,
      stale_profile_count: autopilotStatus.profiles.filter((profile: any) => profile.state === "stale" || profile.state === "idle").length,
      top_item_summary: autopilotStatus.top_item_summary,
    },
    desktop: desktopStatus,
  };
}

export async function buildDoctorReport(service: any, options: { deep: boolean; httpReachable: boolean }): Promise<DoctorReport> {
  const checks = await service.collectDoctorChecks(options);
  return {
    generated_at: new Date().toISOString(),
    state: service.classifyState(checks),
    deep: options.deep,
    summary: service.summarizeChecks(checks),
    checks,
  };
}
