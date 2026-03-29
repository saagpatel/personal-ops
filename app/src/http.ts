import http from "node:http";
import { URL } from "node:url";
import { PersonalOpsService } from "./service.js";
import {
  ApprovalAction,
  ApprovalRequestFilter,
  AuditEventFilter,
  AuditEventCategory,
  ClientIdentity,
  Config,
  DraftInput,
  PlanningRecommendationHygieneReviewDecision,
  PlanningRecommendationKind,
  PlanningRecommendationSource,
  Policy,
  TaskPriority,
} from "./types.js";
import {
  CONSOLE_SESSION_COOKIE,
  type ConsoleSessionGrant,
  WebConsoleSessionStore,
  isConsoleBrowserRoute,
  readConsoleAsset,
  readConsoleShell,
} from "./web-console.js";

type AuthRole = "operator" | "assistant";

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

type RequestAuth =
  | {
      role: AuthRole;
      source: "bearer";
    }
  | {
      role: "operator";
      source: "browser_session";
      sessionId: string;
    };

function isLocalRequest(remoteAddress: string | undefined): boolean {
  return Boolean(
    remoteAddress &&
      (remoteAddress === "127.0.0.1" ||
        remoteAddress === "::1" ||
        remoteAddress === "::ffff:127.0.0.1"),
  );
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

function sendText(response: http.ServerResponse, statusCode: number, payload: string, contentType: string) {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.end(payload);
}

function sendBuffer(response: http.ServerResponse, statusCode: number, payload: Buffer, contentType: string) {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.end(payload);
}

function redirect(response: http.ServerResponse, location: string) {
  response.statusCode = 302;
  response.setHeader("location", location);
  response.end();
}

async function readJsonBody(request: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function extractIdentity(request: http.IncomingMessage, authRole: AuthRole): ClientIdentity {
  const browserSessionId = (request as http.IncomingMessage & { browserSessionId?: string }).browserSessionId;
  if (browserSessionId) {
    return {
      client_id: "operator-console",
      session_id: browserSessionId,
      origin: "operator-console",
      requested_by: "console",
      auth_role: "operator",
    };
  }
  return {
    client_id: String(request.headers["x-personal-ops-client"] ?? "unknown-client"),
    session_id: request.headers["x-personal-ops-session"] ? String(request.headers["x-personal-ops-session"]) : undefined,
    origin:
      authRole === "assistant"
        ? "assistant-mcp"
        : request.headers["x-personal-ops-origin"]
          ? String(request.headers["x-personal-ops-origin"])
          : undefined,
    requested_by: request.headers["x-personal-ops-requested-by"]
      ? String(request.headers["x-personal-ops-requested-by"])
      : undefined,
    auth_role: authRole,
  };
}

function assertOriginAllowed(request: http.IncomingMessage, config: Config) {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }
  const daemonOrigin = `http://${config.serviceHost}:${config.servicePort}`;
  if (origin === daemonOrigin) {
    return;
  }
  if (!config.allowedOrigins.includes(origin)) {
    throw new HttpError(403, `Origin ${origin} is not allowed.`);
  }
}

function parseCookies(rawCookie: string | undefined): Record<string, string> {
  if (!rawCookie) {
    return {};
  }
  return Object.fromEntries(
    rawCookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const splitIndex = part.indexOf("=");
        if (splitIndex === -1) {
          return [part, ""];
        }
        return [part.slice(0, splitIndex), decodeURIComponent(part.slice(splitIndex + 1))];
      }),
  );
}

function assertAuthorized(
  request: http.IncomingMessage,
  config: Config,
  sessionStore: WebConsoleSessionStore,
  method: string,
  pathname: string,
): RequestAuth {
  const authorization = request.headers.authorization ?? "";
  if (authorization === `Bearer ${config.apiToken}`) {
    return { role: "operator", source: "bearer" };
  }
  if (authorization === `Bearer ${config.assistantApiToken}`) {
    return { role: "assistant", source: "bearer" };
  }
  const sessionId = parseCookies(request.headers.cookie)[CONSOLE_SESSION_COOKIE];
  if (!sessionId) {
    throw new HttpError(401, "Missing or invalid bearer token.");
  }
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new HttpError(401, "Console session expired. Run `personal-ops console` to reopen the operator console.");
  }
  if (!isConsoleBrowserRoute(method, pathname)) {
    throw new HttpError(
      403,
      "Console sessions are limited to the browser-safe Phase 2 actions. Run the matching CLI command for anything else.",
    );
  }
  (request as http.IncomingMessage & { browserSessionId?: string }).browserSessionId = session.sessionId;
  return { role: "operator", source: "browser_session", sessionId: session.sessionId };
}

function draftInputFromBody(body: any): DraftInput {
  return {
    to: Array.isArray(body.to) ? body.to.map((item: unknown) => String(item)) : [],
    cc: Array.isArray(body.cc) ? body.cc.map((item: unknown) => String(item)) : [],
    bcc: Array.isArray(body.bcc) ? body.bcc.map((item: unknown) => String(item)) : [],
    subject: String(body.subject ?? ""),
    body_text: body.body_text ? String(body.body_text) : undefined,
    body_html: body.body_html ? String(body.body_html) : undefined,
  };
}

function calendarEventInputFromBody(body: any) {
  return {
    calendar_id: body.calendar_id ? String(body.calendar_id) : undefined,
    title: body.title !== undefined ? String(body.title) : undefined,
    start_at: body.start_at ? String(body.start_at) : undefined,
    end_at: body.end_at ? String(body.end_at) : undefined,
    location: body.location !== undefined ? String(body.location) : undefined,
    notes: body.notes !== undefined ? String(body.notes) : undefined,
  };
}

function planningRecommendationInputFromBody(body: any) {
  return {
    kind: String(body.kind ?? "schedule_task_block") as PlanningRecommendationKind,
    task_id: String(body.task_id ?? ""),
    start_at: body.start_at ? String(body.start_at) : "",
    end_at: body.end_at ? String(body.end_at) : "",
    calendar_id: body.calendar_id ? String(body.calendar_id) : undefined,
    title: body.title !== undefined ? String(body.title) : undefined,
    notes: body.notes !== undefined ? String(body.notes) : undefined,
    priority: body.priority !== undefined ? (String(body.priority) as TaskPriority) : undefined,
  };
}

function planningHygieneReviewInputFromBody(body: any) {
  const decision = String(body.decision ?? "");
  if (
    decision !== "keep_visible" &&
    decision !== "investigate_externalized_workflow" &&
    decision !== "investigate_source_suppression" &&
    decision !== "dismiss_for_now"
  ) {
    throw new Error(
      "decision must be keep_visible, investigate_externalized_workflow, investigate_source_suppression, or dismiss_for_now.",
    );
  }
  return {
    group: String(body.group ?? ""),
    kind: String(body.kind ?? "") as PlanningRecommendationKind,
    source: String(body.source ?? "") as any,
    decision: decision as PlanningRecommendationHygieneReviewDecision,
    note: body.note !== undefined ? String(body.note) : undefined,
  };
}

function planningHygieneProposalInputFromBody(body: any) {
  return {
    group: String(body.group ?? ""),
    kind: String(body.kind ?? "") as PlanningRecommendationKind,
    source: String(body.source ?? "") as PlanningRecommendationSource,
    note: body.note !== undefined ? String(body.note) : undefined,
  };
}

function planningPolicyGovernanceInputFromBody(body: any) {
  return {
    group: String(body.group ?? ""),
    kind: String(body.kind ?? "") as PlanningRecommendationKind,
    source: String(body.source ?? "") as PlanningRecommendationSource,
    note: body.note !== undefined ? String(body.note) : undefined,
  };
}

function planningPolicyPruneInputFromBody(body: any) {
  const eventType = body.event_type === undefined ? "all" : String(body.event_type);
  if (!["archived", "superseded", "all"].includes(eventType)) {
    throw new Error("event_type must be archived, superseded, or all.");
  }
  const rawDryRun = body.dry_run ?? body.dryRun;
  return {
    older_than_days: Number(body.older_than_days ?? body.olderThanDays ?? Number.NaN),
    event_type: eventType as "archived" | "superseded" | "all",
    dry_run:
      rawDryRun === true ||
      rawDryRun === 1 ||
      (typeof rawDryRun === "string" && ["1", "true", "yes", "on"].includes(rawDryRun.toLowerCase())),
  };
}

function parseApprovalAction(value: unknown): ApprovalAction {
  const action = String(value ?? "");
  if (action !== "approve" && action !== "send") {
    throw new Error("action must be either approve or send.");
  }
  return action;
}

function parseLimit(raw: string | null): number {
  const parsed = Number(raw ?? 50);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(Math.floor(parsed), 200);
}

function parseBooleanQuery(raw: string | null): boolean {
  if (!raw) {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function parseAuditCategoryQuery(raw: string | null): AuditEventCategory | undefined {
  if (!raw) {
    return undefined;
  }
  if (raw === "sync" || raw === "task" || raw === "task_suggestion" || raw === "planning") {
    return raw;
  }
  throw new Error("category must be one of: sync, task, task_suggestion, planning.");
}

function assertAllowedQueryParams(url: URL, allowedParams: string[]) {
  const allowed = new Set(allowedParams);
  const unsupported = [...new Set(Array.from(url.searchParams.keys()).filter((key) => !allowed.has(key)))];
  if (unsupported.length === 0) {
    return;
  }
  const label = unsupported.length === 1 ? "parameter" : "parameters";
  throw new Error(`unsupported query ${label}: ${unsupported.join(", ")}. Only ${allowedParams.join(" and ")} are supported.`);
}

export function createHttpServer(service: PersonalOpsService, config: Config, policy: Policy) {
  const sessionStore = new WebConsoleSessionStore();
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${config.serviceHost}:${config.servicePort}`);
      let auth: RequestAuth | undefined;
      if (!isLocalRequest(request.socket.remoteAddress)) {
        sendJson(response, 403, { error: "Only localhost requests are allowed." });
        return;
      }
      if (request.method === "GET" && url.pathname === "/console") {
        sendText(response, 200, readConsoleShell(), "text/html; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/favicon.ico") {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/console/assets/")) {
        const asset = readConsoleAsset(url.pathname.slice("/console/assets/".length));
        if (!asset) {
          sendJson(response, 404, { error: "Not found." });
          return;
        }
        sendBuffer(response, 200, asset.body, asset.contentType);
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/console/session/")) {
        const grant = decodeURIComponent(url.pathname.slice("/console/session/".length));
        const session = grant && !grant.includes("/") ? sessionStore.consumeGrant(grant) : null;
        if (!session) {
          redirect(response, "/console?locked=1");
          return;
        }
        response.setHeader(
          "set-cookie",
          `${CONSOLE_SESSION_COOKIE}=${encodeURIComponent(session.sessionId)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800`,
        );
        redirect(response, "/console");
        return;
      }

      if (url.pathname !== "/health") {
        assertOriginAllowed(request, config);
        auth = assertAuthorized(request, config, sessionStore, request.method ?? "GET", url.pathname);
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, service.health());
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/web/session-grants") {
        if (!auth || auth.source !== "bearer" || auth.role !== "operator") {
          throw new HttpError(403, "Console session grants require the operator bearer token.");
        }
        const baseUrl = `http://${config.serviceHost}:${config.servicePort}`;
        const grant: ConsoleSessionGrant = sessionStore.createGrant(baseUrl);
        sendJson(response, 200, { console_session: grant });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/status") {
        sendJson(response, 200, {
          status: await service.getStatusReport({ httpReachable: true }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/worklist") {
        sendJson(response, 200, {
          worklist: await service.getWorklistReport({ httpReachable: true }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/workflows/prep-day") {
        sendJson(response, 200, {
          workflow: await service.getPrepDayWorkflowReport({ httpReachable: true }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/workflows/follow-up-block") {
        sendJson(response, 200, {
          workflow: await service.getFollowUpBlockWorkflowReport({ httpReachable: true }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/workflows/prep-meetings") {
        const scope = url.searchParams.get("scope") === "next_24h" ? "next_24h" : "today";
        sendJson(response, 200, {
          workflow: await service.getPrepMeetingsWorkflowReport({ httpReachable: true, scope }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/inbox/status") {
        sendJson(response, 200, {
          inbox: service.getInboxStatusReport(),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/calendar/status") {
        sendJson(response, 200, {
          calendar: service.getCalendarStatusReport(),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/calendar/sync") {
        sendJson(response, 200, {
          calendar: await service.syncCalendarMetadata(extractIdentity(request, auth?.role ?? "operator")),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/calendar/calendars") {
        sendJson(response, 200, {
          calendars: service.listCalendarSources(),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/calendar/owned") {
        sendJson(response, 200, {
          calendars: service.listOwnedCalendarSources(),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/calendar/upcoming") {
        sendJson(response, 200, {
          events: service.listUpcomingCalendarEvents(
            Number(url.searchParams.get("days") ?? 7),
            parseLimit(url.searchParams.get("limit")),
          ),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/calendar/conflicts") {
        sendJson(response, 200, {
          conflicts: service.listCalendarConflicts(Number(url.searchParams.get("days") ?? 7)),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/calendar/free-time") {
        const day = String(url.searchParams.get("day") ?? "");
        if (!day) {
          sendJson(response, 400, { error: "day is required." });
          return;
        }
        sendJson(response, 200, {
          free_time: service.getFreeTimeWindows(day),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/calendar/day") {
        const day = String(url.searchParams.get("day") ?? "");
        if (!day) {
          sendJson(response, 400, { error: "day is required." });
          return;
        }
        sendJson(response, 200, {
          day: service.getCalendarDayView(day),
        });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/calendar/events/")) {
        const eventId = decodeURIComponent(url.pathname.slice("/v1/calendar/events/".length));
        if (eventId && !eventId.includes("/")) {
          sendJson(response, 200, {
            event: service.getCalendarEventDetail(eventId),
          });
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/v1/calendar/events") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          event: await service.createCalendarEvent(extractIdentity(request, auth?.role ?? "operator"), calendarEventInputFromBody(body)),
        });
        return;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/v1/calendar/events/")) {
        const suffix = url.pathname.slice("/v1/calendar/events/".length);
        if (suffix && !suffix.includes("/")) {
          const body = await readJsonBody(request);
          sendJson(response, 200, {
            event: await service.updateCalendarEvent(
              extractIdentity(request, auth?.role ?? "operator"),
              decodeURIComponent(suffix),
              calendarEventInputFromBody(body),
            ),
          });
          return;
        }
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/calendar/events/") && url.pathname.endsWith("/cancel")) {
        const eventId = decodeURIComponent(url.pathname.slice("/v1/calendar/events/".length, -"/cancel".length));
        if (eventId && !eventId.includes("/")) {
          const body = await readJsonBody(request);
          sendJson(response, 200, {
            event: await service.cancelCalendarEvent(
              extractIdentity(request, auth?.role ?? "operator"),
              eventId,
              String(body.note ?? ""),
            ),
          });
          return;
        }
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/calendar/tasks/") && url.pathname.endsWith("/schedule")) {
        const taskId = decodeURIComponent(url.pathname.slice("/v1/calendar/tasks/".length, -"/schedule".length));
        if (taskId && !taskId.includes("/")) {
          const body = await readJsonBody(request);
          sendJson(response, 200, {
            scheduled: await service.scheduleTaskOnCalendar(
              extractIdentity(request, auth?.role ?? "operator"),
              taskId,
              calendarEventInputFromBody(body),
            ),
          });
          return;
        }
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/calendar/tasks/") && url.pathname.endsWith("/unschedule")) {
        const taskId = decodeURIComponent(url.pathname.slice("/v1/calendar/tasks/".length, -"/unschedule".length));
        if (taskId && !taskId.includes("/")) {
          const body = await readJsonBody(request);
          sendJson(response, 200, {
            scheduled: await service.unscheduleTaskFromCalendar(
              extractIdentity(request, auth?.role ?? "operator"),
              taskId,
              String(body.note ?? ""),
            ),
          });
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/v1/inbox/sync") {
        sendJson(response, 200, {
          inbox: await service.syncMailboxMetadata(extractIdentity(request, auth?.role ?? "operator")),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/inbox/unread") {
        sendJson(response, 200, {
          threads: service.listUnreadInboxThreads(parseLimit(url.searchParams.get("limit"))),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/inbox/followups") {
        sendJson(response, 200, {
          threads: service.listFollowupThreads(parseLimit(url.searchParams.get("limit"))),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/inbox/needs-reply") {
        sendJson(response, 200, {
          threads: service.listNeedsReplyThreads(parseLimit(url.searchParams.get("limit"))),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/inbox/recent") {
        sendJson(response, 200, {
          threads: service.listRecentThreads(parseLimit(url.searchParams.get("limit"))),
        });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/inbox/threads/")) {
        const threadId = decodeURIComponent(url.pathname.slice("/v1/inbox/threads/".length));
        if (threadId && !threadId.includes("/")) {
          sendJson(response, 200, {
            thread: service.getInboxThreadDetail(threadId),
          });
          return;
        }
      }

      if (request.method === "GET" && url.pathname === "/v1/send-window") {
        sendJson(response, 200, {
          send_window: service.getSendWindowStatus(),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/send-window/enable") {
        const body = await readJsonBody(request);
        service.enableSendWindow(
          extractIdentity(request, auth?.role ?? "operator"),
          body.minutes === undefined ? 15 : Number(body.minutes),
          String(body.reason ?? ""),
        );
        sendJson(response, 200, {
          send_window: service.getSendWindowStatus(),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/send-window/disable") {
        const body = await readJsonBody(request);
        service.disableSendWindow(
          extractIdentity(request, auth?.role ?? "operator"),
          String(body.reason ?? ""),
        );
        sendJson(response, 200, {
          send_window: service.getSendWindowStatus(),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/doctor") {
        const deep = ["1", "true", "yes"].includes((url.searchParams.get("deep") ?? "").toLowerCase());
        sendJson(response, 200, {
          doctor: await service.runDoctor({ deep, httpReachable: true }),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/gmail/start") {
        const body = await readJsonBody(request);
        const callbackPort = Number(body.callback_port);
        if (!Number.isFinite(callbackPort) || callbackPort <= 0) {
          sendJson(response, 400, { error: "callback_port must be a valid positive number." });
          return;
        }
        sendJson(response, 200, service.startGmailAuth(callbackPort));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/google/start") {
        const body = await readJsonBody(request);
        const callbackPort = Number(body.callback_port);
        if (!Number.isFinite(callbackPort) || callbackPort <= 0) {
          sendJson(response, 400, { error: "callback_port must be a valid positive number." });
          return;
        }
        sendJson(response, 200, service.startGoogleAuth(callbackPort));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/gmail/callback/complete") {
        const body = await readJsonBody(request);
        sendJson(response, 200, await service.completeGmailAuth(String(body.state ?? ""), String(body.code ?? "")));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/google/callback/complete") {
        const body = await readJsonBody(request);
        sendJson(response, 200, await service.completeGoogleAuth(String(body.state ?? ""), String(body.code ?? "")));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/mail/drafts") {
        sendJson(response, 200, { drafts: service.listDrafts() });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/mail/drafts") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          draft: await service.createDraft(extractIdentity(request, auth?.role ?? "operator"), draftInputFromBody(body)),
        });
        return;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/v1/mail/drafts/")) {
        const artifactId = decodeURIComponent(url.pathname.slice("/v1/mail/drafts/".length));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          draft: await service.updateDraft(extractIdentity(request, auth?.role ?? "operator"), artifactId, draftInputFromBody(body)),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/mail/drafts/") && url.pathname.endsWith("/request-approval")) {
        const artifactId = decodeURIComponent(
          url.pathname.replace("/v1/mail/drafts/", "").replace("/request-approval", ""),
        );
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          approval_request: service.requestApproval(
            extractIdentity(request, auth?.role ?? "operator"),
            artifactId,
            body.note ? String(body.note) : undefined,
          ),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/review-queue") {
        sendJson(response, 200, { review_items: service.listReviewQueue() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/review-queue/pending") {
        sendJson(response, 200, { review_items: service.listPendingReviewQueue() });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/review-queue/")) {
        const reviewId = decodeURIComponent(url.pathname.slice("/v1/review-queue/".length));
        if (reviewId && !reviewId.includes("/")) {
          sendJson(response, 200, { review: service.getReviewDetail(reviewId) });
          return;
        }
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/review-queue/") && url.pathname.endsWith("/open")) {
        const reviewId = decodeURIComponent(url.pathname.replace("/v1/review-queue/", "").replace("/open", ""));
        sendJson(response, 200, service.openReview(extractIdentity(request, auth?.role ?? "operator"), reviewId));
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/review-queue/") && url.pathname.endsWith("/resolve")) {
        const reviewId = decodeURIComponent(url.pathname.replace("/v1/review-queue/", "").replace("/resolve", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          review_item: service.resolveReview(
            extractIdentity(request, auth?.role ?? "operator"),
            reviewId,
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/tasks") {
        sendJson(response, 200, {
          tasks: service.listTasks({
            state: (url.searchParams.get("state") ?? undefined) as
              | "pending"
              | "in_progress"
              | "completed"
              | "canceled"
              | undefined,
            include_history: ["1", "true", "yes"].includes((url.searchParams.get("all") ?? "").toLowerCase()),
          }),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/tasks") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          task: service.createTask(extractIdentity(request, auth?.role ?? "operator"), {
            title: String(body.title ?? ""),
            notes: body.notes ? String(body.notes) : undefined,
            kind: String(body.kind ?? "human_reminder") as "human_reminder" | "assistant_work",
            priority: String(body.priority ?? "normal") as "low" | "normal" | "high",
            owner: String(body.owner ?? "operator") as "operator" | "assistant",
            due_at: body.due_at ? String(body.due_at) : undefined,
            remind_at: body.remind_at ? String(body.remind_at) : undefined,
          }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/tasks/due") {
        sendJson(response, 200, { tasks: service.listDueTasks() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/tasks/overdue") {
        sendJson(response, 200, { tasks: service.listOverdueTasks() });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/tasks/")) {
        const taskId = decodeURIComponent(url.pathname.slice("/v1/tasks/".length));
        if (taskId && !taskId.includes("/")) {
          sendJson(response, 200, { task: service.getTaskDetail(taskId) });
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/v1/tasks/prune") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          result: service.pruneTaskHistory(
            extractIdentity(request, auth?.role ?? "operator"),
            Number(body.older_than_days ?? 30),
            Array.isArray(body.states)
              ? body.states.map((value: unknown) => String(value) as "completed" | "canceled")
              : undefined,
          ),
        });
        return;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/v1/tasks/")) {
        const taskId = decodeURIComponent(url.pathname.slice("/v1/tasks/".length));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          task: service.updateTask(extractIdentity(request, auth?.role ?? "operator"), taskId, {
            title: body.title === undefined ? undefined : String(body.title),
            notes: body.notes === undefined ? undefined : body.notes ? String(body.notes) : "",
            kind: body.kind === undefined ? undefined : (String(body.kind) as "human_reminder" | "assistant_work"),
            priority: body.priority === undefined ? undefined : (String(body.priority) as "low" | "normal" | "high"),
            owner: body.owner === undefined ? undefined : (String(body.owner) as "operator" | "assistant"),
            due_at: body.due_at === undefined ? undefined : body.due_at ? String(body.due_at) : null,
            remind_at: body.remind_at === undefined ? undefined : body.remind_at ? String(body.remind_at) : null,
          }),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/tasks/") && url.pathname.endsWith("/start")) {
        const taskId = decodeURIComponent(url.pathname.replace("/v1/tasks/", "").replace("/start", ""));
        sendJson(response, 200, { task: service.startTask(extractIdentity(request, auth?.role ?? "operator"), taskId) });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/tasks/") && url.pathname.endsWith("/complete")) {
        const taskId = decodeURIComponent(url.pathname.replace("/v1/tasks/", "").replace("/complete", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          task: service.completeTask(extractIdentity(request, auth?.role ?? "operator"), taskId, String(body.note ?? "")),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/tasks/") && url.pathname.endsWith("/cancel")) {
        const taskId = decodeURIComponent(url.pathname.replace("/v1/tasks/", "").replace("/cancel", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          task: service.cancelTask(extractIdentity(request, auth?.role ?? "operator"), taskId, String(body.note ?? "")),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/tasks/") && url.pathname.endsWith("/snooze")) {
        const taskId = decodeURIComponent(url.pathname.replace("/v1/tasks/", "").replace("/snooze", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          task: service.snoozeTask(
            extractIdentity(request, auth?.role ?? "operator"),
            taskId,
            String(body.until ?? ""),
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/task-suggestions") {
        sendJson(response, 200, {
          task_suggestions: service.listTaskSuggestions({
            status: (url.searchParams.get("status") ?? undefined) as "pending" | "accepted" | "rejected" | undefined,
            include_resolved: ["1", "true", "yes"].includes((url.searchParams.get("all") ?? "").toLowerCase()),
          }),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/task-suggestions") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          task_suggestion: service.createTaskSuggestion(extractIdentity(request, auth?.role ?? "operator"), {
            title: String(body.title ?? ""),
            notes: body.notes ? String(body.notes) : undefined,
            kind: String(body.kind ?? "assistant_work") as "human_reminder" | "assistant_work",
            priority: String(body.priority ?? "normal") as "low" | "normal" | "high",
            due_at: body.due_at ? String(body.due_at) : undefined,
            remind_at: body.remind_at ? String(body.remind_at) : undefined,
          }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/task-suggestions/")) {
        const suggestionId = decodeURIComponent(url.pathname.slice("/v1/task-suggestions/".length));
        if (suggestionId && !suggestionId.includes("/")) {
          sendJson(response, 200, { task_suggestion: service.getTaskSuggestionDetail(suggestionId) });
          return;
        }
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/task-suggestions/") && url.pathname.endsWith("/accept")) {
        const suggestionId = decodeURIComponent(url.pathname.replace("/v1/task-suggestions/", "").replace("/accept", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          task_suggestion: service.acceptTaskSuggestion(
            extractIdentity(request, auth?.role ?? "operator"),
            suggestionId,
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/task-suggestions/") && url.pathname.endsWith("/reject")) {
        const suggestionId = decodeURIComponent(url.pathname.replace("/v1/task-suggestions/", "").replace("/reject", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          task_suggestion: service.rejectTaskSuggestion(
            extractIdentity(request, auth?.role ?? "operator"),
            suggestionId,
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/task-suggestions/prune") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          result: service.pruneTaskSuggestionHistory(
            extractIdentity(request, auth?.role ?? "operator"),
            Number(body.older_than_days ?? 30),
            Array.isArray(body.statuses)
              ? body.statuses.map((value: unknown) => String(value) as "accepted" | "rejected")
              : undefined,
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/planning-recommendations/refresh") {
        sendJson(response, 200, {
          result: service.refreshPlanningRecommendations(extractIdentity(request, auth?.role ?? "operator")),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendations") {
        const grouped = ["1", "true", "yes"].includes((url.searchParams.get("grouped") ?? "").toLowerCase());
        sendJson(response, 200, {
          planning_recommendations: service.listPlanningRecommendations({
            status: (url.searchParams.get("status") ?? undefined) as any,
            kind: (url.searchParams.get("kind") ?? undefined) as any,
            include_resolved: ["1", "true", "yes"].includes((url.searchParams.get("all") ?? "").toLowerCase()),
          }),
          planning_recommendation_groups: grouped
            ? service.listPlanningRecommendationGroups({
                status: (url.searchParams.get("status") ?? undefined) as any,
                kind: (url.searchParams.get("kind") ?? undefined) as any,
                include_resolved: ["1", "true", "yes"].includes((url.searchParams.get("all") ?? "").toLowerCase()),
              })
            : undefined,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendations/summary") {
        sendJson(response, 200, {
          planning_recommendation_summary: service.getPlanningRecommendationSummaryReport(),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendations/tuning") {
        sendJson(response, 200, {
          planning_recommendation_tuning: service.getPlanningRecommendationTuningReport({
            assistant_safe: auth?.role === "assistant",
          }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendations/policy") {
        sendJson(response, 200, {
          planning_recommendation_policy: service.getPlanningRecommendationPolicyReport(
            extractIdentity(request, auth?.role ?? "operator"),
          ),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendations/backlog") {
        const filters = {
          group: url.searchParams.get("group") ?? undefined,
          kind: (url.searchParams.get("kind") ?? undefined) as any,
          source: (url.searchParams.get("source") ?? undefined) as any,
          stale_only: parseBooleanQuery(url.searchParams.get("stale_only")),
          manual_only: parseBooleanQuery(url.searchParams.get("manual_only")),
          resurfaced_only: parseBooleanQuery(url.searchParams.get("resurfaced_only")),
        };
        sendJson(response, 200, {
          planning_recommendation_backlog: service.getPlanningRecommendationBacklogReport(filters),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendations/closure") {
        const days = Number(url.searchParams.get("days") ?? 30);
        if (!Number.isFinite(days) || days <= 0) {
          throw new Error("days must be a positive number.");
        }
        sendJson(response, 200, {
          planning_recommendation_closure: service.getPlanningRecommendationClosureReport({
            days: Math.floor(days),
            group: url.searchParams.get("group") ?? undefined,
            kind: (url.searchParams.get("kind") ?? undefined) as any,
            source: (url.searchParams.get("source") ?? undefined) as any,
            close_reason: url.searchParams.get("close_reason") ?? undefined,
          }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendations/hygiene") {
        sendJson(response, 200, {
          planning_recommendation_hygiene: service.getPlanningRecommendationHygieneReport({
            group: url.searchParams.get("group") ?? undefined,
            kind: (url.searchParams.get("kind") ?? undefined) as any,
            source: (url.searchParams.get("source") ?? undefined) as any,
            candidate_only: parseBooleanQuery(url.searchParams.get("candidate_only")),
            review_needed_only: parseBooleanQuery(url.searchParams.get("review_needed_only")),
          }, { assistant_safe: auth?.role === "assistant" }),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/planning-recommendations/hygiene/review") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation_hygiene_family: service.reviewPlanningRecommendationHygiene(
            extractIdentity(request, auth?.role ?? "operator"),
            planningHygieneReviewInputFromBody(body),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/planning-recommendations/hygiene/proposals/record") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation_hygiene_family: service.recordPlanningRecommendationHygieneProposal(
            extractIdentity(request, auth?.role ?? "operator"),
            planningHygieneProposalInputFromBody(body),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/planning-recommendations/hygiene/proposals/dismiss") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation_hygiene_family: service.dismissPlanningRecommendationHygieneProposal(
            extractIdentity(request, auth?.role ?? "operator"),
            planningHygieneProposalInputFromBody(body),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/planning-recommendations/policy/archive") {
        const body = await readJsonBody(request);
        const identity = extractIdentity(request, auth?.role ?? "operator");
        const historyItem = service.archivePlanningRecommendationPolicy(identity, planningPolicyGovernanceInputFromBody(body));
        sendJson(response, 200, {
          planning_recommendation_policy_history_item: historyItem,
          planning_recommendation_policy: service.getPlanningRecommendationPolicyReport(identity),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/planning-recommendations/policy/supersede") {
        const body = await readJsonBody(request);
        const identity = extractIdentity(request, auth?.role ?? "operator");
        const historyItem = service.supersedePlanningRecommendationPolicy(identity, planningPolicyGovernanceInputFromBody(body));
        sendJson(response, 200, {
          planning_recommendation_policy_history_item: historyItem,
          planning_recommendation_policy: service.getPlanningRecommendationPolicyReport(identity),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/planning-recommendations/policy/prune") {
        const body = await readJsonBody(request);
        const identity = extractIdentity(request, auth?.role ?? "operator");
        sendJson(response, 200, {
          planning_recommendation_policy_prune: service.prunePlanningRecommendationPolicyHistory(
            identity,
            planningPolicyPruneInputFromBody(body),
          ),
          planning_recommendation_policy: service.getPlanningRecommendationPolicyReport(identity),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendation-groups") {
        sendJson(response, 200, {
          planning_recommendation_groups: service.listPlanningRecommendationGroups({
            status: (url.searchParams.get("status") ?? undefined) as any,
            kind: (url.searchParams.get("kind") ?? undefined) as any,
            include_resolved: ["1", "true", "yes"].includes((url.searchParams.get("all") ?? "").toLowerCase()),
          }),
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/planning-recommendation-groups/") &&
        url.pathname.endsWith("/snooze")
      ) {
        const groupKey = decodeURIComponent(
          url.pathname.replace("/v1/planning-recommendation-groups/", "").replace("/snooze", ""),
        );
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation_group: service.snoozePlanningRecommendationGroup(
            extractIdentity(request, auth?.role ?? "operator"),
            groupKey,
            body.until !== undefined ? String(body.until) : undefined,
            String(body.note ?? ""),
            body.preset !== undefined ? String(body.preset) : undefined,
          ),
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/planning-recommendation-groups/") &&
        url.pathname.endsWith("/reject")
      ) {
        const groupKey = decodeURIComponent(
          url.pathname.replace("/v1/planning-recommendation-groups/", "").replace("/reject", ""),
        );
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation_group: service.rejectPlanningRecommendationGroup(
            extractIdentity(request, auth?.role ?? "operator"),
            groupKey,
            String(body.note ?? ""),
            String(body.reason_code ?? ""),
          ),
        });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/planning-recommendation-groups/")) {
        const groupKey = decodeURIComponent(url.pathname.slice("/v1/planning-recommendation-groups/".length));
        if (groupKey && !groupKey.includes("/")) {
          sendJson(response, 200, {
            planning_recommendation_group: service.getPlanningRecommendationGroupDetail(groupKey),
          });
          return;
        }
      }

      if (request.method === "GET" && url.pathname === "/v1/planning-recommendations/next") {
        const groupKey = url.searchParams.get("group") ?? undefined;
        sendJson(response, 200, {
          planning_recommendation: service.getNextPlanningRecommendationDetail(groupKey ?? undefined, {
            assistant_safe: auth?.role === "assistant",
          }),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/planning-recommendations") {
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation: service.createPlanningRecommendation(
            extractIdentity(request, auth?.role ?? "operator"),
            planningRecommendationInputFromBody(body),
          ),
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/planning-recommendations/") &&
        url.pathname.endsWith("/replan")
      ) {
        const recommendationId = decodeURIComponent(
          url.pathname.replace("/v1/planning-recommendations/", "").replace("/replan", ""),
        );
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation: service.replanPlanningRecommendation(
            extractIdentity(request, auth?.role ?? "operator"),
            recommendationId,
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/planning-recommendations/") &&
        url.pathname.endsWith("/apply")
      ) {
        const recommendationId = decodeURIComponent(
          url.pathname.replace("/v1/planning-recommendations/", "").replace("/apply", ""),
        );
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation: await service.applyPlanningRecommendation(
            extractIdentity(request, auth?.role ?? "operator"),
            recommendationId,
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/planning-recommendations/") &&
        url.pathname.endsWith("/reject")
      ) {
        const recommendationId = decodeURIComponent(
          url.pathname.replace("/v1/planning-recommendations/", "").replace("/reject", ""),
        );
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation: service.rejectPlanningRecommendation(
            extractIdentity(request, auth?.role ?? "operator"),
            recommendationId,
            String(body.note ?? ""),
            body.reason_code !== undefined ? String(body.reason_code) : undefined,
          ),
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/planning-recommendations/") &&
        url.pathname.endsWith("/snooze")
      ) {
        const recommendationId = decodeURIComponent(
          url.pathname.replace("/v1/planning-recommendations/", "").replace("/snooze", ""),
        );
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          planning_recommendation: service.snoozePlanningRecommendation(
            extractIdentity(request, auth?.role ?? "operator"),
            recommendationId,
            body.until !== undefined ? String(body.until) : undefined,
            String(body.note ?? ""),
            body.preset !== undefined ? String(body.preset) : undefined,
          ),
        });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/planning-recommendations/")) {
        const recommendationId = decodeURIComponent(url.pathname.slice("/v1/planning-recommendations/".length));
        if (recommendationId && !recommendationId.includes("/")) {
          sendJson(response, 200, {
            planning_recommendation: service.getPlanningRecommendationDetail(recommendationId, {
              assistant_safe: auth?.role === "assistant",
            }),
          });
          return;
        }
      }

      if (request.method === "GET" && url.pathname === "/v1/audit/events") {
        assertAllowedQueryParams(url, ["limit", "category"]);
        const filter: AuditEventFilter = {
          limit: Number(url.searchParams.get("limit") ?? policy.auditDefaultLimit),
          category: parseAuditCategoryQuery(url.searchParams.get("category")),
        };
        sendJson(response, 200, { events: service.listAuditEvents(filter, { assistant_safe: auth?.role === "assistant" }) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/approval-queue") {
        const filter: ApprovalRequestFilter = {
          limit: Number(url.searchParams.get("limit") ?? policy.auditDefaultLimit),
          state: (url.searchParams.get("state") ?? undefined) as ApprovalRequestFilter["state"],
        };
        sendJson(response, 200, { approval_requests: service.listApprovalQueue(filter) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/approval-queue/pending") {
        sendJson(response, 200, {
          approval_requests: service.listApprovalQueue({ state: "pending", limit: policy.auditDefaultLimit }),
        });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/approval-queue/")) {
        const approvalId = decodeURIComponent(url.pathname.slice("/v1/approval-queue/".length));
        if (approvalId && !approvalId.includes("/")) {
          sendJson(response, 200, { approval: service.getApprovalDetail(approvalId) });
          return;
        }
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/approval-queue/") && url.pathname.endsWith("/confirm")) {
        const approvalId = decodeURIComponent(url.pathname.replace("/v1/approval-queue/", "").replace("/confirm", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          confirmation: service.confirmApprovalAction(
            extractIdentity(request, auth?.role ?? "operator"),
            approvalId,
            parseApprovalAction(body.action),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/approval-queue/") && url.pathname.endsWith("/approve")) {
        const approvalId = decodeURIComponent(url.pathname.replace("/v1/approval-queue/", "").replace("/approve", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          approval: service.approveRequest(
            extractIdentity(request, auth?.role ?? "operator"),
            approvalId,
            String(body.note ?? ""),
            body.confirmation_token ? String(body.confirmation_token) : undefined,
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/approval-queue/") && url.pathname.endsWith("/reject")) {
        const approvalId = decodeURIComponent(url.pathname.replace("/v1/approval-queue/", "").replace("/reject", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          approval: service.rejectRequest(
            extractIdentity(request, auth?.role ?? "operator"),
            approvalId,
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/approval-queue/") && url.pathname.endsWith("/reopen")) {
        const approvalId = decodeURIComponent(url.pathname.replace("/v1/approval-queue/", "").replace("/reopen", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          approval: service.reopenApproval(
            extractIdentity(request, auth?.role ?? "operator"),
            approvalId,
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/approval-queue/") && url.pathname.endsWith("/cancel")) {
        const approvalId = decodeURIComponent(url.pathname.replace("/v1/approval-queue/", "").replace("/cancel", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          approval: service.cancelApproval(
            extractIdentity(request, auth?.role ?? "operator"),
            approvalId,
            String(body.note ?? ""),
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/v1/approval-queue/") && url.pathname.endsWith("/send")) {
        const approvalId = decodeURIComponent(url.pathname.replace("/v1/approval-queue/", "").replace("/send", ""));
        const body = await readJsonBody(request);
        sendJson(response, 200, {
          approval: await service.sendApprovedDraft(
            extractIdentity(request, auth?.role ?? "operator"),
            approvalId,
            String(body.note ?? ""),
            body.confirmation_token ? String(body.confirmation_token) : undefined,
          ),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/snapshots") {
        const status = await service.getStatusReport({ httpReachable: true });
        sendJson(response, 200, { snapshot: await service.createSnapshot(status.state) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/snapshots") {
        sendJson(response, 200, { snapshots: service.listSnapshots() });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/snapshots/")) {
        const snapshotId = decodeURIComponent(url.pathname.slice("/v1/snapshots/".length));
        if (snapshotId && !snapshotId.includes("/")) {
          sendJson(response, 200, { snapshot: service.inspectSnapshot(snapshotId) });
          return;
        }
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, error instanceof HttpError ? error.statusCode : 400, {
        error: error instanceof Error ? error.message : "Unknown server error",
      });
    }
  });
}
