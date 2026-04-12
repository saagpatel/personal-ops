import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMaintenanceEscalationSummary,
  buildMaintenanceFollowThroughSummary,
  buildMaintenanceSchedulingSummary,
  buildMaintenanceSessionPlan,
  buildMaintenanceWindowSummary,
  buildRepairPlan,
  deriveMaintenanceCommitmentState,
  summarizeRepairPlan,
} from "../src/repair-plan.js";
import type { DoctorCheck, RepairExecutionRecord } from "../src/types.js";

function warn(id: string, message: string): DoctorCheck {
  return {
    id,
    title: id,
    severity: "warn",
    message,
    category: "integration",
  };
}

function fail(id: string, message: string): DoctorCheck {
  return {
    id,
    title: id,
    severity: "fail",
    message,
    category: "integration",
  };
}

function resolvedExecution(
  stepId: RepairExecutionRecord["step_id"],
  completedAt: string,
  executionId: string,
): RepairExecutionRecord {
  return {
    execution_id: executionId,
    step_id: stepId,
    started_at: completedAt,
    completed_at: completedAt,
    requested_by_client: "personal-ops-cli",
    requested_by_actor: "operator",
    trigger_source: "repair_run",
    before_first_step_id: stepId,
    after_first_step_id: "install_check",
    outcome: "resolved",
    resolved_target_step: true,
    message: "Step resolved.",
  };
}

function maintenanceExecution(
  stepId: RepairExecutionRecord["step_id"],
  completedAt: string,
  executionId: string,
  overrides: Partial<RepairExecutionRecord> = {},
): RepairExecutionRecord {
  return {
    execution_id: executionId,
    step_id: stepId,
    started_at: completedAt,
    completed_at: completedAt,
    requested_by_client: "personal-ops-cli",
    requested_by_actor: "operator",
    trigger_source: "maintenance_run",
    before_first_step_id: stepId,
    after_first_step_id: undefined,
    outcome: "resolved",
    resolved_target_step: true,
    message: "Maintenance step resolved.",
    ...overrides,
  };
}

test("phase 15 repair plan keeps a deterministic narrow-first precedence", () => {
  const plan = buildRepairPlan({
    install_check: {
      state: "degraded",
      checks: [
        warn("cli_wrapper_current", "CLI wrapper was generated from an older checkout."),
        warn("oauth_client_permissions_secure", "OAuth client file permissions are broader than expected."),
        fail("launch_agent_loaded", "LaunchAgent is not loaded."),
      ],
    },
    doctor: {
      state: "degraded",
      deep: false,
      checks: [fail("launch_agent_loaded", "LaunchAgent is not loaded.")],
    },
  });

  assert.deepEqual(
    plan.steps.slice(0, 5).map((step) => step.id),
    ["install_wrappers", "fix_permissions", "install_launchagent", "install_check", "doctor"],
  );
  assert.equal(plan.first_step_id, "install_wrappers");
  assert.equal(plan.first_repair_step, "personal-ops install wrappers");
});

test("phase 15 repair plan maps stale desktop installs to install_desktop", () => {
  const plan = buildRepairPlan({
    install_check: { state: "ready", checks: [] },
    desktop: {
      supported: true,
      reinstall_recommended: true,
      reinstall_reason: "Desktop app was built from an older checkout.",
      launcher_repair_recommended: false,
      launcher_repair_reason: null,
    },
  });

  assert.equal(plan.first_step_id, "install_desktop");
  assert.equal(plan.first_repair_step, "personal-ops install desktop");
});

test("phase 15 repair plan does not propose install_desktop on unsupported platforms", () => {
  const plan = buildRepairPlan({
    install_check: { state: "ready", checks: [] },
    desktop: {
      supported: false,
      reinstall_recommended: true,
      reinstall_reason: "Desktop app is stale, but this machine is unsupported.",
      launcher_repair_recommended: false,
      launcher_repair_reason: null,
    },
  });

  assert.equal(plan.steps.some((step) => step.id === "install_desktop"), false);
});

test("phase 15 repair plan falls back to install_all only when no narrower fix applies", () => {
  const plan = buildRepairPlan({
    install_check: {
      state: "degraded",
      checks: [fail("dist_cli_exists", "Built CLI is missing from this checkout.")],
    },
  });

  assert.equal(plan.first_step_id, "install_check");
  assert.equal(plan.steps.some((step) => step.id === "install_all"), true);
  assert.equal(plan.steps.some((step) => step.id === "install_wrappers"), false);
});

test("phase 16 repair plan surfaces the latest repair outcome for matching steps", () => {
  const execution: RepairExecutionRecord = {
    execution_id: "repair-1",
    step_id: "install_wrappers",
    started_at: "2026-04-07T20:00:00.000Z",
    completed_at: "2026-04-07T20:01:00.000Z",
    requested_by_client: "personal-ops-cli",
    requested_by_actor: "operator",
    trigger_source: "repair_run",
    before_first_step_id: "install_wrappers",
    after_first_step_id: "install_check",
    outcome: "resolved",
    resolved_target_step: true,
    message: "Step resolved. Next repair step: `personal-ops install check`.",
  };
  const plan = buildRepairPlan({
    install_check: {
      state: "degraded",
      checks: [warn("cli_wrapper_current", "CLI wrapper was generated from an older checkout.")],
    },
    recent_repair_executions: [execution],
  });

  assert.equal(plan.last_execution?.step_id, "install_wrappers");
  assert.equal(plan.steps[0]?.latest_outcome, "resolved");
  assert.equal(plan.steps[0]?.latest_completed_at, "2026-04-07T20:01:00.000Z");
});

test("phase 16 repair plan flags recurring drift for repeated resolved wrapper repairs", () => {
  const executions: RepairExecutionRecord[] = [
    {
      execution_id: "repair-2",
      step_id: "install_wrappers",
      started_at: "2026-04-06T20:00:00.000Z",
      completed_at: "2026-04-06T20:01:00.000Z",
      requested_by_client: "personal-ops-cli",
      requested_by_actor: "operator",
      trigger_source: "repair_run",
      before_first_step_id: "install_wrappers",
      after_first_step_id: "install_check",
      outcome: "resolved",
      resolved_target_step: true,
      message: "Step resolved.",
    },
    {
      execution_id: "repair-3",
      step_id: "install_wrappers",
      started_at: "2026-04-01T20:00:00.000Z",
      completed_at: "2026-04-01T20:01:00.000Z",
      requested_by_client: "personal-ops-cli",
      requested_by_actor: "operator",
      trigger_source: "direct_command",
      before_first_step_id: "install_wrappers",
      after_first_step_id: "install_check",
      outcome: "resolved",
      resolved_target_step: true,
      message: "Step resolved.",
    },
  ];
  const plan = buildRepairPlan({
    install_check: {
      state: "degraded",
      checks: [warn("cli_wrapper_current", "CLI wrapper was generated from an older checkout.")],
    },
    recent_repair_executions: executions,
  });

  assert.equal(plan.top_recurring_issue?.step_id, "install_wrappers");
  assert.equal(plan.top_recurring_issue?.occurrence_count, 2);
});

test("phase 17 repair plan promotes healthy recurring wrapper drift into preventive maintenance", () => {
  const plan = buildRepairPlan({
    generated_at: "2026-04-07T20:00:00.000Z",
    install_check: { state: "ready", checks: [] },
    recent_repair_executions: [
      {
        execution_id: "repair-4",
        step_id: "install_wrappers",
        started_at: "2026-04-06T18:00:00.000Z",
        completed_at: "2026-04-06T18:05:00.000Z",
        requested_by_client: "personal-ops-cli",
        requested_by_actor: "operator",
        trigger_source: "repair_run",
        before_first_step_id: "install_wrappers",
        after_first_step_id: "install_check",
        outcome: "resolved",
        resolved_target_step: true,
        message: "Step resolved.",
      },
      {
        execution_id: "repair-5",
        step_id: "install_wrappers",
        started_at: "2026-04-01T18:00:00.000Z",
        completed_at: "2026-04-01T18:05:00.000Z",
        requested_by_client: "personal-ops-cli",
        requested_by_actor: "operator",
        trigger_source: "direct_command",
        before_first_step_id: "install_wrappers",
        after_first_step_id: "install_check",
        outcome: "resolved",
        resolved_target_step: true,
        message: "Step resolved.",
      },
    ],
  });

  assert.equal(plan.steps.some((step) => step.id === "install_wrappers"), false);
  assert.equal(plan.preventive_maintenance.top_step_id, "install_wrappers");
  assert.equal(plan.preventive_maintenance.recommendations[0]?.urgency, "watch");
});

test("phase 17 active repair suppresses duplicate preventive maintenance for the same step", () => {
  const plan = buildRepairPlan({
    generated_at: "2026-04-07T20:00:00.000Z",
    install_check: {
      state: "degraded",
      checks: [warn("cli_wrapper_current", "CLI wrapper was generated from an older checkout.")],
    },
    recent_repair_executions: [
      {
        execution_id: "repair-6",
        step_id: "install_wrappers",
        started_at: "2026-04-06T18:00:00.000Z",
        completed_at: "2026-04-06T18:05:00.000Z",
        requested_by_client: "personal-ops-cli",
        requested_by_actor: "operator",
        trigger_source: "repair_run",
        before_first_step_id: "install_wrappers",
        after_first_step_id: "install_check",
        outcome: "resolved",
        resolved_target_step: true,
        message: "Step resolved.",
      },
      {
        execution_id: "repair-7",
        step_id: "install_wrappers",
        started_at: "2026-04-01T18:00:00.000Z",
        completed_at: "2026-04-01T18:05:00.000Z",
        requested_by_client: "personal-ops-cli",
        requested_by_actor: "operator",
        trigger_source: "repair_run",
        before_first_step_id: "install_wrappers",
        after_first_step_id: "install_check",
        outcome: "resolved",
        resolved_target_step: true,
        message: "Step resolved.",
      },
    ],
  });

  assert.equal(plan.steps.some((step) => step.id === "install_wrappers"), true);
  assert.equal(plan.preventive_maintenance.count, 0);
});

test("phase 17 preventive maintenance keeps fixed precedence, urgency, and a cap of three", () => {
  const plan = buildRepairPlan({
    generated_at: "2026-04-07T20:00:00.000Z",
    install_check: { state: "ready", checks: [] },
    recent_repair_executions: [
      "install_wrappers",
      "install_wrappers",
      "install_wrappers",
      "install_desktop",
      "install_desktop",
      "install_launchagent",
      "install_launchagent",
      "fix_permissions",
      "fix_permissions",
    ].map((stepId, index) => ({
      execution_id: `repair-priority-${index}`,
      step_id: stepId as RepairExecutionRecord["step_id"],
      started_at: `2026-04-0${(index % 5) + 1}T18:00:00.000Z`,
      completed_at: `2026-04-0${(index % 5) + 1}T18:05:00.000Z`,
      requested_by_client: "personal-ops-cli",
      requested_by_actor: "operator",
      trigger_source: "repair_run" as const,
      before_first_step_id: stepId as RepairExecutionRecord["step_id"],
      after_first_step_id: "install_check" as const,
      outcome: "resolved" as const,
      resolved_target_step: true,
      message: "Step resolved.",
    })),
  });

  assert.deepEqual(
    plan.preventive_maintenance.recommendations.map((recommendation) => recommendation.step_id),
    ["install_wrappers", "install_desktop", "install_launchagent"],
  );
  assert.equal(plan.preventive_maintenance.count, 3);
  assert.equal(plan.preventive_maintenance.top_step_id, "install_wrappers");
  assert.equal(plan.preventive_maintenance.recommendations[0]?.urgency, "recommended");
  assert.equal(plan.preventive_maintenance.recommendations[1]?.urgency, "watch");
});

test("phase 17 preventive maintenance stays quiet for 24 hours after a fresh resolved repair", () => {
  const plan = buildRepairPlan({
    generated_at: "2026-04-07T20:00:00.000Z",
    install_check: { state: "ready", checks: [] },
    recent_repair_executions: [
      {
        execution_id: "repair-8",
        step_id: "install_wrappers",
        started_at: "2026-04-07T10:00:00.000Z",
        completed_at: "2026-04-07T10:30:00.000Z",
        requested_by_client: "personal-ops-cli",
        requested_by_actor: "operator",
        trigger_source: "repair_run",
        before_first_step_id: "install_wrappers",
        after_first_step_id: "install_check",
        outcome: "resolved",
        resolved_target_step: true,
        message: "Step resolved.",
      },
      {
        execution_id: "repair-9",
        step_id: "install_wrappers",
        started_at: "2026-04-04T10:00:00.000Z",
        completed_at: "2026-04-04T10:30:00.000Z",
        requested_by_client: "personal-ops-cli",
        requested_by_actor: "operator",
        trigger_source: "repair_run",
        before_first_step_id: "install_wrappers",
        after_first_step_id: "install_check",
        outcome: "resolved",
        resolved_target_step: true,
        message: "Step resolved.",
      },
    ],
  });

  assert.equal(plan.preventive_maintenance.count, 0);
});

test("phase 17 repair plan summary exposes preventive maintenance fields", () => {
  const plan = buildRepairPlan({
    generated_at: "2026-04-07T20:00:00.000Z",
    install_check: { state: "ready", checks: [] },
    recent_repair_executions: [
      {
        execution_id: "repair-10",
        step_id: "install_wrappers",
        started_at: "2026-04-06T18:00:00.000Z",
        completed_at: "2026-04-06T18:05:00.000Z",
        requested_by_client: "personal-ops-cli",
        requested_by_actor: "operator",
        trigger_source: "repair_run",
        before_first_step_id: "install_wrappers",
        after_first_step_id: "install_check",
        outcome: "resolved",
        resolved_target_step: true,
        message: "Step resolved.",
      },
      {
        execution_id: "repair-11",
        step_id: "install_wrappers",
        started_at: "2026-04-01T18:00:00.000Z",
        completed_at: "2026-04-01T18:05:00.000Z",
        requested_by_client: "personal-ops-cli",
        requested_by_actor: "operator",
        trigger_source: "repair_run",
        before_first_step_id: "install_wrappers",
        after_first_step_id: "install_check",
        outcome: "resolved",
        resolved_target_step: true,
        message: "Step resolved.",
      },
    ],
  });
  const summary = summarizeRepairPlan(plan);

  assert.equal(summary.preventive_maintenance_count, 1);
  assert.equal(summary.top_preventive_step_id, "install_wrappers");
});

test("phase 18 maintenance window becomes eligible only when the system is ready and calm", () => {
  const recentRepairExecutions = [
    resolvedExecution("install_wrappers", "2026-04-06T18:05:00.000Z", "repair-12"),
    resolvedExecution("install_wrappers", "2026-04-01T18:05:00.000Z", "repair-13"),
  ];
  const repairPlan = buildRepairPlan({
    generated_at: "2026-04-07T20:00:00.000Z",
    install_check: { state: "ready", checks: [] },
    latest_snapshot_id: "snapshot-1",
    latest_snapshot_age_hours: 1,
    snapshot_age_limit_hours: 24,
    prune_candidate_count: 0,
    recovery_rehearsal_missing: false,
    machine_state_origin: "native",
    recent_repair_executions: recentRepairExecutions,
  });

  const maintenanceWindow = buildMaintenanceWindowSummary({
    generated_at: "2026-04-07T20:00:00.000Z",
    state: "ready",
    worklist_items: [],
    repair_plan: repairPlan,
    recent_repair_executions: recentRepairExecutions,
  });

  assert.equal(maintenanceWindow.eligible_now, true);
  assert.equal(maintenanceWindow.deferred_reason, null);
  assert.equal(maintenanceWindow.top_step_id, "install_wrappers");
  assert.equal(maintenanceWindow.bundle?.recommendations[0]?.step_id, "install_wrappers");
});

test("phase 19 maintenance session is derived only from an eligible maintenance window", () => {
  const recentRepairExecutions = [
    resolvedExecution("install_wrappers", "2026-04-06T18:05:00.000Z", "repair-14"),
    resolvedExecution("install_wrappers", "2026-04-01T18:05:00.000Z", "repair-15"),
  ];
  const repairPlan = buildRepairPlan({
    generated_at: "2026-04-11T20:00:00.000Z",
    install_check: { state: "ready", checks: [] },
    latest_snapshot_id: "snapshot-2",
    latest_snapshot_age_hours: 1,
    snapshot_age_limit_hours: 24,
    prune_candidate_count: 0,
    recovery_rehearsal_missing: false,
    machine_state_origin: "native",
    recent_repair_executions: recentRepairExecutions,
  });
  const maintenanceWindow = buildMaintenanceWindowSummary({
    generated_at: "2026-04-11T20:00:00.000Z",
    state: "ready",
    worklist_items: [],
    repair_plan: repairPlan,
    recent_repair_executions: recentRepairExecutions,
  });

  const session = buildMaintenanceSessionPlan({
    generated_at: "2026-04-11T20:00:00.000Z",
    maintenance_window: maintenanceWindow,
    recent_repair_executions: recentRepairExecutions,
  });
  const deferred = buildMaintenanceSessionPlan({
    generated_at: "2026-04-11T20:00:00.000Z",
    maintenance_window: { ...maintenanceWindow, eligible_now: false, deferred_reason: "concrete_work_present", bundle: null },
    recent_repair_executions: recentRepairExecutions,
  });

  assert.equal(session.eligible_now, true);
  assert.equal(session.first_step_id, "install_wrappers");
  assert.equal(session.steps.length, 1);
  assert.equal(session.steps[0]?.latest_outcome, "resolved");
  assert.equal(session.start_command, "personal-ops maintenance session");
  assert.equal(deferred.eligible_now, false);
  assert.equal(deferred.deferred_reason, "concrete_work_present");
  assert.equal(deferred.steps.length, 0);
});

test("phase 18 maintenance window stays deferred when concrete work is already present", () => {
  const recentRepairExecutions = [
    resolvedExecution("install_wrappers", "2026-04-06T18:05:00.000Z", "repair-14"),
    resolvedExecution("install_wrappers", "2026-04-01T18:05:00.000Z", "repair-15"),
  ];
  const repairPlan = buildRepairPlan({
    generated_at: "2026-04-07T20:00:00.000Z",
    install_check: { state: "ready", checks: [] },
    latest_snapshot_id: "snapshot-1",
    latest_snapshot_age_hours: 1,
    snapshot_age_limit_hours: 24,
    prune_candidate_count: 0,
    recovery_rehearsal_missing: false,
    machine_state_origin: "native",
    recent_repair_executions: recentRepairExecutions,
  });

  const maintenanceWindow = buildMaintenanceWindowSummary({
    generated_at: "2026-04-07T20:00:00.000Z",
    state: "ready",
    worklist_items: [
      {
        item_id: "task-1",
        kind: "task_due_soon",
        severity: "warn",
        title: "Task due soon",
        summary: "A real task is due soon.",
        target_type: "task",
        target_id: "task-1",
        created_at: "2026-04-07T20:00:00.000Z",
        suggested_command: "personal-ops task show task-1",
        metadata_json: "{}",
      },
    ],
    repair_plan: repairPlan,
    recent_repair_executions: recentRepairExecutions,
  });

  assert.equal(maintenanceWindow.eligible_now, false);
  assert.equal(maintenanceWindow.deferred_reason, "concrete_work_present");
  assert.equal(maintenanceWindow.bundle, null);
});

test("phase 18 maintenance window respects the 24-hour quiet period for fresh repairs", () => {
  const recentRepairExecutions = [
    resolvedExecution("install_wrappers", "2026-04-07T10:30:00.000Z", "repair-16"),
    resolvedExecution("install_wrappers", "2026-04-04T10:30:00.000Z", "repair-17"),
  ];
  const repairPlan = buildRepairPlan({
    generated_at: "2026-04-07T20:00:00.000Z",
    install_check: { state: "ready", checks: [] },
    latest_snapshot_id: "snapshot-1",
    latest_snapshot_age_hours: 1,
    snapshot_age_limit_hours: 24,
    prune_candidate_count: 0,
    recovery_rehearsal_missing: false,
    machine_state_origin: "native",
    recent_repair_executions: recentRepairExecutions,
  });

  const maintenanceWindow = buildMaintenanceWindowSummary({
    generated_at: "2026-04-07T20:00:00.000Z",
    state: "ready",
    worklist_items: [],
    repair_plan: repairPlan,
    recent_repair_executions: recentRepairExecutions,
  });

  assert.equal(maintenanceWindow.eligible_now, false);
  assert.equal(maintenanceWindow.deferred_reason, "quiet_period_active");
  assert.equal(maintenanceWindow.top_step_id, "install_wrappers");
});

test("phase 20 follow-through marks a completed maintenance session when no bundle remains", () => {
  const summary = buildMaintenanceFollowThroughSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_window: {
      eligible_now: false,
      deferred_reason: "no_preventive_work",
      count: 0,
      top_step_id: null,
      bundle: null,
    },
    repair_plan: { steps: [], first_repair_step: null },
    recent_repair_executions: [maintenanceExecution("install_wrappers", "2026-04-12T18:00:00.000Z", "maintenance-1")],
  });

  assert.equal(summary.last_maintenance_outcome, "completed");
  assert.equal(summary.last_maintenance_step_id, "install_wrappers");
  assert.equal(summary.current_bundle_outcome?.signal, "completed");
  assert.equal(summary.maintenance_pressure_count, 0);
});

test("phase 20 follow-through treats repeated maintenance handoffs as stronger pressure than ordinary deferral", () => {
  const summary = buildMaintenanceFollowThroughSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_window: {
      eligible_now: false,
      deferred_reason: "active_repair_pending",
      count: 1,
      top_step_id: "install_wrappers",
      bundle: null,
    },
    repair_plan: {
      steps: [
        {
          id: "install_check",
          title: "Confirm local install health",
          reason: "Install checks still need attention.",
          suggested_command: "personal-ops install check",
          executable: false,
          status: "pending",
          scope: "install",
          blocking: true,
        },
      ],
      first_repair_step: "personal-ops install check",
    },
    recent_repair_executions: [
      maintenanceExecution("install_wrappers", "2026-04-11T18:00:00.000Z", "maintenance-2", {
        after_first_step_id: "install_check",
      }),
      maintenanceExecution("install_wrappers", "2026-04-05T18:00:00.000Z", "maintenance-3", {
        after_first_step_id: "install_check",
      }),
    ],
  });

  assert.equal(summary.last_maintenance_outcome, "handed_off_to_repair");
  assert.equal(summary.pressure.signal, "handed_off_to_repair");
  assert.equal(summary.top_maintenance_pressure_step_id, "install_wrappers");
});

test("phase 20 follow-through suppresses stale-bundle pressure right after a recent successful maintenance run", () => {
  const summary = buildMaintenanceFollowThroughSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_window: {
      eligible_now: true,
      deferred_reason: null,
      count: 1,
      top_step_id: "install_wrappers",
      bundle: {
        bundle_id: "maintenance-window:install_wrappers",
        title: "Preventive maintenance window",
        summary: "Refresh wrappers in a calm window.",
        recommended_commands: ["personal-ops install wrappers"],
        recommendations: [
          {
            step_id: "install_wrappers",
            title: "Refresh wrappers before the next drift",
            reason: "Wrapper drift has repeated on this machine.",
            suggested_command: "personal-ops install wrappers",
            urgency: "watch",
            last_resolved_at: "2026-04-10T18:00:00.000Z",
            repeat_count_30d: 2,
          },
        ],
      },
    },
    repair_plan: { steps: [], first_repair_step: null },
    recent_repair_executions: [maintenanceExecution("install_wrappers", "2026-04-10T18:00:00.000Z", "maintenance-4")],
  });

  assert.equal(summary.pressure.signal, null);
  assert.equal(summary.maintenance_pressure_count, 0);
});

test("phase 21 maintenance escalation promotes repeated handoff-to-repair patterns into one queue cue", () => {
  const maintenanceWindow = {
    eligible_now: false,
    deferred_reason: "active_repair_pending" as const,
    count: 1,
    top_step_id: "install_wrappers" as const,
    bundle: null,
  };
  const followThrough = buildMaintenanceFollowThroughSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_window: maintenanceWindow,
    repair_plan: {
      steps: [
        {
          id: "install_check",
          title: "Confirm local install health",
          reason: "Install checks still need attention.",
          suggested_command: "personal-ops install check",
          executable: false,
          status: "pending",
          scope: "install",
          blocking: true,
        },
      ],
      first_repair_step: "personal-ops install check",
    },
    recent_repair_executions: [
      maintenanceExecution("install_wrappers", "2026-04-11T18:00:00.000Z", "maintenance-21-1", {
        after_first_step_id: "install_check",
      }),
      maintenanceExecution("install_wrappers", "2026-04-05T18:00:00.000Z", "maintenance-21-2", {
        after_first_step_id: "install_check",
      }),
    ],
  });

  const escalation = buildMaintenanceEscalationSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    state: "ready",
    maintenance_window: maintenanceWindow,
    maintenance_follow_through: followThrough,
    repair_plan: { steps: [] },
    recent_repair_executions: [
      maintenanceExecution("install_wrappers", "2026-04-11T18:00:00.000Z", "maintenance-21-1", {
        after_first_step_id: "install_check",
      }),
      maintenanceExecution("install_wrappers", "2026-04-05T18:00:00.000Z", "maintenance-21-2", {
        after_first_step_id: "install_check",
      }),
    ],
  });

  assert.equal(followThrough.pressure.signal, "handed_off_to_repair");
  assert.equal(escalation.eligible, true);
  assert.equal(escalation.step_id, "install_wrappers");
  assert.equal(escalation.handoff_count_30d, 2);
  assert.equal(escalation.cue?.kind, "maintenance_escalation");
  assert.equal(escalation.cue?.suggested_command, "personal-ops maintenance session");
});

test("phase 21 maintenance escalation ignores ordinary stale bundles", () => {
  const maintenanceWindow = {
    eligible_now: true,
    deferred_reason: null,
    count: 1,
    top_step_id: "install_wrappers" as const,
    bundle: {
      bundle_id: "maintenance-window:install_wrappers",
      title: "Preventive maintenance window",
      summary: "Refresh wrappers in a calm window.",
      recommended_commands: ["personal-ops install wrappers"],
      recommendations: [
        {
          step_id: "install_wrappers" as const,
          title: "Refresh wrappers before the next drift",
          reason: "Wrapper drift has repeated on this machine.",
          suggested_command: "personal-ops install wrappers",
          urgency: "watch" as const,
          last_resolved_at: "2026-04-01T18:00:00.000Z",
          repeat_count_30d: 2,
        },
      ],
    },
  };
  const followThrough = buildMaintenanceFollowThroughSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_window: maintenanceWindow,
    repair_plan: { steps: [], first_repair_step: null },
    recent_repair_executions: [],
  });

  const escalation = buildMaintenanceEscalationSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    state: "ready",
    maintenance_window: maintenanceWindow,
    maintenance_follow_through: followThrough,
    repair_plan: { steps: [] },
    recent_repair_executions: [],
  });

  assert.equal(followThrough.pressure.signal, "stale_bundle");
  assert.equal(escalation.eligible, false);
  assert.equal(escalation.cue, null);
});

test("phase 21 maintenance escalation is suppressed by a recent successful maintenance run or matching active repair", () => {
  const maintenanceWindow = {
    eligible_now: false,
    deferred_reason: "active_repair_pending" as const,
    count: 1,
    top_step_id: "install_wrappers" as const,
    bundle: null,
  };
  const repeatedHandoffs = [
    maintenanceExecution("install_wrappers", "2026-04-11T18:00:00.000Z", "maintenance-21-3", {
      after_first_step_id: "install_check",
    }),
    maintenanceExecution("install_wrappers", "2026-04-05T18:00:00.000Z", "maintenance-21-4", {
      after_first_step_id: "install_check",
    }),
  ];
  const followThrough = buildMaintenanceFollowThroughSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_window: maintenanceWindow,
    repair_plan: { steps: [], first_repair_step: null },
    recent_repair_executions: repeatedHandoffs,
  });

  const recentSuccessSuppressed = buildMaintenanceEscalationSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    state: "ready",
    maintenance_window: maintenanceWindow,
    maintenance_follow_through: followThrough,
    repair_plan: { steps: [] },
    recent_repair_executions: [
      ...repeatedHandoffs,
      maintenanceExecution("install_wrappers", "2026-04-10T18:00:00.000Z", "maintenance-21-5"),
    ],
  });
  const activeRepairSuppressed = buildMaintenanceEscalationSummary({
    generated_at: "2026-04-12T20:00:00.000Z",
    state: "ready",
    maintenance_window: maintenanceWindow,
    maintenance_follow_through: followThrough,
    repair_plan: {
      steps: [
        {
          id: "install_wrappers",
          title: "Refresh wrappers",
          reason: "Wrapper drift is pending again.",
          suggested_command: "personal-ops install wrappers",
          executable: true,
          status: "pending",
          scope: "install",
          blocking: true,
        },
      ],
    },
    recent_repair_executions: repeatedHandoffs,
  });

  assert.equal(recentSuccessSuppressed.eligible, false);
  assert.equal(activeRepairSuppressed.eligible, false);
});

test("phase 22 maintenance scheduling places escalations into now when no urgent concrete work is present", () => {
  const scheduling = buildMaintenanceSchedulingSummary({
    state: "ready",
    worklist_items: [],
    repair_plan: { steps: [] },
    maintenance_window: {
      eligible_now: false,
      deferred_reason: "concrete_work_present",
      count: 0,
      top_step_id: null,
      bundle: null,
    },
    maintenance_escalation: {
      eligible: true,
      step_id: "install_wrappers",
      signal: "handed_off_to_repair",
      summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
      suggested_command: "personal-ops maintenance session",
      handoff_count_30d: 2,
      cue: null,
    },
  });

  assert.equal(scheduling.eligible, true);
  assert.equal(scheduling.placement, "now");
  assert.equal(scheduling.step_id, "install_wrappers");
});

test("phase 22 maintenance scheduling places escalations into prep_day when urgent concrete work is present", () => {
  const scheduling = buildMaintenanceSchedulingSummary({
    state: "ready",
    worklist_items: [
      {
        item_id: "task-22",
        kind: "task_due_soon",
        severity: "warn",
        title: "Urgent task",
        summary: "A real task is due soon.",
        target_type: "task",
        target_id: "task-22",
        created_at: "2026-04-12T20:00:00.000Z",
        suggested_command: "personal-ops task show task-22",
        metadata_json: "{}",
      },
    ],
    repair_plan: { steps: [] },
    maintenance_window: {
      eligible_now: false,
      deferred_reason: "concrete_work_present",
      count: 0,
      top_step_id: null,
      bundle: null,
    },
    maintenance_escalation: {
      eligible: true,
      step_id: "install_wrappers",
      signal: "handed_off_to_repair",
      summary: "This maintenance family keeps turning into active repair and should be treated as repair-priority upkeep.",
      suggested_command: "personal-ops maintenance session",
      handoff_count_30d: 2,
      cue: null,
    },
  });

  assert.equal(scheduling.eligible, true);
  assert.equal(scheduling.placement, "prep_day");
  assert.equal(scheduling.step_id, "install_wrappers");
});

test("phase 22 maintenance scheduling keeps preventive upkeep in calm_window and suppresses matching repair families", () => {
  const maintenanceWindow = {
    eligible_now: true,
    deferred_reason: null,
    count: 1,
    top_step_id: "install_wrappers" as const,
    bundle: {
      bundle_id: "maintenance-window:install_wrappers",
      title: "Preventive maintenance window",
      summary: "Refresh wrappers before the next drift is a good calm-window maintenance task right now.",
      recommended_commands: ["personal-ops install wrappers"],
      recommendations: [
        {
          step_id: "install_wrappers" as const,
          title: "Refresh wrappers before the next drift",
          reason: "Wrapper drift has repeated on this machine.",
          suggested_command: "personal-ops install wrappers",
          urgency: "watch" as const,
          last_resolved_at: "2026-04-06T18:05:00.000Z",
          repeat_count_30d: 2,
        },
      ],
    },
  };

  const calmWindow = buildMaintenanceSchedulingSummary({
    state: "ready",
    worklist_items: [],
    repair_plan: { steps: [] },
    maintenance_window: maintenanceWindow,
    maintenance_escalation: {
      eligible: false,
      step_id: null,
      signal: null,
      summary: null,
      suggested_command: null,
      handoff_count_30d: 0,
      cue: null,
    },
  });
  const suppressed = buildMaintenanceSchedulingSummary({
    state: "ready",
    worklist_items: [],
    repair_plan: {
      steps: [
        {
          id: "install_wrappers",
          title: "Refresh wrappers",
          reason: "Wrapper repair is pending again.",
          suggested_command: "personal-ops install wrappers",
          executable: true,
          status: "pending",
          scope: "install",
          blocking: true,
        },
      ],
    },
    maintenance_window: maintenanceWindow,
    maintenance_escalation: {
      eligible: false,
      step_id: null,
      signal: null,
      summary: null,
      suggested_command: null,
      handoff_count_30d: 0,
      cue: null,
    },
  });

  assert.equal(calmWindow.eligible, true);
  assert.equal(calmWindow.placement, "calm_window");
  assert.equal(suppressed.eligible, false);
  assert.equal(suppressed.placement, "suppressed");
});

test("phase 23 commitment memory creates active commitments only for now and prep_day placements", () => {
  const nowCommitment = deriveMaintenanceCommitmentState({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_scheduling: {
      eligible: true,
      placement: "now",
      step_id: "install_wrappers",
      summary: "Wrappers should be handled in the current operating block.",
      suggested_command: "personal-ops maintenance session",
      reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
      bundle_step_ids: ["install_wrappers"],
    },
    repair_plan: { steps: [] },
    recent_repair_executions: [],
    existing_commitments: [],
  });
  const calmWindowCommitment = deriveMaintenanceCommitmentState({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_scheduling: {
      eligible: true,
      placement: "calm_window",
      step_id: "install_wrappers",
      summary: "Keep this for a calm window.",
      suggested_command: "personal-ops maintenance session",
      reason: "Keep this for a calm window; do not displace active operator work.",
      bundle_step_ids: ["install_wrappers"],
    },
    repair_plan: { steps: [] },
    recent_repair_executions: [],
    existing_commitments: [],
  });

  assert.equal(nowCommitment.maintenance_commitment.active, true);
  assert.equal(nowCommitment.maintenance_commitment.step_id, "install_wrappers");
  assert.equal(calmWindowCommitment.maintenance_commitment.active, false);
  assert.equal(calmWindowCommitment.records.length, 0);
});

test("phase 23 commitment memory increments defer_count only after a fresh resurfacing window", () => {
  const existing = {
    commitment_id: "commitment-23",
    step_id: "install_wrappers" as const,
    created_at: "2026-04-11T06:00:00.000Z",
    updated_at: "2026-04-11T06:00:00.000Z",
    last_presented_at: "2026-04-11T06:00:00.000Z",
    last_placement: "now" as const,
    bundle_step_ids: ["install_wrappers" as const],
    state: "active" as const,
    defer_count: 0,
  };

  const resurfaced = deriveMaintenanceCommitmentState({
    generated_at: "2026-04-12T20:30:00.000Z",
    maintenance_scheduling: {
      eligible: true,
      placement: "now",
      step_id: "install_wrappers",
      summary: "Wrappers should be handled in the current operating block.",
      suggested_command: "personal-ops maintenance session",
      reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
      bundle_step_ids: ["install_wrappers"],
    },
    repair_plan: { steps: [] },
    recent_repair_executions: [],
    existing_commitments: [existing],
  });
  const withinWindow = deriveMaintenanceCommitmentState({
    generated_at: "2026-04-11T12:00:00.000Z",
    maintenance_scheduling: {
      eligible: true,
      placement: "now",
      step_id: "install_wrappers",
      summary: "Wrappers should be handled in the current operating block.",
      suggested_command: "personal-ops maintenance session",
      reason: "This has become repair-priority upkeep and should be handled in the current operating block.",
      bundle_step_ids: ["install_wrappers"],
    },
    repair_plan: { steps: [] },
    recent_repair_executions: [],
    existing_commitments: [existing],
  });

  assert.equal(resurfaced.maintenance_commitment.defer_count, 1);
  assert.equal(resurfaced.maintenance_defer_memory.active, true);
  assert.equal(withinWindow.maintenance_commitment.defer_count, 0);
  assert.equal(withinWindow.maintenance_defer_memory.active, false);
});

test("phase 23 commitment memory records completion and handoff outcomes from maintenance runs", () => {
  const existing = {
    commitment_id: "commitment-23",
    step_id: "install_wrappers" as const,
    created_at: "2026-04-11T06:00:00.000Z",
    updated_at: "2026-04-11T06:00:00.000Z",
    last_presented_at: "2026-04-11T06:00:00.000Z",
    last_placement: "prep_day" as const,
    bundle_step_ids: ["install_wrappers" as const],
    state: "active" as const,
    defer_count: 2,
  };

  const completed = deriveMaintenanceCommitmentState({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_scheduling: {
      eligible: false,
      placement: "suppressed",
      step_id: null,
      summary: null,
      suggested_command: null,
      reason: "Maintenance scheduling is suppressed because no active maintenance timing cue is available.",
      bundle_step_ids: [],
    },
    repair_plan: { steps: [] },
    recent_repair_executions: [
      maintenanceExecution("install_wrappers", "2026-04-12T19:30:00.000Z", "maintenance-complete-1"),
    ],
    existing_commitments: [existing],
  });
  const handedOff = deriveMaintenanceCommitmentState({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_scheduling: {
      eligible: false,
      placement: "suppressed",
      step_id: null,
      summary: null,
      suggested_command: null,
      reason: "Maintenance scheduling is suppressed because no active maintenance timing cue is available.",
      bundle_step_ids: [],
    },
    repair_plan: { steps: [] },
    recent_repair_executions: [
      maintenanceExecution("install_wrappers", "2026-04-12T19:30:00.000Z", "maintenance-handoff-1", {
        after_first_step_id: "doctor",
      }),
    ],
    existing_commitments: [existing],
  });

  assert.equal(completed.maintenance_commitment.state, "completed");
  assert.equal(handedOff.maintenance_commitment.state, "handed_off_to_repair");
});

test("phase 23 commitment memory is superseded by active repair and expires after a week without resurfacing", () => {
  const existing = {
    commitment_id: "commitment-23",
    step_id: "install_wrappers" as const,
    created_at: "2026-04-01T06:00:00.000Z",
    updated_at: "2026-04-01T06:00:00.000Z",
    last_presented_at: "2026-04-01T06:00:00.000Z",
    last_placement: "prep_day" as const,
    bundle_step_ids: ["install_wrappers" as const],
    state: "active" as const,
    defer_count: 1,
  };

  const superseded = deriveMaintenanceCommitmentState({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_scheduling: {
      eligible: false,
      placement: "suppressed",
      step_id: null,
      summary: null,
      suggested_command: null,
      reason: "Maintenance scheduling is suppressed because repair is already pending.",
      bundle_step_ids: [],
    },
    repair_plan: {
      steps: [
        {
          id: "install_wrappers",
          title: "Refresh wrappers",
          reason: "Wrapper repair is pending again.",
          suggested_command: "personal-ops install wrappers",
          executable: true,
          status: "pending",
          scope: "install",
          blocking: true,
        },
      ],
    },
    recent_repair_executions: [],
    existing_commitments: [existing],
  });
  const expired = deriveMaintenanceCommitmentState({
    generated_at: "2026-04-12T20:00:00.000Z",
    maintenance_scheduling: {
      eligible: false,
      placement: "suppressed",
      step_id: null,
      summary: null,
      suggested_command: null,
      reason: "Maintenance scheduling is suppressed because no active maintenance timing cue is available.",
      bundle_step_ids: [],
    },
    repair_plan: { steps: [] },
    recent_repair_executions: [],
    existing_commitments: [existing],
  });

  assert.equal(superseded.maintenance_commitment.state, "superseded_by_repair");
  assert.equal(expired.maintenance_commitment.state, "expired");
});
