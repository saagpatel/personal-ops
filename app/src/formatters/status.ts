import type {
  AutopilotStatusReport,
  DoctorCheck,
  DoctorReport,
  HealthCheckReport,
  MaintenanceSessionPlan,
  MaintenanceSessionRunResult,
  RepairExecutionResult,
  RepairPlan,
  ServiceStatusReport,
  VersionReport,
  WorklistReport,
} from "../types.js";
import {
  formatSeverity,
  formatStateLabel,
  humanizeKind,
  line,
  yesNo,
  type SendWindowStatus,
} from "./shared.js";

function topSummary(value: string | null | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

function workspaceHomeSummary(report: ServiceStatusReport): string {
  const home = report.workspace_home;
  if (!home?.summary) {
    return home?.title ?? "loading";
  }
  return `${home.title}: ${home.summary}`;
}

function workspaceHomeSurfaceProof(report: ServiceStatusReport): string | null {
  const helpfulness = report.workspace_home?.surfaced_work_helpfulness;
  if (!helpfulness?.eligible || !helpfulness.summary) {
    return null;
  }
  return helpfulness.summary;
}

function reviewApprovalFlowSummary(report: ServiceStatusReport): string | null {
  const flow = report.review_approval_flow;
  if (!flow?.eligible || !flow.summary) {
    return null;
  }
  const parts = [flow.summary];
  if (flow.why_now && flow.why_now !== report.workspace_home.why_now) {
    parts.push(flow.why_now);
  }
  if (flow.primary_command && flow.primary_command !== report.workspace_home.primary_command) {
    parts.push(`Next: \`${flow.primary_command}\`.`);
  }
  return parts.join(" ");
}

function maintenanceSignalLabel(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "none";
}

function asPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function pushSection(lines: string[], title: string, rows: string[]) {
  lines.push(title);
  lines.push(...rows);
  lines.push("");
}

function maintenanceFollowThroughRows(summary: RepairPlan["maintenance_follow_through"]): string[] {
  const rows: string[] = [];
  if (summary.current_bundle_outcome) {
    rows.push(
      `- Last maintenance: ${maintenanceSignalLabel(summary.current_bundle_outcome.signal)}${
        summary.current_bundle_outcome.step_id ? ` (${summary.current_bundle_outcome.step_id})` : ""
      }. ${summary.current_bundle_outcome.summary}`,
    );
  }
  if (summary.pressure.summary) {
    rows.push(
      `- Maintenance pressure: ${summary.pressure.summary}${
        summary.pressure.suggested_command ? ` Next: \`${summary.pressure.suggested_command}\`.` : ""
      }`,
    );
  }
  if (summary.escalation.eligible && summary.escalation.summary) {
    rows.push(
      `- Maintenance escalation: ${summary.escalation.summary}${
        summary.escalation.suggested_command ? ` Next: \`${summary.escalation.suggested_command}\`.` : ""
      }`,
    );
  }
  return rows;
}

function maintenanceSchedulingRows(summary: RepairPlan["maintenance_scheduling"]): string[] {
  if (!summary.eligible || !summary.summary) {
    return [];
  }
  const rows = [
    `- Maintenance scheduling (${summary.placement.replaceAll("_", " ")}): ${summary.summary}${
      summary.suggested_command ? ` Next: \`${summary.suggested_command}\`.` : ""
    }`,
  ];
  if (summary.reason) {
    rows.push(`- ${summary.reason}`);
  }
  return rows;
}

function maintenanceCommitmentRows(summary: RepairPlan["maintenance_commitment"] | undefined): string[] {
  if (!summary || !summary.summary || !summary.step_id) {
    return [];
  }
  const rows = [
    `- Maintenance commitment${summary.placement ? ` (${summary.placement.replaceAll("_", " ")})` : ""}: ${summary.summary}${
      summary.suggested_command ? ` Next: \`${summary.suggested_command}\`.` : ""
    }`,
  ];
  if (summary.defer_count > 0) {
    rows.push(`- Deferred ${summary.defer_count} time${summary.defer_count === 1 ? "" : "s"}${summary.last_presented_at ? ` since ${summary.last_presented_at}` : ""}.`);
  }
  return rows;
}

function maintenanceDeferMemoryRows(summary: RepairPlan["maintenance_defer_memory"] | undefined): string[] {
  if (!summary || !summary.summary || !summary.step_id) {
    return [];
  }
  return [
    `- Defer memory: ${summary.summary}${summary.last_deferred_at ? ` Last deferred: ${summary.last_deferred_at}.` : ""}`,
  ];
}

function maintenanceConfidenceRows(summary: RepairPlan["maintenance_confidence"] | undefined): string[] {
  if (!summary || !summary.eligible || !summary.summary || !summary.step_id) {
    return [];
  }
  const descriptor = summary.level && summary.trend ? `${summary.level}/${summary.trend}` : "active";
  return [
    `- Maintenance confidence (${descriptor}): ${summary.summary}${
      summary.suggested_command ? ` Next: \`${summary.suggested_command}\`.` : ""
    }`,
  ];
}

function maintenanceOperatingBlockRows(summary: RepairPlan["maintenance_operating_block"] | undefined): string[] {
  if (!summary || !summary.eligible || !summary.summary || !summary.step_id) {
    return [];
  }
  const rows = [
    `- Maintenance operating block (${summary.block.replaceAll("_", " ")}): ${summary.summary}${
      summary.suggested_command ? ` Next: \`${summary.suggested_command}\`.` : ""
    }`,
  ];
  if (summary.reason) {
    rows.push(`- ${summary.reason}`);
  }
  return rows;
}

function maintenanceDecisionExplanationRows(summary: RepairPlan["maintenance_decision_explanation"] | undefined): string[] {
  if (!summary || !summary.eligible || !summary.summary || !summary.step_id) {
    return [];
  }
  const rows = [
    `- Maintenance decision (${summary.state.replaceAll("_", " ")} / ${summary.driver?.replaceAll("_", " ") ?? "none"}): ${summary.summary}${
      summary.suggested_command ? ` Next: \`${summary.suggested_command}\`.` : ""
    }`,
  ];
  if (summary.why_now) {
    rows.push(`- Why now: ${summary.why_now}`);
  }
  if (summary.why_not_higher) {
    rows.push(`- Why not higher: ${summary.why_not_higher}`);
  }
  return rows;
}

function maintenanceRepairConvergenceRows(summary: RepairPlan["maintenance_repair_convergence"] | undefined): string[] {
  if (!summary || !summary.eligible || !summary.summary || !summary.step_id) {
    return [];
  }
  const rows = [
    `- Maintenance/repair convergence (${summary.state.replaceAll("_", " ")} / ${summary.driver?.replaceAll("_", " ") ?? "none"}): ${summary.summary}${
      summary.primary_command ? ` Next: \`${summary.primary_command}\`.` : ""
    }`,
  ];
  if (summary.why) {
    rows.push(`- Why: ${summary.why}`);
  }
  return rows;
}

function statusActionItems(report: ServiceStatusReport): string[] {
  const actions: string[] = [];

  if (report.first_repair_step) {
    actions.push(`Start with \`${report.first_repair_step}\` to follow the current local repair plan.`);
  }

  if (report.machine.state_origin === "restored_cross_machine") {
    actions.push("This state was restored from another machine. Run `personal-ops doctor --deep` and the local auth flow before trusting live access.");
  } else if (report.machine.state_origin === "unknown_legacy_restore") {
    actions.push("This state came from a legacy snapshot with unknown machine provenance. Treat it as intentional recovery, not sync.");
  }

  if (!report.daemon_reachable) {
    actions.push("The daemon is not reachable. Run `personal-ops install check`, then `personal-ops doctor`.");
    actions.push("If you manage the daemon directly, start `personal-opsd`. If you use launchd, restart the LaunchAgent.");
    return actions;
  }

  if (!report.mailbox.configured) {
    actions.push("Mailbox setup is incomplete. Fill in `config.toml`, then rerun `personal-ops install check`.");
  } else if (!report.mailbox.oauth_client_configured) {
    actions.push("Place the Google OAuth client JSON, then rerun `personal-ops install check`.");
  } else if (!report.mailbox.connected) {
    actions.push("Mailbox auth is not finished. Run `personal-ops auth gmail login` and `personal-ops auth google login`.");
  }

  if (!report.launch_agent.loaded) {
    actions.push("The LaunchAgent is not loaded. Run `personal-ops install launchagent`.");
  }

  if (report.worklist_summary.top_item_summary) {
    if (report.workspace_home.summary !== report.worklist_summary.top_item_summary) {
      actions.push(`Top attention item: ${report.worklist_summary.top_item_summary}`);
    }
    actions.push("Run `personal-ops worklist` for the full queue or `personal-ops now` for the shortest summary.");
  }

  if (actions.length === 0) {
    actions.push("Everything looks healthy right now. Use `personal-ops now` for a quick check-in or `personal-ops worklist` for the full queue.");
  }

  return actions;
}

function formatRepairPlan(plan: RepairPlan): string[] {
  const lines: string[] = [];
  const preventiveRows =
    plan.preventive_maintenance.recommendations.length === 0
      ? []
      : plan.preventive_maintenance.recommendations.map(
          (recommendation) =>
            `- Preventive maintenance (${recommendation.urgency}): ${recommendation.title}. ${recommendation.reason} Last resolved: ${recommendation.last_resolved_at}. Next: \`${recommendation.suggested_command}\`.`,
        );
  const maintenanceRows =
    !plan.maintenance_window.eligible_now || !plan.maintenance_window.bundle
      ? []
      : [
          `- Maintenance window: ${plan.maintenance_window.bundle.summary}`,
          `- Start session: \`personal-ops maintenance session\`.`,
          ...plan.maintenance_window.bundle.recommendations.map(
            (recommendation) =>
              `- Calm window (${recommendation.urgency}): ${recommendation.title}. ${recommendation.reason} Inside the session: \`${recommendation.suggested_command}\`.`,
          ),
        ];
  if (plan.last_repair) {
    lines.push(
      `- Last repair: ${plan.last_repair.step_id} finished ${plan.last_repair.completed_at} with ${plan.last_repair.outcome}. ${plan.last_repair.message}`,
    );
  }
  if (plan.recurring_issue) {
    lines.push(
      `- Recurring drift: ${plan.recurring_issue.step_id} came back ${plan.recurring_issue.occurrence_count} times in ${plan.recurring_issue.window_days}d. ${plan.recurring_issue.prevention_hint}`,
    );
  }
  lines.push(...maintenanceFollowThroughRows(plan.maintenance_follow_through));
  lines.push(...maintenanceCommitmentRows(plan.maintenance_commitment));
  lines.push(...maintenanceDeferMemoryRows(plan.maintenance_defer_memory));
  lines.push(...maintenanceConfidenceRows(plan.maintenance_confidence));
  lines.push(...maintenanceOperatingBlockRows(plan.maintenance_operating_block));
  lines.push(...maintenanceDecisionExplanationRows(plan.maintenance_decision_explanation));
  lines.push(...maintenanceRepairConvergenceRows(plan.maintenance_repair_convergence));
  lines.push(...maintenanceSchedulingRows(plan.maintenance_scheduling));
  if (plan.steps.length === 0) {
    lines.push("- No repair actions are pending right now.");
    lines.push(...preventiveRows);
    lines.push(...maintenanceRows);
    return lines;
  }
  lines.push(
    ...plan.steps.map(
      (step, index) =>
        `- ${index + 1}. ${step.title}: ${step.reason}${step.latest_outcome ? ` Last outcome: ${step.latest_outcome}${step.latest_completed_at ? ` at ${step.latest_completed_at}` : ""}.` : ""} Next: \`${step.suggested_command}\`${step.executable ? " (can run from `personal-ops repair run`)" : ""}.`,
    ),
  );
  lines.push(...preventiveRows);
  lines.push(...maintenanceRows);
  return lines;
}

export function formatRepairPlanReport(plan: RepairPlan): string {
  const lines: string[] = [];
  lines.push("Repair Plan");
  lines.push(line("Generated", plan.generated_at));
  lines.push(line("First repair step", plan.first_repair_step ?? "none"));
  lines.push(line("Last repair", plan.last_repair ? `${plan.last_repair.step_id} (${plan.last_repair.outcome})` : "none"));
  lines.push(line("Recurring drift", plan.recurring_issue ? plan.recurring_issue.step_id : "none"));
  lines.push(
    line("Preventive maintenance", plan.preventive_maintenance.top_step_id ? plan.preventive_maintenance.top_step_id : "none"),
  );
  lines.push(
    line(
      "Maintenance window",
      plan.maintenance_window.eligible_now
        ? plan.maintenance_window.top_step_id ?? "ready"
        : plan.maintenance_window.deferred_reason ?? "none",
    ),
  );
  lines.push(line("Last maintenance", maintenanceSignalLabel(plan.maintenance_follow_through.last_maintenance_outcome)));
  lines.push(
    line(
      "Maintenance pressure",
      plan.maintenance_follow_through.top_maintenance_pressure_step_id
        ? `${plan.maintenance_follow_through.top_maintenance_pressure_step_id} (${maintenanceSignalLabel(plan.maintenance_follow_through.top_signal)})`
        : "none",
    ),
  );
  lines.push(line("Maintenance escalation", plan.maintenance_escalation.step_id ?? "none"));
  lines.push(
    line(
      "Maintenance commitment",
      plan.maintenance_commitment?.step_id
        ? `${plan.maintenance_commitment.step_id}${plan.maintenance_commitment.placement ? ` (${plan.maintenance_commitment.placement.replaceAll("_", " ")})` : ""}`
        : "none",
    ),
  );
  lines.push(
    line(
      "Maintenance defer memory",
      plan.maintenance_defer_memory?.step_id
        ? `${plan.maintenance_defer_memory.step_id} (${plan.maintenance_defer_memory.defer_count})`
        : "none",
    ),
  );
  lines.push(
    line(
      "Maintenance scheduling",
      plan.maintenance_scheduling.eligible
        ? `${plan.maintenance_scheduling.step_id ?? "none"} (${plan.maintenance_scheduling.placement.replaceAll("_", " ")})`
        : "none",
    ),
  );
  lines.push(
    line(
      "Maintenance operating block",
      plan.maintenance_operating_block?.eligible
        ? `${plan.maintenance_operating_block.step_id ?? "none"} (${plan.maintenance_operating_block.block.replaceAll("_", " ")})`
        : "none",
    ),
  );
  lines.push(
    line(
      "Maintenance confidence",
      plan.maintenance_confidence?.eligible && plan.maintenance_confidence.step_id
        ? `${plan.maintenance_confidence.step_id} (${plan.maintenance_confidence.level ?? "none"} / ${plan.maintenance_confidence.trend ?? "none"})`
        : "none",
    ),
  );
  lines.push(
    line(
      "Maintenance decision",
      plan.maintenance_decision_explanation?.eligible
        ? `${plan.maintenance_decision_explanation.step_id ?? "none"} (${plan.maintenance_decision_explanation.state.replaceAll("_", " ")} / ${plan.maintenance_decision_explanation.driver?.replaceAll("_", " ") ?? "none"})`
        : "none",
    ),
  );
  lines.push(
    line(
      "Maintenance convergence",
      plan.maintenance_repair_convergence?.eligible
        ? `${plan.maintenance_repair_convergence.step_id ?? "none"} (${plan.maintenance_repair_convergence.state.replaceAll("_", " ")} / ${plan.maintenance_repair_convergence.driver?.replaceAll("_", " ") ?? "none"})`
        : "none",
    ),
  );
  lines.push("");
  lines.push("Steps");
  lines.push(...formatRepairPlan(plan));
  return lines.join("\n");
}

function doctorFollowUp(check: DoctorCheck): string | null {
  if (check.id.endsWith("_permissions_secure")) {
    return "Run `personal-ops install fix-permissions`, then rerun install check or doctor.";
  }
  if (check.id === "snapshot_freshness") {
    return "Run `personal-ops backup create`, then rerun `personal-ops health check`.";
  }
  if (check.id === "snapshot_retention_pressure") {
    return "Run `personal-ops backup prune --dry-run`, then `personal-ops backup prune --yes` when the candidates look right.";
  }
  if (check.id === "recovery_rehearsal_freshness") {
    return "Run `cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery`, then rerun `personal-ops health check`.";
  }
  if (check.id.includes("keychain")) {
    return "Confirm Keychain access on this Mac, then rerun `personal-ops auth gmail login` and `personal-ops auth google login` if needed.";
  }
  if (check.id === "state_origin_safe") {
    return "If this state came from another machine, rerun `personal-ops doctor --deep` and the local auth flow before trusting live access.";
  }
  if (check.id.startsWith("machine_identity")) {
    return "Run `personal-ops install all` to initialize local machine metadata, then rerun install check or doctor.";
  }
  if (check.id.includes("oauth_client")) {
    return "Replace or fix the OAuth client JSON, then rerun `personal-ops install check` and the auth login flow.";
  }
  if (check.id.includes("api_token")) {
    return "Rerun `personal-ops install all` if you need to recreate local API tokens, then rerun doctor.";
  }
  if (check.category === "runtime") {
    return "Run `personal-ops install check`, then `personal-ops doctor --deep` if the runtime looks healthy.";
  }
  if (check.id.includes("oauth") || check.id.includes("mailbox")) {
    return "Finish mailbox and OAuth setup, then rerun `personal-ops install check`.";
  }
  if (check.id.includes("launch_agent")) {
    return "Reinstall the LaunchAgent with `personal-ops install launchagent`, then rerun doctor.";
  }
  if (check.id.includes("wrapper") || check.id.includes("_mcp_launcher")) {
    return "Refresh the local launcher scripts with `personal-ops install wrappers`, then rerun doctor.";
  }
  if (check.id.includes("dist_")) {
    return "Reinstall local artifacts with `personal-ops install all`, then rerun doctor.";
  }
  if (check.category === "integration") {
    return "If local setup looks healthy, rerun `personal-ops doctor --deep` to confirm live access.";
  }
  return null;
}

function formatDoctorCheck(check: DoctorCheck): string[] {
  const lines = [`[${formatSeverity(check.severity)}] ${check.title}`, `  ${check.message}`];
  const followUp = doctorFollowUp(check);
  if (followUp) {
    lines.push(`  next: ${followUp}`);
  }
  return lines;
}

function shortMachine(report: ServiceStatusReport): string {
  if (!report.machine.machine_label || !report.machine.machine_id) {
    return "not initialized";
  }
  return `${report.machine.machine_label} (${report.machine.machine_id.slice(0, 8)})`;
}

function lastRestoreSummary(report: ServiceStatusReport): string {
  const restore = report.machine.last_restore;
  if (!restore) {
    return "none recorded";
  }
  if (report.machine.state_origin === "unknown_legacy_restore") {
    return `${restore.restored_snapshot_id} from legacy snapshot provenance`;
  }
  return `${restore.restored_snapshot_id} from ${restore.source_machine_label ?? "unknown machine"}`;
}

export function formatAutopilotStatusReport(report: AutopilotStatusReport): string {
  const lines: string[] = [];
  lines.push(`Autopilot Status: ${formatStateLabel(report.readiness)}`);
  lines.push(line("Enabled", yesNo(report.enabled)));
  lines.push(line("Mode", report.mode));
  lines.push(line("Running", yesNo(report.running)));
  lines.push(line("Last run", report.last_run_at ?? "never"));
  lines.push(line("Last success", report.last_success_at ?? "never"));
  lines.push(line("Last failure", report.last_failure_at ?? "none"));
  lines.push(line("Last trigger", report.last_trigger ?? "none"));
  lines.push(line("Top item", topSummary(report.top_item_summary, "nothing urgent")));
  lines.push(line("First repair step", report.first_repair_step ?? "none"));
  lines.push("");
  pushSection(
    lines,
    "Profiles",
    report.profiles.map((profile) =>
      `- ${profile.profile}: ${profile.state} | prepared ${profile.prepared_at ?? "never"} | stale ${profile.stale_at ?? "unknown"} | ${topSummary(profile.summary, "no summary yet")}`,
    ),
  );
  return lines.join("\n");
}

export function formatStatusReport(report: ServiceStatusReport): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Status: ${formatStateLabel(report.state)}`);
  lines.push(line("Version", report.service_version));
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Workspace focus", workspaceHomeSummary(report)));
  const workspaceSurfaceProof = workspaceHomeSurfaceProof(report);
  if (workspaceSurfaceProof) {
    lines.push(line("Surface proof", workspaceSurfaceProof));
  }
  const handoffSummary = reviewApprovalFlowSummary(report);
  if (handoffSummary && handoffSummary !== workspaceSurfaceProof) {
    lines.push(line("Review/approval handoff", handoffSummary));
  }
  lines.push(line("Next attention", topSummary(report.worklist_summary.top_item_summary, "nothing urgent right now")));
  lines.push(line("First repair step", report.first_repair_step ?? "none"));
  lines.push(line("Send enabled", yesNo(report.send_policy.effective_enabled)));
  lines.push(line("Daemon reachable", yesNo(report.daemon_reachable)));
  lines.push(
    line("Checks", `${report.checks_summary.pass} pass / ${report.checks_summary.warn} warn / ${report.checks_summary.fail} fail`),
  );
  lines.push("");

  pushSection(
    lines,
    "Start Here",
    statusActionItems(report).map((item) => `- ${item}`),
  );

  pushSection(lines, "Repair Plan", formatRepairPlan(report.repair_plan));

  pushSection(lines, "Readiness", [
    line("Mailbox configured", report.mailbox.configured ?? "not set"),
    line("Mailbox connected", report.mailbox.connected ?? "not connected"),
    line("Matches config", yesNo(report.mailbox.matches_configuration)),
    line("OAuth client configured", yesNo(report.mailbox.oauth_client_configured)),
    line("Keychain token present", yesNo(report.mailbox.keychain_token_present)),
    line("LaunchAgent", `${report.launch_agent.label} (${report.launch_agent.loaded ? "loaded" : "not loaded"})`),
    line("Schema", report.schema.compatibility_message),
  ]);

  pushSection(lines, "Machine", [
    line("Current machine", shortMachine(report)),
    line("Hostname", report.machine.hostname ?? "not recorded"),
    line("State origin", formatStateLabel(report.machine.state_origin)),
    line("Last restore", lastRestoreSummary(report)),
    line(
      "Last snapshot source",
      report.machine.last_snapshot_source_machine
        ? `${report.machine.last_snapshot_source_machine.machine_label} (${report.machine.last_snapshot_source_machine.machine_id.slice(0, 8)})`
        : "not recorded",
    ),
  ]);

  pushSection(lines, "Attention", [
    line("Critical", String(report.worklist_summary.critical_count)),
    line("Warn", String(report.worklist_summary.warn_count)),
    line("Info", String(report.worklist_summary.info_count)),
    line("Top item", topSummary(report.worklist_summary.top_item_summary, "nothing urgent")),
  ]);

  if (report.review) {
    pushSection(lines, "Review Overlay", [
      line("Ready packages", String(report.review.ready_package_count)),
      line("Open tuning proposals", String(report.review.open_tuning_proposal_count)),
      line("Unused stale (7d)", String(report.review.unused_package_count_7d)),
      line("Open rate (14d)", asPercent(report.review.package_open_rate_14d)),
      line("Acted-on rate (14d)", asPercent(report.review.package_acted_on_rate_14d)),
      line("Stale-unused rate (14d)", asPercent(report.review.stale_unused_rate_14d)),
      line("WoW open delta", asPercent(report.review.week_over_week_open_rate_delta)),
      line("WoW action delta", asPercent(report.review.week_over_week_action_rate_delta)),
      line(
        "Notification action conversion (14d)",
        asPercent(report.review.notification_action_conversion_rate_14d),
      ),
      line(
        "WoW notification action delta",
        asPercent(report.review.week_over_week_notification_action_conversion_delta),
      ),
      line("Calibration status", report.review.calibration_status.replaceAll("_", " ")),
      line("Surfaces off track", String(report.review.surfaces_off_track_count)),
      line("Notification budget pressure", String(report.review.notification_budget_pressure_count)),
      line("Top calibration surface", report.review.top_calibration_surface ?? "none"),
      line("Refresh state", report.review.refresh_state),
      line("Refreshed", report.review.refreshed_at ?? "never"),
      line("Top trend surface", report.review.top_review_trend_surface ?? "none"),
      line("Top package", topSummary(report.review.top_review_summary, "nothing queued")),
    ]);
  }

  pushSection(lines, "Send Policy", [
    line("Permanent allow_send", yesNo(report.send_policy.permanent_enabled)),
    line("Timed window active", yesNo(report.send_policy.window_active)),
    line("Window expires", report.send_policy.window_expires_at ?? "not active"),
  ]);

  pushSection(lines, "Inbox", [
    line("Sync status", report.inbox.sync_status),
    line("Unread threads", String(report.inbox.unread_thread_count)),
    line("Follow-up threads", String(report.inbox.followup_thread_count)),
    line("Last synced", report.inbox.last_synced_at ?? "never"),
    line("Top inbox item", topSummary(report.inbox.top_item_summary, "nothing urgent")),
  ]);

  pushSection(lines, "Calendar", [
    line("Enabled", yesNo(report.calendar.enabled)),
    line("Sync status", report.calendar.sync_status),
    line("Conflicts next 24h", String(report.calendar.conflict_count_next_24h)),
    line("Next upcoming", topSummary(report.calendar.next_upcoming_event_summary, "nothing scheduled")),
    line("Top calendar item", topSummary(report.calendar.top_item_summary, "nothing urgent")),
    line("Top scheduling item", topSummary(report.calendar.top_scheduling_item_summary, "nothing urgent")),
  ]);

  pushSection(lines, "GitHub", [
    line("Enabled", yesNo(report.github.enabled)),
    line("Connected login", report.github.connected_login ?? "not connected"),
    line("Authenticated", yesNo(report.github.authenticated)),
    line("Sync status", report.github.sync_status),
    line("Included repositories", String(report.github.included_repository_count)),
    line("Review requests", String(report.github.review_requested_count)),
    line("Authored PR attention", String(report.github.authored_pr_attention_count)),
    line("Last synced", report.github.last_synced_at ?? "never"),
    line("Top GitHub item", topSummary(report.github.top_item_summary, "nothing notable")),
  ]);

  pushSection(lines, "Drive", [
    line("Enabled", yesNo(report.drive.enabled)),
    line("Authenticated", yesNo(report.drive.authenticated)),
    line("Sync status", report.drive.sync_status),
    line("Included folders", String(report.drive.included_folder_count)),
    line("Included files", String(report.drive.included_file_count)),
    line("Indexed files", String(report.drive.indexed_file_count)),
    line("Indexed docs", String(report.drive.indexed_doc_count)),
    line("Indexed sheets", String(report.drive.indexed_sheet_count)),
    line("Last synced", report.drive.last_synced_at ?? "never"),
    line("Top Drive item", topSummary(report.drive.top_item_summary, "nothing notable")),
  ]);

  pushSection(lines, "Autopilot", [
    line("Enabled", yesNo(report.autopilot.enabled)),
    line("Mode", report.autopilot.mode),
    line("Running", yesNo(report.autopilot.running)),
    line("Readiness", formatStateLabel(report.autopilot.readiness)),
    line("Last success", report.autopilot.last_success_at ?? "never"),
    line("Stale profiles", String(report.autopilot.stale_profile_count)),
    line("Top autopilot item", topSummary(report.autopilot.top_item_summary, "nothing notable")),
  ]);

  pushSection(lines, "Desktop", [
    line("Supported", yesNo(report.desktop.supported)),
    line("Installed", yesNo(report.desktop.installed)),
    line("Bundle exists", yesNo(report.desktop.bundle_exists)),
    line("App path", report.desktop.app_path),
    line("Toolchain ready", yesNo(report.desktop.toolchain.ready)),
    line("Toolchain summary", report.desktop.toolchain.summary),
    line("Session handoff", yesNo(report.desktop.daemon_session_handoff_ready)),
  ]);

  pushSection(lines, "Queues", [
    line("Review pending", String(report.review_queue.pending_count)),
    line("Approval pending", String(report.approval_queue.pending_count)),
    line("Approval send failed", String(report.approval_queue.send_failed_count)),
  ]);

  pushSection(lines, "Tasks", [
    line("Pending", String(report.tasks.pending_count)),
    line("In progress", String(report.tasks.in_progress_count)),
    line("Top task item", topSummary(report.tasks.top_item_summary, "nothing urgent")),
    line("Top suggestion item", topSummary(report.task_suggestions.top_item_summary, "nothing urgent")),
  ]);

  pushSection(lines, "Planning", [
    line("Pending", String(report.planning_recommendations.pending_count)),
    line("Manual scheduling", String(report.planning_recommendations.manual_scheduling_count)),
    line("Review needed count", String(report.planning_recommendations.review_needed_count)),
    line("Top planning group", topSummary(report.planning_recommendations.top_group_summary, "nothing grouped")),
    line("Top planning item", topSummary(report.planning_recommendations.top_item_summary, "nothing urgent")),
    line("Top next action", topSummary(report.planning_recommendations.top_next_action_summary, "nothing urgent")),
    line("Blocked planning group", topSummary(report.planning_recommendations.blocked_group_summary, "nothing blocked")),
    line("Top backlog summary", topSummary(report.planning_recommendations.top_backlog_summary, "nothing backlogged")),
    line("Top closure summary", topSummary(report.planning_recommendations.top_closure_summary, "nothing recently closed")),
    line(
      "Policy attention",
      report.planning_recommendations.top_policy_attention_summary ??
        (report.planning_recommendations.policy_attention_kind === "none"
          ? "no policy attention needed"
          : humanizeKind(report.planning_recommendations.policy_attention_kind)),
    ),
    line(
      "Top suppression candidate",
      topSummary(report.planning_recommendations.top_suppression_candidate_summary, "no advisory candidate"),
    ),
    line("Top hygiene summary", topSummary(report.planning_recommendations.top_hygiene_summary, "nothing notable")),
  ]);

  lines.push("Latest Snapshot");
  if (report.snapshot_latest) {
    lines.push(line("Snapshot ID", report.snapshot_latest.snapshot_id));
    lines.push(line("Created", report.snapshot_latest.created_at));
    lines.push(line("State", formatStateLabel(report.snapshot_latest.daemon_state)));
    lines.push(line("Path", report.snapshot_latest.path));
  } else {
    lines.push("No snapshots found.");
  }

  return lines.join("\n");
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Doctor: ${formatStateLabel(report.state)}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Mode", report.deep ? "deep" : "local"));
  lines.push(line("First repair step", report.first_repair_step ?? "none"));
  lines.push(line("Summary", `${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail`));
  lines.push("");

  pushSection(lines, "Repair Plan", formatRepairPlan(report.repair_plan));

  const failures = report.checks.filter((check) => check.severity === "fail");
  const warnings = report.checks.filter((check) => check.severity === "warn");

  if (failures.length === 0 && warnings.length === 0) {
    lines.push("What Needs Attention");
    lines.push("- No warnings or failures.");
    if (!report.deep) {
      lines.push("- Run `personal-ops doctor --deep` when you want a live Gmail verification pass too.");
    }
    return lines.join("\n");
  }

  pushSection(
    lines,
    "What Needs Attention",
    [
      ...(failures.length > 0 ? [`- ${failures.length} failing check${failures.length === 1 ? "" : "s"} need attention first.`] : []),
      ...(warnings.length > 0 ? [`- ${warnings.length} warning${warnings.length === 1 ? "" : "s"} can still block smooth daily use.`] : []),
    ],
  );

  if (failures.length > 0) {
    pushSection(
      lines,
      "Failures",
      failures.flatMap((check) => formatDoctorCheck(check)),
    );
  }

  if (warnings.length > 0) {
    pushSection(
      lines,
      "Warnings",
      warnings.flatMap((check) => formatDoctorCheck(check)),
    );
  }

  if (!report.deep) {
    lines.push("Next Step");
    lines.push("Run `personal-ops doctor --deep` after the local warnings and failures are cleared.");
  } else {
    lines.pop();
  }

  return lines.join("\n");
}

export function formatSendWindowStatus(status: SendWindowStatus): string {
  const lines: string[] = [];
  lines.push("Send Window");
  lines.push(line("Permanent allow_send", yesNo(status.permanent_send_enabled)));
  lines.push(line("Effective send enabled", yesNo(status.effective_send_enabled)));
  if (!status.active_window) {
    lines.push(line("Timed window active", "no"));
    return lines.join("\n");
  }
  lines.push(line("Timed window active", "yes"));
  lines.push(line("Window ID", status.active_window.window_id));
  lines.push(line("State", status.active_window.state));
  lines.push(line("Enabled", status.active_window.enabled_at));
  lines.push(line("Expires", status.active_window.expires_at));
  lines.push(line("Reason", status.active_window.reason));
  return lines.join("\n");
}

export function formatWorklistReport(report: WorklistReport): string {
  const lines: string[] = [];
  const followThroughRows = maintenanceFollowThroughRows(report.maintenance_follow_through);
  const confidenceRows = maintenanceConfidenceRows(report.maintenance_confidence);
  const operatingBlockRows = maintenanceOperatingBlockRows(report.maintenance_operating_block);
  const decisionRows = maintenanceDecisionExplanationRows(report.maintenance_decision_explanation);
  const convergenceRows = maintenanceRepairConvergenceRows(report.maintenance_repair_convergence);
  const commitmentRows = maintenanceCommitmentRows(report.maintenance_commitment);
  const deferMemoryRows = maintenanceDeferMemoryRows(report.maintenance_defer_memory);
  if (confidenceRows.length > 0) {
    if (deferMemoryRows.length > 0) {
      deferMemoryRows.push(...confidenceRows);
    } else if (commitmentRows.length > 0) {
      commitmentRows.push(...confidenceRows);
    } else if (followThroughRows.length > 0) {
      followThroughRows.push(...confidenceRows);
    } else {
      commitmentRows.push(...confidenceRows);
    }
  }
  if (decisionRows.length > 0) {
    if (operatingBlockRows.length > 0) {
      operatingBlockRows.push(...decisionRows);
    } else if (deferMemoryRows.length > 0) {
      deferMemoryRows.push(...decisionRows);
    } else if (commitmentRows.length > 0) {
      commitmentRows.push(...decisionRows);
    } else if (followThroughRows.length > 0) {
      followThroughRows.push(...decisionRows);
    } else {
      operatingBlockRows.push(...decisionRows);
    }
  }
  if (convergenceRows.length > 0) {
    if (operatingBlockRows.length > 0) {
      operatingBlockRows.push(...convergenceRows);
    } else if (deferMemoryRows.length > 0) {
      deferMemoryRows.push(...convergenceRows);
    } else if (commitmentRows.length > 0) {
      commitmentRows.push(...convergenceRows);
    } else if (followThroughRows.length > 0) {
      followThroughRows.push(...convergenceRows);
    } else {
      operatingBlockRows.push(...convergenceRows);
    }
  }
  const schedulingRows = maintenanceSchedulingRows(report.maintenance_scheduling);
  const maintenanceStartCommand =
    report.maintenance_repair_convergence?.eligible && report.maintenance_repair_convergence.state === "repair_owned"
      ? report.maintenance_repair_convergence.primary_command ?? "personal-ops repair plan"
      : "personal-ops maintenance session";
  const maintenanceRows =
    report.maintenance_window.eligible_now && report.maintenance_window.bundle
      ? [
          `- ${report.maintenance_window.bundle.summary}`,
          `- Start with \`${maintenanceStartCommand}\`.`,
          ...report.maintenance_window.bundle.recommendations.map(
            (recommendation) => `- ${recommendation.title}: inside session use ${recommendation.suggested_command}`,
          ),
        ]
      : [];
  const hasMaintenanceContext =
    followThroughRows.length > 0 ||
    commitmentRows.length > 0 ||
    deferMemoryRows.length > 0 ||
    operatingBlockRows.length > 0 ||
    schedulingRows.length > 0 ||
    maintenanceRows.length > 0;
  lines.push(`Worklist: ${formatStateLabel(report.state)}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(
    line(
      "Summary",
      `${report.counts_by_severity.critical} critical / ${report.counts_by_severity.warn} warn / ${report.counts_by_severity.info} info`,
    ),
  );
  lines.push(
    line(
      "Send window",
      report.send_window.active && report.send_window.window
        ? `active until ${report.send_window.window.expires_at}`
        : "inactive",
    ),
  );
  lines.push("");

  if (report.items.length === 0) {
    lines.push("Start Here");
    lines.push(`- ${hasMaintenanceContext ? "Nothing urgent needs attention right now." : "Nothing needs attention right now."}`);
    if (hasMaintenanceContext) {
      if (maintenanceRows.length > 0) {
        lines.push("- A calm-window maintenance bundle is available below.");
      } else {
        lines.push("- Maintenance guidance is available below.");
      }
      lines.push("");
      if (followThroughRows.length > 0) {
        pushSection(lines, "Maintenance Follow-Through", followThroughRows);
      }
      if (commitmentRows.length > 0) {
        pushSection(lines, "Maintenance Commitment", commitmentRows);
      }
      if (deferMemoryRows.length > 0) {
        pushSection(lines, "Defer Memory", deferMemoryRows);
      }
      if (operatingBlockRows.length > 0) {
        pushSection(lines, "Maintenance Operating Block", operatingBlockRows);
      }
      if (schedulingRows.length > 0) {
        pushSection(lines, "Maintenance Scheduling", schedulingRows);
      }
      if (maintenanceRows.length > 0) {
        pushSection(lines, "Preventive Maintenance", maintenanceRows);
      }
    }
    return lines.join("\n");
  }

  lines.push("Start Here");
  lines.push(`- Top item: ${report.items[0]?.summary ?? report.items[0]?.title ?? "nothing urgent"}`);
  lines.push("- Use the suggested command below to take the next step.");
  lines.push("");

  if (report.planning_groups.length > 0) {
    pushSection(
      lines,
      "Planning Groups",
      report.planning_groups.map(
        (group) => `- ${group.group_summary} (${group.pending_count} pending, top score ${group.top_rank_score})`,
      ),
    );
  }

  if (followThroughRows.length > 0) {
    pushSection(lines, "Maintenance Follow-Through", followThroughRows);
  }

  if (commitmentRows.length > 0) {
    pushSection(lines, "Maintenance Commitment", commitmentRows);
  }

  if (deferMemoryRows.length > 0) {
    pushSection(lines, "Defer Memory", deferMemoryRows);
  }

  if (operatingBlockRows.length > 0) {
    pushSection(lines, "Maintenance Operating Block", operatingBlockRows);
  }

  if (schedulingRows.length > 0) {
    pushSection(lines, "Maintenance Scheduling", schedulingRows);
  }

  if (maintenanceRows.length > 0) {
    pushSection(lines, "Preventive Maintenance", maintenanceRows);
  }

  lines.push("Items");
  for (const [index, item] of report.items.entries()) {
    lines.push(`${index + 1}. [${item.severity.toUpperCase()}] ${item.title}`);
    lines.push(`   ${item.summary}`);
    lines.push(`   next: ${item.suggested_command}`);
  }

  return lines.join("\n");
}

function formatHealthStateLabel(state: HealthCheckReport["state"]): string {
  if (state === "attention_needed") {
    return "ATTENTION NEEDED";
  }
  return formatStateLabel(state);
}

export function formatHealthCheckReport(report: HealthCheckReport): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Health Check: ${formatHealthStateLabel(report.state)}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Mode", report.deep ? "deep" : "local"));
  lines.push(line("Install check", formatStateLabel(report.install_check_state)));
  lines.push(line("Daemon reachable", yesNo(report.daemon_reachable)));
  lines.push(line("Doctor state", report.doctor_state ? formatStateLabel(report.doctor_state) : "not run"));
  lines.push(line("Latest snapshot", report.latest_snapshot_id ?? "none"));
  lines.push(
    line(
      "Snapshot age",
      report.latest_snapshot_age_hours == null ? "unknown" : `${report.latest_snapshot_age_hours.toFixed(1)}h`,
    ),
  );
  lines.push(
    line(
      "Snapshot threshold",
      report.snapshot_age_limit_hours == null ? "disabled" : `${report.snapshot_age_limit_hours}h`,
    ),
  );
  lines.push(line("Prune candidates", String(report.prune_candidate_count)));
  lines.push(line("Last recovery rehearsal", report.last_recovery_rehearsal_at ?? "none recorded"));
  lines.push(
    line(
      "Rehearsal age",
      report.recovery_rehearsal_age_hours == null ? "unknown" : `${report.recovery_rehearsal_age_hours.toFixed(1)}h`,
    ),
  );
  lines.push(line("Summary", `${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail`));
  lines.push("");

  pushSection(lines, "Repair Plan", formatRepairPlan(report.repair_plan));

  lines.push("Start Here");
  if (report.state === "ready") {
    lines.push("- Everything looks healthy right now.");
  } else if (report.state === "attention_needed") {
    lines.push("- This recurring check found warnings worth reviewing soon.");
  } else {
    lines.push("- This recurring check found at least one failure that should be repaired before trusting the runtime.");
  }
  if (report.next_repair_step) {
    lines.push(`- First repair step: \`${report.next_repair_step}\`.`);
  }
  if (report.summary.warn > 0 || report.summary.fail > 0) {
    lines.push("- Run `personal-ops install check` and `personal-ops doctor` for the fuller local picture.");
  }
  if (report.deep && !report.daemon_reachable) {
    lines.push("- Deep live verification was limited because the daemon was not reachable.");
  }
  if (report.latest_snapshot_id == null) {
    lines.push("- Create a fresh recovery point with `personal-ops backup create`.");
  } else if (
    report.snapshot_age_limit_hours != null &&
    report.latest_snapshot_age_hours != null &&
    report.latest_snapshot_age_hours > report.snapshot_age_limit_hours
  ) {
    lines.push("- Create a fresh recovery snapshot with `personal-ops backup create`.");
  }
  if (report.prune_candidate_count > 0) {
    lines.push("- Apply retention with `personal-ops backup prune --dry-run`, then `personal-ops backup prune --yes`.");
  }
  if (
    report.last_recovery_rehearsal_at == null ||
    (report.recovery_rehearsal_age_hours != null && report.recovery_rehearsal_age_hours > 14 * 24)
  ) {
    lines.push("- Refresh recovery confidence with `cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery`.");
  }
  lines.push("");

  lines.push("Checks");
  for (const check of report.checks) {
    lines.push(...formatDoctorCheck(check));
  }

  return lines.join("\n");
}

export function formatRepairExecutionResult(result: RepairExecutionResult): string {
  const lines: string[] = [];
  lines.push(`Repair Step: ${result.step_id}`);
  lines.push(line("Generated", result.generated_at));
  lines.push(line("Executed", yesNo(result.executed)));
  lines.push(line("Manual only", yesNo(result.manual_only)));
  lines.push(line("Command", result.suggested_command));
  if (result.outcome) {
    lines.push(line("Outcome", result.outcome));
  }
  if (result.resolved_target_step !== undefined) {
    lines.push(line("Resolved target", yesNo(result.resolved_target_step)));
  }
  if (result.next_repair_step) {
    lines.push(line("Next repair step", result.next_repair_step));
  }
  lines.push("");
  lines.push(result.message);
  if (result.remaining_reason) {
    lines.push("");
    lines.push(`Remaining reason: ${result.remaining_reason}`);
  }
  if (result.outcome === "resolved" && result.preventive_follow_up) {
    lines.push("");
    lines.push(`Preventive follow-up: ${result.preventive_follow_up}`);
  }
  return lines.join("\n");
}

export function formatMaintenanceSessionPlan(session: MaintenanceSessionPlan): string {
  const lines: string[] = [];
  const followThroughRows = maintenanceFollowThroughRows({
    generated_at: session.maintenance_follow_through.generated_at,
    last_maintenance_outcome: session.maintenance_follow_through.last_maintenance_outcome,
    last_maintenance_step_id: session.maintenance_follow_through.last_maintenance_step_id,
    top_signal: session.maintenance_follow_through.top_signal,
    current_bundle_outcome: session.maintenance_follow_through.current_bundle_outcome,
    maintenance_pressure_count: session.maintenance_follow_through.maintenance_pressure_count,
    top_maintenance_pressure_step_id: session.maintenance_follow_through.top_maintenance_pressure_step_id,
    pressure: session.maintenance_follow_through.pressure,
    escalation: session.maintenance_follow_through.escalation,
    summary: session.maintenance_follow_through.summary,
    commitment: session.maintenance_follow_through.commitment,
    defer_memory: session.maintenance_follow_through.defer_memory,
    confidence: session.maintenance_follow_through.confidence,
    convergence: session.maintenance_follow_through.convergence,
  });
  const confidenceRows = maintenanceConfidenceRows(session.maintenance_confidence);
  const operatingBlockRows = maintenanceOperatingBlockRows(session.maintenance_operating_block);
  const decisionRows = maintenanceDecisionExplanationRows(session.maintenance_decision_explanation);
  const convergenceRows = maintenanceRepairConvergenceRows(session.maintenance_repair_convergence);
  const commitmentRows = maintenanceCommitmentRows(session.maintenance_commitment);
  const deferMemoryRows = maintenanceDeferMemoryRows(session.maintenance_defer_memory);
  if (confidenceRows.length > 0) {
    if (deferMemoryRows.length > 0) {
      deferMemoryRows.push(...confidenceRows);
    } else if (commitmentRows.length > 0) {
      commitmentRows.push(...confidenceRows);
    } else if (followThroughRows.length > 0) {
      followThroughRows.push(...confidenceRows);
    } else {
      commitmentRows.push(...confidenceRows);
    }
  }
  if (decisionRows.length > 0) {
    if (operatingBlockRows.length > 0) {
      operatingBlockRows.push(...decisionRows);
    } else if (deferMemoryRows.length > 0) {
      deferMemoryRows.push(...decisionRows);
    } else if (commitmentRows.length > 0) {
      commitmentRows.push(...decisionRows);
    } else if (followThroughRows.length > 0) {
      followThroughRows.push(...decisionRows);
    } else {
      operatingBlockRows.push(...decisionRows);
    }
  }
  if (convergenceRows.length > 0) {
    if (operatingBlockRows.length > 0) {
      operatingBlockRows.push(...convergenceRows);
    } else if (deferMemoryRows.length > 0) {
      deferMemoryRows.push(...convergenceRows);
    } else if (commitmentRows.length > 0) {
      commitmentRows.push(...convergenceRows);
    } else if (followThroughRows.length > 0) {
      followThroughRows.push(...convergenceRows);
    } else {
      operatingBlockRows.push(...convergenceRows);
    }
  }
  const schedulingRows = maintenanceSchedulingRows(session.maintenance_scheduling);
  const maintenanceSessionCommand =
    session.maintenance_repair_convergence?.eligible && session.maintenance_repair_convergence.state === "repair_owned"
      ? session.maintenance_repair_convergence.primary_command ?? "personal-ops repair plan"
      : session.start_command;
  lines.push("Maintenance Session");
  lines.push(line("Generated", session.generated_at));
  lines.push(line("Eligible now", yesNo(session.eligible_now)));
  lines.push(line("Start command", maintenanceSessionCommand));
  lines.push(line("Deferred reason", session.deferred_reason ?? "none"));
  lines.push(line("First step", session.first_step_id ?? "none"));
  lines.push("");
  if (!session.eligible_now || session.steps.length === 0) {
    if (followThroughRows.length > 0) {
      pushSection(lines, "Follow-Through", followThroughRows);
    }
    if (commitmentRows.length > 0) {
      pushSection(lines, "Commitment", commitmentRows);
    }
    if (deferMemoryRows.length > 0) {
      pushSection(lines, "Defer Memory", deferMemoryRows);
    }
    if (operatingBlockRows.length > 0) {
      pushSection(lines, "Operating Block", operatingBlockRows);
    }
    if (schedulingRows.length > 0) {
      pushSection(lines, "Scheduling", schedulingRows);
    }
    lines.push(
      session.deferred_reason
        ? `Maintenance is deferred right now: ${session.deferred_reason}.`
        : "No calm-window maintenance session is available right now.",
    );
    return lines.join("\n");
  }
  if (session.summary) {
    lines.push(session.summary);
    lines.push("");
  }
  if (followThroughRows.length > 0) {
    pushSection(lines, "Follow-Through", followThroughRows);
  }
  if (commitmentRows.length > 0) {
    pushSection(lines, "Commitment", commitmentRows);
  }
  if (deferMemoryRows.length > 0) {
    pushSection(lines, "Defer Memory", deferMemoryRows);
  }
  if (operatingBlockRows.length > 0) {
    pushSection(lines, "Operating Block", operatingBlockRows);
  }
  if (schedulingRows.length > 0) {
    pushSection(lines, "Scheduling", schedulingRows);
  }
  lines.push("Steps");
  for (const [index, step] of session.steps.entries()) {
    lines.push(
      `${index + 1}. ${step.title}: ${step.reason}${step.latest_outcome ? ` Last outcome: ${step.latest_outcome}${step.latest_completed_at ? ` at ${step.latest_completed_at}` : ""}.` : ""}`,
    );
    lines.push(`   inside session: ${step.suggested_command}`);
  }
  return lines.join("\n");
}

export function formatMaintenanceSessionRunResult(result: MaintenanceSessionRunResult): string {
  const lines: string[] = [];
  lines.push("Maintenance Run");
  lines.push(line("Generated", result.generated_at));
  lines.push(line("Executed", yesNo(result.executed)));
  lines.push(line("Command", result.suggested_command));
  if (result.step_id) {
    lines.push(line("Step", result.step_id));
  }
  if (result.outcome) {
    lines.push(line("Outcome", result.outcome));
  }
  if (result.deferred_reason) {
    lines.push(line("Deferred reason", result.deferred_reason));
  }
  if (result.session_complete !== undefined) {
    lines.push(line("Session complete", yesNo(result.session_complete)));
  }
  if (result.handed_off_to_repair !== undefined) {
    lines.push(line("Handed off to repair", yesNo(result.handed_off_to_repair)));
  }
  if (result.next_step_id) {
    lines.push(line("Next maintenance step", result.next_step_id));
  }
  if (result.next_repair_step) {
    lines.push(line("Next repair step", result.next_repair_step));
  }
  lines.push("");
  lines.push(result.message);
  if (result.remaining_reason) {
    lines.push("");
    lines.push(`Remaining reason: ${result.remaining_reason}`);
  }
  if (result.next_command) {
    lines.push("");
    lines.push(`Next command: ${result.next_command}`);
  }
  if (result.maintenance_follow_through?.summary) {
    lines.push("");
    lines.push(`Follow-through: ${result.maintenance_follow_through.summary}`);
  }
  return lines.join("\n");
}

export function formatVersionReport(report: VersionReport): string {
  return [
    `personal-ops ${report.service_version}`,
    line("Release tag", report.release_tag),
    line("Distribution", report.distribution_model === "source_checkout_plus_bootstrap" ? "source checkout + ./bootstrap" : report.distribution_model),
    line("Release gate", report.release_check_command),
    line("Upgrade path", report.upgrade_hint),
  ].join("\n");
}

export function formatNowReport(status: ServiceStatusReport, worklist: WorklistReport): string {
  const lines: string[] = [];
  const maintenanceScheduling = worklist.maintenance_scheduling;
  const maintenanceConfidence = worklist.maintenance_confidence;
  const maintenanceOperatingBlock = worklist.maintenance_operating_block;
  const maintenanceDecisionExplanation = worklist.maintenance_decision_explanation;
  const maintenanceRepairConvergence = worklist.maintenance_repair_convergence;
  const followThroughRows = maintenanceFollowThroughRows(worklist.maintenance_follow_through);
  lines.push(`Personal Ops Now: ${formatStateLabel(status.state)}`);
  lines.push(line("Next attention", topSummary(worklist.items[0]?.summary, "nothing urgent right now")));
  lines.push(
    line(
      "Summary",
      `${worklist.counts_by_severity.critical} critical / ${worklist.counts_by_severity.warn} warn / ${worklist.counts_by_severity.info} info`,
    ),
  );
  lines.push(line("Send enabled", yesNo(status.send_policy.effective_enabled)));
  lines.push(line("Mailbox", status.mailbox.connected ?? status.mailbox.configured ?? "not configured"));
  lines.push(line("LaunchAgent", status.launch_agent.loaded ? "loaded" : "not loaded"));
  lines.push("");

  if (worklist.items.length === 0) {
    lines.push("Nothing urgent is waiting right now.");
    if (followThroughRows.length > 0) {
      lines.push("");
      lines.push("Maintenance Follow-Through");
      lines.push(...followThroughRows);
    }
    if (maintenanceOperatingBlock?.eligible && maintenanceOperatingBlock.block === "current_block") {
      lines.push("");
      lines.push("Maintenance Now");
      if (maintenanceConfidence?.eligible && maintenanceConfidence.step_id === maintenanceScheduling.step_id) {
        lines.push(`- ${maintenanceConfidence.summary}`);
      }
      lines.push(`- ${maintenanceOperatingBlock.summary}`);
      if (maintenanceDecisionExplanation?.eligible && maintenanceDecisionExplanation.state === "do_now") {
        lines.push(`- ${maintenanceDecisionExplanation.summary}`);
        if (maintenanceDecisionExplanation.why_now) {
          lines.push(`- ${maintenanceDecisionExplanation.why_now}`);
        }
      }
      if (maintenanceRepairConvergence?.eligible && maintenanceRepairConvergence.state === "repair_owned") {
        lines.push(`- ${maintenanceRepairConvergence.summary}`);
        lines.push(`- Start with \`${maintenanceRepairConvergence.primary_command ?? "personal-ops repair plan"}\`.`);
      } else {
        lines.push("- Start with `personal-ops maintenance session`.");
      }
      if (maintenanceOperatingBlock.reason) {
        lines.push(`- ${maintenanceOperatingBlock.reason}`);
      }
      lines.push("");
    }
    lines.push("Run `personal-ops status` for a full health summary.");
    return lines.join("\n");
  }

  lines.push("Next Steps");
  for (const item of worklist.items.slice(0, 3)) {
    lines.push(`- ${item.title}`);
    lines.push(`  ${item.suggested_command}`);
  }
  if (maintenanceOperatingBlock?.eligible && maintenanceOperatingBlock.block === "current_block") {
    lines.push("");
    lines.push("Maintenance Now");
    if (maintenanceConfidence?.eligible && maintenanceConfidence.step_id === maintenanceScheduling.step_id) {
      lines.push(`- ${maintenanceConfidence.summary}`);
    }
    lines.push(`- ${maintenanceOperatingBlock.summary}`);
    if (maintenanceDecisionExplanation?.eligible && maintenanceDecisionExplanation.state === "do_now") {
      lines.push(`- ${maintenanceDecisionExplanation.summary}`);
      if (maintenanceDecisionExplanation.why_now) {
        lines.push(`- ${maintenanceDecisionExplanation.why_now}`);
      }
    }
    if (maintenanceRepairConvergence?.eligible && maintenanceRepairConvergence.state === "repair_owned") {
      lines.push(`- ${maintenanceRepairConvergence.summary}`);
      lines.push(`- Start with \`${maintenanceRepairConvergence.primary_command ?? "personal-ops repair plan"}\`.`);
    } else {
      lines.push("- Start with `personal-ops maintenance session`.");
    }
    if (maintenanceOperatingBlock.reason) {
      lines.push(`- ${maintenanceOperatingBlock.reason}`);
    }
  }
  if (followThroughRows.length > 0) {
    lines.push("");
    lines.push("Maintenance Follow-Through");
    lines.push(...followThroughRows);
  }
  lines.push("");
  lines.push("Use `personal-ops worklist` for the full queue.");

  return lines.join("\n");
}
