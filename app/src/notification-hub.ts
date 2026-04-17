import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Logger } from "./logger.js";

const HUB_BASE_URL = "http://127.0.0.1:9199";
const HUB_EVENTS_JSONL = path.join(
	os.homedir(),
	".local/share/notification-hub/events.jsonl",
);

export type HubEventLevel = "info" | "warn" | "urgent";

export interface HubEvent {
	source: string;
	level: HubEventLevel;
	title: string;
	body: string;
	project?: string | null;
	timestamp?: string;
}

export interface HubEventRecord extends HubEvent {
	event_id: string;
	received_at: string;
	classified_level: string;
}

/**
 * Fire-and-forget client for the notification-hub event bus at 127.0.0.1:9199.
 * All methods degrade gracefully when the hub is not running — errors are logged
 * but never propagated to callers.
 */
export class NotificationHubClient {
	constructor(private readonly logger: Logger) {}

	/**
	 * POST a single event to the hub. Returns immediately — does not await.
	 */
	post(event: HubEvent): void {
		const body = JSON.stringify({
			...event,
			timestamp: event.timestamp ?? new Date().toISOString(),
		});
		fetch(`${HUB_BASE_URL}/events`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
			signal: AbortSignal.timeout(2000),
		}).catch((error: unknown) => {
			// Ignore expected local-sidecar failures when the hub is not running.
			const msg = error instanceof Error ? error.message : String(error);
			if (!msg.includes("ECONNREFUSED") && !msg.includes("fetch failed")) {
				this.logger.error("hub_post_failed", {
					title: event.title,
					error: msg,
				});
			}
		});
	}

	async isHealthy(): Promise<boolean> {
		try {
			const res = await fetch(`${HUB_BASE_URL}/health`, {
				signal: AbortSignal.timeout(1000),
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	/**
	 * Read the most recent events from the local JSONL log.
	 * Returns events in reverse-chronological order (newest first).
	 */
	readRecentEvents(limit = 50): HubEventRecord[] {
		try {
			if (!fs.existsSync(HUB_EVENTS_JSONL)) return [];
			const content = fs.readFileSync(HUB_EVENTS_JSONL, "utf8");
			const lines = content.trim().split("\n").filter(Boolean);
			return lines
				.slice(-limit)
				.map((line) => JSON.parse(line) as HubEventRecord)
				.reverse();
		} catch {
			return [];
		}
	}
}
