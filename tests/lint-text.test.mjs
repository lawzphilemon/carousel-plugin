import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lintText } from "../engine/lib/lint-text.mjs";

const rd = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const brand = rd("../examples/acme/brand.json");
const ok = () => rd("./fixtures/copy-ok.json");
const rules = (c, b = brand) => lintText(c, b).map((i) => i.rule);
const mut = (fn) => { const c = ok(); fn(c); return c; };

test("copy-ok has no issues", () => assert.deepEqual(lintText(ok(), brand), []));

test("structure", () => {
  assert.ok(rules({ platform: "instagram" }).includes("structure"));
  assert.ok(rules(mut((c) => { delete c.slides[1].headline; })).includes("structure"));
});
test("slide-count", () => {
  const few = mut((c) => { c.slides = c.slides.slice(0, 3); });
  const i = lintText(few, brand).find((x) => x.rule === "slide-count");
  assert.equal(i.slide, null);
  const many = mut((c) => { c.slides = Array.from({ length: 11 }, () => c.slides[1]); });
  assert.ok(rules(many).includes("slide-count"));
});
test("headline-words: 10 fails, 9 passes, punctuation and hyphens", () => {
  const set = (h) => mut((c) => { c.slides[1].headline = h; });
  assert.ok(rules(set("One two three four five six seven eight nine ten.")).includes("headline-words"));
  assert.ok(!rules(set("One two three four five six seven eight nine.")).includes("headline-words"));
  assert.ok(!rules(set("Self-driven ads need one two three four five six.")).includes("headline-words"));
  assert.ok(!rules(set("One two three four five six seven eight nine .")).includes("headline-words"));
});
test("headline-case", () => {
  assert.ok(rules(mut((c) => { c.slides[1].headline = "Most Reports Hide Every Number."; })).includes("headline-case"));
  assert.ok(!rules(mut((c) => { c.slides[1].headline = "Most reports hide ROAS and SEO."; })).includes("headline-case"));
});
test("headline-period", () => {
  assert.ok(rules(mut((c) => { c.slides[0].headline = "Read your ad results"; })).includes("headline-period"));
  assert.ok(rules(mut((c) => { c.slides[6].headline = "Want ads with clear results"; })).includes("headline-period") === false);
});
test("body-words", () => {
  assert.ok(rules(mut((c) => { c.slides[1].body = Array(36).fill("word").join(" "); })).includes("body-words"));
  assert.ok(!rules(mut((c) => { c.slides[1].body = Array(35).fill("word").join(" "); })).includes("body-words"));
});
test("forbidden-word", () => {
  assert.ok(rules(mut((c) => { c.slides[1].body = "Get a DISCOUNT today."; })).includes("forbidden-word"));
  assert.ok(!rules(mut((c) => { c.slides[1].body = "Get a clear plan today."; })).includes("forbidden-word"));
});
test("price", () => {
  assert.ok(rules(mut((c) => { c.slides[1].body = "Starts at Rp 2 juta."; })).includes("price"));
  assert.ok(!rules(mut((c) => { c.slides[1].body = "Starts with a plan."; })).includes("price"));
});
test("exclamation", () => {
  assert.ok(rules(mut((c) => { c.slides[1].body = "Stop now!"; })).includes("exclamation"));
  assert.ok(rules(mut((c) => { c.caption = "Wow!"; })).includes("exclamation"));
});
test("all-caps", () => {
  assert.ok(rules(mut((c) => { c.slides[1].body = "STOP guessing."; })).includes("all-caps"));
  assert.ok(!rules(mut((c) => { c.slides[1].body = "ROAS and SEO only."; })).includes("all-caps"));
});
test("emoji counted over caption", () => {
  assert.ok(rules(mut((c) => { c.caption = "Nice 🙂🙂"; })).includes("emoji"));
  assert.ok(rules(mut((c) => { c.platform = "linkedin"; })).includes("emoji"));
  assert.ok(!rules(mut((c) => { c.caption = "Nice 👨‍👩‍👧"; })).includes("emoji"));
});
test("client-name", () => {
  assert.ok(rules(mut((c) => { c.slides[1].body = "We helped globex grow."; })).includes("client-name"));
});
test("claim-source", () => {
  const set = (claims) => mut((c) => { c.slides[1].headline = "Naik 30% bulan ini."; if (claims) c.slides[1].claims = claims; });
  assert.ok(rules(set()).includes("claim-source"));
  assert.ok(!rules(set([{ text: "30%", source: "internal report", date: "2026-10-01" }])).includes("claim-source"));
  assert.ok(!rules(set([{ text: "Up 30% in a month", source: "internal report", date: "2026-10-01" }])).includes("claim-source"));
  assert.ok(rules(set([{ text: "30%", source: "internal report" }])).includes("claim-source"));
  assert.ok(rules(set([{ text: "30%", date: "2026-10-01" }])).includes("claim-source"));
});
test("needs-confirmation", () => {
  assert.ok(rules(mut((c) => { c.slides[2].needs_confirmation = true; })).includes("needs-confirmation"));
});
test("address: only fires when platforms differ", () => {
  assert.ok(!rules(mut((c) => { c.slides[1].body = "Anda can try this."; })).includes("address"));
  const b = structuredClone(brand);
  b.voice.address = { instagram: "kamu", linkedin: "Anda" };
  assert.ok(rules(mut((c) => { c.slides[1].body = "Coba ANDA sendiri."; }), b).includes("address"));
  assert.ok(!rules(mut((c) => { c.slides[1].body = "Coba kamu sendiri."; }), b).includes("address"));
});
test("collects all issues", () => {
  const r = rules(mut((c) => { c.slides[1].body = "Discount! Rp 2 juta."; }));
  for (const x of ["forbidden-word", "price", "exclamation"]) assert.ok(r.includes(x), x);
});

test("pill, check and stat.value get the text rules", () => {
  assert.ok(rules(mut((c) => { c.slides[0].pill = "Rp 2 juta"; })).includes("price"));
  assert.ok(rules(mut((c) => { c.slides[5].stat.value = "Rp 2 juta"; })).includes("price"));
  assert.ok(rules(mut((c) => { c.slides[1].check = "Rp 2 juta"; })).includes("price"));
});
test("stat.value numeric claim needs a claims entry", () => {
  const set = (claims) => mut((c) => { c.slides[5].stat.value = "30%"; if (claims) c.slides[5].claims = claims; });
  assert.ok(rules(set()).includes("claim-source"));
  assert.ok(!rules(set([{ text: "30%", source: "internal report", date: "2026-10-01" }])).includes("claim-source"));
});
test("items-count", () => {
  const items = (n) => Array.from({ length: n }, (_, i) => `Item ${i}.`);
  const withItems = (kind, n) => mut((c) => { c.slides[2].kind = kind; c.slides[2].items = items(n); });
  assert.ok(rules(withItems("list", 0)).includes("items-count"));
  assert.ok(rules(withItems("list", 4)).includes("items-count"));
  assert.ok(!rules(withItems("list", 3)).includes("items-count"));
  assert.ok(rules(withItems("points", 5)).includes("items-count"));
  assert.ok(!rules(withItems("points", 4)).includes("items-count"));
  assert.ok(!rules(withItems("points", 0)).includes("items-count"));
});
test("claims that is not an array is a structure issue", () => {
  assert.ok(rules(mut((c) => { c.slides[1].claims = "30%"; })).includes("structure"));
});

test("numeric claims are checked in items, check, pill, kicker, compare sides and stat.label", () => {
  const cases = [
    (c) => { c.slides[2].items[0] = "Naik 30% sebulan."; },
    (c) => { c.slides[2].check = "Naik 30%"; },
    (c) => { c.slides[0].pill = "Naik 30%"; },
    (c) => { c.slides[1].kicker = "Naik 30%"; },
    (c) => { c.slides[1].kind = "compare"; c.slides[1].left = { title: "Naik 30%", body: "x" }; c.slides[1].right = { title: "y", body: "z" }; },
    (c) => { c.slides[1].kind = "compare"; c.slides[1].left = { title: "x", body: "Up 45% in 2023" }; c.slides[1].right = { title: "y", body: "z" }; },
    (c) => { c.slides[1].kind = "compare"; c.slides[1].left = { title: "x", body: "y" }; c.slides[1].right = { title: "Naik 30%", body: "z" }; },
    (c) => { c.slides[1].kind = "compare"; c.slides[1].left = { title: "x", body: "y" }; c.slides[1].right = { title: "y", body: "Naik 30%" }; },
    (c) => { c.slides[5].stat.label = "Naik 30%"; },
  ];
  for (const [i, fn] of cases.entries()) assert.ok(rules(mut(fn)).includes("claim-source"), `case ${i}`);
  const covered = mut((c) => {
    c.slides[2].items[0] = "Naik 30% sebulan.";
    c.slides[2].claims = [{ text: "30%", source: "internal report", date: "2026-10-01" }];
  });
  assert.ok(!rules(covered).includes("claim-source"));
  const both = mut((c) => {
    c.slides[1].kind = "compare"; c.slides[1].left = { title: "x", body: "Up 45% in 2023" }; c.slides[1].right = { title: "y", body: "z" };
    c.slides[1].claims = [{ text: "Up 45% in 2023", source: "report", date: "2026-10-01" }];
  });
  assert.ok(!rules(both).includes("claim-source"));
});
test("caption numeric claims are covered by the union of slide claims", () => {
  const set = (claims) => mut((c) => { c.caption = "Sales up 80%."; if (claims) c.slides[3].claims = claims; });
  const i = lintText(set(), brand).find((x) => x.rule === "claim-source");
  assert.ok(i);
  assert.equal(i.slide, null);
  assert.ok(!rules(set([{ text: "Sales up 80%", source: "report", date: "2026-10-01" }])).includes("claim-source"));
});
test("contact gets text rules but not numeric-claim checks", () => {
  const withContact = (v) => mut((c) => { c.slides[6].contact = v; });
  assert.ok(!rules(withContact("+" + "62 812 3456 7890")).includes("claim-source"));
  assert.ok(!rules(withContact("wa.me/628123456789")).includes("claim-source"));
  assert.ok(rules(withContact("Call Globex now")).includes("client-name"));
  assert.ok(rules(withContact("Hubungi sekarang!")).includes("exclamation"));
  assert.ok(rules(withContact("Rp 2 juta")).includes("price"));
  assert.ok(rules(withContact("Get a discount")).includes("forbidden-word"));
});
test("points with check allows at most 3 items", () => {
  const set = (n, check) => mut((c) => { c.slides[2].items = Array.from({ length: n }, (_, i) => `Item ${i}.`); if (check) c.slides[2].check = check; });
  assert.ok(rules(set(4, "Done.")).includes("items-count"));
  assert.ok(!rules(set(3, "Done.")).includes("items-count"));
  assert.ok(!rules(set(4)).includes("items-count"));
});

test("caption may carry a declared contact without tripping claim or all-caps rules", () => {
  const phone = "08" + "12 3456 7890";
  const declared = (contact, caption) => mut((c) => { c.slides[6].contact = contact; c.caption = caption; });
  assert.ok(!rules(declared(phone, `Save this. WhatsApp ${phone}.`)).includes("claim-source"));
  const wa = rules(declared(`WA ${phone}`, `Save this. WA ${phone}`));
  assert.ok(!wa.includes("claim-source") && !wa.includes("all-caps"));
  // same digits with no declared contact still fail
  assert.ok(rules(mut((c) => { c.caption = `Save this. WhatsApp ${phone}.`; })).includes("claim-source"));
  // brand-level contact counts too
  const b = structuredClone(brand); b.cta.contact = phone;
  assert.ok(!rules(mut((c) => { c.caption = `Call ${phone}`; }), b).includes("claim-source"));
  // other rules still see the caption
  assert.ok(rules(declared(phone, `Wow! ${phone}`)).includes("exclamation"));
});
test("avoid words match plain suffixes as whole words; client names stay whole-word", () => {
  const b = structuredClone(brand); b.voice.avoid = ["discount", "guarantee"];
  const hit = (t) => rules(mut((c) => { c.slides[1].body = t; }), b).includes("forbidden-word");
  for (const t of ["Big discounts here.", "It is discounted.", "We guaranteed it.", "Guarantees apply.", "Discounting again.", "A discount."]) assert.ok(hit(t), t);
  for (const t of ["A discourse on ads.", "Discounter-free."].slice(0, 1)) assert.ok(!hit(t), t);
  const c = (t) => rules(mut((x) => { x.slides[1].body = t; }), b).includes("client-name");
  assert.ok(c("Globex's team."));
  assert.ok(c("We helped Globex."));
  assert.ok(!c("Globexes are plants."));
});
