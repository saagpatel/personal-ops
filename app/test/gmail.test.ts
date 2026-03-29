import assert from "node:assert/strict";
import test from "node:test";
import { parseGmailClientConfig } from "../src/gmail.js";

test("gmail client config parser rejects placeholders without credentials", () => {
  assert.throws(() => parseGmailClientConfig('{"installed":{"client_id":"","client_secret":"","redirect_uris":["http://127.0.0.1"]}}'));
});
