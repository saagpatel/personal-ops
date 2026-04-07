export function expectedMissingDesktopOpenMessage(): RegExp {
  return process.platform === "darwin" ? /install desktop/i : /supported only on macOS/i;
}
