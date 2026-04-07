import type {
  AssistantActionRunReport,
  AssistantActionState,
  CalendarEvent,
  MeetingPrepPacket,
  MeetingPrepPacketMeeting,
  MeetingPrepPacketRecord,
  MeetingPrepRecommendationSummary,
  MeetingPrepTaskSummary,
  MeetingPrepThreadSummary,
  RelatedDriveDoc,
  RelatedDriveFile,
  WorkflowScoreBand,
} from "../types.js";

const PACKET_SCOPE_LIMIT = 10;
const AUTO_PREP_LIMIT = 2;
const AUTO_PREP_WINDOW_HOURS = 4;
const PACKET_URGENCY_WINDOW_HOURS = 6;
const THREAD_MATCH_LIMIT = 3;
const TASK_MATCH_LIMIT = 3;
const RECOMMENDATION_MATCH_LIMIT = 3;
const STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "from",
  "have",
  "into",
  "meeting",
  "notes",
  "prep",
  "review",
  "sync",
  "team",
  "that",
  "this",
  "today",
  "with",
]);

export interface MeetingPrepCandidate {
  event: CalendarEvent;
  packet_record: MeetingPrepPacketRecord | null;
  state: AssistantActionState;
  score: number;
  summary: string;
  why_now: string;
  score_band: WorkflowScoreBand;
  signals: string[];
  packet_worthy: boolean;
  related_docs: RelatedDriveDoc[];
  related_files: RelatedDriveFile[];
  related_threads: MeetingPrepThreadSummary[];
  related_tasks: MeetingPrepTaskSummary[];
  related_recommendations: MeetingPrepRecommendationSummary[];
}

function latestRunMap(service: any): Record<string, AssistantActionRunReport | undefined> {
  if (!service?.db || typeof service.db.listAuditEvents !== "function") {
    return {};
  }
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

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return "not scheduled";
  }
  return new Date(value).toLocaleString();
}

function eventCommand(eventId: string): string {
  return `personal-ops workflow prep-meetings --event ${eventId}`;
}

function prepareCommand(eventId: string): string {
  return `personal-ops workflow prep-meetings --event ${eventId} --prepare`;
}

export function prepareMeetingPacketActionId(eventId: string): string {
  return `assistant.prepare-meeting-packet:${eventId}`;
}

function packetScoreBand(score: number): WorkflowScoreBand {
  if (score >= 520) {
    return "highest";
  }
  if (score >= 340) {
    return "high";
  }
  return "medium";
}

function tokenize(value: string | undefined): Set<string> {
  const tokens = new Set<string>();
  if (!value) {
    return tokens;
  }
  for (const token of value.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!token || token.length < 4 || STOP_WORDS.has(token)) {
      continue;
    }
    tokens.add(token);
  }
  return tokens;
}

function tokensOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function buildMeetingShape(event: CalendarEvent): MeetingPrepPacketMeeting {
  return {
    event_id: event.event_id,
    summary: event.summary,
    start_at: event.start_at,
    end_at: event.end_at,
    location: event.location,
    organizer_email: event.organizer_email,
    attendee_count: event.attendee_count,
    notes: event.notes,
    html_link: event.html_link,
  };
}

function buildRelatedThreads(service: any, event: CalendarEvent): MeetingPrepThreadSummary[] {
  const eventTokens = tokenize([event.summary, event.notes, event.location].filter(Boolean).join(" "));
  if (eventTokens.size === 0) {
    return [];
  }
  return service
    .listRecentThreads(40)
    .filter((thread: any) =>
      tokensOverlap(eventTokens, tokenize([thread.latest_message?.subject, thread.latest_message?.from_header, thread.latest_message?.to_header].filter(Boolean).join(" "))),
    )
    .slice(0, THREAD_MATCH_LIMIT)
    .map((thread: any) => ({
      thread_id: thread.thread.thread_id,
      subject: thread.latest_message?.subject?.trim() || "Inbox thread",
      counterparty_summary: thread.last_direction === "outbound"
        ? thread.latest_message?.to_header?.trim() || "counterparty not captured"
        : thread.latest_message?.from_header?.trim() || "counterparty not captured",
      last_message_at: thread.thread.last_message_at,
      suggested_command: `personal-ops inbox thread ${thread.thread.thread_id}`,
    }));
}

function buildRelatedTasks(service: any, event: CalendarEvent): MeetingPrepTaskSummary[] {
  return service
    .listTasks({ include_history: false })
    .filter((task: any) => task.source_calendar_event_id === event.event_id || task.scheduled_calendar_event_id === event.event_id)
    .slice(0, TASK_MATCH_LIMIT)
    .map((task: any) => ({
      task_id: task.task_id,
      title: task.title,
      state: task.state,
      due_at: task.due_at,
      suggested_command: `personal-ops task show ${task.task_id}`,
    }));
}

function buildRelatedRecommendations(service: any, event: CalendarEvent): MeetingPrepRecommendationSummary[] {
  return service
    .listPlanningRecommendations({ include_resolved: false, kind: "schedule_event_prep" })
    .filter((recommendation: any) => recommendation.source_calendar_event_id === event.event_id)
    .slice(0, RECOMMENDATION_MATCH_LIMIT)
    .map((recommendation: any) => ({
      recommendation_id: recommendation.recommendation_id,
      title: recommendation.proposed_title?.trim() || recommendation.reason_summary,
      summary: recommendation.reason_summary,
      suggested_command: `personal-ops recommendation show ${recommendation.recommendation_id}`,
    }));
}

function derivePacketState(input: {
  event: CalendarEvent;
  packetRecord: MeetingPrepPacketRecord | null;
  latestRun: AssistantActionRunReport | undefined;
  running: boolean;
  blocked: boolean;
  packetWorthy: boolean;
}): AssistantActionState {
  if (Date.parse(input.event.end_at) <= Date.now()) {
    return "completed";
  }
  if (input.running) {
    return "running";
  }
  if (input.blocked) {
    return "blocked";
  }
  if (input.packetRecord) {
    return "awaiting_review";
  }
  if (input.latestRun?.outcome === "failure") {
    return "failed";
  }
  if (!input.packetWorthy) {
    return "blocked";
  }
  return "proposed";
}

function lowContextOpenQuestions(event: CalendarEvent): string[] {
  return [
    "Is there a primary doc or notes link that should be attached before the meeting starts?",
    "What concrete outcome should this meeting produce?",
    event.location || event.html_link ? "Is the current join/location information still accurate?" : "Where should the operator look for the meeting join details?",
  ];
}

function buildAgenda(candidate: MeetingPrepCandidate): string[] {
  const items: string[] = [];
  const title = candidate.event.summary?.trim() || "this meeting";
  items.push(`Open by confirming the goal and expected outcome for ${title}.`);
  if (candidate.related_files.length > 0) {
    items.push(`Review ${candidate.related_files[0]?.title ?? "the linked context file"} together so everyone is aligned on the same source material.`);
  }
  if (candidate.related_tasks.length > 0 || candidate.related_recommendations.length > 0) {
    items.push("Check the remaining prep work and decide what still needs attention before the meeting ends.");
  }
  if (candidate.related_threads.length > 0) {
    items.push("Resolve the open questions that surfaced in the recent related thread activity.");
  }
  return items.slice(0, 3);
}

function buildChecklist(candidate: MeetingPrepCandidate): string[] {
  const items: string[] = [];
  if (candidate.related_files.length > 0) {
    items.push(`Skim ${candidate.related_files.map((file) => file.title).join(", ")} before the meeting.`);
  } else {
    items.push("Find the primary doc or notes link before joining if one exists.");
  }
  if (candidate.related_tasks.length > 0) {
    items.push("Check the open prep-related tasks and note what is still incomplete.");
  }
  if (candidate.related_recommendations.length > 0) {
    items.push("Review the pending prep recommendation and decide whether it still needs action.");
  }
  if (candidate.related_threads.length > 0) {
    items.push("Skim the recent related thread activity for unresolved questions.");
  }
  if (candidate.event.location || candidate.event.html_link) {
    items.push("Confirm the join details and location are still accurate.");
  }
  return items.slice(0, 4);
}

function buildOpenQuestions(candidate: MeetingPrepCandidate): string[] {
  const items: string[] = [];
  if (candidate.related_files.length === 0) {
    items.push("Which document should anchor the discussion?");
  }
  if (candidate.related_tasks.length === 0 && candidate.related_recommendations.length === 0) {
    items.push("What prep work still needs an explicit owner before the meeting starts?");
  }
  if (candidate.related_threads.length === 0) {
    items.push("Are there unresolved email or follow-up threads that should be folded into the prep?");
  }
  return items.length > 0 ? items : ["What decision or next step should the operator listen for during this meeting?"];
}

function buildNextCommands(candidate: MeetingPrepCandidate): string[] {
  const commands = [eventCommand(candidate.event.event_id)];
  if (!candidate.packet_record) {
    commands.unshift(prepareCommand(candidate.event.event_id));
  }
  if (candidate.related_recommendations[0]?.suggested_command) {
    commands.push(candidate.related_recommendations[0].suggested_command);
  } else if (candidate.related_tasks[0]?.suggested_command) {
    commands.push(candidate.related_tasks[0].suggested_command);
  } else if (candidate.related_threads[0]?.suggested_command) {
    commands.push(candidate.related_threads[0].suggested_command);
  }
  return [...new Set(commands)].slice(0, 3);
}

function summarizeCandidate(event: CalendarEvent, hoursUntil: number | null, files: number, tasks: number, recs: number, threads: number): {
  score: number;
  summary: string;
  whyNow: string;
  signals: string[];
  packetWorthy: boolean;
} {
  let score = 220;
  const signals = ["meeting_in_scope"];
  let whyNow = "This meeting is in scope, but prep is still lightweight.";
  let packetWorthy = false;

  if (hoursUntil !== null && hoursUntil > 0 && hoursUntil <= AUTO_PREP_WINDOW_HOURS) {
    score += 260;
    signals.push("meeting_imminent");
    whyNow = "The meeting is close enough that staging the prep packet now will still reduce scramble.";
    packetWorthy = true;
  } else if (hoursUntil !== null && hoursUntil > 0 && hoursUntil <= PACKET_URGENCY_WINDOW_HOURS) {
    score += 150;
    signals.push("meeting_today");
  }
  if (files > 0) {
    score += 80;
    signals.push("files_linked");
    packetWorthy = true;
  }
  if (tasks > 0) {
    score += 60;
    signals.push("tasks_linked");
    packetWorthy = true;
  }
  if (recs > 0) {
    score += 70;
    signals.push("prep_recommendation");
    packetWorthy = true;
  }
  if (threads > 0) {
    score += 50;
    signals.push("recent_thread_activity");
    packetWorthy = true;
  }

  const title = event.summary?.trim() || "Upcoming meeting";
  const parts: string[] = [];
  if (files > 0) parts.push(`${files} linked file${files === 1 ? "" : "s"}`);
  if (tasks > 0) parts.push(`${tasks} prep task${tasks === 1 ? "" : "s"}`);
  if (recs > 0) parts.push(`${recs} prep recommendation${recs === 1 ? "" : "s"}`);
  if (threads > 0) parts.push(`${threads} related thread${threads === 1 ? "" : "s"}`);

  const summary = parts.length > 0 ? `${title} has ${parts.join(", ")} in context.` : `${title} starts ${formatTimestamp(event.start_at)}.`;

  if (!packetWorthy) {
    whyNow = "This meeting is visible, but there is not enough grounded context yet to justify a full prep packet.";
  } else if (files > 0 && (tasks > 0 || recs > 0 || threads > 0)) {
    whyNow = "This meeting already has grounded context attached, so the assistant can assemble useful prep without guessing.";
  }

  return { score, summary, whyNow, signals, packetWorthy };
}

function buildPacketRecord(candidate: MeetingPrepCandidate): MeetingPrepPacketRecord {
  const lowContext = candidate.related_files.length === 0
    && candidate.related_tasks.length === 0
    && candidate.related_recommendations.length === 0
    && candidate.related_threads.length === 0;
  return {
    event_id: candidate.event.event_id,
    summary: candidate.summary,
    why_now: candidate.why_now,
    score_band: candidate.score_band,
    signals: candidate.signals,
    meeting: buildMeetingShape(candidate.event),
    agenda: lowContext ? ["Clarify the meeting goal from the invite or organizer context before joining."] : buildAgenda(candidate),
    prep_checklist: lowContext ? ["Confirm the primary doc, notes, or context source before the meeting starts."] : buildChecklist(candidate),
    open_questions: lowContext ? lowContextOpenQuestions(candidate.event) : buildOpenQuestions(candidate),
    related_docs: candidate.related_docs,
    related_files: candidate.related_files,
    related_threads: candidate.related_threads,
    related_tasks: candidate.related_tasks,
    related_recommendations: candidate.related_recommendations,
    next_commands: buildNextCommands(candidate),
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function hydratePacket(candidate: MeetingPrepCandidate, packetRecord: MeetingPrepPacketRecord | null): MeetingPrepPacket {
  const record = packetRecord ?? buildPacketRecord(candidate);
  return {
    event_id: candidate.event.event_id,
    state: candidate.state,
    generated_at: record.generated_at,
    summary: record.summary,
    why_now: record.why_now,
    score_band: record.score_band,
    signals: record.signals,
    meeting: record.meeting,
    agenda: record.agenda,
    prep_checklist: record.prep_checklist,
    open_questions: record.open_questions,
    related_docs: record.related_docs,
    related_files: record.related_files,
    related_threads: record.related_threads,
    related_tasks: record.related_tasks,
    related_recommendations: record.related_recommendations,
    next_commands: record.next_commands,
    assistant_action_id: prepareMeetingPacketActionId(candidate.event.event_id),
  };
}

export async function listMeetingPrepCandidates(
  service: any,
  options: { scope: "today" | "next_24h" },
): Promise<MeetingPrepCandidate[]> {
  const scopedEvents = service
    .listUpcomingCalendarEvents(1, PACKET_SCOPE_LIMIT)
    .filter((event: CalendarEvent) => !event.is_all_day && event.status !== "cancelled")
    .filter((event: CalendarEvent) =>
      options.scope === "today"
        ? new Date(event.start_at).toDateString() === new Date().toDateString()
        : (maybeHoursUntil(event.start_at) ?? 99) <= 24,
    );
  const latestRuns = latestRunMap(service);
  const calendarStatus =
    typeof service.getCalendarStatusReport === "function" ? service.getCalendarStatusReport() : { sync: { status: "ready" } };
  const calendarReady = calendarStatus.sync?.status === "ready";

  return scopedEvents
    .map((event: CalendarEvent) => {
      const packetRecord = service.db.getMeetingPrepPacket(event.event_id);
      const relatedDocs = service.getRelatedDocsForTarget("calendar_event", event.event_id, { allowFallback: true, fallbackLimit: 3 });
      const relatedFiles = service.getRelatedFilesForTarget("calendar_event", event.event_id, {
        allowFallback: true,
        fallbackLimit: 3,
        maxItems: 4,
      });
      const relatedTasks = buildRelatedTasks(service, event);
      const relatedRecommendations = buildRelatedRecommendations(service, event);
      const relatedThreads = buildRelatedThreads(service, event);
      const hoursUntil = maybeHoursUntil(event.start_at);
      const summary = summarizeCandidate(
        event,
        hoursUntil,
        relatedFiles.length,
        relatedTasks.length,
        relatedRecommendations.length,
        relatedThreads.length,
      );
      const running = Boolean(service.getAssistantActionStartedAt?.(prepareMeetingPacketActionId(event.event_id)));
      const state = derivePacketState({
        event,
        packetRecord,
        latestRun: latestRuns[prepareMeetingPacketActionId(event.event_id)],
        running,
        blocked: !calendarReady,
        packetWorthy: summary.packetWorthy,
      });
      const score = packetRecord ? summary.score + 90 : summary.score;
      return {
        event,
        packet_record: packetRecord,
        state,
        score,
        summary: packetRecord?.summary ?? summary.summary,
        why_now: packetRecord?.why_now ?? summary.whyNow,
        score_band: packetRecord?.score_band ?? packetScoreBand(score),
        signals: packetRecord?.signals ?? summary.signals,
        packet_worthy: summary.packetWorthy,
        related_docs: packetRecord?.related_docs ?? relatedDocs,
        related_files: packetRecord?.related_files ?? relatedFiles,
        related_threads: packetRecord?.related_threads ?? relatedThreads,
        related_tasks: packetRecord?.related_tasks ?? relatedTasks,
        related_recommendations: packetRecord?.related_recommendations ?? relatedRecommendations,
      } satisfies MeetingPrepCandidate;
    })
    .sort(
      (left: MeetingPrepCandidate, right: MeetingPrepCandidate) =>
        right.score - left.score || Date.parse(left.event.start_at) - Date.parse(right.event.start_at),
    );
}

export async function getMeetingPrepPacketDetail(service: any, eventId: string): Promise<MeetingPrepPacket> {
  const event = service.getCalendarEventDetail(eventId);
  const candidates = await listMeetingPrepCandidates(service, { scope: "next_24h" });
  const candidate = candidates.find((item) => item.event.event_id === eventId) ?? (() => {
    const relatedDocs = service.getRelatedDocsForTarget("calendar_event", eventId, { allowFallback: true, fallbackLimit: 3 });
    const relatedFiles = service.getRelatedFilesForTarget("calendar_event", eventId, {
      allowFallback: true,
      fallbackLimit: 3,
      maxItems: 4,
    });
    const relatedTasks = buildRelatedTasks(service, event);
    const relatedRecommendations = buildRelatedRecommendations(service, event);
    const relatedThreads = buildRelatedThreads(service, event);
    const summary = summarizeCandidate(
      event,
      maybeHoursUntil(event.start_at),
      relatedFiles.length,
      relatedTasks.length,
      relatedRecommendations.length,
      relatedThreads.length,
    );
    return {
      event,
      packet_record: service.db.getMeetingPrepPacket(eventId),
      state: derivePacketState({
        event,
        packetRecord: service.db.getMeetingPrepPacket(eventId),
        latestRun: latestRunMap(service)[prepareMeetingPacketActionId(eventId)],
        running: Boolean(service.getAssistantActionStartedAt?.(prepareMeetingPacketActionId(eventId))),
        blocked:
          typeof service.getCalendarStatusReport === "function"
            ? service.getCalendarStatusReport().sync?.status !== "ready"
            : false,
        packetWorthy: summary.packetWorthy,
      }),
      score: summary.score,
      summary: summary.summary,
      why_now: summary.whyNow,
      score_band: packetScoreBand(summary.score),
      signals: summary.signals,
      packet_worthy: summary.packetWorthy,
      related_docs: relatedDocs,
      related_files: relatedFiles,
      related_threads: relatedThreads,
      related_tasks: relatedTasks,
      related_recommendations: relatedRecommendations,
    } satisfies MeetingPrepCandidate;
  })();
  return hydratePacket(candidate, candidate.packet_record);
}

export async function prepareMeetingPrepPacket(
  service: any,
  identity: any,
  eventId: string,
  options: {
    autopilotMetadata?: {
      autopilot_run_id?: string;
      autopilot_profile?: string;
      autopilot_trigger?: string;
      autopilot_prepared_at?: string;
    };
  } = {},
): Promise<{
  summary: string;
  details: string[];
  success: boolean;
  packet: MeetingPrepPacket;
}> {
  service.assertOperatorOnly(identity, "prepare this meeting packet");
  service.db.registerClient(identity);
  const event = service.getCalendarEventDetail(eventId);
  const actionId = prepareMeetingPacketActionId(eventId);
  const details: string[] = [];
  let storedPacket: MeetingPrepPacketRecord | null = null;

  await service.runTrackedAssistantAction(actionId, async () => {
    const packet = await getMeetingPrepPacketDetail(service, eventId);
    const persisted = service.db.upsertMeetingPrepPacket({
      event_id: packet.event_id,
      summary: packet.summary,
      why_now: packet.why_now,
      score_band: packet.score_band,
      signals: packet.signals,
      meeting: packet.meeting,
      agenda: packet.agenda,
      prep_checklist: packet.prep_checklist,
      open_questions: packet.open_questions,
      related_docs: packet.related_docs,
      related_files: packet.related_files,
      related_threads: packet.related_threads,
      related_tasks: packet.related_tasks,
      related_recommendations: packet.related_recommendations,
      next_commands: packet.next_commands,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      autopilot_run_id: options.autopilotMetadata?.autopilot_run_id,
      autopilot_profile: options.autopilotMetadata?.autopilot_profile as any,
      autopilot_trigger: options.autopilotMetadata?.autopilot_trigger as any,
      autopilot_prepared_at: options.autopilotMetadata?.autopilot_prepared_at,
    });
    storedPacket = persisted;
    details.push(`Prepared packet for ${event.summary?.trim() || event.event_id}.`);
    details.push(
      `${persisted.related_files.length} files, ${persisted.related_threads.length} threads, ${persisted.related_tasks.length} tasks, and ${persisted.related_recommendations.length} recommendations were attached.`,
    );
  });

  const summary = `Prepared meeting packet for ${event.summary?.trim() || event.event_id}.`;
  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action: "assistant_action_run",
    target_type: "assistant_action",
    target_id: actionId,
    outcome: "success",
    metadata: {
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      summary,
      details,
    },
  });
  const refreshed = await getMeetingPrepPacketDetail(service, eventId);
  return {
    summary,
    details,
    success: true,
    packet: refreshed,
  };
}

export async function maybeAutoPrepareMeetingPackets(
  service: any,
  options: {
    httpReachable: boolean;
    autopilotMetadata?: {
      autopilot_run_id?: string;
      autopilot_profile?: string;
      autopilot_trigger?: string;
      autopilot_prepared_at?: string;
    };
  },
): Promise<void> {
  const status = await service.getStatusReport(options);
  if (status.state !== "ready") {
    return;
  }
  const identity = {
    client_id: "personal-ops-system",
    requested_by: "meeting-prep-auto",
    origin: "daemon",
    auth_role: "operator",
  };
  const candidates = await listMeetingPrepCandidates(service, { scope: "next_24h" });
  const selected = candidates
    .filter((candidate) => candidate.packet_worthy)
    .filter((candidate) => {
      const hoursUntil = maybeHoursUntil(candidate.event.start_at);
      return hoursUntil !== null && hoursUntil > 0 && hoursUntil <= AUTO_PREP_WINDOW_HOURS;
    })
    .filter((candidate) => candidate.state === "proposed" || candidate.state === "failed")
    .slice(0, AUTO_PREP_LIMIT);
  for (const candidate of selected) {
    await prepareMeetingPrepPacket(service, identity, candidate.event.event_id, options.autopilotMetadata ? {
      autopilotMetadata: options.autopilotMetadata,
    } : {});
  }
}
