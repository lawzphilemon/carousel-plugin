import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lintVisual } from "../engine/lib/lint-visual.mjs";
import { findChrome } from "../engine/lib/chrome.mjs";
import { loadBrand } from "../engine/lib/brand.mjs";
import { chromeDom } from "../engine/lib/chrome.mjs";
import { slideHtml, pageHtml } from "../engine/lib/layouts.mjs";
import os from "node:os";
import path from "node:path";
import { parseReport, MEASURE_SCRIPT } from "../engine/lib/measure.mjs";

const brand = JSON.parse(fs.readFileSync("examples/acme/brand.json", "utf8"));
const png = [{ width: 1080, height: 1350 }];
const clean = () => ({
  slides: [{
    index: 0, bg: "#14213D", width: 1080, height: 1350, overflow: false, minMargin: 80,
    fonts: [{ size: 110, weight: 800 }, { size: 40, weight: 500 }, { size: 26, weight: 500 }],
    colors: [{ fg: "#FFFFFF", bg: "#14213D" }, { fg: "#FCA311", bg: "#14213D" }, { fg: "#A8B0BF", bg: "#14213D" }],
    logos: [{ src: "logo-on-dark.png", width: 360 }],
    palette: ["#14213D", "#FFFFFF", "#fca311", "#A8B0BF"],
  }],
});
const rules = (r, sizes = png) => lintVisual(r, brand, sizes).map((i) => i.rule);
const mut = (f) => { const r = clean(); f(r.slides[0]); return r; };

test("clean report passes", () => assert.deepEqual(lintVisual(clean(), brand, png), []));
test("overflow", () => assert.deepEqual(rules(mut((s) => (s.overflow = true))), ["overflow"]));
test("margin", () => assert.deepEqual(rules(mut((s) => (s.minMargin = 40))), ["margin"]));
test("font-size: too small and between ranges", () => {
  assert.deepEqual(rules(mut((s) => s.fonts.push({ size: 20, weight: 500 }))), ["font-size"]);
  assert.deepEqual(rules(mut((s) => s.fonts.push({ size: 50, weight: 500 }))), ["font-size"]);
});
test("font-weights", () => assert.deepEqual(rules(mut((s) => s.fonts.push({ size: 40, weight: 700 }))), ["font-weights"]));
test("contrast: accent on white", () => assert.deepEqual(rules(mut((s) => s.colors.push({ fg: "#FCA311", bg: "#FFFFFF" }))), ["contrast"]));
test("logo: two, and too narrow", () => {
  assert.deepEqual(rules(mut((s) => s.logos.push({ src: "logo-on-dark.png", width: 200 }))), ["logo"]);
  assert.deepEqual(rules(mut((s) => (s.logos = [{ src: "logo-on-dark.png", width: 100 }]))), ["logo"]);
  assert.deepEqual(rules(mut((s) => (s.logos = []))), ["logo"]);
});
test("palette: forbidden and unknown", () => {
  assert.deepEqual(rules(mut((s) => s.palette.push("#FF0000"))), ["palette"]);
  assert.deepEqual(rules(mut((s) => s.palette.push("#123456"))), ["palette"]);
});
test("png-size", () => {
  const i = lintVisual(clean(), brand, [{ width: 1080, height: 1080 }]);
  assert.deepEqual(i.map((x) => x.rule), ["png-size"]);
  assert.equal(i[0].slide, 1);
});

test("parseReport round-trips an escaped data-report attribute", () => {
  const rep = { slides: [{ index: 0, src: 'a"b&c<d' }] };
  const esc = JSON.stringify(rep).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  assert.deepEqual(parseReport(`<html><body data-report="${esc}"></body></html>`), rep);
  assert.throws(() => parseReport("<html></html>"), /report/);
});
test("MEASURE_SCRIPT is a self-invoking script", () => assert.match(MEASURE_SCRIPT, /^\(function measure/));

test("logo variant: matching passes, mismatch and unknown bg fail", () => {
  assert.deepEqual(rules(mut((s) => { s.bg = "#FFFFFF"; s.logos = [{ src: "logo-on-light.png", width: 200 }]; s.colors = []; s.fonts = []; s.palette = ["#FFFFFF"]; })), []);
  assert.deepEqual(rules(mut((s) => (s.logos = [{ src: "logo-on-light.png", width: 360 }]))), ["logo"]);
  assert.deepEqual(rules(mut((s) => { s.bg = "#FCA311"; s.logos = [{ src: "logo-on-light.png", width: 360 }]; s.palette.push("#FCA311"); })), []);
  assert.deepEqual(rules(mut((s) => (s.bg = "#123456"))), ["logo"]);
});
test("png-size missing message", () => {
  assert.match(lintVisual(clean(), brand, [])[0].message, /slides.slide-01.png not found; run render first/);
});
let chrome = null;
try { chrome = findChrome(); } catch {}
// Renders with the real brand, then lints against a brand whose on_dark points at the light logo.
// (Swapping before render is self-consistent: layouts read the same mapping the lint expects.)
test("real render: wrong logo variant for the slide background is flagged", { skip: !chrome }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lv-"));
  try {
    const { brand: real, dir } = loadBrand("examples/acme/brand.json");
    const copy = JSON.parse(fs.readFileSync("tests/fixtures/copy-ok.json", "utf8"));
    const html = path.join(root, "s1.html");
    fs.writeFileSync(html, pageHtml([slideHtml(copy.slides[0], 0, copy.slides.length, real)], real, dir, { measure: true }));
    const report = parseReport(chromeDom(chrome, html, real.canvas));
    assert.equal(report.slides[0].bg, "#14213D");
    assert.deepEqual(lintVisual(report, real, png).filter((i) => i.rule === "logo"), []);
    const swapped = { ...real, logos: { ...real.logos, on_dark: real.logos.on_light } };
    const logo = lintVisual(report, swapped, png).filter((i) => i.rule === "logo");
    assert.equal(logo.length, 1);
    assert.equal(logo[0].slide, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
