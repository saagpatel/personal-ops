import type {
  PlanningRecommendation,
  PlanningRecommendationBacklogReport,
  PlanningRecommendationClosureReport,
  PlanningRecommendationDetail,
  PlanningRecommendationGroup,
  PlanningRecommendationGroupDetail,
  PlanningRecommendationHygieneReport,
  PlanningRecommendationPolicyPruneResult,
  PlanningRecommendationPolicyReport,
  PlanningRecommendationSummaryReport,
  PlanningRecommendationTuningReport,
} from "../types.js";
import { humanizeKind, line, truncate, yesNo } from "./shared.js";

export function formatPlanningRecommendations(title: string, recommendations: PlanningRecommendation[]): string {
  const lines: string[] = [title];
  if (recommendations.length === 0) {
    lines.push("No planning recommendations found.");
    return lines.join("\n");
  }
  for (const recommendation of recommendations) {
    const timing = recommendation.proposed_start_at
      ? `${recommendation.proposed_start_at} -> ${recommendation.proposed_end_at}`
      : "no slot";
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
      report.most_backlogged_group ? `${report.most_backlogged_group.summary} (${report.most_backlogged_group.count})` : "none",
    ),
  );
  lines.push(
    line(
      "Most completed group",
      report.most_completed_group ? `${report.most_completed_group.summary} (${report.most_completed_group.completed_count})` : "none",
    ),
  );
  lines.push(
    line(
      "Dominant backlog group",
      report.dominant_backlog_group ? `${report.dominant_backlog_group.summary} (${report.dominant_backlog_group.queue_share_pct}%)` : "none",
    ),
  );
  lines.push(line("Top suppression candidate", report.top_suppression_candidate ? report.top_suppression_candidate.summary : "none"));
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
