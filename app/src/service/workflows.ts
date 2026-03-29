import type {
  AttentionItem,
  CalendarEvent,
  InboxThreadSummary,
  PlanningRecommendation,
  ServiceState,
  WorkflowBundleAction,
  WorkflowBundleReport,
  WorkflowBundleSection,
  WorkflowBundleSectionItem,
  WorklistReport,
} from "../types.js";

const MAX_SECTION_ITEMS = 3;
const MAX_ACTIONS = 3;

function commandForThread(threadId: string): string {
  return `personal-ops inbox thread ${threadId}`;
}

function commandForRecommendation(recommendationId: string): string {
  return `personal-ops recommendation show ${recommendationId}`;
}

function commandForCalendarEvent(eventId: string): string {
  return `personal-ops calendar event ${eventId}`;
}

function uniqueLabelKey(input: {
  command?: string | undefined;
  target_type?: string | undefined;
  target_id?: string | undefined;
  label: string;
}): string {
  return [input.command ?? "", input.target_type ?? "", input.target_id ?? "", input.label].join("::");
}

function uniqueEntityKey(input: {
  command?: string | undefined;
  target_type?: string | undefined;
  target_id?: string | undefined;
  label: string;
  summary?: string | undefined;
}): string {
  if (input.command) {
    return input.command;
  }
  if (input.target_type || input.target_id) {
    return [input.target_type ?? "", input.target_id ?? ""].join("::");
  }
  return [input.label, input.summary ?? ""].join("::");
}

function pushUniqueSectionItem(
  items: WorkflowBundleSectionItem[],
  seen: Set<string>,
  item: WorkflowBundleSectionItem,
  limit = MAX_SECTION_ITEMS,
): void {
  if (items.length >= limit) {
    return;
  }
  const key = uniqueEntityKey(item);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  items.push(item);
}

function pushUniqueAction(actions: WorkflowBundleAction[], seen: Set<string>, action: WorkflowBundleAction): void {
  if (actions.length >= MAX_ACTIONS) {
    return;
  }
  const key = uniqueEntityKey(action);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  actions.push(action);
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

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return "not scheduled";
  }
  return new Date(value).toLocaleString();
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

function fromWorklistItem(item: AttentionItem): WorkflowBundleSectionItem {
  return {
    label: item.title,
    summary: item.summary,
    command: item.suggested_command,
    target_type: item.target_type,
    target_id: item.target_id,
  };
}

function fromThread(thread: InboxThreadSummary): WorkflowBundleSectionItem {
  return {
    label: thread.latest_message?.subject?.trim() || "Inbox thread",
    summary:
      thread.derived_kind === "stale_followup"
        ? "Sent follow-up is waiting on a nudge or another look."
        : thread.derived_kind === "unread_old"
          ? "Unread thread is aging in the inbox."
          : "Inbound thread may need an operator reply.",
    command: commandForThread(thread.thread.thread_id),
    target_type: "mail_thread",
    target_id: thread.thread.thread_id,
  };
}

function fromRecommendation(recommendation: PlanningRecommendation, label: string): WorkflowBundleSectionItem {
  return {
    label,
    summary: recommendation.reason_summary,
    command: commandForRecommendation(recommendation.recommendation_id),
    target_type: "planning_recommendation",
    target_id: recommendation.recommendation_id,
  };
}

function fromEvent(event: CalendarEvent): WorkflowBundleSectionItem {
  return {
    label: event.summary?.trim() || "Upcoming meeting",
    summary: `Starts ${formatTimestamp(event.start_at)}.`,
    command: commandForCalendarEvent(event.event_id),
    target_type: "calendar_event",
    target_id: event.event_id,
  };
}

function buildSectionsAndActions(input: {
  workflow: WorkflowBundleReport["workflow"];
  readiness: ServiceState;
  summary: string;
  sections: WorkflowBundleSection[];
  worklist: WorklistReport;
}): WorkflowBundleReport {
  const firstRepair = firstRepairStep(input.readiness, input.worklist);
  const actions: WorkflowBundleAction[] = [];
  const seenActionKeys = new Set<string>();

  if (firstRepair && input.readiness !== "ready") {
    const repairItem = firstRepairItem(input.worklist);
    pushUniqueAction(actions, seenActionKeys, {
      label: "First repair step",
      summary: repairItem?.summary ?? "Start with the shortest repair path before trusting the rest of the day-start bundle.",
      command: firstRepair,
      target_type: repairItem?.target_type,
      target_id: repairItem?.target_id,
    });
  }

  for (const section of input.sections) {
    for (const item of section.items) {
      if (!item.command) {
        continue;
      }
      pushUniqueAction(actions, seenActionKeys, {
        label: item.label,
        summary: item.summary,
        command: item.command,
        target_type: item.target_type,
        target_id: item.target_id,
      });
    }
  }

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

function isTimeSensitive(item: AttentionItem): boolean {
  return [
    "system_degraded",
    "sync_degraded",
    "calendar_sync_degraded",
    "task_overdue",
    "task_due_soon",
    "task_reminder_due",
    "thread_stale_followup",
    "thread_needs_reply",
    "calendar_event_soon",
    "calendar_conflict",
    "planning_recommendation_pending",
    "planning_recommendation_snooze_expiring",
    "planning_recommendation_group",
  ].includes(item.kind);
}

function isTaskPressure(item: AttentionItem): boolean {
  return ["task_overdue", "task_due_soon", "task_reminder_due", "task_in_progress_stale"].includes(item.kind);
}

function isTodayLocal(timestamp: string): boolean {
  const now = new Date();
  const date = new Date(timestamp);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isNext24Hours(timestamp: string): boolean {
  const eventTime = Date.parse(timestamp);
  const now = Date.now();
  return Number.isFinite(eventTime) && eventTime >= now && eventTime <= now + 24 * 60 * 60 * 1000;
}

export async function buildPrepDayWorkflowReport(service: any, options: { httpReachable: boolean }): Promise<WorkflowBundleReport> {
  const [status, worklist, nextPlanning] = await Promise.all([
    service.getStatusReport(options),
    service.getWorklistReport(options),
    service.getNextPlanningRecommendationDetail(),
  ]);

  const topAttention: WorkflowBundleSectionItem[] = [];
  const topAttentionKeys = new Set<string>();
  for (const item of worklist.items) {
    pushUniqueSectionItem(topAttention, topAttentionKeys, fromWorklistItem(item));
  }

  const timeSensitive: WorkflowBundleSectionItem[] = [];
  const timeSensitiveKeys = new Set<string>(topAttentionKeys);
  for (const item of worklist.items.filter(isTimeSensitive)) {
    pushUniqueSectionItem(timeSensitive, timeSensitiveKeys, fromWorklistItem(item));
  }
  if (nextPlanning?.recommendation) {
    pushUniqueSectionItem(
      timeSensitive,
      timeSensitiveKeys,
      fromRecommendation(nextPlanning.recommendation, nextPlanning.recommendation.proposed_title?.trim() || "Top recommendation"),
    );
  }

  const overall: WorkflowBundleSectionItem[] = [];
  pushUniqueSectionItem(overall, new Set<string>(), {
    label: "Readiness",
    summary:
      status.state === "ready"
        ? `System is ready. ${status.worklist_summary.top_item_summary ?? "No urgent operator pressure is active."}`
        : `System is ${describeReadiness(status.state)}. Start with ${firstRepairStep(status.state, worklist) ?? "personal-ops doctor"}.`,
    command: status.state === "ready" ? "personal-ops status" : firstRepairStep(status.state, worklist) ?? "personal-ops doctor",
    target_type: "system",
    target_id: "personal-ops-readiness",
  });
  pushUniqueSectionItem(overall, new Set<string>(), {
    label: "Mailbox",
    summary: `Connected mailbox: ${status.mailbox.connected ?? status.mailbox.configured ?? "not configured"}.`,
    command: "personal-ops status",
    target_type: "system",
    target_id: "personal-ops-mailbox",
  });

  return buildSectionsAndActions({
    workflow: "prep-day",
    readiness: status.state,
    summary:
      status.state === "ready"
        ? `Ready for the day. ${worklist.items[0]?.summary ?? "No urgent operator work is waiting."}`
        : `Day-start attention needed. Lead with ${firstRepairStep(status.state, worklist) ?? "personal-ops doctor"}.`,
    sections: [
      { title: "Overall State", items: overall },
      { title: "Top Attention", items: topAttention },
      { title: "Time-Sensitive Items", items: timeSensitive },
      {
        title: "Next Commands",
        items: [],
      },
    ],
    worklist,
  });
}

export async function buildFollowUpBlockWorkflowReport(
  service: any,
  options: { httpReachable: boolean },
): Promise<WorkflowBundleReport> {
  const [status, worklist, needsReply, staleFollowups, recommendations] = await Promise.all([
    service.getStatusReport(options),
    service.getWorklistReport(options),
    Promise.resolve(service.listNeedsReplyThreads(10)),
    Promise.resolve(service.listFollowupThreads(10)),
    Promise.resolve(service.listPlanningRecommendations({ status: "pending", kind: "schedule_thread_followup" })),
  ]);

  const needsReplyItems: WorkflowBundleSectionItem[] = [];
  const replyKeys = new Set<string>();
  for (const thread of needsReply) {
    pushUniqueSectionItem(needsReplyItems, replyKeys, fromThread(thread));
  }

  const nudgeItems: WorkflowBundleSectionItem[] = [];
  const nudgeKeys = new Set<string>();
  for (const thread of staleFollowups) {
    pushUniqueSectionItem(nudgeItems, nudgeKeys, fromThread(thread));
  }
  for (const recommendation of recommendations) {
    pushUniqueSectionItem(
      nudgeItems,
      nudgeKeys,
      fromRecommendation(recommendation, recommendation.proposed_title?.trim() || "Scheduled follow-up recommendation"),
    );
  }
  for (const item of worklist.items.filter(isTaskPressure)) {
    pushUniqueSectionItem(nudgeItems, nudgeKeys, fromWorklistItem(item));
  }

  return buildSectionsAndActions({
    workflow: "follow-up-block",
    readiness: status.state,
    summary: `Follow-up block: ${needsReply.length} threads may need reply, ${staleFollowups.length} stale follow-ups are waiting, and ${recommendations.length} follow-up recommendations are open.`,
    sections: [
      { title: "Needs Reply", items: needsReplyItems },
      { title: "Waiting To Nudge", items: nudgeItems },
      { title: "Next Commands", items: [] },
    ],
    worklist,
  });
}

export async function buildPrepMeetingsWorkflowReport(
  service: any,
  options: { httpReachable: boolean; scope: "today" | "next_24h" },
): Promise<WorkflowBundleReport> {
  const [status, worklist, recommendations, allEvents] = await Promise.all([
    service.getStatusReport(options),
    service.getWorklistReport(options),
    Promise.resolve(service.listPlanningRecommendations({ status: "pending", kind: "schedule_event_prep" })),
    Promise.resolve(service.listUpcomingCalendarEvents(options.scope === "today" ? 2 : 2, 20)),
  ]);

  const scopedEvents = allEvents
    .filter((event: CalendarEvent) => !event.is_all_day && event.status !== "cancelled")
    .filter((event: CalendarEvent) => (options.scope === "today" ? isTodayLocal(event.start_at) : isNext24Hours(event.start_at)))
    .slice(0, 10);

  const prepByEventId = new Map<string, PlanningRecommendation>();
  for (const recommendation of recommendations) {
    if (recommendation.source_calendar_event_id) {
      prepByEventId.set(recommendation.source_calendar_event_id, recommendation);
    }
  }

  const upcomingItems: WorkflowBundleSectionItem[] = [];
  const upcomingKeys = new Set<string>();
  for (const event of scopedEvents) {
    pushUniqueSectionItem(upcomingItems, upcomingKeys, fromEvent(event));
  }

  const prepItems: WorkflowBundleSectionItem[] = [];
  const prepKeys = new Set<string>();
  for (const event of scopedEvents) {
    const recommendation = prepByEventId.get(event.event_id);
    if (recommendation) {
      pushUniqueSectionItem(
        prepItems,
        prepKeys,
        fromRecommendation(recommendation, recommendation.proposed_title?.trim() || `Prep for ${event.summary?.trim() || "meeting"}`),
      );
    } else {
      pushUniqueSectionItem(prepItems, prepKeys, fromEvent(event));
    }
  }

  return buildSectionsAndActions({
    workflow: "prep-meetings",
    readiness: status.state,
    summary:
      scopedEvents.length === 0
        ? "No meetings in scope need prep right now."
        : `${scopedEvents.length} meeting${scopedEvents.length === 1 ? "" : "s"} in scope and ${prepItems.length} prep item${prepItems.length === 1 ? "" : "s"} surfaced.`,
    sections: [
      { title: "Upcoming Meetings", items: upcomingItems },
      { title: "Prep Needed", items: prepItems },
      { title: "Next Commands", items: [] },
    ],
    worklist,
  });
}
