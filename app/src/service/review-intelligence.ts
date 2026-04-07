import { createHash } from "node:crypto";
import type {
  ClientIdentity,
  ReviewFeedbackReason,
  ReviewPackage,
  ReviewPackageItem,
  ReviewPackageReport,
  ReviewPackageState,
  ReviewPackageSurface,
  ReviewReadModelRefreshState,
  ReviewTuningProposal,
  ReviewTuningProposalKind,
  ReviewTuningReport,
  ServiceState,
  WorkflowScoreBand,
} from "../types.js";

type InternalReviewItem = ReviewPackageItem & {
  source_key: string;
  sort_score: number;
};

type InternalReviewPackage = ReviewPackage & {
  sort_score: number;
  source_keys: string[];
};

const REVIEW_WINDOW_DAYS = 14;
const UNUSED_WINDOW_DAYS = 7;
const SURFACES: ReviewPackageSurface[] = ["inbox", "meetings", "planning", "outbound"];

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(baseIso: string, minutes: number): string {
  return new Date(Date.parse(baseIso) + Math.max(1, minutes) * 60_000).toISOString();
}

function addDays(baseIso: string, days: number): string {
  return new Date(Date.parse(baseIso) + Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
}

function hashInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input ?? null)).digest("hex");
}

function packageItemIdFor(itemType: string, itemId: string): string {
  return `${itemType}:${itemId}`;
}

function scoreBandValue(scoreBand: WorkflowScoreBand): number {
  if (scoreBand === "highest") {
    return 900;
  }
  if (scoreBand === "high") {
    return 700;
  }
  return 500;
}

function packageIdFor(surface: ReviewPackageSurface, memberIds: string[], sourceFingerprint: string): string {
  return `review-package:${surface}:${hashInput({ memberIds, sourceFingerprint }).slice(0, 16)}`;
}

function proposalFamilyKeyFor(kind: ReviewTuningProposalKind, surface: ReviewPackageSurface, scopeKey: string): string {
  return `${kind}:${surface}:${scopeKey}`;
}

function proposalIdFor(proposalFamilyKey: string, evidenceFingerprint: string): string {
  return `review-tuning:${hashInput({ proposalFamilyKey, evidenceFingerprint }).slice(0, 20)}`;
}

function negativeReason(reason: ReviewFeedbackReason): boolean {
  return reason !== "useful";
}

function isPackageStale(pkg: ReviewPackage): boolean {
  return Date.parse(pkg.stale_at) <= Date.now();
}

function packageStateFor(pkg: ReviewPackage, reviewed: boolean): ReviewPackageState {
  if (reviewed) {
    return "completed";
  }
  return isPackageStale(pkg) ? "stale" : "review_ready";
}

function summarizePackageCount(packages: ReviewPackage[]): string {
  if (packages.length === 0) {
    return "No review packages are ready right now.";
  }
  const labels = packages.map((pkg) => pkg.surface.replaceAll("_", " "));
  return `${packages.length} review package${packages.length === 1 ? "" : "s"} are ready across ${labels.join(", ")}.`;
}

function summarizeTuningCount(proposals: ReviewTuningProposal[]): string {
  if (proposals.length === 0) {
    return "No review tuning proposals are open right now.";
  }
  return `${proposals.length} review tuning proposal${proposals.length === 1 ? "" : "s"} are waiting for operator review.`;
}

function currentSurfaceFingerprint(surface: ReviewPackageSurface, items: InternalReviewItem[]): string {
  return hashInput({
    surface,
    items: items.map((item) => ({
      package_item_id: item.package_item_id,
      source_key: item.source_key,
      underlying_state: item.underlying_state,
    })),
  });
}

function activeTuningState(service: any): Array<{
  proposal_kind: ReviewTuningProposalKind;
  surface: ReviewPackageSurface;
  scope_key: string;
  value_json: string;
}> {
  const now = Date.now();
  const states = service.db.listReviewTuningState({ status: "active" });
  return states.filter((state: any) => Date.parse(state.expires_at) > now);
}

function suppressionKeys(service: any): Set<string> {
  const keys = new Set<string>();
  for (const state of activeTuningState(service)) {
    if (state.proposal_kind === "source_suppression") {
      keys.add(`${state.surface}:${state.scope_key}`);
    }
  }
  return keys;
}

function surfacePriorityOffsets(service: any): Map<ReviewPackageSurface, number> {
  const offsets = new Map<ReviewPackageSurface, number>();
  for (const state of activeTuningState(service)) {
    if (state.proposal_kind !== "surface_priority_offset") {
      continue;
    }
    try {
      const parsed = JSON.parse(state.value_json ?? "{}");
      offsets.set(state.surface, Number(parsed.offset ?? -200));
    } catch {
      offsets.set(state.surface, -200);
    }
  }
  return offsets;
}

function notificationCooldownOverrides(service: any): Record<ReviewPackageSurface, number> {
  const overrides: Record<ReviewPackageSurface, number> = {
    inbox: 1,
    meetings: 1,
    planning: 1,
    outbound: 1,
  };
  for (const state of activeTuningState(service)) {
    if (state.proposal_kind !== "notification_cooldown_override") {
      continue;
    }
    try {
      const parsed = JSON.parse(state.value_json ?? "{}");
      overrides[state.surface] = Math.max(1, Number(parsed.multiplier ?? 2));
    } catch {
      overrides[state.surface] = 2;
    }
  }
  return overrides;
}

async function buildInboxItems(service: any): Promise<InternalReviewItem[]> {
  const report = await service.getInboxAutopilotReport({ httpReachable: true });
  return report.groups
    .filter((group: any) => group.state === "awaiting_review")
    .slice(0, 3)
    .map((group: any, index: number) => ({
      package_item_id: packageItemIdFor("inbox_autopilot_group", group.group_id),
      item_type: "inbox_autopilot_group",
      item_id: group.group_id,
      title: group.summary,
      summary: group.why_now,
      command: "personal-ops inbox autopilot",
      underlying_state: group.state,
      source_key: `inbox:${group.group_id}`,
      sort_score: scoreBandValue(group.score_band) - index,
    }));
}

async function buildMeetingItems(service: any): Promise<InternalReviewItem[]> {
  const packets = service.db
    .listMeetingPrepPackets()
    .map((packet: any) => {
      const event = service.getCalendarEventDetail(packet.event_id);
      return { packet, event };
    })
    .filter((entry: any) => entry.event && Date.parse(entry.event.end_at) > Date.now())
    .sort((left: any, right: any) => Date.parse(left.event.start_at) - Date.parse(right.event.start_at))
    .slice(0, 3);
  return packets.map((entry: any, index: number) => ({
    package_item_id: packageItemIdFor("meeting_prep_packet", entry.packet.event_id),
    item_type: "meeting_prep_packet",
    item_id: entry.packet.event_id,
    title: entry.event.summary ?? "Meeting prep packet",
    summary: entry.packet.summary,
    command: `personal-ops workflow prep-meetings --event ${entry.packet.event_id}`,
    underlying_state: "awaiting_review",
    source_key: `meeting:${entry.packet.event_id}`,
    sort_score: 620 - index,
  }));
}

async function buildPlanningItems(service: any): Promise<InternalReviewItem[]> {
  const report = await service.getPlanningAutopilotReport({ httpReachable: true });
  return report.bundles
    .filter((bundle: any) => bundle.apply_ready || bundle.state === "awaiting_review")
    .slice(0, 3)
    .map((bundle: any, index: number) => ({
      package_item_id: packageItemIdFor("planning_autopilot_bundle", bundle.bundle_id),
      item_type: "planning_autopilot_bundle",
      item_id: bundle.bundle_id,
      title: bundle.summary,
      summary: bundle.why_now,
      command: `personal-ops planning autopilot --bundle ${bundle.bundle_id}`,
      underlying_state: bundle.state,
      source_key: `planning:${bundle.bundle_id}`,
      sort_score: scoreBandValue(bundle.score_band) + (bundle.apply_ready ? 80 : 0) - index,
    }));
}

async function buildOutboundItems(service: any): Promise<InternalReviewItem[]> {
  const report = await service.getOutboundAutopilotReport({ httpReachable: true });
  return report.groups
    .filter((group: any) => group.state === "approval_ready" || group.state === "send_ready")
    .slice(0, 3)
    .map((group: any, index: number) => ({
      package_item_id: packageItemIdFor("outbound_autopilot_group", group.group_id),
      item_type: "outbound_autopilot_group",
      item_id: group.group_id,
      title: group.summary,
      summary: group.why_now,
      command: `personal-ops outbound autopilot --group ${group.group_id}`,
      underlying_state: group.state,
      source_key: `outbound:${group.group_id}`,
      sort_score: scoreBandValue(group.score_band) + (group.state === "send_ready" ? 120 : 60) - index,
    }));
}

async function buildSurfaceItems(service: any, surface: ReviewPackageSurface): Promise<InternalReviewItem[]> {
  if (surface === "inbox") {
    return buildInboxItems(service);
  }
  if (surface === "meetings") {
    return buildMeetingItems(service);
  }
  if (surface === "planning") {
    return buildPlanningItems(service);
  }
  return buildOutboundItems(service);
}

function defaultFreshnessMinutes(surface: ReviewPackageSurface): number {
  if (surface === "meetings") {
    return 5;
  }
  if (surface === "planning") {
    return 15;
  }
  return 10;
}

function feedbackReasonForPackage(
  service: any,
  packageId: string,
  sourceFingerprint: string,
  packageItemId?: string,
): ReviewFeedbackReason | undefined {
  return service.db.getLatestReviewFeedbackReason(packageId, sourceFingerprint, packageItemId);
}

function buildPackageFromItems(
  service: any,
  surface: ReviewPackageSurface,
  items: InternalReviewItem[],
): InternalReviewPackage | null {
  if (items.length === 0) {
    return null;
  }
  const filteredItems = items.filter((item) => !suppressionKeys(service).has(`${surface}:${item.source_key}`));
  if (filteredItems.length === 0) {
    return null;
  }
  const sourceFingerprint = currentSurfaceFingerprint(surface, filteredItems);
  const packageId = packageIdFor(surface, filteredItems.map((item) => item.package_item_id), sourceFingerprint);
  const prior = service.db.getReviewPackageRecord(packageId);
  const packageFeedbackReason = feedbackReasonForPackage(service, packageId, sourceFingerprint);
  const preparedAt = prior?.prepared_at ?? nowIso();
  const staleAt = addMinutes(preparedAt, defaultFreshnessMinutes(surface));
  const scoreBand = filteredItems[0]!.sort_score >= 850 ? "highest" : filteredItems[0]!.sort_score >= 650 ? "high" : "medium";
  const pkg: InternalReviewPackage = {
    package_id: packageId,
    surface,
    state: "review_ready",
    summary: filteredItems[0]!.title,
    why_now: filteredItems[0]!.summary,
    score_band: scoreBand,
    signals: [`${surface}_review_ready`, packageFeedbackReason ? `feedback:${packageFeedbackReason}` : `${filteredItems.length}_items`],
    prepared_at: preparedAt,
    stale_at: staleAt,
    source_fingerprint: sourceFingerprint,
    member_ids: filteredItems.map((item) => item.item_id),
    next_commands: [...new Set(filteredItems.map((item) => item.command))].slice(0, 3),
    items: filteredItems.map((item) => ({
      package_item_id: item.package_item_id,
      item_type: item.item_type,
      item_id: item.item_id,
      title: item.title,
      summary: item.summary,
      command: item.command,
      underlying_state: item.underlying_state,
      current_feedback_reason: feedbackReasonForPackage(service, packageId, sourceFingerprint, item.package_item_id),
    })),
    source_keys: filteredItems.map((item) => item.source_key),
    sort_score: filteredItems[0]!.sort_score + (surfacePriorityOffsets(service).get(surface) ?? 0),
  };
  pkg.state = packageStateFor(pkg, Boolean(packageFeedbackReason));
  return pkg;
}

function hydrateUnusedStale(service: any, pkg: InternalReviewPackage): InternalReviewPackage {
  const record = service.db.getReviewPackageRecord(pkg.package_id);
  if (!record) {
    return pkg;
  }
  if (
    pkg.state === "stale" &&
    !record.opened_at &&
    !record.acted_on_at &&
    !record.current_cycle_reviewed &&
    !record.stale_unused_at
  ) {
    service.db.markReviewPackageStaleUnused(pkg.package_id);
  }
  return pkg;
}

async function deriveCurrentPackages(service: any): Promise<InternalReviewPackage[]> {
  const derived: InternalReviewPackage[] = [];
  for (const surface of SURFACES) {
    const items = await buildSurfaceItems(service, surface);
    const pkg = buildPackageFromItems(service, surface, items);
    if (!pkg) {
      continue;
    }
    derived.push(pkg);
  }

  service.db.markAllReviewPackagesNotCurrent();
  for (const pkg of derived) {
    service.db.upsertReviewPackage({
      ...pkg,
      source_keys: pkg.source_keys,
      is_current: true,
      current_cycle_reviewed: pkg.state === "completed",
      completed_at: pkg.state === "completed" ? nowIso() : null,
      stale_unused_at: service.db.getReviewPackageRecord(pkg.package_id)?.stale_unused_at ?? null,
    });
    hydrateUnusedStale(service, pkg);
  }
  return derived.sort((left, right) => right.sort_score - left.sort_score || left.surface.localeCompare(right.surface));
}

type SourceStats = {
  surface: ReviewPackageSurface;
  scope_key: string;
  negative_count: number;
  positive_count: number;
  unused_stale_count: number;
};

function collectSourceStats(service: any): Map<string, SourceStats> {
  const stats = new Map<string, SourceStats>();
  const packageRecords = new Map<string, any>(
    service.db
      .listReviewPackageRecords({ include_completed: true, current_only: false })
      .map((pkg: any) => [pkg.package_id, pkg]),
  );
  for (const event of service.db.listReviewFeedbackEvents({ days: REVIEW_WINDOW_DAYS })) {
    const pkg = packageRecords.get(event.package_id);
    if (!pkg) {
      continue;
    }
    const scopedKeys =
      event.package_item_id
        ? pkg.items
            .map((item: ReviewPackageItem, index: number) => ({ item, source_key: pkg.source_keys[index] }))
            .filter((entry: any) => entry.item.package_item_id === event.package_item_id)
            .map((entry: any) => entry.source_key)
        : pkg.source_keys;
    for (const scopeKey of scopedKeys) {
      const key = `${event.surface}:${scopeKey}`;
      const current = stats.get(key) ?? {
        surface: event.surface,
        scope_key: scopeKey,
        negative_count: 0,
        positive_count: 0,
        unused_stale_count: 0,
      };
      if (negativeReason(event.reason)) {
        current.negative_count += 1;
      } else {
        current.positive_count += 1;
      }
      stats.set(key, current);
    }
  }
  for (const pkg of packageRecords.values() as Iterable<any>) {
    if (!pkg.stale_unused_at || Date.parse(pkg.stale_unused_at) < Date.now() - REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      continue;
    }
    for (const scopeKey of pkg.source_keys) {
      const key = `${pkg.surface}:${scopeKey}`;
      const current = stats.get(key) ?? {
        surface: pkg.surface,
        scope_key: scopeKey,
        negative_count: 0,
        positive_count: 0,
        unused_stale_count: 0,
      };
      current.unused_stale_count += 1;
      stats.set(key, current);
    }
  }
  return stats;
}

function collectSurfaceReasonCounts(service: any, reason: ReviewFeedbackReason): Map<ReviewPackageSurface, number> {
  const counts = new Map<ReviewPackageSurface, number>();
  for (const event of service.db.listReviewFeedbackEvents({ days: REVIEW_WINDOW_DAYS })) {
    if (event.reason !== reason) {
      continue;
    }
    counts.set(event.surface, (counts.get(event.surface) ?? 0) + 1);
  }
  return counts;
}

function summarizeProposal(kind: ReviewTuningProposalKind, surface: ReviewPackageSurface, scopeKey: string): string {
  if (kind === "source_suppression") {
    return `Suppress repeated low-value ${surface} review noise for ${scopeKey} for 7 days.`;
  }
  if (kind === "surface_priority_offset") {
    return `Lower ${surface} review package priority for 14 days so stronger work surfaces first.`;
  }
  return `Slow ${surface} review notifications for 14 days so timing noise drops.`;
}

function runtimeProposalExpiryDays(kind: ReviewTuningProposalKind): number {
  if (kind === "source_suppression") {
    return 7;
  }
  return 14;
}

function shouldKeepLatestDismissed(existing: ReviewTuningProposal | null, evidenceFingerprint: string, evidenceCount: number): boolean {
  if (!existing || existing.status !== "dismissed" || !existing.dismissed_at) {
    return false;
  }
  if (existing.evidence_fingerprint === evidenceFingerprint) {
    return true;
  }
  if (Date.parse(existing.dismissed_at) <= Date.now() - REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return false;
  }
  return evidenceCount <= existing.evidence_count;
}

function buildProposedTuning(
  service: any,
  kind: ReviewTuningProposalKind,
  surface: ReviewPackageSurface,
  scopeKey: string,
  counts: {
    evidence_count: number;
    positive_count: number;
    negative_count: number;
    unused_stale_count: number;
  },
  evidence: unknown,
): ReviewTuningProposal {
  const proposalFamilyKey = proposalFamilyKeyFor(kind, surface, scopeKey);
  const evidenceFingerprint = hashInput(evidence);
  const latest = service.db.getLatestReviewTuningProposalByFamily(proposalFamilyKey);
  if (shouldKeepLatestDismissed(latest, evidenceFingerprint, counts.evidence_count)) {
    return latest!;
  }
  const proposalId = latest?.evidence_fingerprint === evidenceFingerprint ? latest.proposal_id : proposalIdFor(proposalFamilyKey, evidenceFingerprint);
  const createdAt = latest?.evidence_fingerprint === evidenceFingerprint ? latest.created_at : nowIso();
  const proposal: ReviewTuningProposal = {
    proposal_id: proposalId,
    proposal_family_key: proposalFamilyKey,
    evidence_fingerprint: evidenceFingerprint,
    proposal_kind: kind,
    surface,
    scope_key: scopeKey,
    summary: summarizeProposal(kind, surface, scopeKey),
    evidence_window_days: REVIEW_WINDOW_DAYS,
    evidence_count: counts.evidence_count,
    positive_count: counts.positive_count,
    negative_count: counts.negative_count,
    unused_stale_count: counts.unused_stale_count,
    status: latest?.status === "approved" && latest.evidence_fingerprint === evidenceFingerprint ? "approved" : "proposed",
    created_at: createdAt,
    updated_at: nowIso(),
    expires_at: addDays(nowIso(), runtimeProposalExpiryDays(kind)),
    approved_at: latest?.evidence_fingerprint === evidenceFingerprint ? latest.approved_at : undefined,
    approved_by_client: latest?.evidence_fingerprint === evidenceFingerprint ? latest.approved_by_client : undefined,
    approved_by_actor: latest?.evidence_fingerprint === evidenceFingerprint ? latest.approved_by_actor : undefined,
    approved_note: latest?.evidence_fingerprint === evidenceFingerprint ? latest.approved_note : undefined,
    dismissed_at: latest?.evidence_fingerprint === evidenceFingerprint ? latest.dismissed_at : undefined,
    dismissed_by_client: latest?.evidence_fingerprint === evidenceFingerprint ? latest.dismissed_by_client : undefined,
    dismissed_by_actor: latest?.evidence_fingerprint === evidenceFingerprint ? latest.dismissed_by_actor : undefined,
    dismissed_note: latest?.evidence_fingerprint === evidenceFingerprint ? latest.dismissed_note : undefined,
  };
  service.db.upsertReviewTuningProposal({
    ...proposal,
    evidence_json: JSON.stringify(evidence),
  });
  return proposal;
}

async function deriveTuningProposals(service: any): Promise<ReviewTuningProposal[]> {
  const sourceStats = collectSourceStats(service);
  const wrongPriorityCounts = collectSurfaceReasonCounts(service, "wrong_priority");
  const badTimingCounts = collectSurfaceReasonCounts(service, "bad_timing");

  for (const stat of sourceStats.values()) {
    const evidenceCount = stat.negative_count + stat.positive_count + stat.unused_stale_count;
    const negativeRatio = evidenceCount > 0 ? (stat.negative_count + stat.unused_stale_count) / evidenceCount : 0;
    if (stat.negative_count < 3 || negativeRatio < 0.6 || stat.positive_count > 0) {
      continue;
    }
    buildProposedTuning(
      service,
      "source_suppression",
      stat.surface,
      stat.scope_key,
      {
        evidence_count: evidenceCount,
        positive_count: stat.positive_count,
        negative_count: stat.negative_count,
        unused_stale_count: stat.unused_stale_count,
      },
      stat,
    );
  }

  for (const [surface, count] of wrongPriorityCounts.entries()) {
    if (count < 3) {
      continue;
    }
    buildProposedTuning(
      service,
      "surface_priority_offset",
      surface,
      surface,
      {
        evidence_count: count,
        positive_count: 0,
        negative_count: count,
        unused_stale_count: 0,
      },
      { surface, count, reason: "wrong_priority" },
    );
  }

  for (const [surface, count] of badTimingCounts.entries()) {
    if (count < 3) {
      continue;
    }
    buildProposedTuning(
      service,
      "notification_cooldown_override",
      surface,
      surface,
      {
        evidence_count: count,
        positive_count: 0,
        negative_count: count,
        unused_stale_count: 0,
      },
      { surface, count, reason: "bad_timing" },
    );
  }

  return service.db
    .listReviewTuningProposals({ include_expired: false })
    .filter((proposal: ReviewTuningProposal) =>
      ["proposed", "approved", "dismissed"].includes(proposal.status),
    )
    .sort((left: ReviewTuningProposal, right: ReviewTuningProposal) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
}

async function currentReadiness(service: any): Promise<ServiceState> {
  const checks = await service.collectDoctorChecks({ deep: false, httpReachable: true });
  return service.classifyState(checks);
}

function refreshAgeLimitMs(service: any): number {
  return Math.max(1, Number(service.config.autopilotRunIntervalMinutes ?? 5)) * 60_000;
}

export function reviewReadModelNeedsRefresh(service: any): boolean {
  const state = service.db.getReviewReadModelState();
  if (!state || !state.last_refresh_finished_at) {
    return true;
  }
  if (state.refresh_state === "refreshing") {
    return false;
  }
  return Date.now() - Date.parse(state.last_refresh_finished_at) >= refreshAgeLimitMs(service);
}

export async function refreshReviewReadModel(
  service: any,
  trigger: string,
): Promise<{
  packages: InternalReviewPackage[];
  tuning: ReviewTuningProposal[];
}> {
  const startedAt = nowIso();
  service.db.upsertReviewReadModelState({
    refresh_state: "refreshing",
    last_refresh_started_at: startedAt,
    last_refresh_trigger: trigger,
    last_refresh_error: null,
  });
  try {
    const packages = await deriveCurrentPackages(service);
    const tuning = await deriveTuningProposals(service);
    service.db.upsertReviewReadModelState({
      refresh_state: "fresh",
      last_refresh_started_at: startedAt,
      last_refresh_finished_at: nowIso(),
      last_refresh_trigger: trigger,
      last_refresh_error: null,
    });
    return { packages, tuning };
  } catch (error) {
    service.db.upsertReviewReadModelState({
      refresh_state: "failed",
      last_refresh_started_at: startedAt,
      last_refresh_finished_at: nowIso(),
      last_refresh_trigger: trigger,
      last_refresh_error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function currentRefreshState(service: any): ReviewReadModelRefreshState {
  const state = service.db.getReviewReadModelState();
  if (!state) {
    return "empty";
  }
  if (state.refresh_state === "refreshing") {
    return "refreshing";
  }
  if (state.refresh_state === "failed") {
    return "failed";
  }
  return reviewReadModelNeedsRefresh(service) ? "stale" : "fresh";
}

function buildReviewPackageReportFromState(
  service: any,
  packages: ReviewPackage[],
  tuning: ReviewTuningProposal[],
  readiness: ServiceState,
): ReviewPackageReport {
  const visiblePackages = packages.filter((pkg) => pkg.state !== "completed");
  const state = service.db.getReviewReadModelState();
  return {
    generated_at: nowIso(),
    readiness,
    refreshed_at: state?.last_refresh_finished_at ?? null,
    refresh_state: currentRefreshState(service),
    last_refresh_trigger: state?.last_refresh_trigger,
    summary: summarizePackageCount(visiblePackages),
    top_item_summary: visiblePackages[0]?.summary ?? null,
    open_tuning_proposal_count: tuning.filter((proposal) => proposal.status === "proposed").length,
    unused_package_count_7d: service.db
      .listReviewPackageRecords({ include_completed: true, current_only: false })
      .filter((pkg: any) => pkg.stale_unused_at && Date.parse(pkg.stale_unused_at) >= Date.now() - UNUSED_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      .length,
    packages: visiblePackages.map((pkg) => ({
      package_id: pkg.package_id,
      surface: pkg.surface,
      state: pkg.state,
      summary: pkg.summary,
      why_now: pkg.why_now,
      score_band: pkg.score_band,
      signals: pkg.signals,
      prepared_at: pkg.prepared_at,
      stale_at: pkg.stale_at,
      source_fingerprint: pkg.source_fingerprint,
      member_ids: pkg.member_ids,
      next_commands: pkg.next_commands,
      items: pkg.items,
    })),
  };
}

export async function buildStoredReviewPackageReport(service: any, readiness?: ServiceState): Promise<ReviewPackageReport> {
  return buildReviewPackageReportFromState(
    service,
    service.db.listReviewPackages(),
    service.db.listReviewTuningProposals({ include_expired: false }),
    readiness ?? (await currentReadiness(service)),
  );
}

export async function buildStoredReviewTuningReport(service: any): Promise<ReviewTuningReport> {
  const state = service.db.getReviewReadModelState();
  const tuning: ReviewTuningProposal[] = service.db.listReviewTuningProposals({ include_expired: false });
  return {
    generated_at: nowIso(),
    refreshed_at: state?.last_refresh_finished_at ?? null,
    refresh_state: currentRefreshState(service),
    last_refresh_trigger: state?.last_refresh_trigger,
    summary: summarizeTuningCount(tuning.filter((proposal) => proposal.status === "proposed")),
    open_proposal_count: tuning.filter((proposal) => proposal.status === "proposed").length,
    proposals: tuning,
  };
}

export async function getReviewPackageDetail(service: any, packageId: string): Promise<ReviewPackage> {
  const pkg = service.db.getReviewPackage(packageId);
  if (!pkg || !(service.db.getReviewPackageRecord(packageId)?.is_current ?? false)) {
    throw new Error(`Review package ${packageId} is not available right now.`);
  }
  service.db.markReviewPackageOpened(packageId);
  return service.db.getReviewPackage(packageId) ?? pkg;
}

export async function submitReviewPackageFeedback(
  service: any,
  identity: ClientIdentity,
  packageId: string,
  input: { reason: ReviewFeedbackReason; note: string; package_item_id?: string },
): Promise<ReviewPackage> {
  service.assertOperatorOnly(identity, "submit review package feedback");
  const note = input.note.trim();
  if (!note) {
    throw new Error("Review package feedback requires a note.");
  }
  await service.ensureReviewReadModel({ trigger: "review_package_feedback", wait_for_fresh: true });
  const pkg = service.db.getReviewPackageRecord(packageId);
  if (!pkg || !pkg.is_current) {
    throw new Error(`Review package ${packageId} is not available right now.`);
  }
  if (input.package_item_id && !pkg.items.some((item: ReviewPackageItem) => item.package_item_id === input.package_item_id)) {
    throw new Error(`Review package item ${input.package_item_id} is not part of ${packageId}.`);
  }

  service.db.createReviewFeedbackEvent({
    package_id: packageId,
    surface: pkg.surface,
    package_item_id: input.package_item_id,
    reason: input.reason,
    note,
    actor: identity.requested_by ?? null,
    client_id: identity.client_id,
    source_fingerprint: pkg.source_fingerprint,
  });
  service.db.markReviewPackageActedOn(packageId);
  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action: "review_package_feedback",
    target_type: "review_package",
    target_id: packageId,
    outcome: "success",
    metadata: {
      surface: pkg.surface,
      package_item_id: input.package_item_id ?? null,
      reason: input.reason,
      note,
      source_fingerprint: pkg.source_fingerprint,
      member_ids: pkg.member_ids,
    },
  });

  await service.refreshReviewReadModel("review_package_feedback");
  return service.db.getReviewPackage(packageId) ?? {
    ...pkg,
    state: input.package_item_id ? pkg.state : "completed",
  };
}

export async function approveReviewTuningProposal(
  service: any,
  identity: ClientIdentity,
  proposalId: string,
  note: string,
): Promise<ReviewTuningProposal> {
  service.assertOperatorOnly(identity, "approve a review tuning proposal");
  const trimmedNote = note.trim();
  if (!trimmedNote) {
    throw new Error("Approving a review tuning proposal requires a note.");
  }
  await service.ensureReviewReadModel({ trigger: "review_tuning_approve", wait_for_fresh: true });
  const proposal = service.db.getReviewTuningProposalRecord(proposalId);
  if (!proposal) {
    throw new Error(`Review tuning proposal ${proposalId} is not available right now.`);
  }
  const approvedAt = nowIso();
  const approved: ReviewTuningProposal = {
    ...proposal,
    status: "approved",
    updated_at: approvedAt,
    approved_at: approvedAt,
    approved_by_client: identity.client_id,
    approved_by_actor: identity.requested_by,
    approved_note: trimmedNote,
    dismissed_at: undefined,
    dismissed_by_client: undefined,
    dismissed_by_actor: undefined,
    dismissed_note: undefined,
    expires_at: addDays(approvedAt, runtimeProposalExpiryDays(proposal.proposal_kind)),
  };
  service.db.upsertReviewTuningProposal({
    ...approved,
    evidence_json: proposal.evidence_json,
  });
  const value =
    proposal.proposal_kind === "source_suppression"
      ? { suppressed: true }
      : proposal.proposal_kind === "surface_priority_offset"
        ? { offset: -200 }
        : { multiplier: 2 };
  service.db.upsertReviewTuningState({
    proposal_id: proposal.proposal_id,
    proposal_kind: proposal.proposal_kind,
    surface: proposal.surface,
    scope_key: proposal.scope_key,
    value_json: JSON.stringify(value),
    status: "active",
    starts_at: approvedAt,
    expires_at: approved.expires_at,
    note: trimmedNote,
  });
  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action: "review_tuning_proposal_approve",
    target_type: "review_tuning_proposal",
    target_id: proposal.proposal_id,
    outcome: "success",
    metadata: {
      proposal_kind: proposal.proposal_kind,
      surface: proposal.surface,
      scope_key: proposal.scope_key,
      note: trimmedNote,
    },
  });
  await service.refreshReviewReadModel("review_tuning_approve");
  return service.db.getReviewTuningProposal(proposalId) ?? approved;
}

export async function dismissReviewTuningProposal(
  service: any,
  identity: ClientIdentity,
  proposalId: string,
  note: string,
): Promise<ReviewTuningProposal> {
  service.assertOperatorOnly(identity, "dismiss a review tuning proposal");
  const trimmedNote = note.trim();
  if (!trimmedNote) {
    throw new Error("Dismissing a review tuning proposal requires a note.");
  }
  await service.ensureReviewReadModel({ trigger: "review_tuning_dismiss", wait_for_fresh: true });
  const proposal = service.db.getReviewTuningProposalRecord(proposalId);
  if (!proposal) {
    throw new Error(`Review tuning proposal ${proposalId} is not available right now.`);
  }
  const dismissedAt = nowIso();
  const dismissed: ReviewTuningProposal = {
    ...proposal,
    status: "dismissed",
    updated_at: dismissedAt,
    approved_at: undefined,
    approved_by_client: undefined,
    approved_by_actor: undefined,
    approved_note: undefined,
    dismissed_at: dismissedAt,
    dismissed_by_client: identity.client_id,
    dismissed_by_actor: identity.requested_by,
    dismissed_note: trimmedNote,
    expires_at: addDays(dismissedAt, REVIEW_WINDOW_DAYS),
  };
  service.db.upsertReviewTuningProposal({
    ...dismissed,
    evidence_json: proposal.evidence_json,
  });
  service.db.upsertReviewTuningState({
    proposal_id: proposal.proposal_id,
    proposal_kind: proposal.proposal_kind,
    surface: proposal.surface,
    scope_key: proposal.scope_key,
    value_json: proposal.evidence_json,
    status: "dismissed",
    starts_at: dismissedAt,
    expires_at: dismissed.expires_at,
    note: trimmedNote,
  });
  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action: "review_tuning_proposal_dismiss",
    target_type: "review_tuning_proposal",
    target_id: proposal.proposal_id,
    outcome: "success",
    metadata: {
      proposal_kind: proposal.proposal_kind,
      surface: proposal.surface,
      scope_key: proposal.scope_key,
      note: trimmedNote,
    },
  });
  await service.refreshReviewReadModel("review_tuning_dismiss");
  return service.db.getReviewTuningProposal(proposalId) ?? dismissed;
}

export function getReviewNotificationSnapshot(service: any): {
  review_package_count: number;
  top_review_summary: string | null;
  open_tuning_proposal_count: number;
  review_package_inbox_count: number;
  review_package_meetings_count: number;
  review_package_planning_count: number;
  review_package_outbound_count: number;
  review_notification_cooldown_minutes: Record<ReviewPackageSurface, number>;
} {
  const packages = service.db.listReviewPackages();
  const proposals = service.db.listReviewTuningProposals().filter((proposal: ReviewTuningProposal) => proposal.status === "proposed");
  const cooldownMultipliers = notificationCooldownOverrides(service);
  return {
    review_package_count: packages.length,
    top_review_summary: packages[0]?.summary ?? null,
    open_tuning_proposal_count: proposals.length,
    review_package_inbox_count: packages.filter((pkg: ReviewPackage) => pkg.surface === "inbox").length,
    review_package_meetings_count: packages.filter((pkg: ReviewPackage) => pkg.surface === "meetings").length,
    review_package_planning_count: packages.filter((pkg: ReviewPackage) => pkg.surface === "planning").length,
    review_package_outbound_count: packages.filter((pkg: ReviewPackage) => pkg.surface === "outbound").length,
    review_notification_cooldown_minutes: {
      inbox: service.config.autopilotNotificationCooldownMinutes * cooldownMultipliers.inbox,
      meetings: service.config.autopilotNotificationCooldownMinutes * cooldownMultipliers.meetings,
      planning: service.config.autopilotNotificationCooldownMinutes * cooldownMultipliers.planning,
      outbound: service.config.autopilotNotificationCooldownMinutes * cooldownMultipliers.outbound,
    },
  };
}
