import { Alert, StepHeading } from "~/components/alert";
import { DraftAssistant } from "~/components/draft-assistant";
import { MAX_CAMPAIGN_RECIPIENTS } from "~/lib/limits";
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

  const skippedByReason = audience.skipped.reduce<Record<string, number>>((counts, row) => {
    counts[row.reason] = (counts[row.reason] ?? 0) + 1;
    return counts;
  }, {});
  const recipientCount = audience.recipients.length;
  const overLimit = recipientCount > MAX_CAMPAIGN_RECIPIENTS;

  const estimatedMinutes = Math.round(
    (audience.recipients.length * delayMs) / 60_000,
  );

  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />
      <input type="hidden" name="matchMode" value={matchMode} />
      <input type="hidden" name="emailColumn" value={emailColumn} />
      <input type="hidden" name="delayMs" value={delayMs} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link to="/" className="hint inline-flex min-h-8 items-center hover:underline">
            ← All lists
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {list.name}
          </h1>
          <p className="hint">
            {list.rows.length} contact{list.rows.length === 1 ? "" : "s"} · {list.headers.length} field{list.headers.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="card w-full py-4 sm:w-64" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2">
            <p className="section-title">Recipients</p>
            <p className="tabular-nums">
              <span className={`text-2xl font-semibold ${overLimit ? "text-danger" : ""}`}>{recipientCount}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400"> / {MAX_CAMPAIGN_RECIPIENTS}</span>
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
            <div className={`h-full rounded-full transition-[width] ${overLimit ? "bg-danger" : "bg-primary"}`}
              style={{ width: `${Math.min(100, (recipientCount / MAX_CAMPAIGN_RECIPIENTS) * 100)}%` }} />
          </div>
          <p className={`mt-2 text-xs ${overLimit ? "font-medium text-danger" : "hint"}`}>
            {overLimit
              ? `${recipientCount - MAX_CAMPAIGN_RECIPIENTS} over the per-send limit. Narrow your filters.`
              : `Up to ${MAX_CAMPAIGN_RECIPIENTS} per send`}
          </p>
        </div>
      </div>

      {actionData?.error && <Alert tone="error" role="alert" title="Couldn't send">{actionData.error}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="card">
            <StepHeading step={1} title="Recipients" />
            <label className="label" htmlFor="emailColumn">Email address field</label>
            <select
              id="emailColumn"
              value={emailColumn}
              onChange={(event) => setEmailColumn(event.target.value)}
              className="field"
              aria-describedby="emailColumn-hint"
            >
              {list.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
            <p id="emailColumn-hint" className="hint mt-2">
              The field that holds each contact's email address.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {audience.skipped.length === 0 ? (
                <span className="badge badge-success">No contacts skipped</span>
              ) : (
                <>
                  <span className="hint">{audience.skipped.length} skipped:</span>
                  {Object.entries(SKIP_LABELS).map(([reason, label]) =>
                    skippedByReason[reason] ? (
                      <span key={reason} className={`badge ${reason === "invalid-email" ? "badge-warning" : ""}`}>
                        {skippedByReason[reason]} {label}
                      </span>
                    ) : null,
                  )}
                </>
              )}
            </div>
          </section>

          <FilterBuilder
            headers={list.headers}
            rules={rules}
            matchMode={matchMode}
            onChangeRules={setRules}
            onChangeMatch={setMatchMode}
          />

          <section className="card">
            <StepHeading step={3} title="Compose" />

            <DraftAssistant key={list.id} disabled={sending} onChoose={(draft) => {
              setSubject(draft.subject);
              setBody(draft.body);
              bodyRef.current?.focus();
            }} />

            <div className="mb-4">
              <p className="label">Insert a merge tag</p>
              <div className="flex flex-wrap gap-1.5">
                {list.headers.map((header) => (
                  <button
                    key={header}
                    type="button"
                    onClick={() => insertToken(header)}
                    className="min-h-8 cursor-pointer rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 transition hover:bg-slate-200 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    {`{{${header}}}`}
                  </button>
                ))}
              </div>
              <p className="hint mt-2">
                Add a fallback with a pipe:{" "}
                <code className="font-mono">{"{{first_name|there}}"}</code>
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
              <Alert tone="warning" className="mt-4" title="Some tags don't match a field">
                These will be sent exactly as typed:{" "}
                <span className="font-mono">{unknownTokens.map((token) => `{{${token}}}`).join(", ")}</span>
              </Alert>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <section className="card" aria-labelledby="preview-title">
            <h2 id="preview-title" className="section-title mb-3">Preview</h2>
            {preview ? (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                <dl className="space-y-1 border-b border-slate-200 px-4 py-3 text-xs dark:border-slate-800">
                  {smtp.from && (
                    <div className="flex gap-2"><dt className="w-12 shrink-0 text-slate-500 dark:text-slate-400">From</dt><dd className="min-w-0 truncate">{smtp.from}</dd></div>
                  )}
                  <div className="flex gap-2"><dt className="w-12 shrink-0 text-slate-500 dark:text-slate-400">To</dt><dd className="min-w-0 truncate">{audience.recipients[0]?.email ?? "No matching contact"}</dd></div>
                  <div className="flex gap-2"><dt className="w-12 shrink-0 text-slate-500 dark:text-slate-400">Subject</dt><dd className="min-w-0 font-medium">{preview.subject}</dd></div>
                </dl>
                <p className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                  {preview.body}
                </p>
              </div>
            ) : (
              <p className="hint">No contacts to preview.</p>
            )}
            {preview && preview.missing.length > 0 && (
              <p className="hint mt-2">
                Empty for this contact: <span className="font-mono">{preview.missing.join(", ")}</span>
              </p>
            )}
          </section>

          <section className="card space-y-4">
            <StepHeading step={4} title="Send" />

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
              <Alert tone="warning">
                Your sender isn't connected, so only dry runs will work.{" "}
                <Link to="/settings" className="font-medium underline underline-offset-2">
                  Connect it
                </Link>
              </Alert>
            )}

            <div role="alert">
              {overLimit && (
                <Alert tone="error">
                  {recipientCount} recipients is over the {MAX_CAMPAIGN_RECIPIENTS}-per-send limit. Narrow your filters or use a smaller list.
                </Alert>
              )}
            </div>

            <button
              type="submit"
              disabled={sending || recipientCount === 0 || overLimit}
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
              <h2 className="section-title mb-3">Past runs</h2>
              <ul className="-mx-2 space-y-1 text-sm">
                {loaderData.reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      to={`/reports/${report.id}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-2 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 dark:hover:bg-slate-800"
                    >
                      <span className="mr-auto font-medium underline-offset-2">{new Date(report.startedAt).toLocaleString()}</span>
                      {report.dryRun && <span className="badge badge-warning">Dry run</span>}
                      <span className="badge badge-success">{report.sent} sent</span>
                      {report.failed > 0 && <span className="badge badge-danger">{report.failed} failed</span>}
                    </Link>
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
      <StepHeading step={2} title="Filter contacts">
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
      </StepHeading>

      {rules.length === 0 ? (
        <p className="hint">
          No filters — every contact in the list is included.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Filter ${index + 1} field`}
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
                aria-label={`Filter ${index + 1} condition`}
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
                  aria-label={`Filter ${index + 1} value`}
                  value={rule.value}
                  onChange={(event) => update(index, { value: event.target.value })}
                  placeholder="value"
                  className="field w-auto flex-1"
                />
              )}
              <button
                type="button"
                onClick={() => onChangeRules(rules.filter((_, i) => i !== index))}
                className="btn-quiet btn-quiet-danger"
                aria-label={`Remove filter ${index + 1}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
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

const SKIP_LABELS: Record<string, string> = {
  "invalid-email": "invalid email",
  duplicate: "duplicate",
  suppressed: "suppressed",
  "already-sent": "already emailed",
};

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
