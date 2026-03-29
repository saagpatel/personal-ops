import type {
  CalendarConflict,
  CalendarDayView,
  CalendarEvent,
  CalendarSource,
  CalendarStatusReport,
  CalendarTaskScheduleResult,
  FreeTimeWindow,
  OwnedCalendarSummary,
} from "../types.js";
import { line, truncate, yesNo } from "./shared.js";

export function formatCalendarStatus(report: CalendarStatusReport): string {
  const lines: string[] = [];
  lines.push("Calendar Status");
  lines.push(line("Enabled", yesNo(report.enabled)));
  lines.push(line("Provider", report.provider));
  lines.push(line("Account", report.account ?? "not connected"));
  lines.push(line("Calendars synced", String(report.calendars_synced_count)));
  lines.push(line("Events synced", String(report.events_synced_count)));
  lines.push(line("Owned writable calendars", String(report.owned_writable_calendar_count)));
  lines.push(line("personal-ops events", String(report.personal_ops_active_event_count)));
  lines.push(line("Scheduled tasks", String(report.linked_scheduled_task_count)));
  lines.push(line("Conflicts next 24h", String(report.conflict_count_next_24h)));
  lines.push(line("Next upcoming", report.next_upcoming_event?.summary ?? "nothing scheduled"));
  lines.push("");
  lines.push("Sync");
  if (!report.sync) {
    lines.push("No calendar sync has been recorded yet.");
    return lines.join("\n");
  }
  lines.push(line("Status", report.sync.status));
  lines.push(line("Last synced", report.sync.last_synced_at ?? "never"));
  lines.push(line("Last seeded", report.sync.last_seeded_at ?? "never"));
  lines.push(
    line(
      "Last sync duration",
      report.sync.last_sync_duration_ms !== undefined ? `${report.sync.last_sync_duration_ms}ms` : "unknown",
    ),
  );
  lines.push(
    line(
      "Calendars refreshed",
      report.sync.calendars_refreshed_count !== undefined ? String(report.sync.calendars_refreshed_count) : "unknown",
    ),
  );
  lines.push(
    line(
      "Events refreshed",
      report.sync.events_refreshed_count !== undefined ? String(report.sync.events_refreshed_count) : "unknown",
    ),
  );
  if (report.sync.last_error_message) {
    lines.push(line("Last error", report.sync.last_error_message));
  }
  return lines.join("\n");
}

export function formatCalendarSources(sources: CalendarSource[]): string {
  const lines = ["Calendars"];
  if (sources.length === 0) {
    lines.push("No calendars found.");
    return lines.join("\n");
  }
  for (const source of sources) {
    lines.push(
      `${source.calendar_id} | ${source.is_primary ? "primary" : "secondary"} | ${source.is_selected ? "selected" : "unselected"} | ${truncate(source.title)}`,
    );
  }
  return lines.join("\n");
}

export function formatOwnedCalendars(sources: OwnedCalendarSummary[]): string {
  const lines = ["Owned Calendars"];
  if (sources.length === 0) {
    lines.push("No writable owned calendars found.");
    return lines.join("\n");
  }
  for (const source of sources) {
    lines.push(`${source.calendar_id} | ${source.is_primary ? "primary" : "owned"} | ${truncate(source.title)}`);
  }
  return lines.join("\n");
}

export function formatCalendarUpcoming(title: string, events: CalendarEvent[]): string {
  const lines = [title];
  if (events.length === 0) {
    lines.push("No matching calendar events found.");
    return lines.join("\n");
  }
  for (const event of events) {
    lines.push(
      `${event.event_id} | ${event.is_all_day ? "all-day" : event.start_at} | ${event.is_busy ? "busy" : "free"} | ${truncate(event.summary ?? "(untitled event)")}`,
    );
    lines.push(`  next: personal-ops calendar event ${event.event_id}`);
  }
  return lines.join("\n");
}

export function formatCalendarConflicts(conflicts: CalendarConflict[]): string {
  const lines = ["Calendar Conflicts"];
  if (conflicts.length === 0) {
    lines.push("No calendar conflicts found.");
    return lines.join("\n");
  }
  for (const conflict of conflicts) {
    lines.push(
      `${conflict.day} | ${conflict.overlap_start_at} | ${truncate(conflict.left_event.summary ?? "(untitled)")} overlaps ${truncate(conflict.right_event.summary ?? "(untitled)")}`,
    );
    lines.push(`  next: personal-ops calendar day ${conflict.day}`);
  }
  return lines.join("\n");
}

export function formatFreeTimeWindows(day: string, windows: FreeTimeWindow[]): string {
  const lines = [`Free Time: ${day}`];
  if (windows.length === 0) {
    lines.push("No free time windows found.");
    return lines.join("\n");
  }
  for (const window of windows) {
    lines.push(`${window.start_at} -> ${window.end_at} | ${window.duration_minutes}m`);
  }
  return lines.join("\n");
}

export function formatCalendarDayView(view: CalendarDayView): string {
  const lines: string[] = [];
  lines.push(`Calendar Day: ${view.day}`);
  lines.push(line("Workday start", view.workday_start_at));
  lines.push(line("Workday end", view.workday_end_at));
  lines.push(line("Overloaded", yesNo(view.overloaded)));
  lines.push("");
  lines.push("Events");
  if (view.events.length === 0) {
    lines.push("No events found.");
  } else {
    for (const event of view.events) {
      lines.push(`${event.start_at} -> ${event.end_at} | ${truncate(event.summary ?? "(untitled event)")}`);
    }
  }
  lines.push("");
  lines.push("Conflicts");
  if (view.conflicts.length === 0) {
    lines.push("None.");
  } else {
    for (const conflict of view.conflicts) {
      lines.push(`${conflict.overlap_start_at} | ${truncate(conflict.left_event.summary ?? "(untitled)")} overlaps ${truncate(conflict.right_event.summary ?? "(untitled)")}`);
    }
  }
  lines.push("");
  lines.push("Free Time");
  if (view.free_time_windows.length === 0) {
    lines.push("None.");
  } else {
    for (const window of view.free_time_windows) {
      lines.push(`${window.start_at} -> ${window.end_at} | ${window.duration_minutes}m`);
    }
  }
  return lines.join("\n");
}

export function formatCalendarEvent(event: CalendarEvent): string {
  return [
    `Calendar Event: ${event.event_id}`,
    line("Calendar", event.calendar_id),
    line("Provider event", event.provider_event_id),
    line("Summary", event.summary ?? "(untitled event)"),
    line("Start", event.start_at),
    line("End", event.end_at),
    line("All day", yesNo(event.is_all_day)),
    line("Busy", yesNo(event.is_busy)),
    line("Location", event.location ?? "not set"),
    line("Notes", event.notes ?? "not set"),
    line("Organizer", event.organizer_email ?? "not set"),
    line("Attendees", String(event.attendee_count)),
    line("Status", event.status),
    line("Created by personal-ops", yesNo(event.created_by_personal_ops)),
    line("Linked task", event.source_task_id ?? "not linked"),
    line("Last write", event.last_write_at ?? "never"),
  ].join("\n");
}

export function formatCalendarTaskScheduleResult(result: CalendarTaskScheduleResult): string {
  return [
    `Scheduled Task: ${result.task.task_id}`,
    line("Task", result.task.title),
    line("Linked event", result.event.event_id),
    line("Calendar", result.event.calendar_id),
    line("Start", result.event.start_at),
    line("End", result.event.end_at),
    line("Suggested next command", `personal-ops calendar event ${result.event.event_id}`),
  ].join("\n");
}
