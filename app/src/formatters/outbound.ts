import type { OutboundAutopilotActionResult, OutboundAutopilotGroup, OutboundAutopilotReport } from "../types.js";
import { line } from "./shared.js";

function formatGroup(group: OutboundAutopilotGroup): string[] {
  const lines: string[] = [];
  lines.push(`${group.group_id} | ${group.kind} | ${group.state} | ${group.summary}`);
  lines.push(`  why now: ${group.why_now}`);
  lines.push(`  drafts: ${group.draft_artifact_ids.length} | approvals: ${group.approval_ids.length} | send-ready: ${group.send_ready_count}`);
  lines.push(`  score: ${group.score_band} | signals: ${group.signals.join(", ")}`);
  for (const command of group.next_commands) {
    lines.push(`  next: ${command}`);
  }
  return lines;
}

export function formatOutboundAutopilotReport(report: OutboundAutopilotReport): string {
  const lines: string[] = [];
  lines.push("Outbound Autopilot");
  lines.push(line("Readiness", report.readiness));
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Summary", report.summary));
  lines.push(line("Send window active", report.send_window.active ? "yes" : "no"));
  lines.push(line("Send enabled", report.send_window.effective_send_enabled ? "yes" : "no"));
  if (report.top_item_summary) {
    lines.push(line("Top item", report.top_item_summary));
  }
  lines.push("");
  lines.push("Groups");
  if (report.groups.length === 0) {
    lines.push("- No outbound finish-work groups are active right now.");
    return lines.join("\n");
  }
  for (const group of report.groups) {
    lines.push(`- ${formatGroup(group)[0]}`);
    for (const detail of formatGroup(group).slice(1)) {
      lines.push(detail);
    }
  }
  return lines.join("\n");
}

export function formatOutboundAutopilotGroup(group: OutboundAutopilotGroup): string {
  return ["Outbound Group", ...formatGroup(group)].join("\n");
}

export function formatOutboundAutopilotActionResult(result: OutboundAutopilotActionResult): string {
  const lines = [result.summary, "", ...formatGroup(result.group)];
  if (result.failed_approval_id) {
    lines.push(`Failed approval: ${result.failed_approval_id}`);
  }
  if (result.failed_reason) {
    lines.push(`Failure reason: ${result.failed_reason}`);
  }
  return lines.join("\n");
}
