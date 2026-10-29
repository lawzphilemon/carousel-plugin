import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slideHtml, pageHtml } from "../engine/lib/layouts.mjs";

const brand = JSON.parse(fs.readFileSync("examples/acme/brand.json", "utf8"));
const copy = JSON.parse(fs.readFileSync("tests/fixtures/copy-ok.json", "utf8"));
const html = (i) => slideHtml(copy.slides[i], i, 7, brand);

test("cover: kind, dark logo, pager", () => {
  const h = html(0);
  assert.match(h, /data-kind="cover"/);
  assert.ok(h.includes("logo-on-dark.png"));
  assert.ok(h.includes("1/7"));
});

test("points on light: light logo, accent is a filled block not accent text", () => {
  const s = { ...copy.slides[2], accent: "3 angka" };
  const h = slideHtml(s, 2, 7, brand);
  assert.ok(h.includes("logo-on-light.png"));
  assert.ok(h.includes('<span class="hl">3 angka</span>'));
  const css = pageHtml([h], brand, "examples/acme");
  assert.match(css, /\.light \.hl\{background:var\(--accent\)/);
  assert.ok(!/\.light \.hl\{[^}]*;color:#FCA311/i.test(css) && !/\.light \.hl\{[^}]*;color:var\(--accent\)/.test(css));
});

test("accent not in headline is ignored; copy is escaped; one accent only", () => {
  const h = slideHtml({ kind: "statement", headline: "A <b>x</b> & y", accent: "nope" }, 0, 5, brand);
  assert.ok(!h.includes('class="hl"'));
  assert.ok(h.includes("A &lt;b&gt;x&lt;/b&gt; &amp; y"));
  assert.equal((html(0).match(/class="hl"/g) || []).length, 1);
});

test("cta: accent logo, no contact line by default", () => {
  const h = html(6);
  assert.ok(h.includes("logos/logo-on-light.png"));
  assert.ok(!h.includes('class="contact"'));
  assert.ok(slideHtml(copy.slides[6], 6, 7, { ...brand, cta: { ...brand.cta, contact: "hi@example.com" } }).includes("hi@example.com"));
});

test("all eight kinds render", () => {
  const slides = [
    { kind: "stat", headline: "H.", stat: { value: "4:1", label: "L" } },
    { kind: "compare", headline: "H.", left: { title: "A", body: "a" }, right: { title: "B", body: "b" } },
    { kind: "quote", body: "Q", sub: "Who" },
    { kind: "list", headline: "H.", items: ["a", "b", "c", "d"] },
  ];
  for (const s of slides) assert.match(slideHtml(s, 0, 5, brand), new RegExp(`data-kind="${s.kind}"`));
  assert.equal((slideHtml(slides[3], 0, 5, brand).match(/<li>/g) || []).length, 3);
  assert.throws(() => slideHtml({ kind: "nope" }, 0, 5, brand), /unknown slide kind/);
});

test("pageHtml: local font, no http, measure hook", () => {
  const page = pageHtml([html(0)], brand, "examples/acme");
  assert.ok(page.includes("Montserrat-Variable.ttf"));
  assert.ok(page.includes("file:///"));
  assert.ok(!/https?:/.test(page.replace(/xmlns="[^"]*"/g, "")));
  assert.ok(!pageHtml([], brand, "examples/acme").includes("<script>"));
  assert.ok(pageHtml([], brand, "examples/acme", { measure: true, measureScript: "window.M=1" }).includes("<script>window.M=1</script>"));
});

test("cta contact: slide value wins, brand value is the fallback, none renders nothing", () => {
  const cta = copy.slides[6];
  assert.ok(slideHtml({ ...cta, contact: "hello at acme.test" }, 6, 7, brand).includes('<p class="contact">hello at acme.test</p>'));
  const b = structuredClone(brand);
  b.cta.contact = "brand-level line";
  assert.ok(slideHtml(cta, 6, 7, b).includes("brand-level line"));
  assert.ok(slideHtml({ ...cta, contact: "slide line" }, 6, 7, b).includes("slide line"));
  assert.ok(!slideHtml({ ...cta, contact: "slide line" }, 6, 7, b).includes("brand-level line"));
  assert.ok(!slideHtml(cta, 6, 7, brand).includes('class="contact"'));
});

test("quote: headline shows as a kicker line when body is also set", () => {
  const both = slideHtml({ kind: "quote", headline: "What clients say.", body: "It just works.", sub: "A client" }, 0, 5, brand);
  assert.ok(both.includes('<span class="kicker">What clients say.</span>'));
  assert.ok(both.includes("It just works."));
  const only = slideHtml({ kind: "quote", headline: "Only a headline." }, 0, 5, brand);
  assert.ok(only.includes("Only a headline."));
  assert.ok(!only.includes('class="kicker"'));
});

test("compare titles use a size inside a configured range; light headlines get extra line height", () => {
  const css = pageHtml([], brand, "examples/acme");
  assert.match(css, /\.cols h2\{font-size:44px/);
  assert.match(css, /\.light h1\{line-height:1\.18\}/);
});
