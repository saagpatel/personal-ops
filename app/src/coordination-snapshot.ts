import { execFileSync } from "node:child_process";
import os from "node:os";
import { BridgeDbClient } from "./bridge-db.js";
import { buildHealthCheckReport } from "./health.js";
import { buildInstallCheckReport } from "./install.js";
import type { Logger } from "./logger.js";
import { NotificationHubClient } from "./notification-hub.js";
import { PortfolioReader } from "./portfolio-reader.js";
import type { HealthCheckReport, InstallCheckReport, Paths } from "./types.js";

interface JsonRequester {
	<T>(method: string, pathname: string, body?: unknown): Promise<T>;
}

export type CoordinationSourceState =
	| "available"
	| "unavailable"
	| "degraded"
	| "deferred";

export interface CoordinationRepoSnapshot {
	name: string;
	path: string;
	branch: string;
	upstream: string | null;
	head: string;
	last_commit_subject: string;
	clean: boolean;
	ahead: number;
	behind: number;
	state: CoordinationSourceState;
	message: string | null;
	source_of_truth: string;
}

export interface CoordinationSourceSnapshot {
	name: string;
	state: CoordinationSourceState;
	source_of_truth: string;
	message: string;
}

export interface CoordinationHealthSnapshot {
	overall: "green" | "yellow" | "red";
	install_check_state: InstallCheckReport["state"];
	deep_health_state: HealthCheckReport["state"] | "unavailable";
	issues: string[];
}

export interface CoordinationSnapshot {
	schema_version: "1.0.0";
	generated_at: string;
	machine: {
		hostname: string;
		user: string;
	};
	scope: {
		mode: "read_only";
		notion_lane: "deferred";
		description: string;
	};
	repos: CoordinationRepoSnapshot[];
	sources: {
		github_repo_auditor: CoordinationSourceSnapshot & {
			generated_at: string | null;
			project_count: number | null;
			briefing_line: string | null;
		};
		bridge_db: CoordinationSourceSnapshot;
		notification_hub: CoordinationSourceSnapshot & {
			recent_event_count: number;
		};
		notion: CoordinationSourceSnapshot;
	};
	health: CoordinationHealthSnapshot;
	next_actions: string[];
}

export interface CoordinationBriefing {
	packet_id: string;
	target: "chatgpt";
	created_at: string;
	mode: "general_cross_tool_coordination";
	source_snapshot: {
		schema_version: CoordinationSnapshot["schema_version"];
		generated_at: string;
		overall: CoordinationHealthSnapshot["overall"];
	};
	markdown: string;
}

export interface CoordinationSnapshotDiffChange {
	area: "repo" | "source" | "health";
	name: string;
	field: string;
	before: string | number | boolean | null;
	after: string | number | boolean | null;
}

export interface CoordinationSnapshotDiff {
	schema_version: "1.0.0";
	generated_at: string;
	mode: "read_only";
	previous_snapshot: {
		generated_at: string;
		overall: CoordinationHealthSnapshot["overall"];
	};
	current_snapshot: {
		generated_at: string;
		overall: CoordinationHealthSnapshot["overall"];
	};
	summary: {
		total_changes: number;
		repo_changes: number;
		source_changes: number;
		health_changes: number;
	};
	changes: CoordinationSnapshotDiffChange[];
	next_actions: string[];
}

const ACTIVE_REPOS = [
	{
		name: "personal-ops",
		path: "/Users/d/.local/share/personal-ops",
		source_of_truth: "local git checkout plus Personal Ops health checks",
	},
	{
		name: "GithubRepoAuditor",
		path: "/Users/d/Projects/GithubRepoAuditor",
		source_of_truth: "GithubRepoAuditor repo and portfolio truth output",
	},
	{
		name: "bridge-db",
		path: "/Users/d/Projects/bridge-db",
		source_of_truth: "bridge-db repo and MCP runtime",
	},
	{
		name: "notification-hub",
		path: "/Users/d/Projects/notification-hub",
		source_of_truth: "notification-hub repo and local daemon/logs",
	},
] as const;

function runGit(repoPath: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd: repoPath,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

export function parseDivergence(output: string): {
	ahead: number;
	behind: number;
} {
	const [behindText, aheadText] = output.split(/\s+/);
	return {
		behind: Number(behindText ?? 0) || 0,
		ahead: Number(aheadText ?? 0) || 0,
	};
}

function collectRepoSnapshot(
	repo: (typeof ACTIVE_REPOS)[number],
): CoordinationRepoSnapshot {
	try {
		const branch = runGit(repo.path, ["rev-parse", "--abbrev-ref", "HEAD"]);
		const head = runGit(repo.path, ["rev-parse", "--short", "HEAD"]);
		const lastCommitSubject = runGit(repo.path, ["log", "-1", "--pretty=%s"]);
		const porcelain = runGit(repo.path, ["status", "--porcelain"]);
		let upstream: string | null = null;
		let ahead = 0;
		let behind = 0;
		try {
			upstream = runGit(repo.path, [
				"rev-parse",
				"--abbrev-ref",
				"--symbolic-full-name",
				"@{u}",
			]);
			const divergence = parseDivergence(
				runGit(repo.path, [
					"rev-list",
					"--left-right",
					"--count",
					`${upstream}...HEAD`,
				]),
			);
			ahead = divergence.ahead;
			behind = divergence.behind;
		} catch {
			upstream = null;
		}
		return {
			name: repo.name,
			path: repo.path,
			branch,
			upstream,
			head,
			last_commit_subject: lastCommitSubject,
			clean: porcelain.length === 0,
			ahead,
			behind,
			state:
				porcelain.length === 0 && ahead === 0 && behind === 0
					? "available"
					: "degraded",
			message:
				porcelain.length === 0 && ahead === 0 && behind === 0
					? null
					: "Repo posture needs attention before using this as a clean handoff baseline.",
			source_of_truth: repo.source_of_truth,
		};
	} catch (error) {
		return {
			name: repo.name,
			path: repo.path,
			branch: "",
			upstream: null,
			head: "",
			last_commit_subject: "",
			clean: false,
			ahead: 0,
			behind: 0,
			state: "unavailable",
			message: error instanceof Error ? error.message : String(error),
			source_of_truth: repo.source_of_truth,
		};
	}
}

function healthOverall(
	repos: CoordinationRepoSnapshot[],
	installCheck: InstallCheckReport,
	healthCheck: HealthCheckReport | null,
): CoordinationHealthSnapshot["overall"] {
	if (
		repos.some((repo) => repo.state === "unavailable") ||
		installCheck.state === "degraded" ||
		healthCheck?.state === "degraded"
	) {
		return "red";
	}
	if (
		repos.some((repo) => repo.state === "degraded") ||
		installCheck.state !== "ready" ||
		!healthCheck ||
		healthCheck.state !== "ready"
	) {
		return "yellow";
	}
	return "green";
}

function buildIssues(
	repos: CoordinationRepoSnapshot[],
	installCheck: InstallCheckReport,
	healthCheck: HealthCheckReport | null,
): string[] {
	const issues = repos
		.filter((repo) => repo.state !== "available")
		.map(
			(repo) => `${repo.name}: ${repo.message ?? "repo posture needs attention"}`,
		);
	if (installCheck.state !== "ready") {
		issues.push(`personal-ops install check is ${installCheck.state}`);
	}
	if (!healthCheck) {
		issues.push("personal-ops deep health is unavailable");
	} else if (healthCheck.state !== "ready") {
		issues.push(`personal-ops deep health is ${healthCheck.state}`);
	}
	return issues;
}

function buildNextActions(
	snapshot: Pick<CoordinationSnapshot, "health">,
): string[] {
	if (snapshot.health.overall === "green") {
		return [
			"Use this snapshot as the next Codex-to-ChatGPT packet input.",
			"Keep deeper automation deferred until the snapshot contract proves useful manually.",
		];
	}
	return [
		"Repair degraded or unavailable repo and health signals before treating this as a clean handoff baseline.",
		"Regenerate the snapshot after repairs.",
	];
}

export async function buildCoordinationSnapshot(
	paths: Paths,
	requestJson: JsonRequester,
	logger: Logger,
): Promise<CoordinationSnapshot> {
	const generatedAt = new Date().toISOString();
	const repos = ACTIVE_REPOS.map(collectRepoSnapshot);
	const installCheck = buildInstallCheckReport(paths);
	let healthCheck: HealthCheckReport | null = null;
	try {
		healthCheck = await buildHealthCheckReport(paths, requestJson, {
			deep: true,
			snapshotAgeLimitHours: 24,
		});
	} catch {
		healthCheck = null;
	}

	const portfolio = new PortfolioReader().getPortfolioHealth();
	const bridgeDb = new BridgeDbClient();
	let bridgeAvailable = false;
	try {
		bridgeAvailable = await bridgeDb.isAvailable();
	} finally {
		await bridgeDb.close();
	}

	const notificationHub = new NotificationHubClient(logger);
	const notificationHubHealthy = await notificationHub.isHealthy();
	const recentEvents = notificationHub.readRecentEvents(25);

	const health: CoordinationHealthSnapshot = {
		overall: healthOverall(repos, installCheck, healthCheck),
		install_check_state: installCheck.state,
		deep_health_state: healthCheck?.state ?? "unavailable",
		issues: buildIssues(repos, installCheck, healthCheck),
	};

	const snapshot: CoordinationSnapshot = {
		schema_version: "1.0.0",
		generated_at: generatedAt,
		machine: {
			hostname: os.hostname(),
			user: os.userInfo().username,
		},
		scope: {
			mode: "read_only",
			notion_lane: "deferred",
			description:
				"Derived coordination lens for the active local operating layer. It does not write to sibling systems and is not a source of truth.",
		},
		repos,
		sources: {
			github_repo_auditor: {
				name: "GithubRepoAuditor portfolio truth",
				state: portfolio.generated_at ? "available" : "unavailable",
				source_of_truth:
					"/Users/d/Projects/GithubRepoAuditor/output/portfolio-truth-latest.json",
				message: portfolio.briefing_line,
				generated_at: portfolio.generated_at || null,
				project_count: portfolio.project_count || null,
				briefing_line: portfolio.briefing_line || null,
			},
			bridge_db: {
				name: "bridge-db",
				state: bridgeAvailable ? "available" : "unavailable",
				source_of_truth: "/Users/d/Projects/bridge-db",
				message: bridgeAvailable
					? "bridge-db MCP runtime is reachable"
					: "bridge-db MCP runtime is not reachable",
			},
			notification_hub: {
				name: "notification-hub",
				state: notificationHubHealthy ? "available" : "degraded",
				source_of_truth:
					"http://127.0.0.1:9199/health and local events.jsonl",
				message: notificationHubHealthy
					? "notification-hub health endpoint is reachable"
					: "notification-hub health endpoint is not reachable",
				recent_event_count: recentEvents.length,
			},
			notion: {
				name: "Notion",
				state: "deferred",
				source_of_truth: "/Users/d/Notion and Notion workspace",
				message:
					"Notion is intentionally deferred in this lane because active Notion work is being handled separately.",
			},
		},
		health,
		next_actions: [],
	};
	snapshot.next_actions = buildNextActions(snapshot);
	return snapshot;
}

export function formatCoordinationSnapshot(
	snapshot: CoordinationSnapshot,
): string {
	const lines: string[] = [];
	lines.push("Coordination Snapshot");
	lines.push(`Generated: ${snapshot.generated_at}`);
	lines.push(`Overall: ${snapshot.health.overall}`);
	lines.push("");
	lines.push("Repos");
	for (const repo of snapshot.repos) {
		const sync =
			repo.upstream == null
				? "no upstream"
				: `${repo.ahead} ahead / ${repo.behind} behind`;
		lines.push(
			`- ${repo.name}: ${repo.clean ? "clean" : "dirty"}, ${repo.branch || "unknown branch"}, ${sync}, ${repo.head} ${repo.last_commit_subject}`,
		);
		if (repo.message) lines.push(`  ${repo.message}`);
	}
	lines.push("");
	lines.push("Sources");
	lines.push(
		`- GithubRepoAuditor: ${snapshot.sources.github_repo_auditor.state} (${snapshot.sources.github_repo_auditor.briefing_line ?? snapshot.sources.github_repo_auditor.message})`,
	);
	lines.push(
		`- bridge-db: ${snapshot.sources.bridge_db.state} (${snapshot.sources.bridge_db.message})`,
	);
	lines.push(
		`- notification-hub: ${snapshot.sources.notification_hub.state} (${snapshot.sources.notification_hub.message}; ${snapshot.sources.notification_hub.recent_event_count} recent events read)`,
	);
	lines.push(
		`- Notion: ${snapshot.sources.notion.state} (${snapshot.sources.notion.message})`,
	);
	lines.push("");
	lines.push("Health");
	lines.push(`- install check: ${snapshot.health.install_check_state}`);
	lines.push(`- deep health: ${snapshot.health.deep_health_state}`);
	if (snapshot.health.issues.length > 0) {
		lines.push("- issues:");
		for (const issue of snapshot.health.issues) lines.push(`  - ${issue}`);
	} else {
		lines.push("- issues: none");
	}
	lines.push("");
	lines.push("Next Actions");
	for (const action of snapshot.next_actions) lines.push(`- ${action}`);
	return `${lines.join("\n")}\n`;
}

function packetTimestamp(generatedAt: string): string {
	const date = new Date(generatedAt);
	if (Number.isNaN(date.getTime())) return "unknown-time";
	return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
}

function createdAtLine(generatedAt: string): string {
	const date = new Date(generatedAt);
	if (Number.isNaN(date.getTime())) return generatedAt;
	return date.toISOString();
}

function formatRepoFacts(snapshot: CoordinationSnapshot): string[] {
	return snapshot.repos.map((repo) => {
		const sync =
			repo.upstream == null
				? "no upstream"
				: `${repo.ahead} ahead / ${repo.behind} behind`;
		const state = repo.state === "available" ? "available" : repo.state;
		return `- \`${repo.name}\`: ${state}, ${repo.clean ? "clean" : "dirty"}, \`${repo.branch || "unknown branch"}\`, ${sync}, commit \`${repo.head} ${repo.last_commit_subject}\`.`;
	});
}

function formatSourceFacts(snapshot: CoordinationSnapshot): string[] {
	return [
		`- GithubRepoAuditor source: ${snapshot.sources.github_repo_auditor.state}; ${snapshot.sources.github_repo_auditor.briefing_line ?? snapshot.sources.github_repo_auditor.message}.`,
		`- bridge-db source: ${snapshot.sources.bridge_db.state}; ${snapshot.sources.bridge_db.message}.`,
		`- notification-hub source: ${snapshot.sources.notification_hub.state}; ${snapshot.sources.notification_hub.message}; ${snapshot.sources.notification_hub.recent_event_count} recent events read.`,
		`- Notion: ${snapshot.sources.notion.state}; ${snapshot.sources.notion.message}`,
	];
}

export function buildCoordinationBriefing(
	snapshot: CoordinationSnapshot,
): CoordinationBriefing {
	const packetId = `handoff-${packetTimestamp(snapshot.generated_at)}-coordination-snapshot`;
	const lines: string[] = [];
	lines.push("# Codex -> ChatGPT Handoff");
	lines.push("");
	lines.push(`Packet ID: ${packetId}`);
	lines.push(`Created: ${createdAtLine(snapshot.generated_at)}`);
	lines.push("Mode: General cross-tool coordination");
	lines.push("ChatGPT Project: Codex-ChatGPT");
	lines.push("");
	lines.push("## Setup");
	lines.push("");
	lines.push("- We are using the Codex app.");
	lines.push("- Codex is using the in-app browser tool.");
	lines.push("- The user is logged in to ChatGPT inside the Codex app browser.");
	lines.push("- ChatGPT contributes memory-based and strategic context.");
	lines.push("- Codex contributes verified local state and executes local work.");
	lines.push("- Repo evidence wins over ChatGPT memory.");
	lines.push("");
	lines.push("## Verified Local Facts");
	lines.push("");
	lines.push(
		"Codex generated this packet from the read-only Personal Ops coordination snapshot.",
	);
	lines.push("");
	lines.push("Snapshot summary:");
	lines.push("");
	lines.push(`- Snapshot schema: \`${snapshot.schema_version}\`.`);
	lines.push(`- Snapshot generated: ${snapshot.generated_at}.`);
	lines.push(`- Overall: ${snapshot.health.overall}.`);
	lines.push(
		`- Personal Ops health: install check ${snapshot.health.install_check_state}; deep health ${snapshot.health.deep_health_state}.`,
	);
	lines.push(
		`- Issues: ${snapshot.health.issues.length === 0 ? "none" : snapshot.health.issues.join("; ")}.`,
	);
	lines.push("");
	lines.push("Repos:");
	lines.push("");
	lines.push(...formatRepoFacts(snapshot));
	lines.push("");
	lines.push("Sources:");
	lines.push("");
	lines.push(...formatSourceFacts(snapshot));
	lines.push("");
	lines.push("Docs in Personal Ops:");
	lines.push("");
	lines.push("- `docs/CHATGPT-CODEX-HANDOFF.md`: handoff protocol.");
	lines.push(
		"- `docs/CROSS-PROJECT-COORDINATION.md`: ownership boundaries and source-of-truth order.",
	);
	lines.push(
		"- `docs/COORDINATION-SNAPSHOT-SCHEMA.md`: read-only v1 snapshot contract.",
	);
	lines.push(
		"- `docs/COORDINATION-BRIEFING.md`: read-only Markdown packet contract.",
	);
	lines.push("");
	lines.push("## Current Goal");
	lines.push("");
	lines.push(
		"Help us turn the latest coordination snapshot into the next practical Codex-to-ChatGPT loop while keeping Notion deferred for now.",
	);
	lines.push("");
	lines.push("## What Codex Needs From ChatGPT");
	lines.push("");
	lines.push("Please respond in this structure:");
	lines.push("");
	lines.push("# ChatGPT -> Codex Briefing");
	lines.push("");
	lines.push(`Packet response for: ${packetId}`);
	lines.push("");
	lines.push("## Memory-Based Context");
	lines.push("");
	lines.push(
		"What do you remember about the user's long-running preferences, project style, and coordination goals that matters here?",
	);
	lines.push("");
	lines.push("## Inferences Or Strategy");
	lines.push("");
	lines.push(
		"Given the verified snapshot, what is the best next coordination shape?",
	);
	lines.push("");
	lines.push("## Local Verification Still Needed");
	lines.push("");
	lines.push(
		"What should Codex verify locally before implementing anything else?",
	);
	lines.push("");
	lines.push("## Risks Or Cautions");
	lines.push("");
	lines.push(
		"What should we avoid so this does not become another source of truth, noisy dashboard, or premature automation layer?",
	);
	lines.push("");
	lines.push("## Recommended Next Codex Actions");
	lines.push("");
	lines.push(
		"Give 3 to 5 concrete next actions Codex can take in Personal Ops or the adjacent repos. Keep them small, durable, and repo-backed.",
	);
	lines.push("");
	lines.push("## Questions For The User");
	lines.push("");
	lines.push("Only include questions that materially affect sequencing.");
	lines.push("");
	lines.push("## Boundaries");
	lines.push("");
	lines.push("- Do not claim current local facts beyond what Codex provided.");
	lines.push("- Label memory-based context separately from inference.");
	lines.push(
		"- Treat this as guidance for Codex, not permission to execute local changes.",
	);
	lines.push(
		"- Keep command output summarized unless exact excerpts are necessary.",
	);
	lines.push("- Do not pull Notion into this lane; Notion is being handled separately.");
	lines.push("");
	return {
		packet_id: packetId,
		target: "chatgpt",
		created_at: snapshot.generated_at,
		mode: "general_cross_tool_coordination",
		source_snapshot: {
			schema_version: snapshot.schema_version,
			generated_at: snapshot.generated_at,
			overall: snapshot.health.overall,
		},
		markdown: `${lines.join("\n")}\n`,
	};
}

function asComparable(value: unknown): string | number | boolean | null {
	if (value === undefined) return null;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		value == null
	) {
		return value;
	}
	return JSON.stringify(value);
}

function pushChange(
	changes: CoordinationSnapshotDiffChange[],
	area: CoordinationSnapshotDiffChange["area"],
	name: string,
	field: string,
	before: unknown,
	after: unknown,
): void {
	const normalizedBefore = asComparable(before);
	const normalizedAfter = asComparable(after);
	if (normalizedBefore === normalizedAfter) return;
	changes.push({
		area,
		name,
		field,
		before: normalizedBefore,
		after: normalizedAfter,
	});
}

function repoByName(snapshot: CoordinationSnapshot): Map<string, CoordinationRepoSnapshot> {
	return new Map(snapshot.repos.map((repo) => [repo.name, repo]));
}

function compareRepos(
	changes: CoordinationSnapshotDiffChange[],
	previous: CoordinationSnapshot,
	current: CoordinationSnapshot,
): void {
	const previousRepos = repoByName(previous);
	const currentRepos = repoByName(current);
	const names = new Set([...previousRepos.keys(), ...currentRepos.keys()]);
	for (const name of [...names].sort()) {
		const before = previousRepos.get(name);
		const after = currentRepos.get(name);
		if (!before || !after) {
			pushChange(
				changes,
				"repo",
				name,
				"presence",
				before ? "present" : "missing",
				after ? "present" : "missing",
			);
			continue;
		}
		pushChange(changes, "repo", name, "state", before.state, after.state);
		pushChange(changes, "repo", name, "clean", before.clean, after.clean);
		pushChange(changes, "repo", name, "branch", before.branch, after.branch);
		pushChange(changes, "repo", name, "head", before.head, after.head);
		pushChange(changes, "repo", name, "ahead", before.ahead, after.ahead);
		pushChange(changes, "repo", name, "behind", before.behind, after.behind);
	}
}

function compareSources(
	changes: CoordinationSnapshotDiffChange[],
	previous: CoordinationSnapshot,
	current: CoordinationSnapshot,
): void {
	for (const key of ["bridge_db", "notion"] as const) {
		const before = previous.sources[key];
		const after = current.sources[key];
		pushChange(changes, "source", key, "state", before.state, after.state);
		pushChange(changes, "source", key, "message", before.message, after.message);
	}
	const beforePortfolio = previous.sources.github_repo_auditor;
	const afterPortfolio = current.sources.github_repo_auditor;
	pushChange(changes, "source", "github_repo_auditor", "state", beforePortfolio.state, afterPortfolio.state);
	pushChange(changes, "source", "github_repo_auditor", "message", beforePortfolio.message, afterPortfolio.message);
	pushChange(
		changes,
		"source",
		"github_repo_auditor",
		"generated_at",
		beforePortfolio.generated_at,
		afterPortfolio.generated_at,
	);
	pushChange(
		changes,
		"source",
		"github_repo_auditor",
		"project_count",
		beforePortfolio.project_count,
		afterPortfolio.project_count,
	);
	pushChange(
		changes,
		"source",
		"github_repo_auditor",
		"briefing_line",
		beforePortfolio.briefing_line,
		afterPortfolio.briefing_line,
	);
	const beforeNotifications = previous.sources.notification_hub;
	const afterNotifications = current.sources.notification_hub;
	pushChange(changes, "source", "notification_hub", "state", beforeNotifications.state, afterNotifications.state);
	pushChange(
		changes,
		"source",
		"notification_hub",
		"message",
		beforeNotifications.message,
		afterNotifications.message,
	);
	pushChange(
		changes,
		"source",
		"notification_hub",
		"recent_event_count",
		beforeNotifications.recent_event_count,
		afterNotifications.recent_event_count,
	);
}

function compareHealth(
	changes: CoordinationSnapshotDiffChange[],
	previous: CoordinationSnapshot,
	current: CoordinationSnapshot,
): void {
	pushChange(changes, "health", "overall", "overall", previous.health.overall, current.health.overall);
	pushChange(
		changes,
		"health",
		"install",
		"install_check_state",
		previous.health.install_check_state,
		current.health.install_check_state,
	);
	pushChange(
		changes,
		"health",
		"deep",
		"deep_health_state",
		previous.health.deep_health_state,
		current.health.deep_health_state,
	);
	pushChange(
		changes,
		"health",
		"issues",
		"issues",
		previous.health.issues.join("; "),
		current.health.issues.join("; "),
	);
}

export function buildCoordinationSnapshotDiff(
	previous: CoordinationSnapshot,
	current: CoordinationSnapshot,
): CoordinationSnapshotDiff {
	const changes: CoordinationSnapshotDiffChange[] = [];
	compareRepos(changes, previous, current);
	compareSources(changes, previous, current);
	compareHealth(changes, previous, current);
	const repoChanges = changes.filter((change) => change.area === "repo").length;
	const sourceChanges = changes.filter((change) => change.area === "source").length;
	const healthChanges = changes.filter((change) => change.area === "health").length;
	const nextActions =
		changes.length === 0
			? ["No coordination changes detected. A full ChatGPT packet is likely unnecessary."]
			: [
					"Review changed fields before asking ChatGPT for strategy.",
					"Use a full coordination briefing if any changed field affects sequencing or risk.",
				];
	return {
		schema_version: "1.0.0",
		generated_at: new Date().toISOString(),
		mode: "read_only",
		previous_snapshot: {
			generated_at: previous.generated_at,
			overall: previous.health.overall,
		},
		current_snapshot: {
			generated_at: current.generated_at,
			overall: current.health.overall,
		},
		summary: {
			total_changes: changes.length,
			repo_changes: repoChanges,
			source_changes: sourceChanges,
			health_changes: healthChanges,
		},
		changes,
		next_actions: nextActions,
	};
}

export function formatCoordinationSnapshotDiff(diff: CoordinationSnapshotDiff): string {
	const lines: string[] = [];
	lines.push("Coordination Snapshot Diff");
	lines.push(`Generated: ${diff.generated_at}`);
	lines.push(`Previous: ${diff.previous_snapshot.generated_at} (${diff.previous_snapshot.overall})`);
	lines.push(`Current: ${diff.current_snapshot.generated_at} (${diff.current_snapshot.overall})`);
	lines.push(
		`Changes: ${diff.summary.total_changes} total (${diff.summary.repo_changes} repo, ${diff.summary.source_changes} source, ${diff.summary.health_changes} health)`,
	);
	lines.push("");
	if (diff.changes.length === 0) {
		lines.push("Changed Fields");
		lines.push("- none");
	} else {
		lines.push("Changed Fields");
		for (const change of diff.changes) {
			lines.push(
				`- ${change.area}:${change.name}.${change.field}: ${String(change.before)} -> ${String(change.after)}`,
			);
		}
	}
	lines.push("");
	lines.push("Next Actions");
	for (const action of diff.next_actions) lines.push(`- ${action}`);
	return `${lines.join("\n")}\n`;
}
