import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MachineDescriptor,
  MachineIdentity,
  MachineStateOrigin,
  Paths,
  RestoreProvenance,
} from "./types.js";

type ReadStatus = "configured" | "missing" | "invalid";

interface MachineIdentityReadResult {
  status: ReadStatus;
  identity: MachineIdentity | null;
  message: string;
}

interface RestoreProvenanceReadResult {
  status: ReadStatus;
  provenance: RestoreProvenance | null;
  message: string;
}

function hostname(): string {
  return os.hostname().trim() || "unknown-host";
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseMachineIdentity(value: unknown): MachineIdentity | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.machine_id) ||
    !isNonEmptyString(candidate.machine_label) ||
    !isNonEmptyString(candidate.hostname) ||
    !isNonEmptyString(candidate.initialized_at) ||
    !isNonEmptyString(candidate.app_dir)
  ) {
    return null;
  }
  return {
    machine_id: candidate.machine_id,
    machine_label: candidate.machine_label,
    hostname: candidate.hostname,
    initialized_at: candidate.initialized_at,
    app_dir: candidate.app_dir,
  };
}

function parseRestoreProvenance(value: unknown): RestoreProvenance | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.restored_at) ||
    !isNonEmptyString(candidate.restored_snapshot_id) ||
    !isNonEmptyString(candidate.local_machine_id) ||
    !isNonEmptyString(candidate.local_machine_label) ||
    typeof candidate.cross_machine !== "boolean" ||
    !isNonEmptyString(candidate.snapshot_created_at)
  ) {
    return null;
  }
  if (
    candidate.source_machine_id !== null &&
    candidate.source_machine_id !== undefined &&
    !isNonEmptyString(candidate.source_machine_id)
  ) {
    return null;
  }
  if (
    candidate.source_machine_label !== null &&
    candidate.source_machine_label !== undefined &&
    !isNonEmptyString(candidate.source_machine_label)
  ) {
    return null;
  }
  if (
    candidate.source_hostname !== null &&
    candidate.source_hostname !== undefined &&
    !isNonEmptyString(candidate.source_hostname)
  ) {
    return null;
  }
  return {
    restored_at: candidate.restored_at,
    restored_snapshot_id: candidate.restored_snapshot_id,
    local_machine_id: candidate.local_machine_id,
    local_machine_label: candidate.local_machine_label,
    source_machine_id:
      candidate.source_machine_id === null || candidate.source_machine_id === undefined
        ? null
        : candidate.source_machine_id,
    source_machine_label:
      candidate.source_machine_label === null || candidate.source_machine_label === undefined
        ? null
        : candidate.source_machine_label,
    source_hostname:
      candidate.source_hostname === null || candidate.source_hostname === undefined ? null : candidate.source_hostname,
    cross_machine: candidate.cross_machine,
    snapshot_created_at: candidate.snapshot_created_at,
  };
}

export function machineDescriptorFromIdentity(identity: MachineIdentity): MachineDescriptor {
  return {
    machine_id: identity.machine_id,
    machine_label: identity.machine_label,
    hostname: identity.hostname,
  };
}

export function readMachineIdentity(paths: Paths): MachineIdentityReadResult {
  if (!fs.existsSync(paths.machineIdentityFile)) {
    return {
      status: "missing",
      identity: null,
      message: "Machine identity is missing. Run `personal-ops install all` to initialize local machine ownership.",
    };
  }
  try {
    const parsed = parseMachineIdentity(readJson(paths.machineIdentityFile));
    if (!parsed) {
      return {
        status: "invalid",
        identity: null,
        message:
          "machine-identity.json is malformed. Repair or remove it intentionally, then rerun `personal-ops install all`.",
      };
    }
    return {
      status: "configured",
      identity: parsed,
      message: `Machine identity is configured for ${parsed.machine_label}.`,
    };
  } catch (error) {
    return {
      status: "invalid",
      identity: null,
      message: error instanceof Error ? error.message : "Machine identity could not be read.",
    };
  }
}

export function ensureMachineIdentity(paths: Paths): MachineIdentity {
  const current = readMachineIdentity(paths);
  if (current.status === "configured" && current.identity) {
    return current.identity;
  }
  if (current.status === "invalid") {
    throw new Error(current.message);
  }
  const identity: MachineIdentity = {
    machine_id: crypto.randomUUID(),
    machine_label: hostname(),
    hostname: hostname(),
    initialized_at: new Date().toISOString(),
    app_dir: paths.appDir,
  };
  writeJson(paths.machineIdentityFile, identity);
  return identity;
}

export function readRestoreProvenance(paths: Paths): RestoreProvenanceReadResult {
  if (!fs.existsSync(paths.restoreProvenanceFile)) {
    return {
      status: "missing",
      provenance: null,
      message: "No restore provenance is recorded.",
    };
  }
  try {
    const parsed = parseRestoreProvenance(readJson(paths.restoreProvenanceFile));
    if (!parsed) {
      return {
        status: "invalid",
        provenance: null,
        message:
          "restore-provenance.json is malformed. Rerun a known-good restore or remove the file if the state is known to be native.",
      };
    }
    return {
      status: "configured",
      provenance: parsed,
      message: "Restore provenance is recorded.",
    };
  } catch (error) {
    return {
      status: "invalid",
      provenance: null,
      message: error instanceof Error ? error.message : "Restore provenance could not be read.",
    };
  }
}

export function writeRestoreProvenance(paths: Paths, provenance: RestoreProvenance): void {
  writeJson(paths.restoreProvenanceFile, provenance);
}

export function describeStateOrigin(provenance: RestoreProvenance | null): MachineStateOrigin {
  if (!provenance) {
    return "native";
  }
  if (provenance.source_machine_id === null) {
    return "unknown_legacy_restore";
  }
  return provenance.cross_machine ? "restored_cross_machine" : "restored_same_machine";
}
