import { useState } from "react";
import { useAtomValue } from "jotai";
import { sendCampaign } from "~/lib/send.client";
import { passwordAtom } from "~/lib/store";
import { Field } from "./field";
import { errorNotice, type NoticeHandler } from "./notice";

export function TestEmailForm({ onNotice }: { onNotice: NoticeHandler }) {
  const unlocked = useAtomValue(passwordAtom);
  const [busy, setBusy] = useState(false);

  return <form className="space-y-3" aria-busy={busy} onSubmit={async (event) => {
    event.preventDefault();
    const to = String(new FormData(event.currentTarget).get("to"));
    setBusy(true); onNotice(null);
    try {
      const { report } = await sendCampaign({ listId: "test", listName: "Test emails",
        subject: "Cold Email Sender — test message", body: "If you are reading this, your SMTP settings work.",
        footer: "", recipients: [{ email: to, rowNumber: 1, row: {} }], skipped: [], delayMs: 0, dryRun: false });
      const error = report.attempts[0].error;
      onNotice(error ? { tone: "error", text: error } : { tone: "success", text: `Test email sent to ${to}.` });
    } catch (error) { onNotice(errorNotice(error, "Test email failed.")); }
    finally { setBusy(false); }
  }}>
    <Field label="Send a test email to" name="to" type="email" required />
    <button className="btn-primary" disabled={busy || !unlocked}
      aria-describedby={unlocked ? undefined : "test-locked-hint"}>Send test email</button>
    {!unlocked && <p id="test-locked-hint" className="hint">Unlock sending above before sending a test email.</p>}
  </form>;
}
