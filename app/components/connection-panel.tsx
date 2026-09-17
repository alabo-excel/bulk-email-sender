import { useState } from "react";
import { smtpRequest } from "~/lib/store";
import { errorNotice, type NoticeHandler } from "./notice";

export function ConnectionPanel({ onNotice }: { onNotice: NoticeHandler }) {
  const [busy, setBusy] = useState(false);

  return <div className="space-y-3" aria-busy={busy}>
    <h2 className="font-semibold">Connection</h2>
    <p className="hint">
      Checks that your provider accepts these credentials, without sending anything.
    </p>
    <button type="button" className="btn-secondary" disabled={busy} onClick={async () => {
      setBusy(true); onNotice(null);
      try { const result = await smtpRequest({ intent: "verify" }); onNotice({ tone: "success", text: result.message }); }
      catch (error) { onNotice(errorNotice(error, "Connection failed.")); }
      finally { setBusy(false); }
    }}>{busy ? "Checking…" : "Verify SMTP connection"}</button>
  </div>;
}
