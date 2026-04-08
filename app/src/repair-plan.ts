import type {
  DesktopStatusReport,
  DoctorCheck,
  DoctorReport,
  InstallCheckReport,
  MachineStateOrigin,
  PreventiveMaintenanceRecommendation,
  PreventiveMaintenanceSummary,
  RepairExecutionRecord,
  RepairOutcomeSummary,
  RepairPlan,
  RepairPlanSummary,
  RepairRecurringIssue,
  RepairStep,
  RepairStepId,
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

  const preventiveRecommendations: PreventiveMaintenanceRecommendation[] = [];
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
    if (!lastResolved?.completed_at || !olderThanQuietPeriod(lastResolved.completed_at, generatedAtDate)) {
      continue;
    }
    preventiveRecommendations.push({
      step_id: stepId,
      title: preventiveTitle(stepId),
      reason: preventiveReason(stepId),
      suggested_command: preventiveCommand(stepId),
      urgency: resolvedExecutions.length >= 3 ? "recommended" : "watch",
      last_resolved_at: lastResolved.completed_at,
      repeat_count_30d: resolvedExecutions.length,
    });
    if (preventiveRecommendations.length >= PREVENTIVE_LIMIT) {
      break;
    }
  }
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
    last_repair: lastRepair,
    recurring_issue: recurringIssue,
    steps,
  };
}
