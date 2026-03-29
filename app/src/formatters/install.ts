import type {
  InstallCheckReport,
  InstallManifest,
  RestoreResult,
  SnapshotInspection,
  SnapshotManifest,
  SnapshotSummary,
} from "../types.js";
import { formatSeverity, formatStateLabel, line, yesNo } from "./shared.js";

export function formatSnapshotManifest(manifest: SnapshotManifest): string {
  return [
    `Snapshot created: ${manifest.snapshot_id}`,
    line("Created", manifest.created_at),
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

export function formatInstallManifest(manifest: InstallManifest): string {
  return [
    "Install updated",
    line("Generated", manifest.generated_at),
    line("Node", manifest.node_executable),
    line("CLI wrapper", manifest.wrapper_paths.cli),
    line("Daemon wrapper", manifest.wrapper_paths.daemon),
    line("Codex MCP wrapper", manifest.wrapper_paths.codex_mcp),
    line("Claude MCP wrapper", manifest.wrapper_paths.claude_mcp),
    line("LaunchAgent", manifest.launch_agent_plist_path),
    "",
    "Next step: run `personal-ops install check` to confirm the local setup is healthy.",
  ].join("\n");
}

export function formatInstallCheckReport(report: InstallCheckReport): string {
  const lines: string[] = [];
  lines.push(`Install Check: ${formatStateLabel(report.state)}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Summary", `${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail`));
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
  return lines.join("\n");
}

export function formatRestoreResult(result: RestoreResult): string {
  return [
    `Restore complete: ${result.restored_snapshot_id}`,
    line("Rescue snapshot", result.rescue_snapshot_id),
    line("Database", result.restored_database_path),
    line("Config restored", yesNo(result.restored_config)),
    line("Policy restored", yesNo(result.restored_policy)),
    line("LaunchAgent was running", yesNo(result.launch_agent_was_running)),
    line("LaunchAgent restarted", yesNo(result.launch_agent_restarted)),
    "",
    "Next step: run `personal-ops status` or `personal-ops doctor` to confirm the recovered state looks right.",
  ].join("\n");
}
