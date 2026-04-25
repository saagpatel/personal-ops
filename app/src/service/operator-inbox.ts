import type { AiActivitySummary, BridgeHandoff } from "../bridge-db.js";
import type { HubEventRecord } from "../notification-hub.js";
import type { NotionSnapshotSummary } from "../notion-snapshot-reader.js";
import type { PortfolioHealth } from "../portfolio-reader.js";
import type {
	AssistantActionQueueReport,
	InboxAutopilotReport,
	OperatorConfidence,
	OperatorFreshness,
	OperatorInboxItem,
	OperatorInboxPriority,
	OperatorInboxReport,
	OperatorInboxSource,
	OperatorInboxSourceState,
	OperatorInboxState,
	OperatorItem,
	OutboundAutopilotReport,
	PlanningAutopilotReport,
	ServiceStatusReport,
	WorkflowBundleReport,
	WorklistReport,
} from "../types.js";

const PRIORITIES: OperatorInboxPriority[] = ["P0", "P1", "P2", "P3"];
const STATES: OperatorInboxState[] = [
	"info",
	"review_needed",
	"approval_needed",
	"blocked",
	"ready_to_act",
	"waiting",
	"done",
];
const SOURCE_ORDER: OperatorInboxSource[] = [
	"personal_ops",
	"bridge_db",
	"notification_hub",
	"repo_auditor",
	"notion",
];

export interface OperatorInboxExternalSignals {
	bridge?: AiActivitySummary | null | undefined;
	hub_events?: HubEventRecord[] | null | undefined;
	portfolio?: PortfolioHealth | null | undefined;
	notion?: NotionSnapshotSummary | null | undefined;
}

export interface OperatorInboxInput {
	status: ServiceStatusReport;
	worklist: WorklistReport;
	assistant_queue: AssistantActionQueueReport;
	now_next: WorkflowBundleReport;
	inbox_autopilot: InboxAutopilotReport;
	planning_autopilot: PlanningAutopilotReport;
	outbound_autopilot: OutboundAutopilotReport;
	external?: OperatorInboxExternalSignals | undefined;
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
	return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function freshnessLabel(value: OperatorFreshness): string {
	if (value === "fresh") return "fresh local signal";
	if (value === "stale") return "stale signal";
	return "current local summary";
}

function confidenceLabel(value: OperatorConfidence): string {
	if (value === "high") return "high confidence";
	if (value === "low") return "lower confidence";
	return "medium confidence";
}

function stateFromOperatorItem(item: OperatorItem): OperatorInboxState {
	if (item.status === "blocked") return "blocked";
	if (item.status === "waiting") return "waiting";
	if (item.kind === "approval") return "approval_needed";
	if (item.kind === "review" || item.kind === "decision") return "review_needed";
	if (item.status === "ready" || item.status === "active") return "ready_to_act";
	return "info";
}

function priorityFromOperatorItem(item: OperatorItem): OperatorInboxPriority {
	if (item.kind === "repair" || item.status === "blocked" || item.bucket === "blocked") return "P0";
	if (item.kind === "approval" || item.kind === "review" || item.bucket === "now") return "P1";
	if (item.bucket === "soon" || item.bucket === "waiting") return "P2";
	return "P3";
}

function sourceRank(source: OperatorInboxSource): number {
	return SOURCE_ORDER.indexOf(source) === -1 ? SOURCE_ORDER.length : SOURCE_ORDER.indexOf(source);
}

function priorityRank(priority: OperatorInboxPriority): number {
	return PRIORITIES.indexOf(priority);
}

function stateRank(state: OperatorInboxState): number {
	const order: OperatorInboxState[] = [
		"blocked",
		"approval_needed",
		"review_needed",
		"ready_to_act",
		"waiting",
		"info",
		"done",
	];
	return order.indexOf(state);
}

function evidence(input: {
	source_label: string;
	captured_at: string | null;
	freshness: OperatorFreshness;
	confidence: OperatorConfidence;
	explanation: string;
	inferred?: boolean;
}): OperatorInboxItem["evidence"] {
	return {
		source_type: input.inferred ? "inferred_recommendation" : "local_summary",
		source_label: input.source_label,
		captured_at: input.captured_at,
		freshness_label: freshnessLabel(input.freshness),
		confidence_label: confidenceLabel(input.confidence),
		inferred: Boolean(input.inferred),
		explanation: input.explanation,
	};
}

function item(input: Omit<OperatorInboxItem, "evidence"> & { evidence_explanation: string; inferred?: boolean }): OperatorInboxItem {
	return {
		...input,
		evidence: evidence({
			source_label: input.source_label,
			captured_at: input.created_at,
			freshness: input.freshness,
			confidence: input.confidence,
			explanation: input.evidence_explanation,
			...(input.inferred !== undefined ? { inferred: input.inferred } : {}),
		}),
	};
}

function fromOperatorItem(itemValue: OperatorItem, generatedAt: string): OperatorInboxItem {
	const command = itemValue.primary_action?.command ?? null;
	return item({
		id: `personal-ops:${itemValue.id}`,
		source: "personal_ops",
		source_label: itemValue.evidence.source_label,
		source_ref: itemValue.id,
		title: itemValue.title,
		summary: itemValue.summary ?? itemValue.title,
		why_now: itemValue.why_now,
		priority: priorityFromOperatorItem(itemValue),
		state: stateFromOperatorItem(itemValue),
		owner: itemValue.kind === "workflow" ? "assistant" : "operator",
		freshness: itemValue.freshness,
		confidence: itemValue.confidence,
		created_at: itemValue.evidence.captured_at ?? generatedAt,
		source_url_or_command: command,
		safe_actions: command
			? [{ label: itemValue.primary_action?.label ?? "Open", command, safety: "existing_operator_gate" }]
			: [],
		evidence_explanation: itemValue.evidence.explanation ?? "Built from the current local operator surface.",
		inferred: itemValue.evidence.inferred,
	});
}

function appendUnique(items: OperatorInboxItem[], next: OperatorInboxItem): void {
	if (items.some((existing) => existing.id === next.id)) return;
	items.push(next);
}

function workspaceHomeItems(status: ServiceStatusReport): OperatorInboxItem[] {
	const home = status.workspace_home;
	const values = [
		home.primary_focus,
		...(home.ready_decisions ?? []),
		...(home.active_commitments ?? []),
		...(home.waiting_drift ?? []),
		...(home.system_posture ?? []),
	].filter((value): value is OperatorItem => Boolean(value));
	return values.map((value) => fromOperatorItem(value, status.generated_at));
}

function localPersonalOpsItems(input: OperatorInboxInput): OperatorInboxItem[] {
	const items: OperatorInboxItem[] = workspaceHomeItems(input.status);
	const generatedAt = input.status.generated_at;
	for (const workItem of input.worklist.items.slice(0, 5)) {
		appendUnique(
			items,
			item({
				id: `personal-ops:worklist:${workItem.item_id}`,
				source: "personal_ops",
				source_label: "worklist",
				source_ref: workItem.item_id,
				title: workItem.title,
				summary: workItem.summary,
				why_now: workItem.due_at ? `Due at ${workItem.due_at}.` : "This is currently on the local attention queue.",
				priority: workItem.severity === "critical" ? "P0" : workItem.severity === "warn" ? "P1" : "P3",
				state: workItem.severity === "critical" ? "blocked" : "ready_to_act",
				owner: "operator",
				freshness: "fresh",
				confidence: "high",
				created_at: workItem.created_at,
				source_url_or_command: workItem.suggested_command,
				safe_actions: [{ label: "Open worklist item", command: workItem.suggested_command, safety: "existing_operator_gate" }],
				evidence_explanation: "Built from the local worklist attention queue.",
			}),
		);
	}
	for (const action of input.assistant_queue.actions.filter((value) => value.state !== "completed").slice(0, 3)) {
		appendUnique(
			items,
			item({
				id: `personal-ops:assistant:${action.action_id}`,
				source: "personal_ops",
				source_label: "assistant action queue",
				source_ref: action.action_id,
				title: action.title,
				summary: action.summary,
				why_now: action.why_now,
				priority: action.state === "blocked" || action.state === "failed" ? "P1" : action.review_required ? "P1" : "P2",
				state: action.state === "blocked" || action.state === "failed" ? "blocked" : action.review_required ? "review_needed" : "ready_to_act",
				owner: action.review_required ? "operator" : "assistant",
				freshness: "current",
				confidence: "medium",
				created_at: generatedAt,
				source_url_or_command: action.command ?? null,
				safe_actions: action.command ? [{ label: "Open assistant action", command: action.command, safety: "existing_operator_gate" }] : [],
				evidence_explanation: "Built from the prepared local assistant action queue.",
				inferred: true,
			}),
		);
	}
	for (const group of input.inbox_autopilot.groups.slice(0, 3)) {
		appendUnique(
			items,
			item({
				id: `personal-ops:inbox-autopilot:${group.group_id}`,
				source: "personal_ops",
				source_label: "inbox autopilot",
				source_ref: group.group_id,
				title: group.kind === "needs_reply" ? "Inbox reply group is prepared" : "Inbox follow-up group is prepared",
				summary: group.summary,
				why_now: group.why_now,
				priority: group.review_required ? "P1" : "P2",
				state: group.review_required ? "review_needed" : "ready_to_act",
				owner: group.review_required ? "operator" : "assistant",
				freshness: "current",
				confidence: "medium",
				created_at: input.inbox_autopilot.generated_at,
				source_url_or_command: `personal-ops inbox autopilot --json`,
				safe_actions: [{ label: "Inspect inbox autopilot", command: "personal-ops inbox autopilot", safety: "read_only" }],
				evidence_explanation: "Built from the local inbox autopilot grouping report.",
				inferred: true,
			}),
		);
	}
	for (const bundle of input.planning_autopilot.bundles.slice(0, 3)) {
		appendUnique(
			items,
			item({
				id: `personal-ops:planning-bundle:${bundle.bundle_id}`,
				source: "personal_ops",
				source_label: "planning autopilot",
				source_ref: bundle.bundle_id,
				title: "Planning bundle is prepared",
				summary: bundle.summary,
				why_now: bundle.why_now,
				priority: bundle.review_required ? "P1" : "P2",
				state: bundle.review_required ? "review_needed" : "ready_to_act",
				owner: bundle.review_required ? "operator" : "assistant",
				freshness: "current",
				confidence: "medium",
				created_at: input.planning_autopilot.generated_at,
				source_url_or_command: `personal-ops planning autopilot --bundle ${bundle.bundle_id}`,
				safe_actions: [{ label: "Inspect planning bundle", command: `personal-ops planning autopilot --bundle ${bundle.bundle_id}`, safety: "read_only" }],
				evidence_explanation: "Built from the local planning autopilot bundle report.",
				inferred: true,
			}),
		);
	}
	for (const group of input.outbound_autopilot.groups.slice(0, 3)) {
		if (group.state === "completed") continue;
		appendUnique(
			items,
			item({
				id: `personal-ops:outbound-group:${group.group_id}`,
				source: "personal_ops",
				source_label: "outbound autopilot",
				source_ref: group.group_id,
				title: group.state === "send_ready" ? "Outbound group is send-ready" : "Outbound group needs review",
				summary: group.summary,
				why_now: group.why_now,
				priority: group.state === "send_ready" || group.state === "approval_ready" ? "P1" : "P2",
				state: group.state === "send_ready" || group.state === "approval_ready" ? "approval_needed" : group.state === "blocked" ? "blocked" : "review_needed",
				owner: "operator",
				freshness: "current",
				confidence: "high",
				created_at: input.outbound_autopilot.generated_at,
				source_url_or_command: `personal-ops outbound autopilot --group ${group.group_id}`,
				safe_actions: [{ label: "Inspect outbound group", command: `personal-ops outbound autopilot --group ${group.group_id}`, safety: "read_only" }],
				evidence_explanation: "Built from the local outbound autopilot grouped handoff report.",
			}),
		);
	}
	const workflowAction = input.now_next.actions[0];
	if (workflowAction) {
		appendUnique(
			items,
			item({
				id: `personal-ops:workflow:${workflowAction.target_type ?? "action"}:${workflowAction.target_id ?? workflowAction.label}`,
				source: "personal_ops",
				source_label: "now-next workflow",
				source_ref: workflowAction.target_id ?? workflowAction.label,
				title: workflowAction.label,
				summary: workflowAction.summary,
				why_now: workflowAction.why_now ?? input.now_next.summary,
				priority: workflowAction.score_band === "highest" ? "P1" : "P2",
				state: "ready_to_act",
				owner: "operator",
				freshness: "current",
				confidence: "medium",
				created_at: input.now_next.generated_at,
				source_url_or_command: workflowAction.command,
				safe_actions: [{ label: "Open workflow action", command: workflowAction.command, safety: "existing_operator_gate" }],
				evidence_explanation: "Built from the local now-next workflow recommendation.",
				inferred: true,
			}),
		);
	}
	return items;
}

function bridgeItems(summary: AiActivitySummary | null | undefined): OperatorInboxItem[] {
	if (!summary) return [];
	return summary.open_handoffs.slice(0, 3).map((handoff: BridgeHandoff) =>
		item({
			id: `bridge-db:handoff:${handoff.id}`,
			source: "bridge_db",
			source_label: "bridge-db handoff",
			source_ref: String(handoff.id),
			title: "Open cross-agent handoff",
			summary: `${handoff.project_name}${handoff.phase ? ` · ${handoff.phase}` : ""}`,
			why_now: `Status is ${handoff.status}; dispatched from ${handoff.dispatched_from}.`,
			priority: handoff.status === "active" ? "P1" : "P2",
			state: handoff.status === "active" ? "ready_to_act" : "waiting",
			owner: "operator",
			freshness: "current",
			confidence: "medium",
			created_at: handoff.dispatched_at,
			source_url_or_command: "personal-ops ai activity",
			safe_actions: [{ label: "Inspect AI activity", command: "personal-ops ai activity", safety: "read_only" }],
			evidence_explanation: "Read from bridge-db activity summary; personal-ops does not own bridge state.",
		}),
	);
}

function hubItems(events: HubEventRecord[] | null | undefined): OperatorInboxItem[] {
	return (events ?? [])
		.filter((event) => event.level === "urgent" || event.classified_level === "urgent")
		.slice(0, 3)
		.map((event) =>
			item({
				id: `notification-hub:event:${event.event_id}`,
				source: "notification_hub",
				source_label: "notification-hub urgent event",
				source_ref: event.event_id,
				title: event.title,
				summary: event.body,
				why_now: event.project ? `Project: ${event.project}.` : "Notification Hub classified this as urgent.",
				priority: "P1",
				state: "review_needed",
				owner: "operator",
				freshness: "fresh",
				confidence: "medium",
				created_at: event.received_at,
				source_url_or_command: null,
				safe_actions: [],
				evidence_explanation: "Read from notification-hub's local event log; delivery policy stays in notification-hub.",
			}),
		);
}

function portfolioItems(portfolio: PortfolioHealth | null | undefined): OperatorInboxItem[] {
	if (!portfolio || !portfolio.generated_at) return [];
	return portfolio.weakest_context_projects.slice(0, 2).map((project) =>
		item({
			id: `repo-auditor:context:${project.project_key}`,
			source: "repo_auditor",
			source_label: "GitHub Repo Auditor portfolio truth",
			source_ref: project.project_key,
			title: `Weak repo context: ${project.display_name}`,
			summary: `${project.context_quality} context quality; ${project.activity_status} activity.`,
			why_now: project.warnings[0] ?? "Repo Auditor marked this as one of the weakest active context surfaces.",
			priority: "P3",
			state: "info",
			owner: "operator",
			freshness: "stale",
			confidence: "medium",
			created_at: portfolio.generated_at,
			source_url_or_command: null,
			safe_actions: [],
			evidence_explanation: "Read from the exported portfolio truth snapshot; repo analysis remains owned by GitHub Repo Auditor.",
		}),
	);
}

function notionItems(notion: NotionSnapshotSummary | null | undefined): OperatorInboxItem[] {
	if (!notion?.available) return [];
	return notion.overdue_projects.slice(0, 3).map((project) =>
		item({
			id: `notion:overdue:${project.title}`,
			source: "notion",
			source_label: "Notion project snapshot",
			source_ref: project.title,
			title: `Notion review overdue: ${project.title}`,
			summary: project.next_review_date ? `Next review was ${project.next_review_date}.` : "Project is marked overdue without a next review date.",
			why_now: notion.briefing_line,
			priority: "P3",
			state: "review_needed",
			owner: "operator",
			freshness: "stale",
			confidence: "medium",
			created_at: notion.generated_at,
			source_url_or_command: null,
			safe_actions: [],
			evidence_explanation: "Read from the local Notion project snapshot; durable project records remain owned by Notion.",
		}),
	);
}

function sourceState(input: {
	source: OperatorInboxSource;
	available: boolean;
	summary: string;
	captured_at: string | null;
	items: OperatorInboxItem[];
}): OperatorInboxSourceState {
	return {
		source: input.source,
		available: input.available,
		summary: input.summary,
		captured_at: input.captured_at,
		item_count: input.items.filter((itemValue) => itemValue.source === input.source).length,
	};
}

function sortItems(items: OperatorInboxItem[]): OperatorInboxItem[] {
	return [...items].sort((left, right) => {
		const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
		if (priorityDelta !== 0) return priorityDelta;
		const stateDelta = stateRank(left.state) - stateRank(right.state);
		if (stateDelta !== 0) return stateDelta;
		const sourceDelta = sourceRank(left.source) - sourceRank(right.source);
		if (sourceDelta !== 0) return sourceDelta;
		return (right.created_at ?? "").localeCompare(left.created_at ?? "");
	});
}

function dedupeItems(items: OperatorInboxItem[]): OperatorInboxItem[] {
	const seen = new Set<string>();
	const deduped: OperatorInboxItem[] = [];
	for (const itemValue of items) {
		const command = itemValue.safe_actions.find((action) => action.command)?.command;
		const key = command
			? `${itemValue.source}:${command}:${itemValue.summary}`
			: `${itemValue.source}:${itemValue.title}:${itemValue.summary}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(itemValue);
	}
	return deduped;
}

export function buildOperatorInboxReport(input: OperatorInboxInput): OperatorInboxReport {
	const localItems = localPersonalOpsItems(input);
	const bridge = bridgeItems(input.external?.bridge);
	const hub = hubItems(input.external?.hub_events);
	const portfolio = portfolioItems(input.external?.portfolio);
	const notion = notionItems(input.external?.notion);
	const items = dedupeItems(sortItems([...localItems, ...bridge, ...hub, ...portfolio, ...notion]));
	const countsByPriority = countBy(PRIORITIES);
	const countsByState = countBy(STATES);
	for (const itemValue of items) {
		countsByPriority[itemValue.priority] += 1;
		countsByState[itemValue.state] += 1;
	}
	const actionable = items.filter((itemValue) => itemValue.state !== "info" && itemValue.state !== "done").length;
	const top = items[0];
	return {
		generated_at: input.status.generated_at,
		summary: top
			? `${actionable} actionable item${actionable === 1 ? "" : "s"}; top: ${top.title}.`
			: "No operator inbox items are waiting right now.",
		items,
		top_items: items.slice(0, 5),
		counts_by_priority: countsByPriority,
		counts_by_state: countsByState,
		sources: [
			sourceState({ source: "personal_ops", available: true, summary: input.status.workspace_home.summary ?? input.status.workspace_home.title, captured_at: input.status.generated_at, items }),
			sourceState({ source: "bridge_db", available: Boolean(input.external?.bridge), summary: input.external?.bridge?.briefing_line ?? "bridge-db unavailable or not requested", captured_at: input.external?.bridge?.recent_activity[0]?.timestamp ?? null, items }),
			sourceState({ source: "notification_hub", available: Boolean(input.external?.hub_events), summary: input.external?.hub_events ? `${input.external.hub_events.length} recent events read` : "notification-hub events unavailable or not requested", captured_at: input.external?.hub_events?.[0]?.received_at ?? null, items }),
			sourceState({ source: "repo_auditor", available: Boolean(input.external?.portfolio?.generated_at), summary: input.external?.portfolio?.briefing_line ?? "portfolio truth unavailable or not requested", captured_at: input.external?.portfolio?.generated_at ?? null, items }),
			sourceState({ source: "notion", available: Boolean(input.external?.notion?.available), summary: input.external?.notion?.briefing_line ?? "Notion snapshot unavailable or not requested", captured_at: input.external?.notion?.generated_at ?? null, items }),
		],
	};
}
