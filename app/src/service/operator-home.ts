import type {
	AssistantActionQueueReport,
	EvidenceCard,
	MaintenanceDecisionState,
	MaintenanceRepairConvergenceState,
	OperatorConfidence,
	OperatorFreshness,
	OperatorItem,
	OperatorItemKind,
	OperatorItemStatus,
	OperatorMode,
	ServiceStatusReport,
	WorkingSetBucket,
	WorkflowBundleReport,
	WorkspaceHomeSummary,
} from "../types.js";

function actionableAssistantAction(
	queue: AssistantActionQueueReport,
): AssistantActionQueueReport["actions"][number] | null {
	return (
		queue.actions.find(
			(action) =>
				action.state === "proposed" || action.state === "awaiting_review",
		) ?? null
	);
}

function maintenanceHomeSummary(
	report: ServiceStatusReport,
): Pick<
	WorkspaceHomeSummary,
	"summary" | "why_now" | "maintenance_state" | "primary_command"
> | null {
	const convergence = report.maintenance_repair_convergence;
	if (
		convergence?.eligible &&
		convergence.state !== "repair_owned" &&
		convergence.state !== "none" &&
		convergence.summary
	) {
		return {
			summary: convergence.summary,
			why_now: convergence.why,
			maintenance_state: convergence.state,
			primary_command:
				convergence.primary_command ?? "personal-ops maintenance session",
		};
	}
	const decision = report.maintenance_decision_explanation;
	if (
		decision?.eligible &&
		decision.state !== "suppressed" &&
		decision.summary
	) {
		return {
			summary: decision.summary,
			why_now: decision.why_now ?? decision.why_not_higher,
			maintenance_state: decision.state,
			primary_command:
				decision.suggested_command ?? "personal-ops maintenance session",
		};
	}
	return null;
}

function appendSecondaryHint(
	hints: string[],
	value: string | null | undefined,
): void {
	if (!value || !value.trim()) {
		return;
	}
	const normalized = value.trim();
	if (hints.includes(normalized)) {
		return;
	}
	hints.push(normalized);
}

function confidenceLabel(value: OperatorConfidence): string {
	switch (value) {
		case "high":
			return "high confidence";
		case "medium":
			return "medium confidence";
		default:
			return "lower confidence";
	}
}

function freshnessLabel(value: OperatorFreshness): string {
	switch (value) {
		case "fresh":
			return "fresh local signal";
		case "current":
			return "current local summary";
		default:
			return "stale signal";
	}
}

function evidenceCard(input: {
	source_type: EvidenceCard["source_type"];
	source_label: string;
	captured_at: string | null;
	freshness: OperatorFreshness;
	confidence: OperatorConfidence;
	inferred?: boolean;
	explanation: string;
}): EvidenceCard {
	return {
		source_type: input.source_type,
		source_label: input.source_label,
		captured_at: input.captured_at,
		freshness_label: freshnessLabel(input.freshness),
		confidence_label: confidenceLabel(input.confidence),
		inferred: Boolean(input.inferred),
		explanation: input.explanation,
	};
}

function operatorItem(input: {
	id: string;
	kind: OperatorItemKind;
	title: string;
	summary: string | null;
	source: string;
	source_owner: string;
	bucket: WorkingSetBucket;
	freshness?: OperatorFreshness;
	confidence?: OperatorConfidence;
	why_now?: string | null;
	primary_action?: OperatorItem["primary_action"];
	secondary_actions?: OperatorItem["secondary_actions"];
	status: OperatorItemStatus;
	evidence: EvidenceCard;
}): OperatorItem {
	return {
		id: input.id,
		kind: input.kind,
		title: input.title,
		summary: input.summary,
		source: input.source,
		source_owner: input.source_owner,
		bucket: input.bucket,
		freshness: input.freshness ?? "current",
		confidence: input.confidence ?? "medium",
		why_now: input.why_now ?? null,
		primary_action: input.primary_action ?? null,
		secondary_actions: input.secondary_actions ?? [],
		status: input.status,
		evidence: input.evidence,
	};
}

function buildSystemPostureItems(status: ServiceStatusReport): OperatorItem[] {
	const readinessSummary =
		status.state === "ready"
			? "The local control plane looks healthy."
			: "The local control plane needs attention before you trust the rest of the workspace.";
	const command = status.first_repair_step ? "personal-ops repair plan" : null;
	return [
		operatorItem({
			id: "system-posture-readiness",
			kind: "attention",
			title:
				status.state === "ready"
					? "Local control plane looks healthy"
					: "Local control plane needs attention",
			summary: `${readinessSummary} ${status.checks_summary.pass} pass / ${status.checks_summary.warn} warn / ${status.checks_summary.fail} fail.`,
			source: "status_report",
			source_owner: "personal-ops",
			bucket: status.state === "ready" ? "background" : "now",
			freshness: "fresh",
			confidence: "high",
			why_now:
				status.first_repair_step
					? `Repair starts with ${status.first_repair_step}.`
					: "This is the current local status report.",
			primary_action: command
				? { label: "Repair plan", command }
				: { label: "Status", command: "personal-ops status --json" },
			status: status.state === "ready" ? "background" : "active",
			evidence: evidenceCard({
				source_type: "direct_local_fact",
				source_label: "service status report",
				captured_at: status.generated_at,
				freshness: "fresh",
				confidence: "high",
				explanation: "Built directly from the current service readiness and doctor summary.",
			}),
		}),
	];
}

function buildReviewDecisionItems(
	status: ServiceStatusReport,
): OperatorItem[] {
	const flow = status.review_approval_flow;
	if (!flow?.eligible || !flow.summary) {
		return [];
	}
	return [
		operatorItem({
			id: `review-approval:${flow.target_type}:${flow.target_id}`,
			kind:
				flow.state === "approval_needed" || flow.state === "send_ready"
					? "approval"
					: "review",
			title: "Review and approval handoff is ready",
			summary: flow.summary,
			source: "review_approval_flow",
			source_owner: "personal-ops",
			bucket: "soon",
			freshness: "current",
			confidence: "high",
			why_now: flow.why_now,
			primary_action: flow.primary_command
				? { label: "Open handoff", command: flow.primary_command }
				: null,
			secondary_actions: flow.supporting_summary
				? [{ label: "Supporting note", command: null }]
				: [],
			status: "ready",
			evidence: evidenceCard({
				source_type: "local_summary",
				source_label: "review and approval flow",
				captured_at: status.generated_at,
				freshness: "current",
				confidence: "high",
				explanation:
					"Comes from the current review and approval handoff summary, not a separate external source.",
			}),
		}),
	];
}

function buildMaintenanceCommitmentItems(
	status: ServiceStatusReport,
): OperatorItem[] {
	const commitment = status.maintenance_commitment;
	if (!commitment?.active || !commitment.summary) {
		return [];
	}
	return [
		operatorItem({
			id: `maintenance-commitment:${commitment.step_id ?? "none"}`,
			kind: "commitment",
			title: "Preventive maintenance is already in motion",
			summary: commitment.summary,
			source: "maintenance_commitment",
			source_owner: "personal-ops",
			bucket:
				commitment.placement === "now"
					? "now"
					: commitment.placement === "prep_day"
						? "soon"
						: "background",
			freshness: "current",
			confidence: "medium",
			why_now:
				commitment.placement === "now"
					? "This maintenance family already has an active commitment."
					: "This maintenance family is already scheduled into the operating rhythm.",
			primary_action: commitment.suggested_command
				? {
						label: "Resume maintenance",
						command: commitment.suggested_command,
					}
				: null,
			status: commitment.placement === "now" ? "active" : "ready",
			evidence: evidenceCard({
				source_type: "local_summary",
				source_label: "maintenance commitment",
				captured_at: status.generated_at,
				freshness: "current",
				confidence: "medium",
				explanation:
					"Built from maintenance commitment tracking already present in the local status report.",
			}),
		}),
	];
}

function buildWaitingDriftItems(status: ServiceStatusReport): OperatorItem[] {
	const items: OperatorItem[] = [];
	const deferMemory = status.maintenance_defer_memory;
	if (deferMemory?.active && deferMemory.summary) {
		items.push(
			operatorItem({
				id: `maintenance-defer:${deferMemory.step_id ?? "none"}`,
				kind: "follow_up",
				title: "A maintenance thread has been deferred repeatedly",
				summary: deferMemory.summary,
				source: "maintenance_defer_memory",
				source_owner: "personal-ops",
				bucket: "waiting",
				freshness: "current",
				confidence: "medium",
				why_now: deferMemory.last_deferred_at
					? `Last deferred at ${deferMemory.last_deferred_at}.`
					: "This is waiting quietly and could drift.",
				primary_action: {
					label: "Review maintenance",
					command: "personal-ops maintenance session",
				},
				status: "waiting",
				evidence: evidenceCard({
					source_type: "local_summary",
					source_label: "maintenance defer memory",
					captured_at: status.generated_at,
					freshness: "current",
					confidence: "medium",
					explanation:
						"Derived from local maintenance defer history rather than a live blocking event.",
				}),
			}),
		);
	}
	const operatingBlock = status.maintenance_operating_block;
	if (operatingBlock?.eligible && operatingBlock.summary) {
		items.push(
			operatorItem({
				id: `maintenance-block:${operatingBlock.step_id ?? "none"}`,
				kind: "attention",
				title: "Maintenance is constrained by the current operating block",
				summary: operatingBlock.summary,
				source: "maintenance_operating_block",
				source_owner: "personal-ops",
				bucket:
					operatingBlock.block === "current_block" ? "blocked" : "waiting",
				freshness: "current",
				confidence: "medium",
				why_now: operatingBlock.reason,
				primary_action: operatingBlock.suggested_command
					? {
							label: "Review block",
							command: operatingBlock.suggested_command,
						}
					: null,
				status:
					operatingBlock.block === "current_block" ? "blocked" : "waiting",
				evidence: evidenceCard({
					source_type: "local_summary",
					source_label: "maintenance operating block",
					captured_at: status.generated_at,
					freshness: "current",
					confidence: "medium",
					explanation:
						"Represents a local operating constraint, not a hard external dependency.",
				}),
			}),
		);
	}
	return items;
}

function primaryFocusForRepair(
	status: ServiceStatusReport,
	assistantSummary: string | null,
	workflowSummary: string | null,
	maintenanceSummary: string | null,
): WorkspaceHomeSummary {
	const secondaryHints: string[] = [];
	appendSecondaryHint(secondaryHints, assistantSummary);
	appendSecondaryHint(secondaryHints, workflowSummary);
	appendSecondaryHint(secondaryHints, maintenanceSummary);
	const summary =
		status.maintenance_repair_convergence?.summary ??
		(status.first_repair_step
			? `Follow ${status.first_repair_step} before trusting the rest of the workspace.`
			: "Active repair owns the workspace right now.");
	const primaryFocus = operatorItem({
		id: `workspace-home:repair:${status.first_repair_step ?? "active"}`,
		kind: "repair",
		title: "Repair comes first",
		summary,
		source: "repair_plan",
		source_owner: "personal-ops",
		bucket: "now",
		freshness: "fresh",
		confidence: "high",
		why_now:
			"Active repair outranks assistant-prepared work, workflow guidance, and preventive maintenance until the local control plane is stable again.",
		primary_action: {
			label: "Repair plan",
			command: "personal-ops repair plan",
		},
		status: "active",
		evidence: evidenceCard({
			source_type: "direct_local_fact",
			source_label: "repair plan",
			captured_at: status.generated_at,
			freshness: "fresh",
			confidence: "high",
			explanation:
				"Built from the current repair state and repair convergence signal in the local status report.",
		}),
	});
	return {
		ready: status.state === "ready",
		state: "repair",
		title: primaryFocus.title,
		summary: primaryFocus.summary,
		why_now: primaryFocus.why_now,
		primary_command: primaryFocus.primary_action?.command ?? null,
		secondary_summary: secondaryHints[0] ?? null,
		assistant_action_id: null,
		workflow: null,
		maintenance_state: status.maintenance_repair_convergence?.state ?? null,
		primary_focus: primaryFocus,
	};
}

function primaryFocusForAssistant(
	status: ServiceStatusReport,
	action: NonNullable<ReturnType<typeof actionableAssistantAction>>,
	workflowSummary: string | null,
	maintenanceSummary: string | null,
): WorkspaceHomeSummary {
	const secondaryHints: string[] = [];
	appendSecondaryHint(secondaryHints, workflowSummary);
	appendSecondaryHint(secondaryHints, maintenanceSummary);
	const primaryFocus = operatorItem({
		id: `workspace-home:assistant:${action.action_id}`,
		kind: action.review_required ? "review" : "attention",
		title: "Assistant-prepared work is ready",
		summary: action.summary,
		source: "assistant_queue",
		source_owner: "personal-ops",
		bucket: "now",
		freshness: "current",
		confidence: "medium",
		why_now: action.why_now,
		primary_action: action.command
			? { label: "Open assistant queue", command: action.command }
			: null,
		status: "ready",
		evidence: evidenceCard({
			source_type: "local_summary",
			source_label: "assistant action queue",
			captured_at: status.generated_at,
			freshness: "current",
			confidence: "medium",
			explanation:
				"This is a prepared local action surfaced by the assistant queue, not an external source of truth.",
		}),
	});
	return {
		ready: status.state === "ready",
		state: "assistant",
		title: primaryFocus.title,
		summary: primaryFocus.summary,
		why_now: primaryFocus.why_now,
		primary_command: primaryFocus.primary_action?.command ?? null,
		secondary_summary: secondaryHints[0] ?? null,
		assistant_action_id: action.action_id,
		workflow: null,
		maintenance_state: null,
		primary_focus: primaryFocus,
	};
}

function primaryFocusForWorkflow(
	status: ServiceStatusReport,
	workflow: WorkflowBundleReport,
	action: NonNullable<WorkflowBundleReport["actions"][number]>,
	maintenanceSummary: string | null,
): WorkspaceHomeSummary {
	const secondaryHints: string[] = [];
	appendSecondaryHint(secondaryHints, maintenanceSummary);
	const primaryFocus = operatorItem({
		id: `workspace-home:workflow:${action.target_id ?? action.planning_recommendation_id ?? action.label}`,
		kind: "workflow",
		title: "This is the best next move",
		summary: action.summary,
		source: "workflow_now_next",
		source_owner: "personal-ops",
		bucket: "now",
		freshness: "current",
		confidence: "medium",
		why_now: action.why_now ?? workflow.summary,
		primary_action: action.command
			? { label: "Open workflow", command: action.command }
			: null,
		status: "ready",
		evidence: evidenceCard({
			source_type: "inferred_recommendation",
			source_label: "now-next workflow",
			captured_at: status.generated_at,
			freshness: "current",
			confidence: "medium",
			inferred: true,
			explanation:
				"This is an inferred next-best move from the current workflow, not a direct source-of-truth record.",
		}),
	});
	return {
		ready: status.state === "ready",
		state: "workflow",
		title: primaryFocus.title,
		summary: primaryFocus.summary,
		why_now: primaryFocus.why_now,
		primary_command: primaryFocus.primary_action?.command ?? null,
		secondary_summary: secondaryHints[0] ?? null,
		assistant_action_id: null,
		workflow: workflow.workflow,
		maintenance_state: null,
		primary_focus: primaryFocus,
	};
}

function primaryFocusForMaintenance(
	status: ServiceStatusReport,
	maintenance: NonNullable<ReturnType<typeof maintenanceHomeSummary>>,
): WorkspaceHomeSummary {
	const primaryFocus = operatorItem({
		id: `workspace-home:maintenance:${maintenance.maintenance_state ?? "active"}`,
		kind: "commitment",
		title: "Upkeep is the main focus right now",
		summary: maintenance.summary,
		source: "maintenance_guidance",
		source_owner: "personal-ops",
		bucket: "soon",
		freshness: "current",
		confidence: "medium",
		why_now: maintenance.why_now,
		primary_action: maintenance.primary_command
			? { label: "Open maintenance", command: maintenance.primary_command }
			: null,
		status: "ready",
		evidence: evidenceCard({
			source_type: "local_summary",
			source_label: "maintenance guidance",
			captured_at: status.generated_at,
			freshness: "current",
			confidence: "medium",
			explanation:
				"This is local maintenance guidance derived from recent repair and upkeep behavior.",
		}),
	});
	return {
		ready: status.state === "ready",
		state: "maintenance",
		title: primaryFocus.title,
		summary: primaryFocus.summary,
		why_now: primaryFocus.why_now,
		primary_command: primaryFocus.primary_action?.command ?? null,
		secondary_summary: null,
		assistant_action_id: null,
		workflow: null,
		maintenance_state: maintenance.maintenance_state,
		primary_focus: primaryFocus,
	};
}

function primaryFocusCaughtUp(status: ServiceStatusReport): WorkspaceHomeSummary {
	const primaryFocus = operatorItem({
		id: "workspace-home:caught-up",
		kind: "attention",
		title: "The workspace is caught up",
		summary:
			"No urgent repair, assistant-prepared, workflow, or maintenance focus is currently leading.",
		source: "workspace_home",
		source_owner: "personal-ops",
		bucket: "background",
		freshness: "current",
		confidence: "medium",
		why_now: null,
		primary_action: null,
		status: "background",
		evidence: evidenceCard({
			source_type: "local_summary",
			source_label: "workspace home",
			captured_at: status.generated_at,
			freshness: "current",
			confidence: "medium",
			explanation:
				"This is a fallback local summary when no higher-priority focus is currently leading.",
		}),
	});
	return {
		ready: status.state === "ready",
		state: "caught_up",
		title: primaryFocus.title,
		summary: primaryFocus.summary,
		why_now: null,
		primary_command: null,
		secondary_summary: null,
		assistant_action_id: null,
		workflow: null,
		maintenance_state: null,
		primary_focus: primaryFocus,
	};
}

function modeSummary(mode: OperatorMode): string {
	switch (mode) {
		case "day_start":
			return "Day-start mode emphasizes system posture, the primary focus, and active commitments.";
		case "decisions":
			return "Decisions mode emphasizes review, approval, and operator judgment surfaces.";
		default:
			return "Focus mode emphasizes the strongest current item while keeping supporting context compact.";
	}
}

function shapeItemsForMode(
	items: OperatorItem[],
	mode: OperatorMode,
	section: "ready_decisions" | "active_commitments" | "waiting_drift" | "system_posture",
): OperatorItem[] {
	const limitByMode: Record<
		OperatorMode,
		Record<
			"ready_decisions" | "active_commitments" | "waiting_drift" | "system_posture",
			number
		>
	> = {
		day_start: {
			ready_decisions: 2,
			active_commitments: 3,
			waiting_drift: 2,
			system_posture: 2,
		},
		focus: {
			ready_decisions: 1,
			active_commitments: 2,
			waiting_drift: 1,
			system_posture: 1,
		},
		decisions: {
			ready_decisions: 3,
			active_commitments: 1,
			waiting_drift: 2,
			system_posture: 1,
		},
	};
	return items.slice(0, limitByMode[mode][section]);
}

export function emptyWorkspaceHomeSummary(
	mode: OperatorMode = "focus",
): WorkspaceHomeSummary {
	return {
		ready: false,
		state: "caught_up",
		title: "The workspace is loading",
		summary: "The shared workspace focus is loading local operator state.",
		why_now: null,
		primary_command: null,
		secondary_summary: null,
		assistant_action_id: null,
		workflow: null,
		maintenance_state: null,
		mode,
		mode_summary: modeSummary(mode),
		primary_focus: null,
		ready_decisions: [],
		active_commitments: [],
		waiting_drift: [],
		system_posture: [],
		review_approval_flow: undefined,
	};
}

export function buildWorkspaceHomeSummary(input: {
	status: ServiceStatusReport;
	assistantQueue: AssistantActionQueueReport;
	nowNextWorkflow: WorkflowBundleReport;
	mode?: OperatorMode;
}): WorkspaceHomeSummary {
	const { status, assistantQueue, nowNextWorkflow } = input;
	const mode = input.mode ?? "focus";
	const repairOwned =
		status.maintenance_repair_convergence?.eligible &&
		status.maintenance_repair_convergence.state === "repair_owned";
	const topAssistantAction = actionableAssistantAction(assistantQueue);
	const topWorkflowAction = nowNextWorkflow.actions[0] ?? null;
	const maintenance = maintenanceHomeSummary(status);

	let summary: WorkspaceHomeSummary;
	if (status.first_repair_step || repairOwned) {
		summary = primaryFocusForRepair(
			status,
			topAssistantAction?.summary ?? null,
			topWorkflowAction?.summary ?? null,
			maintenance?.summary ?? null,
		);
	} else if (topAssistantAction) {
		summary = primaryFocusForAssistant(
			status,
			topAssistantAction,
			topWorkflowAction?.summary ?? null,
			maintenance?.summary ?? null,
		);
	} else if (topWorkflowAction) {
		summary = primaryFocusForWorkflow(
			status,
			nowNextWorkflow,
			topWorkflowAction,
			maintenance?.summary ?? null,
		);
	} else if (maintenance) {
		summary = primaryFocusForMaintenance(status, maintenance);
	} else {
		summary = primaryFocusCaughtUp(status);
	}

	const primaryId = summary.primary_focus?.id ?? null;
	const readyDecisions = buildReviewDecisionItems(status).filter(
		(item) => item.id !== primaryId,
	);
	const activeCommitments = buildMaintenanceCommitmentItems(status).filter(
		(item) => item.id !== primaryId,
	);
	const waitingDrift = buildWaitingDriftItems(status).filter(
		(item) => item.id !== primaryId,
	);
	const systemPosture = buildSystemPostureItems(status).filter(
		(item) => item.id !== primaryId,
	);

	return {
		...summary,
		mode,
		mode_summary: modeSummary(mode),
		ready_decisions: shapeItemsForMode(
			readyDecisions,
			mode,
			"ready_decisions",
		),
		active_commitments: shapeItemsForMode(
			activeCommitments,
			mode,
			"active_commitments",
		),
		waiting_drift: shapeItemsForMode(waitingDrift, mode, "waiting_drift"),
		system_posture: shapeItemsForMode(systemPosture, mode, "system_posture"),
	};
}

export function operatorHomeSectionItems(
	summary: WorkspaceHomeSummary,
): Array<{
	key:
		| "primary_focus"
		| "ready_decisions"
		| "active_commitments"
		| "waiting_drift"
		| "system_posture";
	title: string;
	items: OperatorItem[];
}> {
	return [
		{
			key: "primary_focus",
			title: "Primary Focus",
			items: summary.primary_focus ? [summary.primary_focus] : [],
		},
		{
			key: "ready_decisions",
			title: "Ready Decisions",
			items: summary.ready_decisions ?? [],
		},
		{
			key: "active_commitments",
			title: "Active Commitments",
			items: summary.active_commitments ?? [],
		},
		{
			key: "waiting_drift",
			title: "Waiting / Drift",
			items: summary.waiting_drift ?? [],
		},
		{
			key: "system_posture",
			title: "System Posture",
			items: summary.system_posture ?? [],
		},
	];
}

export function workspaceHomeSectionFallback(
	key:
		| "ready_decisions"
		| "active_commitments"
		| "waiting_drift"
		| "system_posture",
): string {
	switch (key) {
		case "ready_decisions":
			return "No operator decisions are currently queued at the top of the home surface.";
		case "active_commitments":
			return "No active commitments are currently leading the home surface.";
		case "waiting_drift":
			return "Nothing is quietly drifting at the top of the current home surface.";
		case "system_posture":
			return "System posture is not available yet.";
	}
}

export function maintenanceStateLabel(
	value: MaintenanceRepairConvergenceState | MaintenanceDecisionState | null,
): string | null {
	return value ? value.replaceAll("_", " ") : null;
}
