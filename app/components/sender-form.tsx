import { useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useNavigate } from "react-router";
import { isValidEmail } from "~/lib/contacts";
import { encryptSenderPassword, stateAtom, updateState, userId } from "~/lib/store";
import { Field } from "./field";
import { ErrorSummary, type FieldErrors } from "./error-summary";
import { errorNotice, type NoticeHandler } from "./notice";

const SMTP_PROVIDERS = {
  zoho: { host: "smtp.zoho.com", port: 465 },
  gmail: { host: "smtp.gmail.com", port: 465 },
} as const;

/* Placeholder, not a value: a real defaultValue of dots would be submitted and
   encrypted as the literal password. */
const MASK = "••••••••••••";

type Provider = keyof typeof SMTP_PROVIDERS;

/* Gmail has not accepted account passwords over SMTP since Google retired
   "less secure app access", so an App Password is mandatory there rather than a
   fallback. Zoho still takes the mailbox password unless 2FA is on. */
const PASSWORD_COPY = {
  gmail: {
    label: "Google app password",
    hint: "Gmail requires an App Password — your normal Google password will not work over SMTP. Generate one under Google Account → Security → 2-Step Verification → App passwords.",
    missing: "Enter your Google app password.",
  },
  zoho: {
    label: "Email password",
    hint: "Your Zoho mailbox password. If two-factor auth is on, generate an app-specific password instead under Zoho Accounts → Security → App Passwords.",
    missing: "Enter your email password.",
  },
} as const satisfies Record<Provider, { label: string; hint: string; missing: string }>;

export function SenderForm({ onboarding, onNotice }: { onboarding: boolean; onNotice: NoticeHandler }) {
  const { sender } = useAtomValue(stateAtom);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const summaryRef = useRef<HTMLDivElement>(null);
  const saved = Boolean(sender?.password) && !onboarding;
  // Controlled so the password field's label and guidance follow the choice.
  const [provider, setProvider] = useState<Provider>(
    sender?.host === SMTP_PROVIDERS.gmail.host ? "gmail" : "zoho",
  );
  const passwordCopy = PASSWORD_COPY[provider];

  /** Validates one field against the whole form, so each rule can see siblings. */
  function checkField(name: string, values: FormData): string {
    const value = String(values.get(name) ?? "");
    const password = String(values.get("password") ?? "");
    // With a stored credential, the secret fields only matter once a new
    // password is typed.
    const settingPassword = Boolean(password) || !saved;
    switch (name) {
      case "email":
        if (!value.trim()) return "Enter the email address you send from.";
        return isValidEmail(value.trim()) ? "" : "Enter a valid email address.";
      case "password": {
        if (!settingPassword || password) return "";
        // Read from the form rather than state so the message always matches
        // the provider actually submitted.
        const chosen = String(values.get("provider") ?? "zoho");
        return (PASSWORD_COPY[chosen as Provider] ?? PASSWORD_COPY.zoho).missing;
      }
      default:
        return "";
    }
  }

  /** Inline validation on blur, per the forms guidance — never on every keystroke. */
  const validateOnBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const form = event.currentTarget.form;
    if (!form) return;
    const name = event.currentTarget.name;
    const message = checkField(name, new FormData(form));
    setErrors((current) => ({ ...current, [name]: message }));
  };

  return <section className="card">
    <h1 className="text-xl font-semibold">{onboarding ? "Set up your sender email" : "Sender settings"}</h1>
    <p className="hint mt-2">Choose the mailbox you want to send from. Pick your provider first — the password it needs differs.</p>

    <form className="mt-5 space-y-4" aria-busy={busy} noValidate onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);

      const found: FieldErrors = {};
      for (const name of ["email", "password"]) {
        const message = checkField(name, values);
        if (message) found[name] = message;
      }
      setErrors(found);
      if (Object.keys(found).length) {
        // Move focus to the summary so keyboard and screen reader users are not
        // left at the submit button wondering what failed.
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }

      setBusy(true); onNotice(null);
      try {
        const provider = String(values.get("provider"));
        if (provider !== "zoho" && provider !== "gmail") throw new Error("Choose Zoho or Gmail.");
        const connection = SMTP_PROVIDERS[provider];
        const password = String(values.get("password") ?? "");
        const owner = userId();

        // A saved sender keeps its stored ciphertext unless a new password is
        // typed, so editing the name or provider does not force a re-entry.
        const credential = password
          ? await encryptSenderPassword(password)
          : (saved ? sender?.password : undefined);
        if (owner !== userId()) throw new Error("Account changed. Please try again.");
        if (!credential) throw new Error("Enter your email or app password.");

        updateState((state) => ({ ...state, sender: {
          email: String(values.get("email")).trim(), name: String(values.get("name")).trim(),
          host: connection.host, port: connection.port, password: credential,
        } }));
        form.reset();
        setErrors({});
        onNotice({ tone: "success", text: password
          ? "Sender saved. Your password is encrypted in this browser."
          : "Sender updated. Your saved password was kept." });
        if (onboarding) await navigate("/");
      } catch (error) { onNotice(errorNotice(error, "Unable to save sender.")); }
      finally { setBusy(false); }
    }}>
      <ErrorSummary ref={summaryRef} errors={errors} />

      <Field label="Sender email" name="email" type="email" required defaultValue={sender?.email} autoComplete="email"
        onBlur={validateOnBlur} error={errors.email} />
      <Field label="Sender name" name="name" defaultValue={sender?.name} autoComplete="name" />
      <div>
        <label className="label block" htmlFor="provider">Email provider</label>
        <select id="provider" name="provider" className="field" aria-describedby="provider-hint"
          value={provider} onChange={(event) => {
            setProvider(event.currentTarget.value as Provider);
            // The old provider's wording no longer applies to the error shown.
            setErrors((current) => ({ ...current, password: "" }));
          }}>
          <option value="zoho">Zoho</option>
          <option value="gmail">Gmail</option>
        </select>
        <p id="provider-hint" className="hint mt-1">Your secure SMTP connection is configured automatically for the selected provider.</p>
      </div>
      <Field label={passwordCopy.label} name="password" type="password" autoComplete="new-password" revealable required={!saved}
        placeholder={saved ? MASK : undefined} onBlur={validateOnBlur} error={errors.password}
        hint={saved
          ? "Saved and encrypted in this browser. Leave blank to keep it, or type a new one to replace it."
          : passwordCopy.hint} />
      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : onboarding ? "Save and continue" : "Save sender"}</button>
    </form>
  </section>;
}
