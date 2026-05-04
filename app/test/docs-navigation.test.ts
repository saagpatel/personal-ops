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

test("README routes readers into the current-truth docs layer", () => {
  assertRepoFileExists("START-HERE.md");
  assertRepoFileExists("OPERATIONS.md");
  assertRepoFileExists("RELEASING.md");
  assertRepoFileExists("ARCHITECTURE.md");
  assertRepoFileExists("QUICK-GUIDE.md");
  assertRepoFileExists("docs/ASSISTANT-LED-ROADMAP.md");
  assertRepoFileExists("docs/ASSISTANT-LED-HISTORY-SUMMARY.md");
  assertRepoFileExists("docs/PROGRAM-COMPLETE-SUMMARY.md");

  assertDocLinks("README.md", [
    "START-HERE.md",
    "docs/ASSISTANT-LED-ROADMAP.md",
    "docs/ASSISTANT-LED-HISTORY-SUMMARY.md",
    "docs/PROGRAM-COMPLETE-SUMMARY.md",
  ]);

  const readme = readRepoFile("README.md");
  assert.match(readme, /Assistant-led history summary/);
  assert.match(readme, /Legacy program summary/);
});

test("START-HERE routes current readers to roadmap truth and historical readers to the summary", () => {
  const expectedLinks = [
    "QUICK-GUIDE.md",
    "OPERATIONS.md",
    "RELEASING.md",
    "ARCHITECTURE.md",
    "CLIENTS.md",
    "docs/ASSISTANT-LED-ROADMAP.md",
    "docs/CROSS-PROJECT-COORDINATION.md",
    "docs/ASSISTANT-LED-HISTORY-SUMMARY.md",
    "docs/archive/README.md",
    "docs/NEW-MACHINE-SETUP.md",
    "docs/PROGRAM-COMPLETE-SUMMARY.md",
    "docs/2026-03-24-system-audit.md",
  ];

  assertDocLinks("START-HERE.md", expectedLinks);

  const startHere = readRepoFile("START-HERE.md");
  assert.match(startHere, /current and future source of truth/i);
  assert.match(startHere, /completed assistant-led initiative/i);
  assert.match(startHere, /assistant-led Phases 1 to 38 track/i);
  assert.match(startHere, /archive map/i);
  assert.match(startHere, /historical summary of the earlier Phase 1 to 33 program/i);

  for (const relativePath of expectedLinks) {
    assertRepoFileExists(relativePath);
  }
});

test("primary current-truth doc chain has no dead-end relative links", () => {
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

test("assistant-led terminal artifacts are archived and current-truth docs reflect the completed track", () => {
  assertRepoFileExists("docs/ASSISTANT-LED-HISTORY-SUMMARY.md");
  assertRepoFileExists("docs/archive/README.md");
  assertRepoFileExists("docs/archive/assistant-led-phases/ASSISTANT-LED-PHASE-37-PLAN.md");
  assertRepoFileExists("docs/archive/assistant-led-phases/ASSISTANT-LED-PHASE-37-ROLLOUT.md");
  assertRepoFileExists("docs/archive/assistant-led-phases/ASSISTANT-LED-PHASE-38-PLAN.md");
  assertRepoFileExists("docs/archive/assistant-led-phases/ASSISTANT-LED-PHASE-38-ROLLOUT.md");
  assertRepoFileExists("docs/archive/assistant-led-phases/ASSISTANT-LED-PHASE-36-PLAN.md");
  assertRepoFileExists("docs/archive/legacy-program/PHASE-33-ROLLOUT.md");
  assertRepoFileExists("docs/archive/post-launch/POST-LAUNCH-PHASE-8-ROLLOUT.md");

  const roadmap = readRepoFile("docs/ASSISTANT-LED-ROADMAP.md");
  const startHere = readRepoFile("START-HERE.md");

  assert.match(roadmap, /Phases 1 through 38 complete/i);
  assert.match(roadmap, /assistant-led track is complete/i);
  assert.match(roadmap, /No later assistant-led phases remain/i);
  assert.match(startHere, /now through Phase 38/i);
});
