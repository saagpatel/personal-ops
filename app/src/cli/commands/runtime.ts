import { execFileSync } from "node:child_process";
import type { Command } from "commander";
import {
  formatDoctorReport,
  formatHealthCheckReport,
  formatNowReport,
  formatSendWindowStatus,
  formatStatusReport,
  formatVersionReport,
  formatWorkflowBundleReport,
  formatWorklistReport,
} from "../../formatters.js";
import { buildHealthCheckReport } from "../../health.js";
import type { Logger } from "../../logger.js";
import type { Paths } from "../../types.js";
import { buildVersionReport } from "../../version.js";
import type { CliContext } from "../shared.js";

function openUrl(url: string): void {
  if (process.platform === "darwin") {
    execFileSync("open", [url]);
    return;
  }
  if (process.platform === "win32") {
    execFileSync("cmd", ["/c", "start", "", url]);
    return;
  }
  execFileSync("xdg-open", [url]);
}

export function registerRuntimeCommands(program: Command, context: CliContext, logger: Logger, paths: Paths) {
  program
    .command("notify")
    .description("Local notification helpers.")
    .command("test")
    .description("Show a macOS test notification to confirm local notifications work.")
    .action(() => {
      execFileSync("osascript", [
        "-e",
        'display notification "personal-ops local notification path is working." with title "Personal Ops: Test"',
      ]);
      logger.info("notify_test");
      process.stdout.write("Notification sent.\n");
    });

  program
    .command("console")
    .description("Open the local operator console with narrow browser-safe actions.")
    .option("--print-url", "Print the console launch URL instead of opening the browser")
    .action(async (options) => {
      const response = await context.requestJson<{ console_session: { launch_url: string } }>("POST", "/v1/web/session-grants");
      const launchUrl = response.console_session.launch_url;
      if (options.printUrl) {
        process.stdout.write(`${launchUrl}\n`);
        return;
      }
      openUrl(launchUrl);
      logger.info("console_opened", { launch_url: launchUrl });
      process.stdout.write(`Opened operator console: ${launchUrl}\n`);
    });

  program
    .command("version")
    .description("Show the current personal-ops version and the official source-first upgrade path.")
    .option("--json", "Print raw JSON")
    .action((options) => {
      const response = { version: buildVersionReport(paths) };
      context.printOutput(response, (value) => formatVersionReport(value.version), options.json);
    });

  program
    .command("status")
    .description("Show the full operator readiness summary for the local personal-ops service.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ status: unknown }>("GET", "/v1/status");
      context.printOutput(response, (value) => formatStatusReport(value.status), options.json);
    });

  program
    .command("now")
    .description("Show the shortest attention-oriented operator summary.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const [statusResponse, worklistResponse] = await Promise.all([
        context.requestJson<{ status: unknown }>("GET", "/v1/status"),
        context.requestJson<{ worklist: unknown }>("GET", "/v1/worklist"),
      ]);
      const payload = { status: statusResponse.status, worklist: worklistResponse.worklist };
      context.printOutput(payload, (value) => formatNowReport(value.status, value.worklist), options.json);
    });

  program
    .command("worklist")
    .description("Show the full queue of what needs attention right now.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ worklist: unknown }>("GET", "/v1/worklist");
      context.printOutput(response, (value) => formatWorklistReport(value.worklist), options.json);
    });

  const workflow = program.command("workflow").description("Compose the day-start operator flow into bounded workflow bundles.");
  workflow
    .command("now-next")
    .description("Show the single best next move right now, plus a short backup list if that path is blocked.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ workflow: unknown }>("GET", "/v1/workflows/now-next");
      context.printOutput(response, (value) => formatWorkflowBundleReport(value.workflow), options.json);
    });

  workflow
    .command("prep-day")
    .description("Show the preferred day-start bundle with top attention, time-sensitive items, and exact next commands.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ workflow: unknown }>("GET", "/v1/workflows/prep-day");
      context.printOutput(response, (value) => formatWorkflowBundleReport(value.workflow), options.json);
    });

  workflow
    .command("follow-up-block")
    .description("Show the bounded follow-up bundle for reply pressure, stale nudges, and next commands.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ workflow: unknown }>("GET", "/v1/workflows/follow-up-block");
      context.printOutput(response, (value) => formatWorkflowBundleReport(value.workflow), options.json);
    });

  workflow
    .command("prep-meetings")
    .description("Show the meeting-prep bundle for today or the next 24 hours.")
    .option("--today", "Limit the bundle to meetings later today")
    .option("--next-24h", "Limit the bundle to meetings in the next 24 hours")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      if (options.today && options.next24h) {
        throw new Error("Choose either --today or --next-24h, not both.");
      }
      const scope = options.next24h ? "next_24h" : "today";
      const response = await context.requestJson<{ workflow: unknown }>(
        "GET",
        `/v1/workflows/prep-meetings?scope=${encodeURIComponent(scope)}`,
      );
      context.printOutput(response, (value) => formatWorkflowBundleReport(value.workflow), options.json);
    });

  program
    .command("doctor")
    .description("Run local diagnostics and explain what needs attention next.")
    .option("--deep", "Run a live Gmail verification call in addition to local checks")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const query = options.deep ? "?deep=true" : "";
      const response = await context.requestJson<{ doctor: unknown }>("GET", `/v1/doctor${query}`);
      context.printOutput(response, (value) => formatDoctorReport(value.doctor), options.json);
    });

  const health = program.command("health").description("Run recurring-friendly local health checks.");
  health
    .command("check")
    .description("Run a compact health pass that combines install, runtime, and snapshot freshness.")
    .option("--deep", "Include live Gmail and Google Calendar verification")
    .option("--max-snapshot-age-hours <hours>", "Warn when the latest snapshot is older than this many hours", "24")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const rawHours = Number(options.maxSnapshotAgeHours);
      const snapshotAgeLimitHours =
        Number.isFinite(rawHours) && rawHours > 0 ? rawHours : null;
      const report = await buildHealthCheckReport(paths, context.requestJson, {
        deep: Boolean(options.deep),
        snapshotAgeLimitHours,
      });
      context.printOutput({ health_check: report }, (value) => formatHealthCheckReport(value.health_check), options.json);
      if (report.state !== "ready") {
        process.exitCode = 1;
      }
    });

  const sendWindow = program.command("send-window").description("Inspect or control the timed send window.");
  sendWindow
    .command("status")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ send_window: unknown }>("GET", "/v1/send-window");
      context.printOutput(response, (value) => formatSendWindowStatus(value.send_window), options.json);
    });

  sendWindow
    .command("enable")
    .option("--minutes <number>", "Minutes to keep the send window open", "15")
    .requiredOption("--reason <text>", "Reason for enabling the send window")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ send_window: unknown }>("POST", "/v1/send-window/enable", {
        minutes: Number(options.minutes),
        reason: options.reason,
      });
      context.printOutput(response, (value) => formatSendWindowStatus(value.send_window), options.json);
    });

  sendWindow
    .command("disable")
    .requiredOption("--reason <text>", "Reason for disabling the send window")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ send_window: unknown }>("POST", "/v1/send-window/disable", {
        reason: options.reason,
      });
      context.printOutput(response, (value) => formatSendWindowStatus(value.send_window), options.json);
    });
}
