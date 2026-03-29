import type { Command } from "commander";
import { formatApprovalItems } from "../../formatters.js";
import { runGoogleLogin } from "../http-client.js";
import type { CliContext } from "../shared.js";

export function registerAuthAndMailCommands(program: Command, context: CliContext) {
  const auth = program.command("auth").description("Run local mailbox and Google auth flows.");

  auth
    .command("gmail")
    .command("login")
    .description("Run the installed-app Gmail OAuth login flow for the dedicated mailbox.")
    .action(async () => {
      await runGoogleLogin(context.requestJson, "/v1/auth/gmail");
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
