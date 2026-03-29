import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureRuntimeFiles, loadConfig, loadPolicy } from "../src/config.js";
import { PersonalOpsDb } from "../src/db.js";
import { buildInstallCheckReport, getInstallArtifactPaths, installAll, installWrapper } from "../src/install.js";
import { getLaunchAgentLabel, renderLaunchAgentPlist } from "../src/launchagent.js";
import { Logger } from "../src/logger.js";
import { restoreSnapshot } from "../src/restore.js";
import { PersonalOpsService } from "../src/service.js";
import { ClientIdentity, Paths } from "../src/types.js";

const cliIdentity: ClientIdentity = {
  client_id: "operator-cli",
  requested_by: "operator",
  auth_role: "operator",
};

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

test("install all creates runtime files, generated artifacts, and a healthy install report", () => {
  const fixture = createFixture();
  const launchctl = createLaunchctlStub();
  try {
    setConfiguredMailbox(fixture.paths, "machine@example.com");
    setConfiguredOauth(fixture.paths);

    const manifest = installAll(fixture.paths, "/custom/node", {
      launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
    });
    const report = buildInstallCheckReport(fixture.paths, {
      launchAgentDependencies: { execFileSyncImpl: launchctl.execFileSyncImpl },
    });
    const artifacts = getInstallArtifactPaths(fixture.paths);

    assert.equal(manifest.node_executable, "/custom/node");
    assert.equal(fs.existsSync(artifacts.cliWrapperPath), true);
    assert.equal(fs.existsSync(artifacts.daemonWrapperPath), true);
    assert.equal(fs.existsSync(artifacts.codexMcpWrapperPath), true);
    assert.equal(fs.existsSync(artifacts.claudeMcpWrapperPath), true);
    assert.equal(fs.existsSync(artifacts.launchAgentPlistPath), true);
    assert.equal(report.state, "ready");
    assert.equal(report.checks.some((check) => check.id === "launch_agent_loaded" && check.severity === "pass"), true);
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

test("install check reports placeholder oauth, missing LaunchAgent, and stale wrappers", () => {
  const fixture = createFixture();
  try {
    installWrapper(fixture.paths, "cli", undefined, "/node/custom");
    const artifacts = getInstallArtifactPaths(fixture.paths);
    fs.rmSync(artifacts.distCliPath);

    const report = buildInstallCheckReport(fixture.paths);
    assert.equal(report.state, "degraded");
    assert.equal(report.checks.some((check) => check.id === "oauth_client_configured" && check.severity === "warn"), true);
    assert.equal(report.checks.some((check) => check.id === "launch_agent_exists" && check.severity === "fail"), true);
    assert.equal(report.checks.some((check) => check.id === "cli_wrapper_exists" && check.severity === "fail"), true);
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
