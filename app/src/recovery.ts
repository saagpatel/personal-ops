import fs from "node:fs";
import path from "node:path";
import type {
  Paths,
  RecoveryRehearsalStamp,
  SnapshotInspection,
  SnapshotManifest,
  SnapshotPruneItem,
  SnapshotPruneResult,
  SnapshotRetentionBucket,
  SnapshotSummary,
} from "./types.js";

type ReadStatus = "configured" | "missing" | "invalid";

interface RecoveryRehearsalReadResult {
  status: ReadStatus;
  stamp: RecoveryRehearsalStamp | null;
  message: string;
}

interface SnapshotEntry {
  manifest: SnapshotManifest;
  path: string;
  createdMs: number | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const DAILY_RETENTION_DAYS = 14;
const WEEKLY_RETENTION_WEEKS = 8;

export const SNAPSHOT_WARN_HOURS = 24;
export const SNAPSHOT_FAIL_HOURS = 72;
export const RECOVERY_REHEARSAL_WARN_HOURS = 14 * 24;
export const SNAPSHOT_RETENTION_POLICY_SUMMARY =
  "Keep all snapshots from the last 24 hours, keep the newest snapshot per day through 14 days, keep the newest snapshot per week through 8 weeks, prune older snapshots, and always keep the single newest snapshot.";

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

function parseRecoveryRehearsalStamp(value: unknown): RecoveryRehearsalStamp | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.successful_at) ||
    !isNonEmptyString(candidate.app_version) ||
    !isNonEmptyString(candidate.command_name)
  ) {
    return null;
  }
  return {
    successful_at: candidate.successful_at,
    app_version: candidate.app_version,
    command_name: candidate.command_name,
  };
}

function readSnapshotManifestFromPath(manifestPath: string): SnapshotManifest | null {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SnapshotManifest;
  } catch {
    return null;
  }
}

function snapshotCreatedMs(manifest: SnapshotManifest): number | null {
  const createdMs = Date.parse(manifest.created_at);
  return Number.isFinite(createdMs) ? createdMs : null;
}

function sortEntriesNewestFirst(left: SnapshotEntry, right: SnapshotEntry): number {
  if (left.createdMs != null && right.createdMs != null && left.createdMs !== right.createdMs) {
    return right.createdMs - left.createdMs;
  }
  if (left.createdMs != null && right.createdMs == null) {
    return -1;
  }
  if (left.createdMs == null && right.createdMs != null) {
    return 1;
  }
  return right.manifest.snapshot_id.localeCompare(left.manifest.snapshot_id);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(createdMs: number): string {
  const date = new Date(createdMs);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function weekKey(createdMs: number): string {
  const date = new Date(createdMs);
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function keptItem(entry: SnapshotEntry, bucket: SnapshotRetentionBucket, reason: string): SnapshotPruneItem {
  return {
    snapshot_id: entry.manifest.snapshot_id,
    created_at: entry.manifest.created_at,
    path: entry.path,
    daemon_state: entry.manifest.daemon_state,
    bucket,
    reason,
  };
}

function candidateItem(entry: SnapshotEntry, reason: string): SnapshotPruneItem {
  return keptItem(entry, "expired", reason);
}

export function readRecoveryRehearsalStamp(paths: Paths): RecoveryRehearsalReadResult {
  if (!fs.existsSync(paths.recoveryRehearsalFile)) {
    return {
      status: "missing",
      stamp: null,
      message: "No successful recovery rehearsal is recorded yet.",
    };
  }
  try {
    const parsed = parseRecoveryRehearsalStamp(readJson(paths.recoveryRehearsalFile));
    if (!parsed) {
      return {
        status: "invalid",
        stamp: null,
        message:
          "recovery-rehearsal.json is malformed. Rerun `npm run verify:recovery` after confirming backup and restore still work.",
      };
    }
    return {
      status: "configured",
      stamp: parsed,
      message: `Recovery rehearsal succeeded at ${parsed.successful_at}.`,
    };
  } catch (error) {
    return {
      status: "invalid",
      stamp: null,
      message: error instanceof Error ? error.message : "Recovery rehearsal state could not be read.",
    };
  }
}

export function writeRecoveryRehearsalStamp(paths: Paths, stamp: RecoveryRehearsalStamp): void {
  writeJson(paths.recoveryRehearsalFile, stamp);
}

export function recoveryRehearsalAgeHours(stamp: RecoveryRehearsalStamp | null): number | null {
  if (!stamp) {
    return null;
  }
  const successfulMs = Date.parse(stamp.successful_at);
  if (!Number.isFinite(successfulMs)) {
    return null;
  }
  return (Date.now() - successfulMs) / HOUR_MS;
}

export function listSnapshotEntries(paths: Paths): SnapshotEntry[] {
  if (!fs.existsSync(paths.snapshotsDir)) {
    return [];
  }
  return fs
    .readdirSync(paths.snapshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const snapshotPath = path.join(paths.snapshotsDir, entry.name);
      const manifest = readSnapshotManifestFromPath(path.join(snapshotPath, "manifest.json"));
      if (!manifest) {
        return null;
      }
      return {
        manifest,
        path: snapshotPath,
        createdMs: snapshotCreatedMs(manifest),
      } satisfies SnapshotEntry;
    })
    .filter((entry): entry is SnapshotEntry => Boolean(entry))
    .sort(sortEntriesNewestFirst);
}

export function readSnapshotManifest(paths: Paths, snapshotId: string): SnapshotManifest | null {
  return readSnapshotManifestFromPath(path.join(paths.snapshotsDir, snapshotId, "manifest.json"));
}

export function listSnapshotSummaries(paths: Paths): SnapshotSummary[] {
  return listSnapshotEntries(paths).map((entry) => ({
    snapshot_id: entry.manifest.snapshot_id,
    created_at: entry.manifest.created_at,
    path: entry.path,
    daemon_state: entry.manifest.daemon_state,
  }));
}

export function getLatestSnapshotSummary(paths: Paths): SnapshotSummary | null {
  return listSnapshotSummaries(paths)[0] ?? null;
}

export function inspectSnapshot(paths: Paths, snapshotId: string): SnapshotInspection {
  const manifest = readSnapshotManifest(paths, snapshotId);
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

export function snapshotAgeHours(snapshot: SnapshotSummary | null): number | null {
  if (!snapshot?.created_at) {
    return null;
  }
  const createdAt = Date.parse(snapshot.created_at);
  if (!Number.isFinite(createdAt)) {
    return null;
  }
  return (Date.now() - createdAt) / HOUR_MS;
}

export function pruneSnapshots(
  paths: Paths,
  options: {
    dryRun?: boolean;
    now?: Date;
  } = {},
): SnapshotPruneResult {
  const dryRun = options.dryRun ?? true;
  const nowMs = (options.now ?? new Date()).getTime();
  const entries = listSnapshotEntries(paths);
  const kept: SnapshotPruneItem[] = [];
  const pruneCandidateItems: SnapshotPruneItem[] = [];
  const deletedSnapshotIds: string[] = [];
  const dailyKeys = new Set<string>();
  const weeklyKeys = new Set<string>();
  const newestSnapshotId = entries[0]?.manifest.snapshot_id ?? null;

  for (const [index, entry] of entries.entries()) {
    if (index === 0) {
      kept.push(keptItem(entry, "latest", "Always keep the single newest snapshot."));
      continue;
    }
    if (entry.createdMs == null) {
      kept.push(keptItem(entry, "invalid", "Created-at timestamp is invalid, so this snapshot is kept conservatively."));
      continue;
    }

    const ageMs = Math.max(0, nowMs - entry.createdMs);
    if (ageMs <= DAY_MS) {
      kept.push(keptItem(entry, "last_24h", "Keep every snapshot from the last 24 hours."));
      continue;
    }
    if (ageMs <= DAILY_RETENTION_DAYS * DAY_MS) {
      const key = dayKey(entry.createdMs);
      if (!dailyKeys.has(key)) {
        dailyKeys.add(key);
        kept.push(keptItem(entry, "daily", "Keep the newest snapshot for this local calendar day."));
      } else {
        pruneCandidateItems.push(candidateItem(entry, "An older snapshot for this day already exists."));
      }
      continue;
    }
    if (ageMs <= WEEKLY_RETENTION_WEEKS * WEEK_MS) {
      const key = weekKey(entry.createdMs);
      if (!weeklyKeys.has(key)) {
        weeklyKeys.add(key);
        kept.push(keptItem(entry, "weekly", "Keep the newest snapshot for this local calendar week."));
      } else {
        pruneCandidateItems.push(candidateItem(entry, "An older snapshot for this week already exists."));
      }
      continue;
    }
    pruneCandidateItems.push(candidateItem(entry, "Snapshot is older than the 8-week retention window."));
  }

  if (!dryRun) {
    for (const item of pruneCandidateItems) {
      fs.rmSync(item.path, { recursive: true, force: true });
      deletedSnapshotIds.push(item.snapshot_id);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    policy_summary: SNAPSHOT_RETENTION_POLICY_SUMMARY,
    total_snapshots: entries.length,
    snapshots_kept: kept.length,
    prune_candidates: pruneCandidateItems.length,
    snapshots_deleted: deletedSnapshotIds.length,
    newest_snapshot_id: newestSnapshotId,
    kept,
    prune_candidate_items: pruneCandidateItems,
    deleted_snapshot_ids: deletedSnapshotIds,
  };
}
