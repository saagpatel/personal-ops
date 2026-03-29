import { execFileSync } from "node:child_process";
import { PersonalOpsDb } from "./db.js";
import { Logger } from "./logger.js";
import { Policy } from "./types.js";

function quoteAppleScript(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function sendMacNotification(
  db: PersonalOpsDb,
  logger: Logger,
  policy: Policy,
  dedupeKey: string,
  title: string,
  message: string,
  targetId: string,
) {
  if (db.hasNotification(dedupeKey)) {
    return;
  }
  try {
    execFileSync("osascript", [
      "-e",
      `display notification ${quoteAppleScript(message)} with title ${quoteAppleScript(`${policy.notificationsTitlePrefix}: ${title}`)}`,
    ]);
    db.recordNotification(dedupeKey, title, targetId);
  } catch (error) {
    logger.error("notification_failed", {
      dedupe_key: dedupeKey,
      target_id: targetId,
      message: error instanceof Error ? error.message : "Unknown notification error",
    });
  }
}
