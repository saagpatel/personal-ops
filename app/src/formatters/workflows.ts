import type { MeetingPrepPacket, WorkflowBundleReport } from "../types.js";
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
  if (report.maintenance_follow_through.current_bundle_outcome) {
    lines.push(`Last maintenance: ${report.maintenance_follow_through.current_bundle_outcome.summary}`);
  }
  if (report.maintenance_follow_through.pressure.summary) {
    lines.push(`Maintenance pressure: ${report.maintenance_follow_through.pressure.summary}`);
  }
  if (report.maintenance_commitment?.summary) {
    lines.push(`Maintenance commitment: ${report.maintenance_commitment.summary}`);
  }
  if (report.maintenance_defer_memory?.summary) {
    lines.push(`Defer memory: ${report.maintenance_defer_memory.summary}`);
  }
  if (report.maintenance_escalation.eligible && report.maintenance_escalation.summary) {
    lines.push(`Maintenance escalation: ${report.maintenance_escalation.summary}`);
    lines.push(`Next: ${report.maintenance_escalation.suggested_command}`);
  }
  if (report.maintenance_scheduling.eligible && report.maintenance_scheduling.summary) {
    lines.push(
      `Maintenance scheduling (${report.maintenance_scheduling.placement.replaceAll("_", " ")}): ${report.maintenance_scheduling.summary}`,
    );
    if (report.maintenance_scheduling.suggested_command) {
      lines.push(`Next: ${report.maintenance_scheduling.suggested_command}`);
    }
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
        if (item.related_files?.length) {
          rendered.push(
            `  related files: ${item.related_files
              .map((file) => file.title)
              .join(", ")}`,
          );
        } else if (item.related_docs?.length) {
          rendered.push(
            `  related docs: ${item.related_docs
              .map((doc) => doc.title)
              .join(", ")}`,
          );
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

export function formatMeetingPrepPacket(packet: MeetingPrepPacket): string {
  const lines: string[] = [];
  lines.push(`Meeting Prep Packet: ${packet.meeting.summary ?? packet.event_id}`);
  lines.push(`Generated: ${packet.generated_at}`);
  lines.push(`State: ${formatStateLabel(packet.state)}`);
  lines.push(`Summary: ${packet.summary}`);
  lines.push(`Why now: ${packet.why_now}`);
  lines.push(`Score band: ${packet.score_band}`);
  lines.push(`Starts: ${packet.meeting.start_at}`);
  lines.push(`Ends: ${packet.meeting.end_at}`);
  lines.push("");
  pushSection(
    lines,
    "Agenda",
    packet.agenda.length > 0 ? packet.agenda.map((item) => `- ${item}`) : ["- No agenda items are staged yet."],
  );
  pushSection(
    lines,
    "Prep Checklist",
    packet.prep_checklist.length > 0
      ? packet.prep_checklist.map((item) => `- ${item}`)
      : ["- No prep checklist items are staged yet."],
  );
  pushSection(
    lines,
    "Open Questions",
    packet.open_questions.length > 0 ? packet.open_questions.map((item) => `- ${item}`) : ["- No open questions are recorded."],
  );
  pushSection(
    lines,
    "Related Files",
    packet.related_files.length > 0
      ? packet.related_files.map((file) => `- ${file.title}`)
      : packet.related_docs.length > 0
        ? packet.related_docs.map((doc) => `- ${doc.title}`)
        : ["- No related files are linked."],
  );
  pushSection(
    lines,
    "Next Commands",
    packet.next_commands.length > 0 ? packet.next_commands.map((command) => `- ${command}`) : ["- No next commands are staged."],
  );
  return lines.join("\n").trimEnd();
}
