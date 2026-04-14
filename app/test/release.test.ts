import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function appDir() {
  return path.join(repoRoot(), "app");
}

function releaseWorkflowPath() {
  return path.join(repoRoot(), ".github", "workflows", "release.yml");
}

function copyReleaseScripts(targetScriptsDir: string) {
  fs.mkdirSync(targetScriptsDir, { recursive: true });
  for (const fileName of ["release-common.mjs", "release-prep.mjs", "release-notes.mjs"]) {
    fs.copyFileSync(path.join(appDir(), "scripts", fileName), path.join(targetScriptsDir, fileName));
  }
}

function createTempReleaseRepo(options?: { version?: string; changelog?: string }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-release-"));
  const repo = path.join(base, "repo");
  const tempAppDir = path.join(repo, "app");
  const scriptsDir = path.join(tempAppDir, "scripts");
  fs.mkdirSync(tempAppDir, { recursive: true });
  copyReleaseScripts(scriptsDir);

  const version = options?.version ?? "0.1.0";
  fs.writeFileSync(
    path.join(tempAppDir, "package.json"),
    `${JSON.stringify({ name: "personal-ops", version, private: true }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(tempAppDir, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "personal-ops",
        version,
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": {
            name: "personal-ops",
            version,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(repo, "CHANGELOG.md"),
    options?.changelog ??
      `# Changelog

## [0.2.0] - Pending release

- First official source-first release.
- Adds release workflow coverage.
`,
    "utf8",
  );

  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "test fixture"], { cwd: repo, stdio: "ignore" });

  return { repo, tempAppDir };
}

function runReleaseScript(repo: string, scriptName: string, args: string[], expectFailure = false): string {
  try {
    return execFileSync("node", [path.join(repo, "app", "scripts", scriptName), ...args], {
      cwd: path.join(repo, "app"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (!expectFailure) {
      throw error;
    }
    return `${(error as { stdout?: string }).stdout ?? ""}${(error as { stderr?: string }).stderr ?? ""}`;
  }
}

test("Phase 4 release prep dry-run validates and leaves files unchanged", () => {
  const { repo, tempAppDir } = createTempReleaseRepo();
  const before = fs.readFileSync(path.join(tempAppDir, "package.json"), "utf8");
  const output = runReleaseScript(repo, "release-prep.mjs", ["--version", "0.2.0", "--dry-run"]);
  const after = fs.readFileSync(path.join(tempAppDir, "package.json"), "utf8");
  assert.match(output, /Current version: 0\.1\.0/);
  assert.match(output, /Target version: 0\.2\.0/);
  assert.match(output, /Dry run: no files were changed\./);
  assert.equal(after, before);
});

test("Phase 4 release prep rejects invalid semver", () => {
  const { repo } = createTempReleaseRepo();
  const output = runReleaseScript(repo, "release-prep.mjs", ["--version", "0.2", "--dry-run"], true);
  assert.match(output, /Version must use X\.Y\.Z semver format/);
});

test("Phase 4 release prep rejects non-incrementing versions", () => {
  const { repo } = createTempReleaseRepo();
  const output = runReleaseScript(repo, "release-prep.mjs", ["--version", "0.1.0", "--dry-run"], true);
  assert.match(output, /must be newer than current version 0\.1\.0/);
});

test("Phase 4 release prep rejects a dirty worktree", () => {
  const { repo, tempAppDir } = createTempReleaseRepo();
  fs.appendFileSync(path.join(tempAppDir, "package.json"), "\n");
  const output = runReleaseScript(repo, "release-prep.mjs", ["--version", "0.2.0", "--dry-run"], true);
  assert.match(output, /requires a clean git worktree/);
});

test("Phase 4 release prep rejects missing changelog entries", () => {
  const { repo } = createTempReleaseRepo({
    changelog: `# Changelog

## [Unreleased]

- Placeholder.
`,
  });
  const output = runReleaseScript(repo, "release-prep.mjs", ["--version", "0.2.0", "--dry-run"], true);
  assert.match(output, /CHANGELOG\.md is missing a section for 0\.2\.0/);
});

test("Phase 4 release notes extracts the target changelog section", () => {
  const { repo } = createTempReleaseRepo({
    changelog: `# Changelog

## [0.2.0] - Pending release

- First official source-first release.
- Adds release workflow coverage.

## [0.1.0] - Earlier

- Previous release.
`,
  });
  const output = runReleaseScript(repo, "release-notes.mjs", ["--version", "0.2.0"]);
  assert.doesNotMatch(output, /0\.1\.0/);
  assert.match(output, /First official source-first release\./);
  assert.match(output, /Adds release workflow coverage\./);
});

test("Phase 4 release workflow uses tags, release baseline, and changelog notes", () => {
  const workflow = fs.readFileSync(releaseWorkflowPath(), "utf8");
  assert.match(workflow, /tags:\s*\n\s*-\s*"v\*"/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run release:check:ci/);
  assert.match(workflow, /npm run release:notes -- --version/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
});
