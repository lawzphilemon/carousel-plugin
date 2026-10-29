import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildSheetRow, rowToCsv } from "../engine/lib/sheet-row.mjs";

const brand = () => JSON.parse(fs.readFileSync(new URL("../examples/acme/brand.json", import.meta.url), "utf8"));
const meta = () => ({
  code: "CAR-261030-A1B2", topic: "three numbers", brand: "acme", status: "scheduled",
  repliz: { account: "acct1", schedule_id: "s9", schedule_at: "2026-11-03T04:00:00.000Z" },
});
const dir = "/out/acme/CAR-261030-A1B2_three-numbers";

test("builds the full row", () => {
  const r = buildSheetRow(meta(), brand(), dir);
  assert.equal(r.tracked, true);
  assert.deepEqual(r.expected_headers, ["Code", "Topic", "Status", "Scheduled", "Account", "Repliz ID", "Folder"]);
  assert.equal(r.cells.Status, "Scheduled (draft)");
  assert.equal(r.cells.Folder, "acme/CAR-261030-A1B2_three-numbers");
  assert.equal(r.cells["Repliz ID"], "s9");
  assert.deepEqual(r.match, { column: "Code", by: "code", value: "CAR-261030-A1B2" });
});

test("match by topic uses trimmed topic", () => {
  const b = brand(); b.tracking.match_by = "topic"; b.tracking.match_column = "Topic";
  const m = meta(); m.topic = "  three numbers ";
  assert.equal(buildSheetRow(m, b, dir).match.value, "three numbers");
});

test("untracked brand", () => {
  const b = brand(); delete b.tracking;
  assert.deepEqual(buildSheetRow(meta(), b, dir), { tracked: false });
  assert.deepEqual(buildSheetRow({ ...meta(), status: "draft" }, b, dir), { tracked: false });
});

test("status and schedule_id checks", () => {
  assert.throws(() => buildSheetRow({ ...meta(), status: "rendered" }, brand(), dir), /scheduled/);
  const m = meta(); m.repliz.schedule_id = null;
  assert.throws(() => buildSheetRow(m, brand(), dir), /schedule_id/);
});

test("unmapped column is left out", () => {
  const b = brand(); delete b.tracking.columns.account;
  const r = buildSheetRow(meta(), b, dir);
  assert.ok(!("Account" in r.cells));
  assert.deepEqual(r.expected_headers, ["Code", "Topic", "Status", "Scheduled", "Repliz ID", "Folder"]);
});

test("missing source value becomes empty string", () => {
  const m = meta(); m.repliz.account = null;
  assert.equal(buildSheetRow(m, brand(), dir).cells.Account, "");
});

function parseCsv(s) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\r" && s[i + 1] === "\n") { row.push(f); rows.push(row); row = []; f = ""; i++; }
    else f += c;
  }
  return rows;
}

test("rowToCsv round-trips awkward fields", () => {
  const m = meta(); m.topic = 'He said "hi", then\nleft';
  const r = buildSheetRow(m, brand(), dir);
  const csv = rowToCsv(r);
  assert.ok(csv.endsWith("\r\n"));
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], r.expected_headers);
  assert.equal(rows[1][1], m.topic);
  assert.deepEqual(rows[1], r.expected_headers.map((h) => r.cells[h]));
});

test("rowToCsv refuses untracked row", () => {
  assert.throws(() => rowToCsv({ tracked: false }), /nothing to export: row is not tracked/);
});
