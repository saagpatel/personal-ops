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
