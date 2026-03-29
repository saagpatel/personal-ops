import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot(), relativePath), "utf8");
}

test("hardening release gate script runs the full local verification stack", () => {
  const packageJson = JSON.parse(readRepoFile("app/package.json")) as {
    scripts?: Record<string, string>;
    overrides?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts?.["verify:all"],
    "npm run typecheck && npm run test && npm run verify:smoke && npm run verify:full && npm run verify:console && npm run verify:launchagent",
  );
  assert.equal(packageJson.scripts?.["release:check"], "npm run verify:all");
  assert.equal(packageJson.scripts?.["release:check:ci"], "npm run typecheck && npm run test && npm run verify:smoke");
  assert.equal(packageJson.overrides?.["path-to-regexp"], "8.4.0");
  assert.equal(packageJson.dependencies?.["@modelcontextprotocol/sdk"], "^1.28.0");
});

test("hardening CI workflow runs the stable cross-platform checks from app", () => {
  const workflowPath = path.join(repoRoot(), ".github", "workflows", "ci.yml");
  assert.equal(fs.existsSync(workflowPath), true, "CI workflow should exist.");

  const workflow = fs.readFileSync(workflowPath, "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true/);
  assert.match(workflow, /uses: actions\/checkout@v5/);
  assert.match(workflow, /uses: actions\/setup-node@v5/);
  assert.match(workflow, /working-directory:\s+app/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run verify:smoke/);
});
