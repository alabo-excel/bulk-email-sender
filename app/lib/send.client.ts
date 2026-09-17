import { MAX_CAMPAIGN_RECIPIENTS } from "./limits";
import type { Recipient, SkippedRow } from "./contacts";
import type { SendReport } from "./types";
import { renderTemplate } from "./template";
import { localStore, passwordAtom, saveReport, smtpRequest, userId } from "./store";

type CampaignInput = {
  listId: string; listName: string; subject: string; body: string; footer: string;
  recipients: Recipient[]; skipped: SkippedRow[]; delayMs: number; dryRun: boolean;
};
export async function sendCampaign(input: CampaignInput) {
  if (input.recipients.length > MAX_CAMPAIGN_RECIPIENTS) {
    throw new Error(`Campaigns are limited to ${MAX_CAMPAIGN_RECIPIENTS} recipients. Narrow your filters or upload a smaller list.`);
  }
  if (!input.dryRun && !localStore.get(passwordAtom)) throw new Error("Unlock your sender password in Settings before sending.");
  const owner = userId();
  const report: SendReport = {
    id: crypto.randomUUID(), listId: input.listId, listName: input.listName,
    startedAt: Date.now(), finishedAt: Date.now(), dryRun: input.dryRun,
    attempts: input.skipped.map((row) => ({ ...row, subject: "", status: "skipped", sentAt: Date.now() })),
  };
  saveReport(report);
  for (const [index, recipient] of input.recipients.entries()) {
    const subject = renderTemplate(input.subject, recipient.row).text;
    const body = [renderTemplate(input.body, recipient.row).text, renderTemplate(input.footer, recipient.row).text].filter(Boolean).join("\n\n");
    if (userId() !== owner) throw new Error("Account changed. Sending stopped.");
    let error: string | undefined;
    // Persist before SMTP: closing the tab leaves an explicit unconfirmed attempt.
    const attemptIndex = report.attempts.length;
    report.attempts.push({ email: recipient.email, rowNumber: recipient.rowNumber, subject, body,
      status: "failed", error: "Delivery unconfirmed. Check your mailbox before retrying.", sentAt: Date.now() });
    saveReport({ ...report, attempts: [...report.attempts] });
    if (!input.dryRun) {
      try { await smtpRequest({ intent: "send", to: recipient.email, subject, body }); }
      catch (cause) { error = cause instanceof Error ? cause.message : "Delivery could not be confirmed."; }
    }
    if (userId() !== owner) throw new Error("Account changed. Sending stopped.");
    report.attempts[attemptIndex] = { email: recipient.email, rowNumber: recipient.rowNumber, subject, body,
      status: error ? "failed" : "sent", error, reason: input.dryRun ? "Dry run — not actually sent" : undefined, sentAt: Date.now() };
    report.finishedAt = Date.now();
    saveReport({ ...report, attempts: [...report.attempts] });
    if (!input.dryRun && index < input.recipients.length - 1 && input.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, input.delayMs));
  }
  return { report };
}
