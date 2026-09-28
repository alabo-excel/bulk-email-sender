import { initializeLocalState } from "~/lib/store";
import { useState } from "react";
import { Link, data } from "react-router";
import type { Route } from "./+types/report";
import { getReport } from "~/lib/store";
import { Alert } from "~/components/alert";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Send report · Cold Email Sender" }];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  await initializeLocalState();
  const report = getReport(params.reportId);
  if (!report) {
    throw data("Report not found. This report is not saved in this browser.", {
      status: 404,
    });
  }
  return { report };
}

const STATUS_STYLES = {
  sent: "badge-success",
  failed: "badge-danger",
  skipped: "",
} as const;

export default function Report({ loaderData }: Route.ComponentProps) {
  const { report } = loaderData;
  const [filter, setFilter] = useState<"all" | "sent" | "failed" | "skipped">(
    "all",
  );

  const counts = {
    sent: report.attempts.filter((a) => a.status === "sent").length,
    failed: report.attempts.filter((a) => a.status === "failed").length,
    skipped: report.attempts.filter((a) => a.status === "skipped").length,
  };
  const visible =
    filter === "all"
      ? report.attempts
      : report.attempts.filter((attempt) => attempt.status === filter);
  const seconds = Math.max(
    1,
    Math.round((report.finishedAt - report.startedAt) / 1000),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link to={report.listId === "test" ? "/activity" : `/lists/${report.listId}`} className="hint inline-flex min-h-8 items-center hover:underline">
          ← Back to {report.listName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {report.dryRun ? "Dry run report" : "Send report"}
        </h1>
        <p className="hint">
          {new Date(report.startedAt).toLocaleString()} · finished in {seconds}s
        </p>
      </div>

      {report.dryRun && (
        <Alert tone="warning" title="Dry run">Nothing was actually delivered.</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={report.dryRun ? "Would send" : "Sent"} value={counts.sent} tone="success" />
        <Stat label="Failed / unconfirmed" value={counts.failed} tone="danger" />
        <Stat label="Skipped" value={counts.skipped} tone="gray" />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="p-3">
          <div role="group" aria-label="Show attempts" className="segmented">
            {(["all", "sent", "failed", "skipped"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className="capitalize"
              >
                {option}
                <span className="tabular-nums text-xs opacity-70">
                  {option === "all" ? report.attempts.length : counts[option]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Row</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="rows">
              {visible.map((attempt, index) => (
                <tr key={`${attempt.email}-${index}`}>
                  <td className="px-4 py-2 tabular-nums text-slate-500">
                    {attempt.rowNumber}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {attempt.email || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`badge capitalize ${STATUS_STYLES[attempt.status]}`}
                    >
                      {attempt.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                    {attempt.error ?? attempt.reason ?? attempt.subject}
                    {attempt.body && <details className="mt-2"><summary className="link cursor-pointer">View email</summary><p className="mt-2 font-medium">{attempt.subject}</p><p className="mt-1 whitespace-pre-wrap">{attempt.body}</p></details>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    Nothing in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "gray";
}) {
  // Zero is not a result worth colouring: a "0" in red reads as an alarm.
  const tones = {
    success: value ? "text-success" : "",
    danger: value ? "text-danger" : "",
    gray: "",
  };
  return (
    <div className="card">
      <p className={`text-3xl font-semibold tabular-nums ${tones[tone]}`}>
        {value}
      </p>
      <p className="hint mt-1">{label}</p>
    </div>
  );
}

export function HydrateFallback() { return <p className="hint">Loading your local data…</p>; }
