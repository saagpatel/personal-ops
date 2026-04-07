import type { ReviewPackage, ReviewPackageReport, ReviewTuningProposal, ReviewTuningReport } from "../types.js";
import { line } from "./shared.js";

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
