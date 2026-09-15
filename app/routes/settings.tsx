import { Form, data, useNavigation } from "react-router";
import type { Route } from "./+types/settings";
import { isValidEmail } from "~/lib/contacts";
import {
  createTransport,
  describeError,
  formatFrom,
  readSmtpConfig,
  verifyConnection,
} from "~/lib/mailer.server";
import { getSuppression } from "~/lib/store.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Settings · Cold Email Sender" }];
}

const ENV_KEYS = [
  { key: "SMTP_HOST", example: "smtp.zoho.com", required: true },
  { key: "SMTP_PORT", example: "465", required: false },
  { key: "SMTP_SECURE", example: "true", required: false },
  { key: "SMTP_USER", example: "you@yourdomain.com", required: true },
  {
    key: "SMTP_PASS",
    example: "app-specific password",
    required: true,
    secret: true,
  },
  { key: "MAIL_FROM_NAME", example: "Ada Lovelace", required: false },
  { key: "MAIL_FROM_EMAIL", example: "you@yourdomain.com", required: false },
  { key: "MAIL_REPLY_TO", example: "replies@yourdomain.com", required: false },
] as const;

export function loader(_: Route.LoaderArgs) {
  const { config, issues } = readSmtpConfig();
  return {
    env: ENV_KEYS.map((entry) => ({
      key: entry.key,
      example: entry.example,
      required: entry.required,
      // Never send secret values to the browser — presence only.
      value:
        "secret" in entry && entry.secret
          ? process.env[entry.key]
            ? "••••••••"
            : ""
          : (process.env[entry.key] ?? ""),
    })),
    issues: issues.map((issue) => `${issue.key} — ${issue.message}`),
    from: config ? formatFrom(config) : null,
    suppressionCount: getSuppression().size,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "verify") {
    const result = await verifyConnection();
    return data({ ok: result.ok, message: result.message });
  }

  if (intent === "test") {
    const to = String(formData.get("to") ?? "").trim();
    if (!isValidEmail(to)) {
      return data({ ok: false, message: "Enter a valid email address." }, { status: 400 });
    }
    const { config, issues } = readSmtpConfig();
    if (!config) {
      return data(
        { ok: false, message: issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    }
    const transport = createTransport(config);
    try {
      await transport.sendMail({
        from: formatFrom(config),
        to,
        replyTo: config.replyTo || undefined,
        subject: "Cold Email Sender — test message",
        text: "If you are reading this, your SMTP settings work.",
      });
      return data({ ok: true, message: `Test email sent to ${to}.` });
    } catch (error) {
      return data({ ok: false, message: describeError(error) }, { status: 502 });
    } finally {
      transport.close();
    }
  }

  return data({ ok: false, message: "Unknown action." }, { status: 400 });
}

export default function Settings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const configured = loaderData.issues.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="card">
        <h1 className="text-xl font-semibold tracking-tight">SMTP settings</h1>
        <p className="hint mt-1">
          Credentials are read from environment variables, never stored in the
          app. Put them in a <code>.env</code> file at the project root and
          restart the dev server.
        </p>
        <p className="hint mt-2">
          Zoho Mail: use the host for your account&rsquo;s data centre (
          <code>smtp.zoho.com</code>, <code>.eu</code>, <code>.in</code>,{" "}
          <code>.com.au</code>&hellip;), port <code>465</code>, and an
          app-specific password from Zoho Accounts &rarr; Security &rarr; App
          Passwords if two-factor auth is on. The From address must be the
          authenticated mailbox or a verified alias.
        </p>

        <div
          className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            configured
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
          }`}
        >
          {configured ? (
            <>Ready to send as {loaderData.from}.</>
          ) : (
            <>
              <p className="font-medium">Not ready yet:</p>
              <ul className="mt-1 list-inside list-disc">
                {loaderData.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="py-2 font-medium">Variable</th>
                <th className="py-2 font-medium">Current value</th>
                <th className="py-2 font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loaderData.env.map((entry) => (
                <tr key={entry.key}>
                  <td className="py-2 font-mono text-xs">
                    {entry.key}
                    {entry.required && <span className="text-red-500"> *</span>}
                  </td>
                  <td className="py-2 font-mono text-xs">
                    {entry.value || (
                      <span className="text-gray-400">not set</span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs text-gray-500">
                    {entry.example}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="space-y-6">
        <section className="card space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Check the connection
          </h2>

          {actionData && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                actionData.ok
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
              }`}
            >
              {actionData.message}
            </p>
          )}

          <Form method="post">
            <input type="hidden" name="intent" value="verify" />
            <button type="submit" className="btn-secondary w-full" disabled={busy}>
              Verify SMTP connection
            </button>
          </Form>

          <Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="test" />
            <label className="label" htmlFor="to">
              Send a test email to
            </label>
            <input
              id="to"
              name="to"
              type="email"
              placeholder="you@yourdomain.com"
              className="field"
            />
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              Send test email
            </button>
          </Form>
        </section>

        <section className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Suppression list
          </h2>
          <p className="mt-2 text-sm">
            {loaderData.suppressionCount} address
            {loaderData.suppressionCount === 1 ? "" : "es"} will never be
            emailed. Add more from any campaign screen.
          </p>
        </section>
      </div>
    </div>
  );
}
