import { execFileSync } from "node:child_process";
import { probeKeychainSecret } from "./secrets.js";

export function setKeychainSecret(service: string, account: string, secret: string): void {
  execFileSync("security", ["add-generic-password", "-U", "-s", service, "-a", account, "-w", secret], {
    stdio: "pipe",
  });
}

export function getKeychainSecret(service: string, account: string): string | null {
  const probe = probeKeychainSecret(service, account, { execFileSyncImpl: execFileSync });
  return probe.status === "present" ? probe.secret : null;
}

export function deleteKeychainSecret(service: string, account: string): void {
  try {
    execFileSync("security", ["delete-generic-password", "-s", service, "-a", account], {
      stdio: "pipe",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("could not be found")) {
      throw error;
    }
  }
}
