import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./config.js";
import type { DesktopStatusReport, DesktopToolchainReport, InstallManifest, Paths } from "./types.js";
import type { ConsoleSessionGrant } from "./web-console.js";

interface DesktopPaths {
  projectPath: string;
  packageJsonPath: string;
  nodeModulesPath: string;
  buildBundlePath: string;
  installedAppPath: string;
}

interface CommandProbeResult {
  available: boolean;
  output: string;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shellJoin(command: string, args: string[]): string {
  return [command, ...args].map(shellEscape).join(" ");
}

function getDesktopShell(): string {
  return process.env.SHELL || "/bin/zsh";
}

function getDesktopCommandEnv(): NodeJS.ProcessEnv {
  const operatorHome = os.userInfo().homedir;
  return {
    ...process.env,
    HOME: operatorHome,
    CARGO_HOME: process.env.CARGO_HOME ?? path.join(operatorHome, ".cargo"),
    RUSTUP_HOME: process.env.RUSTUP_HOME ?? path.join(operatorHome, ".rustup"),
  };
}

function probeCommand(command: string, args: string[]): CommandProbeResult {
  const result = spawnSync(getDesktopShell(), ["-lc", shellJoin(command, args)], {
    encoding: "utf8",
    env: getDesktopCommandEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    return {
      available: true,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    };
  }
  return {
    available: false,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

export function getDesktopPaths(paths: Paths): DesktopPaths {
  const projectPath = path.resolve(paths.appDir, "..", "desktop");
  return {
    projectPath,
    packageJsonPath: path.join(projectPath, "package.json"),
    nodeModulesPath: path.join(projectPath, "node_modules"),
    buildBundlePath: path.join(
      projectPath,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "macos",
      "Personal Ops.app",
    ),
    installedAppPath: path.join(process.env.HOME ?? os.homedir(), "Applications", "Personal Ops.app"),
  };
}

export function getDesktopToolchainReport(paths: Paths): DesktopToolchainReport {
  const desktopPaths = getDesktopPaths(paths);
  const npm = probeCommand("npm", ["--version"]);
  const cargo = probeCommand("cargo", ["--version"]);
  const rustc = probeCommand("rustc", ["--version"]);
  const xcodeSelect = probeCommand("xcode-select", ["-p"]);
  const platformSupported = process.platform === "darwin";
  const projectPresent = fs.existsSync(desktopPaths.packageJsonPath);
  const ready = platformSupported && projectPresent && npm.available && cargo.available && rustc.available && xcodeSelect.available;
  const summary = !platformSupported
    ? "Desktop shell is macOS-only in this phase."
    : !projectPresent
      ? "Desktop project files are missing from the source checkout."
      : ready
        ? "macOS desktop toolchain is ready."
        : "Desktop toolchain is incomplete. Check npm, cargo, rustc, and xcode-select.";

  return {
    platform_supported: platformSupported,
    npm_available: npm.available,
    cargo_available: cargo.available,
    rustc_available: rustc.available,
    xcode_select_available: xcodeSelect.available,
    ready,
    summary,
  };
}

export async function createDesktopConsoleSession(paths: Paths): Promise<ConsoleSessionGrant> {
  const config = loadConfig(paths);
  const token = fs.readFileSync(paths.apiTokenFile, "utf8").trim();
  if (!token) {
    throw new Error("Local API token is missing. Run `personal-ops install all` first.");
  }
  const response = await fetch(`http://${config.serviceHost}:${config.servicePort}/v1/console/session`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
      "x-personal-ops-client": "desktop-shell",
      "x-personal-ops-requested-by": "desktop",
      "x-personal-ops-origin": "desktop-shell",
    },
  });
  const payload = (await response.json()) as { console_session?: ConsoleSessionGrant; error?: string };
  if (!response.ok || !payload.console_session) {
    throw new Error(payload.error ?? "Desktop console session handoff failed.");
  }
  return payload.console_session;
}

export async function getDesktopStatusReport(paths: Paths): Promise<DesktopStatusReport> {
  const desktopPaths = getDesktopPaths(paths);
  const toolchain = getDesktopToolchainReport(paths);
  let launchUrl: string | null = null;
  let handoffReady = false;
  try {
    const session = await createDesktopConsoleSession(paths);
    launchUrl = session.launch_url;
    handoffReady = true;
  } catch {
    handoffReady = false;
  }

  return {
    supported: process.platform === "darwin",
    installed: fs.existsSync(desktopPaths.installedAppPath),
    bundle_exists: fs.existsSync(desktopPaths.buildBundlePath),
    app_path: desktopPaths.installedAppPath,
    build_bundle_path: desktopPaths.buildBundlePath,
    project_path: desktopPaths.projectPath,
    toolchain,
    daemon_session_handoff_ready: handoffReady,
    launch_url: launchUrl,
  };
}

function runDesktopCommand(projectPath: string, args: string[]): void {
  execFileSync(getDesktopShell(), ["-lc", shellJoin("npm", args)], {
    cwd: projectPath,
    env: getDesktopCommandEnv(),
    stdio: "inherit",
  });
}

export async function installDesktopApp(paths: Paths): Promise<DesktopStatusReport> {
  const desktopPaths = getDesktopPaths(paths);
  const toolchain = getDesktopToolchainReport(paths);
  if (!toolchain.ready) {
    throw new Error(toolchain.summary);
  }
  if (!fs.existsSync(desktopPaths.packageJsonPath)) {
    throw new Error(`Desktop project is missing at ${desktopPaths.projectPath}.`);
  }

  if (!fs.existsSync(desktopPaths.nodeModulesPath)) {
    runDesktopCommand(desktopPaths.projectPath, ["install", "--no-fund", "--no-audit"]);
  }

  runDesktopCommand(desktopPaths.projectPath, ["run", "build"]);
  runDesktopCommand(desktopPaths.projectPath, ["run", "tauri:build", "--", "--bundles", "app"]);

  if (!fs.existsSync(desktopPaths.buildBundlePath)) {
    throw new Error(`Desktop build finished without producing ${desktopPaths.buildBundlePath}.`);
  }

  fs.mkdirSync(path.dirname(desktopPaths.installedAppPath), { recursive: true });
  fs.rmSync(desktopPaths.installedAppPath, { recursive: true, force: true });
  fs.cpSync(desktopPaths.buildBundlePath, desktopPaths.installedAppPath, { recursive: true });

  return getDesktopStatusReport(paths);
}

export function openDesktopApp(paths: Paths): void {
  const desktopPaths = getDesktopPaths(paths);
  if (!fs.existsSync(desktopPaths.installedAppPath)) {
    throw new Error(
      `Desktop app is not installed at ${desktopPaths.installedAppPath}. Run \`personal-ops install desktop\` first.`,
    );
  }
  execFileSync("open", [desktopPaths.installedAppPath]);
}

export function withDesktopManifest(manifest: InstallManifest, desktop: DesktopStatusReport): InstallManifest {
  return {
    ...manifest,
    desktop,
  };
}
