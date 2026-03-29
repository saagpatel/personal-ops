import fs from "node:fs";
import path from "node:path";
import type { Paths, VersionReport } from "./types.js";

export const UNKNOWN_SERVICE_VERSION = "0.0.0-unknown";
export const SOURCE_DISTRIBUTION_MODEL = "source_checkout_plus_bootstrap";
export const RELEASE_CHECK_COMMAND = "cd /Users/d/.local/share/personal-ops/app && npm run release:check";
export const UPGRADE_HINT =
  "Create a fresh snapshot, update the repo to the target tag or branch, rerun ./bootstrap, then rerun install check and doctor --deep.";

export function readServiceVersion(appDir: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8")) as { version?: string };
    return typeof pkg.version === "string" && pkg.version.trim().length > 0 ? pkg.version.trim() : UNKNOWN_SERVICE_VERSION;
  } catch {
    return UNKNOWN_SERVICE_VERSION;
  }
}

export function buildVersionReport(paths: Paths): VersionReport {
  const serviceVersion = readServiceVersion(paths.appDir);
  return {
    service_version: serviceVersion,
    release_tag: `v${serviceVersion}`,
    distribution_model: SOURCE_DISTRIBUTION_MODEL,
    release_check_command: RELEASE_CHECK_COMMAND,
    upgrade_hint: UPGRADE_HINT,
  };
}
