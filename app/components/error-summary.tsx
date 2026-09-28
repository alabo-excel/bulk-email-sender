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
        className="alert alert-error block outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
        <h2 id="error-summary-title" className="text-sm font-semibold">{title}</h2>
        <ul className="mt-2 space-y-1">
          {entries.map(([name, message]) => (
            <li key={name}>
              <a href={`#${name}`} className="text-sm underline underline-offset-2 hover:no-underline"
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
