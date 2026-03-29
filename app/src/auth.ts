import crypto from "node:crypto";
import fs from "node:fs";
import { google } from "googleapis";
import { PersonalOpsDb } from "./db.js";
import { parseGmailClientConfig, createOAuthClient, getGmailProfile } from "./gmail.js";
import { getKeychainSecret, setKeychainSecret } from "./keychain.js";
import { Logger } from "./logger.js";
import { Config, PendingAuthSession } from "./types.js";

const pendingSessions = new Map<string, PendingAuthSession>();

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const GOOGLE_SHARED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
];

export function startGoogleAuth(config: Config, callbackPort: number) {
  const clientConfig = parseGmailClientConfig(fs.readFileSync(config.oauthClientFile, "utf8"));
  const state = crypto.randomUUID();
  const codeVerifier = toBase64Url(crypto.randomBytes(48));
  const codeChallenge = toBase64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  const redirectUri = `http://127.0.0.1:${callbackPort}/oauth2/callback`;
  const oauthClient = createOAuthClient(clientConfig, redirectUri);
  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_SHARED_SCOPES,
    state,
    prompt: "consent",
    include_granted_scopes: true,
    code_challenge: codeChallenge,
    code_challenge_method: "S256" as any,
  });
  pendingSessions.set(state, {
    state,
    codeVerifier,
    redirectUri,
    createdAt: new Date().toISOString(),
  });
  return {
    auth_url: authUrl,
    state,
    redirect_uri: redirectUri,
  };
}

export function startGmailAuth(config: Config, callbackPort: number) {
  return startGoogleAuth(config, callbackPort);
}

export async function completeGoogleAuth(
  config: Config,
  db: PersonalOpsDb,
  logger: Logger,
  state: string,
  code: string,
) {
  const pending = pendingSessions.get(state);
  if (!pending) {
    throw new Error("The Gmail auth session was not found or has expired.");
  }
  const clientConfig = parseGmailClientConfig(fs.readFileSync(config.oauthClientFile, "utf8"));
  const oauthClient = createOAuthClient(clientConfig, pending.redirectUri);
  const tokenResponse = await oauthClient.getToken({
    code,
    codeVerifier: pending.codeVerifier,
    redirect_uri: pending.redirectUri,
  });
  if (!tokenResponse.tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove the existing grant and try again with prompt=consent.");
  }
  const tokensJson = JSON.stringify(tokenResponse.tokens);
  const profileResult = await getGmailProfile(tokensJson, clientConfig);
  const email = profileResult.profile.emailAddress;
  if (!email) {
    throw new Error("Google profile lookup succeeded but no mailbox email was returned.");
  }
  if (config.gmailAccountEmail && config.gmailAccountEmail !== email) {
    throw new Error(
      `The configured mailbox (${config.gmailAccountEmail}) does not match the authenticated Gmail account (${email}).`,
    );
  }
  setKeychainSecret(config.keychainService, email, tokensJson);
  db.upsertMailAccount(email, config.keychainService, JSON.stringify(profileResult.profile));
  pendingSessions.delete(state);
  logger.info("gmail_auth_completed", { email });
  return { email };
}

export async function completeGmailAuth(
  config: Config,
  db: PersonalOpsDb,
  logger: Logger,
  state: string,
  code: string,
) {
  return completeGoogleAuth(config, db, logger, state, code);
}

export async function loadStoredGmailTokens(config: Config, db: PersonalOpsDb) {
  const account = db.getMailAccount();
  if (!account) {
    throw new Error("No Gmail account is connected. Run `personal-ops auth gmail login` first.");
  }
  const secret = getKeychainSecret(account.keychain_service, account.keychain_account);
  if (!secret) {
    throw new Error("The Gmail refresh token is missing from Keychain.");
  }
  const clientConfig = parseGmailClientConfig(fs.readFileSync(config.oauthClientFile, "utf8"));
  return {
    email: account.email,
    clientConfig,
    tokensJson: secret,
  };
}
