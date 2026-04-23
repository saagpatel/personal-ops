import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Logger } from "../../src/logger.js";
import { resolvePaths } from "../../src/paths.js";
import { PersonalOpsService } from "../../src/service.js";
import type {
	AiActivitySummary,
	BridgeActivitySearchEntry,
	BridgeContextSection,
	BridgeDbClientLike,
	BridgeProjectSummaryEntry,
} from "../../src/bridge-db.js";
import type {
	Config,
	DriveDocRecord,
	DriveFileRecord,
	DriveSheetRecord,
	GithubAccount,
	GithubPullRequest,
	GmailClientConfig,
	GmailHistoryPage,
	GmailMessageMetadata,
	GmailMessageRefPage,
	GoogleCalendarEventMetadata,
	GoogleCalendarEventsPage,
	GoogleCalendarEventWriteInput,
	GoogleCalendarListPage,
	Policy,
} from "../../src/types.js";

export interface FixtureOptions {
	allowSend?: boolean;
	accountEmail?: string;
	githubEnabled?: boolean;
	includedGithubRepositories?: string[];
	githubVerifyImpl?: (
		token: string,
		keychainService: string,
	) => Promise<GithubAccount>;
	githubSyncImpl?: (
		token: string,
		repositories: string[],
		viewerLogin: string,
	) => Promise<{
		repositories_scanned_count: number;
		pull_requests: GithubPullRequest[];
	}>;
	driveEnabled?: boolean;
	includedDriveFolders?: string[];
	includedDriveFiles?: string[];
	driveVerifyImpl?: (
		tokensJson: string,
		clientConfig: GmailClientConfig,
	) => Promise<void>;
	driveScopesImpl?: (
		tokensJson: string,
		clientConfig: GmailClientConfig,
	) => Promise<string[]>;
	driveSyncImpl?: (
		tokensJson: string,
		clientConfig: GmailClientConfig,
		config: Config,
	) => Promise<{
		files: DriveFileRecord[];
		docs: DriveDocRecord[];
		sheets: DriveSheetRecord[];
	}>;
	meetingPrepWarningMinutes?: number;
	sendImpl?: (
		providerDraftId: string,
	) => Promise<{ provider_message_id: string; provider_thread_id?: string }>;
	updateImpl?: () => Promise<string>;
	verifyMetadataImpl?: () => Promise<void>;
	verifyCalendarImpl?: () => Promise<void>;
	verifyCalendarWriteImpl?: () => Promise<void>;
	listRefsImpl?: (
		labelId: string,
		pageToken?: string,
	) => Promise<GmailMessageRefPage>;
	metadataImpl?: (messageId: string) => Promise<GmailMessageMetadata>;
	historyImpl?: (
		startHistoryId: string,
		pageToken?: string,
	) => Promise<GmailHistoryPage>;
	listCalendarsImpl?: (pageToken?: string) => Promise<GoogleCalendarListPage>;
	listCalendarEventsImpl?: (
		calendarId: string,
		options: { timeMin: string; timeMax: string; pageToken?: string },
	) => Promise<GoogleCalendarEventsPage>;
	getCalendarEventImpl?: (
		calendarId: string,
		providerEventId: string,
	) => Promise<GoogleCalendarEventMetadata>;
	createCalendarEventImpl?: (
		calendarId: string,
		input: GoogleCalendarEventWriteInput,
	) => Promise<GoogleCalendarEventMetadata>;
	patchCalendarEventImpl?: (
		calendarId: string,
		providerEventId: string,
		input: GoogleCalendarEventWriteInput,
	) => Promise<GoogleCalendarEventMetadata>;
	cancelCalendarEventImpl?: (
		calendarId: string,
		providerEventId: string,
	) => Promise<void>;
	profileHistoryId?: string;
	bridgeDbClient?: BridgeDbClientLike;
}


const servicesToClose = new Set<PersonalOpsService>();

export class NoopBridgeDbClient implements BridgeDbClientLike {
	async close(): Promise<void> {}

	async getActivitySummary(): Promise<AiActivitySummary> {
		return {
			current_month: new Date().toISOString().slice(0, 7),
			monthly_costs: [],
			recent_activity: [],
			open_handoffs: [],
			briefing_line: "bridge-db disabled for tests",
		};
	}

	async searchActivity(): Promise<BridgeActivitySearchEntry[]> {
		return [];
	}

	async getProjectSummary(): Promise<BridgeProjectSummaryEntry[]> {
		return [];
	}

	async getContextSections(): Promise<BridgeContextSection[]> {
		return [];
	}

	logActivity(
		_projectName: string,
		_summary: string,
		_tags: string[],
		_branch: string | null = null,
	): void {
		void _branch;
	}

	recordCost(_system: string, _month: string, _amount: number): void {}

	saveSnapshot(_data: Record<string, unknown>): void {}
}

test.after(async () => {
	for (const service of servicesToClose) {
		try {
			await service.close();
		} catch {
			// Best-effort test cleanup.
		}
	}
	servicesToClose.clear();
});

export function createFixture(options: FixtureOptions = {}) {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), "personal-ops-service-"));
	process.env.PERSONAL_OPS_CONFIG_DIR = path.join(base, "config");
	process.env.PERSONAL_OPS_STATE_DIR = path.join(base, "state");
	process.env.PERSONAL_OPS_LOG_DIR = path.join(base, "logs");
	process.env.PERSONAL_OPS_APP_DIR = path.join(base, "app");

	const paths = resolvePaths();
	fs.mkdirSync(paths.configDir, { recursive: true });
	fs.mkdirSync(paths.stateDir, { recursive: true });
	fs.mkdirSync(paths.logDir, { recursive: true });
	fs.mkdirSync(paths.appDir, { recursive: true });
	fs.mkdirSync(paths.snapshotsDir, { recursive: true });

	const accountEmail = options.accountEmail ?? "machine@example.com";
	const githubRepositories = options.includedGithubRepositories ?? [];
	const driveFolders = options.includedDriveFolders ?? [];
	const driveFiles = options.includedDriveFiles ?? [];

	fs.writeFileSync(
		paths.configFile,
		`[service]
host = "127.0.0.1"
port = 46210

[http]
allowed_origins = []

[gmail]
account_email = "${accountEmail}"
review_url = "https://mail.google.com/mail/u/0/#drafts"

[github]
enabled = ${options.githubEnabled ? "true" : "false"}
included_repositories = [${githubRepositories.map((value) => `"${value}"`).join(", ")}]
sync_interval_minutes = 10
keychain_service = "personal-ops.github.test"

[drive]
enabled = ${options.driveEnabled ? "true" : "false"}
included_folders = [${driveFolders.map((value) => `"${value}"`).join(", ")}]
included_files = [${driveFiles.map((value) => `"${value}"`).join(", ")}]
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
    meeting_prep_warning_minutes = ${options.meetingPrepWarningMinutes ?? 30}
    day_overload_event_threshold = 6
schedule_pressure_free_minutes_threshold = 60

[auth]
keychain_service = "personal-ops.gmail.test"
oauth_client_file = "${paths.oauthClientFile}"
`,
		"utf8",
	);
	fs.writeFileSync(
		paths.policyFile,
		`[notifications]
title_prefix = "Personal Ops"

[security]
allow_send = ${options.allowSend ? "true" : "false"}

[audit]
default_limit = 50
`,
		"utf8",
	);
	fs.writeFileSync(
		paths.oauthClientFile,
		JSON.stringify({
			installed: {
				client_id: "client-id",
				client_secret: "client-secret",
				auth_uri: "https://accounts.google.com/o/oauth2/auth",
				token_uri: "https://oauth2.googleapis.com/token",
				redirect_uris: ["http://127.0.0.1"],
			},
		}),
		"utf8",
	);
	fs.writeFileSync(paths.apiTokenFile, "test-token", "utf8");
	fs.writeFileSync(paths.assistantApiTokenFile, "assistant-token", "utf8");
	fs.writeFileSync(paths.appLogFile, '{"event":"test"}\n', "utf8");
	fs.writeFileSync(
		path.join(paths.appDir, "package.json"),
		JSON.stringify({ version: "0.1.0-test" }),
		"utf8",
	);

	const config: Config = {
		serviceHost: "127.0.0.1",
		servicePort: 46210,
		allowedOrigins: [],
		autopilotEnabled: true,
		autopilotMode: "continuous",
		autopilotRunIntervalMinutes: 5,
		autopilotWarmOnConsoleOpen: true,
		autopilotWarmOnDesktopOpen: true,
		autopilotProfiles: [
			"day_start",
			"inbox",
			"meetings",
			"planning",
			"outbound",
		],
		autopilotFailureBackoffMinutes: 15,
		autopilotNotificationCooldownMinutes: 30,
		gmailAccountEmail: accountEmail,
		gmailReviewUrl: "https://mail.google.com/mail/u/0/#drafts",
		githubEnabled: options.githubEnabled ?? false,
		includedGithubRepositories: githubRepositories,
		githubSyncIntervalMinutes: 10,
		githubKeychainService: "personal-ops.github.test",
		driveEnabled: options.driveEnabled ?? false,
		includedDriveFolders: driveFolders,
		includedDriveFiles: driveFiles,
		driveSyncIntervalMinutes: 30,
		driveRecentDocsLimit: 10,
		calendarEnabled: true,
		calendarProvider: "google",
		includedCalendarIds: [],
		calendarSyncPastDays: 30,
		calendarSyncFutureDays: 90,
		calendarSyncIntervalMinutes: 5,
		workdayStartLocal: "09:00",
		workdayEndLocal: "18:00",
		meetingPrepWarningMinutes: options.meetingPrepWarningMinutes ?? 30,
		dayOverloadEventThreshold: 6,
		schedulePressureFreeMinutesThreshold: 60,
		keychainService: "personal-ops.gmail.test",
		oauthClientFile: paths.oauthClientFile,
		apiToken: "test-token",
		assistantApiToken: "assistant-token",
	};
	const policy: Policy = {
		notificationsTitlePrefix: "Personal Ops",
		allowSend: options.allowSend ?? false,
		auditDefaultLimit: 50,
	};
	const logger = new Logger(paths);
	const keychainSecrets = new Map<string, string>();

	const clientConfig: GmailClientConfig = {
		client_id: "client-id",
		client_secret: "client-secret",
		auth_uri: "https://accounts.google.com/o/oauth2/auth",
		token_uri: "https://oauth2.googleapis.com/token",
		redirect_uris: ["http://127.0.0.1"],
	};

	const service = new PersonalOpsService(paths, config, policy, logger, {
		createBridgeDbClient: () => options.bridgeDbClient ?? new NoopBridgeDbClient(),
		loadStoredGmailTokens: async () => ({
			email: accountEmail,
			clientConfig,
			tokensJson: JSON.stringify({ refresh_token: "refresh-token" }),
		}),
		sendGmailDraft: async (_tokensJson, _clientConfig, providerDraftId) =>
			options.sendImpl
				? options.sendImpl(providerDraftId)
				: {
						provider_message_id: `message-${providerDraftId}`,
						provider_thread_id: "thread-1",
					},
		updateGmailDraft: async () =>
			options.updateImpl ? options.updateImpl() : "provider-draft-1",
		createGmailDraft: async () => "provider-draft-1",
		getGmailProfile: async () => ({
			oauthClient: {} as never,
			profile: {
				emailAddress: accountEmail,
				historyId: options.profileHistoryId ?? "2000",
			},
		}),
		verifyGmailMetadataAccess: async () => {
			if (options.verifyMetadataImpl) {
				await options.verifyMetadataImpl();
			}
		},
		verifyGoogleCalendarAccess: async () => {
			if (options.verifyCalendarImpl) {
				await options.verifyCalendarImpl();
			}
		},
		verifyGoogleCalendarWriteAccess: async () => {
			if (options.verifyCalendarWriteImpl) {
				await options.verifyCalendarWriteImpl();
			}
		},
		verifyGoogleDriveAccess: async (tokensJson, activeClientConfig) => {
			if (options.driveVerifyImpl) {
				await options.driveVerifyImpl(tokensJson, activeClientConfig);
			}
		},
		verifyGoogleDriveScopes: async (tokensJson, activeClientConfig) =>
			options.driveScopesImpl
				? options.driveScopesImpl(tokensJson, activeClientConfig)
				: [],
		syncDriveScope: async (tokensJson, activeClientConfig, activeConfig) =>
			options.driveSyncImpl
				? options.driveSyncImpl(tokensJson, activeClientConfig, activeConfig)
				: { files: [], docs: [], sheets: [] },
		getGoogleDoc: async () => null,
		listGmailMessageRefsByLabel: async (
			_tokensJson,
			_clientConfig,
			labelId,
			pageToken,
		) =>
			options.listRefsImpl
				? options.listRefsImpl(labelId, pageToken)
				: { message_ids: [] },
		getGmailMessageMetadata: async (_tokensJson, _clientConfig, messageId) => {
			if (options.metadataImpl) {
				return options.metadataImpl(messageId);
			}
			throw new Error(`No metadata stub for ${messageId}.`);
		},
		listGmailHistory: async (
			_tokensJson,
			_clientConfig,
			startHistoryId,
			pageToken,
		) =>
			options.historyImpl
				? options.historyImpl(startHistoryId, pageToken)
				: { records: [], history_id: startHistoryId },
		listGoogleCalendarSources: async (_tokensJson, _clientConfig, pageToken) =>
			options.listCalendarsImpl
				? options.listCalendarsImpl(pageToken)
				: { calendars: [] },
		listGoogleCalendarEvents: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			calendarOptions,
		) =>
			options.listCalendarEventsImpl
				? options.listCalendarEventsImpl(calendarId, calendarOptions)
				: { events: [] },
		verifyGithubToken: async (token, keychainService) =>
			options.githubVerifyImpl
				? options.githubVerifyImpl(token, keychainService)
				: {
						login: "octocat",
						keychain_service: keychainService,
						keychain_account: "octocat",
						connected_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
						profile_json: JSON.stringify({ login: "octocat" }),
					},
		syncGithubPullRequests: async (token, repositories, viewerLogin) =>
			options.githubSyncImpl
				? options.githubSyncImpl(token, repositories, viewerLogin)
				: {
						repositories_scanned_count: repositories.length,
						pull_requests: [],
					},
		setKeychainSecret: (serviceName, accountName, secret) => {
			keychainSecrets.set(`${serviceName}:${accountName}`, secret);
		},
		getKeychainSecret: (serviceName, accountName) =>
			keychainSecrets.get(`${serviceName}:${accountName}`) ?? null,
		deleteKeychainSecret: (serviceName, accountName) => {
			keychainSecrets.delete(`${serviceName}:${accountName}`);
		},
		getGoogleCalendarEvent: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			providerEventId,
		) => {
			if (options.getCalendarEventImpl) {
				return options.getCalendarEventImpl(calendarId, providerEventId);
			}
			throw new Error(
				`No calendar get stub for ${calendarId}:${providerEventId}.`,
			);
		},
		createGoogleCalendarEvent: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			input,
		) => {
			if (options.createCalendarEventImpl) {
				return options.createCalendarEventImpl(calendarId, input);
			}
			throw new Error(`No calendar create stub for ${calendarId}.`);
		},
		patchGoogleCalendarEvent: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			providerEventId,
			input,
		) => {
			if (options.patchCalendarEventImpl) {
				return options.patchCalendarEventImpl(
					calendarId,
					providerEventId,
					input,
				);
			}
			throw new Error(
				`No calendar patch stub for ${calendarId}:${providerEventId}.`,
			);
		},
		cancelGoogleCalendarEvent: async (
			_tokensJson,
			_clientConfig,
			calendarId,
			providerEventId,
		) => {
			if (options.cancelCalendarEventImpl) {
				await options.cancelCalendarEventImpl(calendarId, providerEventId);
				return;
			}
			throw new Error(
				`No calendar cancel stub for ${calendarId}:${providerEventId}.`,
			);
		},
		openExternalUrl: () => {},
	});
	service.db.upsertMailAccount(
		accountEmail,
		config.keychainService,
		JSON.stringify({ emailAddress: accountEmail }),
	);
	servicesToClose.add(service);

	return { paths, service, accountEmail, config, policy };
}

