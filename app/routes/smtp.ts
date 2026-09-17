import { getAuth } from "@clerk/react-router/server";
import type { Route } from "./+types/smtp";
import { createTransport, validateSender } from "~/lib/mailer.server";
import { decryptPassword, isEncryptedPassword } from "~/lib/vault.server";
import { isValidEmail } from "~/lib/contacts";
import { textToHtml } from "~/lib/template";

export async function action(args: Route.ActionArgs) {
  const reply = (ok: boolean, message: string, status = 200) => Response.json({ ok, message }, { status, headers: { "Cache-Control": "no-store" } });
  const { userId } = await getAuth(args);
  if (!userId) return reply(false, "Please sign in again.", 401);
  if (args.request.headers.get("origin") !== new URL(args.request.url).origin) return reply(false, "Invalid request origin.", 403);
  if (!args.request.headers.get("content-type")?.startsWith("application/json")) return reply(false, "Expected JSON.", 415);
  // Bound the body while reading, including requests without Content-Length.
  const reader = args.request.body?.getReader();
  if (!reader) return reply(false, "Missing request body.", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 100_000) { await reader.cancel(); return reply(false, "Message is too large.", 413); }
    chunks.push(value);
  }
  let payload;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return reply(false, "Invalid JSON.", 400); }
  if (payload?.expectedUserId !== userId) return reply(false, "Account changed. Please reload before sending.", 403);
  if (!payload || !validateSender(payload.sender)) return reply(false, "Check your sender email, SMTP host, port, and password.", 400);
  if (!isEncryptedPassword(payload.sender.password)) return reply(false, "Saved sender credentials are unreadable. Enter them again in Settings.", 400);
  let senderPassword: string;
  try { senderPassword = decryptPassword(payload.sender.password, userId); }
  catch { return reply(false, "Saved sender credentials could not be read. Enter them again in Settings.", 400); }
  if (!["verify", "send"].includes(payload.intent)) return reply(false, "Unknown action.", 400);
  if (payload.intent === "send" && (typeof payload.to !== "string" || !isValidEmail(payload.to)
    || typeof payload.subject !== "string" || !payload.subject.trim() || payload.subject.length > 998 || /[\r\n]/.test(payload.subject)
    || typeof payload.body !== "string" || !payload.body.trim())) return reply(false, "Enter a valid recipient, subject, and message.", 400);
  let transport;
  try {
    transport = await createTransport({ ...payload.sender, password: senderPassword });
    if (payload.intent === "verify") {
      await transport.verify();
      return reply(true, "SMTP connection verified.");
    }
    await transport.sendMail({ from: { name: payload.sender.name, address: payload.sender.email }, to: payload.to,
      subject: payload.subject, text: payload.body, html: textToHtml(payload.body) });
    return reply(true, `Email sent to ${payload.to}.`);
  } catch {
    // Provider errors may include credentials or SMTP transcript details.
    return reply(false, "SMTP request failed. Check your sender credentials and provider settings. Delivery may be unconfirmed; check your mailbox before retrying.", 502);
  } finally { transport?.close(); }
}
