import type {
  AutopilotStatusReport,
  ApprovalDetail,
  ApprovalRequest,
  AssistantActionItem,
  AssistantActionQueueReport,
  AssistantActionRunResult,
  AttentionItem,
  AuditEvent,
  AuditEventCategory,
  DoctorReport,
  DraftArtifact,
  GithubPullRequest,
  InboxAutopilotGroup,
  InboxAutopilotReport,
  MailThreadDetail,
  MeetingPrepPacket,
  OutboundAutopilotActionResult,
  OutboundAutopilotGroup,
  OutboundAutopilotReport,
  PlanningAutopilotBundle,
  PlanningAutopilotReport,
  PlanningRecommendationDetail,
  PlanningRecommendationGroup,
  PlanningRecommendationGroupDetail,
  PlanningRecommendationSummaryReport,
  ReviewPackage,
  ReviewPackageReport,
  ReviewReport,
  ReviewTuningProposal,
  ReviewTuningReport,
  ReviewItem,
  ServiceStatusReport,
  SnapshotInspection,
  SnapshotManifest,
  SnapshotSummary,
  TaskDetail,
  WorkflowBundleReport,
  WorklistReport,
} from "../types.js";

type SectionId = "overview" | "review" | "worklist" | "approvals" | "drafts" | "planning" | "audit" | "backups";
type BannerTone = "good" | "warn" | "critical";

interface ConsolePayload {
  status: ServiceStatusReport;
  autopilot: AutopilotStatusReport;
  worklist: WorklistReport;
  assistantQueue: AssistantActionQueueReport;
  inboxAutopilot: InboxAutopilotReport;
  outboundAutopilot: OutboundAutopilotReport;
  nowNextWorkflow: WorkflowBundleReport;
  prepDayWorkflow: WorkflowBundleReport;
  prepMeetingsWorkflow: WorkflowBundleReport;
  doctor: DoctorReport;
  approvals: ApprovalRequest[];
  drafts: DraftArtifact[];
  reviewItems: ReviewItem[];
  planningSummary: PlanningRecommendationSummaryReport;
  planningAutopilot: PlanningAutopilotReport;
  reviewPackages: ReviewPackageReport;
  reviewTuning: ReviewTuningReport;
  reviewReport: ReviewReport;
  planningGroups: PlanningRecommendationGroup[];
  planningNext: PlanningRecommendationDetail | null;
  audit: AuditEvent[];
  snapshots: SnapshotSummary[];
}

interface AuditResponse {
  events: AuditEvent[];
}

interface StatusResponse {
  status: ServiceStatusReport;
}

interface AutopilotResponse {
  autopilot: AutopilotStatusReport;
}

interface WorklistResponse {
  worklist: WorklistReport;
}

interface AssistantQueueResponse {
  assistant_queue: AssistantActionQueueReport;
}

interface InboxAutopilotResponse {
  inbox_autopilot: InboxAutopilotReport;
}

interface OutboundAutopilotResponse {
  outbound_autopilot: OutboundAutopilotReport;
}

interface OutboundAutopilotGroupResponse {
  outbound_autopilot_group: OutboundAutopilotGroup | OutboundAutopilotActionResult;
}

interface AssistantRunResponse {
  assistant_run: AssistantActionRunResult;
}

interface WorkflowResponse {
  workflow: WorkflowBundleReport;
}

interface MeetingPrepPacketResponse {
  meeting_prep_packet: MeetingPrepPacket;
}

interface DoctorResponse {
  doctor: DoctorReport;
}

interface ApprovalQueueResponse {
  approval_requests: ApprovalRequest[];
}

interface ApprovalDetailResponse {
  approval: ApprovalDetail;
}

interface DraftResponse {
  drafts: DraftArtifact[];
}

interface ReviewQueueResponse {
  review_items: ReviewItem[];
}

interface PlanningSummaryResponse {
  planning_recommendation_summary: PlanningRecommendationSummaryReport;
}

interface PlanningAutopilotResponse {
  planning_autopilot: PlanningAutopilotReport;
}

interface ReviewPackageReportResponse {
  review_packages: ReviewPackageReport;
}

interface ReviewTuningResponse {
  review_tuning: ReviewTuningReport;
}

interface ReviewReportResponse {
  review_report: ReviewReport;
}

interface PlanningAutopilotBundleResponse {
  planning_autopilot_bundle:
    | PlanningAutopilotBundle
    | {
        bundle?: PlanningAutopilotBundle;
        summary?: string;
      };
}

interface PlanningGroupsResponse {
  planning_recommendation_groups: PlanningRecommendationGroup[];
}

interface PlanningRecommendationDetailResponse {
  planning_recommendation: PlanningRecommendationDetail | null;
}

interface PlanningRecommendationGroupDetailResponse {
  planning_recommendation_group: PlanningRecommendationGroupDetail;
}

interface SnapshotListResponse {
  snapshots: SnapshotSummary[];
}

interface SnapshotInspectResponse {
  snapshot: SnapshotInspection;
}

interface SnapshotCreateResponse {
  snapshot: SnapshotManifest;
}

interface GithubPullDetailResponse {
  pull_request: GithubPullRequest;
}

interface TaskDetailResponse {
  task: TaskDetail;
}

interface ThreadDetailResponse {
  thread: MailThreadDetail;
}

type WorklistDetail =
  | { kind: "task"; item: AttentionItem; detail: TaskDetail }
  | { kind: "mail_thread"; item: AttentionItem; detail: MailThreadDetail }
  | { kind: "meeting_packet"; item: AttentionItem; detail: MeetingPrepPacket }
  | { kind: "outbound_autopilot_group"; item: AttentionItem; detail: OutboundAutopilotGroup }
  | { kind: "planning_autopilot_bundle"; item: AttentionItem; detail: PlanningAutopilotBundle }
  | { kind: "planning_recommendation"; item: AttentionItem; detail: PlanningRecommendationDetail }
  | { kind: "planning_recommendation_group"; item: AttentionItem; detail: PlanningRecommendationGroupDetail }
  | { kind: "approval_request"; item: AttentionItem; detail: ApprovalDetail }
  | { kind: "github_pull_request"; item: AttentionItem; detail: GithubPullRequest }
  | { kind: "snapshot"; item: AttentionItem; detail: SnapshotInspection }
  | { kind: "unsupported"; item: AttentionItem; message: string };

interface ConsoleState {
  section: SectionId;
  payload: ConsolePayload | null;
  auditLimit: number;
  auditCategory: AuditEventCategory | "";
  lockedHint: boolean;
  flash: { message: string; tone: BannerTone } | null;
  selectedApprovalId: string | null;
  selectedSnapshotId: string | null;
  selectedPlanningRecommendationId: string | null;
  selectedPlanningBundleId: string | null;
  selectedPlanningGroupKey: string | null;
  selectedOutboundGroupId: string | null;
  selectedWorklistItemId: string | null;
  approvalDetail: ApprovalDetail | null;
  snapshotInspection: SnapshotInspection | null;
  planningRecommendationDetail: PlanningRecommendationDetail | null;
  planningBundleDetail: PlanningAutopilotBundle | null;
  planningGroupDetail: PlanningRecommendationGroupDetail | null;
  outboundGroupDetail: OutboundAutopilotGroup | null;
  worklistDetail: WorklistDetail | null;
}

class SessionLockedError extends Error {}

const SECTIONS: Record<SectionId, string> = {
  overview: "Overview",
  review: "Review Report",
  worklist: "Worklist",
  approvals: "Approvals",
  drafts: "Drafts",
  planning: "Planning",
  audit: "Audit",
  backups: "Backups",
};

const state: ConsoleState = {
  section: (location.hash.replace(/^#/, "") as SectionId) || "overview",
  payload: null,
  auditLimit: 20,
  auditCategory: "",
  lockedHint: new URLSearchParams(location.search).get("locked") === "1",
  flash: null,
  selectedApprovalId: null,
  selectedSnapshotId: null,
  selectedPlanningRecommendationId: null,
  selectedPlanningBundleId: null,
  selectedPlanningGroupKey: null,
  selectedOutboundGroupId: null,
  selectedWorklistItemId: null,
  approvalDetail: null,
  snapshotInspection: null,
  planningRecommendationDetail: null,
  planningBundleDetail: null,
  planningGroupDetail: null,
  outboundGroupDetail: null,
  worklistDetail: null,
};

const content = document.querySelector<HTMLElement>("#content");
const banner = document.querySelector<HTMLElement>("#banner");
const sectionTitle = document.querySelector<HTMLElement>("#section-title");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-button");

if (!content || !banner || !sectionTitle || !refreshButton) {
  throw new Error("Console shell did not render correctly.");
}

const requiredContent = content;
const requiredBanner = banner;
const requiredSectionTitle = sectionTitle;
const requiredRefreshButton = refreshButton;

function escapeHtml(value: string | number | boolean | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "not recorded";
  }
  return new Date(value).toLocaleString();
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatSeverity(severity: "pass" | "warn" | "fail"): string {
  if (severity === "pass") return "pill pill--good";
  if (severity === "warn") return "pill pill--warn";
  return "pill pill--critical";
}

function formatDurationHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) {
    return "not recorded";
  }
  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))}m`;
  }
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

function recommendationCliPrefix(recommendationId: string): string {
  return `personal-ops recommendation`;
}

function recommendationShowCommand(recommendationId: string): string {
  return `${recommendationCliPrefix(recommendationId)} show ${recommendationId}`;
}

function recommendationApplyCommand(recommendationId: string): string {
  return `${recommendationCliPrefix(recommendationId)} apply ${recommendationId} --note "<reason>"`;
}

function recommendationSnoozeCommand(recommendationId: string): string {
  return `${recommendationCliPrefix(recommendationId)} snooze ${recommendationId} --preset tomorrow-morning --note "<reason>"`;
}

function recommendationRejectCommand(recommendationId: string): string {
  return `${recommendationCliPrefix(recommendationId)} reject ${recommendationId} --reason handled_elsewhere --note "<reason>"`;
}

function recommendationGroupShowCommand(groupKey: string): string {
  return `personal-ops recommendation group show ${groupKey}`;
}

function recommendationGroupSnoozeCommand(groupKey: string): string {
  return `personal-ops recommendation group snooze ${groupKey} --preset tomorrow-morning --note "<reason>"`;
}

function recommendationGroupRejectCommand(groupKey: string): string {
  return `personal-ops recommendation group reject ${groupKey} --reason handled_elsewhere --note "<reason>"`;
}

function planningBundleShowCommand(bundleId: string): string {
  return `personal-ops planning autopilot --bundle ${bundleId}`;
}

function planningBundlePrepareCommand(bundleId: string): string {
  return `personal-ops planning autopilot --bundle ${bundleId} --prepare`;
}

function planningBundleApplyCommand(bundleId: string): string {
  return `personal-ops planning autopilot --bundle ${bundleId} --apply --note "<reason>"`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      accept: "application/json",
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new SessionLockedError("Run personal-ops console");
  }
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed for ${url}`);
  }
  return payload as T;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401 || response.status === 403) {
    throw new SessionLockedError("Run personal-ops console");
  }
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed for ${url}`);
  }
  return payload as T;
}

async function fetchAudit(limit: number, category: AuditEventCategory | ""): Promise<AuditResponse> {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (category) {
    query.set("category", category);
  }
  return fetchJson<AuditResponse>(`/v1/audit/events?${query.toString()}`);
}

async function loadPayload(): Promise<ConsolePayload> {
  const [
    statusResponse,
    autopilotResponse,
    worklistResponse,
    assistantQueueResponse,
    inboxAutopilotResponse,
    outboundAutopilotResponse,
    nowNextWorkflowResponse,
    workflowResponse,
    prepMeetingsWorkflowResponse,
    doctorResponse,
    approvalsResponse,
    draftsResponse,
    reviewQueueResponse,
    planningSummaryResponse,
    planningAutopilotResponse,
    reviewPackagesResponse,
    reviewTuningResponse,
    reviewReportResponse,
    planningGroupsResponse,
    planningNextResponse,
    auditResponse,
    snapshotListResponse,
  ] = await Promise.all([
    fetchJson<StatusResponse>("/v1/status"),
    fetchJson<AutopilotResponse>("/v1/autopilot/status"),
    fetchJson<WorklistResponse>("/v1/worklist"),
    fetchJson<AssistantQueueResponse>("/v1/assistant/actions"),
    fetchJson<InboxAutopilotResponse>("/v1/inbox/autopilot"),
    fetchJson<OutboundAutopilotResponse>("/v1/outbound/autopilot"),
    fetchJson<WorkflowResponse>("/v1/workflows/now-next"),
    fetchJson<WorkflowResponse>("/v1/workflows/prep-day"),
    fetchJson<WorkflowResponse>("/v1/workflows/prep-meetings?scope=today"),
    fetchJson<DoctorResponse>("/v1/doctor"),
    fetchJson<ApprovalQueueResponse>("/v1/approval-queue?limit=20"),
    fetchJson<DraftResponse>("/v1/mail/drafts"),
    fetchJson<ReviewQueueResponse>("/v1/review-queue"),
    fetchJson<PlanningSummaryResponse>("/v1/planning-recommendations/summary"),
    fetchJson<PlanningAutopilotResponse>("/v1/planning/autopilot"),
    fetchJson<ReviewPackageReportResponse>("/v1/review/packages"),
    fetchJson<ReviewTuningResponse>("/v1/review/tuning"),
    fetchJson<ReviewReportResponse>("/v1/review/report?window_days=14"),
    fetchJson<PlanningGroupsResponse>("/v1/planning-recommendation-groups"),
    fetchJson<PlanningRecommendationDetailResponse>("/v1/planning-recommendations/next"),
    fetchAudit(state.auditLimit, state.auditCategory),
    fetchJson<SnapshotListResponse>("/v1/snapshots"),
  ]);

  return {
    status: statusResponse.status,
    autopilot: autopilotResponse.autopilot,
    worklist: worklistResponse.worklist,
    assistantQueue: assistantQueueResponse.assistant_queue,
    inboxAutopilot: inboxAutopilotResponse.inbox_autopilot,
    outboundAutopilot: outboundAutopilotResponse.outbound_autopilot,
    nowNextWorkflow: nowNextWorkflowResponse.workflow,
    prepDayWorkflow: workflowResponse.workflow,
    prepMeetingsWorkflow: prepMeetingsWorkflowResponse.workflow,
    doctor: doctorResponse.doctor,
    approvals: approvalsResponse.approval_requests,
    drafts: draftsResponse.drafts,
    reviewItems: reviewQueueResponse.review_items,
    planningSummary: planningSummaryResponse.planning_recommendation_summary,
    planningAutopilot: planningAutopilotResponse.planning_autopilot,
    reviewPackages: reviewPackagesResponse.review_packages,
    reviewTuning: reviewTuningResponse.review_tuning,
    reviewReport: reviewReportResponse.review_report,
    planningGroups: planningGroupsResponse.planning_recommendation_groups,
    planningNext: planningNextResponse.planning_recommendation,
    audit: auditResponse.events,
    snapshots: snapshotListResponse.snapshots,
  };
}

function topWorklistCommand(worklist: WorklistReport): string {
  return worklist.items[0]?.suggested_command ?? "personal-ops worklist";
}

function autopilotGroupForThread(payload: ConsolePayload, threadId: string): InboxAutopilotGroup | null {
  return payload.inboxAutopilot.groups.find((group) => group.threads.some((thread) => thread.thread_id === threadId)) ?? null;
}

function autopilotGroupForDraft(payload: ConsolePayload, artifactId: string): InboxAutopilotGroup | null {
  return payload.inboxAutopilot.groups.find((group) => group.draft_artifact_ids.includes(artifactId)) ?? null;
}

function outboundGroupById(payload: ConsolePayload, groupId: string): OutboundAutopilotGroup | null {
  return payload.outboundAutopilot.groups.find((group) => group.group_id === groupId) ?? null;
}

function outboundGroupForDraft(payload: ConsolePayload, artifactId: string): OutboundAutopilotGroup | null {
  return payload.outboundAutopilot.groups.find((group) => group.draft_artifact_ids.includes(artifactId)) ?? null;
}

function outboundGroupForApproval(payload: ConsolePayload, approvalId: string): OutboundAutopilotGroup | null {
  return payload.outboundAutopilot.groups.find((group) => group.approval_ids.includes(approvalId)) ?? null;
}

function planningBundleForRecommendation(payload: ConsolePayload, recommendationId: string): PlanningAutopilotBundle | null {
  return payload.planningAutopilot.bundles.find((bundle) => bundle.recommendation_ids.includes(recommendationId)) ?? null;
}

function planningBundleById(payload: ConsolePayload, bundleId: string): PlanningAutopilotBundle | null {
  return payload.planningAutopilot.bundles.find((bundle) => bundle.bundle_id === bundleId) ?? null;
}

function reviewItemForArtifact(payload: ConsolePayload, artifactId: string): ReviewItem | null {
  return payload.reviewItems.find((review) => review.artifact_id === artifactId && review.state !== "resolved")
    ?? payload.reviewItems.find((review) => review.artifact_id === artifactId)
    ?? null;
}

function reviewPackageCommand(packageId: string): string {
  return `personal-ops review package ${packageId}`;
}

function reviewPackageFeedbackCommand(
  packageId: string,
  reason: "useful" | "wrong_priority" | "bad_timing" | "not_useful",
  packageItemId?: string,
): string {
  return `${reviewPackageCommand(packageId)} feedback --reason ${reason} --note "<reason>"${packageItemId ? ` --item ${packageItemId}` : ""}`;
}

function renderReviewPackageCard(pkg: ReviewPackage): string {
  return `
    <article class="list-item">
      <div class="list-item__top">
        <h4>${escapeHtml(pkg.summary)}</h4>
        <span class="pill pill--good">${escapeHtml(pkg.surface)}</span>
      </div>
      <p>${escapeHtml(pkg.why_now)}</p>
      <p class="subtle subtle--body">${escapeHtml(`State ${pkg.state} · fresh until ${formatTime(pkg.stale_at)} · ${pkg.items.length} item(s)`)}</p>
      <section class="panel">
        <h4>Package items</h4>
        <ul>
          ${pkg.items
            .map(
              (item) => `
                <li>
                  ${escapeHtml(item.title)} · ${escapeHtml(item.underlying_state)}
                  ${item.current_feedback_reason ? ` · feedback ${escapeHtml(item.current_feedback_reason)}` : ""}
                  <div class="list-item__actions">
                    <button class="button" data-review-package-feedback="${escapeHtml(pkg.package_id)}" data-review-feedback-reason="not_useful" data-review-package-item="${escapeHtml(item.package_item_id)}" type="button">Flag item</button>
                    <button class="copy-button" data-copy="${escapeHtml(item.command)}" type="button">Copy item command</button>
                  </div>
                </li>
              `,
            )
            .join("")}
        </ul>
      </section>
      <div class="list-item__actions">
        <button class="button button--primary" data-review-package-feedback="${escapeHtml(pkg.package_id)}" data-review-feedback-reason="useful" type="button">Mark useful</button>
        <button class="button" data-review-package-feedback="${escapeHtml(pkg.package_id)}" data-review-feedback-reason="wrong_priority" type="button">Wrong priority</button>
        <button class="button" data-review-package-feedback="${escapeHtml(pkg.package_id)}" data-review-feedback-reason="bad_timing" type="button">Bad timing</button>
        <button class="button" data-review-package-feedback="${escapeHtml(pkg.package_id)}" data-review-feedback-reason="not_useful" type="button">Not useful</button>
      </div>
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack([reviewPackageCommand(pkg.package_id), ...pkg.next_commands])}
      </div>
    </article>
  `;
}

function renderReviewTuningCard(proposal: ReviewTuningProposal): string {
  return `
    <article class="list-item">
      <div class="list-item__top">
        <h4>${escapeHtml(proposal.summary)}</h4>
        <span class="pill pill--warn">${escapeHtml(proposal.status)}</span>
      </div>
      <p class="subtle subtle--body">${escapeHtml(`${proposal.proposal_kind} · ${proposal.surface} · evidence ${proposal.evidence_count}`)}</p>
      <div class="list-item__actions">
        <button class="button button--primary" data-review-tuning-approve="${escapeHtml(proposal.proposal_id)}" type="button">Approve tuning</button>
        <button class="button" data-review-tuning-dismiss="${escapeHtml(proposal.proposal_id)}" type="button">Dismiss tuning</button>
        <button class="copy-button" data-copy="${escapeHtml(`personal-ops review tuning ${proposal.proposal_id}`)}" type="button">Copy CLI command</button>
      </div>
    </article>
  `;
}

function setFlash(message: string, tone: BannerTone = "good"): void {
  state.flash = { message, tone };
}

function renderBannerCards(cards: Array<{ message: string; tone: BannerTone }>): void {
  if (cards.length === 0) {
    requiredBanner.innerHTML = "";
    return;
  }
  requiredBanner.innerHTML = cards
    .map(
      (card) =>
        `<div class="banner__card banner__card--${escapeHtml(card.tone)}"><p>${escapeHtml(card.message)}</p></div>`,
    )
    .join("");
}

function renderLocked(): void {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "personal-ops-console-locked" }, "*");
  }
  renderBannerCards([
    {
      message: "Console session is missing or expired. Run `personal-ops console` to reopen the operator console.",
      tone: "critical",
    },
  ]);
  requiredContent.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Console locked</p>
      <h3>Local browser access uses a short-lived operator session.</h3>
      <p>Use <span class="code">personal-ops console</span> from the terminal to mint a fresh local session and reopen this page.</p>
    </section>
  `;
}

function metricCard(label: string, value: string, detail: string): string {
  return `
    <div class="metric">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <p class="metric__value">${escapeHtml(value)}</p>
      <p class="subtle subtle--body">${escapeHtml(detail)}</p>
    </div>
  `;
}

function asPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderReviewReport(report: ReviewReport): string {
  return `
    <section class="detail-stack">
      <section class="hero">
        <p class="eyebrow">Review outcomes</p>
        <h3>Review intelligence is now measurable instead of anecdotal.</h3>
        <p>${escapeHtml(`Window: ${report.window_days} days · opened ${asPercent(report.summary.open_rate)} · acted on ${asPercent(report.summary.acted_on_rate)} · stale-unused ${asPercent(report.summary.stale_unused_rate)}`)}</p>
      </section>
      <section class="stats-grid">
        ${metricCard("Created", String(report.summary.created_count), `${report.summary.disappeared_count} disappeared before explicit review`)}
        ${metricCard("Opened", asPercent(report.summary.open_rate), `${report.summary.opened_count} package cycles were opened`)}
        ${metricCard("Acted on", asPercent(report.summary.acted_on_rate), `${report.summary.acted_on_count} package cycles got feedback or completion`)}
        ${metricCard("Stale-unused", asPercent(report.summary.stale_unused_rate), `${report.summary.stale_unused_count} package cycles aged out untouched`)}
        ${metricCard("Notification open", asPercent(report.summary.notification_open_conversion_rate), "How often a fired notification led to an opened package")}
        ${metricCard("Notification action", asPercent(report.summary.notification_action_conversion_rate), "How often a fired notification led to an acted-on package")}
      </section>
      <section class="columns columns--wide-right">
        <div class="detail-stack">
          <section class="detail-card">
            <h3>Surface performance</h3>
            ${
              report.surfaces.length === 0
                ? `<div class="empty">No review activity was recorded in this reporting window.</div>`
                : report.surfaces
                    .map(
                      (surface) => `
                        <article class="list-item">
                          <div class="list-item__top">
                            <h4>${escapeHtml(surface.surface)}</h4>
                            <span class="pill ${surface.stale_unused_rate > 0.35 ? "pill--warn" : "pill--good"}">${escapeHtml(`${surface.created_count} cycles`)}</span>
                          </div>
                          <p class="subtle subtle--body">${escapeHtml(`Opened ${asPercent(surface.open_rate)} · acted on ${asPercent(surface.acted_on_rate)} · stale-unused ${asPercent(surface.stale_unused_rate)}`)}</p>
                          <div class="detail-list detail-list--spaced">
                            <div class="detail-row"><dt>Notifications</dt><dd>${escapeHtml(`${surface.fired_notification_count} fired / ${surface.suppressed_notification_count} suppressed`)}</dd></div>
                            <div class="detail-row"><dt>Cooldown hits</dt><dd>${escapeHtml(String(surface.cooldown_hit_count))}</dd></div>
                            <div class="detail-row"><dt>Negative feedback</dt><dd>${escapeHtml(`${surface.negative_feedback_count} (${asPercent(surface.negative_feedback_rate)})`)}</dd></div>
                            <div class="detail-row"><dt>Open proposals</dt><dd>${escapeHtml(String(surface.open_tuning_proposal_count))}</dd></div>
                            <div class="detail-row"><dt>Active tuning</dt><dd>${escapeHtml(String(surface.active_tuning_state_count))}</dd></div>
                          </div>
                        </article>
                      `,
                    )
                    .join("")
            }
          </section>
          <section class="detail-card">
            <h3>Top noisy sources</h3>
            ${
              report.top_noisy_sources.length === 0
                ? `<div class="empty">No noisy sources were detected in this window.</div>`
                : report.top_noisy_sources
                    .map(
                      (source) => `
                        <article class="list-item">
                          <div class="list-item__top">
                            <h4>${escapeHtml(source.scope_key)}</h4>
                            <span class="pill pill--warn">${escapeHtml(source.surface)}</span>
                          </div>
                          <p>${escapeHtml(source.latest_summary ?? "No latest summary is available for this source.")}</p>
                          <p class="subtle subtle--body">${escapeHtml(`Negative ${source.negative_feedback_count} · stale-unused ${source.stale_unused_count} · rate ${asPercent(source.negative_feedback_rate)}`)}</p>
                        </article>
                      `,
                    )
                    .join("")
            }
          </section>
        </div>
        <div class="detail-stack">
          <section class="detail-card">
            <h3>Proposal outcomes</h3>
            <div class="detail-list detail-list--spaced">
              <div class="detail-row"><dt>Proposed</dt><dd>${escapeHtml(String(report.proposal_outcomes.proposed_count))}</dd></div>
              <div class="detail-row"><dt>Approved</dt><dd>${escapeHtml(String(report.proposal_outcomes.approved_count))}</dd></div>
              <div class="detail-row"><dt>Dismissed</dt><dd>${escapeHtml(String(report.proposal_outcomes.dismissed_count))}</dd></div>
              <div class="detail-row"><dt>Reopened</dt><dd>${escapeHtml(String(report.proposal_outcomes.reopened_count))}</dd></div>
            </div>
            ${
              report.proposal_outcomes.active_state_counts.length === 0
                ? `<p class="subtle subtle--body">No active review tuning state is currently applied.</p>`
                : `
                  <section class="panel">
                    <h4>Active tuning by surface</h4>
                    <ul>
                      ${report.proposal_outcomes.active_state_counts
                        .map(
                          (entry) =>
                            `<li>${escapeHtml(`${entry.surface} · ${entry.proposal_kind} · ${entry.count}`)}</li>`,
                        )
                        .join("")}
                    </ul>
                  </section>
                `
            }
          </section>
          <section class="detail-card">
            <h3>Notification performance</h3>
            <div class="detail-list detail-list--spaced">
              <div class="detail-row"><dt>Fired</dt><dd>${escapeHtml(String(report.notification_performance.fired_count))}</dd></div>
              <div class="detail-row"><dt>Suppressed</dt><dd>${escapeHtml(String(report.notification_performance.suppressed_count))}</dd></div>
              <div class="detail-row"><dt>Cooldown hits</dt><dd>${escapeHtml(String(report.notification_performance.cooldown_hit_count))}</dd></div>
              <div class="detail-row"><dt>Open conversion</dt><dd>${escapeHtml(asPercent(report.notification_performance.notification_open_conversion_rate))}</dd></div>
              <div class="detail-row"><dt>Action conversion</dt><dd>${escapeHtml(asPercent(report.notification_performance.notification_action_conversion_rate))}</dd></div>
            </div>
            <div class="list-item__actions list-item__actions--stack">
              ${commandStack(["personal-ops review report", "personal-ops review report --days 30"])}
            </div>
          </section>
        </div>
      </section>
    </section>
  `;
}

function renderAutopilotStatusCard(report: AutopilotStatusReport): string {
  const staleCount = report.profiles.filter((profile) => profile.state === "stale" || profile.state === "idle").length;
  return `
    <article class="list-item">
      <div class="list-item__top">
        <h4>Workspace freshness</h4>
        <span class="pill ${report.readiness === "ready" ? "pill--good" : "pill--warn"}">${escapeHtml(report.mode)}</span>
      </div>
      <p>${escapeHtml(report.top_item_summary ?? "Autopilot is keeping the workspace warm in the background.")}</p>
      <p class="subtle subtle--body">${escapeHtml(report.running ? "Autopilot is actively refreshing one or more surfaces." : `Last success: ${formatTime(report.last_success_at)}`)}</p>
      <div class="detail-list detail-list--spaced">
        <div class="detail-row"><dt>Stale profiles</dt><dd>${escapeHtml(String(staleCount))}</dd></div>
        <div class="detail-row"><dt>Repair step</dt><dd>${escapeHtml(report.first_repair_step ?? "none")}</dd></div>
      </div>
      <div class="list-item__actions">
        <button class="copy-button" data-copy="personal-ops autopilot status" type="button">Copy CLI command</button>
      </div>
    </article>
  `;
}

function renderProfileFreshness(report: AutopilotStatusReport, profileName: AutopilotStatusReport["profiles"][number]["profile"], label: string): string {
  const profile = report.profiles.find((entry) => entry.profile === profileName);
  if (!profile) {
    return "";
  }
  const tone = profile.state === "fresh" ? "pill--good" : profile.state === "running" ? "pill--warn" : "pill--critical";
  return `
    <section class="panel">
      <div class="list-item__top">
        <h3>${escapeHtml(label)}</h3>
        <span class="pill ${tone}">${escapeHtml(profile.state)}</span>
      </div>
      <p class="subtle subtle--body">${escapeHtml(profile.summary ?? "No freshness summary is recorded yet.")}</p>
      <div class="detail-list detail-list--spaced">
        <div class="detail-row"><dt>Prepared</dt><dd>${escapeHtml(formatTime(profile.prepared_at))}</dd></div>
        <div class="detail-row"><dt>Stale at</dt><dd>${escapeHtml(formatTime(profile.stale_at))}</dd></div>
      </div>
    </section>
  `;
}

function commandAction(command: string, label = "Copy command"): string {
  return `
    <code class="code">${escapeHtml(command)}</code>
    <button class="copy-button" data-copy="${escapeHtml(command)}" type="button">${escapeHtml(label)}</button>
  `;
}

function draftCommand(artifactId: string): string {
  return `personal-ops mail draft show ${artifactId}`;
}

function commandStack(commands: string[]): string {
  return commands
    .map((command) => `<div class="command-line">${commandAction(command, "Copy")}</div>`)
    .join("");
}

function workflowActionButton(
  workflow: WorkflowBundleReport["workflow"],
  action: WorkflowBundleReport["actions"][number],
  index: number,
): string {
  return `
    <div class="command-line">
      <div>
        <p class="eyebrow">${escapeHtml(action.label)}</p>
        <code class="code">${escapeHtml(action.command)}</code>
        ${
          action.why_now
            ? `<p class="subtle subtle--body">${escapeHtml(action.why_now)}</p>`
            : ""
        }
      </div>
      <div class="list-item__actions">
        <button class="button" data-workflow="${escapeHtml(workflow)}" data-workflow-action="${escapeHtml(String(index))}" type="button">Open related detail</button>
        <button class="copy-button" data-copy="${escapeHtml(action.command)}" type="button">Copy</button>
      </div>
    </div>
  `;
}

function renderWorkflowItemMeta(item: WorkflowBundleReport["sections"][number]["items"][number]): string {
  const parts: string[] = [];
  if (item.score_band) {
    parts.push(`Score band: ${item.score_band}`);
  }
  if (item.signals?.length) {
    parts.push(`Signals: ${item.signals.join(", ")}`);
  }
  return parts.length > 0 ? `<p class="subtle subtle--body">${escapeHtml(parts.join(" · "))}</p>` : "";
}

function renderRelatedFiles(
  files:
    | WorkflowBundleReport["actions"][number]["related_files"]
    | WorkflowBundleReport["actions"][number]["related_docs"]
    | MeetingPrepPacket["related_files"]
    | MeetingPrepPacket["related_docs"]
    | undefined,
): string {
  if (!files || files.length === 0) {
    return "";
  }
  return `
    <div class="detail-stack">
      <p class="eyebrow">Related Files</p>
      ${files
        .map((file) => {
          const kind = "file_kind" in file && file.file_kind ? file.file_kind : "doc";
          const headerPreview =
            "header_preview" in file && Array.isArray(file.header_preview) && file.header_preview.length > 0
              ? `<p class="subtle subtle--body">${escapeHtml(`Headers: ${file.header_preview.join(" | ")}`)}</p>`
              : "";
          const tabPreview =
            "tab_names" in file && Array.isArray(file.tab_names) && file.tab_names.length > 0
              ? `<p class="subtle subtle--body">${escapeHtml(`Tabs: ${file.tab_names.join(", ")}`)}</p>`
              : "";
          return `
            <article class="list-item">
              <div class="list-item__top">
                <h4>${escapeHtml(file.title)}</h4>
                <span class="pill">${escapeHtml(`${kind} · ${file.match_type}`)}</span>
              </div>
              <p class="subtle subtle--body">${escapeHtml(file.snippet ?? "No preview extracted.")}</p>
              ${tabPreview}
              ${headerPreview}
              ${
                file.web_view_link
                  ? `<div class="list-item__actions"><a class="button" href="${escapeHtml(file.web_view_link)}" target="_blank" rel="noreferrer">Open File</a></div>`
                  : ""
              }
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function reviewCommand(review: ReviewItem | null): string {
  if (!review) {
    return "personal-ops review list";
  }
  if (review.state === "pending") {
    return `personal-ops review open ${review.review_id}`;
  }
  if (review.state === "opened") {
    return `personal-ops review resolve ${review.review_id} --note "Reviewed"`;
  }
  return `personal-ops review show ${review.review_id}`;
}

function groupPrimaryCommand(payload: ConsolePayload, group: InboxAutopilotGroup): string {
  if (group.review_required) {
    const firstReview = group.draft_artifact_ids
      .map((artifactId) => reviewItemForArtifact(payload, artifactId))
      .find((review): review is ReviewItem => Boolean(review));
    return reviewCommand(firstReview ?? null);
  }
  return "personal-ops inbox autopilot";
}

function groupPrimaryLabel(group: InboxAutopilotGroup): string {
  if (group.review_required) {
    return "Open draft review";
  }
  if (group.state === "running") {
    return "Preparing drafts";
  }
  return group.kind === "needs_reply" ? "Prepare reply block" : "Prepare follow-up block";
}

function approvalForDraft(payload: ConsolePayload, artifactId: string): ApprovalRequest | null {
  return payload.approvals.find((approval) => approval.artifact_id === artifactId && approval.state !== "rejected") ?? null;
}

function renderInboxAutopilotGroupCard(
  payload: ConsolePayload,
  group: InboxAutopilotGroup,
  options: { compact?: boolean; showThreads?: boolean } = {},
): string {
  const drafts = group.draft_artifact_ids
    .map((artifactId) => payload.drafts.find((draft) => draft.artifact_id === artifactId) ?? null)
    .filter((draft): draft is DraftArtifact => Boolean(draft));
  const firstReview = drafts
    .map((draft) => reviewItemForArtifact(payload, draft.artifact_id))
    .find((review): review is ReviewItem => Boolean(review));
  const primaryButton =
    group.state === "running"
      ? `<button class="button" type="button" disabled>Preparing drafts</button>`
      : group.review_required
        ? `<button class="button button--primary" data-autopilot-open="${escapeHtml(group.group_id)}" type="button">${escapeHtml(groupPrimaryLabel(group))}</button>`
        : group.one_click
          ? `<button class="button button--primary" data-autopilot-prepare="${escapeHtml(group.group_id)}" type="button">${escapeHtml(groupPrimaryLabel(group))}</button>`
          : `<button class="button" data-autopilot-open="${escapeHtml(group.group_id)}" type="button">Open related detail</button>`;
  const secondaryButton = group.review_required
    ? `<button class="copy-button" data-copy="${escapeHtml(groupPrimaryCommand(payload, group))}" type="button">Copy review command</button>`
    : `<button class="copy-button" data-copy="personal-ops inbox autopilot" type="button">Copy CLI command</button>`;
  return `
    <article class="list-item">
      <div class="list-item__top">
        <h4>${escapeHtml(group.kind === "needs_reply" ? "Reply block" : "Follow-up block")}</h4>
        <span class="${group.state === "failed" || group.state === "blocked" ? "pill pill--critical" : group.state === "awaiting_review" || group.state === "running" ? "pill pill--warn" : "pill"}">${escapeHtml(group.state)}</span>
      </div>
      <p>${escapeHtml(group.summary)}</p>
      <p class="subtle subtle--body">${escapeHtml(group.why_now)}</p>
      <p class="subtle subtle--body">${escapeHtml(`Score band: ${group.score_band} · Signals: ${group.signals.join(", ")}`)}</p>
      ${
        drafts.length > 0
          ? `<p class="subtle subtle--body">${escapeHtml(`${drafts.length} staged draft${drafts.length === 1 ? "" : "s"}${firstReview ? ` · next review ${firstReview.state}` : ""}`)}</p>`
          : ""
      }
      ${
        group.state === "blocked"
          ? `<p class="subtle subtle--body">Blocked until mailbox auth and sync are healthy again.</p>`
          : ""
      }
      ${
        !options.compact && options.showThreads !== false
          ? `
            <div class="detail-stack">
              ${group.threads
                .map(
                  (thread, index) => `
                    <div class="detail-row">
                      <dt>${escapeHtml(`${index + 1}. ${thread.subject}`)}</dt>
                      <dd>${escapeHtml(`${thread.counterparty_summary} · ${formatTime(thread.last_message_at)}`)}</dd>
                    </div>
                  `,
                )
                .join("")}
            </div>
          `
          : ""
      }
      <div class="list-item__actions${options.compact ? "" : " list-item__actions--stack"}">
        ${primaryButton}
        ${secondaryButton}
      </div>
    </article>
  `;
}

function renderDraftReviewCard(payload: ConsolePayload, group: InboxAutopilotGroup, draft: DraftArtifact, index: number): string {
  const review = reviewItemForArtifact(payload, draft.artifact_id);
  const approval = approvalForDraft(payload, draft.artifact_id);
  return `
    <article class="list-item">
      <div class="list-item__top">
        <h4>${escapeHtml(`${index + 1}. ${draft.subject || "Prepared draft"}`)}</h4>
        <span class="pill ${draft.review_state === "resolved" ? "pill--good" : "pill--warn"}">${escapeHtml(draft.review_state)}</span>
      </div>
      <p>${escapeHtml(draft.to.join(", ") || "No recipients yet")} · ${escapeHtml(group.kind === "needs_reply" ? "reply draft" : "follow-up draft")}</p>
      <p class="subtle subtle--body">${escapeHtml(draft.assistant_why_now ?? group.why_now)}</p>
      <p class="subtle subtle--body">${escapeHtml(`Status: ${draft.status}${approval ? ` · approval ${approval.state}` : review ? ` · review ${review.state}` : ""}`)}</p>
      <div class="list-item__actions list-item__actions--stack">
        ${
          review && review.state === "pending"
            ? `<button class="button button--primary" data-review-open="${escapeHtml(review.review_id)}" type="button">Open review</button>`
            : review && review.state === "opened"
              ? `<button class="button button--primary" data-review-resolve="${escapeHtml(review.review_id)}" type="button">Resolve review</button>`
              : `<button class="button" data-autopilot-prepare="${escapeHtml(group.group_id)}" type="button">Refresh prepared draft</button>`
        }
        <button class="button" data-draft-approval="${escapeHtml(draft.artifact_id)}" type="button">Request approval</button>
        <button class="button" data-autopilot-prepare="${escapeHtml(group.group_id)}" type="button">Refresh group drafts</button>
        <button class="copy-button" data-copy="${escapeHtml(reviewCommand(review ?? null))}" type="button">Copy review command</button>
      </div>
    </article>
  `;
}

function outboundPrimaryButton(group: OutboundAutopilotGroup): string {
  if (group.state === "review_pending") {
    return `<button class="button button--primary" data-outbound-open="${escapeHtml(group.group_id)}" type="button">Open review group</button>`;
  }
  if (group.state === "approval_ready") {
    return `<button class="button button--primary" data-outbound-request-approval="${escapeHtml(group.group_id)}" type="button">Request approval</button>`;
  }
  if (group.state === "approval_pending") {
    return `<button class="button button--primary" data-outbound-approve="${escapeHtml(group.group_id)}" type="button">Approve group</button>`;
  }
  if (group.state === "send_ready") {
    return `<button class="button button--primary" data-outbound-send="${escapeHtml(group.group_id)}" type="button">Send group</button>`;
  }
  if (group.state === "blocked") {
    return `<button class="button" data-outbound-open="${escapeHtml(group.group_id)}" type="button">Inspect blocked group</button>`;
  }
  return `<button class="button" data-outbound-open="${escapeHtml(group.group_id)}" type="button">Open group</button>`;
}

function renderOutboundGroupCard(payload: ConsolePayload, group: OutboundAutopilotGroup, options: { compact?: boolean } = {}): string {
  const drafts = group.draft_artifact_ids
    .map((artifactId) => payload.drafts.find((draft) => draft.artifact_id === artifactId) ?? null)
    .filter((draft): draft is DraftArtifact => Boolean(draft));
  const approvals = group.approval_ids
    .map((approvalId) => payload.approvals.find((approval) => approval.approval_id === approvalId) ?? null)
    .filter((approval): approval is ApprovalRequest => Boolean(approval));
  const sendWindowBlocked = group.state === "blocked" && !payload.outboundAutopilot.send_window.effective_send_enabled;
  return `
    <article class="list-item${selectedClass(group.group_id === state.selectedOutboundGroupId)}">
      <div class="list-item__top">
        <h4>${escapeHtml(group.kind === "reply_block" ? "Reply block" : group.kind === "followup_block" ? "Follow-up block" : "Single draft")}</h4>
        <span class="${group.state === "send_ready" ? "pill pill--good" : group.state === "approval_ready" || group.state === "approval_pending" || group.state === "review_pending" ? "pill pill--warn" : group.state === "blocked" ? "pill pill--critical" : "pill"}">${escapeHtml(group.state)}</span>
      </div>
      <p>${escapeHtml(group.summary)}</p>
      <p class="subtle subtle--body">${escapeHtml(group.why_now)}</p>
      <p class="subtle subtle--body">${escapeHtml(`Drafts: ${drafts.length} · approvals: ${approvals.length} · score: ${group.score_band}`)}</p>
      ${
        sendWindowBlocked
          ? `<p class="subtle subtle--body">${escapeHtml(`Send is blocked until the CLI enables a send window. Next: personal-ops send-window enable --reason "<reason>"`)}</p>`
          : ""
      }
      ${
        !options.compact
          ? `
            <div class="detail-stack">
              ${drafts
                .map((draft, index) => `<div class="detail-row"><dt>${escapeHtml(`${index + 1}. ${draft.subject || "Prepared draft"}`)}</dt><dd>${escapeHtml(`${draft.to.join(", ") || "No recipients"} · ${draft.status}`)}</dd></div>`)
                .join("")}
            </div>
          `
          : ""
      }
      <div class="list-item__actions${options.compact ? "" : " list-item__actions--stack"}">
        ${outboundPrimaryButton(group)}
        <button class="button" data-outbound-open="${escapeHtml(group.group_id)}" type="button">Inspect group</button>
        <button class="copy-button" data-copy="${escapeHtml(`personal-ops outbound autopilot --group ${group.group_id}`)}" type="button">Copy CLI command</button>
      </div>
    </article>
  `;
}

function renderWorkflowSections(report: WorkflowBundleReport): string {
  return report.sections
    .map(
      (section) => `
        <section class="panel">
          <h3>${escapeHtml(section.title)}</h3>
          ${
            section.items.length === 0
              ? `<div class="empty">Nothing notable right now.</div>`
              : section.items
                  .map(
                    (item) => `
                      <article class="list-item">
                        <div class="list-item__top">
                          <h4>${escapeHtml(item.label)}</h4>
                        </div>
                        <p>${escapeHtml(item.summary)}</p>
                        ${item.why_now ? `<p class="subtle subtle--body">${escapeHtml(item.why_now)}</p>` : ""}
                        ${renderWorkflowItemMeta(item)}
                        ${renderRelatedFiles(item.related_files ?? item.related_docs)}
                        ${
                          item.command
                            ? `<div class="list-item__actions">${commandAction(item.command, "Copy command")}</div>`
                            : ""
                        }
                      </article>
                    `,
                  )
                  .join("")
          }
        </section>
      `,
    )
    .join("");
}

function selectedClass(selected: boolean): string {
  return selected ? " is-selected" : "";
}

function maybe(value: string | null | undefined, fallback = "not recorded"): string {
  return value?.trim() ? value : fallback;
}

function truncateId(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  return value.length > 12 ? value.slice(0, 12) : value;
}

function getCurrentPayload(): ConsolePayload {
  if (!state.payload) {
    throw new Error("Console payload is not loaded yet.");
  }
  return state.payload;
}

function workflowByName(payload: ConsolePayload, workflow: WorkflowBundleReport["workflow"]): WorkflowBundleReport {
  if (workflow === "now-next") {
    return payload.nowNextWorkflow;
  }
  if (workflow === "prep-meetings") {
    return payload.prepMeetingsWorkflow;
  }
  return payload.prepDayWorkflow;
}

function assistantStateClass(action: AssistantActionItem): string {
  if (action.state === "failed" || action.state === "blocked") {
    return "pill pill--critical";
  }
  if (action.state === "running" || action.state === "awaiting_review" || action.state === "proposed") {
    return "pill pill--warn";
  }
  return "pill pill--good";
}

function assistantActionsForSection(payload: ConsolePayload, section: AssistantActionItem["section"]): AssistantActionItem[] {
  return payload.assistantQueue.actions.filter((action) => action.section === section);
}

function renderAssistantActionCard(action: AssistantActionItem, options: { compact?: boolean } = {}): string {
  const primaryAction =
    action.one_click && action.state !== "blocked" && action.state !== "completed" && action.state !== "running"
      ? `<button class="button button--primary" data-assistant-run="${escapeHtml(action.action_id)}" type="button">Run safe action</button>`
      : `<button class="button" data-assistant-open="${escapeHtml(action.action_id)}" type="button">Open related detail</button>`;
  return `
    <article class="list-item">
      <div class="list-item__top">
        <h4>${escapeHtml(action.title)}</h4>
        <span class="${assistantStateClass(action)}">${escapeHtml(action.state)}</span>
      </div>
      <p>${escapeHtml(action.summary)}</p>
      <p class="subtle subtle--body">${escapeHtml(action.why_now)}</p>
      ${
        action.signals.length > 0
          ? `<p class="subtle subtle--body">${escapeHtml(`Signals: ${action.signals.join(", ")}`)}</p>`
          : ""
      }
      ${
        action.blocking_reason
          ? `<p class="subtle subtle--body">${escapeHtml(`Blocked: ${action.blocking_reason}`)}</p>`
          : ""
      }
      ${
        action.latest_run
          ? `<p class="subtle subtle--body">${escapeHtml(`Latest run: ${action.latest_run.summary}`)}</p>`
          : ""
      }
      <div class="list-item__actions${options.compact ? "" : " list-item__actions--stack"}">
        ${primaryAction}
        ${
          action.command
            ? `<button class="copy-button" data-copy="${escapeHtml(action.command)}" type="button">Copy CLI command</button>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderAssistantSection(
  payload: ConsolePayload,
  title: string,
  section: AssistantActionItem["section"],
  emptyText: string,
): string {
  const actions = assistantActionsForSection(payload, section);
  return `
    <section class="panel">
      <h3>${escapeHtml(title)}</h3>
      ${
        actions.length === 0
          ? `<div class="empty">${escapeHtml(emptyText)}</div>`
          : actions.map((action) => renderAssistantActionCard(action)).join("")
      }
    </section>
  `;
}

function findSelectedWorklistItem(payload: ConsolePayload): AttentionItem | null {
  return payload.worklist.items.find((item) => item.item_id === state.selectedWorklistItemId) ?? null;
}

function intelligenceForWorklistItem(
  payload: ConsolePayload,
  item: AttentionItem,
): WorkflowBundleReport["actions"][number] | null {
  const matches = [...payload.nowNextWorkflow.actions, ...payload.prepDayWorkflow.actions].find(
    (action) => action.target_type === item.target_type && action.target_id === item.target_id,
  );
  return matches ?? null;
}

function nextRecommendationId(payload: ConsolePayload): string | null {
  return payload.planningNext?.recommendation.recommendation_id ?? payload.planningGroups[0]?.top_recommendation_id ?? null;
}

function nextPlanningBundleId(payload: ConsolePayload): string | null {
  return payload.planningAutopilot.bundles[0]?.bundle_id ?? null;
}

function syntheticAttentionItem(targetType: string, targetId: string, title: string, summary: string, command: string): AttentionItem {
  return {
    item_id: `${targetType}:${targetId}`,
    kind: targetType,
    severity: "info",
    title,
    summary,
    target_type: targetType,
    target_id: targetId,
    created_at: new Date().toISOString(),
    suggested_command: command,
    metadata_json: "{}",
  };
}

function resolveSelections(payload: ConsolePayload): void {
  const approvalIds = new Set(payload.approvals.map((approval) => approval.approval_id));
  if (!state.selectedApprovalId || !approvalIds.has(state.selectedApprovalId)) {
    state.selectedApprovalId = payload.approvals[0]?.approval_id ?? null;
  }

  const snapshotIds = new Set(payload.snapshots.map((snapshot) => snapshot.snapshot_id));
  if (!state.selectedSnapshotId || !snapshotIds.has(state.selectedSnapshotId)) {
    state.selectedSnapshotId = payload.snapshots[0]?.snapshot_id ?? null;
  }

  const worklistIds = new Set(payload.worklist.items.map((item) => item.item_id));
  if (!state.selectedWorklistItemId || !worklistIds.has(state.selectedWorklistItemId)) {
    state.selectedWorklistItemId = payload.worklist.items[0]?.item_id ?? null;
  }

  if (!state.selectedPlanningRecommendationId) {
    state.selectedPlanningRecommendationId = nextRecommendationId(payload);
  }

  const planningBundleIds = new Set(payload.planningAutopilot.bundles.map((bundle) => bundle.bundle_id));
  if (!state.selectedPlanningBundleId || !planningBundleIds.has(state.selectedPlanningBundleId)) {
    state.selectedPlanningBundleId = nextPlanningBundleId(payload);
  }

  const outboundGroupIds = new Set(payload.outboundAutopilot.groups.map((group) => group.group_id));
  if (!state.selectedOutboundGroupId || !outboundGroupIds.has(state.selectedOutboundGroupId)) {
    state.selectedOutboundGroupId = payload.outboundAutopilot.groups[0]?.group_id ?? null;
  }

  if (!state.selectedPlanningGroupKey) {
    state.selectedPlanningGroupKey =
      payload.planningGroups.find((group) => group.recommendation_ids.includes(state.selectedPlanningRecommendationId ?? ""))?.group_key ??
      payload.planningGroups[0]?.group_key ??
      null;
  }
}

async function loadSelectedOutboundGroupDetail(): Promise<void> {
  if (!state.selectedOutboundGroupId) {
    state.outboundGroupDetail = null;
    return;
  }
  try {
    const response = await fetchJson<OutboundAutopilotGroupResponse>(
      `/v1/outbound/autopilot/groups/${encodeURIComponent(state.selectedOutboundGroupId)}`,
    );
    state.outboundGroupDetail = response.outbound_autopilot_group as OutboundAutopilotGroup;
  } catch (error) {
    if (error instanceof SessionLockedError) {
      throw error;
    }
    state.outboundGroupDetail = null;
  }
}

async function loadSelectedApprovalDetail(): Promise<void> {
  if (!state.selectedApprovalId) {
    state.approvalDetail = null;
    return;
  }
  try {
    const response = await fetchJson<ApprovalDetailResponse>(
      `/v1/approval-queue/${encodeURIComponent(state.selectedApprovalId)}`,
    );
    state.approvalDetail = response.approval;
  } catch (error) {
    if (error instanceof SessionLockedError) {
      throw error;
    }
    state.approvalDetail = null;
  }
}

async function loadSelectedSnapshotInspection(): Promise<void> {
  if (!state.selectedSnapshotId) {
    state.snapshotInspection = null;
    return;
  }
  try {
    const response = await fetchJson<SnapshotInspectResponse>(`/v1/snapshots/${encodeURIComponent(state.selectedSnapshotId)}`);
    state.snapshotInspection = response.snapshot;
  } catch (error) {
    if (error instanceof SessionLockedError) {
      throw error;
    }
    state.snapshotInspection = null;
  }
}

async function loadSelectedPlanningRecommendationDetail(): Promise<void> {
  if (!state.selectedPlanningRecommendationId) {
    state.planningRecommendationDetail = state.payload?.planningNext ?? null;
    return;
  }
  try {
    const response = await fetchJson<PlanningRecommendationDetailResponse>(
      `/v1/planning-recommendations/${encodeURIComponent(state.selectedPlanningRecommendationId)}`,
    );
    state.planningRecommendationDetail = response.planning_recommendation;
    if (state.planningRecommendationDetail?.recommendation.group_key) {
      state.selectedPlanningGroupKey = state.planningRecommendationDetail.recommendation.group_key;
    }
  } catch (error) {
    if (error instanceof SessionLockedError) {
      throw error;
    }
    state.planningRecommendationDetail = null;
  }
}

async function loadSelectedPlanningBundleDetail(): Promise<void> {
  if (!state.selectedPlanningBundleId) {
    state.planningBundleDetail = null;
    return;
  }
  try {
    const response = await fetchJson<PlanningAutopilotBundleResponse>(
      `/v1/planning/autopilot/bundles/${encodeURIComponent(state.selectedPlanningBundleId)}`,
    );
    state.planningBundleDetail = (response.planning_autopilot_bundle as { bundle?: PlanningAutopilotBundle }).bundle
      ?? (response.planning_autopilot_bundle as PlanningAutopilotBundle);
  } catch (error) {
    if (error instanceof SessionLockedError) {
      throw error;
    }
    state.planningBundleDetail = null;
  }
}

async function loadSelectedPlanningGroupDetail(): Promise<void> {
  if (!state.selectedPlanningGroupKey) {
    state.planningGroupDetail = null;
    return;
  }
  try {
    const response = await fetchJson<PlanningRecommendationGroupDetailResponse>(
      `/v1/planning-recommendation-groups/${encodeURIComponent(state.selectedPlanningGroupKey)}`,
    );
    state.planningGroupDetail = response.planning_recommendation_group;
  } catch (error) {
    if (error instanceof SessionLockedError) {
      throw error;
    }
    state.planningGroupDetail = null;
  }
}

async function buildWorklistDetail(item: AttentionItem): Promise<WorklistDetail> {
  if (item.target_type === "task") {
    const response = await fetchJson<TaskDetailResponse>(`/v1/tasks/${encodeURIComponent(item.target_id)}`);
    return { kind: "task", item, detail: response.task };
  }
  if (item.target_type === "mail_thread") {
    const response = await fetchJson<ThreadDetailResponse>(`/v1/inbox/threads/${encodeURIComponent(item.target_id)}`);
    return { kind: "mail_thread", item, detail: response.thread };
  }
  if (item.target_type === "calendar_event") {
    const response = await fetchJson<MeetingPrepPacketResponse>(
      `/v1/workflows/prep-meetings/${encodeURIComponent(item.target_id)}`,
    );
    return { kind: "meeting_packet", item, detail: response.meeting_prep_packet };
  }
  if (item.target_type === "outbound_autopilot_group") {
    const response = await fetchJson<OutboundAutopilotGroupResponse>(
      `/v1/outbound/autopilot/groups/${encodeURIComponent(item.target_id)}`,
    );
    return { kind: "outbound_autopilot_group", item, detail: response.outbound_autopilot_group as OutboundAutopilotGroup };
  }
  if (item.target_type === "planning_autopilot_bundle") {
    const response = await fetchJson<PlanningAutopilotBundleResponse>(
      `/v1/planning/autopilot/bundles/${encodeURIComponent(item.target_id)}`,
    );
    return {
      kind: "planning_autopilot_bundle",
      item,
      detail: (response.planning_autopilot_bundle as { bundle?: PlanningAutopilotBundle }).bundle
        ?? (response.planning_autopilot_bundle as PlanningAutopilotBundle),
    };
  }
  if (item.target_type === "planning_recommendation") {
    const response = await fetchJson<PlanningRecommendationDetailResponse>(
      `/v1/planning-recommendations/${encodeURIComponent(item.target_id)}`,
    );
    if (!response.planning_recommendation) {
      return {
        kind: "unsupported",
        item,
        message: "This worklist item points to a planning recommendation that is no longer available.",
      };
    }
    return { kind: "planning_recommendation", item, detail: response.planning_recommendation };
  }
  if (item.target_type === "planning_recommendation_group") {
    const response = await fetchJson<PlanningRecommendationGroupDetailResponse>(
      `/v1/planning-recommendation-groups/${encodeURIComponent(item.target_id)}`,
    );
    return { kind: "planning_recommendation_group", item, detail: response.planning_recommendation_group };
  }
  if (item.target_type === "approval_request") {
    const response = await fetchJson<ApprovalDetailResponse>(`/v1/approval-queue/${encodeURIComponent(item.target_id)}`);
    return { kind: "approval_request", item, detail: response.approval };
  }
  if (item.target_type === "github_pull_request") {
    const response = await fetchJson<GithubPullDetailResponse>(`/v1/github/pulls/${encodeURIComponent(item.target_id)}`);
    return { kind: "github_pull_request", item, detail: response.pull_request };
  }
  if (item.target_type === "snapshot") {
    const response = await fetchJson<SnapshotInspectResponse>(`/v1/snapshots/${encodeURIComponent(item.target_id)}`);
    return { kind: "snapshot", item, detail: response.snapshot };
  }
  return {
    kind: "unsupported",
    item,
    message: `No in-console detail view exists for ${item.target_type}. Use the suggested CLI command below.`,
  };
}

async function loadSelectedWorklistDetail(): Promise<void> {
  const payload = state.payload;
  const item = payload ? findSelectedWorklistItem(payload) : null;
  if (!item) {
    state.worklistDetail = null;
    return;
  }
  try {
    state.worklistDetail = await buildWorklistDetail(item);
  } catch (error) {
    if (error instanceof SessionLockedError) {
      throw error;
    }
    state.worklistDetail = {
      kind: "unsupported",
      item,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadSelectedDetails(): Promise<void> {
  await Promise.all([
    loadSelectedApprovalDetail(),
    loadSelectedOutboundGroupDetail(),
    loadSelectedSnapshotInspection(),
    loadSelectedPlanningBundleDetail(),
    loadSelectedPlanningRecommendationDetail(),
    loadSelectedPlanningGroupDetail(),
    loadSelectedWorklistDetail(),
  ]);
}

function renderOverview(payload: ConsolePayload): string {
  const status = payload.status;
  const machine = status.machine;
  const latestSnapshot = status.snapshot_latest;
  const workflow = payload.prepDayWorkflow;
  const prepMeetings = payload.prepMeetingsWorkflow;
  const nowNext = payload.nowNextWorkflow;
  const assistantQueue = payload.assistantQueue;
  const autopilot = payload.autopilot;
  const primaryNowNext = nowNext.actions[0] ?? null;
  const topAssistantAction = assistantQueue.actions.find((action) => action.state !== "completed") ?? assistantQueue.actions[0] ?? null;
  const topPlanningBundle = payload.planningAutopilot.bundles[0] ?? null;
  const topAutopilotGroup = payload.inboxAutopilot.groups[0] ?? null;
  const topOutboundGroup = payload.outboundAutopilot.groups[0] ?? null;
  const topMeetingPrep = prepMeetings.actions[0] ?? null;
  const topReviewTuning = payload.reviewTuning.proposals.find((proposal) => proposal.status === "proposed") ?? null;
  return `
    <section class="hero">
      <p class="eyebrow">Top-level readiness</p>
      <div class="list-item__top">
        <h3>${escapeHtml(status.state === "ready" ? "Local control plane looks healthy." : "Local control plane needs attention.")}</h3>
        <span class="${status.state === "ready" ? "pill pill--good" : "pill pill--warn"}">${escapeHtml(status.state)}</span>
      </div>
      <p>${escapeHtml(nowNext.summary)}</p>
      <div class="hero__meta">
        <div>
          <p class="eyebrow">Machine</p>
          <p>${escapeHtml(machine.machine_label ?? "not initialized")} (${escapeHtml(truncateId(machine.machine_id))})</p>
        </div>
        <div>
          <p class="eyebrow">State origin</p>
          <p>${escapeHtml(machine.state_origin)}</p>
        </div>
        <div>
          <p class="eyebrow">Mailbox</p>
          <p>${escapeHtml(status.mailbox.connected ?? status.mailbox.configured ?? "not configured")}</p>
        </div>
        <div>
          <p class="eyebrow">Version</p>
          <p>${escapeHtml(status.service_version)}</p>
        </div>
        <div>
          <p class="eyebrow">Latest snapshot</p>
          <p>${escapeHtml(latestSnapshot?.snapshot_id ?? "none yet")}</p>
        </div>
      </div>
    </section>
    <section class="stats-grid">
      ${metricCard("Worklist", `${formatCount(status.worklist_summary.warn_count)} warn`, `${formatCount(status.worklist_summary.critical_count)} critical / ${formatCount(status.worklist_summary.info_count)} info`)}
      ${metricCard("Planning", `${formatCount(status.planning_recommendations.active_count)} open`, status.planning_recommendations.top_group_summary ?? "No active planning summary")}
      ${metricCard("Approvals", `${formatCount(status.approval_queue.pending_count)} pending`, `${formatCount(status.approval_queue.total_count)} total requests`)}
      ${metricCard("Reviews", `${formatCount(status.review_queue.pending_count)} pending`, `${formatCount(status.review_queue.total_count)} total review items`)}
      ${metricCard("Autopilot", `${formatCount(status.autopilot.stale_profile_count)} stale`, status.autopilot.top_item_summary ?? "Workspace surfaces are warming in the background")}
      ${metricCard("GitHub", `${formatCount(status.github.review_requested_count)} reviews`, `${formatCount(status.github.authored_pr_attention_count)} authored PRs need attention`)}
      ${metricCard("Drive", `${formatCount(status.drive.indexed_doc_count)} docs · ${formatCount(status.drive.indexed_sheet_count)} sheets`, status.drive.top_item_summary ?? "No Drive context indexed yet")}
    </section>
    <section class="columns columns--wide-right">
      <div class="detail-stack">
        <section class="detail-card">
          <h3>What the assistant is doing now</h3>
          <p class="subtle subtle--body">${escapeHtml(assistantQueue.summary)}</p>
          ${
            topAssistantAction
              ? renderAssistantActionCard(topAssistantAction)
              : `<div class="empty">The assistant queue is currently caught up.</div>`
          }
        </section>
        <section class="detail-card">
          <h3>Autopilot warm start</h3>
          <p class="subtle subtle--body">Continuous autopilot keeps day-start, inbox, meetings, planning, and outbound surfaces warm so the console opens into prepared work instead of waiting for manual refresh.</p>
          ${renderAutopilotStatusCard(autopilot)}
        </section>
        <section class="detail-card">
          <h3>Review overlay</h3>
          <p class="subtle subtle--body">Review packages stay separate from the raw worklist so you can compress review work without changing the underlying queue.</p>
          ${
            payload.reviewPackages.packages.length === 0
              ? `<div class="empty">No review packages are active right now.</div>`
              : payload.reviewPackages.packages.map((pkg) => renderReviewPackageCard(pkg)).join("")
          }
          ${
            topReviewTuning
              ? `
                <section class="panel">
                  <h4>Open tuning proposal</h4>
                  ${renderReviewTuningCard(topReviewTuning)}
                </section>
              `
              : ""
          }
        </section>
        <section class="detail-card">
          <h3>Planning autopilot</h3>
          <p class="subtle subtle--body">Prepared planning bundles turn recommendation clusters into one reviewable execution path instead of a queue you still have to translate by hand.</p>
          ${
            topPlanningBundle
              ? renderPlanningBundleDetail(topPlanningBundle)
              : `<div class="empty">No planning bundles are active right now.</div>`
          }
        </section>
        <section class="detail-card">
          <h3>Inbox autopilot</h3>
          <p class="subtle subtle--body">Grouped reply and follow-up work is staged here so the next move can be prepare, review, or approval handoff instead of raw inbox triage.</p>
          ${
            topAutopilotGroup
              ? renderInboxAutopilotGroupCard(payload, topAutopilotGroup, { showThreads: false })
              : `<div class="empty">No grouped inbox blocks need assistant prep right now.</div>`
          }
        </section>
        <section class="detail-card">
          <h3>Outbound Finish-Work</h3>
          <p class="subtle subtle--body">Reviewed mail work lands here so approval request, grouped approval, and grouped send can happen from the console without widening the trust boundary.</p>
          ${
            topOutboundGroup
              ? renderOutboundGroupCard(payload, topOutboundGroup, { compact: true })
              : `<div class="empty">No outbound finish-work groups are active right now.</div>`
          }
        </section>
        <section class="detail-card">
          <h3>Today’s Prep</h3>
          <p class="subtle subtle--body">Meeting prep packets gather agenda, checklist, docs, and related work so the next move can be review instead of last-minute context gathering.</p>
          ${
            topMeetingPrep
              ? `
                <article class="list-item">
                  <div class="list-item__top">
                    <h4>${escapeHtml(topMeetingPrep.label)}</h4>
                    <span class="pill pill--good">${escapeHtml(topMeetingPrep.score_band ?? "high")}</span>
                  </div>
                  <p>${escapeHtml(topMeetingPrep.summary)}</p>
                  <p class="subtle subtle--body">${escapeHtml(topMeetingPrep.why_now ?? "This meeting packet is the strongest prep move right now.")}</p>
                  ${renderRelatedFiles(topMeetingPrep.related_files ?? topMeetingPrep.related_docs)}
                  <div class="list-item__actions">
                    <button class="button button--primary" data-workflow="${escapeHtml(prepMeetings.workflow)}" data-workflow-action="0" type="button">Open meeting prep</button>
                    <button class="copy-button" data-copy="${escapeHtml(topMeetingPrep.command)}" type="button">Copy CLI command</button>
                  </div>
                </article>
              `
              : `<div class="empty">No meetings need a staged prep packet right now.</div>`
          }
        </section>
        <section class="detail-card">
          <h3>What to do right now</h3>
          <p class="subtle subtle--body">Use this focused bundle when you want one strongest next move plus a short backup path.</p>
          ${renderWorkflowSections(nowNext)}
        </section>
        <section class="detail-card">
          <h3>Day-start workflow</h3>
          <p class="subtle subtle--body">Use this bundle when you want the shortest useful operator plan for right now.</p>
          ${renderWorkflowSections(workflow)}
        </section>
      </div>
      <div class="detail-stack">
        <section class="detail-card">
          <h3>Assistant queue</h3>
          ${
            assistantQueue.actions.length === 0
              ? `<div class="empty">No assistant actions are queued right now.</div>`
              : assistantQueue.actions.slice(0, 4).map((action) => renderAssistantActionCard(action, { compact: true })).join("")
          }
        </section>
        <section class="detail-card">
          <h3>Next commands</h3>
          ${
            nowNext.actions.length === 0
              ? `<div class="empty">No immediate commands are queued right now.</div>`
              : nowNext.actions.map((action, index) => workflowActionButton(nowNext.workflow, action, index)).join("")
          }
        </section>
      </div>
    </section>
    <section class="columns">
      <div class="panel">
        <h3>Primary move</h3>
        ${
          primaryNowNext
            ? `
              <p>${escapeHtml(primaryNowNext.summary)}</p>
              <div class="detail-list detail-list--spaced">
                <div class="detail-row"><dt>Command</dt><dd>${escapeHtml(primaryNowNext.command)}</dd></div>
                <div class="detail-row"><dt>Score band</dt><dd>${escapeHtml(primaryNowNext.score_band ?? "medium")}</dd></div>
                <div class="detail-row"><dt>Why now</dt><dd>${escapeHtml(primaryNowNext.why_now ?? "This is the strongest current next move.")}</dd></div>
              </div>
              <div class="list-item__actions">
                <button class="button button--primary" data-workflow="${escapeHtml(nowNext.workflow)}" data-workflow-action="0" type="button">Open related detail</button>
                <button class="copy-button" data-copy="${escapeHtml(primaryNowNext.command)}" type="button">Copy CLI command</button>
              </div>
            `
            : `<div class="empty">No current primary move is available.</div>`
        }
      </div>
      <div class="panel">
        <h3>Backup action</h3>
        <p>Create snapshots in the browser when you want a quick recovery point. Restore stays in the CLI.</p>
        <div class="detail-list detail-list--spaced">
          <div class="detail-row"><dt>Latest snapshot</dt><dd>${escapeHtml(latestSnapshot?.snapshot_id ?? "none yet")}</dd></div>
          <div class="detail-row"><dt>Created</dt><dd>${escapeHtml(formatTime(latestSnapshot?.created_at ?? null))}</dd></div>
        </div>
        <div class="list-item__actions">
          <button class="button button--primary" data-section-link="backups" type="button">Open Backups</button>
          ${
            latestSnapshot
              ? `<button class="button" data-open-snapshot="${escapeHtml(latestSnapshot.snapshot_id)}" type="button">Inspect latest snapshot</button>`
              : ""
          }
        </div>
      </div>
      <div class="panel">
        <h3>GitHub queue</h3>
        <div class="detail-list detail-list--spaced">
          <div class="detail-row"><dt>Connected login</dt><dd>${escapeHtml(status.github.connected_login ?? "not connected")}</dd></div>
          <div class="detail-row"><dt>Sync</dt><dd>${escapeHtml(status.github.sync_status)}</dd></div>
          <div class="detail-row"><dt>Review requests</dt><dd>${escapeHtml(String(status.github.review_requested_count))}</dd></div>
          <div class="detail-row"><dt>Authored PR attention</dt><dd>${escapeHtml(String(status.github.authored_pr_attention_count))}</dd></div>
        </div>
        <p class="subtle subtle--body">${escapeHtml(status.github.top_item_summary ?? "Nothing notable is waiting in the GitHub queue right now.")}</p>
        <div class="list-item__actions list-item__actions--stack">
          ${commandStack(["personal-ops github status", "personal-ops github pulls"])}
        </div>
      </div>
    </section>
    <section class="panel">
      <h3>CLI handoff</h3>
      <p>Approvals, tasks, restore, auth, send, and other high-trust work still stay in the CLI.</p>
      <div class="list-item__actions list-item__actions--stack">
        ${commandAction(primaryNowNext?.command ?? topWorklistCommand(payload.worklist))}
      </div>
    </section>
  `;
}

function renderWorklistList(payload: ConsolePayload): string {
  if (payload.worklist.items.length === 0) {
    return `<div class="empty">No current worklist items. Run <span class="code">personal-ops status</span> for the fuller readiness summary.</div>`;
  }
  return payload.worklist.items
    .map(
      (item) => `
        <article class="list-item${selectedClass(item.item_id === state.selectedWorklistItemId)}">
          <div class="list-item__top">
            <h4>${escapeHtml(item.title)}</h4>
            <span class="pill ${item.severity === "critical" ? "pill--critical" : item.severity === "warn" ? "pill--warn" : "pill--good"}">${escapeHtml(item.severity)}</span>
          </div>
          <p>${escapeHtml(item.summary)}</p>
          <div class="list-item__actions">
            <button class="button" data-worklist-item="${escapeHtml(item.item_id)}" type="button">Inspect related detail</button>
            <button class="copy-button" data-copy="${escapeHtml(item.suggested_command)}" type="button">Copy command</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderWorklistDetail(detail: WorklistDetail | null): string {
  if (!detail) {
    return `<div class="empty">Choose a worklist item to inspect the related task, thread, recommendation, approval, or snapshot.</div>`;
  }
  const payload = state.payload;
  const intelligence = payload ? intelligenceForWorklistItem(payload, detail.item) : null;
  const intelligenceBlock = intelligence
    ? `
      <section class="panel">
        <h4>Why this matters now</h4>
        <p>${escapeHtml(intelligence.why_now ?? "This item is part of the current intelligence layer.")}</p>
        <p class="subtle subtle--body">${escapeHtml(`Score band: ${intelligence.score_band ?? "medium"}${intelligence.signals?.length ? ` · Signals: ${intelligence.signals.join(", ")}` : ""}`)}</p>
        ${renderRelatedFiles(intelligence.related_files ?? intelligence.related_docs)}
      </section>
    `
    : "";

  if (detail.kind === "task") {
    const task = detail.detail.task;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Task</dt><dd>${escapeHtml(task.title)}</dd></div>
        <div class="detail-row"><dt>State</dt><dd>${escapeHtml(task.state)}</dd></div>
        <div class="detail-row"><dt>Priority</dt><dd>${escapeHtml(task.priority)}</dd></div>
        <div class="detail-row"><dt>Due</dt><dd>${escapeHtml(formatTime(task.due_at))}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(maybe(task.notes, "No task notes recorded."))}</p>
      ${intelligenceBlock}
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack([`personal-ops task show ${task.task_id}`])}
      </div>
    `;
  }

  if (detail.kind === "mail_thread") {
    const thread = detail.detail;
    const group = payload ? autopilotGroupForThread(payload, thread.thread.thread_id) : null;
    const linkedDraft = payload && group
      ? payload.drafts.find((draft) => draft.assistant_source_thread_id === thread.thread.thread_id) ?? null
      : null;
    const linkedReview = linkedDraft && payload ? reviewItemForArtifact(payload, linkedDraft.artifact_id) : null;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Thread</dt><dd>${escapeHtml(truncateId(thread.thread.thread_id))}</dd></div>
        <div class="detail-row"><dt>Kind</dt><dd>${escapeHtml(thread.derived_kind)}</dd></div>
        <div class="detail-row"><dt>Direction</dt><dd>${escapeHtml(thread.last_direction)}</dd></div>
        <div class="detail-row"><dt>Messages</dt><dd>${escapeHtml(String(thread.messages.length))}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(thread.messages[0]?.subject ?? "No message preview available.")}</p>
      ${
        group
          ? `
            <section class="panel">
              <h4>Inbox autopilot group</h4>
              <p>${escapeHtml(group.summary)}</p>
              <p class="subtle subtle--body">${escapeHtml(group.why_now)}</p>
              <p class="subtle subtle--body">${escapeHtml(`Next action: ${group.review_required ? "review prepared draft" : "prepare grouped drafts"}`)}</p>
              ${
                linkedDraft
                  ? `<p class="subtle subtle--body">${escapeHtml(`Linked draft ${linkedDraft.artifact_id} · review ${linkedDraft.review_state}${linkedReview ? ` (${linkedReview.state})` : ""}`)}</p>`
                  : `<p class="subtle subtle--body">No staged draft exists for this thread yet.</p>`
              }
              <div class="list-item__actions">
                ${
                  group.review_required
                    ? `<button class="button button--primary" data-autopilot-open="${escapeHtml(group.group_id)}" type="button">Open draft review</button>`
                    : `<button class="button button--primary" data-autopilot-prepare="${escapeHtml(group.group_id)}" type="button">Prepare grouped drafts</button>`
                }
                <button class="copy-button" data-copy="${escapeHtml(groupPrimaryCommand(payload!, group))}" type="button">Copy next command</button>
              </div>
            </section>
          `
          : ""
      }
      ${intelligenceBlock}
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack([thread.suggested_next_command])}
      </div>
    `;
  }

  if (detail.kind === "meeting_packet") {
    const packet = detail.detail;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Meeting</dt><dd>${escapeHtml(packet.meeting.summary ?? packet.event_id)}</dd></div>
        <div class="detail-row"><dt>State</dt><dd>${escapeHtml(packet.state)}</dd></div>
        <div class="detail-row"><dt>Starts</dt><dd>${escapeHtml(formatTime(packet.meeting.start_at))}</dd></div>
        <div class="detail-row"><dt>Attendees</dt><dd>${escapeHtml(String(packet.meeting.attendee_count))}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(packet.why_now)}</p>
      <section class="panel">
        <h4>Agenda</h4>
        ${packet.agenda.length > 0 ? `<ul>${packet.agenda.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<div class="empty">No agenda items are staged yet.</div>`}
      </section>
      <section class="panel">
        <h4>Prep checklist</h4>
        ${packet.prep_checklist.length > 0 ? `<ul>${packet.prep_checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<div class="empty">No checklist items are staged yet.</div>`}
      </section>
      <section class="panel">
        <h4>Open questions</h4>
        ${packet.open_questions.length > 0 ? `<ul>${packet.open_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<div class="empty">No open questions are recorded.</div>`}
      </section>
      ${renderRelatedFiles(packet.related_files ?? packet.related_docs)}
      <section class="panel">
        <h4>Related threads</h4>
        ${
          packet.related_threads.length > 0
            ? `<ul>${packet.related_threads.map((item) => `<li>${escapeHtml(item.subject)} · ${escapeHtml(item.counterparty_summary)}</li>`).join("")}</ul>`
            : `<div class="empty">No related inbox threads were attached.</div>`
        }
      </section>
      <section class="panel">
        <h4>Related tasks and recommendations</h4>
        ${
          packet.related_tasks.length > 0 || packet.related_recommendations.length > 0
            ? `<ul>${packet.related_tasks.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("")}${packet.related_recommendations.map((item) => `<li>${escapeHtml(item.summary)}</li>`).join("")}</ul>`
            : `<div class="empty">No directly linked prep work is attached.</div>`
        }
      </section>
      <div class="list-item__actions">
        <button class="button button--primary" data-prepare-meeting-packet="${escapeHtml(packet.event_id)}" type="button">Prepare or refresh packet</button>
        <button class="copy-button" data-copy="${escapeHtml(`personal-ops workflow prep-meetings --event ${packet.event_id}`)}" type="button">Copy CLI command</button>
      </div>
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack(packet.next_commands)}
      </div>
    `;
  }

  if (detail.kind === "outbound_autopilot_group") {
    const group = detail.detail;
    const drafts = payload
      ? group.draft_artifact_ids
          .map((artifactId) => payload.drafts.find((draft) => draft.artifact_id === artifactId) ?? null)
          .filter((draft): draft is DraftArtifact => Boolean(draft))
      : [];
    const approvals = payload
      ? group.approval_ids
          .map((approvalId) => payload.approvals.find((approval) => approval.approval_id === approvalId) ?? null)
          .filter((approval): approval is ApprovalRequest => Boolean(approval))
      : [];
    const sendWindowBlocked = group.state === "blocked" && payload && !payload.outboundAutopilot.send_window.effective_send_enabled;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Group</dt><dd>${escapeHtml(group.group_id)}</dd></div>
        <div class="detail-row"><dt>State</dt><dd>${escapeHtml(group.state)}</dd></div>
        <div class="detail-row"><dt>Drafts</dt><dd>${escapeHtml(String(group.draft_artifact_ids.length))}</dd></div>
        <div class="detail-row"><dt>Approvals</dt><dd>${escapeHtml(String(group.approval_ids.length))}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(group.why_now)}</p>
      ${
        sendWindowBlocked
          ? `<p class="subtle subtle--body">${escapeHtml(`Send is blocked until the CLI enables a send window. Next: personal-ops send-window enable --reason "<reason>"`)}</p>`
          : ""
      }
      <section class="panel">
        <h4>Prepared drafts</h4>
        ${
          drafts.length > 0
            ? `<ul>${drafts.map((draft) => `<li>${escapeHtml(draft.subject || draft.artifact_id)} · ${escapeHtml(draft.status)}</li>`).join("")}</ul>`
            : `<div class="empty">No drafts are attached to this outbound group.</div>`
        }
      </section>
      <section class="panel">
        <h4>Approvals</h4>
        ${
          approvals.length > 0
            ? `<ul>${approvals.map((approval) => `<li>${escapeHtml(approval.approval_id)} · ${escapeHtml(approval.state)}</li>`).join("")}</ul>`
            : `<div class="empty">No approval requests are attached yet.</div>`
        }
      </section>
      ${intelligenceBlock}
      <div class="list-item__actions">
        ${outboundPrimaryButton(group)}
        <button class="button" data-open-approval="${escapeHtml(approvals[0]?.approval_id ?? "")}" type="button"${approvals[0]?.approval_id ? "" : " disabled"}>Open first approval</button>
      </div>
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack(group.next_commands)}
      </div>
    `;
  }

  if (detail.kind === "planning_autopilot_bundle") {
    const bundle = detail.detail;
    return renderPlanningBundleDetail(bundle);
  }

  if (detail.kind === "planning_recommendation") {
    const recommendation = detail.detail.recommendation;
    const payload = state.payload;
    const bundle = payload ? planningBundleForRecommendation(payload, recommendation.recommendation_id) : null;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Status</dt><dd>${escapeHtml(recommendation.status)}</dd></div>
        <div class="detail-row"><dt>Priority</dt><dd>${escapeHtml(recommendation.priority)}</dd></div>
        <div class="detail-row"><dt>Window</dt><dd>${escapeHtml(`${formatTime(recommendation.proposed_start_at)} to ${formatTime(recommendation.proposed_end_at)}`)}</dd></div>
        <div class="detail-row"><dt>Group</dt><dd>${escapeHtml(maybe(recommendation.group_summary, "not grouped"))}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(recommendation.reason_summary)}</p>
      ${
        bundle
          ? `
            <section class="panel">
              <h4>Bundle context</h4>
              <p>${escapeHtml(bundle.summary)}</p>
              <p class="subtle subtle--body">${escapeHtml(bundle.why_now)}</p>
              <div class="list-item__actions">
                <button class="button button--primary" data-planning-bundle="${escapeHtml(bundle.bundle_id)}" type="button">Open bundle</button>
                <button class="copy-button" data-copy="${escapeHtml(planningBundleShowCommand(bundle.bundle_id))}" type="button">Copy bundle command</button>
              </div>
            </section>
          `
          : ""
      }
      ${intelligenceBlock}
      <div class="list-item__actions">
        <button class="button button--primary" data-open-planning="${escapeHtml(recommendation.recommendation_id)}" type="button">Open in Planning</button>
        <button class="copy-button" data-copy="${escapeHtml(recommendationShowCommand(recommendation.recommendation_id))}" type="button">Copy CLI command</button>
      </div>
    `;
  }

  if (detail.kind === "planning_recommendation_group") {
    const group = detail.detail;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Group</dt><dd>${escapeHtml(group.group_summary)}</dd></div>
        <div class="detail-row"><dt>Open</dt><dd>${escapeHtml(String(group.counts_by_status.pending ?? 0))}</dd></div>
        <div class="detail-row"><dt>Stale pending</dt><dd>${escapeHtml(String(group.stale_pending_count))}</dd></div>
        <div class="detail-row"><dt>Median open age</dt><dd>${escapeHtml(formatDurationHours(group.median_open_age_hours))}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(group.closure_meaning_summary ?? "Use the Planning section for the current next action and group-wide controls.")}</p>
      ${intelligenceBlock}
      <div class="list-item__actions">
        <button class="button button--primary" data-open-planning-group="${escapeHtml(group.group_key)}" type="button">Open in Planning</button>
        <button class="copy-button" data-copy="${escapeHtml(recommendationGroupShowCommand(group.group_key))}" type="button">Copy CLI command</button>
      </div>
    `;
  }

  if (detail.kind === "approval_request") {
    const approval = detail.detail.approval_request;
    const groupedContext = payload ? outboundGroupForApproval(payload, approval.approval_id) : null;
    return `
      ${
        groupedContext
          ? `
            <section class="panel">
              <h4>Outbound group context</h4>
              <p>${escapeHtml(groupedContext.summary)}</p>
              <p class="subtle subtle--body">${escapeHtml(groupedContext.why_now)}</p>
              <div class="list-item__actions">
                <button class="button button--primary" data-outbound-open="${escapeHtml(groupedContext.group_id)}" type="button">Open outbound group</button>
                <button class="copy-button" data-copy="${escapeHtml(`personal-ops outbound autopilot --group ${groupedContext.group_id}`)}" type="button">Copy group command</button>
              </div>
            </section>
          `
          : ""
      }
      <div class="detail-list">
        <div class="detail-row"><dt>Approval</dt><dd>${escapeHtml(approval.approval_id)}</dd></div>
        <div class="detail-row"><dt>State</dt><dd>${escapeHtml(approval.state)}</dd></div>
        <div class="detail-row"><dt>Requested</dt><dd>${escapeHtml(formatTime(approval.requested_at))}</dd></div>
        <div class="detail-row"><dt>Expires</dt><dd>${escapeHtml(formatTime(approval.expires_at))}</dd></div>
      </div>
      <p class="subtle subtle--body">Grouped approve and send now live in outbound autopilot. Use this detail view for recovery actions and exact CLI handoff.</p>
      ${intelligenceBlock}
      <div class="list-item__actions">
        <button class="button" data-open-approval="${escapeHtml(approval.approval_id)}" type="button">Open in Approvals</button>
        ${
          approval.state === "send_failed"
            ? `<button class="button" data-approval-reopen="${escapeHtml(approval.approval_id)}" type="button">Reopen approval</button>`
            : approval.state !== "rejected" && approval.state !== "sent" && approval.state !== "expired"
              ? `<button class="button" data-approval-reject="${escapeHtml(approval.approval_id)}" type="button">Reject approval</button>`
              : ""
        }
      </div>
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack([
          `personal-ops approval show ${approval.approval_id}`,
          `personal-ops approval reject ${approval.approval_id} --note "<reason>"`,
          `personal-ops approval reopen ${approval.approval_id} --note "<reason>"`,
          `personal-ops approval cancel ${approval.approval_id} --note "<reason>"`,
          `personal-ops approval approve ${approval.approval_id} --note "<reason>"`,
          `personal-ops approval send ${approval.approval_id} --note "<reason>"`,
        ])}
      </div>
    `;
  }

  if (detail.kind === "github_pull_request") {
    const pullRequest = detail.detail;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>PR</dt><dd>${escapeHtml(`${pullRequest.repository}#${pullRequest.number}`)}</dd></div>
        <div class="detail-row"><dt>Title</dt><dd>${escapeHtml(pullRequest.title)}</dd></div>
        <div class="detail-row"><dt>Author</dt><dd>${escapeHtml(pullRequest.author_login)}</dd></div>
        <div class="detail-row"><dt>Checks</dt><dd>${escapeHtml(pullRequest.check_state)}</dd></div>
        <div class="detail-row"><dt>Review</dt><dd>${escapeHtml(pullRequest.review_state)}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(pullRequest.attention_summary ?? "Use the CLI to inspect the live GitHub detail and continue the review or PR loop.")}</p>
      ${intelligenceBlock}
      <div class="list-item__actions">
        <a class="button" href="${escapeHtml(pullRequest.html_url)}" target="_blank" rel="noreferrer">Open on GitHub</a>
      </div>
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack([`personal-ops github pr ${pullRequest.pr_key}`])}
      </div>
    `;
  }

  if (detail.kind === "snapshot") {
    const snapshot = detail.detail;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Snapshot</dt><dd>${escapeHtml(snapshot.manifest.snapshot_id)}</dd></div>
        <div class="detail-row"><dt>Created</dt><dd>${escapeHtml(formatTime(snapshot.manifest.created_at))}</dd></div>
        <div class="detail-row"><dt>Schema</dt><dd>${escapeHtml(String(snapshot.manifest.schema_version ?? "legacy"))}</dd></div>
        <div class="detail-row"><dt>Source machine</dt><dd>${escapeHtml(snapshot.manifest.source_machine ? `${snapshot.manifest.source_machine.machine_label} (${truncateId(snapshot.manifest.source_machine.machine_id)})` : "legacy snapshot")}</dd></div>
      </div>
      <p class="subtle subtle--body">Restore stays CLI-only and does not merge state.</p>
      ${intelligenceBlock}
      <div class="list-item__actions">
        <button class="button button--primary" data-open-snapshot="${escapeHtml(snapshot.manifest.snapshot_id)}" type="button">Open in Backups</button>
      </div>
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack([
          `personal-ops backup inspect ${snapshot.manifest.snapshot_id}`,
          `personal-ops backup restore ${snapshot.manifest.snapshot_id} --yes`,
        ])}
      </div>
    `;
  }

  return `
    <p>${escapeHtml(detail.message)}</p>
    ${intelligenceBlock}
    <div class="list-item__actions list-item__actions--stack">
      ${commandStack([detail.item.suggested_command])}
    </div>
  `;
}

function renderPlanningBundleDetail(bundle: PlanningAutopilotBundle | null): string {
  if (!bundle) {
    return `<div class="empty">Choose a planning bundle to review the prepared execution path.</div>`;
  }
  return `
    <div class="detail-list">
      <div class="detail-row"><dt>Kind</dt><dd>${escapeHtml(bundle.kind)}</dd></div>
      <div class="detail-row"><dt>State</dt><dd>${escapeHtml(bundle.state)}</dd></div>
      <div class="detail-row"><dt>Apply ready</dt><dd>${escapeHtml(bundle.apply_ready ? "yes" : "no")}</dd></div>
      <div class="detail-row"><dt>Recommendations</dt><dd>${escapeHtml(String(bundle.recommendation_ids.length))}</dd></div>
      <div class="detail-row"><dt>Score band</dt><dd>${escapeHtml(bundle.score_band)}</dd></div>
    </div>
    <p class="subtle subtle--body">${escapeHtml(bundle.why_now)}</p>
    ${
      bundle.prepared_note
        ? `<section class="panel"><h4>Prepared note</h4><p>${escapeHtml(bundle.prepared_note)}</p></section>`
        : ""
    }
    <section class="panel">
      <h4>Execution preview</h4>
      ${
        bundle.execution_preview.length > 0
          ? `<ul>${bundle.execution_preview.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : `<div class="empty">No execution preview is staged yet.</div>`
      }
    </section>
    <section class="panel">
      <h4>Related artifacts</h4>
      ${
        bundle.related_artifacts.length > 0
          ? `<ul>${bundle.related_artifacts.map((artifact) => `<li>${escapeHtml(artifact.title)} · ${escapeHtml(artifact.summary)}</li>`).join("")}</ul>`
          : `<div class="empty">No related artifacts are linked.</div>`
      }
    </section>
    ${
      bundle.recommendations?.length
        ? `
          <section class="panel">
            <h4>Bundle members</h4>
            <ul>${bundle.recommendations.map((member) => `<li>${escapeHtml(member.title)} · ${escapeHtml(member.slot_state)}</li>`).join("")}</ul>
          </section>
        `
        : ""
    }
    <div class="list-item__actions">
      <button class="button" data-planning-bundle-prepare="${escapeHtml(bundle.bundle_id)}" type="button">Refresh bundle prep</button>
      ${
        bundle.apply_ready
          ? `<button class="button button--primary" data-planning-bundle-apply="${escapeHtml(bundle.bundle_id)}" type="button">Apply bundle</button>`
          : ""
      }
      <button class="copy-button" data-copy="${escapeHtml(planningBundleShowCommand(bundle.bundle_id))}" type="button">Copy CLI command</button>
    </div>
    <div class="list-item__actions list-item__actions--stack">
      ${commandStack(bundle.next_commands)}
    </div>
  `;
}

function renderWorklist(payload: ConsolePayload): string {
  return `
    ${renderAssistantSection(payload, "Assistant action queue", "worklist", "No assistant-prepared worklist actions are waiting right now.")}
    ${renderProfileFreshness(payload.autopilot, "day_start", "Day-start freshness")}
    <section class="columns">
      <div class="list-card">
        <h3>Attention queue</h3>
        <div class="list">
          ${renderWorklistList(payload)}
        </div>
      </div>
      <div class="detail-card">
        <h3>Related detail</h3>
        ${renderWorklistDetail(state.worklistDetail)}
      </div>
    </section>
  `;
}

function renderApprovals(payload: ConsolePayload): string {
  const listHtml =
    payload.approvals.length === 0
      ? `<div class="empty">No approval requests are currently open.</div>`
      : payload.approvals
          .map(
            (approval) => `
              <article class="list-item${selectedClass(approval.approval_id === state.selectedApprovalId)}">
                <div class="list-item__top">
                  <h4>${escapeHtml(approval.approval_id)}</h4>
                  <span class="pill ${approval.state === "pending" ? "pill--warn" : "pill--good"}">${escapeHtml(approval.state)}</span>
                </div>
                <p>Artifact ${escapeHtml(approval.artifact_id)} · requested ${escapeHtml(formatTime(approval.requested_at))}</p>
                ${
                  outboundGroupForApproval(payload, approval.approval_id)
                    ? `<p class="subtle subtle--body">${escapeHtml(`Outbound group: ${outboundGroupForApproval(payload, approval.approval_id)?.group_id}`)}</p>`
                    : ""
                }
                <div class="list-item__actions">
                  <button class="button" data-approval="${escapeHtml(approval.approval_id)}" type="button">Inspect</button>
                  <button class="copy-button" data-copy="${escapeHtml(`personal-ops approval show ${approval.approval_id}`)}" type="button">Copy show command</button>
                </div>
              </article>
            `,
          )
          .join("");

  const detail = state.approvalDetail;
  const groupedContext = detail ? outboundGroupForApproval(payload, detail.approval_request.approval_id) : null;
  const detailHtml = !detail
    ? `<div class="empty">Choose an approval to inspect it. Recovery actions stay here, while grouped approve/send now flows through outbound autopilot.</div>`
    : `
        ${
          groupedContext
            ? `
              <section class="panel">
                <h4>Outbound group context</h4>
                <p>${escapeHtml(groupedContext.summary)}</p>
                <p class="subtle subtle--body">${escapeHtml(groupedContext.why_now)}</p>
                <div class="list-item__actions">
                  <button class="button" data-outbound-open="${escapeHtml(groupedContext.group_id)}" type="button">Open outbound group</button>
                  <button class="copy-button" data-copy="${escapeHtml(`personal-ops outbound autopilot --group ${groupedContext.group_id}`)}" type="button">Copy group command</button>
                </div>
              </section>
            `
            : ""
        }
        <div class="detail-list">
          <div class="detail-row"><dt>State</dt><dd>${escapeHtml(detail.approval_request.state)}</dd></div>
          <div class="detail-row"><dt>Subject</dt><dd>${escapeHtml(detail.draft.subject)}</dd></div>
          <div class="detail-row"><dt>To</dt><dd>${escapeHtml(detail.draft.to.join(", ") || "none")}</dd></div>
          <div class="detail-row"><dt>Requested</dt><dd>${escapeHtml(formatTime(detail.approval_request.requested_at))}</dd></div>
          <div class="detail-row"><dt>Expires</dt><dd>${escapeHtml(formatTime(detail.approval_request.expires_at))}</dd></div>
        </div>
        <p class="subtle subtle--body">Use grouped approve and send from Drafts when available. Use the recovery controls here for reject, reopen, or cancel.</p>
        <div class="list-item__actions">
          ${
            detail.approval_request.state === "send_failed"
              ? `<button class="button" data-approval-reopen="${escapeHtml(detail.approval_request.approval_id)}" type="button">Reopen approval</button>`
              : detail.approval_request.state !== "rejected" && detail.approval_request.state !== "sent" && detail.approval_request.state !== "expired"
                ? `<button class="button" data-approval-reject="${escapeHtml(detail.approval_request.approval_id)}" type="button">Reject approval</button>`
                : ""
          }
          ${
            detail.approval_request.state !== "rejected" && detail.approval_request.state !== "sent" && detail.approval_request.state !== "expired"
              ? `<button class="button" data-approval-cancel="${escapeHtml(detail.approval_request.approval_id)}" type="button">Cancel approval</button>`
              : ""
          }
        </div>
        <div class="list-item__actions list-item__actions--stack">
          ${commandStack([
            `personal-ops approval show ${detail.approval_request.approval_id}`,
            `personal-ops approval reject ${detail.approval_request.approval_id} --note "<reason>"`,
            `personal-ops approval reopen ${detail.approval_request.approval_id} --note "<reason>"`,
            `personal-ops approval cancel ${detail.approval_request.approval_id} --note "<reason>"`,
            `personal-ops approval approve ${detail.approval_request.approval_id} --note "<reason>"`,
            `personal-ops approval send ${detail.approval_request.approval_id} --note "<reason>"`,
          ])}
        </div>
      `;

  return `
    ${renderAssistantSection(payload, "Assistant-prepared approval work", "approvals", "No assistant-prepared approval review is waiting right now.")}
    ${renderProfileFreshness(payload.autopilot, "outbound", "Outbound freshness")}
    <section class="columns">
      <div class="list-card">
        <h3>Approval queue</h3>
        <div class="list">${listHtml}</div>
      </div>
      <div class="detail-card">
        <h3>Selected approval</h3>
        ${detailHtml}
      </div>
    </section>
  `;
}

function renderDrafts(payload: ConsolePayload): string {
  const assistantSection = renderAssistantSection(
    payload,
    "Assistant-prepared draft work",
    "drafts",
    "No assistant-prepared draft review is waiting right now.",
  );
  const outboundGroups = payload.outboundAutopilot.groups;
  const groupedDrafts = payload.inboxAutopilot.groups.filter((group) => group.draft_artifact_ids.length > 0);
  if (outboundGroups.length === 0 && groupedDrafts.length === 0 && payload.drafts.length === 0) {
    return `${assistantSection}<section class="empty">No local draft artifacts are currently stored.</section>`;
  }
  return `
    ${assistantSection}
    ${renderProfileFreshness(payload.autopilot, "outbound", "Outbound freshness")}
    ${
      outboundGroups.length > 0
        ? `
          <section class="detail-stack">
            ${outboundGroups
              .map((group) => {
                const linkedInboxGroup = group.source_group_id ? autopilotGroupForDraft(payload, group.draft_artifact_ids[0] ?? "") : null;
                const drafts = group.draft_artifact_ids
                  .map((artifactId) => payload.drafts.find((draft) => draft.artifact_id === artifactId) ?? null)
                  .filter((draft): draft is DraftArtifact => Boolean(draft));
                return `
                  <section class="panel">
                    ${renderOutboundGroupCard(payload, group)}
                    ${
                      linkedInboxGroup
                        ? `<p class="subtle subtle--body">${escapeHtml(`Source inbox group: ${linkedInboxGroup.summary}`)}</p>`
                        : ""
                    }
                    <div class="list">
                      ${drafts.map((draft, index) => {
                        const review = reviewItemForArtifact(payload, draft.artifact_id);
                        const approval = approvalForDraft(payload, draft.artifact_id);
                        return `
                          <article class="list-item">
                            <div class="list-item__top">
                              <h4>${escapeHtml(`${index + 1}. ${draft.subject || "Prepared draft"}`)}</h4>
                              <span class="pill ${draft.status === "approved" || draft.status === "sent" ? "pill--good" : draft.review_state === "resolved" ? "pill--warn" : "pill"}">${escapeHtml(draft.status)}</span>
                            </div>
                            <p>${escapeHtml(draft.to.join(", ") || "No recipients yet")}</p>
                            <p class="subtle subtle--body">${escapeHtml(`Review: ${draft.review_state}${review ? ` (${review.state})` : ""}${approval ? ` · approval ${approval.state}` : ""}`)}</p>
                            <div class="list-item__actions list-item__actions--stack">
                              ${
                                review && review.state === "pending"
                                  ? `<button class="button" data-review-open="${escapeHtml(review.review_id)}" type="button">Open review</button>`
                                  : review && review.state === "opened"
                                    ? `<button class="button" data-review-resolve="${escapeHtml(review.review_id)}" type="button">Resolve review</button>`
                                    : ""
                              }
                              ${
                                group.state === "approval_ready"
                                  ? `<button class="button" data-outbound-request-approval="${escapeHtml(group.group_id)}" type="button">Request group approval</button>`
                                  : group.state === "approval_pending"
                                    ? `<button class="button" data-outbound-approve="${escapeHtml(group.group_id)}" type="button">Approve group</button>`
                                    : group.state === "send_ready"
                                      ? `<button class="button" data-outbound-send="${escapeHtml(group.group_id)}" type="button">Send group</button>`
                                      : `<button class="button" data-outbound-open="${escapeHtml(group.group_id)}" type="button">Inspect group</button>`
                              }
                              <button class="copy-button" data-copy="${escapeHtml(draftCommand(draft.artifact_id))}" type="button">Copy draft command</button>
                            </div>
                          </article>
                        `;
                      }).join("")}
                    </div>
                  </section>
                `;
              })
              .join("")}
          </section>
        `
        : `
          <section class="list">
            ${payload.drafts
              .map(
                (draft) => `
                  <article class="list-item">
                    <div class="list-item__top">
                      <h4>${escapeHtml(draft.subject)}</h4>
                      <span class="pill ${draft.status === "draft" ? "" : "pill--warn"}">${escapeHtml(draft.status)}</span>
                    </div>
                    <p>${escapeHtml(draft.to.join(", ") || "No recipients yet")} · review ${escapeHtml(draft.review_state)}</p>
                    <div class="list-item__actions">
                      ${commandAction("personal-ops mail list")}
                    </div>
                  </article>
                `,
              )
              .join("")}
          </section>
        `
    }
  `;
}

function renderPlanningRecommendationDetail(detail: PlanningRecommendationDetail | null): string {
  if (!detail) {
    return `<div class="empty">Pick the next recommendation or inspect a group to review the current browser-safe planning actions.</div>`;
  }
  const recommendation = detail.recommendation;
  const canAct = recommendation.status === "pending" || recommendation.status === "snoozed";
  return `
    <div class="detail-list">
      <div class="detail-row"><dt>Title</dt><dd>${escapeHtml(maybe(recommendation.proposed_title, "untitled"))}</dd></div>
      <div class="detail-row"><dt>Status</dt><dd>${escapeHtml(recommendation.status)}</dd></div>
      <div class="detail-row"><dt>Priority</dt><dd>${escapeHtml(recommendation.priority)}</dd></div>
      <div class="detail-row"><dt>Window</dt><dd>${escapeHtml(`${formatTime(recommendation.proposed_start_at)} to ${formatTime(recommendation.proposed_end_at)}`)}</dd></div>
      <div class="detail-row"><dt>Reason</dt><dd>${escapeHtml(recommendation.reason_summary)}</dd></div>
    </div>
    <p class="subtle subtle--body">${escapeHtml(maybe(recommendation.rank_reason, recommendation.group_summary ?? "No extra ranking note recorded."))}</p>
    <div class="list-item__actions list-item__actions--stack">
      ${commandStack([
        recommendationShowCommand(recommendation.recommendation_id),
        recommendationApplyCommand(recommendation.recommendation_id),
        recommendationSnoozeCommand(recommendation.recommendation_id),
        recommendationRejectCommand(recommendation.recommendation_id),
      ])}
    </div>
    ${
      canAct
        ? `
          <div class="action-grid">
            <section class="action-card">
              <h4>Apply now</h4>
              <p>Use this when the recommendation is ready to become real work.</p>
              <label class="field">
                <span class="eyebrow">Note</span>
                <textarea id="planning-apply-note" rows="3" placeholder="Why you are applying this now."></textarea>
              </label>
              <button class="button button--primary" data-planning-action="apply" type="button">Apply recommendation</button>
            </section>
            <section class="action-card">
              <h4>Snooze</h4>
              <p>Push this forward without losing the recommendation.</p>
              <label class="field">
                <span class="eyebrow">Preset</span>
                <select id="planning-snooze-preset">
                  <option value="end-of-day">end-of-day</option>
                  <option value="tomorrow-morning" selected>tomorrow-morning</option>
                  <option value="next-business-day">next-business-day</option>
                </select>
              </label>
              <label class="field">
                <span class="eyebrow">Note</span>
                <textarea id="planning-snooze-note" rows="3" placeholder="Why this can wait."></textarea>
              </label>
              <button class="button" data-planning-action="snooze" type="button">Snooze recommendation</button>
            </section>
            <section class="action-card">
              <h4>Reject</h4>
              <p>Use a short reason when this should not stay active.</p>
              <label class="field">
                <span class="eyebrow">Reason</span>
                <select id="planning-reject-reason">
                  <option value="">optional</option>
                  <option value="handled_elsewhere">handled_elsewhere</option>
                  <option value="not_useful">not_useful</option>
                  <option value="wrong_priority">wrong_priority</option>
                  <option value="bad_timing">bad_timing</option>
                  <option value="duplicate">duplicate</option>
                </select>
              </label>
              <label class="field">
                <span class="eyebrow">Note</span>
                <textarea id="planning-reject-note" rows="3" placeholder="Why this recommendation should close."></textarea>
              </label>
              <button class="button" data-planning-action="reject" type="button">Reject recommendation</button>
            </section>
          </div>
        `
        : `
          <div class="empty">This recommendation is currently ${escapeHtml(recommendation.status)}. Use the CLI if you need a different recovery path.</div>
        `
    }
  `;
}

function renderPlanningGroupDetail(detail: PlanningRecommendationGroupDetail | null): string {
  if (!detail) {
    return `<div class="empty">Choose a planning group to see its backlog and group-wide actions.</div>`;
  }
  const pendingCount = detail.counts_by_status.pending ?? 0;
  return `
    <div class="detail-list">
      <div class="detail-row"><dt>Summary</dt><dd>${escapeHtml(detail.group_summary)}</dd></div>
      <div class="detail-row"><dt>Open</dt><dd>${escapeHtml(String(pendingCount))}</dd></div>
      <div class="detail-row"><dt>Manual scheduling</dt><dd>${escapeHtml(detail.has_manual_scheduling_members ? "yes" : "no")}</dd></div>
      <div class="detail-row"><dt>Stale pending</dt><dd>${escapeHtml(String(detail.stale_pending_count))}</dd></div>
      <div class="detail-row"><dt>Next actionable</dt><dd>${escapeHtml(detail.next_actionable_recommendation?.recommendation_id ?? "none")}</dd></div>
    </div>
    <p class="subtle subtle--body">${escapeHtml(detail.closure_meaning_summary ?? "Group actions affect all pending recommendations in this group.")}</p>
    <div class="list-item__actions list-item__actions--stack">
      ${commandStack([
        recommendationGroupShowCommand(detail.group_key),
        recommendationGroupSnoozeCommand(detail.group_key),
        recommendationGroupRejectCommand(detail.group_key),
      ])}
    </div>
    ${
      pendingCount > 0
        ? `
          <div class="action-grid action-grid--compact">
            <section class="action-card">
              <h4>Group snooze</h4>
              <label class="field">
                <span class="eyebrow">Preset</span>
                <select id="planning-group-snooze-preset">
                  <option value="end-of-day">end-of-day</option>
                  <option value="tomorrow-morning" selected>tomorrow-morning</option>
                  <option value="next-business-day">next-business-day</option>
                </select>
              </label>
              <label class="field">
                <span class="eyebrow">Note</span>
                <textarea id="planning-group-snooze-note" rows="3" placeholder="Why this whole group can wait."></textarea>
              </label>
              <button class="button" data-planning-group-action="snooze" type="button">Snooze group</button>
            </section>
            <section class="action-card">
              <h4>Group reject</h4>
              <label class="field">
                <span class="eyebrow">Reason</span>
                <select id="planning-group-reject-reason">
                  <option value="handled_elsewhere" selected>handled_elsewhere</option>
                  <option value="duplicate">duplicate</option>
                </select>
              </label>
              <label class="field">
                <span class="eyebrow">Note</span>
                <textarea id="planning-group-reject-note" rows="3" placeholder="Why this whole group should close."></textarea>
              </label>
              <button class="button" data-planning-group-action="reject" type="button">Reject group</button>
            </section>
          </div>
        `
        : `<div class="empty">This group has no pending recommendations left for browser-safe actions.</div>`
    }
  `;
}

function renderPlanning(payload: ConsolePayload): string {
  const next = payload.planningNext?.recommendation ?? null;
  const bundles = payload.planningAutopilot.bundles;
  const topBacklogSummary =
    payload.planningSummary.most_backlogged_group?.summary ?? "No active planning groups";
  const topReviewNeededSummary =
    payload.planningSummary.top_review_needed_candidate?.summary ?? "No hygiene review needed";
  const topClosureSummary =
    payload.planningSummary.most_completed_group?.summary ?? "No recent closure summary";
  return `
    ${renderAssistantSection(payload, "Assistant-prepared planning work", "planning", "No assistant-prepared planning review is waiting right now.")}
    ${renderProfileFreshness(payload.autopilot, "planning", "Planning freshness")}
    <section class="stats-grid">
      ${metricCard("Open recommendations", `${formatCount(payload.planningSummary.open_count)}`, topBacklogSummary)}
      ${metricCard("Review needed", `${formatCount(payload.planningSummary.review_needed_count)}`, topReviewNeededSummary)}
      ${metricCard("Closed in 30d", `${formatCount(payload.planningSummary.closed_last_30d)}`, topClosureSummary)}
    </section>
    <section class="columns columns--wide-right">
      <div class="list-card">
        <h3>Prepared bundles and groups</h3>
        <div class="list">
          ${
            bundles.length === 0
              ? `<div class="empty">No planning bundles are active right now.</div>`
              : bundles
                  .map(
                    (bundle) => `
                      <article class="list-item${selectedClass(bundle.bundle_id === state.selectedPlanningBundleId)}">
                        <div class="list-item__top">
                          <h4>${escapeHtml(bundle.summary)}</h4>
                          <span class="pill ${bundle.apply_ready ? "pill--warn" : ""}">${escapeHtml(bundle.state)}</span>
                        </div>
                        <p>${escapeHtml(bundle.why_now)}</p>
                        <div class="list-item__actions">
                          <button class="button button--primary" data-planning-bundle="${escapeHtml(bundle.bundle_id)}" type="button">Inspect bundle</button>
                          <button class="button" data-planning-bundle-prepare="${escapeHtml(bundle.bundle_id)}" type="button">Refresh prep</button>
                          ${
                            bundle.apply_ready
                              ? `<button class="button" data-planning-bundle-apply="${escapeHtml(bundle.bundle_id)}" type="button">Apply bundle</button>`
                              : ""
                          }
                          <button class="copy-button" data-copy="${escapeHtml(planningBundleShowCommand(bundle.bundle_id))}" type="button">Copy CLI command</button>
                        </div>
                      </article>
                    `,
                  )
                  .join("")
          }
          ${
            next
              ? `
                <article class="list-item${selectedClass(next.recommendation_id === state.selectedPlanningRecommendationId)}">
                  <div class="list-item__top">
                    <h4>${escapeHtml(maybe(next.proposed_title, "untitled"))}</h4>
                    <span class="pill">${escapeHtml(next.status)}</span>
                  </div>
                  <p>${escapeHtml(next.reason_summary)}</p>
                  <div class="list-item__actions">
                    <button class="button button--primary" data-planning-recommendation="${escapeHtml(next.recommendation_id)}" type="button">Inspect recommendation</button>
                    <button class="copy-button" data-copy="${escapeHtml(recommendationShowCommand(next.recommendation_id))}" type="button">Copy CLI command</button>
                  </div>
                </article>
              `
              : `<div class="empty">No next planning recommendation is currently available.</div>`
          }
          ${
            payload.planningGroups.length === 0
              ? `<div class="empty">No planning groups are currently open.</div>`
              : payload.planningGroups
                  .map(
                    (group) => `
                      <article class="list-item${selectedClass(group.group_key === state.selectedPlanningGroupKey)}">
                        <div class="list-item__top">
                          <h4>${escapeHtml(group.group_summary)}</h4>
                          <span class="pill">${escapeHtml(String(group.pending_count))} open</span>
                        </div>
                        <p>${escapeHtml(group.top_rank_reason ?? "Open the group for details and group-wide actions.")}</p>
                        <div class="list-item__actions">
                          <button class="button" data-planning-group="${escapeHtml(group.group_key)}" type="button">Inspect group</button>
                          <button class="copy-button" data-copy="${escapeHtml(recommendationGroupShowCommand(group.group_key))}" type="button">Copy CLI command</button>
                        </div>
                      </article>
                    `,
                  )
                  .join("")
          }
        </div>
      </div>
      <div class="detail-stack">
        <section class="detail-card">
          <h3>Selected bundle</h3>
          ${renderPlanningBundleDetail(state.planningBundleDetail)}
        </section>
        <section class="detail-card">
          <h3>Selected recommendation</h3>
          ${renderPlanningRecommendationDetail(state.planningRecommendationDetail)}
        </section>
        <section class="detail-card">
          <h3>Selected group</h3>
          ${renderPlanningGroupDetail(state.planningGroupDetail)}
        </section>
      </div>
    </section>
  `;
}

function renderAudit(payload: ConsolePayload): string {
  return `
    <section class="panel">
      <div class="filter-row">
        <label class="field field--compact">
          <span class="eyebrow">Category</span>
          <select id="audit-category">
            <option value="">All supported categories</option>
            <option value="sync" ${state.auditCategory === "sync" ? "selected" : ""}>sync</option>
            <option value="task" ${state.auditCategory === "task" ? "selected" : ""}>task</option>
            <option value="task_suggestion" ${state.auditCategory === "task_suggestion" ? "selected" : ""}>task_suggestion</option>
            <option value="planning" ${state.auditCategory === "planning" ? "selected" : ""}>planning</option>
          </select>
        </label>
        <label class="field field--compact">
          <span class="eyebrow">Limit</span>
          <input id="audit-limit" type="number" min="1" max="200" value="${escapeHtml(String(state.auditLimit))}" />
        </label>
        <button class="button" id="audit-refresh" type="button">Refresh audit</button>
      </div>
    </section>
    <section class="list">
      ${
        payload.audit.length === 0
          ? `<div class="empty">No audit events matched the current filter.</div>`
          : payload.audit
              .map(
                (event) => `
                  <article class="list-item">
                    <div class="list-item__top">
                      <h4>${escapeHtml(event.action)}</h4>
                      <span class="${formatSeverity(event.metadata_redacted ? "warn" : "pass")}">${escapeHtml(event.assistant_safe_category ?? "operator")}</span>
                    </div>
                    <p>${escapeHtml(event.summary ?? `${event.target_type} ${event.target_id}`)}</p>
                    <p class="subtle subtle--body">${escapeHtml(formatTime(event.timestamp))}</p>
                  </article>
                `,
              )
              .join("")
      }
    </section>
  `;
}

function renderBackups(payload: ConsolePayload): string {
  const detail = state.snapshotInspection;
  return `
    ${renderAssistantSection(payload, "Assistant-prepared backup work", "backups", "No assistant-prepared backup actions are waiting right now.")}
    <section class="columns">
      <div class="list-card">
        <div class="card-toolbar">
          <div>
            <h3>Snapshots</h3>
            <p class="subtle subtle--body">Create a fresh recovery point here. Restore stays CLI-only.</p>
          </div>
          <button class="button button--primary" data-create-snapshot="1" type="button">Create snapshot</button>
        </div>
        <div class="list">
          ${
            payload.snapshots.length === 0
              ? `<div class="empty">No recovery snapshots exist yet.</div>`
              : payload.snapshots
                  .map(
                    (snapshot) => `
                      <article class="list-item${selectedClass(snapshot.snapshot_id === state.selectedSnapshotId)}">
                        <div class="list-item__top">
                          <h4>${escapeHtml(snapshot.snapshot_id)}</h4>
                          <span class="pill">${escapeHtml(snapshot.daemon_state)}</span>
                        </div>
                        <p>${escapeHtml(formatTime(snapshot.created_at))}</p>
                        <div class="list-item__actions">
                          <button class="button" data-snapshot="${escapeHtml(snapshot.snapshot_id)}" type="button">Inspect</button>
                          <button class="copy-button" data-copy="${escapeHtml(`personal-ops backup inspect ${snapshot.snapshot_id}`)}" type="button">Copy inspect command</button>
                        </div>
                      </article>
                    `,
                  )
                  .join("")
          }
        </div>
      </div>
      <div class="detail-card">
        <h3>Selected snapshot</h3>
        ${
          !detail
            ? `<div class="empty">Choose a snapshot to inspect its provenance and CLI restore guidance.</div>`
            : `
              <div class="detail-list">
                <div class="detail-row"><dt>Snapshot id</dt><dd>${escapeHtml(detail.manifest.snapshot_id)}</dd></div>
                <div class="detail-row"><dt>Created</dt><dd>${escapeHtml(formatTime(detail.manifest.created_at))}</dd></div>
                <div class="detail-row"><dt>Schema</dt><dd>${escapeHtml(String(detail.manifest.schema_version ?? "legacy"))}</dd></div>
                <div class="detail-row"><dt>Source machine</dt><dd>${escapeHtml(detail.manifest.source_machine ? `${detail.manifest.source_machine.machine_label} (${truncateId(detail.manifest.source_machine.machine_id)})` : "legacy snapshot with unknown provenance")}</dd></div>
              </div>
              <p class="subtle subtle--body">Restore stays in the CLI. Cross-machine restore requires <span class="code">--allow-cross-machine</span> and does not merge state.</p>
              <div class="list-item__actions list-item__actions--stack">
                ${commandStack([
                  `personal-ops backup inspect ${detail.manifest.snapshot_id}`,
                  `personal-ops backup restore ${detail.manifest.snapshot_id} --yes`,
                ])}
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderCurrentSection(payload: ConsolePayload): string {
  switch (state.section) {
    case "overview":
      return renderOverview(payload);
    case "review":
      return renderReviewReport(payload.reviewReport);
    case "worklist":
      return renderWorklist(payload);
    case "approvals":
      return renderApprovals(payload);
    case "drafts":
      return renderDrafts(payload);
    case "planning":
      return renderPlanning(payload);
    case "audit":
      return renderAudit(payload);
    case "backups":
      return renderBackups(payload);
    default:
      return renderOverview(payload);
  }
}

function syncNav(): void {
  requiredSectionTitle.textContent = SECTIONS[state.section];
  for (const button of document.querySelectorAll<HTMLButtonElement>(".nav__item")) {
    button.classList.toggle("is-active", button.dataset.section === state.section);
  }
}

function render(): void {
  syncNav();
  if (!state.payload) {
    const cards: Array<{ message: string; tone: BannerTone }> = [];
    if (state.flash) {
      cards.push(state.flash);
    }
    renderBannerCards(cards);
    requiredContent.innerHTML = `<section class="hero"><h3>Loading console…</h3><p>The daemon is gathering local operator state.</p></section>`;
    return;
  }
  const payload = state.payload;
  const cards: Array<{ message: string; tone: BannerTone }> = [];
  if (state.flash) {
    cards.push(state.flash);
  }
  if (payload.status.machine.state_origin === "restored_cross_machine") {
    cards.push({
      message:
        "This machine is operating on state restored from a different machine. Re-run local auth checks before trusting live provider access.",
      tone: "warn",
    });
  } else if (payload.status.machine.state_origin === "unknown_legacy_restore") {
    cards.push({
      message:
        "This state came from a legacy snapshot without machine provenance. Treat restore history as unknown until revalidated locally.",
      tone: "warn",
    });
  } else if (state.lockedHint) {
    cards.push({
      message: "This page can show a locked state after an expired launch link. Re-run `personal-ops console` if needed.",
      tone: "warn",
    });
  }
  renderBannerCards(cards);
  requiredContent.innerHTML = renderCurrentSection(payload);
}

async function refreshAll(): Promise<void> {
  state.payload = null;
  render();
  try {
    state.payload = await loadPayload();
    resolveSelections(state.payload);
    await loadSelectedDetails();
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    renderBannerCards([
      { message: error instanceof Error ? error.message : String(error), tone: "critical" },
    ]);
    requiredContent.innerHTML = `<section class="empty">The console could not load local data. Run <span class="code">personal-ops doctor</span> and refresh this page.</section>`;
  }
}

async function refreshAuditOnly(): Promise<void> {
  if (!state.payload) {
    return;
  }
  try {
    const audit = await fetchAudit(state.auditLimit, state.auditCategory);
    state.payload.audit = audit.events;
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(error instanceof Error ? error.message : String(error), "critical");
    render();
  }
}

async function selectSnapshot(snapshotId: string): Promise<void> {
  state.selectedSnapshotId = snapshotId;
  state.section = "backups";
  try {
    await loadSelectedSnapshotInspection();
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(error instanceof Error ? error.message : String(error), "critical");
    render();
  }
}

async function selectApproval(approvalId: string): Promise<void> {
  state.selectedApprovalId = approvalId;
  if (state.payload) {
    state.selectedOutboundGroupId = outboundGroupForApproval(state.payload, approvalId)?.group_id ?? state.selectedOutboundGroupId;
  }
  state.section = "approvals";
  try {
    await loadSelectedApprovalDetail();
    await loadSelectedOutboundGroupDetail();
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(error instanceof Error ? error.message : String(error), "critical");
    render();
  }
}

async function selectPlanningRecommendation(recommendationId: string): Promise<void> {
  state.selectedPlanningRecommendationId = recommendationId;
  state.section = "planning";
  try {
    await loadSelectedPlanningRecommendationDetail();
    if (state.payload) {
      const bundle = planningBundleForRecommendation(state.payload, recommendationId);
      if (bundle) {
        state.selectedPlanningBundleId = bundle.bundle_id;
        await loadSelectedPlanningBundleDetail();
      }
    }
    if (state.planningRecommendationDetail?.recommendation.group_key) {
      state.selectedPlanningGroupKey = state.planningRecommendationDetail.recommendation.group_key;
      await loadSelectedPlanningGroupDetail();
    }
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(error instanceof Error ? error.message : String(error), "critical");
    render();
  }
}

async function selectPlanningBundle(bundleId: string): Promise<void> {
  state.selectedPlanningBundleId = bundleId;
  state.section = "planning";
  try {
    await loadSelectedPlanningBundleDetail();
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(error instanceof Error ? error.message : String(error), "critical");
    render();
  }
}

async function selectPlanningGroup(groupKey: string): Promise<void> {
  state.selectedPlanningGroupKey = groupKey;
  state.section = "planning";
  try {
    await loadSelectedPlanningGroupDetail();
    const nextRecommendationId = state.planningGroupDetail?.next_actionable_recommendation?.recommendation_id;
    if (nextRecommendationId) {
      state.selectedPlanningRecommendationId = nextRecommendationId;
      await loadSelectedPlanningRecommendationDetail();
    }
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(error instanceof Error ? error.message : String(error), "critical");
    render();
  }
}

async function selectWorklistItem(itemId: string): Promise<void> {
  state.selectedWorklistItemId = itemId;
  state.section = "worklist";
  try {
    await loadSelectedWorklistDetail();
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(error instanceof Error ? error.message : String(error), "critical");
    render();
  }
}

async function openAutopilotGroup(groupId: string): Promise<void> {
  const payload = state.payload;
  const group = payload?.inboxAutopilot.groups.find((item) => item.group_id === groupId) ?? null;
  if (!payload || !group) {
    setFlash("That inbox autopilot group is no longer available. Refresh the console and try again.", "warn");
    render();
    return;
  }
  const matchingWorklistItem = payload.worklist.items.find(
    (item) => item.target_type === "mail_thread" && group.threads.some((thread) => thread.thread_id === item.target_id),
  );
  if (group.review_required || group.draft_artifact_ids.length > 0) {
    state.section = "drafts";
    if (matchingWorklistItem) {
      state.selectedWorklistItemId = matchingWorklistItem.item_id;
    }
    location.hash = state.section;
    render();
    return;
  }
  if (matchingWorklistItem) {
    await selectWorklistItem(matchingWorklistItem.item_id);
    return;
  }
  state.section = "worklist";
  location.hash = state.section;
  render();
}

async function openOutboundGroup(groupId: string): Promise<void> {
  state.selectedOutboundGroupId = groupId;
  try {
    await loadSelectedOutboundGroupDetail();
    const group = state.outboundGroupDetail;
    if (!group) {
      setFlash("That outbound group is no longer available. Refresh the console and try again.", "warn");
      render();
      return;
    }
    const firstApprovalId = group.approval_ids[0];
    if (firstApprovalId) {
      state.selectedApprovalId = firstApprovalId;
      await loadSelectedApprovalDetail();
    }
    state.section = group.state === "approval_pending" || group.state === "blocked" ? "approvals" : "drafts";
    location.hash = state.section;
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(error instanceof Error ? error.message : String(error), "critical");
    render();
  }
}

async function openWorkflowAction(workflowName: WorkflowBundleReport["workflow"], actionIndex: number): Promise<void> {
  const payload = state.payload;
  const action = payload ? workflowByName(payload, workflowName).actions[actionIndex] : null;
  if (!payload || !action) {
    setFlash("That workflow action is no longer available. Refresh the console and try again.", "warn");
    render();
    return;
  }

  const matchingWorklistItem = payload.worklist.items.find(
    (item) => item.target_type === action.target_type && item.target_id === action.target_id,
  );
  if (matchingWorklistItem) {
    await selectWorklistItem(matchingWorklistItem.item_id);
    return;
  }

  if (action.target_type === "planning_recommendation" && action.target_id) {
    await selectPlanningRecommendation(action.target_id);
    return;
  }
  if (action.target_type === "planning_autopilot_bundle" && action.target_id) {
    await selectPlanningBundle(action.target_id);
    return;
  }
  if (action.target_type === "inbox_autopilot_group" && action.target_id) {
    await openAutopilotGroup(action.target_id);
    return;
  }
  if (action.target_type === "outbound_autopilot_group" && action.target_id) {
    await openOutboundGroup(action.target_id);
    return;
  }
  if (action.target_type === "planning_recommendation_group" && action.target_id) {
    await selectPlanningGroup(action.target_id);
    return;
  }
  if (action.target_type === "snapshot" && action.target_id) {
    await selectSnapshot(action.target_id);
    return;
  }
  if (action.target_type === "approval_request" && action.target_id) {
    await selectApproval(action.target_id);
    return;
  }
  if (action.target_type === "calendar_event" && action.target_id) {
    state.section = "worklist";
    location.hash = state.section;
    state.worklistDetail = await buildWorklistDetail(
      syntheticAttentionItem(
        "calendar_event",
        action.target_id,
        action.label,
        action.summary,
        action.command,
      ),
    );
    render();
    return;
  }

  await navigator.clipboard.writeText(action.command);
  setFlash("No in-console detail exists for that action yet. The CLI command has been copied instead.", "warn");
  render();
}

async function openAssistantAction(actionId: string): Promise<void> {
  const payload = state.payload;
  const action = payload?.assistantQueue.actions.find((item) => item.action_id === actionId) ?? null;
  if (!payload || !action) {
    setFlash("That assistant action is no longer available. Refresh the console and try again.", "warn");
    render();
    return;
  }

  const matchingWorklistItem = payload.worklist.items.find(
    (item) => item.target_type === action.target_type && item.target_id === action.target_id,
  );
  if (matchingWorklistItem) {
    await selectWorklistItem(matchingWorklistItem.item_id);
    return;
  }
  if (action.target_type === "planning_recommendation" && action.target_id) {
    await selectPlanningRecommendation(action.target_id);
    return;
  }
  if (action.target_type === "planning_autopilot_bundle" && action.target_id) {
    await selectPlanningBundle(action.target_id);
    return;
  }
  if (action.target_type === "inbox_autopilot_group" && action.target_id) {
    await openAutopilotGroup(action.target_id);
    return;
  }
  if (action.target_type === "outbound_autopilot_group" && action.target_id) {
    await openOutboundGroup(action.target_id);
    return;
  }
  if (action.target_type === "approval_request" && action.target_id) {
    await selectApproval(action.target_id);
    return;
  }
  if (action.target_type === "snapshot" && action.target_id) {
    await selectSnapshot(action.target_id);
    return;
  }
  if (action.target_type === "calendar_event" && action.target_id) {
    state.section = "worklist";
    location.hash = state.section;
    state.worklistDetail = await buildWorklistDetail(
      syntheticAttentionItem(
        "calendar_event",
        action.target_id,
        action.title,
        action.summary,
        action.command ?? `personal-ops workflow prep-meetings --event ${action.target_id}`,
      ),
    );
    render();
    return;
  }
  if (action.section === "drafts") {
    state.section = "drafts";
    location.hash = state.section;
    render();
    return;
  }
  if (action.command) {
    await navigator.clipboard.writeText(action.command);
    setFlash("No deeper in-console detail exists for that action yet. The CLI command has been copied instead.", "warn");
    render();
    return;
  }
  state.section = action.section === "overview" ? "overview" : action.section;
  location.hash = state.section;
  render();
}

async function prepareInboxAutopilotGroupFromConsole(groupId: string): Promise<void> {
  const payload = state.payload;
  const group = payload?.inboxAutopilot.groups.find((item) => item.group_id === groupId) ?? null;
  if (!group) {
    setFlash("That inbox autopilot group is no longer available. Refresh the console and try again.", "warn");
    render();
    return;
  }
  if (!confirm(`Prepare or refresh drafts for this ${group.kind === "needs_reply" ? "reply" : "follow-up"} block now?`)) {
    return;
  }
  try {
    const response = await postJson<{
      inbox_autopilot_group: {
        summary: string;
        group: InboxAutopilotGroup;
        failed_thread_ids: string[];
      };
    }>(`/v1/inbox/autopilot/groups/${encodeURIComponent(groupId)}/prepare`, {});
    state.section = response.inbox_autopilot_group.group.review_required ? "drafts" : "worklist";
    location.hash = state.section;
    setFlash(
      response.inbox_autopilot_group.failed_thread_ids.length > 0
        ? `${response.inbox_autopilot_group.summary} Some threads still need manual follow-up.`
        : response.inbox_autopilot_group.summary,
      response.inbox_autopilot_group.failed_thread_ids.length > 0 ? "warn" : "good",
    );
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run personal-ops inbox autopilot for the CLI path.`,
      "critical",
    );
    render();
  }
}

async function prepareMeetingPacketFromConsole(eventId: string): Promise<void> {
  if (!confirm("Prepare or refresh this meeting packet now? This only stages local prep and does not contact attendees.")) {
    return;
  }
  try {
    const response = await postJson<{
      meeting_prep_packet: {
        summary: string;
        packet: MeetingPrepPacket;
      };
    }>(`/v1/workflows/prep-meetings/${encodeURIComponent(eventId)}/prepare`, {});
    setFlash(response.meeting_prep_packet.summary, "good");
    state.section = "worklist";
    location.hash = state.section;
    await refreshAll();
    state.worklistDetail = {
      kind: "meeting_packet",
      item: syntheticAttentionItem(
        "calendar_event",
        eventId,
        response.meeting_prep_packet.packet.meeting.summary ?? eventId,
        response.meeting_prep_packet.packet.summary,
        `personal-ops workflow prep-meetings --event ${eventId}`,
      ),
      detail: response.meeting_prep_packet.packet,
    };
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run personal-ops workflow prep-meetings --event ${eventId} --prepare if you need the CLI path.`,
      "critical",
    );
    render();
  }
}

async function preparePlanningBundleFromConsole(bundleId: string): Promise<void> {
  if (!confirm("Refresh this planning bundle now? This only prepares grouped execution work and does not apply anything.")) {
    return;
  }
  try {
    const response = await postJson<PlanningAutopilotBundleResponse>(
      `/v1/planning/autopilot/bundles/${encodeURIComponent(bundleId)}/prepare`,
      {},
    );
    const bundle = (response.planning_autopilot_bundle as { bundle?: PlanningAutopilotBundle }).bundle
      ?? (response.planning_autopilot_bundle as PlanningAutopilotBundle);
    state.selectedPlanningBundleId = bundle.bundle_id;
    state.section = "planning";
    location.hash = state.section;
    setFlash("Planning bundle refreshed and ready for review.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run ${planningBundlePrepareCommand(bundleId)} if you need the CLI path.`,
      "critical",
    );
    render();
  }
}

async function applyPlanningBundleFromConsole(bundleId: string): Promise<void> {
  const note = window.prompt("Add a short operator note before applying this bundle.", "Apply reviewed planning bundle");
  if (note === null) {
    return;
  }
  if (!note.trim()) {
    setFlash("Add a note before applying this planning bundle.", "warn");
    render();
    return;
  }
  if (!confirm("Apply this prepared planning bundle now? This will create or update the underlying work.")) {
    return;
  }
  try {
    const response = await postJson<PlanningAutopilotBundleResponse>(
      `/v1/planning/autopilot/bundles/${encodeURIComponent(bundleId)}/apply`,
      { note: note.trim(), confirmed: true },
    );
    const bundle = (response.planning_autopilot_bundle as { bundle?: PlanningAutopilotBundle }).bundle
      ?? (response.planning_autopilot_bundle as PlanningAutopilotBundle);
    state.selectedPlanningBundleId = bundle.bundle_id;
    state.section = "planning";
    location.hash = state.section;
    setFlash("Planning bundle applied.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run ${planningBundleApplyCommand(bundleId)} if you need the CLI path.`,
      "critical",
    );
    render();
  }
}

async function openReviewFromConsole(reviewId: string): Promise<void> {
  try {
    await postJson<{ review_item: ReviewItem; gmail_review_url: string }>(
      `/v1/review-queue/${encodeURIComponent(reviewId)}/open`,
      {},
    );
    setFlash("Draft review opened. Gmail review guidance has been opened separately if available.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(`${error instanceof Error ? error.message : String(error)} Run personal-ops review open ${reviewId} if needed.`, "critical");
    render();
  }
}

async function resolveReviewFromConsole(reviewId: string): Promise<void> {
  const note = window.prompt("Add a short review note before resolving this draft review.", "Reviewed");
  if (note === null) {
    return;
  }
  try {
    await postJson<{ review_item: ReviewItem }>(`/v1/review-queue/${encodeURIComponent(reviewId)}/resolve`, {
      note,
    });
    setFlash("Draft review resolved.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(`${error instanceof Error ? error.message : String(error)} Run personal-ops review resolve ${reviewId} if needed.`, "critical");
    render();
  }
}

async function requestApprovalFromConsole(artifactId: string): Promise<void> {
  const note = window.prompt("Optional approval note for this prepared draft.", "Prepared for operator review");
  if (note === null) {
    return;
  }
  if (!confirm("Request approval for this prepared draft now? Send will still remain gated.")) {
    return;
  }
  try {
    await postJson<{ approval_request: ApprovalRequest }>(
      `/v1/mail/drafts/${encodeURIComponent(artifactId)}/request-approval`,
      { note },
    );
    state.section = "approvals";
    location.hash = state.section;
    setFlash("Approval requested. Decisions and send still stay in the gated approval flow.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run personal-ops approval show or personal-ops review commands if needed.`,
      "critical",
    );
    render();
  }
}

async function requestOutboundApprovalFromConsole(groupId: string): Promise<void> {
  const note = window.prompt("Add a short operator note before requesting grouped approval.", "Ready for grouped approval");
  if (note === null) {
    return;
  }
  if (!note.trim()) {
    setFlash("Add a note before requesting grouped approval.", "warn");
    render();
    return;
  }
  if (!confirm("Request approval for every reviewed draft in this outbound group now?")) {
    return;
  }
  try {
    await postJson<OutboundAutopilotGroupResponse>(
      `/v1/outbound/autopilot/groups/${encodeURIComponent(groupId)}/request-approval`,
      { note: note.trim() },
    );
    state.selectedOutboundGroupId = groupId;
    state.section = "drafts";
    location.hash = state.section;
    setFlash("Grouped approval requested.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(`${error instanceof Error ? error.message : String(error)} Run personal-ops outbound autopilot --group ${groupId} for the CLI path.`, "critical");
    render();
  }
}

async function approveOutboundGroupFromConsole(groupId: string): Promise<void> {
  const note = window.prompt("Add a short operator note before approving this outbound group.", "Approve grouped outbound work");
  if (note === null) {
    return;
  }
  if (!note.trim()) {
    setFlash("Add a note before approving this outbound group.", "warn");
    render();
    return;
  }
  if (!confirm("Approve every pending approval in this outbound group now?")) {
    return;
  }
  try {
    await postJson<OutboundAutopilotGroupResponse>(
      `/v1/outbound/autopilot/groups/${encodeURIComponent(groupId)}/approve`,
      { note: note.trim(), confirmed: true },
    );
    state.selectedOutboundGroupId = groupId;
    state.section = "drafts";
    location.hash = state.section;
    setFlash("Outbound group approved.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(`${error instanceof Error ? error.message : String(error)} Run personal-ops outbound autopilot --group ${groupId} for the CLI path.`, "critical");
    render();
  }
}

async function sendOutboundGroupFromConsole(groupId: string): Promise<void> {
  const note = window.prompt("Add a short operator note before sending this outbound group.", "Send grouped outbound work");
  if (note === null) {
    return;
  }
  if (!note.trim()) {
    setFlash("Add a note before sending this outbound group.", "warn");
    render();
    return;
  }
  if (!confirm("Send every approved draft in this outbound group now? This is a live outbound action.")) {
    return;
  }
  try {
    await postJson<OutboundAutopilotGroupResponse>(
      `/v1/outbound/autopilot/groups/${encodeURIComponent(groupId)}/send`,
      { note: note.trim(), confirmed: true },
    );
    state.selectedOutboundGroupId = groupId;
    state.section = "drafts";
    location.hash = state.section;
    setFlash("Outbound group sent.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(`${error instanceof Error ? error.message : String(error)} Run personal-ops outbound autopilot --group ${groupId} for the CLI path.`, "critical");
    render();
  }
}

async function performApprovalRecoveryAction(action: "reject" | "reopen" | "cancel", approvalId: string): Promise<void> {
  const note = window.prompt(
    action === "reject"
      ? "Add a short operator note before rejecting this approval."
      : action === "reopen"
        ? "Add a short operator note before reopening this approval."
        : "Add a short operator note before canceling this approval.",
    action === "reject" ? "Reject approval" : action === "reopen" ? "Reopen approval" : "Cancel approval",
  );
  if (note === null) {
    return;
  }
  if (!note.trim()) {
    setFlash(`Add a note before choosing ${action}.`, "warn");
    render();
    return;
  }
  if (!confirm(`Run ${action} for approval ${approvalId} now?`)) {
    return;
  }
  try {
    await postJson<ApprovalDetailResponse>(`/v1/approval-queue/${encodeURIComponent(approvalId)}/${action}`, {
      note: note.trim(),
    });
    state.selectedApprovalId = approvalId;
    state.section = "approvals";
    location.hash = state.section;
    setFlash(`Approval ${action} completed.`, "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(`${error instanceof Error ? error.message : String(error)} Run personal-ops approval ${action} ${approvalId} --note "<reason>" for the CLI path.`, "critical");
    render();
  }
}

async function runAssistantActionFromConsole(actionId: string): Promise<void> {
  const payload = state.payload;
  const action = payload?.assistantQueue.actions.find((item) => item.action_id === actionId) ?? null;
  if (!action) {
    setFlash("That assistant action is no longer available. Refresh the console and try again.", "warn");
    render();
    return;
  }
  const confirmation = action.title === "Refresh local context"
    ? "Refresh mailbox, calendar, GitHub, and Drive context where available?"
    : `Run "${action.title}" now?`;
  if (!confirm(confirmation)) {
    return;
  }
  if (actionId.startsWith("assistant.prepare-reply-group:") || actionId.startsWith("assistant.prepare-followup-group:")) {
    const groupId = actionId.split(":").slice(1).join(":");
    await prepareInboxAutopilotGroupFromConsole(groupId);
    return;
  }
  if (actionId.startsWith("assistant.prepare-meeting-packet:")) {
    const eventId = actionId.split(":").slice(1).join(":");
    await prepareMeetingPacketFromConsole(eventId);
    return;
  }
  if (actionId.startsWith("assistant.prepare-planning-bundle:")) {
    const bundleId = actionId.split(":").slice(1).join(":");
    await preparePlanningBundleFromConsole(bundleId);
    return;
  }
  try {
    const response = await postJson<AssistantRunResponse>(
      `/v1/assistant/actions/${encodeURIComponent(actionId)}/run`,
      {},
    );
    state.section = action.section === "overview" ? "overview" : action.section;
    setFlash(response.assistant_run.summary, response.assistant_run.state === "failed" ? "critical" : "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)}${action.command ? ` Run ${action.command} if you need the CLI path.` : ""}`,
      "critical",
    );
    render();
  }
}

function requireValue(selector: string, message: string): string {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  const value = input?.value.trim() ?? "";
  if (!value) {
    throw new Error(message);
  }
  return value;
}

async function createSnapshotFromConsole(): Promise<void> {
  if (!confirm("Create a fresh recovery snapshot now? Restore still stays in the CLI.")) {
    return;
  }
  try {
    const response = await postJson<SnapshotCreateResponse>("/v1/snapshots", {});
    state.selectedSnapshotId = response.snapshot.snapshot_id;
    state.section = "backups";
    setFlash(`Created snapshot ${response.snapshot.snapshot_id}.`, "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run personal-ops backup create if you need to retry from the CLI.`,
      "critical",
    );
    render();
  }
}

async function submitReviewPackageFeedbackFromConsole(
  packageId: string,
  reason: "useful" | "wrong_priority" | "bad_timing" | "not_useful",
  packageItemId?: string,
): Promise<void> {
  const note = window.prompt(
    `Add a short operator note for the "${reason.replaceAll("_", " ")}" feedback.`,
    packageItemId ? `Review item ${reason}` : `Review package ${reason}`,
  );
  if (note === null) {
    return;
  }
  if (!note.trim()) {
    setFlash("Add a note before sending review feedback.", "warn");
    render();
    return;
  }
  try {
    await postJson(`/v1/review/packages/${encodeURIComponent(packageId)}/feedback`, {
      reason,
      note: note.trim(),
      ...(packageItemId ? { package_item_id: packageItemId } : {}),
    });
    setFlash("Review feedback saved.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run ${reviewPackageFeedbackCommand(packageId, reason, packageItemId)} for the CLI path.`,
      "critical",
    );
    render();
  }
}

async function decideReviewTuningProposalFromConsole(action: "approve" | "dismiss", proposalId: string): Promise<void> {
  const note = window.prompt(
    action === "approve"
      ? "Add a short operator note before approving this tuning proposal."
      : "Add a short operator note before dismissing this tuning proposal.",
    action === "approve" ? "Approve review tuning" : "Dismiss review tuning",
  );
  if (note === null) {
    return;
  }
  if (!note.trim()) {
    setFlash("Add a note before deciding this tuning proposal.", "warn");
    render();
    return;
  }
  if (!confirm(`${action === "approve" ? "Approve" : "Dismiss"} this review tuning proposal now?`)) {
    return;
  }
  try {
    await postJson(`/v1/review/tuning/${encodeURIComponent(proposalId)}/${action}`, { note: note.trim() });
    setFlash(action === "approve" ? "Review tuning approved." : "Review tuning dismissed.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run personal-ops review tuning ${proposalId} ${action} --note "<reason>" for the CLI path.`,
      "critical",
    );
    render();
  }
}

async function performPlanningAction(action: "apply" | "snooze" | "reject"): Promise<void> {
  const recommendationId = state.selectedPlanningRecommendationId;
  if (!recommendationId) {
    setFlash("Choose a recommendation before running a planning action.", "warn");
    render();
    return;
  }
  try {
    let requestPath = "";
    let body: Record<string, string> = {};
    let confirmation = "";
    if (action === "apply") {
      body = { note: requireValue("#planning-apply-note", "Add a note before applying this recommendation.") };
      requestPath = `/v1/planning-recommendations/${encodeURIComponent(recommendationId)}/apply`;
      confirmation = "Apply this recommendation now? This will create the underlying work.";
    } else if (action === "snooze") {
      body = {
        preset: requireValue("#planning-snooze-preset", "Choose a snooze preset."),
        note: requireValue("#planning-snooze-note", "Add a note before snoozing this recommendation."),
      };
      requestPath = `/v1/planning-recommendations/${encodeURIComponent(recommendationId)}/snooze`;
      confirmation = "Snooze this recommendation using the selected preset?";
    } else {
      const reason = document.querySelector<HTMLSelectElement>("#planning-reject-reason")?.value.trim() ?? "";
      body = { note: requireValue("#planning-reject-note", "Add a note before rejecting this recommendation.") };
      if (reason) {
        body.reason_code = reason;
      }
      requestPath = `/v1/planning-recommendations/${encodeURIComponent(recommendationId)}/reject`;
      confirmation = "Reject this recommendation? This will close it from the active queue.";
    }
    if (!confirm(confirmation)) {
      return;
    }
    await postJson<PlanningRecommendationDetailResponse>(requestPath, body);
    setFlash(
      action === "apply"
        ? "Recommendation applied."
        : action === "snooze"
          ? "Recommendation snoozed."
          : "Recommendation rejected.",
      "good",
    );
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run ${recommendationShowCommand(recommendationId)} for the CLI path.`,
      "critical",
    );
    render();
  }
}

async function performPlanningGroupAction(action: "snooze" | "reject"): Promise<void> {
  const groupKey = state.selectedPlanningGroupKey;
  if (!groupKey) {
    setFlash("Choose a planning group before running a group action.", "warn");
    render();
    return;
  }
  try {
    let requestPath = "";
    let body: Record<string, string> = {};
    let confirmation = "";
    if (action === "snooze") {
      body = {
        preset: requireValue("#planning-group-snooze-preset", "Choose a group snooze preset."),
        note: requireValue("#planning-group-snooze-note", "Add a note before snoozing this group."),
      };
      requestPath = `/v1/planning-recommendation-groups/${encodeURIComponent(groupKey)}/snooze`;
      confirmation = "Snooze every pending recommendation in this group?";
    } else {
      body = {
        reason_code: requireValue("#planning-group-reject-reason", "Choose a group reject reason."),
        note: requireValue("#planning-group-reject-note", "Add a note before rejecting this group."),
      };
      requestPath = `/v1/planning-recommendation-groups/${encodeURIComponent(groupKey)}/reject`;
      confirmation = "Reject every pending recommendation in this group?";
    }
    if (!confirm(confirmation)) {
      return;
    }
    await postJson<PlanningRecommendationGroupDetailResponse>(requestPath, body);
    setFlash(action === "snooze" ? "Planning group snoozed." : "Planning group rejected.", "good");
    await refreshAll();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    setFlash(
      `${error instanceof Error ? error.message : String(error)} Run ${recommendationGroupShowCommand(groupKey)} for the CLI path.`,
      "critical",
    );
    render();
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const navButton = target.closest<HTMLButtonElement>(".nav__item");
  if (navButton?.dataset.section) {
    state.section = navButton.dataset.section as SectionId;
    location.hash = state.section;
    render();
    return;
  }

  const copyButton = target.closest<HTMLButtonElement>("[data-copy]");
  if (copyButton?.dataset.copy) {
    await navigator.clipboard.writeText(copyButton.dataset.copy);
    setFlash("Command copied to the clipboard.", "good");
    render();
    return;
  }

  const workflowAction = target.closest<HTMLButtonElement>("[data-workflow-action]");
  if (workflowAction?.dataset.workflowAction && workflowAction.dataset.workflow) {
    await openWorkflowAction(workflowAction.dataset.workflow as WorkflowBundleReport["workflow"], Number(workflowAction.dataset.workflowAction));
    return;
  }

  const assistantRunButton = target.closest<HTMLButtonElement>("[data-assistant-run]");
  if (assistantRunButton?.dataset.assistantRun) {
    await runAssistantActionFromConsole(assistantRunButton.dataset.assistantRun);
    return;
  }

  const assistantOpenButton = target.closest<HTMLButtonElement>("[data-assistant-open]");
  if (assistantOpenButton?.dataset.assistantOpen) {
    await openAssistantAction(assistantOpenButton.dataset.assistantOpen);
    return;
  }

  const sectionButton = target.closest<HTMLButtonElement>("[data-section-link]");
  if (sectionButton?.dataset.sectionLink) {
    state.section = sectionButton.dataset.sectionLink as SectionId;
    location.hash = state.section;
    render();
    return;
  }

  const snapshotButton = target.closest<HTMLButtonElement>("[data-snapshot]");
  if (snapshotButton?.dataset.snapshot) {
    await selectSnapshot(snapshotButton.dataset.snapshot);
    return;
  }

  const approvalButton = target.closest<HTMLButtonElement>("[data-approval]");
  if (approvalButton?.dataset.approval) {
    await selectApproval(approvalButton.dataset.approval);
    return;
  }

  const planningButton = target.closest<HTMLButtonElement>("[data-planning-recommendation]");
  if (planningButton?.dataset.planningRecommendation) {
    await selectPlanningRecommendation(planningButton.dataset.planningRecommendation);
    return;
  }

  const planningBundleButton = target.closest<HTMLButtonElement>("[data-planning-bundle]");
  if (planningBundleButton?.dataset.planningBundle) {
    await selectPlanningBundle(planningBundleButton.dataset.planningBundle);
    return;
  }

  const planningGroupButton = target.closest<HTMLButtonElement>("[data-planning-group]");
  if (planningGroupButton?.dataset.planningGroup) {
    await selectPlanningGroup(planningGroupButton.dataset.planningGroup);
    return;
  }

  const worklistButton = target.closest<HTMLButtonElement>("[data-worklist-item]");
  if (worklistButton?.dataset.worklistItem) {
    await selectWorklistItem(worklistButton.dataset.worklistItem);
    return;
  }

  const autopilotPrepareButton = target.closest<HTMLButtonElement>("[data-autopilot-prepare]");
  if (autopilotPrepareButton?.dataset.autopilotPrepare) {
    await prepareInboxAutopilotGroupFromConsole(autopilotPrepareButton.dataset.autopilotPrepare);
    return;
  }

  const autopilotOpenButton = target.closest<HTMLButtonElement>("[data-autopilot-open]");
  if (autopilotOpenButton?.dataset.autopilotOpen) {
    await openAutopilotGroup(autopilotOpenButton.dataset.autopilotOpen);
    return;
  }

  const outboundOpenButton = target.closest<HTMLButtonElement>("[data-outbound-open]");
  if (outboundOpenButton?.dataset.outboundOpen) {
    await openOutboundGroup(outboundOpenButton.dataset.outboundOpen);
    return;
  }

  const outboundRequestApprovalButton = target.closest<HTMLButtonElement>("[data-outbound-request-approval]");
  if (outboundRequestApprovalButton?.dataset.outboundRequestApproval) {
    await requestOutboundApprovalFromConsole(outboundRequestApprovalButton.dataset.outboundRequestApproval);
    return;
  }

  const outboundApproveButton = target.closest<HTMLButtonElement>("[data-outbound-approve]");
  if (outboundApproveButton?.dataset.outboundApprove) {
    await approveOutboundGroupFromConsole(outboundApproveButton.dataset.outboundApprove);
    return;
  }

  const outboundSendButton = target.closest<HTMLButtonElement>("[data-outbound-send]");
  if (outboundSendButton?.dataset.outboundSend) {
    await sendOutboundGroupFromConsole(outboundSendButton.dataset.outboundSend);
    return;
  }

  const prepareMeetingPacketButton = target.closest<HTMLButtonElement>("[data-prepare-meeting-packet]");
  if (prepareMeetingPacketButton?.dataset.prepareMeetingPacket) {
    await prepareMeetingPacketFromConsole(prepareMeetingPacketButton.dataset.prepareMeetingPacket);
    return;
  }

  const planningBundlePrepareButton = target.closest<HTMLButtonElement>("[data-planning-bundle-prepare]");
  if (planningBundlePrepareButton?.dataset.planningBundlePrepare) {
    await preparePlanningBundleFromConsole(planningBundlePrepareButton.dataset.planningBundlePrepare);
    return;
  }

  const planningBundleApplyButton = target.closest<HTMLButtonElement>("[data-planning-bundle-apply]");
  if (planningBundleApplyButton?.dataset.planningBundleApply) {
    await applyPlanningBundleFromConsole(planningBundleApplyButton.dataset.planningBundleApply);
    return;
  }

  const reviewOpenButton = target.closest<HTMLButtonElement>("[data-review-open]");
  if (reviewOpenButton?.dataset.reviewOpen) {
    await openReviewFromConsole(reviewOpenButton.dataset.reviewOpen);
    return;
  }

  const reviewResolveButton = target.closest<HTMLButtonElement>("[data-review-resolve]");
  if (reviewResolveButton?.dataset.reviewResolve) {
    await resolveReviewFromConsole(reviewResolveButton.dataset.reviewResolve);
    return;
  }

  const reviewPackageFeedbackButton = target.closest<HTMLButtonElement>("[data-review-package-feedback]");
  if (reviewPackageFeedbackButton?.dataset.reviewPackageFeedback && reviewPackageFeedbackButton.dataset.reviewFeedbackReason) {
    await submitReviewPackageFeedbackFromConsole(
      reviewPackageFeedbackButton.dataset.reviewPackageFeedback,
      reviewPackageFeedbackButton.dataset.reviewFeedbackReason as "useful" | "wrong_priority" | "bad_timing" | "not_useful",
      reviewPackageFeedbackButton.dataset.reviewPackageItem,
    );
    return;
  }

  const reviewTuningApproveButton = target.closest<HTMLButtonElement>("[data-review-tuning-approve]");
  if (reviewTuningApproveButton?.dataset.reviewTuningApprove) {
    await decideReviewTuningProposalFromConsole("approve", reviewTuningApproveButton.dataset.reviewTuningApprove);
    return;
  }

  const reviewTuningDismissButton = target.closest<HTMLButtonElement>("[data-review-tuning-dismiss]");
  if (reviewTuningDismissButton?.dataset.reviewTuningDismiss) {
    await decideReviewTuningProposalFromConsole("dismiss", reviewTuningDismissButton.dataset.reviewTuningDismiss);
    return;
  }

  const draftApprovalButton = target.closest<HTMLButtonElement>("[data-draft-approval]");
  if (draftApprovalButton?.dataset.draftApproval) {
    await requestApprovalFromConsole(draftApprovalButton.dataset.draftApproval);
    return;
  }

  const approvalRejectButton = target.closest<HTMLButtonElement>("[data-approval-reject]");
  if (approvalRejectButton?.dataset.approvalReject) {
    await performApprovalRecoveryAction("reject", approvalRejectButton.dataset.approvalReject);
    return;
  }

  const approvalReopenButton = target.closest<HTMLButtonElement>("[data-approval-reopen]");
  if (approvalReopenButton?.dataset.approvalReopen) {
    await performApprovalRecoveryAction("reopen", approvalReopenButton.dataset.approvalReopen);
    return;
  }

  const approvalCancelButton = target.closest<HTMLButtonElement>("[data-approval-cancel]");
  if (approvalCancelButton?.dataset.approvalCancel) {
    await performApprovalRecoveryAction("cancel", approvalCancelButton.dataset.approvalCancel);
    return;
  }

  const openPlanningButton = target.closest<HTMLButtonElement>("[data-open-planning]");
  if (openPlanningButton?.dataset.openPlanning) {
    await selectPlanningRecommendation(openPlanningButton.dataset.openPlanning);
    return;
  }

  const openPlanningGroupButton = target.closest<HTMLButtonElement>("[data-open-planning-group]");
  if (openPlanningGroupButton?.dataset.openPlanningGroup) {
    await selectPlanningGroup(openPlanningGroupButton.dataset.openPlanningGroup);
    return;
  }

  const openApprovalButton = target.closest<HTMLButtonElement>("[data-open-approval]");
  if (openApprovalButton?.dataset.openApproval) {
    await selectApproval(openApprovalButton.dataset.openApproval);
    return;
  }

  const openSnapshotButton = target.closest<HTMLButtonElement>("[data-open-snapshot]");
  if (openSnapshotButton?.dataset.openSnapshot) {
    await selectSnapshot(openSnapshotButton.dataset.openSnapshot);
    return;
  }

  const createSnapshotButton = target.closest<HTMLButtonElement>("[data-create-snapshot]");
  if (createSnapshotButton) {
    await createSnapshotFromConsole();
    return;
  }

  const planningActionButton = target.closest<HTMLButtonElement>("[data-planning-action]");
  if (planningActionButton?.dataset.planningAction === "apply") {
    await performPlanningAction("apply");
    return;
  }
  if (planningActionButton?.dataset.planningAction === "snooze") {
    await performPlanningAction("snooze");
    return;
  }
  if (planningActionButton?.dataset.planningAction === "reject") {
    await performPlanningAction("reject");
    return;
  }

  const planningGroupActionButton = target.closest<HTMLButtonElement>("[data-planning-group-action]");
  if (planningGroupActionButton?.dataset.planningGroupAction === "snooze") {
    await performPlanningGroupAction("snooze");
    return;
  }
  if (planningGroupActionButton?.dataset.planningGroupAction === "reject") {
    await performPlanningGroupAction("reject");
    return;
  }

  if (target.id === "audit-refresh") {
    const category = document.querySelector<HTMLSelectElement>("#audit-category");
    const limit = document.querySelector<HTMLInputElement>("#audit-limit");
    state.auditCategory = (category?.value ?? "") as AuditEventCategory | "";
    state.auditLimit = Math.max(1, Math.min(200, Number(limit?.value ?? 20) || 20));
    await refreshAuditOnly();
  }
});

window.addEventListener("hashchange", () => {
  const next = location.hash.replace(/^#/, "") as SectionId;
  if (next && next in SECTIONS) {
    state.section = next;
    render();
  }
});

requiredRefreshButton.addEventListener("click", () => {
  void refreshAll();
});

if (!(state.section in SECTIONS)) {
  state.section = "overview";
}

void refreshAll();
