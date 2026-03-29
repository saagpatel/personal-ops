import { google } from "googleapis";
import type {
  Config,
  DriveDocRecord,
  DriveFileRecord,
  DriveFileScopeSource,
  DriveStatusReport,
  GmailClientConfig,
} from "./types.js";
import { createOAuthClient } from "./gmail.js";

const GOOGLE_DRIVE_METADATA_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
const GOOGLE_DOCS_READ_SCOPE = "https://www.googleapis.com/auth/documents.readonly";
const GOOGLE_DOCS_MIME_TYPE = "application/vnd.google-apps.document";
const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function createAuthorizedOAuthClient(tokensJson: string, clientConfig: GmailClientConfig) {
  const oauthClient = createOAuthClient(clientConfig);
  oauthClient.setCredentials(JSON.parse(tokensJson) as Record<string, string>);
  return oauthClient;
}

function createAuthorizedDrive(tokensJson: string, clientConfig: GmailClientConfig) {
  const oauthClient = createAuthorizedOAuthClient(tokensJson, clientConfig);
  return {
    oauthClient,
    drive: google.drive({ version: "v3", auth: oauthClient }),
  };
}

function createAuthorizedDocs(tokensJson: string, clientConfig: GmailClientConfig) {
  const oauthClient = createAuthorizedOAuthClient(tokensJson, clientConfig);
  return {
    oauthClient,
    docs: google.docs({ version: "v1", auth: oauthClient }),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildSnippet(text: string, maxLength = 220): string | undefined {
  const compact = normalizeWhitespace(text);
  if (!compact) {
    return undefined;
  }
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function collectDocTextFromStructuralElement(element: any, parts: string[]): void {
  if (!element) {
    return;
  }
  const paragraphElements = element.paragraph?.elements ?? [];
  for (const paragraphElement of paragraphElements) {
    const content = paragraphElement.textRun?.content;
    if (content) {
      parts.push(content);
    }
  }
  const tableRows = element.table?.tableRows ?? [];
  for (const row of tableRows) {
    for (const cell of row.tableCells ?? []) {
      for (const content of cell.content ?? []) {
        collectDocTextFromStructuralElement(content, parts);
      }
    }
  }
  for (const content of element.tableOfContents?.content ?? []) {
    collectDocTextFromStructuralElement(content, parts);
  }
}

function mapDriveFile(item: any, scopeSource: DriveFileScopeSource, syncedAt: string): DriveFileRecord | null {
  const fileId = item.id ? String(item.id) : "";
  if (!fileId) {
    return null;
  }
  return {
    file_id: fileId,
    name: String(item.name ?? fileId),
    mime_type: String(item.mimeType ?? "application/octet-stream"),
    web_view_link: item.webViewLink ? String(item.webViewLink) : undefined,
    icon_link: item.iconLink ? String(item.iconLink) : undefined,
    parents: Array.isArray(item.parents) ? item.parents.map((parent: unknown) => String(parent)) : [],
    scope_source: scopeSource,
    drive_modified_time: item.modifiedTime ? String(item.modifiedTime) : undefined,
    created_time: item.createdTime ? String(item.createdTime) : undefined,
    updated_at: item.modifiedTime ? String(item.modifiedTime) : syncedAt,
    synced_at: syncedAt,
  };
}

async function fetchGrantedScopes(tokensJson: string, clientConfig: GmailClientConfig): Promise<string[]> {
  const oauthClient = createAuthorizedOAuthClient(tokensJson, clientConfig);
  const accessToken = await oauthClient.getAccessToken();
  const rawToken = typeof accessToken === "string" ? accessToken : accessToken?.token;
  if (!rawToken) {
    throw new Error("Google access token could not be refreshed.");
  }
  const oauth2 = google.oauth2({ version: "v2", auth: oauthClient });
  const info = await oauth2.tokeninfo({ access_token: rawToken });
  return String(info.data.scope ?? "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export async function verifyGoogleDriveScopes(tokensJson: string, clientConfig: GmailClientConfig): Promise<string[]> {
  return fetchGrantedScopes(tokensJson, clientConfig);
}

export async function verifyGoogleDriveAccess(tokensJson: string, clientConfig: GmailClientConfig): Promise<void> {
  const scopes = await fetchGrantedScopes(tokensJson, clientConfig);
  if (!scopes.includes(GOOGLE_DRIVE_METADATA_SCOPE) || !scopes.includes(GOOGLE_DOCS_READ_SCOPE)) {
    throw new Error(
      "Google token is missing one or more required Drive or Docs read scopes.",
    );
  }
  const { drive } = createAuthorizedDrive(tokensJson, clientConfig);
  await drive.files.list({
    pageSize: 1,
    corpora: "user",
    includeItemsFromAllDrives: false,
    supportsAllDrives: false,
    fields: "files(id,name)",
    q: "trashed = false and 'me' in owners",
  });
}

async function listFolderChildren(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  folderId: string,
): Promise<any[]> {
  const { drive } = createAuthorizedDrive(tokensJson, clientConfig);
  const files: any[] = [];
  let pageToken: string | undefined;
  do {
    const params: Record<string, unknown> = {
      corpora: "user",
      includeItemsFromAllDrives: false,
      supportsAllDrives: false,
      pageSize: 1000,
      fields:
        "nextPageToken, files(id,name,mimeType,webViewLink,iconLink,parents,modifiedTime,createdTime)",
      q: `'${folderId}' in parents and trashed = false and 'me' in owners`,
    };
    if (pageToken) {
      params.pageToken = pageToken;
    }
    const response = await drive.files.list(params as any);
    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

async function getDriveFileMetadata(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  fileId: string,
): Promise<any | null> {
  const { drive } = createAuthorizedDrive(tokensJson, clientConfig);
  try {
    const response = await drive.files.get({
      fileId,
      supportsAllDrives: false,
      fields: "id,name,mimeType,webViewLink,iconLink,parents,modifiedTime,createdTime,trashed,owners",
    });
    if (!response.data.id || response.data.trashed) {
      return null;
    }
    const owners = response.data.owners ?? [];
    if (owners.length > 0 && !owners.some((owner) => owner.me)) {
      return null;
    }
    return response.data;
  } catch {
    return null;
  }
}

export async function syncDriveScope(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  config: Config,
): Promise<{
  files: DriveFileRecord[];
  docs: DriveDocRecord[];
}> {
  const syncedAt = new Date().toISOString();
  const byId = new Map<string, DriveFileRecord>();

  for (const fileId of config.includedDriveFiles) {
    const metadata = await getDriveFileMetadata(tokensJson, clientConfig, fileId);
    const mapped = metadata ? mapDriveFile(metadata, "included_file", syncedAt) : null;
    if (mapped) {
      byId.set(mapped.file_id, mapped);
    }
  }

  const queue = [...config.includedDriveFolders];
  const seenFolders = new Set<string>();
  while (queue.length > 0) {
    const folderId = queue.shift()!;
    if (seenFolders.has(folderId)) {
      continue;
    }
    seenFolders.add(folderId);
    const folderMetadata = await getDriveFileMetadata(tokensJson, clientConfig, folderId);
    const mappedFolder = folderMetadata ? mapDriveFile(folderMetadata, "included_folder_descendant", syncedAt) : null;
    if (mappedFolder) {
      byId.set(mappedFolder.file_id, mappedFolder);
    }
    const children = await listFolderChildren(tokensJson, clientConfig, folderId);
    for (const child of children) {
      const mapped = mapDriveFile(child, "included_folder_descendant", syncedAt);
      if (!mapped) {
        continue;
      }
      byId.set(mapped.file_id, mapped);
      if (mapped.mime_type === GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
        queue.push(mapped.file_id);
      }
    }
  }

  const files = [...byId.values()].sort((left, right) => {
    const leftTime = Date.parse(left.drive_modified_time ?? left.updated_at);
    const rightTime = Date.parse(right.drive_modified_time ?? right.updated_at);
    return rightTime - leftTime || left.name.localeCompare(right.name);
  });

  const docs: DriveDocRecord[] = [];
  const docIds = files.filter((file) => file.mime_type === GOOGLE_DOCS_MIME_TYPE).map((file) => file.file_id);
  for (const ids of chunk(docIds, 1)) {
    for (const fileId of ids) {
      const doc = await getGoogleDoc(tokensJson, clientConfig, fileId);
      if (doc) {
        docs.push(doc);
      }
    }
  }

  return { files, docs };
}

export async function getGoogleDoc(
  tokensJson: string,
  clientConfig: GmailClientConfig,
  fileId: string,
): Promise<DriveDocRecord | null> {
  const { docs } = createAuthorizedDocs(tokensJson, clientConfig);
  try {
    const response = await docs.documents.get({ documentId: fileId });
    if (!response.data.documentId) {
      return null;
    }
    const parts: string[] = [];
    for (const content of response.data.body?.content ?? []) {
      collectDocTextFromStructuralElement(content, parts);
    }
    const textContent = normalizeWhitespace(parts.join(" "));
    const title = String(response.data.title ?? fileId);
    const webViewLink = `https://docs.google.com/document/d/${response.data.documentId}/edit`;
    return {
      file_id: String(response.data.documentId),
      title,
      mime_type: GOOGLE_DOCS_MIME_TYPE,
      web_view_link: webViewLink,
      snippet: buildSnippet(textContent),
      text_content: textContent,
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function isGoogleDocMimeType(mimeType: string | null | undefined): boolean {
  return String(mimeType ?? "") === GOOGLE_DOCS_MIME_TYPE;
}

export function buildDriveTopItemSummary(report: DriveStatusReport): string | null {
  if (!report.enabled) {
    return null;
  }
  if (!report.authenticated) {
    return "Drive is enabled but not authenticated.";
  }
  if (report.sync_status === "degraded") {
    return "Drive sync needs attention.";
  }
  if (report.indexed_doc_count > 0) {
    return `${report.indexed_doc_count} Google Docs are available for linked context.`;
  }
  if (report.indexed_file_count > 0) {
    return `${report.indexed_file_count} Drive files are in scope, but no Google Docs have been extracted yet.`;
  }
  return "Drive is enabled but no in-scope files have been indexed yet.";
}
