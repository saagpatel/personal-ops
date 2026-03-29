import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Command } from "commander";
import { formatApprovalItems } from "../../formatters.js";
import { runGoogleLogin } from "../http-client.js";
import type { CliContext } from "../shared.js";

function readGithubTokenInteractive(): string {
  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8").trim();
  }
  const output = execFileSync(
    process.env.SHELL || "/bin/sh",
    [
      "-lc",
      "stty -echo; trap 'stty echo' EXIT; printf 'GitHub PAT: ' >&2; IFS= read -r token; stty echo; printf '\\n' >&2; printf '%s' \"$token\"",
    ],
    {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    },
  );
  return String(output).trim();
}

export function registerAuthAndMailCommands(program: Command, context: CliContext) {
  const auth = program.command("auth").description("Run local mailbox and Google auth flows.");
  const githubAuth = auth.command("github").description("Manage the narrow read-only GitHub integration auth.");

  auth
    .command("gmail")
    .command("login")
    .description("Run the installed-app Gmail OAuth login flow for the dedicated mailbox.")
    .action(async () => {
      await runGoogleLogin(context.requestJson, "/v1/auth/gmail");
    });

  githubAuth
    .command("login")
    .description("Store a GitHub.com PAT in Keychain after verifying it against the GitHub API.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const token = readGithubTokenInteractive();
      const response = await context.requestJson<{ github_account: { login: string } }>("POST", "/v1/auth/github/login", { token });
      if (options.json) {
        context.printOutput(response, undefined, true);
        return;
      }
      process.stdout.write(`Connected GitHub account: ${response.github_account.login}\n`);
      process.stdout.write("Next step: run `personal-ops github sync now` to refresh the local PR and review queue.\n");
    });

  githubAuth
    .command("logout")
    .description("Remove the stored GitHub PAT and connected local GitHub state.")
    .option("--json", "Print raw JSON")
    .action(async (options) => {
      const response = await context.requestJson<{ github_logout: { cleared: boolean; login: string | null } }>(
        "POST",
        "/v1/auth/github/logout",
      );
      if (options.json) {
        context.printOutput(response, undefined, true);
        return;
      }
      process.stdout.write(
        response.github_logout.cleared
          ? `Removed GitHub auth for ${response.github_logout.login ?? "the connected account"}.\n`
          : "No GitHub auth state was connected.\n",
      );
    });

  auth
    .command("google")
    .command("login")
    .description("Run the installed-app Google OAuth login flow for the shared mailbox and calendar scopes.")
    .action(async () => {
      await runGoogleLogin(context.requestJson, "/v1/auth/google");
    });

  const mail = program.command("mail").description("Work with local draft artifacts and approval handoff.");
  const draft = mail.command("draft").description("Create, update, list, or submit local draft artifacts.");

  draft
    .command("create")
    .requiredOption("--to <emails...>", "Comma-separated or repeated recipient list")
    .requiredOption("--subject <subject>", "Draft subject")
    .option("--cc <emails...>", "Comma-separated or repeated CC list")
    .option("--bcc <emails...>", "Comma-separated or repeated BCC list")
    .option("--body-text <bodyText>", "Plain text body")
    .option("--body-html <bodyHtml>", "HTML body")
    .action(async (options) => {
      const response = await context.requestJson<{ draft: unknown }>("POST", "/v1/mail/drafts", {
        to: context.parseEmails(options.to),
        cc: context.parseEmails(options.cc),
        bcc: context.parseEmails(options.bcc),
        subject: options.subject,
        body_text: options.bodyText,
        body_html: options.bodyHtml,
      });
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    });

  draft
    .command("update")
    .argument("<artifactId>", "Local draft artifact id")
    .requiredOption("--to <emails...>", "Comma-separated or repeated recipient list")
    .requiredOption("--subject <subject>", "Draft subject")
    .option("--cc <emails...>", "Comma-separated or repeated CC list")
    .option("--bcc <emails...>", "Comma-separated or repeated BCC list")
    .option("--body-text <bodyText>", "Plain text body")
    .option("--body-html <bodyHtml>", "HTML body")
    .action(async (artifactId, options) => {
      const response = await context.requestJson<{ draft: unknown }>("PATCH", `/v1/mail/drafts/${artifactId}`, {
        to: context.parseEmails(options.to),
        cc: context.parseEmails(options.cc),
        bcc: context.parseEmails(options.bcc),
        subject: options.subject,
        body_text: options.bodyText,
        body_html: options.bodyHtml,
      });
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    });

  draft.command("list").action(async () => {
    const response = await context.requestJson<{ drafts: unknown }>("GET", "/v1/mail/drafts");
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  });

  draft
    .command("request-approval")
    .argument("<artifactId>", "Local draft artifact id")
    .option("--note <text>", "Optional approval request note")
    .option("--json", "Print raw JSON")
    .action(async (artifactId, options) => {
      const response = await context.requestJson<{ approval_request: unknown }>(
        "POST",
        `/v1/mail/drafts/${artifactId}/request-approval`,
        { note: options.note },
      );
      context.printOutput(response, (value) => formatApprovalItems("Approval Queue", [value.approval_request]), options.json);
    });
}
