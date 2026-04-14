import { calendar_v3, google } from "googleapis";
import {
  GmailClientConfig,
  GoogleCalendarEventsPage,
  GoogleCalendarEventMetadata,
  GoogleCalendarEventWriteInput,
  GoogleCalendarListPage,
} from "./types.js";
import { createOAuthClient } from "./gmail.js";

const GOOGLE_CALENDAR_OWNED_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
const GOOGLE_CALENDAR_BROAD_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function createAuthorizedOAuthClient(tokensJson: string, clientConfig: GmailClientConfig) {
  const oauthClient = createOAuthClient(clientConfig);
  oauthClient.setCredentials(JSON.parse(tokensJson) as Record<string, string>);
  return oauthClient;
}

function createAuthorizedCalendar(
  tokensJson: string,
  clientConfig: GmailClientConfig,
): calendar_v3.Calendar {
  const oauthClient = createAuthorizedOAuthClient(tokensJson, clientConfig);
  return google.calendar({ version: "v3", auth: oauthClient });
}

function parseCalendarTime(
  value: calendar_v3.Schema$EventDateTime | null | undefined,
): { at: string; isAllDay: boolean } {
  if (value?.dateTime) {
    return {
      at: new Date(value.dateTime).toISOString(),
      isAllDay: false,
    };
  }
  if (value?.date) {
    const parts = value.date.split("-");
    const year = Number.isFinite(Number(parts[0])) ? Number(parts[0]) : 1970;
    const month = Number.isFinite(Number(parts[1])) ? Number(parts[1]) : 1;
    const day = Number.isFinite(Number(parts[2])) ? Number(parts[2]) : 1;
    return {
      at: new Date(year, month - 1, day, 0, 0, 0, 0).toISOString(),
      isAllDay: true,
    };
  }
  const now = new Date().toISOString();
  return { at: now, isAllDay: false };
}

function parseGoogleCalendarEvent(
  calendarId: string,
  item: calendar_v3.Schema$Event,
): GoogleCalendarEventMetadata {
  const start = parseCalendarTime(item.start);
  const end = parseCalendarTime(item.end);
  const selfAttendee = (item.attendees ?? []).find((attendee) => attendee.self);
  const privateProperties = item.extendedProperties?.private ?? {};
  const createdByPersonalOps = privateProperties.po_source === "personal-ops";
  return {
    event_id: String(item.id),
    calendar_id: calendarId,
    i_cal_uid: item.iCalUID ?? undefined,
    etag: item.etag ?? undefined,
    summary: item.summary ?? undefined,
    location: item.location ?? undefined,
    notes: item.description ?? undefined,
    html_link: item.htmlLink ?? undefined,
    status: String(item.status ?? "confirmed"),
    event_type: item.eventType ?? undefined,
    visibility: item.visibility ?? undefined,
    transparency: item.transparency ?? undefined,
    start_at: start.at,
    end_at: end.at,
    is_all_day: start.isAllDay,
    is_busy: item.transparency !== "transparent" && item.status !== "cancelled",
    recurring_event_id: item.recurringEventId ?? undefined,
    organizer_email: item.organizer?.email ?? undefined,
    self_response_status: selfAttendee?.responseStatus ?? undefined,
    attendee_count: item.attendees?.length ?? 0,
    source_task_id: privateProperties.po_source_task_id ?? undefined,
    created_by_personal_ops: createdByPersonalOps,
    updated_at: item.updated ?? new Date().toISOString(),
  };
}

export async function verifyGoogleCalendarAccess(tokensJson: string, clientConfig: GmailClientConfig) {
  const calendar = createAuthorizedCalendar(tokensJson, clientConfig);
  await calendar.calendarList.list({
    maxResults: 1,
  });
}

export async function verifyGoogleCalendarWriteAccess(tokensJson: string, clientConfig: GmailClientConfig) {
  const oauthClient = createAuthorizedOAuthClient(tokensJson, clientConfig);
  const accessToken = await oauthClient.getAccessToken();
  const rawToken = typeof accessToken === "string" ? accessToken : accessToken?.token;
  if (!rawToken) {
    throw new Error("Google access token could not be refreshed for calendar write verification.");
  }
  const oauth2 = google.oauth2({ version: "v2", auth: oauthClient });
  const info = await oauth2.tokeninfo({ access_token: rawToken });
  const scopes = String(info.data.scope ?? "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (!scopes.includes(GOOGLE_CALENDAR_OWNED_SCOPE) && !scopes.includes(GOOGLE_CALENDAR_BROAD_SCOPE)) {
    throw new Error("Google token is missing the calendar.events.owned write scope.");
  }
}

export async function listGoogleCalendarSources(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  pageToken?: string,
): Promise<GoogleCalendarListPage> {
  const calendar = createAuthorizedCalendar(tokensJson, clientConfig);
  const params: calendar_v3.Params$Resource$Calendarlist$List = {
    maxResults: 100,
    showDeleted: false,
    showHidden: false,
  };
  if (pageToken) params.pageToken = pageToken;
  const response = await calendar.calendarList.list(params);
  return {
    calendars: (response.data.items ?? [])
      .map((item) => ({
        calendar_id: String(item.id ?? ""),
        title: String(item.summaryOverride ?? item.summary ?? ""),
        time_zone: item.timeZone ?? undefined,
        access_role: item.accessRole ?? undefined,
        is_primary: Boolean(item.primary),
        is_selected: item.selected !== false,
        background_color: item.backgroundColor ?? undefined,
        foreground_color: item.foregroundColor ?? undefined,
      }))
      .filter((item: { calendar_id: string }) => item.calendar_id),
    next_page_token: response.data.nextPageToken ?? undefined,
  };
}

export async function listGoogleCalendarEvents(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  calendarId: string,
  options: {
    timeMin: string;
    timeMax: string;
    pageToken?: string;
  },
): Promise<GoogleCalendarEventsPage> {
  const calendar = createAuthorizedCalendar(tokensJson, clientConfig);
  const params: calendar_v3.Params$Resource$Events$List = {
    calendarId,
    timeMin: options.timeMin,
    timeMax: options.timeMax,
    maxResults: 250,
    singleEvents: true,
    showDeleted: true,
    orderBy: "startTime",
  };
  if (options.pageToken) params.pageToken = options.pageToken;
  const response = await calendar.events.list(params);

  return {
    events: (response.data.items ?? [])
      .filter((item) => item.id && item.start && item.end)
      .map((item) => parseGoogleCalendarEvent(calendarId, item)),
    next_page_token: response.data.nextPageToken ?? undefined,
  };
}

export async function getGoogleCalendarEvent(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  calendarId: string,
  providerEventId: string,
): Promise<GoogleCalendarEventMetadata> {
  const calendar = createAuthorizedCalendar(tokensJson, clientConfig);
  const response = await calendar.events.get({
    calendarId,
    eventId: providerEventId,
  });
  if (!response.data.id || !response.data.start || !response.data.end) {
    throw new Error(`Google Calendar event ${providerEventId} could not be loaded for mutation.`);
  }
  return parseGoogleCalendarEvent(calendarId, response.data);
}

export async function createGoogleCalendarEvent(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  calendarId: string,
  input: GoogleCalendarEventWriteInput,
): Promise<GoogleCalendarEventMetadata> {
  const calendar = createAuthorizedCalendar(tokensJson, clientConfig);
  const requestBody: calendar_v3.Schema$Event = {
    start: {
      dateTime: input.start_at ?? null,
    },
    end: {
      dateTime: input.end_at ?? null,
    },
    transparency: "opaque",
    extendedProperties: {
      private: {
        po_source: "personal-ops",
        ...(input.source_task_id ? { po_source_task_id: input.source_task_id } : {}),
        ...(input.created_by_client ? { po_created_by: input.created_by_client } : {}),
      },
    },
  };
  if (input.title !== undefined) requestBody.summary = input.title;
  if (input.location !== undefined) requestBody.location = input.location;
  if (input.notes !== undefined) requestBody.description = input.notes;
  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "none",
    requestBody,
  });
  if (!response.data.id || !response.data.start || !response.data.end) {
    throw new Error("Google Calendar did not return a complete event after creation.");
  }
  return parseGoogleCalendarEvent(calendarId, response.data);
}

export async function patchGoogleCalendarEvent(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  calendarId: string,
  providerEventId: string,
  input: GoogleCalendarEventWriteInput,
): Promise<GoogleCalendarEventMetadata> {
  const calendar = createAuthorizedCalendar(tokensJson, clientConfig);
  const requestBody: calendar_v3.Schema$Event = {};
  if (input.title !== undefined) requestBody.summary = input.title;
  if (input.location !== undefined) requestBody.location = input.location;
  if (input.notes !== undefined) requestBody.description = input.notes;
  if (input.start_at !== undefined) requestBody.start = { dateTime: input.start_at };
  if (input.end_at !== undefined) requestBody.end = { dateTime: input.end_at };
  if (input.source_task_id !== undefined || input.created_by_client !== undefined) {
    requestBody.extendedProperties = {
      private: {
        po_source: "personal-ops",
        ...(input.source_task_id ? { po_source_task_id: input.source_task_id } : {}),
        ...(input.created_by_client ? { po_created_by: input.created_by_client } : {}),
      },
    };
  }
  const response = await calendar.events.patch({
    calendarId,
    eventId: providerEventId,
    sendUpdates: "none",
    requestBody,
  });
  if (!response.data.id || !response.data.start || !response.data.end) {
    throw new Error(`Google Calendar did not return a complete event after updating ${providerEventId}.`);
  }
  return parseGoogleCalendarEvent(calendarId, response.data);
}

export async function cancelGoogleCalendarEvent(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  calendarId: string,
  providerEventId: string,
): Promise<void> {
  const calendar = createAuthorizedCalendar(tokensJson, clientConfig);
  await calendar.events.delete({
    calendarId,
    eventId: providerEventId,
    sendUpdates: "none",
  });
}
