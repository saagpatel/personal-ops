import type {
  ApprovalRequest,
  AssistantActionItem,
  AssistantActionQueueReport,
  AssistantActionRunReport,
  AssistantActionRunResult,
  AssistantActionState,
  DraftArtifact,
  InboxAutopilotGroup,
  OutboundAutopilotGroup,
  PlanningAutopilotBundle,
  WorkflowBundleAction,
} from "../types.js";
import { listMeetingPrepCandidates, prepareMeetingPacketActionId } from "./meeting-prep.js";

const ACTION_SYNC_WORKSPACE = "assistant.sync-workspace";
const ACTION_CREATE_SNAPSHOT = "assistant.create-snapshot";
const ACTION_REVIEW_TOP_ATTENTION = "assistant.review-top-attention";
const ACTION_REVIEW_PLANNING = "assistant.review-planning";
const ACTION_REVIEW_APPROVALS = "assistant.review-approvals";
const ACTION_REVIEW_DRAFTS = "assistant.review-drafts";

const COMPLETED_SYNC_HOURS = 1;
const COMPLETED_SNAPSHOT_HOURS = 6;

type QueueBuildOptions = { httpReachable: boolean };

interface ActionCandidate {
  action_id: string;
  title: string;
  summary: string;
  section: AssistantActionItem["section"];
  batch: boolean;
  one_click: boolean;
  review_required: boolean;
  why_now: string;
  command: string | undefined;
  target_type: string | undefined;
  target_id: string | undefined;
  signals: string[];
  blocking_reason?: string;
  satisfied: boolean;
  priority: number;
}

interface LatestRunMap {
  [actionId: string]: AssistantActionRunReport | undefined;
}

function outboundActionSummary(group: OutboundAutopilotGroup): { title: string; section: AssistantActionItem["section"]; priority: number } {
  if (group.state === "send_ready") {
    return { title: "Finish outbound send group", section: "drafts", priority: 3 };
  }
  if (group.state === "approval_ready") {
    return { title: "Request grouped outbound approval", section: "drafts", priority: 5 };
  }
  if (group.state === "approval_pending") {
    return { title: "Approve grouped outbound work", section: "approvals", priority: 7 };
  }
  return { title: "Finish outbound review group", section: "drafts", priority: 13 };
}

function hoursSince(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return (Date.now() - parsed) / (60 * 60_000);
}

function latestRunMap(service: any): LatestRunMap {
  const events = service.db.listAuditEvents({
    limit: 100,
    actions: ["assistant_action_run"],
  });
  const latest: LatestRunMap = {};
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

function actionState(input: {
  running: boolean;
  blocked: boolean;
  review_required: boolean;
  satisfied: boolean;
  latest_run: AssistantActionRunReport | undefined;
}): AssistantActionState {
  if (input.running) {
    return "running";
  }
  if (input.blocked) {
    return "blocked";
  }
  if (input.review_required) {
    return "awaiting_review";
  }
  if (input.satisfied) {
    return "completed";
  }
  if (input.latest_run?.outcome === "failure") {
    return "failed";
  }
  return "proposed";
}

function statePriority(state: AssistantActionState): number {
  switch (state) {
    case "running":
      return 0;
    case "failed":
      return 1;
    case "awaiting_review":
      return 2;
    case "proposed":
      return 3;
    case "blocked":
      return 4;
    case "completed":
      return 5;
  }
}

function completionWindowSatisfied(latestRun: AssistantActionRunReport | undefined, maxHours: number): boolean {
  const age = hoursSince(latestRun?.completed_at ?? latestRun?.started_at);
  return Boolean(latestRun && latestRun.outcome === "success" && age !== null && age <= maxHours);
}

function topAction(
  workflowAction: WorkflowBundleAction | undefined,
): Pick<ActionCandidate, "summary" | "why_now" | "command" | "target_type" | "target_id" | "signals"> {
  if (!workflowAction) {
    return {
      summary: "Open the current queue and review the top item.",
      why_now: "The assistant needs an operator decision before it can move this queue item forward.",
      command: "personal-ops worklist",
      target_type: "worklist",
      target_id: "top",
      signals: ["operator_review"],
    };
  }
  return {
    summary: workflowAction.summary,
    why_now: workflowAction.why_now ?? "The assistant surfaced this as the strongest current operator decision.",
    command: workflowAction.command,
    target_type: workflowAction.target_type,
    target_id: workflowAction.target_id,
    signals: workflowAction.signals ?? [],
  };
}

function buildQueueSummary(actions: AssistantActionItem[]): string {
  const awaitingReview = actions.filter((action) => action.state === "awaiting_review").length;
  const proposed = actions.filter((action) => action.state === "proposed").length;
  const running = actions.filter((action) => action.state === "running").length;
  const failed = actions.filter((action) => action.state === "failed").length;
  if (running > 0) {
    return `${running} assistant action${running === 1 ? "" : "s"} running now, ${awaitingReview} awaiting review.`;
  }
  if (failed > 0) {
    return `${failed} assistant action${failed === 1 ? "" : "s"} need repair, ${awaitingReview} still await review.`;
  }
  if (awaitingReview > 0) {
    return `${awaitingReview} assistant action${awaitingReview === 1 ? "" : "s"} await review and ${proposed} safe action${proposed === 1 ? "" : "s"} can run now.`;
  }
  if (proposed > 0) {
    return `${proposed} safe assistant action${proposed === 1 ? "" : "s"} can run now.`;
  }
  return "The assistant queue is caught up for now.";
}

async function buildCandidates(
  service: any,
  options: QueueBuildOptions,
): Promise<Array<AssistantActionItem & { priority: number }>> {
  const [
    worklist,
    nowNext,
    inboxAutopilot,
    outboundAutopilot,
    planningAutopilot,
    meetingPrepCandidates,
  ] = await Promise.all([
    service.getWorklistReport(options),
    service.getNowNextWorkflowReport(options),
    service.getInboxAutopilotReport(options),
    service.getOutboundAutopilotReport(options),
    service.getPlanningAutopilotReport(options),
    listMeetingPrepCandidates(service, { scope: "today" }),
  ]);
  const inbox = service.getInboxStatusReport();
  const calendar = service.getCalendarStatusReport();
  const github = service.getGithubStatusReport();
  const drive = service.getDriveStatusReport();
  const drafts: DraftArtifact[] = service.listDrafts();
  const approvals: ApprovalRequest[] = service.listApprovalQueue({ limit: 100 });
  const planningNext = service.getNextPlanningRecommendationDetail(undefined, { assistant_safe: false });
  const latestSnapshot = service.getLatestSnapshotSummary();
  const latestSnapshotAge = hoursSince(latestSnapshot?.created_at);

  const syncSignals: string[] = [];
  let syncBlockingReason: string | undefined;
  let syncSatisfied = true;
  if (!inbox.mailbox) {
    syncBlockingReason = "Connect Google mail first so the assistant can refresh local mailbox context.";
  } else {
    syncSignals.push(`mailbox_${inbox.sync?.status ?? "not_configured"}`);
    syncSatisfied = syncSatisfied && inbox.sync?.status === "ready";
  }
  if (calendar.enabled) {
    syncSignals.push(`calendar_${calendar.sync?.status ?? "not_configured"}`);
    syncSatisfied = syncSatisfied && calendar.sync?.status === "ready";
  }
  if (github.enabled) {
    syncSignals.push(`github_${github.sync_status}`);
    syncSatisfied = syncSatisfied && github.sync_status === "ready";
  }
  if (drive.enabled) {
    syncSignals.push(`drive_${drive.sync_status}`);
    syncSatisfied = syncSatisfied && drive.sync_status === "ready";
  }

  const primary = topAction(nowNext.actions[0]);
  const candidates: ActionCandidate[] = [
    {
      action_id: ACTION_SYNC_WORKSPACE,
      title: "Refresh local context",
      summary:
        "Sync mailbox, calendar, GitHub, and Drive context where available so assistant guidance uses fresh local state.",
      section: "overview",
      batch: true,
      one_click: true,
      review_required: false,
      why_now:
        syncBlockingReason
          ? "The workspace refresh path is blocked until local auth or config is repaired."
          : "This is the assistant’s lowest-risk way to refresh the whole workspace before asking you to review anything else.",
      command: `personal-ops assistant run ${ACTION_SYNC_WORKSPACE}`,
      target_type: "assistant_action",
      target_id: ACTION_SYNC_WORKSPACE,
      signals: syncSignals.length > 0 ? syncSignals : ["workspace_refresh"],
      ...(syncBlockingReason ? { blocking_reason: syncBlockingReason } : {}),
      satisfied: syncSatisfied,
      priority: 30,
    },
    {
      action_id: ACTION_CREATE_SNAPSHOT,
      title: "Create a fresh recovery snapshot",
      summary:
        latestSnapshot && latestSnapshotAge !== null
          ? `Latest snapshot ${latestSnapshot.snapshot_id} is ${latestSnapshotAge.toFixed(latestSnapshotAge >= 10 ? 0 : 1)}h old.`
          : "No recovery snapshot is recorded yet.",
      section: "backups",
      batch: false,
      one_click: true,
      review_required: false,
      why_now: "This gives the assistant a clean local recovery point before deeper workspace changes stack up.",
      command: `personal-ops assistant run ${ACTION_CREATE_SNAPSHOT}`,
      target_type: "assistant_action",
      target_id: ACTION_CREATE_SNAPSHOT,
      signals: latestSnapshot ? ["snapshot_available"] : ["snapshot_missing"],
      satisfied: latestSnapshotAge !== null && latestSnapshotAge <= COMPLETED_SNAPSHOT_HOURS,
      priority: latestSnapshotAge !== null && latestSnapshotAge <= COMPLETED_SNAPSHOT_HOURS ? 90 : 25,
    },
    {
      action_id: ACTION_REVIEW_TOP_ATTENTION,
      title: "Review the best next move",
      summary: primary.summary,
      section: "worklist",
      batch: false,
      one_click: false,
      review_required: true,
      why_now: primary.why_now,
      command: primary.command,
      target_type: primary.target_type,
      target_id: primary.target_id,
      signals: primary.signals,
      satisfied: false,
      priority: 0,
    },
  ];

  const planningBundles = planningAutopilot.bundles.slice(0, 3);
  if (planningBundles.length > 0) {
    for (const bundle of planningBundles) {
      const reviewReady = bundle.state === "awaiting_review";
      candidates.push({
        action_id: bundle.assistant_action_id,
        title: reviewReady ? "Review prepared planning bundle" : "Prepare planning bundle",
        summary: bundle.summary,
        section: "planning",
        batch: true,
        one_click: !reviewReady && bundle.state !== "blocked",
        review_required: reviewReady,
        why_now: bundle.why_now,
        command: `personal-ops planning autopilot --bundle ${bundle.bundle_id}`,
        target_type: "planning_autopilot_bundle",
        target_id: bundle.bundle_id,
        signals: bundle.signals,
        ...(bundle.state === "blocked" ? { blocking_reason: "Underlying planning context needs repair before this bundle can be prepared." } : {}),
        satisfied: bundle.state === "completed",
        priority: reviewReady ? 9 : 11,
      });
    }
  } else if (planningNext?.recommendation) {
    candidates.push({
      action_id: ACTION_REVIEW_PLANNING,
      title: "Review the next planning recommendation",
      summary: planningNext.recommendation.summary,
      section: "planning",
      batch: false,
      one_click: false,
      review_required: true,
      why_now:
        planningNext.ranking_reason ??
        "The assistant found a planning recommendation that still needs an operator decision.",
      command: `personal-ops recommendation show ${planningNext.recommendation.recommendation_id}`,
      target_type: "planning_recommendation",
      target_id: planningNext.recommendation.recommendation_id,
      signals: planningNext.trigger_signals,
      satisfied: false,
      priority: 10,
    });
  }

  const pendingApprovals = approvals.filter((approval) => approval.state === "pending");
  if (pendingApprovals.length > 0) {
    const first = pendingApprovals[0]!;
    candidates.push({
      action_id: ACTION_REVIEW_APPROVALS,
      title: "Review pending approvals",
      summary:
        pendingApprovals.length === 1
          ? "1 approval is waiting for a decision before send can continue."
          : `${pendingApprovals.length} approvals are waiting for a decision before send can continue.`,
      section: "approvals",
      batch: false,
      one_click: false,
      review_required: true,
      why_now: "Approval decisions stay review-gated, so the assistant is surfacing them as explicit operator work.",
      command: "personal-ops approval pending",
      target_type: "approval_request",
      target_id: first.approval_id,
      signals: ["approval_pending"],
      satisfied: false,
      priority: 15,
    });
  }

  if (drafts.length > 0) {
    const first = drafts[0]!;
    candidates.push({
      action_id: ACTION_REVIEW_DRAFTS,
      title: "Review prepared drafts",
      summary:
        drafts.length === 1
          ? `1 local draft is ready for operator review: ${first.subject}.`
          : `${drafts.length} local drafts are ready for operator review.`,
      section: "drafts",
      batch: false,
      one_click: false,
      review_required: true,
      why_now: "The assistant can prepare drafts, but send-adjacent work still stays explicitly review-gated.",
      command: "personal-ops mail draft list",
      target_type: "draft_artifact",
      target_id: first.artifact_id,
      signals: ["draft_ready"],
      satisfied: false,
      priority: 20,
    });
  }

  const outboundGroup = outboundAutopilot.groups.find((group: OutboundAutopilotGroup) =>
    ["review_pending", "approval_ready", "approval_pending", "send_ready"].includes(group.state),
  );
  if (outboundGroup) {
    const outbound = outboundActionSummary(outboundGroup);
    candidates.push({
      action_id: `assistant.review-outbound-group:${outboundGroup.group_id}`,
      title: outbound.title,
      summary: outboundGroup.summary,
      section: outbound.section,
      batch: true,
      one_click: false,
      review_required: true,
      why_now: outboundGroup.why_now,
      command: `personal-ops outbound autopilot --group ${outboundGroup.group_id}`,
      target_type: "outbound_autopilot_group",
      target_id: outboundGroup.group_id,
      signals: outboundGroup.signals,
      satisfied: false,
      priority: outbound.priority,
    });
  }

  for (const group of inboxAutopilot.groups) {
    const representedByPlanningBundle = planningBundles.some(
      (bundle: PlanningAutopilotBundle) =>
        bundle.kind === "thread_followup" &&
        bundle.related_artifacts.some(
          (artifact) => artifact.artifact_type === "inbox_autopilot_group" && artifact.artifact_id === group.group_id,
        ),
    );
    if (representedByPlanningBundle) {
      continue;
    }
    const isReplyGroup = group.kind === "needs_reply";
    const reviewReady = group.state === "awaiting_review";
    candidates.push({
      action_id: group.assistant_action_id,
      title: reviewReady
        ? isReplyGroup
          ? "Review prepared reply block"
          : "Review prepared follow-up block"
        : isReplyGroup
          ? "Prepare reply block"
          : "Prepare follow-up block",
      summary: group.summary,
      section: reviewReady ? "drafts" : "worklist",
      batch: true,
      one_click: group.one_click,
      review_required: group.review_required,
      why_now: group.why_now,
      command: reviewReady ? "personal-ops mail draft list" : "personal-ops inbox autopilot",
      target_type: "inbox_autopilot_group",
      target_id: group.group_id,
      signals: group.signals,
      ...(group.state === "blocked" ? { blocking_reason: "Mailbox auth or sync needs repair before drafts can be prepared." } : {}),
      satisfied: false,
      priority: reviewReady ? (isReplyGroup ? 4 : 6) : isReplyGroup ? 8 : 12,
    });
  }

  for (const packet of meetingPrepCandidates.filter((candidate) => candidate.packet_worthy).slice(0, 2)) {
    const representedByPlanningBundle = planningBundles.some((bundle: PlanningAutopilotBundle) => {
      if (bundle.kind !== "event_prep") {
        return false;
      }
      return bundle.related_artifacts.some(
        (artifact) => artifact.artifact_type === "meeting_prep_packet" && artifact.artifact_id === packet.event.event_id,
      );
    });
    if (representedByPlanningBundle) {
      continue;
    }
    const prepared = Boolean(packet.packet_record);
    candidates.push({
      action_id: prepareMeetingPacketActionId(packet.event.event_id),
      title: prepared ? "Review meeting prep packet" : "Prepare meeting packet",
      summary: packet.summary,
      section: "overview",
      batch: false,
      one_click: !prepared && packet.state !== "blocked",
      review_required: prepared,
      why_now: packet.why_now,
      command: prepared
        ? `personal-ops workflow prep-meetings --event ${packet.event.event_id}`
        : `personal-ops workflow prep-meetings --event ${packet.event.event_id} --prepare`,
      target_type: "calendar_event",
      target_id: packet.event.event_id,
      signals: packet.signals,
      ...(packet.state === "blocked" ? { blocking_reason: "Calendar sync or meeting context needs repair before packet prep can run safely." } : {}),
      satisfied: packet.state === "completed",
      priority: prepared ? 18 : 16,
    });
  }

  const latestRuns = latestRunMap(service);
  return candidates
    .map((candidate) => {
      const running = Boolean(service.getAssistantActionStartedAt?.(candidate.action_id));
      const latestRun = latestRuns[candidate.action_id];
      const state = actionState({
        running,
        blocked: Boolean(candidate.blocking_reason),
        review_required: candidate.review_required,
        satisfied:
          candidate.action_id === ACTION_SYNC_WORKSPACE
            ? candidate.satisfied || completionWindowSatisfied(latestRun, COMPLETED_SYNC_HOURS)
            : candidate.satisfied,
        latest_run: latestRun,
      });
      return {
        action_id: candidate.action_id,
        title: candidate.title,
        summary: candidate.summary,
        state,
        section: candidate.section,
        batch: candidate.batch,
        one_click: candidate.one_click,
        review_required: candidate.review_required,
        why_now: candidate.why_now,
        command: candidate.command,
        target_type: candidate.target_type,
        target_id: candidate.target_id,
        signals: candidate.signals,
        blocking_reason: candidate.blocking_reason,
        latest_run: latestRun,
        priority: candidate.priority,
      };
    })
    .sort((left, right) => {
      const byState = statePriority(left.state) - statePriority(right.state);
      if (byState !== 0) {
        return byState;
      }
      return left.priority - right.priority;
    });
}

export async function buildAssistantActionQueueReport(
  service: any,
  options: QueueBuildOptions,
): Promise<AssistantActionQueueReport> {
  const actions = await buildCandidates(service, options);
  const counts_by_state: Record<AssistantActionState, number> = {
    proposed: 0,
    running: 0,
    awaiting_review: 0,
    blocked: 0,
    completed: 0,
    failed: 0,
  };
  for (const action of actions) {
    counts_by_state[action.state] += 1;
  }
  const top = actions.find((action) => action.state !== "completed") ?? actions[0] ?? null;
  return {
    generated_at: new Date().toISOString(),
    readiness: actions.find((action) => action.action_id === ACTION_REVIEW_TOP_ATTENTION)?.state === "awaiting_review"
      ? options.httpReachable
        ? "ready"
        : "degraded"
      : "ready",
    summary: buildQueueSummary(actions),
    counts_by_state,
    top_item_summary: top?.summary ?? null,
    actions,
  };
}

async function runWorkspaceSync(service: any, identity: any): Promise<{ summary: string; details: string[]; success: boolean }> {
  const details: string[] = [];
  let hadFailure = false;
  const steps: Array<{ label: string; shouldRun: boolean; run: () => Promise<void> }> = [
    {
      label: "Mailbox",
      shouldRun: Boolean(service.getInboxStatusReport().mailbox),
      run: async () => {
        await service.syncMailboxMetadata(identity);
      },
    },
    {
      label: "Calendar",
      shouldRun: Boolean(service.config.calendarEnabled),
      run: async () => {
        await service.syncCalendarMetadata(identity);
      },
    },
    {
      label: "GitHub",
      shouldRun: Boolean(service.config.githubEnabled),
      run: async () => {
        await service.syncGithub(identity);
      },
    },
    {
      label: "Drive",
      shouldRun: Boolean(service.config.driveEnabled),
      run: async () => {
        await service.syncDrive(identity);
      },
    },
  ];
  for (const step of steps) {
    if (!step.shouldRun) {
      details.push(`${step.label}: skipped`);
      continue;
    }
    try {
      await step.run();
      details.push(`${step.label}: refreshed`);
    } catch (error) {
      hadFailure = true;
      details.push(`${step.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    success: !hadFailure,
    summary: hadFailure ? "Workspace refresh finished with at least one failure." : "Workspace refresh completed.",
    details,
  };
}

async function runSnapshot(service: any): Promise<{ summary: string; details: string[]; success: boolean }> {
  const status = await service.getStatusReport({ httpReachable: true });
  const snapshot = await service.createSnapshot(status.state);
  return {
    success: true,
    summary: `Created snapshot ${snapshot.snapshot_id}.`,
    details: [`Snapshot ${snapshot.snapshot_id} created from state ${snapshot.daemon_state}.`],
  };
}

export async function runAssistantAction(
  service: any,
  identity: any,
  actionId: string,
): Promise<AssistantActionRunResult> {
  const queue = await buildAssistantActionQueueReport(service, { httpReachable: true });
  const action = queue.actions.find((item) => item.action_id === actionId);
  if (!action) {
    throw new Error(`Assistant action ${actionId} is not available right now.`);
  }
  if (!action.one_click) {
    throw new Error(`Assistant action ${actionId} requires operator review. Use ${action.command ?? "the console detail view"} instead.`);
  }
  if (action.blocking_reason) {
    throw new Error(action.blocking_reason);
  }

  const startedAt = new Date().toISOString();
  const result = await service.runTrackedAssistantAction(actionId, async () => {
    if (actionId.startsWith("assistant.prepare-reply-group:") || actionId.startsWith("assistant.prepare-followup-group:")) {
      const groupId = actionId.split(":").slice(1).join(":");
      return await service.prepareInboxAutopilotGroup(identity, groupId);
    }
    if (actionId.startsWith("assistant.prepare-meeting-packet:")) {
      const eventId = actionId.split(":").slice(1).join(":");
      return await service.prepareMeetingPrepPacket(identity, eventId);
    }
    if (actionId.startsWith("assistant.prepare-planning-bundle:")) {
      const bundleId = actionId.split(":").slice(1).join(":");
      return await service.preparePlanningAutopilotBundle(identity, bundleId);
    }
    if (actionId === ACTION_SYNC_WORKSPACE) {
      return await runWorkspaceSync(service, identity);
    }
    if (actionId === ACTION_CREATE_SNAPSHOT) {
      return await runSnapshot(service);
    }
    throw new Error(`Assistant action ${actionId} is not executable.`);
  });
  const completedAt = new Date().toISOString();

  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action: "assistant_action_run",
    target_type: "assistant_action",
    target_id: actionId,
    outcome: result.success ? "success" : "failure",
    metadata: {
      started_at: startedAt,
      completed_at: completedAt,
      summary: result.summary,
      details: result.details,
    },
  });

  const refreshedQueue = await buildAssistantActionQueueReport(service, { httpReachable: true });
  const refreshedAction = refreshedQueue.actions.find((item) => item.action_id === actionId);
  return {
    action_id: actionId,
    state: refreshedAction?.state ?? (result.success ? "completed" : "failed"),
    summary: result.summary,
    details: result.details,
    queue: refreshedQueue,
  };
}
