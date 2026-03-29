import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { getDesktopPaths, getDesktopStatusReport, openDesktopApp } from "../src/desktop.js";
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
    assert.equal(report.supported, process.platform === "darwin");
    assert.equal(report.installed, false);
    assert.equal(report.app_path, desktopPaths.installedAppPath);
    assert.equal(report.project_path.endsWith("/desktop"), true);
    assert.equal(report.daemon_session_handoff_ready, true);
    assert.match(report.launch_url ?? "", /\/console\/session\//);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("assistant-led phase 4 desktop open fails clearly when the native app is missing", () => {
  const { env, paths } = createDesktopEnv("open-missing");
  assert.throws(
    () => withRuntimeEnv(env, () => openDesktopApp(paths)),
    /install desktop/i,
  );
});
