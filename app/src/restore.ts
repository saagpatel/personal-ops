import fs from "node:fs";
import path from "node:path";
import { CURRENT_SCHEMA_VERSION } from "./db.js";
import { readSnapshotManifest } from "./recovery.js";
import { createSnapshotId } from "./snapshots.js";
import {
  ensureMachineIdentity,
  machineDescriptorFromIdentity,
  writeRestoreProvenance,
} from "./machine.js";
import {
  getLaunchAgentLabel,
  getLaunchAgentPlistPath,
  inspectLaunchAgent,
  startLaunchAgent,
  stopLaunchAgent,
} from "./launchagent.js";
import { readServiceVersion } from "./version.js";
import { Paths, RestoreMode, RestoreResult, ServiceState, SnapshotManifest } from "./types.js";

interface RestoreDependencies {
  launchAgentDependencies?: Parameters<typeof inspectLaunchAgent>[2];
}

function removeDatabaseSidecars(databaseFile: string): void {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    fs.rmSync(`${databaseFile}${suffix}`, { force: true });
  }
}

async function createLocalSnapshot(paths: Paths, daemonState: ServiceState, notes: string[] = []): Promise<SnapshotManifest> {
  const snapshotId = createSnapshotId(paths.snapshotsDir);
  const snapshotDir = path.join(paths.snapshotsDir, snapshotId);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const machineIdentity = ensureMachineIdentity(paths);

  const dbBackupPath = path.join(snapshotDir, "personal-ops.db");
  if (fs.existsSync(paths.databaseFile)) {
    fs.copyFileSync(paths.databaseFile, dbBackupPath);
  } else {
    notes.push("Live database was missing when the rescue snapshot was created.");
  }

  const configCopy = path.join(snapshotDir, "config.toml");
  const policyCopy = path.join(snapshotDir, "policy.toml");
  const logCopy = path.join(snapshotDir, "app.jsonl");

  if (fs.existsSync(paths.configFile)) {
    fs.copyFileSync(paths.configFile, configCopy);
  } else {
    notes.push("Live config.toml was missing when the rescue snapshot was created.");
  }
  if (fs.existsSync(paths.policyFile)) {
    fs.copyFileSync(paths.policyFile, policyCopy);
  } else {
    notes.push("Live policy.toml was missing when the rescue snapshot was created.");
  }
  if (fs.existsSync(paths.appLogFile)) {
    fs.copyFileSync(paths.appLogFile, logCopy);
  } else {
    fs.writeFileSync(logCopy, "", "utf8");
  }

  const manifest: SnapshotManifest = {
    snapshot_id: snapshotId,
    created_at: new Date().toISOString(),
    service_version: readServiceVersion(paths.appDir),
    schema_version: CURRENT_SCHEMA_VERSION,
    backup_intent: "recovery",
    source_machine: machineDescriptorFromIdentity(machineIdentity),
    mailbox: null,
    db_backup_path: dbBackupPath,
    config_paths: [configCopy, policyCopy],
    log_paths: [logCopy],
    daemon_state: daemonState,
    notes,
  };
  fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

function findSnapshotConfigPath(manifest: SnapshotManifest, fileName: "config.toml" | "policy.toml"): string {
  const match = manifest.config_paths.find((filePath) => path.basename(filePath) === fileName);
  if (!match || !fs.existsSync(match)) {
    throw new Error(`Snapshot ${manifest.snapshot_id} is missing ${fileName}.`);
  }
  return match;
}

export async function restoreSnapshot(
  paths: Paths,
  snapshotId: string,
  options: { confirm: boolean; withConfig: boolean; withPolicy: boolean; allowCrossMachine?: boolean },
  dependencies: RestoreDependencies = {},
): Promise<RestoreResult> {
  if (!options.confirm) {
    throw new Error("Restore requires --yes.");
  }

  const manifest = readSnapshotManifest(paths, snapshotId);
  if (!manifest) {
    throw new Error(`Snapshot ${snapshotId} was not found.`);
  }
  if (!fs.existsSync(manifest.db_backup_path)) {
    throw new Error(`Snapshot ${snapshotId} is missing its database backup.`);
  }
  const localMachine = machineDescriptorFromIdentity(ensureMachineIdentity(paths));
  let restoreMode: RestoreMode = "legacy_unknown";
  let crossMachine = false;
  let provenanceWarning: string | null = null;
  if (!manifest.source_machine) {
    provenanceWarning =
      "Snapshot provenance is unknown because it predates Phase 7. Restore is allowed for compatibility, but treat it as intentional migration or recovery only.";
  } else if (manifest.source_machine.machine_id === localMachine.machine_id) {
    restoreMode = "same_machine";
  } else {
    restoreMode = "cross_machine";
    crossMachine = true;
    provenanceWarning =
      `Snapshot came from ${manifest.source_machine.machine_label}. Restore replaces local state; it does not merge state. Rerun local auth after restore.`;
    if (!options.allowCrossMachine) {
      throw new Error(
        `Snapshot ${snapshotId} came from ${manifest.source_machine.machine_label}. Re-run restore with --allow-cross-machine to confirm intentional migration or recovery.`,
      );
    }
  }

  const launchAgentPath = getLaunchAgentPlistPath();
  const launchAgentLabel = getLaunchAgentLabel();
  const launchAgent = inspectLaunchAgent(
    launchAgentPath,
    launchAgentLabel,
    dependencies.launchAgentDependencies,
  );
  if (launchAgent.loaded) {
    stopLaunchAgent(launchAgentPath, dependencies.launchAgentDependencies);
  }

  const rescue = await createLocalSnapshot(paths, "degraded", [
    `Rescue snapshot created before restoring snapshot ${snapshotId}.`,
  ]);

  fs.mkdirSync(path.dirname(paths.databaseFile), { recursive: true });
  removeDatabaseSidecars(paths.databaseFile);
  fs.rmSync(paths.databaseFile, { force: true });
  fs.copyFileSync(manifest.db_backup_path, paths.databaseFile);
  removeDatabaseSidecars(paths.databaseFile);

  if (options.withConfig) {
    fs.copyFileSync(findSnapshotConfigPath(manifest, "config.toml"), paths.configFile);
  }
  if (options.withPolicy) {
    fs.copyFileSync(findSnapshotConfigPath(manifest, "policy.toml"), paths.policyFile);
  }

  let launchAgentRestarted = false;
  if (launchAgent.loaded) {
    startLaunchAgent(launchAgentPath, launchAgentLabel, dependencies.launchAgentDependencies);
    launchAgentRestarted = true;
  }
  writeRestoreProvenance(paths, {
    restored_at: new Date().toISOString(),
    restored_snapshot_id: snapshotId,
    local_machine_id: localMachine.machine_id,
    local_machine_label: localMachine.machine_label,
    source_machine_id: manifest.source_machine?.machine_id ?? null,
    source_machine_label: manifest.source_machine?.machine_label ?? null,
    source_hostname: manifest.source_machine?.hostname ?? null,
    cross_machine: crossMachine,
    snapshot_created_at: manifest.created_at,
  });

  return {
    restored_snapshot_id: snapshotId,
    rescue_snapshot_id: rescue.snapshot_id,
    restored_database_path: paths.databaseFile,
    restored_config: options.withConfig,
    restored_policy: options.withPolicy,
    launch_agent_was_running: launchAgent.loaded,
    launch_agent_restarted: launchAgentRestarted,
    restore_mode: restoreMode,
    cross_machine: crossMachine,
    source_machine: manifest.source_machine ?? null,
    local_machine: localMachine,
    provenance_warning: provenanceWarning,
  };
}
