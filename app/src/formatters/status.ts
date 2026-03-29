import type { DoctorCheck, DoctorReport, HealthCheckReport, ServiceStatusReport, WorklistReport } from "../types.js";
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

function pushSection(lines: string[], title: string, rows: string[]) {
  lines.push(title);
  lines.push(...rows);
  lines.push("");
}

function statusActionItems(report: ServiceStatusReport): string[] {
  const actions: string[] = [];

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
    actions.push(`Top attention item: ${report.worklist_summary.top_item_summary}`);
    actions.push("Run `personal-ops worklist` for the full queue or `personal-ops now` for the shortest summary.");
  }

  if (actions.length === 0) {
    actions.push("Everything looks healthy right now. Use `personal-ops now` for a quick check-in or `personal-ops worklist` for the full queue.");
  }

  return actions;
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
  if (check.id.includes("wrapper") || check.id.includes("dist_")) {
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

export function formatStatusReport(report: ServiceStatusReport): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Status: ${formatStateLabel(report.state)}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Next attention", topSummary(report.worklist_summary.top_item_summary, "nothing urgent right now")));
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
  lines.push(line("Summary", `${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail`));
  lines.push("");

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
    lines.push("- Nothing needs attention right now.");
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

export function formatNowReport(status: ServiceStatusReport, worklist: WorklistReport): string {
  const lines: string[] = [];
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
    lines.push("Run `personal-ops status` for a full health summary.");
    return lines.join("\n");
  }

  lines.push("Next Steps");
  for (const item of worklist.items.slice(0, 3)) {
    lines.push(`- ${item.title}`);
    lines.push(`  ${item.suggested_command}`);
  }
  lines.push("");
  lines.push("Use `personal-ops worklist` for the full queue.");

  return lines.join("\n");
}
