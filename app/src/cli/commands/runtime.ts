import { execFileSync } from "node:child_process";
import type { Command } from "commander";
import { getDesktopStatusReport, openDesktopApp } from "../../desktop.js";
import { buildHealthCheckReport } from "../../health.js";
import { buildInstallCheckReport, fixInstallPermissions, installDesktop, installLaunchAgent, installWrappers } from "../../install.js";
import {
  formatAssistantActionRunResult,
  formatAssistantQueueReport,
  formatAutopilotStatusReport,
  formatDesktopStatus,
  formatDriveDoc,
  formatDriveFiles,
  formatDriveSheet,
  formatDriveStatus,
  formatDoctorReport,
  formatGithubPullDetail,
  formatGithubPullRequests,
  formatGithubStatus,
  formatHealthCheckReport,
  formatMeetingPrepPacket,
  formatNowReport,
  formatRepairExecutionResult,
  formatRepairPlanReport,
  formatSendWindowStatus,
  formatStatusReport,
  formatVersionReport,
  formatWorkflowBundleReport,
  formatWorklistReport,
} from "../../formatters.js";
import { buildRepairPlan, summarizeRepairPlan } from "../../repair-plan.js";
import type { Logger } from "../../logger.js";
import type { Paths, RepairExecutionResult, RepairStepId } from "../../types.js";
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
      const response = await context.requestJson<{ console_session: { launch_url: string } }>("POST", "/v1/console/session");
      const launchUrl = response.console_session.launch_url;
      if (options.printUrl) {
        process.stdout.write(`${launchUrl}\n`);
        return;
      }
      openUrl(launchUrl);
      logger.info("console_opened", { launch_url: launchUrl });
      process.stdout.write(`Opened operator console: ${launchUrl}\n`);
    });

  const desktop = program.command("desktop").description("Open or inspect the optional native desktop shell.");
  desktop
    .command("open")
    .description("Open or focus the installed macOS desktop shell.")
    .action(async () => {
      openDesktopApp(paths);
      const desktopStatus = await getDesktopStatusReport(paths);
      process.stdout.write(`Opened desktop app: ${desktopStatus.app_path}\n`);
    });

  desktop
    .command("status")
    .description("Show whether the local desktop shell is installed and ready.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const desktopStatus = await getDesktopStatusReport(paths);
      const repairPlan = buildRepairPlan({
        install_check: buildInstallCheckReport(paths),
        desktop: desktopStatus,
      });
      const payload = {
        desktop: {
          ...desktopStatus,
          repair_plan_summary: summarizeRepairPlan(repairPlan),
        },
      };
      context.printOutput(payload, (value) => formatDesktopStatus(value.desktop), options.json);
    });

  const repair = program.command("repair").description("Read or run the narrow local repair plan.");
  repair
    .command("plan")
    .description("Show the current deterministic local repair plan.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const report = await buildHealthCheckReport(paths, context.requestJson, {
        deep: false,
        snapshotAgeLimitHours: 24,
      });
      context.printOutput({ repair_plan: report.repair_plan }, (value) => formatRepairPlanReport(value.repair_plan), options.json);
    });

  repair
    .command("run")
    .description("Run one safe executable repair step or print the next manual step.")
    .argument("<stepId>", "Use a repair step id or `next`")
    .option("--json", "Print raw JSON")
    .action(async (stepId, options) => {
      const report = await buildHealthCheckReport(paths, context.requestJson, {
        deep: false,
        snapshotAgeLimitHours: 24,
      });
      const plan = report.repair_plan;
      const targetStep =
        stepId === "next"
          ? (plan.steps.find((step) => step.status === "pending") ?? null)
          : (plan.steps.find((step) => step.id === stepId) ?? null);
      if (!targetStep) {
        throw new Error(
          stepId === "next"
            ? "No repair steps are pending right now."
            : `Repair step \`${stepId}\` is not part of the current plan.`,
        );
      }

      let execution: RepairExecutionResult;
      if (!targetStep.executable) {
        execution = {
          generated_at: new Date().toISOString(),
          step_id: targetStep.id,
          executed: false,
          manual_only: true,
          suggested_command: targetStep.suggested_command,
          message: `This step is advisory only. Run \`${targetStep.suggested_command}\` manually, then rerun \`personal-ops repair plan\`.`,
        };
      } else {
        if (!["install_wrappers", "fix_permissions", "install_launchagent", "install_desktop"].includes(targetStep.id)) {
          throw new Error(`Repair step \`${targetStep.id}\` is not executable from the CLI.`);
        }
        if (targetStep.id === "install_wrappers") {
          installWrappers(paths);
        } else if (targetStep.id === "fix_permissions") {
          fixInstallPermissions(paths);
        } else if (targetStep.id === "install_launchagent") {
          await installLaunchAgent(paths);
        } else if (targetStep.id === "install_desktop") {
          await installDesktop(paths);
        }

        const refreshedReport = await buildHealthCheckReport(paths, context.requestJson, {
          deep: false,
          snapshotAgeLimitHours: 24,
        });
        execution = {
          generated_at: new Date().toISOString(),
          step_id: targetStep.id as RepairStepId,
          executed: true,
          manual_only: false,
          suggested_command: targetStep.suggested_command,
          message: refreshedReport.repair_plan.first_repair_step
            ? `Step complete. Next repair step: \`${refreshedReport.repair_plan.first_repair_step}\`.`
            : "Step complete. No repair steps are pending right now.",
        };
      }
      context.printOutput({ repair_execution: execution }, (value) => formatRepairExecutionResult(value.repair_execution), options.json);
    });

  program
    .command("version")
    .description("Show the current personal-ops version and the official source-first upgrade path.")
    .option("--json", "Print raw JSON")
    .action((options) => {
      const response = { version: buildVersionReport(paths) };
      context.printOutput(response, (value) => formatVersionReport(value.version), options.json);
    });

  const autopilot = program.command("autopilot").description("Inspect or warm the continuous autopilot coordinator.");
  autopilot
    .command("status")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ autopilot: unknown }>("GET", "/v1/autopilot/status");
      context.printOutput(response, (value) => formatAutopilotStatusReport(value.autopilot), options.json);
    });

  autopilot
    .command("run")
    .description("Run the full autopilot coordinator or one profile now.")
    .option("--profile <profile>", "Run only one profile: day_start, inbox, meetings, planning, or outbound")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const path = options.profile
        ? `/v1/autopilot/run/${encodeURIComponent(String(options.profile))}`
        : "/v1/autopilot/run";
      const response = await context.requestJson<{ autopilot: unknown }>("POST", path);
      context.printOutput(response, (value) => formatAutopilotStatusReport(value.autopilot), options.json);
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

  const assistant = program.command("assistant").description("Inspect or run the safe assistant action queue.");
  assistant
    .command("queue")
    .description("Show the current assistant action queue with safe one-click actions and review-gated items.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ assistant_queue: unknown }>("GET", "/v1/assistant/actions");
      context.printOutput(response, (value) => formatAssistantQueueReport(value.assistant_queue), options.json);
    });

  assistant
    .command("run")
    .description("Run a safe assistant action from the queue.")
    .argument("<actionId>", "Assistant action id")
    .option("--json", "Print raw JSON")
    .action(async (actionId, options) => {
      const response = await context.requestJson<{ assistant_run: unknown }>(
        "POST",
        `/v1/assistant/actions/${encodeURIComponent(String(actionId))}/run`,
      );
      context.printOutput(response, (value) => formatAssistantActionRunResult(value.assistant_run), options.json);
    });

  const github = program.command("github").description("Read the narrow GitHub PR and review queue context.");
  github
    .command("status")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ github: unknown }>("GET", "/v1/github/status");
      context.printOutput(response, (value) => formatGithubStatus(value.github), options.json);
    });

  github
    .command("sync")
    .description("Run a foreground GitHub PR/review sync now.")
    .command("now")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ github: unknown }>("POST", "/v1/github/sync");
      context.printOutput(response, (value) => formatGithubStatus(value.github), options.json);
    });

  github
    .command("reviews")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ pull_requests: unknown[] }>("GET", "/v1/github/reviews");
      context.printOutput(response, (value) => formatGithubPullRequests("GitHub Reviews", value.pull_requests), options.json);
    });

  github
    .command("pulls")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ pull_requests: unknown[] }>("GET", "/v1/github/pulls");
      context.printOutput(response, (value) => formatGithubPullRequests("GitHub Pull Requests", value.pull_requests), options.json);
    });

  github
    .command("pr")
    .argument("<prKey>", "Pull request in owner/repo#number form")
    .option("--json", "Print raw JSON")
    .action(async (prKey, options) => {
      const response = await context.requestJson<{ pull_request: unknown }>(
        "GET",
        `/v1/github/pulls/${encodeURIComponent(prKey)}`,
      );
      context.printOutput(response, (value) => formatGithubPullDetail(value.pull_request), options.json);
    });

  const drive = program.command("drive").description("Read the narrow Google Drive and Docs context.");
  drive
    .command("status")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ drive: unknown }>("GET", "/v1/drive/status");
      context.printOutput(response, (value) => formatDriveStatus(value.drive), options.json);
    });

  drive
    .command("sync")
    .description("Run a foreground Drive and Docs sync now.")
    .command("now")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ drive: unknown }>("POST", "/v1/drive/sync");
      context.printOutput(response, (value) => formatDriveStatus(value.drive), options.json);
    });

  drive
    .command("files")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ files: unknown[] }>("GET", "/v1/drive/files");
      context.printOutput(response, (value) => formatDriveFiles(value.files), options.json);
    });

  drive
    .command("sheet")
    .argument("<fileId>", "Google Drive file id")
    .option("--json", "Print raw JSON")
    .action(async (fileId, options) => {
      const response = await context.requestJson<{ sheet: unknown }>(
        "GET",
        `/v1/drive/sheets/${encodeURIComponent(fileId)}`,
      );
      context.printOutput(response, (value) => formatDriveSheet(value.sheet), options.json);
    });

  drive
    .command("doc")
    .argument("<fileId>", "Google Drive file id")
    .option("--json", "Print raw JSON")
    .action(async (fileId, options) => {
      const response = await context.requestJson<{ doc: unknown }>(
        "GET",
        `/v1/drive/docs/${encodeURIComponent(fileId)}`,
      );
      context.printOutput(response, (value) => formatDriveDoc(value.doc), options.json);
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
    .option("--event <eventId>", "Show the full packet detail for one calendar event")
    .option("--prepare", "Prepare or refresh the packet for the selected event before showing it")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      if (options.today && options.next24h) {
        throw new Error("Choose either --today or --next-24h, not both.");
      }
      if (options.prepare && !options.event) {
        throw new Error("Use --prepare together with --event <eventId>.");
      }
      if (options.event) {
        const encodedEventId = encodeURIComponent(options.event);
        if (options.prepare) {
          const prepared = await context.requestJson<{ meeting_prep_packet: { packet: unknown } }>(
            "POST",
            `/v1/workflows/prep-meetings/${encodedEventId}/prepare`,
            {},
          );
          context.printOutput(prepared, (value) => formatMeetingPrepPacket(value.meeting_prep_packet.packet), options.json);
          return;
        }
        const response = await context.requestJson<{ meeting_prep_packet: unknown }>(
          "GET",
          `/v1/workflows/prep-meetings/${encodedEventId}`,
        );
        context.printOutput(response, (value) => formatMeetingPrepPacket(value.meeting_prep_packet), options.json);
        return;
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
