import { MAX_CAMPAIGN_RECIPIENTS } from "~/lib/limits";
import { useAtomValue } from "jotai";
import { passwordAtom } from "~/lib/store";
import { initializeLocalState } from "~/lib/store";
import { useMemo, useRef, useState } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/campaign";
import {
  buildAudience,
  guessEmailColumn,
  guessNameColumn,
  parseEmailList,
} from "~/lib/contacts";
import {
  OPERATORS,
  matchesRules,
  operatorNeedsValue,
  type FilterMatch,
  type FilterRule,
  type Operator,
} from "~/lib/filters";
import { extractTokens, renderTemplate } from "~/lib/template";
import { readSmtpConfig } from "~/lib/store";
import { sendCampaign } from "~/lib/send.client";
import {
  addToSuppression,
  getList,
  getSentEmails,
  getSuppression,
  listReportsForList,
} from "~/lib/store";

const MAX_DELAY_MS = 60_000;

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.list.name ?? "Campaign"} · Cold Email Sender` },
  ];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  await initializeLocalState();
  const list = getList(params.listId);
  if (!list) {
    throw data("Contact list not found. It is not saved in this browser.", {
      status: 404,
    });
  }

  const { config, issues } = readSmtpConfig();

  return {
    list: {
      id: list.id,
      name: list.name,
      headers: list.headers,
      rows: list.rows,
    },
    suggestedEmailColumn: guessEmailColumn(list.headers, list.rows),
    suggestedNameColumn: guessNameColumn(list.headers),
    smtp: {
      ready: issues.length === 0,
      from: config ? config.fromEmail : null,
      issues: issues.map((issue) => `${issue.key}: ${issue.message}`),
    },
    alreadySent: [...getSentEmails(list.id)],
    suppression: [...getSuppression()],
    reports: listReportsForList(list.id).map((report) => ({
      id: report.id,
      startedAt: report.startedAt,
      dryRun: report.dryRun,
      sent: report.attempts.filter((a) => a.status === "sent").length,
      failed: report.attempts.filter((a) => a.status === "failed").length,
    })),
  };
}

export async function clientAction({ params, request }: Route.ClientActionArgs) {
  await initializeLocalState();
  const list = getList(params.listId);
  if (!list) throw data("Contact list not found.", { status: 404 });

  const formData = await request.formData();
  const emailColumn = String(formData.get("emailColumn") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const footer = String(formData.get("footer") ?? "").trim();
  const dryRun = formData.get("dryRun") === "on";
  const matchMode = (String(formData.get("matchMode") ?? "all") === "any"
    ? "any"
    : "all") as FilterMatch;
  const skipAlreadySent = formData.get("skipAlreadySent") === "on";
  const delayMs = clampDelay(formData.get("delayMs"));
  const rules = parseRules(formData.get("rules"));

  const fail = (error: string) => data({ error }, { status: 400 });

  if (!emailColumn || !list.headers.includes(emailColumn)) {
    return fail("Pick the column that holds the email address.");
  }
  if (!subject) return fail("The subject line is required.");
  if (!body) return fail("The email body is required.");

  const { config, issues } = readSmtpConfig();
  if (!dryRun && !config) {
    return fail(`SMTP is not configured — ${issues.map((i) => i.message).join(" ")}`);
  }

  const suppressionInput = parseEmailList(
    String(formData.get("suppression") ?? ""),
  );
  addToSuppression(suppressionInput);
  const suppressed = new Set([...getSuppression(), ...suppressionInput]);

  // Build the audience from this user’s locally saved contacts.
  const matched: Record<string, string>[] = [];
  const matchedRowNumbers: number[] = [];
  list.rows.forEach((row, index) => {
    if (matchesRules(row, rules, matchMode)) {
      matched.push(row);
      matchedRowNumbers.push(index + 1);
    }
  });

  const { recipients, skipped } = buildAudience(matched, matchedRowNumbers, {
    emailColumn,
    suppressed,
    alreadySent: skipAlreadySent ? getSentEmails(list.id) : undefined,
  });

  if (recipients.length === 0) {
    return fail(
      "No contacts match these filters once invalid, duplicate and suppressed addresses are removed.",
    );
  }

  try {
  const result = await sendCampaign({
    listId: list.id,
    listName: list.name,
    subject,
    body,
    footer,
    recipients,
    skipped,
    delayMs,
    dryRun,
  });

  return redirect(`/reports/${result.report.id}`);
  } catch (error) { return fail(error instanceof Error ? error.message : "Sending failed."); }
}

function parseRules(raw: FormDataEntryValue | null): FilterRule[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((rule): rule is FilterRule =>
        Boolean(rule && typeof rule === "object" && "column" in rule),
      )
      .map((rule) => ({
        column: String(rule.column ?? ""),
        operator: String(rule.operator ?? "contains") as Operator,
        value: String(rule.value ?? ""),
      }))
      .filter((rule) => rule.column);
  } catch {
    return [];
  }
}

function clampDelay(raw: FormDataEntryValue | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.round(parsed), MAX_DELAY_MS);
}

export default function Campaign({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { list, smtp, suggestedEmailColumn, suggestedNameColumn } = loaderData;
  const unlocked = useAtomValue(passwordAtom);
  const navigation = useNavigation();
  const sending = navigation.state !== "idle";
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [emailColumn, setEmailColumn] = useState(
    suggestedEmailColumn ?? list.headers[0] ?? "",
  );
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [matchMode, setMatchMode] = useState<FilterMatch>("all");
  const [subject, setSubject] = useState(
    suggestedNameColumn ? "Quick question, {{first_name|there}}" : "Quick question",
  );
  const [body, setBody] = useState(defaultBody());
  const [footer, setFooter] = useState(defaultFooter());
  const [suppression, setSuppression] = useState("");
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  const [dryRun, setDryRun] = useState(!smtp.ready);
  const [delayMs, setDelayMs] = useState(1000);

  const audience = useMemo(() => {
    const matched: Record<string, string>[] = [];
    const rowNumbers: number[] = [];
    list.rows.forEach((row, index) => {
      if (matchesRules(row, rules, matchMode)) {
        matched.push(row);
        rowNumbers.push(index + 1);
      }
    });
    return buildAudience(matched, rowNumbers, {
      emailColumn,
      suppressed: new Set([...loaderData.suppression, ...parseEmailList(suppression)]),
      alreadySent: skipAlreadySent ? new Set(loaderData.alreadySent) : undefined,
    });
  }, [
    list.rows,
    rules,
    matchMode,
    emailColumn,
    suppression,
    skipAlreadySent,
    loaderData.alreadySent,
    loaderData.suppression,
  ]);

  const sampleRow = audience.recipients[0]?.row ?? list.rows[0];
  const preview = useMemo(() => {
    if (!sampleRow) return null;
    const renderedSubject = renderTemplate(subject, sampleRow);
    const renderedBody = renderTemplate(body, sampleRow);
    const renderedFooter = renderTemplate(footer, sampleRow);
    return {
      subject: renderedSubject.text,
      body: [renderedBody.text, renderedFooter.text].filter(Boolean).join("\n\n"),
      missing: [
        ...new Set([
          ...renderedSubject.missing,
          ...renderedBody.missing,
          ...renderedFooter.missing,
        ]),
      ],
    };
  }, [sampleRow, subject, body, footer]);

  const unknownTokens = useMemo(() => {
    const known = new Set(list.headers.map(normalize));
    return [...new Set([...extractTokens(subject), ...extractTokens(body), ...extractTokens(footer)])]
      .filter((token) => !known.has(normalize(token)));
  }, [list.headers, subject, body, footer]);

  const insertToken = (header: string) => {
    const token = `{{${header}}}`;
    const textarea = bodyRef.current;
    if (!textarea) {
      setBody((current) => `${current}${token}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBody((current) => current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const estimatedMinutes = Math.round(
    (audience.recipients.length * delayMs) / 60_000,
  );

  return (
    <Form method="post" className="space-y-6">
      {!unlocked && <p className="card text-sm">Your sender is locked. <Link className="link" to="/settings">Unlock in Settings</Link> before sending. Dry runs are still available.</p>}
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />
      <input type="hidden" name="matchMode" value={matchMode} />
      <input type="hidden" name="emailColumn" value={emailColumn} />
      <input type="hidden" name="delayMs" value={delayMs} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/" className="hint hover:underline">
            ← All lists
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {list.name}
          </h1>
          <p className="hint">
            {list.rows.length} rows · {list.headers.length} columns
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tabular-nums">
            {audience.recipients.length}
          </p>
          <p className="hint">will receive this email</p>
        </div>
      </div>

      {actionData?.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {actionData.error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="card">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              1 · Email column
            </h2>
            <select
              value={emailColumn}
              onChange={(event) => setEmailColumn(event.target.value)}
              className="field"
            >
              {list.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
            <p className="hint mt-2">
              {audience.skipped.length} row
              {audience.skipped.length === 1 ? "" : "s"} will be skipped
              (invalid, duplicate, suppressed or already emailed).
            </p>
          </section>

          <FilterBuilder
            headers={list.headers}
            rules={rules}
            matchMode={matchMode}
            onChangeRules={setRules}
            onChangeMatch={setMatchMode}
          />

          <section className="card">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              3 · Compose
            </h2>

            <div className="mb-4">
              <p className="label">Insert a merge tag</p>
              <div className="flex flex-wrap gap-1.5">
                {list.headers.map((header) => (
                  <button
                    key={header}
                    type="button"
                    onClick={() => insertToken(header)}
                    className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 transition hover:text-primary dark:bg-slate-800 dark:text-slate-300 dark:hover:text-primary-soft"
                  >
                    {`{{${header}}}`}
                  </button>
                ))}
              </div>
              <p className="hint mt-2">
                Add a fallback with a pipe:{" "}
                <code>{"{{first_name|there}}"}</code>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="subject">
                  Subject
                </label>
                <input
                  id="subject"
                  name="subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="body">
                  Body
                </label>
                <textarea
                  id="body"
                  name="body"
                  ref={bodyRef}
                  rows={12}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="footer">
                  Footer — signature and opt-out
                </label>
                <textarea
                  id="footer"
                  name="footer"
                  rows={4}
                  value={footer}
                  onChange={(event) => setFooter(event.target.value)}
                  className="field"
                />
                <p className="hint mt-1">
                  Appended to every email. Cold outreach laws (CAN-SPAM, GDPR,
                  PECR) generally require a real postal address and a working
                  opt-out.
                </p>
              </div>
            </div>

            {unknownTokens.length > 0 && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                These tags match no column and will be sent literally:{" "}
                {unknownTokens.map((token) => `{{${token}}}`).join(", ")}
              </p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Preview
            </h2>
            {preview ? (
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
                <p className="hint">
                  To: {audience.recipients[0]?.email ?? "(no matching contact)"}
                </p>
                <p className="mt-2 font-medium">{preview.subject}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                  {preview.body}
                </p>
              </div>
            ) : (
              <p className="hint">No rows to preview.</p>
            )}
          </section>

          <section className="card space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              4 · Send
            </h2>

            <div>
              <label className="label" htmlFor="suppression">
                Never email these addresses
              </label>
              <textarea
                id="suppression"
                name="suppression"
                rows={3}
                value={suppression}
                onChange={(event) => setSuppression(event.target.value)}
                placeholder="one@example.com, two@example.com"
                className="field font-mono text-xs"
              />
            </div>

            <div>
              <label className="label" htmlFor="delay">
                Pause between emails: {(delayMs / 1000).toFixed(1)}s
              </label>
              <input
                id="delay"
                type="range"
                min={0}
                max={10000}
                step={250}
                value={delayMs}
                onChange={(event) => setDelayMs(Number(event.target.value))}
                className="w-full accent-primary"
              />
              <p className="hint">
                ≈{estimatedMinutes} min for {audience.recipients.length}{" "}
                contacts. Throttling protects your sending reputation.
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="skipAlreadySent"
                checked={skipAlreadySent}
                onChange={(event) => setSkipAlreadySent(event.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                Skip contacts already emailed from this list
                <span className="hint block">
                  {loaderData.alreadySent.length} so far
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="dryRun"
                checked={dryRun}
                onChange={(event) => setDryRun(event.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                Dry run
                <span className="hint block">
                  Render every email and produce a report without contacting
                  SMTP.
                </span>
              </span>
            </label>

            {!smtp.ready && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                SMTP is not configured, so only dry runs will work.{" "}
                <Link to="/settings" className="underline">
                  Configure it
                </Link>
                .
              </p>
            )}

            <p className="hint" role={audience.recipients.length > MAX_CAMPAIGN_RECIPIENTS ? "alert" : undefined}>
              Maximum {MAX_CAMPAIGN_RECIPIENTS} recipients per campaign.
              {audience.recipients.length > MAX_CAMPAIGN_RECIPIENTS && " Narrow your filters or upload a smaller list to continue."}
            </p>

            <button
              type="submit"
              disabled={sending || audience.recipients.length === 0 || audience.recipients.length > MAX_CAMPAIGN_RECIPIENTS}
              className="btn-primary w-full"
              onClick={(event) => {
                if (dryRun) return;
                const ok = window.confirm(
                  `Send this email to ${audience.recipients.length} contact(s)? This cannot be undone.`,
                );
                if (!ok) event.preventDefault();
              }}
            >
              {sending
                ? "Sending — keep this tab open…"
                : dryRun
                  ? `Dry run ${audience.recipients.length} email(s)`
                  : `Send ${audience.recipients.length} email(s)`}
            </button>
            {smtp.from && !dryRun && (
              <p className="hint text-center">Sending as {smtp.from}</p>
            )}
          </section>

          {loaderData.reports.length > 0 && (
            <section className="card">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Past runs
              </h2>
              <ul className="space-y-2 text-sm">
                {loaderData.reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      to={`/reports/${report.id}`}
                      className="link"
                    >
                      {new Date(report.startedAt).toLocaleString()}
                    </Link>
                    <span className="hint">
                      {" "}
                      — {report.sent} sent, {report.failed} failed
                      {report.dryRun ? " (dry run)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Form>
  );
}

function FilterBuilder({
  headers,
  rules,
  matchMode,
  onChangeRules,
  onChangeMatch,
}: {
  headers: string[];
  rules: FilterRule[];
  matchMode: FilterMatch;
  onChangeRules: (rules: FilterRule[]) => void;
  onChangeMatch: (match: FilterMatch) => void;
}) {
  const update = (index: number, patch: Partial<FilterRule>) => {
    onChangeRules(
      rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );
  };

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          2 · Who gets it
        </h2>
        {rules.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="hint">Match</span>
            <select
              value={matchMode}
              onChange={(event) =>
                onChangeMatch(event.target.value as FilterMatch)
              }
              className="field w-auto py-1"
            >
              <option value="all">all rules</option>
              <option value="any">any rule</option>
            </select>
          </div>
        )}
      </div>

      {rules.length === 0 ? (
        <p className="hint">
          No filters — every contact in the CSV is included.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <select
                value={rule.column}
                onChange={(event) => update(index, { column: event.target.value })}
                className="field w-auto flex-1"
              >
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <select
                value={rule.operator}
                onChange={(event) =>
                  update(index, { operator: event.target.value as Operator })
                }
                className="field w-auto flex-1"
              >
                {OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
              {operatorNeedsValue(rule.operator) && (
                <input
                  value={rule.value}
                  onChange={(event) => update(index, { value: event.target.value })}
                  placeholder="value"
                  className="field w-auto flex-1"
                />
              )}
              <button
                type="button"
                onClick={() => onChangeRules(rules.filter((_, i) => i !== index))}
                className="px-2 text-slate-400 transition hover:text-red-600"
                aria-label="Remove filter"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() =>
          onChangeRules([
            ...rules,
            { column: headers[0] ?? "", operator: "contains", value: "" },
          ])
        }
        className="btn-secondary mt-4"
      >
        + Add filter
      </button>
    </section>
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function defaultBody(): string {
  return `Hi {{first_name|there}},

I came across {{company|your team}} and noticed you're working in {{industry|your space}}.

We help teams like yours ship faster without adding headcount. Worth a 15-minute call next week?

If not, no hard feelings — just reply "no thanks" and I won't follow up.`;
}

function defaultFooter(): string {
  return `Best,
Your Name
Your Company · 123 Street, City, Country

Reply "unsubscribe" and I'll remove you immediately.`;
}

export function HydrateFallback() { return <p className="hint">Loading your local data…</p>; }
