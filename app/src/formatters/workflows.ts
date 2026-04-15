import type { MeetingPrepPacket, WorkflowBundleReport } from "../types.js";
import { formatStateLabel } from "./shared.js";

function pushSection(lines: string[], title: string, items: string[]) {
	lines.push(title);
	lines.push(...items);
	lines.push("");
}

function shouldRenderWorkflowPersonalization(
	report: WorkflowBundleReport,
	item: WorkflowBundleReport["sections"][number]["items"][number],
): boolean {
	if (
		item.surfaced_noise_reduction?.eligible &&
		!item.surfaced_noise_reduction.show_personalization
	) {
		return false;
	}
	if (
		!item.workflow_personalization?.eligible ||
		!item.workflow_personalization.summary
	) {
		return false;
	}
	if (report.workflow === "now-next") {
		return item.workflow_personalization.fit !== "neutral";
	}
	if (report.workflow === "prep-day") {
		return item.workflow_personalization.fit !== "neutral";
	}
	return false;
}

function shouldRenderSurfacedWorkHelpfulness(
	item: WorkflowBundleReport["sections"][number]["items"][number],
): boolean {
	if (
		item.surfaced_noise_reduction?.eligible &&
		!item.surfaced_noise_reduction.show_helpfulness
	) {
		return false;
	}
	return Boolean(
		item.surfaced_work_helpfulness?.eligible &&
			item.surfaced_work_helpfulness.summary,
	);
}

function renderedItemSummary(
	item: WorkflowBundleReport["sections"][number]["items"][number],
): string {
	if (
		item.surfaced_noise_reduction?.eligible &&
		item.surfaced_noise_reduction.summary
	) {
		return item.surfaced_noise_reduction.summary;
	}
	return item.summary;
}

function shouldRenderWhyNow(
	item: WorkflowBundleReport["sections"][number]["items"][number],
): boolean {
	if (
		item.surfaced_noise_reduction?.eligible &&
		!item.surfaced_noise_reduction.show_why_now
	) {
		return false;
	}
	return Boolean(item.why_now);
}

export function formatWorkflowBundleReport(
	report: WorkflowBundleReport,
): string {
	const lines: string[] = [];
	lines.push(`Personal Ops Workflow: ${formatStateLabel(report.workflow)}`);
	lines.push(`Generated: ${report.generated_at}`);
	lines.push(`Readiness: ${formatStateLabel(report.readiness)}`);
	lines.push(`Summary: ${report.summary}`);
	if (report.first_repair_step) {
		lines.push(`First repair step: ${report.first_repair_step}`);
	}
	if (report.maintenance_follow_through.current_bundle_outcome) {
		lines.push(
			`Last maintenance: ${report.maintenance_follow_through.current_bundle_outcome.summary}`,
		);
	}
	if (report.maintenance_follow_through.pressure.summary) {
		lines.push(
			`Maintenance pressure: ${report.maintenance_follow_through.pressure.summary}`,
		);
	}
	if (report.maintenance_commitment?.summary) {
		lines.push(
			`Maintenance commitment: ${report.maintenance_commitment.summary}`,
		);
	}
	if (report.maintenance_defer_memory?.summary) {
		lines.push(`Defer memory: ${report.maintenance_defer_memory.summary}`);
	}
	if (
		report.maintenance_confidence?.eligible &&
		report.maintenance_confidence.summary &&
		((report.workflow === "now-next" &&
			report.maintenance_scheduling.placement === "now") ||
			(report.workflow === "prep-day" &&
				report.maintenance_scheduling.placement === "prep_day"))
	) {
		lines.push(
			`Maintenance confidence: ${report.maintenance_confidence.summary}`,
		);
	}
	if (
		report.maintenance_repair_convergence?.eligible &&
		report.maintenance_repair_convergence.summary &&
		((report.workflow === "now-next" &&
			report.maintenance_repair_convergence.state !== "quiet_preventive" &&
			report.maintenance_operating_block?.step_id ===
				report.maintenance_repair_convergence.step_id &&
			report.maintenance_operating_block.block === "current_block") ||
			(report.workflow === "prep-day" &&
				report.maintenance_operating_block?.step_id ===
					report.maintenance_repair_convergence.step_id &&
				(report.maintenance_repair_convergence.state === "repair_owned" ||
					report.maintenance_repair_convergence.state ===
						"repair_priority_upkeep" ||
					report.maintenance_repair_convergence.state === "maintenance_owned" ||
					report.maintenance_repair_convergence.state === "quiet_preventive")))
	) {
		lines.push(
			`Maintenance convergence (${report.maintenance_repair_convergence.state.replaceAll("_", " ")}): ${report.maintenance_repair_convergence.summary}`,
		);
		if (report.maintenance_repair_convergence.why) {
			lines.push(`Why: ${report.maintenance_repair_convergence.why}`);
		}
		if (report.maintenance_repair_convergence.primary_command) {
			lines.push(
				`Next: ${report.maintenance_repair_convergence.primary_command}`,
			);
		}
	}
	if (
		report.maintenance_operating_block?.eligible &&
		report.maintenance_operating_block.summary &&
		((report.workflow === "now-next" &&
			report.maintenance_operating_block.block === "current_block") ||
			(report.workflow === "prep-day" &&
				(report.maintenance_operating_block.block === "current_block" ||
					report.maintenance_operating_block.block === "later_today" ||
					report.maintenance_operating_block.block === "calm_window")))
	) {
		lines.push(
			`Maintenance operating block (${report.maintenance_operating_block.block.replaceAll("_", " ")}): ${report.maintenance_operating_block.summary}`,
		);
		if (report.maintenance_operating_block.suggested_command) {
			lines.push(
				`Next: ${report.maintenance_operating_block.suggested_command}`,
			);
		}
	}
	if (
		report.maintenance_decision_explanation?.eligible &&
		report.maintenance_decision_explanation.summary &&
		((report.workflow === "now-next" &&
			report.maintenance_decision_explanation.state === "do_now") ||
			(report.workflow === "prep-day" &&
				(report.maintenance_decision_explanation.state === "budget_today" ||
					report.maintenance_decision_explanation.state === "calm_window")))
	) {
		lines.push(
			`Maintenance decision (${report.maintenance_decision_explanation.state.replaceAll("_", " ")}): ${report.maintenance_decision_explanation.summary}`,
		);
		if (report.maintenance_decision_explanation.why_now) {
			lines.push(`Why now: ${report.maintenance_decision_explanation.why_now}`);
		}
		if (report.maintenance_decision_explanation.why_not_higher) {
			lines.push(
				`Why not higher: ${report.maintenance_decision_explanation.why_not_higher}`,
			);
		}
	}
	if (
		report.maintenance_escalation.eligible &&
		report.maintenance_escalation.summary
	) {
		lines.push(
			`Maintenance escalation: ${report.maintenance_escalation.summary}`,
		);
		lines.push(`Next: ${report.maintenance_escalation.suggested_command}`);
	}
	if (
		report.maintenance_scheduling.eligible &&
		report.maintenance_scheduling.summary
	) {
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
				const rendered = [`- ${item.label}: ${renderedItemSummary(item)}`];
				if (shouldRenderWhyNow(item)) {
					rendered.push(`  why now: ${item.why_now}`);
				}
				if (shouldRenderSurfacedWorkHelpfulness(item)) {
					rendered.push(
						`  Surface proof: ${item.surfaced_work_helpfulness!.summary}`,
					);
				}
				if (shouldRenderWorkflowPersonalization(report, item)) {
					rendered.push(
						`  workflow fit: ${item.workflow_personalization!.summary}`,
					);
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
	lines.push(
		`Meeting Prep Packet: ${packet.meeting.summary ?? packet.event_id}`,
	);
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
		packet.agenda.length > 0
			? packet.agenda.map((item) => `- ${item}`)
			: ["- No agenda items are staged yet."],
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
		packet.open_questions.length > 0
			? packet.open_questions.map((item) => `- ${item}`)
			: ["- No open questions are recorded."],
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
		packet.next_commands.length > 0
			? packet.next_commands.map((command) => `- ${command}`)
			: ["- No next commands are staged."],
	);
	return lines.join("\n").trimEnd();
}

type MorningBriefing = {
	date: string;
	calendar: {
		event_count: number;
		events: Array<{
			event_id: string;
			summary: string;
			start_at: string;
			end_at: string;
			is_all_day: boolean;
			attendee_count: number;
		}>;
		next_event_summary: string | null;
		next_event_start_at: string | null;
		conflict_count: number;
	};
	inbox: {
		followup_count: number;
		classified_briefing_line: string;
		act_today_threads: Array<{
			thread_id: string;
			subject: string;
			from: string | null;
			last_message_at: string;
		}>;
	};
	tasks: {
		overdue_count: number;
		overdue: Array<{
			task_id: string;
			title: string;
			due_at: string | null;
			priority: string;
		}>;
	};
	portfolio_pulse: {
		available: boolean;
		briefing_line: string;
		stalest: {
			display_name: string;
			last_activity_at: string | null;
			context_quality: string;
		} | null;
	};
	ai_cost: { briefing_line: string };
	alerts: {
		urgent_count: number;
		events: Array<{
			title: string;
			body: string;
			source: string;
			received_at: string;
		}>;
	};
};

function fmtTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	});
}

export function formatMorningBriefing(b: MorningBriefing): string {
	const lines: string[] = [];
	lines.push(`━━ Morning Briefing · ${b.date} ━━`);
	lines.push("");

	// Section 1: Calendar
	lines.push("📅 CALENDAR");
	if (b.calendar.event_count === 0) {
		lines.push("  No events today.");
	} else {
		for (const ev of b.calendar.events) {
			const time = ev.is_all_day ? "all-day" : fmtTime(ev.start_at);
			const attendees = ev.attendee_count > 1 ? ` (${ev.attendee_count})` : "";
			lines.push(`  ${time}  ${ev.summary}${attendees}`);
		}
		if (b.calendar.conflict_count > 0) {
			lines.push(
				`  ⚠ ${b.calendar.conflict_count} conflict${b.calendar.conflict_count > 1 ? "s" : ""} detected`,
			);
		}
	}
	lines.push("");

	// Section 2: Inbox
	lines.push("📬 INBOX");
	lines.push(`  ${b.inbox.classified_briefing_line}`);
	for (const t of b.inbox.act_today_threads) {
		const from = t.from ? ` · ${t.from}` : "";
		lines.push(`  ▶ ${t.subject}${from}`);
	}
	lines.push("");

	// Section 3: Tasks
	lines.push("✅ TASKS");
	if (b.tasks.overdue_count === 0) {
		lines.push("  No overdue tasks.");
	} else {
		for (const t of b.tasks.overdue) {
			const due = t.due_at ? ` (due ${t.due_at.slice(0, 10)})` : "";
			lines.push(`  [${t.priority}] ${t.title}${due}`);
		}
		if (b.tasks.overdue_count > 3) {
			lines.push(`  + ${b.tasks.overdue_count - 3} more overdue`);
		}
	}
	lines.push("");

	// Section 4: Portfolio pulse
	lines.push("📊 PORTFOLIO");
	if (!b.portfolio_pulse.available) {
		lines.push("  Portfolio data not available.");
	} else if (b.portfolio_pulse.stalest) {
		const s = b.portfolio_pulse.stalest;
		const since = s.last_activity_at
			? s.last_activity_at.slice(0, 10)
			: "unknown";
		lines.push(
			`  Stalest: ${s.display_name} · last active ${since} · context: ${s.context_quality}`,
		);
	} else {
		lines.push(`  ${b.portfolio_pulse.briefing_line}`);
	}
	lines.push("");

	// Section 5: AI cost
	lines.push("🤖 AI ACTIVITY");
	lines.push(`  ${b.ai_cost.briefing_line}`);
	lines.push("");

	// Section 6: Alerts
	if (b.alerts.urgent_count > 0) {
		lines.push("🚨 ALERTS");
		for (const ev of b.alerts.events) {
			lines.push(`  [${ev.source}] ${ev.title}: ${ev.body}`);
		}
		lines.push("");
	}

	lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	return lines.join("\n");
}
