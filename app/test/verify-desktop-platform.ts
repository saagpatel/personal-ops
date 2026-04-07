import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateDesktopPlatformVerification } from "../src/desktop-platform.js";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function runJsonCommand(command: string, args: string[], cwd: string): any {
  try {
    return JSON.parse(execFileSync(command, args, { cwd, encoding: "utf8" }));
  } catch (error: any) {
    const output = String(error?.stdout ?? error?.message ?? "").trim();
    if (!output) {
      throw error;
    }
    return JSON.parse(output);
  }
}

function main() {
  const root = repoRoot();
  const desktopDir = path.join(root, "desktop");
  const tauriDir = path.join(desktopDir, "src-tauri");
  const npmAudit = runJsonCommand("npm", ["audit", "--json"], desktopDir);
  const cargoAudit = runJsonCommand("cargo", ["audit", "--json"], tauriDir);
  const result = evaluateDesktopPlatformVerification(npmAudit, cargoAudit);

  for (const message of result.info) {
    process.stdout.write(`${message}\n`);
  }

  if (!result.ok) {
    for (const message of result.errors) {
      process.stderr.write(`${message}\n`);
    }
    throw new Error("Desktop platform verification failed.");
  }

  process.stdout.write("Desktop platform verification passed.\n");
}

main();
