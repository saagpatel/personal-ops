import { randomUUID } from "node:crypto";
import type {
  ApprovalRequest,
  DraftArtifact,
  OutboundAutopilotGroup,
  ReviewApprovalFlowCalibrationSummary,
  ReviewApprovalFlowEvidenceKind,
  ReviewApprovalFlowOutcomeRecord,
  ReviewApprovalFlowRecommendationKind,
  ReviewApprovalFlowState,
  ReviewApprovalFlowSummary,
  ReviewItem,
} from "../types.js";

const REVIEW_APPROVAL_LOOKBACK_DAYS = 14;
const REVIEW_APPROVAL_EXPIRY_HOURS = 24;

type ReviewApprovalPosition = {
  state: ReviewApprovalFlowState | "caught_up";
  blocked_reason: "send_window_blocked" | "send_failed" | null;
  acted_at: string | null;
};

type OutcomeCloseInput = {
  state: Exclude<ReviewApprovalFlowOutcomeRecord["state"], "open">;
  evidence_kind: ReviewApprovalFlowEvidenceKind;
  acted_at?: string | null;
  closed_at: string;
};

type ServiceLike = {
  db?: {
    getDraftArtifact?: (artifactId: string) => DraftArtifact | null;
    getReviewItem?: (reviewId: string) => ReviewItem | null;
    getLatestReviewItemForArtifact?: (artifactId: string) => ReviewItem | null;
    getApprovalRequest?: (approvalId: string) => ApprovalRequest | null;
    getActiveApprovalForArtifact?: (artifactId: string) => ApprovalRequest | null;
    getOpenReviewApprovalFlowOutcome?: (target_type: string, target_id: string) => ReviewApprovalFlowOutcomeRecord | null;
    upsertReviewApprovalFlowOutcome?: (record: ReviewApprovalFlowOutcomeRecord) => ReviewApprovalFlowOutcomeRecord;
    closeReviewApprovalFlowOutcome?: (outcomeId: string, input: OutcomeCloseInput) => ReviewApprovalFlowOutcomeRecord | null;
    listReviewApprovalFlowOutcomes?: (options?: any) => ReviewApprovalFlowOutcomeRecord[];
  };
};

function hasOutcomeStorage(service: ServiceLike): service is Required<Pick<ServiceLike, "db">> & {
  db: {
    getDraftArtifact: NonNullable<NonNullable<ServiceLike["db"]>["getDraftArtifact"]>;
    getReviewItem: NonNullable<NonNullable<ServiceLike["db"]>["getReviewItem"]>;
    getLatestReviewItemForArtifact: NonNullable<NonNullable<ServiceLike["db"]>["getLatestReviewItemForArtifact"]>;
    getApprovalRequest: NonNullable<NonNullable<ServiceLike["db"]>["getApprovalRequest"]>;
    getActiveApprovalForArtifact: NonNullable<NonNullable<ServiceLike["db"]>["getActiveApprovalForArtifact"]>;
    getOpenReviewApprovalFlowOutcome: NonNullable<NonNullable<ServiceLike["db"]>["getOpenReviewApprovalFlowOutcome"]>;
    upsertReviewApprovalFlowOutcome: NonNullable<NonNullable<ServiceLike["db"]>["upsertReviewApprovalFlowOutcome"]>;
    closeReviewApprovalFlowOutcome: NonNullable<NonNullable<ServiceLike["db"]>["closeReviewApprovalFlowOutcome"]>;
    listReviewApprovalFlowOutcomes: NonNullable<NonNullable<ServiceLike["db"]>["listReviewApprovalFlowOutcomes"]>;
  };
} {
  return Boolean(
    service.db?.getDraftArtifact &&
      service.db?.getReviewItem &&
      service.db?.getLatestReviewItemForArtifact &&
      service.db?.getApprovalRequest &&
      service.db?.getActiveApprovalForArtifact &&
      service.db?.getOpenReviewApprovalFlowOutcome &&
      service.db?.upsertReviewApprovalFlowOutcome &&
      service.db?.closeReviewApprovalFlowOutcome &&
      service.db?.listReviewApprovalFlowOutcomes,
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function hoursBetween(startedAt: string, endedAt: string): number | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return (end - start) / (60 * 60 * 1000);
}

function shouldExpire(record: ReviewApprovalFlowOutcomeRecord, observedAt: string): boolean {
  const elapsedHours = hoursBetween(record.last_seen_at, observedAt);
  return elapsedHours !== null && elapsedHours >= REVIEW_APPROVAL_EXPIRY_HOURS;
}

function targetKey(target_type: string | null | undefined, target_id: string | null | undefined): string | null {
  return target_type && target_id ? `${target_type}:${target_id}` : null;
}

function recordKey(record: ReviewApprovalFlowOutcomeRecord): string {
  return `${record.target_type}:${record.target_id}`;
}

function emptyCalibration(): ReviewApprovalFlowCalibrationSummary {
  return {
    eligible: false,
    status: "insufficient_evidence",
    recommendation_kind: "insufficient_evidence",
    summary: null,
    recommendation_summary: null,
    sample_count_14d: 0,
    helpful_count_14d: 0,
    attempted_failed_count_14d: 0,
    superseded_count_14d: 0,
    expired_count_14d: 0,
    helpful_rate_14d: 0,
    review_needed_count_14d: 0,
    approval_needed_count_14d: 0,
    send_ready_count_14d: 0,
    recovery_needed_count_14d: 0,
  };
}

function calibrationSummaryForStatus(status: ReviewApprovalFlowCalibrationSummary["status"]): string {
  switch (status) {
    case "working":
      return "Recent outcomes suggest the current review and approval handoff is usually moving forward cleanly.";
    case "mixed":
      return "Recent outcomes are mixed; this handoff sometimes moves forward and sometimes stalls or gets replaced.";
    case "attention_needed":
      return "Recent outcomes suggest this handoff often stalls, regresses, or gets replaced before completion.";
    default:
      return "This handoff does not have enough recent outcome history yet.";
  }
}

function recommendationSummaryForKind(kind: ReviewApprovalFlowRecommendationKind): string {
  switch (kind) {
    case "keep_current_handoff":
      return "Current evidence does not justify more batching, review tuning, or decision-surface changes yet.";
    case "consider_more_batching":
      return "Recent stalls lean toward singleton handoffs, so grouping more review and approval work may be the next thing to test.";
    case "consider_review_tuning":
      return "Recent stalls lean toward the review step, so review tuning is the likeliest next calibration move.";
    case "consider_decision_surface_adjustment":
      return "Recent stalls are spread across the handoff, so the decision surfaces likely need another pass before wider batching changes.";
    default:
      return "Gather more follow-through history before changing batching, review tuning, or decision surfaces.";
  }
}

export function buildReviewApprovalFlowCalibrationSummary(
  records: ReviewApprovalFlowOutcomeRecord[],
): ReviewApprovalFlowCalibrationSummary {
  if (records.length === 0) {
    return {
      ...emptyCalibration(),
      eligible: true,
      summary: calibrationSummaryForStatus("insufficient_evidence"),
      recommendation_summary: recommendationSummaryForKind("insufficient_evidence"),
    };
  }
  const helpfulCount = records.filter((record) => record.state === "helpful").length;
  const attemptedFailedCount = records.filter((record) => record.state === "attempted_failed").length;
  const supersededCount = records.filter((record) => record.state === "superseded").length;
  const expiredCount = records.filter((record) => record.state === "expired").length;
  const sampleCount = records.length;
  const helpfulRate = sampleCount > 0 ? helpfulCount / sampleCount : 0;
  const reviewNeededCount = records.filter((record) => record.surfaced_state === "review_needed").length;
  const approvalNeededCount = records.filter((record) => record.surfaced_state === "approval_needed").length;
  const sendReadyCount = records.filter((record) => record.surfaced_state === "send_ready").length;
  const recoveryNeededCount = records.filter((record) => record.surfaced_state === "recovery_needed").length;

  const status =
    sampleCount < 3
      ? "insufficient_evidence"
      : helpfulRate >= 0.65 && attemptedFailedCount <= Math.max(1, Math.floor(sampleCount * 0.2)) && expiredCount + supersededCount <= Math.ceil(sampleCount * 0.35)
        ? "working"
        : helpfulRate >= 0.35
          ? "mixed"
          : "attention_needed";

  const stalled = records.filter((record) => record.state !== "helpful");
  const reviewStageStalls = stalled.filter((record) => record.surfaced_state === "review_needed").length;
  const singletonStalls = stalled.filter((record) => record.target_type !== "outbound_autopilot_group").length;
  const groupedStalls = stalled.filter((record) => record.target_type === "outbound_autopilot_group").length;
  const groupedHelpful = records.filter(
    (record) => record.state === "helpful" && record.target_type === "outbound_autopilot_group",
  ).length;
  const recommendation_kind =
    sampleCount < 3
      ? "insufficient_evidence"
      : status === "working"
        ? "keep_current_handoff"
        : reviewStageStalls >= Math.max(2, Math.ceil(stalled.length / 2))
          ? "consider_review_tuning"
          : singletonStalls > groupedStalls && groupedHelpful >= 1
            ? "consider_more_batching"
            : "consider_decision_surface_adjustment";

  return {
    eligible: true,
    status,
    recommendation_kind,
    summary: calibrationSummaryForStatus(status),
    recommendation_summary: recommendationSummaryForKind(recommendation_kind),
    sample_count_14d: sampleCount,
    helpful_count_14d: helpfulCount,
    attempted_failed_count_14d: attemptedFailedCount,
    superseded_count_14d: supersededCount,
    expired_count_14d: expiredCount,
    helpful_rate_14d: helpfulRate,
    review_needed_count_14d: reviewNeededCount,
    approval_needed_count_14d: approvalNeededCount,
    send_ready_count_14d: sendReadyCount,
    recovery_needed_count_14d: recoveryNeededCount,
  };
}

function closeRecord(service: ServiceLike, record: ReviewApprovalFlowOutcomeRecord, input: OutcomeCloseInput): void {
  service.db?.closeReviewApprovalFlowOutcome?.(record.outcome_id, input);
}

function ensureOpenRecord(
  service: ServiceLike,
  input: {
    flow: ReviewApprovalFlowSummary;
    observed_at: string;
  },
): ReviewApprovalFlowOutcomeRecord | null {
  if (!hasOutcomeStorage(service) || !input.flow.eligible || !input.flow.target_type || !input.flow.target_id || !input.flow.summary) {
    return null;
  }
  const existing = service.db.getOpenReviewApprovalFlowOutcome(input.flow.target_type, input.flow.target_id);
  return service.db.upsertReviewApprovalFlowOutcome({
    outcome_id: existing?.outcome_id ?? randomUUID(),
    surfaced_state: input.flow.state === "caught_up" ? "review_needed" : input.flow.state,
    target_type: input.flow.target_type,
    target_id: input.flow.target_id,
    review_id: input.flow.review_id ?? undefined,
    approval_id: input.flow.approval_id ?? undefined,
    outbound_group_id: input.flow.outbound_group_id ?? undefined,
    assistant_action_id: input.flow.assistant_action_id ?? undefined,
    summary_snapshot: input.flow.summary,
    command_snapshot: input.flow.primary_command ?? undefined,
    surfaced_at: existing?.surfaced_at ?? input.observed_at,
    last_seen_at: input.observed_at,
    state: "open",
    evidence_kind: undefined,
    acted_at: existing?.acted_at,
    closed_at: undefined,
  });
}

function groupBlockedReason(group: OutboundAutopilotGroup, approvals: ApprovalRequest[], drafts: DraftArtifact[]): ReviewApprovalPosition["blocked_reason"] {
  if (approvals.some((approval) => approval.state === "send_failed") || drafts.some((draft) => draft.status === "send_failed")) {
    return "send_failed";
  }
  if (approvals.some((approval) => approval.state === "approved")) {
    return "send_window_blocked";
  }
  return "send_failed";
}

function groupPosition(group: OutboundAutopilotGroup | null, approvals: ApprovalRequest[], drafts: DraftArtifact[]): ReviewApprovalPosition {
  if (!group || group.state === "completed") {
    return { state: "caught_up", blocked_reason: null, acted_at: drafts.find((draft) => draft.sent_at)?.sent_at ?? null };
  }
  if (group.state === "review_pending") {
    const reviewActedAt = group.review_item_ids.length > 0 ? null : drafts.find((draft) => draft.created_at)?.created_at ?? null;
    return { state: "review_needed", blocked_reason: null, acted_at: reviewActedAt };
  }
  if (group.state === "approval_ready" || group.state === "approval_pending") {
    return {
      state: "approval_needed",
      blocked_reason: null,
      acted_at: approvals.find((approval) => approval.requested_at)?.requested_at ?? drafts.find((draft) => draft.updated_at)?.updated_at ?? null,
    };
  }
  if (group.state === "send_ready") {
    return {
      state: "send_ready",
      blocked_reason: null,
      acted_at: approvals.find((approval) => approval.approved_at)?.approved_at ?? drafts.find((draft) => draft.approved_at)?.approved_at ?? null,
    };
  }
  return {
    state: "recovery_needed",
    blocked_reason: groupBlockedReason(group, approvals, drafts),
    acted_at:
      approvals.find((approval) => approval.updated_at)?.updated_at ??
      drafts.find((draft) => draft.last_send_attempt_at)?.last_send_attempt_at ??
      null,
  };
}

function approvalPosition(approval: ApprovalRequest | null, draft: DraftArtifact | null): ReviewApprovalPosition {
  if (!approval) {
    return { state: "caught_up", blocked_reason: null, acted_at: draft?.sent_at ?? null };
  }
  if (approval.state === "pending" || approval.state === "sending") {
    return { state: "approval_needed", blocked_reason: null, acted_at: approval.requested_at };
  }
  if (approval.state === "approved") {
    return {
      state: "send_ready",
      blocked_reason: null,
      acted_at: approval.approved_at ?? draft?.approved_at ?? approval.updated_at,
    };
  }
  if (approval.state === "send_failed") {
    return {
      state: "recovery_needed",
      blocked_reason: "send_failed",
      acted_at: draft?.last_send_attempt_at ?? approval.updated_at,
    };
  }
  return {
    state: "caught_up",
    blocked_reason: null,
    acted_at: draft?.sent_at ?? approval.updated_at,
  };
}

function reviewPosition(review: ReviewItem | null, draft: DraftArtifact | null, approval: ApprovalRequest | null): ReviewApprovalPosition {
  if (!review) {
    return approvalPosition(approval, draft);
  }
  if (review.state === "pending" || review.state === "opened") {
    return {
      state: "review_needed",
      blocked_reason: null,
      acted_at: review.opened_at ?? review.created_at,
    };
  }
  if (approval) {
    return approvalPosition(approval, draft);
  }
  if (draft?.status === "send_failed") {
    return {
      state: "recovery_needed",
      blocked_reason: "send_failed",
      acted_at: draft.last_send_attempt_at ?? draft.updated_at,
    };
  }
  return {
    state: draft?.status === "sent" ? "caught_up" : "caught_up",
    blocked_reason: null,
    acted_at: draft?.sent_at ?? review.resolved_at ?? draft?.updated_at ?? null,
  };
}

function currentPositionForRecord(
  service: ServiceLike,
  record: ReviewApprovalFlowOutcomeRecord,
  currentGroups: OutboundAutopilotGroup[],
): ReviewApprovalPosition {
  if (!hasOutcomeStorage(service)) {
    return { state: "caught_up", blocked_reason: null, acted_at: null };
  }
  if (record.target_type === "outbound_autopilot_group") {
    const group = currentGroups.find((candidate) => candidate.group_id === (record.outbound_group_id ?? record.target_id)) ?? null;
    const approvals = (group?.approval_ids ?? [])
      .map((approvalId) => service.db.getApprovalRequest(approvalId))
      .filter((approval): approval is ApprovalRequest => Boolean(approval));
    const drafts = (group?.draft_artifact_ids ?? [])
      .map((artifactId) => service.db.getDraftArtifact(artifactId))
      .filter((draft): draft is DraftArtifact => Boolean(draft));
    return groupPosition(group, approvals, drafts);
  }
  if (record.target_type === "approval_request") {
    const approval = service.db.getApprovalRequest(record.approval_id ?? record.target_id);
    const draft = approval ? service.db.getDraftArtifact(approval.artifact_id) : null;
    return approvalPosition(approval, draft);
  }
  if (record.target_type === "review_item") {
    const review = service.db.getReviewItem(record.review_id ?? record.target_id);
    const artifactId = review?.artifact_id ?? null;
    const draft = artifactId ? service.db.getDraftArtifact(artifactId) : null;
    const approval = artifactId ? service.db.getActiveApprovalForArtifact(artifactId) : null;
    return reviewPosition(review, draft, approval);
  }
  if (record.target_type === "draft_artifact") {
    const draft = service.db.getDraftArtifact(record.target_id);
    const review = record.review_id
      ? service.db.getReviewItem(record.review_id)
      : service.db.getLatestReviewItemForArtifact(record.target_id);
    const approval = service.db.getActiveApprovalForArtifact(record.target_id);
    return reviewPosition(review, draft, approval);
  }
  return { state: "caught_up", blocked_reason: null, acted_at: null };
}

function helpfulClosure(
  record: ReviewApprovalFlowOutcomeRecord,
  position: ReviewApprovalPosition,
  observedAt: string,
): OutcomeCloseInput | null {
  if (record.surfaced_state === "review_needed") {
    if (position.state === "approval_needed" || position.state === "send_ready" || position.state === "caught_up") {
      return {
        state: "helpful",
        evidence_kind: "review_progressed",
        acted_at: position.acted_at ?? observedAt,
        closed_at: observedAt,
      };
    }
    if (position.state === "recovery_needed" && position.blocked_reason === "send_window_blocked") {
      return {
        state: "helpful",
        evidence_kind: "review_progressed",
        acted_at: position.acted_at ?? observedAt,
        closed_at: observedAt,
      };
    }
  }
  if (record.surfaced_state === "approval_needed") {
    if (position.state === "send_ready" || position.state === "caught_up") {
      return {
        state: "helpful",
        evidence_kind: "approval_progressed",
        acted_at: position.acted_at ?? observedAt,
        closed_at: observedAt,
      };
    }
    if (position.state === "recovery_needed" && position.blocked_reason === "send_window_blocked") {
      return {
        state: "helpful",
        evidence_kind: "approval_progressed",
        acted_at: position.acted_at ?? observedAt,
        closed_at: observedAt,
      };
    }
  }
  if (record.surfaced_state === "send_ready" && position.state === "caught_up") {
    return {
      state: "helpful",
      evidence_kind: "send_completed",
      acted_at: position.acted_at ?? observedAt,
      closed_at: observedAt,
    };
  }
  if (record.surfaced_state === "recovery_needed" && position.state !== "recovery_needed") {
    return {
      state: "helpful",
      evidence_kind: "recovery_progressed",
      acted_at: position.acted_at ?? observedAt,
      closed_at: observedAt,
    };
  }
  return null;
}

function failureClosure(
  record: ReviewApprovalFlowOutcomeRecord,
  position: ReviewApprovalPosition,
  observedAt: string,
): OutcomeCloseInput | null {
  if (position.state !== "recovery_needed" || position.blocked_reason !== "send_failed" || record.surfaced_state === "recovery_needed") {
    return null;
  }
  return {
    state: "attempted_failed",
    evidence_kind: "regressed_to_recovery",
    acted_at: position.acted_at ?? observedAt,
    closed_at: observedAt,
  };
}

export function trackReviewApprovalFlowCalibration(
  service: ServiceLike,
  input: {
    flow: ReviewApprovalFlowSummary;
    outbound_groups: OutboundAutopilotGroup[];
  },
): ReviewApprovalFlowSummary {
  if (!hasOutcomeStorage(service)) {
    return {
      ...input.flow,
      calibration: input.flow.eligible ? { ...emptyCalibration(), eligible: true } : emptyCalibration(),
    };
  }

  const observedAt = nowIso();
  const currentKey = targetKey(input.flow.target_type, input.flow.target_id);
  const openRecords = service.db.listReviewApprovalFlowOutcomes({ state: "open", limit: 100 });

  for (const record of openRecords) {
    const position = currentPositionForRecord(service, record, input.outbound_groups);
    const helpful = helpfulClosure(record, position, observedAt);
    if (helpful) {
      closeRecord(service, record, helpful);
      continue;
    }
    const failed = failureClosure(record, position, observedAt);
    if (failed) {
      closeRecord(service, record, failed);
      continue;
    }
    if (currentKey && recordKey(record) !== currentKey) {
      closeRecord(service, record, {
        state: "superseded",
        evidence_kind: "superseded",
        acted_at: null,
        closed_at: observedAt,
      });
      continue;
    }
    if (shouldExpire(record, observedAt)) {
      closeRecord(service, record, {
        state: "expired",
        evidence_kind: "timed_out",
        acted_at: null,
        closed_at: observedAt,
      });
    }
  }

  ensureOpenRecord(service, { flow: input.flow, observed_at: observedAt });
  const since = new Date(Date.now() - REVIEW_APPROVAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const records = service.db.listReviewApprovalFlowOutcomes({
    states: ["helpful", "attempted_failed", "superseded", "expired"],
    since,
    limit: 200,
  });
  return {
    ...input.flow,
    calibration: input.flow.eligible ? buildReviewApprovalFlowCalibrationSummary(records) : emptyCalibration(),
  };
}
