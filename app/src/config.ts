import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import { resolvePaths } from "./paths.js";
import { Config, Paths, Policy } from "./types.js";

const DEFAULT_CONFIG = `[service]
host = "127.0.0.1"
port = 46210

[http]
allowed_origins = []

[autopilot]
enabled = true
mode = "continuous"
run_interval_minutes = 5
warm_on_console_open = true
warm_on_desktop_open = true
profiles = ["day_start", "inbox", "meetings", "planning", "outbound"]
failure_backoff_minutes = 15
notification_cooldown_minutes = 30

[gmail]
account_email = ""
review_url = "https://mail.google.com/mail/u/0/#drafts"

[github]
enabled = false
included_repositories = []
sync_interval_minutes = 10
keychain_service = "personal-ops.github"

[drive]
enabled = false
included_folders = []
included_files = []
sync_interval_minutes = 30
recent_docs_limit = 10

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
keychain_service = "personal-ops.gmail"
oauth_client_file = "~/.config/personal-ops/gmail-oauth-client.json"
`;

const DEFAULT_POLICY = `[notifications]
title_prefix = "Personal Ops"

[security]
allow_send = false

[audit]
default_limit = 50
`;

const DEFAULT_OAUTH_CLIENT = `{
  "installed": {
    "client_id": "",
    "project_id": "",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "",
    "redirect_uris": ["http://127.0.0.1"]
  }
}
`;

function expandHome(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function normalizeGoogleDriveScopeValue(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const fileMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) {
    return fileMatch[1];
  }
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) {
    return folderMatch[1];
  }
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get("id");
    if (id?.trim()) {
      return id.trim();
    }
  } catch {
    // Treat non-URL strings as raw IDs below.
  }
  return trimmed;
}

function normalizeGoogleDriveScopeList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => normalizeGoogleDriveScopeValue(String(entry)))
        .filter(Boolean)
    : [];
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function readString(value: unknown, fallback: string, options: { allowEmpty?: boolean } = {}): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  if (normalized.length === 0 && !options.allowEmpty) {
    return fallback;
  }
  return normalized;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    : [];
}

function readNumber(
  value: unknown,
  fallback: number,
  options: { min?: number; integer?: boolean } = {},
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = options.integer ? Math.trunc(parsed) : parsed;
  if (options.min !== undefined && normalized < options.min) {
    return fallback;
  }
  return normalized;
}

function readWorkdayTime(value: unknown, fallback: string): string {
  const normalized = readString(value, fallback);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  return normalized;
}

function ensureFile(path: string, contents: string): void {
  if (!fs.existsSync(path)) {
    fs.writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
  }
}

function ensureApiToken(path: string): string {
  if (!fs.existsSync(path)) {
    const token = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(path, token, { encoding: "utf8", mode: 0o600 });
    return token;
  }
  return fs.readFileSync(path, "utf8").trim();
}

export function ensureRuntimeFiles(): Paths {
  const paths = resolvePaths();
  fs.mkdirSync(paths.configDir, { recursive: true });
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.mkdirSync(paths.logDir, { recursive: true });
  ensureFile(paths.configFile, DEFAULT_CONFIG);
  ensureFile(paths.policyFile, DEFAULT_POLICY);
  ensureFile(paths.oauthClientFile, DEFAULT_OAUTH_CLIENT);
  ensureApiToken(paths.apiTokenFile);
  ensureApiToken(paths.assistantApiTokenFile);
  return paths;
}

export function loadConfig(paths: Paths): Config {
  const raw = fs.readFileSync(paths.configFile, "utf8");
  const doc = readObject(parse(raw));
  const service = readObject(doc.service);
  const http = readObject(doc.http);
  const autopilot = readObject(doc.autopilot);
  const gmail = readObject(doc.gmail);
  const github = readObject(doc.github);
  const drive = readObject(doc.drive);
  const calendar = readObject(doc.calendar);
  const auth = readObject(doc.auth);
  const token = ensureApiToken(paths.apiTokenFile);
  const assistantToken = ensureApiToken(paths.assistantApiTokenFile);
  return {
    serviceHost: readString(service.host, "127.0.0.1"),
    servicePort: readNumber(service.port, 46210, { min: 1, integer: true }),
    allowedOrigins: readStringArray(http.allowed_origins),
    autopilotEnabled: readBoolean(autopilot.enabled, true),
    autopilotMode:
      autopilot.mode === "off" || autopilot.mode === "observe" || autopilot.mode === "continuous"
        ? autopilot.mode
        : "continuous",
    autopilotRunIntervalMinutes: readNumber(autopilot.run_interval_minutes, 5, { min: 1, integer: true }),
    autopilotWarmOnConsoleOpen: readBoolean(autopilot.warm_on_console_open, true),
    autopilotWarmOnDesktopOpen: readBoolean(autopilot.warm_on_desktop_open, true),
    autopilotProfiles: Array.isArray(autopilot.profiles)
      ? autopilot.profiles
          .map((value: unknown) => String(value).trim())
          .filter((value: string) => ["day_start", "inbox", "meetings", "planning", "outbound"].includes(value)) as Config["autopilotProfiles"]
      : ["day_start", "inbox", "meetings", "planning", "outbound"],
    autopilotFailureBackoffMinutes: readNumber(autopilot.failure_backoff_minutes, 15, { min: 1, integer: true }),
    autopilotNotificationCooldownMinutes: readNumber(autopilot.notification_cooldown_minutes, 30, { min: 1, integer: true }),
    gmailAccountEmail: readString(gmail.account_email, "", { allowEmpty: true }),
    gmailReviewUrl: readString(gmail.review_url, "https://mail.google.com/mail/u/0/#drafts"),
    githubEnabled: readBoolean(github.enabled, false),
    includedGithubRepositories: readStringArray(github.included_repositories),
    githubSyncIntervalMinutes: readNumber(github.sync_interval_minutes, 10, { min: 1, integer: true }),
    githubKeychainService: readString(github.keychain_service, "personal-ops.github"),
    driveEnabled: readBoolean(drive.enabled, false),
    includedDriveFolders: normalizeGoogleDriveScopeList(drive.included_folders),
    includedDriveFiles: normalizeGoogleDriveScopeList(drive.included_files),
    driveSyncIntervalMinutes: readNumber(drive.sync_interval_minutes, 30, { min: 1, integer: true }),
    driveRecentDocsLimit: readNumber(drive.recent_docs_limit, 10, { min: 1, integer: true }),
    calendarEnabled: readBoolean(calendar.enabled, true),
    calendarProvider: calendar.provider === "google" ? "google" : "google",
    includedCalendarIds: Array.isArray(calendar.included_calendar_ids)
      ? calendar.included_calendar_ids.map((value: unknown) => String(value))
      : [],
    calendarSyncPastDays: readNumber(calendar.sync_past_days, 30, { min: 0, integer: true }),
    calendarSyncFutureDays: readNumber(calendar.sync_future_days, 90, { min: 0, integer: true }),
    calendarSyncIntervalMinutes: readNumber(calendar.sync_interval_minutes, 5, { min: 1, integer: true }),
    workdayStartLocal: readWorkdayTime(calendar.workday_start_local, "09:00"),
    workdayEndLocal: readWorkdayTime(calendar.workday_end_local, "18:00"),
    meetingPrepWarningMinutes: readNumber(calendar.meeting_prep_warning_minutes, 30, { min: 0, integer: true }),
    dayOverloadEventThreshold: readNumber(calendar.day_overload_event_threshold, 6, { min: 1, integer: true }),
    schedulePressureFreeMinutesThreshold: readNumber(calendar.schedule_pressure_free_minutes_threshold, 60, {
      min: 0,
      integer: true,
    }),
    keychainService: readString(auth.keychain_service, "personal-ops.gmail"),
    oauthClientFile: expandHome(readString(auth.oauth_client_file, paths.oauthClientFile)),
    apiToken: token,
    assistantApiToken: assistantToken,
  };
}

export function loadPolicy(paths: Paths): Policy {
  const raw = fs.readFileSync(paths.policyFile, "utf8");
  const doc = readObject(parse(raw));
  const notifications = readObject(doc.notifications);
  const security = readObject(doc.security);
  const audit = readObject(doc.audit);
  return {
    notificationsTitlePrefix: readString(notifications.title_prefix, "Personal Ops"),
    allowSend: readBoolean(security.allow_send, false),
    auditDefaultLimit: readNumber(audit.default_limit, 50, { min: 1, integer: true }),
  };
}
