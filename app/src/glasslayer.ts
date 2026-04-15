import type { Logger } from "./logger.js";

const GLASSLAYER_BASE_URL = "http://127.0.0.1:9876";

/**
 * Client for the GlassLayer always-on-top overlay at 127.0.0.1:9876.
 *
 * Sends compact status lines to a named panel registered in the GlassLayer app.
 * The panel must be created in GlassLayer first; a 404 response means it doesn't
 * exist yet and is silently ignored.
 *
 * POST /hook/{panelId} accepts: { lines: string[] } or { message: string }
 */
export class GlassLayerClient {
	constructor(
		private readonly logger: Logger,
		private readonly panelId: string = "personal-ops",
		private readonly authToken: string | null = null,
	) {}

	/**
	 * Push a compact status line to the GlassLayer panel. Fire-and-forget.
	 */
	push(status: string): void;
	push(lines: string[]): void;
	push(content: string | string[]): void {
		const body = JSON.stringify(
			Array.isArray(content) ? { lines: content } : { message: content },
		);
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.authToken) headers["x-glass-token"] = this.authToken;

		fetch(`${GLASSLAYER_BASE_URL}/hook/${encodeURIComponent(this.panelId)}`, {
			method: "POST",
			headers,
			body,
			signal: AbortSignal.timeout(2000),
		}).catch((error: unknown) => {
			// Log only unexpected errors — connection refused just means GlassLayer isn't running
			const msg = error instanceof Error ? error.message : String(error);
			if (!msg.includes("ECONNREFUSED") && !msg.includes("fetch failed")) {
				this.logger.error("glasslayer_push_failed", {
					panel_id: this.panelId,
					error: msg,
				});
			}
		});
	}
}
