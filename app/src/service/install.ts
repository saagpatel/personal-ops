import fs from "node:fs";
import path from "node:path";
import { ensureMachineIdentity, machineDescriptorFromIdentity } from "../machine.js";
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
  if (!fs.existsSync(service.paths.snapshotsDir)) {
    return [];
  }
  return fs
    .readdirSync(service.paths.snapshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => service.readSnapshotManifest(entry.name))
    .filter((manifest): manifest is SnapshotManifest => Boolean(manifest))
    .sort((a, b) => b.snapshot_id.localeCompare(a.snapshot_id))
    .map((manifest) => ({
      snapshot_id: manifest.snapshot_id,
      created_at: manifest.created_at,
      path: path.join(service.paths.snapshotsDir, manifest.snapshot_id),
      daemon_state: manifest.daemon_state,
    }));
}

export function inspectSnapshot(service: any, snapshotId: string): SnapshotInspection {
  const manifest = service.readSnapshotManifest(snapshotId);
  if (!manifest) {
    throw new Error(`Snapshot ${snapshotId} was not found.`);
  }
  const trackedPaths = [manifest.db_backup_path, ...manifest.config_paths, ...manifest.log_paths];
  const files = trackedPaths.map((filePath) => {
    const exists = fs.existsSync(filePath);
    const sizeBytes = exists ? fs.statSync(filePath).size : 0;
    return {
      path: filePath,
      exists,
      size_bytes: sizeBytes,
    };
  });
  const warnings = [...manifest.notes];
  if (manifest.daemon_state !== "ready") {
    warnings.push(`Snapshot ${snapshotId} was created while service state was ${manifest.daemon_state}.`);
  }
  if (!manifest.source_machine) {
    warnings.push(`Snapshot ${snapshotId} does not include machine provenance because it predates Phase 7.`);
  }
  return {
    manifest,
    files,
    warnings,
  };
}
