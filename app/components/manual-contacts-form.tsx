import { useState } from "react";
import { Form } from "react-router";
import { isValidEmail, toColumnKey } from "~/lib/contacts";
import { MAX_CAMPAIGN_RECIPIENTS } from "~/lib/limits";
import { Alert } from "./alert";

const DEFAULT_COLUMNS = ["email", "first_name", "last_name", "company"];

type Contact = { id: string; values: Record<string, string> };

function emptyContact(): Contact {
  return { id: crypto.randomUUID(), values: {} };
}

function columnLabel(column: string): string {
  const text = column.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ManualContactsForm({ error, submitting }: { error?: string; submitting: boolean }) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [contacts, setContacts] = useState<Contact[]>(() => [emptyContact()]);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [newColumn, setNewColumn] = useState("");
  const [columnError, setColumnError] = useState("");

  function updateValue(id: string, column: string, value: string) {
    setContacts((current) =>
      current.map((contact) =>
        contact.id === id ? { ...contact, values: { ...contact.values, [column]: value } } : contact,
      ),
    );
  }

  function addContact() {
    const contact = emptyContact();
    setContacts((current) => [...current, contact]);
    // Move focus to the new contact's email so keyboard users can keep typing.
    requestAnimationFrame(() => document.getElementById(`${contact.id}-email`)?.focus());
  }

  function removeContact(id: string) {
    setContacts((current) => (current.length > 1 ? current.filter((c) => c.id !== id) : current));
  }

  function addColumn() {
    const key = toColumnKey(newColumn);
    if (!key) return setColumnError("Use letters or numbers for the field name.");
    if (columns.includes(key)) return setColumnError(`“${key}” is already a field.`);
    setColumns((current) => [...current, key]);
    setNewColumn("");
    setColumnError("");
  }

  function removeColumn(column: string) {
    setColumns((current) => current.filter((c) => c !== column));
  }

  const payload = JSON.stringify({
    headers: columns,
    rows: contacts.map((contact) => contact.values),
  });

  return (
    <Form method="post" className="mt-5 space-y-5">
      <input type="hidden" name="intent" value="manual" />
      <input type="hidden" name="contacts" value={payload} />

      <div>
        <label className="label" htmlFor="listName">
          List name
        </label>
        <input id="listName" name="listName" type="text" placeholder="e.g. Conference leads" className="field" />
      </div>

      <fieldset>
        <legend className="label">Fields</legend>
        <p className="hint">
          Each field becomes a merge tag, e.g.{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{"{{first_name}}"}</code>.
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {columns.map((column) => (
            <li key={column} className="inline-flex min-h-8 items-center gap-1 rounded-md bg-slate-100 py-1 pl-2.5 pr-1 font-mono text-xs dark:bg-slate-800">
              <code>{column}</code>
              {column === "email" ? (
                <span className="px-1.5 font-sans text-slate-500 dark:text-slate-400">required</span>
              ) : (
                <button type="button" onClick={() => removeColumn(column)}
                  className="btn-quiet btn-quiet-danger -my-2.5 min-h-8 min-w-8 text-sm">
                  ×<span className="sr-only"> Remove field {column}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="newColumn">New field name</label>
            <input id="newColumn" type="text" value={newColumn} placeholder="Add a field, e.g. industry"
              className="field" aria-invalid={columnError ? true : undefined}
              aria-describedby={columnError ? "newColumn-error" : undefined}
              onChange={(event) => { setNewColumn(event.target.value); setColumnError(""); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addColumn(); } }} />
          </div>
          <button type="button" className="btn-secondary" onClick={addColumn}>Add field</button>
        </div>
        {columnError && <p id="newColumn-error" className="mt-1 text-xs font-medium text-danger">{columnError}</p>}
      </fieldset>

      <ol className="space-y-4">
        {contacts.map((contact, index) => {
          const email = contact.values.email ?? "";
          const emailInvalid = touched.has(contact.id) && email.trim() !== "" && !isValidEmail(email);
          return (
            <li key={contact.id}>
              <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <legend className="text-sm font-semibold">Contact {index + 1}</legend>
                  {contacts.length > 1 && (
                    <button type="button" onClick={() => removeContact(contact.id)}
                      className="btn-quiet btn-quiet-danger -my-2">
                      Remove<span className="sr-only"> contact {index + 1}</span>
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {columns.map((column) => {
                    const id = `${contact.id}-${column}`;
                    const isEmail = column === "email";
                    return (
                      <div key={column}>
                        <label className="label" htmlFor={id}>{columnLabel(column)}</label>
                        <input id={id} type={isEmail ? "email" : "text"} autoComplete="off"
                          value={contact.values[column] ?? ""}
                          className="field"
                          aria-invalid={isEmail && emailInvalid ? true : undefined}
                          aria-describedby={isEmail && emailInvalid ? `${id}-error` : undefined}
                          onChange={(event) => updateValue(contact.id, column, event.target.value)}
                          onBlur={isEmail ? () => setTouched((current) => new Set(current).add(contact.id)) : undefined} />
                        {isEmail && emailInvalid && (
                          <p id={`${id}-error`} className="mt-1 text-xs font-medium text-danger">
                            Enter a valid email address.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={addContact}>+ Add another contact</button>
        <span className="hint">
          {contacts.length} contact{contacts.length === 1 ? "" : "s"} · campaigns send to up to {MAX_CAMPAIGN_RECIPIENTS} at a time
        </span>
      </div>

      {error && (
        <Alert tone="error" role="alert">{error}</Alert>
      )}

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? "Saving…" : "Save list and continue"}
      </button>
    </Form>
  );
}
