import assert from "node:assert/strict";
import test from "node:test";

import { NotificationHubClient } from "../src/notification-hub.js";

test("notification hub ignores expected local connectivity failures", async () => {
	const errors: Array<{ event: string; details: Record<string, unknown> }> = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (() =>
		Promise.reject(new Error("fetch failed"))) as typeof globalThis.fetch;

	try {
		const hub = new NotificationHubClient({
			error(event: string, details: Record<string, unknown>) {
				errors.push({ event, details });
			},
		} as any);

		hub.post({
			source: "personal-ops",
			level: "info",
			title: "Daemon Started",
			body: "testing",
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.deepEqual(errors, []);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("notification hub logs unexpected failures", async () => {
	const errors: Array<{ event: string; details: Record<string, unknown> }> = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (() =>
		Promise.reject(new Error("socket hang up"))) as typeof globalThis.fetch;

	try {
		const hub = new NotificationHubClient({
			error(event: string, details: Record<string, unknown>) {
				errors.push({ event, details });
			},
		} as any);

		hub.post({
			source: "personal-ops",
			level: "warn",
			title: "Approval expires soon",
			body: "testing",
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.equal(errors.length, 1);
		assert.equal(errors[0]?.event, "hub_post_failed");
		assert.equal(errors[0]?.details.title, "Approval expires soon");
	} finally {
		globalThis.fetch = originalFetch;
	}
});
