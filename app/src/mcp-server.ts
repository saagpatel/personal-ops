import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ensureRuntimeFiles, loadConfig } from "./config.js";
import { getPersonalOpsMcpHeaders } from "./mcp-identity.js";
import { readServiceVersion } from "./version.js";

const paths = ensureRuntimeFiles();
const config = loadConfig(paths);

function assertAllowedToolArgs(
	args: Record<string, unknown>,
	allowedKeys: string[],
	toolName: string,
) {
	const allowed = new Set(allowedKeys);
	const unsupported = [
		...new Set(Object.keys(args).filter((key) => !allowed.has(key))),
	];
	if (unsupported.length === 0) {
		return;
	}
	const label = unsupported.length === 1 ? "argument" : "arguments";
	throw new Error(
		`Unsupported ${label} for ${toolName}: ${unsupported.join(", ")}. Only ${allowedKeys.join(" and ")} are supported.`,
	);
}

function requestJson<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const payload = body ? JSON.stringify(body) : undefined;
		const identityHeaders = getPersonalOpsMcpHeaders();
		const request = http.request(
			{
				host: config.serviceHost,
				port: config.servicePort,
				method,
				path,
				headers: {
					Authorization: `Bearer ${config.assistantApiToken}`,
					"Content-Type": "application/json",
					...identityHeaders,
					...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
				},
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
				response.on("end", () => {
					const raw = Buffer.concat(chunks).toString("utf8");
					const parsed = raw ? JSON.parse(raw) : {};
					if ((response.statusCode ?? 500) >= 400) {
						reject(
							new Error(
								parsed.error ??
									`Request failed with status ${response.statusCode}`,
							),
						);
						return;
					}
					resolve(parsed);
				});
			},
		);
		request.on("error", reject);
		if (payload) {
			request.write(payload);
		}
		request.end();
	});
}

const tools = [
	{
		name: "mail_draft_create",
		description:
			"Create a Gmail draft through the local personal-ops control plane.",
		inputSchema: {
			type: "object",
			required: ["to", "subject"],
			properties: {
				to: { type: "array", items: { type: "string" } },
				cc: { type: "array", items: { type: "string" } },
				bcc: { type: "array", items: { type: "string" } },
				subject: { type: "string" },
				body_text: { type: "string" },
				body_html: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "mail_draft_update",
		description: "Update an existing local draft artifact and its Gmail draft.",
		inputSchema: {
			type: "object",
			required: ["artifact_id", "to", "subject"],
			properties: {
				artifact_id: { type: "string" },
				to: { type: "array", items: { type: "string" } },
				cc: { type: "array", items: { type: "string" } },
				bcc: { type: "array", items: { type: "string" } },
				subject: { type: "string" },
				body_text: { type: "string" },
				body_html: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "mail_draft_list",
		description: "List personal-ops draft artifacts.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "approval_queue_list",
		description: "List approval requests in personal-ops.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number" },
				state: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "approval_queue_pending",
		description: "List pending approval requests only.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "approval_queue_get",
		description: "Get the details for a single approval request.",
		inputSchema: {
			type: "object",
			required: ["approval_id"],
			properties: {
				approval_id: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "approval_request_create",
		description:
			"Create a send approval request for a draft when directly instructed by the user.",
		inputSchema: {
			type: "object",
			required: ["artifact_id"],
			properties: {
				artifact_id: { type: "string" },
				note: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "approval_request_approve",
		description:
			"Approve a request only when the user directly instructs the action. Requires a confirmation token.",
		inputSchema: {
			type: "object",
			required: ["approval_id", "note", "confirmation_token"],
			properties: {
				approval_id: { type: "string" },
				note: { type: "string" },
				confirmation_token: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "approval_request_reject",
		description:
			"Reject a request only when the user directly instructs the action.",
		inputSchema: {
			type: "object",
			required: ["approval_id", "note"],
			properties: {
				approval_id: { type: "string" },
				note: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "approval_request_send",
		description:
			"Send an approved draft only when the user directly instructs the action. Requires a confirmation token.",
		inputSchema: {
			type: "object",
			required: ["approval_id", "note", "confirmation_token"],
			properties: {
				approval_id: { type: "string" },
				note: { type: "string" },
				confirmation_token: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "review_queue_list",
		description: "List pending and opened review queue items.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "audit_events_recent",
		description: "Return recent personal-ops audit events.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number" },
				category: {
					type: "string",
					enum: ["sync", "task", "task_suggestion", "planning"],
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "personal_ops_status",
		description:
			"Show high-level readiness for the local personal-ops service.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "personal_ops_doctor",
		description: "Run local diagnostics for personal-ops.",
		inputSchema: {
			type: "object",
			properties: {
				deep: { type: "boolean" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "review_queue_pending",
		description: "List pending review items only.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "review_queue_get",
		description: "Get the details for a single review queue item.",
		inputSchema: {
			type: "object",
			required: ["review_id"],
			properties: {
				review_id: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "personal_ops_worklist",
		description: "Show what needs attention right now in personal-ops.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "notification_feed",
		description:
			"Read recent events from the notification-hub unified event bus (127.0.0.1:9199). " +
			"Returns events from all connected projects in reverse-chronological order. " +
			"Use this to see what has happened across the machine recently.",
		inputSchema: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description:
						"Maximum number of events to return (1-500, default 50).",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "ai_activity_summary",
		description:
			"Read AI session activity and cost data from bridge-db. Shows monthly spend, " +
			"recent sessions across projects, and open handoffs between Claude Code/Codex/Claude.ai.",
		inputSchema: {
			type: "object",
			properties: {
				days: {
					type: "number",
					description: "Days of activity history to include (1-90, default 7).",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "portfolio_health",
		description:
			"Read GithubRepoAuditor portfolio health: stalest repos, weakest context quality, " +
			"registry status counts. Sourced from ~/Projects/GithubRepoAuditor/output/portfolio-truth-latest.json.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "agent_performance_summary",
		description:
			"Read eval harness results comparing Claude Code vs Codex performance by task category. " +
			"Shows pass rates, retry counts, and which agent leads on each task type.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "mcp_security_posture",
		description:
			"Run mcp-audit scan (skip-connect mode) and return security posture of all configured MCP servers. " +
			"Returns risk scores, flags, and permission surface per server.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "github_status",
		description:
			"Show GitHub PR and review integration readiness for personal-ops.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "github_reviews",
		description: "List GitHub review requests needing operator attention.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "github_pulls",
		description:
			"List GitHub pull requests that currently matter to the operator loop.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "github_pull_get",
		description:
			"Get details for a GitHub pull request in owner/repo#number form.",
		inputSchema: {
			type: "object",
			required: ["pr_key"],
			properties: {
				pr_key: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "drive_status",
		description:
			"Show Google Drive and Docs integration readiness for personal-ops.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "drive_files",
		description:
			"List in-scope Drive files and Docs metadata cached by personal-ops.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "drive_doc_get",
		description:
			"Get extracted text context for a cached Google Doc by file id.",
		inputSchema: {
			type: "object",
			required: ["file_id"],
			properties: {
				file_id: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "drive_sheet_get",
		description: "Get cached Google Sheets preview context for a file id.",
		inputSchema: {
			type: "object",
			required: ["file_id"],
			properties: {
				file_id: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "send_window_status",
		description:
			"Show the current timed send-window status without mutating it.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "inbox_classified",
		description:
			"Return the inbox classified into act_today and waiting_on_someone buckets using local Ollama inference. act_today: threads needing a decision or reply within 24h. waiting_on_someone: threads where you sent last and are awaiting a response. Capped at 5 per bucket.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "meeting_contact_brief",
		description:
			"Get a pre-meeting contact brief for the next upcoming calendar event within 30 minutes (or a specific event by ID). Shows attendees and recent email history with each person so you can walk in prepared.",
		inputSchema: {
			type: "object",
			properties: {
				event_id: {
					type: "string",
					description:
						"Optional calendar event ID. If omitted, finds the next meeting within 30 minutes.",
				},
			},
			additionalProperties: false,
		},
	},
	{
		name: "end_of_day_digest",
		description:
			"Get the end-of-day digest: today's meetings, inbox activity (inbound/outbound count), tasks completed, overdue open tasks, pending approvals, and AI cost. Use at day's end to review and close out.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "inbox_status",
		description:
			"Show the current mailbox metadata sync status and inbox counts.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "inbox_unread_list",
		description: "List unread inbox threads from the local metadata index.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "inbox_followup_list",
		description:
			"List sent follow-up threads that have not received a newer inbound reply.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "inbox_thread_get",
		description: "Get the stored metadata for a single mailbox thread.",
		inputSchema: {
			type: "object",
			required: ["thread_id"],
			properties: {
				thread_id: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "inbox_needs_reply_list",
		description:
			"List inbox threads whose latest message is inbound and likely waiting on the operator.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "inbox_recent_list",
		description:
			"List recently updated mailbox threads across the local INBOX and SENT metadata index.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "calendar_status",
		description:
			"Show the current shared calendar sync status and scheduling summary.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "calendar_calendars_list",
		description:
			"List calendars currently selected in the local calendar index.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "calendar_upcoming_list",
		description: "List upcoming events from the shared calendar index.",
		inputSchema: {
			type: "object",
			properties: {
				days: { type: "number" },
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "calendar_conflict_list",
		description: "List overlapping busy calendar events from the shared index.",
		inputSchema: {
			type: "object",
			properties: {
				days: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "calendar_free_time_get",
		description: "Get free workday windows for a local YYYY-MM-DD date.",
		inputSchema: {
			type: "object",
			required: ["day"],
			properties: {
				day: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "calendar_day_get",
		description: "Get the full day agenda view for a local YYYY-MM-DD date.",
		inputSchema: {
			type: "object",
			required: ["day"],
			properties: {
				day: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "calendar_event_get",
		description: "Get the stored metadata for a single calendar event.",
		inputSchema: {
			type: "object",
			required: ["event_id"],
			properties: {
				event_id: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "task_list",
		description: "List internal personal-ops tasks.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "task_get",
		description: "Get the details for a single task.",
		inputSchema: {
			type: "object",
			required: ["task_id"],
			properties: { task_id: { type: "string" } },
			additionalProperties: false,
		},
	},
	{
		name: "task_due_list",
		description: "List tasks that are due soon or overdue.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "task_overdue_list",
		description: "List tasks that are already overdue.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "task_suggestion_list",
		description: "List task suggestions waiting on operator review.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "task_suggestion_get",
		description: "Get the details for a single task suggestion.",
		inputSchema: {
			type: "object",
			required: ["suggestion_id"],
			properties: { suggestion_id: { type: "string" } },
			additionalProperties: false,
		},
	},
	{
		name: "task_suggestion_create",
		description:
			"Create a task suggestion when the user directly instructs you to remember or track something.",
		inputSchema: {
			type: "object",
			required: ["title"],
			properties: {
				title: { type: "string" },
				notes: { type: "string" },
				kind: { type: "string" },
				priority: { type: "string" },
				due_at: { type: "string" },
				remind_at: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_list",
		description: "List planning recommendations waiting on operator action.",
		inputSchema: {
			type: "object",
			properties: {
				status: { type: "string" },
				kind: { type: "string" },
				all: { type: "boolean" },
				grouped: { type: "boolean" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_get",
		description: "Get the details for a single planning recommendation.",
		inputSchema: {
			type: "object",
			required: ["recommendation_id"],
			properties: { recommendation_id: { type: "string" } },
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_group_list",
		description: "List grouped planning recommendation summaries.",
		inputSchema: {
			type: "object",
			properties: {
				status: { type: "string" },
				kind: { type: "string" },
				all: { type: "boolean" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_group_get",
		description: "Get the details for a planning recommendation group.",
		inputSchema: {
			type: "object",
			required: ["group_key"],
			properties: { group_key: { type: "string" } },
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_next",
		description:
			"Get the next actionable planning recommendation overall or within a group.",
		inputSchema: {
			type: "object",
			properties: {
				group: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_summary",
		description: "Get the shared planning recommendation summary report.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_tuning",
		description:
			"Get operator-facing planning tuning summaries for reviewed and proposed hygiene families.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_backlog",
		description:
			"Get planning recommendation backlog analytics overall or for one group.",
		inputSchema: {
			type: "object",
			properties: {
				group: { type: "string" },
				kind: { type: "string" },
				source: { type: "string" },
				stale_only: { type: "boolean" },
				manual_only: { type: "boolean" },
				resurfaced_only: { type: "boolean" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_closure",
		description:
			"Get planning recommendation closure analytics for a recent lookback window.",
		inputSchema: {
			type: "object",
			properties: {
				days: { type: "number" },
				group: { type: "string" },
				kind: { type: "string" },
				source: { type: "string" },
				close_reason: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_hygiene",
		description:
			"Get planning recommendation hygiene analytics and advisory suppression candidates.",
		inputSchema: {
			type: "object",
			properties: {
				group: { type: "string" },
				kind: { type: "string" },
				source: { type: "string" },
				candidate_only: { type: "boolean" },
				review_needed_only: { type: "boolean" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "planning_recommendation_create",
		description:
			"Create a scheduling recommendation for an existing task when directly instructed by the user.",
		inputSchema: {
			type: "object",
			required: ["kind", "task_id", "start_at", "end_at"],
			properties: {
				kind: { type: "string" },
				task_id: { type: "string" },
				start_at: { type: "string" },
				end_at: { type: "string" },
				calendar_id: { type: "string" },
				title: { type: "string" },
				notes: { type: "string" },
				priority: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "contact_graph",
		description:
			"Return the top contacts ranked by relationship warmth (recency × frequency). " +
			"Warmth combines last-contact recency (30-day half-life) with total message + meeting count. " +
			"Use to identify who to reconnect with or to get a quick relationship overview.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "contact_search",
		description:
			"Search contacts by email or display name substring. Returns matching contacts ranked by warmth.",
		inputSchema: {
			type: "object",
			required: ["query"],
			properties: {
				query: { type: "string" },
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "ai_context_recall",
		description:
			"Search AI session memory from bridge-db. Find what Claude was working on across projects. " +
			"Accepts optional keyword query, project name filter, and time window (days).",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
				project: { type: "string" },
				days: { type: "number" },
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
	{
		name: "email_search",
		description:
			"Full-text search over email messages (subject + sender). Returns results grouped by thread. " +
			"Supports optional sender filter via `from` parameter.",
		inputSchema: {
			type: "object",
			required: ["query"],
			properties: {
				query: { type: "string" },
				from: { type: "string" },
				limit: { type: "number" },
			},
			additionalProperties: false,
		},
	},
];

const server = new Server(
	{
		name: "personal-ops",
		version: readServiceVersion(paths.appDir),
	},
	{
		capabilities: {
			tools: {},
		},
	},
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const name = request.params.name;
	const args = (request.params.arguments ?? {}) as Record<string, unknown>;

	if (name === "mail_draft_create") {
		const response = await requestJson("POST", "/v1/mail/drafts", args);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "mail_draft_update") {
		const artifactId = String(args.artifact_id);
		const { artifact_id, ...body } = args;
		const response = await requestJson(
			"PATCH",
			`/v1/mail/drafts/${artifactId}`,
			body,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "mail_draft_list") {
		const response = await requestJson("GET", "/v1/mail/drafts");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "approval_queue_list") {
		const search = new URLSearchParams();
		search.set("limit", String(Number(args.limit ?? 100)));
		if (typeof args.state === "string") {
			search.set("state", args.state);
		}
		const response = await requestJson(
			"GET",
			`/v1/approval-queue?${search.toString()}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "approval_queue_pending") {
		const response = await requestJson("GET", "/v1/approval-queue/pending");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "approval_queue_get") {
		const response = await requestJson(
			"GET",
			`/v1/approval-queue/${String(args.approval_id)}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "approval_request_create") {
		const response = await requestJson(
			"POST",
			`/v1/mail/drafts/${String(args.artifact_id)}/request-approval`,
			{
				note: args.note,
			},
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "approval_request_approve") {
		const response = await requestJson(
			"POST",
			`/v1/approval-queue/${String(args.approval_id)}/approve`,
			{
				note: args.note,
				confirmation_token: args.confirmation_token,
			},
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "approval_request_reject") {
		const response = await requestJson(
			"POST",
			`/v1/approval-queue/${String(args.approval_id)}/reject`,
			{
				note: args.note,
			},
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "approval_request_send") {
		const response = await requestJson(
			"POST",
			`/v1/approval-queue/${String(args.approval_id)}/send`,
			{
				note: args.note,
				confirmation_token: args.confirmation_token,
			},
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "review_queue_list") {
		const response = await requestJson("GET", "/v1/review-queue");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "audit_events_recent") {
		assertAllowedToolArgs(args, ["limit", "category"], "audit_events_recent");
		const search = new URLSearchParams();
		search.set("limit", String(Number(args.limit ?? 20)));
		if (typeof args.category === "string") {
			search.set("category", args.category);
		}
		const response = await requestJson(
			"GET",
			`/v1/audit/events?${search.toString()}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "personal_ops_status") {
		const response = await requestJson("GET", "/v1/status");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "personal_ops_doctor") {
		const deep = Boolean(args.deep);
		const response = await requestJson(
			"GET",
			deep ? "/v1/doctor?deep=true" : "/v1/doctor",
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "review_queue_pending") {
		const response = await requestJson("GET", "/v1/review-queue/pending");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "review_queue_get") {
		const response = await requestJson(
			"GET",
			`/v1/review-queue/${String(args.review_id)}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "personal_ops_worklist") {
		const response = await requestJson("GET", "/v1/worklist");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "notification_feed") {
		assertAllowedToolArgs(args, ["limit"], "notification_feed");
		const limit =
			typeof args.limit === "number"
				? Math.min(Math.max(1, args.limit), 500)
				: 50;
		const response = await requestJson("GET", `/v1/hub/feed?limit=${limit}`);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "ai_activity_summary") {
		assertAllowedToolArgs(args, ["days"], "ai_activity_summary");
		const days =
			typeof args.days === "number" ? Math.min(Math.max(1, args.days), 90) : 7;
		const response = await requestJson(
			"GET",
			`/v1/bridge/summary?days=${days}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "portfolio_health") {
		assertAllowedToolArgs(args, [], "portfolio_health");
		const response = await requestJson("GET", "/v1/portfolio/health");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "agent_performance_summary") {
		assertAllowedToolArgs(args, [], "agent_performance_summary");
		const response = await requestJson("GET", "/v1/evals/summary");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "mcp_security_posture") {
		assertAllowedToolArgs(args, [], "mcp_security_posture");
		const response = await requestJson("GET", "/v1/security/posture");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "github_status") {
		const response = await requestJson("GET", "/v1/github/status");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "github_reviews") {
		const response = await requestJson("GET", "/v1/github/reviews");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "github_pulls") {
		const response = await requestJson("GET", "/v1/github/pulls");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "github_pull_get") {
		const response = await requestJson(
			"GET",
			`/v1/github/pulls/${encodeURIComponent(String(args.pr_key))}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "drive_status") {
		const response = await requestJson("GET", "/v1/drive/status");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "drive_files") {
		const response = await requestJson("GET", "/v1/drive/files");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "drive_doc_get") {
		const response = await requestJson(
			"GET",
			`/v1/drive/docs/${encodeURIComponent(String(args.file_id))}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "drive_sheet_get") {
		const response = await requestJson(
			"GET",
			`/v1/drive/sheets/${encodeURIComponent(String(args.file_id))}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "send_window_status") {
		const response = await requestJson("GET", "/v1/send-window");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "inbox_classified") {
		assertAllowedToolArgs(args, [], "inbox_classified");
		const response = await requestJson("GET", "/v1/inbox/classified");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "meeting_contact_brief") {
		assertAllowedToolArgs(args, ["event_id"], "meeting_contact_brief");
		const qs = args.event_id
			? `?event_id=${encodeURIComponent(String(args.event_id))}`
			: "";
		const response = await requestJson(
			"GET",
			`/v1/workflows/meeting-brief${qs}`,
		);
		const { formatMeetingContactBrief } = await import("./formatters.js");
		const brief = (response as { brief: unknown }).brief;
		if (!brief) {
			return {
				content: [
					{
						type: "text",
						text: "No upcoming meeting within 30 minutes found.",
					},
				],
			};
		}
		return {
			content: [
				{
					type: "text",
					text: formatMeetingContactBrief(
						brief as Parameters<typeof formatMeetingContactBrief>[0],
					),
				},
			],
		};
	}
	if (name === "end_of_day_digest") {
		assertAllowedToolArgs(args, [], "end_of_day_digest");
		const response = await requestJson("GET", "/v1/workflows/end-of-day");
		const { formatEndOfDayDigest } = await import("./formatters.js");
		return {
			content: [
				{
					type: "text",
					text: formatEndOfDayDigest(
						(
							response as {
								end_of_day_digest: Parameters<typeof formatEndOfDayDigest>[0];
							}
						).end_of_day_digest,
					),
				},
			],
		};
	}
	if (name === "inbox_status") {
		const response = await requestJson("GET", "/v1/inbox/status");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "inbox_unread_list") {
		const limit = Number(args.limit ?? 50);
		const response = await requestJson(
			"GET",
			`/v1/inbox/unread?limit=${limit}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "inbox_followup_list") {
		const limit = Number(args.limit ?? 50);
		const response = await requestJson(
			"GET",
			`/v1/inbox/followups?limit=${limit}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "inbox_thread_get") {
		const response = await requestJson(
			"GET",
			`/v1/inbox/threads/${String(args.thread_id)}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "inbox_needs_reply_list") {
		const limit = Number(args.limit ?? 50);
		const response = await requestJson(
			"GET",
			`/v1/inbox/needs-reply?limit=${limit}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "inbox_recent_list") {
		const limit = Number(args.limit ?? 50);
		const response = await requestJson(
			"GET",
			`/v1/inbox/recent?limit=${limit}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "calendar_status") {
		const response = await requestJson("GET", "/v1/calendar/status");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "calendar_calendars_list") {
		const response = await requestJson("GET", "/v1/calendar/calendars");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "calendar_upcoming_list") {
		const days = Number(args.days ?? 7);
		const limit = Number(args.limit ?? 20);
		const response = await requestJson(
			"GET",
			`/v1/calendar/upcoming?days=${days}&limit=${limit}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "calendar_conflict_list") {
		const days = Number(args.days ?? 7);
		const response = await requestJson(
			"GET",
			`/v1/calendar/conflicts?days=${days}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "calendar_free_time_get") {
		const response = await requestJson(
			"GET",
			`/v1/calendar/free-time?day=${encodeURIComponent(String(args.day))}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "calendar_day_get") {
		const response = await requestJson(
			"GET",
			`/v1/calendar/day?day=${encodeURIComponent(String(args.day))}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "calendar_event_get") {
		const response = await requestJson(
			"GET",
			`/v1/calendar/events/${encodeURIComponent(String(args.event_id))}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "task_list") {
		const response = await requestJson("GET", "/v1/tasks");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "task_get") {
		const response = await requestJson(
			"GET",
			`/v1/tasks/${String(args.task_id)}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "task_due_list") {
		const response = await requestJson("GET", "/v1/tasks/due");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "task_overdue_list") {
		const response = await requestJson("GET", "/v1/tasks/overdue");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "task_suggestion_list") {
		const response = await requestJson("GET", "/v1/task-suggestions");
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "task_suggestion_get") {
		const response = await requestJson(
			"GET",
			`/v1/task-suggestions/${String(args.suggestion_id)}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "task_suggestion_create") {
		const response = await requestJson("POST", "/v1/task-suggestions", args);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_list") {
		const search = new URLSearchParams();
		if (args.status) search.set("status", String(args.status));
		if (args.kind) search.set("kind", String(args.kind));
		if (args.all) search.set("all", "true");
		if (args.grouped) search.set("grouped", "true");
		const suffix = search.size ? `?${search.toString()}` : "";
		const response = await requestJson(
			"GET",
			`/v1/planning-recommendations${suffix}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_get") {
		const response = await requestJson(
			"GET",
			`/v1/planning-recommendations/${String(args.recommendation_id)}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_group_list") {
		const search = new URLSearchParams();
		if (args.status) search.set("status", String(args.status));
		if (args.kind) search.set("kind", String(args.kind));
		if (args.all) search.set("all", "true");
		const suffix = search.size ? `?${search.toString()}` : "";
		const response = await requestJson(
			"GET",
			`/v1/planning-recommendation-groups${suffix}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_group_get") {
		const response = await requestJson(
			"GET",
			`/v1/planning-recommendation-groups/${encodeURIComponent(String(args.group_key))}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_next") {
		const search = new URLSearchParams();
		if (args.group) search.set("group", String(args.group));
		const suffix = search.size ? `?${search.toString()}` : "";
		const response = await requestJson(
			"GET",
			`/v1/planning-recommendations/next${suffix}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_summary") {
		const response = await requestJson(
			"GET",
			"/v1/planning-recommendations/summary",
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_backlog") {
		const search = new URLSearchParams();
		if (args.group) search.set("group", String(args.group));
		if (args.kind) search.set("kind", String(args.kind));
		if (args.source) search.set("source", String(args.source));
		if (args.stale_only) search.set("stale_only", "true");
		if (args.manual_only) search.set("manual_only", "true");
		if (args.resurfaced_only) search.set("resurfaced_only", "true");
		const suffix = search.size ? `?${search.toString()}` : "";
		const response = await requestJson(
			"GET",
			`/v1/planning-recommendations/backlog${suffix}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_closure") {
		const search = new URLSearchParams();
		if (args.days !== undefined) search.set("days", String(args.days));
		if (args.group) search.set("group", String(args.group));
		if (args.kind) search.set("kind", String(args.kind));
		if (args.source) search.set("source", String(args.source));
		if (args.close_reason)
			search.set("close_reason", String(args.close_reason));
		const suffix = search.size ? `?${search.toString()}` : "";
		const response = await requestJson(
			"GET",
			`/v1/planning-recommendations/closure${suffix}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_hygiene") {
		const search = new URLSearchParams();
		if (args.group) search.set("group", String(args.group));
		if (args.kind) search.set("kind", String(args.kind));
		if (args.source) search.set("source", String(args.source));
		if (args.candidate_only) search.set("candidate_only", "true");
		if (args.review_needed_only) search.set("review_needed_only", "true");
		const suffix = search.size ? `?${search.toString()}` : "";
		const response = await requestJson(
			"GET",
			`/v1/planning-recommendations/hygiene${suffix}`,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_tuning") {
		const response = await requestJson(
			"GET",
			"/v1/planning-recommendations/tuning",
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}
	if (name === "planning_recommendation_create") {
		const response = await requestJson(
			"POST",
			"/v1/planning-recommendations",
			args,
		);
		return {
			content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
		};
	}

	if (name === "contact_graph") {
		assertAllowedToolArgs(args, ["limit"], "contact_graph");
		const limit =
			typeof args.limit === "number" ? Math.min(args.limit, 200) : 20;
		const response = await requestJson("GET", `/v1/contacts?limit=${limit}`);
		const { formatContactGraph } = await import("./formatters.js");
		return {
			content: [
				{
					type: "text",
					text: formatContactGraph(
						(response as { contacts: Parameters<typeof formatContactGraph>[0] })
							.contacts,
					),
				},
			],
		};
	}
	if (name === "contact_search") {
		assertAllowedToolArgs(args, ["query", "limit"], "contact_search");
		const q = encodeURIComponent(String(args.query ?? ""));
		const limit =
			typeof args.limit === "number" ? Math.min(args.limit, 200) : 20;
		const response = await requestJson(
			"GET",
			`/v1/contacts/search?q=${q}&limit=${limit}`,
		);
		const { formatContactGraph } = await import("./formatters.js");
		return {
			content: [
				{
					type: "text",
					text: formatContactGraph(
						(response as { contacts: Parameters<typeof formatContactGraph>[0] })
							.contacts,
					),
				},
			],
		};
	}
	if (name === "ai_context_recall") {
		assertAllowedToolArgs(
			args,
			["query", "project", "days", "limit"],
			"ai_context_recall",
		);
		const params = new URLSearchParams();
		if (args.query) params.set("q", String(args.query));
		if (args.project) params.set("project", String(args.project));
		if (args.days) params.set("days", String(args.days));
		if (args.limit) params.set("limit", String(args.limit));
		const qs = params.size > 0 ? `?${params.toString()}` : "";
		const response = await requestJson("GET", `/v1/ai/memory${qs}`);
		const { formatAiMemory } = await import("./formatters.js");
		return {
			content: [
				{
					type: "text",
					text: formatAiMemory(
						(response as { results: Parameters<typeof formatAiMemory>[0] })
							.results,
					),
				},
			],
		};
	}
	if (name === "email_search") {
		assertAllowedToolArgs(args, ["query", "from", "limit"], "email_search");
		const params = new URLSearchParams();
		params.set("q", String(args.query ?? ""));
		if (args.from) params.set("from", String(args.from));
		if (args.limit) params.set("limit", String(args.limit));
		const response = await requestJson(
			"GET",
			`/v1/inbox/search?${params.toString()}`,
		);
		const { formatEmailSearch } = await import("./formatters.js");
		return {
			content: [
				{
					type: "text",
					text: formatEmailSearch(
						(
							response as {
								results: Parameters<typeof formatEmailSearch>[0];
								query: string;
							}
						).results,
						(response as { query: string }).query,
					),
				},
			],
		};
	}

	throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
