import type {
  ReviewImpactReport,
  ReviewPackage,
  ReviewPackageReport,
  ReviewReport,
  ReviewTrendsReport,
  ReviewTuningProposal,
  ReviewTuningReport,
  ReviewWeeklyReport,
} from "../types.js";
import { line } from "./shared.js";

function asPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPackage(pkg: ReviewPackage): string[] {
  const lines: string[] = [];
  lines.push(`${pkg.package_id} | ${pkg.surface} | ${pkg.state} | ${pkg.summary}`);
  lines.push(`  why now: ${pkg.why_now}`);
  lines.push(`  score: ${pkg.score_band} | prepared: ${pkg.prepared_at} | stale: ${pkg.stale_at}`);
  for (const item of pkg.items) {
    lines.push(`  item: ${item.item_type} ${item.item_id} | ${item.underlying_state} | ${item.title}`);
    lines.push(`    summary: ${item.summary}`);
    lines.push(`    next: ${item.command}`);
    if (item.current_feedback_reason) {
      lines.push(`    feedback: ${item.current_feedback_reason}`);
    }
  }
  for (const command of pkg.next_commands) {
    lines.push(`  next: ${command}`);
  }
  return lines;
}

export function formatReviewPackageReport(report: ReviewPackageReport): string {
  const lines: string[] = [];
  lines.push("Review Packages");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Readiness", report.readiness));
  lines.push(line("Refresh state", report.refresh_state));
  lines.push(line("Refreshed", report.refreshed_at ?? "never"));
  lines.push(line("Last trigger", report.last_refresh_trigger ?? "none"));
  lines.push(line("Summary", report.summary));
  lines.push(line("Open tuning proposals", String(report.open_tuning_proposal_count)));
  lines.push(line("Unused stale (7d)", String(report.unused_package_count_7d)));
  if (report.top_item_summary) {
    lines.push(line("Top package", report.top_item_summary));
  }
  lines.push("");
  if (report.packages.length === 0) {
    lines.push("No review packages are active right now.");
    return lines.join("\n");
  }
  for (const pkg of report.packages) {
    lines.push(`- ${formatPackage(pkg)[0]}`);
    for (const detail of formatPackage(pkg).slice(1)) {
      lines.push(detail);
    }
  }
  return lines.join("\n");
}

export function formatReviewPackage(pkg: ReviewPackage): string {
  return ["Review Package", ...formatPackage(pkg)].join("\n");
}

function formatProposal(proposal: ReviewTuningProposal): string[] {
  const lines: string[] = [];
  lines.push(`${proposal.proposal_id} | ${proposal.proposal_kind} | ${proposal.surface} | ${proposal.status}`);
  lines.push(`  summary: ${proposal.summary}`);
  lines.push(
    `  evidence: total=${proposal.evidence_count} | negative=${proposal.negative_count} | positive=${proposal.positive_count} | stale-unused=${proposal.unused_stale_count}`,
  );
  lines.push(`  scope: ${proposal.scope_key} | expires: ${proposal.expires_at}`);
  if (proposal.approved_note) {
    lines.push(`  approved: ${proposal.approved_note}`);
  }
  if (proposal.dismissed_note) {
    lines.push(`  dismissed: ${proposal.dismissed_note}`);
  }
  return lines;
}

export function formatReviewTuningReport(report: ReviewTuningReport): string {
  const lines: string[] = [];
  lines.push("Review Tuning");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Refresh state", report.refresh_state));
  lines.push(line("Refreshed", report.refreshed_at ?? "never"));
  lines.push(line("Last trigger", report.last_refresh_trigger ?? "none"));
  lines.push(line("Summary", report.summary));
  lines.push(line("Open proposals", String(report.open_proposal_count)));
  lines.push("");
  if (report.proposals.length === 0) {
    lines.push("No review tuning proposals are open right now.");
    return lines.join("\n");
  }
  for (const proposal of report.proposals) {
    lines.push(`- ${formatProposal(proposal)[0]}`);
    for (const detail of formatProposal(proposal).slice(1)) {
      lines.push(detail);
    }
  }
  return lines.join("\n");
}

export function formatReviewReport(report: ReviewReport): string {
  const lines: string[] = [];
  lines.push("Review Report");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Window", `${report.window_days} days`));
  lines.push(line("Created", String(report.summary.created_count)));
  lines.push(line("Opened", `${report.summary.opened_count} (${asPercent(report.summary.open_rate)})`));
  lines.push(line("Acted on", `${report.summary.acted_on_count} (${asPercent(report.summary.acted_on_rate)})`));
  lines.push(line("Completed", String(report.summary.completed_count)));
  lines.push(line("Stale unused", `${report.summary.stale_unused_count} (${asPercent(report.summary.stale_unused_rate)})`));
  lines.push(
    line(
      "Notification action conversion",
      asPercent(report.summary.notification_action_conversion_rate),
    ),
  );
  lines.push("");
  lines.push("Surfaces");
  for (const surface of report.surfaces) {
    lines.push(
      `- ${surface.surface}: created=${surface.created_count} | opened=${asPercent(surface.open_rate)} | acted=${asPercent(surface.acted_on_rate)} | stale-unused=${asPercent(surface.stale_unused_rate)} | notifications fired=${surface.fired_notification_count} suppressed=${surface.suppressed_notification_count}`,
    );
  }
  lines.push("");
  lines.push("Proposal Outcomes");
  lines.push(line("Proposed", String(report.proposal_outcomes.proposed_count)));
  lines.push(line("Approved", String(report.proposal_outcomes.approved_count)));
  lines.push(line("Dismissed", String(report.proposal_outcomes.dismissed_count)));
  lines.push(line("Reopened", String(report.proposal_outcomes.reopened_count)));
  lines.push("");
  lines.push("Notification Performance");
  lines.push(line("Fired", String(report.notification_performance.fired_count)));
  lines.push(line("Suppressed", String(report.notification_performance.suppressed_count)));
  lines.push(line("Cooldown hits", String(report.notification_performance.cooldown_hit_count)));
  lines.push(line("Open conversion", asPercent(report.notification_performance.notification_open_conversion_rate)));
  lines.push(line("Action conversion", asPercent(report.notification_performance.notification_action_conversion_rate)));
  lines.push("");
  lines.push("Top Noisy Sources");
  if (report.top_noisy_sources.length === 0) {
    lines.push("No noisy sources in the selected window.");
  } else {
    for (const source of report.top_noisy_sources) {
      lines.push(
        `- ${source.surface} ${source.scope_key} | negative=${source.negative_feedback_count} | stale-unused=${source.stale_unused_count} | rate=${asPercent(source.negative_feedback_rate)} | ${source.latest_summary ?? "no summary"}`,
      );
    }
  }
  return lines.join("\n");
}

export function formatReviewTrendsReport(report: ReviewTrendsReport): string {
  const lines: string[] = [];
  lines.push("Review Trends");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Window", `${report.days} days`));
  lines.push(line("Latest snapshot", report.summary.latest_snapshot_date ?? "none"));
  lines.push(line("Average open rate", asPercent(report.summary.average_open_rate)));
  lines.push(line("Average acted-on rate", asPercent(report.summary.average_acted_on_rate)));
  lines.push(line("Average stale-unused rate", asPercent(report.summary.average_stale_unused_rate)));
  lines.push(
    line(
      "Average notification action conversion",
      asPercent(report.summary.average_notification_action_conversion_rate),
    ),
  );
  lines.push(line("WoW open delta", asPercent(report.summary.week_over_week_open_rate_delta)));
  lines.push(line("WoW action delta", asPercent(report.summary.week_over_week_action_rate_delta)));
  lines.push(line("WoW stale-unused delta", asPercent(report.summary.week_over_week_stale_unused_rate_delta)));
  lines.push(
    line(
      "WoW notification action delta",
      asPercent(report.summary.week_over_week_notification_action_conversion_delta),
    ),
  );
  lines.push(line("Top trend surface", report.summary.top_review_trend_surface ?? "none"));
  lines.push("");
  if (report.points.length === 0) {
    lines.push("No review trend snapshots are available in this window.");
    return lines.join("\n");
  }
  for (const point of report.points) {
    lines.push(
      `- ${point.snapshot_date}: opened=${asPercent(point.open_rate)} | acted=${asPercent(point.acted_on_rate)} | stale-unused=${asPercent(point.stale_unused_rate)} | notification action=${asPercent(point.notification_action_conversion_rate)}`,
    );
  }
  return lines.join("\n");
}

export function formatReviewImpactReport(report: ReviewImpactReport): string {
  const lines: string[] = [];
  lines.push("Review Impact");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Window", `${report.days} days`));
  lines.push("");
  if (report.comparisons.length === 0) {
    lines.push("No approved review tuning comparisons are available in this window.");
    return lines.join("\n");
  }
  for (const comparison of report.comparisons) {
    lines.push(
      `- ${comparison.proposal_id} | ${comparison.proposal_kind} | ${comparison.surface} | ${comparison.confidence}`,
    );
    lines.push(`  summary: ${comparison.summary}`);
    lines.push(
      `  deltas: open=${asPercent(comparison.open_rate_delta)} | acted=${asPercent(comparison.acted_on_rate_delta)} | stale-unused=${asPercent(comparison.stale_unused_rate_delta)} | notification fire=${asPercent(comparison.notification_fire_rate_delta)} | notification action=${asPercent(comparison.notification_action_conversion_delta)}`,
    );
  }
  return lines.join("\n");
}

export function formatReviewWeeklyReport(report: ReviewWeeklyReport): string {
  const lines: string[] = [];
  lines.push("Review Weekly");
  lines.push(line("Generated", report.generated_at));
  lines.push(line("Window", `${report.days} days`));
  lines.push(line("WoW open delta", asPercent(report.week_over_week_open_rate_delta)));
  lines.push(line("WoW action delta", asPercent(report.week_over_week_action_rate_delta)));
  lines.push(
    line(
      "WoW notification action delta",
      asPercent(report.week_over_week_notification_action_conversion_delta),
    ),
  );
  lines.push(line("Top trend surface", report.top_review_trend_surface ?? "none"));
  lines.push("");
  lines.push("Surfaces");
  for (const surface of report.surfaces) {
    lines.push(
      `- ${surface.surface}: open delta=${asPercent(surface.open_rate_delta)} | action delta=${asPercent(surface.acted_on_rate_delta)} | stale-unused delta=${asPercent(surface.stale_unused_rate_delta)} | notification action delta=${asPercent(surface.notification_action_conversion_delta)}`,
    );
  }
  lines.push("");
  lines.push("Recommendations");
  if (report.recommendations.length === 0) {
    lines.push("No weekly review recommendations are available yet.");
  } else {
    for (const recommendation of report.recommendations) {
      lines.push(`- ${recommendation.kind}: ${recommendation.message}`);
    }
  }
  return lines.join("\n");
}
