import test from "node:test";
import assert from "node:assert/strict";
import { resolveKnowledge } from "../engine/lib/knowledge.mjs";

test("missing skill falls back with a note", () => {
  const r = resolveKnowledge({ knowledge: { hook: ["wtf-hook-999"] } }, []);
  assert.equal(r.hook.fallback, true);
  assert.deepEqual(r.hook.use, []);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /wtf-hook-999 is not installed/);
});
test("installed skill is used", () => {
  const r = resolveKnowledge({ knowledge: { hook: ["wtf-hook-999"] } }, ["wtf-hook-999"]);
  assert.deepEqual(r.hook.use, ["wtf-hook-999"]);
  assert.equal(r.hook.fallback, false);
  assert.deepEqual(r.notes, []);
});
test("empty or missing knowledge gives all fallbacks", () => {
  for (const brand of [{ knowledge: {} }, {}]) {
    const r = resolveKnowledge(brand, ["x"]);
    for (const k of ["hook", "script", "humanizer"]) {
      assert.equal(r[k].fallback, true);
      assert.deepEqual(r[k].use, []);
    }
    assert.deepEqual(r.notes, []);
  }
});
test("partial install keeps installed, notes the rest", () => {
  const r = resolveKnowledge({ knowledge: { script: ["a", "b"], humanizer: ["c"] } }, ["b"]);
  assert.deepEqual(r.script.use, ["b"]);
  assert.equal(r.script.fallback, false);
  assert.equal(r.humanizer.fallback, true);
  assert.deepEqual(r.notes, ["a is not installed; using bundled guide", "c is not installed; using bundled guide"]);
});

test("installed undefined or null is empty", () => {
  for (const inst of [undefined, null]) {
    const r = resolveKnowledge({ knowledge: { hook: ["a"] } }, inst);
    assert.equal(r.hook.fallback, true);
  }
});
test("string role value is ignored with a note", () => {
  const r = resolveKnowledge({ knowledge: { hook: "wtf-hook-999" } }, ["wtf-hook-999"]);
  assert.equal(r.hook.fallback, true);
  assert.deepEqual(r.hook.use, []);
  assert.ok(r.notes.includes("knowledge.hook must be an array; ignored"));
});
test("duplicate configured skills give one note", () => {
  const r = resolveKnowledge({ knowledge: { hook: ["a", "a"] } }, []);
  assert.equal(r.notes.length, 1);
});
