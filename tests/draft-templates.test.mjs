import test from "node:test";
import assert from "node:assert/strict";
import { generateTemplateDrafts } from "../app/lib/draft-templates.ts";

test("composes an opening sentence from the first statement and adds a closing", () => {
  const drafts = generateTemplateDrafts("Our shop is closed on Monday for maintenance. We reopen Tuesday at 9am.");
  assert.deepEqual(drafts.map((draft) => draft.tone), ["Concise", "Friendly", "Formal"]);
  assert.equal(drafts[0].body, [
    "Hello,",
    "I wanted to let you know that our shop is closed on Monday for maintenance.",
    "We reopen Tuesday at 9am.",
    "Let me know if you have any questions.",
  ].join("\n\n"));
  assert.match(drafts[1].body, /^Hi there,\n\nI hope you're doing well\. I just wanted to let you know that our shop is closed/);
  assert.match(drafts[2].body, /I am writing to inform you that our shop is closed on Monday for maintenance\./);
  assert.match(drafts[2].body, /Thank you for your time\.$/);
  for (const draft of drafts) assert.ok(!/[\r\n]/.test(draft.subject) && draft.subject.length <= 70);
});

test("turns instructions to the writer into an email, not a transcript of the brief", () => {
  const [concise] = generateTemplateDrafts("Invite local shop owners to try our inventory app. Mention the free 14-day trial and ask if they'd like a demo.");
  assert.ok(!/Invite local shop owners|Mention |ask if they/i.test(concise.body), concise.body);
  assert.ok(concise.body.includes("the free 14-day trial"));
  assert.equal(concise.subject, "Try our inventory app");
});

test("builds the closing sentence from what the reader is asked to do", () => {
  const ask = generateTemplateDrafts("Our new pricing starts in October. Ask if they'd like a walkthrough.");
  assert.match(ask[0].body, /If you'd like a walkthrough, just reply to this email\.$/);
  assert.match(ask[2].body, /If you would like a walkthrough, please reply to this message\.$/);

  const action = generateTemplateDrafts("The beta is open. Invite them to book a call this week.");
  assert.match(action[0].body, /To book a call this week, just reply to this email\.$/);
  assert.match(action[1].body, /If you'd like to book a call this week, just reply and I'll help you get started\.$/);
});

test("adds no ask of its own when the writer already wrote one", () => {
  const [concise, friendly] = generateTemplateDrafts("The workshop is on 4 October. Reply to this email to save a seat.");
  assert.ok(concise.body.endsWith("Reply to this email to save a seat."), concise.body);
  assert.ok(friendly.body.endsWith("Thanks for your time!"));
});

test("keeps a fragment out of the generated sentence and introduces it instead", () => {
  const [concise] = generateTemplateDrafts("mention the free 14-day trial");
  assert.equal(concise.body, "Hello,\n\nA quick note: the free 14-day trial.\n\nLet me know if you have any questions.");
  assert.equal(generateTemplateDrafts("let them know we moved to 12 Queen Street")[0].body,
    "Hello,\n\nI wanted to let you know that we moved to 12 Queen Street.\n\nLet me know if you have any questions.");
});

test("keeps the writer's own greeting and sign-off without duplicating them", () => {
  const [concise] = generateTemplateDrafts("Dear Sam,\n\nThe report is ready for review.\n\nThanks");
  assert.equal(concise.body, "Dear Sam,\n\nI wanted to let you know that the report is ready for review.\n\nThanks");
  assert.equal(concise.subject, "The report is ready for review");
  assert.match(generateTemplateDrafts("Hi there,\n\nThe report is ready.")[0].body, /^Hi there,\n\nI wanted to let you know/);
});

test("uses a first-person opening line as written instead of folding it", () => {
  const [concise] = generateTemplateDrafts("I'm writing to share next month's schedule. Classes start at 7pm.");
  assert.equal(concise.body, [
    "Hello,",
    "I'm writing to share next month's schedule.",
    "Classes start at 7pm.",
    "Let me know if you have any questions.",
  ].join("\n\n"));
  assert.equal(concise.subject, "Share next month's schedule");
});

test("keeps lists attached to the line that introduces them", () => {
  const [concise] = generateTemplateDrafts("Here is what changed in this release:\n- Faster checkout\n- New receipts\n\nUpgrade any time.");
  assert.ok(concise.body.includes("Here is what changed in this release:\n- Faster checkout\n- New receipts\n\nUpgrade any time."), concise.body);
});

test("shortens a long subject on a word boundary", () => {
  const subject = generateTemplateDrafts("We are extending the early access programme for every customer who joined before the end of last year")[0].subject;
  assert.ok(subject.length <= 70 && subject.endsWith("…") && !subject.includes("  "));
  assert.ok("We are extending the early access programme for every customer who joined before".startsWith(subject.slice(0, -1)));
});

test("starts a new paragraph every three sentences of one long block", () => {
  const sentence = "The new pricing takes effect next month and includes every feature on the current plan. ";
  const [{ body }] = generateTemplateDrafts(sentence.repeat(5).trim());
  assert.equal(body.split("\n\n").length, 5, "greeting, opening sentence, two paragraphs and a closing");
});

test("normalizes whitespace, caps the length and rejects an empty message", () => {
  assert.equal(generateTemplateDrafts("  The gate code changed\r\n\r\n\r\n\r\nIt is 4821 from Monday   \n\n  ")[0].body,
    "Hello,\n\nI wanted to let you know that the gate code changed.\n\nIt is 4821 from Monday\n\nLet me know if you have any questions.");
  assert.ok(generateTemplateDrafts(`The code is ${"a".repeat(5000)}`)[0].body.includes("a".repeat(3980)));
  for (const empty of ["", "   ", "\n\n"]) assert.throws(() => generateTemplateDrafts(empty), /Enter the main message/);
});
