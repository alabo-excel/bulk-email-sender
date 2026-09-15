import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/home";
import { parseCsv } from "~/lib/csv";
import { guessEmailColumn } from "~/lib/contacts";
import { deleteList, listLists, saveList } from "~/lib/store.server";
import { readSmtpConfig } from "~/lib/mailer.server";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Contact lists · Cold Email Sender" },
    {
      name: "description",
      content: "Upload a CSV of contacts and send personalized cold emails.",
    },
  ];
}

export function loader(_: Route.LoaderArgs) {
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

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();

  if (formData.get("intent") === "delete") {
    const id = String(formData.get("listId") ?? "");
    if (id) deleteList(id);
    return redirect("/");
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

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const uploading =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") !== "delete";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="card">
        <h1 className="text-xl font-semibold tracking-tight">
          Upload a contact list
        </h1>
        <p className="hint mt-1">
          A CSV with a header row. Every column becomes a{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">
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
              className="field file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 dark:file:bg-indigo-500/15 dark:file:text-indigo-300"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            <span className="hint">or paste</span>
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
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

          {actionData?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {actionData.error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? "Parsing…" : "Upload and continue"}
          </button>
        </Form>
      </section>

      <div className="space-y-6">
        {!loaderData.smtpReady && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Your lists
          </h2>
          {loaderData.lists.length === 0 ? (
            <p className="hint mt-3">Nothing uploaded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
              {loaderData.lists.map((list) => (
                <li
                  key={list.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/lists/${list.id}`}
                      className="block truncate text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
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
                      className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
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
