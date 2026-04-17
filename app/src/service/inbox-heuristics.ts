import type { MailMessage } from "../types.js";

const HEADER_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const NOTIFICATION_SENDER_PATTERN =
	/(?:^|[._+-])(?:no-?reply|do-?not-?reply|donotreply|noreply|mailer-daemon|postmaster|verify|verification|notifications?|notification)(?:$|[._+-])/i;
const TRANSACTIONAL_SUBJECT_PATTERN =
	/(password reset|security alert|new login|confirm your email address|review your .*account settings|finish setting up your .*google|data breach scanner code)/i;

export function extractHeaderEmails(value: string | undefined): string[] {
	if (!value) {
		return [];
	}
	const matches = [...value.matchAll(HEADER_EMAIL_PATTERN)].map(
		(match) => match[0]?.trim() ?? "",
	);
	return [...new Set(matches.filter(Boolean))];
}

export function isNotificationLikeMessage(
	message: Pick<MailMessage, "from_header" | "subject">,
): boolean {
	const fromHeader = message.from_header ?? "";
	if (NOTIFICATION_SENDER_PATTERN.test(fromHeader)) {
		return true;
	}
	const subject = message.subject ?? "";
	if (TRANSACTIONAL_SUBJECT_PATTERN.test(subject)) {
		return true;
	}
	return extractHeaderEmails(fromHeader).some((email) => {
		const localPart = email.split("@").at(0) ?? "";
		return NOTIFICATION_SENDER_PATTERN.test(localPart);
	});
}
