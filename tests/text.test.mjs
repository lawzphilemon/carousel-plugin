import test from "node:test";
import assert from "node:assert/strict";
import { wordCount, headlineWordCount, countEmoji, hasExclamation, findShoutedWords, hasPrice, numericClaims } from "../engine/lib/text.mjs";

test("wordCount", () => {
  assert.equal(wordCount("self-driven ads work"), 3);
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount("   "), 0);
});
test("headlineWordCount ignores punctuation-only tokens", () => {
  assert.equal(headlineWordCount("Satu dua — tiga ."), 3);
  assert.equal(headlineWordCount("self-driven ads."), 2);
});
test("countEmoji", () => assert.equal(countEmoji("ok 🙂 fine 🙂"), 2));
test("hasExclamation", () => {
  assert.equal(hasExclamation("wow!"), true);
  assert.equal(hasExclamation("wow."), false);
});
test("findShoutedWords", () => {
  assert.deepEqual(findShoutedWords("ROAS is key, STOP now", ["ROAS"]), ["STOP"]);
  assert.deepEqual(findShoutedWords("Mulai dari ROAS dan SEO", ["ROAS", "SEO"]), []);
  assert.deepEqual(findShoutedWords("A day. I think so", []), []);
});
test("hasPrice true", () => {
  for (const s of ["Rp 1,5 juta", "1.5jt", "$20", "Rp500rb"]) assert.equal(hasPrice(s), true, s);
});
test("hasPrice false", () => {
  for (const s of ["corporate", "Karp", "3 angka"]) assert.equal(hasPrice(s), false, s);
});
test("numericClaims", () => {
  assert.deepEqual(numericClaims("naik 30% dalam 2 minggu"), ["30%"]);
  assert.deepEqual(numericClaims("3 angka penting"), []);
  assert.deepEqual(numericClaims("sejak 2024"), ["2024"]);
  assert.deepEqual(numericClaims("1.500 pelanggan"), ["1.500"]);
  assert.deepEqual(numericClaims("hemat 5x lipat"), ["5x"]);
  assert.deepEqual(numericClaims("omzet 2 juta"), ["2 juta"]);
});
test("countEmoji is grapheme-aware", () => {
  assert.equal(countEmoji("👨‍👩‍👧"), 1);
  assert.equal(countEmoji("👍🏽"), 1);
  assert.equal(countEmoji("🇮🇩"), 1);
  assert.equal(countEmoji("🇮🇩🇺🇸"), 2);
  assert.equal(countEmoji("no emoji 1 2 3"), 0);
});
