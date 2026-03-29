import { createHash, randomUUID } from "node:crypto";
import type {
  ApprovalRequest,
  ClientIdentity,
  DraftArtifact,
  OutboundAutopilotActionResult,
  OutboundAutopilotGroup,
  OutboundAutopilotGroupKind,
  OutboundAutopilotGroupState,
  OutboundAutopilotReport,
  ReviewItem,
  WorkflowScoreBand,
} from "../types.js";

const MAX_ACTIVE_GROUPS = 3;
const MAX_GROUP_DRAFTS = 3;

type BuildOptions = { httpReachable: boolean };

interface GroupComputation {
  group: OutboundAutopilotGroup;
  score: number;
}

function outboundGroupCommand(groupId: string): string {
  return `personal-ops outbound autopilot --group ${groupId}`;
}

function outboundGroupRequestApprovalCommand(groupId: string): string {
  return `${outboundGroupCommand(groupId)} --request-approval --note "<reason>"`;
}

function outboundGroupApproveCommand(groupId: string): string {
  return `${outboundGroupCommand(groupId)} --approve --note "<reason>"`;
}

function outboundGroupSendCommand(groupId: string): string {
  return `${outboundGroupCommand(groupId)} --send --note "<reason>"`;
}

function draftCommand(artifactId: string): string {
  return `personal-ops mail draft show ${artifactId}`;
}

function singleDraftGroupId(artifactId: string): string {
  return `single_draft:${artifactId}`;
}

function scoreBandFor(score: number): WorkflowScoreBand {
  if (score >= 860) {
    return "highest";
  }
  if (score >= 620) {
    return "high";
  }
  return "medium";
}

function latestReviewForArtifact(service: any, artifactId: string): ReviewItem | null {
  return service.db.getLatestReviewItemForArtifact(artifactId) ?? null;
}

function activeApprovalForArtifact(service: any, artifactId: string): ApprovalRequest | null {
  return service.db.getActiveApprovalForArtifact(artifactId) ?? null;
}

function activeApprovals(approvals: ApprovalRequest[]): ApprovalRequest[] {
  return approvals.filter((approval) => !["rejected", "sent", "expired"].includes(approval.state));
}

function parseKindFromAssistantGroupId(groupId: string): OutboundAutopilotGroupKind | null {
  if (groupId.startsWith("needs_reply:")) {
    return "reply_block";
  }
  if (groupId.startsWith("waiting_to_nudge:")) {
    return "followup_block";
  }
  return null;
}

function stateForGroup(input: {
  drafts: DraftArtifact[];
  reviews: Array<ReviewItem | null>;
  approvals: ApprovalRequest[];
  sendEnabled: boolean;
}): OutboundAutopilotGroupState {
  const approvals = activeApprovals(input.approvals);
  if (input.drafts.length === 0) {
    return "completed";
  }
  if (input.drafts.every((draft) => draft.status === "sent" || draft.status === "rejected")) {
    return "completed";
  }
  if (input.drafts.some((draft) => draft.status === "send_failed")) {
    return "blocked";
  }
  if (input.reviews.some((review, index) => input.drafts[index]?.review_state !== "resolved" || (review && review.state !== "resolved"))) {
    return "review_pending";
  }
  if (approvals.length === 0) {
    return "approval_ready";
  }
  if (approvals.some((approval) => approval.state === "pending")) {
    return "approval_pending";
  }
  if (approvals.some((approval) => approval.state === "approved")) {
    return input.sendEnabled ? "send_ready" : "blocked";
  }
  if (approvals.some((approval) => approval.state === "sending")) {
    return "approval_pending";
  }
  if (approvals.some((approval) => approval.state === "send_failed")) {
    return "blocked";
  }
  return "blocked";
}

function scoreForGroup(kind: OutboundAutopilotGroupKind, state: OutboundAutopilotGroupState): number {
  let score =
    state === "send_ready"
      ? 920
      : state === "approval_ready"
        ? 820
        : state === "approval_pending"
          ? 760
          : state === "review_pending"
            ? 640
            : state === "blocked"
              ? 440
              : 240;
  if (kind === "reply_block") {
    score += 30;
  } else if (kind === "followup_block") {
    score += 10;
  }
  return score;
}

function summaryForGroup(
  kind: OutboundAutopilotGroupKind,
  state: OutboundAutopilotGroupState,
  draftCount: number,
  sendReadyCount: number,
): string {
  const noun =
    kind === "reply_block"
      ? "reply"
      : kind === "followup_block"
        ? "follow-up"
        : "draft";
  if (state === "review_pending") {
    return `Review ${draftCount} prepared ${noun} draft${draftCount === 1 ? "" : "s"} before outbound finish-work can continue.`;
  }
  if (state === "approval_ready") {
    return `${draftCount} reviewed ${noun} draft${draftCount === 1 ? "" : "s"} are ready for grouped approval request.`;
  }
  if (state === "approval_pending") {
    return `${draftCount} ${noun} draft${draftCount === 1 ? "" : "s"} already have approval requests pending.`;
  }
  if (state === "send_ready") {
    return `${sendReadyCount} approved ${noun} draft${sendReadyCount === 1 ? "" : "s"} are ready to send as one outbound step.`;
  }
  if (state === "completed") {
    return `This ${noun} group is already complete.`;
  }
  return `This ${noun} group is blocked until send gating or approval recovery is resolved.`;
}

function whyNowForGroup(
  kind: OutboundAutopilotGroupKind,
  state: OutboundAutopilotGroupState,
  sendEnabled: boolean,
): string {
  if (state === "review_pending") {
    return "The drafts are already staged, so the shortest path is to finish review instead of rebuilding context.";
  }
  if (state === "approval_ready") {
    return "Review is complete, so grouped approval request is the next bounded step before anything can be sent.";
  }
  if (state === "approval_pending") {
    return "These drafts are already in approval, so grouped approval is shorter than working them one by one.";
  }
  if (state === "send_ready") {
    return "Everything is reviewed and approved, so send is now a single explicit finish-work step.";
  }
  if (state === "completed") {
    return "The outbound work is already finished for this group.";
  }
  return sendEnabled
    ? "Approval recovery is needed before this group can move forward again."
    : "Send is still gated until a CLI-managed send window is enabled.";
}

function signalsForGroup(
  kind: OutboundAutopilotGroupKind,
  state: OutboundAutopilotGroupState,
  sendEnabled: boolean,
  approvals: ApprovalRequest[],
): string[] {
  const signals = new Set<string>([kind, state]);
  if (!sendEnabled) {
    signals.add("send_window_blocked");
  }
  for (const approval of approvals) {
    signals.add(`approval_${approval.state}`);
  }
  return [...signals];
}

function nextCommandsForGroup(group: Pick<OutboundAutopilotGroup, "group_id" | "state">): string[] {
  if (group.state === "review_pending") {
    return [outboundGroupCommand(group.group_id), "personal-ops review list"];
  }
  if (group.state === "approval_ready") {
    return [outboundGroupCommand(group.group_id), outboundGroupRequestApprovalCommand(group.group_id)];
  }
  if (group.state === "approval_pending") {
    return [outboundGroupCommand(group.group_id), outboundGroupApproveCommand(group.group_id)];
  }
  if (group.state === "send_ready") {
    return [outboundGroupCommand(group.group_id), outboundGroupSendCommand(group.group_id)];
  }
  if (group.state === "blocked") {
    return [outboundGroupCommand(group.group_id), "personal-ops send-window status"];
  }
  return [outboundGroupCommand(group.group_id)];
}

function buildGroup(
  input: {
    groupId: string;
    kind: OutboundAutopilotGroupKind;
    sourceGroupId?: string;
    drafts: DraftArtifact[];
    reviews: Array<ReviewItem | null>;
    approvals: ApprovalRequest[];
    sendEnabled: boolean;
  },
): GroupComputation {
  const state = stateForGroup({
    drafts: input.drafts,
    reviews: input.reviews,
    approvals: input.approvals,
    sendEnabled: input.sendEnabled,
  });
  const score = scoreForGroup(input.kind, state);
  const group: OutboundAutopilotGroup = {
    group_id: input.groupId,
    kind: input.kind,
    state,
    summary: summaryForGroup(input.kind, state, input.drafts.length, input.approvals.filter((approval) => approval.state === "approved").length),
    why_now: whyNowForGroup(input.kind, state, input.sendEnabled),
    score_band: scoreBandFor(score),
    signals: signalsForGroup(input.kind, state, input.sendEnabled, input.approvals),
    source_group_id: input.sourceGroupId,
    review_item_ids: input.reviews.filter((review): review is ReviewItem => Boolean(review)).map((review) => review.review_id),
    draft_artifact_ids: input.drafts.map((draft) => draft.artifact_id),
    approval_ids: input.approvals.map((approval) => approval.approval_id),
    send_ready_count: input.approvals.filter((approval) => approval.state === "approved").length,
    next_commands: nextCommandsForGroup({ group_id: input.groupId, state }),
  };
  return { group, score };
}

function compareGroups(left: GroupComputation, right: GroupComputation): number {
  return right.score - left.score || left.group.group_id.localeCompare(right.group.group_id);
}

async function buildComputations(service: any, options: BuildOptions): Promise<{
  readiness: any;
  sendWindow: OutboundAutopilotReport["send_window"];
  computations: GroupComputation[];
}> {
  const [status] = await Promise.all([
    service.getStatusReport(options),
  ]);
  const sendStatus = service.getSendWindowStatus();
  const sendWindow = {
    active: Boolean(sendStatus.active_window),
    effective_send_enabled: sendStatus.effective_send_enabled,
    permanent_send_enabled: sendStatus.permanent_send_enabled,
    ...(sendStatus.active_window ? { window: sendStatus.active_window } : {}),
  };

  const computations: GroupComputation[] = [];
  const representedDraftIds = new Set<string>();
  const draftsByAssistantGroup = new Map<string, DraftArtifact[]>();

  for (const draft of service.db.listDraftArtifacts() as DraftArtifact[]) {
    if (!draft.assistant_generated || !draft.assistant_group_id) {
      continue;
    }
    const kind = parseKindFromAssistantGroupId(draft.assistant_group_id);
    if (!kind) {
      continue;
    }
    const existing = draftsByAssistantGroup.get(draft.assistant_group_id) ?? [];
    existing.push(draft);
    draftsByAssistantGroup.set(draft.assistant_group_id, existing);
  }

  for (const [assistantGroupId, groupedDrafts] of draftsByAssistantGroup.entries()) {
    const kind = parseKindFromAssistantGroupId(assistantGroupId);
    if (!kind) {
      continue;
    }
    const drafts = groupedDrafts
      .slice()
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, MAX_GROUP_DRAFTS);
    const reviews = drafts.map((draft: DraftArtifact) => latestReviewForArtifact(service, draft.artifact_id));
    const approvals = drafts
      .map((draft: DraftArtifact) => activeApprovalForArtifact(service, draft.artifact_id))
      .filter((approval: ApprovalRequest | null): approval is ApprovalRequest => Boolean(approval));
    computations.push(
      buildGroup({
        groupId: assistantGroupId,
        kind,
        sourceGroupId: assistantGroupId,
        drafts,
        reviews,
        approvals,
        sendEnabled: sendStatus.effective_send_enabled,
      }),
    );
    for (const draft of drafts) {
      representedDraftIds.add(draft.artifact_id);
    }
  }

  const approvals = service.listApprovalQueue({ limit: 100 }) as ApprovalRequest[];
  for (const approval of approvals) {
    if (["rejected", "sent", "expired"].includes(approval.state)) {
      continue;
    }
    if (representedDraftIds.has(approval.artifact_id)) {
      continue;
    }
    const draft = service.db.getDraftArtifact(approval.artifact_id);
    if (!draft) {
      continue;
    }
    const reviews = [latestReviewForArtifact(service, draft.artifact_id)];
    computations.push(
      buildGroup({
        groupId: singleDraftGroupId(draft.artifact_id),
        kind: "single_draft",
        drafts: [draft],
        reviews,
        approvals: [approval],
        sendEnabled: sendStatus.effective_send_enabled,
      }),
    );
    representedDraftIds.add(draft.artifact_id);
  }

  computations.sort(compareGroups);
  return {
    readiness: status.state,
    sendWindow,
    computations,
  };
}

export async function buildOutboundAutopilotReport(service: any, options: BuildOptions): Promise<OutboundAutopilotReport> {
  const { readiness, sendWindow, computations } = await buildComputations(service, options);
  const groups = computations
    .filter((entry) => entry.group.state !== "completed")
    .slice(0, MAX_ACTIVE_GROUPS)
    .map((entry) => entry.group);
  const approvalReady = groups.filter((group) => group.state === "approval_ready").length;
  const sendReady = groups.filter((group) => group.state === "send_ready").length;
  return {
    generated_at: new Date().toISOString(),
    readiness,
    summary:
      groups.length === 0
        ? "No outbound finish-work groups are active right now."
        : `${groups.length} outbound group${groups.length === 1 ? "" : "s"} are active, with ${approvalReady} ready for approval and ${sendReady} ready to send.`,
    top_item_summary: groups[0]?.summary ?? null,
    send_window: sendWindow,
    groups,
  };
}

export async function getOutboundAutopilotGroupDetail(service: any, groupId: string): Promise<OutboundAutopilotGroup> {
  const { computations } = await buildComputations(service, { httpReachable: true });
  const group = computations.find((item) => item.group.group_id === groupId)?.group;
  if (!group) {
    throw new Error(`Outbound autopilot group ${groupId} is not available right now.`);
  }
  return group;
}

function assertConfirmed(confirmed: boolean, action: string): void {
  if (!confirmed) {
    throw new Error(`Explicit confirmation is required to ${action}.`);
  }
}

function recordGroupAudit(
  service: any,
  identity: ClientIdentity,
  groupId: string,
  action: string,
  outcome: "success" | "failure" | "blocked",
  metadata: Record<string, unknown>,
): void {
  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action,
    target_type: "outbound_autopilot_group",
    target_id: groupId,
    outcome,
    metadata: {
      correlation_id: randomUUID(),
      ...metadata,
    },
  });
}

export async function requestApprovalForOutboundGroup(
  service: any,
  identity: ClientIdentity,
  groupId: string,
  note: string,
): Promise<OutboundAutopilotActionResult> {
  service.assertOperatorOnly(identity, "request approval for this outbound group");
  service.assertRequiredNote(note, "request approval");
  service.db.registerClient(identity);
  const group = await getOutboundAutopilotGroupDetail(service, groupId);
  if (group.state === "review_pending") {
    throw new Error("Resolve the remaining draft review work before requesting approval for this group.");
  }

  const completedApprovalIds: string[] = [];
  for (const artifactId of group.draft_artifact_ids) {
    if (service.db.getActiveApprovalForArtifact(artifactId)) {
      continue;
    }
    const approval = service.requestApproval(identity, artifactId, note.trim());
    completedApprovalIds.push(approval.approval_id);
  }
  recordGroupAudit(service, identity, groupId, "outbound_autopilot_group_request_approval", "success", {
    note: note.trim(),
    approval_ids: completedApprovalIds,
    draft_artifact_ids: group.draft_artifact_ids,
  });
  return {
    group: await getOutboundAutopilotGroupDetail(service, groupId),
    summary:
      completedApprovalIds.length === 0
        ? "No new approval requests were needed for this outbound group."
        : `Requested approval for ${completedApprovalIds.length} draft${completedApprovalIds.length === 1 ? "" : "s"}.`,
    completed_approval_ids: completedApprovalIds,
  };
}

async function runGroupedApprovalAction(
  service: any,
  identity: ClientIdentity,
  groupId: string,
  note: string,
  confirmed: boolean,
  kind: "approve" | "send",
): Promise<OutboundAutopilotActionResult> {
  service.assertOperatorOnly(identity, `${kind} this outbound group`);
  service.assertRequiredNote(note, kind);
  assertConfirmed(confirmed, kind);
  service.db.registerClient(identity);
  const group = await getOutboundAutopilotGroupDetail(service, groupId);
  const completedApprovalIds: string[] = [];
  let failedApprovalId: string | undefined;
  let failedReason: string | undefined;

  const actionableApprovalIds = group.approval_ids.filter((approvalId) => {
    const detail = service.getApprovalDetail(approvalId);
    return kind === "approve"
      ? detail.approval_request.state === "pending"
      : detail.approval_request.state === "approved";
  });
  if (kind === "send" && !service.getSendWindowStatus().effective_send_enabled) {
    recordGroupAudit(service, identity, groupId, "outbound_autopilot_group_send", "blocked", {
      note: note.trim(),
      send_window_enabled: false,
      approval_ids: actionableApprovalIds,
    });
    throw new Error("Sending is still blocked until a CLI-managed send window is enabled.");
  }

  for (const approvalId of actionableApprovalIds) {
    try {
      if (kind === "approve") {
        service.approveRequest(identity, approvalId, note.trim());
      } else {
        await service.sendApprovedDraft(identity, approvalId, note.trim());
      }
      completedApprovalIds.push(approvalId);
    } catch (error) {
      failedApprovalId = approvalId;
      failedReason = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  recordGroupAudit(
    service,
    identity,
    groupId,
    kind === "approve" ? "outbound_autopilot_group_approve" : "outbound_autopilot_group_send",
    failedApprovalId ? "failure" : "success",
    {
      note: note.trim(),
      completed_approval_ids: completedApprovalIds,
      failed_approval_id: failedApprovalId ?? null,
      failed_reason: failedReason ?? null,
    },
  );

  return {
    group: await getOutboundAutopilotGroupDetail(service, groupId),
    summary:
      failedApprovalId
        ? `${kind === "approve" ? "Approval" : "Send"} stopped after ${completedApprovalIds.length} item${completedApprovalIds.length === 1 ? "" : "s"}.`
        : `${kind === "approve" ? "Approved" : "Sent"} ${completedApprovalIds.length} item${completedApprovalIds.length === 1 ? "" : "s"} from this group.`,
    completed_approval_ids: completedApprovalIds,
    ...(failedApprovalId ? { failed_approval_id: failedApprovalId, failed_reason: failedReason } : {}),
  };
}

export async function approveOutboundGroup(
  service: any,
  identity: ClientIdentity,
  groupId: string,
  note: string,
  confirmed: boolean,
): Promise<OutboundAutopilotActionResult> {
  return runGroupedApprovalAction(service, identity, groupId, note, confirmed, "approve");
}

export async function sendOutboundGroup(
  service: any,
  identity: ClientIdentity,
  groupId: string,
  note: string,
  confirmed: boolean,
): Promise<OutboundAutopilotActionResult> {
  return runGroupedApprovalAction(service, identity, groupId, note, confirmed, "send");
}

export function outboundGroupActionId(group: OutboundAutopilotGroup): string {
  const digest = createHash("sha1").update(group.group_id).digest("hex").slice(0, 12);
  return `assistant.review-outbound-group:${digest}:${group.group_id}`;
}
