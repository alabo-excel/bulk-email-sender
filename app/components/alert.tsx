export type AlertTone = "error" | "warning" | "success" | "info";

const ICONS: Record<AlertTone, React.ReactNode> = {
  error: <path d="M12 8v5m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  warning: <path d="M12 9v4m0 3h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  success: <path d="m8.5 12.5 2.5 2.5 5-5.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  info: <path d="M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
};

/**
 * One status surface for the whole app. Colour reinforces the tone; the icon
 * and wording carry it, so nothing depends on colour alone. Callers choose the
 * live-region role, since only messages that appear after an action should
 * interrupt a screen reader.
 */
export function Alert({ tone, title, children, role, className = "" }: {
  tone: AlertTone;
  title?: string;
  children?: React.ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div role={role} className={`alert alert-${tone} ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {ICONS[tone]}
      </svg>
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "opacity-90" : undefined}>{children}</div>}
      </div>
    </div>
  );
}

/** Numbered heading for the steps of a multi-part form. */
export function StepHeading({ step, title, children }: { step: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-surface">
          {step}
        </span>
        <span className="text-sm font-semibold">
          <span className="sr-only">Step {step}: </span>{title}
        </span>
      </h2>
      {children}
    </div>
  );
}
