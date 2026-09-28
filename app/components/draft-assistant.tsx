import { useEffect, useRef, useState } from "react";
import { userId } from "~/lib/store";
import type { EmailDraft } from "~/lib/types";
import { Alert } from "./alert";

export function DraftAssistant({ onChoose, disabled }: {
  onChoose: (draft: EmailDraft) => void;
  disabled: boolean;
}) {
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [usage, setUsage] = useState<{ remaining: number; limit: number; resetsAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function generate() {
    if (controller.current || disabled || !description.trim()) return;
    const request = new AbortController();
    controller.current = request;
    const expectedUserId = userId();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, expectedUserId }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
      });
      const result = await response.json();
      if (expectedUserId !== userId()) throw new Error("Account changed. Please reload.");
      if (result.usage) setUsage(result.usage);
      if (!response.ok) throw new Error(result.error || "Could not generate drafts. Please try again.");
      if (!Array.isArray(result.drafts) || result.drafts.length !== 3) throw new Error("Incomplete drafts. Please try again.");
      setDrafts(result.drafts);
      setNotice(result.message);
    } catch (error) {
      if (!request.signal.aborted) setError(error instanceof Error && error.name !== "TimeoutError"
        ? error.message : "Draft generation timed out. Please try again.");
    } finally {
      controller.current = null;
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">Draft with AI <span className="badge">Gemini</span></h3>
        <p className="hint mt-1">Describe your message and choose from three approaches.</p>
      </div>
      <label className="label" htmlFor="draft-description">What do you want to say?</label>
      <textarea id="draft-description" className="field" rows={4} maxLength={4000}
        value={description} disabled={loading || disabled}
        onChange={(event) => setDescription(event.target.value)}
        aria-describedby="draft-help" placeholder="Invite local shop owners to try our inventory app. Mention the free 14-day trial and ask if they'd like a demo." />
      <p id="draft-help" className="hint">Say who it is for, the key points, and what you want the reader to do. Your description is sent to Google Gemini; contacts and SMTP details are not.</p>
      <button type="button" className="btn-primary min-h-11" disabled={loading || disabled || !description.trim()}
        onClick={generate}>{loading ? "Drafting three options…" : "Generate 3 AI drafts"}</button>
      {usage && <p className="hint">{usage.remaining} of {usage.limit} AI credits remaining today. One credit generates three drafts. Resets at midnight UTC.</p>}
      <div role="alert">{error && <Alert tone="error">{error}</Alert>}</div>
      <p role="status" className="hint">{loading ? "Writing your drafts. This may take a few moments." : notice}</p>
      {drafts.length > 0 && (
        <div className="space-y-3" aria-label="Draft options" aria-busy={loading}>
          <p className="text-sm font-medium">AI drafts</p>
          <p className="hint">Choosing a draft replaces the subject and body below. Your footer stays in place.</p>
          {drafts.map((draft, index) => (
            <article key={index} className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="flex items-center gap-2 text-sm font-semibold">Option {index + 1} <span className="badge">{draft.tone}</span></h4>
              <p className="mt-2 break-words font-medium">{draft.subject}</p>
              <p className="mt-2 flex-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">{draft.body}</p>
              <button type="button" className="btn-secondary mt-3 min-h-11 w-full" disabled={loading || disabled}
                onClick={() => { onChoose(draft); setNotice(`Option ${index + 1} added to the composer. You can edit it below.`); }}>
                Use option {index + 1}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
