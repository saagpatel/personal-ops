import assert from "node:assert/strict";
import test from "node:test";
import { createHttpServer } from "../src/http.js";
import { CONSOLE_SESSION_COOKIE } from "../src/web-console.js";
import { createFixture } from "./support/service-fixture.js";

test("http routes treat malformed console cookies as unauthorized instead of bad requests", async () => {
	const { service, config, policy } = createFixture();
	const server = createHttpServer(service, config, policy);
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		const response = await fetch(`${baseUrl}/v1/status`, {
			headers: {
				cookie: `${CONSOLE_SESSION_COOKIE}=%E0%A4%A`,
			},
		});
		assert.equal(response.status, 401);
		const payload = (await response.json()) as { error?: string };
		assert.match(
			payload.error ?? "",
			/console session expired|missing or invalid bearer token/i,
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test("http routes reject oversized json request bodies with a bounded error", async () => {
	const { service, config, policy } = createFixture();
	const server = createHttpServer(service, config, policy);
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	assert.ok(address && typeof address === "object" && "port" in address);
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const oversizedDraft = {
		subject: "Oversized draft",
		body_text: "x".repeat(1024 * 1024 + 64),
	};

	try {
		const response = await fetch(`${baseUrl}/v1/mail/drafts`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${config.apiToken}`,
				"content-type": "application/json",
				"x-personal-ops-client": "http-boundary-test",
			},
			body: JSON.stringify(oversizedDraft),
		});
		assert.equal(response.status, 413);
		const payload = (await response.json()) as { error?: string };
		assert.match(payload.error ?? "", /json request body exceeds/i);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});
