import { forwardRef } from "react";

export type FieldErrors = Record<string, string>;

/**
 * Complements the inline field errors rather than replacing them: focus lands
 * here after a failed submit, and each item links to the field it describes.
 * `tabIndex={-1}` makes it programmatically focusable without adding a tab stop.
 */
export const ErrorSummary = forwardRef<HTMLDivElement, { errors: FieldErrors; title?: string }>(
  function ErrorSummary({ errors, title = "There is a problem" }, ref) {
    const entries = Object.entries(errors).filter(([, message]) => message);
    if (!entries.length) return null;
    return (
      <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title"
        className="rounded-lg border border-red-300 bg-red-50 p-4 outline-none
          focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2
          dark:border-red-500/50 dark:bg-red-500/10 dark:focus-visible:ring-offset-slate-900">
        <h2 id="error-summary-title" className="text-sm font-semibold text-red-800 dark:text-red-200">{title}</h2>
        <ul className="mt-2 space-y-1">
          {entries.map(([name, message]) => (
            <li key={name}>
              <a href={`#${name}`} className="text-sm text-red-800 underline underline-offset-2 hover:no-underline dark:text-red-200"
                onClick={(event) => {
                  // Focus the field itself, not just the fragment target.
                  event.preventDefault();
                  document.getElementById(name)?.focus();
                }}>{message}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  },
);
