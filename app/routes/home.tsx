import { useState } from "react";
import { initializeLocalState } from "~/lib/store";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/home";
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="card">
        <h1 className="text-xl font-semibold tracking-tight">
          Add a contact list
        </h1>

        <div role="group" aria-label="How to add contacts" className="mt-4 inline-flex rounded-md bg-slate-100 p-1 dark:bg-slate-800">
          {([["csv", "Upload CSV"], ["manual", "Enter manually"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}
              className={`cursor-pointer rounded px-3 py-1.5 text-sm font-medium transition ${
                mode === value
                  ? "bg-white shadow-sm dark:bg-slate-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {mode === "manual" ? (
          <>
            <p className="hint mt-3">
              Type in each contact. Blank contacts are ignored.
            </p>
            <ManualContactsForm
              error={manualError}
              submitting={submittingIntent === "manual"}
            />
          </>
        ) : (
        <>
        <p className="hint mt-3">
          A CSV with a header row. Every column becomes a{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
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
              className="field file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary dark:file:bg-blue-500/15 dark:file:text-primary-soft"
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

          {csvError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {csvError}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? "Parsing…" : "Upload and continue"}
          </button>
        </Form>
        </>
        )}
      </section>

      <div className="space-y-6">
        {!loaderData.smtpReady && (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="font-medium">SMTP is not configured yet.</p>
            <p className="mt-1">
              You can still upload and preview. Add credentials in{" "}
              <Link to="/settings" className="underline">
                Settings
              </Link>{" "}
              before sending.
            </p>
          </div>
        )}

        <section className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Your lists
          </h2>
          {loaderData.lists.length === 0 ? (
            <p className="hint mt-3">No lists yet.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {loaderData.lists.map((list) => (
                <li
                  key={list.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/lists/${list.id}`}
                      className="link block truncate text-sm"
                    >
                      {list.name}
                    </Link>
                    <p className="hint">
                      {list.rowCount} contacts · {list.columnCount} columns
                    </p>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="listId" value={list.id} />
                    <button
                      type="submit"
                      className="text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                    >
                      Delete
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
