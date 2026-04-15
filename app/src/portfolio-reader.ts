import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORTFOLIO_PATH = path.join(
	os.homedir(),
	"Projects/GithubRepoAuditor/output/portfolio-truth-latest.json",
);

// ---------------------------------------------------------------------------
// Context-quality rank (lower = weaker)
// ---------------------------------------------------------------------------

const CONTEXT_QUALITY_RANK: Record<string, number> = {
	none: 0,
	boilerplate: 1,
	"minimum-viable": 2,
	standard: 3,
	full: 4,
};

// ---------------------------------------------------------------------------
// Raw schema types (for parsing/narrowing — no `any`)
// ---------------------------------------------------------------------------

interface RawIdentity {
	project_key: string;
	display_name: string;
	path: string;
	top_level_dir: string;
	group_label: string;
}

interface RawDeclared {
	lifecycle_state: string;
	criticality: string;
	maturity_program: string;
	category: string;
	[key: string]: unknown;
}

interface RawDerived {
	stack: string[];
	context_quality: string;
	activity_status: string;
	registry_status: string;
	last_meaningful_activity_at: string | null;
	path_override: string;
	path_confidence: string;
	[key: string]: unknown;
}

interface RawProject {
	identity: RawIdentity;
	declared: RawDeclared;
	derived: RawDerived;
	warnings: string[];
}

interface RawSourceSummary {
	project_count: number;
	context_quality_counts: Record<string, number>;
	registry_status_counts: Record<string, number>;
	catalog_errors: string[];
	catalog_warnings: string[];
	[key: string]: unknown;
}

interface RawPortfolio {
	schema_version: string;
	generated_at: string;
	workspace_root: string;
	source_summary: RawSourceSummary;
	projects: RawProject[];
}

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface PortfolioProjectSummary {
	display_name: string;
	project_key: string;
	activity_status: string;
	registry_status: string;
	context_quality: string;
	last_activity_at: string | null;
	criticality: string;
	stack: string[];
	warnings: string[];
}

export interface PortfolioHealth {
	generated_at: string;
	project_count: number;
	registry_status_counts: Record<string, number>;
	context_quality_counts: Record<string, number>;
	/** Top 3 stalest non-archived projects (oldest last_meaningful_activity_at first) */
	stalest_projects: PortfolioProjectSummary[];
	/** Top 3 active/recent projects with weakest context quality */
	weakest_context_projects: PortfolioProjectSummary[];
	/** One-line briefing for morning summary */
	briefing_line: string;
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isStringOrNull(value: unknown): value is string | null {
	return value === null || typeof value === "string";
}

function isStringRecord(value: unknown): value is Record<string, number> {
	if (!isRecord(value)) return false;
	return Object.values(value).every((v) => typeof v === "number");
}

function parseIdentity(raw: unknown): RawIdentity {
	if (!isRecord(raw)) throw new Error("Invalid identity block");
	return {
		project_key:
			typeof raw["project_key"] === "string" ? raw["project_key"] : "",
		display_name:
			typeof raw["display_name"] === "string" ? raw["display_name"] : "",
		path: typeof raw["path"] === "string" ? raw["path"] : "",
		top_level_dir:
			typeof raw["top_level_dir"] === "string" ? raw["top_level_dir"] : "",
		group_label:
			typeof raw["group_label"] === "string" ? raw["group_label"] : "",
	};
}

function parseDeclared(raw: unknown): RawDeclared {
	if (!isRecord(raw)) throw new Error("Invalid declared block");
	return {
		lifecycle_state:
			typeof raw["lifecycle_state"] === "string" ? raw["lifecycle_state"] : "",
		criticality:
			typeof raw["criticality"] === "string" ? raw["criticality"] : "",
		maturity_program:
			typeof raw["maturity_program"] === "string"
				? raw["maturity_program"]
				: "",
		category: typeof raw["category"] === "string" ? raw["category"] : "",
		...raw,
	};
}

function parseDerived(raw: unknown): RawDerived {
	if (!isRecord(raw)) throw new Error("Invalid derived block");
	const stack = isStringArray(raw["stack"]) ? raw["stack"] : [];
	const last = isStringOrNull(raw["last_meaningful_activity_at"])
		? raw["last_meaningful_activity_at"]
		: null;
	return {
		stack,
		context_quality:
			typeof raw["context_quality"] === "string"
				? raw["context_quality"]
				: "none",
		activity_status:
			typeof raw["activity_status"] === "string" ? raw["activity_status"] : "",
		registry_status:
			typeof raw["registry_status"] === "string" ? raw["registry_status"] : "",
		last_meaningful_activity_at: last,
		path_override:
			typeof raw["path_override"] === "string" ? raw["path_override"] : "",
		path_confidence:
			typeof raw["path_confidence"] === "string" ? raw["path_confidence"] : "",
		...raw,
	};
}

function parseProject(raw: unknown): RawProject {
	if (!isRecord(raw)) throw new Error("Invalid project entry");
	const warnings = isStringArray(raw["warnings"]) ? raw["warnings"] : [];
	return {
		identity: parseIdentity(raw["identity"]),
		declared: parseDeclared(raw["declared"]),
		derived: parseDerived(raw["derived"]),
		warnings,
	};
}

function parsePortfolio(raw: unknown): RawPortfolio {
	if (!isRecord(raw))
		throw new Error("portfolio-truth JSON root must be an object");

	const ss = raw["source_summary"];
	if (!isRecord(ss)) throw new Error("Missing source_summary");

	const projects = Array.isArray(raw["projects"])
		? raw["projects"].map((p, i) => {
				try {
					return parseProject(p);
				} catch (err) {
					throw new Error(`Project at index ${i}: ${String(err)}`);
				}
			})
		: [];

	return {
		schema_version:
			typeof raw["schema_version"] === "string" ? raw["schema_version"] : "",
		generated_at:
			typeof raw["generated_at"] === "string" ? raw["generated_at"] : "",
		workspace_root:
			typeof raw["workspace_root"] === "string" ? raw["workspace_root"] : "",
		source_summary: {
			project_count:
				typeof ss["project_count"] === "number"
					? ss["project_count"]
					: projects.length,
			context_quality_counts: isStringRecord(ss["context_quality_counts"])
				? ss["context_quality_counts"]
				: {},
			registry_status_counts: isStringRecord(ss["registry_status_counts"])
				? ss["registry_status_counts"]
				: {},
			catalog_errors: isStringArray(ss["catalog_errors"])
				? ss["catalog_errors"]
				: [],
			catalog_warnings: isStringArray(ss["catalog_warnings"])
				? ss["catalog_warnings"]
				: [],
		},
		projects,
	};
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function toSummary(p: RawProject): PortfolioProjectSummary {
	return {
		display_name: p.identity.display_name,
		project_key: p.identity.project_key,
		activity_status: p.derived.activity_status,
		registry_status: p.derived.registry_status,
		context_quality: p.derived.context_quality,
		last_activity_at: p.derived.last_meaningful_activity_at,
		criticality: p.declared.criticality,
		stack: p.derived.stack,
		warnings: p.warnings,
	};
}

function buildBriefingLine(
	portfolio: RawPortfolio,
	stalest: PortfolioProjectSummary[],
): string {
	const ss = portfolio.source_summary;
	const total = ss.project_count;
	const parked = ss.registry_status_counts["parked"] ?? 0;
	const active =
		(ss.registry_status_counts["active"] ?? 0) +
		(ss.registry_status_counts["in-progress"] ?? 0);
	const stale = Object.values(
		// count projects whose activity_status is "stale"
		portfolio.projects.reduce<Record<string, number>>((acc, p) => {
			if (p.derived.activity_status === "stale") acc["n"] = (acc["n"] ?? 0) + 1;
			return acc;
		}, {}),
	).reduce((a, b) => a + b, 0);

	let line = `${total} repos · ${parked} parked · ${active} active · ${stale} stale`;

	const oldestStale = stalest.find((p) => p.activity_status === "stale");
	if (oldestStale && oldestStale.last_activity_at) {
		const dateStr = oldestStale.last_activity_at.slice(0, 10);
		line += ` · oldest: ${oldestStale.display_name} (${dateStr})`;
	}

	return line;
}

// ---------------------------------------------------------------------------
// Unavailable sentinel
// ---------------------------------------------------------------------------

function unavailableHealth(): PortfolioHealth {
	return {
		generated_at: "",
		project_count: 0,
		registry_status_counts: {},
		context_quality_counts: {},
		stalest_projects: [],
		weakest_context_projects: [],
		briefing_line: "portfolio data not available",
	};
}

// ---------------------------------------------------------------------------
// PortfolioReader
// ---------------------------------------------------------------------------

export class PortfolioReader {
	constructor(private readonly portfolioPath: string = PORTFOLIO_PATH) {}

	isAvailable(): boolean {
		try {
			return fs.existsSync(this.portfolioPath);
		} catch (err) {
			console.error("[PortfolioReader] isAvailable check failed:", err);
			return false;
		}
	}

	getPortfolioHealth(): PortfolioHealth {
		if (!this.isAvailable()) {
			return unavailableHealth();
		}

		let raw: unknown;
		try {
			const content = fs.readFileSync(this.portfolioPath, "utf-8");
			raw = JSON.parse(content);
		} catch (err) {
			console.error(
				"[PortfolioReader] Failed to read/parse portfolio file:",
				err,
			);
			return unavailableHealth();
		}

		let portfolio: RawPortfolio;
		try {
			portfolio = parsePortfolio(raw);
		} catch (err) {
			console.error(
				"[PortfolioReader] Portfolio schema validation failed:",
				err,
			);
			return unavailableHealth();
		}

		// stalest_projects: stale or recent, non-archived, sorted by last_meaningful_activity_at asc
		const stalestCandidates = portfolio.projects
			.filter(
				(p) =>
					p.derived.activity_status === "stale" ||
					p.derived.activity_status === "recent",
			)
			.sort((a, b) => {
				const ta = a.derived.last_meaningful_activity_at ?? "";
				const tb = b.derived.last_meaningful_activity_at ?? "";
				if (ta < tb) return -1;
				if (ta > tb) return 1;
				return 0;
			})
			.slice(0, 3)
			.map(toSummary);

		// weakest_context_projects: active or recent, weak context quality, sorted by rank asc
		const weakContextCandidates = portfolio.projects
			.filter(
				(p) =>
					(p.derived.activity_status === "active" ||
						p.derived.activity_status === "recent") &&
					(p.derived.context_quality === "none" ||
						p.derived.context_quality === "boilerplate" ||
						p.derived.context_quality === "minimum-viable"),
			)
			.sort((a, b) => {
				const ra = CONTEXT_QUALITY_RANK[a.derived.context_quality] ?? 0;
				const rb = CONTEXT_QUALITY_RANK[b.derived.context_quality] ?? 0;
				return ra - rb;
			})
			.slice(0, 3)
			.map(toSummary);

		const briefingLine = buildBriefingLine(portfolio, stalestCandidates);

		return {
			generated_at: portfolio.generated_at,
			project_count: portfolio.source_summary.project_count,
			registry_status_counts: portfolio.source_summary.registry_status_counts,
			context_quality_counts: portfolio.source_summary.context_quality_counts,
			stalest_projects: stalestCandidates,
			weakest_context_projects: weakContextCandidates,
			briefing_line: briefingLine,
		};
	}
}
