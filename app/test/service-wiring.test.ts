import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = fs.existsSync(path.resolve(process.cwd(), "src"))
	? process.cwd()
	: path.resolve(process.cwd(), "app");
const appPath = (...segments: string[]) => path.resolve(appRoot, ...segments);

test("assistant-led phase 12 cli exposes review calibration commands", () => {
	const source = fs.readFileSync(
		appPath("src/cli.ts"),
		"utf8",
	);
	assert.match(source, /command\("calibration"\)/);
	assert.match(source, /\/v1\/review\/calibration/);
	assert.match(source, /command\("targets"\)/);
	assert.match(source, /command\("set"\)/);
	assert.match(source, /command\("reset"\)/);
	assert.match(source, /--min-notification-action-rate/);
	assert.match(source, /\/v1\/review\/calibration\/targets/);
});

test("assistant-led phase 5 mcp drive tools are assistant-safe read-only tools", () => {
	const source = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "drive_status"/);
	assert.match(source, /name: "drive_files"/);
	assert.match(source, /name: "drive_doc_get"/);
	assert.match(source, /name: "drive_sheet_get"/);
	assert.match(source, /requestJson\("GET", "\/v1\/drive\/status"\)/);
	assert.match(source, /requestJson\("GET", "\/v1\/drive\/files"\)/);
	// Template literal args may be formatted across lines by the linter
	assert.match(
		source,
		/v1\/drive\/docs\/\$\{encodeURIComponent\(String\(args\.file_id\)\)\}/,
	);
	assert.match(
		source,
		/v1\/drive\/sheets\/\$\{encodeURIComponent\(String\(args\.file_id\)\)\}/,
	);
	assert.doesNotMatch(source, /name: "drive_sync"/);
});

test("F1 notification_feed mcp tool is wired", () => {
	const source = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "notification_feed"/);
	assert.match(source, /v1\/hub\/feed/);
});

test("F3 ai_activity_summary mcp tool is wired", () => {
	const source = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "ai_activity_summary"/);
	assert.match(source, /v1\/bridge\/summary/);
});

test("F4 portfolio_health mcp tool is wired", () => {
	const source = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "portfolio_health"/);
	assert.match(source, /v1\/portfolio\/health/);
});

test("F6 agent_performance_summary mcp tool is wired", () => {
	const source = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "agent_performance_summary"/);
	assert.match(source, /v1\/evals\/summary/);
});

test("F5 mcp_security_posture mcp tool is wired", () => {
	const source = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.match(source, /name: "mcp_security_posture"/);
	assert.match(source, /v1\/security\/posture/);
});

test("Tier 1.1 morning briefing http route is wired", () => {
	const source = fs.readFileSync(
		appPath("src/http.ts"),
		"utf8",
	);
	assert.match(source, /v1\/workflows\/morning/);
	assert.match(source, /getMorningBriefing/);
});

test("Tier 1.1 morning workflow cli command is wired", () => {
	const source = fs.readFileSync(
		appPath("src/cli/commands/runtime.ts"),
		"utf8",
	);
	assert.match(source, /command\("morning"\)/);
	assert.match(source, /formatMorningBriefing/);
	assert.match(source, /Notes.*personal-ops/);
});

test("Tier 1.1 formatMorningBriefing renders all sections", async () => {
	const { formatMorningBriefing } = (await import(
		appPath("dist/src/formatters/workflows.js")
	)) as { formatMorningBriefing: (b: unknown) => string };
	const briefing = formatMorningBriefing({
		date: "2026-04-14",
		calendar: {
			event_count: 2,
			events: [
				{
					event_id: "e1",
					summary: "Standup",
					start_at: new Date(Date.now() + 3600_000).toISOString(),
					end_at: new Date(Date.now() + 5400_000).toISOString(),
					is_all_day: false,
					attendee_count: 3,
				},
			],
			next_event_summary: "Standup",
			next_event_start_at: new Date(Date.now() + 3600_000).toISOString(),
			conflict_count: 0,
		},
		inbox: {
			followup_count: 5,
			classified_briefing_line: "1 act today · 2 waiting on someone",
			act_today_threads: [
				{
					thread_id: "t1",
					subject: "Budget Q2",
					from: "alice@example.com",
					last_message_at: new Date().toISOString(),
				},
			],
		},
		tasks: {
			overdue_count: 1,
			overdue: [
				{
					task_id: "tk1",
					title: "Write proposal",
					due_at: "2026-04-12",
					priority: "high",
				},
			],
		},
		portfolio_pulse: {
			available: true,
			briefing_line: "114 repos · 21 parked",
			stalest: {
				display_name: "OldProject",
				last_activity_at: "2026-02-01T00:00:00Z",
				context_quality: "boilerplate",
			},
		},
		ai_cost: { briefing_line: "AI 2026-04: $650 · 3 sessions" },
		alerts: { urgent_count: 0, events: [] },
	});
	assert.match(briefing, /Morning Briefing/);
	assert.match(briefing, /CALENDAR/);
	assert.match(briefing, /Standup/);
	assert.match(briefing, /INBOX/);
	assert.match(briefing, /Budget Q2/);
	assert.match(briefing, /TASKS/);
	assert.match(briefing, /Write proposal/);
	assert.match(briefing, /PORTFOLIO/);
	assert.match(briefing, /OldProject/);
	assert.match(briefing, /AI ACTIVITY/);
	assert.match(briefing, /\$650/);
});

test("Tier 1.2 inbox_classified mcp tool is wired", () => {
	const mcpSource = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.match(mcpSource, /inbox_classified/);
	assert.match(mcpSource, /v1\/inbox\/classified/);
});

test("Tier 1.2 GET /v1/inbox/classified route is wired", () => {
	const httpSource = fs.readFileSync(
		appPath("src/http.ts"),
		"utf8",
	);
	assert.match(httpSource, /v1\/inbox\/classified/);
	assert.match(httpSource, /getClassifiedInbox/);
});

test("Tier 1.2 getClassifiedInbox is wired in service", () => {
	const serviceSource = fs.readFileSync(
		appPath("src/service.ts"),
		"utf8",
	);
	assert.match(serviceSource, /getClassifiedInbox/);
	assert.match(serviceSource, /InboxClassifierService/);
});

test("Tier 1.2 formatClassifiedInbox renders both buckets", async () => {
	const { formatClassifiedInbox } = (await import(
		appPath("dist/src/formatters/inbox.js")
	)) as { formatClassifiedInbox: (c: unknown) => string };
	const output = formatClassifiedInbox({
		act_today: [
			{
				thread: {
					thread_id: "abc123",
					mailbox: "user@example.com",
					last_message_at: String(Date.now()),
					message_count: 2,
					unread_count: 1,
					in_inbox: true,
					last_synced_at: new Date().toISOString(),
				},
				latest_message: {
					message_id: "m1",
					thread_id: "abc123",
					mailbox: "user@example.com",
					internal_date: String(Date.now()),
					label_ids: ["INBOX"],
					subject: "Urgent proposal review",
					from_header: "bob@client.com",
					is_unread: true,
					is_sent: false,
					is_inbox: true,
					last_synced_at: new Date().toISOString(),
				},
				derived_kind: "needs_reply",
				last_direction: "inbound",
			},
		],
		waiting_on_someone: [],
		total_classified: 3,
		briefing_line: "1 act today · 0 waiting on someone",
	});
	assert.match(output, /Classified Inbox/);
	assert.match(output, /Act Today/);
	assert.match(output, /Urgent proposal review/);
	assert.match(output, /Waiting on Someone/);
	assert.match(output, /3 threads classified/);
});

test("Tier 1.3 meeting_contact_brief mcp tool is wired", () => {
	const schemaBody = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf-8",
	);
	assert.match(schemaBody, /meeting_contact_brief/);
	assert.match(schemaBody, /event_id/);
});

test("Tier 1.3 GET /v1/workflows/meeting-brief route is wired", () => {
	const httpBody = fs.readFileSync(
		appPath("src/http.ts"),
		"utf-8",
	);
	assert.match(httpBody, /\/v1\/workflows\/meeting-brief/);
	assert.match(httpBody, /getMeetingContactBrief/);
});

test("Tier 1.3 getMeetingContactBrief is wired in service", () => {
	const serviceBody = fs.readFileSync(
		appPath("src/service.ts"),
		"utf-8",
	);
	assert.match(serviceBody, /getMeetingContactBrief/);
	assert.match(serviceBody, /buildMeetingContactBrief/);
});

test("Tier 1.3 formatMeetingContactBrief renders brief", async () => {
	const { formatMeetingContactBrief } = (await import(
		appPath("dist/src/formatters/workflows.js")
	)) as { formatMeetingContactBrief: (b: unknown) => string };
	const now = new Date().toISOString();
	const endAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
	const output = formatMeetingContactBrief({
		event_id: "evt-001",
		title: "Q2 Planning",
		start_at: now,
		end_at: endAt,
		location: "Zoom",
		attendee_contexts: [
			{
				email: "alice@example.com",
				display_name: "Alice",
				response_status: "accepted",
				recent_messages: [
					{
						subject: "Re: prep notes",
						date: now,
						direction: "inbound",
					},
				],
				message_count: 1,
				open_thread_count: 3,
				meeting_count_together: 5,
			},
		],
		minutes_until: 25,
		generated_at: now,
	});
	assert.match(output, /Meeting Brief/);
	assert.match(output, /Q2 Planning/);
	assert.match(output, /Alice/);
	assert.match(output, /Zoom/);
	assert.match(output, /prep notes/);
	assert.match(output, /5 meetings together/);
});

test("Tier 1.4 end_of_day_digest mcp tool is wired", () => {
	const schemaBody = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf-8",
	);
	assert.match(schemaBody, /end_of_day_digest/);
});

test("Tier 1.4 GET /v1/workflows/end-of-day route is wired", () => {
	const httpBody = fs.readFileSync(
		appPath("src/http.ts"),
		"utf-8",
	);
	assert.match(httpBody, /\/v1\/workflows\/end-of-day/);
	assert.match(httpBody, /getEndOfDayDigest/);
});

test("Tier 1.4 getEndOfDayDigest is wired in service", () => {
	const serviceBody = fs.readFileSync(
		appPath("src/service.ts"),
		"utf-8",
	);
	assert.match(serviceBody, /getEndOfDayDigest/);
	assert.match(serviceBody, /listTasksCompletedSince/);
	assert.match(serviceBody, /getMailActivityToday/);
});

test("Tier 1.4 formatEndOfDayDigest renders all sections", async () => {
	const { formatEndOfDayDigest } = (await import(
		appPath("dist/src/formatters/workflows.js")
	)) as { formatEndOfDayDigest: (d: unknown) => string };
	const now = new Date().toISOString();
	const output = formatEndOfDayDigest({
		date: "2026-04-14",
		calendar: {
			meetings_today: 2,
			meeting_minutes: 90,
			events: [
				{
					event_id: "e1",
					summary: "Standup",
					start_at: now,
					end_at: now,
					is_all_day: false,
					attendee_count: 4,
				},
			],
		},
		inbox: {
			inbound_today: 12,
			outbound_today: 5,
			needs_reply_count: 3,
			stale_followup_count: 2,
		},
		tasks: {
			completed_today: [
				{ task_id: "t1", title: "Ship the PR", completed_at: now },
			],
			overdue_open_count: 1,
		},
		approvals: { pending_count: 2 },
		ai_cost: { briefing_line: "$4.20 today across 3 sessions" },
		git_commits: {
			repos_with_commits: 2,
			total_commits: 5,
			items: [
				{
					repo: "personal-ops",
					count: 3,
					subjects: ["feat: add git scan", "fix: archive eod", "test: 1.4"],
				},
				{
					repo: "GithubRepoAuditor",
					count: 2,
					subjects: ["feat: risk overlay", "fix: null handle"],
				},
			],
		},
	});
	assert.match(output, /End-of-Day Digest/);
	assert.match(output, /2026-04-14/);
	assert.match(output, /Standup/);
	assert.match(output, /12 received/);
	assert.match(output, /Ship the PR/);
	assert.match(output, /2 approval/);
	assert.match(output, /\$4\.20/);
	assert.match(output, /2 sent threads with no reply/);
	assert.match(output, /SHIPPED TODAY/);
	assert.match(output, /personal-ops/);
	assert.match(output, /feat: add git scan/);
});

// ── Tier 2.1: Relationship Graph ─────────────────────────────────────────

test("Tier 2.1 contact_graph mcp tool is wired", () => {
	const src = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.ok(
		src.includes('"contact_graph"'),
		"contact_graph tool definition missing",
	);
	assert.ok(
		src.includes("/v1/contacts"),
		"contact_graph handler missing route",
	);
	assert.ok(
		src.includes("formatContactGraph"),
		"contact_graph handler missing formatter",
	);
});

test("Tier 2.1 GET /v1/contacts route is wired", () => {
	const src = fs.readFileSync(
		appPath("src/http.ts"),
		"utf8",
	);
	assert.ok(src.includes('"/v1/contacts"'), "/v1/contacts route missing");
	assert.ok(
		src.includes("getContactGraph"),
		"getContactGraph call missing from route",
	);
});

test("Tier 2.1 getContactGraph is wired in service", () => {
	const src = fs.readFileSync(
		appPath("src/service.ts"),
		"utf8",
	);
	assert.ok(
		src.includes("getContactGraph"),
		"getContactGraph missing from service",
	);
	assert.ok(
		src.includes("buildContactGraph"),
		"buildContactGraph call missing from service",
	);
});

test("Tier 2.1 formatContactGraph renders warmth tiers", async () => {
	const { formatContactGraph } = (await import(
		appPath("dist/src/formatters/workflows.js")
	)) as { formatContactGraph: (contacts: unknown[]) => string };
	const now = new Date().toISOString();
	const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
	const output = formatContactGraph([
		{
			email: "hot@example.com",
			display_name: "Hot Contact",
			first_seen_at: old,
			last_contact_at: now,
			last_inbound_at: now,
			last_outbound_at: now,
			message_count: 50,
			meeting_count: 5,
			open_thread_count: 3,
			warmth_score: 0.85,
			updated_at: now,
		},
		{
			email: "cold@example.com",
			display_name: null,
			first_seen_at: old,
			last_contact_at: old,
			last_inbound_at: old,
			last_outbound_at: null,
			message_count: 2,
			meeting_count: 0,
			open_thread_count: 0,
			warmth_score: 0.05,
			updated_at: now,
		},
	]);
	assert.match(output, /RELATIONSHIP GRAPH/);
	assert.match(output, /HOT/);
	assert.match(output, /Hot Contact/);
	assert.match(output, /COLD/);
	assert.match(output, /cold@example\.com/);
	assert.match(output, /3 open/);
});

// ── Tier 2.2: AI Session Memory ───────────────────────────────────────────

test("Tier 2.2 ai_context_recall mcp tool is wired", () => {
	const src = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.ok(
		src.includes('"ai_context_recall"'),
		"ai_context_recall tool definition missing",
	);
	assert.ok(
		src.includes("/v1/ai/memory"),
		"ai_context_recall handler missing route",
	);
	assert.ok(
		src.includes("formatAiMemory"),
		"ai_context_recall handler missing formatter",
	);
});

test("Tier 2.2 GET /v1/ai/memory route is wired", () => {
	const src = fs.readFileSync(
		appPath("src/http.ts"),
		"utf8",
	);
	assert.ok(src.includes('"/v1/ai/memory"'), "/v1/ai/memory route missing");
	assert.ok(
		src.includes("searchAiMemory"),
		"searchAiMemory call missing from route",
	);
});

test("Tier 2.2 searchAiMemory is wired in service", () => {
	const src = fs.readFileSync(
		appPath("src/service.ts"),
		"utf8",
	);
	assert.ok(
		src.includes("searchAiMemory"),
		"searchAiMemory missing from service",
	);
	assert.ok(
		src.includes("searchAiMemoryImpl"),
		"bridge-db delegation missing from service",
	);
});

test("Tier 2.2 formatAiMemory renders sessions grouped by project", async () => {
	const { formatAiMemory } = (await import(
		appPath("dist/src/formatters/workflows.js")
	)) as { formatAiMemory: (entries: unknown[]) => string };
	const output = formatAiMemory([
		{
			id: 1,
			source: "cc",
			timestamp: "2026-04-13T10:00:00.000Z",
			project_name: "personal-ops",
			summary: "Tier 2.1 relationship graph",
			branch: "feat/tier-2",
			tags: ["typescript", "db"],
		},
		{
			id: 2,
			source: "codex",
			timestamp: "2026-04-13T09:00:00.000Z",
			project_name: "GithubRepoAuditor",
			summary: "Risk overlay shipped",
			branch: null,
			tags: [],
		},
	]);
	assert.match(output, /AI SESSION MEMORY/);
	assert.match(output, /personal-ops/);
	assert.match(output, /Tier 2\.1 relationship graph/);
	assert.match(output, /feat\/tier-2/);
	assert.match(output, /GithubRepoAuditor/);
	assert.match(output, /Risk overlay shipped/);
});

// ── Tier 2.3: Email Knowledge Base ────────────────────────────────────────

test("Tier 2.3 email_search mcp tool is wired", () => {
	const src = fs.readFileSync(
		appPath("src/mcp-server.ts"),
		"utf8",
	);
	assert.ok(
		src.includes('"email_search"'),
		"email_search tool definition missing",
	);
	assert.ok(
		src.includes("/v1/inbox/search"),
		"email_search handler missing route",
	);
	assert.ok(
		src.includes("formatEmailSearch"),
		"email_search handler missing formatter",
	);
});

test("Tier 2.3 GET /v1/inbox/search route is wired", () => {
	const src = fs.readFileSync(
		appPath("src/http.ts"),
		"utf8",
	);
	assert.ok(
		src.includes('"/v1/inbox/search"'),
		"/v1/inbox/search route missing",
	);
	assert.ok(
		src.includes("searchEmailKb"),
		"searchEmailKb call missing from route",
	);
});

test("Tier 2.3 searchEmailKb is wired in service", () => {
	const src = fs.readFileSync(
		appPath("src/service.ts"),
		"utf8",
	);
	assert.ok(
		src.includes("searchEmailKb"),
		"searchEmailKb missing from service",
	);
	assert.ok(
		src.includes("searchEmailKbImpl"),
		"email-kb delegation missing from service",
	);
});

test("Tier 2.3 formatEmailSearch renders results with query echo", async () => {
	const { formatEmailSearch } = (await import(
		appPath("dist/src/formatters/workflows.js")
	)) as { formatEmailSearch: (results: unknown[], query: string) => string };
	const output = formatEmailSearch(
		[
			{
				message_id: "msg_aabbccdd1234",
				thread_id: "thread_001",
				subject: "Pricing proposal",
				from_header: "alice@example.com",
				relevance_rank: -1.5,
			},
			{
				message_id: "msg_eeff56781234",
				thread_id: "thread_002",
				subject: "Q2 pricing review",
				from_header: "bob@example.com",
				relevance_rank: -1.2,
			},
		],
		"pricing",
	);
	assert.match(output, /EMAIL SEARCH/);
	assert.match(output, /"pricing"/);
	assert.match(output, /2 thread/);
	assert.match(output, /Pricing proposal/);
	assert.match(output, /alice@example\.com/);
	assert.match(output, /Q2 pricing review/);
});
