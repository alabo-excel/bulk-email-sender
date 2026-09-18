import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Check and reserve both budgets in one atomic operation across server instances.
// Failed or timed-out provider requests retain their credit: they may be billable.
export const RESERVE_SCRIPT = `
local user = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
local limit = tonumber(ARGV[1])
if user >= limit then return {0, 0} end
if total >= tonumber(ARGV[2]) then return {2, math.max(0, limit - user)} end
redis.call('INCR', KEYS[1])
redis.call('EXPIREAT', KEYS[1], ARGV[3])
redis.call('INCR', KEYS[2])
redis.call('EXPIREAT', KEYS[2], ARGV[3])
return {1, math.max(0, limit - user - 1)}
`;

function limit(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 1_000_000) {
    throw new Error("Invalid AI draft allowance.");
  }
  return number;
}

export async function reserveDraftCredit(userId: string, now = new Date()) {
  const perUser = limit(process.env.AI_DRAFTS_PER_USER_PER_DAY, 5);
  const global = limit(process.env.AI_DRAFTS_PER_DAY, 100);
  const day = now.toISOString().slice(0, 10);
  const reset = new Date(`${day}T00:00:00.000Z`);
  reset.setUTCDate(reset.getUTCDate() + 1);
  const usage = { limit: perUser, resetsAt: reset.toISOString() };
  if (!perUser || !global) return { allowed: false, remaining: 0, ...usage };
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const userKey = createHash("sha256").update(userId).digest("hex");
  const store = process.env.AI_DRAFT_USAGE_STORE ||
    (!url && !token && process.env.NODE_ENV === "development" ? "sqlite" : "redis");
  if (!["sqlite", "redis"].includes(store)) throw new Error("Invalid AI usage store.");
  if (store === "sqlite") {
    if (process.env.NETLIFY) throw new Error("SQLite usage requires a server with persistent storage.");
    if (process.env.NODE_ENV !== "development" && !process.env.AI_DRAFT_LOCAL_DB?.trim()) {
      throw new Error("Set AI_DRAFT_LOCAL_DB to a persistent database path.");
    }
    const result = await reserveLocalCredit(userKey, day, perUser, global);
    return { ...result, ...usage };
  }
  if (!url || !token || new URL(url).protocol !== "https:") throw new Error("Usage storage is unavailable.");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify(["EVAL", RESERVE_SCRIPT, "2",
      `drafts:{daily}:${day}:user:${userKey}`, `drafts:{daily}:${day}:total`,
      String(perUser), String(global), String(Math.floor(reset.getTime() / 1000)),
    ]),
  });
  if (!response.ok) throw new Error("Usage storage is unavailable.");
  const { result, error } = await response.json();
  if (error || !Array.isArray(result) || result.length !== 2 || ![0, 1, 2].includes(result[0]) ||
    !Number.isInteger(result[1]) || result[1] < 0 || result[1] > perUser) {
    throw new Error("Invalid usage reservation.");
  }
  return { allowed: result[0] === 1, remaining: result[1] as number, ...usage };
}


// A single-server database on persistent storage. BEGIN IMMEDIATE serializes writers.
async function reserveLocalCredit(userKey: string, day: string, perUser: number, global: number) {
  const { DatabaseSync } = await import("node:sqlite");
  const path = resolve(process.env.AI_DRAFT_LOCAL_DB || ".local/draft-usage.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("CREATE TABLE IF NOT EXISTS usage (day TEXT, account TEXT, count INTEGER NOT NULL, PRIMARY KEY(day, account))");
    db.exec("BEGIN IMMEDIATE");
    const read = db.prepare("SELECT count FROM usage WHERE day = ? AND account = ?");
    const used = Number(read.get(day, userKey)?.count ?? 0);
    const total = Number(read.get(day, "total")?.count ?? 0);
    if (used >= perUser || total >= global) {
      db.exec("COMMIT");
      return { allowed: false, remaining: Math.max(0, perUser - used) };
    }
    const increment = db.prepare("INSERT INTO usage(day, account, count) VALUES (?, ?, 1) ON CONFLICT(day, account) DO UPDATE SET count = count + 1");
    increment.run(day, userKey);
    increment.run(day, "total");
    // Keep a grace period for in-flight requests crossing midnight.
    const cutoff = new Date(`${day}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);
    db.prepare("DELETE FROM usage WHERE day < ?").run(cutoff.toISOString().slice(0, 10));
    db.exec("COMMIT");
    return { allowed: true, remaining: perUser - used - 1 };
  } finally {
    db.close();
  }
}
