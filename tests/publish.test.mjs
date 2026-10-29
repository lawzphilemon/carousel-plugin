import test from "node:test";
import assert from "node:assert/strict";
import { toUtcIso, checkStagger, precheck, buildSchedulePayload } from "../engine/lib/publish.mjs";

test("toUtcIso Jakarta", () => {
  assert.equal(toUtcIso("2026-11-03 11:00", "Asia/Jakarta"), "2026-11-03T04:00:00.000Z");
  assert.equal(toUtcIso("2026-11-03 00:30", "Asia/Jakarta"), "2026-11-02T17:30:00.000Z");
});
test("toUtcIso DST zone", () => {
  assert.equal(toUtcIso("2026-03-08 03:30", "America/New_York"), "2026-03-08T07:30:00.000Z");
  assert.equal(toUtcIso("2026-11-01 12:00", "America/New_York"), "2026-11-01T17:00:00.000Z");
});
test("toUtcIso rejects nonexistent local time", () => {
  assert.throws(() => toUtcIso("2026-03-08 02:30", "America/New_York"), /does not exist/);
});
test("toUtcIso rejects bad zone and malformed input", () => {
  assert.throws(() => toUtcIso("2026-11-03 11:00", "Nowhere/City"));
  assert.throws(() => toUtcIso("2026-13-40 25:61", "Asia/Jakarta"));
  assert.throws(() => toUtcIso("2026-11-03T11:00", "Asia/Jakarta"));
  assert.throws(() => toUtcIso("2026-02-30 10:00", "Asia/Jakarta"));
});
test("checkStagger", () => {
  const a = { accountId: "a", scheduleAt: "2026-11-03T04:00:00.000Z" };
  const b = { accountId: "b", scheduleAt: "2026-11-03T04:00:00.000Z" };
  assert.deepEqual(checkStagger([a, b]), []);
  const errs = checkStagger([a, b, { ...a, scheduleAt: "2026-11-03T04:00:30.000Z" }]);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /0/);
  assert.match(errs[0], /2/);
  assert.deepEqual(checkStagger([a, { ...a, scheduleAt: "2026-11-03T04:01:00.000Z" }]), []);
});
test("precheck", () => {
  assert.match(precheck({ status: "rendered" }, { passed: true }).join(), /caption_approved/);
  assert.match(precheck({ status: "caption_approved" }, { passed: false }).join(), /verification/);
  assert.deepEqual(precheck({ status: "caption_approved" }, { passed: true }), []);
});
test("buildSchedulePayload", () => {
  const urls = ["https://x.test/2.png", "https://x.test/1.png"];
  const copy = [...urls];
  const o = { accountId: "a", caption: "hi", mediaUrls: urls, scheduleAt: "2026-11-03T04:00:00.000Z" };
  const p = buildSchedulePayload(o);
  assert.equal(p.type, "album");
  assert.equal(p.description, "hi");
  assert.deepEqual(p.medias.map((m) => m.url), copy);
  assert.equal(p.medias[0].type, "image");
  assert.equal(p.additionalInfo.isDraft, true);
  assert.equal(buildSchedulePayload({ ...o, live: true }).additionalInfo.isDraft, false);
  assert.deepEqual(urls, copy);
});
test("buildSchedulePayload rejects bad media", () => {
  const o = { accountId: "a", caption: "hi", scheduleAt: "2026-11-03T04:00:00.000Z" };
  assert.throws(() => buildSchedulePayload({ ...o, mediaUrls: [] }));
  assert.throws(() => buildSchedulePayload({ ...o, mediaUrls: ["http://x.test/1.png"] }));
});

test("toUtcIso needs a timeZone", () => {
  for (const tz of [undefined, "", null, 5]) assert.throws(() => toUtcIso("2026-11-03 11:00", tz), /timeZone/);
});
test("buildSchedulePayload validates required fields", () => {
  const ok = { accountId: "a", caption: "hi", mediaUrls: ["https://x/1.png"], scheduleAt: "2026-11-03T04:00:00.000Z" };
  assert.doesNotThrow(() => buildSchedulePayload(ok));
  assert.throws(() => buildSchedulePayload({ ...ok, accountId: undefined }), /accountId/);
  assert.throws(() => buildSchedulePayload({ ...ok, caption: "" }), /caption/);
  assert.throws(() => buildSchedulePayload({ ...ok, caption: 3 }), /caption/);
  assert.throws(() => buildSchedulePayload({ ...ok, scheduleAt: undefined }), /scheduleAt/);
  assert.throws(() => buildSchedulePayload({ ...ok, scheduleAt: "soon" }), /scheduleAt/);
});
test("checkStagger flags an unparseable scheduleAt", () => {
  const e = checkStagger([{ accountId: "a", scheduleAt: "soon" }, { accountId: "b", scheduleAt: "2026-11-03T04:00:00.000Z" }]);
  assert.equal(e.length, 1);
  assert.match(e[0], /scheduleAt/);
});
