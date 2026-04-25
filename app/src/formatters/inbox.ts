import type { ClassifiedInbox } from "../inbox-classifier.js";
import type {
	InboxAutopilotReport,
	InboxStatusReport,
	InboxThreadSummary,
	MailThreadDetail,
} from "../types.js";
import {
	formatAge,
	formatStateLabel,
	humanizeKind,
	line,
	truncate,
	yesNo,
} from "./shared.js";

export function formatClassifiedInbox(classified: ClassifiedInbox): string {
	const lines: string[] = [];
	lines.push(`Classified Inbox — ${classified.briefing_line}`);
	lines.push("");

	lines.push("Act Today");
	if (classified.act_today.length === 0) {
		lines.push("  inbox clear for act today");
	} else {
		for (const t of classified.act_today) {
			const ts = Number(t.thread.last_message_at);
			const age = Number.isFinite(ts)
				? formatAge(new Date(ts).toISOString())
				: "?";
			lines.push(
				`  ${t.thread.thread_id} | ${truncate(t.latest_message?.subject ?? "(no subject)", 60)} | ${age}`,
			);
			if (t.latest_message?.from_header) {
				lines.push(`    from: ${truncate(t.latest_message.from_header, 80)}`);
			}
			lines.push(`    next: personal-ops inbox thread ${t.thread.thread_id}`);
		}
	}

	lines.push("");
	lines.push("Waiting on Someone");
	if (classified.waiting_on_someone.length === 0) {
		lines.push("  no threads waiting on response");
	} else {
		for (const t of classified.waiting_on_someone) {
			const ts = Number(t.thread.last_message_at);
			const age = Number.isFinite(ts)
				? formatAge(new Date(ts).toISOString())
				: "?";
			lines.push(
				`  ${t.thread.thread_id} | ${truncate(t.latest_message?.subject ?? "(no subject)", 60)} | ${age}`,
			);
			if (t.latest_message?.from_header) {
				lines.push(`    to: ${truncate(t.latest_message.from_header, 80)}`);
			}
		}
	}

	lines.push("");
	lines.push(`${classified.total_classified} threads classified total`);
	return lines.join("\n");
}

export function formatInboxStatus(report: InboxStatusReport): string {
	const lines: string[] = [];
	lines.push("Inbox Status");
	lines.push(line("Mailbox", report.mailbox ?? "not connected"));
	lines.push(line("Unread threads", String(report.unread_thread_count)));
	lines.push(line("Follow-up threads", String(report.followup_thread_count)));
	lines.push(line("Indexed threads", String(report.total_thread_count)));
	lines.push("");
	lines.push("Sync");
	if (!report.sync) {
		lines.push("No mailbox sync has been recorded yet.");
		return lines.join("\n");
	}
	lines.push(line("Status", report.sync.status));
	lines.push(line("Last history id", report.sync.last_history_id ?? "not set"));
	lines.push(line("Last synced", report.sync.last_synced_at ?? "never"));
	lines.push(line("Last seeded", report.sync.last_seeded_at ?? "never"));
	lines.push(
		line(
			"Last sync duration",
			report.sync.last_sync_duration_ms !== undefined
				? `${report.sync.last_sync_duration_ms}ms`
				: "unknown",
		),
	);
	lines.push(
		line(
			"Last refresh count",
			report.sync.last_sync_refreshed_count !== undefined
				? String(report.sync.last_sync_refreshed_count)
				: "unknown",
		),
	);
	lines.push(
		line(
			"Last delete count",
			report.sync.last_sync_deleted_count !== undefined
				? String(report.sync.last_sync_deleted_count)
				: "unknown",
		),
	);
	if (report.sync.last_error_message) {
		lines.push(line("Last error", report.sync.last_error_message));
	}
	return lines.join("\n");
}

export function formatInboxThreads(
	title: string,
	threads: InboxThreadSummary[],
): string {
	const lines: string[] = [title];
	if (threads.length === 0) {
		lines.push("No matching inbox threads found.");
		return lines.join("\n");
	}
	for (const summary of threads) {
		const latest = summary.latest_message;
		const timestamp = Number(summary.thread.last_message_at);
		const age = Number.isFinite(timestamp)
			? formatAge(new Date(timestamp).toISOString())
			: "unknown";
		const unread =
			summary.thread.unread_count > 0
				? `unread ${summary.thread.unread_count}`
				: "read";
		lines.push(
			`${summary.thread.thread_id} | ${unread} | ${summary.last_direction} latest | ${humanizeKind(summary.derived_kind)} | age ${age} | ${truncate(latest?.subject ?? "(no subject)")}`,
		);
		if (latest?.from_header) {
			lines.push(`  from: ${truncate(latest.from_header, 96)}`);
		}
		lines.push(`  in inbox: ${yesNo(summary.thread.in_inbox)}`);
		lines.push(`  next: personal-ops inbox thread ${summary.thread.thread_id}`);
	}
	return lines.join("\n");
}

export function formatInboxThreadDetail(detail: MailThreadDetail): string {
	const lines: string[] = [];
	lines.push(`Inbox Thread: ${detail.thread.thread_id}`);
	lines.push(line("Mailbox", detail.thread.mailbox));
	lines.push(line("Messages", String(detail.thread.message_count)));
	lines.push(line("Unread", String(detail.thread.unread_count)));
	lines.push(line("In inbox", yesNo(detail.thread.in_inbox)));
	lines.push(line("Last synced", detail.thread.last_synced_at));
	lines.push(line("Derived state", humanizeKind(detail.derived_kind)));
	lines.push(line("Latest direction", detail.last_direction));
	lines.push(line("Suggested next command", detail.suggested_next_command));
	lines.push("");
	lines.push("Messages");
	if (detail.messages.length === 0) {
		lines.push("No indexed messages found.");
		return lines.join("\n");
	}
	for (const message of detail.messages) {
		const at = Number(message.internal_date);
		const iso = Number.isFinite(at)
			? new Date(at).toISOString()
			: message.last_synced_at;
		lines.push(
			`${iso} | ${message.is_unread ? "unread" : "read"} | ${truncate(message.subject ?? "(no subject)")}`,
		);
		if (message.from_header) {
			lines.push(`  from: ${truncate(message.from_header, 96)}`);
		}
		if (message.to_header) {
			lines.push(`  to: ${truncate(message.to_header, 96)}`);
		}
		lines.push(`  labels: ${message.label_ids.join(", ") || "(none)"}`);
	}
	return lines.join("\n");
}

export function formatInboxAutopilot(report: InboxAutopilotReport): string {
	const lines: string[] = [];
	lines.push(`Inbox Autopilot: ${formatStateLabel(report.readiness)}`);
	lines.push(line("Generated", report.generated_at));
	lines.push(line("Summary", report.summary));
	lines.push(line("Prepared drafts", String(report.prepared_draft_count)));
	if (report.top_item_summary) {
		lines.push(line("Top item", report.top_item_summary));
	}
	lines.push("");
	lines.push("Groups");
	if (report.groups.length === 0) {
		lines.push("- No inbox autopilot groups are ready right now.");
		return lines.join("\n");
	}
	for (const group of report.groups) {
		lines.push(
			`- ${group.group_id} | ${group.kind} | ${group.state} | ${group.summary}`,
		);
		lines.push(`  why now: ${group.why_now}`);
		lines.push(
			`  drafts: ${group.draft_artifact_ids.length} | score: ${group.score_band}`,
		);
		lines.push(`  signals: ${group.signals.join(", ")}`);
		for (const thread of group.threads) {
			lines.push(
				`  thread ${thread.thread_id} | ${truncate(thread.subject)} | ${truncate(thread.counterparty_summary, 64)}`,
			);
			lines.push(`    next: ${thread.suggested_command}`);
		}
	}
	return lines.join("\n");
}

export function formatOperatorInboxReport(report: import("../types.js").OperatorInboxReport): string {
	const lines: string[] = [];
	lines.push("Operator Inbox");
	lines.push(line("Generated", report.generated_at));
	lines.push(line("Summary", report.summary));
	lines.push(
		line(
			"Priorities",
			`P0 ${report.counts_by_priority.P0} / P1 ${report.counts_by_priority.P1} / P2 ${report.counts_by_priority.P2} / P3 ${report.counts_by_priority.P3}`,
		),
	);
	lines.push("");
	lines.push("Top Items");
	if (report.top_items.length === 0) {
		lines.push("- Nothing needs operator attention right now.");
	} else {
		for (const item of report.top_items) {
			lines.push(
				`- [${item.priority}] ${item.title} (${item.state.replaceAll("_", " ")})`,
			);
			lines.push(`  ${truncate(item.summary, 120)}`);
			if (item.why_now) {
				lines.push(`  why now: ${truncate(item.why_now, 120)}`);
			}
			const command = item.safe_actions.find((action) => action.command)?.command;
			if (command) {
				lines.push(`  next: ${command}`);
			}
			lines.push(
				`  source: ${item.source_label} / ${item.freshness} / ${item.confidence}`,
			);
		}
	}
	lines.push("");
	lines.push("Sources");
	for (const source of report.sources) {
		lines.push(
			`- ${source.source}: ${source.available ? "available" : "unavailable"} / ${source.item_count} item${source.item_count === 1 ? "" : "s"}. ${source.summary}`,
		);
	}
	return lines.join("\n");
}
