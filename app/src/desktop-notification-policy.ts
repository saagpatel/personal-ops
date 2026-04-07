export interface DesktopNotificationSnapshot {
  readiness: string;
  repair_hint?: string | null;
  review_package_inbox_count?: number | null;
  review_package_meetings_count?: number | null;
  review_package_planning_count?: number | null;
  review_package_outbound_count?: number | null;
  open_tuning_proposal_count?: number | null;
  review_notification_cooldown_minutes?: Partial<Record<"inbox" | "meetings" | "planning" | "outbound", number>> | null;
  review_package_targets?: Partial<
    Record<
      "inbox" | "meetings" | "planning" | "outbound",
      { package_id: string; package_cycle_id?: string | null } | null
    >
  > | null;
  top_tuning_proposal_id?: string | null;
  notification_cooldown_minutes?: number | null;
}

export type DesktopNotificationKind =
  | "readiness_degraded"
  | "review_package_inbox"
  | "review_package_meetings"
  | "review_package_planning"
  | "review_package_outbound"
  | "review_tuning_proposal";

export interface DesktopNotificationEvent {
  kind: DesktopNotificationKind;
  title: string;
  body: string;
}

export interface DesktopReviewNotificationRecord {
  kind:
    | "review_package_inbox"
    | "review_package_meetings"
    | "review_package_planning"
    | "review_package_outbound"
    | "review_tuning_proposal";
  decision: "fired" | "suppressed";
  source: "desktop";
  surface?: "inbox" | "meetings" | "planning" | "outbound";
  package_id?: string;
  package_cycle_id?: string;
  proposal_id?: string;
  suppression_reason?: "cooldown" | "permission_denied";
  current_count: number;
  previous_count: number;
  cooldown_minutes: number;
}

export interface DesktopNotificationState {
  readiness: string;
  review_package_inbox_count: number;
  review_package_meetings_count: number;
  review_package_planning_count: number;
  review_package_outbound_count: number;
  open_tuning_proposal_count: number;
  last_notified_at: Record<DesktopNotificationKind, string | null>;
}

export function initialDesktopNotificationState(): DesktopNotificationState {
  return {
    readiness: "ready",
    review_package_inbox_count: 0,
    review_package_meetings_count: 0,
    review_package_planning_count: 0,
    review_package_outbound_count: 0,
    open_tuning_proposal_count: 0,
    last_notified_at: {
      readiness_degraded: null,
      review_package_inbox: null,
      review_package_meetings: null,
      review_package_planning: null,
      review_package_outbound: null,
      review_tuning_proposal: null,
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

function surfaceCooldownMs(snapshot: DesktopNotificationSnapshot, surface: "inbox" | "meetings" | "planning" | "outbound"): number {
  const override = snapshot.review_notification_cooldown_minutes?.[surface];
  if (override !== undefined && override !== null && Number.isFinite(Number(override))) {
    return Math.max(1, Number(override)) * 60_000;
  }
  return cooldownMs(snapshot);
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
): {
  state: DesktopNotificationState;
  notifications: DesktopNotificationEvent[];
  review_notification_records: DesktopReviewNotificationRecord[];
} {
  const next: DesktopNotificationState = {
    readiness: snapshot.readiness,
    review_package_inbox_count: asCount(snapshot.review_package_inbox_count),
    review_package_meetings_count: asCount(snapshot.review_package_meetings_count),
    review_package_planning_count: asCount(snapshot.review_package_planning_count),
    review_package_outbound_count: asCount(snapshot.review_package_outbound_count),
    open_tuning_proposal_count: asCount(snapshot.open_tuning_proposal_count),
    last_notified_at: { ...previous.last_notified_at },
  };
  const notifications: DesktopNotificationEvent[] = [];
  const reviewNotificationRecords: DesktopReviewNotificationRecord[] = [];
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

  const reviewSurfaceDefinitions = [
    { surface: "inbox" as const, kind: "review_package_inbox" as const, title: "Inbox review package ready", nextCount: next.review_package_inbox_count, previousCount: previous.review_package_inbox_count },
    { surface: "meetings" as const, kind: "review_package_meetings" as const, title: "Meeting review package ready", nextCount: next.review_package_meetings_count, previousCount: previous.review_package_meetings_count },
    { surface: "planning" as const, kind: "review_package_planning" as const, title: "Planning review package ready", nextCount: next.review_package_planning_count, previousCount: previous.review_package_planning_count },
    { surface: "outbound" as const, kind: "review_package_outbound" as const, title: "Outbound review package ready", nextCount: next.review_package_outbound_count, previousCount: previous.review_package_outbound_count },
  ];

  for (const definition of reviewSurfaceDefinitions) {
    if (definition.nextCount <= definition.previousCount) {
      continue;
    }
    const cooldownMinutes = Math.max(1, Math.round(surfaceCooldownMs(snapshot, definition.surface) / 60_000));
    const target = snapshot.review_package_targets?.[definition.surface];
    const allowed = outsideCooldown(
      previous.last_notified_at[definition.kind],
      nowMs,
      surfaceCooldownMs(snapshot, definition.surface),
    );
    if (allowed) {
      notifications.push({
        kind: definition.kind,
        title: definition.title,
        body: `${definition.nextCount} ${definition.surface} review package(s) are ready.`,
      });
      next.last_notified_at[definition.kind] = nowIso;
      reviewNotificationRecords.push({
        kind: definition.kind,
        decision: "fired",
        source: "desktop",
        surface: definition.surface,
        ...(target?.package_id ? { package_id: target.package_id } : {}),
        ...(target?.package_cycle_id ? { package_cycle_id: target.package_cycle_id } : {}),
        current_count: definition.nextCount,
        previous_count: definition.previousCount,
        cooldown_minutes: cooldownMinutes,
      });
    } else {
      reviewNotificationRecords.push({
        kind: definition.kind,
        decision: "suppressed",
        source: "desktop",
        surface: definition.surface,
        ...(target?.package_id ? { package_id: target.package_id } : {}),
        ...(target?.package_cycle_id ? { package_cycle_id: target.package_cycle_id } : {}),
        suppression_reason: "cooldown",
        current_count: definition.nextCount,
        previous_count: definition.previousCount,
        cooldown_minutes: cooldownMinutes,
      });
    }
  }

  if (next.open_tuning_proposal_count > previous.open_tuning_proposal_count) {
    const cooldownMinutes = Math.max(1, Math.round(requiredMs / 60_000));
    const allowed = outsideCooldown(previous.last_notified_at.review_tuning_proposal, nowMs, requiredMs);
    if (allowed) {
      notifications.push({
        kind: "review_tuning_proposal",
        title: "Review tuning proposal ready",
        body: `${next.open_tuning_proposal_count} review tuning proposal(s) are ready.`,
      });
      next.last_notified_at.review_tuning_proposal = nowIso;
      reviewNotificationRecords.push({
        kind: "review_tuning_proposal",
        decision: "fired",
        source: "desktop",
        ...(snapshot.top_tuning_proposal_id ? { proposal_id: snapshot.top_tuning_proposal_id } : {}),
        current_count: next.open_tuning_proposal_count,
        previous_count: previous.open_tuning_proposal_count,
        cooldown_minutes: cooldownMinutes,
      });
    } else {
      reviewNotificationRecords.push({
        kind: "review_tuning_proposal",
        decision: "suppressed",
        source: "desktop",
        ...(snapshot.top_tuning_proposal_id ? { proposal_id: snapshot.top_tuning_proposal_id } : {}),
        suppression_reason: "cooldown",
        current_count: next.open_tuning_proposal_count,
        previous_count: previous.open_tuning_proposal_count,
        cooldown_minutes: cooldownMinutes,
      });
    }
  }

  return { state: next, notifications, review_notification_records: reviewNotificationRecords };
}
