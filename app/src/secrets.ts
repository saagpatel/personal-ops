import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { GmailClientConfig } from "./types.js";

export type OAuthClientValidationStatus =
  | "missing"
  | "unreadable"
  | "empty"
  | "malformed_json"
  | "invalid_desktop_client"
  | "placeholder"
  | "missing_required_fields"
  | "configured";

export interface OAuthClientValidation {
  status: OAuthClientValidationStatus;
  message: string;
  clientConfig?: GmailClientConfig;
}

export type SecretTextFileStatus = "missing" | "unreadable" | "empty" | "configured";

export interface SecretTextFileValidation {
  status: SecretTextFileStatus;
  message: string;
}

export type SecretFilePermissionsStatus = "missing" | "unreadable" | "secure" | "too_broad";

export interface SecretFilePermissionsValidation {
  status: SecretFilePermissionsStatus;
  message: string;
  mode?: number;
}

export interface SecretFilePermissionsRepair {
  status: "updated" | "already_secure" | "missing" | "failed";
  message: string;
  previousMode?: number | undefined;
  currentMode?: number | undefined;
}

export type KeychainProbeStatus = "present" | "missing" | "unavailable";

export interface KeychainProbeResult {
  status: KeychainProbeStatus;
  message: string;
  secret: string | null;
}

interface KeychainDependencies {
  execFileSyncImpl?: typeof execFileSync;
}

function renderMode(mode: number | undefined): string {
  return mode === undefined ? "unknown" : `0${(mode & 0o777).toString(8)}`;
}

function readUtf8File(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function isDesktopRedirectUri(value: string): boolean {
  return value.startsWith("http://127.0.0.1") || value.startsWith("http://localhost");
}

function extractErrorText(error: unknown): string {
  if (error instanceof Error) {
    const extra = (error as Error & { stderr?: string | Buffer; stdout?: string | Buffer }).stderr;
    if (typeof extra === "string" && extra.trim()) {
      return extra.trim();
    }
    if (Buffer.isBuffer(extra) && extra.length > 0) {
      return extra.toString("utf8").trim();
    }
    return error.message;
  }
  return String(error);
}

export function validateOAuthClientFile(filePath: string): OAuthClientValidation {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    return {
      status: "missing",
      message: "OAuth client path is blank. Fill in config.toml or remove the blank override.",
    };
  }
  if (!fs.existsSync(normalizedPath)) {
    return {
      status: "missing",
      message: `OAuth client file is missing at ${normalizedPath}. Place the Google Desktop OAuth client JSON there.`,
    };
  }
  try {
    fs.accessSync(normalizedPath, fs.constants.R_OK);
  } catch (error) {
    return {
      status: "unreadable",
      message: error instanceof Error ? error.message : `${normalizedPath} could not be read.`,
    };
  }

  const raw = readUtf8File(normalizedPath);
  if (raw.trim().length === 0) {
    return {
      status: "empty",
      message: `OAuth client file ${normalizedPath} is empty. Replace it with the Google Desktop OAuth client JSON.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: "malformed_json",
      message: `OAuth client file ${normalizedPath} is not valid JSON. Replace it with the Google Desktop OAuth client JSON.`,
    };
  }

  const installed =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { installed?: unknown }).installed : undefined;
  if (!installed || typeof installed !== "object" || Array.isArray(installed)) {
    return {
      status: "invalid_desktop_client",
      message: `OAuth client file ${normalizedPath} must contain an installed desktop client block.`,
    };
  }

  const doc = installed as Record<string, unknown>;
  const clientId = String(doc.client_id ?? "").trim();
  const clientSecret = String(doc.client_secret ?? "").trim();
  const redirectUris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map((value) => String(value).trim()) : [];

  if (!clientId && !clientSecret) {
    return {
      status: "placeholder",
      message: `OAuth client file ${normalizedPath} is still the placeholder template. Replace it with a real Google Desktop OAuth client.`,
    };
  }

  if (!clientId || !clientSecret) {
    return {
      status: "missing_required_fields",
      message: `OAuth client file ${normalizedPath} is missing the desktop client id or client secret.`,
    };
  }

  if (redirectUris.length === 0 || !redirectUris.some(isDesktopRedirectUri)) {
    return {
      status: "invalid_desktop_client",
      message: `OAuth client file ${normalizedPath} does not look like a Google Desktop OAuth client with a loopback redirect URI.`,
    };
  }

  return {
    status: "configured",
    message: "Desktop OAuth client file is configured.",
    clientConfig: {
      client_id: clientId,
      client_secret: clientSecret,
      auth_uri: String(doc.auth_uri ?? "https://accounts.google.com/o/oauth2/auth"),
      token_uri: String(doc.token_uri ?? "https://oauth2.googleapis.com/token"),
      redirect_uris: redirectUris,
    },
  };
}

export function requireConfiguredOAuthClient(filePath: string, nextStep: string): GmailClientConfig {
  const validation = validateOAuthClientFile(filePath);
  if (validation.status !== "configured" || !validation.clientConfig) {
    throw new Error(`${validation.message} ${nextStep}`.trim());
  }
  return validation.clientConfig;
}

export function validateSecretTextFile(filePath: string, label: string): SecretTextFileValidation {
  if (!fs.existsSync(filePath)) {
    return {
      status: "missing",
      message: `${label} is missing at ${filePath}.`,
    };
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    const value = readUtf8File(filePath).trim();
    if (!value) {
      return {
        status: "empty",
        message: `${label} exists at ${filePath} but is empty.`,
      };
    }
    return {
      status: "configured",
      message: `${path.basename(filePath)} is present and readable.`,
    };
  } catch (error) {
    return {
      status: "unreadable",
      message: error instanceof Error ? error.message : `${filePath} could not be read.`,
    };
  }
}

export function validateSecretFilePermissions(filePath: string, label: string): SecretFilePermissionsValidation {
  if (!fs.existsSync(filePath)) {
    return {
      status: "missing",
      message: `${label} is missing at ${filePath}.`,
    };
  }
  try {
    const mode = fs.statSync(filePath).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      return {
        status: "too_broad",
        mode,
        message: `${label} permissions are ${renderMode(mode)}. Tighten them to owner-only access such as 0600, or run \`personal-ops install fix-permissions\`.`,
      };
    }
    return {
      status: "secure",
      mode,
      message: `${label} permissions look tight (${renderMode(mode)}).`,
    };
  } catch (error) {
    return {
      status: "unreadable",
      message: error instanceof Error ? error.message : `${filePath} permissions could not be checked.`,
    };
  }
}

export function repairSecretFilePermissions(
  filePath: string,
  label: string,
  targetMode = 0o600,
): SecretFilePermissionsRepair {
  if (!fs.existsSync(filePath)) {
    return {
      status: "missing",
      message: `${label} is missing at ${filePath}.`,
    };
  }
  try {
    const previousMode = fs.statSync(filePath).mode & 0o777;
    if ((previousMode & 0o077) === 0 && previousMode === targetMode) {
      return {
        status: "already_secure",
        previousMode,
        currentMode: previousMode,
        message: `${label} already uses owner-only access (${renderMode(previousMode)}).`,
      };
    }
    fs.chmodSync(filePath, targetMode);
    const currentMode = fs.statSync(filePath).mode & 0o777;
    if (currentMode !== targetMode) {
      return {
        status: "failed",
        previousMode,
        currentMode,
        message: `${label} permissions changed from ${renderMode(previousMode)} to ${renderMode(currentMode)}, but did not reach ${renderMode(targetMode)}.`,
      };
    }
    return {
      status: "updated",
      previousMode,
      currentMode,
      message: `${label} permissions changed from ${renderMode(previousMode)} to ${renderMode(currentMode)}.`,
    };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : `${label} permissions could not be repaired.`,
    };
  }
}

export function probeKeychainSecret(
  service: string,
  account: string,
  dependencies: KeychainDependencies = {},
): KeychainProbeResult {
  const execFileSyncImpl = dependencies.execFileSyncImpl ?? execFileSync;
  try {
    const secret = execFileSyncImpl("security", ["find-generic-password", "-w", "-s", service, "-a", account], {
      stdio: "pipe",
      encoding: "utf8",
    }).trim();
    return {
      status: "present",
      message: `Keychain token exists for ${account}.`,
      secret,
    };
  } catch (error) {
    const message = extractErrorText(error);
    if (
      /could not be found in the keychain|item could not be found|could not be found/i.test(message)
    ) {
      return {
        status: "missing",
        message: `Keychain token is missing for ${account}. Run \`personal-ops auth gmail login\` and \`personal-ops auth google login\` again.`,
        secret: null,
      };
    }
    if (/user interaction is not allowed|not available|could not be accessed|operation not permitted|denied/i.test(message)) {
      return {
        status: "unavailable",
        message: `Keychain token for ${account} could not be read on this Mac. Check Keychain access, then rerun the auth login flow if needed.`,
        secret: null,
      };
    }
    return {
      status: "unavailable",
      message: `Keychain token for ${account} could not be read: ${message}`,
      secret: null,
    };
  }
}

export function explainGoogleGrantFailure(error: unknown, mailbox: string): string {
  const message = extractErrorText(error);
  if (/invalid_grant|expired or revoked|has been expired or revoked|invalid credentials/i.test(message)) {
    return `Stored Google grant for ${mailbox} looks stale or revoked. Run \`personal-ops auth gmail login\` and \`personal-ops auth google login\` again.`;
  }
  if (/insufficient authentication scopes|insufficient permissions|insufficientpermissions/i.test(message)) {
    return `Stored Google grant for ${mailbox} is missing one or more required Gmail or Calendar permissions. Run \`personal-ops auth gmail login\` and \`personal-ops auth google login\` again and accept the requested access.`;
  }
  return message;
}
