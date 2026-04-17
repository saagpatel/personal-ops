import type { BridgeDbClient } from "./bridge-db.js";

export interface AiMemoryEntry {
	id: number;
	source: "cc" | "codex" | "claude_ai";
	timestamp: string;
	project_name: string;
	summary: string;
	branch: string | null;
	tags: string[];
}

export interface AiMemorySearchOptions {
	query?: string;
	project?: string;
	days?: number;
	limit?: number;
}

export interface AiProjectSummary {
	project_name: string;
	session_count: number;
	latest: string;
}

export async function searchAiMemory(
	bridgeDb: BridgeDbClient,
	options: AiMemorySearchOptions,
): Promise<AiMemoryEntry[]> {
	const rows = await bridgeDb.searchActivity(options);
	return rows.map((r) => ({
		...r,
		source: r.source as AiMemoryEntry["source"],
	}));
}

export async function getAiProjectSummary(
	bridgeDb: BridgeDbClient,
	days: number,
): Promise<AiProjectSummary[]> {
	return bridgeDb.getProjectSummary(days);
}
