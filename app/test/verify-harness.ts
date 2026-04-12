import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium, type Page } from "playwright";
import { createRequestJson } from "../src/cli/http-client.js";
import { ensureRuntimeFiles, loadConfig } from "../src/config.js";
import { PersonalOpsDb } from "../src/db.js";
import { readRecoveryRehearsalStamp, writeRecoveryRehearsalStamp } from "../src/recovery.js";
import type {
  ClientIdentity,
  Config,
  InstallCheckReport,
  Paths,
  RestoreResult,
  SnapshotPruneResult,
  SnapshotInspection,
  SnapshotManifest,
  SnapshotSummary,
} from "../src/types.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 20_000;
const MCP_CLIENT_INFO = {
  name: "personal-ops-verify",
  version: "0.1.0",
};
const VERIFY_IDENTITY: ClientIdentity = {
  client_id: "phase3-verify",
  requested_by: "phase3-verify",
  auth_role: "operator",
};

interface VerificationEnvironment {
  appDir: string;
  repoRoot: string;
  baseDir: string;
  homeDir: string;
  env: Record<string, string>;
  paths: Paths;
  config: Config;
  port: number;
  launchAgentLabel: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface DaemonHandle {
  child: ChildProcess;
  stdoutLines: string[];
  stderrLines: string[];
  descriptor: string;
}

interface MpcCheckResult {
  tools: string[];
}

function repoAppDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function repoRootDir() {
  return path.resolve(repoAppDir(), "..");
}

function buildChildEnv(overrides: Record<string, string>): Record<string, string> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return {
    ...inherited,
    ...overrides,
  };
}

function withRuntimeEnv<T>(env: Record<string, string>, fn: () => T): T {
  const keys = [
    "HOME",
    "PATH",
    "PERSONAL_OPS_APP_DIR",
    "PERSONAL_OPS_CONFIG_DIR",
    "PERSONAL_OPS_STATE_DIR",
    "PERSONAL_OPS_LOG_DIR",
    "PERSONAL_OPS_LAUNCH_AGENT_LABEL",
  ];
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    const nextValue = env[key];
    if (nextValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextValue;
    }
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function reservePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a loopback port for verification.");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return port;
}

function writeIsolatedConfig(paths: Paths, port: number, mailbox = ""): void {
  fs.writeFileSync(
    paths.configFile,
    `[service]
host = "127.0.0.1"
port = ${port}

[http]
allowed_origins = []

[gmail]
account_email = "${mailbox}"
review_url = "https://mail.google.com/mail/u/0/#drafts"

[calendar]
enabled = true
provider = "google"
included_calendar_ids = []
sync_past_days = 30
sync_future_days = 90
sync_interval_minutes = 5
workday_start_local = "09:00"
workday_end_local = "18:00"
meeting_prep_warning_minutes = 30
day_overload_event_threshold = 6
schedule_pressure_free_minutes_threshold = 60

[auth]
keychain_service = "personal-ops.gmail.verify"
oauth_client_file = "${paths.oauthClientFile}"
`,
    "utf8",
  );
}

async function createVerificationEnvironment(name: string): Promise<VerificationEnvironment> {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `personal-ops-verify-${name}-`));
  const homeDir = path.join(baseDir, "home");
  fs.mkdirSync(homeDir, { recursive: true });
  const port = await reservePort();
  const launchAgentLabel = `com.d.personal-ops.verify.${name}.${process.pid}.${Date.now()}`;
  const appDir = repoAppDir();
  const repoRoot = repoRootDir();
  const env = buildChildEnv({
    HOME: homeDir,
    PERSONAL_OPS_APP_DIR: appDir,
    PERSONAL_OPS_CONFIG_DIR: path.join(homeDir, ".config", "personal-ops"),
    PERSONAL_OPS_STATE_DIR: path.join(homeDir, "Library", "Application Support", "personal-ops"),
    PERSONAL_OPS_LOG_DIR: path.join(homeDir, "Library", "Logs", "personal-ops"),
    PERSONAL_OPS_LAUNCH_AGENT_LABEL: launchAgentLabel,
  });
  const paths = withRuntimeEnv(env, () => ensureRuntimeFiles());
  writeIsolatedConfig(paths, port);
  const config = loadConfig(paths);
  return { appDir, repoRoot, baseDir, homeDir, env, paths, config, port, launchAgentLabel };
}

function wrapperPaths(env: VerificationEnvironment) {
  return {
    cli: path.join(env.homeDir, ".local", "bin", "personal-ops"),
    daemon: path.join(env.homeDir, ".local", "bin", "personal-opsd"),
    codexMcp: path.join(env.homeDir, ".codex", "bin", "personal-ops-mcp"),
    claudeMcp: path.join(env.homeDir, ".claude", "bin", "personal-ops-mcp"),
    launchAgentPlist: path.join(env.homeDir, "Library", "LaunchAgents", `${env.launchAgentLabel}.plist`),
  };
}

function parseWrapperTarget(wrapperPath: string): string | null {
  if (!fs.existsSync(wrapperPath)) {
    return null;
  }
  const raw = fs.readFileSync(wrapperPath, "utf8");
  return raw.match(/exec\s+"[^"]+"\s+"([^"]+)"\s+"\$@"/)?.[1] ?? null;
}

function assertExecutable(wrapperPath: string): void {
  const stats = fs.statSync(wrapperPath);
  assert.notEqual(stats.mode & 0o111, 0, `${wrapperPath} should be executable.`);
}

async function runCommand(
  phase: string,
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string> },
): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      maxBuffer: 20 * 1024 * 1024,
    });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (error) {
    const details =
      error instanceof Error
        ? `\nstdout:\n${String((error as { stdout?: string }).stdout ?? "")}\nstderr:\n${String(
            (error as { stderr?: string }).stderr ?? "",
          )}`
        : "";
    throw new Error(`${phase} failed while running ${command} ${args.join(" ")}.${details}`);
  }
}

function parseJsonOutput<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${label} did not produce valid JSON.\nOutput:\n${raw}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

function tailLines(lines: string[], count = 20): string {
  return lines.slice(-count).join("\n");
}

async function waitForFunctionLabeled(
  page: Page,
  label: string,
  pageFunction: Parameters<Page["waitForFunction"]>[0],
  arg?: Parameters<Page["waitForFunction"]>[1],
  options?: Parameters<Page["waitForFunction"]>[2],
): Promise<void> {
  try {
    await page.waitForFunction(pageFunction, arg, options);
  } catch (error) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    throw new Error(
      `Console verifier timed out while waiting for: ${label}\n${error instanceof Error ? error.message : String(error)}${
        bodyText ? `\nVisible body:\n${bodyText}` : ""
      }`,
    );
  }
}

async function waitForSelectorLabeled(
  page: Page,
  label: string,
  selector: string,
  options?: { timeout?: number },
): Promise<void> {
  try {
    await page.waitForSelector(selector, options);
  } catch (error) {
    throw new Error(`Console verifier timed out while waiting for selector: ${label}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitForHealth(config: Config, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const request = net.connect(config.servicePort, config.serviceHost, () => {
          request.end();
          resolve();
        });
        request.on("error", reject);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Timed out waiting for daemon health on ${config.serviceHost}:${config.servicePort}.`);
}

async function startDaemonProcess(
  env: VerificationEnvironment,
  command: string,
  args: string[],
  descriptor: string,
): Promise<DaemonHandle> {
  const child = spawn(command, args, {
    cwd: env.repoRoot,
    env: env.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutLines.push(...chunk.split(/\r?\n/).filter(Boolean));
  });
  child.stderr.on("data", (chunk: string) => {
    stderrLines.push(...chunk.split(/\r?\n/).filter(Boolean));
  });

  const exitPromise = once(child, "exit").then(([code, signal]) => ({ code, signal }));
  try {
    await Promise.race([
      waitForHealth(env.config),
      exitPromise.then((result) => {
        throw new Error(`${descriptor} exited before becoming healthy (code=${String(result.code)}, signal=${String(result.signal)}).`);
      }),
    ]);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(
      `${descriptor} failed to start.\n${error instanceof Error ? error.message : String(error)}\nstdout:\n${tailLines(
        stdoutLines,
      )}\nstderr:\n${tailLines(stderrLines)}`,
    );
  }

  return { child, stdoutLines, stderrLines, descriptor };
}

async function stopDaemonProcess(handle: DaemonHandle | null): Promise<void> {
  if (!handle) {
    return;
  }
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
    return;
  }
  handle.child.kill("SIGTERM");
  const exited = once(handle.child, "exit");
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${handle.descriptor} did not stop within 10 seconds.`)), 10_000),
  );
  try {
    await Promise.race([exited, timeout]);
  } catch {
    handle.child.kill("SIGKILL");
    await once(handle.child, "exit");
  }
}

function createHttpClient(config: Config) {
  return createRequestJson(config);
}

async function runHttpSmoke(env: VerificationEnvironment): Promise<void> {
  const requestJson = createHttpClient(env.config);
  const status = await requestJson<{ status: { state: string } }>("GET", "/v1/status");
  assert.ok(status.status.state, "status report should include a state.");
  const worklist = await requestJson<{ worklist: { items: unknown[] } }>("GET", "/v1/worklist");
  assert.ok(Array.isArray(worklist.worklist.items), "worklist should include items.");
  const nowNext = await requestJson<{ workflow: { workflow: string; actions: unknown[] } }>("GET", "/v1/workflows/now-next");
  assert.equal(nowNext.workflow.workflow, "now-next");
  assert.ok(Array.isArray(nowNext.workflow.actions), "now-next should include actions.");
  const workflow = await requestJson<{ workflow: { workflow: string; sections: unknown[] } }>("GET", "/v1/workflows/prep-day");
  assert.equal(workflow.workflow.workflow, "prep-day");
  assert.ok(Array.isArray(workflow.workflow.sections), "workflow bundle should include sections.");
  const doctor = await requestJson<{ doctor: { checks: unknown[] } }>("GET", "/v1/doctor");
  assert.ok(Array.isArray(doctor.doctor.checks), "doctor should include checks.");
}

function parseMcpJson(result: { content?: Array<{ type: string; text?: string }>; toolResult?: unknown }, label: string): any {
  if ("toolResult" in result && result.toolResult) {
    return result.toolResult;
  }
  const textPayload = result.content?.find((item) => item.type === "text")?.text;
  if (!textPayload) {
    throw new Error(`${label} did not return text content.`);
  }
  return parseJsonOutput(textPayload, label);
}

async function runMcpSmoke(
  env: VerificationEnvironment,
  server: { command: string; args?: string[] },
  options: { planningTool?: boolean } = {},
): Promise<MpcCheckResult> {
  const transport = new StdioClientTransport({
    command: server.command,
    cwd: env.repoRoot,
    env: env.env,
    stderr: "pipe",
    ...(server.args ? { args: server.args } : {}),
  });
  const stderrLines: string[] = [];
  const stderr = transport.stderr;
  if (stderr) {
    const readable = stderr as unknown as NodeJS.ReadableStream & { setEncoding?: (encoding: BufferEncoding) => void };
    readable.setEncoding?.("utf8");
    readable.on("data", (chunk: string) => {
      stderrLines.push(...chunk.split(/\r?\n/).filter(Boolean));
    });
  }

  const client = new Client(MCP_CLIENT_INFO, { capabilities: {} });
  try {
    await client.connect(transport);
    const toolsResponse = await client.listTools();
    const toolNames = toolsResponse.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes("personal_ops_status"), "MCP tools should include personal_ops_status.");
    assert.ok(toolNames.includes("inbox_status"), "MCP tools should include inbox_status.");

    const statusResult = await client.callTool({ name: "personal_ops_status", arguments: {} });
    const statusPayload = parseMcpJson(statusResult, "personal_ops_status");
    assert.ok(statusPayload.status?.state, "personal_ops_status should return a status payload.");

    if (options.planningTool) {
      const planningResult = await client.callTool({ name: "planning_recommendation_summary", arguments: {} });
      const planningPayload = parseMcpJson(planningResult, "planning_recommendation_summary");
      assert.ok(
        planningPayload.planning_recommendation_summary,
        "planning_recommendation_summary should return summary data.",
      );
    } else {
      const inboxResult = await client.callTool({ name: "inbox_status", arguments: {} });
      const inboxPayload = parseMcpJson(inboxResult, "inbox_status");
      assert.ok(inboxPayload.inbox, "inbox_status should return inbox data.");
    }
    await transport.close();
    return { tools: toolNames };
  } catch (error) {
    try {
      await transport.close();
    } catch {
      // best effort close for failing verification harnesses
    }
    throw new Error(
      `MCP smoke failed.\n${error instanceof Error ? error.message : String(error)}\nstderr:\n${tailLines(stderrLines)}`,
    );
  }
}

async function createSnapshotViaHttp(env: VerificationEnvironment): Promise<SnapshotManifest> {
  const requestJson = createHttpClient(env.config);
  const created = await requestJson<{ snapshot: SnapshotManifest }>("POST", "/v1/snapshots");
  assert.ok(created.snapshot.snapshot_id, "snapshot create should return an id.");
  const inspected = await requestJson<{ snapshot: SnapshotInspection }>(
    "GET",
    `/v1/snapshots/${encodeURIComponent(created.snapshot.snapshot_id)}`,
  );
  assert.equal(inspected.snapshot.manifest.snapshot_id, created.snapshot.snapshot_id);
  return created.snapshot;
}

function seedFixtureState(paths: Paths): { taskId: string; suggestionId: string; recommendationId: string } {
  const db = new PersonalOpsDb(paths.databaseFile);
  try {
    const task = db.createTask(VERIFY_IDENTITY, {
      title: "Verify fixture task",
      kind: "human_reminder",
      priority: "high",
      owner: "operator",
    });
    const suggestion = db.createTaskSuggestion(VERIFY_IDENTITY, {
      title: "Verify fixture suggestion",
      kind: "human_reminder",
      priority: "normal",
    });
    const recommendation = db.createPlanningRecommendation(VERIFY_IDENTITY, {
      kind: "schedule_task_block",
      priority: "normal",
      source: "system_generated",
      reason_code: "verify_fixture",
      reason_summary: "Verification harness fixture recommendation.",
      dedupe_key: "verify-fixture",
      source_fingerprint: "verify-fixture",
      proposed_calendar_id: "primary",
      proposed_start_at: "2026-04-01T18:00:00.000Z",
      proposed_end_at: "2026-04-01T18:30:00.000Z",
      proposed_title: "Verify fixture block",
      slot_state: "ready",
      outcome_state: "none",
    });
    return {
      taskId: task.task_id,
      suggestionId: suggestion.suggestion_id,
      recommendationId: recommendation.recommendation_id,
    };
  } finally {
    db.close();
  }
}

function mutateFixtureState(paths: Paths): void {
  const db = new PersonalOpsDb(paths.databaseFile);
  try {
    db.createTask(VERIFY_IDENTITY, {
      title: "Mutated task after snapshot",
      kind: "human_reminder",
      priority: "low",
      owner: "operator",
    });
  } finally {
    db.close();
  }
  fs.writeFileSync(
    paths.configFile,
    fs.readFileSync(paths.configFile, "utf8").replace('account_email = ""', 'account_email = "mutated@example.com"'),
    "utf8",
  );
  fs.writeFileSync(
    paths.policyFile,
    fs.readFileSync(paths.policyFile, "utf8").replace("allow_send = false", "allow_send = true"),
    "utf8",
  );
}

function writeFixtureSnapshot(
  paths: Paths,
  input: {
    snapshotId: string;
    createdAt: string;
    daemonState?: SnapshotManifest["daemon_state"];
  },
): void {
  const snapshotDir = path.join(paths.snapshotsDir, input.snapshotId);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const dbBackupPath = path.join(snapshotDir, "personal-ops.db");
  const configCopy = path.join(snapshotDir, "config.toml");
  const policyCopy = path.join(snapshotDir, "policy.toml");
  const logCopy = path.join(snapshotDir, "app.jsonl");
  fs.writeFileSync(dbBackupPath, "", "utf8");
  fs.writeFileSync(configCopy, fs.readFileSync(paths.configFile, "utf8"), "utf8");
  fs.writeFileSync(policyCopy, fs.readFileSync(paths.policyFile, "utf8"), "utf8");
  fs.writeFileSync(logCopy, "", "utf8");
  fs.writeFileSync(
    path.join(snapshotDir, "manifest.json"),
    JSON.stringify(
      {
        snapshot_id: input.snapshotId,
        created_at: input.createdAt,
        service_version: "0.1.0",
        schema_version: 14,
        backup_intent: "recovery",
        mailbox: null,
        db_backup_path: dbBackupPath,
        config_paths: [configCopy, policyCopy],
        log_paths: [logCopy],
        daemon_state: input.daemonState ?? "ready",
        notes: [],
      } satisfies SnapshotManifest,
      null,
      2,
    ),
    "utf8",
  );
}

function assertFixtureRestored(paths: Paths, originalSnapshotId: string, restoreResult: RestoreResult): void {
  const db = new PersonalOpsDb(paths.databaseFile);
  try {
    const tasks = db.listTasks();
    const suggestions = db.listTaskSuggestions();
    const recommendations = db.listPlanningRecommendations({ include_resolved: true });
    assert.equal(tasks.some((task) => task.title === "Verify fixture task"), true, "restored DB should contain the fixture task.");
    assert.equal(tasks.some((task) => task.title === "Mutated task after snapshot"), false, "restored DB should not contain post-snapshot mutations.");
    assert.equal(suggestions.some((suggestion) => suggestion.title === "Verify fixture suggestion"), true);
    assert.equal(
      recommendations.some((recommendation) => recommendation.reason_code === "verify_fixture"),
      true,
      "restored DB should contain the fixture planning recommendation.",
    );
  } finally {
    db.close();
  }
  assert.equal(fs.existsSync(path.join(paths.snapshotsDir, originalSnapshotId, "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(paths.snapshotsDir, restoreResult.rescue_snapshot_id, "manifest.json")), true);
  const configText = fs.readFileSync(paths.configFile, "utf8");
  const policyText = fs.readFileSync(paths.policyFile, "utf8");
  assert.match(configText, /account_email = ""/);
  assert.match(policyText, /allow_send = false/);
}

function assertBootstrapArtifacts(env: VerificationEnvironment): void {
  const wrappers = wrapperPaths(env);
  for (const wrapperPath of [wrappers.cli, wrappers.daemon, wrappers.codexMcp, wrappers.claudeMcp]) {
    assert.equal(fs.existsSync(wrapperPath), true, `${wrapperPath} should exist after bootstrap.`);
    assertExecutable(wrapperPath);
  }
  assert.equal(parseWrapperTarget(wrappers.cli), path.join(env.appDir, "dist", "src", "cli.js"));
  assert.equal(parseWrapperTarget(wrappers.daemon), path.join(env.appDir, "dist", "src", "daemon.js"));
  assert.equal(parseWrapperTarget(wrappers.codexMcp), path.join(env.appDir, "dist", "src", "mcp-server.js"));
  assert.equal(parseWrapperTarget(wrappers.claudeMcp), path.join(env.appDir, "dist", "src", "mcp-server.js"));
  const plist = fs.readFileSync(wrappers.launchAgentPlist, "utf8");
  assert.match(plist, new RegExp(env.launchAgentLabel.replaceAll(".", "\\.")));
  assert.match(plist, new RegExp(wrapperPaths(env).daemon.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(plist, /<key>EnvironmentVariables<\/key>/);
}

function launchctlDomain() {
  return `gui/${process.getuid?.() ?? 501}`;
}

async function stopLaunchAgentIfPresent(env: VerificationEnvironment): Promise<void> {
  const plistPath = wrapperPaths(env).launchAgentPlist;
  if (!fs.existsSync(plistPath)) {
    return;
  }
  try {
    await runCommand("launchagent cleanup", "launchctl", ["bootout", launchctlDomain(), plistPath], {
      cwd: env.repoRoot,
      env: env.env,
    });
  } catch {
    // best effort cleanup for temporary verification agents
  }
}

async function verifyLaunchAgentLoaded(env: VerificationEnvironment): Promise<void> {
  const plistPath = wrapperPaths(env).launchAgentPlist;
  const printResult = await runCommand(
    "launchagent print",
    "launchctl",
    ["print", `${launchctlDomain()}/${env.launchAgentLabel}`],
    { cwd: env.repoRoot, env: env.env },
  );
  assert.match(printResult.stdout, /state = (running|spawn scheduled|waiting)/);
  assert.equal(fs.existsSync(plistPath), true, "launchagent plist should exist.");
}

async function runCliJson<T>(env: VerificationEnvironment, args: string[]): Promise<T> {
  const cliPath = wrapperPaths(env).cli;
  const result = await runCommand(`cli ${args.join(" ")}`, cliPath, args, {
    cwd: env.repoRoot,
    env: env.env,
  });
  return parseJsonOutput<T>(result.stdout, `CLI ${args.join(" ")}`);
}

async function runBootstrap(env: VerificationEnvironment): Promise<void> {
  const bootstrapPath = path.join(env.repoRoot, "bootstrap");
  assert.equal(fs.existsSync(bootstrapPath), true, "bootstrap script should exist.");
  await runCommand("bootstrap", bootstrapPath, [], {
    cwd: env.repoRoot,
    env: env.env,
  });
}

function cleanupEnvironment(env: VerificationEnvironment): void {
  fs.rmSync(env.baseDir, { recursive: true, force: true });
}

function formatFailureContext(
  env: VerificationEnvironment,
  daemon: DaemonHandle | null,
  extra?: { endpoint?: string; command?: string },
): string {
  const details = [`Temp home: ${env.homeDir}`];
  if (extra?.command) {
    details.push(`Command: ${extra.command}`);
  }
  if (extra?.endpoint) {
    details.push(`Endpoint: ${extra.endpoint}`);
  }
  if (daemon) {
    details.push(`Daemon stdout:\n${tailLines(daemon.stdoutLines) || "(none)"}`);
    details.push(`Daemon stderr:\n${tailLines(daemon.stderrLines) || "(none)"}`);
  }
  return details.join("\n");
}

export async function runSmokeVerification(): Promise<void> {
  const env = await createVerificationEnvironment("smoke");
  let daemon: DaemonHandle | null = null;
  try {
    await runCommand("install cli wrapper", "node", [path.join(env.appDir, "dist", "src", "cli.js"), "install", "wrapper", "--kind", "cli", "--json"], {
      cwd: env.repoRoot,
      env: env.env,
    });
    await runCommand("install daemon wrapper", "node", [path.join(env.appDir, "dist", "src", "cli.js"), "install", "wrapper", "--kind", "daemon", "--json"], {
      cwd: env.repoRoot,
      env: env.env,
    });
    await runCommand("install codex mcp wrapper", "node", [path.join(env.appDir, "dist", "src", "cli.js"), "install", "wrapper", "--kind", "mcp", "--assistant", "codex", "--json"], {
      cwd: env.repoRoot,
      env: env.env,
    });
    await runCommand("install claude mcp wrapper", "node", [path.join(env.appDir, "dist", "src", "cli.js"), "install", "wrapper", "--kind", "mcp", "--assistant", "claude", "--json"], {
      cwd: env.repoRoot,
      env: env.env,
    });

    const wrappers = wrapperPaths(env);
    for (const wrapperPath of [wrappers.cli, wrappers.daemon, wrappers.codexMcp, wrappers.claudeMcp]) {
      assert.equal(fs.existsSync(wrapperPath), true);
      assertExecutable(wrapperPath);
    }

    daemon = await startDaemonProcess(env, wrappers.daemon, [], "smoke daemon wrapper");
    await runHttpSmoke(env);
    await runMcpSmoke(env, { command: wrappers.codexMcp });
    await createSnapshotViaHttp(env);
  } catch (error) {
    throw new Error(
      `Smoke verification failed.\n${error instanceof Error ? error.message : String(error)}\n${formatFailureContext(env, daemon)}`,
    );
  } finally {
    await stopDaemonProcess(daemon);
    cleanupEnvironment(env);
  }
}

export async function runLaunchAgentVerification(): Promise<void> {
  if (process.platform !== "darwin") {
    process.stdout.write("Skipping launchagent verification: macOS only.\n");
    return;
  }
  const env = await createVerificationEnvironment("launchagent");
  try {
    const cliEntry = path.join(env.appDir, "dist", "src", "cli.js");
    await runCommand("install all", "node", [cliEntry, "install", "all", "--json"], {
      cwd: env.repoRoot,
      env: env.env,
    });
    await verifyLaunchAgentLoaded(env);
    await runCommand("reload launchagent", "node", [cliEntry, "install", "launchagent", "--json"], {
      cwd: env.repoRoot,
      env: env.env,
    });
    await verifyLaunchAgentLoaded(env);
    assertBootstrapArtifacts(env);
  } catch (error) {
    throw new Error(`LaunchAgent verification failed.\n${error instanceof Error ? error.message : String(error)}\nTemp home: ${env.homeDir}`);
  } finally {
    await stopLaunchAgentIfPresent(env);
    cleanupEnvironment(env);
  }
}

export async function runFullVerification(): Promise<void> {
  const env = await createVerificationEnvironment("full");
  let daemon: DaemonHandle | null = null;
  try {
    await runBootstrap(env);
    assertBootstrapArtifacts(env);
    const installCheck = await runCliJson<{ install_check: InstallCheckReport }>(env, ["install", "check", "--json"]);
    assert.equal(installCheck.install_check.state, "setup_required");

    if (process.platform === "darwin") {
      await verifyLaunchAgentLoaded(env);
      await stopLaunchAgentIfPresent(env);
    }

    seedFixtureState(env.paths);
    daemon = await startDaemonProcess(env, wrapperPaths(env).daemon, [], "full daemon wrapper");

    const status = await runCliJson<{ status: { state: string } }>(env, ["status", "--json"]);
    const worklist = await runCliJson<{ worklist: { items: unknown[] } }>(env, ["worklist", "--json"]);
    const nowNext = await runCliJson<{ workflow: { workflow: string; actions: unknown[] } }>(env, ["workflow", "now-next", "--json"]);
    const prepDay = await runCliJson<{ workflow: { workflow: string; actions: unknown[] } }>(env, ["workflow", "prep-day", "--json"]);
    const doctor = await runCliJson<{ doctor: { checks: unknown[] } }>(env, ["doctor", "--json"]);
    assert.ok(status.status.state);
    assert.ok(Array.isArray(worklist.worklist.items));
    assert.equal(nowNext.workflow.workflow, "now-next");
    assert.ok(Array.isArray(nowNext.workflow.actions));
    assert.equal(prepDay.workflow.workflow, "prep-day");
    assert.ok(Array.isArray(prepDay.workflow.actions));
    assert.ok(Array.isArray(doctor.doctor.checks));

    await runHttpSmoke(env);
    await runMcpSmoke(env, { command: wrapperPaths(env).codexMcp }, { planningTool: true });

    const snapshotResponse = await runCliJson<{ snapshot: SnapshotManifest }>(env, ["backup", "create", "--json"]);
    const snapshotId = snapshotResponse.snapshot.snapshot_id;
    assert.ok(snapshotId);
    assert.ok(snapshotResponse.snapshot.source_machine?.machine_id, "snapshot should record source machine id.");
    const snapshotInspect = await runCliJson<{ snapshot: SnapshotInspection }>(env, ["backup", "inspect", snapshotId, "--json"]);
    assert.equal(snapshotInspect.snapshot.manifest.snapshot_id, snapshotId);
    assert.equal(snapshotInspect.snapshot.manifest.source_machine?.machine_id, snapshotResponse.snapshot.source_machine?.machine_id);

    await stopDaemonProcess(daemon);
    daemon = null;

    mutateFixtureState(env.paths);
    const restoreResponse = await runCliJson<{ restore: RestoreResult }>(env, [
      "backup",
      "restore",
      snapshotId,
      "--yes",
      "--with-config",
      "--with-policy",
      "--json",
    ]);
    assert.equal(restoreResponse.restore.restored_snapshot_id, snapshotId);
    assert.equal(restoreResponse.restore.restore_mode, "same_machine");
    assert.equal(restoreResponse.restore.cross_machine, false);
    assertFixtureRestored(env.paths, snapshotId, restoreResponse.restore);

    daemon = await startDaemonProcess(env, wrapperPaths(env).daemon, [], "post-restore daemon wrapper");
    await runHttpSmoke(env);
  } catch (error) {
    throw new Error(
      `Full verification failed.\n${error instanceof Error ? error.message : String(error)}\n${formatFailureContext(env, daemon)}`,
    );
  } finally {
    await stopDaemonProcess(daemon);
    if (process.platform === "darwin") {
      await stopLaunchAgentIfPresent(env);
    }
    cleanupEnvironment(env);
  }
}

export async function runConsoleVerification(): Promise<void> {
  const env = await createVerificationEnvironment("console");
  let daemon: DaemonHandle | null = null;
  try {
    await runBootstrap(env);
    assertBootstrapArtifacts(env);
    if (process.platform === "darwin") {
      await verifyLaunchAgentLoaded(env);
      await stopLaunchAgentIfPresent(env);
    }
    daemon = await startDaemonProcess(env, wrapperPaths(env).daemon, [], "console daemon wrapper");
    const requestJson = createHttpClient(env.config);
    await requestJson("POST", "/v1/tasks", {
      title: "Console verification task",
      kind: "human_reminder",
      priority: "high",
      owner: "operator",
      due_at: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(),
    });
    await requestJson("POST", "/v1/planning-recommendations/refresh", {});
    await createSnapshotViaHttp(env);

    const consoleCommand = await runCommand("console print url", wrapperPaths(env).cli, ["console", "--print-url"], {
      cwd: env.repoRoot,
      env: env.env,
    });
    const launchUrl = consoleCommand.stdout.trim();
    assert.match(launchUrl, /^http:\/\/127\.0\.0\.1:\d+\/console\/session\//);

    const browser = await chromium.launch();
    try {
      const snapshotContext = await browser.newContext();
      const snapshotPage = await snapshotContext.newPage();
      snapshotPage.on("dialog", async (dialog) => {
        await dialog.accept();
      });
      await snapshotPage.goto(launchUrl, { waitUntil: "commit" });
      await waitForSelectorLabeled(snapshotPage, "console shell title", "text=Local operator console");
      await waitForFunctionLabeled(
        snapshotPage,
        "console interactive shell",
        () => document.documentElement.dataset.consoleReady === "1",
      );
      await waitForSelectorLabeled(snapshotPage, "overview readiness card", "text=Top-level readiness");
      await waitForSelectorLabeled(snapshotPage, "overview next steps card", "text=What to do right now");
      await waitForSelectorLabeled(snapshotPage, "overview prep-day card", "text=Day-start workflow");
      await waitForSelectorLabeled(snapshotPage, "overview version card", "text=Version");
      await waitForFunctionLabeled(snapshotPage, "overview readiness body text", () => {
        const bodyText = document.body.textContent ?? "";
        return bodyText.includes("Local control plane looks healthy.") || bodyText.includes("Local control plane needs attention.");
      });
      await snapshotPage.getByRole("button", { name: "Open related detail", exact: true }).first().click();
      await waitForFunctionLabeled(snapshotPage, "worklist section title", () => document.querySelector("#section-title")?.textContent === "Worklist");
      await snapshotPage.locator(".nav").getByRole("button", { name: "Overview", exact: true }).click();
      await waitForFunctionLabeled(snapshotPage, "overview section title", () => document.querySelector("#section-title")?.textContent === "Overview");
      for (const sectionName of ["Worklist", "Approvals", "Drafts", "Planning", "Audit", "Backups", "Overview"]) {
        await snapshotPage.locator(".nav").getByRole("button", { name: sectionName, exact: true }).click();
        await waitForFunctionLabeled(
          snapshotPage,
          `section title ${sectionName}`,
          (expected) => document.querySelector("#section-title")?.textContent === expected,
          sectionName,
        );
      }
      await snapshotPage.locator(".nav").getByRole("button", { name: "Backups", exact: true }).click();
      await waitForFunctionLabeled(snapshotPage, "backups section title", () => document.querySelector("#section-title")?.textContent === "Backups");
      await waitForSelectorLabeled(snapshotPage, "backup year listing", `text=${new Date().getUTCFullYear()}`);
      await waitForSelectorLabeled(snapshotPage, "backup source machine detail", "text=Source machine");
      await snapshotPage.getByRole("button", { name: "Create snapshot" }).click();
      await waitForSelectorLabeled(snapshotPage, "backup created flash", "text=Created snapshot", { timeout: 60_000 });
      await snapshotContext.close();

      const planningConsoleCommand = await runCommand(
        "console print url planning",
        wrapperPaths(env).cli,
        ["console", "--print-url"],
        {
          cwd: env.repoRoot,
          env: env.env,
        },
      );
      const planningLaunchUrl = planningConsoleCommand.stdout.trim();
      assert.match(planningLaunchUrl, /^http:\/\/127\.0\.0\.1:\d+\/console\/session\//);

      const planningContext = await browser.newContext();
      const planningPage = await planningContext.newPage();
      planningPage.on("dialog", async (dialog) => {
        await dialog.accept();
      });
      await planningPage.goto(planningLaunchUrl, { waitUntil: "commit" });
      await waitForSelectorLabeled(planningPage, "planning console shell title", "text=Local operator console");
      await waitForFunctionLabeled(
        planningPage,
        "planning console interactive shell",
        () => document.documentElement.dataset.consoleReady === "1",
      );
      await planningPage.locator(".nav").getByRole("button", { name: "Planning", exact: true }).click();
      await waitForFunctionLabeled(planningPage, "planning section title", () => document.querySelector("#section-title")?.textContent === "Planning");
      await waitForFunctionLabeled(planningPage, "planning body text", () => {
        const bodyText = document.body.textContent ?? "";
        return bodyText.includes("Open recommendations") && !bodyText.includes("NaN");
      });
      await waitForSelectorLabeled(planningPage, "planning snooze note input", "#planning-snooze-note");
      await planningPage.evaluate(() => {
        const note = document.querySelector<HTMLTextAreaElement>("#planning-snooze-note");
        if (!note) {
          throw new Error("planning snooze note field is missing.");
        }
        note.value = "Console verification snooze";
        note.dispatchEvent(new Event("input", { bubbles: true }));
        note.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await planningPage.getByRole("button", { name: "Snooze recommendation", exact: true }).click();
      await waitForFunctionLabeled(
        planningPage,
        "planning snooze result",
        () => {
          const bodyText = document.body.textContent ?? "";
          return /Recommendation snoozed\.|Status\s+snoozed/.test(bodyText);
        },
        undefined,
        { timeout: 60_000 },
      );

      await planningPage.locator(".nav").getByRole("button", { name: "Approvals", exact: true }).click();
      await waitForFunctionLabeled(planningPage, "approvals section title", () => document.querySelector("#section-title")?.textContent === "Approvals");
      await waitForFunctionLabeled(planningPage, "approvals body text", () => {
        const bodyText = document.body.textContent ?? "";
        return (
          (bodyText.includes("This section is intentionally read-only.") && bodyText.includes("personal-ops approval approve")) ||
          bodyText.includes("Approvals, approval decisions, and send stay in the CLI.") ||
          bodyText.includes("Use grouped approve and send from Drafts when available.") ||
          bodyText.includes("Choose an approval to inspect it. Recovery actions stay here, while grouped approve/send now flows through outbound autopilot.")
        );
      });
      await planningContext.close();

      const lockedContext = await browser.newContext();
      const lockedPage = await lockedContext.newPage();
      await lockedPage.goto(`http://${env.config.serviceHost}:${env.config.servicePort}/console`, {
        waitUntil: "commit",
      });
      await waitForSelectorLabeled(lockedPage, "console locked notice", "text=Console locked");
      await waitForSelectorLabeled(lockedPage, "console lock CLI hint", "text=personal-ops console");
      await lockedContext.close();
    } finally {
      await browser.close();
    }
  } catch (error) {
    throw new Error(
      `Console verification failed.\n${error instanceof Error ? error.message : String(error)}\n${formatFailureContext(env, daemon)}`,
    );
  } finally {
    await stopDaemonProcess(daemon);
    if (process.platform === "darwin") {
      await stopLaunchAgentIfPresent(env);
    }
    cleanupEnvironment(env);
  }
}

export async function runRecoveryVerification(): Promise<void> {
  const env = await createVerificationEnvironment("recovery");
  let daemon: DaemonHandle | null = null;
  try {
    await runBootstrap(env);
    assertBootstrapArtifacts(env);
    if (process.platform === "darwin") {
      await verifyLaunchAgentLoaded(env);
      await stopLaunchAgentIfPresent(env);
    }

    seedFixtureState(env.paths);
    daemon = await startDaemonProcess(env, wrapperPaths(env).daemon, [], "recovery daemon wrapper");
    const snapshotResponse = await runCliJson<{ snapshot: SnapshotManifest }>(env, ["backup", "create", "--json"]);
    const snapshotId = snapshotResponse.snapshot.snapshot_id;
    assert.ok(snapshotId, "recovery verification should create a snapshot.");
    assert.ok(snapshotResponse.snapshot.source_machine?.machine_id, "snapshot should include machine provenance.");

    await stopDaemonProcess(daemon);
    daemon = null;

    mutateFixtureState(env.paths);
    const restoreResponse = await runCliJson<{ restore: RestoreResult }>(env, [
      "backup",
      "restore",
      snapshotId,
      "--yes",
      "--with-config",
      "--with-policy",
      "--json",
    ]);
    assert.equal(restoreResponse.restore.restored_snapshot_id, snapshotId);
    assert.equal(restoreResponse.restore.restore_mode, "same_machine");
    assert.equal(restoreResponse.restore.cross_machine, false);
    assert.equal(
      restoreResponse.restore.source_machine?.machine_id,
      snapshotResponse.snapshot.source_machine?.machine_id,
      "restore should preserve same-machine provenance.",
    );
    assert.ok(restoreResponse.restore.rescue_snapshot_id, "restore should create a rescue snapshot.");
    assertFixtureRestored(env.paths, snapshotId, restoreResponse.restore);

    const localDate = (daysAgo: number, hour: number): string => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(hour, 0, 0, 0);
      return date.toISOString();
    };
    const localWeekDate = (weeksAgo: number, dayOffset: number, hour: number): string => {
      const date = new Date();
      const currentDay = date.getDay();
      date.setDate(date.getDate() - currentDay - weeksAgo * 7 + dayOffset);
      date.setHours(hour, 0, 0, 0);
      return date.toISOString();
    };
    writeFixtureSnapshot(env.paths, {
      snapshotId: "2026-03-20T18-00-00Z",
      createdAt: localDate(2, 18),
    });
    writeFixtureSnapshot(env.paths, {
      snapshotId: "2026-03-20T09-00-00Z",
      createdAt: localDate(2, 8),
    });
    writeFixtureSnapshot(env.paths, {
      snapshotId: "2026-03-05T18-00-00Z",
      createdAt: localWeekDate(3, 2, 18),
    });
    writeFixtureSnapshot(env.paths, {
      snapshotId: "2026-03-03T09-00-00Z",
      createdAt: localWeekDate(3, 4, 8),
    });
    writeFixtureSnapshot(env.paths, {
      snapshotId: "2026-01-01T08-00-00Z",
      createdAt: localDate(70, 8),
    });

    const prunePreview = await runCliJson<{ prune: SnapshotPruneResult }>(env, ["backup", "prune", "--dry-run", "--json"]);
    assert.ok(prunePreview.prune.prune_candidates >= 3, "prune preview should find duplicate and expired snapshots.");
    assert.equal(prunePreview.prune.deleted_snapshot_ids.length, 0, "dry-run should not delete snapshots.");
    assert.equal(
      prunePreview.prune.prune_candidate_items.some((item) => item.snapshot_id === "2026-03-20T09-00-00Z"),
      true,
      "older same-day snapshot should be a prune candidate.",
    );
    assert.equal(
      prunePreview.prune.prune_candidate_items.some((item) => item.snapshot_id === "2026-03-05T18-00-00Z"),
      true,
      "older same-week snapshot should be a prune candidate.",
    );
    assert.equal(
      prunePreview.prune.prune_candidate_items.some((item) => item.snapshot_id === "2026-01-01T08-00-00Z"),
      true,
      "expired snapshot should be a prune candidate.",
    );
    assert.equal(
      prunePreview.prune.prune_candidate_items.some((item) => item.snapshot_id === restoreResponse.restore.rescue_snapshot_id),
      false,
      "the newest rescue snapshot should never be pruned.",
    );

    const pruneApply = await runCliJson<{ prune: SnapshotPruneResult }>(env, ["backup", "prune", "--yes", "--json"]);
    assert.equal(pruneApply.prune.snapshots_deleted, prunePreview.prune.prune_candidates);
    for (const snapshot of pruneApply.prune.deleted_snapshot_ids) {
      assert.equal(fs.existsSync(path.join(env.paths.snapshotsDir, snapshot)), false, `${snapshot} should be deleted by prune.`);
    }

    daemon = await startDaemonProcess(env, wrapperPaths(env).daemon, [], "post-recovery daemon wrapper");
    await runHttpSmoke(env);

    const stampPaths = ensureRuntimeFiles();
    writeRecoveryRehearsalStamp(stampPaths, {
      successful_at: new Date().toISOString(),
      app_version: JSON.parse(fs.readFileSync(path.join(env.appDir, "package.json"), "utf8")).version ?? "0.1.0",
      command_name: "npm run verify:recovery",
    });
    const recordedStamp = readRecoveryRehearsalStamp(stampPaths);
    assert.equal(recordedStamp.status, "configured");
    assert.equal(recordedStamp.stamp?.command_name, "npm run verify:recovery");
  } catch (error) {
    throw new Error(
      `Recovery verification failed.\n${error instanceof Error ? error.message : String(error)}\n${formatFailureContext(env, daemon)}`,
    );
  } finally {
    await stopDaemonProcess(daemon);
    if (process.platform === "darwin") {
      await stopLaunchAgentIfPresent(env);
    }
    cleanupEnvironment(env);
  }
}
