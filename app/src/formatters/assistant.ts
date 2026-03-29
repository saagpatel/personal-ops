import type { AssistantActionQueueReport, AssistantActionRunResult } from "../types.js";
import { formatAge, formatStateLabel } from "./shared.js";

function pushSection(lines: string[], title: string, items: string[]) {
  lines.push(title);
  lines.push(...items);
  lines.push("");
}

export function formatAssistantQueueReport(report: AssistantActionQueueReport): string {
  const lines: string[] = [];
  lines.push(`Assistant Queue: ${formatStateLabel(report.readiness)}`);
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Summary: ${report.summary}`);
  lines.push(
    `Counts: proposed ${report.counts_by_state.proposed}, running ${report.counts_by_state.running}, awaiting review ${report.counts_by_state.awaiting_review}, blocked ${report.counts_by_state.blocked}, completed ${report.counts_by_state.completed}, failed ${report.counts_by_state.failed}`,
  );
  if (report.top_item_summary) {
    lines.push(`Top item: ${report.top_item_summary}`);
  }
  lines.push("");

  if (report.actions.length === 0) {
    pushSection(lines, "Actions", ["- Nothing is queued right now."]);
    return lines.join("\n").trimEnd();
  }

  pushSection(
    lines,
    "Actions",
    report.actions.flatMap((action) => {
      const rendered = [`- ${action.title} [${formatStateLabel(action.state)}]: ${action.summary}`];
      rendered.push(`  section: ${action.section}`);
      rendered.push(`  why now: ${action.why_now}`);
      if (action.signals.length) {
        rendered.push(`  signals: ${action.signals.join(", ")}`);
      }
      if (action.blocking_reason) {
        rendered.push(`  blocked by: ${action.blocking_reason}`);
      }
      if (action.latest_run) {
        rendered.push(
          `  latest run: ${action.latest_run.outcome} ${formatAge(action.latest_run.completed_at ?? action.latest_run.started_at)} ago`,
        );
      }
      if (action.command) {
        rendered.push(`  next: ${action.command}`);
      }
      return rendered;
    }),
  );

  return lines.join("\n").trimEnd();
}

export function formatAssistantActionRunResult(result: AssistantActionRunResult): string {
  const lines: string[] = [];
  lines.push(`Assistant Action: ${result.action_id}`);
  lines.push(`State: ${formatStateLabel(result.state)}`);
  lines.push(`Summary: ${result.summary}`);
  lines.push("");
  pushSection(
    lines,
    "Details",
    result.details.length > 0 ? result.details.map((detail) => `- ${detail}`) : ["- No extra details recorded."],
  );
  lines.push(`Queue summary: ${result.queue.summary}`);
  return lines.join("\n").trimEnd();
}
