import { getAuth } from "@clerk/react-router/server";
import type { Route } from "./+types/vault";
import { encryptPassword, vaultKeyIssue } from "~/lib/vault.server";

/**
 * Takes a plaintext SMTP password and returns ciphertext for the browser to
 * store. This is the only time the plaintext crosses the wire — every later
 * send posts the blob instead.
 */
export async function action(args: Route.ActionArgs) {
  const reply = (ok: boolean, body: object, status = 200) =>
    Response.json({ ok, ...body }, { status, headers: { "Cache-Control": "no-store" } });

  const { userId } = await getAuth(args);
  if (!userId) return reply(false, { message: "Please sign in again." }, 401);
  if (args.request.headers.get("origin") !== new URL(args.request.url).origin) {
    return reply(false, { message: "Invalid request origin." }, 403);
  }
  if (!args.request.headers.get("content-type")?.startsWith("application/json")) {
    return reply(false, { message: "Expected JSON." }, 415);
  }

  // Bound the body while reading, including requests without Content-Length.
  const reader = args.request.body?.getReader();
  if (!reader) return reply(false, { message: "Missing request body." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16_000) { await reader.cancel(); return reply(false, { message: "Request is too large." }, 413); }
    chunks.push(value);
  }

  let payload;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return reply(false, { message: "Invalid JSON." }, 400); }

  if (payload?.expectedUserId !== userId) {
    return reply(false, { message: "Account changed. Please reload before saving." }, 403);
  }
  const password = payload?.password;
  if (typeof password !== "string" || !password || password.length > 4096) {
    return reply(false, { message: "Enter your email or app password." }, 400);
  }

  // A missing or malformed VAULT_KEY is an operator problem, not a user one:
  // log the specific cause, return something generic.
  const issue = vaultKeyIssue();
  if (issue) {
    console.error(`[vault] ${issue}`);
    return reply(false, { message: "This server is not configured to store credentials yet. Contact the administrator." }, 500);
  }
  try {
    return reply(true, { encrypted: encryptPassword(password, userId) });
  } catch {
    return reply(false, { message: "Could not save the sender password." }, 500);
  }
}
