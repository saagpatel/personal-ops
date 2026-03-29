import type { AuditEvent } from "../types.js";

export function listAuditEvents(service: any, filter: any, options: any = {}): AuditEvent[] {
  const categoryActions = filter.category ? service.listAssistantSafeAuditActionsForCategory(filter.category) : undefined;
  const events = service.db.listAuditEvents({
    limit: filter.limit ?? service.policy.auditDefaultLimit,
    actions: categoryActions,
    action: filter.action,
    target_type: filter.target_type,
    target_id: filter.target_id,
    client_id: filter.client_id,
  });
  if (!options.assistant_safe) {
    return events;
  }
  return events
    .map((event: AuditEvent) => service.shapeAuditEventForAssistant(event))
    .filter((event: AuditEvent | null): event is AuditEvent => Boolean(event));
}
