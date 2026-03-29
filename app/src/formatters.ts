import {
  ApprovalConfirmation,
  ApprovalDetail,
  ApprovalRequest,
  AuditEvent,
  CalendarConflict,
  CalendarDayView,
  CalendarEvent,
  CalendarTaskScheduleResult,
  OwnedCalendarSummary,
  CalendarSource,
  CalendarStatusReport,
  DoctorReport,
  FreeTimeWindow,
  InboxStatusReport,
  InboxThreadSummary,
  MailThreadDetail,
  PlanningRecommendationBacklogReport,
  PlanningRecommendationGroup,
  PlanningRecommendationGroupDetail,
  PlanningRecommendationHygieneReport,
  PlanningRecommendation,
  PlanningRecommendationClosureReport,
  PlanningRecommendationDetail,
  PlanningRecommendationPolicyPruneResult,
  PlanningRecommendationPolicyReport,
  PlanningRecommendationSummaryReport,
  PlanningRecommendationTuningReport,
  ReviewDetail,
  ReviewItem,
  SendWindow,
  ServiceStatusReport,
  SnapshotInspection,
  SnapshotManifest,
  SnapshotSummary,
  TaskDetail,
  TaskItem,
  TaskSuggestion,
  TaskSuggestionDetail,
  WorklistReport,
} from "./types.js";

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function truncate(value: string, limit = 72): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
}

function formatSeverity(severity: "pass" | "warn" | "fail"): string {
  if (severity === "pass") return "PASS";
  if (severity === "warn") return "WARN";
  return "FAIL";
}

function formatAge(iso: string): string {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h`;
  return `${Math.floor(deltaSeconds / 86400)}d`;
}

function parseRiskFlags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Object.entries(parsed)
      .filter(([, value]) => value)
      .map(([key]) => key.replaceAll("_", " "));
  } catch {
    return [];
  }
}

function recipientCount(item: { to: string[]; cc: string[]; bcc: string[] }) {
  return item.to.length + item.cc.length + item.bcc.length;
}

function humanizeKind(value: string): string {
  return value.replaceAll("_", " ");
}

function suggestedApprovalCommand(detail: ApprovalDetail): string {
  const approval = detail.approval_request;
  if (approval.state === "pending") return `personal-ops approval approve ${approval.approval_id} --note "Approved"`;
  if (approval.state === "approved") return `personal-ops approval send ${approval.approval_id} --note "Ready to send"`;
  if (approval.state === "send_failed") return `personal-ops approval reopen ${approval.approval_id} --note "Confirmed safe to retry"`;
  if (approval.state === "rejected" || approval.state === "expired") {
    return `personal-ops approval request ${approval.artifact_id} --note "Requesting fresh approval"`;
  }
  return `personal-ops approval show ${approval.approval_id}`;
}

function suggestedReviewCommand(detail: ReviewDetail): string {
  if (detail.review_item.state === "pending") return `personal-ops review open ${detail.review_item.review_id}`;
  if (detail.review_item.state === "opened") {
    return `personal-ops review resolve ${detail.review_item.review_id} --note "Reviewed"`;
  }
  return `personal-ops review show ${detail.review_item.review_id}`;
}

function suggestedTaskCommand(task: TaskItem): string {
  if (task.scheduled_calendar_event_id) {
    return `personal-ops calendar event ${task.scheduled_calendar_event_id}`;
  }
  if (task.state === "pending") return `personal-ops task start ${task.task_id}`;
  if (task.state === "in_progress") return `personal-ops task complete ${task.task_id} --note "Done"`;
  return `personal-ops task show ${task.task_id}`;
}

export function formatStatusReport(report: ServiceStatusReport): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Status: ${report.state.toUpperCase()}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Daemon reachable", yesNo(report.daemon_reachable)));
  lines.push(line("Effective send enabled", yesNo(report.send_policy.effective_enabled)));
  lines.push("");
  lines.push("Send Policy");
  lines.push(line("Permanent allow_send", yesNo(report.send_policy.permanent_enabled)));
  lines.push(line("Timed window active", yesNo(report.send_policy.window_active)));
  lines.push(line("Window expires", report.send_policy.window_expires_at ?? "not active"));
  lines.push(line("Effective send enabled", yesNo(report.send_policy.effective_enabled)));
  lines.push("");
  lines.push("Mailbox");
  lines.push(line("Configured", report.mailbox.configured ?? "not set"));
  lines.push(line("Connected", report.mailbox.connected ?? "not connected"));
  lines.push(line("Matches config", yesNo(report.mailbox.matches_configuration)));
  lines.push(line("OAuth client configured", yesNo(report.mailbox.oauth_client_configured)));
  lines.push(line("Keychain token present", yesNo(report.mailbox.keychain_token_present)));
  lines.push("");
  lines.push("Runtime");
  lines.push(line("LaunchAgent label", report.launch_agent.label));
  lines.push(line("LaunchAgent exists", yesNo(report.launch_agent.exists)));
  lines.push(line("LaunchAgent loaded", yesNo(report.launch_agent.loaded)));
  lines.push(line("Schema current", String(report.schema.current_version)));
  lines.push(line("Schema expected", String(report.schema.expected_version)));
  lines.push(line("Schema compatible", yesNo(report.schema.compatible)));
  lines.push(line("Schema note", report.schema.compatibility_message));
  lines.push("");
  lines.push("Attention");
  lines.push(line("Critical", String(report.worklist_summary.critical_count)));
  lines.push(line("Warn", String(report.worklist_summary.warn_count)));
  lines.push(line("Info", String(report.worklist_summary.info_count)));
  lines.push(line("Top item", report.worklist_summary.top_item_summary ?? "nothing urgent"));
  lines.push("");
  lines.push("Inbox");
  lines.push(line("Sync status", report.inbox.sync_status));
  lines.push(line("Last history id", report.inbox.last_history_id ?? "not set"));
  lines.push(line("Last synced", report.inbox.last_synced_at ?? "never"));
  lines.push(line("Unread threads", String(report.inbox.unread_thread_count)));
  lines.push(line("Follow-up threads", String(report.inbox.followup_thread_count)));
  lines.push(line("Indexed threads", String(report.inbox.total_thread_count)));
  lines.push(line("Top inbox item", report.inbox.top_item_summary ?? "nothing urgent"));
  lines.push("");
  lines.push("Calendar");
  lines.push(line("Enabled", yesNo(report.calendar.enabled)));
  lines.push(line("Sync status", report.calendar.sync_status));
  lines.push(line("Last synced", report.calendar.last_synced_at ?? "never"));
  lines.push(line("Calendars", String(report.calendar.calendars_synced_count)));
  lines.push(line("Events", String(report.calendar.events_synced_count)));
  lines.push(line("Owned writable", String(report.calendar.owned_writable_calendar_count)));
  lines.push(line("personal-ops events", String(report.calendar.personal_ops_active_event_count)));
  lines.push(line("Scheduled tasks", String(report.calendar.linked_scheduled_task_count)));
  lines.push(line("Conflicts next 24h", String(report.calendar.conflict_count_next_24h)));
  lines.push(line("Next upcoming", report.calendar.next_upcoming_event_summary ?? "nothing scheduled"));
  lines.push(line("Top calendar item", report.calendar.top_item_summary ?? "nothing urgent"));
  lines.push(line("Top scheduling item", report.calendar.top_scheduling_item_summary ?? "nothing urgent"));
  lines.push("");
  lines.push("Review Queue");
  lines.push(line("Pending", String(report.review_queue.pending_count)));
  lines.push(line("Opened", String(report.review_queue.opened_count)));
  lines.push(line("Total", String(report.review_queue.total_count)));
  lines.push("");
  lines.push("Approval Queue");
  lines.push(line("Pending", String(report.approval_queue.pending_count)));
  lines.push(line("Approved", String(report.approval_queue.approved_count)));
  lines.push(line("Sending", String(report.approval_queue.sending_count)));
  lines.push(line("Send failed", String(report.approval_queue.send_failed_count)));
  lines.push(line("Total", String(report.approval_queue.total_count)));
  lines.push("");
  lines.push("Tasks");
  lines.push(line("Pending", String(report.tasks.pending_count)));
  lines.push(line("In progress", String(report.tasks.in_progress_count)));
  lines.push(line("Completed", String(report.tasks.completed_count)));
  lines.push(line("Canceled", String(report.tasks.canceled_count)));
  lines.push(line("Active now", String(report.tasks.active_count)));
  lines.push(line("Historical", String(report.tasks.historical_count)));
  lines.push(line("Total", String(report.tasks.total_count)));
  lines.push(line("Top task item", report.tasks.top_item_summary ?? "nothing urgent"));
  lines.push("");
  lines.push("Task Suggestions");
  lines.push(line("Pending", String(report.task_suggestions.pending_count)));
  lines.push(line("Accepted", String(report.task_suggestions.accepted_count)));
  lines.push(line("Rejected", String(report.task_suggestions.rejected_count)));
  lines.push(line("Active now", String(report.task_suggestions.active_count)));
  lines.push(line("Historical", String(report.task_suggestions.historical_count)));
  lines.push(line("Total", String(report.task_suggestions.total_count)));
  lines.push(line("Top suggestion item", report.task_suggestions.top_item_summary ?? "nothing urgent"));
  lines.push("");
  lines.push("Planning Recommendations");
  lines.push(line("Pending", String(report.planning_recommendations.pending_count)));
  lines.push(line("Snoozed", String(report.planning_recommendations.snoozed_count)));
  lines.push(line("Applied", String(report.planning_recommendations.applied_count)));
  lines.push(line("Rejected", String(report.planning_recommendations.rejected_count)));
  lines.push(line("Expired", String(report.planning_recommendations.expired_count)));
  lines.push(line("Superseded", String(report.planning_recommendations.superseded_count)));
  lines.push(line("Scheduled", String(report.planning_recommendations.scheduled_count)));
  lines.push(line("Completed", String(report.planning_recommendations.completed_count)));
  lines.push(line("Canceled", String(report.planning_recommendations.canceled_count)));
  lines.push(line("Dismissed", String(report.planning_recommendations.dismissed_count)));
  lines.push(line("Handled elsewhere", String(report.planning_recommendations.handled_elsewhere_count)));
  lines.push(line("Source resolved", String(report.planning_recommendations.source_resolved_count)));
  lines.push(line("Manual scheduling", String(report.planning_recommendations.manual_scheduling_count)));
  lines.push(line("Stale pending", String(report.planning_recommendations.stale_pending_count)));
  lines.push(line("Stale scheduled", String(report.planning_recommendations.stale_scheduled_count)));
  lines.push(line("Resurfaced sources", String(report.planning_recommendations.resurfaced_source_count)));
  lines.push(line("Closed last 7d", String(report.planning_recommendations.closed_last_7d)));
  lines.push(line("Closed last 30d", String(report.planning_recommendations.closed_last_30d)));
  lines.push(line("Completed last 30d", String(report.planning_recommendations.completed_last_30d)));
  lines.push(line("Handled elsewhere last 30d", String(report.planning_recommendations.handled_elsewhere_last_30d)));
  lines.push(
    line(
      "Median time to first action (m)",
      report.planning_recommendations.median_time_to_first_action_minutes?.toFixed(1) ?? "n/a",
    ),
  );
  lines.push(
    line(
      "Median time to close (m)",
      report.planning_recommendations.median_time_to_close_minutes?.toFixed(1) ?? "n/a",
    ),
  );
  lines.push(line("Active now", String(report.planning_recommendations.active_count)));
  lines.push(line("Historical", String(report.planning_recommendations.historical_count)));
  lines.push(line("Total", String(report.planning_recommendations.total_count)));
  lines.push(line("Top planning group", report.planning_recommendations.top_group_summary ?? "nothing grouped"));
  lines.push(line("Top planning item", report.planning_recommendations.top_item_summary ?? "nothing urgent"));
  lines.push(line("Top next action", report.planning_recommendations.top_next_action_summary ?? "nothing urgent"));
  lines.push(line("Blocked planning group", report.planning_recommendations.blocked_group_summary ?? "nothing blocked"));
  lines.push(line("Top backlog summary", report.planning_recommendations.top_backlog_summary ?? "nothing backlogged"));
  lines.push(line("Top closure summary", report.planning_recommendations.top_closure_summary ?? "nothing recently closed"));
  lines.push(line("Dominant backlog summary", report.planning_recommendations.dominant_backlog_summary ?? "nothing dominant"));
  lines.push(line("Review needed count", String(report.planning_recommendations.review_needed_count)));
  lines.push(
    line(
      "Top review needed",
      report.planning_recommendations.top_review_needed_summary ?? "nothing awaiting review",
    ),
  );
  lines.push(line("Reviewed fresh", String(report.planning_recommendations.reviewed_fresh_count)));
  lines.push(
    line(
      "Reviewed stale (needs follow-through)",
      String(report.planning_recommendations.reviewed_stale_count),
    ),
  );
  lines.push(
    line(
      "Proposal open (tracked, not stale)",
      String(report.planning_recommendations.proposal_open_count),
    ),
  );
  lines.push(
    line(
      "Proposal stale (needs follow-through)",
      String(report.planning_recommendations.proposal_stale_count),
    ),
  );
  lines.push(line("Proposal dismissed", String(report.planning_recommendations.proposal_dismissed_count)));
  lines.push(
    line(
      "Top reviewed stale follow-through",
      report.planning_recommendations.top_reviewed_stale_summary ?? "nothing aging after review",
    ),
  );
  lines.push(
    line(
      "Top proposal open (tracked, not stale)",
      report.planning_recommendations.top_proposal_open_summary ?? "no tracked proposal",
    ),
  );
  lines.push(
    line(
      "Top proposal stale follow-through",
      report.planning_recommendations.top_proposal_stale_summary ?? "no stale proposal",
    ),
  );
  lines.push(
    line(
      "Policy attention",
      report.planning_recommendations.top_policy_attention_summary ??
        (report.planning_recommendations.policy_attention_kind === "none"
          ? "no policy attention needed"
          : humanizeKind(report.planning_recommendations.policy_attention_kind)),
    ),
  );
  lines.push(
    line(
      "Top suppression candidate",
      report.planning_recommendations.top_suppression_candidate_summary ?? "no advisory candidate",
    ),
  );
  lines.push(line("Top hygiene summary", report.planning_recommendations.top_hygiene_summary ?? "nothing notable"));
  lines.push("");
  lines.push("Checks");
  lines.push(line("Pass", String(report.checks_summary.pass)));
  lines.push(line("Warn", String(report.checks_summary.warn)));
  lines.push(line("Fail", String(report.checks_summary.fail)));
  lines.push("");
  lines.push("Latest Snapshot");
  if (report.snapshot_latest) {
    lines.push(line("Snapshot ID", report.snapshot_latest.snapshot_id));
    lines.push(line("Created", report.snapshot_latest.created_at));
    lines.push(line("State", report.snapshot_latest.daemon_state));
    lines.push(line("Path", report.snapshot_latest.path));
  } else {
    lines.push("No snapshots found.");
  }
  return lines.join("\n");
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`Personal Ops Doctor: ${report.state.toUpperCase()}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Deep check", yesNo(report.deep)));
  lines.push(line("Pass", String(report.summary.pass)));
  lines.push(line("Warn", String(report.summary.warn)));
  lines.push(line("Fail", String(report.summary.fail)));
  lines.push("");
  for (const check of report.checks) {
    lines.push(`[${formatSeverity(check.severity)}] ${check.title}`);
    lines.push(`  ${check.message}`);
  }
  return lines.join("\n");
}

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

export function formatApprovalItems(title: string, items: Array<ApprovalRequest & { draft_subject?: string; recipient_count?: number }>): string {
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

export function formatSendWindowStatus(status: {
  active_window: SendWindow | null;
  effective_send_enabled: boolean;
  permanent_send_enabled: boolean;
}): string {
  const lines: string[] = [];
  lines.push("Send Window");
  lines.push(line("Permanent allow_send", yesNo(status.permanent_send_enabled)));
  lines.push(line("Effective send enabled", yesNo(status.effective_send_enabled)));
  if (!status.active_window) {
    lines.push(line("Timed window active", "no"));
    return lines.join("\n");
  }
  lines.push(line("Timed window active", "yes"));
  lines.push(line("Window ID", status.active_window.window_id));
  lines.push(line("State", status.active_window.state));
  lines.push(line("Enabled", status.active_window.enabled_at));
  lines.push(line("Expires", status.active_window.expires_at));
  lines.push(line("Reason", status.active_window.reason));
  return lines.join("\n");
}

export function formatWorklistReport(report: WorklistReport): string {
  const lines: string[] = [];
  lines.push(`Worklist: ${report.state.toUpperCase()}`);
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Critical", String(report.counts_by_severity.critical)));
  lines.push(line("Warn", String(report.counts_by_severity.warn)));
  lines.push(line("Info", String(report.counts_by_severity.info)));
  if (report.send_window.active && report.send_window.window) {
    lines.push(line("Send window", `active until ${report.send_window.window.expires_at}`));
  } else {
    lines.push(line("Send window", "inactive"));
  }
  lines.push("");
  if (report.planning_groups.length > 0) {
    lines.push("Planning Groups");
    for (const group of report.planning_groups) {
      lines.push(`- ${group.group_summary} (top score ${group.top_rank_score})`);
    }
    lines.push("");
  }
  if (report.items.length === 0) {
    lines.push("Nothing needs attention right now.");
    return lines.join("\n");
  }
  for (const item of report.items) {
    lines.push(`[${item.severity.toUpperCase()}] ${item.title}`);
    lines.push(`  ${item.summary}`);
    lines.push(`  next: ${item.suggested_command}`);
  }
  return lines.join("\n");
}

export function formatSnapshotManifest(manifest: SnapshotManifest): string {
  return [
    `Snapshot created: ${manifest.snapshot_id}`,
    line("Created", manifest.created_at),
    line("Mailbox", manifest.mailbox ?? "not connected"),
    line("State", manifest.daemon_state),
    line("Database", manifest.db_backup_path),
  ].join("\n");
}

export function formatSnapshotList(snapshots: SnapshotSummary[]): string {
  if (snapshots.length === 0) return "No snapshots found.";
  return snapshots
    .map((snapshot) => `${snapshot.snapshot_id} | ${snapshot.created_at} | ${snapshot.daemon_state} | ${snapshot.path}`)
    .join("\n");
}

export function formatSnapshotInspection(inspection: SnapshotInspection): string {
  const lines: string[] = [];
  lines.push(`Snapshot: ${inspection.manifest.snapshot_id}`);
  lines.push(line("Created", inspection.manifest.created_at));
  lines.push(line("Version", inspection.manifest.service_version));
  lines.push(line("Mailbox", inspection.manifest.mailbox ?? "not connected"));
  lines.push(line("State", inspection.manifest.daemon_state));
  lines.push("");
  lines.push("Files");
  for (const file of inspection.files) {
    lines.push(`${yesNo(file.exists)} | ${file.size_bytes} bytes | ${file.path}`);
  }
  lines.push("");
  lines.push("Warnings");
  if (inspection.warnings.length === 0) {
    lines.push("None.");
  } else {
    for (const warning of inspection.warnings) {
      lines.push(`- ${warning}`);
    }
  }
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

export function formatCalendarStatus(report: CalendarStatusReport): string {
  const lines: string[] = [];
  lines.push("Calendar Status");
  lines.push(line("Enabled", yesNo(report.enabled)));
  lines.push(line("Provider", report.provider));
  lines.push(line("Account", report.account ?? "not connected"));
  lines.push(line("Calendars synced", String(report.calendars_synced_count)));
  lines.push(line("Events synced", String(report.events_synced_count)));
  lines.push(line("Owned writable calendars", String(report.owned_writable_calendar_count)));
  lines.push(line("personal-ops events", String(report.personal_ops_active_event_count)));
  lines.push(line("Scheduled tasks", String(report.linked_scheduled_task_count)));
  lines.push(line("Conflicts next 24h", String(report.conflict_count_next_24h)));
  lines.push(line("Next upcoming", report.next_upcoming_event?.summary ?? "nothing scheduled"));
  lines.push("");
  lines.push("Sync");
  if (!report.sync) {
    lines.push("No calendar sync has been recorded yet.");
    return lines.join("\n");
  }
  lines.push(line("Status", report.sync.status));
  lines.push(line("Last synced", report.sync.last_synced_at ?? "never"));
  lines.push(line("Last seeded", report.sync.last_seeded_at ?? "never"));
  lines.push(
    line(
      "Last sync duration",
      report.sync.last_sync_duration_ms !== undefined ? `${report.sync.last_sync_duration_ms}ms` : "unknown",
    ),
  );
  lines.push(
    line(
      "Calendars refreshed",
      report.sync.calendars_refreshed_count !== undefined ? String(report.sync.calendars_refreshed_count) : "unknown",
    ),
  );
  lines.push(
    line(
      "Events refreshed",
      report.sync.events_refreshed_count !== undefined ? String(report.sync.events_refreshed_count) : "unknown",
    ),
  );
  if (report.sync.last_error_message) {
    lines.push(line("Last error", report.sync.last_error_message));
  }
  return lines.join("\n");
}

export function formatCalendarSources(sources: CalendarSource[]): string {
  const lines = ["Calendars"];
  if (sources.length === 0) {
    lines.push("No calendars found.");
    return lines.join("\n");
  }
  for (const source of sources) {
    lines.push(
      `${source.calendar_id} | ${source.is_primary ? "primary" : "secondary"} | ${source.is_selected ? "selected" : "unselected"} | ${truncate(source.title)}`,
    );
  }
  return lines.join("\n");
}

export function formatOwnedCalendars(sources: OwnedCalendarSummary[]): string {
  const lines = ["Owned Calendars"];
  if (sources.length === 0) {
    lines.push("No writable owned calendars found.");
    return lines.join("\n");
  }
  for (const source of sources) {
    lines.push(`${source.calendar_id} | ${source.is_primary ? "primary" : "owned"} | ${truncate(source.title)}`);
  }
  return lines.join("\n");
}

export function formatCalendarUpcoming(title: string, events: CalendarEvent[]): string {
  const lines = [title];
  if (events.length === 0) {
    lines.push("No matching calendar events found.");
    return lines.join("\n");
  }
  for (const event of events) {
    lines.push(
      `${event.event_id} | ${event.is_all_day ? "all-day" : event.start_at} | ${event.is_busy ? "busy" : "free"} | ${truncate(event.summary ?? "(untitled event)")}`,
    );
    lines.push(`  next: personal-ops calendar event ${event.event_id}`);
  }
  return lines.join("\n");
}

export function formatCalendarConflicts(conflicts: CalendarConflict[]): string {
  const lines = ["Calendar Conflicts"];
  if (conflicts.length === 0) {
    lines.push("No calendar conflicts found.");
    return lines.join("\n");
  }
  for (const conflict of conflicts) {
    lines.push(
      `${conflict.day} | ${conflict.overlap_start_at} | ${truncate(conflict.left_event.summary ?? "(untitled)")} overlaps ${truncate(conflict.right_event.summary ?? "(untitled)")}`,
    );
    lines.push(`  next: personal-ops calendar day ${conflict.day}`);
  }
  return lines.join("\n");
}

export function formatFreeTimeWindows(day: string, windows: FreeTimeWindow[]): string {
  const lines = [`Free Time: ${day}`];
  if (windows.length === 0) {
    lines.push("No free time windows found.");
    return lines.join("\n");
  }
  for (const window of windows) {
    lines.push(`${window.start_at} -> ${window.end_at} | ${window.duration_minutes}m`);
  }
  return lines.join("\n");
}

export function formatCalendarDayView(view: CalendarDayView): string {
  const lines: string[] = [];
  lines.push(`Calendar Day: ${view.day}`);
  lines.push(line("Workday start", view.workday_start_at));
  lines.push(line("Workday end", view.workday_end_at));
  lines.push(line("Overloaded", yesNo(view.overloaded)));
  lines.push("");
  lines.push("Events");
  if (view.events.length === 0) {
    lines.push("No events found.");
  } else {
    for (const event of view.events) {
      lines.push(`${event.start_at} -> ${event.end_at} | ${truncate(event.summary ?? "(untitled event)")}`);
    }
  }
  lines.push("");
  lines.push("Conflicts");
  if (view.conflicts.length === 0) {
    lines.push("None.");
  } else {
    for (const conflict of view.conflicts) {
      lines.push(`${conflict.overlap_start_at} | ${truncate(conflict.left_event.summary ?? "(untitled)")} overlaps ${truncate(conflict.right_event.summary ?? "(untitled)")}`);
    }
  }
  lines.push("");
  lines.push("Free Time");
  if (view.free_time_windows.length === 0) {
    lines.push("None.");
  } else {
    for (const window of view.free_time_windows) {
      lines.push(`${window.start_at} -> ${window.end_at} | ${window.duration_minutes}m`);
    }
  }
  return lines.join("\n");
}

export function formatCalendarEvent(event: CalendarEvent): string {
  return [
    `Calendar Event: ${event.event_id}`,
    line("Calendar", event.calendar_id),
    line("Provider event", event.provider_event_id),
    line("Summary", event.summary ?? "(untitled event)"),
    line("Start", event.start_at),
    line("End", event.end_at),
    line("All day", yesNo(event.is_all_day)),
    line("Busy", yesNo(event.is_busy)),
    line("Location", event.location ?? "not set"),
    line("Notes", event.notes ?? "not set"),
    line("Organizer", event.organizer_email ?? "not set"),
    line("Attendees", String(event.attendee_count)),
    line("Status", event.status),
    line("Created by personal-ops", yesNo(event.created_by_personal_ops)),
    line("Linked task", event.source_task_id ?? "not linked"),
    line("Last write", event.last_write_at ?? "never"),
  ].join("\n");
}

export function formatCalendarTaskScheduleResult(result: CalendarTaskScheduleResult): string {
  return [
    `Scheduled Task: ${result.task.task_id}`,
    line("Task", result.task.title),
    line("Linked event", result.event.event_id),
    line("Calendar", result.event.calendar_id),
    line("Start", result.event.start_at),
    line("End", result.event.end_at),
    line("Suggested next command", `personal-ops calendar event ${result.event.event_id}`),
  ].join("\n");
}

export function formatTaskItems(title: string, tasks: TaskItem[]): string {
  const lines: string[] = [title];
  if (tasks.length === 0) {
    lines.push("No tasks found.");
    return lines.join("\n");
  }
  for (const task of tasks) {
    const timing = task.due_at ? `due ${task.due_at}` : task.remind_at ? `remind ${task.remind_at}` : "no schedule";
    lines.push(
      `${task.task_id} | ${task.state} | ${task.priority} | ${humanizeKind(task.kind)} | ${timing} | ${truncate(task.title)}`,
    );
    lines.push(`  next: ${suggestedTaskCommand(task)}`);
  }
  return lines.join("\n");
}

export function formatTaskDetail(detail: TaskDetail): string {
  const task = detail.task;
  const lines: string[] = [];
  lines.push(`Task: ${task.task_id}`);
  lines.push(line("Title", task.title));
  lines.push(line("State", task.state));
  lines.push(line("Priority", task.priority));
  lines.push(line("Kind", humanizeKind(task.kind)));
  lines.push(line("Owner", task.owner));
  lines.push(line("Source", task.source));
  lines.push(line("Created", task.created_at));
  lines.push(line("Updated", task.updated_at));
  if (task.due_at) lines.push(line("Due", task.due_at));
  if (task.remind_at) lines.push(line("Remind", task.remind_at));
  if (task.notes) lines.push(line("Notes", task.notes));
  if (task.decision_note) lines.push(line("Decision note", task.decision_note));
  if (task.scheduled_calendar_event_id) lines.push(line("Scheduled event", task.scheduled_calendar_event_id));
  lines.push(line("Suggested next command", suggestedTaskCommand(task)));
  lines.push("");
  lines.push("Recent Audit");
  if (detail.related_audit_events.length === 0) {
    lines.push("No related audit events found.");
  } else {
    for (const event of detail.related_audit_events) {
      lines.push(`${event.timestamp} | ${event.action} | ${event.outcome} | ${event.client_id}`);
    }
  }
  return lines.join("\n");
}

export function formatTaskSuggestions(title: string, suggestions: TaskSuggestion[]): string {
  const lines: string[] = [title];
  if (suggestions.length === 0) {
    lines.push("No task suggestions found.");
    return lines.join("\n");
  }
  for (const suggestion of suggestions) {
    lines.push(
      `${suggestion.suggestion_id} | ${suggestion.status} | ${suggestion.priority} | ${humanizeKind(suggestion.kind)} | ${truncate(suggestion.title)}`,
    );
    lines.push(`  next: personal-ops suggestion show ${suggestion.suggestion_id}`);
  }
  return lines.join("\n");
}

export function formatTaskSuggestionDetail(detail: TaskSuggestionDetail): string {
  const suggestion = detail.suggestion;
  const lines: string[] = [];
  lines.push(`Task Suggestion: ${suggestion.suggestion_id}`);
  lines.push(line("Title", suggestion.title));
  lines.push(line("Status", suggestion.status));
  lines.push(line("Priority", suggestion.priority));
  lines.push(line("Kind", humanizeKind(suggestion.kind)));
  lines.push(line("Suggested by", suggestion.suggested_by_client));
  if (suggestion.due_at) lines.push(line("Due", suggestion.due_at));
  if (suggestion.remind_at) lines.push(line("Remind", suggestion.remind_at));
  if (suggestion.notes) lines.push(line("Notes", suggestion.notes));
  if (suggestion.decision_note) lines.push(line("Decision note", suggestion.decision_note));
  if (detail.accepted_task) lines.push(line("Accepted task", detail.accepted_task.task_id));
  lines.push("");
  lines.push("Recent Audit");
  if (detail.related_audit_events.length === 0) {
    lines.push("No related audit events found.");
  } else {
    for (const event of detail.related_audit_events) {
      lines.push(`${event.timestamp} | ${event.action} | ${event.outcome} | ${event.client_id}`);
    }
  }
  return lines.join("\n");
}

export function formatPlanningRecommendations(title: string, recommendations: PlanningRecommendation[]): string {
  const lines: string[] = [title];
  if (recommendations.length === 0) {
    lines.push("No planning recommendations found.");
    return lines.join("\n");
  }
  for (const recommendation of recommendations) {
    const timing = recommendation.proposed_start_at ? `${recommendation.proposed_start_at} -> ${recommendation.proposed_end_at}` : "no slot";
    lines.push(
      `${recommendation.recommendation_id} | ${recommendation.status} | ${recommendation.priority} | ${humanizeKind(
        recommendation.kind,
      )} | score=${recommendation.rank_score} | ${timing} | ${truncate(recommendation.reason_summary)}`,
    );
    lines.push(`  next: personal-ops recommendation show ${recommendation.recommendation_id}`);
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationGroups(title: string, groups: PlanningRecommendationGroup[]): string {
  const lines: string[] = [title];
  if (groups.length === 0) {
    lines.push("No planning recommendation groups found.");
    return lines.join("\n");
  }
  for (const group of groups) {
    lines.push(
      `${group.group_key} | pending=${group.pending_count} | ready=${group.ready_count} | manual=${group.manual_scheduling_count} | top-score=${group.top_rank_score} | ${group.group_summary}`,
    );
    if (Array.isArray(group.recommendations) && group.recommendations[0]?.recommendation_id) {
      lines.push(`  top: personal-ops recommendation group show ${group.group_key}`);
    }
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationGroupDetail(detail: PlanningRecommendationGroupDetail): string {
  const lines: string[] = [];
  lines.push(`Planning Recommendation Group: ${detail.group_key}`);
  lines.push(line("Kind", detail.group_kind.replaceAll("_", " ")));
  lines.push(line("Summary", detail.group_summary));
  lines.push(line("Pending", String(detail.counts_by_status.pending)));
  lines.push(line("Snoozed", String(detail.counts_by_status.snoozed)));
  lines.push(line("Applied", String(detail.counts_by_status.applied)));
  lines.push(line("Ready", String(detail.counts_by_slot_state.ready)));
  lines.push(line("Manual scheduling", String(detail.counts_by_slot_state.needs_manual_scheduling)));
  lines.push(line("Scheduled outcomes", String(detail.counts_by_outcome_state.scheduled)));
  lines.push(line("Completed outcomes", String(detail.counts_by_outcome_state.completed)));
  lines.push(line("Stale pending", String(detail.stale_pending_count)));
  lines.push(line("Stale scheduled", String(detail.stale_scheduled_count)));
  lines.push(line("Resurfaced sources", String(detail.resurfaced_source_count)));
  lines.push(line("Median open age (h)", detail.median_open_age_hours?.toFixed(1) ?? "n/a"));
  lines.push(line("Closed last 30d", String(detail.closed_last_30d)));
  lines.push(line("Completed last 30d", String(detail.completed_last_30d)));
  lines.push(line("Handled elsewhere last 30d", String(detail.handled_elsewhere_last_30d)));
  lines.push(line("Source resolved last 30d", String(detail.source_resolved_last_30d)));
  lines.push(line("Dominant close reason (30d)", detail.dominant_close_reason_last_30d ?? "none"));
  lines.push(line("Closure meaning", detail.closure_meaning_summary ?? "no recent closure signal"));
  if (detail.next_actionable_recommendation) {
    lines.push(line("Next action", detail.next_actionable_recommendation.recommendation_id));
  }
  if (detail.oldest_unresolved_recommendation) {
    lines.push(line("Oldest unresolved", detail.oldest_unresolved_recommendation.recommendation_id));
  }
  lines.push("");
  lines.push("Members");
  if (detail.recommendations.length === 0) {
    lines.push("No recommendations found.");
  } else {
    for (const recommendation of detail.recommendations) {
      const timing = recommendation.proposed_start_at
        ? `${recommendation.proposed_start_at} -> ${recommendation.proposed_end_at}`
        : "manual scheduling";
      lines.push(
        `${recommendation.recommendation_id} | ${recommendation.status} | ${recommendation.slot_state} | outcome=${recommendation.outcome_state} | score=${recommendation.rank_score} | ${timing}`,
      );
    }
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationSummaryReport(report: PlanningRecommendationSummaryReport): string {
  const lines: string[] = [];
  lines.push("Planning Recommendation Summary");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Open", String(report.open_count)));
  lines.push(line("Stale", String(report.stale_count)));
  lines.push(line("Manual scheduling", String(report.manual_scheduling_count)));
  lines.push(line("Closed last 7d", String(report.closed_last_7d)));
  lines.push(line("Closed last 30d", String(report.closed_last_30d)));
  lines.push(
    line(
      "Most backlogged group",
      report.most_backlogged_group
        ? `${report.most_backlogged_group.summary} (${report.most_backlogged_group.count})`
        : "none",
    ),
  );
  lines.push(
    line(
      "Most completed group",
      report.most_completed_group
        ? `${report.most_completed_group.summary} (${report.most_completed_group.completed_count})`
        : "none",
    ),
  );
  lines.push(
    line(
      "Dominant backlog group",
      report.dominant_backlog_group
        ? `${report.dominant_backlog_group.summary} (${report.dominant_backlog_group.queue_share_pct}%)`
        : "none",
    ),
  );
  lines.push(
    line(
      "Top suppression candidate",
      report.top_suppression_candidate
        ? report.top_suppression_candidate.summary
        : "none",
    ),
  );
  lines.push(line("Review needed count", String(report.review_needed_count)));
  lines.push(
    line(
      "Top review needed candidate",
      report.top_review_needed_candidate ? report.top_review_needed_candidate.summary : "none",
    ),
  );
  lines.push(line("Reviewed fresh", String(report.reviewed_fresh_count)));
  lines.push(line("Reviewed stale (needs follow-through)", String(report.reviewed_stale_count)));
  lines.push(line("Proposal open (tracked, not stale)", String(report.proposal_open_count)));
  lines.push(line("Proposal stale (needs follow-through)", String(report.proposal_stale_count)));
  lines.push(line("Proposal dismissed", String(report.proposal_dismissed_count)));
  lines.push(
    line(
      "Top reviewed stale follow-through",
      report.top_reviewed_stale_candidate ? report.top_reviewed_stale_candidate.summary : "none",
    ),
  );
  lines.push(
    line(
      "Top proposal open (tracked, not stale)",
      report.top_proposal_open_candidate ? report.top_proposal_open_candidate.summary : "none",
    ),
  );
  lines.push(
    line(
      "Top proposal stale follow-through",
      report.top_proposal_stale_candidate ? report.top_proposal_stale_candidate.summary : "none",
    ),
  );
  return lines.join("\n");
}

export function formatPlanningRecommendationBacklogReport(report: PlanningRecommendationBacklogReport): string {
  const lines: string[] = [];
  lines.push("Planning Recommendation Backlog");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Total active", String(report.total_active_count)));
  lines.push(
    line(
      "Filters",
      [
        report.filters.group ? `group=${report.filters.group}` : null,
        report.filters.kind ? `kind=${report.filters.kind}` : null,
        report.filters.source ? `source=${report.filters.source}` : null,
        report.filters.stale_only ? "stale_only=true" : null,
        report.filters.manual_only ? "manual_only=true" : null,
        report.filters.resurfaced_only ? "resurfaced_only=true" : null,
      ]
        .filter(Boolean)
        .join(", ") || "none",
    ),
  );
  lines.push("");
  if (report.groups.length === 0) {
    lines.push("No active planning backlog found.");
    return lines.join("\n");
  }
  for (const group of report.groups) {
    lines.push(`${group.group_key} | active=${group.active_count} | manual=${group.manual_scheduling_count} | stale-pending=${group.stale_pending_count} | stale-scheduled=${group.stale_scheduled_count}`);
    lines.push(`  summary: ${group.group_summary}`);
    lines.push(`  counts: task=${group.counts_by_kind.schedule_task_block}, followup=${group.counts_by_kind.schedule_thread_followup}, prep=${group.counts_by_kind.schedule_event_prep}`);
    lines.push(`  resurfaced=${group.resurfaced_source_count} | median-open-age=${group.median_open_age_hours?.toFixed(1) ?? "n/a"}h | next=${group.top_next_action_summary ?? "none"}`);
    lines.push(`  closed-30d=${group.closed_last_30d} | completed-30d=${group.completed_last_30d} | handled-elsewhere-30d=${group.handled_elsewhere_last_30d} | source-resolved-30d=${group.source_resolved_last_30d}`);
    lines.push(`  dominant-close-reason-30d=${group.dominant_close_reason_last_30d ?? "none"} | queue-share=${group.queue_share_pct}% | dominates=${group.dominates_queue ? "yes" : "no"}`);
    lines.push(`  tuning: review-needed=${group.review_needed_count} | reviewed-stale=${group.reviewed_stale_count} | proposal-open=${group.proposal_open_count} | proposal-stale=${group.proposal_stale_count} | proposal-dismissed=${group.proposal_dismissed_count}`);
    lines.push(`  tuning-summary=${group.tuning_summary ?? "none"}`);
    lines.push(`  closure-meaning=${group.closure_meaning_summary ?? "none"}`);
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationClosureReport(report: PlanningRecommendationClosureReport): string {
  const lines: string[] = [];
  lines.push("Planning Recommendation Closure");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Window (days)", String(report.days)));
  lines.push(
    line(
      "Filters",
      [
        report.filters.group ? `group=${report.filters.group}` : null,
        report.filters.kind ? `kind=${report.filters.kind}` : null,
        report.filters.source ? `source=${report.filters.source}` : null,
        report.filters.close_reason ? `close_reason=${report.filters.close_reason}` : null,
      ]
        .filter(Boolean)
        .join(", ") || "none",
    ),
  );
  lines.push(line("Created", String(report.totals.created_count)));
  lines.push(line("First actions", String(report.totals.first_action_count)));
  lines.push(line("Closed", String(report.totals.closed_count)));
  lines.push(line("Completed", String(report.totals.completed_count)));
  lines.push(line("Canceled", String(report.totals.canceled_count)));
  lines.push(line("Dismissed", String(report.totals.dismissed_count)));
  lines.push(line("Handled elsewhere", String(report.totals.handled_elsewhere_count)));
  lines.push(line("Source resolved", String(report.totals.source_resolved_count)));
  lines.push(line("Median time to first action (m)", report.totals.median_time_to_first_action_minutes?.toFixed(1) ?? "n/a"));
  lines.push(line("Median time to close (m)", report.totals.median_time_to_close_minutes?.toFixed(1) ?? "n/a"));
  lines.push(line("Closure meaning", report.totals.closure_meaning_summary ?? "no recent closure signal"));
  lines.push("");
  lines.push("By Group");
  if (report.by_group.length === 0) {
    lines.push("No recent closure activity.");
  } else {
    for (const breakdown of report.by_group) {
      lines.push(`${breakdown.key} | closed=${breakdown.closed_count} | completed=${breakdown.completed_count} | handled_elsewhere=${breakdown.handled_elsewhere_count} | median-close=${breakdown.median_time_to_close_minutes?.toFixed(1) ?? "n/a"}m`);
      lines.push(`  meaning: ${breakdown.closure_meaning_summary ?? "none"}`);
    }
  }
  lines.push("");
  lines.push("By Close Reason");
  if (report.by_close_reason.length === 0) {
    lines.push("No recent close reasons.");
  } else {
    for (const breakdown of report.by_close_reason) {
      lines.push(`${breakdown.key} | closed=${breakdown.closed_count}`);
    }
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationHygieneReport(report: PlanningRecommendationHygieneReport): string {
  const lines: string[] = [];
  lines.push("Planning Recommendation Hygiene");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Window (days)", String(report.window_days)));
  lines.push(
    line(
      "Filters",
      [
        report.filters.group ? `group=${report.filters.group}` : null,
        report.filters.kind ? `kind=${report.filters.kind}` : null,
        report.filters.source ? `source=${report.filters.source}` : null,
        report.filters.candidate_only ? "candidate_only=true" : null,
        report.filters.review_needed_only ? "review_needed_only=true" : null,
      ]
        .filter(Boolean)
        .join(", ") || "none",
    ),
  );
  lines.push("");
  if (report.families.length === 0) {
    lines.push("No planning hygiene families matched the current filters.");
    return lines.join("\n");
  }
  for (const family of report.families) {
    lines.push(
      `${family.group_key} | kind=${family.kind} | source=${family.source} | open=${family.open_count} | queue-share=${family.queue_share_pct}% | action=${family.recommended_action}`,
    );
    lines.push(`  summary: ${family.summary}`);
    lines.push(
      `  closure-signal=${family.closure_signal} | closed-30d=${family.closed_last_30d} | completed-30d=${family.completed_last_30d} | handled-elsewhere-30d=${family.handled_elsewhere_last_30d} | source-resolved-30d=${family.source_resolved_last_30d}`,
    );
    lines.push(
      `  stale=${family.stale_count} | manual=${family.manual_scheduling_count} | resurfaced=${family.resurfaced_source_count} | dominant-close-reason=${family.dominant_close_reason_last_30d ?? "none"}`,
    );
    lines.push(
      `  signal-updated=${family.signal_updated_at ?? "none"} | review-needed=${family.review_needed ? "yes" : "no"} | last-review=${family.last_review_at ?? "none"}`,
    );
    lines.push(
      `  last-review-decision=${family.last_review_decision ?? "none"} | reviewed-by=${family.last_review_by_client ?? "none"} | actor=${family.last_review_by_actor ?? "none"}`,
    );
    lines.push(
      `  follow-through=${family.follow_through_state ?? "none"} | review-age-days=${family.review_age_days ?? "none"} | proposal-stale=${family.proposal_stale ? "yes" : "no"}`,
    );
    lines.push(
      `  proposal-type=${family.proposal_type ?? "none"} | proposal-status=${family.proposal_status ?? "none"} | proposal-created=${family.proposal_created_at ?? "none"} | proposal-updated=${family.proposal_updated_at ?? "none"}`,
    );
    lines.push(
      `  proposal-by=${family.proposal_by_client ?? "none"} | proposal-actor=${family.proposal_by_actor ?? "none"} | proposal-age-days=${family.proposal_age_days ?? "none"}`,
    );
    lines.push(`  proposal-note=${family.proposal_note ?? "none"}`);
    lines.push(`  review-note=${family.last_review_note ?? "none"}`);
    lines.push(`  review-summary=${family.review_summary ?? "none"}`);
    lines.push(`  closure-meaning=${family.closure_meaning_summary ?? "none"}`);
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationTuningReport(report: PlanningRecommendationTuningReport): string {
  const lines: string[] = [];
  lines.push("Planning Recommendation Tuning");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Review needed", String(report.review_needed_count)));
  lines.push(line("Reviewed fresh", String(report.reviewed_fresh_count)));
  lines.push(line("Reviewed stale (needs follow-through)", String(report.reviewed_stale_count)));
  lines.push(line("Proposal open (tracked, not stale)", String(report.proposal_open_count)));
  lines.push(line("Proposal stale (needs follow-through)", String(report.proposal_stale_count)));
  lines.push(line("Proposal dismissed", String(report.proposal_dismissed_count)));
  lines.push(line("Top review needed", report.top_review_needed_summary ?? "none"));
  lines.push(line("Top reviewed stale follow-through", report.top_reviewed_stale_summary ?? "none"));
  lines.push(line("Top proposal open (tracked, not stale)", report.top_proposal_open_summary ?? "none"));
  lines.push(line("Top proposal stale follow-through", report.top_proposal_stale_summary ?? "none"));
  lines.push("");
  lines.push("Attention Families");
  if (report.attention_families.length === 0) {
    lines.push("No active hygiene families currently need tuning attention.");
  } else {
    for (const family of report.attention_families) {
      lines.push(
        `${family.group_key} | kind=${family.kind} | source=${family.source} | state=${family.follow_through_state} | open=${family.open_count} | queue-share=${family.queue_share_pct}%`,
      );
      lines.push(`  action=${family.recommended_action} | manual=${family.manual_scheduling_count}`);
      lines.push(`  summary: ${family.summary}`);
      lines.push(
        `  signal-updated=${family.signal_updated_at ?? "none"} | last-review=${family.last_review_at ?? "none"} | review-age-days=${family.review_age_days ?? "none"}`,
      );
      lines.push(
        `  proposal-type=${family.proposal_type ?? "none"} | proposal-status=${family.proposal_status ?? "none"} | proposal-updated=${family.proposal_updated_at ?? "none"} | proposal-age-days=${family.proposal_age_days ?? "none"} | proposal-stale=${family.proposal_stale ? "yes" : "no"}`,
      );
    }
  }
  lines.push("");
  lines.push("Recently Closed Families");
  if (report.recently_closed_families.length === 0) {
    lines.push("No recent operator-facing closed-family follow-through history.");
  } else {
    for (const family of report.recently_closed_families) {
      lines.push(
        `${family.group_key} | kind=${family.kind} | source=${family.source} | last-state=${family.last_follow_through_state_before_exit ?? "none"} | last-closed=${family.last_closed_at ?? "none"}`,
      );
      lines.push(`  exit-summary: ${family.exit_summary}`);
      lines.push(
        `  last-review=${family.last_review_at ?? "none"} | last-review-decision=${family.last_review_decision ?? "none"} | proposal-type=${family.proposal_type ?? "none"} | final-proposal-status=${family.final_proposal_status ?? "none"} | proposal-updated=${family.proposal_updated_at ?? "none"}`,
      );
      lines.push(
        `  last-active=${family.last_active_at ?? "none"} | recent-closed=${family.recent_closed_count} | handled-elsewhere=${family.recent_handled_elsewhere_count} | source-resolved=${family.recent_source_resolved_count}`,
      );
    }
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationPolicyReport(report: PlanningRecommendationPolicyReport): string {
  const lines: string[] = [];
  const governanceHygieneWatchlist = report.policy_history_families.filter(
    (item) => item.recommended_action === "review_policy_churn" || item.recommended_action === "prune_old_history",
  );
  lines.push("Planning Recommendation Policy");
  lines.push(line("Generated", report.generated_at));
  lines.push("");
  lines.push("Primary Policy Attention");
  lines.push(line("Kind", report.policy_attention_kind));
  lines.push(line("Summary", report.policy_attention_summary ?? "no active policy attention"));
  lines.push(line("Command", report.policy_attention_command));
  lines.push("");
  lines.push(line("Active proposed", String(report.active_proposed_count)));
  lines.push(line("Active dismissed for now", String(report.active_dismissed_for_now_count)));
  lines.push(line("Archived", String(report.archived_count)));
  lines.push(line("Superseded", String(report.superseded_count)));
  lines.push(line("Recent policy exits", String(report.recent_policy_exit_count)));
  lines.push(line("Retention candidates", String(report.retention_candidate_count)));
  lines.push(line("Policy history families", String(report.policy_history_family_count)));
  lines.push(line("Repeated policy families", String(report.repeated_policy_family_count)));
  lines.push(line("Mixed-outcome policy families", String(report.mixed_outcome_policy_family_count)));
  const cueRows: Array<[string, string]> = [];
  for (const [label, value] of [
    ["Proposed cue", report.top_active_proposed_summary],
    ["Dismissed cue", report.top_active_dismissed_summary],
    ["Archived cue", report.top_archived_summary],
    ["Superseded cue", report.top_superseded_summary],
    ["Recent exit cue", report.top_recent_policy_exit_summary],
    ["Retention cue", report.top_retention_candidate_summary],
    ["Repeated-family cue", report.top_repeated_policy_family_summary],
    ["Mixed-outcome cue", report.top_mixed_outcome_policy_family_summary],
  ] as Array<[string, string | null | undefined]>) {
    if (value === null || value === undefined) continue;
    if (value.trim().toLowerCase() === "none") continue;
    cueRows.push([label, value]);
  }
  for (const [label, value] of cueRows) {
    lines.push(line(label, value));
  }
  lines.push("");
  lines.push("Active Policy Backlog");
  if (report.active_policy_backlog.length === 0) {
    lines.push("No active policy-backed families currently need governance attention.");
  } else {
    for (const family of report.active_policy_backlog) {
      lines.push(
        `${family.group_key} | kind=${family.kind} | source=${family.source} | state=${family.follow_through_state} | proposal-status=${family.proposal_status} | open=${family.open_count} | queue-share=${family.queue_share_pct}%`,
      );
      lines.push(`  attention: ${family.summary}`);
      lines.push(
        `  proposal-type=${family.proposal_type} | proposal-updated=${family.proposal_updated_at ?? "none"} | proposal-age-days=${family.proposal_age_days ?? "none"} | proposal-stale=${family.proposal_stale ? "yes" : "no"}`,
      );
      lines.push(
        `  last-review=${family.last_review_at ?? "none"} | last-review-decision=${family.last_review_decision ?? "none"}`,
      );
    }
  }
  lines.push("");
  lines.push("Recent Policy Exits");
  if (report.recent_policy_exits.length === 0) {
    lines.push("No inactive proposal-backed families currently need archive or supersede judgment.");
  } else {
    for (const item of report.recent_policy_exits) {
      lines.push(
        `${item.group_key} | kind=${item.kind} | source=${item.source} | last-state=${item.last_follow_through_state ?? "none"} | last-closed=${item.last_closed_at ?? "none"}`,
      );
      lines.push(`  attention: ${item.exit_summary}`);
      lines.push(
        `  proposal-type=${item.proposal_type ?? "none"} | proposal-status=${item.proposal_status ?? "none"} | last-review=${item.last_review_at ?? "none"} | proposal-updated=${item.proposal_updated_at ?? "none"} | last-active=${item.last_active_at ?? "none"}`,
      );
    }
  }
  lines.push("");
  lines.push("Governance Hygiene Watchlist");
  if (governanceHygieneWatchlist.length === 0) {
    lines.push("No policy-history families currently show churn or prune pressure.");
  } else {
    for (const item of governanceHygieneWatchlist) {
      lines.push(
        `${item.group_key} | kind=${item.kind} | source=${item.source} | action=${item.recommended_action} | total-events=${item.total_governance_events} | mixed=${item.has_mixed_governance_outcomes ? "yes" : "no"}`,
      );
      lines.push(`  attention: ${item.summary}`);
      lines.push(
        `  archived=${item.archived_count} | superseded=${item.superseded_count} | recent-30d=${item.recent_governance_events_30d} | recent-90d=${item.recent_governance_events_90d}`,
      );
      lines.push(
        `  latest-event=${item.latest_governance_event_type} | latest-recorded=${item.latest_governance_recorded_at} | proposal-type=${item.proposal_type ?? "none"} | latest-final-proposal-status=${item.latest_final_proposal_status ?? "none"}`,
      );
    }
  }
  lines.push("");
  lines.push("Compressed Policy History By Family");
  if (report.policy_history_families.length === 0) {
    lines.push("No long-horizon policy governance history has been recorded.");
  } else {
    for (const item of report.policy_history_families) {
      lines.push(
        `${item.group_key} | kind=${item.kind} | source=${item.source} | action=${item.recommended_action} | total-events=${item.total_governance_events} | mixed=${item.has_mixed_governance_outcomes ? "yes" : "no"}`,
      );
      lines.push(`  history: ${item.summary}`);
      lines.push(
        `  archived=${item.archived_count} | superseded=${item.superseded_count} | first-recorded=${item.first_governance_recorded_at} | latest-recorded=${item.latest_governance_recorded_at}`,
      );
      lines.push(
        `  recent-30d=${item.recent_governance_events_30d} | recent-90d=${item.recent_governance_events_90d} | last-active=${item.last_active_at ?? "none"} | last-closed=${item.last_closed_at ?? "none"}`,
      );
      lines.push(`  governance-event-ids=${item.governance_event_ids.join(", ") || "none"}`);
    }
  }
  lines.push("");
  lines.push("Recent Raw Governance Events");
  if (report.policy_history_recent_events.length === 0) {
    lines.push("No raw governance events are currently available.");
  } else {
    for (const item of report.policy_history_recent_events) {
      lines.push(
        `${item.group_key} | kind=${item.kind} | source=${item.source} | event=${item.governance_event_type} | recorded=${item.governance_recorded_at}`,
      );
      lines.push(`  event-summary: ${item.summary}`);
      lines.push(
        `  proposal-type=${item.proposal_type ?? "none"} | final-proposal-status=${item.final_proposal_status ?? "none"} | last-follow-through=${item.last_follow_through_state ?? "none"}`,
      );
      lines.push(
        `  recorded-by=${item.governance_recorded_by_client} | actor=${item.governance_recorded_by_actor ?? "none"} | note=${item.governance_note ?? "none"}`,
      );
      lines.push(
        `  basis-signal-updated=${item.basis_signal_updated_at ?? "none"} | last-review=${item.last_review_at ?? "none"} | proposal-updated=${item.proposal_updated_at ?? "none"} | last-active=${item.last_active_at ?? "none"} | last-closed=${item.last_closed_at ?? "none"}`,
      );
    }
  }
  lines.push("");
  lines.push("Retention Candidates");
  if (report.retention_candidates.length === 0) {
    lines.push("No archived or superseded policy history currently needs retention review.");
  } else {
    for (const item of report.retention_candidates) {
      lines.push(
        `${item.group_key} | kind=${item.kind} | source=${item.source} | event=${item.governance_event_type} | recorded=${item.governance_recorded_at} | age-days=${item.age_days}`,
      );
      lines.push(`  retention: ${item.summary}`);
    }
    lines.push('  next: personal-ops recommendation policy prune --older-than-days 30 --event-type superseded --dry-run');
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationPolicyPruneResult(
  result: PlanningRecommendationPolicyPruneResult,
): string {
  const lines: string[] = [];
  lines.push("Planning Recommendation Policy Prune");
  lines.push(line("Dry run", yesNo(result.dry_run)));
  lines.push(line("Older than days", String(result.older_than_days)));
  lines.push(line("Event type", result.event_type));
  lines.push(line("Candidate count", String(result.candidate_count)));
  lines.push(line("Pruned count", String(result.pruned_count)));
  if (result.candidates.length === 0) {
    lines.push("No matching governance history rows were found.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("Candidates");
  for (const item of result.candidates) {
    lines.push(
      `${item.group_key} | kind=${item.kind} | source=${item.source} | event=${item.governance_event_type} | recorded=${item.governance_recorded_at} | age-days=${item.age_days}`,
    );
    lines.push(`  summary: ${item.summary}`);
  }
  return lines.join("\n");
}

export function formatPlanningRecommendationDetail(detail: PlanningRecommendationDetail): string {
  const recommendation = detail.recommendation;
  const lines: string[] = [];
  lines.push(`Planning Recommendation: ${recommendation.recommendation_id}`);
  lines.push(line("Kind", humanizeKind(recommendation.kind)));
  lines.push(line("Status", recommendation.status));
  lines.push(line("Priority", recommendation.priority));
  lines.push(line("Source", recommendation.source));
  lines.push(line("Suggested by", recommendation.suggested_by_client));
  lines.push(line("Reason", recommendation.reason_summary));
  lines.push(line("Rank score", String(recommendation.rank_score)));
  if (detail.ranking_reason) lines.push(line("Rank reason", detail.ranking_reason));
  if (recommendation.group_key) lines.push(line("Group", recommendation.group_key));
  if (recommendation.group_summary) lines.push(line("Group summary", recommendation.group_summary));
  if (recommendation.source_last_seen_at) lines.push(line("Source last seen", recommendation.source_last_seen_at));
  lines.push(line("Outcome state", recommendation.outcome_state));
  if (recommendation.outcome_recorded_at) lines.push(line("Outcome recorded", recommendation.outcome_recorded_at));
  if (recommendation.outcome_source) lines.push(line("Outcome source", recommendation.outcome_source));
  if (recommendation.outcome_summary) lines.push(line("Outcome summary", recommendation.outcome_summary));
  lines.push(line("Slot state", recommendation.slot_state));
  if (recommendation.slot_state_reason) lines.push(line("Slot state reason", recommendation.slot_state_reason));
  if (detail.slot_reason) lines.push(line("Slot reason", detail.slot_reason));
  if (recommendation.proposed_start_at) lines.push(line("Proposed start", recommendation.proposed_start_at));
  if (recommendation.proposed_end_at) lines.push(line("Proposed end", recommendation.proposed_end_at));
  if (recommendation.proposed_calendar_id) lines.push(line("Proposed calendar", recommendation.proposed_calendar_id));
  if (recommendation.proposed_title) lines.push(line("Proposed title", recommendation.proposed_title));
  if (recommendation.proposed_notes) lines.push(line("Proposed notes", recommendation.proposed_notes));
  if (recommendation.source_task_id) lines.push(line("Source task", recommendation.source_task_id));
  if (recommendation.source_thread_id) lines.push(line("Source thread", recommendation.source_thread_id));
  if (recommendation.source_calendar_event_id) lines.push(line("Source event", recommendation.source_calendar_event_id));
  if (recommendation.applied_task_id) lines.push(line("Applied task", recommendation.applied_task_id));
  if (recommendation.applied_calendar_event_id) lines.push(line("Applied event", recommendation.applied_calendar_event_id));
  if (detail.applied_task_current_state) lines.push(line("Applied task state", detail.applied_task_current_state));
  lines.push(line("Source resolved", detail.source_resolved_since_created ? "yes" : "no"));
  if (recommendation.snoozed_until) lines.push(line("Snoozed until", recommendation.snoozed_until));
  lines.push(line("Replan count", String(recommendation.replan_count)));
  if (recommendation.last_replanned_at) lines.push(line("Last replanned", recommendation.last_replanned_at));
  if (recommendation.decision_reason_code) lines.push(line("Decision reason", recommendation.decision_reason_code));
  if (recommendation.decision_note) lines.push(line("Decision note", recommendation.decision_note));
  if (recommendation.last_error_message) lines.push(line("Last error", recommendation.last_error_message));
  if (detail.trigger_signals.length > 0) lines.push(line("Trigger signals", detail.trigger_signals.join(", ")));
  if (detail.suppressed_signals.length > 0) lines.push(line("Suppressed signals", detail.suppressed_signals.join(", ")));
  lines.push("");
  lines.push("Recent Audit");
  if (detail.related_audit_events.length === 0) {
    lines.push("No related audit events found.");
  } else {
    for (const event of detail.related_audit_events) {
      lines.push(`${event.timestamp} | ${event.action} | ${event.outcome} | ${event.client_id}`);
    }
  }
  return lines.join("\n");
}
