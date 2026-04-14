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

function assertRepoFileExists(relativePath: string): void {
  assert.equal(fs.existsSync(path.join(repoRoot(), relativePath)), true, `${relativePath} should exist.`);
}

function markdownLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1] ?? "");
}

function assertDocLinks(markdownPath: string, expectedLinks: string[]): void {
  const markdown = readRepoFile(markdownPath);
  const links = markdownLinks(markdown);
  for (const expected of expectedLinks) {
    assert.equal(links.includes(expected), true, `${markdownPath} should link to ${expected}.`);
  }
}

test("Phase 5 primary docs exist and README routes into the new docs layer", () => {
  assertRepoFileExists("START-HERE.md");
  assertRepoFileExists("OPERATIONS.md");
  assertRepoFileExists("RELEASING.md");
  assertRepoFileExists("ARCHITECTURE.md");
  assertRepoFileExists("QUICK-GUIDE.md");
  assertRepoFileExists("docs/PHASE-5-PLAN.md");
  assertRepoFileExists("docs/PHASE-5-ROLLOUT.md");

  assertDocLinks("README.md", [
    "START-HERE.md",
    "QUICK-GUIDE.md",
    "OPERATIONS.md",
    "RELEASING.md",
    "ARCHITECTURE.md",
    "CLIENTS.md",
    "docs/ASSISTANT-LED-ROADMAP.md",
    "docs/NEW-MACHINE-SETUP.md",
    "docs/PROGRAM-COMPLETE-SUMMARY.md",
  ]);

  const readme = readRepoFile("README.md");
  assert.match(readme, /Historical program summary/);
});

test("Phase 5 start-here doc links to the main role paths and history docs", () => {
  const expectedLinks = [
    "QUICK-GUIDE.md",
    "OPERATIONS.md",
    "RELEASING.md",
    "ARCHITECTURE.md",
    "CLIENTS.md",
    "docs/ASSISTANT-LED-ROADMAP.md",
    "docs/NEW-MACHINE-SETUP.md",
    "docs/IMPROVEMENT-ROADMAP.md",
    "docs/PROGRAM-COMPLETE-SUMMARY.md",
    "docs/2026-03-24-system-audit.md",
    "docs/PHASE-1-ROLLOUT.md",
    "docs/PHASE-2-ROLLOUT.md",
    "docs/PHASE-3-ROLLOUT.md",
    "docs/PHASE-4-ROLLOUT.md",
  ];

  assertDocLinks("START-HERE.md", expectedLinks);

  const startHere = readRepoFile("START-HERE.md");
  assert.match(startHere, /current and future source of truth/i);
  assert.match(startHere, /historical summary of the earlier Phase 1 to 33 program/i);

  for (const relativePath of expectedLinks) {
    assertRepoFileExists(relativePath);
  }
});

test("Phase 5 primary doc chain has no dead-end relative links", () => {
  const docsToCheck = ["START-HERE.md", "QUICK-GUIDE.md", "OPERATIONS.md", "ARCHITECTURE.md"];

  for (const markdownPath of docsToCheck) {
    const absoluteDir = path.dirname(path.join(repoRoot(), markdownPath));
    for (const link of markdownLinks(readRepoFile(markdownPath))) {
      if (link.startsWith("http")) {
        continue;
      }
      const resolved = path.normalize(path.join(absoluteDir, link));
      assert.equal(fs.existsSync(resolved), true, `${markdownPath} has a dead-end link: ${link}`);
    }
  }
});
