import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { loadConfig } from "./config.js";
import { evaluateWrapperHealth, resolveCurrentSourceCommit } from "./install-artifacts.js";
import type { DesktopBuildProvenance, DesktopStatusReport, DesktopToolchainReport, InstallManifest, Paths } from "./types.js";
import {
  buildDesktopToolchainReport,
  DESKTOP_SUPPORT_CONTRACT,
  summarizeDesktopReinstall,
} from "./desktop-platform.js";
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

function readDesktopPackageJson(desktopPaths: DesktopPaths): Record<string, any> | null {
  if (!fs.existsSync(desktopPaths.packageJsonPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(desktopPaths.packageJsonPath, "utf8")) as Record<string, any>;
}

function readDesktopPackageLockVersion(desktopPaths: DesktopPaths, packageName: string): string | null {
  const lockPath = path.join(desktopPaths.projectPath, "package-lock.json");
  if (!fs.existsSync(lockPath)) {
    return null;
  }
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as {
    packages?: Record<string, { version?: string }>;
  };
  return lock.packages?.[`node_modules/${packageName}`]?.version ?? null;
}

function readDesktopCargoDependencyVersion(desktopPaths: DesktopPaths, packageName: string): string | null {
  const cargoLockPath = path.join(desktopPaths.projectPath, "src-tauri", "Cargo.lock");
  if (!fs.existsSync(cargoLockPath)) {
    return null;
  }
  const raw = fs.readFileSync(cargoLockPath, "utf8");
  const match = raw.match(new RegExp(`\\[\\[package\\]\\]\\nname = "${packageName}"\\nversion = "([^"]+)"`));
  return match?.[1] ?? null;
}

function readDesktopTauriRuntimeVersion(desktopPaths: DesktopPaths): string | null {
  const cargoTomlPath = path.join(desktopPaths.projectPath, "src-tauri", "Cargo.toml");
  if (!fs.existsSync(cargoTomlPath)) {
    return null;
  }
  const cargoToml = parseToml(fs.readFileSync(cargoTomlPath, "utf8")) as {
    dependencies?: Record<string, string | { version?: string }>;
  };
  const dependency = cargoToml.dependencies?.tauri;
  if (typeof dependency === "string") {
    return dependency;
  }
  return dependency?.version ?? readDesktopCargoDependencyVersion(desktopPaths, "tauri");
}

function currentDesktopBuildProvenance(paths: Paths): DesktopBuildProvenance {
  const desktopPaths = getDesktopPaths(paths);
  const packageJson = readDesktopPackageJson(desktopPaths);
  const viteVersion = readDesktopPackageLockVersion(desktopPaths, "vite") ?? String(packageJson?.devDependencies?.vite ?? "").trim();
  const tauriCliVersion =
    readDesktopPackageLockVersion(desktopPaths, "@tauri-apps/cli") ?? String(packageJson?.devDependencies?.["@tauri-apps/cli"] ?? "").trim();
  return {
    built_at: null,
    source_commit: resolveCurrentSourceCommit(paths.appDir),
    vite_version: viteVersion || null,
    tauri_cli_version: tauriCliVersion || null,
    tauri_runtime_version: readDesktopTauriRuntimeVersion(desktopPaths),
  };
}

function readStoredDesktopStatus(paths: Paths): DesktopStatusReport | null {
  if (!fs.existsSync(paths.installManifestFile)) {
    return null;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(paths.installManifestFile, "utf8")) as InstallManifest;
    return manifest.desktop ?? null;
  } catch {
    return null;
  }
}

function buildDesktopStatusReport(
  paths: Paths,
  options: {
    buildProvenanceOverride?: DesktopBuildProvenance;
  } = {},
): DesktopStatusReport {
  const desktopPaths = getDesktopPaths(paths);
  const npm = probeCommand("npm", ["--version"]);
  const cargo = probeCommand("cargo", ["--version"]);
  const rustc = probeCommand("rustc", ["--version"]);
  const xcodeSelect = probeCommand("xcode-select", ["-p"]);
  const platformSupported = process.platform === "darwin";
  const projectPresent = fs.existsSync(desktopPaths.packageJsonPath);
  const toolchain = buildDesktopToolchainReport({
    platformSupported,
    projectPresent,
    npmAvailable: npm.available,
    cargoAvailable: cargo.available,
    rustcAvailable: rustc.available,
    xcodeSelectAvailable: xcodeSelect.available,
  });
  const storedDesktop = readStoredDesktopStatus(paths);
  let installManifest: InstallManifest | null = null;
  if (fs.existsSync(paths.installManifestFile)) {
    try {
      installManifest = JSON.parse(fs.readFileSync(paths.installManifestFile, "utf8")) as InstallManifest;
    } catch {
      installManifest = null;
    }
  }
  const launcherHealth = installManifest
    ? (evaluateWrapperHealth(paths, installManifest).find((wrapper) => wrapper.key === "cli") ?? null)
    : null;
  const buildProvenance = options.buildProvenanceOverride ?? storedDesktop?.build_provenance ?? {
    built_at: null,
    source_commit: null,
    vite_version: null,
    tauri_cli_version: null,
    tauri_runtime_version: null,
  };
  const currentProvenance = currentDesktopBuildProvenance(paths);
  const installed = fs.existsSync(desktopPaths.installedAppPath);
  const reinstallState = summarizeDesktopReinstall(installed, projectPresent, currentProvenance.source_commit, buildProvenance);

  return {
    support_contract: DESKTOP_SUPPORT_CONTRACT,
    supported: platformSupported,
    installed,
    bundle_exists: fs.existsSync(desktopPaths.buildBundlePath),
    app_path: desktopPaths.installedAppPath,
    build_bundle_path: desktopPaths.buildBundlePath,
    project_path: desktopPaths.projectPath,
    build_provenance: buildProvenance,
    reinstall_recommended: reinstallState.reinstallRecommended,
    reinstall_reason: reinstallState.reinstallReason,
    launcher_repair_recommended: launcherHealth ? !launcherHealth.current : false,
    launcher_repair_reason: launcherHealth && !launcherHealth.current ? launcherHealth.reason : null,
    toolchain,
    daemon_session_handoff_ready: false,
    launch_url: null,
  };
}

export function getDesktopToolchainReport(paths: Paths): DesktopToolchainReport {
  return buildDesktopStatusReport(paths).toolchain;
}

export function getDesktopLocalStatusReport(
  paths: Paths,
  options: {
    buildProvenanceOverride?: DesktopBuildProvenance;
  } = {},
): DesktopStatusReport {
  return options.buildProvenanceOverride
    ? buildDesktopStatusReport(paths, { buildProvenanceOverride: options.buildProvenanceOverride })
    : buildDesktopStatusReport(paths);
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
  const baseReport = getDesktopLocalStatusReport(paths);
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
    ...baseReport,
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

  return getDesktopLocalStatusReport(paths, {
    buildProvenanceOverride: {
      ...currentDesktopBuildProvenance(paths),
      built_at: new Date().toISOString(),
    },
  });
}

export function openDesktopApp(paths: Paths): void {
  const desktopStatus = getDesktopLocalStatusReport(paths);
  if (!desktopStatus.supported) {
    throw new Error(desktopStatus.toolchain.unsupported_reason ?? "Desktop shell is supported only on macOS in this phase.");
  }
  if (desktopStatus.launcher_repair_recommended) {
    throw new Error(
      `${desktopStatus.launcher_repair_reason ?? "Local launcher scripts need to be refreshed."} Run \`personal-ops install wrappers\` first.`,
    );
  }
  if (desktopStatus.reinstall_recommended) {
    throw new Error(
      `${desktopStatus.reinstall_reason ?? `Desktop app at ${desktopStatus.app_path} needs to be refreshed.`} Run \`personal-ops install desktop\` first.`,
    );
  }
  if (!desktopStatus.installed) {
    throw new Error(
      `Desktop app is not installed at ${desktopStatus.app_path}. Run \`personal-ops install desktop\` first.`,
    );
  }
  execFileSync("open", [desktopStatus.app_path]);
}

export function withDesktopManifest(manifest: InstallManifest, desktop: DesktopStatusReport): InstallManifest {
  return {
    ...manifest,
    desktop,
  };
}
