import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildHealthCheckReport } from "../src/health.js";
import { writeRecoveryRehearsalStamp } from "../src/recovery.js";
import type { InstallCheckReport, Paths, SnapshotManifest } from "../src/types.js";

function createPaths(): Paths {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-health-"));
  const configDir = path.join(base, "config");
  const stateDir = path.join(base, "state");
  const logDir = path.join(base, "logs");
  const appDir = path.join(base, "app");
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });
  return {
    configDir,
    stateDir,
    logDir,
    appDir,
    snapshotsDir: path.join(stateDir, "snapshots"),
    machineIdentityFile: path.join(stateDir, "machine-identity.json"),
    restoreProvenanceFile: path.join(stateDir, "restore-provenance.json"),
    recoveryRehearsalFile: path.join(stateDir, "recovery-rehearsal.json"),
    configFile: path.join(configDir, "config.toml"),
    policyFile: path.join(configDir, "policy.toml"),
    oauthClientFile: path.join(configDir, "gmail-oauth-client.json"),
    apiTokenFile: path.join(stateDir, "local-api-token"),
    assistantApiTokenFile: path.join(stateDir, "assistant-api-token"),
    databaseFile: path.join(stateDir, "personal-ops.db"),
    appLogFile: path.join(logDir, "app.jsonl"),
    installManifestFile: path.join(stateDir, "install-manifest.json"),
  };
}

function readyInstallCheck(): InstallCheckReport {
  return {
    generated_at: new Date().toISOString(),
    state: "ready",
    summary: { pass: 1, warn: 0, fail: 0 },
    checks: [],
    manifest: null,
    repair_plan_summary: {
      first_step_id: null,
      first_repair_step: null,
      step_count: 0,
      last_step_id: null,
      last_outcome: null,
      top_recurring_step_id: null,
      preventive_maintenance_count: 0,
      top_preventive_step_id: null,
      last_maintenance_outcome: null,
      last_maintenance_step_id: null,
      maintenance_pressure_count: 0,
      top_maintenance_pressure_step_id: null,
      maintenance_follow_through: {
        generated_at: new Date().toISOString(),
        last_maintenance_outcome: null,
        last_maintenance_step_id: null,
        top_signal: null,
        current_bundle_outcome: null,
        maintenance_pressure_count: 0,
        top_maintenance_pressure_step_id: null,
        pressure: {
          signal: null,
          count: 0,
          top_step_id: null,
          summary: null,
          suggested_command: null,
        },
        summary: null,
      },
      maintenance_window: {
        eligible_now: false,
        deferred_reason: "no_preventive_work",
        count: 0,
        top_step_id: null,
        bundle: null,
      },
      last_repair: null,
      recurring_issue: null,
    },
  };
}

function writeSnapshot(paths: Paths, snapshotId: string, createdAt: string): void {
  const snapshotDir = path.join(paths.snapshotsDir, snapshotId);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const manifest: SnapshotManifest = {
    snapshot_id: snapshotId,
    created_at: createdAt,
    service_version: "0.1.0",
    schema_version: 14,
    backup_intent: "recovery",
    mailbox: null,
    db_backup_path: path.join(snapshotDir, "personal-ops.db"),
    config_paths: [path.join(snapshotDir, "config.toml"), path.join(snapshotDir, "policy.toml")],
    log_paths: [path.join(snapshotDir, "app.jsonl")],
    daemon_state: "ready",
    notes: [],
  };
  fs.writeFileSync(manifest.db_backup_path, "", "utf8");
  for (const configPath of manifest.config_paths) {
    fs.writeFileSync(configPath, "", "utf8");
  }
  for (const logPath of manifest.log_paths) {
    fs.writeFileSync(logPath, "", "utf8");
  }
  fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

function localDaysAgo(days: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

test("health check fails cleanly when no recovery snapshot exists", async () => {
  const paths = createPaths();
  const requestJson = async <T>(method: string, pathname: string): Promise<T> => {
    if (method === "GET" && pathname === "/v1/status") {
      return { status: { daemon_reachable: true, snapshot_latest: null } } as T;
    }
    if (method === "GET" && pathname === "/v1/doctor") {
      return { doctor: { state: "ready", deep: false, summary: { pass: 1, warn: 0, fail: 0 }, checks: [] } } as T;
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  };
  const report = await buildHealthCheckReport(
    paths,
    requestJson,
    { deep: false, snapshotAgeLimitHours: 24 },
    { buildInstallCheckReportImpl: readyInstallCheck },
  );

  assert.equal(report.state, "degraded");
  assert.equal(report.latest_snapshot_id, null);
  assert.equal(report.next_repair_step, "personal-ops backup create");
  assert.equal(report.repair_plan.first_step_id, "backup_create");
  assert.equal(report.checks.some((check) => check.id === "snapshot_freshness" && check.severity === "fail"), true);
  assert.equal(report.checks.some((check) => check.id === "recovery_rehearsal_freshness" && check.severity === "warn"), true);
});

test("health check reports prune backlog and stale recovery rehearsal", async () => {
  const paths = createPaths();
  const requestJson = async <T>(method: string, pathname: string): Promise<T> => {
    if (method === "GET" && pathname === "/v1/status") {
      return { status: { daemon_reachable: true, snapshot_latest: null } } as T;
    }
    if (method === "GET" && pathname === "/v1/doctor") {
      return { doctor: { state: "ready", deep: false, summary: { pass: 1, warn: 0, fail: 0 }, checks: [] } } as T;
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  };
  writeSnapshot(paths, "2026-03-29T18-00-00Z", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
  writeSnapshot(paths, "2026-03-27T18-00-00Z", localDaysAgo(2, 18));
  writeSnapshot(paths, "2026-03-27T08-00-00Z", localDaysAgo(2, 8));
  writeRecoveryRehearsalStamp(paths, {
    successful_at: localDaysAgo(16, 9),
    app_version: "0.1.0",
    command_name: "npm run verify:recovery",
  });

  const report = await buildHealthCheckReport(
    paths,
    requestJson,
    { deep: false, snapshotAgeLimitHours: 24 },
    { buildInstallCheckReportImpl: readyInstallCheck },
  );

  assert.equal(report.state, "attention_needed");
  assert.equal(report.prune_candidate_count, 1);
  assert.ok(report.recovery_rehearsal_age_hours && report.recovery_rehearsal_age_hours > 14 * 24);
  assert.equal(report.next_repair_step, "personal-ops backup prune --dry-run");
  assert.equal(report.repair_plan.first_step_id, "backup_prune");
  assert.equal(report.checks.some((check) => check.id === "snapshot_retention_pressure" && check.severity === "warn"), true);
  assert.equal(report.checks.some((check) => check.id === "recovery_rehearsal_freshness" && check.severity === "warn"), true);
});
