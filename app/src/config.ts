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
  const doc = parse(raw) as Record<string, any>;
  const token = ensureApiToken(paths.apiTokenFile);
  const assistantToken = ensureApiToken(paths.assistantApiTokenFile);
  return {
    serviceHost: doc.service?.host ?? "127.0.0.1",
    servicePort: Number(doc.service?.port ?? 46210),
    allowedOrigins: Array.isArray(doc.http?.allowed_origins) ? doc.http.allowed_origins : [],
    gmailAccountEmail: String(doc.gmail?.account_email ?? ""),
    gmailReviewUrl: String(doc.gmail?.review_url ?? "https://mail.google.com/mail/u/0/#drafts"),
    githubEnabled: Boolean(doc.github?.enabled ?? false),
    includedGithubRepositories: Array.isArray(doc.github?.included_repositories)
      ? doc.github.included_repositories.map((value: unknown) => String(value).trim()).filter(Boolean)
      : [],
    githubSyncIntervalMinutes: Number(doc.github?.sync_interval_minutes ?? 10),
    githubKeychainService: String(doc.github?.keychain_service ?? "personal-ops.github"),
    driveEnabled: Boolean(doc.drive?.enabled ?? false),
    includedDriveFolders: normalizeGoogleDriveScopeList(doc.drive?.included_folders),
    includedDriveFiles: normalizeGoogleDriveScopeList(doc.drive?.included_files),
    driveSyncIntervalMinutes: Number(doc.drive?.sync_interval_minutes ?? 30),
    driveRecentDocsLimit: Number(doc.drive?.recent_docs_limit ?? 10),
    calendarEnabled: Boolean(doc.calendar?.enabled ?? true),
    calendarProvider: String(doc.calendar?.provider ?? "google") as "google",
    includedCalendarIds: Array.isArray(doc.calendar?.included_calendar_ids)
      ? doc.calendar.included_calendar_ids.map((value: unknown) => String(value))
      : [],
    calendarSyncPastDays: Number(doc.calendar?.sync_past_days ?? 30),
    calendarSyncFutureDays: Number(doc.calendar?.sync_future_days ?? 90),
    calendarSyncIntervalMinutes: Number(doc.calendar?.sync_interval_minutes ?? 5),
    workdayStartLocal: String(doc.calendar?.workday_start_local ?? "09:00"),
    workdayEndLocal: String(doc.calendar?.workday_end_local ?? "18:00"),
    meetingPrepWarningMinutes: Number(doc.calendar?.meeting_prep_warning_minutes ?? 30),
    dayOverloadEventThreshold: Number(doc.calendar?.day_overload_event_threshold ?? 6),
    schedulePressureFreeMinutesThreshold: Number(
      doc.calendar?.schedule_pressure_free_minutes_threshold ?? 60,
    ),
    keychainService: String(doc.auth?.keychain_service ?? "personal-ops.gmail"),
    oauthClientFile: expandHome(String(doc.auth?.oauth_client_file ?? paths.oauthClientFile)),
    apiToken: token,
    assistantApiToken: assistantToken,
  };
}

export function loadPolicy(paths: Paths): Policy {
  const raw = fs.readFileSync(paths.policyFile, "utf8");
  const doc = parse(raw) as Record<string, any>;
  return {
    notificationsTitlePrefix: String(doc.notifications?.title_prefix ?? "Personal Ops"),
    allowSend: Boolean(doc.security?.allow_send ?? false),
    auditDefaultLimit: Number(doc.audit?.default_limit ?? 50),
  };
}
