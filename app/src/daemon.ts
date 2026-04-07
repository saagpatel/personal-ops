import { ensureRuntimeFiles, loadConfig, loadPolicy } from "./config.js";
import { createHttpServer } from "./http.js";
import { Logger } from "./logger.js";
import { PersonalOpsService } from "./service.js";

const paths = ensureRuntimeFiles();
const config = loadConfig(paths);
const policy = loadPolicy(paths);
const logger = new Logger(paths);
const service = new PersonalOpsService(paths, config, policy, logger);
service.assertStartupCompatibility();
const server = createHttpServer(service, config, policy);
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

server.listen(config.servicePort, config.serviceHost, () => {
  logger.info("daemon_started", {
    host: config.serviceHost,
    port: config.servicePort,
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
  clearInterval(attentionSweep);
  clearInterval(mailboxSync);
  clearInterval(calendarSync);
  clearInterval(githubSync);
  clearInterval(driveSync);
  clearInterval(autopilotInterval);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
