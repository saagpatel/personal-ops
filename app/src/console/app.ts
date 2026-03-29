import type {
  ApprovalDetail,
  ApprovalRequest,
  AttentionItem,
  AuditEvent,
  AuditEventCategory,
  DoctorReport,
  DraftArtifact,
  GithubPullRequest,
  MailThreadDetail,
  PlanningRecommendationDetail,
  PlanningRecommendationGroup,
  PlanningRecommendationGroupDetail,
  PlanningRecommendationSummaryReport,
  ServiceStatusReport,
  SnapshotInspection,
  SnapshotManifest,
  SnapshotSummary,
  TaskDetail,
  WorkflowBundleReport,
  WorklistReport,
} from "../types.js";

type SectionId = "overview" | "worklist" | "approvals" | "drafts" | "planning" | "audit" | "backups";
type BannerTone = "good" | "warn" | "critical";

interface ConsolePayload {
  status: ServiceStatusReport;
  worklist: WorklistReport;
  nowNextWorkflow: WorkflowBundleReport;
  prepDayWorkflow: WorkflowBundleReport;
  doctor: DoctorReport;
  approvals: ApprovalRequest[];
  drafts: DraftArtifact[];
  planningSummary: PlanningRecommendationSummaryReport;
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

interface WorklistResponse {
  worklist: WorklistReport;
}

interface WorkflowResponse {
  workflow: WorkflowBundleReport;
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

interface PlanningSummaryResponse {
  planning_recommendation_summary: PlanningRecommendationSummaryReport;
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
  selectedPlanningGroupKey: string | null;
  selectedWorklistItemId: string | null;
  approvalDetail: ApprovalDetail | null;
  snapshotInspection: SnapshotInspection | null;
  planningRecommendationDetail: PlanningRecommendationDetail | null;
  planningGroupDetail: PlanningRecommendationGroupDetail | null;
  worklistDetail: WorklistDetail | null;
}

class SessionLockedError extends Error {}

const SECTIONS: Record<SectionId, string> = {
  overview: "Overview",
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
  selectedPlanningGroupKey: null,
  selectedWorklistItemId: null,
  approvalDetail: null,
  snapshotInspection: null,
  planningRecommendationDetail: null,
  planningGroupDetail: null,
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
    worklistResponse,
    nowNextWorkflowResponse,
    workflowResponse,
    doctorResponse,
    approvalsResponse,
    draftsResponse,
    planningSummaryResponse,
    planningGroupsResponse,
    planningNextResponse,
    auditResponse,
    snapshotListResponse,
  ] = await Promise.all([
    fetchJson<StatusResponse>("/v1/status"),
    fetchJson<WorklistResponse>("/v1/worklist"),
    fetchJson<WorkflowResponse>("/v1/workflows/now-next"),
    fetchJson<WorkflowResponse>("/v1/workflows/prep-day"),
    fetchJson<DoctorResponse>("/v1/doctor"),
    fetchJson<ApprovalQueueResponse>("/v1/approval-queue?limit=20"),
    fetchJson<DraftResponse>("/v1/mail/drafts"),
    fetchJson<PlanningSummaryResponse>("/v1/planning-recommendations/summary"),
    fetchJson<PlanningGroupsResponse>("/v1/planning-recommendation-groups"),
    fetchJson<PlanningRecommendationDetailResponse>("/v1/planning-recommendations/next"),
    fetchAudit(state.auditLimit, state.auditCategory),
    fetchJson<SnapshotListResponse>("/v1/snapshots"),
  ]);

  return {
    status: statusResponse.status,
    worklist: worklistResponse.worklist,
    nowNextWorkflow: nowNextWorkflowResponse.workflow,
    prepDayWorkflow: workflowResponse.workflow,
    doctor: doctorResponse.doctor,
    approvals: approvalsResponse.approval_requests,
    drafts: draftsResponse.drafts,
    planningSummary: planningSummaryResponse.planning_recommendation_summary,
    planningGroups: planningGroupsResponse.planning_recommendation_groups,
    planningNext: planningNextResponse.planning_recommendation,
    audit: auditResponse.events,
    snapshots: snapshotListResponse.snapshots,
  };
}

function topWorklistCommand(worklist: WorklistReport): string {
  return worklist.items[0]?.suggested_command ?? "personal-ops worklist";
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

function commandAction(command: string, label = "Copy command"): string {
  return `
    <code class="code">${escapeHtml(command)}</code>
    <button class="copy-button" data-copy="${escapeHtml(command)}" type="button">${escapeHtml(label)}</button>
  `;
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
  return payload.prepDayWorkflow;
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

  if (!state.selectedPlanningGroupKey) {
    state.selectedPlanningGroupKey =
      payload.planningGroups.find((group) => group.recommendation_ids.includes(state.selectedPlanningRecommendationId ?? ""))?.group_key ??
      payload.planningGroups[0]?.group_key ??
      null;
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
    loadSelectedSnapshotInspection(),
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
  const nowNext = payload.nowNextWorkflow;
  const primaryNowNext = nowNext.actions[0] ?? null;
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
      ${metricCard("GitHub", `${formatCount(status.github.review_requested_count)} reviews`, `${formatCount(status.github.authored_pr_attention_count)} authored PRs need attention`)}
    </section>
    <section class="columns columns--wide-right">
      <div class="detail-stack">
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
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Thread</dt><dd>${escapeHtml(truncateId(thread.thread.thread_id))}</dd></div>
        <div class="detail-row"><dt>Kind</dt><dd>${escapeHtml(thread.derived_kind)}</dd></div>
        <div class="detail-row"><dt>Direction</dt><dd>${escapeHtml(thread.last_direction)}</dd></div>
        <div class="detail-row"><dt>Messages</dt><dd>${escapeHtml(String(thread.messages.length))}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(thread.messages[0]?.subject ?? "No message preview available.")}</p>
      ${intelligenceBlock}
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack([thread.suggested_next_command])}
      </div>
    `;
  }

  if (detail.kind === "planning_recommendation") {
    const recommendation = detail.detail.recommendation;
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Status</dt><dd>${escapeHtml(recommendation.status)}</dd></div>
        <div class="detail-row"><dt>Priority</dt><dd>${escapeHtml(recommendation.priority)}</dd></div>
        <div class="detail-row"><dt>Window</dt><dd>${escapeHtml(`${formatTime(recommendation.proposed_start_at)} to ${formatTime(recommendation.proposed_end_at)}`)}</dd></div>
        <div class="detail-row"><dt>Group</dt><dd>${escapeHtml(maybe(recommendation.group_summary, "not grouped"))}</dd></div>
      </div>
      <p class="subtle subtle--body">${escapeHtml(recommendation.reason_summary)}</p>
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
    return `
      <div class="detail-list">
        <div class="detail-row"><dt>Approval</dt><dd>${escapeHtml(approval.approval_id)}</dd></div>
        <div class="detail-row"><dt>State</dt><dd>${escapeHtml(approval.state)}</dd></div>
        <div class="detail-row"><dt>Requested</dt><dd>${escapeHtml(formatTime(approval.requested_at))}</dd></div>
        <div class="detail-row"><dt>Expires</dt><dd>${escapeHtml(formatTime(approval.expires_at))}</dd></div>
      </div>
      <p class="subtle subtle--body">Approvals stay CLI-only in Phase 2.</p>
      ${intelligenceBlock}
      <div class="list-item__actions">
        <button class="button" data-open-approval="${escapeHtml(approval.approval_id)}" type="button">Open in Approvals</button>
      </div>
      <div class="list-item__actions list-item__actions--stack">
        ${commandStack([
          `personal-ops approval show ${approval.approval_id}`,
          `personal-ops approval approve ${approval.approval_id} --note "<reason>"`,
          `personal-ops approval reject ${approval.approval_id} --note "<reason>"`,
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

function renderWorklist(payload: ConsolePayload): string {
  return `
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
                <div class="list-item__actions">
                  <button class="button" data-approval="${escapeHtml(approval.approval_id)}" type="button">Inspect</button>
                  <button class="copy-button" data-copy="${escapeHtml(`personal-ops approval show ${approval.approval_id}`)}" type="button">Copy show command</button>
                </div>
              </article>
            `,
          )
          .join("");

  const detail = state.approvalDetail;
  const detailHtml = !detail
    ? `<div class="empty">Choose an approval to inspect it. Approvals, approval decisions, and send stay in the CLI.</div>`
    : `
        <div class="detail-list">
          <div class="detail-row"><dt>State</dt><dd>${escapeHtml(detail.approval_request.state)}</dd></div>
          <div class="detail-row"><dt>Subject</dt><dd>${escapeHtml(detail.draft.subject)}</dd></div>
          <div class="detail-row"><dt>To</dt><dd>${escapeHtml(detail.draft.to.join(", ") || "none")}</dd></div>
          <div class="detail-row"><dt>Requested</dt><dd>${escapeHtml(formatTime(detail.approval_request.requested_at))}</dd></div>
          <div class="detail-row"><dt>Expires</dt><dd>${escapeHtml(formatTime(detail.approval_request.expires_at))}</dd></div>
        </div>
        <p class="subtle subtle--body">This section is intentionally read-only. Use the exact CLI command you need below.</p>
        <div class="list-item__actions list-item__actions--stack">
          ${commandStack([
            `personal-ops approval show ${detail.approval_request.approval_id}`,
            `personal-ops approval approve ${detail.approval_request.approval_id} --note "<reason>"`,
            `personal-ops approval reject ${detail.approval_request.approval_id} --note "<reason>"`,
            `personal-ops approval send ${detail.approval_request.approval_id} --note "<reason>"`,
          ])}
        </div>
      `;

  return `
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
  if (payload.drafts.length === 0) {
    return `<section class="empty">No local draft artifacts are currently stored.</section>`;
  }
  return `
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
  const topBacklogSummary =
    payload.planningSummary.most_backlogged_group?.summary ?? "No active planning groups";
  const topReviewNeededSummary =
    payload.planningSummary.top_review_needed_candidate?.summary ?? "No hygiene review needed";
  const topClosureSummary =
    payload.planningSummary.most_completed_group?.summary ?? "No recent closure summary";
  return `
    <section class="stats-grid">
      ${metricCard("Open recommendations", `${formatCount(payload.planningSummary.open_count)}`, topBacklogSummary)}
      ${metricCard("Review needed", `${formatCount(payload.planningSummary.review_needed_count)}`, topReviewNeededSummary)}
      ${metricCard("Closed in 30d", `${formatCount(payload.planningSummary.closed_last_30d)}`, topClosureSummary)}
    </section>
    <section class="columns columns--wide-right">
      <div class="list-card">
        <h3>Next action and groups</h3>
        <div class="list">
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
  state.section = "approvals";
  try {
    await loadSelectedApprovalDetail();
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

  await navigator.clipboard.writeText(action.command);
  setFlash("No in-console detail exists for that action yet. The CLI command has been copied instead.", "warn");
  render();
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
