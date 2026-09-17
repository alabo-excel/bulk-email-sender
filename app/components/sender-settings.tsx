import { sendCampaign } from "~/lib/send.client";
import { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useNavigate } from "react-router";
import { decryptPassword, encryptPassword } from "~/lib/vault";
import { stateAtom, passwordAtom, updateState, userId, smtpRequest } from "~/lib/store";

const SMTP_PROVIDERS = {
  zoho: { host: "smtp.zoho.com", port: 465 },
  gmail: { host: "smtp.gmail.com", port: 465 },
} as const;

export function SenderSettings({ onboarding = false }: { onboarding?: boolean }) {
  const { sender, suppression } = useAtomValue(stateAtom);
  const [unlocked, setUnlocked] = useAtom(passwordAtom);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return <div className="mx-auto max-w-2xl space-y-6">
    <section className="card">
      <h1 className="text-xl font-semibold">{onboarding ? "Set up your sender email" : "Sender settings"}</h1>
      <p className="hint mt-2">Enter the mailbox you want to send from and its SMTP password. Use an app password if your email provider requires one.</p>
      <form className="mt-5 space-y-4" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        setBusy(true); setMessage("");
        try {
          const provider = String(values.get("provider"));
          if (provider !== "zoho" && provider !== "gmail") throw new Error("Choose Zoho or Gmail.");
          const connection = SMTP_PROVIDERS[provider];
          const password = String(values.get("password"));
          const passphrase = String(values.get("passphrase"));
          if (passphrase !== values.get("confirm")) throw new Error("Vault passphrases do not match.");
          const owner = userId();
          const encrypted = await encryptPassword(password, passphrase, owner);
          if (owner !== userId()) throw new Error("Account changed. Please try again.");
          updateState((state) => ({ ...state, sender: {
            email: String(values.get("email")).trim(), name: String(values.get("name")).trim(),
            host: connection.host, port: connection.port, password: encrypted,
          } }));
          setUnlocked(password);
          form.reset();
          setMessage("Sender saved. Your password is encrypted in this browser.");
          if (onboarding) await navigate("/");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save sender."); }
        finally { setBusy(false); }
      }}>
        <Field label="Sender email" name="email" type="email" defaultValue={sender?.email} autoComplete="email" required />
        <Field label="Sender name (optional)" name="name" defaultValue={sender?.name} autoComplete="name" />
        <label className="label block">
          Email provider
          <select name="provider" className="field mt-1" defaultValue={sender?.host === SMTP_PROVIDERS.gmail.host ? "gmail" : "zoho"} required>
            <option value="zoho">Zoho</option>
            <option value="gmail">Gmail</option>
          </select>
        </label>
        <p className="hint">Your secure SMTP connection is configured automatically for the selected provider.</p>
        <Field label="Email password / app password" name="password" type="password" autoComplete="new-password" required />
        <Field label="Vault passphrase" name="passphrase" type="password" autoComplete="new-password" minLength={12} required />
        <Field label="Confirm vault passphrase" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        <p className="hint">Choose a separate passphrase of at least 12 characters. You’ll use it to unlock sending after a refresh. It is never saved; if you forget it, enter your sender credentials again.</p>
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : onboarding ? "Save and continue" : "Save sender"}</button>
      </form>
    </section>
    {sender && !onboarding && <section className="card space-y-4">
      <h2 className="font-semibold">{unlocked ? "Sender unlocked" : "Unlock sending"}</h2>
      {!unlocked ? <form className="space-y-3" onSubmit={async (event) => {
        event.preventDefault(); const form = event.currentTarget;
        const passphrase = String(new FormData(form).get("unlock"));
        setBusy(true); setMessage("");
        try { const owner = userId(); const password = await decryptPassword(sender.password, passphrase, owner); if (owner !== userId()) throw new Error("Account changed."); setUnlocked(password); form.reset(); setMessage("Sender unlocked for this tab."); }
        catch { setMessage("Could not unlock. Check your vault passphrase, or save your sender credentials again."); }
        finally { setBusy(false); }
      }}><Field label="Vault passphrase" name="unlock" type="password" required /><button className="btn-primary" disabled={busy}>Unlock</button></form> : <button className="btn-secondary" onClick={() => { setUnlocked(null); setMessage("Sender locked."); }}>Lock sender</button>}
      <button className="btn-secondary" disabled={busy || !unlocked} onClick={async () => {
        setBusy(true); setMessage("");
        try { const result = await smtpRequest({ intent: "verify" }); setMessage(result.message); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Connection failed."); }
        finally { setBusy(false); }
      }}>Verify SMTP connection</button>
      <form className="space-y-3" onSubmit={async (event) => {
        event.preventDefault(); const to = String(new FormData(event.currentTarget).get("to"));
        setBusy(true); setMessage("");
        try {
          const { report } = await sendCampaign({ listId: "test", listName: "Test emails",
            subject: "Cold Email Sender — test message", body: "If you are reading this, your SMTP settings work.",
            footer: "", recipients: [{ email: to, rowNumber: 1, row: {} }], skipped: [], delayMs: 0, dryRun: false });
          setMessage(report.attempts[0].error ?? `Test email sent to ${to}.`);
        } catch (error) { setMessage(error instanceof Error ? error.message : "Test email failed."); }
        finally { setBusy(false); }
      }}><Field label="Send a test email to" name="to" type="email" required /><button className="btn-primary" disabled={busy || !unlocked}>Send test email</button></form>
      <p className="hint">{suppression.length} suppressed addresses. Add addresses from a campaign screen.</p>
    </section>}
    {message && <p role="status" className="card text-sm">{message}</p>}
  </div>;
}
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="label block">{label}<input {...props} className="field mt-1" /></label>;
}
