import type {
  ApprovalRequest,
  AssistantActionItem,
  AssistantActionQueueReport,
  DraftArtifact,
  OutboundAutopilotGroup,
  ReviewApprovalFlowState,
  ReviewApprovalFlowSummary,
  ReviewItem,
  ServiceStatusReport,
} from "../types.js";

function emptyReviewApprovalFlowSummary(): ReviewApprovalFlowSummary {
  return {
    eligible: false,
    state: "caught_up",
    summary: "No prepared review or approval handoff is currently leading.",
    why_now: null,
    primary_command: null,
    target_type: null,
    target_id: null,
    review_id: null,
    approval_id: null,
    outbound_group_id: null,
    assistant_action_id: null,
    supporting_summary: null,
  };
}

interface ReviewApprovalFlowCandidate {
  state: Exclude<ReviewApprovalFlowState, "caught_up">;
  summary: string;
  why_now: string;
  primary_command: string;
  target_type: string;
  target_id: string;
  review_id: string | null;
  approval_id: string | null;
  outbound_group_id: string | null;
}

function matchesCandidate(action: AssistantActionItem | null, candidate: ReviewApprovalFlowCandidate): boolean {
  if (!action) {
    return false;
  }
  if (action.target_type && action.target_type === candidate.target_type && action.target_id === candidate.target_id) {
    return true;
  }
  return false;
}

function actionableAssistantAction(queue: AssistantActionQueueReport | null | undefined): AssistantActionItem | null {
  return queue?.actions.find((action) => action.state === "proposed" || action.state === "awaiting_review") ?? null;
}

function draftLabel(draft: DraftArtifact | undefined): string {
  const subject = draft?.subject?.trim();
  return subject ? `Draft "${subject}"` : "This prepared draft";
}

function buildGroupCandidate(group: OutboundAutopilotGroup): ReviewApprovalFlowCandidate {
  if (group.state === "blocked") {
    return {
      state: "recovery_needed",
      summary: "Recovery is needed before this prepared work can move forward.",
      why_now: group.why_now,
      primary_command: `personal-ops outbound autopilot --group ${group.group_id}`,
      target_type: "outbound_autopilot_group",
      target_id: group.group_id,
      review_id: group.review_item_ids[0] ?? null,
      approval_id: group.approval_ids[0] ?? null,
      outbound_group_id: group.group_id,
    };
  }
  if (group.state === "review_pending") {
    return {
      state: "review_needed",
      summary: "This prepared work is waiting for operator review.",
      why_now: group.why_now,
      primary_command: `personal-ops outbound autopilot --group ${group.group_id}`,
      target_type: "outbound_autopilot_group",
      target_id: group.group_id,
      review_id: group.review_item_ids[0] ?? null,
      approval_id: null,
      outbound_group_id: group.group_id,
    };
  }
  if (group.state === "approval_ready" || group.state === "approval_pending") {
    return {
      state: "approval_needed",
      summary: "This prepared work is ready for approval handoff.",
      why_now: group.why_now,
      primary_command: `personal-ops outbound autopilot --group ${group.group_id}`,
      target_type: "outbound_autopilot_group",
      target_id: group.group_id,
      review_id: group.review_item_ids[0] ?? null,
      approval_id: group.approval_ids[0] ?? null,
      outbound_group_id: group.group_id,
    };
  }
  return {
    state: "send_ready",
    summary: "This prepared work is approved and ready to send.",
    why_now: group.why_now,
    primary_command: `personal-ops outbound autopilot --group ${group.group_id}`,
    target_type: "outbound_autopilot_group",
    target_id: group.group_id,
    review_id: group.review_item_ids[0] ?? null,
    approval_id: group.approval_ids[0] ?? null,
    outbound_group_id: group.group_id,
  };
}

function buildReviewCandidate(review: ReviewItem, draft: DraftArtifact | undefined): ReviewApprovalFlowCandidate {
  const targetType = draft ? "draft_artifact" : "review_item";
  const targetId = draft?.artifact_id ?? review.review_id;
  return {
    state: "review_needed",
    summary: `${draftLabel(draft)} is waiting for operator review.`,
    why_now:
      review.state === "opened"
        ? "Review is already in progress, so resolving it keeps the prepared handoff moving."
        : "The draft is already prepared, so review is the next bounded step before approval or send.",
    primary_command:
      review.state === "opened"
        ? `personal-ops review resolve ${review.review_id} --note "Reviewed"`
        : review.state === "pending"
          ? `personal-ops review open ${review.review_id}`
          : `personal-ops review show ${review.review_id}`,
    target_type: targetType,
    target_id: targetId,
    review_id: review.review_id,
    approval_id: null,
    outbound_group_id: null,
  };
}

function buildApprovalCandidate(
  approval: ApprovalRequest,
  draft: DraftArtifact | undefined,
  state: "recovery_needed" | "approval_needed" | "send_ready",
): ReviewApprovalFlowCandidate {
  const base = draftLabel(draft);
  if (state === "recovery_needed") {
    return {
      state,
      summary: "Recovery is needed before this prepared work can move forward.",
      why_now:
        approval.last_error_message?.trim() ||
        "A previous send attempt failed, so recover this approval before returning to the normal handoff.",
      primary_command: `personal-ops approval show ${approval.approval_id}`,
      target_type: "approval_request",
      target_id: approval.approval_id,
      review_id: null,
      approval_id: approval.approval_id,
      outbound_group_id: null,
    };
  }
  if (state === "approval_needed") {
    return {
      state,
      summary: `${base} is ready for approval handoff.`,
      why_now: "Approval decisions stay explicitly operator-owned before send can continue.",
      primary_command: `personal-ops approval show ${approval.approval_id}`,
      target_type: "approval_request",
      target_id: approval.approval_id,
      review_id: null,
      approval_id: approval.approval_id,
      outbound_group_id: null,
    };
  }
  return {
    state,
    summary: `${base} is approved and ready to send.`,
    why_now: "Approval is complete, so send is the remaining operator-owned finish step.",
    primary_command: `personal-ops approval show ${approval.approval_id}`,
    target_type: "approval_request",
    target_id: approval.approval_id,
    review_id: null,
    approval_id: approval.approval_id,
    outbound_group_id: null,
  };
}

function reviewSortValue(review: ReviewItem): string {
  const stateRank = review.state === "opened" ? "0" : review.state === "pending" ? "1" : "2";
  return `${stateRank}:${review.created_at}:${review.review_id}`;
}

function approvalSortValue(approval: ApprovalRequest): string {
  return `${approval.requested_at}:${approval.approval_id}`;
}

function pickFlowCandidate(groups: OutboundAutopilotGroup[], reviews: ReviewItem[], approvals: ApprovalRequest[], drafts: DraftArtifact[]) {
  const draftsById = new Map(drafts.map((draft) => [draft.artifact_id, draft]));
  const groupedReviewIds = new Set(groups.flatMap((group) => group.review_item_ids));
  const groupedApprovalIds = new Set(groups.flatMap((group) => group.approval_ids));

  const buckets: ReviewApprovalFlowCandidate[][] = [
    [
      ...groups.filter((group) => group.state === "blocked").map((group) => buildGroupCandidate(group)),
      ...approvals
        .filter((approval) => approval.state === "send_failed" && !groupedApprovalIds.has(approval.approval_id))
        .sort((left, right) => approvalSortValue(left).localeCompare(approvalSortValue(right)))
        .map((approval) => buildApprovalCandidate(approval, draftsById.get(approval.artifact_id), "recovery_needed")),
    ],
    [
      ...groups.filter((group) => group.state === "review_pending").map((group) => buildGroupCandidate(group)),
      ...reviews
        .filter((review) => ["pending", "opened"].includes(review.state) && !groupedReviewIds.has(review.review_id))
        .sort((left, right) => reviewSortValue(left).localeCompare(reviewSortValue(right)))
        .map((review) => buildReviewCandidate(review, draftsById.get(review.artifact_id))),
    ],
    [
      ...groups
        .filter((group) => group.state === "approval_ready" || group.state === "approval_pending")
        .map((group) => buildGroupCandidate(group)),
      ...approvals
        .filter((approval) => approval.state === "pending" && !groupedApprovalIds.has(approval.approval_id))
        .sort((left, right) => approvalSortValue(left).localeCompare(approvalSortValue(right)))
        .map((approval) => buildApprovalCandidate(approval, draftsById.get(approval.artifact_id), "approval_needed")),
    ],
    [
      ...groups.filter((group) => group.state === "send_ready").map((group) => buildGroupCandidate(group)),
      ...approvals
        .filter((approval) => approval.state === "approved" && !groupedApprovalIds.has(approval.approval_id))
        .sort((left, right) => approvalSortValue(left).localeCompare(approvalSortValue(right)))
        .map((approval) => buildApprovalCandidate(approval, draftsById.get(approval.artifact_id), "send_ready")),
    ],
  ];
  const primary = buckets.find((bucket) => bucket.length > 0)?.[0] ?? null;
  if (!primary) {
    return { primary: null, supporting: null };
  }
  const supporting =
    buckets
      .flat()
      .find(
        (candidate) =>
          !(candidate.target_type === primary.target_type && candidate.target_id === primary.target_id) &&
          candidate.summary !== primary.summary,
      ) ?? null;
  return { primary, supporting };
}

export function buildReviewApprovalFlowSummary(input: {
  reviews: ReviewItem[];
  approvals: ApprovalRequest[];
  drafts: DraftArtifact[];
  outbound_groups: OutboundAutopilotGroup[];
  assistant_queue?: AssistantActionQueueReport | null;
}): ReviewApprovalFlowSummary {
  const { primary, supporting } = pickFlowCandidate(
    input.outbound_groups,
    input.reviews,
    input.approvals,
    input.drafts,
  );
  if (!primary) {
    return emptyReviewApprovalFlowSummary();
  }
  const topAssistantAction = actionableAssistantAction(input.assistant_queue);
  return {
    eligible: true,
    state: primary.state,
    summary: primary.summary,
    why_now: primary.why_now,
    primary_command: primary.primary_command,
    target_type: primary.target_type,
    target_id: primary.target_id,
    review_id: primary.review_id,
    approval_id: primary.approval_id,
    outbound_group_id: primary.outbound_group_id,
    assistant_action_id: matchesCandidate(topAssistantAction, primary) ? topAssistantAction?.action_id ?? null : null,
    supporting_summary: supporting?.summary ?? null,
  };
}

function actionMatchesFlow(action: AssistantActionItem, flow: ReviewApprovalFlowSummary): boolean {
  if (!flow.eligible) {
    return false;
  }
  if (flow.assistant_action_id && action.action_id === flow.assistant_action_id) {
    return true;
  }
  return Boolean(
    flow.target_type &&
      flow.target_id &&
      action.target_type === flow.target_type &&
      action.target_id === flow.target_id,
  );
}

function workspaceHomeMatchesFlow(status: ServiceStatusReport, flow: ReviewApprovalFlowSummary): boolean {
  if (!flow.eligible) {
    return false;
  }
  if (flow.assistant_action_id && status.workspace_home.assistant_action_id === flow.assistant_action_id) {
    return true;
  }
  return false;
}

export function applyReviewApprovalFlowPayloads(input: {
  status: ServiceStatusReport;
  assistant_queue?: AssistantActionQueueReport | null;
}): {
  status: ServiceStatusReport;
  assistant_queue: AssistantActionQueueReport | null;
} {
  const flow = input.status.review_approval_flow ?? emptyReviewApprovalFlowSummary();
  const workspace_home =
    workspaceHomeMatchesFlow(input.status, flow)
      ? {
          ...input.status.workspace_home,
          summary: flow.summary,
          why_now: flow.why_now,
          primary_command: flow.primary_command,
          secondary_summary: flow.supporting_summary ?? input.status.workspace_home.secondary_summary,
          review_approval_flow: flow,
        }
      : {
          ...input.status.workspace_home,
          review_approval_flow: flow,
        };
  const status: ServiceStatusReport = {
    ...input.status,
    review_approval_flow: flow,
    workspace_home,
  };
  const assistant_queue = input.assistant_queue
    ? {
        ...input.assistant_queue,
        review_approval_flow: flow,
        actions: input.assistant_queue.actions.map((action) =>
          actionMatchesFlow(action, flow) ? { ...action, review_approval_flow: flow } : action,
        ),
      }
    : null;
  return { status, assistant_queue };
}
