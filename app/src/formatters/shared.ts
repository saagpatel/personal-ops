import type { ApprovalDetail, ReviewDetail, SendWindow, TaskItem } from "../types.js";

export function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

export function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function truncate(value: string, limit = 72): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
}

export function formatSeverity(severity: "pass" | "warn" | "fail"): string {
  if (severity === "pass") return "PASS";
  if (severity === "warn") return "WARN";
  return "FAIL";
}

export function formatStateLabel(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}

export function formatAge(iso: string): string {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h`;
  return `${Math.floor(deltaSeconds / 86400)}d`;
}

export function parseRiskFlags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Object.entries(parsed)
      .filter(([, value]) => value)
      .map(([key]) => key.replaceAll("_", " "));
  } catch {
    return [];
  }
}

export function recipientCount(item: { to: string[]; cc: string[]; bcc: string[] }) {
  return item.to.length + item.cc.length + item.bcc.length;
}

export function humanizeKind(value: string): string {
  return value.replaceAll("_", " ");
}

export function suggestedApprovalCommand(detail: ApprovalDetail): string {
  const approval = detail.approval_request;
  if (approval.state === "pending") return `personal-ops approval approve ${approval.approval_id} --note "Approved"`;
  if (approval.state === "approved") return `personal-ops approval send ${approval.approval_id} --note "Ready to send"`;
  if (approval.state === "send_failed") return `personal-ops approval reopen ${approval.approval_id} --note "Confirmed safe to retry"`;
  if (approval.state === "rejected" || approval.state === "expired") {
    return `personal-ops approval request ${approval.artifact_id} --note "Requesting fresh approval"`;
  }
  return `personal-ops approval show ${approval.approval_id}`;
}

export function suggestedReviewCommand(detail: ReviewDetail): string {
  if (detail.review_item.state === "pending") return `personal-ops review open ${detail.review_item.review_id}`;
  if (detail.review_item.state === "opened") {
    return `personal-ops review resolve ${detail.review_item.review_id} --note "Reviewed"`;
  }
  return `personal-ops review show ${detail.review_item.review_id}`;
}

export function suggestedTaskCommand(task: TaskItem): string {
  if (task.scheduled_calendar_event_id) {
    return `personal-ops calendar event ${task.scheduled_calendar_event_id}`;
  }
  if (task.state === "pending") return `personal-ops task start ${task.task_id}`;
  if (task.state === "in_progress") return `personal-ops task complete ${task.task_id} --note "Done"`;
  return `personal-ops task show ${task.task_id}`;
}

export type SendWindowStatus = {
  active_window: SendWindow | null;
  effective_send_enabled: boolean;
  permanent_send_enabled: boolean;
};
