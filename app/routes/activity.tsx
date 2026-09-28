import { Link } from "react-router";
import type { Route } from "./+types/activity";
import { getState, initializeLocalState } from "~/lib/store";
export async function clientLoader() { await initializeLocalState(); return { reports: getState().reports }; }
export function meta() { return [{ title: "Activity · Cold Email Sender" }]; }
export default function Activity({ loaderData }: Route.ComponentProps) {
  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      <p className="hint mt-1 text-sm">Campaigns, dry runs, and test emails saved in this browser.</p>
    </div>
    <section className="card">
      {!loaderData.reports.length ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
          <p className="text-sm font-medium">No email activity yet</p>
          <p className="hint mt-1">Open a list and run a campaign or dry run. Reports appear here.</p>
          <Link to="/" className="btn-secondary mt-4">Go to lists</Link>
        </div>
      ) : (
        <ul className="-mx-2 space-y-1">{loaderData.reports.map((report) => {
          const sent = report.attempts.filter((attempt) => attempt.status === "sent").length;
          const failed = report.attempts.filter((attempt) => attempt.status === "failed").length;
          const skipped = report.attempts.filter((attempt) => attempt.status === "skipped").length;
          return <li key={report.id}>
            <Link to={`/reports/${report.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-3 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 dark:hover:bg-slate-800">
              <span className="mr-auto min-w-0">
                <span className="block truncate text-sm font-medium">{report.listName}</span>
                <time className="hint block" dateTime={new Date(report.startedAt).toISOString()}>{new Date(report.startedAt).toLocaleString()}</time>
              </span>
              {report.dryRun && <span className="badge badge-warning">Dry run</span>}
              <span className="badge badge-success">{sent} {report.dryRun ? "would send" : "sent"}</span>
              {failed > 0 && <span className="badge badge-danger">{failed} failed / unconfirmed</span>}
              {skipped > 0 && <span className="badge">{skipped} skipped</span>}
            </Link>
          </li>;
        })}</ul>
      )}
    </section>
  </div>;
}
export function HydrateFallback() { return <p className="hint">Loading activity…</p>; }
