import os from "node:os";
import path from "node:path";
import { Paths } from "./types.js";

function expandHome(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function resolvePaths(): Paths {
  const configDir = expandHome(process.env.PERSONAL_OPS_CONFIG_DIR ?? "~/.config/personal-ops");
  const stateDir = expandHome(
    process.env.PERSONAL_OPS_STATE_DIR ?? "~/Library/Application Support/personal-ops",
  );
  const logDir = expandHome(process.env.PERSONAL_OPS_LOG_DIR ?? "~/Library/Logs/personal-ops");
  const appDir = expandHome(process.env.PERSONAL_OPS_APP_DIR ?? "~/.local/share/personal-ops/app");

  return {
    configDir,
    stateDir,
    logDir,
    appDir,
    snapshotsDir: path.join(stateDir, "snapshots"),
    configFile: path.join(configDir, "config.toml"),
    policyFile: path.join(configDir, "policy.toml"),
    oauthClientFile: path.join(configDir, "gmail-oauth-client.json"),
    apiTokenFile: path.join(stateDir, "local-api-token"),
    assistantApiTokenFile: path.join(stateDir, "assistant-api-token"),
    databaseFile: path.join(stateDir, "personal-ops.db"),
    appLogFile: path.join(logDir, "app.jsonl"),
  };
}
