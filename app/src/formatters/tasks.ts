import type { TaskDetail, TaskItem, TaskSuggestion, TaskSuggestionDetail } from "../types.js";
import { humanizeKind, line, suggestedTaskCommand, truncate } from "./shared.js";

export function formatTaskItems(title: string, tasks: TaskItem[]): string {
  const lines: string[] = [title];
  if (tasks.length === 0) {
    lines.push("No tasks found.");
    return lines.join("\n");
  }
  for (const task of tasks) {
    const timing = task.due_at ? `due ${task.due_at}` : task.remind_at ? `remind ${task.remind_at}` : "no schedule";
    lines.push(
      `${task.task_id} | ${task.state} | ${task.priority} | ${humanizeKind(task.kind)} | ${timing} | ${truncate(task.title)}`,
    );
    lines.push(`  next: ${suggestedTaskCommand(task)}`);
  }
  return lines.join("\n");
}

export function formatTaskDetail(detail: TaskDetail): string {
  const task = detail.task;
  const lines: string[] = [];
  lines.push(`Task: ${task.task_id}`);
  lines.push(line("Title", task.title));
  lines.push(line("State", task.state));
  lines.push(line("Priority", task.priority));
  lines.push(line("Kind", humanizeKind(task.kind)));
  lines.push(line("Owner", task.owner));
  lines.push(line("Source", task.source));
  lines.push(line("Created", task.created_at));
  lines.push(line("Updated", task.updated_at));
  if (task.due_at) lines.push(line("Due", task.due_at));
  if (task.remind_at) lines.push(line("Remind", task.remind_at));
  if (task.notes) lines.push(line("Notes", task.notes));
  if (task.decision_note) lines.push(line("Decision note", task.decision_note));
  if (task.scheduled_calendar_event_id) lines.push(line("Scheduled event", task.scheduled_calendar_event_id));
  lines.push(line("Suggested next command", suggestedTaskCommand(task)));
  lines.push("");
  lines.push("Recent Audit");
  if (detail.related_audit_events.length === 0) {
    lines.push("No related audit events found.");
  } else {
    for (const event of detail.related_audit_events) {
      lines.push(`${event.timestamp} | ${event.action} | ${event.outcome} | ${event.client_id}`);
    }
  }
  return lines.join("\n");
}

export function formatTaskSuggestions(title: string, suggestions: TaskSuggestion[]): string {
  const lines: string[] = [title];
  if (suggestions.length === 0) {
    lines.push("No task suggestions found.");
    return lines.join("\n");
  }
  for (const suggestion of suggestions) {
    lines.push(
      `${suggestion.suggestion_id} | ${suggestion.status} | ${suggestion.priority} | ${humanizeKind(suggestion.kind)} | ${truncate(suggestion.title)}`,
    );
    lines.push(`  next: personal-ops suggestion show ${suggestion.suggestion_id}`);
  }
  return lines.join("\n");
}

export function formatTaskSuggestionDetail(detail: TaskSuggestionDetail): string {
  const suggestion = detail.suggestion;
  const lines: string[] = [];
  lines.push(`Task Suggestion: ${suggestion.suggestion_id}`);
  lines.push(line("Title", suggestion.title));
  lines.push(line("Status", suggestion.status));
  lines.push(line("Priority", suggestion.priority));
  lines.push(line("Kind", humanizeKind(suggestion.kind)));
  lines.push(line("Suggested by", suggestion.suggested_by_client));
  if (suggestion.due_at) lines.push(line("Due", suggestion.due_at));
  if (suggestion.remind_at) lines.push(line("Remind", suggestion.remind_at));
  if (suggestion.notes) lines.push(line("Notes", suggestion.notes));
  if (suggestion.decision_note) lines.push(line("Decision note", suggestion.decision_note));
  if (detail.accepted_task) lines.push(line("Accepted task", detail.accepted_task.task_id));
  lines.push("");
  lines.push("Recent Audit");
  if (detail.related_audit_events.length === 0) {
    lines.push("No related audit events found.");
  } else {
    for (const event of detail.related_audit_events) {
      lines.push(`${event.timestamp} | ${event.action} | ${event.outcome} | ${event.client_id}`);
    }
  }
  return lines.join("\n");
}
