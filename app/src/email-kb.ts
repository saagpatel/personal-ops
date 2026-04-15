import type { PersonalOpsDb } from "./db.js";

export interface EmailSearchResult {
	message_id: string;
	thread_id: string;
	subject: string | null;
	from_header: string | null;
	relevance_rank: number;
}

export interface EmailKbOptions {
	query: string;
	from?: string;
	limit?: number;
}

/**
 * Full-text search over email. Supports:
 *   - Basic keyword search: "pricing proposal"
 *   - Sender filter via `from` option: restricts to messages from a given address substring
 *
 * Results are deduplicated to one entry per thread_id (best-ranked match wins).
 */
export function searchEmailKb(
	db: PersonalOpsDb,
	options: EmailKbOptions,
): EmailSearchResult[] {
	if (!options.query.trim()) return [];

	const limit = Math.min(options.limit ?? 20, 100);
	const raw = db.searchMailFts(options.query, options.from, limit * 3);

	// Deduplicate: one result per thread, keeping the highest-rank (lowest rank number) hit
	const seen = new Map<string, EmailSearchResult>();
	for (const row of raw) {
		const existing = seen.get(row.thread_id);
		if (!existing || row.rank < existing.relevance_rank) {
			seen.set(row.thread_id, {
				message_id: row.message_id,
				thread_id: row.thread_id,
				subject: row.subject,
				from_header: row.from_header,
				relevance_rank: row.rank,
			});
		}
	}

	return Array.from(seen.values()).slice(0, limit);
}
