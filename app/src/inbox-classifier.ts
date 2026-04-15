import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { InboxThreadKind, InboxThreadSummary } from "./types.js";

export type InboxBucket =
	| "act_today"
	| "waiting_on_someone"
	| "read_when_relevant"
	| "archive";

export interface ThreadClassification {
	thread_id: string;
	bucket: InboxBucket;
	classified_at: string;
}

export interface ClassifiedInbox {
	act_today: InboxThreadSummary[];
	waiting_on_someone: InboxThreadSummary[];
	total_classified: number;
	briefing_line: string;
}

// Classifications are considered fresh for this many milliseconds.
const CLASSIFICATION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const ACT_TODAY_DISPLAY_LIMIT = 5;
const WAITING_DISPLAY_LIMIT = 5;
const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "qwen2.5-coder:14b";

const VALID_BUCKETS: InboxBucket[] = [
	"act_today",
	"waiting_on_someone",
	"read_when_relevant",
	"archive",
];

function isInboxBucket(value: string): value is InboxBucket {
	return (VALID_BUCKETS as string[]).includes(value);
}

// ─── Classifier store ─────────────────────────────────────────────────────────

export class InboxClassifierStore {
	private readonly dbPath: string;

	constructor(stateDir: string) {
		this.dbPath = path.join(stateDir, "inbox-classifier.db");
		this.init();
	}

	private open(): DatabaseSync {
		return new DatabaseSync(this.dbPath);
	}

	private init(): void {
		fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
		const db = this.open();
		try {
			db.exec(`
        CREATE TABLE IF NOT EXISTS thread_classifications (
          thread_id    TEXT PRIMARY KEY,
          bucket       TEXT NOT NULL,
          classified_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reply_patterns (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id       TEXT NOT NULL,
          replied_within_24h INTEGER NOT NULL,
          recorded_at     TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reply_patterns_recorded_at
          ON reply_patterns (recorded_at);
      `);
		} finally {
			db.close();
		}
	}

	getClassification(thread_id: string): ThreadClassification | undefined {
		const db = this.open();
		try {
			const stmt = db.prepare(
				"SELECT thread_id, bucket, classified_at FROM thread_classifications WHERE thread_id = ?",
			);
			const row = stmt.get(thread_id) as
				| { thread_id: string; bucket: string; classified_at: string }
				| undefined;
			if (!row || !isInboxBucket(row.bucket)) return undefined;
			return {
				thread_id: row.thread_id,
				bucket: row.bucket,
				classified_at: row.classified_at,
			};
		} finally {
			db.close();
		}
	}

	saveClassification(c: ThreadClassification): void {
		const db = this.open();
		try {
			db.prepare(
				`INSERT INTO thread_classifications (thread_id, bucket, classified_at)
         VALUES (?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET bucket = excluded.bucket, classified_at = excluded.classified_at`,
			).run(c.thread_id, c.bucket, c.classified_at);
		} finally {
			db.close();
		}
	}

	recordReply(thread_id: string, replied_within_24h: boolean): void {
		const db = this.open();
		try {
			db.prepare(
				"INSERT INTO reply_patterns (thread_id, replied_within_24h, recorded_at) VALUES (?, ?, ?)",
			).run(thread_id, replied_within_24h ? 1 : 0, new Date().toISOString());
		} finally {
			db.close();
		}
	}

	/** Rolling 30-day reply-rate for calibration. */
	getReplyStats(days = 30): { replied_within_24h: number; total: number } {
		const db = this.open();
		try {
			const cutoff = new Date(
				Date.now() - days * 24 * 60 * 60 * 1000,
			).toISOString();
			const row = db
				.prepare(
					`SELECT COUNT(*) as total, SUM(replied_within_24h) as replied
         FROM reply_patterns WHERE recorded_at >= ?`,
				)
				.get(cutoff) as { total: number; replied: number };
			return { replied_within_24h: row.replied ?? 0, total: row.total ?? 0 };
		} finally {
			db.close();
		}
	}
}

// ─── Ollama classifier ────────────────────────────────────────────────────────

async function pingOllama(): Promise<boolean> {
	try {
		const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(2000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

function buildClassificationPrompt(
	subject: string,
	from: string,
	derivedKind: InboxThreadKind,
	lastDirection: "inbound" | "outbound" | "unknown",
): string {
	const directionHint =
		lastDirection === "outbound"
			? "I sent the last message"
			: "They sent the last message";
	return `Classify this email thread into exactly one category. Reply with ONLY the category name, nothing else.

Categories:
- act_today: needs your decision or reply within 24 hours (direct question, urgent request, time-sensitive)
- waiting_on_someone: I sent last and am awaiting their response
- read_when_relevant: FYI, async, newsletter, or low-priority — no reply needed soon
- archive: completed exchange, no further action needed

Thread:
Subject: ${subject || "(no subject)"}
From: ${from || "(unknown sender)"}
Direction: ${directionHint}
Status: ${derivedKind}

Category:`;
}

async function classifyViaOllama(prompt: string): Promise<InboxBucket | null> {
	try {
		const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: OLLAMA_MODEL,
				prompt,
				stream: false,
				options: { temperature: 0, num_predict: 10 },
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { response?: string };
		const text = (data.response ?? "")
			.trim()
			.toLowerCase()
			.replace(/[^a-z_]/g, "");
		if (isInboxBucket(text)) return text;
		// Handle common variations
		if (text.startsWith("act")) return "act_today";
		if (text.startsWith("waiting")) return "waiting_on_someone";
		if (text.startsWith("read")) return "read_when_relevant";
		if (text.startsWith("archive")) return "archive";
		return null;
	} catch {
		return null;
	}
}

// ─── Heuristic fast-paths ─────────────────────────────────────────────────────

function heuristicBucket(
	derivedKind: InboxThreadKind,
	lastDirection: "inbound" | "outbound" | "unknown",
): InboxBucket | null {
	// Clear outbound-last signals → waiting
	if (
		lastDirection === "outbound" ||
		derivedKind === "waiting_on_other_party"
	) {
		return "waiting_on_someone";
	}
	// Old unread, no reply needed → read when relevant
	if (derivedKind === "unread_old") {
		return "read_when_relevant";
	}
	// Recent activity without a clear direction — let Ollama decide
	return null;
}

// ─── Classifier service ───────────────────────────────────────────────────────

export class InboxClassifierService {
	private readonly store: InboxClassifierStore;

	constructor(stateDir: string) {
		this.store = new InboxClassifierStore(stateDir);
	}

	get classifierStore(): InboxClassifierStore {
		return this.store;
	}

	private isFresh(classification: ThreadClassification): boolean {
		const age = Date.now() - new Date(classification.classified_at).getTime();
		return age < CLASSIFICATION_TTL_MS;
	}

	private async classifyOne(summary: InboxThreadSummary): Promise<InboxBucket> {
		// 1. Check cache
		const cached = this.store.getClassification(summary.thread.thread_id);
		if (cached && this.isFresh(cached)) {
			return cached.bucket;
		}

		// 2. Heuristic fast-path
		const heuristic = heuristicBucket(
			summary.derived_kind,
			summary.last_direction,
		);
		if (heuristic !== null) {
			this.store.saveClassification({
				thread_id: summary.thread.thread_id,
				bucket: heuristic,
				classified_at: new Date().toISOString(),
			});
			return heuristic;
		}

		// 3. Ollama classification
		const subject = summary.latest_message?.subject ?? "";
		const from = summary.latest_message?.from_header ?? "";
		const prompt = buildClassificationPrompt(
			subject,
			from,
			summary.derived_kind,
			summary.last_direction,
		);
		const ollamaBucket = await classifyViaOllama(prompt);

		// 4. Fallback: needs_reply → act_today, everything else → read_when_relevant
		const bucket: InboxBucket =
			ollamaBucket ??
			(summary.derived_kind === "needs_reply"
				? "act_today"
				: "read_when_relevant");

		this.store.saveClassification({
			thread_id: summary.thread.thread_id,
			bucket,
			classified_at: new Date().toISOString(),
		});
		return bucket;
	}

	async classifyThreads(
		summaries: InboxThreadSummary[],
	): Promise<ClassifiedInbox> {
		const actToday: InboxThreadSummary[] = [];
		const waitingOn: InboxThreadSummary[] = [];

		for (const summary of summaries) {
			const bucket = await this.classifyOne(summary);
			if (bucket === "act_today") actToday.push(summary);
			else if (bucket === "waiting_on_someone") waitingOn.push(summary);
		}

		const actCount = actToday.length;
		const waitCount = waitingOn.length;
		const briefingLine =
			actCount === 0 && waitCount === 0
				? "inbox clear"
				: `${actCount} act today · ${waitCount} waiting on someone`;

		return {
			act_today: actToday.slice(0, ACT_TODAY_DISPLAY_LIMIT),
			waiting_on_someone: waitingOn.slice(0, WAITING_DISPLAY_LIMIT),
			total_classified: summaries.length,
			briefing_line: briefingLine,
		};
	}

	/** Check if Ollama is reachable (cached per instance). */
	async isOllamaAvailable(): Promise<boolean> {
		return pingOllama();
	}
}

// ─── Utilities re-exported for formatters ────────────────────────────────────

export function expandHome(p: string): string {
	if (p.startsWith("~/")) {
		return path.join(os.homedir(), p.slice(2));
	}
	return p;
}
