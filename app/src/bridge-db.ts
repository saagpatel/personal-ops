import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const BRIDGE_DB_PATH = path.join(
	os.homedir(),
	".local/share/bridge-db/bridge.db",
);

export interface BridgeActivityEntry {
	id: number;
	source: "cc" | "codex" | "claude_ai";
	timestamp: string;
	project_name: string;
	summary: string;
	branch: string | null;
	tags: string[];
	created_at: string;
}

export interface BridgeCostRecord {
	id: number;
	system: "cc" | "codex";
	month: string;
	amount: number;
	notes: string | null;
	recorded_at: string;
}

export interface BridgeHandoff {
	id: number;
	project_name: string;
	project_path: string | null;
	roadmap_file: string | null;
	phase: string | null;
	dispatched_from: string;
	dispatched_at: string;
	picked_up_at: string | null;
	cleared_at: string | null;
	status: "pending" | "active" | "cleared";
}

export interface AiActivitySummary {
	/** YYYY-MM of the current month */
	current_month: string;
	/** Monthly cost totals per system */
	monthly_costs: Array<{ system: string; month: string; amount_usd: number }>;
	/** Activity entries for the past N days */
	recent_activity: BridgeActivityEntry[];
	/** Pending or active handoffs */
	open_handoffs: BridgeHandoff[];
	/** Compact one-line summary for briefings */
	briefing_line: string;
}

/**
 * Read-only client for the bridge-db SQLite database.
 * Opens a fresh connection per query — bridge-db is written by other processes
 * so we never hold a long-lived connection.
 */
export class BridgeDbClient {
	private readonly dbPath: string;

	constructor(dbPath: string = BRIDGE_DB_PATH) {
		this.dbPath = dbPath;
	}

	isAvailable(): boolean {
		return fs.existsSync(this.dbPath);
	}

	/**
	 * Summarise AI session activity for the current and previous month,
	 * recent activity log entries, and open handoffs.
	 */
	getActivitySummary(activityDays = 7): AiActivitySummary {
		if (!this.isAvailable()) {
			return this.unavailableSummary();
		}

		const db = new DatabaseSync(this.dbPath, { open: true });
		try {
			const now = new Date();
			const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
			const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

			// Monthly costs — current and previous month
			const costRows = db
				.prepare(
					"SELECT id, system, month, amount, notes, recorded_at FROM cost_records WHERE month IN (?, ?) ORDER BY month DESC",
				)
				.all(currentMonth, prevMonthStr) as Array<{
				id: number;
				system: string;
				month: string;
				amount: number;
				notes: string | null;
				recorded_at: string;
			}>;

			const monthly_costs = costRows.map((r) => ({
				system: r.system,
				month: r.month,
				amount_usd: r.amount,
			}));

			// Recent activity
			const cutoff = new Date(now);
			cutoff.setDate(cutoff.getDate() - activityDays);
			const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

			const activityRows = db
				.prepare(
					"SELECT id, source, timestamp, project_name, summary, branch, tags, created_at FROM activity_log WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 50",
				)
				.all(cutoffStr) as Array<{
				id: number;
				source: string;
				timestamp: string;
				project_name: string;
				summary: string;
				branch: string | null;
				tags: string;
				created_at: string;
			}>;

			const recent_activity: BridgeActivityEntry[] = activityRows.map((r) => ({
				id: r.id,
				source: r.source as "cc" | "codex" | "claude_ai",
				timestamp: r.timestamp,
				project_name: r.project_name,
				summary: r.summary,
				branch: r.branch,
				tags: JSON.parse(r.tags || "[]") as string[],
				created_at: r.created_at,
			}));

			// Open handoffs
			const handoffRows = db
				.prepare(
					"SELECT id, project_name, project_path, roadmap_file, phase, dispatched_from, dispatched_at, picked_up_at, cleared_at, status FROM pending_handoffs WHERE status IN ('pending', 'active') ORDER BY dispatched_at DESC",
				)
				.all() as Array<{
				id: number;
				project_name: string;
				project_path: string | null;
				roadmap_file: string | null;
				phase: string | null;
				dispatched_from: string;
				dispatched_at: string;
				picked_up_at: string | null;
				cleared_at: string | null;
				status: string;
			}>;

			const open_handoffs: BridgeHandoff[] = handoffRows.map((r) => ({
				id: r.id,
				project_name: r.project_name,
				project_path: r.project_path,
				roadmap_file: r.roadmap_file,
				phase: r.phase,
				dispatched_from: r.dispatched_from,
				dispatched_at: r.dispatched_at,
				picked_up_at: r.picked_up_at,
				cleared_at: r.cleared_at,
				status: r.status as "pending" | "active" | "cleared",
			}));

			const briefing_line = this.buildBriefingLine(
				monthly_costs,
				recent_activity,
				open_handoffs,
				currentMonth,
			);

			return {
				current_month: currentMonth,
				monthly_costs,
				recent_activity,
				open_handoffs,
				briefing_line,
			};
		} finally {
			db.close();
		}
	}

	/**
	 * Query activity_log with optional filters for AI session memory.
	 */
	searchActivity(options: {
		query?: string;
		project?: string;
		days?: number;
		limit?: number;
	}): Array<{
		id: number;
		source: string;
		timestamp: string;
		project_name: string;
		summary: string;
		branch: string | null;
		tags: string[];
	}> {
		if (!this.isAvailable()) return [];
		const db = new DatabaseSync(this.dbPath, { open: true });
		try {
			const days = options.days ?? 30;
			const limit = Math.min(options.limit ?? 50, 200);
			const cutoff = new Date(
				Date.now() - days * 24 * 60 * 60 * 1000,
			).toISOString();
			const conditions: string[] = ["timestamp >= ?"];
			const params: (string | number)[] = [cutoff];
			if (options.project) {
				conditions.push("project_name LIKE ?");
				params.push(`%${options.project}%`);
			}
			if (options.query) {
				conditions.push("(summary LIKE ? OR project_name LIKE ?)");
				params.push(`%${options.query}%`, `%${options.query}%`);
			}
			params.push(limit);
			const rows = db
				.prepare(
					`SELECT id, source, timestamp, project_name, summary, branch, tags
					 FROM activity_log
					 WHERE ${conditions.join(" AND ")}
					 ORDER BY timestamp DESC
					 LIMIT ?`,
				)
				.all(...params) as Array<{
				id: number;
				source: string;
				timestamp: string;
				project_name: string;
				summary: string;
				branch: string | null;
				tags: string;
			}>;
			return rows.map((r) => ({
				...r,
				tags: JSON.parse(r.tags || "[]") as string[],
			}));
		} finally {
			db.close();
		}
	}

	/**
	 * Aggregate activity_log by project for the morning briefing AI yesterday section.
	 */
	getProjectSummary(days: number): Array<{
		project_name: string;
		session_count: number;
		latest: string;
	}> {
		if (!this.isAvailable()) return [];
		const db = new DatabaseSync(this.dbPath, { open: true });
		try {
			const cutoff = new Date(
				Date.now() - days * 24 * 60 * 60 * 1000,
			).toISOString();
			return db
				.prepare(
					`SELECT project_name, COUNT(*) AS session_count, MAX(timestamp) AS latest
					 FROM activity_log
					 WHERE timestamp >= ?
					 GROUP BY project_name
					 ORDER BY latest DESC
					 LIMIT 20`,
				)
				.all(cutoff) as Array<{
				project_name: string;
				session_count: number;
				latest: string;
			}>;
		} finally {
			db.close();
		}
	}

	private buildBriefingLine(
		costs: Array<{ system: string; month: string; amount_usd: number }>,
		activity: BridgeActivityEntry[],
		handoffs: BridgeHandoff[],
		currentMonth: string,
	): string {
		const parts: string[] = [];

		// Cost for current month
		const thisMonthCosts = costs.filter((c) => c.month === currentMonth);
		if (thisMonthCosts.length > 0) {
			const total = thisMonthCosts.reduce((sum, c) => sum + c.amount_usd, 0);
			parts.push(`AI ${currentMonth}: $${total.toFixed(0)}`);
		}

		// Session count from recent activity (last 7 days)
		if (activity.length > 0) {
			const projectSet = new Set(activity.map((a) => a.project_name));
			parts.push(
				`${activity.length} sessions · ${projectSet.size} projects this week`,
			);
		}

		// Handoffs
		if (handoffs.length > 0) {
			parts.push(
				`${handoffs.length} handoff${handoffs.length === 1 ? "" : "s"} pending`,
			);
		}

		return parts.length > 0 ? parts.join(" · ") : "No AI activity recorded";
	}

	private unavailableSummary(): AiActivitySummary {
		const now = new Date();
		const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		return {
			current_month: currentMonth,
			monthly_costs: [],
			recent_activity: [],
			open_handoffs: [],
			briefing_line: "bridge-db not available",
		};
	}
}
