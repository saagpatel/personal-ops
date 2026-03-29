import type { GithubPullRequest, GithubStatusReport } from "../types.js";

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

function summarizePull(pullRequest: GithubPullRequest): string {
  const parts = [
    `${pullRequest.repository}#${pullRequest.number}`,
    pullRequest.title,
    `author ${pullRequest.author_login}`,
    `checks ${pullRequest.check_state}`,
    `review ${pullRequest.review_state}`,
  ];
  if (pullRequest.attention_kind) {
    parts.push(`attention ${pullRequest.attention_kind}`);
  }
  return parts.join(" · ");
}

export function formatGithubStatus(report: GithubStatusReport): string {
  return [
    "GitHub Status",
    line("Enabled", report.enabled ? "yes" : "no"),
    line("Connected login", report.connected_login ?? "not connected"),
    line("Authenticated", report.authenticated ? "yes" : "no"),
    line("Sync status", report.sync_status),
    line("Last synced", report.last_synced_at ?? "not yet"),
    line("Included repositories", String(report.included_repository_count)),
    line("Review requests", String(report.review_requested_count)),
    line("Authored PR attention", String(report.authored_pr_attention_count)),
    line("Top item", report.top_item_summary ?? "nothing notable"),
  ].join("\n");
}

export function formatGithubPullRequests(title: string, pullRequests: GithubPullRequest[]): string {
  if (pullRequests.length === 0) {
    return `${title}\nNo GitHub pull requests need attention right now.`;
  }
  return [
    title,
    ...pullRequests.map((pullRequest) => `- ${summarizePull(pullRequest)}`),
  ].join("\n");
}

export function formatGithubPullDetail(pullRequest: GithubPullRequest): string {
  return [
    "GitHub Pull Request",
    line("PR", `${pullRequest.repository}#${pullRequest.number}`),
    line("Title", pullRequest.title),
    line("URL", pullRequest.html_url),
    line("Author", pullRequest.author_login),
    line("Draft", pullRequest.is_draft ? "yes" : "no"),
    line("State", pullRequest.state),
    line("Checks", pullRequest.check_state),
    line("Review", pullRequest.review_state),
    line("Mergeable", pullRequest.mergeable_state ?? "unknown"),
    line("Review requested", pullRequest.is_review_requested ? "yes" : "no"),
    line("Authored by viewer", pullRequest.is_authored_by_viewer ? "yes" : "no"),
    line("Attention", pullRequest.attention_kind ?? "none"),
    line("Updated", pullRequest.updated_at),
  ].join("\n");
}
