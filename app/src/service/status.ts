import type {
  DoctorReport,
  ReviewCalibrationMetricAssessment,
  ReviewCalibrationSurfaceSummary,
  ReviewPackageSurface,
  ServiceStatusReport,
} from "../types.js";
import { getDesktopStatusReport } from "../desktop.js";
import { buildInstallCheckReport } from "../install.js";
import { getKeychainSecret } from "../keychain.js";
import { getLaunchAgentLabel } from "../launchagent.js";
import { describeStateOrigin, readMachineIdentity, readRestoreProvenance } from "../machine.js";
import {
  buildMaintenanceEscalationSummary,
  buildMaintenanceFollowThroughSummary,
  buildMaintenanceWindowSummary,
  buildRepairPlan,
  summarizeRepairPlan,
} from "../repair-plan.js";
import { pruneSnapshots, readRecoveryRehearsalStamp, snapshotAgeHours, SNAPSHOT_WARN_HOURS } from "../recovery.js";
import {
  buildStoredReviewCalibration,
  buildStoredReviewPackageReport,
  buildStoredReviewReport,
  buildStoredReviewWeekly,
} from "./review-intelligence.js";

const CALIBRATION_METRIC_PRECEDENCE: ReviewCalibrationMetricAssessment["metric"][] = [
  "notifications_per_7d",
  "stale_unused_rate",
  "negative_feedback_rate",
  "acted_on_rate",
  "notification_action_conversion_rate",
];

function calibrationMetricPrecedence(metric: ReviewCalibrationMetricAssessment["metric"]): number {
  const index = CALIBRATION_METRIC_PRECEDENCE.indexOf(metric);
  return index === -1 ? CALIBRATION_METRIC_PRECEDENCE.length : index;
}

function calibrationMetricGap(metric: ReviewCalibrationMetricAssessment): number {
  if (metric.metric === "acted_on_rate" || metric.metric === "notification_action_conversion_rate") {
    return Math.max(0, metric.target_value - metric.actual_value) / Math.max(metric.target_value, 0.05);
  }
  if (metric.metric === "notifications_per_7d" && metric.target_value === 0) {
    return metric.actual_value > 0 ? metric.actual_value : 0;
  }
  return Math.max(0, metric.actual_value - metric.target_value) / Math.max(metric.target_value, metric.metric === "notifications_per_7d" ? 1 : 0.05);
}

function topCalibrationSurface(summaries: ReviewCalibrationSurfaceSummary[]): ReviewPackageSurface | null {
  return (
    [...summaries]
      .filter((summary) => Boolean(summary.surface) && summary.status === "off_track")
      .sort(
        (left, right) =>
          calibrationMetricPrecedence(left.worst_metric.metric) - calibrationMetricPrecedence(right.worst_metric.metric) ||
          calibrationMetricGap(right.worst_metric) - calibrationMetricGap(left.worst_metric) ||
          (left.surface ?? "").localeCompare(right.surface ?? ""),
      )[0]?.surface ?? null
  );
}

export async function buildStatusReport(
  service: any,
  options: { httpReachable: boolean; skipDerived?: boolean },
): Promise<ServiceStatusReport> {
  const skipDerived = Boolean(options.skipDerived);
  const checks = await service.collectDoctorChecks({ deep: false, httpReachable: options.httpReachable });
  const summary = service.summarizeChecks(checks);
  const classifiedState = service.classifyState(checks);
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
  const worklist = await service.getWorklistReport({ httpReachable: options.httpReachable });
  const inboxStatus = service.getInboxStatusReport();
  const calendarStatus = service.getCalendarStatusReport();
  const githubStatus = service.getGithubStatusReport();
  const driveStatus = service.getDriveStatusReport();
  const autopilotStatus = await service.getAutopilotStatusReport({ httpReachable: options.httpReachable });
  const reviewPackageReport = skipDerived
    ? await buildStoredReviewPackageReport(service, classifiedState)
    : await service.getReviewPackageReport();
  const reviewOutcomeReport = skipDerived
    ? await buildStoredReviewReport(service, { window_days: 14 })
    : await service.getReviewReport({ window_days: 14 });
  const reviewWeeklyReport = skipDerived
    ? await buildStoredReviewWeekly(service, { days: 14 })
    : await service.getReviewWeekly({ days: 14 });
  const reviewCalibrationReport = skipDerived
    ? await buildStoredReviewCalibration(service)
    : await service.getReviewCalibration();
  const rawDesktopStatus = await getDesktopStatusReport(service.paths);
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
  const installCheck = buildInstallCheckReport(service.paths);
  const recoveryRehearsal = readRecoveryRehearsalStamp(service.paths);
  const prune = pruneSnapshots(service.paths, { dryRun: true });
  const repairPlan = buildRepairPlan({
    generated_at: new Date().toISOString(),
    install_check: installCheck,
    doctor: {
      checks,
      state: classifiedState,
      deep: false,
    },
    desktop: rawDesktopStatus,
    latest_snapshot_id: latestSnapshot?.snapshot_id ?? null,
    latest_snapshot_age_hours: snapshotAgeHours(latestSnapshot),
    snapshot_age_limit_hours: SNAPSHOT_WARN_HOURS,
    prune_candidate_count: prune.prune_candidates,
    recovery_rehearsal_missing: recoveryRehearsal.status !== "configured" || !recoveryRehearsal.stamp,
    machine_state_origin: describeStateOrigin(provenance),
    recent_repair_executions: service.db.listRepairExecutions({ days: 30, limit: 100 }),
  });
  const maintenanceWindow = worklist.maintenance_window ?? buildMaintenanceWindowSummary({
    generated_at: new Date().toISOString(),
    state: classifiedState,
    worklist_items: worklist.items,
    repair_plan: repairPlan,
    recent_repair_executions: service.db.listRepairExecutions({ days: 30, limit: 100 }),
  });
  const maintenanceFollowThrough =
    worklist.maintenance_follow_through ??
    buildMaintenanceFollowThroughSummary({
      generated_at: new Date().toISOString(),
      maintenance_window: maintenanceWindow,
      repair_plan: repairPlan,
      recent_repair_executions: service.db.listRepairExecutions({ days: 30, limit: 100 }),
    });
  const maintenanceEscalation =
    worklist.maintenance_escalation ??
    buildMaintenanceEscalationSummary({
      generated_at: new Date().toISOString(),
      state: classifiedState,
      maintenance_window: maintenanceWindow,
      maintenance_follow_through: maintenanceFollowThrough,
      repair_plan: repairPlan,
      recent_repair_executions: service.db.listRepairExecutions({ days: 30, limit: 100 }),
    });
  const repairPlanWithMaintenance = {
    ...repairPlan,
    maintenance_window: maintenanceWindow,
    maintenance_follow_through: maintenanceFollowThrough,
    maintenance_escalation: maintenanceEscalation,
  };
  const desktopStatus = {
    ...rawDesktopStatus,
    repair_plan_summary: summarizeRepairPlan(repairPlanWithMaintenance),
  };
  return {
    generated_at: new Date().toISOString(),
    service_version: service.getServiceVersion(),
    state: classifiedState,
    first_repair_step: repairPlanWithMaintenance.first_repair_step,
    repair_plan: repairPlanWithMaintenance,
    maintenance_window: maintenanceWindow,
    maintenance_follow_through: maintenanceFollowThrough,
    maintenance_escalation: maintenanceEscalation,
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
    review: {
      ready_package_count: reviewPackageReport.packages.length,
      open_tuning_proposal_count: reviewPackageReport.open_tuning_proposal_count,
      unused_package_count_7d: reviewPackageReport.unused_package_count_7d,
      top_review_summary: reviewPackageReport.top_item_summary,
      refreshed_at: reviewPackageReport.refreshed_at,
      refresh_state: reviewPackageReport.refresh_state,
      package_open_rate_14d: reviewOutcomeReport.summary.open_rate,
      package_acted_on_rate_14d: reviewOutcomeReport.summary.acted_on_rate,
      stale_unused_rate_14d: reviewOutcomeReport.summary.stale_unused_rate,
      notification_action_conversion_rate_14d: reviewOutcomeReport.summary.notification_action_conversion_rate,
      week_over_week_open_rate_delta: reviewWeeklyReport.week_over_week_open_rate_delta,
      week_over_week_action_rate_delta: reviewWeeklyReport.week_over_week_action_rate_delta,
      week_over_week_notification_action_conversion_delta:
        reviewWeeklyReport.week_over_week_notification_action_conversion_delta,
      top_review_trend_surface: reviewWeeklyReport.top_review_trend_surface,
      calibration_status: reviewCalibrationReport.global.status,
      surfaces_off_track_count: reviewCalibrationReport.surfaces_off_track_count,
      notification_budget_pressure_count: reviewCalibrationReport.notification_budget_pressure_count,
      top_calibration_surface: topCalibrationSurface(reviewCalibrationReport.surfaces),
    },
    desktop: desktopStatus,
  };
}

export async function buildDoctorReport(service: any, options: { deep: boolean; httpReachable: boolean }): Promise<DoctorReport> {
  const checks = await service.collectDoctorChecks(options);
  const state = service.classifyState(checks);
  const installCheck = buildInstallCheckReport(service.paths);
  const desktopStatus = await getDesktopStatusReport(service.paths);
  const latestSnapshot = service.getLatestSnapshotSummary();
  const recoveryRehearsal = readRecoveryRehearsalStamp(service.paths);
  const prune = pruneSnapshots(service.paths, { dryRun: true });
  const restoreProvenance = readRestoreProvenance(service.paths);
  const provenance = restoreProvenance.status === "configured" ? restoreProvenance.provenance : null;
  const repairPlan = buildRepairPlan({
    generated_at: new Date().toISOString(),
    install_check: installCheck,
    doctor: {
      checks,
      state,
      deep: options.deep,
    },
    desktop: desktopStatus,
    latest_snapshot_id: latestSnapshot?.snapshot_id ?? null,
    latest_snapshot_age_hours: snapshotAgeHours(latestSnapshot),
    snapshot_age_limit_hours: SNAPSHOT_WARN_HOURS,
    prune_candidate_count: prune.prune_candidates,
    recovery_rehearsal_missing: recoveryRehearsal.status !== "configured" || !recoveryRehearsal.stamp,
    machine_state_origin: describeStateOrigin(provenance),
    recent_repair_executions: service.db.listRepairExecutions({ days: 30, limit: 100 }),
  });
  return {
    generated_at: new Date().toISOString(),
    state,
    deep: options.deep,
    first_repair_step: repairPlan.first_repair_step,
    repair_plan: repairPlan,
    summary: service.summarizeChecks(checks),
    checks,
  };
}
