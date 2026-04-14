import type { ReviewApprovalFlowSummary } from "./types.js";

const PHASE_34_MIN_SAMPLE_COUNT = 4;
const DEFAULT_CONSOLE_REVIEW_APPROVAL_NOTE = "This is the current review and approval focus.";

export interface ReviewApprovalPresentation {
  eligible: boolean;
  gateSatisfied: boolean;
  whyNow: string | null;
  primaryCommand: string | null;
  promotedSupportingSummary: string | null;
  calibrationSummary: string | null;
  calibrationRecommendation: string | null;
}

export function reviewApprovalSurfaceAdjustmentGate(flow: ReviewApprovalFlowSummary | null | undefined): boolean {
  return Boolean(
    flow?.eligible &&
      flow.supporting_summary &&
      flow.calibration?.eligible &&
      flow.calibration.status === "attention_needed" &&
      flow.calibration.recommendation_kind === "consider_decision_surface_adjustment" &&
      flow.calibration.sample_count_14d >= PHASE_34_MIN_SAMPLE_COUNT,
  );
}

export function buildReviewApprovalPresentation(
  flow: ReviewApprovalFlowSummary | null | undefined,
  options: {
    workspaceWhyNow?: string | null;
    workspacePrimaryCommand?: string | null;
  } = {},
): ReviewApprovalPresentation | null {
  if (!flow?.eligible || !flow.summary) {
    return null;
  }
  const gateSatisfied = reviewApprovalSurfaceAdjustmentGate(flow);
  return {
    eligible: true,
    gateSatisfied,
    whyNow: flow.why_now && flow.why_now !== options.workspaceWhyNow ? flow.why_now : null,
    primaryCommand:
      flow.primary_command && flow.primary_command !== options.workspacePrimaryCommand ? flow.primary_command : null,
    promotedSupportingSummary: gateSatisfied ? flow.supporting_summary : null,
    calibrationSummary: flow.calibration?.eligible ? flow.calibration.summary : null,
    calibrationRecommendation: flow.calibration?.eligible ? flow.calibration.recommendation_summary : null,
  };
}

export function reviewApprovalConsoleFlowNoteText(flow: ReviewApprovalFlowSummary | null | undefined): string | null {
  const presentation = buildReviewApprovalPresentation(flow);
  if (!presentation) {
    return null;
  }
  return presentation.promotedSupportingSummary ?? DEFAULT_CONSOLE_REVIEW_APPROVAL_NOTE;
}

export function reviewApprovalCalibrationNoteText(flow: ReviewApprovalFlowSummary | null | undefined): string | null {
  const presentation = buildReviewApprovalPresentation(flow);
  if (!presentation) {
    return null;
  }
  const parts = [presentation.calibrationSummary, presentation.calibrationRecommendation].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

export function reviewApprovalSupportingNoteText(flow: ReviewApprovalFlowSummary | null | undefined): string | null {
  const presentation = buildReviewApprovalPresentation(flow);
  return presentation?.promotedSupportingSummary ?? null;
}
