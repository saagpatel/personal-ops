import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ensureRuntimeFiles, loadConfig, loadPolicy } from "../src/config.js";
import { createHttpServer } from "../src/http.js";
import { Logger } from "../src/logger.js";
import { PersonalOpsService } from "../src/service.js";
import type { Config, Paths } from "../src/types.js";

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
  const keys = ["HOME", "PERSONAL_OPS_APP_DIR", "PERSONAL_OPS_CONFIG_DIR", "PERSONAL_OPS_STATE_DIR", "PERSONAL_OPS_LOG_DIR"];
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
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
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function writeConfig(paths: Paths, port: number): void {
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
keychain_service = "personal-ops.gmail.console-test"
oauth_client_file = "${paths.oauthClientFile}"
`,
    "utf8",
  );
}

async function createConsoleFixture() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-console-test-"));
  const homeDir = path.join(baseDir, "home");
  fs.mkdirSync(homeDir, { recursive: true });
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const env = buildChildEnv({
    HOME: homeDir,
    PERSONAL_OPS_APP_DIR: appDir,
    PERSONAL_OPS_CONFIG_DIR: path.join(homeDir, ".config", "personal-ops"),
    PERSONAL_OPS_STATE_DIR: path.join(homeDir, "Library", "Application Support", "personal-ops"),
    PERSONAL_OPS_LOG_DIR: path.join(homeDir, "Library", "Logs", "personal-ops"),
  });
  const paths = withRuntimeEnv(env, () => ensureRuntimeFiles());
  const port = await reservePort();
  writeConfig(paths, port);
  const config = withRuntimeEnv(env, () => loadConfig(paths));
  const policy = withRuntimeEnv(env, () => loadPolicy(paths));
  const logger = new Logger(paths);
  const service = new PersonalOpsService(paths, config, policy, logger);
  const server = createHttpServer(service, config, policy);
  await new Promise<void>((resolve) => server.listen(config.servicePort, config.serviceHost, () => resolve()));
  return {
    baseDir,
    config,
    server,
  };
}

function cookieValue(setCookieHeader: string | null): string {
  assert.ok(setCookieHeader, "expected set-cookie header");
  const cookie = setCookieHeader.split(";")[0];
  assert.ok(cookie, "expected cookie value");
  return cookie;
}

test("Phase 8 console session grants are single-use and allow read-only status access", async () => {
  const fixture = await createConsoleFixture();
  try {
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    assert.equal(grantResponse.status, 200);
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    assert.match(grantPayload.console_session.launch_url, /\/console\/session\//);

    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    assert.equal(consumeResponse.status, 302);
    assert.equal(consumeResponse.headers.get("location"), "/console");
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const statusResponse = await fetch(`${baseUrl}/v1/status`, {
      headers: {
        cookie,
      },
    });
    assert.equal(statusResponse.status, 200);

    const secondConsume = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    assert.equal(secondConsume.status, 302);
    assert.equal(secondConsume.headers.get("location"), "/console?locked=1");
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("Phase 8 console sessions stay read-only for mutation routes", async () => {
  const fixture = await createConsoleFixture();
  try {
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const grantResponse = await fetch(`${baseUrl}/v1/web/session-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.config.apiToken}`,
        "x-personal-ops-client": "console-test",
      },
    });
    const grantPayload = (await grantResponse.json()) as { console_session: { launch_url: string } };
    const consumeResponse = await fetch(grantPayload.console_session.launch_url, { redirect: "manual" });
    const cookie = cookieValue(consumeResponse.headers.get("set-cookie"));

    const mutationResponse = await fetch(`${baseUrl}/v1/send-window/enable`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ minutes: 15, reason: "test" }),
    });
    assert.equal(mutationResponse.status, 403);
    const payload = (await mutationResponse.json()) as { error?: string };
    assert.match(payload.error ?? "", /read-only/i);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});

test("Phase 8 console shell and static assets are served from the daemon", async () => {
  const fixture = await createConsoleFixture();
  try {
    const baseUrl = `http://${fixture.config.serviceHost}:${fixture.config.servicePort}`;
    const shellResponse = await fetch(`${baseUrl}/console`);
    assert.equal(shellResponse.status, 200);
    assert.match(shellResponse.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await shellResponse.text(), /Operator Console/);

    const stylesResponse = await fetch(`${baseUrl}/console/assets/styles.css`);
    assert.equal(stylesResponse.status, 200);
    assert.match(stylesResponse.headers.get("content-type") ?? "", /text\/css/);

    const scriptResponse = await fetch(`${baseUrl}/console/assets/app.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type") ?? "", /text\/javascript/);

    const faviconResponse = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(faviconResponse.status, 204);
  } finally {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    fs.rmSync(fixture.baseDir, { recursive: true, force: true });
  }
});
