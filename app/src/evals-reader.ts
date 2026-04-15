import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EVALS_INDEX_PATH = path.join(
	os.homedir(),
	"Projects/evals/results/index.jsonl",
);

interface RawEvalRecord {
	recorded_at: string;
	run_label: string;
	agent: string;
	baseline_type: string;
	task_id: string;
	category: string;
	project: string;
	pass: boolean;
	partial_credit: boolean;
	files_changed: number;
	unrelated_edits: number;
	tests_passed: number | null;
	tests_failed: number | null;
	retries_needed: number;
	notes: string;
}

export interface AgentCategoryStats {
	agent: string;
	category: string;
	total: number;
	passed: number;
	pass_rate: number;
	avg_retries: number;
	avg_unrelated_edits: number;
}

export interface AgentOverallStats {
	agent: string;
	total: number;
	passed: number;
	pass_rate: number;
}

export interface AgentPerformanceSummary {
	total_runs: number;
	agents: string[];
	categories: string[];
	/** Per-agent overall stats, sorted by pass_rate desc */
	overall: AgentOverallStats[];
	/** Per-agent per-category breakdown */
	by_category: AgentCategoryStats[];
	/** Categories where agent_a beats agent_b by >10pp */
	agent_advantages: Array<{
		winner: string;
		loser: string;
		category: string;
		winner_rate: number;
		loser_rate: number;
		delta: number;
	}>;
	/** One-line briefing */
	briefing_line: string;
}

function isRawEvalRecord(value: unknown): value is RawEvalRecord {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v["agent"] === "string" &&
		typeof v["category"] === "string" &&
		typeof v["pass"] === "boolean" &&
		typeof v["retries_needed"] === "number" &&
		typeof v["unrelated_edits"] === "number"
	);
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function emptyUnavailableSummary(): AgentPerformanceSummary {
	return {
		total_runs: 0,
		agents: [],
		categories: [],
		overall: [],
		by_category: [],
		agent_advantages: [],
		briefing_line: "evals data not available",
	};
}

export class EvalsReader {
	constructor(private readonly indexPath: string = EVALS_INDEX_PATH) {}

	isAvailable(): boolean {
		try {
			return fs.existsSync(this.indexPath);
		} catch (err) {
			console.error("[EvalsReader] isAvailable check failed:", err);
			return false;
		}
	}

	getAgentPerformanceSummary(): AgentPerformanceSummary {
		if (!this.isAvailable()) {
			return emptyUnavailableSummary();
		}

		let raw: string;
		try {
			raw = fs.readFileSync(this.indexPath, "utf-8");
		} catch (err) {
			console.error("[EvalsReader] Failed to read evals index:", err);
			return emptyUnavailableSummary();
		}

		const records: RawEvalRecord[] = [];
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const parsed: unknown = JSON.parse(trimmed);
				if (isRawEvalRecord(parsed)) {
					records.push(parsed);
				} else {
					console.error(
						"[EvalsReader] Skipping record with unexpected shape:",
						trimmed.slice(0, 100),
					);
				}
			} catch (err) {
				console.error(
					"[EvalsReader] Skipping invalid JSON line:",
					trimmed.slice(0, 100),
					err,
				);
			}
		}

		if (records.length === 0) {
			return emptyUnavailableSummary();
		}

		// Collect unique agents and categories
		const agentSet = new Set<string>();
		const categorySet = new Set<string>();
		for (const r of records) {
			agentSet.add(r.agent);
			categorySet.add(r.category);
		}
		const agents = Array.from(agentSet).sort();
		const categories = Array.from(categorySet).sort();

		// Per-agent overall stats
		const agentTotals = new Map<string, { total: number; passed: number }>();
		for (const agent of agents) {
			agentTotals.set(agent, { total: 0, passed: 0 });
		}
		for (const r of records) {
			const entry = agentTotals.get(r.agent);
			if (entry) {
				entry.total += 1;
				if (r.pass) entry.passed += 1;
			}
		}
		const overall: AgentOverallStats[] = agents
			.map((agent) => {
				const { total, passed } = agentTotals.get(agent) ?? {
					total: 0,
					passed: 0,
				};
				return {
					agent,
					total,
					passed,
					pass_rate: total > 0 ? round2(passed / total) : 0,
				};
			})
			.sort((a, b) => b.pass_rate - a.pass_rate);

		// Per-agent per-category stats
		type CategoryAccum = {
			total: number;
			passed: number;
			total_retries: number;
			total_unrelated: number;
		};
		const catMap = new Map<string, CategoryAccum>();
		const catKey = (agent: string, category: string) => `${agent}\0${category}`;

		for (const r of records) {
			const key = catKey(r.agent, r.category);
			const existing = catMap.get(key);
			if (existing) {
				existing.total += 1;
				if (r.pass) existing.passed += 1;
				existing.total_retries += r.retries_needed;
				existing.total_unrelated += r.unrelated_edits;
			} else {
				catMap.set(key, {
					total: 1,
					passed: r.pass ? 1 : 0,
					total_retries: r.retries_needed,
					total_unrelated: r.unrelated_edits,
				});
			}
		}

		const by_category: AgentCategoryStats[] = [];
		for (const agent of agents) {
			for (const category of categories) {
				const accum = catMap.get(catKey(agent, category));
				if (!accum) continue;
				by_category.push({
					agent,
					category,
					total: accum.total,
					passed: accum.passed,
					pass_rate: accum.total > 0 ? round2(accum.passed / accum.total) : 0,
					avg_retries:
						accum.total > 0 ? round2(accum.total_retries / accum.total) : 0,
					avg_unrelated_edits:
						accum.total > 0 ? round2(accum.total_unrelated / accum.total) : 0,
				});
			}
		}

		// Agent advantages: pairs where one agent beats another by >10pp in a category
		const agent_advantages: AgentPerformanceSummary["agent_advantages"] = [];
		for (const agentA of agents) {
			for (const agentB of agents) {
				if (agentA === agentB) continue;
				for (const category of categories) {
					const statsA = catMap.get(catKey(agentA, category));
					const statsB = catMap.get(catKey(agentB, category));
					if (!statsA || !statsB) continue;
					const rateA = statsA.total > 0 ? statsA.passed / statsA.total : 0;
					const rateB = statsB.total > 0 ? statsB.passed / statsB.total : 0;
					const delta = rateA - rateB;
					if (delta > 0.1) {
						agent_advantages.push({
							winner: agentA,
							loser: agentB,
							category,
							winner_rate: round2(rateA),
							loser_rate: round2(rateB),
							delta: round2(delta),
						});
					}
				}
			}
		}

		// Briefing line
		const agentSummaries = overall
			.map((s) => `${s.agent}: ${Math.round(s.pass_rate * 100)}%`)
			.join(" · ");

		// Find the leading agent and their strongest category advantage
		let leaderNote = "";
		const leader = overall[0];
		if (
			leader !== undefined &&
			overall.length >= 2 &&
			agent_advantages.length > 0
		) {
			const topAdvantage = agent_advantages
				.filter((a) => a.winner === leader.agent)
				.sort((a, b) => b.delta - a.delta)[0];
			if (topAdvantage !== undefined) {
				leaderNote = ` · ${leader.agent} leads on ${topAdvantage.category}`;
			}
		}

		const briefing_line = `${records.length} evals · ${agentSummaries}${leaderNote}`;

		return {
			total_runs: records.length,
			agents,
			categories,
			overall,
			by_category,
			agent_advantages,
			briefing_line,
		};
	}
}
