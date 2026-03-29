import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function getPaths() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(appDir, "..");
  return {
    appDir,
    repoRoot,
    packageJsonPath: path.join(appDir, "package.json"),
    packageLockPath: path.join(appDir, "package-lock.json"),
    changelogPath: path.join(repoRoot, "CHANGELOG.md"),
  };
}

export function parseArgs(argv) {
  const args = { version: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--version") {
      args.version = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${value}`);
  }
  if (!args.version) {
    throw new Error("Missing required --version X.Y.Z.");
  }
  return args;
}

export function assertSemVer(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Version must use X.Y.Z semver format. Received: ${version}`);
  }
}

export function compareSemVer(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }
  return 0;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function ensureCleanWorktree(repoRoot) {
  const status = execFileSync("git", ["status", "--short"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (status.length > 0) {
    throw new Error("Release prep requires a clean git worktree.");
  }
}

export function readChangelogSection(changelogPath, version) {
  const content = fs.readFileSync(changelogPath, "utf8");
  const heading = `## [${version}]`;
  const start = content.indexOf(heading);
  if (start === -1) {
    throw new Error(`CHANGELOG.md is missing a section for ${version}.`);
  }
  const startAfterHeading = content.indexOf("\n", start);
  if (startAfterHeading === -1) {
    throw new Error(`CHANGELOG.md section for ${version} is malformed.`);
  }
  const remainder = content.slice(startAfterHeading + 1);
  const nextHeading = remainder.search(/^## \[/m);
  const section = (nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)).trim();
  if (section.length === 0) {
    throw new Error(`CHANGELOG.md section for ${version} is empty.`);
  }
  return section;
}
