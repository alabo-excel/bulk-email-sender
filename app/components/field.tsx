export function Field({ label, hint, invalid, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; hint?: string; invalid?: boolean; name: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return <div>
    <label className="label block" htmlFor={name}>{label}</label>
    <input id={name} name={name} {...props} className="field"
      aria-describedby={hintId} aria-invalid={invalid || undefined} />
    {hint && <p id={hintId} className={`mt-1 text-xs ${invalid ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400"}`}>{hint}</p>}
  </div>;
}
