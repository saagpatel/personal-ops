import assert from "node:assert/strict";
import test from "node:test";
import {
	formatCoordinationSnapshot,
	parseDivergence,
	type CoordinationSnapshot,
} from "../src/coordination-snapshot.js";

test("parseDivergence maps git left-right counts into behind and ahead", () => {
	assert.deepEqual(parseDivergence("0\t1"), { behind: 0, ahead: 1 });
	assert.deepEqual(parseDivergence("2 0"), { behind: 2, ahead: 0 });
});

test("formatCoordinationSnapshot surfaces read-only scope, deferred Notion, and next actions", () => {
	const snapshot: CoordinationSnapshot = {
		schema_version: "1.0.0",
		generated_at: "2026-05-04T00:00:00.000Z",
		machine: {
			hostname: "machine.local",
			user: "d",
		},
		scope: {
			mode: "read_only",
			notion_lane: "deferred",
			description: "Derived only.",
		},
		repos: [
			{
				name: "personal-ops",
				path: "/Users/d/.local/share/personal-ops",
				branch: "main",
				upstream: "origin/main",
				head: "abc1234",
				last_commit_subject: "docs: add contract",
				clean: true,
				ahead: 0,
				behind: 0,
				state: "available",
				message: null,
				source_of_truth: "local git",
			},
		],
		sources: {
			github_repo_auditor: {
				name: "GithubRepoAuditor portfolio truth",
				state: "available",
				source_of_truth: "portfolio-truth-latest.json",
				message: "10 repos",
				generated_at: "2026-05-04T00:00:00.000Z",
				project_count: 10,
				briefing_line: "10 repos",
			},
			bridge_db: {
				name: "bridge-db",
				state: "available",
				source_of_truth: "bridge-db",
				message: "reachable",
			},
			notification_hub: {
				name: "notification-hub",
				state: "available",
				source_of_truth: "notification-hub",
				message: "reachable",
				recent_event_count: 2,
			},
			notion: {
				name: "Notion",
				state: "deferred",
				source_of_truth: "/Users/d/Notion",
				message: "handled separately",
			},
		},
		health: {
			overall: "green",
			install_check_state: "ready",
			deep_health_state: "ready",
			issues: [],
		},
		next_actions: ["Use this snapshot as the next packet input."],
	};

	const output = formatCoordinationSnapshot(snapshot);
	assert.match(output, /Coordination Snapshot/);
	assert.match(output, /Overall: green/);
	assert.match(output, /Notion: deferred/);
	assert.match(output, /Use this snapshot as the next packet input/);
});
