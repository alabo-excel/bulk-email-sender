import { initializeLocalState } from "~/lib/store";
import { useState } from "react";
import { Link, data } from "react-router";
import type { Route } from "./+types/report";
import { getReport } from "~/lib/store";

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
  sent: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  skipped: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
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
        <Link to={report.listId === "test" ? "/activity" : `/lists/${report.listId}`} className="hint hover:underline">
          ← Back to {report.listName}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {report.dryRun ? "Dry run report" : "Send report"}
        </h1>
        <p className="hint">
          {new Date(report.startedAt).toLocaleString()} · finished in {seconds}s
        </p>
      </div>

      {report.dryRun && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          This was a dry run. Nothing was actually delivered.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={report.dryRun ? "Would send" : "Sent"} value={counts.sent} tone="emerald" />
        <Stat label="Failed" value={counts.failed} tone="red" />
        <Stat label="Skipped" value={counts.skipped} tone="gray" />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 p-3 dark:border-slate-800">
          {(["all", "sent", "failed", "skipped"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-md px-3 py-1 text-sm capitalize transition ${
                filter === option
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Row</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
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
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[attempt.status]}`}
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
  tone: "emerald" | "red" | "gray";
}) {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    gray: "text-slate-600 dark:text-slate-400",
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
