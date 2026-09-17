import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "react-router";
import { encryptPassword } from "~/lib/vault";
import { stateAtom, passwordAtom, updateState, userId } from "~/lib/store";
import { Field } from "./field";
import { errorNotice, type NoticeHandler } from "./notice";

const SMTP_PROVIDERS = {
  zoho: { host: "smtp.zoho.com", port: 465 },
  gmail: { host: "smtp.gmail.com", port: 465 },
} as const;

/* Placeholder, not a value: a real defaultValue of dots would be submitted and
   encrypted as the literal password. */
const MASK = "••••••••••••";

export function SenderForm({ onboarding, onNotice }: { onboarding: boolean; onNotice: NoticeHandler }) {
  const { sender } = useAtomValue(stateAtom);
  const setUnlocked = useSetAtom(passwordAtom);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const saved = Boolean(sender?.password) && !onboarding;

  return <section className="card">
    <h1 className="text-xl font-semibold">{onboarding ? "Set up your sender email" : "Sender settings"}</h1>
    <p className="hint mt-2">Enter the mailbox you want to send from and its SMTP password. Use an app password if your email provider requires one.</p>
    <form className="mt-5 space-y-4" aria-busy={busy} onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      setBusy(true); onNotice(null); setMismatch(false);
      try {
        const provider = String(values.get("provider"));
        if (provider !== "zoho" && provider !== "gmail") throw new Error("Choose Zoho or Gmail.");
        const connection = SMTP_PROVIDERS[provider];
        const password = String(values.get("password") ?? "");
        const owner = userId();

        // A saved sender keeps its stored ciphertext unless a new password is
        // typed, so editing the name or provider does not force a re-entry.
        let credential = saved ? sender?.password : undefined;
        let plaintext = "";

        if (password || !credential) {
          const passphrase = String(values.get("passphrase") ?? "");
          if (passphrase !== values.get("confirm")) {
            setMismatch(true);
            throw new Error("Vault passphrases do not match.");
          }
          if (!password) throw new Error("Enter your email or app password.");
          if (passphrase.length < 12) throw new Error("Choose a vault passphrase of at least 12 characters.");
          credential = await encryptPassword(password, passphrase, owner);
          plaintext = password;
        }
        if (owner !== userId()) throw new Error("Account changed. Please try again.");
        if (!credential) throw new Error("Enter your email or app password.");

        updateState((state) => ({ ...state, sender: {
          email: String(values.get("email")).trim(), name: String(values.get("name")).trim(),
          host: connection.host, port: connection.port, password: credential,
        } }));
        if (plaintext) setUnlocked(plaintext);
        form.reset();
        onNotice({ tone: "success", text: plaintext
          ? "Sender saved. Your password is encrypted in this browser."
          : "Sender updated. Your saved password was kept." });
        if (onboarding) await navigate("/");
      } catch (error) { onNotice(errorNotice(error, "Unable to save sender.")); }
      finally { setBusy(false); }
    }}>
      <Field label="Sender email" name="email" type="email" defaultValue={sender?.email} autoComplete="email" required />
      <Field label="Sender name (optional)" name="name" defaultValue={sender?.name} autoComplete="name" />
      <div>
        <label className="label block" htmlFor="provider">Email provider</label>
        <select id="provider" name="provider" className="field" aria-describedby="provider-hint"
          defaultValue={sender?.host === SMTP_PROVIDERS.gmail.host ? "gmail" : "zoho"} required>
          <option value="zoho">Zoho</option>
          <option value="gmail">Gmail</option>
        </select>
        <p id="provider-hint" className="hint mt-1">Your secure SMTP connection is configured automatically for the selected provider.</p>
      </div>
      <Field label="Email password / app password" name="password" type="password" autoComplete="new-password"
        required={!saved} placeholder={saved ? MASK : undefined}
        hint={saved
          ? "Saved and encrypted. Leave blank to keep it, or type a new one to replace it."
          : "If your provider enforces two-factor auth, generate an app-specific password and use that here."} />
      <Field label="Vault passphrase" name="passphrase" type="password" autoComplete="new-password" minLength={12}
        required={!saved} placeholder={saved ? MASK : undefined}
        hint={saved
          ? "Only needed if you are replacing the password above. The passphrase itself is never stored."
          : "At least 12 characters. You’ll use it to unlock sending after a refresh. It is never saved; if you forget it, enter your sender credentials again."} />
      <Field label="Confirm vault passphrase" name="confirm" type="password" autoComplete="new-password" minLength={12}
        required={!saved} placeholder={saved ? MASK : undefined}
        invalid={mismatch} hint={mismatch ? "This does not match the vault passphrase above." : undefined} />
      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : onboarding ? "Save and continue" : "Save sender"}</button>
    </form>
  </section>;
}
