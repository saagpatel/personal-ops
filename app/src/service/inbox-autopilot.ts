import { createHash } from "node:crypto";
import type {
  AssistantActionRunReport,
  AssistantActionState,
  DraftArtifact,
  DraftInput,
  InboxAutopilotGroup,
  InboxAutopilotGroupKind,
  InboxAutopilotReport,
  InboxAutopilotThreadSummary,
  InboxThreadSummary,
  MailMessage,
  MailThreadDetail,
  RelatedDriveDoc,
  ReviewItem,
  WorkflowScoreBand,
} from "../types.js";

const MAX_GROUP_THREADS = 3;
const MAX_GROUPS_PER_KIND = 2;

type BuildOptions = { httpReachable: boolean };

interface DraftGenerationResult {
  summary: string;
  details: string[];
  success: boolean;
  group: InboxAutopilotGroup;
  drafts: DraftArtifact[];
  failed_thread_ids: string[];
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

function groupIdFor(kind: InboxAutopilotGroupKind, threadIds: string[]): string {
  const digest = createHash("sha1").update(`${kind}:${threadIds.join(",")}`).digest("hex").slice(0, 12);
  return `${kind}:${digest}`;
}

function prepareActionId(kind: InboxAutopilotGroupKind, groupId: string): string {
  return kind === "needs_reply"
    ? `assistant.prepare-reply-group:${groupId}`
    : `assistant.prepare-followup-group:${groupId}`;
}

function reviewActionId(groupId: string): string {
  return `assistant.review-draft-group:${groupId}`;
}

function scoreBandFor(kind: InboxAutopilotGroupKind, hasPreparedDrafts: boolean): WorkflowScoreBand {
  if (kind === "needs_reply") {
    return hasPreparedDrafts ? "highest" : "high";
  }
  return hasPreparedDrafts ? "high" : "medium";
}

function counterpartySummary(summary: InboxThreadSummary, mailbox: string): string {
  const latest = summary.latest_message;
  const source = summary.last_direction === "outbound" ? latest?.to_header : latest?.from_header;
  const emails = parseHeaderEmails(source).filter((value) => value.toLowerCase() !== mailbox.toLowerCase());
  if (emails.length === 0) {
    return latest?.subject?.trim() || "counterparty not captured";
  }
  return emails.join(", ");
}

function normalizeThreadSubject(summary: InboxThreadSummary): string {
  return summary.latest_message?.subject?.trim() || "Inbox thread";
}

function parseHeaderEmails(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const matches = [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]?.trim() ?? "");
  return [...new Set(matches.filter(Boolean))];
}

function usableStatuses(): Set<DraftArtifact["status"]> {
  return new Set(["draft", "approval_pending", "approved", "send_failed", "rejected"]);
}

function latestReusableDraft(service: any, threadId: string): DraftArtifact | null {
  const drafts = service.db
    .listDraftArtifactsByAssistantSourceThread(threadId)
    .filter((draft: DraftArtifact) => draft.assistant_generated && usableStatuses().has(draft.status));
  return drafts[0] ?? null;
}

function threadHasFreshDraft(summary: InboxThreadSummary, draft: DraftArtifact | null): boolean {
  if (!draft) {
    return false;
  }
  const latestSubject = summary.latest_message?.subject?.trim() || "";
  const draftSubject = draft.subject?.trim() || "";
  return Number(summary.thread.last_message_at) <= Date.parse(draft.updated_at) && latestSubject === draftSubject;
}

function groupState(input: {
  blocked: boolean;
  running: boolean;
  freshDraftCount: number;
  threadCount: number;
  latestRun: AssistantActionRunReport | undefined;
}): AssistantActionState {
  if (input.running) {
    return "running";
  }
  if (input.blocked) {
    return "blocked";
  }
  if (input.freshDraftCount === input.threadCount && input.threadCount > 0) {
    return "awaiting_review";
  }
  if (input.latestRun?.outcome === "failure") {
    return "failed";
  }
  return "proposed";
}

function buildGroupSummary(kind: InboxAutopilotGroupKind, threadCount: number, freshDraftCount: number): string {
  if (freshDraftCount === threadCount && threadCount > 0) {
    return kind === "needs_reply"
      ? `${threadCount} reply draft${threadCount === 1 ? "" : "s"} are staged and ready for review.`
      : `${threadCount} follow-up draft${threadCount === 1 ? "" : "s"} are staged and ready for review.`;
  }
  return kind === "needs_reply"
    ? `Prepare ${threadCount} bounded reply draft${threadCount === 1 ? "" : "s"} from the current inbox pressure.`
    : `Prepare ${threadCount} bounded follow-up draft${threadCount === 1 ? "" : "s"} for stale threads.`;
}

function buildWhyNow(kind: InboxAutopilotGroupKind, freshDraftCount: number): string {
  if (freshDraftCount > 0) {
    return kind === "needs_reply"
      ? "The assistant already staged reply work here, so review is faster than re-triaging the threads from scratch."
      : "The assistant already staged the nudge drafts, so the next move is to review and hand them forward.";
  }
  return kind === "needs_reply"
    ? "These live conversations need replies, and grouping them keeps the assistant’s draft prep bounded and reviewable."
    : "These stale follow-ups are good low-risk candidates for assistant-prepared nudges.";
}

function draftIdsForThreads(service: any, threads: InboxThreadSummary[]): string[] {
  return threads
    .map((thread) => latestReusableDraft(service, thread.thread.thread_id)?.artifact_id ?? null)
    .filter((value): value is string => Boolean(value));
}

function buildGroup(
  service: any,
  kind: InboxAutopilotGroupKind,
  threads: InboxThreadSummary[],
  latestRuns: Record<string, AssistantActionRunReport | undefined>,
): InboxAutopilotGroup {
  const mailbox = service.getInboxStatusReport().mailbox ?? "";
  const threadIds = threads.map((thread) => thread.thread.thread_id);
  const groupId = groupIdFor(kind, threadIds);
  const prepareId = prepareActionId(kind, groupId);
  const drafts = threads.map((thread) => latestReusableDraft(service, thread.thread.thread_id));
  const freshDraftCount = threads.filter((thread, index) => threadHasFreshDraft(thread, drafts[index] ?? null)).length;
  const blocked = !mailbox || service.getInboxStatusReport().sync?.status !== "ready";
  const running = Boolean(service.getAssistantActionStartedAt?.(prepareId));
  const latestRun = latestRuns[prepareId];
  const state = groupState({
    blocked,
    running,
    freshDraftCount,
    threadCount: threads.length,
    latestRun,
  });
  const hasPreparedDrafts = freshDraftCount > 0;
  const draftArtifactIds = draftIdsForThreads(service, threads);
  return {
    group_id: groupId,
    kind,
    state,
    summary: buildGroupSummary(kind, threads.length, freshDraftCount),
    why_now: buildWhyNow(kind, freshDraftCount),
    score_band: scoreBandFor(kind, hasPreparedDrafts),
    signals: [
      kind,
      hasPreparedDrafts ? "drafts_staged" : "drafts_missing",
      blocked ? "mailbox_blocked" : "mailbox_ready",
    ],
    assistant_action_id: state === "awaiting_review" ? reviewActionId(groupId) : prepareId,
    review_required: state === "awaiting_review",
    one_click: state !== "awaiting_review" && state !== "blocked",
    threads: threads.map((thread, index): InboxAutopilotThreadSummary => ({
      thread_id: thread.thread.thread_id,
      subject: normalizeThreadSubject(thread),
      counterparty_summary: counterpartySummary(thread, mailbox),
      last_message_at: thread.thread.last_message_at,
      suggested_command: `personal-ops inbox thread ${thread.thread.thread_id}`,
      draft_artifact_id: drafts[index]?.artifact_id,
    })),
    draft_artifact_ids: draftArtifactIds,
  };
}

function chunkThreads(items: InboxThreadSummary[]): InboxThreadSummary[][] {
  const groups: InboxThreadSummary[][] = [];
  for (let index = 0; index < items.length && groups.length < MAX_GROUPS_PER_KIND; index += MAX_GROUP_THREADS) {
    groups.push(items.slice(index, index + MAX_GROUP_THREADS));
  }
  return groups.filter((group) => group.length > 0);
}

export async function buildInboxAutopilotReport(service: any, options: BuildOptions): Promise<InboxAutopilotReport> {
  const [worklist, needsReply, followups] = await Promise.all([
    service.getWorklistReport(options),
    Promise.resolve(service.listNeedsReplyThreads(6)),
    Promise.resolve(service.listFollowupThreads(6)),
  ]);
  const latestRuns = latestRunMap(service);
  const groups = [
    ...chunkThreads(needsReply).map((threads) => buildGroup(service, "needs_reply", threads, latestRuns)),
    ...chunkThreads(followups).map((threads) => buildGroup(service, "waiting_to_nudge", threads, latestRuns)),
  ];
  const preparedDraftCount = new Set(groups.flatMap((group) => group.draft_artifact_ids)).size;
  return {
    generated_at: new Date().toISOString(),
    readiness: worklist.state,
    summary:
      groups.length === 0
        ? "No reply or follow-up groups need assistant prep right now."
        : `${groups.length} inbox autopilot group${groups.length === 1 ? "" : "s"} are ready, with ${preparedDraftCount} staged draft${preparedDraftCount === 1 ? "" : "s"}.`,
    top_item_summary: groups[0]?.summary ?? null,
    prepared_draft_count: preparedDraftCount,
    groups,
  };
}

function firstLineSummary(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "this thread";
}

function buildDraftBody(
  kind: InboxAutopilotGroupKind,
  detail: MailThreadDetail,
  relatedDocs: RelatedDriveDoc[],
  mailbox: string,
): string {
  const latest = detail.messages[0];
  const docLine =
    relatedDocs.length > 0
      ? `I also have the related material ready on my side${relatedDocs[0]?.title ? ` (${relatedDocs[0].title})` : ""}.`
      : "";
  const signature = mailbox.includes("@") ? mailbox.split("@")[0] : "me";
  if (kind === "needs_reply") {
    return [
      "Hi,",
      "",
      `Thanks for the note about ${firstLineSummary(latest?.subject ?? "this thread")}. I’m following up here and have it on my radar.`,
      docLine,
      "",
      "Best,",
      signature,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "Hi,",
    "",
    "Following up here in case this got buried.",
    docLine || "Let me know if you need anything else from me to move this forward.",
    "",
    "Best,",
    signature,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDraftRecipients(kind: InboxAutopilotGroupKind, detail: MailThreadDetail, mailbox: string): string[] {
  const latest = detail.messages[0];
  const headerValue = kind === "needs_reply" ? latest?.from_header : latest?.to_header;
  const recipients = parseHeaderEmails(headerValue).filter((value) => value.toLowerCase() !== mailbox.toLowerCase());
  return [...new Set(recipients)];
}

function draftInputForThread(
  kind: InboxAutopilotGroupKind,
  detail: MailThreadDetail,
  relatedDocs: RelatedDriveDoc[],
  mailbox: string,
): DraftInput {
  return {
    to: buildDraftRecipients(kind, detail, mailbox),
    cc: [],
    bcc: [],
    subject: detail.messages[0]?.subject?.trim() || "Follow-up",
    body_text: buildDraftBody(kind, detail, relatedDocs, mailbox),
  };
}

function relatedDocsForThreadDraft(service: any, existingDraft: DraftArtifact | null): RelatedDriveDoc[] {
  if (!existingDraft) {
    return [];
  }
  return service.getRelatedDocsForTarget("draft_artifact", existingDraft.artifact_id, { allowFallback: false });
}

function ensureDraftReviewState(service: any, draft: DraftArtifact): { draft: DraftArtifact; review: ReviewItem | null } {
  const review = service.db.getLatestReviewItemForArtifact(draft.artifact_id);
  return { draft: service.db.getDraftArtifact(draft.artifact_id) ?? draft, review };
}

export async function prepareInboxAutopilotGroup(
  service: any,
  identity: any,
  groupId: string,
  options: {
    autopilotMetadata?: {
      autopilot_run_id?: string;
      autopilot_profile?: string;
      autopilot_trigger?: string;
      autopilot_prepared_at?: string;
    };
  } = {},
): Promise<DraftGenerationResult> {
  service.assertOperatorOnly(identity, "prepare this inbox autopilot group");
  service.db.registerClient(identity);
  const report = await buildInboxAutopilotReport(service, { httpReachable: true });
  const group = report.groups.find((item) => item.group_id === groupId);
  if (!group) {
    throw new Error(`Inbox autopilot group ${groupId} is not available right now.`);
  }
  if (group.state === "blocked") {
    throw new Error("Inbox autopilot is blocked until mailbox auth and sync are healthy.");
  }
  const stored = await service.dependencies.loadStoredGmailTokens(service.config, service.db);
  const drafts: DraftArtifact[] = [];
  const details: string[] = [];
  const failedThreadIds: string[] = [];
  let hadFailure = false;

  await service.runTrackedAssistantAction(group.assistant_action_id, async () => {
    for (const thread of group.threads) {
      try {
        const threadDetail = service.getInboxThreadDetail(thread.thread_id);
        const existingDraft = latestReusableDraft(service, thread.thread_id);
        if (threadHasFreshDraft({ thread: threadDetail.thread, latest_message: threadDetail.messages[0], derived_kind: threadDetail.derived_kind, last_direction: threadDetail.last_direction }, existingDraft)) {
          if (existingDraft) {
            drafts.push(existingDraft);
            details.push(`Reused existing draft ${existingDraft.artifact_id} for thread ${thread.thread_id}.`);
          }
          continue;
        }

        const relatedDocs = relatedDocsForThreadDraft(service, existingDraft);
        const input = draftInputForThread(group.kind, threadDetail, relatedDocs, stored.email);
        if (input.to.length === 0) {
          throw new Error("No safe recipient could be inferred from the stored thread metadata.");
        }

        const assistantMetadata = {
          assistant_generated: true,
          assistant_source_thread_id: thread.thread_id,
          assistant_group_id: group.group_id,
          assistant_why_now: group.why_now,
          autopilot_run_id: options.autopilotMetadata?.autopilot_run_id,
          autopilot_profile: options.autopilotMetadata?.autopilot_profile,
          autopilot_trigger: options.autopilotMetadata?.autopilot_trigger,
          autopilot_prepared_at: options.autopilotMetadata?.autopilot_prepared_at,
        };

        const draft = existingDraft
          ? await service.updateDraft(identity, existingDraft.artifact_id, input, { assistantMetadata })
          : await service.createDraft(identity, input, { assistantMetadata });
        drafts.push(draft);
        details.push(`${existingDraft ? "Updated" : "Prepared"} draft ${draft.artifact_id} for thread ${thread.thread_id}.`);
      } catch (error) {
        hadFailure = true;
        failedThreadIds.push(thread.thread_id);
        details.push(`Failed to prepare thread ${thread.thread_id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  service.db.recordAuditEvent({
    client_id: identity.client_id,
    action: "assistant_action_run",
    target_type: "assistant_action",
    target_id: group.assistant_action_id,
    outcome: hadFailure ? "failure" : "success",
    metadata: {
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      summary: hadFailure
        ? `Inbox autopilot prepared ${drafts.length} draft${drafts.length === 1 ? "" : "s"} with ${failedThreadIds.length} failure${failedThreadIds.length === 1 ? "" : "s"}.`
        : `Inbox autopilot prepared ${drafts.length} draft${drafts.length === 1 ? "" : "s"}.`,
      details,
    },
  });

  const refreshed = await buildInboxAutopilotReport(service, { httpReachable: true });
  const refreshedGroup = refreshed.groups.find((item) => item.group_id === group.group_id) ?? group;
  return {
    summary: hadFailure
      ? `Prepared ${drafts.length} draft${drafts.length === 1 ? "" : "s"} with ${failedThreadIds.length} failure${failedThreadIds.length === 1 ? "" : "s"}.`
      : `Prepared ${drafts.length} draft${drafts.length === 1 ? "" : "s"}.`,
    details,
    success: !hadFailure,
    group: refreshedGroup,
    drafts: drafts.map((draft) => ensureDraftReviewState(service, draft).draft),
    failed_thread_ids: failedThreadIds,
  };
}
