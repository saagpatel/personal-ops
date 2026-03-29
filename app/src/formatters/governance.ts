import type {
  ApprovalConfirmation,
  ApprovalDetail,
  ApprovalRequest,
  AuditEvent,
  ReviewDetail,
  ReviewItem,
} from "../types.js";
import {
  formatAge,
  line,
  parseRiskFlags,
  recipientCount,
  suggestedApprovalCommand,
  suggestedReviewCommand,
  truncate,
} from "./shared.js";

export function formatReviewItems(title: string, items: ReviewItem[]): string {
  const lines: string[] = [title];
  if (items.length === 0) {
    lines.push("No review items found.");
    return lines.join("\n");
  }
  for (const item of items) {
    const nextCommand =
      item.state === "pending"
        ? `personal-ops review open ${item.review_id}`
        : item.state === "opened"
          ? `personal-ops review resolve ${item.review_id} --note "Reviewed"`
          : `personal-ops review show ${item.review_id}`;
    lines.push(
      `${item.review_id} | ${item.state} | age ${formatAge(item.created_at)} | ${truncate(item.subject ?? "Untitled draft")}`,
    );
    lines.push(`  next: ${nextCommand}`);
  }
  return lines.join("\n");
}

export function formatReviewDetail(detail: ReviewDetail): string {
  const lines: string[] = [];
  lines.push(`Review Item: ${detail.review_item.review_id}`);
  lines.push(line("State", detail.review_item.state));
  lines.push(line("Kind", detail.review_item.kind));
  lines.push(line("Created", detail.review_item.created_at));
  if (detail.review_item.opened_at) {
    lines.push(line("Opened", detail.review_item.opened_at));
  }
  if (detail.review_item.resolved_at) {
    lines.push(line("Resolved", detail.review_item.resolved_at));
  }
  lines.push("");
  lines.push("Draft");
  lines.push(line("Artifact", detail.draft.artifact_id));
  lines.push(line("Mailbox", detail.draft.mailbox));
  lines.push(line("Subject", detail.draft.subject || "(empty)"));
  lines.push(line("To", detail.draft.to.join(", ") || "(none)"));
  lines.push(line("CC", detail.draft.cc.join(", ") || "(none)"));
  lines.push(line("BCC", detail.draft.bcc.join(", ") || "(none)"));
  lines.push(line("Updated", detail.draft.updated_at));
  lines.push("");
  lines.push(line("Suggested next command", suggestedReviewCommand(detail)));
  lines.push("");
  lines.push("Recent Audit");
  if (detail.related_audit_events.length === 0) {
    lines.push("No related audit events found.");
  } else {
    for (const event of detail.related_audit_events) {
      lines.push(
        `${event.timestamp} | ${event.action} | ${event.outcome} | ${event.client_id} | ${event.target_type}:${event.target_id}`,
      );
    }
  }
  return lines.join("\n");
}

export function formatReviewResolveResult(result: { review_item: ReviewItem; artifact_id: string; note: string }): string {
  return [
    `Review resolved: ${result.review_item.review_id}`,
    line("Artifact", result.artifact_id),
    line("State", result.review_item.state),
    line("Note", result.note),
  ].join("\n");
}

export function formatAuditEvents(events: AuditEvent[]): string {
  if (events.length === 0) return "No audit events found.";
  return events
    .map(
      (event) =>
        `${event.timestamp} | ${event.action} | ${event.outcome} | ${event.client_id} | ${event.target_type}:${event.target_id}`,
    )
    .join("\n");
}

export function formatReviewOpenResult(result: {
  review_item: ReviewItem;
  artifact_id: string;
  gmail_review_url: string;
}): string {
  return [
    `Review opened: ${result.review_item.review_id}`,
    line("Artifact", result.artifact_id),
    line("Gmail URL", result.gmail_review_url),
  ].join("\n");
}

export function formatApprovalItems(
  title: string,
  items: Array<ApprovalRequest & { draft_subject?: string; recipient_count?: number }>,
): string {
  const lines: string[] = [title];
  if (items.length === 0) {
    lines.push("No approval requests found.");
    return lines.join("\n");
  }
  for (const item of items) {
    const riskFlags = parseRiskFlags(item.risk_flags_json);
    const hint =
      item.state === "approved"
        ? `expires ${item.expires_at}`
        : item.state === "send_failed"
          ? item.last_error_message ?? "inspect Sent mail before reopen"
          : item.state === "pending"
            ? `age ${formatAge(item.requested_at)}`
            : item.state;
    lines.push(
      `${item.approval_id} | ${item.state} | age ${formatAge(item.requested_at)} | ${truncate(item.draft_subject ?? `artifact ${item.artifact_id}`)} | recipients ${item.recipient_count ?? "?"} | ${hint}`,
    );
    if (riskFlags.length > 0) {
      lines.push(`  risk: ${riskFlags.join(", ")}`);
    }
  }
  return lines.join("\n");
}

export function formatApprovalDetail(detail: ApprovalDetail): string {
  const lines: string[] = [];
  const riskFlags = parseRiskFlags(detail.approval_request.risk_flags_json);
  lines.push(`Approval Request: ${detail.approval_request.approval_id}`);
  lines.push(line("State", detail.approval_request.state));
  lines.push(line("Artifact", detail.approval_request.artifact_id));
  lines.push(line("Requested", detail.approval_request.requested_at));
  lines.push(line("Expires", detail.approval_request.expires_at));
  lines.push(line("Requested by", detail.approval_request.requested_by_client));
  if (detail.approval_request.approved_at) lines.push(line("Approved", detail.approval_request.approved_at));
  if (detail.approval_request.rejected_at) lines.push(line("Rejected", detail.approval_request.rejected_at));
  if (detail.approval_request.decision_note) lines.push(line("Decision note", detail.approval_request.decision_note));
  if (detail.approval_request.send_note) lines.push(line("Send note", detail.approval_request.send_note));
  if (detail.approval_request.last_error_message) {
    lines.push(line("Last error", detail.approval_request.last_error_message));
  }
  lines.push(line("Suggested next command", suggestedApprovalCommand(detail)));
  lines.push("");
  lines.push("Draft");
  lines.push(line("Subject", detail.draft.subject || "(empty)"));
  lines.push(line("Status", detail.draft.status));
  lines.push(line("To", detail.draft.to.join(", ") || "(none)"));
  lines.push(line("CC", detail.draft.cc.join(", ") || "(none)"));
  lines.push(line("BCC", detail.draft.bcc.join(", ") || "(none)"));
  lines.push(line("Recipients", String(recipientCount(detail.draft))));
  lines.push(line("Risk flags", riskFlags.length ? riskFlags.join(", ") : "none"));
  lines.push("");
  lines.push("Recent Audit");
  if (detail.related_audit_events.length === 0) {
    lines.push("No related audit events found.");
  } else {
    for (const event of detail.related_audit_events) {
      lines.push(
        `${event.timestamp} | ${event.action} | ${event.outcome} | ${event.client_id} | ${event.target_type}:${event.target_id}`,
      );
    }
  }
  return lines.join("\n");
}

export function formatApprovalConfirmation(confirmation: ApprovalConfirmation): string {
  return [
    `Confirmation ready: ${confirmation.approval_id}`,
    line("Action", confirmation.action),
    line("Expires", confirmation.confirmation_expires_at),
    line("Token", confirmation.confirmation_token),
  ].join("\n");
}
