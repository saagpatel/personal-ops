import assert from "node:assert/strict";
import test from "node:test";
import { buildOperatorInboxReport } from "../src/service/operator-inbox.js";
import type {
	AssistantActionQueueReport,
	InboxAutopilotReport,
	OperatorItem,
	OutboundAutopilotReport,
	PlanningAutopilotReport,
	ServiceStatusReport,
	WorkflowBundleReport,
	WorklistReport,
} from "../src/types.js";

const generatedAt = "2026-04-24T10:00:00.000Z";

function operatorItem(overrides: Partial<OperatorItem>): OperatorItem {
	return {
		id: "item",
		kind: "attention",
		title: "Local control plane looks healthy",
		summary: "The local control plane looks healthy.",
		source: "status_report",
		source_owner: "personal-ops",
		bucket: "background",
		freshness: "fresh",
		confidence: "high",
		why_now: "This is the current local status report.",
		primary_action: { label: "Status", command: "personal-ops status --json" },
		secondary_actions: [],
		status: "background",
		evidence: {
			source_type: "direct_local_fact",
			source_label: "service status report",
			captured_at: generatedAt,
			freshness_label: "fresh local signal",
			confidence_label: "high confidence",
			inferred: false,
			explanation: "Current readiness summary.",
		},
		...overrides,
	};
}

function baseStatus(primaryFocus: OperatorItem): ServiceStatusReport {
	return {
		generated_at: generatedAt,
		service_version: "0.2.0-test",
		state: "ready",
		first_repair_step: null,
		workspace_home: {
			ready: true,
			state: "caught_up",
			title: primaryFocus.title,
			summary: primaryFocus.summary,
			why_now: primaryFocus.why_now,
			primary_command: primaryFocus.primary_action?.command ?? null,
			secondary_summary: null,
			assistant_action_id: null,
			workflow: null,
			maintenance_state: null,
			mode: "focus",
			mode_summary: "Focus mode.",
			primary_focus: primaryFocus,
			ready_decisions: [],
			active_commitments: [],
			waiting_drift: [],
			system_posture: [],
		},
	} as unknown as ServiceStatusReport;
}

function emptyWorklist(): WorklistReport {
	return {
		generated_at: generatedAt,
		state: "ready",
		counts_by_severity: { info: 0, warn: 0, critical: 0 },
		send_window: { active: false },
		planning_groups: [],
		maintenance_window: {} as WorklistReport["maintenance_window"],
		maintenance_follow_through: {} as WorklistReport["maintenance_follow_through"],
		maintenance_escalation: {} as WorklistReport["maintenance_escalation"],
		maintenance_scheduling: {} as WorklistReport["maintenance_scheduling"],
		items: [],
	};
}

function assistantQueue(): AssistantActionQueueReport {
	return {
		generated_at: generatedAt,
		readiness: "ready",
		summary: "Assistant queue test.",
		counts_by_state: {
			proposed: 1,
			running: 0,
			awaiting_review: 0,
			blocked: 0,
			completed: 0,
			failed: 0,
		},
		top_item_summary: "Prepared review.",
		actions: [
			{
				action_id: "assistant-1",
				title: "Prepared review is waiting",
				summary: "A prepared review can be inspected.",
				state: "proposed",
				section: "overview",
				batch: false,
				one_click: false,
				review_required: true,
				why_now: "It is prepared but needs the operator.",
				command: "personal-ops review packages",
				signals: ["test"],
			},
		],
	};
}

function emptyReports() {
	return {
		now_next: {
			workflow: "now-next",
			generated_at: generatedAt,
			readiness: "ready",
			summary: "No workflow action.",
			sections: [],
			actions: [],
			first_repair_step: null,
			maintenance_follow_through: {},
			maintenance_escalation: {},
			maintenance_scheduling: {},
		} as unknown as WorkflowBundleReport,
		inbox_autopilot: {
			generated_at: generatedAt,
			readiness: "ready",
			summary: "No inbox groups.",
			top_item_summary: null,
			prepared_draft_count: 0,
			groups: [],
		} as InboxAutopilotReport,
		planning_autopilot: {
			generated_at: generatedAt,
			readiness: "ready",
			summary: "No planning bundles.",
			top_item_summary: null,
			prepared_bundle_count: 0,
			bundles: [],
		} as PlanningAutopilotReport,
		outbound_autopilot: {
			generated_at: generatedAt,
			readiness: "ready",
			summary: "No outbound groups.",
			top_item_summary: null,
			send_window: {
				active: false,
				effective_send_enabled: false,
				permanent_send_enabled: false,
			},
			groups: [],
		} as OutboundAutopilotReport,
	};
}

test("Operator Inbox ranks repair before prepared assistant work", () => {
	const repair = operatorItem({
		id: "workspace-home:repair:auth",
		kind: "repair",
		title: "Repair comes first",
		summary: "Follow the repair plan before trusting the workspace.",
		bucket: "now",
		status: "active",
		primary_action: { label: "Repair plan", command: "personal-ops repair plan" },
	});
	const report = buildOperatorInboxReport({
		status: baseStatus(repair),
		worklist: emptyWorklist(),
		assistant_queue: assistantQueue(),
		...emptyReports(),
	});
	assert.equal(report.top_items[0]?.title, "Repair comes first");
	assert.equal(report.top_items[0]?.priority, "P0");
	assert.equal(report.top_items[0]?.state, "ready_to_act");
	assert.equal(report.counts_by_priority.P0, 1);
});

test("Operator Inbox exposes read-only external sources without hiding local items", () => {
	const report = buildOperatorInboxReport({
		status: baseStatus(operatorItem({ id: "system-posture-readiness" })),
		worklist: emptyWorklist(),
		assistant_queue: { ...assistantQueue(), actions: [] },
		...emptyReports(),
		external: {
			bridge: {
				current_month: "2026-04",
				monthly_costs: [],
				recent_activity: [],
				briefing_line: "1 handoff pending",
				open_handoffs: [
					{
						id: 42,
						project_name: "bridge-db",
						project_path: "/Users/d/Projects/bridge-db",
						roadmap_file: null,
						phase: "startup sync",
						dispatched_from: "cc",
						dispatched_at: generatedAt,
						picked_up_at: null,
						cleared_at: null,
						status: "pending",
					},
				],
			},
			hub_events: [
				{
					event_id: "evt-1",
					source: "repo_auditor",
					level: "urgent",
					classified_level: "urgent",
					title: "Repo audit needs review",
					body: "An urgent repo signal arrived.",
					received_at: generatedAt,
				},
			],
		},
	});
	assert.ok(report.items.some((item) => item.source === "personal_ops"));
	assert.ok(report.items.some((item) => item.source === "bridge_db"));
	assert.ok(report.items.some((item) => item.source === "notification_hub"));
	assert.equal(report.sources.find((source) => source.source === "bridge_db")?.available, true);
	assert.equal(report.items.find((item) => item.source === "bridge_db")?.safe_actions[0]?.safety, "read_only");
});

test("Operator Inbox formatter keeps compact human output and read-only source state", async () => {
	const { formatOperatorInboxReport } = await import("../src/formatters.js");
	const report = buildOperatorInboxReport({
		status: baseStatus(operatorItem({ id: "system-posture-readiness" })),
		worklist: emptyWorklist(),
		assistant_queue: assistantQueue(),
		...emptyReports(),
	});
	const formatted = formatOperatorInboxReport(report);
	assert.match(formatted, /Operator Inbox/);
	assert.match(formatted, /Top Items/);
	assert.match(formatted, /next: personal-ops review packages/);
	assert.match(formatted, /personal_ops: available/);
});
