import type { BridgeDbClientLike } from "../bridge-db.js";

export class PersonalOpsActivityLogger {
	constructor(private readonly bridgeDb: BridgeDbClientLike) {}

	taskCompleted(taskTitle: string | null | undefined, taskId: string, note: string) {
		this.bridgeDb.logActivity(
			taskTitle || taskId,
			`Task completed: ${note}`,
			["TASK_DONE"],
		);
	}

	planningApplied(
		proposedTitle: string | null | undefined,
		recommendationId: string,
		note: string,
	) {
		this.bridgeDb.logActivity(
			proposedTitle || recommendationId,
			`Planning applied: ${note}`,
			["PLANNING_APPLIED"],
		);
	}

	reviewResolved(note: string) {
		this.bridgeDb.logActivity(
			"personal-ops",
			`Review resolved: ${note}`,
			["REVIEW_CLOSED"],
		);
	}

	approvalSent(subject: string | null | undefined, approvalId: string) {
		this.bridgeDb.logActivity(
			"personal-ops",
			`Draft sent: ${subject || approvalId}`,
			["APPROVAL_SENT"],
		);
	}
}
