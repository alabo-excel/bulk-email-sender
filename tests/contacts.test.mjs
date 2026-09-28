import test from "node:test";
import assert from "node:assert/strict";
import { buildManualTable, toColumnKey } from "../app/lib/contacts.ts";

test("normalizes column labels into merge-tag keys", () => {
  assert.equal(toColumnKey("  First Name "), "first_name");
  assert.equal(toColumnKey("Company / Org"), "company_org");
  assert.equal(toColumnKey("!!!"), "");
});

test("builds a table from typed contacts, dropping blank rows", () => {
  const result = buildManualTable(["email", "First Name"], [
    { email: " Ada@Acme.com ", first_name: "Ada" },
    { email: "", first_name: "" },
  ]);
  assert.deepEqual(result, {
    ok: true,
    headers: ["email", "first_name"],
    rows: [{ email: "ada@acme.com", first_name: "Ada" }],
  });
});

test("always includes an email column", () => {
  const result = buildManualTable(["company"], [{ email: "a@b.co", company: "B" }]);
  assert.ok(result.ok);
  assert.deepEqual(result.headers, ["email", "company"]);
});

test("rejects empty, invalid, missing and duplicate emails", () => {
  assert.equal(buildManualTable(["email"], [{ email: "" }]).ok, false);
  assert.match(buildManualTable(["email"], [{ email: "nope" }]).error, /not a valid email/);
  assert.match(buildManualTable(["email", "name"], [{ email: "", name: "Ada" }]).error, /missing an email/);
  assert.match(
    buildManualTable(["email"], [{ email: "a@b.co" }, { email: "A@B.co" }]).error,
    /Contact 2: a@b\.co is already/,
  );
});
