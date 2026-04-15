import type { PersonalOpsDb } from "./db.js";
import type { CalendarAttendee, CalendarEvent, MailMessage } from "./types.js";

export interface AttendeeContext {
	email: string;
	display_name?: string | undefined;
	response_status?: string | undefined;
	recent_messages: Array<{
		subject?: string | undefined;
		date: string;
		direction: "inbound" | "outbound";
	}>;
	message_count: number;
	open_thread_count: number;
	meeting_count_together: number;
}

export interface MeetingContactBrief {
	event_id: string;
	title: string;
	start_at: string;
	end_at: string;
	location?: string | undefined;
	attendee_contexts: AttendeeContext[];
	minutes_until: number;
	generated_at: string;
}

const RECENT_MESSAGE_LIMIT = 5;

function classifyDirection(
	message: MailMessage,
	myEmail: string,
): "inbound" | "outbound" {
	const from = (message.from_header ?? "").toLowerCase();
	return from.includes(myEmail.toLowerCase()) ? "outbound" : "inbound";
}

function buildAttendeeContext(
	attendee: CalendarAttendee,
	db: PersonalOpsDb,
	myEmail: string,
): AttendeeContext {
	const messages = db.listMailMessagesByParticipant(
		attendee.email,
		RECENT_MESSAGE_LIMIT,
	);

	const recentMessages = messages.map((msg) => ({
		subject: msg.subject,
		date: new Date(Number(msg.internal_date)).toISOString(),
		direction: classifyDirection(msg, myEmail),
	}));

	return {
		email: attendee.email,
		display_name: attendee.display_name,
		response_status: attendee.response_status,
		recent_messages: recentMessages,
		message_count: messages.length,
		open_thread_count: db.countOpenThreadsByParticipant(attendee.email),
		meeting_count_together: db.countMeetingsWithAttendee(attendee.email),
	};
}

export function buildMeetingContactBrief(
	event: CalendarEvent,
	db: PersonalOpsDb,
	myEmail: string,
): MeetingContactBrief {
	const now = Date.now();
	const startMs = new Date(event.start_at).getTime();
	const minutesUntil = Math.round((startMs - now) / 60_000);

	const otherAttendees = (event.attendees ?? []).filter(
		(a) => !a.self && a.email.toLowerCase() !== myEmail.toLowerCase(),
	);

	const attendeeContexts = otherAttendees.map((attendee) =>
		buildAttendeeContext(attendee, db, myEmail),
	);

	return {
		event_id: event.event_id,
		title: event.summary ?? "(no title)",
		start_at: event.start_at,
		end_at: event.end_at,
		location: event.location,
		attendee_contexts: attendeeContexts,
		minutes_until: minutesUntil,
		generated_at: new Date().toISOString(),
	};
}
