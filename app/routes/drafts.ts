import { getAuth } from "@clerk/react-router/server";
import type { Route } from "./+types/drafts";
import { DraftProviderError, generateDrafts } from "~/lib/drafts.server";
import { generateTemplateDrafts } from "~/lib/draft-templates";
import { reserveDraftCredit } from "~/lib/draft-usage.server";

export async function action(args: Route.ActionArgs) {
  const reply = (body: object, status = 200) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store" },
  });
  const { userId } = await getAuth(args);
  if (!userId) return reply({ error: "Please sign in again." }, 401);
  if (args.request.method !== "POST") return reply({ error: "Use POST to generate drafts." }, 405);
  if (args.request.headers.get("origin") !== new URL(args.request.url).origin) {
    return reply({ error: "Invalid request origin." }, 403);
  }
  if (!args.request.headers.get("content-type")?.startsWith("application/json")) {
    return reply({ error: "Expected JSON." }, 415);
  }
  const reader = args.request.body?.getReader();
  if (!reader) return reply({ error: "Describe the email you want to send." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 24_000) {
      await reader.cancel();
      return reply({ error: "Your description is too long." }, 413);
    }
    chunks.push(value);
  }
  let payload;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return reply({ error: "Invalid JSON." }, 400); }
  if (payload?.expectedUserId !== userId) return reply({ error: "Account changed. Please reload." }, 403);
  const description = payload?.description;
  if (typeof description !== "string" || !description.trim() || description.length > 4000) {
    return reply({ error: "Describe your email in 1–4,000 characters." }, 400);
  }
  if (payload.mode !== undefined && !["ai", "template"].includes(payload.mode)) {
    return reply({ error: "Choose AI or template drafting." }, 400);
  }
  const fallback = (message: string, usage?: object) => reply({
    drafts: generateTemplateDrafts(description), source: "template", message, usage,
  });
  if (payload.mode === "template") return fallback("Three free templates are ready. Review the wording before sending.");
  if (!process.env.OPENAI_API_KEY) {
    return fallback("AI drafting needs OPENAI_API_KEY on the server. Free templates are shown instead.");
  }
  let usage;
  try { usage = await reserveDraftCredit(userId); }
  catch {
    return fallback("AI usage storage is unavailable. Check the configured usage database and its access permissions. Free templates are shown instead.");
  }
  if (!usage.allowed) {
    return fallback("Today's AI allowance has been reached. Here are three free templates. AI allowances reset at midnight UTC.", usage);
  }
  try {
    return reply({ drafts: await generateDrafts(description.trim()), source: "ai", usage,
      message: "Three AI drafts are ready. Choose one to edit below." });
  } catch (error) {
    const reason = error instanceof DraftProviderError ? error.message : "AI drafting did not finish.";
    return fallback(`${reason} Free templates are shown instead. This attempt used one AI credit.`, usage);
  }
}
