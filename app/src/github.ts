import type {
  GithubAccount,
  GithubCheckState,
  GithubPullRequest,
  GithubReviewState,
} from "./types.js";

const GITHUB_API_BASE = "https://api.github.com";

interface GithubRequestOptions {
  method?: string;
  body?: unknown;
}

interface GithubUserResponse {
  id: number;
  login: string;
}

interface GithubPullListItem {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  state: string;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  requested_reviewers?: Array<{ login: string }>;
  head: { sha: string };
}

interface GithubPullDetailResponse extends GithubPullListItem {
  mergeable_state?: string | null;
}

interface GithubReviewResponse {
  state?: string | null;
  submitted_at?: string | null;
}

interface GithubCheckRunsResponse {
  check_runs?: Array<{
    status?: string | null;
    conclusion?: string | null;
  }>;
}

interface GithubCombinedStatusResponse {
  state?: string | null;
  statuses?: Array<{
    state?: string | null;
  }>;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "personal-ops",
    "x-github-api-version": "2022-11-28",
  };
}

async function githubRequest<T>(pathname: string, token: string, options: GithubRequestOptions = {}): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      ...githubHeaders(token),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`GitHub API ${response.status}: ${raw || response.statusText}`);
  }
  return (await response.json()) as T;
}

function parseRepo(fullName: string): { owner: string; repo: string; repository: string } | null {
  const normalized = fullName.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "");
  const [owner, repo] = normalized.split("/");
  if (!owner || !repo || normalized.split("/").length !== 2) {
    return null;
  }
  return { owner, repo, repository: `${owner}/${repo}` };
}

function latestReviewState(reviews: GithubReviewResponse[]): GithubReviewState {
  const ordered = [...reviews]
    .filter((review) => review.state && review.submitted_at)
    .sort((left, right) => Date.parse(String(right.submitted_at)) - Date.parse(String(left.submitted_at)));
  const latest = ordered[0]?.state?.toUpperCase();
  if (!latest) {
    return "unknown";
  }
  if (latest === "CHANGES_REQUESTED") {
    return "changes_requested";
  }
  if (latest === "APPROVED") {
    return "approved";
  }
  if (latest === "COMMENTED") {
    return "commented";
  }
  return "unknown";
}

function deriveCheckState(checkRuns: GithubCheckRunsResponse, combinedStatus: GithubCombinedStatusResponse): GithubCheckState {
  const runs = checkRuns.check_runs ?? [];
  const runConclusions = runs.map((run) => `${run.status ?? ""}:${run.conclusion ?? ""}`.toLowerCase());
  if (
    runConclusions.some((value) =>
      ["completed:failure", "completed:timed_out", "completed:cancelled", "completed:action_required", "completed:start_up_failure"].includes(
        value,
      ),
    )
  ) {
    return "failing";
  }
  if (combinedStatus.state === "failure" || combinedStatus.state === "error") {
    return "failing";
  }
  if (runConclusions.some((value) => value.startsWith("queued:") || value.startsWith("in_progress:"))) {
    return "pending";
  }
  if (combinedStatus.state === "pending") {
    return "pending";
  }
  if (runConclusions.some((value) => value === "completed:success") || combinedStatus.state === "success") {
    return "success";
  }
  return "unknown";
}

function deriveAttentionKind(input: {
  requestedReviewers: string[];
  viewerLogin: string;
  authoredByViewer: boolean;
  reviewState: GithubReviewState;
  checkState: GithubCheckState;
  isDraft: boolean;
  mergeableState?: string | null;
}): GithubPullRequest["attention_kind"] {
  if (input.requestedReviewers.includes(input.viewerLogin)) {
    return "github_review_requested";
  }
  if (!input.authoredByViewer) {
    return undefined;
  }
  if (input.checkState === "failing") {
    return "github_pr_checks_failing";
  }
  if (input.reviewState === "changes_requested") {
    return "github_pr_changes_requested";
  }
  if (
    !input.isDraft &&
    input.checkState === "success" &&
    ["clean", "has_hooks", "unstable"].includes((input.mergeableState ?? "").toLowerCase())
  ) {
    return "github_pr_merge_ready";
  }
  return undefined;
}

function deriveAttentionSummary(pr: Pick<GithubPullRequest, "attention_kind" | "title" | "repository" | "number">): string | undefined {
  const prefix = `${pr.repository}#${pr.number}`;
  switch (pr.attention_kind) {
    case "github_review_requested":
      return `Review requested: ${prefix} ${pr.title}`;
    case "github_pr_checks_failing":
      return `Checks failing: ${prefix} ${pr.title}`;
    case "github_pr_changes_requested":
      return `Changes requested: ${prefix} ${pr.title}`;
    case "github_pr_merge_ready":
      return `Merge ready: ${prefix} ${pr.title}`;
    default:
      return undefined;
  }
}

export function formatGithubPrKey(repository: string, number: number): string {
  return `${repository}#${number}`;
}

export function parseGithubPrKey(prKey: string): { owner: string; repo: string; repository: string; number: number } | null {
  const match = prKey.trim().match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    owner: match[1] ?? "",
    repo: match[2] ?? "",
    repository: `${match[1]}/${match[2]}`,
    number: Number(match[3]),
  };
}

export async function verifyGithubToken(token: string, keychainService: string): Promise<GithubAccount> {
  const profile = await githubRequest<GithubUserResponse>("/user", token);
  const now = new Date().toISOString();
  return {
    login: profile.login,
    keychain_service: keychainService,
    keychain_account: profile.login,
    connected_at: now,
    updated_at: now,
    profile_json: JSON.stringify(profile),
  };
}

export async function syncGithubPullRequests(
  token: string,
  repositories: string[],
  viewerLogin: string,
): Promise<{ repositories_scanned_count: number; pull_requests: GithubPullRequest[] }> {
  const pullRequests: GithubPullRequest[] = [];
  let repositoriesScanned = 0;
  for (const rawRepository of repositories) {
    const parsedRepository = parseRepo(rawRepository);
    if (!parsedRepository) {
      continue;
    }
    repositoriesScanned += 1;
    const list = await githubRequest<GithubPullListItem[]>(
      `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}/pulls?state=open&per_page=100`,
      token,
    );
    for (const listedPr of list) {
      const detail = await githubRequest<GithubPullDetailResponse>(
        `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}/pulls/${listedPr.number}`,
        token,
      );
      const requestedReviewers = (detail.requested_reviewers ?? []).map((reviewer) => reviewer.login).filter(Boolean);
      const authoredByViewer = detail.user?.login === viewerLogin;
      let reviewState: GithubReviewState = requestedReviewers.includes(viewerLogin) ? "review_requested" : "unknown";
      let checkState: GithubCheckState = "unknown";
      if (authoredByViewer) {
        const [reviews, checkRuns, combinedStatus] = await Promise.all([
          githubRequest<GithubReviewResponse[]>(
            `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}/pulls/${listedPr.number}/reviews?per_page=100`,
            token,
          ),
          githubRequest<GithubCheckRunsResponse>(
            `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}/commits/${encodeURIComponent(detail.head.sha)}/check-runs?per_page=100`,
            token,
          ),
          githubRequest<GithubCombinedStatusResponse>(
            `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}/commits/${encodeURIComponent(detail.head.sha)}/status`,
            token,
          ),
        ]);
        reviewState = latestReviewState(reviews);
        checkState = deriveCheckState(checkRuns, combinedStatus);
      }
      const attentionKind = deriveAttentionKind({
        requestedReviewers,
        viewerLogin,
        authoredByViewer,
        reviewState,
        checkState,
        isDraft: detail.draft,
        ...(detail.mergeable_state === undefined ? {} : { mergeableState: detail.mergeable_state }),
      });
      pullRequests.push({
        pr_key: formatGithubPrKey(parsedRepository.repository, detail.number),
        repository: parsedRepository.repository,
        owner: parsedRepository.owner,
        repo: parsedRepository.repo,
        number: detail.number,
        title: detail.title,
        html_url: detail.html_url,
        author_login: detail.user?.login ?? "unknown",
        is_draft: detail.draft,
        state: detail.state,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
        requested_reviewers: requestedReviewers,
        head_sha: detail.head.sha,
        check_state: checkState,
        review_state: reviewState,
        mergeable_state: detail.mergeable_state ?? undefined,
        is_review_requested: requestedReviewers.includes(viewerLogin),
        is_authored_by_viewer: authoredByViewer,
        attention_kind: attentionKind,
        attention_summary: deriveAttentionSummary({
          attention_kind: attentionKind,
          title: detail.title,
          repository: parsedRepository.repository,
          number: detail.number,
        }),
      });
    }
  }
  pullRequests.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  return {
    repositories_scanned_count: repositoriesScanned,
    pull_requests: pullRequests,
  };
}
