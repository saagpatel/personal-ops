import { execFileSync } from "node:child_process";

export function setKeychainSecret(service: string, account: string, secret: string): void {
  execFileSync("security", ["add-generic-password", "-U", "-s", service, "-a", account, "-w", secret], {
    stdio: "pipe",
  });
}

export function getKeychainSecret(service: string, account: string): string | null {
  try {
    return execFileSync("security", ["find-generic-password", "-w", "-s", service, "-a", account], {
      stdio: "pipe",
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}
