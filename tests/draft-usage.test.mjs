import test from "node:test";
import assert from "node:assert/strict";
import { reserveDraftCredit } from "../app/lib/draft-usage.server.ts";
import { generateTemplateDrafts } from "../app/lib/draft-templates.ts";

function configure(t, values = {}) {
  const env = { ...process.env };
  Object.assign(process.env, {
    AI_DRAFT_USAGE_STORE: "redis",
    UPSTASH_REDIS_REST_URL: "https://usage.example.com",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    AI_DRAFTS_PER_USER_PER_DAY: "5",
    AI_DRAFTS_PER_DAY: "100",
    ...values,
  });
  t.after(() => { process.env = env; });
}

test("free drafts preserve message facts and never access the network", (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network call"); });
  const message = "Our trial lasts 14 days.\nWould you like a demo?";
  const drafts = generateTemplateDrafts(message);
  assert.equal(drafts.length, 3);
  assert.equal(new Set(drafts.map((d) => d.body)).size, 3);
  assert.ok(drafts.every((d) => d.body.includes("our trial lasts 14 days") && d.body.includes("Would you like a demo?")),
    "the writer's facts and question survive the rewrite");
  assert.ok(drafts.every((d) => !d.body.includes(message) && !/[\r\n]/.test(d.subject)),
    "the brief is composed into an email, not echoed");
  assert.throws(() => generateTemplateDrafts("  "));
  assert.ok(generateTemplateDrafts("A".repeat(5000)).every((d) => d.subject.length <= 70 && d.body.length < 4200));
});

test("reserves user and shared budgets together and uses a UTC reset", async (t) => {
  configure(t);
  const commands = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://usage.example.com");
    commands.push(JSON.parse(options.body));
    return Response.json({ result: [1, 4] });
  });
  const now = new Date("2026-09-18T23:59:59Z");
  assert.deepEqual(await reserveDraftCredit("user-one", now), {
    allowed: true, remaining: 4, limit: 5, resetsAt: "2026-09-19T00:00:00.000Z",
  });
  await reserveDraftCredit("user-two", now);
  await reserveDraftCredit("user-one", new Date("2026-09-19T00:00:00Z"));
  assert.equal(commands[0][0], "EVAL");
  assert.equal(commands[0][2], "2");
  assert.notEqual(commands[0][3], commands[1][3]);
  assert.equal(commands[0][4], commands[1][4]);
  assert.notEqual(commands[0][3], commands[2][3]);
  assert.deepEqual(commands[0].slice(5, 7), ["5", "100"]);
  assert.equal(Number(commands[0][7]), Date.parse("2026-09-19T00:00:00Z") / 1000);
});

test("denies exhausted user and global budgets", async (t) => {
  configure(t);
  for (const result of [[0, 0], [2, 4]]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ result }));
    assert.equal((await reserveDraftCredit("user-one")).allowed, false);
    mock.mock.restore();
  }
});

test("fails closed for missing storage, bad configuration and storage failures", async (t) => {
  configure(t);
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
  await assert.rejects(() => reserveDraftCredit("user-one"));
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.AI_DRAFTS_PER_DAY = "NaN";
  await assert.rejects(() => reserveDraftCredit("user-one"));
  process.env.AI_DRAFTS_PER_DAY = "100";
  for (const reply of [Response.json({}, { status: 503 }), Response.json({ error: "ERR" }),
    Response.json({ result: [1, -1] }), Response.json({ result: [1, 999] })]) {
    const mock = t.mock.method(globalThis, "fetch", async () => reply);
    await assert.rejects(() => reserveDraftCredit("user-one"));
    mock.mock.restore();
  }
});

test("zero allowance disables AI without accessing Redis", async (t) => {
  configure(t, { AI_DRAFTS_PER_USER_PER_DAY: "0" });
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network call"); });
  assert.equal((await reserveDraftCredit("user-one")).allowed, false);
});

test("local development persists credits, isolates users, enforces global cap and resets daily", async (t) => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "draft-usage-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  configure(t, { AI_DRAFT_USAGE_STORE: "sqlite", NODE_ENV: "development", NETLIFY: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "",
    AI_DRAFT_LOCAL_DB: join(directory, "usage.sqlite"), AI_DRAFTS_PER_USER_PER_DAY: "2", AI_DRAFTS_PER_DAY: "3" });
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network request"); });
  const now = new Date("2026-09-18T12:00:00Z");
  const results = await Promise.all(Array.from({ length: 5 }, () => reserveDraftCredit("one", now)));
  assert.equal(results.filter((r) => r.allowed).length, 2);
  assert.equal((await reserveDraftCredit("two", now)).allowed, true);
  assert.equal((await reserveDraftCredit("three", now)).allowed, false);
  assert.equal((await reserveDraftCredit("one", new Date("2026-09-19T12:00:00Z"))).allowed, true);
  process.env.NODE_ENV = "production";
  // Production reopens the same file and cannot reset the existing allowance.
  assert.equal((await reserveDraftCredit("one", now)).allowed, false);
  const savedPath = process.env.AI_DRAFT_LOCAL_DB;
  delete process.env.AI_DRAFT_LOCAL_DB;
  await assert.rejects(() => reserveDraftCredit("one", now));
  process.env.AI_DRAFT_LOCAL_DB = savedPath;
  process.env.NODE_ENV = "development";
  process.env.NETLIFY = "true";
  await assert.rejects(() => reserveDraftCredit("one", now));
});

test("production SQLite enforces one allowance across separate server processes", async (t) => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const directory = mkdtempSync(join(tmpdir(), "draft-production-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { ...process.env, NODE_ENV: "production", NETLIFY: "", AI_DRAFT_USAGE_STORE: "sqlite",
    AI_DRAFT_LOCAL_DB: join(directory, "usage.sqlite"), AI_DRAFTS_PER_USER_PER_DAY: "2", AI_DRAFTS_PER_DAY: "3" };
  const moduleUrl = new URL("../app/lib/draft-usage.server.ts", import.meta.url).href;
  const code = `import { reserveDraftCredit } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await reserveDraftCredit('same-user')));`;
  const run = () => promisify(execFile)(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", code], { env });
  const results = await Promise.all(Array.from({ length: 5 }, run));
  assert.equal(results.filter(({ stdout }) => JSON.parse(stdout).allowed).length, 2);
  assert.equal(JSON.parse((await run()).stdout).allowed, false);
});
