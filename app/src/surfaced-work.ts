import { randomUUID } from "node:crypto";
import type {
  AssistantActionQueueReport,
  PlanningRecommendation,
  RepairExecutionRecord,
  RepairStepId,
  ServiceStatusReport,
  SurfacedNoiseReductionSummary,
  SurfacedWorkEvidenceKind,
  SurfacedWorkHelpfulnessLevel,
  SurfacedWorkHelpfulnessSummary,
  SurfacedWorkOutcomeRecord,
  SurfacedWorkSurface,
  WorkflowBundleAction,
  WorkflowBundleReport,
  WorkspaceHomeSummary,
} from "./types.js";

const SURFACED_WORK_LOOKBACK_DAYS = 30;
const SURFACED_WORK_EXPIRY_HOURS = 24;

type OutcomeDescriptor = {
  surface: SurfacedWorkSurface;
  surfaced_state: string;
  target_type: string;
  target_id: string;
  assistant_action_id?: string | undefined;
  planning_recommendation_id?: string | undefined;
  repair_step_id?: RepairStepId | undefined;
  maintenance_step_id?: RepairStepId | undefined;
  summary_snapshot: string;
  command_snapshot?: string | undefined;
};

type OutcomeCloseInput = {
  state: Exclude<SurfacedWorkOutcomeRecord["state"], "open">;
  evidence_kind: SurfacedWorkEvidenceKind;
  acted_at?: string | null;
  closed_at: string;
};

type StableSurfacedIdentity = {
  surface: SurfacedWorkSurface;
  target_type: string | null;
  target_id: string | null;
  assistant_action_id?: string | null;
  planning_recommendation_id?: string | null;
  helpfulness?: SurfacedWorkHelpfulnessSummary | undefined;
};

type ServiceLike = {
  db?: {
    getOpenSurfacedWorkOutcome?: (surface: SurfacedWorkSurface, target_type: string, target_id: string) => SurfacedWorkOutcomeRecord | null;
    upsertSurfacedWorkOutcome?: (record: SurfacedWorkOutcomeRecord) => SurfacedWorkOutcomeRecord;
    closeSurfacedWorkOutcome?: (outcomeId: string, input: OutcomeCloseInput) => SurfacedWorkOutcomeRecord | null;
    listSurfacedWorkOutcomes?: (options?: any) => SurfacedWorkOutcomeRecord[];
    getPlanningRecommendation?: (recommendationId: string) => PlanningRecommendation | null;
    listRepairExecutions?: (options: { step_id?: RepairStepId; days?: number; limit?: number }) => RepairExecutionRecord[];
    listAuditEvents?: (filter: {
      actions?: string[];
      action?: string;
      target_type?: string;
      target_id?: string;
      client_id?: string;
      limit: number;
    }) => Array<{
      timestamp: string;
      outcome: string;
      metadata_json: string;
    }>;
  };
};

function hasOutcomeStorage(service: ServiceLike): service is Required<Pick<ServiceLike, "db">> & {
  db: {
    getOpenSurfacedWorkOutcome: NonNullable<NonNullable<ServiceLike["db"]>["getOpenSurfacedWorkOutcome"]>;
    upsertSurfacedWorkOutcome: NonNullable<NonNullable<ServiceLike["db"]>["upsertSurfacedWorkOutcome"]>;
    closeSurfacedWorkOutcome: NonNullable<NonNullable<ServiceLike["db"]>["closeSurfacedWorkOutcome"]>;
    listSurfacedWorkOutcomes: NonNullable<NonNullable<ServiceLike["db"]>["listSurfacedWorkOutcomes"]>;
    getPlanningRecommendation?: NonNullable<NonNullable<ServiceLike["db"]>["getPlanningRecommendation"]>;
    listRepairExecutions?: NonNullable<NonNullable<ServiceLike["db"]>["listRepairExecutions"]>;
  };
} {
  return Boolean(
    service.db?.getOpenSurfacedWorkOutcome &&
      service.db?.upsertSurfacedWorkOutcome &&
      service.db?.closeSurfacedWorkOutcome &&
      service.db?.listSurfacedWorkOutcomes,
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyHelpfulness(surface: SurfacedWorkSurface, target_type: string | null = null, target_id: string | null = null): SurfacedWorkHelpfulnessSummary {
  return {
    eligible: false,
    surface,
    target_type,
    target_id,
    level: null,
    summary: null,
    sample_count_30d: 0,
    helpful_count_30d: 0,
    attempted_failed_count_30d: 0,
    superseded_count_30d: 0,
    expired_count_30d: 0,
    helpful_rate_30d: 0,
  };
}

function hoursBetween(startedAt: string, endedAt: string): number | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return (end - start) / (60 * 60 * 1000);
}

function happenedAfter(candidate: string | undefined, surfacedAt: string): boolean {
  if (!candidate) {
    return false;
  }
  const candidateAt = Date.parse(candidate);
  const surfaced = Date.parse(surfacedAt);
  return !Number.isNaN(candidateAt) && !Number.isNaN(surfaced) && candidateAt >= surfaced;
}

function helpfulnessLevelFromCounts(input: {
  sampleCount: number;
  helpfulCount: number;
  attemptedFailedCount: number;
  helpfulRate: number;
}): SurfacedWorkHelpfulnessLevel {
  if (input.sampleCount < 3) {
    return "unproven";
  }
  if (input.helpfulRate >= 0.6 && input.attemptedFailedCount <= Math.max(1, Math.floor(input.sampleCount * 0.25))) {
    return "helpful";
  }
  if (input.helpfulRate >= 0.3) {
    return "mixed";
  }
  return "weak";
}

function helpfulnessSummaryForLevel(level: SurfacedWorkHelpfulnessLevel): string {
  switch (level) {
    case "helpful":
      return "Recent outcomes suggest this surfaced work is usually acted on.";
    case "mixed":
      return "Recent outcomes are mixed; this surfaced work is sometimes acted on and sometimes passed over.";
    case "weak":
      return "Recent outcomes suggest this surfaced work is often surfaced without follow-through.";
    default:
      return "This surfaced work does not have enough recent outcome history yet.";
  }
}

function buildHelpfulnessSummary(
  service: ServiceLike,
  input: {
    surface: SurfacedWorkSurface;
    target_type: string;
    target_id: string;
  },
): SurfacedWorkHelpfulnessSummary {
  if (!service.db?.listSurfacedWorkOutcomes) {
    return {
      ...emptyHelpfulness(input.surface, input.target_type, input.target_id),
      eligible: true,
      level: "unproven",
      summary: helpfulnessSummaryForLevel("unproven"),
    };
  }
  const since = new Date(Date.now() - SURFACED_WORK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const records = service.db.listSurfacedWorkOutcomes({
    target_type: input.target_type,
    target_id: input.target_id,
    states: ["helpful", "attempted_failed", "superseded", "expired"],
    since,
    limit: 200,
  });
  const helpfulCount = records.filter((record) => record.state === "helpful").length;
  const attemptedFailedCount = records.filter((record) => record.state === "attempted_failed").length;
  const supersededCount = records.filter((record) => record.state === "superseded").length;
  const expiredCount = records.filter((record) => record.state === "expired").length;
  const sampleCount = records.length;
  const helpfulRate = sampleCount > 0 ? helpfulCount / sampleCount : 0;
  const level = helpfulnessLevelFromCounts({
    sampleCount,
    helpfulCount,
    attemptedFailedCount,
    helpfulRate,
  });
  return {
    eligible: true,
    surface: input.surface,
    target_type: input.target_type,
    target_id: input.target_id,
    level,
    summary: helpfulnessSummaryForLevel(level),
    sample_count_30d: sampleCount,
    helpful_count_30d: helpfulCount,
    attempted_failed_count_30d: attemptedFailedCount,
    superseded_count_30d: supersededCount,
    expired_count_30d: expiredCount,
    helpful_rate_30d: helpfulRate,
  };
}

function actionableWorkspaceHome(workspaceHome: WorkspaceHomeSummary): boolean {
  return workspaceHome.state !== "caught_up" && Boolean(workspaceHome.summary || workspaceHome.primary_command);
}

function workspaceIdentity(workspaceHome: WorkspaceHomeSummary): StableSurfacedIdentity | null {
  if (!actionableWorkspaceHome(workspaceHome)) {
    return null;
  }
  return {
    surface: "workspace_home",
    target_type: workspaceHome.surfaced_work_helpfulness?.target_type ?? null,
    target_id: workspaceHome.surfaced_work_helpfulness?.target_id ?? null,
    assistant_action_id: workspaceHome.assistant_action_id,
    helpfulness: workspaceHome.surfaced_work_helpfulness,
  };
}

function assistantIdentity(
  action: AssistantActionQueueReport["actions"][number] | null,
): StableSurfacedIdentity | null {
  if (!action) {
    return null;
  }
  return {
    surface: "assistant_top_action",
    target_type: action.target_type ?? action.surfaced_work_helpfulness?.target_type ?? null,
    target_id: action.target_id ?? action.surfaced_work_helpfulness?.target_id ?? null,
    assistant_action_id: action.action_id,
    helpfulness: action.surfaced_work_helpfulness,
  };
}

function workflowIdentity(action: WorkflowBundleAction | null): StableSurfacedIdentity | null {
  if (!action) {
    return null;
  }
  return {
    surface: "workflow_now_next",
    target_type: action.target_type ?? action.surfaced_work_helpfulness?.target_type ?? null,
    target_id: action.target_id ?? action.surfaced_work_helpfulness?.target_id ?? null,
    planning_recommendation_id: action.planning_recommendation_id ?? null,
    helpfulness: action.surfaced_work_helpfulness,
  };
}

function sameStableTarget(primary: StableSurfacedIdentity | null, secondary: StableSurfacedIdentity | null): boolean {
  if (!primary || !secondary) {
    return false;
  }
  if (
    primary.target_type &&
    primary.target_id &&
    secondary.target_type &&
    secondary.target_id &&
    primary.target_type === secondary.target_type &&
    primary.target_id === secondary.target_id
  ) {
    return true;
  }
  if (primary.assistant_action_id && secondary.assistant_action_id && primary.assistant_action_id === secondary.assistant_action_id) {
    return true;
  }
  if (
    primary.planning_recommendation_id &&
    secondary.planning_recommendation_id &&
    primary.planning_recommendation_id === secondary.planning_recommendation_id
  ) {
    return true;
  }
  return false;
}

function emptyNoiseReduction(surface: SurfacedWorkSurface): SurfacedNoiseReductionSummary {
  return {
    eligible: false,
    surface,
    target_type: null,
    target_id: null,
    disposition: "supporting",
    reason: "no_reduction",
    summary: null,
    show_helpfulness: true,
    show_why_now: true,
    show_personalization: true,
  };
}

function primaryNoiseReduction(workspaceHome: WorkspaceHomeSummary): SurfacedNoiseReductionSummary {
  const identity = workspaceIdentity(workspaceHome);
  return {
    eligible: true,
    surface: "workspace_home",
    target_type: identity?.target_type ?? null,
    target_id: identity?.target_id ?? null,
    disposition: "primary",
    reason: "no_reduction",
    summary: null,
    show_helpfulness: true,
    show_why_now: true,
    show_personalization: false,
  };
}

function secondaryNoiseReduction(input: {
  surface: Exclude<SurfacedWorkSurface, "workspace_home">;
  primary: StableSurfacedIdentity | null;
  current: StableSurfacedIdentity | null;
}): SurfacedNoiseReductionSummary | null {
  const { surface, primary, current } = input;
  if (!current) {
    return null;
  }
  const helpfulnessLevel = current.helpfulness?.level ?? null;
  const hasPrimary = Boolean(primary);
  if (hasPrimary && sameStableTarget(primary, current)) {
    return {
      eligible: true,
      surface,
      target_type: current.target_type,
      target_id: current.target_id,
      disposition: "suppressed_duplicate",
      reason: "same_target_primary",
      summary: "This matches the current workspace focus.",
      show_helpfulness: false,
      show_why_now: false,
      show_personalization: false,
    };
  }
  if (hasPrimary && helpfulnessLevel === "weak") {
    return {
      eligible: true,
      surface,
      target_type: current.target_type,
      target_id: current.target_id,
      disposition: "quieted",
      reason: "weak_recent_outcomes",
      summary: "This stays available, but recent follow-through has been weak.",
      show_helpfulness: false,
      show_why_now: false,
      show_personalization: false,
    };
  }
  if (hasPrimary && helpfulnessLevel === "mixed") {
    return {
      eligible: true,
      surface,
      target_type: current.target_type,
      target_id: current.target_id,
      disposition: "quieted",
      reason: "mixed_recent_outcomes",
      summary: "This stays available, but recent follow-through has been mixed.",
      show_helpfulness: false,
      show_why_now: false,
      show_personalization: false,
    };
  }
  return {
    eligible: true,
    surface,
    target_type: current.target_type,
    target_id: current.target_id,
    disposition: "supporting",
    reason: hasPrimary ? "primary_focus_clear" : "no_reduction",
    summary: null,
    show_helpfulness: true,
    show_why_now: true,
    show_personalization: true,
  };
}

function outcomeKey(record: SurfacedWorkOutcomeRecord): string {
  if (record.surface === "assistant_top_action") {
    return `assistant:${record.assistant_action_id ?? record.target_id}`;
  }
  if (record.surface === "workflow_now_next") {
    return `workflow:${record.planning_recommendation_id ?? "none"}:${record.target_type}:${record.target_id}`;
  }
  if (record.surfaced_state === "repair") {
    return `repair:${record.repair_step_id ?? record.target_id}`;
  }
  if (record.surfaced_state === "assistant") {
    return `assistant:${record.assistant_action_id ?? record.target_id}`;
  }
  if (record.surfaced_state === "workflow") {
    return `workflow:${record.planning_recommendation_id ?? "none"}:${record.target_type}:${record.target_id}`;
  }
  if (record.surfaced_state === "maintenance") {
    return `maintenance:${record.maintenance_step_id ?? record.target_id}`;
  }
  return `${record.surfaced_state}:${record.target_type}:${record.target_id}`;
}

function shouldExpire(record: SurfacedWorkOutcomeRecord, observedAt: string): boolean {
  const elapsedHours = hoursBetween(record.last_seen_at, observedAt);
  return elapsedHours !== null && elapsedHours >= SURFACED_WORK_EXPIRY_HOURS;
}

function closeRecord(service: ServiceLike, record: SurfacedWorkOutcomeRecord, input: OutcomeCloseInput): void {
  if (!service.db?.closeSurfacedWorkOutcome) {
    return;
  }
  service.db.closeSurfacedWorkOutcome(record.outcome_id, input);
}

function ensureOpenRecord(service: ServiceLike, descriptor: OutcomeDescriptor, observedAt: string): SurfacedWorkOutcomeRecord {
  if (!hasOutcomeStorage(service)) {
    return {
      outcome_id: randomUUID(),
      surface: descriptor.surface,
      surfaced_state: descriptor.surfaced_state,
      target_type: descriptor.target_type,
      target_id: descriptor.target_id,
      assistant_action_id: descriptor.assistant_action_id,
      planning_recommendation_id: descriptor.planning_recommendation_id,
      repair_step_id: descriptor.repair_step_id,
      maintenance_step_id: descriptor.maintenance_step_id,
      summary_snapshot: descriptor.summary_snapshot,
      command_snapshot: descriptor.command_snapshot,
      surfaced_at: observedAt,
      last_seen_at: observedAt,
      state: "open",
    };
  }
  const existing = service.db.getOpenSurfacedWorkOutcome(descriptor.surface, descriptor.target_type, descriptor.target_id);
  return service.db.upsertSurfacedWorkOutcome({
    outcome_id: existing?.outcome_id ?? randomUUID(),
    surface: descriptor.surface,
    surfaced_state: descriptor.surfaced_state,
    target_type: descriptor.target_type,
    target_id: descriptor.target_id,
    assistant_action_id: descriptor.assistant_action_id,
    planning_recommendation_id: descriptor.planning_recommendation_id,
    repair_step_id: descriptor.repair_step_id,
    maintenance_step_id: descriptor.maintenance_step_id,
    summary_snapshot: descriptor.summary_snapshot,
    command_snapshot: descriptor.command_snapshot,
    surfaced_at: existing?.surfaced_at ?? observedAt,
    last_seen_at: observedAt,
    state: "open",
    evidence_kind: undefined,
    acted_at: existing?.acted_at,
    closed_at: undefined,
  });
}

function recommendationProgress(recommendation: PlanningRecommendation | null, surfacedAt: string): string | null {
  if (!recommendation) {
    return null;
  }
  return [recommendation.first_action_at, recommendation.closed_at, recommendation.resolved_at].find((value) => happenedAfter(value, surfacedAt)) ?? null;
}

function latestRepairExecutionForStep(
  service: ServiceLike,
  stepId: RepairStepId,
  options: {
    surfacedAt?: string;
    triggerSource?: RepairExecutionRecord["trigger_source"];
  } = {},
): RepairExecutionRecord | null {
  if (!service.db?.listRepairExecutions) {
    return null;
  }
  const executions = service.db.listRepairExecutions({ step_id: stepId, limit: 50 });
  return (
    executions.find((execution) => {
      if (options.surfacedAt && !happenedAfter(execution.completed_at, options.surfacedAt)) {
        return false;
      }
      if (options.triggerSource && execution.trigger_source !== options.triggerSource) {
        return false;
      }
      return true;
    }) ?? null
  );
}

function latestAssistantRunForAction(
  service: ServiceLike,
  actionId: string,
  surfacedAt: string,
): { outcome: "success" | "failure"; completed_at: string } | null {
  if (!service.db?.listAuditEvents) {
    return null;
  }
  const events = service.db.listAuditEvents({
    actions: ["assistant_action_run"],
    target_type: "assistant_action",
    target_id: actionId,
    limit: 20,
  });
  for (const event of events) {
    let completedAt = event.timestamp;
    try {
      const metadata = JSON.parse(event.metadata_json) as {
        completed_at?: string;
      };
      if (metadata.completed_at) {
        completedAt = metadata.completed_at;
      }
    } catch {
      // Fall back to the audit timestamp when metadata parsing fails.
    }
    if (!happenedAfter(completedAt, surfacedAt)) {
      continue;
    }
    return {
      outcome: event.outcome === "success" ? "success" : "failure",
      completed_at: completedAt,
    };
  }
  return null;
}

function workspaceOutcomeClosure(
  service: ServiceLike,
  record: SurfacedWorkOutcomeRecord,
  input: {
    assistantQueue: AssistantActionQueueReport;
  },
): OutcomeCloseInput | null {
  if (record.surfaced_state === "repair" && record.repair_step_id) {
    const execution = latestRepairExecutionForStep(service, record.repair_step_id, {
      surfacedAt: record.surfaced_at,
    });
    if (!execution) {
      return null;
    }
    if (execution.outcome === "failed") {
      return {
        state: "attempted_failed",
        evidence_kind: "repair_failed",
        acted_at: execution.completed_at,
        closed_at: execution.completed_at,
      };
    }
    if (execution.resolved_target_step) {
      return {
        state: "helpful",
        evidence_kind: "repair_progressed",
        acted_at: execution.completed_at,
        closed_at: execution.completed_at,
      };
    }
    return null;
  }

  if (record.surfaced_state === "assistant" && record.assistant_action_id) {
    const action = input.assistantQueue.actions.find((candidate) => candidate.action_id === record.assistant_action_id);
    const latestRun = latestAssistantRunForAction(service, record.assistant_action_id, record.surfaced_at);
    if (action?.state === "failed" || latestRun?.outcome === "failure") {
      return {
        state: "attempted_failed",
        evidence_kind: "assistant_failed",
        acted_at: action?.latest_run?.completed_at ?? latestRun?.completed_at ?? nowIso(),
        closed_at: action?.latest_run?.completed_at ?? latestRun?.completed_at ?? nowIso(),
      };
    }
    if (action?.state === "completed" || latestRun?.outcome === "success") {
      return {
        state: "helpful",
        evidence_kind: "assistant_progressed",
        acted_at: action?.latest_run?.completed_at ?? latestRun?.completed_at ?? nowIso(),
        closed_at: action?.latest_run?.completed_at ?? latestRun?.completed_at ?? nowIso(),
      };
    }
    return null;
  }

  if (record.surfaced_state === "workflow" && record.planning_recommendation_id) {
    const actedAt = recommendationProgress(service.db?.getPlanningRecommendation?.(record.planning_recommendation_id) ?? null, record.surfaced_at);
    if (!actedAt) {
      return null;
    }
    return {
      state: "helpful",
      evidence_kind: "planning_progressed",
      acted_at: actedAt,
      closed_at: actedAt,
    };
  }

  if (record.surfaced_state === "maintenance" && record.maintenance_step_id) {
    const execution = latestRepairExecutionForStep(service, record.maintenance_step_id, {
      surfacedAt: record.surfaced_at,
      triggerSource: "maintenance_run",
    });
    if (!execution) {
      return null;
    }
    if (execution.outcome === "resolved" && execution.after_first_step_id) {
      return {
        state: "attempted_failed",
        evidence_kind: "maintenance_handed_off",
        acted_at: execution.completed_at,
        closed_at: execution.completed_at,
      };
    }
    if (execution.outcome === "resolved" && execution.resolved_target_step && !execution.after_first_step_id) {
      return {
        state: "helpful",
        evidence_kind: "maintenance_completed",
        acted_at: execution.completed_at,
        closed_at: execution.completed_at,
      };
    }
  }

  return null;
}

function assistantOutcomeClosure(service: ServiceLike, record: SurfacedWorkOutcomeRecord, queue: AssistantActionQueueReport): OutcomeCloseInput | null {
  if (!record.assistant_action_id) {
    return null;
  }
  const action = queue.actions.find((candidate) => candidate.action_id === record.assistant_action_id);
  const latestRun = latestAssistantRunForAction(service, record.assistant_action_id, record.surfaced_at);
  if (action?.state === "failed" || latestRun?.outcome === "failure") {
    return {
      state: "attempted_failed",
      evidence_kind: "assistant_failed",
      acted_at: action?.latest_run?.completed_at ?? latestRun?.completed_at ?? nowIso(),
      closed_at: action?.latest_run?.completed_at ?? latestRun?.completed_at ?? nowIso(),
    };
  }
  if (action?.state === "completed" || latestRun?.outcome === "success") {
    return {
      state: "helpful",
      evidence_kind: "assistant_progressed",
      acted_at: action?.latest_run?.completed_at ?? latestRun?.completed_at ?? nowIso(),
      closed_at: action?.latest_run?.completed_at ?? latestRun?.completed_at ?? nowIso(),
    };
  }
  return null;
}

function workflowOutcomeClosure(service: ServiceLike, record: SurfacedWorkOutcomeRecord): OutcomeCloseInput | null {
  if (!record.planning_recommendation_id) {
    return null;
  }
  const actedAt = recommendationProgress(service.db?.getPlanningRecommendation?.(record.planning_recommendation_id) ?? null, record.surfaced_at);
  if (!actedAt) {
    return null;
  }
  return {
    state: "helpful",
    evidence_kind: "planning_progressed",
    acted_at: actedAt,
    closed_at: actedAt,
  };
}

function actionableAssistant(queue: AssistantActionQueueReport): AssistantActionQueueReport["actions"][number] | null {
  return queue.actions.find((action) => action.state === "proposed" || action.state === "awaiting_review") ?? null;
}

function trackSurface(
  service: ServiceLike,
  input: {
    surface: SurfacedWorkSurface;
    current_key: string | null;
    descriptor: OutcomeDescriptor | null;
    closureForRecord: (record: SurfacedWorkOutcomeRecord) => OutcomeCloseInput | null;
    observed_at: string;
  },
): SurfacedWorkHelpfulnessSummary | null {
  if (!hasOutcomeStorage(service)) {
    if (!input.descriptor) {
      return null;
    }
    return buildHelpfulnessSummary(service, {
      surface: input.descriptor.surface,
      target_type: input.descriptor.target_type,
      target_id: input.descriptor.target_id,
    });
  }
  const openRecords = service.db.listSurfacedWorkOutcomes({ surface: input.surface, state: "open", limit: 100 });
  const stillOpen: SurfacedWorkOutcomeRecord[] = [];

  for (const record of openRecords) {
    const closure = input.closureForRecord(record);
    if (closure) {
      closeRecord(service, record, closure);
      continue;
    }
    if (shouldExpire(record, input.observed_at)) {
      closeRecord(service, record, {
        state: "expired",
        evidence_kind: "timed_out",
        acted_at: null,
        closed_at: input.observed_at,
      });
      continue;
    }
    stillOpen.push(record);
  }

  if (input.current_key) {
    for (const record of stillOpen) {
      if (outcomeKey(record) === input.current_key) {
        continue;
      }
      closeRecord(service, record, {
        state: "superseded",
        evidence_kind: "superseded",
        acted_at: null,
        closed_at: input.observed_at,
      });
    }
  }

  if (!input.descriptor) {
    return null;
  }

  ensureOpenRecord(service, input.descriptor, input.observed_at);
  return buildHelpfulnessSummary(service, {
    surface: input.descriptor.surface,
    target_type: input.descriptor.target_type,
    target_id: input.descriptor.target_id,
  });
}

function workflowDescriptor(action: WorkflowBundleAction | null, surface: SurfacedWorkSurface): { descriptor: OutcomeDescriptor | null; key: string | null } {
  if (!action) {
    return { descriptor: null, key: null };
  }
  const key = `workflow:${action.planning_recommendation_id ?? "none"}:${action.target_type ?? "none"}:${action.target_id ?? "none"}`;
  if (!action.target_type || !action.target_id || !action.planning_recommendation_id) {
    return { descriptor: null, key };
  }
  return {
    key,
    descriptor: {
      surface,
      surfaced_state: surface === "workspace_home" ? "workflow" : "now-next",
      target_type: action.target_type,
      target_id: action.target_id,
      planning_recommendation_id: action.planning_recommendation_id,
      summary_snapshot: action.summary,
      command_snapshot: action.command,
    },
  };
}

function assistantDescriptor(
  action: AssistantActionQueueReport["actions"][number] | null,
  surface: SurfacedWorkSurface,
): { descriptor: OutcomeDescriptor | null; key: string | null } {
  if (!action) {
    return { descriptor: null, key: null };
  }
  const key = `assistant:${action.action_id}`;
  return {
    key,
    descriptor: {
      surface,
      surfaced_state: surface === "workspace_home" ? "assistant" : action.state,
      target_type: "assistant_action",
      target_id: action.action_id,
      assistant_action_id: action.action_id,
      summary_snapshot: action.summary,
      command_snapshot: action.command,
    },
  };
}

function workspaceDescriptor(
  report: ServiceStatusReport,
  workspaceHome: WorkspaceHomeSummary,
  assistantQueue: AssistantActionQueueReport,
  nowNextWorkflow: WorkflowBundleReport,
): { descriptor: OutcomeDescriptor | null; key: string | null } {
  if (workspaceHome.state === "repair") {
    const repairStepId =
      ((report.first_repair_step as typeof report.repair_plan.first_step_id) ?? null) ??
      report.repair_plan.first_step_id ??
      report.maintenance_repair_convergence?.active_repair_step_id ??
      report.maintenance_repair_convergence?.step_id ??
      null;
    const key = repairStepId ? `repair:${repairStepId}` : "repair:unknown";
    if (!repairStepId) {
      return { descriptor: null, key };
    }
    return {
      key,
      descriptor: {
        surface: "workspace_home",
        surfaced_state: "repair",
        target_type: "repair_step",
        target_id: repairStepId,
        repair_step_id: repairStepId,
        summary_snapshot: workspaceHome.summary ?? workspaceHome.title,
        command_snapshot: workspaceHome.primary_command ?? undefined,
      },
    };
  }

  if (workspaceHome.state === "assistant") {
    const topAction = actionableAssistant(assistantQueue);
    return assistantDescriptor(topAction, "workspace_home");
  }

  if (workspaceHome.state === "workflow") {
    return workflowDescriptor(nowNextWorkflow.actions[0] ?? null, "workspace_home");
  }

  if (workspaceHome.state === "maintenance") {
    const stepId =
      (report.maintenance_repair_convergence?.eligible ? report.maintenance_repair_convergence.step_id : null) ??
      (report.maintenance_decision_explanation?.eligible ? report.maintenance_decision_explanation.step_id : null);
    const key = stepId ? `maintenance:${stepId}` : "maintenance:unknown";
    if (!stepId) {
      return { descriptor: null, key };
    }
    return {
      key,
      descriptor: {
        surface: "workspace_home",
        surfaced_state: "maintenance",
        target_type: "maintenance_step",
        target_id: stepId,
        maintenance_step_id: stepId,
        summary_snapshot: workspaceHome.summary ?? workspaceHome.title,
        command_snapshot: workspaceHome.primary_command ?? undefined,
      },
    };
  }

  return { descriptor: null, key: null };
}

export function trackAssistantTopActionOutcome(
  service: ServiceLike,
  queue: AssistantActionQueueReport,
): { queue: AssistantActionQueueReport; helpfulness: SurfacedWorkHelpfulnessSummary | null } {
  const observedAt = queue.generated_at ?? nowIso();
  const topAction = actionableAssistant(queue);
  const { descriptor, key } = assistantDescriptor(topAction, "assistant_top_action");
  const helpfulness = trackSurface(service, {
    surface: "assistant_top_action",
    current_key: key,
    descriptor,
    observed_at: observedAt,
    closureForRecord: (record) => assistantOutcomeClosure(service, record, queue),
  });
  if (!topAction || !helpfulness) {
    return { queue, helpfulness: null };
  }
  return {
    helpfulness,
    queue: {
      ...queue,
      surfaced_work_helpfulness: helpfulness,
      actions: queue.actions.map((action) =>
        action.action_id === topAction.action_id ? { ...action, surfaced_work_helpfulness: helpfulness } : action,
      ),
    },
  };
}

export function trackWorkflowNowNextOutcome(
  service: ServiceLike,
  report: WorkflowBundleReport,
): { report: WorkflowBundleReport; helpfulness: SurfacedWorkHelpfulnessSummary | null } {
  const observedAt = report.generated_at ?? nowIso();
  const topAction = report.actions[0] ?? null;
  const { descriptor, key } = workflowDescriptor(topAction, "workflow_now_next");
  const helpfulness = trackSurface(service, {
    surface: "workflow_now_next",
    current_key: key,
    descriptor,
    observed_at: observedAt,
    closureForRecord: (record) => workflowOutcomeClosure(service, record),
  });
  if (!topAction || !helpfulness) {
    return { report, helpfulness: null };
  }
  return {
    helpfulness,
    report: {
      ...report,
      surfaced_work_helpfulness: helpfulness,
      actions: report.actions.map((action, index) =>
        index === 0 ? { ...action, surfaced_work_helpfulness: helpfulness } : action,
      ),
      sections: report.sections.map((section) =>
        section.title === "Best Next Move" || section.title === "Next Commands"
          ? {
              ...section,
              items: section.items.map((item, index) =>
                index === 0 ? { ...item, surfaced_work_helpfulness: helpfulness } : item,
              ),
            }
          : section,
      ),
    },
  };
}

export function trackWorkspaceHomeOutcome(
  service: ServiceLike,
  input: {
    report: ServiceStatusReport;
    workspace_home: WorkspaceHomeSummary;
    assistant_queue: AssistantActionQueueReport;
    now_next_workflow: WorkflowBundleReport;
  },
): { report: ServiceStatusReport; helpfulness: SurfacedWorkHelpfulnessSummary | null } {
  const observedAt = input.report.generated_at ?? nowIso();
  const { descriptor, key } = workspaceDescriptor(
    input.report,
    input.workspace_home,
    input.assistant_queue,
    input.now_next_workflow,
  );
  const helpfulness = trackSurface(service, {
    surface: "workspace_home",
    current_key: key,
    descriptor,
    observed_at: observedAt,
    closureForRecord: (record) =>
      workspaceOutcomeClosure(service, record, {
        assistantQueue: input.assistant_queue,
      }),
  });
  if (!helpfulness) {
    return { report: input.report, helpfulness: null };
  }
  return {
    helpfulness,
    report: {
      ...input.report,
      surfaced_work_helpfulness: helpfulness,
      workspace_home: {
        ...input.workspace_home,
        surfaced_work_helpfulness: helpfulness,
      },
    },
  };
}

export function applySurfacedNoiseReduction(input: {
  status: ServiceStatusReport;
  assistant_queue?: AssistantActionQueueReport | null;
  now_next_workflow?: WorkflowBundleReport | null;
}): {
  status: ServiceStatusReport;
  assistant_queue: AssistantActionQueueReport | null;
  now_next_workflow: WorkflowBundleReport | null;
} {
  const workspaceNoise = actionableWorkspaceHome(input.status.workspace_home)
    ? primaryNoiseReduction(input.status.workspace_home)
    : emptyNoiseReduction("workspace_home");
  const status: ServiceStatusReport = {
    ...input.status,
    surfaced_noise_reduction: workspaceNoise,
    workspace_home: {
      ...input.status.workspace_home,
      surfaced_noise_reduction: workspaceNoise,
    },
  };

  const primary = actionableWorkspaceHome(status.workspace_home) ? workspaceIdentity(status.workspace_home) : null;
  const topAssistant = input.assistant_queue ? actionableAssistant(input.assistant_queue) : null;
  const assistantNoise = secondaryNoiseReduction({
    surface: "assistant_top_action",
    primary,
    current: assistantIdentity(topAssistant),
  });
  const assistant_queue = input.assistant_queue
    ? {
        ...input.assistant_queue,
        surfaced_noise_reduction: assistantNoise ?? emptyNoiseReduction("assistant_top_action"),
        actions: input.assistant_queue.actions.map((action) =>
          topAssistant && action.action_id === topAssistant.action_id && assistantNoise
            ? { ...action, surfaced_noise_reduction: assistantNoise }
            : action,
        ),
      }
    : null;

  const topWorkflow = input.now_next_workflow?.actions[0] ?? null;
  const workflowNoise = secondaryNoiseReduction({
    surface: "workflow_now_next",
    primary,
    current: workflowIdentity(topWorkflow),
  });
  const secondarySummary = status.workspace_home.secondary_summary;
  const suppressedSecondarySummary =
    secondarySummary &&
    ((assistantNoise?.disposition === "suppressed_duplicate" && secondarySummary === topAssistant?.summary) ||
      (workflowNoise?.disposition === "suppressed_duplicate" && secondarySummary === topWorkflow?.summary) ||
      secondarySummary === status.workspace_home.summary)
      ? null
      : secondarySummary;
  const now_next_workflow = input.now_next_workflow
    ? {
        ...input.now_next_workflow,
        surfaced_noise_reduction: workflowNoise ?? emptyNoiseReduction("workflow_now_next"),
        actions: input.now_next_workflow.actions.map((action, index) =>
          index === 0 && workflowNoise ? { ...action, surfaced_noise_reduction: workflowNoise } : action,
        ),
        sections: input.now_next_workflow.sections.map((section) =>
          section.title === "Why Now" && workflowNoise && !workflowNoise.show_why_now
            ? { ...section, items: [] }
            : section.title === "Best Next Move" || section.title === "Why Now" || section.title === "Next Commands"
            ? {
                ...section,
                items: section.items.map((item, index) =>
                  index === 0 && workflowNoise ? { ...item, surfaced_noise_reduction: workflowNoise } : item,
                ),
              }
            : section,
        ),
      }
    : null;

  return {
    status: {
      ...status,
      workspace_home: {
        ...status.workspace_home,
        secondary_summary: suppressedSecondarySummary,
      },
    },
    assistant_queue,
    now_next_workflow,
  };
}
