import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { loadConfig } from "./config.js";
import { getDesktopPaths, getDesktopToolchainReport, installDesktopApp, withDesktopManifest } from "./desktop.js";
import { PersonalOpsDb } from "./db.js";
import { getKeychainSecret } from "./keychain.js";
import {
  getLaunchAgentLabel,
  getLaunchAgentPlistPath,
  inspectLaunchAgent,
  reloadLaunchAgent,
  writeLaunchAgentPlist,
} from "./launchagent.js";
import {
  InstallPermissionsFixItem,
  InstallPermissionsFixResult,
  AssistantKind,
  DoctorCheck,
  InstallCheckReport,
  InstallManifest,
  Paths,
  ServiceState,
} from "./types.js";
import {
  describeStateOrigin,
  ensureMachineIdentity,
  readMachineIdentity,
  readRestoreProvenance,
} from "./machine.js";
import {
  repairSecretFilePermissions,
  validateOAuthClientFile,
  validateSecretFilePermissions,
  validateSecretTextFile,
} from "./secrets.js";

const INSTALL_SETUP_REQUIRED_IDS = new Set(["oauth_client_configured", "configured_mailbox_present"]);
const DEFAULT_ASSISTANTS: AssistantKind[] = ["codex", "claude"];

export interface InstallArtifactPaths {
  cliWrapperPath: string;
  daemonWrapperPath: string;
  codexMcpWrapperPath: string;
  claudeMcpWrapperPath: string;
  launchAgentPlistPath: string;
  distCliPath: string;
  distDaemonPath: string;
  distMcpPath: string;
}

interface InstallDependencies {
  launchAgentDependencies?: Parameters<typeof inspectLaunchAgent>[2];
  waitForDaemonReadyImpl?: (host: string, port: number, timeoutMs: number) => Promise<void>;
  daemonReadyTimeoutMs?: number;
}

const SECRET_PERMISSION_TARGETS: Array<{ label: string; resolvePath: (paths: Paths) => string }> = [
  { label: "Config file", resolvePath: (paths) => paths.configFile },
  { label: "Policy file", resolvePath: (paths) => paths.policyFile },
  { label: "OAuth client file", resolvePath: (paths) => paths.oauthClientFile },
  { label: "Local API token", resolvePath: (paths) => paths.apiTokenFile },
  { label: "Assistant API token", resolvePath: (paths) => paths.assistantApiTokenFile },
];
const DEFAULT_DAEMON_READY_TIMEOUT_MS = 15_000;

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function summarizeChecks(checks: DoctorCheck[]) {
  return checks.reduce(
    (accumulator, check) => {
      accumulator[check.severity] += 1;
      return accumulator;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
}

function classifyInstallState(checks: DoctorCheck[]): ServiceState {
  if (checks.some((check) => check.severity === "fail")) {
    return "degraded";
  }
  return checks.some((check) => INSTALL_SETUP_REQUIRED_IDS.has(check.id) && check.severity !== "pass")
    ? "setup_required"
    : "ready";
}

function passCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
  return { id, title, severity: "pass", message, category };
}

function warnCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
  return { id, title, severity: "warn", message, category };
}

function failCheck(id: string, title: string, message: string, category: DoctorCheck["category"]): DoctorCheck {
  return { id, title, severity: "fail", message, category };
}

function fileCheck(id: string, title: string, filePath: string, parseRequired: boolean): DoctorCheck {
  if (!fs.existsSync(filePath)) {
    return failCheck(id, title, `${filePath} is missing.`, "runtime");
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    if (parseRequired && filePath.endsWith(".toml")) {
      parseToml(fs.readFileSync(filePath, "utf8"));
    }
    return passCheck(id, title, `${path.basename(filePath)} is present and readable.`, "runtime");
  } catch (error) {
    return failCheck(
      id,
      title,
      error instanceof Error ? error.message : `${filePath} could not be read.`,
      "runtime",
    );
  }
}

function directoryWritableCheck(id: string, title: string, directory: string): DoctorCheck {
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);
    return passCheck(id, title, `${directory} is writable.`, "runtime");
  } catch (error) {
    return failCheck(
      id,
      title,
      error instanceof Error ? error.message : `${directory} is not writable.`,
      "runtime",
    );
  }
}

function renderWrapper(
  nodeExecutable: string,
  targetFile: string,
  env?: Partial<Record<"PERSONAL_OPS_CLIENT_ID" | "PERSONAL_OPS_REQUESTED_BY" | "PERSONAL_OPS_ORIGIN", string>>,
): string {
  const lines = ["#!/bin/sh", "set -eu", ""];
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (!value) continue;
      lines.push(`export ${key}="\${${key}:-${value}}"`);
    }
    lines.push("");
  }
  lines.push(`exec ${shellQuote(nodeExecutable)} ${shellQuote(targetFile)} "$@"`);
  lines.push("");
  return lines.join("\n");
}

function parseWrapper(wrapperPath: string): { nodeExecutable: string | null; targetFile: string | null } {
  if (!fs.existsSync(wrapperPath)) {
    return { nodeExecutable: null, targetFile: null };
  }
  const raw = fs.readFileSync(wrapperPath, "utf8");
  const match = raw.match(/exec\s+"([^"]+)"\s+"([^"]+)"\s+"\$@"/);
  return {
    nodeExecutable: match?.[1] ?? null,
    targetFile: match?.[2] ?? null,
  };
}

function writeExecutable(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(filePath, 0o755);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDaemonReady(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(500, () => finish(false));
    });

    if (connected) {
      return;
    }

    await delay(250);
  }

  throw new Error(
    `LaunchAgent reloaded, but the daemon did not become reachable at ${host}:${port} within ${Math.ceil(timeoutMs / 1000)}s. Run \`personal-ops doctor\` or \`launchctl kickstart -k gui/$(id -u)/${getLaunchAgentLabel()}\`.`,
  );
}

function buildInstallManifest(paths: Paths, nodeExecutable: string, assistants: AssistantKind[]): InstallManifest {
  const artifacts = getInstallArtifactPaths(paths);
  const launchAgentLabel = getLaunchAgentLabel();
  const machine = ensureMachineIdentity(paths);
  const existingDesktop = readInstallManifest(paths)?.desktop;
  return {
    generated_at: new Date().toISOString(),
    node_executable: nodeExecutable,
    app_dir: paths.appDir,
    machine_id: machine.machine_id,
    machine_label: machine.machine_label,
    launch_agent_label: launchAgentLabel,
    launch_agent_plist_path: artifacts.launchAgentPlistPath,
    assistant_wrappers: [...assistants].sort(),
    wrapper_paths: {
      cli: artifacts.cliWrapperPath,
      daemon: artifacts.daemonWrapperPath,
      codex_mcp: artifacts.codexMcpWrapperPath,
      claude_mcp: artifacts.claudeMcpWrapperPath,
    },
    ...(existingDesktop ? { desktop: existingDesktop } : {}),
  };
}

function readConfigMailbox(paths: Paths): string {
  try {
    const raw = fs.readFileSync(paths.configFile, "utf8");
    const parsed = parseToml(raw) as Record<string, any>;
    return String(parsed.gmail?.account_email ?? "").trim();
  } catch {
    return "";
  }
}

function readAuthConfigSummary(paths: Paths): {
  mailbox: string;
  keychainService: string;
  oauthClientPath: string;
  githubEnabled: boolean;
  githubIncludedRepositories: string[];
  githubKeychainService: string;
  driveEnabled: boolean;
  includedDriveFolders: string[];
  includedDriveFiles: string[];
} {
  try {
    const raw = fs.readFileSync(paths.configFile, "utf8");
    const parsed = parseToml(raw) as Record<string, any>;
    return {
      mailbox: String(parsed.gmail?.account_email ?? "").trim(),
      keychainService: String(parsed.auth?.keychain_service ?? "").trim(),
      oauthClientPath: String(parsed.auth?.oauth_client_file ?? "").trim(),
      githubEnabled: Boolean(parsed.github?.enabled ?? false),
      githubIncludedRepositories: Array.isArray(parsed.github?.included_repositories)
        ? parsed.github.included_repositories.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [],
      githubKeychainService: String(parsed.github?.keychain_service ?? "personal-ops.github").trim(),
      driveEnabled: Boolean(parsed.drive?.enabled ?? false),
      includedDriveFolders: Array.isArray(parsed.drive?.included_folders)
        ? parsed.drive.included_folders.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [],
      includedDriveFiles: Array.isArray(parsed.drive?.included_files)
        ? parsed.drive.included_files.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return {
      mailbox: "",
      keychainService: "",
      oauthClientPath: "",
      githubEnabled: false,
      githubIncludedRepositories: [],
      githubKeychainService: "personal-ops.github",
      driveEnabled: false,
      includedDriveFolders: [],
      includedDriveFiles: [],
    };
  }
}

export function getInstallArtifactPaths(paths: Paths): InstallArtifactPaths {
  const home = process.env.HOME ?? os.homedir();
  return {
    cliWrapperPath: path.join(home, ".local", "bin", "personal-ops"),
    daemonWrapperPath: path.join(home, ".local", "bin", "personal-opsd"),
    codexMcpWrapperPath: path.join(home, ".codex", "bin", "personal-ops-mcp"),
    claudeMcpWrapperPath: path.join(home, ".claude", "bin", "personal-ops-mcp"),
    launchAgentPlistPath: getLaunchAgentPlistPath(),
    distCliPath: path.join(paths.appDir, "dist", "src", "cli.js"),
    distDaemonPath: path.join(paths.appDir, "dist", "src", "daemon.js"),
    distMcpPath: path.join(paths.appDir, "dist", "src", "mcp-server.js"),
  };
}

function buildLaunchAgentEnvironment(paths: Paths): Record<string, string> {
  return {
    HOME: process.env.HOME ?? os.homedir(),
    PERSONAL_OPS_APP_DIR: paths.appDir,
    PERSONAL_OPS_CONFIG_DIR: paths.configDir,
    PERSONAL_OPS_STATE_DIR: paths.stateDir,
    PERSONAL_OPS_LOG_DIR: paths.logDir,
    PERSONAL_OPS_LAUNCH_AGENT_LABEL: getLaunchAgentLabel(),
  };
}

export function readInstallManifest(paths: Paths): InstallManifest | null {
  if (!fs.existsSync(paths.installManifestFile)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(paths.installManifestFile, "utf8")) as InstallManifest;
}

export function writeInstallManifest(paths: Paths, manifest: InstallManifest): void {
  fs.mkdirSync(path.dirname(paths.installManifestFile), { recursive: true });
  fs.writeFileSync(paths.installManifestFile, JSON.stringify(manifest, null, 2), "utf8");
}

export function installWrapper(
  paths: Paths,
  kind: "cli" | "daemon" | "mcp",
  assistant?: AssistantKind,
  nodeExecutable = process.execPath,
): InstallManifest {
  const artifacts = getInstallArtifactPaths(paths);
  const currentAssistants = new Set<AssistantKind>(readInstallManifest(paths)?.assistant_wrappers ?? []);

  if (kind === "cli") {
    if (!fs.existsSync(artifacts.distCliPath)) {
      throw new Error(`CLI entrypoint ${artifacts.distCliPath} is missing. Run npm run build first.`);
    }
    writeExecutable(artifacts.cliWrapperPath, renderWrapper(nodeExecutable, artifacts.distCliPath));
  } else if (kind === "daemon") {
    if (!fs.existsSync(artifacts.distDaemonPath)) {
      throw new Error(`Daemon entrypoint ${artifacts.distDaemonPath} is missing. Run npm run build first.`);
    }
    writeExecutable(artifacts.daemonWrapperPath, renderWrapper(nodeExecutable, artifacts.distDaemonPath));
  } else {
    if (!assistant) {
      throw new Error("MCP wrapper install requires --assistant codex|claude.");
    }
    if (!fs.existsSync(artifacts.distMcpPath)) {
      throw new Error(`MCP entrypoint ${artifacts.distMcpPath} is missing. Run npm run build first.`);
    }
    const wrapperPath = assistant === "codex" ? artifacts.codexMcpWrapperPath : artifacts.claudeMcpWrapperPath;
    writeExecutable(
      wrapperPath,
      renderWrapper(nodeExecutable, artifacts.distMcpPath, {
        PERSONAL_OPS_CLIENT_ID: `${assistant}-mcp`,
        PERSONAL_OPS_REQUESTED_BY: assistant,
        PERSONAL_OPS_ORIGIN: "assistant-mcp",
      }),
    );
    currentAssistants.add(assistant);
  }

  const manifest = buildInstallManifest(paths, nodeExecutable, [...currentAssistants]);
  writeInstallManifest(paths, manifest);
  return manifest;
}

export async function installLaunchAgent(
  paths: Paths,
  nodeExecutable = process.execPath,
  dependencies: InstallDependencies = {},
): Promise<InstallManifest> {
  const artifacts = getInstallArtifactPaths(paths);
  const launchAgentLabel = getLaunchAgentLabel();
  if (!fs.existsSync(artifacts.daemonWrapperPath)) {
    installWrapper(paths, "daemon", undefined, nodeExecutable);
  }
  fs.mkdirSync(paths.logDir, { recursive: true });
  writeLaunchAgentPlist(artifacts.launchAgentPlistPath, {
    label: launchAgentLabel,
    programPath: artifacts.daemonWrapperPath,
    workingDirectory: paths.appDir,
    stdoutPath: path.join(paths.logDir, "stdout.log"),
    stderrPath: path.join(paths.logDir, "stderr.log"),
    environmentVariables: buildLaunchAgentEnvironment(paths),
  });
  reloadLaunchAgent(artifacts.launchAgentPlistPath, launchAgentLabel, dependencies.launchAgentDependencies);
  const config = loadConfig(paths);
  await (dependencies.waitForDaemonReadyImpl ?? waitForDaemonReady)(
    config.serviceHost,
    config.servicePort,
    dependencies.daemonReadyTimeoutMs ?? DEFAULT_DAEMON_READY_TIMEOUT_MS,
  );
  const manifest = buildInstallManifest(
    paths,
    nodeExecutable,
    readInstallManifest(paths)?.assistant_wrappers ?? DEFAULT_ASSISTANTS,
  );
  writeInstallManifest(paths, manifest);
  return manifest;
}

export async function installAll(
  paths: Paths,
  nodeExecutable = process.execPath,
  dependencies: InstallDependencies = {},
): Promise<InstallManifest> {
  installWrapper(paths, "cli", undefined, nodeExecutable);
  installWrapper(paths, "daemon", undefined, nodeExecutable);
  installWrapper(paths, "mcp", "codex", nodeExecutable);
  installWrapper(paths, "mcp", "claude", nodeExecutable);
  await installLaunchAgent(paths, nodeExecutable, dependencies);
  const manifest = buildInstallManifest(paths, nodeExecutable, DEFAULT_ASSISTANTS);
  writeInstallManifest(paths, manifest);
  return manifest;
}

export async function installDesktop(
  paths: Paths,
  nodeExecutable = process.execPath,
): Promise<InstallManifest> {
  const desktop = await installDesktopApp(paths);
  const manifest = withDesktopManifest(
    buildInstallManifest(paths, nodeExecutable, readInstallManifest(paths)?.assistant_wrappers ?? DEFAULT_ASSISTANTS),
    desktop,
  );
  writeInstallManifest(paths, manifest);
  return manifest;
}

export function fixInstallPermissions(paths: Paths): InstallPermissionsFixResult {
  const files: InstallPermissionsFixItem[] = SECRET_PERMISSION_TARGETS.map((target) => {
    const filePath = target.resolvePath(paths);
    const repaired = repairSecretFilePermissions(filePath, target.label);
    return {
      label: target.label,
      path: filePath,
      status: repaired.status,
      message: repaired.message,
      previous_mode: repaired.previousMode,
      current_mode: repaired.currentMode,
    };
  });

  const summary = files.reduce(
    (accumulator, file) => {
      accumulator[file.status] += 1;
      return accumulator;
    },
    { updated: 0, already_secure: 0, missing: 0, failed: 0 },
  );

  return {
    generated_at: new Date().toISOString(),
    summary,
    files,
  };
}

export function buildInstallCheckReport(paths: Paths, dependencies: InstallDependencies = {}): InstallCheckReport {
  const checks: DoctorCheck[] = [];
  const manifest = readInstallManifest(paths);
  const artifacts = getInstallArtifactPaths(paths);
  const launchAgentLabel = getLaunchAgentLabel();
  const launchAgent = inspectLaunchAgent(
    artifacts.launchAgentPlistPath,
    launchAgentLabel,
    dependencies.launchAgentDependencies,
  );
  const authConfig = readAuthConfigSummary(paths);
  const githubDb = fs.existsSync(paths.databaseFile) ? new PersonalOpsDb(paths.databaseFile) : null;
  const githubAccount = githubDb?.getGithubAccount() ?? null;
  const githubSync = githubDb?.getGithubSyncState() ?? null;
  const githubToken =
    githubAccount && authConfig.githubKeychainService
      ? getKeychainSecret(authConfig.githubKeychainService, githubAccount.keychain_account)
      : null;
  const driveSync = githubDb?.getDriveSyncState() ?? null;
  const driveToken =
    authConfig.driveEnabled && authConfig.mailbox && authConfig.keychainService
      ? getKeychainSecret(authConfig.keychainService, authConfig.mailbox)
      : null;
  const oauthValidation = validateOAuthClientFile(paths.oauthClientFile);
  const oauthPermissions = validateSecretFilePermissions(paths.oauthClientFile, "OAuth client file");
  const localApiToken = validateSecretTextFile(paths.apiTokenFile, "Local API token");
  const assistantApiToken = validateSecretTextFile(paths.assistantApiTokenFile, "Assistant API token");
  const localApiTokenPermissions = validateSecretFilePermissions(paths.apiTokenFile, "Local API token");
  const assistantApiTokenPermissions = validateSecretFilePermissions(paths.assistantApiTokenFile, "Assistant API token");
  const machineIdentity = readMachineIdentity(paths);
  const restoreProvenance = readRestoreProvenance(paths);
  const desktopPaths = getDesktopPaths(paths);
  const desktopToolchain = getDesktopToolchainReport(paths);

  checks.push(fileCheck("config_file_valid", "Config file", paths.configFile, true));
  checks.push(fileCheck("policy_file_valid", "Policy file", paths.policyFile, true));
  checks.push(
    oauthValidation.status === "missing"
      ? failCheck("oauth_client_file_exists", "OAuth client file", oauthValidation.message, "setup")
      : oauthValidation.status === "unreadable"
        ? failCheck("oauth_client_file_exists", "OAuth client file", oauthValidation.message, "setup")
        : passCheck("oauth_client_file_exists", "OAuth client file", `${path.basename(paths.oauthClientFile)} is present and readable.`, "setup"),
  );
  checks.push(
    oauthValidation.status === "configured"
      ? passCheck("oauth_client_file_valid", "OAuth client file validity", "OAuth client JSON is well-formed for Desktop OAuth.", "setup")
      : oauthValidation.status === "missing" || oauthValidation.status === "placeholder"
        ? warnCheck("oauth_client_file_valid", "OAuth client file validity", oauthValidation.message, "setup")
        : failCheck("oauth_client_file_valid", "OAuth client file validity", oauthValidation.message, "setup"),
  );
  checks.push(
    oauthValidation.status === "configured"
      ? passCheck("oauth_client_configured", "OAuth client", oauthValidation.message, "setup")
      : oauthValidation.status === "missing" || oauthValidation.status === "placeholder"
        ? warnCheck("oauth_client_configured", "OAuth client", oauthValidation.message, "setup")
        : failCheck("oauth_client_configured", "OAuth client", oauthValidation.message, "setup"),
  );
  checks.push(
    oauthPermissions.status === "too_broad"
      ? warnCheck("oauth_client_permissions_secure", "OAuth client permissions", oauthPermissions.message, "setup")
      : oauthPermissions.status === "secure"
        ? passCheck("oauth_client_permissions_secure", "OAuth client permissions", oauthPermissions.message, "setup")
        : oauthValidation.status === "missing"
          ? warnCheck("oauth_client_permissions_secure", "OAuth client permissions", "OAuth client permissions cannot be checked until the file exists.", "setup")
          : failCheck("oauth_client_permissions_secure", "OAuth client permissions", oauthPermissions.message, "setup"),
  );

  checks.push(
    authConfig.mailbox
      ? passCheck("configured_mailbox_present", "Configured mailbox", `Configured mailbox is ${authConfig.mailbox}.`, "setup")
      : warnCheck("configured_mailbox_present", "Configured mailbox", "Configured mailbox email is still blank in config.toml.", "setup"),
  );
  checks.push(
    authConfig.keychainService
      ? passCheck("keychain_service_configured", "Keychain service", `Keychain service is ${authConfig.keychainService}.`, "setup")
      : warnCheck(
          "keychain_service_configured",
          "Keychain service",
          "auth.keychain_service is blank in config.toml. Restore the default or set the intended Keychain service before re-auth.",
          "setup",
        ),
  );
  checks.push(
    authConfig.githubEnabled
      ? passCheck("github_enabled", "GitHub integration", "GitHub integration is enabled.", "integration")
      : passCheck("github_enabled", "GitHub integration", "GitHub integration is disabled.", "integration"),
  );
  checks.push(
    !authConfig.githubEnabled
      ? passCheck(
          "github_repository_scope_configured",
          "GitHub repository scope",
          "GitHub repository scope is not required while the integration is disabled.",
          "integration",
        )
      : authConfig.githubIncludedRepositories.length > 0
        ? passCheck(
            "github_repository_scope_configured",
            "GitHub repository scope",
            `${authConfig.githubIncludedRepositories.length} GitHub repositor${authConfig.githubIncludedRepositories.length === 1 ? "y is" : "ies are"} included.`,
            "integration",
          )
        : warnCheck(
            "github_repository_scope_configured",
            "GitHub repository scope",
            "GitHub is enabled, but github.included_repositories is empty in config.toml.",
            "integration",
          ),
  );
  checks.push(
    !authConfig.githubEnabled
      ? passCheck(
          "github_connected_login_recorded",
          "GitHub connected login",
          "GitHub connected login is not required while the integration is disabled.",
          "integration",
        )
      : githubAccount
        ? passCheck(
            "github_connected_login_recorded",
            "GitHub connected login",
            `GitHub is connected as ${githubAccount.login}.`,
            "integration",
          )
        : warnCheck(
            "github_connected_login_recorded",
            "GitHub connected login",
            "GitHub is enabled, but no connected GitHub login is recorded. Run `personal-ops auth github login`.",
            "integration",
          ),
  );
  checks.push(
    !authConfig.githubEnabled
      ? passCheck(
          "github_token_present",
          "GitHub token",
          "GitHub token is not required while the integration is disabled.",
          "integration",
        )
      : githubToken
        ? passCheck("github_token_present", "GitHub token", "GitHub Keychain token is present.", "integration")
        : warnCheck(
            "github_token_present",
            "GitHub token",
            "GitHub is enabled, but no PAT is stored in Keychain. Run `personal-ops auth github login`.",
            "integration",
          ),
  );
  checks.push(
    !authConfig.githubEnabled
      ? passCheck("github_sync_fresh", "GitHub sync freshness", "GitHub sync is not required while the integration is disabled.", "integration")
      : githubSync?.status === "degraded"
        ? warnCheck(
            "github_sync_fresh",
            "GitHub sync freshness",
            githubSync.last_error_message ?? "GitHub sync is degraded. Run `personal-ops github sync now`.",
            "integration",
          )
        : githubSync?.last_synced_at
          ? passCheck(
              "github_sync_fresh",
              "GitHub sync freshness",
              `GitHub sync is fresh as of ${githubSync.last_synced_at}.`,
              "integration",
            )
          : warnCheck(
              "github_sync_fresh",
              "GitHub sync freshness",
              "GitHub has not synced yet. Run `personal-ops github sync now` after login.",
              "integration",
            ),
  );
  checks.push(
    authConfig.driveEnabled
      ? passCheck("drive_enabled", "Drive integration", "Drive integration is enabled.", "integration")
      : passCheck("drive_enabled", "Drive integration", "Drive integration is disabled.", "integration"),
  );
  checks.push(
    !authConfig.driveEnabled
      ? passCheck(
          "drive_scope_configured",
          "Drive scope",
          "Drive scope is not required while the integration is disabled.",
          "integration",
        )
      : authConfig.includedDriveFolders.length + authConfig.includedDriveFiles.length > 0
        ? passCheck(
            "drive_scope_configured",
            "Drive scope",
            `${authConfig.includedDriveFolders.length} folder scope item(s) and ${authConfig.includedDriveFiles.length} file scope item(s) are configured.`,
            "integration",
          )
        : warnCheck(
            "drive_scope_configured",
            "Drive scope",
            "Drive is enabled, but drive.included_folders and drive.included_files are both empty in config.toml.",
            "integration",
          ),
  );
  checks.push(
    !authConfig.driveEnabled
      ? passCheck("drive_token_present", "Drive token", "Drive token is not required while the integration is disabled.", "integration")
      : driveToken
        ? passCheck("drive_token_present", "Drive token", "Google token is present for Drive and Docs reads.", "integration")
        : warnCheck(
            "drive_token_present",
            "Drive token",
            "Drive is enabled, but no Google token was found. Run `personal-ops auth google login`.",
            "integration",
          ),
  );
  checks.push(
    !authConfig.driveEnabled
      ? passCheck("drive_sync_fresh", "Drive sync freshness", "Drive sync is not required while the integration is disabled.", "integration")
      : driveSync?.status === "degraded"
        ? warnCheck(
            "drive_sync_fresh",
            "Drive sync freshness",
            driveSync.last_error_message ?? "Drive sync is degraded. Run `personal-ops drive sync now`.",
            "integration",
          )
        : driveSync?.last_synced_at
          ? passCheck(
              "drive_sync_fresh",
              "Drive sync freshness",
              `Drive sync is fresh as of ${driveSync.last_synced_at}.`,
              "integration",
            )
          : warnCheck(
              "drive_sync_fresh",
              "Drive sync freshness",
              "Drive has not synced yet. Run `personal-ops drive sync now` after login.",
              "integration",
            ),
  );
  checks.push(
    machineIdentity.status === "configured"
      ? passCheck(
          "machine_identity_exists",
          "Machine identity",
          `Machine identity exists for ${machineIdentity.identity?.machine_label}.`,
          "setup",
        )
      : warnCheck("machine_identity_exists", "Machine identity", machineIdentity.message, "setup"),
  );
  checks.push(
    machineIdentity.status === "configured"
      ? passCheck(
          "machine_identity_valid",
          "Machine identity validity",
          `Machine identity is valid for ${machineIdentity.identity?.machine_label}.`,
          "setup",
        )
      : warnCheck(
          "machine_identity_valid",
          "Machine identity validity",
          machineIdentity.status === "missing"
            ? "Machine identity cannot be validated until it is initialized."
            : machineIdentity.message,
          "setup",
        ),
  );
  if (restoreProvenance.status === "configured" && restoreProvenance.provenance) {
    const stateOrigin = describeStateOrigin(restoreProvenance.provenance);
    checks.push(
      stateOrigin === "restored_cross_machine"
        ? warnCheck(
            "state_origin_safe",
            "State origin",
            `State was restored from ${restoreProvenance.provenance.source_machine_label ?? "another machine"}. Rerun \`personal-ops doctor --deep\` and local auth checks before trusting live access.`,
            "setup",
          )
        : stateOrigin === "unknown_legacy_restore"
          ? warnCheck(
              "state_origin_safe",
              "State origin",
              "State was restored from a legacy snapshot with unknown machine provenance.",
              "setup",
            )
          : passCheck(
              "state_origin_safe",
              "State origin",
              "Latest recorded restore provenance is same-machine.",
              "setup",
            ),
    );
  } else if (restoreProvenance.status === "invalid") {
    checks.push(warnCheck("state_origin_safe", "State origin", restoreProvenance.message, "setup"));
  } else {
    checks.push(passCheck("state_origin_safe", "State origin", "No cross-machine restore provenance is recorded.", "setup"));
  }

  checks.push(directoryWritableCheck("state_dir_writable", "State directory", paths.stateDir));
  checks.push(directoryWritableCheck("log_dir_writable", "Log directory", paths.logDir));
  checks.push(directoryWritableCheck("snapshots_dir_writable", "Snapshots directory", paths.snapshotsDir));
  checks.push(
    localApiToken.status === "configured"
      ? passCheck("local_api_token_exists", "Local API token", localApiToken.message, "runtime")
      : failCheck("local_api_token_exists", "Local API token", localApiToken.message, "runtime"),
  );
  checks.push(
    localApiToken.status === "configured"
      ? passCheck("local_api_token_nonempty", "Local API token contents", "Local API token file is non-empty.", "runtime")
      : localApiToken.status === "empty"
        ? failCheck("local_api_token_nonempty", "Local API token contents", localApiToken.message, "runtime")
        : failCheck("local_api_token_nonempty", "Local API token contents", "Local API token cannot be validated until the file is readable.", "runtime"),
  );
  checks.push(
    localApiTokenPermissions.status === "too_broad"
      ? warnCheck("local_api_token_permissions_secure", "Local API token permissions", localApiTokenPermissions.message, "runtime")
      : localApiTokenPermissions.status === "secure"
        ? passCheck("local_api_token_permissions_secure", "Local API token permissions", localApiTokenPermissions.message, "runtime")
        : failCheck("local_api_token_permissions_secure", "Local API token permissions", localApiTokenPermissions.message, "runtime"),
  );
  checks.push(
    assistantApiToken.status === "configured"
      ? passCheck("assistant_api_token_exists", "Assistant API token", assistantApiToken.message, "runtime")
      : failCheck("assistant_api_token_exists", "Assistant API token", assistantApiToken.message, "runtime"),
  );
  checks.push(
    assistantApiToken.status === "configured"
      ? passCheck("assistant_api_token_nonempty", "Assistant API token contents", "Assistant API token file is non-empty.", "runtime")
      : assistantApiToken.status === "empty"
        ? failCheck("assistant_api_token_nonempty", "Assistant API token contents", assistantApiToken.message, "runtime")
        : failCheck(
            "assistant_api_token_nonempty",
            "Assistant API token contents",
            "Assistant API token cannot be validated until the file is readable.",
            "runtime",
          ),
  );
  checks.push(
    assistantApiTokenPermissions.status === "too_broad"
      ? warnCheck(
          "assistant_api_token_permissions_secure",
          "Assistant API token permissions",
          assistantApiTokenPermissions.message,
          "runtime",
        )
      : assistantApiTokenPermissions.status === "secure"
        ? passCheck(
            "assistant_api_token_permissions_secure",
            "Assistant API token permissions",
            assistantApiTokenPermissions.message,
            "runtime",
          )
        : failCheck(
            "assistant_api_token_permissions_secure",
            "Assistant API token permissions",
            assistantApiTokenPermissions.message,
            "runtime",
          ),
  );

  checks.push(fileCheck("dist_cli_exists", "Built CLI", artifacts.distCliPath, false));
  checks.push(fileCheck("dist_daemon_exists", "Built daemon", artifacts.distDaemonPath, false));
  checks.push(fileCheck("dist_mcp_exists", "Built MCP bridge", artifacts.distMcpPath, false));

  const wrapperChecks = [
    { id: "cli_wrapper_exists", title: "CLI wrapper", wrapperPath: artifacts.cliWrapperPath, expectedTarget: artifacts.distCliPath },
    {
      id: "daemon_wrapper_exists",
      title: "Daemon wrapper",
      wrapperPath: artifacts.daemonWrapperPath,
      expectedTarget: artifacts.distDaemonPath,
    },
    {
      id: "codex_mcp_wrapper_exists",
      title: "Codex MCP wrapper",
      wrapperPath: artifacts.codexMcpWrapperPath,
      expectedTarget: artifacts.distMcpPath,
    },
    {
      id: "claude_mcp_wrapper_exists",
      title: "Claude MCP wrapper",
      wrapperPath: artifacts.claudeMcpWrapperPath,
      expectedTarget: artifacts.distMcpPath,
    },
  ];
  for (const wrapper of wrapperChecks) {
    if (!fs.existsSync(wrapper.wrapperPath)) {
      checks.push(failCheck(wrapper.id, wrapper.title, `${wrapper.wrapperPath} is missing.`, "integration"));
      continue;
    }
    const parsed = parseWrapper(wrapper.wrapperPath);
    if (!parsed.targetFile) {
      checks.push(failCheck(wrapper.id, wrapper.title, `${wrapper.wrapperPath} does not contain a recognizable exec target.`, "integration"));
      continue;
    }
    if (parsed.targetFile !== wrapper.expectedTarget) {
      checks.push(
        failCheck(
          wrapper.id,
          wrapper.title,
          `${wrapper.wrapperPath} points to ${parsed.targetFile}, expected ${wrapper.expectedTarget}.`,
          "integration",
        ),
      );
      continue;
    }
    if (!fs.existsSync(parsed.targetFile)) {
      checks.push(
        failCheck(
          wrapper.id,
          wrapper.title,
          `${wrapper.wrapperPath} points to missing target ${parsed.targetFile}.`,
          "integration",
        ),
      );
      continue;
    }
    checks.push(passCheck(wrapper.id, wrapper.title, `${path.basename(wrapper.wrapperPath)} points to ${parsed.targetFile}.`, "integration"));
  }

  checks.push(
    manifest
      ? passCheck("install_manifest_exists", "Install manifest", "Install manifest is present.", "integration")
      : warnCheck("install_manifest_exists", "Install manifest", "Install manifest is missing.", "integration"),
  );
  checks.push(
    desktopToolchain.platform_supported
      ? passCheck("desktop_platform_supported", "Desktop platform", "Desktop shell is supported on this Mac.", "integration")
      : passCheck("desktop_platform_supported", "Desktop platform", "Desktop shell is macOS-only and not required here.", "integration"),
  );
  checks.push(
    !desktopToolchain.platform_supported
      ? passCheck("desktop_toolchain_ready", "Desktop toolchain", desktopToolchain.summary, "integration")
      : !fs.existsSync(desktopPaths.packageJsonPath)
        ? passCheck(
            "desktop_toolchain_ready",
            "Desktop toolchain",
            "Desktop shell source is not present in this runtime environment. The native shell remains optional.",
            "integration",
          )
        : desktopToolchain.ready
          ? passCheck("desktop_toolchain_ready", "Desktop toolchain", desktopToolchain.summary, "integration")
          : passCheck(
              "desktop_toolchain_ready",
              "Desktop toolchain",
              `${desktopToolchain.summary} The native shell remains optional until you choose to install it.`,
              "integration",
            ),
  );
  checks.push(
    fs.existsSync(desktopPaths.installedAppPath)
      ? passCheck(
          "desktop_app_installed",
          "Desktop app bundle",
          `Desktop app is installed at ${desktopPaths.installedAppPath}.`,
          "integration",
        )
      : passCheck(
          "desktop_app_installed",
          "Desktop app bundle",
          `Desktop app is optional in this phase and is not installed at ${desktopPaths.installedAppPath}. Run \`personal-ops install desktop\` when you want the native shell.`,
          "integration",
        ),
  );

  checks.push(
    launchAgent.exists
      ? passCheck("launch_agent_exists", "LaunchAgent file", "LaunchAgent plist exists.", "integration")
      : failCheck("launch_agent_exists", "LaunchAgent file", "LaunchAgent plist is missing.", "integration"),
  );
  if (launchAgent.exists && launchAgent.label === launchAgentLabel) {
    checks.push(passCheck("launch_agent_label_valid", "LaunchAgent label", "LaunchAgent label matches the expected value.", "integration"));
  } else if (launchAgent.exists) {
    checks.push(failCheck("launch_agent_label_valid", "LaunchAgent label", "LaunchAgent label does not match the expected value.", "integration"));
  }

  if (launchAgent.exists && launchAgent.programPath === artifacts.daemonWrapperPath) {
    checks.push(
      passCheck(
        "launch_agent_target_valid",
        "LaunchAgent target",
        `LaunchAgent points to ${artifacts.daemonWrapperPath}.`,
        "integration",
      ),
    );
  } else if (launchAgent.exists) {
    checks.push(
      failCheck(
        "launch_agent_target_valid",
        "LaunchAgent target",
        `LaunchAgent points to ${launchAgent.programPath ?? "nothing"}, expected ${artifacts.daemonWrapperPath}.`,
        "integration",
      ),
    );
  }

  if (launchAgent.exists && launchAgent.workingDirectory === paths.appDir) {
    checks.push(
      passCheck("launch_agent_workdir_valid", "LaunchAgent working directory", `LaunchAgent uses ${paths.appDir}.`, "integration"),
    );
  } else if (launchAgent.exists) {
    checks.push(
      failCheck(
        "launch_agent_workdir_valid",
        "LaunchAgent working directory",
        `LaunchAgent uses ${launchAgent.workingDirectory ?? "nothing"}, expected ${paths.appDir}.`,
        "integration",
      ),
    );
  }

  checks.push(
    launchAgent.loaded
      ? passCheck("launch_agent_loaded", "LaunchAgent state", "LaunchAgent is loaded.", "integration")
      : failCheck("launch_agent_loaded", "LaunchAgent state", "LaunchAgent is not loaded.", "integration"),
  );

  githubDb?.close();

  return {
    generated_at: new Date().toISOString(),
    state: classifyInstallState(checks),
    summary: summarizeChecks(checks),
    checks,
    manifest,
  };
}
