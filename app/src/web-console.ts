import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePaths } from "./paths.js";

export const CONSOLE_SESSION_COOKIE = "personal_ops_console_session";
const GRANT_TTL_MS = 2 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface SessionGrantRecord {
  grant: string;
  expiresAt: number;
}

interface BrowserSessionRecord {
  sessionId: string;
  expiresAt: number;
}

export interface ConsoleSessionGrant {
  grant: string;
  launch_url: string;
  expires_at: string;
}

export class WebConsoleSessionStore {
  private readonly grants = new Map<string, SessionGrantRecord>();
  private readonly sessions = new Map<string, BrowserSessionRecord>();

  createGrant(baseUrl: string): ConsoleSessionGrant {
    this.pruneExpired();
    const grant = crypto.randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + GRANT_TTL_MS;
    this.grants.set(grant, { grant, expiresAt });
    return {
      grant,
      launch_url: `${baseUrl}/console/session/${grant}`,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  consumeGrant(grant: string): BrowserSessionRecord | null {
    this.pruneExpired();
    const record = this.grants.get(grant);
    if (!record) {
      return null;
    }
    this.grants.delete(grant);
    const sessionId = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const session = { sessionId, expiresAt };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): BrowserSessionRecord | null {
    this.pruneExpired();
    return this.sessions.get(sessionId) ?? null;
  }

  pruneExpired(): void {
    const now = Date.now();
    for (const [grant, record] of this.grants.entries()) {
      if (record.expiresAt <= now) {
        this.grants.delete(grant);
      }
    }
    for (const [sessionId, record] of this.sessions.entries()) {
      if (record.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

export function isConsoleBrowserRoute(method: string, pathname: string): boolean {
  if (method === "GET") {
    return (
      pathname === "/v1/status" ||
      pathname === "/v1/autopilot/status" ||
      pathname === "/v1/worklist" ||
      pathname === "/v1/assistant/actions" ||
      pathname === "/v1/inbox/autopilot" ||
      pathname === "/v1/outbound/autopilot" ||
      pathname.startsWith("/v1/outbound/autopilot/groups/") ||
      pathname === "/v1/workflows/now-next" ||
      pathname === "/v1/workflows/prep-day" ||
      pathname === "/v1/workflows/follow-up-block" ||
      pathname === "/v1/workflows/prep-meetings" ||
      pathname.startsWith("/v1/workflows/prep-meetings/") ||
      pathname === "/v1/github/status" ||
      pathname === "/v1/github/reviews" ||
      pathname === "/v1/github/pulls" ||
      pathname.startsWith("/v1/github/pulls/") ||
      pathname === "/v1/doctor" ||
      pathname === "/v1/approval-queue" ||
      pathname.startsWith("/v1/approval-queue/") ||
      pathname === "/v1/mail/drafts" ||
      pathname === "/v1/review-queue" ||
      pathname === "/v1/review-queue/pending" ||
      pathname.startsWith("/v1/review-queue/") ||
      pathname === "/v1/review/packages" ||
      pathname.startsWith("/v1/review/packages/") ||
      pathname === "/v1/review/tuning" ||
      pathname === "/v1/review/report" ||
      pathname === "/v1/review/trends" ||
      pathname === "/v1/review/impact" ||
      pathname === "/v1/review/weekly" ||
      pathname === "/v1/review/calibration" ||
      pathname === "/v1/review/calibration/targets" ||
      pathname === "/v1/planning-recommendations/summary" ||
      pathname === "/v1/planning-recommendations/next" ||
      pathname.startsWith("/v1/planning-recommendations/") ||
      pathname === "/v1/planning/autopilot" ||
      pathname.startsWith("/v1/planning/autopilot/bundles/") ||
      pathname === "/v1/planning-recommendation-groups" ||
      pathname.startsWith("/v1/planning-recommendation-groups/") ||
      pathname.startsWith("/v1/tasks/") ||
      pathname.startsWith("/v1/inbox/threads/") ||
      pathname === "/v1/audit/events" ||
      pathname === "/v1/snapshots" ||
      pathname.startsWith("/v1/snapshots/")
    );
  }

  if (method === "POST") {
    return (
      /^\/v1\/assistant\/actions\/[^/]+\/run$/.test(pathname) ||
      /^\/v1\/inbox\/autopilot\/groups\/[^/]+\/prepare$/.test(pathname) ||
      /^\/v1\/workflows\/prep-meetings\/[^/]+\/prepare$/.test(pathname) ||
      pathname === "/v1/snapshots" ||
      pathname === "/v1/mail/drafts" ||
      /^\/v1\/mail\/drafts\/[^/]+$/.test(pathname) ||
      /^\/v1\/mail\/drafts\/[^/]+\/request-approval$/.test(pathname) ||
      /^\/v1\/outbound\/autopilot\/groups\/[^/]+\/request-approval$/.test(pathname) ||
      /^\/v1\/outbound\/autopilot\/groups\/[^/]+\/approve$/.test(pathname) ||
      /^\/v1\/outbound\/autopilot\/groups\/[^/]+\/send$/.test(pathname) ||
      /^\/v1\/review-queue\/[^/]+\/open$/.test(pathname) ||
      /^\/v1\/review-queue\/[^/]+\/resolve$/.test(pathname) ||
      /^\/v1\/review\/packages\/[^/]+\/feedback$/.test(pathname) ||
      /^\/v1\/review\/tuning\/[^/]+\/approve$/.test(pathname) ||
      /^\/v1\/review\/tuning\/[^/]+\/dismiss$/.test(pathname) ||
      /^\/v1\/approval-queue\/[^/]+\/reject$/.test(pathname) ||
      /^\/v1\/approval-queue\/[^/]+\/reopen$/.test(pathname) ||
      /^\/v1\/approval-queue\/[^/]+\/cancel$/.test(pathname) ||
      /^\/v1\/planning\/autopilot\/bundles\/[^/]+\/prepare$/.test(pathname) ||
      /^\/v1\/planning\/autopilot\/bundles\/[^/]+\/apply$/.test(pathname) ||
      (/^\/v1\/planning-recommendations\/[^/]+\/(apply|snooze|reject)$/.test(pathname) &&
        !pathname.includes("/hygiene/") &&
        !pathname.includes("/policy/")) ||
      /^\/v1\/planning-recommendation-groups\/[^/]+\/(snooze|reject)$/.test(pathname)
    );
  }

  return false;
}

function candidateAppDirs(): string[] {
  const resolvedAppDir = resolvePaths().appDir;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolvedAppDir,
    path.resolve(moduleDir, "..", ".."),
    path.resolve(moduleDir, ".."),
  ];
  return [...new Set(candidates)];
}

function firstExistingPath(pathsToCheck: string[]): string {
  const existing = pathsToCheck.find((candidate) => fs.existsSync(candidate));
  return existing ?? pathsToCheck[0] ?? "";
}

export function consoleShellPath(): string {
  return firstExistingPath(candidateAppDirs().map((appDir) => path.join(appDir, "dist", "console", "index.html")));
}

export function resolveConsoleAsset(assetPath: string): { filePath: string; contentType: string } | null {
  const normalized = path.posix.normalize(`/${assetPath}`).slice(1);
  if (!normalized || normalized.startsWith("..") || normalized.includes("\0")) {
    return null;
  }
  if (normalized.endsWith(".js")) {
    const filePath = firstExistingPath(candidateAppDirs().map((appDir) => path.join(appDir, "dist", "src", "console", normalized)));
    return {
      filePath,
      contentType: "text/javascript; charset=utf-8",
    };
  }
  if (normalized.endsWith(".css")) {
    const filePath = firstExistingPath(candidateAppDirs().map((appDir) => path.join(appDir, "dist", "console", normalized)));
    return {
      filePath,
      contentType: "text/css; charset=utf-8",
    };
  }
  return null;
}

export function readConsoleShell(): string {
  return fs.readFileSync(consoleShellPath(), "utf8");
}

export function readConsoleAsset(assetPath: string): { body: Buffer; contentType: string } | null {
  const resolved = resolveConsoleAsset(assetPath);
  if (!resolved || !fs.existsSync(resolved.filePath)) {
    return null;
  }
  return {
    body: fs.readFileSync(resolved.filePath),
    contentType: resolved.contentType,
  };
}
