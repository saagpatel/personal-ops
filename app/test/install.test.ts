import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureRuntimeFiles, loadConfig, loadPolicy } from "../src/config.js";
import { PersonalOpsDb } from "../src/db.js";
import { formatDoctorReport, formatInstallManifest } from "../src/formatters.js";
import { buildInstallCheckReport, fixInstallPermissions, getInstallArtifactPaths, installAll, installWrapper, installWrappers, writeInstallManifest } from "../src/install.js";
import { getLaunchAgentLabel, renderLaunchAgentPlist } from "../src/launchagent.js";
import { Logger } from "../src/logger.js";
import { ensureMachineIdentity, readRestoreProvenance, writeRestoreProvenance } from "../src/machine.js";
import { restoreSnapshot } from "../src/restore.js";
import { createSnapshotId } from "../src/snapshots.js";
import { PersonalOpsService } from "../src/service.js";
import type {
  AiActivitySummary,
  BridgeActivitySearchEntry,
  BridgeProjectSummaryEntry,
  BridgeContextSection,
  BridgeDbClientLike,
} from "../src/bridge-db.js";
import type { ClientIdentity, MachineDescriptor, Paths } from "../src/types.js";

const cliIdentity: ClientIdentity = {
  client_id: "operator-cli",
  requested_by: "operator",
  auth_role: "operator",
};

class NoopBridgeDbClient implements BridgeDbClientLike {
  async close(): Promise<void> {}

  async getActivitySummary(): Promise<AiActivitySummary> {
    return {
      current_month: new Date().toISOString().slice(0, 7),
      monthly_costs: [],
      recent_activity: [],
      open_handoffs: [],
      briefing_line: "bridge-db disabled for tests",
    };
  }

  async searchActivity(): Promise<BridgeActivitySearchEntry[]> {
    return [];
  }

  async getProjectSummary(): Promise<BridgeProjectSummaryEntry[]> {
    return [];
  }

  async getContextSections(): Promise<BridgeContextSection[]> {
    return [];
  }

  logActivity(
    _projectName: string,
    _summary: string,
    _tags: string[],
    _branch: string | null = null,
  ): void { void _branch; }

  recordCost(_system: string, _month: string, _amount: number): void {}

  saveSnapshot(_data: Record<string, unknown>): void {}
}

function createLaunchctlStub(initiallyLoaded = false) {
  let loaded = initiallyLoaded;
  const calls: string[][] = [];
  return {
    calls,
    execFileSyncImpl(_file: string, args: readonly string[]) {
      const normalized = args.map((value) => String(value));
      calls.push(normalized);
      if (normalized[0] === "print") {
        if (!loaded) {
          throw new Error("not loaded");
        }
        return `${normalized[1]} = {\n\tstate = running\n}`;
      }
      if (normalized[0] === "bootout") {
        loaded = false;
        return "";
      }
      if (normalized[0] === "bootstrap" || normalized[0] === "kickstart") {
        loaded = true;
        return "";
      }
      throw new Error(`Unexpected launchctl args: ${normalized.join(" ")}`);
    },
  };
}

function createFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-install-"));
  const home = path.join(base, "home");
  fs.mkdirSync(home, { recursive: true });

  const previousEnv = {
    HOME: process.env.HOME,
    PERSONAL_OPS_CONFIG_DIR: process.env.PERSONAL_OPS_CONFIG_DIR,
    PERSONAL_OPS_STATE_DIR: process.env.PERSONAL_OPS_STATE_DIR,
    PERSONAL_OPS_LOG_DIR: process.env.PERSONAL_OPS_LOG_DIR,
    PERSONAL_OPS_APP_DIR: process.env.PERSONAL_OPS_APP_DIR,
  };

  process.env.HOME = home;
  process.env.PERSONAL_OPS_CONFIG_DIR = path.join(home, ".config", "personal-ops");
  process.env.PERSONAL_OPS_STATE_DIR = path.join(home, "Library", "Application Support", "personal-ops");
  process.env.PERSONAL_OPS_LOG_DIR = path.join(home, "Library", "Logs", "personal-ops");
  process.env.PERSONAL_OPS_APP_DIR = path.join(home, ".local", "share", "personal-ops", "app");

  const restoreEnv = () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  const paths = ensureRuntimeFiles();
  fs.mkdirSync(paths.appDir, { recursive: true });
  fs.writeFileSync(path.join(paths.appDir, "package.json"), JSON.stringify({ version: "0.1.0" }), "utf8");
  createDistEntrypoints(paths);

  return { base, home, paths, restoreEnv };
}

function createDistEntrypoints(paths: Paths) {
  const distDir = path.join(paths.appDir, "dist", "src");
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "cli.js"), "process.exitCode = 0;\n", "utf8");
  fs.writeFileSync(path.join(distDir, "daemon.js"), "process.exitCode = 0;\n", "utf8");
  fs.writeFileSync(path.join(distDir, "mcp-server.js"), "process.exitCode = 0;\n", "utf8");
}

function setConfiguredMailbox(paths: Paths, email: string) {
  const raw = fs.readFileSync(paths.configFile, "utf8");
  fs.writeFileSync(paths.configFile, raw.replace('account_email = ""', `account_email = "${email}"`), "utf8");
}

function setConfiguredOauth(paths: Paths) {
  fs.writeFileSync(
    paths.oauthClientFile,
    JSON.stringify({
      installed: {
        client_id: "client-id",
        client_secret: "client-secret",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        redirect_uris: ["http://127.0.0.1"],
      },
    }),
    "utf8",
  );
}

async function createSnapshot(
  paths: Paths,
  snapshotId: string,
  draftSubject: string,
  configText: string,
  policyText: string,
  sourceMachine?: MachineDescriptor,
) {
  const snapshotDir = path.join(paths.snapshotsDir, snapshotId);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const snapshotDbPath = path.join(snapshotDir, "personal-ops.db");
  const seededSnapshotDbPath = path.join(snapshotDir, "seeded-personal-ops.db");
  const snapshotDb = new PersonalOpsDb(seededSnapshotDbPath);
  snapshotDb.createDraftArtifact(cliIdentity, "machine@example.com", `provider-${snapshotId}`, {
    to: ["machine@example.com"],
    cc: [],
    bcc: [],
    subject: draftSubject,
    body_text: "snapshot",
  });
  await snapshotDb.createBackup(snapshotDbPath);
  const configCopy = path.join(snapshotDir, "config.toml");
  const policyCopy = path.join(snapshotDir, "policy.toml");
  const logCopy = path.join(snapshotDir, "app.jsonl");
  fs.writeFileSync(configCopy, configText, "utf8");
  fs.writeFileSync(policyCopy, policyText, "utf8");
  fs.writeFileSync(logCopy, "", "utf8");
  fs.writeFileSync(
    path.join(snapshotDir, "manifest.json"),
    JSON.stringify(
      {
        snapshot_id: snapshotId,
        created_at: new Date().toISOString(),
        service_version: "0.1.0",
        schema_version: 14,
        backup_intent: "recovery",
        source_machine: sourceMachine,
        mailbox: "machine@example.com",
        db_backup_path: snapshotDbPath,
        config_paths: [configCopy, policyCopy],
        log_paths: [logCopy],
        daemon_state: "ready",
        notes: [],
      },
      null,
      2,
    ),
    "utf8",
  );
}

test("install all creates runtime files, generated artifacts, and a healthy install report", async () => {
  const fixture = createFixture();
  const launchctl = createLaunchctlStub();
  const waitCalls: Array<{ host: string; port: number; timeoutMs: number }> = [];
  try {
    setConfiguredMailbox(fixture.paths, "machine@example.com");
    setConfiguredOauth(fixture.paths);

    const manifest = await installAll(fixture.paths, process.execPath, {
      launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
      waitForDaemonReadyImpl: async (host, port, timeoutMs) => {
        waitCalls.push({ host, port, timeoutMs });
      },
    });
    const report = buildInstallCheckReport(fixture.paths, {
      launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
    });
    const artifacts = getInstallArtifactPaths(fixture.paths);
    const machineIdentity = ensureMachineIdentity(fixture.paths);

    assert.equal(manifest.node_executable, process.execPath);
    assert.equal(manifest.machine_id, machineIdentity.machine_id);
    assert.equal(manifest.machine_label, machineIdentity.machine_label);
    assert.equal(fs.existsSync(artifacts.cliWrapperPath), true);
    assert.equal(fs.existsSync(artifacts.daemonWrapperPath), true);
    assert.equal(fs.existsSync(artifacts.codexMcpWrapperPath), true);
    assert.equal(fs.existsSync(artifacts.claudeMcpWrapperPath), true);
    assert.equal(fs.existsSync(artifacts.launchAgentPlistPath), true);
    assert.deepEqual(waitCalls, [{ host: "127.0.0.1", port: 46210, timeoutMs: 15000 }]);
    assert.equal(report.state, "ready");
    assert.equal(report.checks.some((check) => check.id === "launch_agent_loaded" && check.severity === "pass"), true);
  } finally {
    fixture.restoreEnv();
  }
});

test("machine identity stays stable across rerun install", async () => {
  const fixture = createFixture();
  const launchctl = createLaunchctlStub();
  try {
    const first = await installAll(fixture.paths, "/custom/node", {
      launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
      waitForDaemonReadyImpl: async () => {},
    });
    const second = await installAll(fixture.paths, "/custom/node", {
      launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
      waitForDaemonReadyImpl: async () => {},
    });

    assert.equal(first.machine_id, second.machine_id);
    assert.equal(first.machine_label, second.machine_label);
  } finally {
    fixture.restoreEnv();
  }
});

test("install all surfaces daemon readiness failures clearly", async () => {
  const fixture = createFixture();
  const launchctl = createLaunchctlStub();
  try {
    await assert.rejects(
      installAll(fixture.paths, "/custom/node", {
        launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
        waitForDaemonReadyImpl: async () => {
          throw new Error("daemon did not become reachable");
        },
      }),
      /daemon did not become reachable/,
    );
  } finally {
    fixture.restoreEnv();
  }
});

test("wrapper generation writes the expected targets and assistant env vars", () => {
  const fixture = createFixture();
  try {
    installWrapper(fixture.paths, "cli", undefined, "/node/custom");
    installWrapper(fixture.paths, "daemon", undefined, "/node/custom");
    installWrapper(fixture.paths, "mcp", "codex", "/node/custom");
    installWrapper(fixture.paths, "mcp", "claude", "/node/custom");

    const artifacts = getInstallArtifactPaths(fixture.paths);
    const cliWrapper = fs.readFileSync(artifacts.cliWrapperPath, "utf8");
    const daemonWrapper = fs.readFileSync(artifacts.daemonWrapperPath, "utf8");
    const codexWrapper = fs.readFileSync(artifacts.codexMcpWrapperPath, "utf8");
    const claudeWrapper = fs.readFileSync(artifacts.claudeMcpWrapperPath, "utf8");

    assert.match(cliWrapper, /^#!\/bin\/sh\nset -eu\n/);
    assert.match(daemonWrapper, /^#!\/bin\/sh\nset -eu\n/);
    assert.match(codexWrapper, /^#!\/bin\/sh\nset -eu\n/);
    assert.match(claudeWrapper, /^#!\/bin\/sh\nset -eu\n/);
    assert.match(cliWrapper, /exec "\/node\/custom" ".*dist\/src\/cli\.js" "\$@"/);
    assert.match(daemonWrapper, /exec "\/node\/custom" ".*dist\/src\/daemon\.js" "\$@"/);
    assert.match(codexWrapper, /PERSONAL_OPS_CLIENT_ID="\$\{PERSONAL_OPS_CLIENT_ID:-codex-mcp\}"/);
    assert.match(codexWrapper, /PERSONAL_OPS_REQUESTED_BY="\$\{PERSONAL_OPS_REQUESTED_BY:-codex\}"/);
    assert.match(claudeWrapper, /PERSONAL_OPS_CLIENT_ID="\$\{PERSONAL_OPS_CLIENT_ID:-claude-mcp\}"/);
    assert.match(claudeWrapper, /PERSONAL_OPS_REQUESTED_BY="\$\{PERSONAL_OPS_REQUESTED_BY:-claude\}"/);
  } finally {
    fixture.restoreEnv();
  }
});

test("install wrappers refreshes wrapper provenance without touching desktop state", () => {
  const fixture = createFixture();
  try {
    const artifacts = getInstallArtifactPaths(fixture.paths);
    fs.mkdirSync(path.dirname(artifacts.launchAgentPlistPath), { recursive: true });
    fs.writeFileSync(artifacts.launchAgentPlistPath, "launch-agent-placeholder", "utf8");
    writeInstallManifest(fixture.paths, {
      generated_at: "2026-04-07T00:00:00.000Z",
      node_executable: "/old/node",
      app_dir: fixture.paths.appDir,
      machine_id: "machine-1",
      machine_label: "Test Mac",
      launch_agent_label: "com.d.personal-ops",
      launch_agent_plist_path: artifacts.launchAgentPlistPath,
      assistant_wrappers: ["codex", "claude"],
      wrapper_paths: {
        cli: artifacts.cliWrapperPath,
        daemon: artifacts.daemonWrapperPath,
        codex_mcp: artifacts.codexMcpWrapperPath,
        claude_mcp: artifacts.claudeMcpWrapperPath,
      },
      desktop: {
        support_contract: "macos_only",
        supported: true,
        installed: false,
        bundle_exists: false,
        app_path: "/tmp/Personal Ops.app",
        build_bundle_path: "/tmp/build/Personal Ops.app",
        project_path: "/tmp/desktop",
        build_provenance: {
          built_at: null,
          source_commit: null,
          vite_version: null,
          tauri_cli_version: null,
          tauri_runtime_version: null,
        },
        reinstall_recommended: false,
        reinstall_reason: null,
        launcher_repair_recommended: false,
        launcher_repair_reason: null,
        toolchain: {
          support_contract: "macos_only",
          platform_supported: true,
          npm_available: true,
          cargo_available: true,
          rustc_available: true,
          xcode_select_available: true,
          unsupported_reason: null,
          dependency_posture: {
            status: "supported_path_clear",
            summary: "ok",
            unsupported_platform_notes: [],
          },
          ready: true,
          summary: "macOS desktop toolchain is ready.",
        },
        daemon_session_handoff_ready: false,
        launch_url: null,
      },
    });

    const manifest = installWrappers(fixture.paths, "/custom/node");

    assert.equal(manifest.wrapper_provenance?.node_executable, "/custom/node");
    assert.equal(manifest.wrapper_provenance?.cli_target.endsWith("/dist/src/cli.js"), true);
    assert.equal(manifest.desktop?.support_contract, "macos_only");
    assert.equal(fs.readFileSync(artifacts.launchAgentPlistPath, "utf8"), "launch-agent-placeholder");
  } finally {
    fixture.restoreEnv();
  }
});

test("phase 16 direct wrapper repair records a repair execution outcome", () => {
  const fixture = createFixture();
  try {
    setConfiguredMailbox(fixture.paths, "machine@example.com");
    setConfiguredOauth(fixture.paths);
    const db = new PersonalOpsDb(fixture.paths.databaseFile);
    db.close();
    installWrappers(fixture.paths, "/missing/node");
    const verificationDb = new PersonalOpsDb(fixture.paths.databaseFile);
    const recorded = verificationDb.listRepairExecutions({ limit: 1 })[0];
    verificationDb.close();

    assert.equal(recorded?.step_id, "install_wrappers");
    assert.equal(recorded?.trigger_source, "direct_command");
    assert.equal(recorded?.outcome, "still_pending");
  } finally {
    fixture.restoreEnv();
  }
});

test("phase 17 install check summarizes preventive maintenance from recurring safe repairs", () => {
  const fixture = createFixture();
  try {
    setConfiguredMailbox(fixture.paths, "machine@example.com");
    setConfiguredOauth(fixture.paths);
    installWrappers(fixture.paths, process.execPath, { trackRepairExecution: false });
    const db = new PersonalOpsDb(fixture.paths.databaseFile);
    db.createRepairExecution({
      step_id: "install_wrappers",
      started_at: "2026-04-01T18:00:00.000Z",
      completed_at: "2026-04-01T18:05:00.000Z",
      requested_by_client: "personal-ops-cli",
      requested_by_actor: "operator",
      trigger_source: "repair_run",
      before_first_step_id: "install_wrappers",
      after_first_step_id: "install_check",
      outcome: "resolved",
      resolved_target_step: true,
      message: "Step resolved.",
    });
    db.createRepairExecution({
      step_id: "install_wrappers",
      started_at: "2026-04-03T18:00:00.000Z",
      completed_at: "2026-04-03T18:05:00.000Z",
      requested_by_client: "personal-ops-cli",
      requested_by_actor: "operator",
      trigger_source: "repair_run",
      before_first_step_id: "install_wrappers",
      after_first_step_id: "install_check",
      outcome: "resolved",
      resolved_target_step: true,
      message: "Step resolved.",
    });
    db.close();

    const report = buildInstallCheckReport(fixture.paths);

    assert.equal(report.repair_plan_summary.preventive_maintenance_count, 1);
    assert.equal(report.repair_plan_summary.top_preventive_step_id, "install_wrappers");
  } finally {
    fixture.restoreEnv();
  }
});

test("install manifest formatter tolerates legacy desktop metadata while wrappers are refreshed", () => {
  const formatted = formatInstallManifest({
    generated_at: "2026-04-07T00:00:00.000Z",
    node_executable: process.execPath,
    app_dir: "/tmp/app",
    machine_id: "machine-1",
    machine_label: "Test Mac",
    launch_agent_label: "com.d.personal-ops",
    launch_agent_plist_path: "/tmp/com.d.personal-ops.plist",
    assistant_wrappers: ["codex", "claude"],
    wrapper_paths: {
      cli: "/tmp/personal-ops",
      daemon: "/tmp/personal-opsd",
      codex_mcp: "/tmp/codex-mcp",
      claude_mcp: "/tmp/claude-mcp",
    },
    wrapper_provenance: {
      generated_at: "2026-04-07T00:00:00.000Z",
      source_commit: "current-commit-1234",
      node_executable: process.execPath,
      cli_target: "/tmp/cli.js",
      daemon_target: "/tmp/daemon.js",
      codex_mcp_target: "/tmp/mcp.js",
      claude_mcp_target: "/tmp/mcp.js",
    },
    desktop: {
      support_contract: "macos_only",
      supported: true,
      installed: true,
      bundle_exists: true,
      app_path: "/tmp/Personal Ops.app",
      build_bundle_path: "/tmp/build/Personal Ops.app",
      project_path: "/tmp/desktop",
      build_provenance: undefined as any,
      reinstall_recommended: false,
      reinstall_reason: null,
      launcher_repair_recommended: false,
      launcher_repair_reason: null,
      toolchain: {
        summary: "legacy",
      } as any,
      daemon_session_handoff_ready: false,
      launch_url: null,
    },
  });

  assert.match(formatted, /Desktop built: not recorded/);
  assert.match(formatted, /Desktop dependencies: not recorded/);
});

test("install check reports placeholder oauth, missing LaunchAgent, and stale wrappers", () => {
  const fixture = createFixture();
  try {
    installWrapper(fixture.paths, "cli", undefined, "/node/custom");
    const artifacts = getInstallArtifactPaths(fixture.paths);
    fs.rmSync(artifacts.distCliPath);

    const report = buildInstallCheckReport(fixture.paths);
    assert.equal(report.state, "degraded");
    assert.equal(report.checks.some((check) => check.id === "oauth_client_configured" && check.severity === "warn"), true);
    assert.equal(report.checks.some((check) => check.id === "oauth_client_file_valid" && check.severity === "warn"), true);
    assert.equal(report.checks.some((check) => check.id === "launch_agent_exists" && check.severity === "fail"), true);
    assert.equal(report.checks.some((check) => check.id === "cli_wrapper_target_valid" && check.severity === "fail"), true);
  } finally {
    fixture.restoreEnv();
  }
});

test("install check distinguishes missing wrapper Node executables and stale wrapper provenance", () => {
  const fixture = createFixture();
  try {
    installWrappers(fixture.paths, "/missing/node");
    const manifest = JSON.parse(fs.readFileSync(fixture.paths.installManifestFile, "utf8")) as Record<string, any>;
    manifest.wrapper_provenance.source_commit = "old-commit-9999";
    fs.writeFileSync(fixture.paths.installManifestFile, JSON.stringify(manifest, null, 2), "utf8");

    const previousCommit = process.env.PERSONAL_OPS_SOURCE_COMMIT;
    process.env.PERSONAL_OPS_SOURCE_COMMIT = "current-commit-1234";
    try {
      const report = buildInstallCheckReport(fixture.paths);
      assert.equal(report.checks.some((check) => check.id === "cli_wrapper_node_executable" && check.severity === "fail"), true);
      assert.equal(report.checks.some((check) => check.id === "cli_wrapper_current" && check.severity === "warn"), true);
      assert.equal(report.checks.some((check) => check.id === "cli_wrapper_provenance_present" && check.severity === "pass"), true);
    } finally {
      if (previousCommit === undefined) {
        delete process.env.PERSONAL_OPS_SOURCE_COMMIT;
      } else {
        process.env.PERSONAL_OPS_SOURCE_COMMIT = previousCommit;
      }
    }
  } finally {
    fixture.restoreEnv();
  }
});

test("Phase 6 install check reports blank keychain service, empty tokens, and broad secret-file permissions", () => {
  const fixture = createFixture();
  try {
    const rawConfig = fs.readFileSync(fixture.paths.configFile, "utf8");
    fs.writeFileSync(fixture.paths.configFile, rawConfig.replace('keychain_service = "personal-ops.gmail"', 'keychain_service = ""'), "utf8");
    fs.writeFileSync(fixture.paths.apiTokenFile, "", { encoding: "utf8", mode: 0o644 });
    fs.writeFileSync(fixture.paths.assistantApiTokenFile, "assistant-token", { encoding: "utf8", mode: 0o644 });
    fs.chmodSync(fixture.paths.apiTokenFile, 0o644);
    fs.chmodSync(fixture.paths.assistantApiTokenFile, 0o644);

    const report = buildInstallCheckReport(fixture.paths);

    assert.equal(report.checks.some((check) => check.id === "keychain_service_configured" && check.severity === "warn"), true);
    assert.equal(report.checks.some((check) => check.id === "local_api_token_nonempty" && check.severity === "fail"), true);
    assert.equal(report.checks.some((check) => check.id === "local_api_token_permissions_secure" && check.severity === "warn"), true);
    assert.equal(report.checks.some((check) => check.id === "assistant_api_token_permissions_secure" && check.severity === "warn"), true);
  } finally {
    fixture.restoreEnv();
  }
});

test("install fix-permissions tightens known secret files and leaves missing files alone", () => {
  const fixture = createFixture();
  try {
    fs.writeFileSync(fixture.paths.configFile, fs.readFileSync(fixture.paths.configFile, "utf8"), { encoding: "utf8", mode: 0o644 });
    fs.writeFileSync(fixture.paths.policyFile, fs.readFileSync(fixture.paths.policyFile, "utf8"), { encoding: "utf8", mode: 0o644 });
    fs.writeFileSync(fixture.paths.oauthClientFile, fs.readFileSync(fixture.paths.oauthClientFile, "utf8"), { encoding: "utf8", mode: 0o644 });
    fs.writeFileSync(fixture.paths.apiTokenFile, "local-token", { encoding: "utf8", mode: 0o644 });
    fs.writeFileSync(fixture.paths.assistantApiTokenFile, "assistant-token", { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(fixture.paths.configFile, 0o644);
    fs.chmodSync(fixture.paths.policyFile, 0o644);
    fs.chmodSync(fixture.paths.oauthClientFile, 0o644);
    fs.chmodSync(fixture.paths.apiTokenFile, 0o644);
    fs.chmodSync(fixture.paths.assistantApiTokenFile, 0o600);

    const result = fixInstallPermissions(fixture.paths);

    assert.equal(result.summary.updated, 4);
    assert.equal(result.summary.already_secure, 1);
    assert.equal(result.summary.failed, 0);
    assert.equal(fs.statSync(fixture.paths.configFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(fixture.paths.policyFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(fixture.paths.oauthClientFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(fixture.paths.apiTokenFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(fixture.paths.assistantApiTokenFile).mode & 0o777, 0o600);
  } finally {
    fixture.restoreEnv();
  }
});

test("install check permission warnings recommend fix-permissions", () => {
  const fixture = createFixture();
  try {
    fs.writeFileSync(fixture.paths.oauthClientFile, fs.readFileSync(fixture.paths.oauthClientFile, "utf8"), { encoding: "utf8", mode: 0o644 });
    fs.chmodSync(fixture.paths.oauthClientFile, 0o644);

    const report = buildInstallCheckReport(fixture.paths);
    const warning = report.checks.find((check) => check.id === "oauth_client_permissions_secure");

    assert.ok(warning);
    assert.equal(warning?.severity, "warn");
    assert.match(String(warning?.message), /install fix-permissions/);
  } finally {
    fixture.restoreEnv();
  }
});

test("Phase 7 install check surfaces missing machine identity and cross-machine provenance warnings", () => {
  const fixture = createFixture();
  try {
    writeRestoreProvenance(fixture.paths, {
      restored_at: "2026-03-29T08:00:00.000Z",
      restored_snapshot_id: "snapshot-cross-machine",
      local_machine_id: "local-machine",
      local_machine_label: "local-machine",
      source_machine_id: "remote-machine",
      source_machine_label: "remote-machine",
      source_hostname: "remote-host",
      cross_machine: true,
      snapshot_created_at: "2026-03-29T07:59:00.000Z",
    });

    const report = buildInstallCheckReport(fixture.paths);

    assert.equal(report.checks.some((check) => check.id === "machine_identity_exists" && check.severity === "warn"), true);
    assert.equal(report.checks.some((check) => check.id === "machine_identity_valid" && check.severity === "warn"), true);
    assert.equal(report.checks.some((check) => check.id === "state_origin_safe" && check.severity === "warn"), true);
  } finally {
    fixture.restoreEnv();
  }
});

test("restore requires explicit confirmation", async () => {
  const fixture = createFixture();
  try {
    await createSnapshot(
      fixture.paths,
      "snapshot-one",
      "Restored draft",
      "[service]\nhost = \"127.0.0.1\"\n",
      "[security]\nallow_send = false\n",
    );
    await assert.rejects(
      restoreSnapshot(
        fixture.paths,
        "snapshot-one",
        { confirm: false, withConfig: false, withPolicy: false },
        { launchAgentDependencies: { execFileSyncImpl: createLaunchctlStub().execFileSyncImpl } },
      ),
      /--yes/,
    );
  } finally {
    fixture.restoreEnv();
  }
});

test("restore creates a rescue snapshot and restores db and config selectively", async () => {
  const fixture = createFixture();
  const launchctl = createLaunchctlStub(true);
  try {
    const machineIdentity = ensureMachineIdentity(fixture.paths);
    const seededLiveDbPath = path.join(fixture.base, "seeded-live.db");
    const liveDb = new PersonalOpsDb(seededLiveDbPath);
    liveDb.createDraftArtifact(cliIdentity, "machine@example.com", "provider-live", {
      to: ["live@example.com"],
      cc: [],
      bcc: [],
      subject: "Live draft",
      body_text: "live",
    });
    await liveDb.createBackup(fixture.paths.databaseFile);
    fs.writeFileSync(fixture.paths.configFile, "[gmail]\naccount_email = \"live@example.com\"\n", "utf8");
    fs.writeFileSync(fixture.paths.policyFile, "[security]\nallow_send = false\n", "utf8");
    fs.writeFileSync(fixture.paths.apiTokenFile, "local-token", "utf8");
    fs.writeFileSync(fixture.paths.assistantApiTokenFile, "assistant-token", "utf8");

    await createSnapshot(
      fixture.paths,
      "snapshot-restore",
      "Snapshot draft",
      "[gmail]\naccount_email = \"restored@example.com\"\n",
      "[security]\nallow_send = true\n",
      {
        machine_id: machineIdentity.machine_id,
        machine_label: machineIdentity.machine_label,
        hostname: machineIdentity.hostname,
      },
    );
    fs.writeFileSync(`${fixture.paths.databaseFile}-wal`, "stale wal", "utf8");
    fs.writeFileSync(`${fixture.paths.databaseFile}-shm`, "stale shm", "utf8");

    const result = await restoreSnapshot(
      fixture.paths,
      "snapshot-restore",
      { confirm: true, withConfig: true, withPolicy: false },
      { launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl } },
    );

    assert.equal(fs.existsSync(`${fixture.paths.databaseFile}-wal`), false);
    assert.equal(fs.existsSync(`${fixture.paths.databaseFile}-shm`), false);
    const restoredDb = new PersonalOpsDb(fixture.paths.databaseFile);
    assert.equal(restoredDb.listDraftArtifacts().some((draft) => draft.subject === "Snapshot draft"), true);
    assert.equal(fs.readFileSync(fixture.paths.configFile, "utf8").includes("restored@example.com"), true);
    assert.equal(fs.readFileSync(fixture.paths.policyFile, "utf8").includes("allow_send = false"), true);
    assert.equal(fs.readFileSync(fixture.paths.apiTokenFile, "utf8"), "local-token");
    assert.equal(fs.readFileSync(fixture.paths.assistantApiTokenFile, "utf8"), "assistant-token");
    assert.equal(fs.existsSync(path.join(fixture.paths.snapshotsDir, result.rescue_snapshot_id, "manifest.json")), true);
    assert.equal(result.launch_agent_was_running, true);
    assert.equal(result.launch_agent_restarted, true);
    assert.equal(result.restore_mode, "same_machine");
    assert.equal(result.cross_machine, false);
    assert.equal(result.provenance_warning, null);
    const provenance = readRestoreProvenance(fixture.paths);
    assert.equal(provenance.provenance?.cross_machine, false);
  } finally {
    fixture.restoreEnv();
  }
});

test("cross-machine restore requires explicit confirmation", async () => {
  const fixture = createFixture();
  try {
    await createSnapshot(
      fixture.paths,
      "snapshot-cross-machine",
      "Snapshot draft",
      "[gmail]\naccount_email = \"remote@example.com\"\n",
      "[security]\nallow_send = false\n",
      {
        machine_id: "remote-machine",
        machine_label: "remote-machine",
        hostname: "remote-host",
      },
    );

    await assert.rejects(
      restoreSnapshot(
        fixture.paths,
        "snapshot-cross-machine",
        { confirm: true, withConfig: false, withPolicy: false, allowCrossMachine: false },
        { launchAgentDependencies: { execFileSyncImpl: createLaunchctlStub().execFileSyncImpl } },
      ),
      /--allow-cross-machine/,
    );
  } finally {
    fixture.restoreEnv();
  }
});

test("cross-machine restore succeeds with explicit confirmation and records provenance", async () => {
  const fixture = createFixture();
  try {
    const localMachine = ensureMachineIdentity(fixture.paths);
    await createSnapshot(
      fixture.paths,
      "snapshot-cross-machine-ok",
      "Remote snapshot draft",
      "[gmail]\naccount_email = \"remote@example.com\"\n",
      "[security]\nallow_send = false\n",
      {
        machine_id: "remote-machine",
        machine_label: "remote-machine",
        hostname: "remote-host",
      },
    );

    const result = await restoreSnapshot(
      fixture.paths,
      "snapshot-cross-machine-ok",
      { confirm: true, withConfig: false, withPolicy: false, allowCrossMachine: true },
      { launchAgentDependencies: { execFileSyncImpl: createLaunchctlStub().execFileSyncImpl } },
    );

    assert.equal(result.restore_mode, "cross_machine");
    assert.equal(result.cross_machine, true);
    assert.equal(result.local_machine.machine_id, localMachine.machine_id);
    assert.match(result.provenance_warning ?? "", /does not merge state/i);
    const provenance = readRestoreProvenance(fixture.paths);
    assert.equal(provenance.provenance?.cross_machine, true);
    assert.equal(provenance.provenance?.source_machine_id, "remote-machine");
  } finally {
    fixture.restoreEnv();
  }
});

test("legacy snapshots still restore and record unknown provenance", async () => {
  const fixture = createFixture();
  try {
    await createSnapshot(
      fixture.paths,
      "snapshot-legacy",
      "Legacy snapshot draft",
      "[gmail]\naccount_email = \"legacy@example.com\"\n",
      "[security]\nallow_send = false\n",
    );

    const result = await restoreSnapshot(
      fixture.paths,
      "snapshot-legacy",
      { confirm: true, withConfig: false, withPolicy: false },
      { launchAgentDependencies: { execFileSyncImpl: createLaunchctlStub().execFileSyncImpl } },
    );

    assert.equal(result.restore_mode, "legacy_unknown");
    assert.equal(result.cross_machine, false);
    assert.match(result.provenance_warning ?? "", /predates Phase 7/i);
    const provenance = readRestoreProvenance(fixture.paths);
    assert.equal(provenance.provenance?.source_machine_id, null);
  } finally {
    fixture.restoreEnv();
  }
});

test("snapshot ids remain unique when two snapshots are created in the same second", () => {
  const fixture = createFixture();
  try {
    const now = new Date("2026-03-29T07:30:00.000Z");
    const firstId = createSnapshotId(fixture.paths.snapshotsDir, now);
    fs.mkdirSync(path.join(fixture.paths.snapshotsDir, firstId), { recursive: true });

    const secondId = createSnapshotId(fixture.paths.snapshotsDir, now);

    assert.equal(firstId, "2026-03-29T07-30-00Z");
    assert.equal(secondId, "2026-03-29T07-30-00Z-1");
  } finally {
    fixture.restoreEnv();
  }
});

test("service doctor recognizes wrapper-based installs and both assistant wrappers", async () => {
  const fixture = createFixture();
  try {
    setConfiguredMailbox(fixture.paths, "machine@example.com");
    setConfiguredOauth(fixture.paths);
    installWrapper(fixture.paths, "daemon", undefined, "/node/custom");
    installWrapper(fixture.paths, "mcp", "codex", "/node/custom");
    installWrapper(fixture.paths, "mcp", "claude", "/node/custom");

    const artifacts = getInstallArtifactPaths(fixture.paths);
    fs.mkdirSync(path.dirname(artifacts.launchAgentPlistPath), { recursive: true });
    fs.writeFileSync(
      artifacts.launchAgentPlistPath,
      renderLaunchAgentPlist({
        label: "com.d.personal-ops",
        programPath: artifacts.daemonWrapperPath,
        workingDirectory: fixture.paths.appDir,
        stdoutPath: path.join(fixture.paths.logDir, "stdout.log"),
        stderrPath: path.join(fixture.paths.logDir, "stderr.log"),
      }),
      "utf8",
    );

    const config = loadConfig(fixture.paths);
    const policy = loadPolicy(fixture.paths);
    const logger = new Logger(fixture.paths);
    const service = new PersonalOpsService(fixture.paths, config, policy, logger, {
      createBridgeDbClient: () => new NoopBridgeDbClient(),
      inspectLaunchAgent: () => ({
        exists: true,
        loaded: true,
        running: true,
        label: "com.d.personal-ops",
        plistPath: artifacts.launchAgentPlistPath,
        programPath: artifacts.daemonWrapperPath,
        workingDirectory: fixture.paths.appDir,
        stdoutPath: path.join(fixture.paths.logDir, "stdout.log"),
        stderrPath: path.join(fixture.paths.logDir, "stderr.log"),
      }),
    });

    const doctor = await service.runDoctor({ deep: false, httpReachable: true });
    assert.equal(doctor.checks.some((check) => check.id === "launch_agent_target_valid" && check.severity === "pass"), true);
    assert.equal(doctor.checks.some((check) => check.id === "codex_mcp_launcher_exists" && check.severity === "pass"), true);
    assert.equal(doctor.checks.some((check) => check.id === "claude_mcp_launcher_exists" && check.severity === "pass"), true);
  } finally {
    fixture.restoreEnv();
  }
});

test("doctor formatter prefers install wrappers when wrapper drift is the main repair", async () => {
  const fixture = createFixture();
  try {
    setConfiguredMailbox(fixture.paths, "machine@example.com");
    setConfiguredOauth(fixture.paths);
    installWrappers(fixture.paths, "/missing/node");

    const config = loadConfig(fixture.paths);
    const policy = loadPolicy(fixture.paths);
    const logger = new Logger(fixture.paths);
    const service = new PersonalOpsService(fixture.paths, config, policy, logger, {
      createBridgeDbClient: () => new NoopBridgeDbClient(),
      inspectLaunchAgent: () => ({
        exists: false,
        loaded: false,
        running: false,
        label: "com.d.personal-ops",
        plistPath: "/tmp/missing.plist",
        programPath: null,
        workingDirectory: null,
        stdoutPath: null,
        stderrPath: null,
      }),
    });

    const doctor = await service.runDoctor({ deep: false, httpReachable: true });
    const formatted = formatDoctorReport(doctor);

    assert.match(formatted, /install wrappers/);
  } finally {
    fixture.restoreEnv();
  }
});

test("launchagent helpers support explicit runtime env and label overrides", () => {
  const previous = process.env.PERSONAL_OPS_LAUNCH_AGENT_LABEL;
  process.env.PERSONAL_OPS_LAUNCH_AGENT_LABEL = "com.d.personal-ops.verify.test";
  try {
    assert.equal(getLaunchAgentLabel(), "com.d.personal-ops.verify.test");
    const plist = renderLaunchAgentPlist({
      label: "com.d.personal-ops.verify.test",
      programPath: "/tmp/personal-opsd",
      workingDirectory: "/tmp/app",
      stdoutPath: "/tmp/stdout.log",
      stderrPath: "/tmp/stderr.log",
      environmentVariables: {
        HOME: "/tmp/home",
        PERSONAL_OPS_APP_DIR: "/tmp/app",
      },
    });
    assert.match(plist, /<key>EnvironmentVariables<\/key>/);
    assert.match(plist, /<key>HOME<\/key>/);
    assert.match(plist, /<string>\/tmp\/home<\/string>/);
    assert.match(plist, /<key>PERSONAL_OPS_APP_DIR<\/key>/);
  } finally {
    if (previous === undefined) {
      delete process.env.PERSONAL_OPS_LAUNCH_AGENT_LABEL;
    } else {
      process.env.PERSONAL_OPS_LAUNCH_AGENT_LABEL = previous;
    }
  }
});
