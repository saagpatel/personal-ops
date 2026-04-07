import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { getDesktopLocalStatusReport, getDesktopPaths, getDesktopStatusReport, openDesktopApp } from "../src/desktop.js";
import { resolvePaths } from "../src/paths.js";
import type { Paths } from "../src/types.js";

function withRuntimeEnv<T>(env: Record<string, string>, fn: () => T): T {
  const keys = [
    "HOME",
    "PERSONAL_OPS_CONFIG_DIR",
    "PERSONAL_OPS_STATE_DIR",
    "PERSONAL_OPS_LOG_DIR",
    "PERSONAL_OPS_APP_DIR",
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    process.env[key] = env[key];
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
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not reserve a port.");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function repoAppDir() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
}

function createDesktopEnv(label: string): { env: Record<string, string>; paths: Paths } {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `personal-ops-desktop-${label}-`));
  const homeDir = path.join(baseDir, "home");
  fs.mkdirSync(homeDir, { recursive: true });
  const env = {
    HOME: homeDir,
    PERSONAL_OPS_CONFIG_DIR: path.join(homeDir, ".config", "personal-ops"),
    PERSONAL_OPS_STATE_DIR: path.join(homeDir, "Library", "Application Support", "personal-ops"),
    PERSONAL_OPS_LOG_DIR: path.join(homeDir, "Library", "Logs", "personal-ops"),
    PERSONAL_OPS_APP_DIR: repoAppDir(),
  };
  const paths = withRuntimeEnv(env, () => resolvePaths());
  fs.mkdirSync(paths.configDir, { recursive: true });
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.mkdirSync(paths.logDir, { recursive: true });
  return { env, paths };
}

function writeDesktopFixture(paths: Paths, port: number, token: string): void {
  fs.writeFileSync(
    paths.configFile,
    `[service]
host = "127.0.0.1"
port = ${port}

[http]
allowed_origins = []

[gmail]
account_email = ""
review_url = "https://mail.google.com/mail/u/0/#drafts"

[calendar]
enabled = false
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
keychain_service = "personal-ops.gmail"
oauth_client_file = "${paths.oauthClientFile}"
`,
    "utf8",
  );
  fs.writeFileSync(paths.policyFile, `notifications_title_prefix = "Personal Ops"\nallow_send = false\naudit_default_limit = 50\n`, "utf8");
  fs.writeFileSync(paths.oauthClientFile, JSON.stringify({ installed: { client_id: "id" } }, null, 2), "utf8");
  fs.writeFileSync(paths.apiTokenFile, `${token}\n`, { encoding: "utf8", mode: 0o600 });
}

test("assistant-led phase 4 desktop status reports the optional app path and live session handoff", async () => {
  const token = "desktop-token";
  const port = await reservePort();
  const { env, paths } = createDesktopEnv("status");
  writeDesktopFixture(paths, port, token);

  const server = http.createServer((request, response) => {
    if (request.method === "POST" && request.url === "/v1/console/session") {
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          console_session: {
            grant: "grant-1",
            launch_url: `http://127.0.0.1:${port}/console/session/grant-1`,
            expires_at: new Date().toISOString(),
          },
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Not found." }));
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));

  try {
    const report = await withRuntimeEnv(env, () => getDesktopStatusReport(paths));
    const desktopPaths = withRuntimeEnv(env, () => getDesktopPaths(paths));
    assert.equal(report.support_contract, "macos_only");
    assert.equal(report.supported, process.platform === "darwin");
    assert.equal(report.installed, false);
    assert.equal(report.app_path, desktopPaths.installedAppPath);
    assert.equal(report.project_path.endsWith("/desktop"), true);
    assert.equal(report.reinstall_recommended, false);
    assert.equal(report.build_provenance.source_commit, null);
    assert.equal(report.daemon_session_handoff_ready, true);
    assert.match(report.launch_url ?? "", /\/console\/session\//);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("assistant-led phase 4 desktop open fails clearly when the native app is missing", () => {
  const { env, paths } = createDesktopEnv("open-missing");
  const expectedMessage =
    process.platform === "darwin" ? /install desktop/i : /supported only on macOS/i;
  assert.throws(
    () => withRuntimeEnv(env, () => openDesktopApp(paths)),
    expectedMessage,
  );
});

test("assistant-led phase 13 desktop status marks stale installed apps for reinstall", () => {
  const { env, paths } = createDesktopEnv("stale");
  const report = withRuntimeEnv(
    {
      ...env,
      PERSONAL_OPS_SOURCE_COMMIT: "current-commit-1234",
    },
    () => {
      const desktopPaths = getDesktopPaths(paths);
      fs.mkdirSync(desktopPaths.installedAppPath, { recursive: true });
      fs.writeFileSync(
        paths.installManifestFile,
        JSON.stringify(
          {
            generated_at: new Date().toISOString(),
            node_executable: process.execPath,
            app_dir: paths.appDir,
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
            desktop: {
              support_contract: "macos_only",
              supported: true,
              installed: true,
              bundle_exists: false,
              app_path: desktopPaths.installedAppPath,
              build_bundle_path: desktopPaths.buildBundlePath,
              project_path: desktopPaths.projectPath,
              build_provenance: {
                built_at: "2026-04-07T00:00:00.000Z",
                source_commit: "old-commit-9999",
                vite_version: "7.3.2",
                tauri_cli_version: "2.10.1",
                tauri_runtime_version: "2.10.3",
              },
              reinstall_recommended: false,
              reinstall_reason: null,
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
          },
          null,
          2,
        ),
        "utf8",
      );
      return getDesktopLocalStatusReport(paths);
    },
  );

  assert.equal(report.installed, true);
  assert.equal(report.reinstall_recommended, true);
  assert.match(report.reinstall_reason ?? "", /built from old-comm/i);
});
