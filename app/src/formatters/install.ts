import type {
  DesktopStatusReport,
  InstallCheckReport,
  InstallManifest,
  InstallPermissionsFixResult,
  RestoreResult,
  SnapshotInspection,
  SnapshotManifest,
  SnapshotPruneResult,
  SnapshotSummary,
} from "../types.js";
import { formatSeverity, formatStateLabel, line, yesNo } from "./shared.js";

export function formatSnapshotManifest(manifest: SnapshotManifest): string {
  return [
    `Snapshot created: ${manifest.snapshot_id}`,
    line("Created", manifest.created_at),
    line("Schema version", String(manifest.schema_version ?? "unknown")),
    line("Backup intent", manifest.backup_intent ?? "legacy"),
    line("Source machine", manifest.source_machine ? `${manifest.source_machine.machine_label} (${manifest.source_machine.machine_id.slice(0, 8)})` : "legacy snapshot"),
    line("Mailbox", manifest.mailbox ?? "not connected"),
    line("State", manifest.daemon_state),
    line("Database", manifest.db_backup_path),
  ].join("\n");
}

export function formatSnapshotList(snapshots: SnapshotSummary[]): string {
  if (snapshots.length === 0) return "No snapshots found.";
  return snapshots
    .map((snapshot) => `${snapshot.snapshot_id} | ${snapshot.created_at} | ${snapshot.daemon_state} | ${snapshot.path}`)
    .join("\n");
}

export function formatSnapshotInspection(inspection: SnapshotInspection): string {
  const lines: string[] = [];
  lines.push(`Snapshot: ${inspection.manifest.snapshot_id}`);
  lines.push(line("Created", inspection.manifest.created_at));
  lines.push(line("Version", inspection.manifest.service_version));
  lines.push(line("Schema version", String(inspection.manifest.schema_version ?? "unknown")));
  lines.push(line("Backup intent", inspection.manifest.backup_intent ?? "legacy"));
  lines.push(
    line(
      "Source machine",
      inspection.manifest.source_machine
        ? `${inspection.manifest.source_machine.machine_label} (${inspection.manifest.source_machine.machine_id.slice(0, 8)}) on ${inspection.manifest.source_machine.hostname}`
        : "legacy snapshot",
    ),
  );
  lines.push(line("Mailbox", inspection.manifest.mailbox ?? "not connected"));
  lines.push(line("State", inspection.manifest.daemon_state));
  lines.push("");
  lines.push("Files");
  for (const file of inspection.files) {
    lines.push(`${yesNo(file.exists)} | ${file.size_bytes} bytes | ${file.path}`);
  }
  lines.push("");
  lines.push("Warnings");
  if (inspection.warnings.length === 0) {
    lines.push("None.");
  } else {
    for (const warning of inspection.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join("\n");
}

export function formatSnapshotPruneResult(result: SnapshotPruneResult): string {
  const lines: string[] = [];
  lines.push(result.dry_run ? "Snapshot prune: DRY RUN" : "Snapshot prune: COMPLETE");
  lines.push(line("Generated", result.generated_at));
  lines.push(line("Policy", result.policy_summary));
  lines.push(line("Scanned", String(result.total_snapshots)));
  lines.push(line("Kept", String(result.snapshots_kept)));
  lines.push(line("Candidates", String(result.prune_candidates)));
  lines.push(line("Deleted", String(result.snapshots_deleted)));
  lines.push(line("Newest snapshot", result.newest_snapshot_id ?? "none"));
  if (result.prune_candidate_items.length === 0) {
    lines.push("");
    lines.push("No snapshots are waiting to be pruned.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("Prune candidates");
  for (const item of result.prune_candidate_items) {
    lines.push(`- ${item.snapshot_id} | ${item.created_at} | ${item.reason}`);
  }
  return lines.join("\n");
}

export function formatInstallManifest(manifest: InstallManifest): string {
  const desktopBuild = manifest.desktop?.build_provenance;
  const desktopToolchain = manifest.desktop?.toolchain;
  return [
    "Install updated",
    line("Generated", manifest.generated_at),
    line("Machine", `${manifest.machine_label} (${manifest.machine_id.slice(0, 8)})`),
    line("Node", manifest.node_executable),
    line("CLI wrapper", manifest.wrapper_paths.cli),
    line("Daemon wrapper", manifest.wrapper_paths.daemon),
    line("Codex MCP wrapper", manifest.wrapper_paths.codex_mcp),
    line("Claude MCP wrapper", manifest.wrapper_paths.claude_mcp),
    line("Wrapper generated", manifest.wrapper_provenance?.generated_at ?? "not recorded"),
    line("Wrapper source", manifest.wrapper_provenance?.source_commit ? manifest.wrapper_provenance.source_commit.slice(0, 8) : "not recorded"),
    line("Wrapper Node", manifest.wrapper_provenance?.node_executable ?? manifest.node_executable),
    line("LaunchAgent", manifest.launch_agent_plist_path),
    ...(manifest.desktop
      ? [
          line("Desktop app", manifest.desktop.app_path),
          line("Desktop support", manifest.desktop.support_contract ?? "not recorded"),
          line("Desktop installed", yesNo(manifest.desktop.installed)),
          line("Desktop reinstall", manifest.desktop.reinstall_recommended ? "recommended" : "not needed"),
          line("Desktop reason", manifest.desktop.reinstall_reason ?? "current or not installed"),
          line("Launcher repair", manifest.desktop.launcher_repair_recommended ? "recommended" : "not needed"),
          line("Launcher reason", manifest.desktop.launcher_repair_reason ?? "current"),
          line("Desktop built", desktopBuild?.built_at ?? "not recorded"),
          line(
            "Desktop source",
            desktopBuild?.source_commit ? desktopBuild.source_commit.slice(0, 8) : "not recorded",
          ),
          line("Desktop Vite", desktopBuild?.vite_version ?? "unknown"),
          line(
            "Desktop Tauri",
            [desktopBuild?.tauri_cli_version, desktopBuild?.tauri_runtime_version]
              .filter(Boolean)
              .join(" / ") || "unknown",
          ),
          line("Desktop toolchain", desktopToolchain?.summary ?? "not recorded"),
          line("Desktop dependencies", desktopToolchain?.dependency_posture?.summary ?? "not recorded"),
          line("Desktop handoff", yesNo(manifest.desktop.daemon_session_handoff_ready)),
        ]
      : []),
    "",
    "Next step: run `personal-ops install check` to confirm the local setup is healthy.",
  ].join("\n");
}

export function formatDesktopStatus(report: DesktopStatusReport): string {
  const build = report.build_provenance;
  const toolchain = report.toolchain;
  return [
    "Desktop Status",
    line("Support contract", report.support_contract ?? "not recorded"),
    line("Supported", yesNo(report.supported)),
    line("Unsupported reason", toolchain?.unsupported_reason ?? "supported"),
    line("Installed", yesNo(report.installed)),
    line("Bundle exists", yesNo(report.bundle_exists)),
    line("Launcher repair recommended", yesNo(report.launcher_repair_recommended)),
    line("Launcher repair reason", report.launcher_repair_reason ?? "not needed"),
    line("Reinstall recommended", yesNo(report.reinstall_recommended)),
    line("Reinstall reason", report.reinstall_reason ?? "not needed"),
    line("App path", report.app_path),
    line("Build bundle", report.build_bundle_path),
    line("Project", report.project_path),
    line("Built at", build?.built_at ?? "not recorded"),
    line("Source commit", build?.source_commit ? build.source_commit.slice(0, 8) : "not recorded"),
    line("Vite", build?.vite_version ?? "unknown"),
    line(
      "Tauri",
      [build?.tauri_cli_version, build?.tauri_runtime_version].filter(Boolean).join(" / ") || "unknown",
    ),
    line("Toolchain ready", yesNo(toolchain?.ready ?? false)),
    line("Toolchain summary", toolchain?.summary ?? "not recorded"),
    line("Dependency posture", toolchain?.dependency_posture?.summary ?? "not recorded"),
    line("Session handoff", yesNo(report.daemon_session_handoff_ready)),
    line("Launch URL", report.launch_url ?? "not available"),
    line("First repair step", report.repair_plan_summary?.first_repair_step ?? "none"),
    line(
      "Last repair",
      report.repair_plan_summary?.last_repair
        ? `${report.repair_plan_summary.last_repair.step_id} (${report.repair_plan_summary.last_repair.outcome})`
        : "none",
    ),
    line("Recurring drift", report.repair_plan_summary?.recurring_issue?.step_id ?? "none"),
    line("Preventive maintenance", report.repair_plan_summary?.top_preventive_step_id ?? "none"),
  ].join("\n");
}

export function formatInstallCheckReport(report: InstallCheckReport): string {
  const lines: string[] = [];
  lines.push(`Install Check: ${formatStateLabel(report.state)}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Summary", `${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail`));
  lines.push(line("First repair step", report.repair_plan_summary.first_repair_step ?? "none"));
  lines.push(
    line(
      "Last repair",
      report.repair_plan_summary.last_repair
        ? `${report.repair_plan_summary.last_repair.step_id} (${report.repair_plan_summary.last_repair.outcome})`
        : "none",
    ),
  );
  lines.push(line("Recurring drift", report.repair_plan_summary.recurring_issue?.step_id ?? "none"));
  lines.push(line("Preventive maintenance", report.repair_plan_summary.top_preventive_step_id ?? "none"));
  if (report.manifest) {
    lines.push(line("Node", report.manifest.node_executable));
    lines.push(line("LaunchAgent", report.manifest.launch_agent_plist_path));
  }
  lines.push("");

  const notableChecks = report.checks.filter((check) => check.severity !== "pass");
  if (notableChecks.length === 0) {
    lines.push("What to know");
    lines.push("- The local install looks healthy.");
    lines.push("- Wrappers, runtime files, and LaunchAgent checks all passed.");
    lines.push("- You can move on to `personal-ops status` or `personal-ops doctor`.");
    return lines.join("\n");
  }

  lines.push("What needs attention");
  for (const check of notableChecks) {
    lines.push(`[${formatSeverity(check.severity)}] ${check.title}`);
    lines.push(`  ${check.message}`);
  }
  if (notableChecks.some((check) => check.id.includes("wrapper") || check.id.includes("_mcp_launcher"))) {
    lines.push("");
    lines.push("Recommended repair");
    lines.push("- Run `personal-ops install wrappers` to refresh the local launcher scripts.");
  }
  return lines.join("\n");
}

export function formatInstallPermissionsFixResult(result: InstallPermissionsFixResult): string {
  const lines: string[] = [];
  lines.push("Permissions repaired");
  lines.push(line("Generated", result.generated_at));
  lines.push(
    line(
      "Summary",
      `${result.summary.updated} updated / ${result.summary.already_secure} already secure / ${result.summary.missing} missing / ${result.summary.failed} failed`,
    ),
  );
  lines.push("");
  for (const file of result.files) {
    lines.push(`[${file.status}] ${file.label}`);
    lines.push(`  ${file.message}`);
  }
  return lines.join("\n");
}

export function formatRestoreResult(result: RestoreResult): string {
  const lines = [
    `Restore complete: ${result.restored_snapshot_id}`,
    line("Restore mode", formatStateLabel(result.restore_mode)),
    line("Local machine", `${result.local_machine.machine_label} (${result.local_machine.machine_id.slice(0, 8)})`),
    line(
      "Source machine",
      result.source_machine
        ? `${result.source_machine.machine_label} (${result.source_machine.machine_id.slice(0, 8)})`
        : "legacy snapshot",
    ),
    line("Rescue snapshot", result.rescue_snapshot_id),
    line("Database", result.restored_database_path),
    line("Config restored", yesNo(result.restored_config)),
    line("Policy restored", yesNo(result.restored_policy)),
    line("LaunchAgent was running", yesNo(result.launch_agent_was_running)),
    line("LaunchAgent restarted", yesNo(result.launch_agent_restarted)),
  ];
  if (result.provenance_warning) {
    lines.push(line("Warning", result.provenance_warning));
  }
  lines.push("");
  lines.push(
    result.cross_machine
      ? "Next step: run `personal-ops doctor --deep` and the local auth flow before trusting live access on this machine."
      : "Next step: run `personal-ops status` or `personal-ops doctor` to confirm the recovered state looks right.",
  );
  return lines.join("\n");
}
