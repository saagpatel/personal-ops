import type {
  AttentionItem,
  DesktopStatusReport,
  DoctorCheck,
  DoctorReport,
  InstallCheckReport,
  MaintenanceBundleOutcome,
  MaintenanceEscalationSummary,
  MaintenanceFollowThroughSummary,
  MaintenanceOutcomeSignal,
  MaintenancePressureSummary,
  MaintenanceSchedulingSummary,
  MaintenanceSessionPlan,
  MaintenanceSessionStep,
  MaintenanceWindowDeferredReason,
  MaintenanceWindowSummary,
  MachineStateOrigin,
  PreventiveMaintenanceRecommendation,
  PreventiveMaintenanceBundle,
  PreventiveMaintenanceSummary,
  RepairExecutionRecord,
  RepairOutcomeSummary,
  RepairPlan,
  RepairPlanSummary,
  RepairRecurringIssue,
  RepairStep,
  RepairStepId,
  ServiceState,
} from "./types.js";

const RECURRING_WINDOW_DAYS = 30;
const RECURRING_THRESHOLD = 2;
const RECURRING_PRIORITY: RepairStepId[] = [
  "install_wrappers",
  "install_desktop",
  "install_launchagent",
  "fix_permissions",
];
const PREVENTIVE_QUIET_PERIOD_HOURS = 24;
const PREVENTIVE_LIMIT = 3;
const MAINTENANCE_RECENTLY_HANDLED_DAYS = 7;
export const MAINTENANCE_SESSION_COMMAND = "personal-ops maintenance session";
export const MAINTENANCE_RUN_NEXT_COMMAND = "personal-ops maintenance run next";
const MAINTENANCE_ESCALATION_COMMAND = MAINTENANCE_SESSION_COMMAND;
const CONCRETE_PRESSURE_KINDS = new Set([
  "task_overdue",
  "task_due_soon",
  "task_reminder_due",
  "thread_needs_reply",
  "thread_stale_followup",
  "github_review_requested",
  "github_pr_checks_failing",
  "github_pr_changes_requested",
  "calendar_conflict",
  "calendar_event_soon",
]);

interface BuildRepairPlanOptions {
  generated_at?: string;
  install_check?: Pick<InstallCheckReport, "checks" | "state"> | null;
  doctor?: Pick<DoctorReport, "checks" | "state" | "deep"> | null;
  desktop?: Pick<
    DesktopStatusReport,
    "supported" | "reinstall_recommended" | "reinstall_reason" | "launcher_repair_recommended" | "launcher_repair_reason"
  > | null;
  latest_snapshot_id?: string | null;
  latest_snapshot_age_hours?: number | null;
  snapshot_age_limit_hours?: number | null;
  prune_candidate_count?: number;
  recovery_rehearsal_missing?: boolean;
  machine_state_origin?: MachineStateOrigin | null;
  recent_repair_executions?: RepairExecutionRecord[];
}

function nonPassChecks(checks: DoctorCheck[], predicate: (check: DoctorCheck) => boolean): DoctorCheck[] {
  return checks.filter((check) => check.severity !== "pass" && predicate(check));
}

function uniqueChecks(checks: DoctorCheck[]): DoctorCheck[] {
  const seen = new Set<string>();
  const unique: DoctorCheck[] = [];
  for (const check of checks) {
    if (seen.has(check.id)) {
      continue;
    }
    seen.add(check.id);
    unique.push(check);
  }
  return unique;
}

function checkSummary(checks: DoctorCheck[], fallback: string): string {
  return (
    uniqueChecks(checks)
      .slice(0, 2)
      .map((check) => check.message)
      .join(" ")
      .trim() || fallback
  );
}

function buildReconnectAuthCommand(checks: DoctorCheck[]): string {
  const googleIssue = checks.some(
    (check) =>
      check.id.includes("mailbox") ||
      check.id.includes("oauth_client") ||
      check.id.includes("drive_token") ||
      check.id.includes("keychain"),
  );
  const githubIssue = checks.some((check) => check.id.includes("github_token") || check.id.includes("github_connected_login"));
  if (googleIssue && githubIssue) {
    return "personal-ops auth gmail login && personal-ops auth google login && personal-ops auth github login";
  }
  if (githubIssue) {
    return "personal-ops auth github login";
  }
  return "personal-ops auth gmail login && personal-ops auth google login";
}

function pushStep(steps: RepairStep[], step: RepairStep): void {
  if (steps.some((existing) => existing.id === step.id)) {
    return;
  }
  steps.push(step);
}

function toRepairOutcomeSummary(execution: RepairExecutionRecord): RepairOutcomeSummary {
  return {
    step_id: execution.step_id,
    completed_at: execution.completed_at,
    outcome: execution.outcome,
    trigger_source: execution.trigger_source,
    resolved_target_step: execution.resolved_target_step,
    message: execution.message,
  };
}

function preventionHint(stepId: RepairStepId): string | null {
  if (stepId === "install_wrappers") {
    return "Refresh wrappers after checkout or Node path changes so launcher scripts stay pinned to the current machine.";
  }
  if (stepId === "install_desktop") {
    return "Rebuild and reinstall the desktop app after desktop source or dependency changes so the installed bundle stays current.";
  }
  if (stepId === "install_launchagent") {
    return "Reload the LaunchAgent after local runtime changes so the daemon wiring stays aligned with the current checkout.";
  }
  if (stepId === "fix_permissions") {
    return "Check tools or edits that broaden local secret-file permissions so the same repair does not keep coming back.";
  }
  return null;
}

function preventiveTitle(stepId: RepairStepId): string {
  if (stepId === "install_wrappers") {
    return "Refresh wrappers before the next drift";
  }
  if (stepId === "install_desktop") {
    return "Refresh the desktop app before it falls behind";
  }
  if (stepId === "install_launchagent") {
    return "Reload the LaunchAgent before runtime drift returns";
  }
  return "Tighten local secret permissions before they drift again";
}

function preventiveReason(stepId: RepairStepId): string {
  if (stepId === "install_wrappers") {
    return "Wrapper drift has repeated on this machine, so a small wrapper refresh is likely cheaper than waiting for the next launcher break.";
  }
  if (stepId === "install_desktop") {
    return "Desktop drift has repeated on this machine, so rebuilding the installed app early should reduce stale-bundle surprises.";
  }
  if (stepId === "install_launchagent") {
    return "LaunchAgent drift has repeated on this machine, so a quick reload is likely safer than waiting for the daemon wiring to break again.";
  }
  return "Secret-permission drift has repeated on this machine, so tightening the affected files early should reduce future auth or policy noise.";
}

function preventiveCommand(stepId: RepairStepId): string {
  if (stepId === "install_wrappers") {
    return "personal-ops install wrappers";
  }
  if (stepId === "install_desktop") {
    return "personal-ops install desktop";
  }
  if (stepId === "install_launchagent") {
    return "personal-ops install launchagent";
  }
  return "personal-ops install fix-permissions";
}

function olderThanQuietPeriod(completedAt: string, now: Date): boolean {
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) {
    return false;
  }
  return now.getTime() - completed.getTime() >= PREVENTIVE_QUIET_PERIOD_HOURS * 60 * 60 * 1000;
}

function preventiveCandidates(
  recentExecutions: RepairExecutionRecord[],
  pendingStepIds: Set<RepairStepId>,
  generatedAtDate: Date,
  includeQuietPeriod: boolean,
): PreventiveMaintenanceRecommendation[] {
  const recommendations: PreventiveMaintenanceRecommendation[] = [];
  for (const stepId of RECURRING_PRIORITY) {
    if (pendingStepIds.has(stepId)) {
      continue;
    }
    const resolvedExecutions = recentExecutions.filter(
      (execution) => execution.step_id === stepId && execution.outcome === "resolved" && execution.resolved_target_step,
    );
    if (resolvedExecutions.length < RECURRING_THRESHOLD) {
      continue;
    }
    const lastResolved = resolvedExecutions[0];
    if (!lastResolved?.completed_at) {
      continue;
    }
    if (!includeQuietPeriod && !olderThanQuietPeriod(lastResolved.completed_at, generatedAtDate)) {
      continue;
    }
    recommendations.push({
      step_id: stepId,
      title: preventiveTitle(stepId),
      reason: preventiveReason(stepId),
      suggested_command: preventiveCommand(stepId),
      urgency: resolvedExecutions.length >= 3 ? "recommended" : "watch",
      last_resolved_at: lastResolved.completed_at,
      repeat_count_30d: resolvedExecutions.length,
    });
    if (recommendations.length >= PREVENTIVE_LIMIT) {
      break;
    }
  }
  return recommendations;
}

function maintenanceBundleFor(recommendations: PreventiveMaintenanceRecommendation[]): PreventiveMaintenanceBundle | null {
  if (recommendations.length === 0) {
    return null;
  }
  const commands = recommendations.map((recommendation) => recommendation.suggested_command);
  const titles = recommendations.map((recommendation) => recommendation.title.toLowerCase());
  return {
    bundle_id: `maintenance-window:${recommendations.map((recommendation) => recommendation.step_id).join("+")}`,
    title: "Preventive maintenance window",
    summary:
      recommendations.length === 1
        ? `${recommendations[0]!.title} is a good calm-window maintenance task right now.`
        : `${titles[0]} plus ${recommendations.length - 1} other preventive maintenance task${recommendations.length === 2 ? "" : "s"} fit a calm window right now.`,
    recommended_commands: commands,
    recommendations,
  };
}

function emptyMaintenancePressureSummary(): MaintenancePressureSummary {
  return {
    signal: null,
    count: 0,
    top_step_id: null,
    summary: null,
    suggested_command: null,
  };
}

export function emptyMaintenanceEscalationSummary(): MaintenanceEscalationSummary {
  return {
    eligible: false,
    step_id: null,
    signal: null,
    summary: null,
    suggested_command: null,
    handoff_count_30d: 0,
    cue: null,
  };
}

export function emptyMaintenanceSchedulingSummary(): MaintenanceSchedulingSummary {
  return {
    eligible: false,
    placement: "suppressed",
    step_id: null,
    summary: null,
    suggested_command: null,
    reason: null,
    bundle_step_ids: [],
  };
}

export function emptyMaintenanceFollowThroughSummary(generatedAt: string): MaintenanceFollowThroughSummary {
  return {
    generated_at: generatedAt,
    last_maintenance_outcome: null,
    last_maintenance_step_id: null,
    top_signal: null,
    current_bundle_outcome: null,
    maintenance_pressure_count: 0,
    top_maintenance_pressure_step_id: null,
    pressure: emptyMaintenancePressureSummary(),
    escalation: emptyMaintenanceEscalationSummary(),
    summary: null,
  };
}

function withinRecentHandledWindow(completedAt: string, now: Date): boolean {
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) {
    return false;
  }
  return now.getTime() - completed.getTime() <= MAINTENANCE_RECENTLY_HANDLED_DAYS * 24 * 60 * 60 * 1000;
}

function withinRecurringWindow(completedAt: string, now: Date): boolean {
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) {
    return false;
  }
  return now.getTime() - completed.getTime() <= RECURRING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function maintenanceDeferredSummary(reason: MaintenanceWindowDeferredReason, topStepId: RepairStepId | null): string {
  if (reason === "active_repair_pending") {
    return "Maintenance is deferred because active repair is pending.";
  }
  if (reason === "system_not_ready") {
    return "Maintenance is deferred because the system is not fully ready.";
  }
  if (reason === "concrete_work_present") {
    return "Maintenance is deferred because concrete operator work is already present.";
  }
  if (reason === "quiet_period_active") {
    return topStepId
      ? `Maintenance is deferred because ${topStepId} is still inside the post-repair quiet period.`
      : "Maintenance is deferred because the post-repair quiet period is still active.";
  }
  return "No preventive maintenance bundle is active right now.";
}

function summarizeMaintenanceOutcome(input: {
  execution: RepairExecutionRecord;
  generatedAtDate: Date;
  maintenanceWindow: MaintenanceWindowSummary;
  currentStepIds: RepairStepId[];
  pressureSignal: MaintenanceOutcomeSignal | null;
}): MaintenanceBundleOutcome {
  const occurredAt = input.execution.completed_at;
  if (input.execution.outcome === "failed") {
    return {
      signal: "failed",
      step_id: input.execution.step_id,
      occurred_at: occurredAt,
      remaining_step_count: input.maintenanceWindow.count,
      summary: input.execution.message,
    };
  }
  if (input.execution.after_first_step_id) {
    return {
      signal: "handed_off_to_repair",
      step_id: input.execution.step_id,
      occurred_at: occurredAt,
      remaining_step_count: input.maintenanceWindow.count,
      summary: "The last maintenance session stopped for the right reason and handed back to active repair.",
    };
  }
  const advanced =
    input.currentStepIds.length > 0 &&
    input.currentStepIds.some((stepId) => stepId !== input.execution.step_id) &&
    withinRecentHandledWindow(occurredAt, input.generatedAtDate);
  if (advanced) {
    return {
      signal: "advanced",
      step_id: input.execution.step_id,
      occurred_at: occurredAt,
      remaining_step_count: input.currentStepIds.length,
      summary: `The last maintenance session advanced cleanly and ${input.currentStepIds.length} calm-window maintenance step${input.currentStepIds.length === 1 ? "" : "s"} remain.`,
    };
  }
  return {
    signal: "completed",
    step_id: input.execution.step_id,
    occurred_at: occurredAt,
    remaining_step_count: 0,
    summary:
      input.pressureSignal === "stale_bundle"
        ? "The last maintenance session completed, but the same calm-window maintenance step is resurfacing again."
        : "The last maintenance session completed cleanly and that step family has stayed quiet since the prior successful run.",
  };
}

export function buildMaintenanceFollowThroughSummary(input: {
  generated_at?: string;
  maintenance_window: MaintenanceWindowSummary;
  repair_plan: Pick<RepairPlan, "steps" | "first_repair_step">;
  recent_repair_executions?: RepairExecutionRecord[];
}): MaintenanceFollowThroughSummary {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const generatedAtDate = new Date(generatedAt);
  const summary = emptyMaintenanceFollowThroughSummary(generatedAt);
  const recentExecutions = [...(input.recent_repair_executions ?? [])].sort((left, right) =>
    right.completed_at.localeCompare(left.completed_at),
  );
  const maintenanceExecutions = recentExecutions.filter((execution) => execution.trigger_source === "maintenance_run");
  const currentStepIds =
    input.maintenance_window.bundle?.recommendations.map((recommendation) => recommendation.step_id) ??
    (input.maintenance_window.top_step_id ? [input.maintenance_window.top_step_id] : []);
  const pressureCandidates = currentStepIds
    .map((stepId) => {
      const stepExecutions = maintenanceExecutions.filter((execution) => execution.step_id === stepId);
      const repeatedHandoffs = stepExecutions.filter(
        (execution) =>
          execution.outcome === "resolved" &&
          execution.resolved_target_step &&
          Boolean(execution.after_first_step_id) &&
          withinRecurringWindow(execution.completed_at, generatedAtDate),
      ).length;
      if (repeatedHandoffs >= RECURRING_THRESHOLD) {
        return {
          step_id: stepId,
          signal: "handed_off_to_repair" as const,
          summary: "This calm-window maintenance step has repeatedly turned into active repair and likely deserves repair-priority treatment.",
        };
      }
      const recentlyHandled = stepExecutions.some(
        (execution) =>
          execution.outcome === "resolved" &&
          execution.resolved_target_step &&
          withinRecentHandledWindow(execution.completed_at, generatedAtDate),
      );
      if (!recentlyHandled) {
        return {
          step_id: stepId,
          signal: "stale_bundle" as const,
          summary: "The same calm-window maintenance step keeps resurfacing without a recent successful maintenance session.",
        };
      }
      return null;
    })
    .filter(
      (
        candidate,
      ): candidate is {
        step_id: RepairStepId;
        signal: "handed_off_to_repair" | "stale_bundle";
        summary: string;
      } => candidate !== null,
    );

  const topPressure = pressureCandidates[0] ?? null;
  if (topPressure) {
    summary.maintenance_pressure_count = pressureCandidates.length;
    summary.top_maintenance_pressure_step_id = topPressure.step_id;
    summary.pressure = {
      signal: topPressure.signal,
      count: pressureCandidates.length,
      top_step_id: topPressure.step_id,
      summary: topPressure.summary,
      suggested_command: MAINTENANCE_SESSION_COMMAND,
    };
  }

  const lastMaintenanceExecution = maintenanceExecutions[0] ?? null;
  if (lastMaintenanceExecution) {
    const bundleOutcome = summarizeMaintenanceOutcome({
      execution: lastMaintenanceExecution,
      generatedAtDate,
      maintenanceWindow: input.maintenance_window,
      currentStepIds,
      pressureSignal: summary.pressure.signal,
    });
    summary.last_maintenance_outcome = bundleOutcome.signal;
    summary.last_maintenance_step_id = bundleOutcome.step_id;
    summary.current_bundle_outcome = bundleOutcome;
  } else if (input.maintenance_window.deferred_reason && input.maintenance_window.top_step_id) {
    summary.last_maintenance_outcome = "deferred";
    summary.last_maintenance_step_id = input.maintenance_window.top_step_id;
    summary.current_bundle_outcome = {
      signal: "deferred",
      step_id: input.maintenance_window.top_step_id,
      occurred_at: generatedAt,
      remaining_step_count: input.maintenance_window.count,
      summary: maintenanceDeferredSummary(input.maintenance_window.deferred_reason, input.maintenance_window.top_step_id),
    };
  }

  summary.top_signal = summary.pressure.signal ?? summary.last_maintenance_outcome;
  summary.summary = summary.pressure.summary ?? summary.current_bundle_outcome?.summary ?? null;
  return summary;
}

export function buildMaintenanceEscalationSummary(input: {
  state: ServiceState;
  maintenance_window: MaintenanceWindowSummary;
  maintenance_follow_through: MaintenanceFollowThroughSummary;
  repair_plan: Pick<RepairPlan, "steps">;
  recent_repair_executions?: RepairExecutionRecord[];
  generated_at?: string;
}): MaintenanceEscalationSummary {
  const summary = emptyMaintenanceEscalationSummary();
  if (input.state === "degraded") {
    return summary;
  }
  const stepId = input.maintenance_follow_through.pressure.top_step_id;
  if (!stepId || input.maintenance_follow_through.pressure.signal !== "handed_off_to_repair") {
    return summary;
  }
  if (input.repair_plan.steps.some((step) => step.id === stepId)) {
    return summary;
  }
  const generatedAtDate = new Date(input.generated_at ?? new Date().toISOString());
  const maintenanceExecutions = (input.recent_repair_executions ?? []).filter(
    (execution) => execution.trigger_source === "maintenance_run" && execution.step_id === stepId,
  );
  const handoffExecutions = maintenanceExecutions.filter(
    (execution) =>
      execution.outcome === "resolved" &&
      execution.resolved_target_step &&
      Boolean(execution.after_first_step_id) &&
      withinRecurringWindow(execution.completed_at, generatedAtDate),
  );
  if (handoffExecutions.length < RECURRING_THRESHOLD) {
    return summary;
  }
  const recentSuccessfulMaintenance = maintenanceExecutions.some(
    (execution) =>
      execution.outcome === "resolved" &&
      execution.resolved_target_step &&
      !execution.after_first_step_id &&
      withinRecentHandledWindow(execution.completed_at, generatedAtDate),
  );
  if (recentSuccessfulMaintenance) {
    return summary;
  }
  const escalatedSummary =
    "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.";
  return {
    eligible: true,
    step_id: stepId,
    signal: "handed_off_to_repair",
    summary: escalatedSummary,
    suggested_command: MAINTENANCE_ESCALATION_COMMAND,
    handoff_count_30d: handoffExecutions.length,
    cue: {
      item_id: `maintenance-escalation:${stepId}`,
      kind: "maintenance_escalation",
      severity: "warn",
      title: "Maintenance escalation",
      summary: escalatedSummary,
      target_type: "system",
      target_id: `maintenance:${stepId}`,
      suggested_command: MAINTENANCE_ESCALATION_COMMAND,
      signals: ["maintenance_escalation", stepId],
    },
  };
}

function maintenanceBundleStepIds(maintenanceWindow: MaintenanceWindowSummary): RepairStepId[] {
  return maintenanceWindow.bundle?.recommendations.map((recommendation) => recommendation.step_id) ?? [];
}

function maintenanceSchedulingReason(placement: MaintenanceSchedulingSummary["placement"]): string | null {
  if (placement === "now") {
    return "This has become repair-priority upkeep and should be handled in the current operating block.";
  }
  if (placement === "prep_day") {
    return "Plan this into today's maintenance block after time-sensitive work.";
  }
  if (placement === "calm_window") {
    return "Keep this for a calm window; do not displace active operator work.";
  }
  return null;
}

export function buildMaintenanceSchedulingSummary(input: {
  state: ServiceState;
  worklist_items: AttentionItem[];
  repair_plan: Pick<RepairPlan, "steps">;
  maintenance_window: MaintenanceWindowSummary;
  maintenance_escalation: MaintenanceEscalationSummary;
}): MaintenanceSchedulingSummary {
  const summary = emptyMaintenanceSchedulingSummary();
  const topEscalationStepId = input.maintenance_escalation.eligible ? input.maintenance_escalation.step_id : null;
  const topWindowStepId = input.maintenance_window.eligible_now ? input.maintenance_window.top_step_id : null;
  const stepId = topEscalationStepId ?? topWindowStepId ?? null;
  const bundleStepIds = (() => {
    const ids = maintenanceBundleStepIds(input.maintenance_window);
    if (ids.length > 0) {
      return ids;
    }
    return stepId ? [stepId] : [];
  })();

  if (!stepId) {
    return summary;
  }

  if (input.repair_plan.steps.some((step) => step.id === stepId)) {
    return {
      ...summary,
      step_id: stepId,
      reason: "Maintenance scheduling is suppressed because an active repair step is already pending for this family.",
      bundle_step_ids: bundleStepIds,
    };
  }

  if (input.state !== "ready") {
    return {
      ...summary,
      step_id: stepId,
      reason: "Maintenance scheduling is suppressed because the system is not fully ready.",
      bundle_step_ids: bundleStepIds,
    };
  }

  if (input.maintenance_window.deferred_reason === "quiet_period_active") {
    return {
      ...summary,
      step_id: stepId,
      reason: "Maintenance scheduling is suppressed because the post-repair quiet period is still active.",
      bundle_step_ids: bundleStepIds,
    };
  }

  if (input.maintenance_escalation.eligible && input.maintenance_escalation.step_id) {
    const hasConcretePressure = input.worklist_items.some((item) => CONCRETE_PRESSURE_KINDS.has(item.kind));
    const placement = hasConcretePressure ? "prep_day" : "now";
    return {
      eligible: true,
      placement,
      step_id: stepId,
      summary: input.maintenance_escalation.summary,
      suggested_command: input.maintenance_escalation.suggested_command,
      reason: maintenanceSchedulingReason(placement),
      bundle_step_ids: bundleStepIds,
    };
  }

  if (input.maintenance_window.eligible_now && input.maintenance_window.bundle) {
    return {
      eligible: true,
      placement: "calm_window",
      step_id: stepId,
      summary: input.maintenance_window.bundle.summary,
      suggested_command: MAINTENANCE_SESSION_COMMAND,
      reason: maintenanceSchedulingReason("calm_window"),
      bundle_step_ids: bundleStepIds,
    };
  }

  return {
    ...summary,
    step_id: stepId,
    reason: "Maintenance scheduling is suppressed because no active maintenance timing cue is available.",
    bundle_step_ids: bundleStepIds,
  };
}

function toMaintenanceSessionStep(
  recommendation: PreventiveMaintenanceRecommendation,
  latestByStep: Map<RepairStepId, RepairExecutionRecord>,
): MaintenanceSessionStep {
  const latestExecution = latestByStep.get(recommendation.step_id);
  return {
    step_id: recommendation.step_id,
    title: recommendation.title,
    reason: recommendation.reason,
    suggested_command: recommendation.suggested_command,
    blocking: false,
    latest_outcome: latestExecution?.outcome,
    latest_completed_at: latestExecution?.completed_at,
  };
}

function maintenanceDeferredReason(input: {
  state: ServiceState;
  hasPendingRepair: boolean;
  actionableRecommendations: PreventiveMaintenanceRecommendation[];
  quietPeriodRecommendations: PreventiveMaintenanceRecommendation[];
  hasConcretePressure: boolean;
}): MaintenanceWindowDeferredReason {
  if (input.hasPendingRepair) {
    return "active_repair_pending";
  }
  if (input.state !== "ready") {
    return "system_not_ready";
  }
  if (input.actionableRecommendations.length === 0 && input.quietPeriodRecommendations.length === 0) {
    return "no_preventive_work";
  }
  if (input.hasConcretePressure) {
    return "concrete_work_present";
  }
  if (input.actionableRecommendations.length === 0 && input.quietPeriodRecommendations.length > 0) {
    return "quiet_period_active";
  }
  return "no_preventive_work";
}

export function buildMaintenanceWindowSummary(input: {
  generated_at?: string;
  state: ServiceState;
  worklist_items: AttentionItem[];
  repair_plan: RepairPlan;
  recent_repair_executions?: RepairExecutionRecord[];
}): MaintenanceWindowSummary {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const generatedAtDate = new Date(generatedAt);
  const recentExecutions = [...(input.recent_repair_executions ?? [])].sort((left, right) =>
    right.completed_at.localeCompare(left.completed_at),
  );
  const pendingStepIds = new Set(input.repair_plan.steps.map((step) => step.id));
  const quietPeriodRecommendations = preventiveCandidates(recentExecutions, pendingStepIds, generatedAtDate, true);
  const actionableRecommendations = preventiveCandidates(recentExecutions, pendingStepIds, generatedAtDate, false);
  const hasConcretePressure = input.worklist_items.some((item) => CONCRETE_PRESSURE_KINDS.has(item.kind));
  const eligibleNow =
    input.state === "ready" &&
    pendingStepIds.size === 0 &&
    actionableRecommendations.length > 0 &&
    !hasConcretePressure;
  const deferredReason = eligibleNow
    ? null
    : maintenanceDeferredReason({
        state: input.state,
        hasPendingRepair: pendingStepIds.size > 0,
        actionableRecommendations,
        quietPeriodRecommendations,
        hasConcretePressure,
      });
  const visibleRecommendations = eligibleNow ? actionableRecommendations : [];
  const topRecommendation = actionableRecommendations[0] ?? quietPeriodRecommendations[0] ?? null;
  return {
    eligible_now: eligibleNow,
    deferred_reason: deferredReason,
    count: actionableRecommendations.length,
    top_step_id: topRecommendation?.step_id ?? null,
    bundle: eligibleNow ? maintenanceBundleFor(visibleRecommendations) : null,
  };
}

export function buildMaintenanceSessionPlan(input: {
  generated_at?: string;
  maintenance_window: MaintenanceWindowSummary;
  maintenance_follow_through?: MaintenanceFollowThroughSummary | null;
  maintenance_scheduling?: MaintenanceSchedulingSummary | null;
  recent_repair_executions?: RepairExecutionRecord[];
}): MaintenanceSessionPlan {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const recentExecutions = [...(input.recent_repair_executions ?? [])].sort((left, right) =>
    right.completed_at.localeCompare(left.completed_at),
  );
  const latestByStep = new Map<RepairStepId, RepairExecutionRecord>();
  for (const execution of recentExecutions) {
    if (!latestByStep.has(execution.step_id)) {
      latestByStep.set(execution.step_id, execution);
    }
  }
  const bundle = input.maintenance_window.eligible_now ? input.maintenance_window.bundle : null;
  const steps = (bundle?.recommendations ?? []).map((recommendation) => toMaintenanceSessionStep(recommendation, latestByStep));
  return {
    generated_at: generatedAt,
    eligible_now: input.maintenance_window.eligible_now,
    deferred_reason: input.maintenance_window.deferred_reason,
    bundle_id: bundle?.bundle_id ?? null,
    title: bundle?.title ?? null,
    summary: bundle?.summary ?? null,
    start_command: MAINTENANCE_SESSION_COMMAND,
    steps,
    first_step_id: steps[0]?.step_id ?? null,
    maintenance_follow_through: input.maintenance_follow_through ?? emptyMaintenanceFollowThroughSummary(generatedAt),
    maintenance_scheduling: input.maintenance_scheduling ?? emptyMaintenanceSchedulingSummary(),
  };
}

export function summarizeRepairPlan(plan: RepairPlan): RepairPlanSummary {
  return {
    first_step_id: plan.first_step_id,
    first_repair_step: plan.first_repair_step,
    step_count: plan.steps.length,
    last_step_id: plan.last_execution?.step_id ?? null,
    last_outcome: plan.last_execution?.outcome ?? null,
    top_recurring_step_id: plan.top_recurring_issue?.step_id ?? null,
    preventive_maintenance_count: plan.preventive_maintenance.count,
    top_preventive_step_id: plan.preventive_maintenance.top_step_id,
    last_maintenance_outcome: plan.maintenance_follow_through.last_maintenance_outcome,
    last_maintenance_step_id: plan.maintenance_follow_through.last_maintenance_step_id,
    maintenance_pressure_count: plan.maintenance_follow_through.maintenance_pressure_count,
    top_maintenance_pressure_step_id: plan.maintenance_follow_through.top_maintenance_pressure_step_id,
    maintenance_follow_through: plan.maintenance_follow_through,
    maintenance_escalation: plan.maintenance_escalation,
    maintenance_scheduling: plan.maintenance_scheduling,
    maintenance_window: plan.maintenance_window,
    last_repair: plan.last_repair,
    recurring_issue: plan.recurring_issue,
  };
}

export function buildRepairPlan(options: BuildRepairPlanOptions): RepairPlan {
  const generatedAt = options.generated_at ?? new Date().toISOString();
  const generatedAtDate = new Date(generatedAt);
  const installChecks = options.install_check?.checks ?? [];
  const doctorChecks = options.doctor?.checks ?? [];
  const allChecks = [...installChecks, ...doctorChecks];
  const recentExecutions = [...(options.recent_repair_executions ?? [])].sort((left, right) =>
    right.completed_at.localeCompare(left.completed_at),
  );
  const latestByStep = new Map<RepairStepId, RepairExecutionRecord>();
  for (const execution of recentExecutions) {
    if (!latestByStep.has(execution.step_id)) {
      latestByStep.set(execution.step_id, execution);
    }
  }

  const wrapperChecks = nonPassChecks(allChecks, (check) => check.id.includes("_wrapper_") || check.id.includes("_mcp_launcher"));
  const permissionChecks = nonPassChecks(allChecks, (check) => check.id.endsWith("_permissions_secure"));
  const launchAgentChecks = nonPassChecks(allChecks, (check) => check.id.startsWith("launch_agent_"));
  const installAllChecks = nonPassChecks(
    installChecks,
    (check) =>
      check.id.startsWith("dist_") ||
      check.id.startsWith("machine_identity") ||
      check.id.includes("api_token") ||
      check.id === "install_manifest_exists",
  );
  const installSetupChecks = nonPassChecks(
    installChecks,
    (check) =>
      !check.id.startsWith("launch_agent_") &&
      !check.id.endsWith("_permissions_secure") &&
      !check.id.includes("_wrapper_") &&
      !check.id.includes("_mcp_launcher") &&
      check.id !== "desktop_app_current" &&
      check.id !== "desktop_app_installed" &&
      check.id !== "desktop_platform_supported" &&
      check.id !== "desktop_toolchain_ready",
  );
  const doctorIssueChecks = uniqueChecks(
    nonPassChecks(doctorChecks, (check) => !check.id.endsWith("_permissions_secure") && !check.id.startsWith("launch_agent_")),
  );
  const reconnectAuthChecks = uniqueChecks(
    nonPassChecks(
      allChecks,
      (check) =>
        check.id.includes("mailbox") ||
        check.id.includes("oauth_client") ||
        check.id.includes("github_token") ||
        check.id.includes("github_connected_login") ||
        check.id.includes("drive_token") ||
        check.id.includes("keychain") ||
        check.id === "state_origin_safe",
    ),
  );

  const hasWrapperIssue = wrapperChecks.length > 0 || Boolean(options.desktop?.launcher_repair_recommended);
  const hasPermissionIssue = permissionChecks.length > 0;
  const hasLaunchAgentIssue = launchAgentChecks.length > 0;
  const hasDesktopIssue = Boolean(options.desktop?.supported && options.desktop.reinstall_recommended);
  const hasInstallCheckIssue =
    (options.install_check ? options.install_check.state !== "ready" : false) || installSetupChecks.length > 0;
  const hasDoctorIssue = options.doctor?.state != null && options.doctor.state !== "ready";
  const hasSnapshotIssue =
    !options.latest_snapshot_id ||
    (options.snapshot_age_limit_hours != null &&
      options.latest_snapshot_age_hours != null &&
      options.latest_snapshot_age_hours > options.snapshot_age_limit_hours);
  const hasPruneBacklog = (options.prune_candidate_count ?? 0) > 0;
  const hasRecoveryRehearsalIssue = Boolean(options.recovery_rehearsal_missing);
  const needsReconnectAuth =
    reconnectAuthChecks.length > 0 || options.machine_state_origin === "restored_cross_machine";
  const hasBroadInstallIssue =
    installAllChecks.length > 0 && !hasWrapperIssue && !hasPermissionIssue && !hasLaunchAgentIssue;

  const steps: RepairStep[] = [];

  if (hasWrapperIssue) {
    pushStep(steps, {
      id: "install_wrappers",
      title: "Refresh local wrappers",
      reason:
        options.desktop?.launcher_repair_recommended && wrapperChecks.length === 0
          ? options.desktop.launcher_repair_reason ?? "Local launcher scripts are stale."
          : checkSummary(wrapperChecks, "One or more local launcher scripts are stale or missing."),
      suggested_command: "personal-ops install wrappers",
      executable: true,
      status: "pending",
      scope: "install",
      blocking: true,
      latest_outcome: latestByStep.get("install_wrappers")?.outcome,
      latest_completed_at: latestByStep.get("install_wrappers")?.completed_at,
    });
  }

  if (hasPermissionIssue) {
    pushStep(steps, {
      id: "fix_permissions",
      title: "Repair local secret permissions",
      reason: checkSummary(permissionChecks, "One or more local secret files are broader than policy allows."),
      suggested_command: "personal-ops install fix-permissions",
      executable: true,
      status: "pending",
      scope: "install",
      blocking: true,
      latest_outcome: latestByStep.get("fix_permissions")?.outcome,
      latest_completed_at: latestByStep.get("fix_permissions")?.completed_at,
    });
  }

  if (hasLaunchAgentIssue) {
    pushStep(steps, {
      id: "install_launchagent",
      title: "Reinstall LaunchAgent",
      reason: checkSummary(launchAgentChecks, "The launchd integration is missing, stale, or not loaded."),
      suggested_command: "personal-ops install launchagent",
      executable: true,
      status: "pending",
      scope: "runtime",
      blocking: true,
      latest_outcome: latestByStep.get("install_launchagent")?.outcome,
      latest_completed_at: latestByStep.get("install_launchagent")?.completed_at,
    });
  }

  if (hasDesktopIssue) {
    pushStep(steps, {
      id: "install_desktop",
      title: "Refresh desktop app",
      reason: options.desktop?.reinstall_reason ?? "The installed desktop app was built from an older checkout.",
      suggested_command: "personal-ops install desktop",
      executable: true,
      status: "pending",
      scope: "desktop",
      blocking: true,
      latest_outcome: latestByStep.get("install_desktop")?.outcome,
      latest_completed_at: latestByStep.get("install_desktop")?.completed_at,
    });
  }

  if (hasInstallCheckIssue || hasWrapperIssue || hasPermissionIssue || hasLaunchAgentIssue || hasBroadInstallIssue) {
    pushStep(steps, {
      id: "install_check",
      title: "Confirm local install health",
      reason:
        options.install_check?.state === "ready"
          ? "Rerun install checks after local repairs to confirm the machine setup is current."
          : checkSummary(installSetupChecks, "Local install checks still need attention."),
      suggested_command: "personal-ops install check",
      executable: false,
      status: "pending",
      scope: "install",
      blocking: true,
    });
  }

  if (hasDoctorIssue || hasWrapperIssue || hasPermissionIssue || hasLaunchAgentIssue || hasBroadInstallIssue) {
    pushStep(steps, {
      id: "doctor",
      title: "Recheck local runtime health",
      reason:
        doctorIssueChecks.length > 0
          ? checkSummary(doctorIssueChecks, "The runtime still needs attention.")
          : "Rerun doctor after local repairs to confirm the control plane is healthy.",
      suggested_command: "personal-ops doctor",
      executable: false,
      status: "pending",
      scope: "runtime",
      blocking: true,
    });
  }

  if (needsReconnectAuth) {
    pushStep(steps, {
      id: "doctor_deep",
      title: "Run deep doctor after auth-sensitive repairs",
      reason:
        options.machine_state_origin === "restored_cross_machine"
          ? "This state came from another machine, so live access should be revalidated on this Mac."
          : "Run the deeper live verification pass once the local setup is healthy.",
      suggested_command: "personal-ops doctor --deep",
      executable: false,
      status: "pending",
      scope: "runtime",
      blocking: true,
    });
  }

  if (hasSnapshotIssue) {
    pushStep(steps, {
      id: "backup_create",
      title: "Create a fresh recovery snapshot",
      reason:
        !options.latest_snapshot_id
          ? "No recent recovery snapshot is recorded for this machine."
          : `The latest recovery snapshot is ${options.latest_snapshot_age_hours?.toFixed(1) ?? "unknown"}h old, beyond the ${options.snapshot_age_limit_hours ?? 24}h target.`,
      suggested_command: "personal-ops backup create",
      executable: false,
      status: "pending",
      scope: "recovery",
      blocking: true,
    });
  }

  if (hasPruneBacklog) {
    pushStep(steps, {
      id: "backup_prune",
      title: "Review snapshot prune backlog",
      reason: `${options.prune_candidate_count ?? 0} snapshot candidate(s) can be pruned under the retention policy.`,
      suggested_command: "personal-ops backup prune --dry-run",
      executable: false,
      status: "pending",
      scope: "recovery",
      blocking: false,
    });
  }

  if (hasRecoveryRehearsalIssue) {
    pushStep(steps, {
      id: "verify_recovery",
      title: "Rerun recovery rehearsal",
      reason: "Recovery rehearsal history is missing or stale on this machine.",
      suggested_command: "cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery",
      executable: false,
      status: "pending",
      scope: "recovery",
      blocking: true,
    });
  }

  if (needsReconnectAuth) {
    pushStep(steps, {
      id: "reconnect_local_auth",
      title: "Reconnect local auth",
      reason:
        options.machine_state_origin === "restored_cross_machine" && reconnectAuthChecks.length === 0
          ? "This machine needs fresh local auth before you trust live access."
          : checkSummary(reconnectAuthChecks, "One or more local auth connections need to be refreshed."),
      suggested_command: buildReconnectAuthCommand(reconnectAuthChecks),
      executable: false,
      status: "pending",
      scope: "auth",
      blocking: true,
    });
  }

  if (hasBroadInstallIssue) {
    pushStep(steps, {
      id: "install_all",
      title: "Rebuild local install artifacts",
      reason: checkSummary(installAllChecks, "Local install artifacts are incomplete or missing."),
      suggested_command: "personal-ops install all",
      executable: false,
      status: "pending",
      scope: "install",
      blocking: true,
    });
  }

  const lastRepair = recentExecutions[0] ? toRepairOutcomeSummary(recentExecutions[0]) : null;
  const pendingStepIds = new Set(steps.map((step) => step.id));
  let recurringIssue: RepairRecurringIssue | null = null;
  for (const stepId of RECURRING_PRIORITY) {
    if (!pendingStepIds.has(stepId)) {
      continue;
    }
    const occurrenceCount = recentExecutions.filter(
      (execution) => execution.step_id === stepId && execution.outcome === "resolved" && execution.resolved_target_step,
    ).length;
    if (occurrenceCount < RECURRING_THRESHOLD) {
      continue;
    }
    const hint = preventionHint(stepId);
    if (!hint) {
      continue;
    }
    recurringIssue = {
      step_id: stepId,
      occurrence_count: occurrenceCount,
      window_days: RECURRING_WINDOW_DAYS,
      prevention_hint: hint,
    };
    break;
  }

  const preventiveRecommendations = preventiveCandidates(recentExecutions, pendingStepIds, generatedAtDate, false);
  const preventiveMaintenance: PreventiveMaintenanceSummary = {
    recommendations: preventiveRecommendations,
    count: preventiveRecommendations.length,
    top_step_id: preventiveRecommendations[0]?.step_id ?? null,
  };

  return {
    generated_at: generatedAt,
    first_step_id: steps[0]?.id ?? null,
    first_repair_step: steps[0]?.suggested_command ?? null,
    last_execution: lastRepair,
    top_recurring_issue: recurringIssue,
    preventive_maintenance: preventiveMaintenance,
    maintenance_window: {
      eligible_now: false,
      deferred_reason: preventiveRecommendations.length > 0 ? "concrete_work_present" : "no_preventive_work",
      count: preventiveMaintenance.count,
      top_step_id: preventiveMaintenance.top_step_id,
      bundle: null,
    },
    maintenance_follow_through: emptyMaintenanceFollowThroughSummary(generatedAt),
    maintenance_escalation: emptyMaintenanceEscalationSummary(),
    maintenance_scheduling: emptyMaintenanceSchedulingSummary(),
    last_repair: lastRepair,
    recurring_issue: recurringIssue,
    steps,
  };
}
