import assert from "node:assert/strict";
import test from "node:test";
import {
	buildCoordinationBriefing,
	buildCoordinationSnapshotDiff,
	buildCoordinationVerificationPrompts,
	classifyCoordinationSnapshotDiff,
	formatCoordinationChangeClassification,
	formatCoordinationVerificationPrompts,
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
	assert.match(briefing.markdown, /No prior snapshot diff was supplied/);
	assert.match(briefing.markdown, /Local Verification Checklist For Codex/);
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

test("classifyCoordinationSnapshotDiff labels deterministic significant changes", () => {
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
				head: "f3171b5",
				last_commit_subject: "Add ChatGPT coordination briefing",
				clean: false,
				ahead: 0,
				behind: 0,
				state: "degraded",
				message: "Repo posture needs attention.",
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
			overall: "yellow",
			install_check_state: "ready",
			deep_health_state: "ready",
			issues: ["personal-ops: Repo posture needs attention."],
		},
		next_actions: ["Repair degraded signals."],
	};
	const current: CoordinationSnapshot = {
		...previous,
		generated_at: "2026-05-04T07:45:11.157Z",
		repos: [
			{
				...previous.repos[0]!,
				head: "c631881",
				last_commit_subject: "Add optional diff to ChatGPT briefing",
				clean: true,
				state: "available",
				message: null,
			},
		],
		health: {
			...previous.health,
			overall: "green",
			issues: [],
		},
	};

	const diff = buildCoordinationSnapshotDiff(previous, current);
	const first = classifyCoordinationSnapshotDiff(diff);
	const second = classifyCoordinationSnapshotDiff(diff);
	const formatted = formatCoordinationChangeClassification(first);

	assert.deepEqual(first.classifications, second.classifications);
	assert.equal(first.summary.highest_severity, "high");
	assert.ok(
		first.classifications.some(
			(classification) => classification.type === "repo_state_recovery" && classification.severity === "high",
		),
	);
	assert.ok(
		first.classifications.some(
			(classification) => classification.type === "health_transition" && classification.severity === "high",
		),
	);
	assert.ok(
		first.classifications.some(
			(classification) => classification.type === "commit_advance" && classification.severity === "low",
		),
	);
	assert.match(formatted, /Coordination Change Classification/);
	assert.match(formatted, /repo_state_recovery \(high\)/);
});

test("classifyCoordinationSnapshotDiff stays quiet for no-op diffs", () => {
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
		repos: [],
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
	const diff = buildCoordinationSnapshotDiff(snapshot, snapshot);
	const classification = classifyCoordinationSnapshotDiff(diff);

	assert.equal(classification.summary.total_classifications, 0);
	assert.equal(classification.summary.highest_severity, null);
	assert.deepEqual(classification.classifications, []);
});

test("buildCoordinationVerificationPrompts derives stable read-only checks", () => {
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
				head: "f3171b5",
				last_commit_subject: "Add ChatGPT coordination briefing",
				clean: false,
				ahead: 1,
				behind: 0,
				state: "degraded",
				message: "Repo posture needs attention.",
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
			overall: "yellow",
			install_check_state: "ready",
			deep_health_state: "ready",
			issues: ["personal-ops: Repo posture needs attention."],
		},
		next_actions: ["Repair degraded signals."],
	};
	const current: CoordinationSnapshot = {
		...previous,
		generated_at: "2026-05-04T07:45:11.157Z",
		repos: [
			{
				...previous.repos[0]!,
				head: "115177c",
				last_commit_subject: "Add coordination change classification",
				clean: true,
				ahead: 0,
				state: "available",
				message: null,
			},
		],
		health: {
			...previous.health,
			overall: "green",
			issues: [],
		},
	};
	const classification = classifyCoordinationSnapshotDiff(buildCoordinationSnapshotDiff(previous, current));
	const first = buildCoordinationVerificationPrompts(classification);
	const second = buildCoordinationVerificationPrompts(classification);
	const formatted = formatCoordinationVerificationPrompts(first);

	assert.deepEqual(first.prompts, second.prompts);
	assert.ok(first.summary.total_prompts < classification.summary.total_classifications);
	assert.equal(
		first.prompts.filter((prompt) => prompt.entity === "personal-ops").length,
		2,
	);
	assert.equal(
		first.prompts.filter((prompt) => prompt.entity === "health").length,
		1,
	);
	assert.ok(
		first.prompts.some((prompt) =>
			prompt.check.includes("Confirm personal-ops is clean, on the expected branch"),
		),
	);
	assert.ok(
		first.prompts.some(
			(prompt) =>
				prompt.entity === "personal-ops" &&
				prompt.derived_from.length > 1 &&
				prompt.derived_from.every((source) => source.type === "repo_state_recovery"),
		),
	);
	assert.ok(
		first.prompts.some((prompt) =>
			prompt.check.includes("Confirm Personal Ops health is still stable"),
		),
	);
	assert.doesNotMatch(formatted, /\b(?:git commit|git push|rm -|rm\s+\/|write file|delete file)\b/i);
	assert.match(formatted, /Coordination Verification Prompts/);
});

test("buildCoordinationVerificationPrompts stays quiet for no-op classifications", () => {
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
		repos: [],
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
	const classification = classifyCoordinationSnapshotDiff(buildCoordinationSnapshotDiff(snapshot, snapshot));
	const prompts = buildCoordinationVerificationPrompts(classification);

	assert.equal(prompts.summary.total_prompts, 0);
	assert.deepEqual(prompts.prompts, []);
});

test("buildCoordinationBriefing can include a supplied snapshot diff", () => {
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
		repos: [{ ...previous.repos[0]!, head: "dd38df5" }],
	};
	const diff = buildCoordinationSnapshotDiff(previous, current);
	const briefing = buildCoordinationBriefing(current, diff);

	assert.deepEqual(briefing.source_diff, {
		included: true,
		total_changes: 1,
	});
	assert.deepEqual(briefing.change_classification, {
		included: true,
		total_classifications: 1,
		highest_severity: "low",
	});
	assert.deepEqual(briefing.verification_prompts, {
		included: true,
		total_prompts: 1,
	});
	assert.match(briefing.markdown, /What changed since prior snapshot/);
	assert.match(briefing.markdown, /## Significant Changes/);
	assert.match(briefing.markdown, /## Suggested Verification Prompts \(Read-Only\)/);
	assert.match(briefing.markdown, /commit_advance \(low\)/);
	assert.match(briefing.markdown, /Confirm personal-ops commit movement matches the intended local work/);
	assert.match(briefing.markdown, /Current snapshot health: green/);
	assert.match(
		briefing.markdown,
		/Prior snapshot health for comparison only: green at 2026-05-04T06:45:11.157Z/,
	);
	assert.match(
		briefing.markdown,
		/Prior snapshot health was green at 2026-05-04T06:45:11.157Z/,
	);
	assert.match(
		briefing.markdown,
		/Current snapshot health is green at 2026-05-04T07:45:11.157Z/,
	);
	assert.match(briefing.markdown, /Changes since prior snapshot: 1 total/);
	assert.match(briefing.markdown, /repo:personal-ops.head: 0358b88 -> dd38df5/);
	assert.match(briefing.markdown, /Treat dirty, ahead, behind, degraded, unavailable, and deferred fields as verification prompts/);
});
