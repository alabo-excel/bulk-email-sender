import type { Recipient, SkippedRow } from "./contacts";
import {
  createTransport,
  describeError,
  formatFrom,
  readSmtpConfig,
} from "./mailer.server";
import { renderTemplate, textToHtml } from "./template";
import { markSent, saveReport, type SendAttempt, type SendReport } from "./store.server";

export type CampaignInput = {
  listId: string;
  listName: string;
  subject: string;
  body: string;
  /** Appended verbatim to every email — signature, address, opt-out line. */
  footer: string;
  recipients: Recipient[];
  skipped: SkippedRow[];
  /** Milliseconds to pause between messages, to stay under provider limits. */
  delayMs: number;
  /** Render and report without touching SMTP. */
  dryRun: boolean;
};

export type CampaignResult = {
  report: SendReport;
  sent: number;
  failed: number;
  skipped: number;
};

const SKIP_REASONS: Record<SkippedRow["reason"], string> = {
  "invalid-email": "Invalid email address",
  duplicate: "Duplicate address in this list",
  suppressed: "On the suppression list",
  "already-sent": "Already emailed from this list",
};

export async function sendCampaign(
  input: CampaignInput,
): Promise<CampaignResult> {
  const startedAt = Date.now();
  const attempts: SendAttempt[] = input.skipped.map((row) => ({
    email: row.email,
    rowNumber: row.rowNumber,
    subject: "",
    status: "skipped" as const,
    reason: SKIP_REASONS[row.reason],
    sentAt: startedAt,
  }));

  const { config, issues } = readSmtpConfig();
  if (!input.dryRun && !config) {
    throw new Error(
      `SMTP is not configured: ${issues.map((i) => i.message).join(" ")}`,
    );
  }

  const transport = !input.dryRun && config ? createTransport(config) : null;

  try {
    for (const [index, recipient] of input.recipients.entries()) {
      const subject = renderTemplate(input.subject, recipient.row).text;
      const bodyText = renderTemplate(input.body, recipient.row).text;
      const footerText = input.footer
        ? renderTemplate(input.footer, recipient.row).text
        : "";
      const text = footerText ? `${bodyText}\n\n${footerText}` : bodyText;

      if (!transport || !config) {
        attempts.push({
          email: recipient.email,
          rowNumber: recipient.rowNumber,
          subject,
          status: "sent",
          reason: "Dry run — not actually sent",
          sentAt: Date.now(),
        });
        continue;
      }

      try {
        await transport.sendMail({
          from: formatFrom(config),
          to: recipient.email,
          replyTo: config.replyTo || undefined,
          subject,
          text,
          html: textToHtml(text),
        });
        markSent(input.listId, recipient.email);
        attempts.push({
          email: recipient.email,
          rowNumber: recipient.rowNumber,
          subject,
          status: "sent",
          sentAt: Date.now(),
        });
      } catch (error) {
        attempts.push({
          email: recipient.email,
          rowNumber: recipient.rowNumber,
          subject,
          status: "failed",
          error: describeError(error),
          sentAt: Date.now(),
        });
      }

      const isLast = index === input.recipients.length - 1;
      if (!isLast && input.delayMs > 0) await sleep(input.delayMs);
    }
  } finally {
    transport?.close();
  }

  const report = saveReport({
    listId: input.listId,
    listName: input.listName,
    startedAt,
    finishedAt: Date.now(),
    dryRun: input.dryRun,
    attempts,
  });

  return {
    report,
    sent: attempts.filter((a) => a.status === "sent").length,
    failed: attempts.filter((a) => a.status === "failed").length,
    skipped: attempts.filter((a) => a.status === "skipped").length,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
