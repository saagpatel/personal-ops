import { ensureRuntimeFiles, loadConfig, loadPolicy } from "./config.js";
import { GlassLayerClient } from "./glasslayer.js";
import { createHttpServer } from "./http.js";
import { Logger } from "./logger.js";
import { NotificationHubClient } from "./notification-hub.js";
import { PersonalOpsService } from "./service.js";

const paths = ensureRuntimeFiles();
const config = loadConfig(paths);
const policy = loadPolicy(paths);
const logger = new Logger(paths);
const service = new PersonalOpsService(paths, config, policy, logger);
service.assertStartupCompatibility();
const server = createHttpServer(service, config, policy);
const hub = new NotificationHubClient(logger);
const glass = new GlassLayerClient(logger);
const systemIdentity = {
	client_id: "system-daemon",
	requested_by: "daemon",
	auth_role: "operator" as const,
};

async function runMailboxSync() {
	try {
		await service.syncMailboxMetadata(systemIdentity);
		service.scheduleAutopilotRun("sync", { httpReachable: true });
	} catch (error) {
		logger.error("mailbox_sync_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function runCalendarSync() {
	try {
		await service.syncCalendarMetadata(systemIdentity);
		service.scheduleAutopilotRun("sync", { httpReachable: true });
	} catch (error) {
		logger.error("calendar_sync_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function runGithubSync() {
	try {
		await service.syncGithub(systemIdentity);
		service.scheduleAutopilotRun("sync", { httpReachable: true });
	} catch (error) {
		logger.error("github_sync_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function runDriveSync() {
	try {
		await service.syncDrive(systemIdentity);
		service.scheduleAutopilotRun("sync", { httpReachable: true });
	} catch (error) {
		logger.error("drive_sync_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

function pushGlassLayerStatus() {
	try {
		const inbox = service.getInboxStatusReport();
		const calendar = service.getCalendarStatusReport();
		const approvalCount = service.listApprovalQueue({
			state: "pending",
		}).length;

		const parts: string[] = [];
		if (inbox.followup_thread_count > 0) {
			parts.push(`inbox:${inbox.followup_thread_count}`);
		}
		if (approvalCount > 0) {
			parts.push(`approvals:${approvalCount}`);
		}
		const next = calendar.next_upcoming_event;
		if (next) {
			const minutes = Math.round(
				(new Date(next.start_at).getTime() - Date.now()) / 60_000,
			);
			if (minutes > 0 && minutes <= 120) {
				const label = (next.summary ?? "event").slice(0, 20);
				parts.push(`next:${label}@${minutes}m`);
			}
		}

		if (parts.length === 0) parts.push("personal-ops: all clear");
		glass.push(parts.join(" | "));
	} catch (error) {
		logger.error("glasslayer_status_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

const attentionSweep = setInterval(() => {
	service.runAttentionSweep({ httpReachable: true }).catch((error) => {
		logger.error("attention_sweep_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}, 60_000);
attentionSweep.unref();

const mailboxSync = setInterval(() => {
	runMailboxSync().catch((error) => {
		logger.error("mailbox_sync_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}, 5 * 60_000);
mailboxSync.unref();

const calendarSync = setInterval(() => {
	runCalendarSync().catch((error) => {
		logger.error("calendar_sync_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}, Math.max(1, config.calendarSyncIntervalMinutes) * 60_000);
calendarSync.unref();

const githubSync = setInterval(() => {
	runGithubSync().catch((error) => {
		logger.error("github_sync_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}, Math.max(1, config.githubSyncIntervalMinutes) * 60_000);
githubSync.unref();

const driveSync = setInterval(() => {
	runDriveSync().catch((error) => {
		logger.error("drive_sync_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}, Math.max(1, config.driveSyncIntervalMinutes) * 60_000);
driveSync.unref();

const autopilotInterval = setInterval(() => {
	service.scheduleAutopilotRun("interval", { httpReachable: true });
}, Math.max(1, config.autopilotRunIntervalMinutes) * 60_000);
autopilotInterval.unref();

const glassLayerTick = setInterval(() => {
	pushGlassLayerStatus();
}, 5 * 60_000);
glassLayerTick.unref();

// Pre-meeting brief: check every minute for an upcoming event within 30 min
const preMeetingAlertedIds = new Set<string>();
const preMeetingCheck = setInterval(() => {
	try {
		const brief = service.getMeetingContactBrief();
		if (!brief) return;
		if (preMeetingAlertedIds.has(brief.event_id)) return;
		preMeetingAlertedIds.add(brief.event_id);
		hub.post({
			source: "personal-ops",
			level: "info",
			title: `Meeting in ${brief.minutes_until}m: ${brief.title}`,
			body:
				brief.attendee_contexts.length > 0
					? `${brief.attendee_contexts.length} attendee(s) — run: personal-ops workflow meeting-brief`
					: "No external attendees.",
			project: "personal-ops",
		});
	} catch (error) {
		logger.error("pre_meeting_check_failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}, 60_000);
preMeetingCheck.unref();

server.listen(config.servicePort, config.serviceHost, () => {
	logger.info("daemon_started", {
		host: config.serviceHost,
		port: config.servicePort,
	});
	hub.post({
		source: "personal-ops",
		level: "info",
		title: "Daemon Started",
		body: `personal-ops listening on ${config.serviceHost}:${config.servicePort}`,
		project: "personal-ops",
	});
	service.normalizeRuntimeState();
	void (async () => {
		await runMailboxSync().catch((error) => {
			logger.error("mailbox_sync_failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
		await runCalendarSync().catch((error) => {
			logger.error("calendar_sync_failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
		await runGithubSync().catch((error) => {
			logger.error("github_sync_failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
		await runDriveSync().catch((error) => {
			logger.error("drive_sync_failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
		await service.runAttentionSweep({ httpReachable: true }).catch((error) => {
			logger.error("attention_sweep_failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
		service.scheduleAutopilotRun("startup", { httpReachable: true });
		// Push initial GlassLayer status after syncs complete
		pushGlassLayerStatus();
	})();
	process.stdout.write(
		JSON.stringify({
			status: "listening",
			host: config.serviceHost,
			port: config.servicePort,
		}) + "\n",
	);
});

function shutdown(signal: string) {
	logger.info("daemon_stopping", { signal });
	hub.post({
		source: "personal-ops",
		level: "warn",
		title: "Daemon Stopping",
		body: `personal-ops received ${signal}`,
		project: "personal-ops",
	});
	clearInterval(attentionSweep);
	clearInterval(mailboxSync);
	clearInterval(calendarSync);
	clearInterval(githubSync);
	clearInterval(driveSync);
	clearInterval(autopilotInterval);
	clearInterval(glassLayerTick);
	server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
