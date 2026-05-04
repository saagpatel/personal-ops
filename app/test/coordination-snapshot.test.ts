import assert from "node:assert/strict";
import test from "node:test";
import {
	buildCoordinationBriefing,
	buildCoordinationSnapshotDiff,
	formatCoordinationSnapshot,
	formatCoordinationSnapshotDiff,
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

test("buildCoordinationBriefing emits a ChatGPT packet without claiming Notion state", () => {
	const snapshot: CoordinationSnapshot = {
		schema_version: "1.0.0",
		generated_at: "2026-05-04T06:45:11.157Z",
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
				head: "0358b88",
				last_commit_subject: "Add read-only coordination snapshot",
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
				message: "115 repos",
				generated_at: "2026-05-04T00:00:00.000Z",
				project_count: 115,
				briefing_line: "115 repos",
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
				recent_event_count: 25,
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

	const briefing = buildCoordinationBriefing(snapshot);
	assert.equal(
		briefing.packet_id,
		"handoff-20260504T064511-coordination-snapshot",
	);
	assert.equal(briefing.target, "chatgpt");
	assert.match(briefing.markdown, /# Codex -> ChatGPT Handoff/);
	assert.match(briefing.markdown, /ChatGPT Project: Codex-ChatGPT/);
	assert.match(briefing.markdown, /Notion: deferred/);
	assert.match(briefing.markdown, /Do not pull Notion into this lane/);
	assert.doesNotMatch(briefing.markdown, /active_projects/);
});

test("buildCoordinationSnapshotDiff summarizes repo, source, and health changes", () => {
	const previous: CoordinationSnapshot = {
		schema_version: "1.0.0",
		generated_at: "2026-05-04T06:45:11.157Z",
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
				head: "0358b88",
				last_commit_subject: "Add read-only coordination snapshot",
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
				message: "115 repos",
				generated_at: "2026-05-04T00:00:00.000Z",
				project_count: 115,
				briefing_line: "115 repos",
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
				recent_event_count: 25,
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
	const current: CoordinationSnapshot = {
		...previous,
		generated_at: "2026-05-04T07:45:11.157Z",
		repos: [
			{
				...previous.repos[0]!,
				head: "f3171b5",
				last_commit_subject: "Add ChatGPT coordination briefing",
			},
		],
		sources: {
			...previous.sources,
			notification_hub: {
				...previous.sources.notification_hub,
				recent_event_count: 30,
			},
		},
		health: {
			...previous.health,
			overall: "yellow",
			issues: ["manual review needed"],
		},
	};

	const diff = buildCoordinationSnapshotDiff(previous, current);
	const formatted = formatCoordinationSnapshotDiff(diff);
	assert.equal(diff.summary.total_changes, 4);
	assert.equal(diff.summary.repo_changes, 1);
	assert.equal(diff.summary.source_changes, 1);
	assert.equal(diff.summary.health_changes, 2);
	assert.match(formatted, /Coordination Snapshot Diff/);
	assert.match(formatted, /repo:personal-ops.head: 0358b88 -> f3171b5/);
	assert.match(formatted, /source:notification_hub.recent_event_count: 25 -> 30/);
	assert.match(formatted, /health:overall.overall: green -> yellow/);
});
