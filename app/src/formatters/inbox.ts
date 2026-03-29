import type { InboxStatusReport, InboxThreadSummary, MailThreadDetail } from "../types.js";
import { formatAge, humanizeKind, line, truncate, yesNo } from "./shared.js";

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
  lines.push(line("Last sync duration", report.sync.last_sync_duration_ms !== undefined ? `${report.sync.last_sync_duration_ms}ms` : "unknown"));
  lines.push(line("Last refresh count", report.sync.last_sync_refreshed_count !== undefined ? String(report.sync.last_sync_refreshed_count) : "unknown"));
  lines.push(line("Last delete count", report.sync.last_sync_deleted_count !== undefined ? String(report.sync.last_sync_deleted_count) : "unknown"));
  if (report.sync.last_error_message) {
    lines.push(line("Last error", report.sync.last_error_message));
  }
  return lines.join("\n");
}

export function formatInboxThreads(title: string, threads: InboxThreadSummary[]): string {
  const lines: string[] = [title];
  if (threads.length === 0) {
    lines.push("No matching inbox threads found.");
    return lines.join("\n");
  }
  for (const summary of threads) {
    const latest = summary.latest_message;
    const timestamp = Number(summary.thread.last_message_at);
    const age = Number.isFinite(timestamp) ? formatAge(new Date(timestamp).toISOString()) : "unknown";
    const unread = summary.thread.unread_count > 0 ? `unread ${summary.thread.unread_count}` : "read";
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
    const iso = Number.isFinite(at) ? new Date(at).toISOString() : message.last_synced_at;
    lines.push(`${iso} | ${message.is_unread ? "unread" : "read"} | ${truncate(message.subject ?? "(no subject)")}`);
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
