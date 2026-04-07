export interface DesktopNotificationSnapshot {
  readiness: string;
  repair_hint?: string | null;
  review_ready_inbox_count?: number | null;
  apply_ready_planning_count?: number | null;
  outbound_approval_ready_count?: number | null;
  outbound_send_ready_count?: number | null;
  notification_cooldown_minutes?: number | null;
}

export type DesktopNotificationKind =
  | "readiness_degraded"
  | "review_ready_inbox"
  | "apply_ready_planning"
  | "outbound_ready";

export interface DesktopNotificationEvent {
  kind: DesktopNotificationKind;
  title: string;
  body: string;
}

export interface DesktopNotificationState {
  readiness: string;
  review_ready_inbox_count: number;
  apply_ready_planning_count: number;
  outbound_approval_ready_count: number;
  outbound_send_ready_count: number;
  last_notified_at: Record<DesktopNotificationKind, string | null>;
}

export function initialDesktopNotificationState(): DesktopNotificationState {
  return {
    readiness: "ready",
    review_ready_inbox_count: 0,
    apply_ready_planning_count: 0,
    outbound_approval_ready_count: 0,
    outbound_send_ready_count: 0,
    last_notified_at: {
      readiness_degraded: null,
      review_ready_inbox: null,
      apply_ready_planning: null,
      outbound_ready: null,
    },
  };
}

function asCount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function cooldownMs(snapshot: DesktopNotificationSnapshot): number {
  const minutes = Number(snapshot.notification_cooldown_minutes ?? 30);
  return Math.max(1, Number.isFinite(minutes) ? minutes : 30) * 60_000;
}

function outsideCooldown(previousIso: string | null, nowMs: number, requiredMs: number): boolean {
  if (!previousIso) {
    return true;
  }
  const previousMs = Date.parse(previousIso);
  if (!Number.isFinite(previousMs)) {
    return true;
  }
  return nowMs - previousMs >= requiredMs;
}

export function computeDesktopNotificationUpdate(
  previous: DesktopNotificationState,
  snapshot: DesktopNotificationSnapshot,
  now = new Date(),
): { state: DesktopNotificationState; notifications: DesktopNotificationEvent[] } {
  const next: DesktopNotificationState = {
    readiness: snapshot.readiness,
    review_ready_inbox_count: asCount(snapshot.review_ready_inbox_count),
    apply_ready_planning_count: asCount(snapshot.apply_ready_planning_count),
    outbound_approval_ready_count: asCount(snapshot.outbound_approval_ready_count),
    outbound_send_ready_count: asCount(snapshot.outbound_send_ready_count),
    last_notified_at: { ...previous.last_notified_at },
  };
  const notifications: DesktopNotificationEvent[] = [];
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const requiredMs = cooldownMs(snapshot);

  if (
    snapshot.readiness !== "ready" &&
    snapshot.readiness !== previous.readiness &&
    outsideCooldown(previous.last_notified_at.readiness_degraded, nowMs, requiredMs)
  ) {
    notifications.push({
      kind: "readiness_degraded",
      title: "Personal Ops attention",
      body: snapshot.repair_hint || "The local control plane moved away from ready.",
    });
    next.last_notified_at.readiness_degraded = nowIso;
  }

  if (
    next.review_ready_inbox_count > previous.review_ready_inbox_count &&
    outsideCooldown(previous.last_notified_at.review_ready_inbox, nowMs, requiredMs)
  ) {
    notifications.push({
      kind: "review_ready_inbox",
      title: "Inbox review ready",
      body: `${next.review_ready_inbox_count} inbox group(s) are ready for review.`,
    });
    next.last_notified_at.review_ready_inbox = nowIso;
  }

  if (
    next.apply_ready_planning_count > previous.apply_ready_planning_count &&
    outsideCooldown(previous.last_notified_at.apply_ready_planning, nowMs, requiredMs)
  ) {
    notifications.push({
      kind: "apply_ready_planning",
      title: "Planning bundle ready",
      body: `${next.apply_ready_planning_count} planning bundle(s) are ready to apply.`,
    });
    next.last_notified_at.apply_ready_planning = nowIso;
  }

  const outboundApprovalIncreased = next.outbound_approval_ready_count > previous.outbound_approval_ready_count;
  const outboundSendIncreased = next.outbound_send_ready_count > previous.outbound_send_ready_count;
  if (
    (outboundApprovalIncreased || outboundSendIncreased) &&
    outsideCooldown(previous.last_notified_at.outbound_ready, nowMs, requiredMs)
  ) {
    const body = outboundSendIncreased
      ? outboundApprovalIncreased
        ? `${next.outbound_send_ready_count} outbound group(s) can send now, and ${next.outbound_approval_ready_count} more are approval-ready.`
        : `${next.outbound_send_ready_count} outbound group(s) can send now.`
      : `${next.outbound_approval_ready_count} outbound group(s) are approval-ready.`;
    notifications.push({
      kind: "outbound_ready",
      title: "Outbound finish-work ready",
      body,
    });
    next.last_notified_at.outbound_ready = nowIso;
  }

  return { state: next, notifications };
}
