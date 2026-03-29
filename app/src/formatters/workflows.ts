import type { WorkflowBundleReport } from "../types.js";
import { formatStateLabel } from "./shared.js";

function pushSection(lines: string[], title: string, items: string[]) {
  lines.push(title);
  lines.push(...items);
  lines.push("");
}

export function formatWorkflowBundleReport(report: WorkflowBundleReport): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Workflow: ${formatStateLabel(report.workflow)}`);
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Readiness: ${formatStateLabel(report.readiness)}`);
  lines.push(`Summary: ${report.summary}`);
  if (report.first_repair_step) {
    lines.push(`First repair step: ${report.first_repair_step}`);
  }
  lines.push("");

  for (const section of report.sections) {
    if (section.items.length === 0) {
      pushSection(lines, section.title, ["- Nothing notable right now."]);
      continue;
    }
    pushSection(
      lines,
      section.title,
      section.items.flatMap((item) => {
        const rendered = [`- ${item.label}: ${item.summary}`];
        if (item.why_now) {
          rendered.push(`  why now: ${item.why_now}`);
        }
        if (item.score_band) {
          rendered.push(`  score band: ${item.score_band}`);
        }
        if (item.signals?.length) {
          rendered.push(`  signals: ${item.signals.join(", ")}`);
        }
        if (item.command) {
          rendered.push(`  next: ${item.command}`);
        }
        return rendered;
      }),
    );
  }

  return lines.join("\n").trimEnd();
}
