import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildReviewApprovalPresentation,
  reviewApprovalCalibrationNoteText,
  reviewApprovalConsoleFlowNoteText,
  reviewApprovalSupportingNoteText,
  reviewApprovalSurfaceAdjustmentGate,
} from "../src/review-approval-presentation.js";
import type { ReviewApprovalFlowSummary } from "../src/types.js";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function buildFlow(overrides: Partial<ReviewApprovalFlowSummary> = {}): ReviewApprovalFlowSummary {
  return {
    eligible: true,
    state: "approval_needed",
    summary: "This prepared work is ready for approval handoff.",
    why_now: "The grouped outbound path is already staged and should stay the primary decision surface.",
    primary_command: "personal-ops outbound autopilot --group outbound-1",
    target_type: "outbound_autopilot_group",
    target_id: "outbound-1",
    review_id: null,
    approval_id: "approval-1",
    outbound_group_id: "outbound-1",
    assistant_action_id: "assistant.review-top-attention",
    supporting_summary: "Open review only if the grouped handoff blocks.",
    calibration: {
      eligible: true,
      status: "mixed",
      recommendation_kind: "consider_more_batching",
      summary: "Recent outcomes are mixed; this handoff sometimes moves forward and sometimes stalls or gets replaced.",
      recommendation_summary:
        "Recent stalls lean toward singleton handoffs, so grouping more review and approval work may be the next thing to test.",
      sample_count_14d: 4,
      helpful_count_14d: 2,
      attempted_failed_count_14d: 0,
      superseded_count_14d: 1,
      expired_count_14d: 1,
      helpful_rate_14d: 0.5,
      review_needed_count_14d: 1,
      approval_needed_count_14d: 2,
      send_ready_count_14d: 1,
      recovery_needed_count_14d: 0,
    },
    ...overrides,
  };
}

test("phase 34 proof gate stays closed when calibration does not justify a decision-surface adjustment", () => {
  const flow = buildFlow();
  assert.equal(reviewApprovalSurfaceAdjustmentGate(flow), false);
  const presentation = buildReviewApprovalPresentation(flow, {
    workspaceWhyNow: flow.why_now,
    workspacePrimaryCommand: flow.primary_command,
  });
  assert.equal(presentation?.gateSatisfied, false);
  assert.equal(presentation?.whyNow, null);
  assert.equal(presentation?.primaryCommand, null);
  assert.equal(presentation?.promotedSupportingSummary, null);
  assert.match(presentation?.calibrationSummary ?? "", /Recent outcomes are mixed/i);
  assert.equal(reviewApprovalConsoleFlowNoteText(flow), "This is the current review and approval focus.");
  assert.equal(reviewApprovalSupportingNoteText(flow), null);
  assert.match(reviewApprovalCalibrationNoteText(flow) ?? "", /Recent outcomes are mixed/i);
});

test("phase 34 proof gate only opens for attention-needed decision-surface adjustments with enough evidence", () => {
  const flow = buildFlow({
    calibration: {
      ...buildFlow().calibration!,
      status: "attention_needed",
      recommendation_kind: "consider_decision_surface_adjustment",
      summary:
        "Recent outcomes keep stalling at the same handoff, so the current decision surface still looks too easy to pass over.",
      recommendation_summary:
        "The same gap keeps repeating, so the next thing to test is a small decision-surface adjustment instead of more batching or review tuning.",
      sample_count_14d: 4,
    },
  });
  assert.equal(reviewApprovalSurfaceAdjustmentGate(flow), true);
  const presentation = buildReviewApprovalPresentation(flow);
  assert.equal(presentation?.gateSatisfied, true);
  assert.equal(presentation?.promotedSupportingSummary, "Open review only if the grouped handoff blocks.");
  assert.match(presentation?.calibrationSummary ?? "", /current decision surface/i);
  assert.match(presentation?.calibrationRecommendation ?? "", /decision-surface adjustment/i);
  assert.equal(reviewApprovalConsoleFlowNoteText(flow), "Open review only if the grouped handoff blocks.");
  assert.equal(reviewApprovalSupportingNoteText(flow), "Open review only if the grouped handoff blocks.");
});

test("phase 34 mcp review and approval tools keep the bounded contract", () => {
  const source = fs.readFileSync(path.join(repoRoot(), "src", "mcp-server.ts"), "utf8");
  assert.match(source, /name: "approval_request_create"/);
  assert.match(source, /required: \["artifact_id"\]/);
  assert.match(source, /name: "approval_request_approve"/);
  assert.match(source, /required: \["approval_id", "note", "confirmation_token"\]/);
  assert.match(source, /name: "approval_request_send"/);
  assert.match(source, /required: \["approval_id", "note", "confirmation_token"\]/);
  assert.match(source, /name: "review_queue_list"/);
  assert.match(source, /name: "review_queue_pending"/);
  assert.match(source, /name: "review_queue_get"/);
});
