import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PERSONAL_OPS_LAUNCH_AGENT_LABEL = "com.d.personal-ops";
export const PERSONAL_OPS_LAUNCH_AGENT_LABEL =
  process.env.PERSONAL_OPS_LAUNCH_AGENT_LABEL ?? DEFAULT_PERSONAL_OPS_LAUNCH_AGENT_LABEL;

export interface LaunchAgentSpec {
  label: string;
  programPath: string;
  workingDirectory: string;
  stdoutPath: string;
  stderrPath: string;
  environmentVariables?: Record<string, string>;
}

export interface LaunchAgentStatus {
  exists: boolean;
  loaded: boolean;
  running: boolean;
  label: string;
  plistPath: string;
  programPath: string | null;
  workingDirectory: string | null;
  stdoutPath: string | null;
  stderrPath: string | null;
}

type ExecFileSyncLike = (file: string, args: readonly string[], options?: unknown) => string | Buffer;

interface LaunchAgentDependencies {
  execFileSyncImpl?: ExecFileSyncLike;
}

function launchctlDomain() {
  return `gui/${process.getuid?.() ?? 501}`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extractPlistValue(raw: string, key: string): string | null {
  const pattern = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`, "m");
  return raw.match(pattern)?.[1] ?? null;
}

function extractProgramPath(raw: string): string | null {
  const pattern = /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/m;
  return raw.match(pattern)?.[1] ?? null;
}

function runLaunchctl(args: string[], dependencies: LaunchAgentDependencies = {}): string {
  return String(
    (dependencies.execFileSyncImpl ?? execFileSync)("launchctl", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

export function getLaunchAgentLabel(): string {
  return process.env.PERSONAL_OPS_LAUNCH_AGENT_LABEL ?? DEFAULT_PERSONAL_OPS_LAUNCH_AGENT_LABEL;
}

export function getLaunchAgentPlistPath(): string {
  return path.join(process.env.HOME ?? os.homedir(), "Library/LaunchAgents", `${getLaunchAgentLabel()}.plist`);
}

export function renderLaunchAgentPlist(spec: LaunchAgentSpec): string {
  const environmentVariables =
    spec.environmentVariables && Object.keys(spec.environmentVariables).length > 0
      ? `
    <key>EnvironmentVariables</key>
    <dict>
${Object.entries(spec.environmentVariables)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(
    ([key, value]) =>
      `      <key>${xmlEscape(key)}</key>\n      <string>${xmlEscape(value)}</string>`,
  )
  .join("\n")}
    </dict>`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${xmlEscape(spec.label)}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${xmlEscape(spec.programPath)}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${xmlEscape(spec.stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(spec.stderrPath)}</string>
    <key>WorkingDirectory</key>
    <string>${xmlEscape(spec.workingDirectory)}</string>${environmentVariables}
  </dict>
</plist>
`;
}

export function inspectLaunchAgent(
  plistPath = getLaunchAgentPlistPath(),
  label = getLaunchAgentLabel(),
  dependencies: LaunchAgentDependencies = {},
): LaunchAgentStatus {
  const exists = fs.existsSync(plistPath);
  const raw = exists ? fs.readFileSync(plistPath, "utf8") : "";
  let loaded = false;
  let running = false;

  try {
    const output = runLaunchctl(["print", `${launchctlDomain()}/${label}`], dependencies);
    loaded = output.includes(`${launchctlDomain()}/${label} = {`);
    running = output.includes("state = running");
  } catch {
    loaded = false;
    running = false;
  }

  return {
    exists,
    loaded,
    running,
    label,
    plistPath,
    programPath: exists ? extractProgramPath(raw) : null,
    workingDirectory: exists ? extractPlistValue(raw, "WorkingDirectory") : null,
    stdoutPath: exists ? extractPlistValue(raw, "StandardOutPath") : null,
    stderrPath: exists ? extractPlistValue(raw, "StandardErrorPath") : null,
  };
}

export function writeLaunchAgentPlist(plistPath: string, spec: LaunchAgentSpec): void {
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, renderLaunchAgentPlist(spec), { encoding: "utf8", mode: 0o644 });
}

export function stopLaunchAgent(
  plistPath = getLaunchAgentPlistPath(),
  dependencies: LaunchAgentDependencies = {},
): void {
  try {
    runLaunchctl(["bootout", launchctlDomain(), plistPath], dependencies);
  } catch {
    // bootout is idempotent enough for our install and restore flow
  }
}

export function startLaunchAgent(
  plistPath = getLaunchAgentPlistPath(),
  label = getLaunchAgentLabel(),
  dependencies: LaunchAgentDependencies = {},
): LaunchAgentStatus {
  runLaunchctl(["bootstrap", launchctlDomain(), plistPath], dependencies);
  runLaunchctl(["kickstart", "-k", `${launchctlDomain()}/${label}`], dependencies);
  return inspectLaunchAgent(plistPath, label, dependencies);
}

export function reloadLaunchAgent(
  plistPath = getLaunchAgentPlistPath(),
  label = getLaunchAgentLabel(),
  dependencies: LaunchAgentDependencies = {},
): LaunchAgentStatus {
  stopLaunchAgent(plistPath, dependencies);
  return startLaunchAgent(plistPath, label, dependencies);
}
