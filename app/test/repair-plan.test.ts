import assert from "node:assert/strict";
import test from "node:test";
import { buildRepairPlan } from "../src/repair-plan.js";
import type { DoctorCheck } from "../src/types.js";

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
