import { Link } from "react-router";
import type { Route } from "./+types/activity";
import { getState, initializeLocalState } from "~/lib/store";
export async function clientLoader() { await initializeLocalState(); return { reports: getState().reports }; }
export function meta() { return [{ title: "Activity · Cold Email Sender" }]; }
export default function Activity({ loaderData }: Route.ComponentProps) {
  return <section className="card"><h1 className="text-xl font-semibold">Email activity</h1>
    <p className="hint mt-1">Campaigns, dry runs, and test emails saved in this browser.</p>
    {!loaderData.reports.length ? <p className="mt-6 text-sm">No email activity yet.</p> :
      <ul className="mt-4 space-y-1">{loaderData.reports.map((report) =>
        <li key={report.id} className="py-3"><Link className="link" to={`/reports/${report.id}`}>{report.listName}{report.dryRun ? " · Dry run" : ""}</Link>
          <p className="hint">{new Date(report.startedAt).toLocaleString()} · {report.attempts.filter((attempt) => attempt.status === "sent").length} {report.dryRun ? "would send" : "sent"} · {report.attempts.filter((attempt) => attempt.status === "failed").length} failed / unconfirmed</p></li>)}</ul>}
  </section>;
}
export function HydrateFallback() { return <p className="hint">Loading activity…</p>; }
