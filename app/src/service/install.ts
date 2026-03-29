import fs from "node:fs";
import path from "node:path";
import { ensureMachineIdentity, machineDescriptorFromIdentity } from "../machine.js";
import { inspectSnapshot as inspectSnapshotFromPaths, listSnapshotSummaries } from "../recovery.js";
import { createSnapshotId } from "../snapshots.js";
import type { SnapshotInspection, SnapshotManifest, SnapshotSummary } from "../types.js";

export async function createSnapshot(service: any, stateOverride?: any): Promise<SnapshotManifest> {
  const snapshotId = createSnapshotId(service.paths.snapshotsDir);
  const snapshotDir = path.join(service.paths.snapshotsDir, snapshotId);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const dbBackupPath = path.join(snapshotDir, "personal-ops.db");
  await service.db.createBackup(dbBackupPath);

  const configCopy = path.join(snapshotDir, "config.toml");
  const policyCopy = path.join(snapshotDir, "policy.toml");
  const logCopy = path.join(snapshotDir, "app.jsonl");
  fs.copyFileSync(service.paths.configFile, configCopy);
  fs.copyFileSync(service.paths.policyFile, policyCopy);
  if (fs.existsSync(service.paths.appLogFile)) {
    fs.copyFileSync(service.paths.appLogFile, logCopy);
  } else {
    fs.writeFileSync(logCopy, "", "utf8");
  }

  const mailAccount = service.db.getMailAccount();
  const daemonState = stateOverride ?? "ready";
  const notes = daemonState === "ready" ? [] : [`Snapshot created while service state was ${daemonState}.`];
  const machineIdentity = ensureMachineIdentity(service.paths);
  const manifest: SnapshotManifest = {
    snapshot_id: snapshotId,
    created_at: new Date().toISOString(),
    service_version: service.getServiceVersion(),
    schema_version: service.db.getSchemaVersion(),
    backup_intent: "recovery",
    source_machine: machineDescriptorFromIdentity(machineIdentity),
    mailbox: mailAccount?.email ?? null,
    db_backup_path: dbBackupPath,
    config_paths: [configCopy, policyCopy],
    log_paths: [logCopy],
    daemon_state: daemonState,
    notes,
  };
  fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  service.db.recordAuditEvent({
    client_id: "operator-cli",
    action: "snapshot_create",
    target_type: "snapshot",
    target_id: snapshotId,
    outcome: "success",
    metadata: {
      path: snapshotDir,
      daemon_state: daemonState,
    },
  });
  return manifest;
}

export function listSnapshots(service: any): SnapshotSummary[] {
  return listSnapshotSummaries(service.paths);
}

export function inspectSnapshot(service: any, snapshotId: string): SnapshotInspection {
  return inspectSnapshotFromPaths(service.paths, snapshotId);
}
