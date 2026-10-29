import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean)
  .filter((f) => !/\.(png|ttf)$/i.test(f) && f !== "examples/acme/fonts/OFL.txt");
const files = tracked.filter((f) => existsSync(join(root, f))).map((f) => [f, readFileSync(join(root, f), "utf8")]);

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const PHONE = /(?:\+62|\b08)[\s-]?\d(?:[\s-]?\d){7,}/g;

test("no real email addresses in tracked files", () => {
  const bad = [];
  // the commit trailer address quoted in the plan docs is not a real contact
  const OK = new Set(["noreply@anthropic.com"]);
  for (const [f, s] of files) for (const m of s.matchAll(EMAIL)) if (m[1].toLowerCase() !== "example.com" && !OK.has(m[0].toLowerCase())) bad.push(`${f}: ${m[0]}`);
  assert.deepEqual(bad, []);
});

test("no phone numbers in tracked files", () => {
  const bad = [];
  for (const [f, s] of files) for (const m of s.matchAll(PHONE)) bad.push(`${f}: ${m[0]}`);
  assert.deepEqual(bad, []);
});

test("no blocklisted names in tracked files", (t) => {
  const p = process.env.CAROUSEL_BLOCKLIST_FILE;
  if (!p) return t.diagnostic("CAROUSEL_BLOCKLIST_FILE not set: blocklist check skipped");
  const names = readFileSync(p, "utf8").split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
  const bad = [];
  for (const n of names) {
    const esc = n.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])`, "iu");
    for (const [f, s] of files) if (re.test(s)) bad.push(`${f}: ${n}`);
  }
  assert.deepEqual(bad, []);
});

test("README covers the essentials", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  for (const s of ["carousel-output", "brand.json", "/carousel:brand", "/carousel:make", "/carousel:publish"]) assert.ok(readme.includes(s), `README missing ${s}`);
});

test(".gitignore keeps private folders out", () => {
  const gi = readFileSync(join(root, ".gitignore"), "utf8");
  for (const s of ["brands/", "carousel-output/", ".superpowers/"]) assert.ok(gi.includes(s), `.gitignore missing ${s}`);
});

test("no local absolute paths in tracked files", () => {
  // built from pieces so this file does not match itself
  const sep = "\\\\";
  const pats = [new RegExp("[A-Za-z]:" + sep + "Users" + sep), new RegExp("/Us" + "ers/[^/\s]+/"), new RegExp("/ho" + "me/[^/\s]+/")];
  const bad = [];
  for (const [f, s] of files) for (const re of pats) { const m = re.exec(s); if (m) bad.push(`${f}: ${m[0]}`); }
  assert.deepEqual(bad, []);
});
