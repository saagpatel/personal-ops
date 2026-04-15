import type { PersonalOpsDb } from "./db.js";

export interface ContactNode {
	email: string;
	display_name: string | null;
	first_seen_at: string;
	last_contact_at: string;
	last_inbound_at: string | null;
	last_outbound_at: string | null;
	message_count: number;
	meeting_count: number;
	open_thread_count: number;
	warmth_score: number;
}

/**
 * Warmth score in [0, 1].
 *
 * Formula: recency_weight × log(frequency + 1) / log(MAX_FREQ + 1)
 * - Recency decays with a 30-day half-life (full weight if < 7 days old).
 * - Frequency combines message + meeting counts (meetings worth 3× a message).
 * - Result is clamped to [0, 1].
 */
const MAX_FREQ = 200; // messages + meetings*3 above which warmth saturates
const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function computeWarmthScore(
	lastContactAt: string,
	messageCount: number,
	meetingCount: number,
): number {
	const ageMs = Date.now() - new Date(lastContactAt).getTime();
	// Exponential decay: weight = 2^(-age / half_life)
	const recencyWeight = 2 ** (-Math.max(0, ageMs) / HALF_LIFE_MS);
	const freq = messageCount + meetingCount * 3;
	const freqScore = Math.log(freq + 1) / Math.log(MAX_FREQ + 1);
	return Math.min(1, recencyWeight * freqScore);
}

/**
 * Rebuild the contacts table from mail_messages + calendar_events.
 * This is a full rescan — call once per day from the daemon or on explicit
 * `personal-ops contacts rebuild`. For incremental updates, call upsertContact
 * directly after each inbox sync.
 */
export function buildContactGraph(
	db: PersonalOpsDb,
	myEmail: string,
): ContactNode[] {
	const now = new Date().toISOString();

	const inbound = db.aggregateInboundContacts(myEmail);
	const outbound = db.aggregateOutboundContacts(myEmail);

	// Merge into a map keyed by lowercase email
	const map = new Map<
		string,
		{
			first_seen_at: string;
			last_inbound_at: string | null;
			last_outbound_at: string | null;
			last_contact_at: string;
			message_count: number;
		}
	>();

	for (const row of inbound) {
		const key = row.email.toLowerCase();
		const lastSeen = new Date(Number(row.last_seen)).toISOString();
		const firstSeen = new Date(Number(row.first_seen)).toISOString();
		const existing = map.get(key);
		if (!existing) {
			map.set(key, {
				first_seen_at: firstSeen,
				last_inbound_at: lastSeen,
				last_outbound_at: null,
				last_contact_at: lastSeen,
				message_count: row.msg_count,
			});
		} else {
			if (lastSeen > (existing.last_inbound_at ?? ""))
				existing.last_inbound_at = lastSeen;
			if (lastSeen > existing.last_contact_at)
				existing.last_contact_at = lastSeen;
			existing.message_count += row.msg_count;
			if (firstSeen < existing.first_seen_at)
				existing.first_seen_at = firstSeen;
		}
	}

	for (const row of outbound) {
		const key = row.email.toLowerCase();
		const lastSeen = new Date(Number(row.last_seen)).toISOString();
		const firstSeen = new Date(Number(row.first_seen)).toISOString();
		const existing = map.get(key);
		if (!existing) {
			map.set(key, {
				first_seen_at: firstSeen,
				last_inbound_at: null,
				last_outbound_at: lastSeen,
				last_contact_at: lastSeen,
				message_count: row.msg_count,
			});
		} else {
			if (lastSeen > (existing.last_outbound_at ?? ""))
				existing.last_outbound_at = lastSeen;
			if (lastSeen > existing.last_contact_at)
				existing.last_contact_at = lastSeen;
			existing.message_count += row.msg_count;
			if (firstSeen < existing.first_seen_at)
				existing.first_seen_at = firstSeen;
		}
	}

	// Upsert each contact with warmth, meeting count, open threads
	for (const [email, stats] of map) {
		const meetingCount = db.countMeetingsWithAttendee(email);
		const openThreadCount = db.countOpenThreadsByParticipant(email);
		const warmth = computeWarmthScore(
			stats.last_contact_at,
			stats.message_count,
			meetingCount,
		);
		db.upsertContact({
			email,
			display_name: null,
			first_seen_at: stats.first_seen_at,
			last_contact_at: stats.last_contact_at,
			last_inbound_at: stats.last_inbound_at,
			last_outbound_at: stats.last_outbound_at,
			message_count: stats.message_count,
			meeting_count: meetingCount,
			open_thread_count: openThreadCount,
			warmth_score: warmth,
			updated_at: now,
		});
	}

	return db.getTopContacts(200);
}
