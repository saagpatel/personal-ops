import fs from "node:fs";
import path from "node:path";
import { buildInstallCheckReport } from "./install.js";
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

function readLatestSnapshotSummary(paths: Paths): SnapshotSummary | null {
  if (!fs.existsSync(paths.snapshotsDir)) {
    return null;
  }
  const snapshotIds = fs
    .readdirSync(paths.snapshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const snapshotId of snapshotIds) {
    const snapshotDir = path.join(paths.snapshotsDir, snapshotId);
    const manifestPath = path.join(snapshotDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        created_at?: string;
        daemon_state?: SnapshotSummary["daemon_state"];
      };
      return {
        snapshot_id: snapshotId,
        created_at: raw.created_at ?? "",
        path: snapshotDir,
        daemon_state: raw.daemon_state ?? "ready",
      };
    } catch {
      continue;
    }
  }
  return null;
}

function snapshotAgeHours(snapshot: SnapshotSummary | null): number | null {
  if (!snapshot?.created_at) {
    return null;
  }
  const createdAt = Date.parse(snapshot.created_at);
  if (Number.isNaN(createdAt)) {
    return null;
  }
  return (Date.now() - createdAt) / (1000 * 60 * 60);
}

function summarizeSnapshot(snapshot: SnapshotSummary | null, snapshotAgeLimitHours: number | null): DoctorCheck {
  if (!snapshot) {
    return warnCheck(
      "snapshot_freshness",
      "Snapshot freshness",
      "No snapshots were found. Run `personal-ops backup create` to capture a recovery point.",
      "runtime",
    );
  }
  const ageHours = snapshotAgeHours(snapshot);
  if (snapshotAgeLimitHours == null || ageHours == null) {
    return passCheck(
      "snapshot_freshness",
      "Snapshot freshness",
      `Latest snapshot ${snapshot.snapshot_id} is present.`,
      "runtime",
    );
  }
  if (ageHours > snapshotAgeLimitHours) {
    return warnCheck(
      "snapshot_freshness",
      "Snapshot freshness",
      `Latest snapshot ${snapshot.snapshot_id} is ${ageHours.toFixed(1)}h old, beyond the ${snapshotAgeLimitHours}h threshold. Run \`personal-ops backup create\`.`,
      "runtime",
    );
  }
  return passCheck(
    "snapshot_freshness",
    "Snapshot freshness",
    `Latest snapshot ${snapshot.snapshot_id} is ${ageHours.toFixed(1)}h old and within the ${snapshotAgeLimitHours}h threshold.`,
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
  let latestSnapshot = readLatestSnapshotSummary(paths);

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

  const summary = summarizeChecks(checks);
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
    summary,
    checks,
  };
}
