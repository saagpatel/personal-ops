import type { MeetingContactBrief } from "../meeting-contact-brief.js";
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

export function formatMeetingContactBrief(b: MeetingContactBrief): string {
	const lines: string[] = [];
	const eta =
		b.minutes_until <= 0
			? "now"
			: b.minutes_until === 1
				? "1 min"
				: `${b.minutes_until} min`;
	lines.push(`━━ Meeting Brief · ${b.title} · starts in ${eta} ━━`);
	lines.push(`   ${fmtTime(b.start_at)} – ${fmtTime(b.end_at)}`);
	if (b.location) lines.push(`   📍 ${b.location}`);
	lines.push("");

	if (b.attendee_contexts.length === 0) {
		lines.push("  No external attendees found.");
	} else {
		for (const ctx of b.attendee_contexts) {
			const name = ctx.display_name ?? ctx.email;
			const status = ctx.response_status ? ` [${ctx.response_status}]` : "";
			lines.push(`  👤 ${name}${status}`);
			if (ctx.email !== ctx.display_name) {
				lines.push(`     ${ctx.email}`);
			}
			if (ctx.open_thread_count > 0 || ctx.meeting_count_together > 0) {
				const parts: string[] = [];
				if (ctx.open_thread_count > 0)
					parts.push(
						`${ctx.open_thread_count} thread${ctx.open_thread_count !== 1 ? "s" : ""}`,
					);
				if (ctx.meeting_count_together > 0)
					parts.push(
						`${ctx.meeting_count_together} meeting${ctx.meeting_count_together !== 1 ? "s" : ""} together`,
					);
				lines.push(`     ${parts.join(" · ")}`);
			}
			if (ctx.recent_messages.length === 0) {
				lines.push("     No recent email history.");
			} else {
				for (const msg of ctx.recent_messages) {
					const dir = msg.direction === "outbound" ? "→" : "←";
					const date = msg.date.slice(0, 10);
					const subject = msg.subject ?? "(no subject)";
					lines.push(`     ${dir} ${date}  ${subject}`);
				}
			}
			lines.push("");
		}
	}

	lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	return lines.join("\n");
}

type EndOfDayDigest = {
	date: string;
	calendar: {
		meetings_today: number;
		meeting_minutes: number;
		events: Array<{
			event_id: string;
			summary: string;
			start_at: string;
			end_at: string;
			is_all_day: boolean;
			attendee_count: number;
		}>;
	};
	inbox: {
		inbound_today: number;
		outbound_today: number;
		needs_reply_count: number;
		stale_followup_count: number;
	};
	tasks: {
		completed_today: Array<{
			task_id: string;
			title: string;
			completed_at: string;
		}>;
		overdue_open_count: number;
	};
	approvals: {
		pending_count: number;
	};
	ai_cost: {
		briefing_line: string;
	};
	git_commits: {
		repos_with_commits: number;
		total_commits: number;
		items: Array<{ repo: string; count: number; subjects: string[] }>;
	};
};

export function formatEndOfDayDigest(d: EndOfDayDigest): string {
	const lines: string[] = [];
	lines.push(`━━ End-of-Day Digest · ${d.date} ━━`);
	lines.push("");

	// Section 1: Calendar
	lines.push("📅 MEETINGS TODAY");
	if (d.calendar.meetings_today === 0) {
		lines.push("  No meetings today.");
	} else {
		const hrs = Math.floor(d.calendar.meeting_minutes / 60);
		const mins = d.calendar.meeting_minutes % 60;
		const timeStr =
			hrs > 0 ? `${hrs}h ${mins}m` : `${d.calendar.meeting_minutes}m`;
		lines.push(
			`  ${d.calendar.meetings_today} meeting${d.calendar.meetings_today !== 1 ? "s" : ""} · ${timeStr} in meetings`,
		);
		for (const ev of d.calendar.events.slice(0, 5)) {
			const time = ev.is_all_day ? "all-day" : fmtTime(ev.start_at);
			const attendees = ev.attendee_count > 1 ? ` (${ev.attendee_count})` : "";
			lines.push(`  ${time}  ${ev.summary}${attendees}`);
		}
	}
	lines.push("");

	// Section 2: Inbox
	lines.push("📬 INBOX");
	lines.push(
		`  ${d.inbox.inbound_today} received · ${d.inbox.outbound_today} sent`,
	);
	if (d.inbox.needs_reply_count > 0) {
		lines.push(`  ⚠ ${d.inbox.needs_reply_count} threads still need a reply`);
	} else {
		lines.push("  Inbox clear — no threads awaiting your reply.");
	}
	if (d.inbox.stale_followup_count > 0) {
		lines.push(
			`  ⏳ ${d.inbox.stale_followup_count} sent thread${d.inbox.stale_followup_count !== 1 ? "s" : ""} with no reply yet`,
		);
	}
	lines.push("");

	// Section 3: Tasks
	lines.push("✅ TASKS");
	if (d.tasks.completed_today.length === 0) {
		lines.push("  No tasks completed today.");
	} else {
		lines.push(`  ${d.tasks.completed_today.length} completed today:`);
		for (const t of d.tasks.completed_today) {
			lines.push(`  ✓ ${t.title}`);
		}
	}
	if (d.tasks.overdue_open_count > 0) {
		lines.push(
			`  ⚠ ${d.tasks.overdue_open_count} overdue task${d.tasks.overdue_open_count !== 1 ? "s" : ""} still open`,
		);
	}
	lines.push("");

	// Section 4: Approvals (only if pending)
	if (d.approvals.pending_count > 0) {
		lines.push("📋 APPROVALS");
		lines.push(
			`  ${d.approvals.pending_count} approval${d.approvals.pending_count !== 1 ? "s" : ""} pending — run: personal-ops approval list`,
		);
		lines.push("");
	}

	// Section 5: Shipped today (git commits)
	if (d.git_commits.total_commits > 0) {
		lines.push("📦 SHIPPED TODAY");
		lines.push(
			`  ${d.git_commits.total_commits} commit${d.git_commits.total_commits !== 1 ? "s" : ""} across ${d.git_commits.repos_with_commits} repo${d.git_commits.repos_with_commits !== 1 ? "s" : ""}`,
		);
		for (const r of d.git_commits.items.slice(0, 8)) {
			lines.push(`  ${r.repo} (${r.count})`);
			for (const subject of r.subjects.slice(0, 3)) {
				lines.push(`    · ${subject}`);
			}
		}
		lines.push("");
	}

	// Section 6: AI cost
	lines.push("🤖 AI ACTIVITY");
	lines.push(`  ${d.ai_cost.briefing_line}`);
	lines.push("");

	lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	return lines.join("\n");
}

// ── Tier 2.1: Contact Graph ───────────────────────────────────────────────

type ContactNode = {
	email: string;
	display_name: string | null;
	last_contact_at: string;
	message_count: number;
	meeting_count: number;
	open_thread_count: number;
	warmth_score: number;
};

function warmthBar(score: number): string {
	const filled = Math.round(score * 5);
	return "█".repeat(filled) + "░".repeat(5 - filled);
}

function fmtRelativeDate(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const days = Math.floor(diff / (24 * 60 * 60 * 1000));
	if (days === 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 7) return `${days}d ago`;
	if (days < 30) return `${Math.floor(days / 7)}w ago`;
	if (days < 365) return `${Math.floor(days / 30)}mo ago`;
	return `${Math.floor(days / 365)}y ago`;
}

export function formatContactGraph(contacts: ContactNode[]): string {
	if (contacts.length === 0)
		return "No contacts found. Run: personal-ops contacts rebuild";

	const hot = contacts.filter((c) => c.warmth_score >= 0.7);
	const warm = contacts.filter(
		(c) => c.warmth_score >= 0.3 && c.warmth_score < 0.7,
	);
	const cold = contacts.filter((c) => c.warmth_score < 0.3);

	const lines: string[] = ["RELATIONSHIP GRAPH", ""];

	function renderGroup(label: string, group: ContactNode[]) {
		if (group.length === 0) return;
		lines.push(label);
		for (const c of group) {
			const name = c.display_name ?? c.email;
			const bar = warmthBar(c.warmth_score);
			const last = fmtRelativeDate(c.last_contact_at);
			const threads =
				c.open_thread_count > 0 ? ` · ${c.open_thread_count} open` : "";
			lines.push(
				`  [${bar}] ${name}  —  ${c.message_count}msg${c.meeting_count > 0 ? ` · ${c.meeting_count}mtg` : ""}${threads}  (${last})`,
			);
		}
		lines.push("");
	}

	renderGroup("🔥 HOT (warmth ≥ 0.7)", hot);
	renderGroup("🌤 WARM (0.3 – 0.7)", warm);
	renderGroup("❄ COLD (< 0.3)", cold);

	return lines.join("\n").trimEnd();
}

// ── Tier 2.2: AI Session Memory ───────────────────────────────────────────

type AiMemoryEntry = {
	id: number;
	source: string;
	timestamp: string;
	project_name: string;
	summary: string;
	branch: string | null;
	tags: string[];
};

export function formatAiMemory(entries: AiMemoryEntry[]): string {
	if (entries.length === 0) return "No AI sessions found matching the query.";

	// Group by project
	const byProject = new Map<string, AiMemoryEntry[]>();
	for (const e of entries) {
		const list = byProject.get(e.project_name) ?? [];
		list.push(e);
		byProject.set(e.project_name, list);
	}

	const lines: string[] = ["AI SESSION MEMORY", ""];
	const sourceIcon: Record<string, string> = {
		cc: "CC",
		codex: "CX",
		claude_ai: "AI",
	};

	for (const [project, sessions] of byProject) {
		lines.push(`▸ ${project}`);
		for (const s of sessions) {
			const icon = sourceIcon[s.source] ?? s.source.toUpperCase();
			const date = new Date(s.timestamp).toLocaleDateString();
			const branch = s.branch ? ` [${s.branch}]` : "";
			lines.push(`  [${icon}] ${date}${branch}  ${s.summary}`);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

// ── Tier 2.3: Email Knowledge Base ────────────────────────────────────────

type EmailSearchResult = {
	message_id: string;
	thread_id: string;
	subject: string | null;
	from_header: string | null;
	relevance_rank: number;
};

export function formatEmailSearch(
	results: EmailSearchResult[],
	query: string,
): string {
	const header = `EMAIL SEARCH: "${query}"  (${results.length} thread${results.length !== 1 ? "s" : ""})`;
	if (results.length === 0) return `${header}\n\nNo results found.`;

	const lines: string[] = [header, ""];
	for (const r of results) {
		const subject = r.subject ?? "(no subject)";
		const from = r.from_header ?? "(unknown sender)";
		lines.push(`  ${subject}`);
		lines.push(`    From: ${from}  [thread: ${r.thread_id.slice(0, 12)}]`);
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
