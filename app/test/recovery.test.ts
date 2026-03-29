import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pruneSnapshots, readRecoveryRehearsalStamp, writeRecoveryRehearsalStamp } from "../src/recovery.js";
import type { Paths, SnapshotManifest } from "../src/types.js";

function createPaths(): Paths {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-recovery-"));
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

function writeSnapshot(paths: Paths, manifest: SnapshotManifest): void {
  const snapshotDir = path.join(paths.snapshotsDir, manifest.snapshot_id);
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(manifest.db_backup_path, "", "utf8");
  for (const configPath of manifest.config_paths) {
    fs.writeFileSync(configPath, "", "utf8");
  }
  for (const logPath of manifest.log_paths) {
    fs.writeFileSync(logPath, "", "utf8");
  }
  fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

function buildManifest(paths: Paths, snapshotId: string, createdAt: string): SnapshotManifest {
  const snapshotDir = path.join(paths.snapshotsDir, snapshotId);
  return {
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
}

test("snapshot prune applies the 24h, daily, weekly, and 8-week retention buckets", () => {
  const paths = createPaths();
  const now = new Date("2026-03-29T20:00:00.000Z");

  writeSnapshot(paths, buildManifest(paths, "2026-03-29T19-00-00Z", "2026-03-29T19:00:00.000Z"));
  writeSnapshot(paths, buildManifest(paths, "2026-03-29T01-00-00Z", "2026-03-29T01:00:00.000Z"));
  writeSnapshot(paths, buildManifest(paths, "2026-03-27T18-00-00Z", "2026-03-27T18:00:00.000Z"));
  writeSnapshot(paths, buildManifest(paths, "2026-03-27T08-00-00Z", "2026-03-27T08:00:00.000Z"));
  writeSnapshot(paths, buildManifest(paths, "2026-03-10T18-00-00Z", "2026-03-10T18:00:00.000Z"));
  writeSnapshot(paths, buildManifest(paths, "2026-03-10T08-00-00Z", "2026-03-10T08:00:00.000Z"));
  writeSnapshot(paths, buildManifest(paths, "2026-01-10T08-00-00Z", "2026-01-10T08:00:00.000Z"));

  const result = pruneSnapshots(paths, { dryRun: true, now });

  assert.equal(result.newest_snapshot_id, "2026-03-29T19-00-00Z");
  assert.equal(result.total_snapshots, 7);
  assert.equal(result.snapshots_kept, 4);
  assert.equal(result.prune_candidates, 3);
  assert.deepEqual(
    result.prune_candidate_items.map((item) => item.snapshot_id).sort(),
    ["2026-01-10T08-00-00Z", "2026-03-10T08-00-00Z", "2026-03-27T08-00-00Z"],
  );
  assert.equal(result.prune_candidate_items.some((item) => item.snapshot_id === result.newest_snapshot_id), false);
});

test("snapshot prune only deletes candidates when --yes behavior is requested", () => {
  const paths = createPaths();
  const now = new Date("2026-03-29T20:00:00.000Z");

  writeSnapshot(paths, buildManifest(paths, "2026-03-29T19-00-00Z", "2026-03-29T19:00:00.000Z"));
  writeSnapshot(paths, buildManifest(paths, "2026-03-27T18-00-00Z", "2026-03-27T18:00:00.000Z"));
  writeSnapshot(paths, buildManifest(paths, "2026-03-27T08-00-00Z", "2026-03-27T08:00:00.000Z"));

  const preview = pruneSnapshots(paths, { dryRun: true, now });
  assert.equal(preview.snapshots_deleted, 0);
  assert.equal(fs.existsSync(path.join(paths.snapshotsDir, "2026-03-27T08-00-00Z")), true);

  const applied = pruneSnapshots(paths, { dryRun: false, now });
  assert.equal(applied.snapshots_deleted, 1);
  assert.deepEqual(applied.deleted_snapshot_ids, ["2026-03-27T08-00-00Z"]);
  assert.equal(fs.existsSync(path.join(paths.snapshotsDir, "2026-03-27T08-00-00Z")), false);
});

test("recovery rehearsal stamps round-trip through local state", () => {
  const paths = createPaths();
  writeRecoveryRehearsalStamp(paths, {
    successful_at: "2026-03-29T10:00:00.000Z",
    app_version: "0.1.0",
    command_name: "npm run verify:recovery",
  });

  const stamp = readRecoveryRehearsalStamp(paths);
  assert.equal(stamp.status, "configured");
  assert.equal(stamp.stamp?.command_name, "npm run verify:recovery");
  assert.equal(stamp.stamp?.successful_at, "2026-03-29T10:00:00.000Z");
});
