import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  probeKeychainSecret,
  validateOAuthClientFile,
  validateSecretFilePermissions,
  validateSecretTextFile,
} from "../src/secrets.js";

function createTempDir(label: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `personal-ops-secrets-${label}-`));
}

test("Phase 6 OAuth validation distinguishes missing, placeholder, malformed, incomplete, and valid configs", () => {
  const base = createTempDir("oauth");
  const oauthPath = path.join(base, "gmail-oauth-client.json");

  let result = validateOAuthClientFile(oauthPath);
  assert.equal(result.status, "missing");

  fs.writeFileSync(
    oauthPath,
    JSON.stringify({
      installed: {
        client_id: "",
        client_secret: "",
        redirect_uris: ["http://127.0.0.1"],
      },
    }),
    "utf8",
  );
  result = validateOAuthClientFile(oauthPath);
  assert.equal(result.status, "placeholder");

  fs.writeFileSync(oauthPath, "{not-json", "utf8");
  result = validateOAuthClientFile(oauthPath);
  assert.equal(result.status, "malformed_json");

  fs.writeFileSync(
    oauthPath,
    JSON.stringify({
      installed: {
        client_id: "client-id",
        client_secret: "",
        redirect_uris: ["http://127.0.0.1"],
      },
    }),
    "utf8",
  );
  result = validateOAuthClientFile(oauthPath);
  assert.equal(result.status, "missing_required_fields");

  fs.writeFileSync(
    oauthPath,
    JSON.stringify({
      installed: {
        client_id: "client-id",
        client_secret: "client-secret",
        redirect_uris: ["http://127.0.0.1"],
      },
    }),
    "utf8",
  );
  result = validateOAuthClientFile(oauthPath);
  assert.equal(result.status, "configured");
  assert.equal(result.clientConfig?.client_id, "client-id");
});

test("Phase 6 secret file validation catches empty files and broad permissions", () => {
  const base = createTempDir("tokens");
  const tokenPath = path.join(base, "local-api-token");
  fs.writeFileSync(tokenPath, "", { encoding: "utf8", mode: 0o644 });
  fs.chmodSync(tokenPath, 0o644);

  const tokenValidation = validateSecretTextFile(tokenPath, "Local API token");
  const permissionsValidation = validateSecretFilePermissions(tokenPath, "Local API token");

  assert.equal(tokenValidation.status, "empty");
  assert.equal(permissionsValidation.status, "too_broad");
});

test("Phase 6 keychain probe distinguishes present, missing, and unavailable items", () => {
  const present = probeKeychainSecret("personal-ops.gmail.test", "machine@example.com", {
    execFileSyncImpl: () => "refresh-token\n" as any,
  });
  assert.equal(present.status, "present");
  assert.equal(present.secret, "refresh-token");

  const missing = probeKeychainSecret("personal-ops.gmail.test", "machine@example.com", {
    execFileSyncImpl: () => {
      throw Object.assign(new Error("missing"), {
        stderr: Buffer.from("The specified item could not be found in the keychain."),
      });
    },
  });
  assert.equal(missing.status, "missing");
  assert.match(missing.message, /auth gmail login/);

  const unavailable = probeKeychainSecret("personal-ops.gmail.test", "machine@example.com", {
    execFileSyncImpl: () => {
      throw Object.assign(new Error("denied"), {
        stderr: Buffer.from("User interaction is not allowed."),
      });
    },
  });
  assert.equal(unavailable.status, "unavailable");
  assert.match(unavailable.message, /Keychain access/i);
});
