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

test("loadConfig and loadPolicy fall back safely from malformed numeric, enum, and time values", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-config-invalid-"));
  process.env.PERSONAL_OPS_CONFIG_DIR = path.join(base, "config");
  process.env.PERSONAL_OPS_STATE_DIR = path.join(base, "state");
  process.env.PERSONAL_OPS_LOG_DIR = path.join(base, "logs");
  const paths = ensureRuntimeFiles();
  fs.writeFileSync(
    paths.configFile,
    `[service]
host = ""
port = "not-a-port"

[http]
allowed_origins = [" https://console.example ", 7, ""]

[autopilot]
enabled = "false"
mode = "turbo"
run_interval_minutes = 0
warm_on_console_open = "false"
warm_on_desktop_open = "true"
profiles = ["day_start", "bogus", "planning"]
failure_backoff_minutes = "NaN"
notification_cooldown_minutes = -1

[gmail]
account_email = "  "
review_url = ""

[github]
enabled = "true"
included_repositories = [" owner/repo ", 42, ""]
sync_interval_minutes = "oops"
keychain_service = ""

[drive]
enabled = "true"
included_folders = ["https://drive.google.com/drive/folders/folder-alpha"]
included_files = ["https://drive.google.com/open?id=file-456"]
sync_interval_minutes = "oops"
recent_docs_limit = 0

[calendar]
enabled = "false"
provider = "other"
included_calendar_ids = ["primary"]
sync_past_days = -10
sync_future_days = "oops"
sync_interval_minutes = 0
workday_start_local = "25:99"
workday_end_local = "bad"
meeting_prep_warning_minutes = -5
day_overload_event_threshold = 0
schedule_pressure_free_minutes_threshold = "oops"

[auth]
keychain_service = ""
oauth_client_file = ""
`,
    "utf8",
  );
  fs.writeFileSync(
    paths.policyFile,
    `[notifications]
title_prefix = ""

[security]
allow_send = "true"

[audit]
default_limit = 0
`,
    "utf8",
  );

  const config = loadConfig(paths);
  const policy = loadPolicy(paths);

  assert.equal(config.serviceHost, "127.0.0.1");
  assert.equal(config.servicePort, 46210);
  assert.deepEqual(config.allowedOrigins, ["https://console.example"]);
  assert.equal(config.autopilotEnabled, false);
  assert.equal(config.autopilotMode, "continuous");
  assert.equal(config.autopilotRunIntervalMinutes, 5);
  assert.equal(config.autopilotWarmOnConsoleOpen, false);
  assert.equal(config.autopilotWarmOnDesktopOpen, true);
  assert.deepEqual(config.autopilotProfiles, ["day_start", "planning"]);
  assert.equal(config.autopilotFailureBackoffMinutes, 15);
  assert.equal(config.autopilotNotificationCooldownMinutes, 30);
  assert.equal(config.gmailAccountEmail, "");
  assert.equal(config.gmailReviewUrl, "https://mail.google.com/mail/u/0/#drafts");
  assert.equal(config.githubEnabled, true);
  assert.deepEqual(config.includedGithubRepositories, ["owner/repo"]);
  assert.equal(config.githubSyncIntervalMinutes, 10);
  assert.equal(config.githubKeychainService, "personal-ops.github");
  assert.equal(config.driveEnabled, true);
  assert.deepEqual(config.includedDriveFolders, ["folder-alpha"]);
  assert.deepEqual(config.includedDriveFiles, ["file-456"]);
  assert.equal(config.driveSyncIntervalMinutes, 30);
  assert.equal(config.driveRecentDocsLimit, 10);
  assert.equal(config.calendarEnabled, false);
  assert.equal(config.calendarProvider, "google");
  assert.deepEqual(config.includedCalendarIds, ["primary"]);
  assert.equal(config.calendarSyncPastDays, 30);
  assert.equal(config.calendarSyncFutureDays, 90);
  assert.equal(config.calendarSyncIntervalMinutes, 5);
  assert.equal(config.workdayStartLocal, "09:00");
  assert.equal(config.workdayEndLocal, "18:00");
  assert.equal(config.meetingPrepWarningMinutes, 30);
  assert.equal(config.dayOverloadEventThreshold, 6);
  assert.equal(config.schedulePressureFreeMinutesThreshold, 60);
  assert.equal(config.keychainService, "personal-ops.gmail");
  assert.equal(config.oauthClientFile, paths.oauthClientFile);

  assert.equal(policy.notificationsTitlePrefix, "Personal Ops");
  assert.equal(policy.allowSend, true);
  assert.equal(policy.auditDefaultLimit, 50);
});
