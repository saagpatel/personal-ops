import { createHash } from "node:crypto";
import type {
  AssistantActionRunReport,
  AssistantActionState,
  ClientIdentity,
  PlanningAutopilotBundle,
  PlanningAutopilotBundleKind,
  PlanningAutopilotBundleMember,
  PlanningAutopilotRelatedArtifact,
  PlanningAutopilotReport,
  PlanningRecommendation,
  PlanningRecommendationDetail,
  RelatedDriveFile,
  ServiceState,
  WorkflowScoreBand,
} from "../types.js";
import { listMeetingPrepCandidates } from "./meeting-prep.js";

const MAX_ACTIVE_BUNDLES = 3;
const MAX_RECOMMENDATIONS_PER_BUNDLE = 3;

interface BuildOptions {
  httpReachable: boolean;
}

interface BundleComputation {
  bundle: PlanningAutopilotBundle;
  recommendationDetails: PlanningRecommendationDetail[];
  score: number;
  sourceKeys: string[];
}

function latestRunMap(service: any): Record<string, AssistantActionRunReport | undefined> {
  const events = service.db.listAuditEvents({
    limit: 200,
    actions: ["assistant_action_run"],
  });
  const latest: Record<string, AssistantActionRunReport | undefined> = {};
  for (const event of events) {
    if (latest[event.target_id]) {
      continue;
    }
    try {
      const metadata = JSON.parse(event.metadata_json) as {
        started_at?: string;
        completed_at?: string;
        summary?: string;
        details?: string[];
      };
      latest[event.target_id] = {
        started_at: metadata.started_at ?? event.timestamp,
        completed_at: metadata.completed_at ?? event.timestamp,
        outcome: event.outcome === "success" ? "success" : "failure",
        summary: metadata.summary ?? `${event.target_id} ${event.outcome}`,
        details: Array.isArray(metadata.details) ? metadata.details.map(String) : [],
      };
    } catch {
      latest[event.target_id] = {
        started_at: event.timestamp,
        completed_at: event.timestamp,
        outcome: event.outcome === "success" ? "success" : "failure",
        summary: `${event.target_id} ${event.outcome}`,
        details: [],
      };
    }
  }
  return latest;
}

function bundleKindFor(recommendationKind: PlanningRecommendation["kind"]): PlanningAutopilotBundleKind {
  if (recommendationKind === "schedule_task_block") {
    return "task_block";
  }
  if (recommendationKind === "schedule_thread_followup") {
    return "thread_followup";
  }
  return "event_prep";
}

function bundleIdFor(kind: PlanningAutopilotBundleKind, recommendationIds: string[]): string {
  const digest = createHash("sha1").update(`${kind}:${recommendationIds.join(",")}`).digest("hex").slice(0, 12);
  return `${kind}:${digest}`;
}

function preparePlanningBundleActionId(bundleId: string): string {
  return `assistant.prepare-planning-bundle:${bundleId}`;
}

function reviewPlanningBundleActionId(bundleId: string): string {
  return `assistant.review-planning-bundle:${bundleId}`;
}

function planningAutopilotCommand(): string {
  return "personal-ops planning autopilot";
}

function planningAutopilotBundleCommand(bundleId: string): string {
  return `${planningAutopilotCommand()} --bundle ${bundleId}`;
}

function planningAutopilotPrepareCommand(bundleId: string): string {
  return `${planningAutopilotBundleCommand(bundleId)} --prepare`;
}

function planningAutopilotApplyCommand(bundleId: string): string {
  return `${planningAutopilotBundleCommand(bundleId)} --apply --note "<reason>"`;
}

function maybeHoursUntil(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return (parsed - Date.now()) / (60 * 60_000);
}

function maybeHoursOld(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return (Date.now() - parsed) / (60 * 60_000);
}

function scoreBandFor(score: number): WorkflowScoreBand {
  if (score >= 760) {
    return "highest";
  }
  if (score >= 520) {
    return "high";
  }
  return "medium";
}

function memberTitle(detail: PlanningRecommendationDetail): string {
  return detail.recommendation.proposed_title?.trim() || detail.recommendation.reason_summary;
}

function memberCommand(detail: PlanningRecommendationDetail): string {
  return `personal-ops recommendation show ${detail.recommendation.recommendation_id}`;
}

function recommendationMember(detail: PlanningRecommendationDetail): PlanningAutopilotBundleMember {
  return {
    recommendation_id: detail.recommendation.recommendation_id,
    title: memberTitle(detail),
    summary: detail.recommendation.reason_summary,
    status: detail.recommendation.status,
    slot_state: detail.recommendation.slot_state,
    command: memberCommand(detail),
  };
}

function recommendationSourceKey(detail: PlanningRecommendationDetail): string {
  const recommendation = detail.recommendation;
  if (recommendation.source_task_id) {
    return `task:${recommendation.source_task_id}`;
  }
  if (recommendation.source_thread_id) {
    return `thread:${recommendation.source_thread_id}`;
  }
  if (recommendation.source_calendar_event_id) {
    return `event:${recommendation.source_calendar_event_id}`;
  }
  return `recommendation:${recommendation.recommendation_id}`;
}

function detailScore(detail: PlanningRecommendationDetail): number {
  const recommendation = detail.recommendation;
  let score = recommendation.rank_score;
  if (recommendation.kind === "schedule_task_block") {
    score += 110;
    const dueHours = maybeHoursUntil(detail.task?.due_at);
    if (dueHours !== null && dueHours <= 8) {
      score += dueHours <= 2 ? 90 : 45;
    }
  } else if (recommendation.kind === "schedule_thread_followup") {
    score += 140;
    if (recommendation.reason_code === "needs_reply") {
      score += 60;
    }
  } else {
    const meetingHours = maybeHoursUntil(detail.event?.start_at);
    score += 70;
    if (meetingHours !== null) {
      if (meetingHours <= 2) {
        score += 120;
      } else if (meetingHours <= 6) {
        score += 70;
      } else if (meetingHours > 24) {
        score -= 140;
      }
    }
  }
  if (recommendation.slot_state === "ready") {
    score += 25;
  } else {
    score -= 30;
  }
  const sourceFreshness = maybeHoursOld(recommendation.source_last_seen_at);
  if (sourceFreshness !== null && sourceFreshness <= 4) {
    score += 20;
  }
  return score;
}

function topBundleSummary(kind: PlanningAutopilotBundleKind, count: number, prepared: boolean): string {
  const noun =
    kind === "task_block"
      ? "task block"
      : kind === "thread_followup"
        ? "follow-up"
        : "meeting prep";
  if (prepared) {
    return `${count} ${noun} recommendation${count === 1 ? "" : "s"} are bundled and ready for review.`;
  }
  return `Prepare ${count} ${noun} recommendation${count === 1 ? "" : "s"} as one execution bundle.`;
}

function topBundleWhyNow(kind: PlanningAutopilotBundleKind, prepared: boolean): string {
  if (kind === "task_block") {
    return prepared
      ? "This planning work is already staged, so applying the bundle is faster than re-reading the recommendations one by one."
      : "These task recommendations already point at concrete scheduling work, and bundling them keeps the next move small and deliberate.";
  }
  if (kind === "thread_followup") {
    return prepared
      ? "The assistant already staged the follow-up work underneath this bundle, so review and apply is the shortest path."
      : "These follow-up recommendations are good bundle candidates because the inbox prep layer can stage the reply work for you.";
  }
  return prepared
    ? "The meeting prep work is already packetized, so this bundle is ready to move forward without rebuilding context."
    : "These meeting-prep recommendations are time-sensitive enough to benefit from one bundled review path.";
}

function buildSignals(kind: PlanningAutopilotBundleKind, details: PlanningRecommendationDetail[], prepared: boolean): string[] {
  const signals = new Set<string>([kind]);
  for (const detail of details) {
    for (const signal of detail.recommendation.trigger_signals) {
      signals.add(signal);
    }
    if (detail.recommendation.slot_state === "ready") {
      signals.add("slot_ready");
    } else {
      signals.add("manual_scheduling");
    }
  }
  signals.add(prepared ? "bundle_prepared" : "bundle_unprepared");
  return [...signals];
}

function collectRelatedFiles(service: any, details: PlanningRecommendationDetail[]): RelatedDriveFile[] {
  if (typeof service.getRelatedFilesForTarget !== "function") {
    return [];
  }
  const collected = new Map<string, RelatedDriveFile>();
  for (const detail of details) {
    const recommendation = detail.recommendation;
    const pairs: Array<[string, string | undefined]> = [
      ["task", recommendation.source_task_id],
      ["mail_thread", recommendation.source_thread_id],
      ["calendar_event", recommendation.source_calendar_event_id],
    ];
    for (const [targetType, targetId] of pairs) {
      if (!targetId) {
        continue;
      }
      for (const file of service.getRelatedFilesForTarget(targetType, targetId, { allowFallback: true, maxItems: 3 }) as RelatedDriveFile[]) {
        if (!collected.has(file.file_id)) {
          collected.set(file.file_id, file);
        }
      }
    }
  }
  return [...collected.values()].slice(0, 4);
}

function buildFileArtifacts(files: RelatedDriveFile[]): PlanningAutopilotRelatedArtifact[] {
  return files.map((file) => ({
    artifact_type: "related_file",
    artifact_id: file.file_id,
    title: file.title,
    summary: file.snippet || `${file.file_kind} matched via ${file.match_type.replaceAll("_", " ")}.`,
    command:
      file.file_kind === "sheet"
        ? `personal-ops drive sheet ${file.file_id}`
        : file.file_kind === "doc"
          ? `personal-ops drive doc ${file.file_id}`
          : planningAutopilotCommand(),
  }));
}

async function findAutopilotArtifact(service: any, details: PlanningRecommendationDetail[]): Promise<PlanningAutopilotRelatedArtifact | null> {
  const report = await service.getInboxAutopilotReport({ httpReachable: true });
  const threadIds = new Set(details.map((detail) => detail.recommendation.source_thread_id).filter(Boolean));
  if (threadIds.size === 0) {
    return null;
  }
  const best = report.groups.find((group: any) => {
    const memberIds = new Set(group.threads.map((thread: any) => thread.thread_id));
    for (const threadId of threadIds) {
      if (!memberIds.has(threadId)) {
        return false;
      }
    }
    return true;
  }) ?? report.groups.find((group: any) => group.threads.some((thread: any) => threadIds.has(thread.thread_id)));
  if (!best) {
    return null;
  }
  return {
    artifact_type: "inbox_autopilot_group",
    artifact_id: best.group_id,
    title: best.kind === "needs_reply" ? "Reply block" : "Follow-up block",
    summary: best.summary,
    command: "personal-ops inbox autopilot",
    state: best.state,
  };
}

async function findMeetingArtifact(service: any, details: PlanningRecommendationDetail[]): Promise<PlanningAutopilotRelatedArtifact | null> {
  const candidates = await listMeetingPrepCandidates(service, { scope: "next_24h" });
  const eventIds = new Set(details.map((detail) => detail.recommendation.source_calendar_event_id).filter(Boolean));
  const packet = candidates.find((candidate) => eventIds.has(candidate.event.event_id) && candidate.packet_record)
    ?? candidates.find((candidate) => eventIds.has(candidate.event.event_id));
  if (!packet) {
    return null;
  }
  return {
    artifact_type: "meeting_prep_packet",
    artifact_id: packet.event.event_id,
    title: packet.event.summary?.trim() || "Meeting prep packet",
    summary: packet.summary,
    command: `personal-ops workflow prep-meetings --event ${packet.event.event_id}`,
    state: packet.state,
  };
}

async function buildRelatedArtifacts(service: any, kind: PlanningAutopilotBundleKind, details: PlanningRecommendationDetail[]): Promise<PlanningAutopilotRelatedArtifact[]> {
  const artifacts: PlanningAutopilotRelatedArtifact[] = [];
  if (kind === "thread_followup") {
    const group = await findAutopilotArtifact(service, details);
    if (group) {
      artifacts.push(group);
    }
  }
  if (kind === "event_prep") {
    const packet = await findMeetingArtifact(service, details);
    if (packet) {
      artifacts.push(packet);
    }
  }
  for (const detail of details) {
    if (detail.task) {
      artifacts.push({
        artifact_type: "task",
        artifact_id: detail.task.task_id,
        title: detail.task.title,
        summary: detail.task.notes?.trim() || detail.recommendation.reason_summary,
        command: `personal-ops task show ${detail.task.task_id}`,
        state: detail.task.state,
      });
    } else if (detail.event) {
      artifacts.push({
        artifact_type: "calendar_event",
        artifact_id: detail.event.event_id,
        title: detail.event.summary?.trim() || "Upcoming meeting",
        summary: `Starts ${new Date(detail.event.start_at).toLocaleString()}.`,
        command: `personal-ops calendar event ${detail.event.event_id}`,
      });
    }
  }
  const seen = new Set<string>();
  const unique = artifacts.filter((artifact) => {
    const key = `${artifact.artifact_type}:${artifact.artifact_id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return [...unique, ...buildFileArtifacts(collectRelatedFiles(service, details))].slice(0, 6);
}

function buildExecutionPreview(
  kind: PlanningAutopilotBundleKind,
  details: PlanningRecommendationDetail[],
  relatedArtifacts: PlanningAutopilotRelatedArtifact[],
): string[] {
  const lines: string[] = [];
  if (kind === "task_block") {
    lines.push(`Apply ${details.length} task scheduling recommendation${details.length === 1 ? "" : "s"} in priority order.`);
    for (const detail of details) {
      lines.push(`Schedule work for ${memberTitle(detail)}.`);
    }
  } else if (kind === "thread_followup") {
    const group = relatedArtifacts.find((artifact) => artifact.artifact_type === "inbox_autopilot_group");
    if (group) {
      lines.push(`Reuse inbox autopilot group ${group.artifact_id} so draft staging stays bundled.`);
    }
    for (const detail of details) {
      lines.push(`Convert follow-up recommendation ${detail.recommendation.recommendation_id} into tracked work.`);
    }
  } else {
    const packet = relatedArtifacts.find((artifact) => artifact.artifact_type === "meeting_prep_packet");
    if (packet) {
      lines.push(`Reuse meeting packet ${packet.artifact_id} before applying the prep recommendation.`);
    }
    for (const detail of details) {
      lines.push(`Carry forward prep work for ${memberTitle(detail)}.`);
    }
  }
  return lines.slice(0, 5);
}

function buildPreparedNote(kind: PlanningAutopilotBundleKind, details: PlanningRecommendationDetail[]): string {
  if (kind === "task_block") {
    return `Applying this task bundle to protect time for ${details.length} concrete task block${details.length === 1 ? "" : "s"}.`;
  }
  if (kind === "thread_followup") {
    return `Applying this follow-up bundle after reviewing the assistant-prepared inbox work for ${details.length} thread${details.length === 1 ? "" : "s"}.`;
  }
  return `Applying this meeting-prep bundle after reviewing the prepared packet${details.length === 1 ? "" : "s"} for ${details.length} meeting${details.length === 1 ? "" : "s"}.`;
}

async function ensureApplyReady(service: any, kind: PlanningAutopilotBundleKind, details: PlanningRecommendationDetail[]): Promise<boolean> {
  if (details.some((detail) => !["pending", "snoozed"].includes(detail.recommendation.status))) {
    return false;
  }
  if (details.some((detail) => detail.recommendation.slot_state !== "ready")) {
    return false;
  }
  if (kind === "thread_followup") {
    const artifact = await findAutopilotArtifact(service, details);
    return artifact?.state === "awaiting_review";
  }
  if (kind === "event_prep") {
    const artifact = await findMeetingArtifact(service, details);
    return artifact?.state === "awaiting_review";
  }
  return true;
}

async function deriveBundleState(input: {
  service: any;
  kind: PlanningAutopilotBundleKind;
  details: PlanningRecommendationDetail[];
  bundleId: string;
  latestRun: AssistantActionRunReport | undefined;
  relatedArtifacts: PlanningAutopilotRelatedArtifact[];
}): Promise<{ state: AssistantActionState; applyReady: boolean }> {
  const prepareActionId = preparePlanningBundleActionId(input.bundleId);
  const running = Boolean(input.service.getAssistantActionStartedAt?.(prepareActionId));
  const applyReady = await ensureApplyReady(input.service, input.kind, input.details);
  if (running) {
    return { state: "running", applyReady };
  }
  if (input.details.length === 0) {
    return { state: "completed", applyReady: false };
  }
  const statusBlocked = input.kind === "thread_followup"
    ? input.relatedArtifacts.some((artifact) => artifact.artifact_type === "inbox_autopilot_group" && artifact.state === "blocked")
    : input.kind === "event_prep"
      ? input.relatedArtifacts.some((artifact) => artifact.artifact_type === "meeting_prep_packet" && artifact.state === "blocked")
      : false;
  if (statusBlocked) {
    return { state: "blocked", applyReady: false };
  }
  const latestCompletion = Date.parse(input.latestRun?.completed_at ?? input.latestRun?.started_at ?? "");
  const newerRecommendation = input.details.some((detail) => {
    if (!Number.isFinite(latestCompletion)) {
      return true;
    }
    return Date.parse(detail.recommendation.updated_at) > latestCompletion;
  });
  if (applyReady && !newerRecommendation) {
    return { state: "awaiting_review", applyReady: true };
  }
  if (input.latestRun?.outcome === "failure") {
    return { state: "failed", applyReady: false };
  }
  return { state: "proposed", applyReady };
}

async function buildBundle(service: any, kind: PlanningAutopilotBundleKind, details: PlanningRecommendationDetail[], latestRuns: Record<string, AssistantActionRunReport | undefined>): Promise<BundleComputation> {
  const recommendationIds = details.map((detail) => detail.recommendation.recommendation_id);
  const bundleId = bundleIdFor(kind, recommendationIds);
  const relatedArtifacts = await buildRelatedArtifacts(service, kind, details);
  const score = details.reduce((sum, detail) => sum + detailScore(detail), 0) / Math.max(1, details.length)
    + (kind === "thread_followup" ? 35 : kind === "event_prep" ? 20 : 0);
  const latestRun = latestRuns[preparePlanningBundleActionId(bundleId)];
  const { state, applyReady } = await deriveBundleState({
    service,
    kind,
    details,
    bundleId,
    latestRun,
    relatedArtifacts,
  });
  const prepared = state === "awaiting_review";
  const bundle: PlanningAutopilotBundle = {
    bundle_id: bundleId,
    kind,
    state,
    summary: topBundleSummary(kind, details.length, prepared),
    why_now: topBundleWhyNow(kind, prepared),
    score_band: scoreBandFor(score),
    signals: buildSignals(kind, details, prepared),
    assistant_action_id: prepared ? reviewPlanningBundleActionId(bundleId) : preparePlanningBundleActionId(bundleId),
    review_required: prepared,
    apply_ready: applyReady,
    recommendation_ids: recommendationIds,
    prepared_note: buildPreparedNote(kind, details),
    execution_preview: buildExecutionPreview(kind, details, relatedArtifacts),
    related_artifacts: relatedArtifacts,
    next_commands: [
      planningAutopilotBundleCommand(bundleId),
      planningAutopilotPrepareCommand(bundleId),
      planningAutopilotApplyCommand(bundleId),
    ],
    recommendations: details.map((detail) => recommendationMember(detail)),
  };
  return {
    bundle,
    recommendationDetails: details,
    score,
    sourceKeys: details.map((detail) => recommendationSourceKey(detail)),
  };
}

async function computeBundles(service: any, options: BuildOptions): Promise<{ readiness: ServiceState; bundles: BundleComputation[] }> {
  const status = await service.getStatusReport(options);
  const recommendations = service
    .listPlanningRecommendations({ include_resolved: false })
    .filter((recommendation: PlanningRecommendation) => ["pending", "snoozed"].includes(recommendation.status))
    .sort((left: PlanningRecommendation, right: PlanningRecommendation) => service.compareNextActionableRecommendations(left, right));
  const detailMap = new Map<string, PlanningRecommendationDetail>();
  for (const recommendation of recommendations) {
    detailMap.set(recommendation.recommendation_id, service.getPlanningRecommendationDetail(recommendation.recommendation_id));
  }
  const latestRuns = latestRunMap(service);
  const buckets: Record<PlanningAutopilotBundleKind, PlanningRecommendationDetail[]> = {
    task_block: [],
    thread_followup: [],
    event_prep: [],
  };
  for (const recommendation of recommendations) {
    const detail = detailMap.get(recommendation.recommendation_id);
    if (!detail) {
      continue;
    }
    const kind = bundleKindFor(recommendation.kind);
    if (buckets[kind].length >= MAX_RECOMMENDATIONS_PER_BUNDLE) {
      continue;
    }
    buckets[kind].push(detail);
  }
  const computed: BundleComputation[] = [];
  const seenSourceKeys = new Set<string>();
  for (const kind of ["task_block", "thread_followup", "event_prep"] as PlanningAutopilotBundleKind[]) {
    const details = buckets[kind].filter((detail) => !seenSourceKeys.has(recommendationSourceKey(detail)));
    if (details.length === 0) {
      continue;
    }
    const bundle = await buildBundle(service, kind, details.slice(0, MAX_RECOMMENDATIONS_PER_BUNDLE), latestRuns);
    computed.push(bundle);
    for (const sourceKey of bundle.sourceKeys) {
      seenSourceKeys.add(sourceKey);
    }
    if (computed.length >= MAX_ACTIVE_BUNDLES) {
      break;
    }
  }
  computed.sort((left, right) => right.score - left.score || left.bundle.bundle_id.localeCompare(right.bundle.bundle_id));
  return {
    readiness: status.state,
    bundles: computed.slice(0, MAX_ACTIVE_BUNDLES),
  };
}

export async function buildPlanningAutopilotReport(service: any, options: BuildOptions): Promise<PlanningAutopilotReport> {
  const computed = await computeBundles(service, options);
  const bundles = computed.bundles.map((item) => item.bundle);
  const preparedBundleCount = bundles.filter((bundle) => bundle.state === "awaiting_review").length;
  return {
    generated_at: new Date().toISOString(),
    readiness: computed.readiness,
    summary:
      bundles.length === 0
        ? "No planning bundles need assistant prep right now."
        : `${bundles.length} planning bundle${bundles.length === 1 ? "" : "s"} are active, with ${preparedBundleCount} ready for review.`,
    top_item_summary: bundles[0]?.summary ?? null,
    prepared_bundle_count: preparedBundleCount,
    bundles,
  };
}

export async function getPlanningAutopilotBundleDetail(service: any, bundleId: string): Promise<PlanningAutopilotBundle> {
  const report = await buildPlanningAutopilotReport(service, { httpReachable: true });
  const bundle = report.bundles.find((item) => item.bundle_id === bundleId);
  if (!bundle) {
    throw new Error(`Planning autopilot bundle ${bundleId} is not available right now.`);
  }
  return bundle;
}

export async function maybeAutoPreparePlanningBundles(service: any, options: BuildOptions): Promise<void> {
  const report = await buildPlanningAutopilotReport(service, options);
  if (report.readiness !== "ready") {
    return;
  }
  const identity = service.systemPlanningIdentity("planning-autopilot");
  for (const bundle of report.bundles) {
    if (!["proposed", "failed"].includes(bundle.state)) {
      continue;
    }
    try {
      await preparePlanningAutopilotBundle(service, identity, bundle.bundle_id);
    } catch {
      // Keep attention sweep resilient; bundle failures are already captured in audit state.
    }
  }
}

export async function preparePlanningAutopilotBundle(
  service: any,
  identity: ClientIdentity,
  bundleId: string,
): Promise<{ summary: string; details: string[]; success: boolean; bundle: PlanningAutopilotBundle }> {
  service.assertOperatorOnly(identity, "prepare this planning bundle");
  service.db.registerClient(identity);
  const report = await buildPlanningAutopilotReport(service, { httpReachable: true });
  const bundle = report.bundles.find((item) => item.bundle_id === bundleId);
  if (!bundle) {
    throw new Error(`Planning autopilot bundle ${bundleId} is not available right now.`);
  }
  const computed = await computeBundles(service, { httpReachable: true });
  const active = computed.bundles.find((item) => item.bundle.bundle_id === bundleId);
  const activeDetails = active?.recommendationDetails ?? [];
  if (bundle.state === "blocked") {
    throw new Error("Planning autopilot is blocked until the underlying workspace context is healthy.");
  }
  const details: string[] = [];
  let hadFailure = false;
  const actionId = preparePlanningBundleActionId(bundleId);
  await service.runTrackedAssistantAction(actionId, async () => {
    if (bundle.kind === "thread_followup") {
      const group =
        bundle.related_artifacts.find((artifact) => artifact.artifact_type === "inbox_autopilot_group") ??
        (activeDetails.length > 0 ? await findAutopilotArtifact(service, activeDetails) : null);
      if (group) {
        await service.prepareInboxAutopilotGroup(identity, group.artifact_id);
        details.push(`Prepared inbox autopilot group ${group.artifact_id}.`);
      } else {
        hadFailure = true;
        details.push("No reusable inbox autopilot group was available for this follow-up bundle.");
      }
    } else if (bundle.kind === "event_prep") {
      const packet =
        bundle.related_artifacts.find((artifact) => artifact.artifact_type === "meeting_prep_packet") ??
        (activeDetails.length > 0 ? await findMeetingArtifact(service, activeDetails) : null);
      if (packet) {
        await service.prepareMeetingPrepPacket(identity, packet.artifact_id);
        details.push(`Prepared meeting packet ${packet.artifact_id}.`);
      } else {
        hadFailure = true;
        details.push("No reusable meeting packet was available for this prep bundle.");
      }
    }
    details.push(`Prepared note: ${bundle.prepared_note ?? "Bundle note ready."}`);
    for (const line of bundle.execution_preview) {
      details.push(line);
    }
  });
  const summary = hadFailure
    ? `Planning bundle ${bundleId} prepared partially and still needs repair.`
    : `Planning bundle ${bundleId} is prepared and ready for review.`;
  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action: "assistant_action_run",
    target_type: "assistant_action",
    target_id: actionId,
    outcome: hadFailure ? "failure" : "success",
    metadata: {
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      summary,
      details,
    },
  });
  const refreshed = await getPlanningAutopilotBundleDetail(service, bundleId);
  return {
    summary,
    details,
    success: !hadFailure,
    bundle: refreshed,
  };
}

export async function applyPlanningAutopilotBundle(
  service: any,
  identity: ClientIdentity,
  bundleId: string,
  note: string,
  confirmed: boolean,
): Promise<PlanningAutopilotBundle> {
  service.assertOperatorOnly(identity, "apply this planning bundle");
  service.assertRequiredNote(note, "apply");
  if (!confirmed) {
    throw new Error("Explicit confirmation is required before applying a planning bundle.");
  }
  service.db.registerClient(identity);
  const bundle = await getPlanningAutopilotBundleDetail(service, bundleId);
  if (!bundle.apply_ready) {
    throw new Error("This planning bundle is not ready to apply yet. Refresh the prep first.");
  }
  const detailReport = await computeBundles(service, { httpReachable: true });
  const active = detailReport.bundles.find((item) => item.bundle.bundle_id === bundleId);
  if (!active) {
    throw new Error(`Planning autopilot bundle ${bundleId} is not available right now.`);
  }
  const appliedRecommendationIds: string[] = [];
  const executionNote = `${bundle.prepared_note ?? "Prepared bundle apply."} ${note.trim()}`.trim();
  for (const detail of active.recommendationDetails) {
    await service.applyPlanningRecommendation(identity, detail.recommendation.recommendation_id, executionNote);
    appliedRecommendationIds.push(detail.recommendation.recommendation_id);
  }
  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action: "planning_autopilot_bundle_apply",
    target_type: "planning_autopilot_bundle",
    target_id: bundleId,
    outcome: "success",
    metadata: {
      bundle_kind: bundle.kind,
      recommendation_ids: appliedRecommendationIds,
      note: note.trim(),
      prepared_note: bundle.prepared_note ?? null,
    },
  });
  return await getPlanningAutopilotBundleDetail(service, bundleId).catch(() => ({
    ...bundle,
    state: "completed",
    apply_ready: false,
  }));
}
