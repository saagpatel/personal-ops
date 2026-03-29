import fs from "node:fs";
import { JsonValue, Paths } from "./types.js";

export class Logger {
  constructor(private readonly paths: Paths) {}

  info(event: string, details: Record<string, JsonValue> = {}): void {
    this.write("info", event, details);
  }

  error(event: string, details: Record<string, JsonValue> = {}): void {
    this.write("error", event, details);
  }

  private write(level: string, event: string, details: Record<string, JsonValue>): void {
    fs.mkdirSync(this.paths.logDir, { recursive: true });
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      details,
    });
    fs.appendFileSync(this.paths.appLogFile, `${line}\n`, "utf8");
  }
}
