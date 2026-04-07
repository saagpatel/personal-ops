import { buildInstallCheckReport } from "./install.js";
import {
  getLatestSnapshotSummary,
  pruneSnapshots,
  readRecoveryRehearsalStamp,
  recoveryRehearsalAgeHours,
  snapshotAgeHours,
  RECOVERY_REHEARSAL_WARN_HOURS,
  SNAPSHOT_FAIL_HOURS,
  SNAPSHOT_WARN_HOURS,
} from "./recovery.js";
import { buildRepairPlan } from "./repair-plan.js";
import type {
  DoctorCheck,
  DoctorReport,
  HealthCheckReport,
  Paths,
  ServiceStatusReport,
  SnapshotSummary,
} from "./types.js";

interface JsonRequester {
  <T>(method: string, pathname: string, body?: unknown): Promise<T>;
}

interface BuildHealthCheckOptions {
  deep: boolean;
  snapshotAgeLimitHours: number | null;
}

interface BuildHealthCheckDependencies {
  buildInstallCheckReportImpl?: typeof buildInstallCheckReport;
}

function summarizeChecks(checks: DoctorCheck[]) {
  return checks.reduce(
    (accumulator, check) => {
      accumulator[check.severity] += 1;
      return accumulator;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
}

function classifyHealthState(checks: DoctorCheck[]): HealthCheckReport["state"] {
  if (checks.some((check) => check.severity === "fail")) {
    return "degraded";
  }
  return checks.some((check) => check.severity === "warn") ? "attention_needed" : "ready";
}

function passCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
  return { id, title, severity: "pass", message, category };
}

function warnCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
  return { id, title, severity: "warn", message, category };
}

function failCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
  return { id, title, severity: "fail", message, category };
}

function formatSummary(summary: { pass: number; warn: number; fail: number }): string {
  return `${summary.pass} pass / ${summary.warn} warn / ${summary.fail} fail`;
}

function summarizeInstallCheck(state: HealthCheckReport["install_check_state"], summary: { pass: number; warn: number; fail: number }) {
  if (state === "ready" && summary.warn === 0 && summary.fail === 0) {
    return passCheck("install_health_ready", "Install check", `Local install checks are healthy (${formatSummary(summary)}).`, "setup");
  }
  if (state === "degraded" || summary.fail > 0) {
    return failCheck(
      "install_health_ready",
      "Install check",
      `Local install checks need repair (${formatSummary(summary)}). Run \`personal-ops install check\`.`,
      "setup",
    );
  }
  return warnCheck(
    "install_health_ready",
    "Install check",
    `Local install checks need attention (${formatSummary(summary)}). Run \`personal-ops install check\`.`,
    "setup",
  );
}

function summarizeDoctor(report: DoctorReport): DoctorCheck {
  if (report.state === "ready" && report.summary.warn === 0 && report.summary.fail === 0) {
    return passCheck(
      "doctor_health_ready",
      report.deep ? "Deep doctor" : "Doctor",
      `${report.deep ? "Deep doctor" : "Doctor"} is healthy (${formatSummary(report.summary)}).`,
      "runtime",
    );
  }
  if (report.state === "degraded" || report.summary.fail > 0) {
    return failCheck(
      "doctor_health_ready",
      report.deep ? "Deep doctor" : "Doctor",
      `${report.deep ? "Deep doctor" : "Doctor"} found issues (${formatSummary(report.summary)}).`,
      "runtime",
    );
  }
  return warnCheck(
    "doctor_health_ready",
    report.deep ? "Deep doctor" : "Doctor",
    `${report.deep ? "Deep doctor" : "Doctor"} needs attention (${formatSummary(report.summary)}).`,
    "runtime",
  );
}

function summarizeSnapshot(snapshot: SnapshotSummary | null, snapshotAgeLimitHours: number | null): DoctorCheck {
  const thresholdHours = snapshotAgeLimitHours ?? SNAPSHOT_WARN_HOURS;
  if (!snapshot) {
    return failCheck(
      "snapshot_freshness",
      "Snapshot freshness",
      "No snapshots were found. Run `personal-ops backup create` to capture a recovery point.",
      "runtime",
    );
  }
  const ageHours = snapshotAgeHours(snapshot);
  if (ageHours == null) {
    return warnCheck(
      "snapshot_freshness",
      "Snapshot freshness",
      `Latest snapshot ${snapshot.snapshot_id} is present, but its timestamp could not be interpreted. Create a fresh recovery point.`,
      "runtime",
    );
  }
  if (ageHours > SNAPSHOT_FAIL_HOURS) {
    return failCheck(
      "snapshot_freshness",
      "Snapshot freshness",
      `Latest snapshot ${snapshot.snapshot_id} is ${ageHours.toFixed(1)}h old, beyond the ${SNAPSHOT_FAIL_HOURS}h recovery limit. Run \`personal-ops backup create\`.`,
      "runtime",
    );
  }
  if (thresholdHours < ageHours) {
    return warnCheck(
      "snapshot_freshness",
      "Snapshot freshness",
      `Latest snapshot ${snapshot.snapshot_id} is ${ageHours.toFixed(1)}h old, beyond the ${thresholdHours}h target. Run \`personal-ops backup create\`.`,
      "runtime",
    );
  }
  return passCheck(
    "snapshot_freshness",
    "Snapshot freshness",
    `Latest snapshot ${snapshot.snapshot_id} is ${ageHours.toFixed(1)}h old and within the ${thresholdHours}h target.`,
    "runtime",
  );
}

function summarizePrunePressure(paths: Paths): DoctorCheck {
  const prune = pruneSnapshots(paths, { dryRun: true });
  if (prune.prune_candidates > 0) {
    return warnCheck(
      "snapshot_retention_pressure",
      "Snapshot retention",
      `${prune.prune_candidates} snapshot${prune.prune_candidates === 1 ? "" : "s"} can be pruned under the retention policy. Run \`personal-ops backup prune --dry-run\`, then \`personal-ops backup prune --yes\`.`,
      "runtime",
    );
  }
  return passCheck(
    "snapshot_retention_pressure",
    "Snapshot retention",
    "Snapshot retention is within policy and no prune backlog is waiting.",
    "runtime",
  );
}

function summarizeRecoveryRehearsal(paths: Paths): DoctorCheck {
  const rehearsal = readRecoveryRehearsalStamp(paths);
  if (rehearsal.status === "invalid") {
    return warnCheck("recovery_rehearsal_freshness", "Recovery rehearsal", rehearsal.message, "runtime");
  }
  if (rehearsal.status === "missing" || !rehearsal.stamp) {
    return warnCheck(
      "recovery_rehearsal_freshness",
      "Recovery rehearsal",
      "No successful recovery rehearsal is recorded. Run `cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery`.",
      "runtime",
    );
  }
  const ageHours = recoveryRehearsalAgeHours(rehearsal.stamp);
  if (ageHours == null) {
    return warnCheck(
      "recovery_rehearsal_freshness",
      "Recovery rehearsal",
      "Recovery rehearsal history exists, but its timestamp could not be read. Rerun `npm run verify:recovery`.",
      "runtime",
    );
  }
  if (ageHours > RECOVERY_REHEARSAL_WARN_HOURS) {
    return warnCheck(
      "recovery_rehearsal_freshness",
      "Recovery rehearsal",
      `Last successful recovery rehearsal was ${ageHours.toFixed(1)}h ago. Run \`cd /Users/d/.local/share/personal-ops/app && npm run verify:recovery\`.`,
      "runtime",
    );
  }
  return passCheck(
    "recovery_rehearsal_freshness",
    "Recovery rehearsal",
    `Last successful recovery rehearsal was ${ageHours.toFixed(1)}h ago via ${rehearsal.stamp.command_name}.`,
    "runtime",
  );
}

export async function buildHealthCheckReport(
  paths: Paths,
  requestJson: JsonRequester,
  options: BuildHealthCheckOptions,
  dependencies: BuildHealthCheckDependencies = {},
): Promise<HealthCheckReport> {
  const checks: DoctorCheck[] = [];
  const installCheck = (dependencies.buildInstallCheckReportImpl ?? buildInstallCheckReport)(paths);
  checks.push(summarizeInstallCheck(installCheck.state, installCheck.summary));

  let daemonReachable = false;
  let doctorState: DoctorReport["state"] | null = null;
  let doctorReport: Pick<DoctorReport, "checks" | "state" | "deep"> | null = null;
  let latestSnapshot = getLatestSnapshotSummary(paths);

  try {
    const statusResponse = await requestJson<{ status: ServiceStatusReport }>("GET", "/v1/status");
    const status = statusResponse.status;
    daemonReachable = status.daemon_reachable;
    latestSnapshot = status.snapshot_latest ?? latestSnapshot;
    checks.push(
      status.daemon_reachable
        ? passCheck("daemon_runtime_ready", "Daemon runtime", "Daemon is reachable and serving the local API.", "runtime")
        : failCheck("daemon_runtime_ready", "Daemon runtime", "Daemon did not report as reachable.", "runtime"),
    );
  } catch (error) {
    checks.push(
      failCheck(
        "daemon_runtime_ready",
        "Daemon runtime",
        error instanceof Error ? error.message : "Could not reach the local daemon.",
        "runtime",
      ),
    );
  }

  if (daemonReachable) {
    try {
      const query = options.deep ? "?deep=true" : "";
      const doctorResponse = await requestJson<{ doctor: DoctorReport }>("GET", `/v1/doctor${query}`);
      doctorState = doctorResponse.doctor.state;
      doctorReport = {
        checks: doctorResponse.doctor.checks,
        state: doctorResponse.doctor.state,
        deep: doctorResponse.doctor.deep,
      };
      checks.push(summarizeDoctor(doctorResponse.doctor));
    } catch (error) {
      checks.push(
        failCheck(
          "doctor_health_ready",
          options.deep ? "Deep doctor" : "Doctor",
          error instanceof Error ? error.message : "Doctor request failed.",
          "runtime",
        ),
      );
    }
  } else {
    checks.push(
      warnCheck(
        "doctor_health_ready",
        options.deep ? "Deep doctor" : "Doctor",
        "Doctor check was skipped because the daemon is not reachable yet.",
        "runtime",
      ),
    );
  }

  checks.push(summarizeSnapshot(latestSnapshot, options.snapshotAgeLimitHours));
  checks.push(summarizePrunePressure(paths));
  checks.push(summarizeRecoveryRehearsal(paths));

  const summary = summarizeChecks(checks);
  const prune = pruneSnapshots(paths, { dryRun: true });
  const recoveryRehearsal = readRecoveryRehearsalStamp(paths);
  const repairPlan = buildRepairPlan({
    install_check: installCheck,
    doctor: doctorReport,
    latest_snapshot_id: latestSnapshot?.snapshot_id ?? null,
    latest_snapshot_age_hours: snapshotAgeHours(latestSnapshot),
    snapshot_age_limit_hours: options.snapshotAgeLimitHours ?? SNAPSHOT_WARN_HOURS,
    prune_candidate_count: prune.prune_candidates,
    recovery_rehearsal_missing: recoveryRehearsal.status !== "configured" || !recoveryRehearsal.stamp,
  });
  return {
    generated_at: new Date().toISOString(),
    state: classifyHealthState(checks),
    deep: options.deep,
    snapshot_age_limit_hours: options.snapshotAgeLimitHours,
    install_check_state: installCheck.state,
    daemon_reachable: daemonReachable,
    doctor_state: doctorState,
    latest_snapshot_age_hours: snapshotAgeHours(latestSnapshot),
    latest_snapshot_id: latestSnapshot?.snapshot_id ?? null,
    prune_candidate_count: prune.prune_candidates,
    last_recovery_rehearsal_at: recoveryRehearsal.stamp?.successful_at ?? null,
    recovery_rehearsal_age_hours: recoveryRehearsalAgeHours(recoveryRehearsal.stamp),
    next_repair_step: repairPlan.first_repair_step,
    repair_plan: repairPlan,
    summary,
    checks,
  };
}
