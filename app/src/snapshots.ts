import fs from "node:fs";
import path from "node:path";

function snapshotTimestamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

export function createSnapshotId(snapshotsDir: string, now = new Date()): string {
  const base = snapshotTimestamp(now);
  let candidate = base;
  let suffix = 1;
  while (fs.existsSync(path.join(snapshotsDir, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
