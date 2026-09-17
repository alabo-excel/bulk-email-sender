const STEPS = ["Connect your sender", "Upload a list", "Compose and send"] as const;

/**
 * Orients first-run users in the three-step path. Ordered list with
 * `aria-current="step"`, and the state of each step is carried in text rather
 * than by colour alone.
 */
export function SetupSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Setup progress">
      <p className="hint">Step {current} of {STEPS.length}</p>
      <ol className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const state = step === current ? "current" : step < current ? "done" : "upcoming";
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2 text-sm">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                state === "upcoming"
                  ? "border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  : "bg-primary text-white"
              }`}>{step}</span>
              <span className={state === "current"
                ? "font-medium text-slate-900 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400"}>
                {label}
                {state === "done" && <span className="sr-only"> (completed)</span>}
                {state === "current" && <span className="sr-only"> (current step)</span>}
              </span>
              {step < STEPS.length && <span aria-hidden="true" className="ml-1 text-slate-300 dark:text-slate-700">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
