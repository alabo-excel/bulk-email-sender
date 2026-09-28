import test from "node:test";
import assert from "node:assert/strict";
import { generateDrafts, parseDrafts } from "../app/lib/drafts.server.ts";

const drafts = ["Concise", "Friendly", "Formal"].map((tone) => ({ tone, subject: `${tone} invitation`, body: "Would you like a demo?" }));

test("accepts exactly three complete email drafts", () => {
  assert.deepEqual(parseDrafts({ drafts }), drafts);
  for (const value of [null, {}, { drafts: drafts.slice(0, 2) }, { drafts: [...drafts, drafts[0]] },
    { drafts: [drafts[0], drafts[1], { ...drafts[2], subject: "Header\nInjection" }] },
    { drafts: [drafts[0], drafts[1], { ...drafts[2], body: " " }] }]) {
    assert.throws(() => parseDrafts(value));
  }
});

const geminiReply = (text, finishReason = "STOP") =>
  Response.json({ candidates: [{ finishReason, content: { role: "model", parts: [{ text }] } }] });

test("requests structured drafts from Gemini", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    assert.equal(options.headers["x-goog-api-key"], "test-key");
    const payload = JSON.parse(options.body);
    assert.equal(payload.contents[0].parts[0].text, "Invite shop owners to a demo");
    assert.match(payload.systemInstruction.parts[0].text, /exactly three/);
    assert.equal(payload.generationConfig.responseMimeType, "application/json");
    assert.equal(payload.generationConfig.responseJsonSchema.properties.drafts.minItems, 3);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
      { text: "thinking…", thought: true },
      { text: JSON.stringify({ drafts }) },
    ] } }] });
  });
  assert.deepEqual(await generateDrafts("Invite shop owners to a demo"), drafts);
});

test("rejects upstream errors, incomplete responses, blocked prompts and malformed output", async (t) => {
  for (const response of [
    Response.json({ error: { message: "secret provider details" } }, { status: 503 }),
    geminiReply(JSON.stringify({ drafts }).slice(0, 40), "MAX_TOKENS"),
    Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
    geminiReply('{"drafts":[]}'),
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(() => generateDrafts("Draft an invitation"), (error) => !error.message.includes("secret provider details"));
    mock.mock.restore();
  }
});

test("maps provider errors to actionable messages without leaking provider details", async (t) => {
  for (const [status, body, expected] of [
    [429, { error: { status: "RESOURCE_EXHAUSTED", message: "private details" } }, /rate limited or out of quota/],
    [400, { error: { message: "private details", details: [{ reason: "API_KEY_INVALID" }] } }, /key was rejected/],
    [403, { error: { message: "private details" } }, /key was rejected/],
    [404, { error: { message: "private details" } }, /GEMINI_DRAFT_MODEL/],
    [503, { error: { message: "private details" } }, /busy/],
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json(body, { status }));
    await assert.rejects(() => generateDrafts("Invitation"), (error) => expected.test(error.message) && !error.message.includes("private details"));
    mock.mock.restore();
  }
});
