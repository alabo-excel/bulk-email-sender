export function Field({ label, hint, error, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; hint?: string; error?: string; name: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  // Both are announced: the error says what is wrong, the hint still says what
  // a valid value looks like.
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return <div>
    <label className="label block" htmlFor={name}>{label}</label>
    <input id={name} name={name} {...props} className="field"
      aria-describedby={describedBy} aria-invalid={error ? true : undefined} />
    {error && <p id={errorId} className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
    {hint && <p id={hintId} className="hint mt-1">{hint}</p>}
  </div>;
}
