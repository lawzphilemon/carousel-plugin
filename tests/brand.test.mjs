import test from "node:test";
import assert from "node:assert/strict";
import { loadBrand, validateBrand } from "../engine/lib/brand.mjs";

const acmePath = new URL("../examples/acme/brand.json", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const brokenPath = new URL("./fixtures/broken-brand/brand.json", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const clone = (o) => JSON.parse(JSON.stringify(o));

test("acme is valid", () => {
  const { brand, dir } = loadBrand(acmePath);
  assert.deepEqual(validateBrand(brand, dir), []);
});

test("broken fixture reports font and contrast", () => {
  const { brand, dir } = loadBrand(brokenPath);
  const errs = validateBrand(brand, dir);
  assert.ok(errs.some((e) => e.includes("fonts/missing.ttf")), errs.join("\n"));
  assert.ok(errs.some((e) => e.includes("contrast")), errs.join("\n"));
  assert.equal(errs.length, 2, errs.join("\n"));
});

test("loadBrand missing path throws", () => {
  assert.throws(() => loadBrand("nope/brand.json"), /brand\.json not found/);
});

test("loadBrand invalid JSON names the path", () => {
  assert.throws(() => loadBrand(new URL("./brand.test.mjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), /brand\.test\.mjs/);
});

test("missing timezone named", () => {
  const { brand, dir } = loadBrand(acmePath);
  const b = clone(brand);
  delete b.timezone;
  assert.ok(validateBrand(b, dir).some((e) => e.includes("timezone")));
});

test("bad timezone and bad hex rejected", () => {
  const { brand, dir } = loadBrand(acmePath);
  const b = clone(brand);
  b.timezone = "Mars/Base";
  b.palette.accent = "orange";
  const errs = validateBrand(b, dir);
  assert.ok(errs.some((e) => e.includes("timezone")));
  assert.ok(errs.some((e) => e.includes("palette.accent")));
});

test("missing nested key names dotted path", () => {
  const { brand, dir } = loadBrand(acmePath);
  const b = clone(brand);
  delete b.voice.acronyms;
  assert.ok(validateBrand(b, dir).some((e) => e.includes("voice.acronyms")));
});

test("logos null and fonts null give errors, no throw", () => {
  const { brand, dir } = loadBrand(acmePath);
  for (const k of ["logos", "fonts", "palette", "contrast_pairs"]) {
    const b = clone(brand);
    b[k] = null;
    const errs = validateBrand(b, dir);
    assert.ok(errs.some((e) => e.includes(k)), k);
  }
});

test("contrast_pairs entry needs numeric min", () => {
  const { brand, dir } = loadBrand(acmePath);
  const b = clone(brand);
  delete b.contrast_pairs[1].min;
  assert.ok(validateBrand(b, dir).some((e) => e.includes("contrast_pairs[1]") && e.includes("min")));
});
test("empty file path is an error", () => {
  const { brand, dir } = loadBrand(acmePath);
  const f = clone(brand); f.fonts.file = "";
  assert.ok(validateBrand(f, dir).some((e) => e.startsWith("fonts.file")));
  const l = clone(brand); l.logos.on_dark = "";
  assert.ok(validateBrand(l, dir).some((e) => e.startsWith("logos.on_dark")));
});

test("fonts.family must be plain (it goes into CSS)", () => {
  const { brand, dir } = loadBrand(acmePath);
  for (const bad of ['Evil"; x{}', "a;b", "a/b", ""]) {
    const b = clone(brand); b.fonts.family = bad;
    assert.ok(validateBrand(b, dir).some((e) => e.includes("fonts.family")), JSON.stringify(bad));
  }
  const ok = clone(brand); ok.fonts.family = "Open Sans-Bold 2";
  assert.deepEqual(validateBrand(ok, dir), []);
});

test("cta.button bg and fg must be #RRGGBB", () => {
  const { brand, dir } = loadBrand(acmePath);
  for (const k of ["bg", "fg"]) {
    const b = clone(brand); b.cta.button[k] = "red; x";
    assert.ok(validateBrand(b, dir).some((e) => e.includes(`cta.button.${k}`)), k);
  }
});

test("tracking is optional", () => {
  const { brand, dir } = loadBrand(acmePath);
  delete brand.tracking;
  assert.deepEqual(validateBrand(brand, dir), []);
});

test("tracking not an object", () => {
  const { brand, dir } = loadBrand(acmePath);
  brand.tracking = "x";
  assert.deepEqual(validateBrand(brand, dir), ["tracking: must be an object"]);
});

const trackingCases = [
  ["tracking.mode", (t) => { t.mode = "sync"; }],
  ["tracking.columns.status", (t) => { delete t.columns.status; }],
  ["mapped twice", (t) => { t.columns.topic = t.columns.code; }],
  ["tracking.match_column", (t) => { t.match_column = "Nope"; }],
  ["tracking.match_by", (t) => { t.match_by = "topic"; delete t.columns.topic; }],
  ["must equal the header mapped to match_by", (t) => { t.match_column = t.columns.topic; }],
  ["tracking.columns.bogus: unknown column key", (t) => { t.columns.bogus = "Bogus"; }],
  ["tracking.status_values.scheduled", (t) => { t.status_values = {}; }],
  ["tracking.tab", (t) => { t.tab = ""; }],
];
for (const [text, mutate] of trackingCases) {
  test(`tracking error: ${text}`, () => {
    const { brand, dir } = loadBrand(acmePath);
    mutate(brand.tracking);
    const errs = validateBrand(brand, dir);
    assert.ok(errs.some((e) => e.includes(text)), errs.join("\n"));
  });
}
