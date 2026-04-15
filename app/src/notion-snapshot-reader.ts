import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SNAPSHOT_PATH = path.join(
	os.homedir(),
	".local/share/notion-os/project-snapshot.json",
);

const EXPECTED_SCHEMA_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
	return value === null || typeof value === "string";
}

// ---------------------------------------------------------------------------
// Raw schema types (for parsing/narrowing — no `any`)
// ---------------------------------------------------------------------------

interface RawSnapshot {
	schema_version: string;
	generated_at: string;
	project_count: number;
	projects: RawProject[];
}

interface RawProject {
	title: string;
	current_state: string;
	portfolio_call: string;
	category: string;
	operating_queue: string | null;
	next_review_date: string | null;
	evidence_freshness: string | null;
	overdue: boolean;
	needs_review: boolean;
	last_active: string;
	build_session_count: number;
	ship_readiness: string;
	biggest_blocker: string;
}

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface NotionProjectEntry {
	title: string;
	current_state: string;
	portfolio_call: string;
	category: string;
	operating_queue: string | null;
	next_review_date: string | null;
	evidence_freshness: string | null;
	overdue: boolean;
	needs_review: boolean;
	last_active: string;
	build_session_count: number;
	ship_readiness: string;
	biggest_blocker: string;
}

export interface NotionSnapshotSummary {
	available: boolean;
	generated_at: string;
	project_count: number;
	overdue_count: number;
	needs_review_count: number;
	overdue_projects: Array<{ title: string; next_review_date: string | null }>;
	briefing_line: string;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseProject(raw: unknown, index: number): RawProject {
	if (!isRecord(raw))
		throw new Error(`Project at index ${index} is not an object`);

	return {
		title: typeof raw["title"] === "string" ? raw["title"] : "",
		current_state:
			typeof raw["current_state"] === "string" ? raw["current_state"] : "",
		portfolio_call:
			typeof raw["portfolio_call"] === "string" ? raw["portfolio_call"] : "",
		category: typeof raw["category"] === "string" ? raw["category"] : "",
		operating_queue: isStringOrNull(raw["operating_queue"])
			? raw["operating_queue"]
			: null,
		next_review_date: isStringOrNull(raw["next_review_date"])
			? raw["next_review_date"]
			: null,
		evidence_freshness: isStringOrNull(raw["evidence_freshness"])
			? raw["evidence_freshness"]
			: null,
		overdue: raw["overdue"] === true,
		needs_review: raw["needs_review"] === true,
		last_active:
			typeof raw["last_active"] === "string" ? raw["last_active"] : "",
		build_session_count:
			typeof raw["build_session_count"] === "number"
				? raw["build_session_count"]
				: 0,
		ship_readiness:
			typeof raw["ship_readiness"] === "string" ? raw["ship_readiness"] : "",
		biggest_blocker:
			typeof raw["biggest_blocker"] === "string" ? raw["biggest_blocker"] : "",
	};
}

function parseSnapshot(raw: unknown): RawSnapshot {
	if (!isRecord(raw))
		throw new Error("project-snapshot JSON root must be an object");

	const schemaVersion =
		typeof raw["schema_version"] === "string" ? raw["schema_version"] : "";
	if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
		process.stderr.write(
			`[NotionSnapshotReader] Warning: unexpected schema_version "${schemaVersion}" (expected "${EXPECTED_SCHEMA_VERSION}")\n`,
		);
	}

	const projects = Array.isArray(raw["projects"])
		? raw["projects"].map((p, i) => parseProject(p, i))
		: [];

	return {
		schema_version: schemaVersion,
		generated_at:
			typeof raw["generated_at"] === "string" ? raw["generated_at"] : "",
		project_count:
			typeof raw["project_count"] === "number"
				? raw["project_count"]
				: projects.length,
		projects,
	};
}

// ---------------------------------------------------------------------------
// Staleness helpers
// ---------------------------------------------------------------------------

function hoursAgo(isoDate: string): number {
	if (!isoDate) return Number.POSITIVE_INFINITY;
	const ms = Date.now() - new Date(isoDate).getTime();
	return Math.floor(ms / (1000 * 60 * 60));
}

function stalenessLabel(isoDate: string): string {
	const h = hoursAgo(isoDate);
	if (!Number.isFinite(h)) return "unknown age";
	if (h < 1) return "< 1h ago";
	if (h === 1) return "1h ago";
	return `${h}h ago`;
}

// ---------------------------------------------------------------------------
// Unavailable sentinel
// ---------------------------------------------------------------------------

function unavailableSummary(): NotionSnapshotSummary {
	return {
		available: false,
		generated_at: "",
		project_count: 0,
		overdue_count: 0,
		needs_review_count: 0,
		overdue_projects: [],
		briefing_line: "Notion project snapshot not available",
	};
}

// ---------------------------------------------------------------------------
// NotionSnapshotReader
// ---------------------------------------------------------------------------

export class NotionSnapshotReader {
	constructor(private readonly snapshotPath: string = SNAPSHOT_PATH) {}

	isAvailable(): boolean {
		try {
			return fs.existsSync(this.snapshotPath);
		} catch (err) {
			process.stderr.write(
				`[NotionSnapshotReader] isAvailable check failed: ${String(err)}\n`,
			);
			return false;
		}
	}

	/** Full snapshot for the MCP tool. Returns null if unavailable or unparseable. */
	getSnapshot(): {
		generated_at: string;
		project_count: number;
		projects: NotionProjectEntry[];
	} | null {
		if (!this.isAvailable()) return null;

		let raw: unknown;
		try {
			const content = fs.readFileSync(this.snapshotPath, "utf-8");
			raw = JSON.parse(content);
		} catch (err) {
			process.stderr.write(
				`[NotionSnapshotReader] Failed to read/parse snapshot file: ${String(err)}\n`,
			);
			return null;
		}

		let snapshot: RawSnapshot;
		try {
			snapshot = parseSnapshot(raw);
		} catch (err) {
			process.stderr.write(
				`[NotionSnapshotReader] Snapshot schema validation failed: ${String(err)}\n`,
			);
			return null;
		}

		return {
			generated_at: snapshot.generated_at,
			project_count: snapshot.project_count,
			projects: snapshot.projects,
		};
	}

	/** Summary for the morning briefing. Never throws — returns unavailable sentinel on any error. */
	getSummary(): NotionSnapshotSummary {
		if (!this.isAvailable()) return unavailableSummary();

		let raw: unknown;
		try {
			const content = fs.readFileSync(this.snapshotPath, "utf-8");
			raw = JSON.parse(content);
		} catch (err) {
			process.stderr.write(
				`[NotionSnapshotReader] Failed to read/parse snapshot file: ${String(err)}\n`,
			);
			return unavailableSummary();
		}

		let snapshot: RawSnapshot;
		try {
			snapshot = parseSnapshot(raw);
		} catch (err) {
			process.stderr.write(
				`[NotionSnapshotReader] Snapshot schema validation failed: ${String(err)}\n`,
			);
			return unavailableSummary();
		}

		const overdueProjects = snapshot.projects
			.filter((p) => p.overdue)
			.map((p) => ({ title: p.title, next_review_date: p.next_review_date }));

		const needsReviewCount = snapshot.projects.filter(
			(p) => p.needs_review,
		).length;

		const staleness = stalenessLabel(snapshot.generated_at);
		const briefingLine = `${overdueProjects.length} overdue, ${needsReviewCount} need review (snapshot ${staleness})`;

		return {
			available: true,
			generated_at: snapshot.generated_at,
			project_count: snapshot.project_count,
			overdue_count: overdueProjects.length,
			needs_review_count: needsReviewCount,
			overdue_projects: overdueProjects,
			briefing_line: briefingLine,
		};
	}
}
