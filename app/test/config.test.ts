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

test("loadConfig normalizes Drive file and folder URLs into IDs", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-config-drive-"));
  process.env.PERSONAL_OPS_CONFIG_DIR = path.join(base, "config");
  process.env.PERSONAL_OPS_STATE_DIR = path.join(base, "state");
  process.env.PERSONAL_OPS_LOG_DIR = path.join(base, "logs");
  const paths = ensureRuntimeFiles();
  fs.writeFileSync(
    paths.configFile,
    `[service]
host = "127.0.0.1"
port = 46210

[http]
allowed_origins = []

[gmail]
account_email = "machine@example.com"
review_url = "https://mail.google.com/mail/u/0/#drafts"

[drive]
enabled = true
included_folders = [
  "https://drive.google.com/drive/folders/folder-alpha",
  "folder-beta",
]
included_files = [
  "https://docs.google.com/document/d/doc-123/edit",
  "https://drive.google.com/open?id=file-456",
  "file-789",
]
sync_interval_minutes = 45
recent_docs_limit = 7

[auth]
keychain_service = "personal-ops.gmail.test"
oauth_client_file = "${paths.oauthClientFile}"
`,
    "utf8",
  );

  const config = loadConfig(paths);
  assert.equal(config.driveEnabled, true);
  assert.deepEqual(config.includedDriveFolders, ["folder-alpha", "folder-beta"]);
  assert.deepEqual(config.includedDriveFiles, ["doc-123", "file-456", "file-789"]);
  assert.equal(config.driveSyncIntervalMinutes, 45);
  assert.equal(config.driveRecentDocsLimit, 7);
});
