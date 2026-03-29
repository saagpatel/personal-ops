import type { Command } from "commander";
import { buildInstallCheckReport, fixInstallPermissions, installAll, installLaunchAgent, installWrapper } from "../../install.js";
import { formatInstallCheckReport, formatInstallManifest, formatInstallPermissionsFixResult, formatRestoreResult, formatSnapshotInspection, formatSnapshotList, formatSnapshotManifest, formatSnapshotPruneResult } from "../../formatters.js";
import { pruneSnapshots } from "../../recovery.js";
import { restoreSnapshot } from "../../restore.js";
import type { Paths } from "../../types.js";
import type { CliContext } from "../shared.js";

export function registerInstallAndBackupCommands(program: Command, context: CliContext, paths: Paths) {
  const install = program
    .command("install")
    .description("Install, repair, or verify the local operator wrappers and LaunchAgent.");
  install
    .command("all")
    .description("Install or update local wrappers and the LaunchAgent.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const manifest = await installAll(paths);
      context.printOutput({ install: manifest }, (value) => formatInstallManifest(value.install), options.json);
    });

  install
    .command("check")
    .description("Run local install and environment checks without requiring the daemon.")
    .option("--json", "Print raw JSON")
    .action((options) => {
      const report = buildInstallCheckReport(paths);
      context.printOutput({ install_check: report }, (value) => formatInstallCheckReport(value.install_check), options.json);
    });

  install
    .command("wrapper")
    .description("Install or update one local wrapper.")
    .requiredOption("--kind <kind>", "Wrapper kind: cli, daemon, or mcp")
    .option("--assistant <assistant>", "Assistant identity for MCP wrappers: codex or claude")
    .option("--json", "Print raw JSON")
    .action((options) => {
      const kind = String(options.kind ?? "").trim();
      if (!["cli", "daemon", "mcp"].includes(kind)) {
        throw new Error("Wrapper kind must be one of: cli, daemon, mcp.");
      }
      const assistant = options.assistant ? String(options.assistant).trim() : undefined;
      if (assistant && !["codex", "claude"].includes(assistant)) {
        throw new Error("Assistant must be one of: codex, claude.");
      }
      const manifest = installWrapper(paths, kind as "cli" | "daemon" | "mcp", assistant as "codex" | "claude" | undefined);
      context.printOutput({ install: manifest }, (value) => formatInstallManifest(value.install), options.json);
    });

  install
    .command("launchagent")
    .description("Install or update the personal-ops LaunchAgent.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const manifest = await installLaunchAgent(paths);
      context.printOutput({ install: manifest }, (value) => formatInstallManifest(value.install), options.json);
    });

  install
    .command("fix-permissions")
    .description("Tighten owner-only permissions on known local secret files if they exist.")
    .option("--json", "Print raw JSON")
    .action((options) => {
      const result = fixInstallPermissions(paths);
      context.printOutput({ permissions: result }, (value) => formatInstallPermissionsFixResult(value.permissions), options.json);
    });

  const backup = program
    .command("backup")
    .description("Create, inspect, prune, and restore recovery snapshots with explicit cross-machine guardrails.");
  backup
    .command("create")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ snapshot: unknown }>("POST", "/v1/snapshots");
      context.printOutput(response, (value) => formatSnapshotManifest(value.snapshot), options.json);
    });

  backup
    .command("list")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ snapshots: unknown[] }>("GET", "/v1/snapshots");
      context.printOutput(response, (value) => formatSnapshotList(value.snapshots), options.json);
    });

  backup
    .command("inspect")
    .argument("<snapshotId>", "Snapshot id")
    .option("--json", "Print raw JSON")
    .action(async (snapshotId, options) => {
      const response = await context.requestJson<{ snapshot: unknown }>("GET", `/v1/snapshots/${snapshotId}`);
      context.printOutput(response, (value) => formatSnapshotInspection(value.snapshot), options.json);
    });

  backup
    .command("prune")
    .description("Preview or apply the snapshot retention policy.")
    .option("--dry-run", "Preview prune candidates without deleting them")
    .option("--yes", "Delete prune candidates")
    .option("--json", "Print raw JSON")
    .action((options) => {
      if (options.dryRun && options.yes) {
        throw new Error("Use either --dry-run or --yes, not both.");
      }
      const result = pruneSnapshots(paths, { dryRun: !options.yes });
      context.printOutput({ prune: result }, (value) => formatSnapshotPruneResult(value.prune), options.json);
    });

  backup
    .command("restore")
    .argument("<snapshotId>", "Snapshot id")
    .requiredOption("--yes", "Confirm the restore")
    .option("--with-config", "Restore config.toml from the snapshot")
    .option("--with-policy", "Restore policy.toml from the snapshot")
    .option("--allow-cross-machine", "Allow restoring a snapshot created on a different machine")
    .option("--json", "Print raw JSON")
    .action(async (snapshotId, options) => {
      const result = await restoreSnapshot(paths, snapshotId, {
        confirm: Boolean(options.yes),
        withConfig: Boolean(options.withConfig),
        withPolicy: Boolean(options.withPolicy),
        allowCrossMachine: Boolean(options.allowCrossMachine),
      });
      context.printOutput({ restore: result }, (value) => formatRestoreResult(value.restore), options.json);
    });
}
