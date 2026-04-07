import assert from "node:assert/strict";
import test from "node:test";
import { buildRepairPlan } from "../src/repair-plan.js";
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
