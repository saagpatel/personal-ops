import { createHash } from "node:crypto";
import type {
  ClientIdentity,
  ReviewCalibrationMetricKey,
  ReviewCalibrationMetricStatus,
  ReviewCalibrationRecommendation,
  ReviewCalibrationReport,
  ReviewCalibrationStatus,
  ReviewCalibrationSurfaceSummary,
  ReviewCalibrationTarget,
  ReviewCalibrationTargetScopeKey,
  ReviewCalibrationTargetScopeType,
  ReviewCalibrationTargetsReport,
  ReviewFeedbackReason,
  ReviewImpactComparison,
  ReviewImpactConfidence,
  ReviewImpactReport,
  ReviewMetricSnapshot,
  ReviewMetricSnapshotMetrics,
  ReviewNotificationDecision,
  ReviewNotificationEvent,
  ReviewNotificationKind,
  ReviewNotificationSnapshot,
  ReviewNoisySourceReport,
  ReviewPackage,
  ReviewPackageCycle,
  ReviewPackageItem,
  ReviewPackageReport,
  ReviewPackageState,
  ReviewPackageSurface,
  ReviewReport,
  ReviewReportSurface,
  ReviewReadModelRefreshState,
  ReviewTrendPoint,
  ReviewTrendsReport,
  ReviewTuningProposal,
  ReviewTuningProposalKind,
  ReviewTuningReport,
  ReviewWeeklyRecommendation,
  ReviewWeeklyReport,
  ReviewWeeklySurfaceSummary,
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
const TREND_WINDOW_DAYS = 7;
const CALIBRATION_WINDOW_DAYS = 14;
const CALIBRATION_NOTIFICATION_WINDOW_DAYS = 7;
const NOTIFICATION_ATTRIBUTION_HOURS = 24;
const SURFACES: ReviewPackageSurface[] = ["inbox", "meetings", "planning", "outbound"];
const CALIBRATION_DEFAULT_CLIENT = "review-calibration-defaults";
const CALIBRATION_WATCH_BUFFER = 0.1;
const DEFAULT_CALIBRATION_TARGETS = {
  min_acted_on_rate: 0.4,
  max_stale_unused_rate: 0.3,
  max_negative_feedback_rate: 0.25,
  min_notification_action_conversion_rate: 0.15,
  max_notifications_per_7d: 7,
} satisfies Omit<
  ReviewCalibrationTarget,
  "scope_type" | "scope_key" | "created_at" | "updated_at" | "updated_by_client" | "updated_by_actor"
>;
const CALIBRATION_METRIC_PRECEDENCE: ReviewCalibrationMetricKey[] = [
  "notifications_per_7d",
  "stale_unused_rate",
  "negative_feedback_rate",
  "acted_on_rate",
  "notification_action_conversion_rate",
];

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(baseIso: string, minutes: number): string {
  return new Date(Date.parse(baseIso) + Math.max(1, minutes) * 60_000).toISOString();
}

function addDays(baseIso: string, days: number): string {
  return new Date(Date.parse(baseIso) + Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
}

function subtractDays(baseIso: string, days: number): string {
  return new Date(Date.parse(baseIso) - Math.max(0, days) * 24 * 60 * 60 * 1000).toISOString();
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
    service.db.markReviewPackageCycleStaleUnused(pkg.package_id);
  }
  return pkg;
}

async function deriveCurrentPackages(service: any): Promise<InternalReviewPackage[]> {
  const previousCurrent = service.db.listReviewPackageRecords({ include_completed: true, current_only: true });
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
  const refreshedAt = nowIso();
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
    const record = service.db.getReviewPackageRecord(pkg.package_id);
    if (record) {
      service.db.ensureOpenReviewPackageCycle({
        package_id: record.package_id,
        surface: record.surface,
        source_fingerprint: record.source_fingerprint,
        summary: record.summary,
        why_now: record.why_now,
        score_band: record.score_band,
        member_ids: record.member_ids,
        items: record.items,
        source_keys: record.source_keys,
        seen_at: refreshedAt,
        opened_at: record.opened_at ?? null,
        acted_on_at: record.acted_on_at ?? null,
        completed_at: record.completed_at ?? null,
        stale_unused_at: record.stale_unused_at ?? null,
      });
    }
  }
  const activePackageIds = new Set(derived.map((pkg) => pkg.package_id));
  for (const previous of previousCurrent) {
    if (activePackageIds.has(previous.package_id)) {
      continue;
    }
    const cycle = service.db.getOpenReviewPackageCycle(previous.package_id);
    if (!cycle) {
      continue;
    }
    service.db.closeReviewPackageCycle(cycle.package_cycle_id, {
      outcome: previous.completed_at
        ? "completed"
        : previous.stale_unused_at
          ? "stale_unused"
          : "disappeared",
      ended_at: refreshedAt,
      opened_at: previous.opened_at ?? null,
      acted_on_at: previous.acted_on_at ?? null,
      completed_at: previous.completed_at ?? null,
      stale_unused_at: previous.stale_unused_at ?? null,
    });
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
    await ensureReviewMetricSnapshots(service, {
      days: 1,
      include_surface_snapshots: true,
      reference_now: nowIso(),
    });
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
  service.db.markReviewPackageCycleOpened(packageId);
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
  const cycle = service.db.getOpenReviewPackageCycle(packageId);
  if (input.package_item_id && !pkg.items.some((item: ReviewPackageItem) => item.package_item_id === input.package_item_id)) {
    throw new Error(`Review package item ${input.package_item_id} is not part of ${packageId}.`);
  }

  service.db.createReviewFeedbackEvent({
    package_id: packageId,
    package_cycle_id: cycle?.package_cycle_id ?? null,
    surface: pkg.surface,
    package_item_id: input.package_item_id,
    reason: input.reason,
    note,
    actor: identity.requested_by ?? null,
    client_id: identity.client_id,
    source_fingerprint: pkg.source_fingerprint,
  });
  service.db.markReviewPackageActedOn(packageId);
  service.db.markReviewPackageCycleActedOn(packageId);
  if (!input.package_item_id) {
    service.db.markReviewPackageCycleCompleted(packageId);
  }
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

function clampWindowDays(value?: number): 7 | 14 | 30 {
  if (value === 7 || value === 30) {
    return value;
  }
  return 14;
}

function windowStartIso(windowDays: 7 | 14 | 30): string {
  return new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

function windowStartIsoAt(windowDays: 7 | 14 | 30, referenceNowIso: string): string {
  return subtractDays(referenceNowIso, windowDays);
}

function snapshotDateFor(referenceNowIso: string): string {
  return referenceNowIso.slice(0, 10);
}

function snapshotEndIso(snapshotDate: string): string {
  return new Date(`${snapshotDate}T23:59:59.999Z`).toISOString();
}

function withinWindow(valueIso: string | undefined, startIso: string, endIso: string): boolean {
  if (!valueIso) {
    return false;
  }
  const valueMs = Date.parse(valueIso);
  return valueMs >= Date.parse(startIso) && valueMs <= Date.parse(endIso);
}

function rate(count: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Number((count / total).toFixed(4));
}

function deltaValue(current: number, previous: number): number {
  return Number((current - previous).toFixed(4));
}

function emptyMetrics(): ReviewMetricSnapshotMetrics {
  return {
    created_count: 0,
    opened_count: 0,
    acted_on_count: 0,
    completed_count: 0,
    stale_unused_count: 0,
    open_rate: 0,
    acted_on_rate: 0,
    stale_unused_rate: 0,
    fired_notification_count: 0,
    suppressed_notification_count: 0,
    cooldown_hit_count: 0,
    notification_open_conversion_rate: 0,
    notification_action_conversion_rate: 0,
    noisy_source_count: 0,
    open_tuning_proposal_count: 0,
    active_tuning_state_count: 0,
  };
}

function metricsFromReviewReport(report: ReviewReport): ReviewMetricSnapshotMetrics {
  return {
    created_count: report.summary.created_count,
    opened_count: report.summary.opened_count,
    acted_on_count: report.summary.acted_on_count,
    completed_count: report.summary.completed_count,
    stale_unused_count: report.summary.stale_unused_count,
    open_rate: report.summary.open_rate,
    acted_on_rate: report.summary.acted_on_rate,
    stale_unused_rate: report.summary.stale_unused_rate,
    fired_notification_count: report.notification_performance.fired_count,
    suppressed_notification_count: report.notification_performance.suppressed_count,
    cooldown_hit_count: report.notification_performance.cooldown_hit_count,
    notification_open_conversion_rate: report.summary.notification_open_conversion_rate,
    notification_action_conversion_rate: report.summary.notification_action_conversion_rate,
    noisy_source_count: report.top_noisy_sources.filter(
      (source) => source.negative_feedback_count > 0 || source.stale_unused_count > 0,
    ).length,
    open_tuning_proposal_count: report.surfaces.reduce((total, surface) => total + surface.open_tuning_proposal_count, 0),
    active_tuning_state_count: report.proposal_outcomes.active_state_counts.reduce((total, entry) => total + entry.count, 0),
  };
}

function aggregateMetrics(metrics: ReviewMetricSnapshotMetrics[]): ReviewMetricSnapshotMetrics {
  if (metrics.length === 0) {
    return emptyMetrics();
  }
  const aggregated = metrics.reduce(
    (total, current) => ({
      created_count: total.created_count + current.created_count,
      opened_count: total.opened_count + current.opened_count,
      acted_on_count: total.acted_on_count + current.acted_on_count,
      completed_count: total.completed_count + current.completed_count,
      stale_unused_count: total.stale_unused_count + current.stale_unused_count,
      open_rate: total.open_rate + current.open_rate,
      acted_on_rate: total.acted_on_rate + current.acted_on_rate,
      stale_unused_rate: total.stale_unused_rate + current.stale_unused_rate,
      fired_notification_count: total.fired_notification_count + current.fired_notification_count,
      suppressed_notification_count: total.suppressed_notification_count + current.suppressed_notification_count,
      cooldown_hit_count: total.cooldown_hit_count + current.cooldown_hit_count,
      notification_open_conversion_rate:
        total.notification_open_conversion_rate + current.notification_open_conversion_rate,
      notification_action_conversion_rate:
        total.notification_action_conversion_rate + current.notification_action_conversion_rate,
      noisy_source_count: total.noisy_source_count + current.noisy_source_count,
      open_tuning_proposal_count: total.open_tuning_proposal_count + current.open_tuning_proposal_count,
      active_tuning_state_count: total.active_tuning_state_count + current.active_tuning_state_count,
    }),
    emptyMetrics(),
  );
  return {
    ...aggregated,
    open_rate: Number((aggregated.open_rate / metrics.length).toFixed(4)),
    acted_on_rate: Number((aggregated.acted_on_rate / metrics.length).toFixed(4)),
    stale_unused_rate: Number((aggregated.stale_unused_rate / metrics.length).toFixed(4)),
    notification_open_conversion_rate: Number(
      (aggregated.notification_open_conversion_rate / metrics.length).toFixed(4),
    ),
    notification_action_conversion_rate: Number(
      (aggregated.notification_action_conversion_rate / metrics.length).toFixed(4),
    ),
    noisy_source_count: Math.round(aggregated.noisy_source_count / metrics.length),
    open_tuning_proposal_count: Math.round(aggregated.open_tuning_proposal_count / metrics.length),
    active_tuning_state_count: Math.round(aggregated.active_tuning_state_count / metrics.length),
  };
}

function notificationFireRate(metrics: ReviewMetricSnapshotMetrics): number {
  return rate(metrics.fired_notification_count, Math.max(metrics.created_count, 1));
}

function cycleForFeedbackEvent(
  event: { package_cycle_id?: string | undefined; package_id: string; created_at: string },
  cyclesById: Map<string, ReviewPackageCycle>,
  cyclesByPackageId: Map<string, ReviewPackageCycle[]>,
): ReviewPackageCycle | null {
  if (event.package_cycle_id) {
    return cyclesById.get(event.package_cycle_id) ?? null;
  }
  const cycles = cyclesByPackageId.get(event.package_id) ?? [];
  const createdAtMs = Date.parse(event.created_at);
  return (
    cycles.find((cycle) => {
      const startMs = Date.parse(cycle.started_at);
      const endMs = Date.parse(cycle.ended_at ?? cycle.last_seen_at);
      return createdAtMs >= startMs && createdAtMs <= endMs;
    }) ?? null
  );
}

function sourceKeysForFeedbackEvent(
  event: { package_item_id?: string | undefined; package_id: string; created_at: string; package_cycle_id?: string | undefined },
  cyclesById: Map<string, ReviewPackageCycle>,
  cyclesByPackageId: Map<string, ReviewPackageCycle[]>,
): string[] {
  const cycle = cycleForFeedbackEvent(event, cyclesById, cyclesByPackageId);
  if (!cycle) {
    return [];
  }
  if (!event.package_item_id) {
    return cycle.source_keys;
  }
  const index = cycle.items.findIndex((item) => item.package_item_id === event.package_item_id);
  return index >= 0 ? [cycle.source_keys[index] ?? "unknown"] : [];
}

function surfaceForNotificationKind(kind: ReviewNotificationKind): ReviewPackageSurface | null {
  if (kind === "review_package_inbox") {
    return "inbox";
  }
  if (kind === "review_package_meetings") {
    return "meetings";
  }
  if (kind === "review_package_planning") {
    return "planning";
  }
  if (kind === "review_package_outbound") {
    return "outbound";
  }
  return null;
}

function surfaceForNotificationEvent(
  event: ReviewNotificationEvent,
  cyclesById: Map<string, ReviewPackageCycle>,
  proposalsById: Map<string, ReviewTuningProposal>,
): ReviewPackageSurface | null {
  if (event.surface) {
    return event.surface;
  }
  const kindSurface = surfaceForNotificationKind(event.kind);
  if (kindSurface) {
    return kindSurface;
  }
  if (event.package_cycle_id) {
    return cyclesById.get(event.package_cycle_id)?.surface ?? null;
  }
  if (event.proposal_id) {
    return proposalsById.get(event.proposal_id)?.surface ?? null;
  }
  return null;
}

function activeTuningCounts(service: any): Array<{
  proposal_kind: ReviewTuningProposalKind;
  surface: ReviewPackageSurface;
  count: number;
}> {
  const counts = new Map<string, { proposal_kind: ReviewTuningProposalKind; surface: ReviewPackageSurface; count: number }>();
  for (const state of activeTuningState(service)) {
    const key = `${state.proposal_kind}:${state.surface}`;
    const current = counts.get(key) ?? { proposal_kind: state.proposal_kind, surface: state.surface, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort(
    (left, right) => left.surface.localeCompare(right.surface) || left.proposal_kind.localeCompare(right.proposal_kind),
  );
}

async function buildStoredReviewReportAt(
  service: any,
  options: { window_days?: number; surface?: ReviewPackageSurface; reference_now?: string } = {},
): Promise<ReviewReport> {
  const windowDays = clampWindowDays(options.window_days);
  const referenceNowIso = options.reference_now ?? nowIso();
  const startIso = windowStartIsoAt(windowDays, referenceNowIso);
  const cycles: ReviewPackageCycle[] = service.db.listReviewPackageCycles({ include_open: true });
  const scopedCycles = cycles.filter(
    (cycle: ReviewPackageCycle) =>
      (!options.surface || cycle.surface === options.surface) &&
      withinWindow(cycle.started_at, startIso, referenceNowIso),
  );
  const cyclesById = new Map<string, ReviewPackageCycle>(
    cycles.map((cycle: ReviewPackageCycle) => [cycle.package_cycle_id, cycle]),
  );
  const cyclesByPackageId = new Map<string, ReviewPackageCycle[]>();
  for (const cycle of cycles) {
    const existing = cyclesByPackageId.get(cycle.package_id) ?? [];
    existing.push(cycle);
    existing.sort((left, right) => Date.parse(left.started_at) - Date.parse(right.started_at));
    cyclesByPackageId.set(cycle.package_id, existing);
  }

  const feedbackEvents: Array<{
    package_cycle_id?: string | undefined;
    package_id: string;
    surface: ReviewPackageSurface;
    package_item_id?: string | undefined;
    reason: ReviewFeedbackReason;
    created_at: string;
  }> = service.db
    .listReviewFeedbackEvents()
    .filter(
      (event: any) =>
        (!options.surface || event.surface === options.surface) &&
        withinWindow(event.created_at, startIso, referenceNowIso),
    );
  const allTuningProposals: ReviewTuningProposal[] = service.db.listReviewTuningProposals({ include_expired: true });
  const proposalsById = new Map<string, ReviewTuningProposal>(
    allTuningProposals.map((proposal: ReviewTuningProposal) => [proposal.proposal_id, proposal]),
  );
  const tuningProposals = allTuningProposals.filter(
    (proposal: ReviewTuningProposal) => !options.surface || proposal.surface === options.surface,
  );
  const notificationEvents: ReviewNotificationEvent[] = service
    .db.listReviewNotificationEvents()
    .filter(
      (event: ReviewNotificationEvent) =>
        withinWindow(event.created_at, startIso, referenceNowIso) &&
        (!options.surface || surfaceForNotificationEvent(event, cyclesById, proposalsById) === options.surface),
    );

  const createdCount = scopedCycles.length;
  const openedCount = scopedCycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.opened_at)).length;
  const actedOnCount = scopedCycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.acted_on_at)).length;
  const completedCount = scopedCycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.completed_at)).length;
  const staleUnusedCount = scopedCycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.stale_unused_at)).length;
  const disappearedCount = scopedCycles.filter((cycle: ReviewPackageCycle) => cycle.outcome === "disappeared").length;

  const sourceStats = new Map<
    string,
    {
      surface: ReviewPackageSurface;
      scope_key: string;
      feedback_count: number;
      negative_feedback_count: number;
      positive_feedback_count: number;
      stale_unused_count: number;
      latest_summary: string | null;
    }
  >();

  for (const event of feedbackEvents) {
    const scopeKeys = sourceKeysForFeedbackEvent(event, cyclesById, cyclesByPackageId);
    for (const scopeKey of scopeKeys) {
      const key = `${event.surface}:${scopeKey}`;
      const current = sourceStats.get(key) ?? {
        surface: event.surface,
        scope_key: scopeKey,
        feedback_count: 0,
        negative_feedback_count: 0,
        positive_feedback_count: 0,
        stale_unused_count: 0,
        latest_summary: cycleForFeedbackEvent(event, cyclesById, cyclesByPackageId)?.summary ?? null,
      };
      current.feedback_count += 1;
      if (negativeReason(event.reason)) {
        current.negative_feedback_count += 1;
      } else {
        current.positive_feedback_count += 1;
      }
      if (!current.latest_summary) {
        current.latest_summary = cycleForFeedbackEvent(event, cyclesById, cyclesByPackageId)?.summary ?? null;
      }
      sourceStats.set(key, current);
    }
  }

  for (const cycle of scopedCycles) {
    if (!cycle.stale_unused_at || !withinWindow(cycle.stale_unused_at, startIso, referenceNowIso)) {
      continue;
    }
    cycle.source_keys.forEach((scopeKey: string, index: number) => {
      const key = `${cycle.surface}:${scopeKey}`;
      const current = sourceStats.get(key) ?? {
        surface: cycle.surface,
        scope_key: scopeKey,
        feedback_count: 0,
        negative_feedback_count: 0,
        positive_feedback_count: 0,
        stale_unused_count: 0,
        latest_summary: cycle.items[index]?.title ?? cycle.summary,
      };
      current.stale_unused_count += 1;
      if (!current.latest_summary) {
        current.latest_summary = cycle.items[index]?.title ?? cycle.summary;
      }
      sourceStats.set(key, current);
    });
  }

  const firedPackageNotifications = notificationEvents.filter(
    (event: ReviewNotificationEvent) => event.decision === "fired" && Boolean(event.package_cycle_id),
  );
  const convertedOpenCount = firedPackageNotifications.filter((event: ReviewNotificationEvent) => {
    const cycle = event.package_cycle_id ? cyclesById.get(event.package_cycle_id) : null;
    if (!cycle?.opened_at) {
      return false;
    }
    const openedAtMs = Date.parse(cycle.opened_at);
    const createdAtMs = Date.parse(event.created_at);
    return openedAtMs >= createdAtMs && openedAtMs <= createdAtMs + NOTIFICATION_ATTRIBUTION_HOURS * 60 * 60 * 1000;
  }).length;
  const convertedActionCount = firedPackageNotifications.filter((event: ReviewNotificationEvent) => {
    const cycle = event.package_cycle_id ? cyclesById.get(event.package_cycle_id) : null;
    if (!cycle?.acted_on_at) {
      return false;
    }
    const actedOnAtMs = Date.parse(cycle.acted_on_at);
    const createdAtMs = Date.parse(event.created_at);
    return actedOnAtMs >= createdAtMs && actedOnAtMs <= createdAtMs + NOTIFICATION_ATTRIBUTION_HOURS * 60 * 60 * 1000;
  }).length;

  const proposalsCreatedInWindow = tuningProposals.filter(
    (proposal: ReviewTuningProposal) => withinWindow(proposal.created_at, startIso, referenceNowIso),
  );
  const proposalsApprovedInWindow = tuningProposals.filter(
    (proposal: ReviewTuningProposal) =>
      proposal.approved_at && withinWindow(proposal.approved_at, startIso, referenceNowIso),
  );
  const proposalsDismissedInWindow = tuningProposals.filter(
    (proposal: ReviewTuningProposal) =>
      proposal.dismissed_at && withinWindow(proposal.dismissed_at, startIso, referenceNowIso),
  );
  const reopenedCount = proposalsCreatedInWindow.filter(
    (proposal: ReviewTuningProposal) =>
      proposal.status !== "dismissed" &&
      tuningProposals.some(
        (older: ReviewTuningProposal) =>
          older.proposal_family_key === proposal.proposal_family_key &&
          older.status === "dismissed" &&
          older.proposal_id !== proposal.proposal_id &&
          Date.parse(older.updated_at) <= Date.parse(proposal.updated_at),
      ),
  ).length;

  const surfaceReports: ReviewReportSurface[] = SURFACES
    .filter((surface) => !options.surface || surface === options.surface)
    .map((surface: ReviewPackageSurface) => {
    const surfaceCycles = scopedCycles.filter((cycle: ReviewPackageCycle) => cycle.surface === surface);
    const created = surfaceCycles.length;
    const opened = surfaceCycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.opened_at)).length;
    const actedOn = surfaceCycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.acted_on_at)).length;
    const staleUnused = surfaceCycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.stale_unused_at)).length;
    const surfaceStats = [...sourceStats.values()].filter((stat) => stat.surface === surface);
    const surfaceNotifications = notificationEvents.filter(
      (event: ReviewNotificationEvent) => surfaceForNotificationEvent(event, cyclesById, proposalsById) === surface,
    );
    const surfaceFiredPackageNotifications = surfaceNotifications.filter(
      (event: ReviewNotificationEvent) => event.decision === "fired" && Boolean(event.package_cycle_id),
    );
    const surfaceOpenConversions = surfaceFiredPackageNotifications.filter((event: ReviewNotificationEvent) => {
      const cycle = event.package_cycle_id ? cyclesById.get(event.package_cycle_id) : null;
      if (!cycle?.opened_at) {
        return false;
      }
      const openedAtMs = Date.parse(cycle.opened_at);
      const createdAtMs = Date.parse(event.created_at);
      return openedAtMs >= createdAtMs && openedAtMs <= createdAtMs + NOTIFICATION_ATTRIBUTION_HOURS * 60 * 60 * 1000;
    }).length;
    const surfaceActionConversions = surfaceFiredPackageNotifications.filter((event: ReviewNotificationEvent) => {
      const cycle = event.package_cycle_id ? cyclesById.get(event.package_cycle_id) : null;
      if (!cycle?.acted_on_at) {
        return false;
      }
      const actedOnAtMs = Date.parse(cycle.acted_on_at);
      const createdAtMs = Date.parse(event.created_at);
      return actedOnAtMs >= createdAtMs && actedOnAtMs <= createdAtMs + NOTIFICATION_ATTRIBUTION_HOURS * 60 * 60 * 1000;
    }).length;

    return {
      surface,
      created_count: created,
      opened_count: opened,
      acted_on_count: actedOn,
      completed_count: surfaceCycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.completed_at)).length,
      stale_unused_count: staleUnused,
      open_rate: rate(opened, created),
      acted_on_rate: rate(actedOn, created),
      stale_unused_rate: rate(staleUnused, created),
      negative_feedback_count: surfaceStats.reduce((total, stat) => total + stat.negative_feedback_count, 0),
      positive_feedback_count: surfaceStats.reduce((total, stat) => total + stat.positive_feedback_count, 0),
      negative_feedback_rate: rate(
        surfaceStats.reduce((total, stat) => total + stat.negative_feedback_count, 0),
        surfaceStats.reduce((total, stat) => total + stat.feedback_count, 0),
      ),
      fired_notification_count: surfaceNotifications.filter((event: ReviewNotificationEvent) => event.decision === "fired").length,
      suppressed_notification_count: surfaceNotifications.filter((event: ReviewNotificationEvent) => event.decision === "suppressed").length,
      cooldown_hit_count: surfaceNotifications.filter(
        (event: ReviewNotificationEvent) => event.decision === "suppressed" && event.suppression_reason === "cooldown",
      ).length,
      notification_open_conversion_rate: rate(surfaceOpenConversions, surfaceFiredPackageNotifications.length),
      notification_action_conversion_rate: rate(surfaceActionConversions, surfaceFiredPackageNotifications.length),
      open_tuning_proposal_count: tuningProposals.filter(
        (proposal: ReviewTuningProposal) => proposal.surface === surface && proposal.status === "proposed",
      ).length,
      active_tuning_state_count: activeTuningState(service).filter((state) => state.surface === surface).length,
    };
    });

  const topNoisySources: ReviewNoisySourceReport[] = [...sourceStats.values()]
    .map((stat) => ({
      surface: stat.surface,
      scope_key: stat.scope_key,
      feedback_count: stat.feedback_count,
      negative_feedback_count: stat.negative_feedback_count,
      positive_feedback_count: stat.positive_feedback_count,
      negative_feedback_rate: rate(stat.negative_feedback_count, stat.feedback_count),
      stale_unused_count: stat.stale_unused_count,
      latest_summary: stat.latest_summary,
    }))
    .sort(
      (left, right) =>
        right.negative_feedback_count + right.stale_unused_count - (left.negative_feedback_count + left.stale_unused_count) ||
        right.feedback_count - left.feedback_count ||
        left.scope_key.localeCompare(right.scope_key),
    )
    .slice(0, 8);

  return {
    generated_at: referenceNowIso,
    window_days: windowDays,
    summary: {
      created_count: createdCount,
      opened_count: openedCount,
      acted_on_count: actedOnCount,
      completed_count: completedCount,
      stale_unused_count: staleUnusedCount,
      disappeared_count: disappearedCount,
      open_rate: rate(openedCount, createdCount),
      acted_on_rate: rate(actedOnCount, createdCount),
      stale_unused_rate: rate(staleUnusedCount, createdCount),
      notification_open_conversion_rate: rate(convertedOpenCount, firedPackageNotifications.length),
      notification_action_conversion_rate: rate(convertedActionCount, firedPackageNotifications.length),
    },
    surfaces: surfaceReports,
    proposal_outcomes: {
      proposed_count: proposalsCreatedInWindow.length,
      approved_count: proposalsApprovedInWindow.length,
      dismissed_count: proposalsDismissedInWindow.length,
      reopened_count: reopenedCount,
      active_state_counts: activeTuningCounts(service),
    },
    notification_performance: {
      fired_count: notificationEvents.filter((event: ReviewNotificationEvent) => event.decision === "fired").length,
      suppressed_count: notificationEvents.filter((event: ReviewNotificationEvent) => event.decision === "suppressed").length,
      cooldown_hit_count: notificationEvents.filter(
        (event: ReviewNotificationEvent) => event.decision === "suppressed" && event.suppression_reason === "cooldown",
      ).length,
      notification_open_conversion_rate: rate(convertedOpenCount, firedPackageNotifications.length),
      notification_action_conversion_rate: rate(convertedActionCount, firedPackageNotifications.length),
    },
    top_noisy_sources: topNoisySources,
  };
}

export async function buildStoredReviewReport(
  service: any,
  options: { window_days?: number; surface?: ReviewPackageSurface } = {},
): Promise<ReviewReport> {
  return buildStoredReviewReportAt(service, options);
}

function snapshotScopeTypeFor(surface?: ReviewPackageSurface): "global" | "surface" {
  return surface ? "surface" : "global";
}

function snapshotScopeKeyFor(surface?: ReviewPackageSurface): "global" | ReviewPackageSurface {
  return surface ?? "global";
}

async function ensureReviewMetricSnapshot(
  service: any,
  snapshotDate: string,
  surface?: ReviewPackageSurface,
): Promise<ReviewMetricSnapshot> {
  const scopeType = snapshotScopeTypeFor(surface);
  const scopeKey = snapshotScopeKeyFor(surface);
  const existing = service.db.getReviewMetricSnapshot(snapshotDate, scopeType, scopeKey);
  if (existing) {
    return existing;
  }
  const report = await buildStoredReviewReportAt(service, {
    window_days: TREND_WINDOW_DAYS,
    ...(surface ? { surface } : {}),
    reference_now: snapshotEndIso(snapshotDate),
  });
  return service.db.upsertReviewMetricSnapshot({
    snapshot_date: snapshotDate,
    scope_type: scopeType,
    scope_key: scopeKey,
    metrics: metricsFromReviewReport(report),
    generated_at: nowIso(),
  });
}

async function ensureReviewMetricSnapshots(
  service: any,
  options: { days: number; reference_now?: string; include_surface_snapshots?: boolean; surface?: ReviewPackageSurface },
): Promise<void> {
  const referenceNowIso = options.reference_now ?? nowIso();
  const snapshotDates: string[] = [];
  const totalDays = Math.max(1, Math.floor(options.days));
  for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
    snapshotDates.push(snapshotDateFor(subtractDays(referenceNowIso, offset)));
  }
  const surfacesToPersist = options.surface
    ? [options.surface]
    : options.include_surface_snapshots
      ? SURFACES
      : [];
  for (const snapshotDate of snapshotDates) {
    await ensureReviewMetricSnapshot(service, snapshotDate);
    for (const surface of surfacesToPersist) {
      await ensureReviewMetricSnapshot(service, snapshotDate, surface);
    }
  }
}

function toTrendPoint(snapshot: ReviewMetricSnapshot): ReviewTrendPoint {
  return {
    snapshot_date: snapshot.snapshot_date,
    scope_key: snapshot.scope_key,
    ...snapshot.metrics,
  };
}

function latestAndPreviousPoint(points: ReviewTrendPoint[]): {
  latest: ReviewTrendPoint | null;
  previous: ReviewTrendPoint | null;
} {
  if (points.length === 0) {
    return { latest: null, previous: null };
  }
  return {
    latest: points[points.length - 1] ?? null,
    previous: points.length >= 8 ? (points[points.length - 8] ?? null) : null,
  };
}

function trendScore(latest: ReviewMetricSnapshotMetrics, previous: ReviewMetricSnapshotMetrics): number {
  return Math.abs(deltaValue(latest.open_rate, previous.open_rate))
    + Math.abs(deltaValue(latest.acted_on_rate, previous.acted_on_rate))
    + Math.abs(deltaValue(latest.notification_action_conversion_rate, previous.notification_action_conversion_rate))
    + Math.abs(deltaValue(latest.stale_unused_rate, previous.stale_unused_rate));
}

function impactConfidenceFor(preMetrics: ReviewMetricSnapshotMetrics, postMetrics: ReviewMetricSnapshotMetrics): ReviewImpactConfidence {
  const evidenceCount =
    preMetrics.created_count + postMetrics.created_count + preMetrics.fired_notification_count + postMetrics.fired_notification_count;
  if (evidenceCount < 2) {
    return "insufficient_data";
  }
  if (evidenceCount < 6) {
    return "directional";
  }
  return "strong";
}

function impactSummary(
  proposal: ReviewTuningProposal,
  comparison: Omit<ReviewImpactComparison, "summary">,
): string {
  if (comparison.confidence === "insufficient_data") {
    return `Not enough post-approval evidence yet for ${proposal.surface}.`;
  }
  const improved =
    comparison.acted_on_rate_delta > 0 ||
    comparison.open_rate_delta > 0 ||
    comparison.notification_action_conversion_delta > 0 ||
    comparison.stale_unused_rate_delta < 0;
  return improved
    ? `Operator outcomes are moving in the right direction after approving ${proposal.proposal_kind}.`
    : `This tuning approval may need another look because review outcomes have not improved yet.`;
}

function buildWeeklyRecommendations(input: {
  surfaceSummaries: ReviewWeeklySurfaceSummary[];
  topNoisySources: ReviewNoisySourceReport[];
  recentImpact: ReviewImpactComparison[];
}): ReviewWeeklyRecommendation[] {
  const recommendations: ReviewWeeklyRecommendation[] = [];
  for (const surface of input.surfaceSummaries) {
    if (surface.acted_on_rate_delta >= 0.1 && surface.stale_unused_rate_delta <= -0.05) {
      recommendations.push({
        kind: "keep_current_tuning",
        surface: surface.surface,
        message: `${surface.surface} is improving week over week, so current tuning looks worth keeping.`,
      });
    } else if (surface.acted_on_rate_delta <= -0.1 || surface.stale_unused_rate_delta >= 0.1) {
      recommendations.push({
        kind: "revisit_tuning",
        surface: surface.surface,
        message: `${surface.surface} is slipping week over week, so the current review tuning should be revisited.`,
      });
    }
  }
  const noisySource = input.topNoisySources[0];
  if (noisySource && noisySource.negative_feedback_count + noisySource.stale_unused_count >= 2) {
    recommendations.push({
      kind: "investigate_source",
      surface: noisySource.surface,
      scope_key: noisySource.scope_key,
      message: `${noisySource.scope_key} is still dominating review noise and should be investigated manually.`,
    });
  }
  if (input.recentImpact.some((comparison) => comparison.confidence === "insufficient_data")) {
    recommendations.push({
      kind: "insufficient_evidence",
      message: "One or more recent tuning approvals still need more post-approval history before they can be judged confidently.",
    });
  }
  return recommendations.slice(0, 6);
}

function defaultCalibrationTarget(
  scopeType: ReviewCalibrationTargetScopeType,
  scopeKey: ReviewCalibrationTargetScopeKey,
): ReviewCalibrationTarget {
  const createdAt = nowIso();
  return {
    scope_type: scopeType,
    scope_key: scopeKey,
    ...DEFAULT_CALIBRATION_TARGETS,
    created_at: createdAt,
    updated_at: createdAt,
    updated_by_client: CALIBRATION_DEFAULT_CLIENT,
    updated_by_actor: "system",
  };
}

function ensureGlobalCalibrationTarget(service: any): ReviewCalibrationTarget {
  const existing = service.db.getReviewCalibrationTarget("global", "global");
  if (existing) {
    return existing;
  }
  return service.db.upsertReviewCalibrationTarget(defaultCalibrationTarget("global", "global"));
}

function effectiveCalibrationTarget(service: any, surface?: ReviewPackageSurface): ReviewCalibrationTarget {
  const globalTarget = ensureGlobalCalibrationTarget(service);
  if (!surface) {
    return globalTarget;
  }
  const surfaceOverride = service.db.getReviewCalibrationTarget("surface", surface);
  return {
    ...globalTarget,
    ...(surfaceOverride ?? {}),
    scope_type: "surface",
    scope_key: surface,
  };
}

function buildCalibrationTargetsReport(service: any): ReviewCalibrationTargetsReport {
  ensureGlobalCalibrationTarget(service);
  const configuredTargets = service.db.listReviewCalibrationTargets();
  const effectiveTargets = [
    effectiveCalibrationTarget(service),
    ...SURFACES.map((surface) => effectiveCalibrationTarget(service, surface)),
  ];
  return {
    generated_at: nowIso(),
    configured_targets: configuredTargets,
    effective_targets: effectiveTargets,
  };
}

type CalibrationWindowMetrics = {
  report: ReviewReport;
  created_count: number;
  fired_notification_count: number;
  acted_on_rate: number;
  stale_unused_rate: number;
  negative_feedback_rate: number;
  notification_action_conversion_rate: number;
  notifications_per_7d: number;
  open_rate: number;
  top_noisy_sources: ReviewNoisySourceReport[];
};

function filterFeedbackEventsForWindow(
  service: any,
  startIso: string,
  endIso: string,
  surface?: ReviewPackageSurface,
): Array<{ surface: ReviewPackageSurface; reason: ReviewFeedbackReason }> {
  return service.db
    .listReviewFeedbackEvents()
    .filter(
      (event: any) =>
        (!surface || event.surface === surface) &&
        withinWindow(event.created_at, startIso, endIso),
    )
    .map((event: any) => ({
      surface: event.surface,
      reason: event.reason,
    }));
}

function filterNotificationEventsForWindow(
  service: any,
  startIso: string,
  endIso: string,
  surface?: ReviewPackageSurface,
): ReviewNotificationEvent[] {
  const cyclesById = new Map<string, ReviewPackageCycle>(
    service.db.listReviewPackageCycles({ include_open: true }).map((cycle: ReviewPackageCycle) => [cycle.package_cycle_id, cycle]),
  );
  const proposalsById = new Map<string, ReviewTuningProposal>(
    service.db.listReviewTuningProposals({ include_expired: true }).map((proposal: ReviewTuningProposal) => [proposal.proposal_id, proposal]),
  );
  return service.db
    .listReviewNotificationEvents()
    .filter(
      (event: ReviewNotificationEvent) =>
        withinWindow(event.created_at, startIso, endIso) &&
        (!surface || surfaceForNotificationEvent(event, cyclesById, proposalsById) === surface),
    );
}

async function buildCalibrationWindowMetrics(
  service: any,
  options: { reference_now?: string; surface?: ReviewPackageSurface },
): Promise<CalibrationWindowMetrics> {
  const referenceNowIso = options.reference_now ?? nowIso();
  const report = await buildStoredReviewReportAt(service, {
    window_days: CALIBRATION_WINDOW_DAYS,
    ...(options.surface ? { surface: options.surface } : {}),
    reference_now: referenceNowIso,
  });
  const surfaceReport = options.surface ? report.surfaces.find((entry) => entry.surface === options.surface) : undefined;
  const feedbackEvents = filterFeedbackEventsForWindow(
    service,
    windowStartIsoAt(CALIBRATION_WINDOW_DAYS, referenceNowIso),
    referenceNowIso,
    options.surface,
  );
  const notificationEvents = filterNotificationEventsForWindow(
    service,
    windowStartIsoAt(CALIBRATION_NOTIFICATION_WINDOW_DAYS, referenceNowIso),
    referenceNowIso,
    options.surface,
  );
  const firedNotificationCount = notificationEvents.filter((event) => event.decision === "fired").length;
  return {
    report,
    created_count: surfaceReport?.created_count ?? report.summary.created_count,
    fired_notification_count: firedNotificationCount,
    acted_on_rate: surfaceReport?.acted_on_rate ?? report.summary.acted_on_rate,
    stale_unused_rate: surfaceReport?.stale_unused_rate ?? report.summary.stale_unused_rate,
    negative_feedback_rate: surfaceReport?.negative_feedback_rate ?? rate(feedbackEvents.filter((event) => negativeReason(event.reason)).length, feedbackEvents.length),
    notification_action_conversion_rate:
      surfaceReport?.notification_action_conversion_rate ?? report.summary.notification_action_conversion_rate,
    notifications_per_7d: firedNotificationCount,
    open_rate: surfaceReport?.open_rate ?? report.summary.open_rate,
    top_noisy_sources: (options.surface
      ? report.top_noisy_sources.filter((entry) => entry.surface === options.surface)
      : report.top_noisy_sources
    ).slice(0, 5),
  };
}

function calibrationMetricLabel(metric: ReviewCalibrationMetricKey): string {
  if (metric === "acted_on_rate") {
    return "Acted-on rate";
  }
  if (metric === "stale_unused_rate") {
    return "Stale-unused rate";
  }
  if (metric === "negative_feedback_rate") {
    return "Negative feedback rate";
  }
  if (metric === "notification_action_conversion_rate") {
    return "Notification action conversion";
  }
  return "Notifications per 7d";
}

function calibrationSeverityValue(status: ReviewCalibrationStatus): number {
  if (status === "off_track") {
    return 2;
  }
  if (status === "watch") {
    return 1;
  }
  return 0;
}

function calibrationMetricPrecedence(metric: ReviewCalibrationMetricKey): number {
  const index = CALIBRATION_METRIC_PRECEDENCE.indexOf(metric);
  return index === -1 ? CALIBRATION_METRIC_PRECEDENCE.length : index;
}

function classifyMinimum(actual: number, target: number): ReviewCalibrationStatus {
  if (actual >= target) {
    return "on_track";
  }
  if (actual >= Math.max(0, target * (1 - CALIBRATION_WATCH_BUFFER))) {
    return "watch";
  }
  return "off_track";
}

function classifyMaximum(actual: number, target: number): ReviewCalibrationStatus {
  if (actual <= target) {
    return "on_track";
  }
  if (actual <= target * (1 + CALIBRATION_WATCH_BUFFER)) {
    return "watch";
  }
  return "off_track";
}

function classifyMaximumCount(actual: number, target: number): ReviewCalibrationStatus {
  if (target === 0) {
    return actual > 0 ? "off_track" : "on_track";
  }
  if (actual <= target) {
    return "on_track";
  }
  if (actual <= target * (1 + CALIBRATION_WATCH_BUFFER)) {
    return "watch";
  }
  return "off_track";
}

function calibrationMetricGap(metric: ReviewCalibrationMetricStatus): number {
  if (metric.metric === "acted_on_rate" || metric.metric === "notification_action_conversion_rate") {
    return Math.max(0, metric.target_value - metric.actual_value) / Math.max(metric.target_value, 0.05);
  }
  if (metric.metric === "notifications_per_7d" && metric.target_value === 0) {
    return metric.actual_value > 0 ? metric.actual_value : 0;
  }
  return Math.max(0, metric.actual_value - metric.target_value) / Math.max(metric.target_value, metric.metric === "notifications_per_7d" ? 1 : 0.05);
}

function calibrationMetricStatus(
  metric: ReviewCalibrationMetricKey,
  actualValue: number,
  previousValue: number,
  targetValue: number,
): ReviewCalibrationMetricStatus {
  const status =
    metric === "acted_on_rate" || metric === "notification_action_conversion_rate"
      ? classifyMinimum(actualValue, targetValue)
      : metric === "notifications_per_7d"
        ? classifyMaximumCount(actualValue, targetValue)
        : classifyMaximum(actualValue, targetValue);
  const targetDescription =
    metric === "acted_on_rate" || metric === "notification_action_conversion_rate"
      ? `minimum ${(targetValue * 100).toFixed(1)}%`
      : metric === "notifications_per_7d"
        ? `maximum ${targetValue.toFixed(0)}`
        : `maximum ${(targetValue * 100).toFixed(1)}%`;
  const actualDescription =
    metric === "notifications_per_7d" ? `${actualValue.toFixed(0)}` : `${(actualValue * 100).toFixed(1)}%`;
  const previousDescription =
    metric === "notifications_per_7d" ? `${previousValue.toFixed(0)}` : `${(previousValue * 100).toFixed(1)}%`;
  return {
    metric,
    label: calibrationMetricLabel(metric),
    status,
    actual_value: actualValue,
    previous_value: previousValue,
    target_value: targetValue,
    summary: `${calibrationMetricLabel(metric)} is ${actualDescription} now versus ${previousDescription} previously, with a ${targetDescription}.`,
  };
}

function worstCalibrationMetric(metrics: ReviewCalibrationMetricStatus[]): ReviewCalibrationMetricStatus {
  return [...metrics].sort(
    (left, right) =>
      calibrationSeverityValue(right.status) - calibrationSeverityValue(left.status) ||
      calibrationMetricPrecedence(left.metric) - calibrationMetricPrecedence(right.metric) ||
      calibrationMetricGap(right) - calibrationMetricGap(left) ||
      left.metric.localeCompare(right.metric),
  )[0]!;
}

function overallCalibrationStatus(metrics: ReviewCalibrationMetricStatus[]): ReviewCalibrationStatus {
  if (metrics.some((metric) => metric.status === "off_track")) {
    return "off_track";
  }
  if (metrics.some((metric) => metric.status === "watch")) {
    return "watch";
  }
  return "on_track";
}

function positiveImpact(comparison: ReviewImpactComparison): boolean {
  return (
    comparison.confidence !== "insufficient_data" &&
    (comparison.acted_on_rate_delta > 0 ||
      comparison.open_rate_delta > 0 ||
      comparison.notification_action_conversion_delta > 0 ||
      comparison.stale_unused_rate_delta < 0 ||
      comparison.notification_fire_rate_delta < 0 ||
      comparison.noisy_source_delta < 0)
  );
}

function improvingDirection(metric: ReviewCalibrationMetricStatus): boolean {
  if (metric.metric === "acted_on_rate" || metric.metric === "notification_action_conversion_rate") {
    return metric.actual_value >= metric.previous_value;
  }
  return metric.actual_value <= metric.previous_value;
}

function dominantNoisySource(summary: ReviewCalibrationSurfaceSummary): ReviewNoisySourceReport | null {
  const topSource = summary.top_noisy_sources[0];
  if (!topSource) {
    return null;
  }
  const totalNegative = summary.top_noisy_sources.reduce((sum, source) => sum + source.negative_feedback_count, 0);
  const totalStaleUnused = summary.top_noisy_sources.reduce((sum, source) => sum + source.stale_unused_count, 0);
  const negativeShare = totalNegative > 0 ? topSource.negative_feedback_count / totalNegative : 0;
  const staleShare = totalStaleUnused > 0 ? topSource.stale_unused_count / totalStaleUnused : 0;
  return negativeShare >= 0.5 || staleShare >= 0.5 ? topSource : null;
}

function openRateLooksHealthy(summary: ReviewCalibrationSurfaceSummary): boolean {
  return summary.current.open_rate >= summary.effective_target.min_acted_on_rate;
}

function buildCalibrationRecommendations(input: {
  summary: ReviewCalibrationSurfaceSummary;
  current: CalibrationWindowMetrics;
}): ReviewCalibrationRecommendation[] {
  const recommendations: ReviewCalibrationRecommendation[] = [];
  const metricsByKey = new Map(input.summary.metrics.map((metric) => [metric.metric, metric]));
  const positiveImpacts = input.summary.recent_tuning_impact.filter(
    (comparison) => comparison.confidence !== "insufficient_data" && positiveImpact(comparison),
  );
  if (input.current.created_count < 3 && input.current.fired_notification_count < 2) {
    recommendations.push({
      kind: "insufficient_evidence",
      surface: input.summary.surface,
      scope_key: String(input.summary.scope_key),
      message: `${input.summary.label} does not have enough recent review volume to support a confident calibration decision yet.`,
    });
    return recommendations;
  }
  if (
    input.current.notifications_per_7d > input.summary.effective_target.max_notifications_per_7d &&
    input.current.notification_action_conversion_rate < input.summary.effective_target.min_notification_action_conversion_rate
  ) {
    recommendations.push({
      kind: "tighten_notification_budget",
      surface: input.summary.surface,
      scope_key: String(input.summary.scope_key),
      message: `${input.summary.label} is firing too many notifications for the action conversion it is returning, so the notification budget should be tightened manually.`,
    });
  }
  if (
    metricsByKey.get("stale_unused_rate")?.status === "off_track" &&
    metricsByKey.get("negative_feedback_rate")?.status === "off_track"
  ) {
    recommendations.push({
      kind: "review_package_composition",
      surface: input.summary.surface,
      scope_key: String(input.summary.scope_key),
      message: `${input.summary.label} is packaging work that is not landing well, so package composition should be reviewed manually.`,
    });
  }
  const dominantSource = dominantNoisySource(input.summary);
  if (input.summary.status === "off_track" && dominantSource) {
    recommendations.push({
      kind: "inspect_source_suppression",
      surface: input.summary.surface,
      scope_key: dominantSource.scope_key,
      message: `${dominantSource.scope_key} is dominating review noise for ${input.summary.label}, so source suppression should be inspected manually.`,
    });
  }
  if (
    metricsByKey.get("acted_on_rate")?.status === "off_track" &&
    openRateLooksHealthy(input.summary)
  ) {
    recommendations.push({
      kind: "revisit_surface_priority",
      surface: input.summary.surface,
      scope_key: String(input.summary.scope_key),
      message: `${input.summary.label} is still being opened but not acted on enough, so surface ordering or priority should be revisited before visibility rules are changed.`,
    });
  }
  if (
    positiveImpacts.some((comparison) => comparison.confidence === "directional" || comparison.confidence === "strong") &&
    input.summary.metrics.every(
      (metric) => metric.status !== "off_track" && (metric.status === "on_track" || improvingDirection(metric)),
    )
  ) {
    recommendations.push({
      kind: "keep_current_tuning",
      surface: input.summary.surface,
      scope_key: String(input.summary.scope_key),
      message: `${input.summary.label} is within target and recent tuning impact is positive, so the current tuning looks worth keeping.`,
    });
  }
  return recommendations.slice(0, 3);
}

function calibrationReason(summary: ReviewCalibrationSurfaceSummary): string {
  if (summary.status === "on_track") {
    return `${summary.label} is inside all current calibration targets.`;
  }
  const worst = summary.worst_metric;
  return `${summary.label} is ${summary.status.replaceAll("_", " ")} because ${worst.label.toLowerCase()} is outside its target.`;
}

function summaryForCalibrationScope(
  service: any,
  input: {
    label: string;
    scope_key: ReviewCalibrationTargetScopeKey;
    surface?: ReviewPackageSurface;
    current: CalibrationWindowMetrics;
    previous: CalibrationWindowMetrics;
    recent_tuning_impact: ReviewImpactComparison[];
  },
): ReviewCalibrationSurfaceSummary {
  const target = effectiveCalibrationTarget(service, input.surface);
  const metrics: ReviewCalibrationMetricStatus[] = [
    calibrationMetricStatus("acted_on_rate", input.current.acted_on_rate, input.previous.acted_on_rate, target.min_acted_on_rate),
    calibrationMetricStatus(
      "stale_unused_rate",
      input.current.stale_unused_rate,
      input.previous.stale_unused_rate,
      target.max_stale_unused_rate,
    ),
    calibrationMetricStatus(
      "negative_feedback_rate",
      input.current.negative_feedback_rate,
      input.previous.negative_feedback_rate,
      target.max_negative_feedback_rate,
    ),
    calibrationMetricStatus(
      "notification_action_conversion_rate",
      input.current.notification_action_conversion_rate,
      input.previous.notification_action_conversion_rate,
      target.min_notification_action_conversion_rate,
    ),
    calibrationMetricStatus(
      "notifications_per_7d",
      input.current.notifications_per_7d,
      input.previous.notifications_per_7d,
      target.max_notifications_per_7d,
    ),
  ];
  const summary: ReviewCalibrationSurfaceSummary = {
    scope_type: input.surface ? "surface" : "global",
    scope_key: input.scope_key,
    surface: input.surface,
    label: input.label,
    status: overallCalibrationStatus(metrics),
    overall_status: overallCalibrationStatus(metrics),
    effective_target: target,
    target,
    current: {
      created_count: input.current.created_count,
      fired_notification_count: input.current.fired_notification_count,
      open_rate: input.current.open_rate,
      acted_on_rate: input.current.acted_on_rate,
      stale_unused_rate: input.current.stale_unused_rate,
      negative_feedback_rate: input.current.negative_feedback_rate,
      notification_action_conversion_rate: input.current.notification_action_conversion_rate,
      notifications_per_7d: input.current.notifications_per_7d,
    },
    previous: {
      created_count: input.previous.created_count,
      fired_notification_count: input.previous.fired_notification_count,
      open_rate: input.previous.open_rate,
      acted_on_rate: input.previous.acted_on_rate,
      stale_unused_rate: input.previous.stale_unused_rate,
      negative_feedback_rate: input.previous.negative_feedback_rate,
      notification_action_conversion_rate: input.previous.notification_action_conversion_rate,
      notifications_per_7d: input.previous.notifications_per_7d,
    },
    open_rate_14d: input.current.open_rate,
    previous_open_rate_14d: input.previous.open_rate,
    metrics,
    worst_metric: worstCalibrationMetric(metrics),
    reason: "",
    primary_reason: "",
    recent_tuning_impact: input.recent_tuning_impact.slice(0, 3),
    top_noisy_sources: input.current.top_noisy_sources.slice(0, 3),
    recommendations: [],
  };
  summary.reason = calibrationReason(summary);
  summary.primary_reason = summary.reason;
  summary.recommendations = buildCalibrationRecommendations({
    summary,
    current: input.current,
  });
  return summary;
}

function topCalibrationSurface(summaries: ReviewCalibrationSurfaceSummary[]): ReviewPackageSurface | null {
  return (
    [...summaries]
      .filter((summary) => Boolean(summary.surface) && summary.status === "off_track")
      .sort(
        (left, right) =>
          calibrationMetricPrecedence(left.worst_metric.metric) - calibrationMetricPrecedence(right.worst_metric.metric) ||
          calibrationMetricGap(right.worst_metric) - calibrationMetricGap(left.worst_metric) ||
          (left.surface ?? "").localeCompare(right.surface ?? ""),
      )[0]?.surface ?? null
  );
}

async function buildScopedReviewMetrics(
  service: any,
  options: {
    window_days?: number;
    reference_now?: string;
    surface: ReviewPackageSurface;
    scope_key?: string;
  },
): Promise<ReviewMetricSnapshotMetrics> {
  if (!options.scope_key) {
    const report = await buildStoredReviewReportAt(service, options);
    return metricsFromReviewReport(report);
  }

  const windowDays = clampWindowDays(options.window_days);
  const referenceNowIso = options.reference_now ?? nowIso();
  const startIso = windowStartIsoAt(windowDays, referenceNowIso);
  const cycles: ReviewPackageCycle[] = service.db
    .listReviewPackageCycles({ include_open: true, surface: options.surface })
    .filter(
      (cycle: ReviewPackageCycle) =>
        cycle.source_keys.includes(options.scope_key!) && withinWindow(cycle.started_at, startIso, referenceNowIso),
    );
  const cyclesById = new Map<string, ReviewPackageCycle>(
    service.db.listReviewPackageCycles({ include_open: true }).map((cycle: ReviewPackageCycle) => [cycle.package_cycle_id, cycle]),
  );
  const cyclesByPackageId = new Map<string, ReviewPackageCycle[]>();
  for (const cycle of service.db.listReviewPackageCycles({ include_open: true })) {
    const existing = cyclesByPackageId.get(cycle.package_id) ?? [];
    existing.push(cycle);
    existing.sort((left, right) => Date.parse(left.started_at) - Date.parse(right.started_at));
    cyclesByPackageId.set(cycle.package_id, existing);
  }
  const allProposals: ReviewTuningProposal[] = service.db.listReviewTuningProposals({ include_expired: true });
  const proposalsById = new Map<string, ReviewTuningProposal>(
    allProposals.map((proposal: ReviewTuningProposal) => [proposal.proposal_id, proposal]),
  );
  const notificationEvents: ReviewNotificationEvent[] = service.db
    .listReviewNotificationEvents()
    .filter((event: ReviewNotificationEvent) => {
      if (!withinWindow(event.created_at, startIso, referenceNowIso)) {
        return false;
      }
      const surface = surfaceForNotificationEvent(event, cyclesById, proposalsById);
      if (surface !== options.surface) {
        return false;
      }
      if (event.package_cycle_id) {
        return cyclesById.get(event.package_cycle_id)?.source_keys.includes(options.scope_key!) ?? false;
      }
      if (event.proposal_id) {
        return proposalsById.get(event.proposal_id)?.scope_key === options.scope_key;
      }
      return false;
    });
  const feedbackEvents = service.db.listReviewFeedbackEvents().filter((event: any) => {
    if (event.surface !== options.surface || !withinWindow(event.created_at, startIso, referenceNowIso)) {
      return false;
    }
    return sourceKeysForFeedbackEvent(event, cyclesById, cyclesByPackageId).includes(options.scope_key!);
  });
  const firedPackageNotifications = notificationEvents.filter(
    (event: ReviewNotificationEvent) => event.decision === "fired" && Boolean(event.package_cycle_id),
  );
  const convertedOpenCount = firedPackageNotifications.filter((event: ReviewNotificationEvent) => {
    const cycle = event.package_cycle_id ? cyclesById.get(event.package_cycle_id) : null;
    return Boolean(
      cycle?.opened_at &&
        Date.parse(cycle.opened_at) >= Date.parse(event.created_at) &&
        Date.parse(cycle.opened_at) <= Date.parse(event.created_at) + NOTIFICATION_ATTRIBUTION_HOURS * 60 * 60 * 1000,
    );
  }).length;
  const convertedActionCount = firedPackageNotifications.filter((event: ReviewNotificationEvent) => {
    const cycle = event.package_cycle_id ? cyclesById.get(event.package_cycle_id) : null;
    return Boolean(
      cycle?.acted_on_at &&
        Date.parse(cycle.acted_on_at) >= Date.parse(event.created_at) &&
        Date.parse(cycle.acted_on_at) <= Date.parse(event.created_at) + NOTIFICATION_ATTRIBUTION_HOURS * 60 * 60 * 1000,
    );
  }).length;
  const openProposalCount = allProposals.filter(
    (proposal: ReviewTuningProposal) =>
      proposal.surface === options.surface &&
      proposal.scope_key === options.scope_key &&
      proposal.status === "proposed" &&
      withinWindow(proposal.created_at, startIso, referenceNowIso),
  ).length;
  const activeTuningCount = activeTuningState(service).filter(
    (state) => state.surface === options.surface && state.scope_key === options.scope_key,
  ).length;
  const negativeFeedbackCount = feedbackEvents.filter((event: any) => negativeReason(event.reason)).length;
  const staleUnusedCount = cycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.stale_unused_at)).length;
  return {
    created_count: cycles.length,
    opened_count: cycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.opened_at)).length,
    acted_on_count: cycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.acted_on_at)).length,
    completed_count: cycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.completed_at)).length,
    stale_unused_count: staleUnusedCount,
    open_rate: rate(cycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.opened_at)).length, cycles.length),
    acted_on_rate: rate(cycles.filter((cycle: ReviewPackageCycle) => Boolean(cycle.acted_on_at)).length, cycles.length),
    stale_unused_rate: rate(staleUnusedCount, cycles.length),
    fired_notification_count: notificationEvents.filter((event: ReviewNotificationEvent) => event.decision === "fired").length,
    suppressed_notification_count: notificationEvents.filter((event: ReviewNotificationEvent) => event.decision === "suppressed").length,
    cooldown_hit_count: notificationEvents.filter(
      (event: ReviewNotificationEvent) => event.decision === "suppressed" && event.suppression_reason === "cooldown",
    ).length,
    notification_open_conversion_rate: rate(convertedOpenCount, firedPackageNotifications.length),
    notification_action_conversion_rate: rate(convertedActionCount, firedPackageNotifications.length),
    noisy_source_count: negativeFeedbackCount > 0 || staleUnusedCount > 0 ? 1 : 0,
    open_tuning_proposal_count: openProposalCount,
    active_tuning_state_count: activeTuningCount,
  };
}

export async function buildStoredReviewTrends(
  service: any,
  options: { days?: number; surface?: ReviewPackageSurface } = {},
): Promise<ReviewTrendsReport> {
  const days = clampWindowDays(options.days);
  await ensureReviewMetricSnapshots(service, {
    days,
    include_surface_snapshots: !options.surface,
    ...(options.surface ? { surface: options.surface } : {}),
  });
  const globalSnapshots = service.db.listReviewMetricSnapshots({
    scope_type: snapshotScopeTypeFor(options.surface),
    scope_key: snapshotScopeKeyFor(options.surface),
    snapshot_date_from: snapshotDateFor(subtractDays(nowIso(), days - 1)),
    snapshot_date_to: snapshotDateFor(nowIso()),
  });
  const points = globalSnapshots.map(toTrendPoint);
  const { latest, previous } = latestAndPreviousPoint(points);
  const surfaceSnapshots = options.surface
    ? []
    : SURFACES.map((surface) => {
        const snapshots = service.db.listReviewMetricSnapshots({
          scope_type: "surface",
          scope_key: surface,
          snapshot_date_from: snapshotDateFor(subtractDays(nowIso(), days - 1)),
          snapshot_date_to: snapshotDateFor(nowIso()),
        });
        const surfacePoints = snapshots.map(toTrendPoint);
        const pair = latestAndPreviousPoint(surfacePoints);
        return {
          surface,
          latest: pair.latest?.snapshot_date ? pair.latest : null,
          previous: pair.previous?.snapshot_date ? pair.previous : null,
        };
      });
  const topReviewTrendSurface = options.surface
    ? options.surface
    : surfaceSnapshots
        .filter((entry) => entry.latest && entry.previous)
        .sort(
          (left, right) =>
            trendScore(right.latest!, right.previous!) - trendScore(left.latest!, left.previous!) ||
            left.surface.localeCompare(right.surface),
        )[0]?.surface ?? null;
  return {
    generated_at: nowIso(),
    days,
    surface: options.surface,
    points,
    summary: {
      latest_snapshot_date: latest?.snapshot_date ?? null,
      average_open_rate: aggregateMetrics(points).open_rate,
      average_acted_on_rate: aggregateMetrics(points).acted_on_rate,
      average_stale_unused_rate: aggregateMetrics(points).stale_unused_rate,
      average_notification_action_conversion_rate: aggregateMetrics(points).notification_action_conversion_rate,
      week_over_week_open_rate_delta: latest && previous ? deltaValue(latest.open_rate, previous.open_rate) : 0,
      week_over_week_action_rate_delta: latest && previous ? deltaValue(latest.acted_on_rate, previous.acted_on_rate) : 0,
      week_over_week_stale_unused_rate_delta: latest && previous ? deltaValue(latest.stale_unused_rate, previous.stale_unused_rate) : 0,
      week_over_week_notification_action_conversion_delta:
        latest && previous
          ? deltaValue(latest.notification_action_conversion_rate, previous.notification_action_conversion_rate)
          : 0,
      top_review_trend_surface: topReviewTrendSurface,
    },
  };
}

export async function buildStoredReviewImpact(
  service: any,
  options: { days?: number; surface?: ReviewPackageSurface } = {},
): Promise<ReviewImpactReport> {
  const days = clampWindowDays(options.days);
  const approvedSince = subtractDays(nowIso(), days);
  const approvedProposals = service.db
    .listReviewTuningProposals({ include_expired: true })
    .filter(
      (proposal: ReviewTuningProposal) =>
        proposal.status === "approved" &&
        Boolean(proposal.approved_at) &&
        Date.parse(proposal.approved_at!) >= Date.parse(approvedSince) &&
        (!options.surface || proposal.surface === options.surface),
    )
    .sort((left: ReviewTuningProposal, right: ReviewTuningProposal) => Date.parse(right.approved_at!) - Date.parse(left.approved_at!));

  const comparisons: ReviewImpactComparison[] = [];
  for (const proposal of approvedProposals) {
    const approvedAt = proposal.approved_at!;
    const enoughPostWindow = Date.parse(addDays(approvedAt, TREND_WINDOW_DAYS)) <= Date.now();
    const scopedKey = proposal.proposal_kind === "source_suppression" ? proposal.scope_key : undefined;
    const preMetrics = await buildScopedReviewMetrics(service, {
      window_days: TREND_WINDOW_DAYS,
      reference_now: subtractDays(approvedAt, 1),
      surface: proposal.surface,
      ...(scopedKey ? { scope_key: scopedKey } : {}),
    });
    const postMetrics = enoughPostWindow
      ? await buildScopedReviewMetrics(service, {
          window_days: TREND_WINDOW_DAYS,
          reference_now: addDays(approvedAt, TREND_WINDOW_DAYS),
          surface: proposal.surface,
          ...(scopedKey ? { scope_key: scopedKey } : {}),
        })
      : emptyMetrics();
    const confidence = enoughPostWindow ? impactConfidenceFor(preMetrics, postMetrics) : "insufficient_data";
    const comparisonBase = {
      proposal_id: proposal.proposal_id,
      proposal_kind: proposal.proposal_kind,
      surface: proposal.surface,
      scope_key: proposal.scope_key,
      approved_at: approvedAt,
      comparison_window_days: TREND_WINDOW_DAYS,
      confidence,
      pre_metrics: preMetrics,
      post_metrics: postMetrics,
      open_rate_delta: enoughPostWindow ? deltaValue(postMetrics.open_rate, preMetrics.open_rate) : 0,
      acted_on_rate_delta: enoughPostWindow ? deltaValue(postMetrics.acted_on_rate, preMetrics.acted_on_rate) : 0,
      stale_unused_rate_delta: enoughPostWindow ? deltaValue(postMetrics.stale_unused_rate, preMetrics.stale_unused_rate) : 0,
      notification_fire_rate_delta: enoughPostWindow
        ? deltaValue(notificationFireRate(postMetrics), notificationFireRate(preMetrics))
        : 0,
      notification_action_conversion_delta: enoughPostWindow
        ? deltaValue(
            postMetrics.notification_action_conversion_rate,
            preMetrics.notification_action_conversion_rate,
          )
        : 0,
      noisy_source_delta: enoughPostWindow ? postMetrics.noisy_source_count - preMetrics.noisy_source_count : 0,
    } satisfies Omit<ReviewImpactComparison, "summary">;
    comparisons.push({
      ...comparisonBase,
      summary: impactSummary(proposal, comparisonBase),
    });
  }

  return {
    generated_at: nowIso(),
    days,
    surface: options.surface,
    comparisons,
  };
}

export async function buildStoredReviewWeekly(
  service: any,
  options: { days?: number } = {},
): Promise<ReviewWeeklyReport> {
  const days = clampWindowDays(options.days);
  const trendReport = await buildStoredReviewTrends(service, { days: Math.max(days, 14) as 14 | 30 });
  const points = trendReport.points;
  const { latest, previous } = latestAndPreviousPoint(points);
  const currentPeriod = latest ? aggregateMetrics([latest]) : emptyMetrics();
  const previousPeriod = previous ? aggregateMetrics([previous]) : emptyMetrics();
  const reportWindow = await buildStoredReviewReportAt(service, { window_days: days });
  const impactReport = await buildStoredReviewImpact(service, { days });
  const surfaceSummaries: ReviewWeeklySurfaceSummary[] = [];
  for (const surface of SURFACES) {
    const surfaceTrends = await buildStoredReviewTrends(service, { days: Math.max(days, 14) as 14 | 30, surface });
    const pair = latestAndPreviousPoint(surfaceTrends.points);
    const current = pair.latest ? aggregateMetrics([pair.latest]) : emptyMetrics();
    const previousSurface = pair.previous ? aggregateMetrics([pair.previous]) : emptyMetrics();
    surfaceSummaries.push({
      surface,
      current,
      previous: previousSurface,
      open_rate_delta: pair.latest && pair.previous ? deltaValue(pair.latest.open_rate, pair.previous.open_rate) : 0,
      acted_on_rate_delta:
        pair.latest && pair.previous ? deltaValue(pair.latest.acted_on_rate, pair.previous.acted_on_rate) : 0,
      stale_unused_rate_delta:
        pair.latest && pair.previous ? deltaValue(pair.latest.stale_unused_rate, pair.previous.stale_unused_rate) : 0,
      notification_action_conversion_delta:
        pair.latest && pair.previous
          ? deltaValue(
              pair.latest.notification_action_conversion_rate,
              pair.previous.notification_action_conversion_rate,
            )
          : 0,
    });
  }

  const recentImpact = impactReport.comparisons.slice(0, 5);
  return {
    generated_at: nowIso(),
    days,
    current_period: currentPeriod,
    previous_period: previousPeriod,
    week_over_week_open_rate_delta:
      latest && previous ? deltaValue(latest.open_rate, previous.open_rate) : 0,
    week_over_week_action_rate_delta:
      latest && previous ? deltaValue(latest.acted_on_rate, previous.acted_on_rate) : 0,
    week_over_week_notification_action_conversion_delta:
      latest && previous
        ? deltaValue(latest.notification_action_conversion_rate, previous.notification_action_conversion_rate)
        : 0,
    top_review_trend_surface: trendReport.summary.top_review_trend_surface,
    surfaces: surfaceSummaries,
    top_noisy_sources: reportWindow.top_noisy_sources.slice(0, 5),
    recent_tuning_impact: recentImpact,
    recommendations: buildWeeklyRecommendations({
      surfaceSummaries,
      topNoisySources: reportWindow.top_noisy_sources.slice(0, 5),
      recentImpact,
    }),
  };
}

export async function buildStoredReviewCalibration(
  service: any,
  options: { surface?: ReviewPackageSurface } = {},
): Promise<ReviewCalibrationReport> {
  const impactReport = await buildStoredReviewImpact(service, { days: 30 });
  const currentGlobal = await buildCalibrationWindowMetrics(service, {});
  const previousGlobal = await buildCalibrationWindowMetrics(service, {
    reference_now: subtractDays(nowIso(), CALIBRATION_WINDOW_DAYS),
  });
  const globalSummary = summaryForCalibrationScope(service, {
    label: "Global review loop",
    scope_key: "global",
    current: currentGlobal,
    previous: previousGlobal,
    recent_tuning_impact: impactReport.comparisons.slice(0, 5),
  });

  const surfaceSummaries: ReviewCalibrationSurfaceSummary[] = [];
  const surfaces = options.surface ? [options.surface] : SURFACES;
  for (const surface of surfaces) {
    const current = await buildCalibrationWindowMetrics(service, { surface });
    const previous = await buildCalibrationWindowMetrics(service, {
      surface,
      reference_now: subtractDays(nowIso(), CALIBRATION_WINDOW_DAYS),
    });
    surfaceSummaries.push(
      summaryForCalibrationScope(service, {
        label: surface,
        scope_key: surface,
        surface,
        current,
        previous,
        recent_tuning_impact: impactReport.comparisons.filter((comparison) => comparison.surface === surface),
      }),
    );
  }

  const surfacesOffTrackCount = surfaceSummaries.filter((summary) => summary.status === "off_track").length;
  const notificationBudgetPressureCount = surfaceSummaries.filter(
    (summary) => summary.metrics.find((metric) => metric.metric === "notifications_per_7d")?.status !== "on_track",
  ).length;

  return {
    generated_at: nowIso(),
    window_days: CALIBRATION_WINDOW_DAYS,
    calibration_window_days: CALIBRATION_WINDOW_DAYS,
    notification_budget_window_days: CALIBRATION_NOTIFICATION_WINDOW_DAYS,
    notification_window_days: CALIBRATION_NOTIFICATION_WINDOW_DAYS,
    global: globalSummary,
    surfaces: surfaceSummaries,
    surfaces_off_track_count: surfacesOffTrackCount,
    notification_budget_pressure_count: notificationBudgetPressureCount,
    recommendations: [
      ...globalSummary.recommendations,
      ...surfaceSummaries.flatMap((summary) => summary.recommendations),
    ].slice(0, 8),
  };
}

export function getStoredReviewCalibrationTargets(service: any): ReviewCalibrationTargetsReport {
  return buildCalibrationTargetsReport(service);
}

export async function buildReviewCalibration(
  service: any,
  options: { surface?: ReviewPackageSurface } = {},
): Promise<ReviewCalibrationReport> {
  await service.ensureReviewReadModel({ trigger: "review_calibration_read" });
  return buildStoredReviewCalibration(service, options);
}

export function getReviewCalibrationTargets(service: any): ReviewCalibrationTargetsReport {
  return buildCalibrationTargetsReport(service);
}

function assertCalibrationScopeKey(scopeKey: string): ReviewCalibrationTargetScopeKey {
  if (scopeKey === "global" || SURFACES.includes(scopeKey as ReviewPackageSurface)) {
    return scopeKey as ReviewCalibrationTargetScopeKey;
  }
  throw new Error("scope must be one of global, inbox, meetings, planning, or outbound.");
}

function assertRateValue(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be a number between 0 and 1.`);
  }
  return parsed;
}

function assertNotificationBudget(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("max_notifications_per_7d must be a non-negative number.");
  }
  return Math.floor(parsed);
}

export function updateReviewCalibrationTarget(
  service: any,
  identity: ClientIdentity,
  scopeKeyRaw: string,
  updates: {
    min_acted_on_rate?: number;
    max_stale_unused_rate?: number;
    max_negative_feedback_rate?: number;
    min_notification_action_conversion_rate?: number;
    max_notifications_per_7d?: number;
  },
): ReviewCalibrationTarget {
  service.assertOperatorOnly(identity, "update review calibration targets");
  const scopeKey = assertCalibrationScopeKey(scopeKeyRaw);
  const scopeType: ReviewCalibrationTargetScopeType = scopeKey === "global" ? "global" : "surface";
  if (Object.keys(updates).length === 0) {
    throw new Error("Provide at least one calibration target value to update.");
  }
  const baseTarget =
    service.db.getReviewCalibrationTarget(scopeType, scopeKey) ??
    effectiveCalibrationTarget(service, scopeKey === "global" ? undefined : scopeKey);
  const nextTarget = {
    ...baseTarget,
    ...(updates.min_acted_on_rate !== undefined
      ? { min_acted_on_rate: assertRateValue(updates.min_acted_on_rate, "min_acted_on_rate") }
      : {}),
    ...(updates.max_stale_unused_rate !== undefined
      ? { max_stale_unused_rate: assertRateValue(updates.max_stale_unused_rate, "max_stale_unused_rate") }
      : {}),
    ...(updates.max_negative_feedback_rate !== undefined
      ? { max_negative_feedback_rate: assertRateValue(updates.max_negative_feedback_rate, "max_negative_feedback_rate") }
      : {}),
    ...(updates.min_notification_action_conversion_rate !== undefined
      ? {
          min_notification_action_conversion_rate: assertRateValue(
            updates.min_notification_action_conversion_rate,
            "min_notification_action_conversion_rate",
          ),
        }
      : {}),
    ...(updates.max_notifications_per_7d !== undefined
      ? { max_notifications_per_7d: assertNotificationBudget(updates.max_notifications_per_7d) }
      : {}),
  };
  return service.db.upsertReviewCalibrationTarget({
    scope_type: scopeType,
    scope_key: scopeKey,
    min_acted_on_rate: nextTarget.min_acted_on_rate,
    max_stale_unused_rate: nextTarget.max_stale_unused_rate,
    max_negative_feedback_rate: nextTarget.max_negative_feedback_rate,
    min_notification_action_conversion_rate: nextTarget.min_notification_action_conversion_rate,
    max_notifications_per_7d: nextTarget.max_notifications_per_7d,
    created_at: baseTarget.created_at,
    updated_by_client: identity.client_id,
    updated_by_actor: identity.requested_by ?? null,
  });
}

export function resetReviewCalibrationTarget(
  service: any,
  identity: ClientIdentity,
  scopeKeyRaw: string,
): ReviewCalibrationTargetsReport {
  service.assertOperatorOnly(identity, "reset review calibration targets");
  const scopeKey = assertCalibrationScopeKey(scopeKeyRaw);
  if (scopeKey === "global") {
    throw new Error("Only per-surface calibration targets can be reset.");
  }
  service.db.deleteReviewCalibrationTarget("surface", scopeKey);
  return buildCalibrationTargetsReport(service);
}

export async function buildReviewReport(
  service: any,
  options: { window_days?: number; surface?: ReviewPackageSurface } = {},
): Promise<ReviewReport> {
  await service.ensureReviewReadModel({ trigger: "review_report_read" });
  return buildStoredReviewReport(service, options);
}

export async function buildReviewTrends(
  service: any,
  options: { days?: number; surface?: ReviewPackageSurface } = {},
): Promise<ReviewTrendsReport> {
  await service.ensureReviewReadModel({ trigger: "review_trends_read" });
  return buildStoredReviewTrends(service, options);
}

export async function buildReviewImpact(
  service: any,
  options: { days?: number; surface?: ReviewPackageSurface } = {},
): Promise<ReviewImpactReport> {
  await service.ensureReviewReadModel({ trigger: "review_impact_read" });
  return buildStoredReviewImpact(service, options);
}

export async function buildReviewWeekly(
  service: any,
  options: { days?: number } = {},
): Promise<ReviewWeeklyReport> {
  await service.ensureReviewReadModel({ trigger: "review_weekly_read" });
  return buildStoredReviewWeekly(service, options);
}

export async function recordReviewNotificationEvents(
  service: any,
  identity: ClientIdentity,
  events: Array<{
    kind: ReviewNotificationKind;
    decision: ReviewNotificationDecision;
    source: "desktop";
    surface?: ReviewPackageSurface;
    package_id?: string;
    package_cycle_id?: string;
    proposal_id?: string;
    suppression_reason?: "cooldown" | "permission_denied";
    current_count: number;
    previous_count: number;
    cooldown_minutes: number;
  }>,
): Promise<void> {
  service.assertOperatorOnly(identity, "record review notification events");
  for (const event of events) {
    service.db.createReviewNotificationEvent({
      ...event,
      client_id: identity.client_id,
      actor: identity.requested_by ?? null,
    });
  }
}

export function getReviewNotificationSnapshot(service: any): ReviewNotificationSnapshot {
  const packages = service.db.listReviewPackages();
  const proposals = service.db.listReviewTuningProposals().filter((proposal: ReviewTuningProposal) => proposal.status === "proposed");
  const cooldownMultipliers = notificationCooldownOverrides(service);
  const targets = Object.fromEntries(
    SURFACES.map((surface) => {
      const pkg = packages.find((candidate: ReviewPackage) => candidate.surface === surface);
      const cycle = pkg ? service.db.getOpenReviewPackageCycle(pkg.package_id) : null;
      return [
        surface,
        pkg
          ? {
              package_id: pkg.package_id,
              package_cycle_id: cycle?.package_cycle_id,
            }
          : undefined,
      ];
    }),
  ) as Partial<Record<ReviewPackageSurface, { package_id: string; package_cycle_id?: string }>>;
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
    review_package_targets: targets,
    top_tuning_proposal_id: proposals[0]?.proposal_id,
  };
}
