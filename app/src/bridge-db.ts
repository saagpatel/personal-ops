import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types (unchanged public API)
// ---------------------------------------------------------------------------

export interface BridgeActivityEntry {
	id: number;
	source: "cc" | "codex" | "claude_ai" | "personal_ops";
	timestamp: string;
	project_name: string;
	summary: string;
	branch: string | null;
	tags: string[];
	created_at: string;
}

export interface BridgeActivitySearchEntry {
	id: number;
	source: string;
	timestamp: string;
	project_name: string;
	summary: string;
	branch: string | null;
	tags: string[];
}

export interface BridgeProjectSummaryEntry {
	project_name: string;
	session_count: number;
	latest: string;
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

export interface BridgeContextSection {
	section_name: string;
	owner: string;
	content: string;
	updated_at: string;
}

export interface BridgeDbClientLike {
	close(): Promise<void>;
	getActivitySummary(days?: number): Promise<AiActivitySummary>;
	searchActivity(options?: {
		query?: string;
		project?: string;
		days?: number;
		limit?: number;
	}): Promise<BridgeActivitySearchEntry[]>;
	getProjectSummary(days?: number): Promise<BridgeProjectSummaryEntry[]>;
	getContextSections(): Promise<BridgeContextSection[]>;
	logActivity(
		projectName: string,
		summary: string,
		tags: string[],
		branch?: string | null,
	): void;
	recordCost(system: string, month: string, amount: number): void;
	saveSnapshot(data: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseJsonSafe<T>(text: unknown, fallback: T): T {
	if (typeof text !== "string") return fallback;
	try {
		return JSON.parse(text) as T;
	} catch {
		return fallback;
	}
}

function toolResultData<T>(result: unknown, fallback: T): T {
	const structured = (result as { structuredContent?: { result?: unknown } } | null)
		?.structuredContent;
	if (structured && Object.hasOwn(structured, "result")) {
		return structured.result as T;
	}
	const content =
		(result as { content?: Array<{ type: string; text?: string }> } | null)
			?.content ?? [];
	const texts = content
		.filter((entry) => entry.type === "text" && typeof entry.text === "string")
		.map((entry) => entry.text as string);
	if (texts.length === 0) {
		return fallback;
	}
	if (texts.length === 1) {
		return parseJsonSafe<T>(texts[0], fallback);
	}
	return texts.map((text) => parseJsonSafe<unknown>(text, null)) as T;
}

function currentMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function sinceDate(days: number): string {
	const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
	return d.toISOString().slice(0, 10);
}

function buildBriefingLine(
	costs: Array<{ system: string; month: string; amount_usd: number }>,
	activity: BridgeActivityEntry[],
	handoffs: BridgeHandoff[],
	month: string,
): string {
	const parts: string[] = [];
	const thisMonthCosts = costs.filter((c) => c.month === month);
	if (thisMonthCosts.length > 0) {
		const total = thisMonthCosts.reduce((sum, c) => sum + c.amount_usd, 0);
		parts.push(`AI ${month}: $${total.toFixed(0)}`);
	}
	if (activity.length > 0) {
		const projectSet = new Set(activity.map((a) => a.project_name));
		parts.push(
			`${activity.length} sessions · ${projectSet.size} projects this week`,
		);
	}
	if (handoffs.length > 0) {
		parts.push(
			`${handoffs.length} handoff${handoffs.length === 1 ? "" : "s"} pending`,
		);
	}
	return parts.length > 0 ? parts.join(" · ") : "No AI activity recorded";
}

function unavailableSummary(): AiActivitySummary {
	const month = currentMonth();
	return {
		current_month: month,
		monthly_costs: [],
		recent_activity: [],
		open_handoffs: [],
		briefing_line: "bridge-db not available",
	};
}

function uvCommand(): string {
	const configured = process.env["BRIDGE_DB_UV"] ?? process.env["UV_EXECUTABLE"];
	if (configured) return configured;
	for (const candidate of ["/opt/homebrew/bin/uv", "/usr/local/bin/uv"]) {
		if (existsSync(candidate)) return candidate;
	}
	return "uv";
}

// ---------------------------------------------------------------------------
// BridgeDbClient — long-lived MCP subprocess, one connection per daemon
// ---------------------------------------------------------------------------

export class BridgeDbClient implements BridgeDbClientLike {
	private mcpClient: Client | null = null;
	private connectPromise: Promise<Client> | null = null;

	protected async ensureConnected(): Promise<Client> {
		if (this.mcpClient) return this.mcpClient;
		if (this.connectPromise) return this.connectPromise;

		this.connectPromise = (async () => {
			const bridgeDbDir =
				process.env["BRIDGE_DB_DIR"] ?? "/Users/d/Projects/bridge-db";
			const transport = new StdioClientTransport({
				command: uvCommand(),
				args: ["run", "--directory", bridgeDbDir, "python", "-m", "bridge_db"],
			});
			const client = new Client(
				{ name: "personal-ops", version: "1.0" },
				{ capabilities: {} },
			);
			await client.connect(transport);
			this.mcpClient = client;
			this.connectPromise = null;
			return client;
		})();

		try {
			return await this.connectPromise;
		} catch (error) {
			this.connectPromise = null;
			throw error;
		}
	}

	async isAvailable(): Promise<boolean> {
		try {
			await this.ensureConnected();
			return true;
		} catch {
			return false;
		}
	}

	async close(): Promise<void> {
		if (this.mcpClient) {
			try {
				await this.mcpClient.close();
			} finally {
				this.mcpClient = null;
			}
		}
	}

	// -------------------------------------------------------------------------
	// Read methods
	// -------------------------------------------------------------------------

	/**
	 * Summarise AI session activity for the current and previous month,
	 * recent activity log entries, and open handoffs.
	 */
	async getActivitySummary(activityDays = 7): Promise<AiActivitySummary> {
		try {
			const client = await this.ensureConnected();
			const month = currentMonth();
			const prevMonthDate = new Date();
			prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
			const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

			const [costsResult, activityResult, handoffsResult] = await Promise.all([
				client.callTool({ name: "get_cost_history", arguments: { limit: 24 } }),
				client.callTool({
					name: "get_recent_activity",
					arguments: { since: sinceDate(activityDays), limit: 50 },
				}),
				client.callTool({ name: "get_pending_handoffs", arguments: {} }),
			]);

			const costsRaw = toolResultData<
				Array<{
					system: string;
					month: string;
					amount: number;
					notes: string | null;
					recorded_at: string;
				}>
			>(costsResult, []);

			const monthly_costs = costsRaw
				.filter((r) => r.month === month || r.month === prevMonth)
				.map((r) => ({
					system: r.system,
					month: r.month,
					amount_usd: r.amount,
				}));

			const activityRaw = toolResultData<
				Array<{
					id: number;
					source: string;
					timestamp: string;
					project_name: string;
					summary: string;
					branch: string | null;
					tags: string[];
					created_at: string;
				}>
			>(activityResult, []);

			const recent_activity: BridgeActivityEntry[] = activityRaw.map((r) => ({
				id: r.id,
				source: r.source as BridgeActivityEntry["source"],
				timestamp: r.timestamp,
				project_name: r.project_name,
				summary: r.summary,
				branch: r.branch,
				tags: Array.isArray(r.tags) ? r.tags : [],
				created_at: r.created_at,
			}));

			const handoffsRaw = toolResultData<
				Array<{
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
				}>
			>(handoffsResult, []);

			const open_handoffs: BridgeHandoff[] = handoffsRaw.map((r) => ({
				id: r.id,
				project_name: r.project_name,
				project_path: r.project_path,
				roadmap_file: r.roadmap_file,
				phase: r.phase,
				dispatched_from: r.dispatched_from,
				dispatched_at: r.dispatched_at,
				picked_up_at: r.picked_up_at,
				cleared_at: r.cleared_at,
				status: r.status as BridgeHandoff["status"],
			}));

			const briefing_line = buildBriefingLine(
				monthly_costs,
				recent_activity,
				open_handoffs,
				month,
			);

			return {
				current_month: month,
				monthly_costs,
				recent_activity,
				open_handoffs,
				briefing_line,
			};
		} catch (err) {
			console.error("[bridge-db] getActivitySummary failed:", err);
			return unavailableSummary();
		}
	}

	/**
	 * Query activity_log with optional filters for AI session memory.
	 */
	async searchActivity(options: {
		query?: string;
		project?: string;
		days?: number;
		limit?: number;
	} = {}): Promise<BridgeActivitySearchEntry[]> {
		try {
			const client = await this.ensureConnected();
			const days = options.days ?? 30;
			const limit = Math.min(options.limit ?? 50, 200);
			const args: Record<string, unknown> = {
				since: sinceDate(days),
				limit,
			};

			const result = await client.callTool({
				name: "get_recent_activity",
				arguments: args,
			});

			const rows = toolResultData<
				Array<{
					id: number;
					source: string;
					timestamp: string;
					project_name: string;
					summary: string;
					branch: string | null;
					tags: string[];
				}>
			>(result, []);

			return rows
				.filter((r) => {
					if (
						options.project &&
						!r.project_name
							.toLowerCase()
							.includes(options.project.toLowerCase())
					)
						return false;
					if (
						options.query &&
						!r.summary.toLowerCase().includes(options.query.toLowerCase()) &&
						!r.project_name.toLowerCase().includes(options.query.toLowerCase())
					)
						return false;
					return true;
				})
				.slice(0, limit)
				.map((r) => ({
					...r,
					tags: Array.isArray(r.tags) ? r.tags : [],
				}));
		} catch (err) {
			console.error("[bridge-db] searchActivity failed:", err);
			return [];
		}
	}

	/**
	 * Aggregate activity_log by project for the morning briefing AI yesterday section.
	 */
	async getProjectSummary(
		days = 7,
	): Promise<BridgeProjectSummaryEntry[]> {
		try {
			const client = await this.ensureConnected();
			const result = await client.callTool({
				name: "get_recent_activity",
				arguments: { since: sinceDate(days), limit: 200 },
			});

			const rows = toolResultData<
				Array<{ project_name: string; timestamp: string }>
			>(result, []);

			// Group client-side
			const projectMap = new Map<string, { count: number; latest: string }>();
			for (const r of rows) {
				const existing = projectMap.get(r.project_name);
				if (!existing) {
					projectMap.set(r.project_name, { count: 1, latest: r.timestamp });
				} else {
					existing.count += 1;
					if (r.timestamp > existing.latest) existing.latest = r.timestamp;
				}
			}

			return Array.from(projectMap.entries())
				.map(([project_name, { count, latest }]) => ({
					project_name,
					session_count: count,
					latest,
				}))
				.sort((a, b) => b.latest.localeCompare(a.latest))
				.slice(0, 20);
		} catch (err) {
			console.error("[bridge-db] getProjectSummary failed:", err);
			return [];
		}
	}

	/**
	 * Read context_sections (long-lived context written by other agents).
	 */
	async getContextSections(): Promise<BridgeContextSection[]> {
		try {
			const client = await this.ensureConnected();
			const result = await client.callTool({
				name: "get_all_sections",
				arguments: {},
			});
			const rows = toolResultData<
				Array<{
					section_name: string;
					owner: string;
					content: string;
					updated_at: string;
				}>
			>(result, []);
			return rows;
		} catch (err) {
			console.error("[bridge-db] getContextSections failed:", err);
			return [];
		}
	}

	// -------------------------------------------------------------------------
	// Write methods — fire-and-forget, never throw
	// -------------------------------------------------------------------------

	/**
	 * Fire-and-forget: log a personal-ops activity entry to bridge-db.
	 * Never throws — errors are written to stderr only.
	 */
	logActivity(
		projectName: string,
		summary: string,
		tags: string[],
		branch: string | null = null,
	): void {
		const timestamp = new Date().toISOString().slice(0, 10);
		this.ensureConnected()
			.then((client) =>
				client.callTool({
					name: "log_activity",
					arguments: {
						caller: "personal_ops",
						project_name: projectName,
						summary,
						branch,
						tags,
						timestamp,
					},
				}),
			)
			.catch((err) => {
				console.error("[bridge-db] logActivity failed:", err);
			});
	}

	/**
	 * Fire-and-forget: record a monthly cost entry.
	 */
	recordCost(_system: string, month: string, amount: number): void {
		this.ensureConnected()
			.then((client) =>
				client.callTool({
					name: "record_cost",
					arguments: { caller: "personal_ops", month, amount, notes: null },
				}),
			)
			.catch((err) => {
				console.error("[bridge-db] recordCost failed:", err);
			});
	}

	/**
	 * Fire-and-forget: save a system state snapshot.
	 */
	saveSnapshot(data: Record<string, unknown>): void {
		this.ensureConnected()
			.then((client) =>
				client.callTool({
					name: "save_snapshot",
					arguments: { caller: "personal_ops", data },
				}),
			)
			.catch((err) => {
				console.error("[bridge-db] saveSnapshot failed:", err);
			});
	}
}
