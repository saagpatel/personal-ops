import assert from "node:assert/strict";
import test from "node:test";
import { getPersonalOpsMcpHeaders, getPersonalOpsMcpIdentity } from "../src/mcp-identity.js";

test("mcp identity defaults remain backward compatible for Codex", () => {
  const identity = getPersonalOpsMcpIdentity({});
  assert.deepEqual(identity, {
    clientId: "codex-mcp",
    requestedBy: "codex",
    origin: "assistant-mcp",
  });

  const headers = getPersonalOpsMcpHeaders({});
  assert.deepEqual(headers, {
    "x-personal-ops-client": "codex-mcp",
    "x-personal-ops-origin": "assistant-mcp",
    "x-personal-ops-requested-by": "codex",
  });
});

test("mcp identity honors assistant-specific environment overrides", () => {
  const identity = getPersonalOpsMcpIdentity({
    PERSONAL_OPS_CLIENT_ID: "claude-mcp",
    PERSONAL_OPS_REQUESTED_BY: "claude",
    PERSONAL_OPS_ORIGIN: "assistant-mcp",
  });

  assert.deepEqual(identity, {
    clientId: "claude-mcp",
    requestedBy: "claude",
    origin: "assistant-mcp",
  });
});

test("mcp identity ignores blank environment values", () => {
  const identity = getPersonalOpsMcpIdentity({
    PERSONAL_OPS_CLIENT_ID: "   ",
    PERSONAL_OPS_REQUESTED_BY: "",
    PERSONAL_OPS_ORIGIN: "   ",
  });

  assert.deepEqual(identity, {
    clientId: "codex-mcp",
    requestedBy: "codex",
    origin: "assistant-mcp",
  });
});
