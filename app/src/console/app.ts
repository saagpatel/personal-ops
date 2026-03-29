import type {
  ApprovalDetail,
  ApprovalRequest,
  AuditEvent,
  AuditEventCategory,
  DoctorReport,
  DraftArtifact,
  PlanningRecommendation,
  PlanningRecommendationGroup,
  ServiceStatusReport,
  SnapshotInspection,
  SnapshotSummary,
  WorklistReport,
} from "../types.js";

type SectionId = "overview" | "worklist" | "approvals" | "drafts" | "planning" | "audit" | "backups";

interface ConsolePayload {
  status: ServiceStatusReport;
  worklist: WorklistReport;
  doctor: DoctorReport;
  approvals: ApprovalRequest[];
  approvalDetail: ApprovalDetail | null;
  drafts: DraftArtifact[];
  planningSummary: ServiceStatusReport["planning_recommendations"];
  planningGroups: PlanningRecommendationGroup[];
  planningNext: PlanningRecommendationDetailEnvelope | null;
  audit: AuditEvent[];
  snapshots: SnapshotSummary[];
  snapshotInspection: SnapshotInspection | null;
}

interface PlanningRecommendationDetailEnvelope {
  planning_recommendation: PlanningRecommendation | null;
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
  planning_recommendation_summary: ServiceStatusReport["planning_recommendations"];
}

interface PlanningGroupsResponse {
  planning_recommendation_groups: PlanningRecommendationGroup[];
}

interface PlanningNextResponse {
  planning_recommendation: PlanningRecommendation | null;
}

interface SnapshotListResponse {
  snapshots: SnapshotSummary[];
}

interface SnapshotInspectResponse {
  snapshot: SnapshotInspection;
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

const state = {
  section: (location.hash.replace(/^#/, "") as SectionId) || "overview",
  payload: null as ConsolePayload | null,
  auditLimit: 20,
  auditCategory: "" as AuditEventCategory | "",
  lockedHint: new URLSearchParams(location.search).get("locked") === "1",
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

async function loadPayload(): Promise<ConsolePayload> {
  const [
    statusResponse,
    worklistResponse,
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
    fetchJson<DoctorResponse>("/v1/doctor"),
    fetchJson<ApprovalQueueResponse>("/v1/approval-queue?limit=20"),
    fetchJson<DraftResponse>("/v1/mail/drafts"),
    fetchJson<PlanningSummaryResponse>("/v1/planning-recommendations/summary"),
    fetchJson<PlanningGroupsResponse>("/v1/planning-recommendation-groups"),
    fetchJson<PlanningNextResponse>("/v1/planning-recommendations/next"),
    fetchAudit(state.auditLimit, state.auditCategory),
    fetchJson<SnapshotListResponse>("/v1/snapshots"),
  ]);

  const approvals = approvalsResponse.approval_requests;
  const snapshots = snapshotListResponse.snapshots;
  const [approvalDetail, snapshotInspection] = await Promise.all([
    approvals[0]
      ? fetchJson<ApprovalDetailResponse>(`/v1/approval-queue/${encodeURIComponent(approvals[0].approval_id)}`).then(
          (response) => response.approval,
        )
      : Promise.resolve(null),
    snapshots[0]
      ? fetchJson<SnapshotInspectResponse>(`/v1/snapshots/${encodeURIComponent(snapshots[0].snapshot_id)}`).then(
          (response) => response.snapshot,
        )
      : Promise.resolve(null),
  ]);

  return {
    status: statusResponse.status,
    worklist: worklistResponse.worklist,
    doctor: doctorResponse.doctor,
    approvals,
    approvalDetail,
    drafts: draftsResponse.drafts,
    planningSummary: planningSummaryResponse.planning_recommendation_summary,
    planningGroups: planningGroupsResponse.planning_recommendation_groups,
    planningNext: planningNextResponse,
    audit: auditResponse.events,
    snapshots,
    snapshotInspection,
  };
}

function topWorklistCommand(worklist: WorklistReport): string {
  return worklist.items[0]?.suggested_command ?? "personal-ops worklist";
}

function renderBanner(message: string | null, tone: "warn" | "critical" = "warn"): void {
  if (!message) {
    requiredBanner.innerHTML = "";
    return;
  }
  requiredBanner.innerHTML = `<div class="banner__card banner__card--${tone}"><p>${escapeHtml(message)}</p></div>`;
}

function renderLocked(): void {
  renderBanner("Console session is missing or expired. Run `personal-ops console` to reopen the operator console.", "critical");
  requiredContent.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Console locked</p>
      <h3>Local browser access is read-only and session-based.</h3>
      <p>Use <span class="code">personal-ops console</span> from the terminal to mint a fresh local session and reopen this page.</p>
    </section>
  `;
}

function metricCard(label: string, value: string, detail: string): string {
  return `
    <div class="metric">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <p class="metric__value">${escapeHtml(value)}</p>
      <p class="subtle">${escapeHtml(detail)}</p>
    </div>
  `;
}

function renderOverview(payload: ConsolePayload): string {
  const status = payload.status;
  const machine = status.machine;
  const latestSnapshot = status.snapshot_latest;
  return `
    <section class="hero">
      <p class="eyebrow">Top-level readiness</p>
      <div class="list-item__top">
        <h3>${escapeHtml(status.state === "ready" ? "Local control plane looks healthy." : "Local control plane needs attention.")}</h3>
        <span class="${status.state === "ready" ? "pill pill--good" : "pill pill--warn"}">${escapeHtml(status.state)}</span>
      </div>
      <p>${escapeHtml(status.worklist_summary.top_item_summary ?? "No urgent operator work is currently at the top of the queue.")}</p>
      <div class="hero__meta">
        <div>
          <p class="eyebrow">Machine</p>
          <p>${escapeHtml(machine.machine_label ?? "not initialized")} (${escapeHtml(machine.machine_id?.slice(0, 8) ?? "n/a")})</p>
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
    </section>
    <section class="panel">
      <h3>Next CLI action</h3>
      <p>Mutating work stays in the CLI in Phase 8.</p>
      <div class="list-item__actions">
        <code class="code">${escapeHtml(topWorklistCommand(payload.worklist))}</code>
        <button class="copy-button" data-copy="${escapeHtml(topWorklistCommand(payload.worklist))}" type="button">Copy command</button>
      </div>
    </section>
  `;
}

function worklistItem(item: WorklistReport["items"][number]): string {
  return `
    <article class="list-item">
      <div class="list-item__top">
        <h4>${escapeHtml(item.title)}</h4>
        <span class="pill ${item.severity === "critical" ? "pill--critical" : item.severity === "warn" ? "pill--warn" : "pill--good"}">${escapeHtml(item.severity)}</span>
      </div>
      <p>${escapeHtml(item.summary)}</p>
      <div class="list-item__actions">
        <code class="code">${escapeHtml(item.suggested_command)}</code>
        <button class="copy-button" data-copy="${escapeHtml(item.suggested_command)}" type="button">Copy command</button>
      </div>
    </article>
  `;
}

function renderWorklist(payload: ConsolePayload): string {
  if (payload.worklist.items.length === 0) {
    return `<section class="empty">No current worklist items. Run <span class="code">personal-ops status</span> for the fuller readiness summary.</section>`;
  }
  return `<section class="list">${payload.worklist.items.map(worklistItem).join("")}</section>`;
}

function renderApprovals(payload: ConsolePayload): string {
  const listHtml =
    payload.approvals.length === 0
      ? `<div class="empty">No approval requests are currently open.</div>`
      : payload.approvals
          .map(
            (approval) => `
          <article class="list-item">
            <div class="list-item__top">
              <h4>${escapeHtml(approval.approval_id)}</h4>
              <span class="pill ${approval.state === "pending" ? "pill--warn" : "pill--good"}">${escapeHtml(approval.state)}</span>
            </div>
            <p>Artifact ${escapeHtml(approval.artifact_id)} · requested ${escapeHtml(formatTime(approval.requested_at))}</p>
            <div class="list-item__actions">
              <code class="code">${escapeHtml(`personal-ops approval show ${approval.approval_id}`)}</code>
              <button class="copy-button" data-copy="${escapeHtml(`personal-ops approval show ${approval.approval_id}`)}" type="button">Copy command</button>
            </div>
          </article>`,
          )
          .join("");

  const detail = payload.approvalDetail;
  const detailHtml = !detail
    ? `<div class="empty">Select an approval by using its CLI command for full action flow.</div>`
    : `
      <div class="detail-list">
        <div class="detail-row"><dt>State</dt><dd>${escapeHtml(detail.approval_request.state)}</dd></div>
        <div class="detail-row"><dt>Subject</dt><dd>${escapeHtml(detail.draft.subject)}</dd></div>
        <div class="detail-row"><dt>To</dt><dd>${escapeHtml(detail.draft.to.join(", ") || "none")}</dd></div>
        <div class="detail-row"><dt>Requested</dt><dd>${escapeHtml(formatTime(detail.approval_request.requested_at))}</dd></div>
        <div class="detail-row"><dt>Expires</dt><dd>${escapeHtml(formatTime(detail.approval_request.expires_at))}</dd></div>
      </div>
      <div class="list-item__actions" style="margin-top: 14px;">
        <code class="code">${escapeHtml(`personal-ops approval show ${detail.approval_request.approval_id}`)}</code>
        <button class="copy-button" data-copy="${escapeHtml(`personal-ops approval show ${detail.approval_request.approval_id}`)}" type="button">Copy command</button>
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
            <code class="code">${escapeHtml(`personal-ops mail list`)}</code>
            <button class="copy-button" data-copy="personal-ops mail list" type="button">Copy command</button>
          </div>
        </article>`,
        )
        .join("")}
    </section>
  `;
}

function renderPlanning(payload: ConsolePayload): string {
  const next = payload.planningNext?.planning_recommendation ?? null;
  return `
    <section class="stats-grid">
      ${metricCard("Open recommendations", `${formatCount(payload.planningSummary.active_count)}`, payload.planningSummary.top_group_summary ?? "No active planning groups")}
      ${metricCard("Review needed", `${formatCount(payload.planningSummary.review_needed_count)}`, payload.planningSummary.top_review_needed_summary ?? "No hygiene review needed")}
      ${metricCard("Closed in 30d", `${formatCount(payload.planningSummary.closed_last_30d)}`, payload.planningSummary.top_closure_summary ?? "No recent closure summary")}
    </section>
    <section class="columns">
      <div class="list-card">
        <h3>Planning groups</h3>
        <div class="list">
          ${payload.planningGroups.length === 0 ? `<div class="empty">No planning groups are currently open.</div>` : payload.planningGroups
            .map(
              (group) => `
              <article class="list-item">
                <div class="list-item__top">
                  <h4>${escapeHtml(group.group_summary)}</h4>
                  <span class="pill">${escapeHtml(String(group.pending_count))} open</span>
                </div>
                <p>${escapeHtml(group.top_rank_reason)}</p>
                <div class="list-item__actions">
                  <code class="code">${escapeHtml(`personal-ops recommendation group ${group.group_key}`)}</code>
                  <button class="copy-button" data-copy="${escapeHtml(`personal-ops recommendation group ${group.group_key}`)}" type="button">Copy command</button>
                </div>
              </article>`,
            )
            .join("")}
        </div>
      </div>
      <div class="detail-card">
        <h3>Next recommended action</h3>
        ${
          !next
            ? `<div class="empty">No next planning recommendation is currently available.</div>`
            : `
              <p>${escapeHtml(next.reason_summary)}</p>
              <div class="detail-list" style="margin-top: 14px;">
                <div class="detail-row"><dt>Title</dt><dd>${escapeHtml(next.proposed_title ?? "untitled")}</dd></div>
                <div class="detail-row"><dt>Window</dt><dd>${escapeHtml(`${formatTime(next.proposed_start_at)} to ${formatTime(next.proposed_end_at)}`)}</dd></div>
                <div class="detail-row"><dt>Priority</dt><dd>${escapeHtml(next.priority)}</dd></div>
              </div>
              <div class="list-item__actions" style="margin-top: 14px;">
                <code class="code">${escapeHtml(`personal-ops recommendation next`)}</code>
                <button class="copy-button" data-copy="personal-ops recommendation next" type="button">Copy command</button>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderAudit(payload: ConsolePayload): string {
  return `
    <section class="panel">
      <div class="filter-row">
        <label>
          <span class="eyebrow">Category</span>
          <select id="audit-category">
            <option value="">All supported categories</option>
            <option value="sync" ${state.auditCategory === "sync" ? "selected" : ""}>sync</option>
            <option value="task" ${state.auditCategory === "task" ? "selected" : ""}>task</option>
            <option value="task_suggestion" ${state.auditCategory === "task_suggestion" ? "selected" : ""}>task_suggestion</option>
            <option value="planning" ${state.auditCategory === "planning" ? "selected" : ""}>planning</option>
          </select>
        </label>
        <label>
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
              <p class="subtle">${escapeHtml(formatTime(event.timestamp))}</p>
            </article>`,
              )
              .join("")
      }
    </section>
  `;
}

function renderBackups(payload: ConsolePayload): string {
  const detail = payload.snapshotInspection;
  return `
    <section class="columns">
      <div class="list-card">
        <h3>Snapshots</h3>
        <div class="list">
          ${
            payload.snapshots.length === 0
              ? `<div class="empty">No recovery snapshots exist yet.</div>`
              : payload.snapshots
                  .map(
                    (snapshot) => `
                  <article class="list-item">
                    <div class="list-item__top">
                      <h4>${escapeHtml(snapshot.snapshot_id)}</h4>
                      <span class="pill">${escapeHtml(snapshot.daemon_state)}</span>
                    </div>
                    <p>${escapeHtml(formatTime(snapshot.created_at))}</p>
                    <div class="list-item__actions">
                      <button class="button" data-snapshot="${escapeHtml(snapshot.snapshot_id)}" type="button">Inspect</button>
                      <button class="copy-button" data-copy="${escapeHtml(`personal-ops backup inspect ${snapshot.snapshot_id}`)}" type="button">Copy inspect command</button>
                    </div>
                  </article>`,
                  )
                  .join("")
          }
        </div>
      </div>
      <div class="detail-card">
        <h3>Selected snapshot</h3>
        ${
          !detail
            ? `<div class="empty">Choose a snapshot to inspect its provenance and recovery guidance.</div>`
            : `
              <div class="detail-list">
                <div class="detail-row"><dt>Snapshot id</dt><dd>${escapeHtml(detail.manifest.snapshot_id)}</dd></div>
                <div class="detail-row"><dt>Created</dt><dd>${escapeHtml(formatTime(detail.manifest.created_at))}</dd></div>
                <div class="detail-row"><dt>Schema</dt><dd>${escapeHtml(String(detail.manifest.schema_version ?? "legacy"))}</dd></div>
                <div class="detail-row"><dt>Source machine</dt><dd>${escapeHtml(detail.manifest.source_machine ? `${detail.manifest.source_machine.machine_label} (${detail.manifest.source_machine.machine_id.slice(0, 8)})` : "legacy snapshot with unknown provenance")}</dd></div>
              </div>
              <p style="margin-top: 14px;">Restore stays in the CLI. Cross-machine restore requires <span class="code">--allow-cross-machine</span> and does not merge state.</p>
              <div class="list-item__actions" style="margin-top: 14px;">
                <code class="code">${escapeHtml(`personal-ops backup inspect ${detail.manifest.snapshot_id}`)}</code>
                <button class="copy-button" data-copy="${escapeHtml(`personal-ops backup inspect ${detail.manifest.snapshot_id}`)}" type="button">Copy command</button>
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
  const warning =
    payload.status.machine.state_origin === "restored_cross_machine"
      ? "This machine is operating on state restored from a different machine. Re-run local auth checks before trusting live provider access."
      : payload.status.machine.state_origin === "unknown_legacy_restore"
        ? "This state came from a legacy snapshot without machine provenance. Treat restore history as unknown until revalidated locally."
        : null;
  renderBanner(warning ?? (state.lockedHint ? "This page can show a locked state after an expired launch link. Re-run `personal-ops console` if needed." : null));
  requiredContent.innerHTML = renderCurrentSection(payload);
}

async function fetchAudit(limit: number, category: AuditEventCategory | ""): Promise<AuditResponse> {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (category) {
    query.set("category", category);
  }
  return fetchJson<AuditResponse>(`/v1/audit/events?${query.toString()}`);
}

async function refreshAll(): Promise<void> {
  state.payload = null;
  render();
  try {
    state.payload = await loadPayload();
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    renderBanner(error instanceof Error ? error.message : String(error), "critical");
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
    renderBanner(error instanceof Error ? error.message : String(error), "critical");
  }
}

async function loadSnapshotInspection(snapshotId: string): Promise<void> {
  if (!state.payload) {
    return;
  }
  try {
    const response = await fetchJson<SnapshotInspectResponse>(`/v1/snapshots/${encodeURIComponent(snapshotId)}`);
    state.payload.snapshotInspection = response.snapshot;
    state.section = "backups";
    render();
  } catch (error) {
    if (error instanceof SessionLockedError) {
      renderLocked();
      return;
    }
    renderBanner(error instanceof Error ? error.message : String(error), "critical");
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
    renderBanner("Command copied to the clipboard.");
    return;
  }
  const snapshotButton = target.closest<HTMLButtonElement>("[data-snapshot]");
  if (snapshotButton?.dataset.snapshot) {
    await loadSnapshotInspection(snapshotButton.dataset.snapshot);
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
