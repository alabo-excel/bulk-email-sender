import { useState } from "react";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  name: string;
  /** Adds a show/hide toggle. Only meaningful for type="password". */
  revealable?: boolean;
};

export function Field({ label, hint, error, name, revealable, type, required, ...props }: FieldProps) {
  const [shown, setShown] = useState(false);
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  // Both are announced: the error says what is wrong, the hint still says what
  // a valid value looks like.
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const inputType = revealable && shown ? "text" : type;

  return <div>
    <label className="label block" htmlFor={name}>
      {label}
      {required
        ? <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">(required)</span>
        : <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">(optional)</span>}
    </label>

    <div className="relative">
      <input id={name} name={name} type={inputType} required={required} {...props}
        className={`field ${revealable ? "pr-16" : ""}`}
        aria-describedby={describedBy} aria-invalid={error ? true : undefined} />

      {revealable && (
        <button type="button" onClick={() => setShown((value) => !value)} aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex min-h-11 cursor-pointer items-center px-2
            text-xs font-medium text-slate-600 underline-offset-2 hover:underline
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
            dark:text-slate-300">
          {shown ? "Hide" : "Show"}
          <span className="sr-only"> {label}</span>
        </button>
      )}
    </div>

    {error && <p id={errorId} className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
    {hint && <p id={hintId} className="hint mt-1">{hint}</p>}
  </div>;
}
