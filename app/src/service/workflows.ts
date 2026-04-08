import type {
  AttentionItem,
  CalendarEvent,
  InboxAutopilotGroup,
  InboxAutopilotReport,
  InboxThreadSummary,
  OutboundAutopilotGroup,
  OutboundAutopilotReport,
  PlanningAutopilotBundle,
  PlanningAutopilotReport,
  PlanningRecommendationDetail,
  ServiceState,
  WorkflowBundleAction,
  WorkflowBundleReport,
  WorkflowScoreBand,
  WorkflowBundleSection,
  WorkflowBundleSectionItem,
  WorklistReport,
} from "../types.js";
import { listMeetingPrepCandidates, type MeetingPrepCandidate } from "./meeting-prep.js";

const MAX_SECTION_ITEMS = 3;
const MAX_ACTIONS = 3;

type WorkflowCategory = "repair" | "task" | "followup" | "meeting" | "governance" | "planning" | "system";

interface WorkflowCandidate extends WorkflowBundleAction {
  score: number;
  category: WorkflowCategory;
  source_key: string;
}

interface WorkflowContext {
  status: {
    state: ServiceState;
    mailbox: {
      configured: string | null;
      connected: string | null;
    };
  };
  worklist: WorklistReport;
  planningAutopilot: PlanningAutopilotReport;
  outboundAutopilot: OutboundAutopilotReport;
  recommendationDetails: PlanningRecommendationDetail[];
  inboxAutopilot: InboxAutopilotReport;
  needsReplyThreads: InboxThreadSummary[];
  staleFollowupThreads: InboxThreadSummary[];
  upcomingEvents: CalendarEvent[];
  meetingPrepCandidates: MeetingPrepCandidate[];
}

function commandForThread(threadId: string): string {
  return `personal-ops inbox thread ${threadId}`;
}

function commandForRecommendation(recommendationId: string): string {
  return `personal-ops recommendation show ${recommendationId}`;
}

function commandForPlanningBundle(bundleId: string): string {
  return `personal-ops planning autopilot --bundle ${bundleId}`;
}

function commandForOutboundGroup(groupId: string): string {
  return `personal-ops outbound autopilot --group ${groupId}`;
}

function commandForCalendarEvent(eventId: string): string {
  return `personal-ops calendar event ${eventId}`;
}

function compactReadySummary(context: WorkflowContext): string {
  const warnCount = context.worklist.counts_by_severity.warn;
  const infoCount = context.worklist.counts_by_severity.info;
  if (warnCount > 0) {
    return `System is ready. ${warnCount} warning item${warnCount === 1 ? "" : "s"} still deserve review.`;
  }
  if (infoCount > 0) {
    return `System is ready. ${infoCount} informational item${infoCount === 1 ? "" : "s"} remain in view.`;
  }
  return "System is ready. No urgent operator pressure is active.";
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

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return "not scheduled";
  }
  return new Date(value).toLocaleString();
}

function describeReadiness(readiness: ServiceState): string {
  if (readiness === "ready") {
    return "ready";
  }
  if (readiness === "setup_required") {
    return "setup required";
  }
  return "degraded";
}

function candidateKey(candidate: Pick<WorkflowCandidate, "source_key" | "command" | "target_type" | "target_id" | "label">): string {
  return [candidate.source_key, candidate.command, candidate.target_type ?? "", candidate.target_id ?? "", candidate.label].join("::");
}

function pushUniqueCandidate(candidates: WorkflowCandidate[], candidate: WorkflowCandidate, limit?: number): void {
  if (limit !== undefined && candidates.length >= limit) {
    return;
  }
  if (candidates.some((existing) => candidateKey(existing) === candidateKey(candidate))) {
    return;
  }
  candidates.push(candidate);
}

function scoreBandFor(score: number, topScore: number): WorkflowScoreBand {
  if (score >= topScore - 20) {
    return "highest";
  }
  if (score >= topScore - 120) {
    return "high";
  }
  return "medium";
}

function toBundleAction(candidate: WorkflowCandidate, topScore: number): WorkflowBundleAction {
  return {
    label: candidate.label,
    summary: candidate.summary,
    command: candidate.command,
    target_type: candidate.target_type,
    target_id: candidate.target_id,
    why_now: candidate.why_now,
    score_band: scoreBandFor(candidate.score, topScore),
    signals: candidate.signals,
    related_docs: candidate.related_docs,
    related_files: candidate.related_files,
  };
}

function toBundleItem(candidate: WorkflowCandidate, topScore: number): WorkflowBundleSectionItem {
  const action = toBundleAction(candidate, topScore);
  return {
    label: action.label,
    summary: action.summary,
    command: action.command,
    target_type: action.target_type,
    target_id: action.target_id,
    why_now: action.why_now,
    score_band: action.score_band,
    signals: action.signals,
    related_docs: action.related_docs,
    related_files: action.related_files,
  };
}

function uniqueItemKey(item: Pick<WorkflowBundleSectionItem, "command" | "target_type" | "target_id" | "label">): string {
  return [item.command ?? "", item.target_type ?? "", item.target_id ?? "", item.label].join("::");
}

function pickSectionItems(
  candidates: WorkflowCandidate[],
  topScore: number,
  predicate: (candidate: WorkflowCandidate) => boolean,
  excluded: Set<string>,
): WorkflowBundleSectionItem[] {
  const items: WorkflowBundleSectionItem[] = [];
  for (const candidate of candidates) {
    if (!predicate(candidate)) {
      continue;
    }
    const item = toBundleItem(candidate, topScore);
    const key = uniqueItemKey(item);
    if (excluded.has(key)) {
      continue;
    }
    excluded.add(key);
    items.push(item);
    if (items.length >= MAX_SECTION_ITEMS) {
      break;
    }
  }
  return items;
}

function buildWorkflowReport(input: {
  workflow: WorkflowBundleReport["workflow"];
  readiness: ServiceState;
  summary: string;
  sections: WorkflowBundleSection[];
  worklist: WorklistReport;
  actions: WorkflowCandidate[];
}): WorkflowBundleReport {
  const firstRepair = firstRepairStep(input.readiness, input.worklist);
  const seededActions = [...input.actions];
  if (firstRepair && input.readiness !== "ready") {
    const repairItem = firstRepairItem(input.worklist);
    seededActions.unshift({
      label: "First repair step",
      summary: repairItem?.summary ?? "Start with the shortest repair path before trusting the rest of the workflow.",
      command: firstRepair,
      target_type: repairItem?.target_type,
      target_id: repairItem?.target_id,
      why_now: "The system is not fully ready, so repair comes before normal prioritization.",
      signals: ["readiness_degraded"],
      score: 10_000,
      category: "repair",
      source_key: `repair:${repairItem?.item_id ?? "system"}`,
    });
  }

  const rankedActions = dedupeAndSortCandidates(seededActions).slice(0, MAX_ACTIONS);
  const topScore = rankedActions[0]?.score ?? 0;
  const actions = rankedActions.map((candidate) => toBundleAction(candidate, topScore));
  const sections = input.sections.map((section) =>
    section.title === "Next Commands"
      ? {
          ...section,
          items: actions.map((action) => ({
            label: action.label,
            summary: action.summary,
            command: action.command,
            target_type: action.target_type,
            target_id: action.target_id,
            why_now: action.why_now,
            score_band: action.score_band,
            signals: action.signals,
            related_docs: action.related_docs,
            related_files: action.related_files,
          })),
        }
      : section,
  );

  return {
    workflow: input.workflow,
    generated_at: new Date().toISOString(),
    readiness: input.readiness,
    summary: input.summary,
    sections,
    actions,
    first_repair_step: firstRepair,
  };
}

function firstRepairItem(worklist: WorklistReport): AttentionItem | null {
  return worklist.items.find((item) => item.severity === "critical") ?? worklist.items.find((item) => item.severity === "warn") ?? null;
}

function firstRepairStep(readiness: ServiceState, worklist: WorklistReport): string | null {
  if (readiness === "ready") {
    return null;
  }
  return firstRepairItem(worklist)?.suggested_command ?? "personal-ops doctor";
}

function governanceLike(item: AttentionItem): boolean {
  const haystack = `${item.kind} ${item.title} ${item.summary}`.toLowerCase();
  return haystack.includes("policy") || haystack.includes("governance") || haystack.includes("hygiene");
}

function worklistCandidate(item: AttentionItem): WorkflowCandidate {
  let score = item.severity === "critical" ? 900 : item.severity === "warn" ? 420 : 240;
  let category: WorkflowCategory = "system";
  const signals = [item.kind];
  let whyNow = "This already appears in the current attention queue and is worth reviewing now.";
  if (item.sort_rank) {
    score += Math.min(80, item.sort_rank / 10);
  }
  const hoursUntilDue = maybeHoursUntil(item.due_at);

  switch (item.kind) {
    case "task_overdue":
      score = 860;
      category = "task";
      whyNow = "A real task is already overdue, so it outranks review-oriented cleanup work.";
      signals.push("overdue");
      break;
    case "task_due_soon":
      score = 780;
      category = "task";
      whyNow = "A task is approaching its due window and still needs deliberate time or attention.";
      signals.push("due_soon");
      break;
    case "task_reminder_due":
      score = 720;
      category = "task";
      whyNow = "A reminder window has arrived, which means this work is ready to be pulled forward.";
      signals.push("reminder_due");
      break;
    case "thread_needs_reply":
      score = 700;
      category = "followup";
      whyNow = "An active conversation still appears to need your reply.";
      signals.push("reply_needed");
      break;
    case "thread_stale_followup":
      score = 610;
      category = "followup";
      whyNow = "A sent thread still needs a follow-up nudge before it falls out of view.";
      signals.push("follow_up_stale");
      break;
    case "planning_recommendation_pending":
      score = 640;
      category = "planning";
      whyNow = "A concrete recommendation is already queued and is usually a better next move than broad review work.";
      signals.push("recommendation_ready");
      break;
    case "planning_recommendation_snooze_expiring":
      score = 600;
      category = "planning";
      whyNow = "A snoozed recommendation is returning to the active queue and needs a fresh decision.";
      signals.push("snooze_expiring");
      break;
    case "planning_recommendation_group":
      score = 520;
      category = "planning";
      whyNow = "A grouped recommendation can clear a cluster of similar operator work in one pass.";
      signals.push("batchable");
      break;
    case "github_review_requested":
      score = 760;
      category = "followup";
      whyNow = "A teammate is waiting on your review, so this is concrete collaboration work rather than hygiene noise.";
      signals.push("github_review");
      break;
    case "github_pr_checks_failing":
      score = 750;
      category = "task";
      whyNow = "An authored pull request has failing checks, so unblocking it can remove real delivery friction quickly.";
      signals.push("github_checks_failing");
      break;
    case "github_pr_changes_requested":
      score = 740;
      category = "task";
      whyNow = "An authored pull request has requested changes waiting on you, which is stronger than general review cleanup.";
      signals.push("github_changes_requested");
      break;
    case "github_pr_merge_ready":
      score = 500;
      category = "task";
      whyNow = "An authored pull request is merge-ready, so it is a bounded piece of work you can close out cleanly.";
      signals.push("github_merge_ready");
      break;
    case "calendar_conflict":
      score = 560;
      category = "meeting";
      whyNow = "Calendar pressure is close enough that it can distort the rest of the day if left alone.";
      signals.push("calendar_conflict");
      break;
    case "calendar_event_soon":
      score = 430;
      category = "meeting";
      whyNow = "A meeting window is approaching and prep or scheduling context may matter soon.";
      signals.push("meeting_soon");
      break;
    default:
      if (governanceLike(item)) {
        score = 170;
        category = "governance";
        whyNow = "This is useful queue hygiene, but it should trail concrete work when the system is otherwise healthy.";
        signals.push("governance");
      }
      break;
  }

  if (hoursUntilDue !== null) {
    if (hoursUntilDue <= 0) {
      score += 60;
      signals.push("deadline_passed");
    } else if (hoursUntilDue <= 4) {
      score += 40;
      signals.push("deadline_today");
    }
  }

  return {
    label: item.title,
    summary: item.summary,
    command: item.suggested_command,
    target_type: item.target_type,
    target_id: item.target_id,
    why_now: whyNow,
    signals,
    score,
    category,
    source_key: `${item.target_type}:${item.target_id}`,
  };
}

function recommendationCandidate(detail: PlanningRecommendationDetail): WorkflowCandidate {
  const recommendation = detail.recommendation;
  let score = recommendation.rank_score;
  let category: WorkflowCategory = "planning";
  const signals = [...recommendation.trigger_signals];
  let whyNow = "This recommendation already packages the next concrete move more cleanly than starting from scratch.";

  if (recommendation.kind === "schedule_task_block") {
    category = "task";
    score += 110;
    whyNow = "This protects time for a real task before its schedule pressure turns into a miss.";
    const hoursUntilDue = maybeHoursUntil(detail.task?.due_at);
    if (hoursUntilDue !== null) {
      if (hoursUntilDue <= 2) {
        score += 90;
        signals.push("task_due_very_soon");
      } else if (hoursUntilDue <= 8) {
        score += 45;
        signals.push("task_due_today");
      }
    }
  } else if (recommendation.kind === "schedule_thread_followup") {
    category = "followup";
    score += 90;
    whyNow =
      recommendation.reason_code === "needs_reply"
        ? "A live conversation still needs your reply, and this recommendation already turns it into a concrete next step."
        : "A follow-up is still hanging open, and this recommendation is the cleanest way to move it forward.";
    if (recommendation.reason_code === "needs_reply") {
      score += 50;
      signals.push("reply_needed");
    }
  } else {
    category = "meeting";
    whyNow = "The meeting is close enough that prep should happen before it becomes last-minute.";
    const hoursUntilMeeting = maybeHoursUntil(detail.event?.start_at);
    if (hoursUntilMeeting === null || hoursUntilMeeting > 24) {
      score -= 120;
      signals.push("meeting_not_imminent");
    } else if (hoursUntilMeeting <= 2) {
      score += 110;
      signals.push("meeting_imminent");
    } else if (hoursUntilMeeting <= 6) {
      score += 60;
      signals.push("meeting_today");
    } else {
      score += 20;
      signals.push("meeting_soon");
    }
  }

  if (recommendation.slot_state === "ready") {
    score += 25;
    signals.push("slot_ready");
  } else {
    score -= 30;
    signals.push("manual_scheduling");
  }

  const sourceFreshness = maybeHoursOld(recommendation.source_last_seen_at);
  if (sourceFreshness !== null && sourceFreshness <= 4) {
    score += 20;
    signals.push("source_fresh");
  }

  return {
    label: recommendation.proposed_title?.trim() || recommendation.reason_summary,
    summary: recommendation.reason_summary,
    command: commandForRecommendation(recommendation.recommendation_id),
    target_type: "planning_recommendation",
    target_id: recommendation.recommendation_id,
    why_now: whyNow,
    signals,
    score,
    category,
    source_key:
      recommendation.source_task_id
        ? `task:${recommendation.source_task_id}`
        : recommendation.source_thread_id
          ? `thread:${recommendation.source_thread_id}`
          : recommendation.source_calendar_event_id
            ? `event:${recommendation.source_calendar_event_id}`
            : `recommendation:${recommendation.recommendation_id}`,
  };
}

function threadCandidate(summary: InboxThreadSummary): WorkflowCandidate {
  const subject = summary.latest_message?.subject?.trim() || "Inbox thread";
  const hoursOld = maybeHoursOld(summary.latest_message?.internal_date);
  let score = 360;
  let whyNow = "This thread still appears actionable and has no stronger bundled recommendation ahead of it.";
  const signals: string[] = [summary.derived_kind];

  if (summary.derived_kind === "needs_reply") {
    score = 620;
    whyNow = "This thread still needs your reply and is active enough to deserve direct attention.";
    signals.push("reply_needed");
  } else if (summary.derived_kind === "unread_old") {
    score = 470;
    whyNow = "This unread thread has been aging long enough that it may hide a real operator ask.";
    signals.push("inbox_aging");
  } else if (summary.derived_kind === "stale_followup") {
    score = 430;
    whyNow = "This sent thread is old enough that it may need a nudge if you still care about the outcome.";
    signals.push("follow_up_stale");
  }

  if (hoursOld !== null && hoursOld >= 24) {
    score += 25;
  }

  return {
    label: subject,
    summary:
      summary.derived_kind === "needs_reply"
        ? "Inbound thread may need an operator reply."
        : summary.derived_kind === "unread_old"
          ? "Unread thread is aging in the inbox."
          : "Sent thread may need a nudge.",
    command: commandForThread(summary.thread.thread_id),
    target_type: "mail_thread",
    target_id: summary.thread.thread_id,
    why_now: whyNow,
    signals,
    score,
    category: "followup",
    source_key: `thread:${summary.thread.thread_id}`,
  };
}

function autopilotGroupCandidate(group: InboxAutopilotGroup): WorkflowCandidate {
  const replyGroup = group.kind === "needs_reply";
  const staged = group.state === "awaiting_review";
  let score = replyGroup ? 710 : 620;
  if (staged) {
    score += 60;
  }
  return {
    label: staged
      ? replyGroup
        ? "Review prepared reply block"
        : "Review prepared follow-up block"
      : replyGroup
        ? "Prepare reply block"
        : "Prepare follow-up block",
    summary: group.summary,
    command: staged ? "personal-ops mail draft list" : "personal-ops inbox autopilot",
    target_type: "inbox_autopilot_group",
    target_id: group.group_id,
    why_now: group.why_now,
    signals: group.signals,
    score,
    category: "followup",
    source_key: `autopilot:${group.group_id}`,
  };
}

function outboundGroupCandidate(group: OutboundAutopilotGroup): WorkflowCandidate {
  const sendReady = group.state === "send_ready";
  const approvalReady = group.state === "approval_ready";
  const approvalPending = group.state === "approval_pending";
  const reviewPending = group.state === "review_pending";
  let score =
    sendReady
      ? 940
      : approvalReady
        ? 880
        : approvalPending
          ? 810
          : reviewPending
            ? 720
            : group.state === "blocked"
              ? 430
              : 260;
  if (group.kind === "reply_block") {
    score += 20;
  } else if (group.kind === "followup_block") {
    score += 10;
  }
  return {
    label:
      sendReady
        ? "Send outbound group"
        : approvalReady
          ? "Request approval for outbound group"
          : approvalPending
            ? "Approve outbound group"
            : reviewPending
              ? "Finish outbound review group"
              : "Inspect outbound group",
    summary: group.summary,
    command: commandForOutboundGroup(group.group_id),
    target_type: "outbound_autopilot_group",
    target_id: group.group_id,
    why_now: group.why_now,
    signals: group.signals,
    score,
    category: "followup",
    source_key: `outbound:${group.group_id}`,
  };
}

function eventCandidate(event: CalendarEvent): WorkflowCandidate | null {
  const hoursUntilEvent = maybeHoursUntil(event.start_at);
  if (hoursUntilEvent === null || hoursUntilEvent > 6 || hoursUntilEvent <= 0) {
    return null;
  }

  let score = 280;
  let whyNow = "The meeting exists, but prep does not look urgent yet.";
  const signals = ["meeting_prep_needed"];
  if (hoursUntilEvent <= 2) {
    score = 520;
    whyNow = "The meeting is close enough that prep now will still improve the conversation.";
    signals.push("meeting_imminent");
  } else if (hoursUntilEvent <= 6) {
    score = 430;
    whyNow = "The meeting is later today, so prep belongs in the current planning window.";
    signals.push("meeting_today");
  }

  return {
    label: event.summary?.trim() || "Upcoming meeting",
    summary: `Starts ${formatTimestamp(event.start_at)}.`,
    command: commandForCalendarEvent(event.event_id),
    target_type: "calendar_event",
    target_id: event.event_id,
    why_now: whyNow,
    signals,
    score,
    category: "meeting",
    source_key: `event:${event.event_id}`,
  };
}

function compactEventCandidate(service: any, event: CalendarEvent): WorkflowCandidate {
  return attachRelatedContext(
    service,
    {
      label: event.summary?.trim() || "Upcoming meeting",
      summary: `Starts ${formatTimestamp(event.start_at)}.`,
      command: commandForCalendarEvent(event.event_id),
      target_type: "calendar_event",
      target_id: event.event_id,
      why_now: "This meeting is in the current scope, but it does not need a full packet yet.",
      signals: ["meeting_in_scope"],
      score: 180,
      category: "meeting",
      source_key: `event:${event.event_id}`,
    },
    { allowFallback: false },
  );
}

function meetingPacketCandidate(candidate: MeetingPrepCandidate): WorkflowCandidate {
  const prepared = Boolean(candidate.packet_record);
  return {
    label: prepared ? "Review meeting prep packet" : "Prepare meeting packet",
    summary: candidate.summary,
    command: prepared
      ? `personal-ops workflow prep-meetings --event ${candidate.event.event_id}`
      : `personal-ops workflow prep-meetings --event ${candidate.event.event_id} --prepare`,
    target_type: "calendar_event",
    target_id: candidate.event.event_id,
    why_now: candidate.why_now,
    signals: candidate.signals,
    score: candidate.score + (prepared ? 40 : 0),
    category: "meeting",
    source_key: `event:${candidate.event.event_id}`,
    related_docs: candidate.related_docs,
    related_files: candidate.related_files,
  };
}

function planningBundleCandidate(bundle: PlanningAutopilotBundle): WorkflowCandidate {
  const prepared = bundle.state === "awaiting_review";
  return {
    label: prepared ? "Review planning bundle" : "Prepare planning bundle",
    summary: bundle.summary,
    command: commandForPlanningBundle(bundle.bundle_id),
    target_type: "planning_autopilot_bundle",
    target_id: bundle.bundle_id,
    why_now: bundle.why_now,
    signals: bundle.signals,
    score:
      bundle.score_band === "highest"
        ? 860
        : bundle.score_band === "high"
          ? 680
          : 520,
    category:
      bundle.kind === "task_block"
        ? "task"
        : bundle.kind === "thread_followup"
          ? "followup"
          : "meeting",
    source_key: `planning-bundle:${bundle.bundle_id}`,
    related_files: bundle.related_artifacts
      .filter((artifact) => artifact.artifact_type === "related_file")
      .map((artifact) => ({
        file_id: artifact.artifact_id,
        title: artifact.title,
        mime_type: "application/octet-stream",
        file_kind: "file" as const,
        match_type: "recent_file_fallback" as const,
        snippet: artifact.summary,
      })),
  };
}

function dedupeAndSortCandidates(candidates: WorkflowCandidate[]): WorkflowCandidate[] {
  const byKey = new Map<string, WorkflowCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.source_key);
    if (!existing || candidate.score > existing.score) {
      byKey.set(candidate.source_key, candidate);
    }
  }
  return [...byKey.values()].sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}

function attachRelatedContext(
  service: any,
  candidate: WorkflowCandidate,
  options: { allowFallback: boolean },
): WorkflowCandidate {
  if (typeof service.getRelatedDocsForTarget !== "function" || typeof service.getRelatedFilesForTarget !== "function") {
    return candidate;
  }
  return {
    ...candidate,
    related_docs: service.getRelatedDocsForTarget(candidate.target_type, candidate.target_id, {
      allowFallback: options.allowFallback,
    }),
    related_files: service.getRelatedFilesForTarget(candidate.target_type, candidate.target_id, {
      allowFallback: options.allowFallback,
      maxItems: 4,
    }),
  };
}

async function loadWorkflowContext(service: any, options: { httpReachable: boolean }): Promise<WorkflowContext> {
  const planningAutopilotPromise =
    typeof service.getPlanningAutopilotReport === "function"
      ? service.getPlanningAutopilotReport(options)
      : Promise.resolve({
          generated_at: new Date().toISOString(),
          readiness: "ready" as const,
          summary: "Planning autopilot unavailable.",
          top_item_summary: null,
          prepared_bundle_count: 0,
          bundles: [],
        });
  const outboundAutopilotPromise =
    typeof service.getOutboundAutopilotReport === "function"
      ? service.getOutboundAutopilotReport(options)
      : Promise.resolve({
          generated_at: new Date().toISOString(),
          readiness: "ready" as const,
          summary: "Outbound autopilot unavailable.",
          top_item_summary: null,
          send_window: {
            active: false,
            effective_send_enabled: false,
            permanent_send_enabled: false,
          },
          groups: [],
        });
  const [worklist, recommendations, planningAutopilot, outboundAutopilot, inboxAutopilot, needsReplyThreads, staleFollowupThreads, upcomingEvents, meetingPrepCandidates] = await Promise.all([
    service.getWorklistReport(options),
    Promise.resolve(service.listPlanningRecommendations({ status: "pending" })),
    planningAutopilotPromise,
    outboundAutopilotPromise,
    service.getInboxAutopilotReport(options),
    Promise.resolve(service.listNeedsReplyThreads(10)),
    Promise.resolve(service.listFollowupThreads(10)),
    Promise.resolve(service.listUpcomingCalendarEvents(1, 20)),
    listMeetingPrepCandidates(service, { scope: "next_24h" }),
  ]);
  const fallbackStatus =
    (!worklist.state || !["ready", "setup_required", "degraded"].includes(worklist.state))
      && typeof service.getStatusReport === "function"
      ? await service.getStatusReport({ httpReachable: options.httpReachable })
      : null;
  const mailAccount =
    typeof service.db?.getMailAccount === "function"
      ? service.db.getMailAccount()
      : null;
  const status = {
    state: (worklist.state ?? fallbackStatus?.state ?? "ready") as ServiceState,
    mailbox: {
      configured: service.config?.gmailAccountEmail || fallbackStatus?.mailbox.configured || null,
      connected: mailAccount?.email ?? fallbackStatus?.mailbox.connected ?? null,
    },
  };

  const orderedRecommendations = [...recommendations].sort((left, right) => service.compareNextActionableRecommendations(left, right));
  const recommendationDetails = orderedRecommendations
    .slice(0, 12)
    .map((recommendation: { recommendation_id: string }) => service.getPlanningRecommendationDetail(recommendation.recommendation_id));

  return {
    status,
    worklist,
    planningAutopilot,
    outboundAutopilot,
    recommendationDetails,
    inboxAutopilot,
    needsReplyThreads,
    staleFollowupThreads,
    upcomingEvents,
    meetingPrepCandidates,
  };
}

function buildIntelligenceCandidates(service: any, context: WorkflowContext): WorkflowCandidate[] {
  const candidates: WorkflowCandidate[] = [];
  const recommendationSourceKeys = new Set<string>();
  const autopilotThreadKeys = new Set(
    context.inboxAutopilot.groups.flatMap((group) => group.threads.map((thread) => `thread:${thread.thread_id}`)),
  );
  const bundledRecommendationIds = new Set(context.planningAutopilot.bundles.flatMap((bundle) => bundle.recommendation_ids));
  const bundledThreadGroupIds = new Set(
    context.planningAutopilot.bundles.flatMap((bundle) =>
      bundle.related_artifacts
        .filter((artifact) => artifact.artifact_type === "inbox_autopilot_group")
        .map((artifact) => artifact.artifact_id),
    ),
  );
  const bundledEventIds = new Set(
    context.planningAutopilot.bundles.flatMap((bundle) =>
      bundle.related_artifacts
        .filter((artifact) => artifact.artifact_type === "meeting_prep_packet")
        .map((artifact) => artifact.artifact_id),
    ),
  );
  const bundledWorklistSourceKeys = new Set(
    context.planningAutopilot.bundles.flatMap((bundle) =>
      bundle.related_artifacts.flatMap((artifact) => {
        if (artifact.artifact_type === "task") {
          return [`task:${artifact.artifact_id}`];
        }
        if (artifact.artifact_type === "calendar_event") {
          return [`calendar_event:${artifact.artifact_id}`];
        }
        return [];
      }),
    ),
  );

  for (const bundle of context.planningAutopilot.bundles) {
    pushUniqueCandidate(candidates, planningBundleCandidate(bundle));
  }

  for (const group of context.outboundAutopilot.groups) {
    pushUniqueCandidate(candidates, outboundGroupCandidate(group));
  }

  for (const detail of context.recommendationDetails) {
    if (bundledRecommendationIds.has(detail.recommendation.recommendation_id)) {
      continue;
    }
    const candidate = attachRelatedContext(service, recommendationCandidate(detail), { allowFallback: true });
    recommendationSourceKeys.add(candidate.source_key);
    pushUniqueCandidate(candidates, candidate);
  }

  for (const item of context.worklist.items) {
    if (
      ["planning_recommendation_pending", "planning_recommendation_snooze_expiring", "planning_recommendation_group", "thread_needs_reply", "thread_stale_followup", "calendar_event_soon"].includes(
        item.kind,
      )
    ) {
      continue;
    }
    const candidate = attachRelatedContext(service, worklistCandidate(item), { allowFallback: true });
    if (bundledWorklistSourceKeys.has(candidate.source_key)) {
      continue;
    }
    pushUniqueCandidate(candidates, candidate);
  }

  for (const group of context.inboxAutopilot.groups) {
    if (bundledThreadGroupIds.has(group.group_id)) {
      continue;
    }
    pushUniqueCandidate(candidates, autopilotGroupCandidate(group));
  }

  for (const thread of context.needsReplyThreads) {
    const candidate = attachRelatedContext(service, threadCandidate(thread), { allowFallback: false });
    if (recommendationSourceKeys.has(candidate.source_key) || autopilotThreadKeys.has(candidate.source_key)) {
      continue;
    }
    pushUniqueCandidate(candidates, candidate);
  }

  for (const thread of context.staleFollowupThreads) {
    const candidate = attachRelatedContext(service, threadCandidate(thread), { allowFallback: false });
    if (recommendationSourceKeys.has(candidate.source_key) || autopilotThreadKeys.has(candidate.source_key)) {
      continue;
    }
    pushUniqueCandidate(candidates, candidate);
  }

  for (const meetingCandidate of context.meetingPrepCandidates) {
    if (bundledEventIds.has(meetingCandidate.event.event_id)) {
      continue;
    }
    if (recommendationSourceKeys.has(`event:${meetingCandidate.event.event_id}`)) {
      continue;
    }
    if (meetingCandidate.packet_worthy) {
      pushUniqueCandidate(candidates, meetingPacketCandidate(meetingCandidate));
      continue;
    }
    const fallback = eventCandidate(meetingCandidate.event);
    if (fallback) {
      pushUniqueCandidate(candidates, attachRelatedContext(service, fallback, { allowFallback: true }));
    }
  }

  return dedupeAndSortCandidates(candidates);
}

function buildPrepDayTopAttention(candidates: WorkflowCandidate[], topScore: number): WorkflowBundleSectionItem[] {
  const excluded = new Set<string>();
  return pickSectionItems(
    candidates,
    topScore,
    (candidate) => candidate.category !== "system" && candidate.category !== "meeting",
    excluded,
  );
}

function buildPrepDayTimeSensitive(
  candidates: WorkflowCandidate[],
  topScore: number,
  excluded: Set<string>,
): WorkflowBundleSectionItem[] {
  return pickSectionItems(
    candidates,
    topScore,
    (candidate) => candidate.category === "task" || candidate.category === "followup" || candidate.category === "meeting",
    excluded,
  );
}

function buildMaintenanceWindowItems(worklist: WorklistReport): WorkflowBundleSectionItem[] {
  if (!worklist.maintenance_window.eligible_now || !worklist.maintenance_window.bundle) {
    return [];
  }
  return worklist.maintenance_window.bundle.recommendations.map((recommendation) => ({
    label: recommendation.title,
    summary: recommendation.reason,
    command: recommendation.suggested_command,
    target_type: "system",
    target_id: `maintenance:${recommendation.step_id}`,
    why_now: "This is preventive maintenance for a calm window, not active repair or urgent delivery work.",
    score_band: recommendation.urgency === "recommended" ? "medium" : "high",
    signals: ["maintenance_window", recommendation.step_id],
  }));
}

export async function buildNowNextWorkflowReport(service: any, options: { httpReachable: boolean }): Promise<WorkflowBundleReport> {
  const context = await loadWorkflowContext(service, options);
  const candidates = buildIntelligenceCandidates(service, context);
  const primary = candidates[0] ?? null;
  const topScore = primary?.score ?? 0;
  const alternatives = candidates.slice(1, 3);
  const blockedFallback = alternatives[0]
    ? [toBundleItem(alternatives[0], topScore)]
    : [
        {
          label: "Re-open the full day-start bundle",
          summary: "If the primary move is blocked, fall back to the broader day-start bundle for the next best command.",
          command: "personal-ops workflow prep-day",
          target_type: "system",
          target_id: "workflow:prep-day",
          why_now: "This gives you the broader queue view again without inventing a new control path.",
          score_band: "medium" as const,
          signals: ["fallback"],
        },
      ];

  return buildWorkflowReport({
    workflow: "now-next",
    readiness: context.status.state,
    summary: primary ? `${primary.label}: ${primary.summary}` : "No strong next move is standing out right now.",
    sections: [
      {
        title: "Best Next Move",
        items: primary ? [toBundleItem(primary, topScore)] : [],
      },
      {
        title: "Why Now",
        items:
          primary
            ? [
                {
                  label: primary.label,
                  summary: primary.why_now ?? "This is currently the strongest bounded next move.",
                  command: primary.command,
                  target_type: primary.target_type,
                  target_id: primary.target_id,
                  why_now: primary.why_now,
                  score_band: scoreBandFor(primary.score, topScore),
                  signals: primary.signals,
                  related_docs: primary.related_docs,
                  related_files: primary.related_files,
                },
              ]
            : [],
      },
      {
        title: "Alternatives",
        items: alternatives.map((candidate) => toBundleItem(candidate, topScore)),
      },
      {
        title: "If Blocked",
        items: blockedFallback,
      },
    ],
    worklist: context.worklist,
    actions: primary ? [primary, ...alternatives] : [],
  });
}

export async function buildPrepDayWorkflowReport(service: any, options: { httpReachable: boolean }): Promise<WorkflowBundleReport> {
  const context = await loadWorkflowContext(service, options);
  const candidates = buildIntelligenceCandidates(service, context);
  const topScore = candidates[0]?.score ?? 0;
  const overall: WorkflowBundleSectionItem[] = [
    {
      label: "Readiness",
      summary:
        context.status.state === "ready"
          ? compactReadySummary(context)
          : `System is ${describeReadiness(context.status.state)}. Start with ${firstRepairStep(context.status.state, context.worklist) ?? "personal-ops doctor"}.`,
      command: context.status.state === "ready" ? "personal-ops status" : firstRepairStep(context.status.state, context.worklist) ?? "personal-ops doctor",
      target_type: "system",
      target_id: "personal-ops-readiness",
      why_now:
        context.status.state === "ready"
          ? "The system is healthy enough to trust the ranked next moves below."
          : "Repair needs to happen before the rest of the queue is reliable.",
      score_band: context.status.state === "ready" ? "medium" : "highest",
      signals: [context.status.state === "ready" ? "ready" : "readiness_degraded"],
    },
    {
      label: "Mailbox",
      summary: `Connected mailbox: ${context.status.mailbox.connected ?? context.status.mailbox.configured ?? "not configured"}.`,
      command: "personal-ops status",
      target_type: "system",
      target_id: "personal-ops-mailbox",
      why_now: "Mail and planning pressure both depend on the connected mailbox staying healthy.",
      score_band: "medium",
      signals: ["mailbox_connected"],
    },
  ];

  const topAttentionExcluded = new Set<string>();
  const topAttention = buildPrepDayTopAttention(candidates, topScore);
  for (const item of topAttention) {
    topAttentionExcluded.add(uniqueItemKey(item));
  }
  const timeSensitive = buildPrepDayTimeSensitive(candidates, topScore, topAttentionExcluded);
  const maintenanceWindow = buildMaintenanceWindowItems(context.worklist);

  return buildWorkflowReport({
    workflow: "prep-day",
    readiness: context.status.state,
    summary:
      context.status.state === "ready"
        ? `Ready for the day. ${candidates[0]?.summary ?? "No urgent operator work is waiting."}`
        : `Day-start attention needed. Lead with ${firstRepairStep(context.status.state, context.worklist) ?? "personal-ops doctor"}.`,
    sections: [
      { title: "Overall State", items: overall },
      { title: "Top Attention", items: topAttention },
      { title: "Time-Sensitive Items", items: timeSensitive },
      { title: "Maintenance Window", items: maintenanceWindow },
      { title: "Next Commands", items: [] },
    ],
    worklist: context.worklist,
    actions: candidates,
  });
}

export async function buildFollowUpBlockWorkflowReport(
  service: any,
  options: { httpReachable: boolean },
): Promise<WorkflowBundleReport> {
  const context = await loadWorkflowContext(service, options);
  const bundleFollowups = context.planningAutopilot.bundles.filter((bundle) => bundle.kind === "thread_followup");
  const outboundGroups = context.outboundAutopilot.groups.filter((group) =>
    ["review_pending", "approval_ready", "approval_pending", "send_ready"].includes(group.state),
  );
  const needsReplyGroups = context.inboxAutopilot.groups.filter((group) => group.kind === "needs_reply");
  const staleFollowupGroups = context.inboxAutopilot.groups.filter((group) => group.kind === "waiting_to_nudge");
  const recommendationSourceKeys = new Set(
    context.recommendationDetails
      .filter((detail) => detail.recommendation.kind === "schedule_thread_followup")
      .map((detail) => `thread:${detail.recommendation.source_thread_id}`),
  );
  const candidates = dedupeAndSortCandidates([
    ...outboundGroups.map((group) => outboundGroupCandidate(group)),
    ...bundleFollowups.map((bundle) => planningBundleCandidate(bundle)),
    ...context.inboxAutopilot.groups.map((group) => autopilotGroupCandidate(group)),
    ...context.recommendationDetails
      .filter((detail) => detail.recommendation.kind === "schedule_thread_followup")
      .map((detail) => attachRelatedContext(service, recommendationCandidate(detail), { allowFallback: false })),
    ...context.needsReplyThreads
      .map((thread) => attachRelatedContext(service, threadCandidate(thread), { allowFallback: false }))
      .filter(
        (candidate) =>
          !recommendationSourceKeys.has(candidate.source_key) &&
          !needsReplyGroups.some((group) => group.threads.some((thread) => `thread:${thread.thread_id}` === candidate.source_key)),
      ),
    ...context.staleFollowupThreads
      .map((thread) => attachRelatedContext(service, threadCandidate(thread), { allowFallback: false }))
      .filter(
        (candidate) =>
          !recommendationSourceKeys.has(candidate.source_key) &&
          !staleFollowupGroups.some((group) => group.threads.some((thread) => `thread:${thread.thread_id}` === candidate.source_key)),
      ),
    ...context.worklist.items
      .filter((item) => ["task_overdue", "task_due_soon", "task_reminder_due"].includes(item.kind))
      .map((item) => attachRelatedContext(service, worklistCandidate(item), { allowFallback: true })),
  ]);
  const topScore = candidates[0]?.score ?? 0;
  const needsReplyItems = [
    ...outboundGroups
      .filter((group) => group.kind === "reply_block" || group.kind === "single_draft")
      .map((group) => toBundleItem(outboundGroupCandidate(group), topScore)),
    ...needsReplyGroups.map((group) => toBundleItem(autopilotGroupCandidate(group), topScore)),
    ...candidates
      .filter((candidate) => candidate.category === "followup" && candidate.source_key.startsWith("thread:"))
      .slice(0, MAX_SECTION_ITEMS),
  ]
    .slice(0, MAX_SECTION_ITEMS)
    .map((item) => ("label" in item && "summary" in item && "command" in item ? item : toBundleItem(item as WorkflowCandidate, topScore)));
  const waitingToNudgeItems = [
    ...outboundGroups
      .filter((group) => group.kind === "followup_block")
      .map((group) => toBundleItem(outboundGroupCandidate(group), topScore)),
    ...staleFollowupGroups.map((group) => toBundleItem(autopilotGroupCandidate(group), topScore)),
    ...candidates.filter((candidate) => candidate.category === "task").slice(0, MAX_SECTION_ITEMS),
  ]
    .slice(0, MAX_SECTION_ITEMS)
    .map((item) => ("label" in item && "summary" in item && "command" in item ? item : toBundleItem(item as WorkflowCandidate, topScore)));

  return buildWorkflowReport({
    workflow: "follow-up-block",
    readiness: context.status.state,
    summary: `Follow-up block: ${needsReplyGroups.length} reply block${needsReplyGroups.length === 1 ? "" : "s"} and ${staleFollowupGroups.length} follow-up block${staleFollowupGroups.length === 1 ? "" : "s"} are staged or ready to prepare.`,
    sections: [
      {
        title: "Needs Reply",
        items: needsReplyItems,
      },
      {
        title: "Waiting To Nudge",
        items: waitingToNudgeItems,
      },
      { title: "Next Commands", items: [] },
    ],
    worklist: context.worklist,
    actions: candidates,
  });
}

export async function buildPrepMeetingsWorkflowReport(
  service: any,
  options: { httpReachable: boolean; scope: "today" | "next_24h" },
): Promise<WorkflowBundleReport> {
  const context = await loadWorkflowContext(service, options);
  const bundleMeetings = context.planningAutopilot.bundles.filter((bundle) => bundle.kind === "event_prep");
  const scopedCandidates = context.meetingPrepCandidates
    .filter((candidate) =>
      options.scope === "today"
        ? new Date(candidate.event.start_at).toDateString() === new Date().toDateString()
        : (maybeHoursUntil(candidate.event.start_at) ?? 99) <= 24,
    )
    .slice(0, 10);
  const packetCandidates = dedupeAndSortCandidates(
    [
      ...bundleMeetings.map((bundle) => planningBundleCandidate(bundle)),
      ...scopedCandidates
        .filter((candidate) => candidate.packet_worthy)
        .filter((candidate) => !bundleMeetings.some((bundle) => bundle.related_artifacts.some((artifact) => artifact.artifact_id === candidate.event.event_id)))
        .map((candidate) => meetingPacketCandidate(candidate)),
    ],
  );
  const topScore = packetCandidates[0]?.score ?? 0;

  return buildWorkflowReport({
    workflow: "prep-meetings",
    readiness: context.status.state,
    summary:
      packetCandidates.length === 0
        ? "No meetings in scope need prep right now."
        : `${scopedCandidates.length} meeting${scopedCandidates.length === 1 ? "" : "s"} in scope and ${packetCandidates.length} packet-ready item${packetCandidates.length === 1 ? "" : "s"} surfaced.`,
    sections: [
      {
        title: "Upcoming Meetings",
        items: scopedCandidates.slice(0, MAX_SECTION_ITEMS).map((candidate) =>
          toBundleItem(
            candidate.packet_worthy ? meetingPacketCandidate(candidate) : compactEventCandidate(service, candidate.event),
            topScore || 200,
          ),
        ),
      },
      {
        title: "Prep Needed",
        items: packetCandidates.slice(0, MAX_SECTION_ITEMS).map((candidate) => toBundleItem(candidate, topScore)),
      },
      { title: "Next Commands", items: [] },
    ],
    worklist: context.worklist,
    actions: packetCandidates,
  });
}
