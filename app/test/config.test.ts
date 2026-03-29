import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureRuntimeFiles, loadConfig, loadPolicy } from "../src/config.js";

test("ensureRuntimeFiles creates config, policy, oauth placeholder, and both API tokens", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-config-"));
  process.env.PERSONAL_OPS_CONFIG_DIR = path.join(base, "config");
  process.env.PERSONAL_OPS_STATE_DIR = path.join(base, "state");
  process.env.PERSONAL_OPS_LOG_DIR = path.join(base, "logs");
  const paths = ensureRuntimeFiles();
  assert.ok(fs.existsSync(paths.configFile));
  assert.ok(fs.existsSync(paths.policyFile));
  assert.ok(fs.existsSync(paths.oauthClientFile));
  assert.ok(fs.existsSync(paths.apiTokenFile));
  assert.ok(fs.existsSync(paths.assistantApiTokenFile));
  const config = loadConfig(paths);
  const policy = loadPolicy(paths);
  assert.equal(config.serviceHost, "127.0.0.1");
  assert.equal(config.servicePort, 46210);
  assert.ok(config.assistantApiToken.length > 0);
  assert.equal(policy.allowSend, false);
});
