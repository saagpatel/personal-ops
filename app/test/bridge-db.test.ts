import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { BridgeDbClient } from "../src/bridge-db.js";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

type ToolArgs = Record<string, unknown>;
type CallToolResult = { content: Array<{ type: string; text: string }> };

function textResult(data: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/**
 * TestBridgeDbClient overrides ensureConnected to inject a fake MCP Client,
 * avoiding the need to spawn a real subprocess.
 */
class TestBridgeDbClient extends BridgeDbClient {
	public callLog: Array<{ name: string; arguments: ToolArgs }> = [];
	public connectCallCount = 0;
	public shouldFailConnect = false;
	private readonly fakeCallTool: (params: {
		name: string;
		arguments: ToolArgs;
	}) => Promise<CallToolResult>;

	constructor(
		fakeCallTool: (params: {
			name: string;
			arguments: ToolArgs;
		}) => Promise<CallToolResult>,
	) {
		super();
		this.fakeCallTool = fakeCallTool;
	}

	// Override the protected method to return a fake Client
	protected override async ensureConnected(): Promise<Client> {
		if (this.shouldFailConnect) {
			throw new Error("Connect failed (test stub)");
		}

		// Return cached client without incrementing count — mirrors real caching
		const cached = (this as unknown as { mcpClient: unknown }).mcpClient;
		if (cached) return cached as unknown as Client;

		this.connectCallCount += 1;

		// Build a minimal Client-shaped stub
		const stub = {
			callTool: async (params: { name: string; arguments: ToolArgs }) => {
				this.callLog.push({ name: params.name, arguments: params.arguments });
				return this.fakeCallTool(params);
			},
			close: async () => {
				/* no-op */
			},
		};

		// Cache to simulate singleton behaviour
		(this as unknown as { mcpClient: unknown }).mcpClient = stub;
		return stub as unknown as Client;
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("ensureConnected: spawns subprocess only once across multiple calls", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult([])));
	await client.getActivitySummary();
	await client.getActivitySummary();
	// Second call reuses cached mcpClient, so connectCallCount stays at 1
	assert.equal(client.connectCallCount, 1);
});

test("getActivitySummary: returns compiled summary with activity, costs, handoffs", async () => {
	const costs = [
		{
			system: "cc",
			month: new Date().toISOString().slice(0, 7),
			amount: 50.0,
			notes: null,
			recorded_at: "2026-04-14",
		},
	];
	const activity = [
		{
			id: 1,
			source: "cc",
			timestamp: "2026-04-14",
			project_name: "TestProject",
			summary: "did stuff",
			branch: null,
			tags: [],
			created_at: "2026-04-14T00:00:00Z",
		},
	];
	const handoffs = [
		{
			id: 1,
			project_name: "TestProject",
			project_path: null,
			roadmap_file: null,
			phase: null,
			dispatched_from: "claude_ai",
			dispatched_at: "2026-04-14T00:00:00Z",
			picked_up_at: null,
			cleared_at: null,
			status: "pending",
		},
	];

	let callIdx = 0;
	const responses = [
		textResult(costs),
		textResult(activity),
		textResult(handoffs),
	];
	const client = new TestBridgeDbClient(() =>
		Promise.resolve(responses[callIdx++] ?? textResult([])),
	);

	const result = await client.getActivitySummary(7);
	assert.ok(typeof result.current_month === "string");
	assert.ok(Array.isArray(result.recent_activity));
	assert.ok(Array.isArray(result.monthly_costs));
	assert.ok(Array.isArray(result.open_handoffs));
	assert.ok(typeof result.briefing_line === "string");
	assert.equal(result.open_handoffs.length, 1);
});

test("getActivitySummary: returns unavailable summary on connect error", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult([])));
	client.shouldFailConnect = true;
	const result = await client.getActivitySummary();
	assert.equal(result.briefing_line, "bridge-db not available");
	assert.deepEqual(result.recent_activity, []);
});

test("getActivitySummary: uses get_recent_activity with correct since parameter", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult([])));
	await client.getActivitySummary(14);
	const call = client.callLog.find((c) => c.name === "get_recent_activity");
	assert.ok(call, "get_recent_activity not called");
	const since = new Date(call.arguments["since"] as string);
	const diffDays = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);
	assert.ok(
		diffDays >= 13 && diffDays <= 15,
		`Expected ~14 days ago, got ${diffDays.toFixed(1)}`,
	);
});

test("searchActivity: filters by project client-side", async () => {
	const rows = [
		{
			id: 1,
			source: "cc",
			timestamp: "2026-04-14",
			project_name: "ProjectAlpha",
			summary: "refactored auth",
			branch: null,
			tags: [],
		},
		{
			id: 2,
			source: "cc",
			timestamp: "2026-04-13",
			project_name: "ProjectBeta",
			summary: "fixed bug",
			branch: null,
			tags: [],
		},
	];
	const client = new TestBridgeDbClient(() =>
		Promise.resolve(textResult(rows)),
	);
	const result = await client.searchActivity({ project: "Alpha" });
	assert.equal(result.length, 1);
	assert.equal(result[0]!.project_name, "ProjectAlpha");
});

test("searchActivity: filters by query client-side", async () => {
	const rows = [
		{
			id: 1,
			source: "cc",
			timestamp: "2026-04-14",
			project_name: "Proj",
			summary: "refactored auth",
			branch: null,
			tags: [],
		},
		{
			id: 2,
			source: "cc",
			timestamp: "2026-04-13",
			project_name: "Proj",
			summary: "fixed bug",
			branch: null,
			tags: [],
		},
	];
	const client = new TestBridgeDbClient(() =>
		Promise.resolve(textResult(rows)),
	);
	const result = await client.searchActivity({ query: "auth" });
	assert.equal(result.length, 1);
	assert.ok(result[0]!.summary.includes("auth"));
});

test("searchActivity: returns empty array on connect error", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult([])));
	client.shouldFailConnect = true;
	const result = await client.searchActivity({ query: "test" });
	assert.deepEqual(result, []);
});

test("getProjectSummary: groups rows by project_name client-side", async () => {
	const rows = [
		{ project_name: "Alpha", timestamp: "2026-04-14", summary: "task 1" },
		{ project_name: "Alpha", timestamp: "2026-04-13", summary: "task 2" },
		{ project_name: "Beta", timestamp: "2026-04-12", summary: "task 3" },
	];
	const client = new TestBridgeDbClient(() =>
		Promise.resolve(textResult(rows)),
	);
	const result = await client.getProjectSummary(7);
	assert.equal(result.length, 2);
	const alpha = result.find((r) => r.project_name === "Alpha");
	assert.ok(alpha);
	assert.equal(alpha.session_count, 2);
	assert.equal(alpha.latest, "2026-04-14");
});

test("getProjectSummary: returns empty array on connect error", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult([])));
	client.shouldFailConnect = true;
	assert.deepEqual(await client.getProjectSummary(7), []);
});

test("getContextSections: returns parsed sections array", async () => {
	const sections = [
		{
			section_name: "career",
			owner: "claude_ai",
			content: "some context",
			updated_at: "2026-04-14",
		},
	];
	const client = new TestBridgeDbClient(() =>
		Promise.resolve(textResult(sections)),
	);
	const result = await client.getContextSections();
	assert.equal(result.length, 1);
	assert.equal(result[0]!.section_name, "career");
});

test("logActivity: calls log_activity tool with caller=personal_ops", async () => {
	const client = new TestBridgeDbClient(() =>
		Promise.resolve(textResult({ ok: true })),
	);
	client.logActivity("TestProject", "did some work", ["test-tag"]);
	await new Promise<void>((resolve) => setImmediate(resolve));
	const call = client.callLog.find((c) => c.name === "log_activity");
	assert.ok(call, "log_activity not called");
	assert.equal(call.arguments["caller"], "personal_ops");
	assert.equal(call.arguments["project_name"], "TestProject");
	assert.equal(call.arguments["summary"], "did some work");
});

test("logActivity: does not throw on connect error", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult({})));
	client.shouldFailConnect = true;
	client.logActivity("proj", "summary", []);
	await new Promise<void>((resolve) => setImmediate(resolve));
	// No assertion needed — test passes if no unhandled rejection or thrown error
});

test("recordCost: calls record_cost tool with correct args", async () => {
	const client = new TestBridgeDbClient(() =>
		Promise.resolve(textResult({ ok: true })),
	);
	client.recordCost("personal_ops", "2026-04", 99.5);
	await new Promise<void>((resolve) => setImmediate(resolve));
	const call = client.callLog.find((c) => c.name === "record_cost");
	assert.ok(call, "record_cost not called");
	assert.equal(call.arguments["month"], "2026-04");
	assert.equal(call.arguments["amount"], 99.5);
});

test("recordCost: does not throw on connect error", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult({})));
	client.shouldFailConnect = true;
	client.recordCost("personal_ops", "2026-04", 0);
	await new Promise<void>((resolve) => setImmediate(resolve));
});

test("saveSnapshot: calls save_snapshot tool with data payload", async () => {
	const client = new TestBridgeDbClient(() =>
		Promise.resolve(textResult({ ok: true })),
	);
	client.saveSnapshot({ key: "value", nested: { n: 1 } });
	await new Promise<void>((resolve) => setImmediate(resolve));
	const call = client.callLog.find((c) => c.name === "save_snapshot");
	assert.ok(call, "save_snapshot not called");
	assert.deepEqual(call.arguments["data"], { key: "value", nested: { n: 1 } });
});

test("saveSnapshot: does not throw on connect error", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult({})));
	client.shouldFailConnect = true;
	client.saveSnapshot({ x: 1 });
	await new Promise<void>((resolve) => setImmediate(resolve));
});

test("isAvailable: returns true when connect succeeds", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult({})));
	assert.equal(await client.isAvailable(), true);
});

test("isAvailable: returns false when connect fails", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult({})));
	client.shouldFailConnect = true;
	assert.equal(await client.isAvailable(), false);
});

test("close: clears the cached client reference", async () => {
	const client = new TestBridgeDbClient(() => Promise.resolve(textResult([])));
	await client.getActivitySummary(); // warms up connection
	assert.equal(client.connectCallCount, 1);
	await client.close();
	// After close, the next call should reconnect
	client.shouldFailConnect = false;
	await client.getActivitySummary();
	assert.equal(client.connectCallCount, 2);
});
