import { useState } from "react";
import { useAtom } from "jotai";
import { decryptPassword } from "~/lib/vault";
import { passwordAtom, smtpRequest, userId, type Sender } from "~/lib/store";
import { Field } from "./field";
import { errorNotice, type NoticeHandler } from "./notice";

export function UnlockPanel({ sender, onNotice }: { sender: Sender; onNotice: NoticeHandler }) {
  const [unlocked, setUnlocked] = useAtom(passwordAtom);
  const [busy, setBusy] = useState(false);

  return <div className="space-y-4" aria-busy={busy}>
    <h2 className="font-semibold">{unlocked ? "Sender unlocked" : "Unlock sending"}</h2>

    {!unlocked ? <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const passphrase = String(new FormData(form).get("unlock"));
      setBusy(true); onNotice(null);
      try {
        const owner = userId();
        const password = await decryptPassword(sender.password, passphrase, owner);
        if (owner !== userId()) throw new Error("Account changed.");
        setUnlocked(password); form.reset();
        onNotice({ tone: "success", text: "Sender unlocked for this tab." });
      }
      catch { onNotice({ tone: "error", text: "Could not unlock. Check your vault passphrase, or save your sender credentials again." }); }
      finally { setBusy(false); }
    }}>
      <Field label="Vault passphrase" name="unlock" type="password" required
        hint="Sending stays locked until you enter the passphrase you chose when saving this sender." />
      <button className="btn-primary" disabled={busy}>Unlock</button>
    </form> : <button type="button" className="btn-secondary" onClick={() => {
      setUnlocked(null);
      onNotice({ tone: "success", text: "Sender locked." });
    }}>Lock sender</button>}

    <div>
      <button type="button" className="btn-secondary" disabled={busy || !unlocked}
        aria-describedby={unlocked ? undefined : "verify-locked-hint"} onClick={async () => {
        setBusy(true); onNotice(null);
        try { const result = await smtpRequest({ intent: "verify" }); onNotice({ tone: "success", text: result.message }); }
        catch (error) { onNotice(errorNotice(error, "Connection failed.")); }
        finally { setBusy(false); }
      }}>Verify SMTP connection</button>
      {!unlocked && <p id="verify-locked-hint" className="hint mt-1">Unlock sending above before verifying the connection.</p>}
    </div>
  </div>;
}
