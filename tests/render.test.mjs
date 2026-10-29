import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findChrome, sandboxArgs } from "../engine/lib/chrome.mjs";
import { runVisual } from "../engine/lib/lint-visual.mjs";
import { renderProject } from "../engine/render.mjs";
import { readPngSize } from "../engine/lib/png.mjs";
import { createProject, readMeta } from "../engine/lib/project.mjs";

let chrome = null;
try { chrome = findChrome(); } catch { /* skipped below */ }

const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "car-render-"));
  const { dir } = createProject({ outRoot: root, brandSlug: "acme", topic: "t" });
  fs.copyFileSync("tests/fixtures/copy-ok.json", path.join(dir, "copy.json"));
  return { root, dir };
};

test("findChrome throws a clear error", () => {
  const saved = process.env.CHROME_PATH;
  delete process.env.CHROME_PATH;
  try {
    if (!chrome) assert.throws(() => findChrome(), /Chrome not found; pass --chrome or set CHROME_PATH/);
    assert.equal(findChrome(process.execPath), process.execPath);
  } finally {
    if (saved) process.env.CHROME_PATH = saved;
  }
});

test("render acme fixture to 7 PNGs at canvas size + contact sheet", (t) => {
  if (!chrome) return t.skip("Chrome not found; set CHROME_PATH");
  const { root, dir } = setup();
  try {
    const { slides } = renderProject({ projectDir: dir, brandsDir: "examples", chrome });
    assert.equal(slides.length, 7);
    for (const s of slides) assert.deepEqual(readPngSize(s), { width: 1080, height: 1350 });
    assert.ok(fs.existsSync(path.join(dir, "contact-sheet.png")));
    assert.ok(fs.existsSync(path.join(dir, "carousel.html")));
    assert.equal(readMeta(dir).status, "rendered");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing font file throws naming the path", (t) => {
  if (!chrome) return t.skip("Chrome not found; set CHROME_PATH");
  const { root, dir } = setup();
  try {
    const b = JSON.parse(fs.readFileSync("examples/acme/brand.json", "utf8"));
    b.fonts.file = "fonts/missing.ttf";
    const bd = path.join(root, "brands", "acme");
    fs.mkdirSync(bd, { recursive: true });
    fs.cpSync("examples/acme/logos", path.join(bd, "logos"), { recursive: true });
    fs.writeFileSync(path.join(bd, "brand.json"), JSON.stringify(b));
    assert.throws(() => renderProject({ projectDir: dir, brandsDir: path.join(root, "brands"), chrome }), /fonts\/missing\.ttf/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a copy.brand that is not a slug is refused before any path is built", () => {
  const { root, dir } = setup();
  try {
    const copy = JSON.parse(fs.readFileSync(path.join(dir, "copy.json"), "utf8"));
    copy.brand = "../acme";
    fs.writeFileSync(path.join(dir, "copy.json"), JSON.stringify(copy));
    assert.throws(() => renderProject({ projectDir: dir, brandsDir: "examples" }), /invalid brand slug/);
    assert.throws(() => runVisual(dir, "examples"), /invalid brand slug/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("--no-sandbox only on linux", () => {
  assert.deepEqual(sandboxArgs("linux"), ["--no-sandbox"]);
  assert.deepEqual(sandboxArgs("win32"), []);
  assert.deepEqual(sandboxArgs("darwin"), []);
});
