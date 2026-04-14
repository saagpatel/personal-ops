import { gmail_v1, google } from "googleapis";
import {
  DraftInput,
  GmailClientConfig,
  GmailHistoryPage,
  GmailMessageMetadata,
  GmailMessageRefPage,
  GmailSendResult,
} from "./types.js";

function encodeHeader(value: string): string {
  return value && /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r?\n/g, "\r\n");
}

function buildMimeMessage(from: string, draft: DraftInput): string {
  const headers = [
    `From: ${from}`,
    `To: ${draft.to.join(", ")}`,
    draft.cc.length ? `Cc: ${draft.cc.join(", ")}` : "",
    draft.bcc.length ? `Bcc: ${draft.bcc.join(", ")}` : "",
    `Subject: ${encodeHeader(draft.subject)}`,
    "MIME-Version: 1.0",
  ].filter(Boolean);

  if (draft.body_html && draft.body_text) {
    const boundary = `personal_ops_${Date.now().toString(16)}`;
    return normalizeLineEndings(
      `${headers.join("\n")}
Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: 8bit

${draft.body_text}
--${boundary}
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: 8bit

${draft.body_html}
--${boundary}--`,
    );
  }

  const contentType = draft.body_html ? "text/html" : "text/plain";
  const body = draft.body_html ?? draft.body_text ?? "";
  return normalizeLineEndings(
    `${headers.join("\n")}
Content-Type: ${contentType}; charset="UTF-8"
Content-Transfer-Encoding: 8bit

${body}`,
  );
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function parseGmailClientConfig(raw: string): GmailClientConfig {
  const parsed = JSON.parse(raw) as { installed?: GmailClientConfig };
  if (!parsed.installed?.client_id || !parsed.installed?.client_secret) {
    throw new Error("Gmail OAuth client file is present but not configured with a desktop app client.");
  }
  return parsed.installed;
}

export function createOAuthClient(clientConfig: GmailClientConfig, redirectUri?: string) {
  return new google.auth.OAuth2(
    clientConfig.client_id,
    clientConfig.client_secret,
    redirectUri ?? clientConfig.redirect_uris[0] ?? "http://127.0.0.1",
  );
}

function createAuthorizedGmail(tokensJson: string, clientConfig: GmailClientConfig): {
  oauthClient: ReturnType<typeof createOAuthClient>;
  gmail: gmail_v1.Gmail;
} {
  const oauthClient = createOAuthClient(clientConfig);
  oauthClient.setCredentials(JSON.parse(tokensJson) as Record<string, string>);
  return {
    oauthClient,
    gmail: google.gmail({ version: "v1", auth: oauthClient }),
  };
}

function readHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string | undefined {
  const match = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return match?.value ?? undefined;
}

export async function getGmailProfile(tokensJson: string, clientConfig: GmailClientConfig) {
  const { oauthClient, gmail } = createAuthorizedGmail(tokensJson, clientConfig);
  const profile = await gmail.users.getProfile({ userId: "me" });
  return {
    oauthClient,
    profile: profile.data,
  };
}

export async function verifyGmailMetadataAccess(tokensJson: string, clientConfig: GmailClientConfig) {
  const { gmail } = createAuthorizedGmail(tokensJson, clientConfig);
  await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX"],
    maxResults: 1,
  });
}

export async function createGmailDraft(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  mailbox: string,
  draft: DraftInput,
) {
  const { gmail } = createAuthorizedGmail(tokensJson, clientConfig);
  const raw = toBase64Url(buildMimeMessage(mailbox, draft));
  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw },
    },
  });
  const providerDraftId = response.data.id;
  if (!providerDraftId) {
    throw new Error("Gmail draft creation did not return a draft id.");
  }
  return providerDraftId;
}

export async function updateGmailDraft(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  mailbox: string,
  providerDraftId: string,
  draft: DraftInput,
) {
  const { gmail } = createAuthorizedGmail(tokensJson, clientConfig);
  const raw = toBase64Url(buildMimeMessage(mailbox, draft));
  const response = await gmail.users.drafts.update({
    userId: "me",
    id: providerDraftId,
    requestBody: {
      id: providerDraftId,
      message: { raw },
    },
  });
  const updatedId = response.data.id;
  if (!updatedId) {
    throw new Error("Gmail draft update did not return a draft id.");
  }
  return updatedId;
}

export async function sendGmailDraft(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  providerDraftId: string,
): Promise<GmailSendResult> {
  const { gmail } = createAuthorizedGmail(tokensJson, clientConfig);
  const response = await gmail.users.drafts.send({
    userId: "me",
    requestBody: {
      id: providerDraftId,
    },
  });
  const providerMessageId = response.data.id;
  if (!providerMessageId) {
    throw new Error("Gmail draft send did not return a message id.");
  }
  return {
    provider_message_id: providerMessageId,
    provider_thread_id: response.data.threadId ?? undefined,
  };
}

export async function listGmailMessageRefsByLabel(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  labelId: string,
  pageToken?: string,
): Promise<GmailMessageRefPage> {
  const { gmail } = createAuthorizedGmail(tokensJson, clientConfig);
  const params: gmail_v1.Params$Resource$Users$Messages$List = {
    userId: "me",
    labelIds: [labelId],
    maxResults: 100,
  };
  if (pageToken) {
    params.pageToken = pageToken;
  }
  const response = await gmail.users.messages.list(params);
  return {
    message_ids: (response.data.messages ?? []).map((message: { id?: string | null }) => String(message.id)).filter(Boolean),
    next_page_token: response.data.nextPageToken ?? undefined,
  };
}

export async function getGmailMessageMetadata(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  messageId: string,
): Promise<GmailMessageMetadata> {
  const { gmail } = createAuthorizedGmail(tokensJson, clientConfig);
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Subject"],
  });
  const message = response.data;
  if (!message.id || !message.threadId || !message.internalDate) {
    throw new Error(`Gmail message metadata for ${messageId} is incomplete.`);
  }
  return {
    message_id: message.id,
    thread_id: message.threadId,
    history_id: message.historyId ?? undefined,
    internal_date: message.internalDate,
    label_ids: (message.labelIds ?? []).map((label) => String(label)),
    from_header: readHeader(message.payload?.headers, "From"),
    to_header: readHeader(message.payload?.headers, "To"),
    subject: readHeader(message.payload?.headers, "Subject"),
  };
}

export async function listGmailHistory(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  startHistoryId: string,
  pageToken?: string,
): Promise<GmailHistoryPage> {
  const { gmail } = createAuthorizedGmail(tokensJson, clientConfig);
  const params: gmail_v1.Params$Resource$Users$History$List = {
    userId: "me",
    startHistoryId,
    historyTypes: ["messageAdded", "labelsAdded", "labelsRemoved", "messageDeleted"],
    maxResults: 100,
  };
  if (pageToken) {
    params.pageToken = pageToken;
  }
  const response = await gmail.users.history.list(params);
  const records = (response.data.history ?? []).map((entry) => {
    const refreshIds = new Set<string>();
    const deletedIds = new Set<string>();
    for (const item of entry.messagesAdded ?? []) {
      if (item.message?.id) refreshIds.add(String(item.message.id));
    }
    for (const item of entry.labelsAdded ?? []) {
      if (item.message?.id) refreshIds.add(String(item.message.id));
    }
    for (const item of entry.labelsRemoved ?? []) {
      if (item.message?.id) refreshIds.add(String(item.message.id));
    }
    for (const item of entry.messages ?? []) {
      if (item.id) refreshIds.add(String(item.id));
    }
    for (const item of entry.messagesDeleted ?? []) {
      if (item.message?.id) deletedIds.add(String(item.message.id));
    }
    for (const deletedId of deletedIds) {
      refreshIds.delete(deletedId);
    }
    return {
      message_ids_to_refresh: [...refreshIds],
      message_ids_deleted: [...deletedIds],
    };
  });
  return {
    records,
    next_page_token: response.data.nextPageToken ?? undefined,
    history_id: response.data.historyId ?? undefined,
  };
}
