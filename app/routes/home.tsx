import { useState } from "react";
import { initializeLocalState } from "~/lib/store";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/home";
import { Alert } from "~/components/alert";
import { ManualContactsForm } from "~/components/manual-contacts-form";
import { parseCsv } from "~/lib/csv";
import { buildManualTable, guessEmailColumn } from "~/lib/contacts";
import { deleteList, listLists, saveList } from "~/lib/store";
import { readSmtpConfig } from "~/lib/store";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Contact lists · Cold Email Sender" },
    {
      name: "description",
      content: "Upload a CSV or enter contacts, then send personalized cold emails.",
    },
  ];
}

export async function clientLoader(_: Route.ClientLoaderArgs) {
  await initializeLocalState();
  const { issues } = readSmtpConfig();
  return {
    smtpReady: issues.length === 0,
    lists: listLists().map((list) => ({
      id: list.id,
      name: list.name,
      uploadedAt: list.uploadedAt,
      rowCount: list.rows.length,
      columnCount: list.headers.length,
    })),
  };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  await initializeLocalState();
  const formData = await request.formData();

  if (formData.get("intent") === "delete") {
    const id = String(formData.get("listId") ?? "");
    if (id) deleteList(id);
    return redirect("/");
  }

  if (formData.get("intent") === "manual") {
    let parsed: { headers?: unknown; rows?: unknown };
    try {
      parsed = JSON.parse(String(formData.get("contacts") ?? "{}"));
    } catch {
      return data({ error: "Could not read the contacts. Please try again.", mode: "manual" as const }, { status: 400 });
    }
    const headers = Array.isArray(parsed.headers) ? parsed.headers.map(String) : [];
    const rows = Array.isArray(parsed.rows) ? (parsed.rows as Record<string, string>[]) : [];
    const result = buildManualTable(headers, rows);
    if (!result.ok) return data({ error: result.error, mode: "manual" as const }, { status: 400 });

    const name = String(formData.get("listName") ?? "").trim() || "Manual contacts";
    const list = saveList(name, { headers: result.headers, rows: result.rows });
    return redirect(`/lists/${list.id}`);
  }

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();

  let text = "";
  let name = "Pasted contacts";

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) {
      return data(
        { error: "That CSV is larger than 5 MB. Split it into smaller files." },
        { status: 400 },
      );
    }
    text = await file.text();
    name = file.name.replace(/\.csv$/i, "");
  } else if (pasted) {
    text = pasted;
  } else {
    return data(
      { error: "Choose a CSV file or paste CSV text to continue." },
      { status: 400 },
    );
  }

  const table = parseCsv(text);
  if (table.headers.length === 0 || table.rows.length === 0) {
    return data(
      { error: "No rows found. The CSV needs a header row and at least one contact." },
      { status: 400 },
    );
  }
  if (!guessEmailColumn(table.headers, table.rows)) {
    return data(
      {
        error:
          "No column looks like an email address. Add an `email` column and re-upload.",
      },
      { status: 400 },
    );
  }

  const list = saveList(name || "Untitled list", table);
  return redirect(`/lists/${list.id}`);
}

type Mode = "csv" | "manual";

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submittingIntent =
    navigation.state === "submitting" ? navigation.formData?.get("intent") : undefined;
  const uploading = submittingIntent !== undefined && submittingIntent !== "delete" && submittingIntent !== "manual";
  const result = actionData as { error?: string; mode?: Mode } | undefined;
  const manualError = result?.mode === "manual" ? result.error : undefined;
  const csvError = result?.mode === "manual" ? undefined : result?.error;
  const [mode, setMode] = useState<Mode>(result?.mode ?? "csv");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contact lists</h1>
        <p className="hint mt-1 text-sm">
          Add the people you want to reach, then open a list to write and send your campaign.
        </p>
      </div>

      {!loaderData.smtpReady && (
        <Alert tone="warning" title="Your sender isn't connected yet">
          You can add lists and preview emails now. Finish{" "}
          <Link to="/settings" className="font-medium underline underline-offset-2">sender settings</Link>{" "}
          before sending.
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card" aria-labelledby="add-list-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="add-list-title" className="text-base font-semibold">Add a list</h2>
            <div role="group" aria-label="How to add contacts" className="segmented">
              {([["csv", "Upload CSV"], ["manual", "Enter manually"]] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "manual" ? (
            <>
              <p className="hint mt-2">
                Type in each contact. Blank contacts are ignored.
              </p>
              <ManualContactsForm
                error={manualError}
                submitting={submittingIntent === "manual"}
              />
            </>
          ) : (
            <>
              <p className="hint mt-2">
                A CSV with a header row. Every column becomes a{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800">
                  {"{{merge_tag}}"}
                </code>{" "}
                you can use in the email.
              </p>

              <Form
                method="post"
                encType="multipart/form-data"
                className="mt-5 space-y-5"
              >
                <div>
                  <label className="label" htmlFor="file">
                    CSV file
                  </label>
                  <input
                    id="file"
                    name="file"
                    type="file"
                    accept=".csv,text/csv"
                    className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 transition hover:border-slate-500 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-surface dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-500"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  <span className="hint">or paste</span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>

                <div>
                  <label className="label" htmlFor="pasted">
                    CSV text
                  </label>
                  <textarea
                    id="pasted"
                    name="pasted"
                    rows={5}
                    spellCheck={false}
                    placeholder={"email,first_name,company,industry\nada@acme.com,Ada,Acme,Fintech"}
                    className="field font-mono text-xs"
                  />
                </div>

                {csvError && <Alert tone="error" role="alert">{csvError}</Alert>}

                <button type="submit" className="btn-primary" disabled={uploading}>
                  {uploading ? "Parsing…" : "Upload and continue"}
                </button>
              </Form>
            </>
          )}
        </section>

        <section className="card lg:sticky lg:top-6" aria-labelledby="lists-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="lists-title" className="section-title">Your lists</h2>
            {loaderData.lists.length > 0 && <span className="badge">{loaderData.lists.length}</span>}
          </div>
          {loaderData.lists.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
              <p className="text-sm font-medium">No lists yet</p>
              <p className="hint mt-1">Upload a CSV or enter contacts to create your first list.</p>
            </div>
          ) : (
            <ul className="-mx-2 mt-3 space-y-1">
              {loaderData.lists.map((list) => (
                <li
                  key={list.id}
                  className="group flex items-center justify-between gap-2 rounded-lg px-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Link to={`/lists/${list.id}`} className="min-w-0 flex-1 rounded-md py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                    <span className="block truncate text-sm font-medium">{list.name}</span>
                    <span className="hint block">
                      {list.rowCount} contact{list.rowCount === 1 ? "" : "s"} · {list.columnCount} field{list.columnCount === 1 ? "" : "s"} · {new Date(list.uploadedAt).toLocaleDateString()}
                    </span>
                  </Link>
                  <Form method="post" onSubmit={(event) => {
                    if (!window.confirm(`Delete “${list.name}” and its send reports? This cannot be undone.`)) event.preventDefault();
                  }}>
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="listId" value={list.id} />
                    <button type="submit" className="btn-quiet btn-quiet-danger">
                      Delete<span className="sr-only"> {list.name}</span>
                    </button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function HydrateFallback() { return <p className="hint">Loading your local data…</p>; }
