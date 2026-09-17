export type Notice = { text: string; tone: "success" | "error" };

export type NoticeHandler = (notice: Notice | null) => void;

/** Build an error notice from a thrown value, falling back when it is not an Error. */
export function errorNotice(error: unknown, fallback: string): Notice {
  return { tone: "error", text: error instanceof Error ? error.message : fallback };
}

/**
 * Both regions stay mounted whether or not there is a notice: assistive tech
 * often misses content injected into a live region created in the same render.
 */
export function NoticeRegions({ notice }: { notice: Notice | null }) {
  return <>
    <div role="status" aria-live="polite">
      {notice?.tone === "success" &&
        <p className="card text-sm text-emerald-700 dark:text-emerald-300">{notice.text}</p>}
    </div>
    <div role="alert">
      {notice?.tone === "error" &&
        <p className="card text-sm text-red-700 dark:text-red-300">Error: {notice.text}</p>}
    </div>
  </>;
}
