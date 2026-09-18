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

test("requests structured drafts without storing the response", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const payload = JSON.parse(options.body);
    assert.equal(payload.input, "Invite shop owners to a demo");
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.strict, true);
    assert.equal(payload.text.format.schema.properties.drafts.minItems, 3);
    return Response.json({ status: "completed", output: [
      { type: "reasoning" },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({ drafts }) }] },
    ] });
  });
  assert.deepEqual(await generateDrafts("Invite shop owners to a demo"), drafts);
});

test("rejects upstream errors, incomplete responses, refusals and malformed output", async (t) => {
  for (const response of [
    Response.json({ error: "secret provider details" }, { status: 429 }),
    Response.json({ status: "incomplete", output: [] }),
    Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] }),
    Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"drafts":[]}' }] }] }),
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(() => generateDrafts("Draft an invitation"), (error) => !error.message.includes("secret provider details"));
    mock.mock.restore();
  }
});

test("distinguishes exhausted API quota from temporary rate limiting without leaking provider details", async (t) => {
  for (const [code, expected] of [["insufficient_quota", /billing/], ["credit_balance_exhausted", /billing/], ["rate_limit_exceeded", /rate limited/]]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code, message: "private details" } }, { status: 429 }));
    await assert.rejects(() => generateDrafts("Invitation"), (error) => expected.test(error.message) && !error.message.includes("private details"));
    mock.mock.restore();
  }
});
