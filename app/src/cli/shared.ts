export function parseEmails(values: string[] | undefined): string[] {
  return values?.flatMap((value) => value.split(",").map((part) => part.trim()).filter(Boolean)) ?? [];
}

export function readRawCliOption(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current) {
      continue;
    }
    if (current === flag) {
      const next = args[index + 1];
      if (!next || next.startsWith("-")) {
        return undefined;
      }
      return next;
    }
    if (current.startsWith(`${flag}=`)) {
      return current.slice(flag.length + 1);
    }
  }
  return undefined;
}

export function hasRawCliFlag(flag: string): boolean {
  return process.argv.slice(2).some((current) => current === flag);
}

export function resolveCliOption(options: Record<string, unknown>, key: string, flag: string): string | undefined {
  const value = options[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return readRawCliOption(flag);
}

export function requireCliOption(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`required option '${flag}' not specified`);
  }
  return value;
}

export function resolveCliFlag(options: Record<string, unknown>, key: string, flag: string): boolean {
  const value = options[key];
  if (typeof value === "boolean") {
    return value;
  }
  return hasRawCliFlag(flag);
}

export function printOutput(payload: unknown, formatter?: (value: any) => string, asJson?: boolean) {
  if (asJson || !formatter) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${formatter(payload)}\n`);
}

export interface CliContext {
  requestJson: <T>(method: string, path: string, body?: unknown) => Promise<T>;
  printOutput: typeof printOutput;
  parseEmails: typeof parseEmails;
  resolveCliOption: typeof resolveCliOption;
  requireCliOption: typeof requireCliOption;
  resolveCliFlag: typeof resolveCliFlag;
}
