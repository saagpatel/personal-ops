import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
  if (method !== "GET") {
    return false;
  }
  return (
    pathname === "/v1/status" ||
    pathname === "/v1/worklist" ||
    pathname === "/v1/doctor" ||
    pathname === "/v1/approval-queue" ||
    pathname.startsWith("/v1/approval-queue/") ||
    pathname === "/v1/mail/drafts" ||
    pathname === "/v1/planning-recommendations/summary" ||
    pathname === "/v1/planning-recommendations/next" ||
    pathname === "/v1/planning-recommendation-groups" ||
    pathname === "/v1/audit/events" ||
    pathname === "/v1/snapshots" ||
    pathname.startsWith("/v1/snapshots/")
  );
}

export function consoleShellPath(): string {
  const paths = resolvePaths();
  return path.join(paths.appDir, "dist", "console", "index.html");
}

export function resolveConsoleAsset(assetPath: string): { filePath: string; contentType: string } | null {
  const normalized = path.posix.normalize(`/${assetPath}`).slice(1);
  if (!normalized || normalized.startsWith("..") || normalized.includes("\0")) {
    return null;
  }
  const paths = resolvePaths();
  if (normalized.endsWith(".js")) {
    return {
      filePath: path.join(paths.appDir, "dist", "src", "console", normalized),
      contentType: "text/javascript; charset=utf-8",
    };
  }
  if (normalized.endsWith(".css")) {
    return {
      filePath: path.join(paths.appDir, "dist", "console", normalized),
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
