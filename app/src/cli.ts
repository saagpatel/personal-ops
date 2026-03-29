import { Command } from "commander";
import { registerAuthAndMailCommands } from "./cli/commands/auth-mail.js";
import { registerInstallAndBackupCommands } from "./cli/commands/install.js";
import { registerRuntimeCommands } from "./cli/commands/runtime.js";
import { createRequestJson } from "./cli/http-client.js";
import {
  parseEmails,
  printOutput,
  requireCliOption,
  resolveCliFlag,
  resolveCliOption,
  type CliContext,
} from "./cli/shared.js";
import { ensureRuntimeFiles, loadConfig } from "./config.js";
import {
  formatApprovalConfirmation,
  formatApprovalDetail,
  formatApprovalItems,
  formatAuditEvents,
  formatCalendarConflicts,
  formatCalendarDayView,
  formatCalendarEvent,
  formatCalendarTaskScheduleResult,
  formatCalendarSources,
  formatCalendarStatus,
  formatCalendarUpcoming,
  formatFreeTimeWindows,
  formatOwnedCalendars,
  formatPlanningRecommendationDetail,
  formatPlanningRecommendationBacklogReport,
  formatPlanningRecommendationClosureReport,
  formatPlanningRecommendationGroupDetail,
  formatPlanningRecommendationGroups,
  formatPlanningRecommendationHygieneReport,
  formatPlanningRecommendationPolicyPruneResult,
  formatPlanningRecommendationPolicyReport,
  formatPlanningRecommendations,
  formatPlanningRecommendationSummaryReport,
  formatPlanningRecommendationTuningReport,
  formatDoctorReport,
  formatInstallCheckReport,
  formatInstallManifest,
  formatInboxStatus,
  formatInboxThreadDetail,
  formatInboxThreads,
  formatReviewDetail,
  formatReviewItems,
  formatReviewOpenResult,
  formatReviewResolveResult,
  formatRestoreResult,
  formatSendWindowStatus,
  formatSnapshotInspection,
  formatSnapshotList,
  formatSnapshotManifest,
  formatStatusReport,
  formatTaskDetail,
  formatTaskItems,
  formatTaskSuggestionDetail,
  formatTaskSuggestions,
} from "./formatters.js";
import { Logger } from "./logger.js";

const paths = ensureRuntimeFiles();
const config = loadConfig(paths);
const logger = new Logger(paths);
const requestJson = createRequestJson(config);
const cliContext: CliContext = {
  requestJson,
  printOutput,
  parseEmails,
  resolveCliOption,
  requireCliOption,
  resolveCliFlag,
};

const program = new Command();
program
  .name("personal-ops")
  .description("Operate the local personal-ops control layer for status, recovery, inbox, calendar, planning, and governance.")
  .showHelpAfterError()
  .showSuggestionAfterError()
  .addHelpText(
    "after",
    `
Start here:
  personal-ops version         See current version and source-first upgrade path
  personal-ops install check   Verify local setup without needing the daemon
  personal-ops health check    Run the recurring-friendly health pass
  personal-ops workflow prep-day
                               Start the day with a bounded workflow bundle
  personal-ops status          See full readiness and next attention
  personal-ops now             See the shortest operator summary
  personal-ops worklist        See the full attention queue
  personal-ops doctor          Run local diagnostics
`,
  );
registerAuthAndMailCommands(program, cliContext);

const review = program.command("review").description("Open and resolve higher-trust review items.");
review
  .command("list")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ review_items: unknown[] }>("GET", "/v1/review-queue");
    printOutput(response, (value) => formatReviewItems("Review Queue", value.review_items), options.json);
  });

review
  .command("pending")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ review_items: unknown[] }>("GET", "/v1/review-queue/pending");
    printOutput(response, (value) => formatReviewItems("Pending Review Items", value.review_items), options.json);
  });

review
  .command("show")
  .argument("<reviewId>", "Review item id")
  .option("--json", "Print raw JSON")
  .action(async (reviewId, options) => {
    const response = await requestJson<{ review: unknown }>("GET", `/v1/review-queue/${reviewId}`);
    printOutput(response, (value) => formatReviewDetail(value.review), options.json);
  });

review
  .command("open")
  .argument("<reviewId>", "Review item id")
  .option("--json", "Print raw JSON")
  .action(async (reviewId, options) => {
    const response = await requestJson<{ review_item: unknown; artifact_id: string; gmail_review_url: string }>(
      "POST",
      `/v1/review-queue/${reviewId}/open`,
    );
    printOutput(response, (value) => formatReviewOpenResult(value), options.json);
  });

review
  .command("resolve")
  .argument("<reviewId>", "Review item id")
  .requiredOption("--note <text>", "Resolution note")
  .option("--json", "Print raw JSON")
  .action(async (reviewId, options) => {
    const response = await requestJson<{ review_item: unknown; artifact_id: string; note: string }>(
      "POST",
      `/v1/review-queue/${reviewId}/resolve`,
      { note: options.note },
    );
    printOutput(response, (value) => formatReviewResolveResult(value), options.json);
  });

const approval = program.command("approval").description("Work approval requests for outbound draft sends.");
approval
  .command("list")
  .option("--state <state>", "Filter by approval state")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    if (options.state) {
      search.set("state", String(options.state));
    }
    const suffix = search.size ? `?${search.toString()}` : "";
    const response = await requestJson<{ approval_requests: unknown[] }>("GET", `/v1/approval-queue${suffix}`);
    printOutput(response, (value) => formatApprovalItems("Approval Queue", value.approval_requests), options.json);
  });

approval
  .command("pending")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ approval_requests: unknown[] }>("GET", "/v1/approval-queue/pending");
    printOutput(response, (value) => formatApprovalItems("Pending Approval Requests", value.approval_requests), options.json);
  });

approval
  .command("show")
  .argument("<approvalId>", "Approval request id")
  .option("--json", "Print raw JSON")
  .action(async (approvalId, options) => {
    const response = await requestJson<{ approval: unknown }>("GET", `/v1/approval-queue/${approvalId}`);
    printOutput(response, (value) => formatApprovalDetail(value.approval), options.json);
  });

approval
  .command("request")
  .argument("<artifactId>", "Local draft artifact id")
  .option("--note <text>", "Optional approval request note")
  .option("--json", "Print raw JSON")
  .action(async (artifactId, options) => {
    const response = await requestJson<{ approval_request: unknown }>(
      "POST",
      `/v1/mail/drafts/${artifactId}/request-approval`,
      { note: options.note },
    );
    printOutput(response, (value) => formatApprovalItems("Approval Queue", [value.approval_request]), options.json);
  });

approval
  .command("approve")
  .argument("<approvalId>", "Approval request id")
  .requiredOption("--note <text>", "Decision note")
  .option("--json", "Print raw JSON")
  .action(async (approvalId, options) => {
    const response = await requestJson<{ approval: unknown }>("POST", `/v1/approval-queue/${approvalId}/approve`, {
      note: options.note,
    });
    printOutput(response, (value) => formatApprovalDetail(value.approval), options.json);
  });

approval
  .command("reject")
  .argument("<approvalId>", "Approval request id")
  .requiredOption("--note <text>", "Decision note")
  .option("--json", "Print raw JSON")
  .action(async (approvalId, options) => {
    const response = await requestJson<{ approval: unknown }>("POST", `/v1/approval-queue/${approvalId}/reject`, {
      note: options.note,
    });
    printOutput(response, (value) => formatApprovalDetail(value.approval), options.json);
  });

approval
  .command("send")
  .argument("<approvalId>", "Approval request id")
  .requiredOption("--note <text>", "Send note")
  .option("--json", "Print raw JSON")
  .action(async (approvalId, options) => {
    const response = await requestJson<{ approval: unknown }>("POST", `/v1/approval-queue/${approvalId}/send`, {
      note: options.note,
    });
    printOutput(response, (value) => formatApprovalDetail(value.approval), options.json);
  });

approval
  .command("reopen")
  .argument("<approvalId>", "Approval request id")
  .requiredOption("--note <text>", "Recovery note")
  .option("--json", "Print raw JSON")
  .action(async (approvalId, options) => {
    const response = await requestJson<{ approval: unknown }>("POST", `/v1/approval-queue/${approvalId}/reopen`, {
      note: options.note,
    });
    printOutput(response, (value) => formatApprovalDetail(value.approval), options.json);
  });

approval
  .command("cancel")
  .argument("<approvalId>", "Approval request id")
  .requiredOption("--note <text>", "Cancellation note")
  .option("--json", "Print raw JSON")
  .action(async (approvalId, options) => {
    const response = await requestJson<{ approval: unknown }>("POST", `/v1/approval-queue/${approvalId}/cancel`, {
      note: options.note,
    });
    printOutput(response, (value) => formatApprovalDetail(value.approval), options.json);
  });

approval
  .command("confirm")
  .argument("<approvalId>", "Approval request id")
  .requiredOption("--action <action>", "Confirmation action: approve or send")
  .option("--json", "Print raw JSON")
  .action(async (approvalId, options) => {
    const response = await requestJson<{ confirmation: unknown }>("POST", `/v1/approval-queue/${approvalId}/confirm`, {
      action: options.action,
    });
    printOutput(response, (value) => formatApprovalConfirmation(value.confirmation), options.json);
  });

const inbox = program.command("inbox").description("Inspect inbox state, unread threads, and follow-up queues.");
inbox
  .command("status")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ inbox: unknown }>("GET", "/v1/inbox/status");
    printOutput(response, (value) => formatInboxStatus(value.inbox), options.json);
  });

inbox
  .command("sync")
  .argument("[mode]", "Use 'now' to trigger a manual metadata sync")
  .option("--json", "Print raw JSON")
  .action(async (mode, options) => {
    if (mode && mode !== "now") {
      throw new Error("The inbox sync command only supports `personal-ops inbox sync now`.");
    }
    const response = await requestJson<{ inbox: unknown }>("POST", "/v1/inbox/sync");
    printOutput(response, (value) => formatInboxStatus(value.inbox), options.json);
  });

inbox
  .command("unread")
  .option("--limit <number>", "Maximum threads to return", "50")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ threads: unknown[] }>(
      "GET",
      `/v1/inbox/unread?limit=${Number(options.limit)}`,
    );
    printOutput(response, (value) => formatInboxThreads("Unread Inbox Threads", value.threads), options.json);
  });

inbox
  .command("thread")
  .argument("<threadId>", "Mailbox thread id")
  .option("--json", "Print raw JSON")
  .action(async (threadId, options) => {
    const response = await requestJson<{ thread: unknown }>("GET", `/v1/inbox/threads/${threadId}`);
    printOutput(response, (value) => formatInboxThreadDetail(value.thread), options.json);
  });

inbox
  .command("followups")
  .option("--limit <number>", "Maximum threads to return", "50")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ threads: unknown[] }>(
      "GET",
      `/v1/inbox/followups?limit=${Number(options.limit)}`,
    );
    printOutput(response, (value) => formatInboxThreads("Follow-Up Threads", value.threads), options.json);
  });

inbox
  .command("needs-reply")
  .option("--limit <number>", "Maximum threads to return", "50")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ threads: unknown[] }>(
      "GET",
      `/v1/inbox/needs-reply?limit=${Number(options.limit)}`,
    );
    printOutput(response, (value) => formatInboxThreads("Threads That Need a Reply", value.threads), options.json);
  });

inbox
  .command("recent")
  .option("--limit <number>", "Maximum threads to return", "50")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ threads: unknown[] }>(
      "GET",
      `/v1/inbox/recent?limit=${Number(options.limit)}`,
    );
    printOutput(response, (value) => formatInboxThreads("Recent Mail Activity", value.threads), options.json);
  });

const calendar = program.command("calendar").description("Inspect calendar sync, upcoming events, and scheduling context.");
calendar
  .command("status")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ calendar: unknown }>("GET", "/v1/calendar/status");
    printOutput(response, (value) => formatCalendarStatus(value.calendar), options.json);
  });

calendar
  .command("sync")
  .argument("[mode]", "Use 'now' to trigger a manual calendar sync")
  .option("--json", "Print raw JSON")
  .action(async (mode, options) => {
    if (mode && mode !== "now") {
      throw new Error("The calendar sync command only supports `personal-ops calendar sync now`.");
    }
    const response = await requestJson<{ calendar: unknown }>("POST", "/v1/calendar/sync");
    printOutput(response, (value) => formatCalendarStatus(value.calendar), options.json);
  });

calendar
  .command("calendars")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ calendars: unknown[] }>("GET", "/v1/calendar/calendars");
    printOutput(response, (value) => formatCalendarSources(value.calendars), options.json);
  });

calendar
  .command("owned")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ calendars: unknown[] }>("GET", "/v1/calendar/owned");
    printOutput(response, (value) => formatOwnedCalendars(value.calendars), options.json);
  });

calendar
  .command("upcoming")
  .option("--days <number>", "Days ahead to include", "7")
  .option("--limit <number>", "Maximum events to return", "20")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ events: unknown[] }>(
      "GET",
      `/v1/calendar/upcoming?days=${Number(options.days)}&limit=${Number(options.limit)}`,
    );
    printOutput(response, (value) => formatCalendarUpcoming("Upcoming Events", value.events), options.json);
  });

calendar
  .command("conflicts")
  .option("--days <number>", "Days ahead to inspect", "7")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ conflicts: unknown[] }>(
      "GET",
      `/v1/calendar/conflicts?days=${Number(options.days)}`,
    );
    printOutput(response, (value) => formatCalendarConflicts(value.conflicts), options.json);
  });

calendar
  .command("free-time")
  .requiredOption("--day <date>", "Local day in YYYY-MM-DD")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ free_time: unknown[] }>(
      "GET",
      `/v1/calendar/free-time?day=${encodeURIComponent(String(options.day))}`,
    );
    printOutput(response, (value) => formatFreeTimeWindows(String(options.day), value.free_time), options.json);
  });

calendar
  .command("day")
  .argument("<day>", "Local day in YYYY-MM-DD")
  .option("--json", "Print raw JSON")
  .action(async (day, options) => {
    const response = await requestJson<{ day: unknown }>("GET", `/v1/calendar/day?day=${encodeURIComponent(String(day))}`);
    printOutput(response, (value) => formatCalendarDayView(value.day), options.json);
  });

calendar
  .command("event")
  .argument("<eventId>", "Local calendar event id")
  .option("--json", "Print raw JSON")
  .action(async (eventId, options) => {
    const response = await requestJson<{ event: unknown }>("GET", `/v1/calendar/events/${encodeURIComponent(String(eventId))}`);
    printOutput(response, (value) => formatCalendarEvent(value.event), options.json);
  });

calendar
  .command("create")
  .requiredOption("--title <title>", "Event title")
  .requiredOption("--start-at <timestamp>", "Start timestamp in UTC")
  .requiredOption("--end-at <timestamp>", "End timestamp in UTC")
  .option("--calendar-id <calendarId>", "Owned calendar id override")
  .option("--location <text>", "Event location")
  .option("--notes <text>", "Short event notes")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ event: unknown }>("POST", "/v1/calendar/events", {
      calendar_id: options.calendarId,
      title: options.title,
      start_at: options.startAt,
      end_at: options.endAt,
      location: options.location,
      notes: options.notes,
    });
    printOutput(response, (value) => formatCalendarEvent(value.event), options.json);
  });

calendar
  .command("update")
  .argument("<eventId>", "Local calendar event id")
  .option("--title <title>", "Updated event title")
  .option("--start-at <timestamp>", "Updated start timestamp in UTC")
  .option("--end-at <timestamp>", "Updated end timestamp in UTC")
  .option("--location <text>", "Updated event location")
  .option("--notes <text>", "Updated short event notes")
  .option("--json", "Print raw JSON")
  .action(async (eventId, options) => {
    const response = await requestJson<{ event: unknown }>("PATCH", `/v1/calendar/events/${encodeURIComponent(String(eventId))}`, {
      title: options.title,
      start_at: options.startAt,
      end_at: options.endAt,
      location: options.location,
      notes: options.notes,
    });
    printOutput(response, (value) => formatCalendarEvent(value.event), options.json);
  });

calendar
  .command("cancel")
  .argument("<eventId>", "Local calendar event id")
  .requiredOption("--note <text>", "Cancellation note for audit history")
  .option("--json", "Print raw JSON")
  .action(async (eventId, options) => {
    const response = await requestJson<{ event: unknown }>(
      "POST",
      `/v1/calendar/events/${encodeURIComponent(String(eventId))}/cancel`,
      { note: options.note },
    );
    printOutput(response, (value) => formatCalendarEvent(value.event), options.json);
  });

calendar
  .command("schedule-task")
  .argument("<taskId>", "Task id")
  .requiredOption("--start-at <timestamp>", "Start timestamp in UTC")
  .requiredOption("--end-at <timestamp>", "End timestamp in UTC")
  .option("--title <title>", "Override event title")
  .option("--calendar-id <calendarId>", "Owned calendar id override")
  .option("--location <text>", "Event location")
  .option("--notes <text>", "Short event notes")
  .option("--json", "Print raw JSON")
  .action(async (taskId, options) => {
    const response = await requestJson<{ scheduled: unknown }>(
      "POST",
      `/v1/calendar/tasks/${encodeURIComponent(String(taskId))}/schedule`,
      {
        calendar_id: options.calendarId,
        title: options.title,
        start_at: options.startAt,
        end_at: options.endAt,
        location: options.location,
        notes: options.notes,
      },
    );
    printOutput(response, (value) => formatCalendarTaskScheduleResult(value.scheduled), options.json);
  });

calendar
  .command("unschedule-task")
  .argument("<taskId>", "Task id")
  .requiredOption("--note <text>", "Unschedule note for audit history")
  .option("--json", "Print raw JSON")
  .action(async (taskId, options) => {
    const response = await requestJson<{ scheduled: unknown }>(
      "POST",
      `/v1/calendar/tasks/${encodeURIComponent(String(taskId))}/unschedule`,
      { note: options.note },
    );
    printOutput(response, (value) => formatCalendarTaskScheduleResult(value.scheduled), options.json);
  });

const task = program.command("task").description("Create and manage tracked operator or assistant tasks.");
task
  .command("list")
  .option("--state <state>", "Filter by task state")
  .option("--all", "Include completed and canceled tasks")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    if (options.state) search.set("state", String(options.state));
    if (options.all) search.set("all", "true");
    const suffix = search.size ? `?${search.toString()}` : "";
    const response = await requestJson<{ tasks: unknown[] }>("GET", `/v1/tasks${suffix}`);
    printOutput(response, (value) => formatTaskItems("Tasks", value.tasks), options.json);
  });

task
  .command("show")
  .argument("<taskId>", "Task id")
  .option("--json", "Print raw JSON")
  .action(async (taskId, options) => {
    const response = await requestJson<{ task: unknown }>("GET", `/v1/tasks/${taskId}`);
    printOutput(response, (value) => formatTaskDetail(value.task), options.json);
  });

task
  .command("create")
  .requiredOption("--title <title>", "Task title")
  .option("--notes <text>", "Task notes")
  .option("--kind <kind>", "Task kind", "human_reminder")
  .option("--priority <priority>", "Task priority", "normal")
  .option("--owner <owner>", "Task owner", "operator")
  .option("--due-at <timestamp>", "Due timestamp in UTC")
  .option("--remind-at <timestamp>", "Reminder timestamp in UTC")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ task: unknown }>("POST", "/v1/tasks", {
      title: options.title,
      notes: options.notes,
      kind: options.kind,
      priority: options.priority,
      owner: options.owner,
      due_at: options.dueAt,
      remind_at: options.remindAt,
    });
    printOutput(response, (value) => formatTaskItems("Tasks", [value.task]), options.json);
  });

task
  .command("update")
  .argument("<taskId>", "Task id")
  .option("--title <title>", "Task title")
  .option("--notes <text>", "Task notes")
  .option("--kind <kind>", "Task kind")
  .option("--priority <priority>", "Task priority")
  .option("--owner <owner>", "Task owner")
  .option("--due-at <timestamp>", "Due timestamp in UTC")
  .option("--remind-at <timestamp>", "Reminder timestamp in UTC")
  .option("--clear-due-at", "Clear due timestamp")
  .option("--clear-remind-at", "Clear reminder timestamp")
  .option("--json", "Print raw JSON")
  .action(async (taskId, options) => {
    const response = await requestJson<{ task: unknown }>("PATCH", `/v1/tasks/${taskId}`, {
      title: options.title,
      notes: options.notes,
      kind: options.kind,
      priority: options.priority,
      owner: options.owner,
      due_at: options.clearDueAt ? null : options.dueAt,
      remind_at: options.clearRemindAt ? null : options.remindAt,
    });
    printOutput(response, (value) => formatTaskItems("Tasks", [value.task]), options.json);
  });

task
  .command("start")
  .argument("<taskId>", "Task id")
  .option("--json", "Print raw JSON")
  .action(async (taskId, options) => {
    const response = await requestJson<{ task: unknown }>("POST", `/v1/tasks/${taskId}/start`);
    printOutput(response, (value) => formatTaskItems("Tasks", [value.task]), options.json);
  });

task
  .command("complete")
  .argument("<taskId>", "Task id")
  .requiredOption("--note <text>", "Completion note")
  .option("--json", "Print raw JSON")
  .action(async (taskId, options) => {
    const response = await requestJson<{ task: unknown }>("POST", `/v1/tasks/${taskId}/complete`, { note: options.note });
    printOutput(response, (value) => formatTaskItems("Tasks", [value.task]), options.json);
  });

task
  .command("cancel")
  .argument("<taskId>", "Task id")
  .requiredOption("--note <text>", "Cancellation note")
  .option("--json", "Print raw JSON")
  .action(async (taskId, options) => {
    const response = await requestJson<{ task: unknown }>("POST", `/v1/tasks/${taskId}/cancel`, { note: options.note });
    printOutput(response, (value) => formatTaskItems("Tasks", [value.task]), options.json);
  });

task
  .command("snooze")
  .argument("<taskId>", "Task id")
  .requiredOption("--until <timestamp>", "Reminder timestamp in UTC")
  .requiredOption("--note <text>", "Snooze note")
  .option("--json", "Print raw JSON")
  .action(async (taskId, options) => {
    const response = await requestJson<{ task: unknown }>("POST", `/v1/tasks/${taskId}/snooze`, {
      until: options.until,
      note: options.note,
    });
    printOutput(response, (value) => formatTaskItems("Tasks", [value.task]), options.json);
  });

task
  .command("due")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ tasks: unknown[] }>("GET", "/v1/tasks/due");
    printOutput(response, (value) => formatTaskItems("Due Tasks", value.tasks), options.json);
  });

task
  .command("overdue")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ tasks: unknown[] }>("GET", "/v1/tasks/overdue");
    printOutput(response, (value) => formatTaskItems("Overdue Tasks", value.tasks), options.json);
  });

task
  .command("prune")
  .option("--older-than-days <number>", "Remove completed/canceled tasks older than this many days", "30")
  .option("--state <state...>", "States to prune (default: completed canceled)")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ result: unknown }>("POST", "/v1/tasks/prune", {
      older_than_days: Number(options.olderThanDays),
      states: options.state,
    });
    printOutput(response, undefined, options.json);
  });

const suggestion = program.command("suggestion").description("Review assistant task suggestions before accepting them.");
suggestion
  .command("list")
  .option("--status <status>", "Filter by suggestion status")
  .option("--all", "Include accepted and rejected suggestions")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    if (options.status) search.set("status", String(options.status));
    if (options.all) search.set("all", "true");
    const suffix = search.size ? `?${search.toString()}` : "";
    const response = await requestJson<{ task_suggestions: unknown[] }>("GET", `/v1/task-suggestions${suffix}`);
    printOutput(response, (value) => formatTaskSuggestions("Task Suggestions", value.task_suggestions), options.json);
  });

suggestion
  .command("show")
  .argument("<suggestionId>", "Task suggestion id")
  .option("--json", "Print raw JSON")
  .action(async (suggestionId, options) => {
    const response = await requestJson<{ task_suggestion: unknown }>("GET", `/v1/task-suggestions/${suggestionId}`);
    printOutput(response, (value) => formatTaskSuggestionDetail(value.task_suggestion), options.json);
  });

suggestion
  .command("accept")
  .argument("<suggestionId>", "Task suggestion id")
  .requiredOption("--note <text>", "Acceptance note")
  .option("--json", "Print raw JSON")
  .action(async (suggestionId, options) => {
    const response = await requestJson<{ task_suggestion: unknown }>("POST", `/v1/task-suggestions/${suggestionId}/accept`, {
      note: options.note,
    });
    printOutput(response, (value) => formatTaskSuggestionDetail(value.task_suggestion), options.json);
  });

suggestion
  .command("reject")
  .argument("<suggestionId>", "Task suggestion id")
  .requiredOption("--note <text>", "Rejection note")
  .option("--json", "Print raw JSON")
  .action(async (suggestionId, options) => {
    const response = await requestJson<{ task_suggestion: unknown }>("POST", `/v1/task-suggestions/${suggestionId}/reject`, {
      note: options.note,
    });
    printOutput(response, (value) => formatTaskSuggestionDetail(value.task_suggestion), options.json);
  });

suggestion
  .command("prune")
  .option("--older-than-days <number>", "Remove accepted/rejected suggestions older than this many days", "30")
  .option("--status <status...>", "Statuses to prune (default: accepted rejected)")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ result: unknown }>("POST", "/v1/task-suggestions/prune", {
      older_than_days: Number(options.olderThanDays),
      statuses: options.status,
    });
    printOutput(response, undefined, options.json);
  });

const recommendation = program
  .command("recommendation")
  .description("Inspect and act on planning recommendations and hygiene summaries.");
recommendation
  .command("list")
  .option("--status <status>", "Filter by recommendation status")
  .option("--kind <kind>", "Filter by recommendation kind")
  .option("--all", "Include resolved recommendations")
  .option("--grouped", "Show grouped planning summaries")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    if (options.status) search.set("status", String(options.status));
    if (options.kind) search.set("kind", String(options.kind));
    if (options.all) search.set("all", "true");
    if (options.grouped) search.set("grouped", "true");
    const suffix = search.size ? `?${search.toString()}` : "";
    const response = await requestJson<{ planning_recommendations: unknown[]; planning_recommendation_groups?: unknown[] }>(
      "GET",
      `/v1/planning-recommendations${suffix}`,
    );
    printOutput(
      response,
      (value) =>
        options.grouped
          ? formatPlanningRecommendationGroups("Planning Recommendation Groups", value.planning_recommendation_groups ?? [])
          : formatPlanningRecommendations("Planning Recommendations", value.planning_recommendations),
      options.json,
    );
  });

recommendation
  .command("next")
  .option("--group <groupKey>", "Limit to a planning recommendation group")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    if (options.group) search.set("group", String(options.group));
    const suffix = search.size ? `?${search.toString()}` : "";
    const response = await requestJson<{ planning_recommendation: unknown | null }>(
      "GET",
      `/v1/planning-recommendations/next${suffix}`,
    );
    printOutput(
      response,
      (value) =>
        value.planning_recommendation
          ? formatPlanningRecommendationDetail(value.planning_recommendation)
          : "No actionable planning recommendation found.",
      options.json,
    );
  });

recommendation
  .command("summary")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ planning_recommendation_summary: unknown }>(
      "GET",
      "/v1/planning-recommendations/summary",
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationSummaryReport(value.planning_recommendation_summary),
      options.json,
    );
  });

recommendation
  .command("tuning")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ planning_recommendation_tuning: unknown }>(
      "GET",
      "/v1/planning-recommendations/tuning",
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationTuningReport(value.planning_recommendation_tuning as any),
      options.json,
    );
  });

const recommendationPolicy = recommendation
  .command("policy")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ planning_recommendation_policy: unknown }>(
      "GET",
      "/v1/planning-recommendations/policy",
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationPolicyReport(value.planning_recommendation_policy as any),
      options.json,
    );
  });

recommendation
  .command("backlog")
  .option("--group <groupKey>", "Limit to a planning recommendation group")
  .option("--kind <kind>", "Limit to a planning recommendation kind")
  .option("--source <source>", "Limit to a planning recommendation source")
  .option("--stale-only", "Show only stale planning recommendations")
  .option("--manual-only", "Show only manual-scheduling planning recommendations")
  .option("--resurfaced-only", "Show only resurfaced planning recommendations")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    if (options.group) search.set("group", String(options.group));
    if (options.kind) search.set("kind", String(options.kind));
    if (options.source) search.set("source", String(options.source));
    if (options.staleOnly) search.set("stale_only", "true");
    if (options.manualOnly) search.set("manual_only", "true");
    if (options.resurfacedOnly) search.set("resurfaced_only", "true");
    const suffix = search.size ? `?${search.toString()}` : "";
    const response = await requestJson<{ planning_recommendation_backlog: unknown }>(
      "GET",
      `/v1/planning-recommendations/backlog${suffix}`,
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationBacklogReport(value.planning_recommendation_backlog),
      options.json,
    );
  });

recommendation
  .command("closure")
  .option("--days <number>", "Lookback window in days", "30")
  .option("--group <groupKey>", "Limit to a planning recommendation group")
  .option("--kind <kind>", "Limit to a planning recommendation kind")
  .option("--source <source>", "Limit to a planning recommendation source")
  .option("--close-reason <reason>", "Limit to a planning close reason")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    if (options.days) search.set("days", String(options.days));
    if (options.group) search.set("group", String(options.group));
    if (options.kind) search.set("kind", String(options.kind));
    if (options.source) search.set("source", String(options.source));
    if (options.closeReason) search.set("close_reason", String(options.closeReason));
    const response = await requestJson<{ planning_recommendation_closure: unknown }>(
      "GET",
      `/v1/planning-recommendations/closure?${search.toString()}`,
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationClosureReport(value.planning_recommendation_closure),
      options.json,
    );
  });

const recommendationHygiene = recommendation
  .command("hygiene")
  .option("--group <groupKey>", "Limit to a planning recommendation group")
  .option("--kind <kind>", "Limit to a planning recommendation kind")
  .option("--source <source>", "Limit to a planning recommendation source")
  .option("--candidate-only", "Show only advisory suppression candidates")
  .option("--review-needed-only", "Show only hygiene families that currently need operator review")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    if (options.group) search.set("group", String(options.group));
    if (options.kind) search.set("kind", String(options.kind));
    if (options.source) search.set("source", String(options.source));
    if (options.candidateOnly) search.set("candidate_only", "true");
    if (options.reviewNeededOnly) search.set("review_needed_only", "true");
    const suffix = search.size ? `?${search.toString()}` : "";
    const response = await requestJson<{ planning_recommendation_hygiene: unknown }>(
      "GET",
      `/v1/planning-recommendations/hygiene${suffix}`,
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationHygieneReport(value.planning_recommendation_hygiene),
      options.json,
    );
  });

recommendationHygiene
  .command("review")
  .option("--group <groupKey>", "Planning recommendation group key")
  .option("--kind <kind>", "Planning recommendation kind")
  .option("--source <source>", "Planning recommendation source")
  .option(
    "--decision <decision>",
    "Review decision: keep_visible, investigate_externalized_workflow, investigate_source_suppression, dismiss_for_now",
  )
  .option("--note <text>", "Review note")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const group = requireCliOption(resolveCliOption(options, "group", "--group"), "--group <groupKey>");
    const kind = requireCliOption(resolveCliOption(options, "kind", "--kind"), "--kind <kind>");
    const source = requireCliOption(resolveCliOption(options, "source", "--source"), "--source <source>");
    const decision = requireCliOption(resolveCliOption(options, "decision", "--decision"), "--decision <decision>");
    const note = resolveCliOption(options, "note", "--note");
    const asJson = resolveCliFlag(options, "json", "--json");
    const response = await requestJson<{ planning_recommendation_hygiene_family: unknown }>(
      "POST",
      "/v1/planning-recommendations/hygiene/review",
      {
        group,
        kind,
        source,
        decision,
        note,
      },
    );
    printOutput(
      response,
      (value) =>
        formatPlanningRecommendationHygieneReport({
          generated_at: new Date().toISOString(),
          window_days: 30,
          filters: {
            group,
            kind: kind as any,
            source: source as any,
          },
          families: [value.planning_recommendation_hygiene_family as any],
        }),
      asJson,
    );
  });

const recommendationHygieneProposal = recommendationHygiene.command("proposal");

recommendationHygieneProposal
  .command("record")
  .option("--group <groupKey>", "Planning recommendation group key")
  .option("--kind <kind>", "Planning recommendation kind")
  .option("--source <source>", "Planning recommendation source")
  .option("--note <text>", "Proposal note")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const group = requireCliOption(resolveCliOption(options, "group", "--group"), "--group <groupKey>");
    const kind = requireCliOption(resolveCliOption(options, "kind", "--kind"), "--kind <kind>");
    const source = requireCliOption(resolveCliOption(options, "source", "--source"), "--source <source>");
    const note = resolveCliOption(options, "note", "--note");
    const asJson = resolveCliFlag(options, "json", "--json");
    const response = await requestJson<{ planning_recommendation_hygiene_family: unknown }>(
      "POST",
      "/v1/planning-recommendations/hygiene/proposals/record",
      {
        group,
        kind,
        source,
        note,
      },
    );
    printOutput(
      response,
      (value) =>
        formatPlanningRecommendationHygieneReport({
          generated_at: new Date().toISOString(),
          window_days: 30,
          filters: {
            group,
            kind: kind as any,
            source: source as any,
          },
          families: [value.planning_recommendation_hygiene_family as any],
        }),
      asJson,
    );
  });

recommendationHygieneProposal
  .command("dismiss")
  .option("--group <groupKey>", "Planning recommendation group key")
  .option("--kind <kind>", "Planning recommendation kind")
  .option("--source <source>", "Planning recommendation source")
  .option("--note <text>", "Proposal note")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const group = requireCliOption(resolveCliOption(options, "group", "--group"), "--group <groupKey>");
    const kind = requireCliOption(resolveCliOption(options, "kind", "--kind"), "--kind <kind>");
    const source = requireCliOption(resolveCliOption(options, "source", "--source"), "--source <source>");
    const note = resolveCliOption(options, "note", "--note");
    const asJson = resolveCliFlag(options, "json", "--json");
    const response = await requestJson<{ planning_recommendation_hygiene_family: unknown }>(
      "POST",
      "/v1/planning-recommendations/hygiene/proposals/dismiss",
      {
        group,
        kind,
        source,
        note,
      },
    );
    printOutput(
      response,
      (value) =>
        formatPlanningRecommendationHygieneReport({
          generated_at: new Date().toISOString(),
          window_days: 30,
          filters: {
            group,
            kind: kind as any,
            source: source as any,
          },
          families: [value.planning_recommendation_hygiene_family as any],
        }),
      asJson,
    );
  });

recommendationPolicy
  .command("archive")
  .option("--group <groupKey>", "Planning recommendation group key")
  .option("--kind <kind>", "Planning recommendation kind")
  .option("--source <source>", "Planning recommendation source")
  .option("--note <text>", "Archive note")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const group = requireCliOption(resolveCliOption(options, "group", "--group"), "--group <groupKey>");
    const kind = requireCliOption(resolveCliOption(options, "kind", "--kind"), "--kind <kind>");
    const source = requireCliOption(resolveCliOption(options, "source", "--source"), "--source <source>");
    const note = resolveCliOption(options, "note", "--note");
    const asJson = resolveCliFlag(options, "json", "--json");
    const response = await requestJson<{ planning_recommendation_policy: unknown }>(
      "POST",
      "/v1/planning-recommendations/policy/archive",
      { group, kind, source, note },
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationPolicyReport(value.planning_recommendation_policy as any),
      asJson,
    );
  });

recommendationPolicy
  .command("supersede")
  .option("--group <groupKey>", "Planning recommendation group key")
  .option("--kind <kind>", "Planning recommendation kind")
  .option("--source <source>", "Planning recommendation source")
  .option("--note <text>", "Supersede note")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const group = requireCliOption(resolveCliOption(options, "group", "--group"), "--group <groupKey>");
    const kind = requireCliOption(resolveCliOption(options, "kind", "--kind"), "--kind <kind>");
    const source = requireCliOption(resolveCliOption(options, "source", "--source"), "--source <source>");
    const note = resolveCliOption(options, "note", "--note");
    const asJson = resolveCliFlag(options, "json", "--json");
    const response = await requestJson<{ planning_recommendation_policy: unknown }>(
      "POST",
      "/v1/planning-recommendations/policy/supersede",
      { group, kind, source, note },
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationPolicyReport(value.planning_recommendation_policy as any),
      asJson,
    );
  });

recommendationPolicy
  .command("prune")
  .requiredOption("--older-than-days <days>", "Prune governance history older than this many days")
  .option("--event-type <eventType>", "Limit to archived, superseded, or all", "all")
  .option("--dry-run", "Preview prune candidates without deleting any history")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const olderThanDays = Number(requireCliOption(
      resolveCliOption(options, "olderThanDays", "--older-than-days"),
      "--older-than-days <days>",
    ));
    const eventType = resolveCliOption(options, "eventType", "--event-type") ?? "all";
    const asJson = resolveCliFlag(options, "json", "--json");
    const response = await requestJson<{
      planning_recommendation_policy_prune: unknown;
      planning_recommendation_policy: unknown;
    }>("POST", "/v1/planning-recommendations/policy/prune", {
      older_than_days: olderThanDays,
      event_type: eventType,
      dry_run: resolveCliFlag(options, "dryRun", "--dry-run"),
    });
    printOutput(
      response,
      (value) =>
        [
          formatPlanningRecommendationPolicyPruneResult(value.planning_recommendation_policy_prune as any),
          "",
          formatPlanningRecommendationPolicyReport(value.planning_recommendation_policy as any),
        ].join("\n"),
      asJson,
    );
  });

const recommendationGroup = recommendation
  .command("group")
  .description("Work grouped planning recommendations as one family.");
recommendationGroup
  .command("show")
  .argument("<groupKey>", "Planning recommendation group key")
  .option("--json", "Print raw JSON")
  .action(async (groupKey, options) => {
    const response = await requestJson<{ planning_recommendation_group: unknown }>(
      "GET",
      `/v1/planning-recommendation-groups/${encodeURIComponent(groupKey)}`,
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationGroupDetail(value.planning_recommendation_group),
      options.json,
    );
  });

recommendationGroup
  .command("snooze")
  .argument("<groupKey>", "Planning recommendation group key")
  .option("--until <timestamp>", "Snooze-until timestamp")
  .option("--preset <preset>", "Snooze preset: end-of-day, tomorrow-morning, next-business-day")
  .requiredOption("--note <text>", "Snooze note")
  .option("--json", "Print raw JSON")
  .action(async (groupKey, options) => {
    if (!options.until && !options.preset) {
      throw new Error("Either --until or --preset is required.");
    }
    const response = await requestJson<{ planning_recommendation_group: unknown }>(
      "POST",
      `/v1/planning-recommendation-groups/${encodeURIComponent(groupKey)}/snooze`,
      { until: options.until, preset: options.preset, note: options.note },
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationGroupDetail(value.planning_recommendation_group),
      options.json,
    );
  });

recommendationGroup
  .command("reject")
  .argument("<groupKey>", "Planning recommendation group key")
  .requiredOption("--reason <reason>", "Reject reason: duplicate or handled_elsewhere")
  .requiredOption("--note <text>", "Reject note")
  .option("--json", "Print raw JSON")
  .action(async (groupKey, options) => {
    const response = await requestJson<{ planning_recommendation_group: unknown }>(
      "POST",
      `/v1/planning-recommendation-groups/${encodeURIComponent(groupKey)}/reject`,
      { reason_code: options.reason, note: options.note },
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationGroupDetail(value.planning_recommendation_group),
      options.json,
    );
  });

recommendation
  .command("show")
  .argument("<recommendationId>", "Planning recommendation id")
  .option("--json", "Print raw JSON")
  .action(async (recommendationId, options) => {
    const response = await requestJson<{ planning_recommendation: unknown }>(
      "GET",
      `/v1/planning-recommendations/${recommendationId}`,
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationDetail(value.planning_recommendation),
      options.json,
    );
  });

recommendation
  .command("apply")
  .argument("<recommendationId>", "Planning recommendation id")
  .requiredOption("--note <text>", "Application note")
  .option("--json", "Print raw JSON")
  .action(async (recommendationId, options) => {
    const response = await requestJson<{ planning_recommendation: unknown }>(
      "POST",
      `/v1/planning-recommendations/${recommendationId}/apply`,
      { note: options.note },
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationDetail(value.planning_recommendation),
      options.json,
    );
  });

recommendation
  .command("reject")
  .argument("<recommendationId>", "Planning recommendation id")
  .requiredOption("--note <text>", "Rejection note")
  .option("--reason <reason>", "Decision reason code")
  .option("--json", "Print raw JSON")
  .action(async (recommendationId, options) => {
    const response = await requestJson<{ planning_recommendation: unknown }>(
      "POST",
      `/v1/planning-recommendations/${recommendationId}/reject`,
      { note: options.note, reason_code: options.reason },
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationDetail(value.planning_recommendation),
      options.json,
    );
  });

recommendation
  .command("snooze")
  .argument("<recommendationId>", "Planning recommendation id")
  .option("--until <timestamp>", "Snooze-until timestamp")
  .option("--preset <preset>", "Snooze preset: end-of-day, tomorrow-morning, next-business-day")
  .requiredOption("--note <text>", "Snooze note")
  .option("--json", "Print raw JSON")
  .action(async (recommendationId, options) => {
    if (!options.until && !options.preset) {
      throw new Error("Either --until or --preset is required.");
    }
    const response = await requestJson<{ planning_recommendation: unknown }>(
      "POST",
      `/v1/planning-recommendations/${recommendationId}/snooze`,
      { until: options.until, preset: options.preset, note: options.note },
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationDetail(value.planning_recommendation),
      options.json,
    );
  });

recommendation
  .command("replan")
  .argument("<recommendationId>", "Planning recommendation id")
  .requiredOption("--note <text>", "Replan note")
  .option("--json", "Print raw JSON")
  .action(async (recommendationId, options) => {
    const response = await requestJson<{ planning_recommendation: unknown }>(
      "POST",
      `/v1/planning-recommendations/${recommendationId}/replan`,
      { note: options.note },
    );
    printOutput(
      response,
      (value) => formatPlanningRecommendationDetail(value.planning_recommendation),
      options.json,
    );
  });

recommendation
  .command("refresh")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const response = await requestJson<{ result: unknown }>("POST", "/v1/planning-recommendations/refresh");
    printOutput(response, undefined, options.json);
  });

const audit = program
  .command("audit")
  .description("Read narrow assistant-safe audit history and operator-safe event traces.");

audit
  .command("tail")
  .option("--limit <number>", "Number of audit events to return", "20")
  .option("--action <action>", "Filter by audit action")
  .option("--target-type <targetType>", "Filter by target type")
  .option("--target-id <targetId>", "Filter by target id")
  .option("--client <clientId>", "Filter by client id")
  .option("--json", "Print raw JSON")
  .action(async (options) => {
    const search = new URLSearchParams();
    search.set("limit", String(options.limit));
    if (options.action) search.set("action", String(options.action));
    if (options.targetType) search.set("target_type", String(options.targetType));
    if (options.targetId) search.set("target_id", String(options.targetId));
    if (options.client) search.set("client", String(options.client));
    const response = await requestJson<{ events: unknown[] }>("GET", `/v1/audit/events?${search.toString()}`);
    printOutput(response, (value) => formatAuditEvents(value.events), options.json);
  });

registerRuntimeCommands(program, cliContext, logger, paths);
registerInstallAndBackupCommands(program, cliContext, paths);

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message.trimEnd() : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
