import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome } from "../engine/lib/chrome.mjs";
import { screenshotPng, domHtml } from "../engine/lib/chrome-cdp.mjs";

let chrome = null;
try { chrome = findChrome(); } catch { /* no Chrome here */ }
const skip = !chrome ? "no Chrome found" : typeof WebSocket === "undefined" ? "needs Node 22+ (global WebSocket)" : false;

test("cdp backend: screenshot has the page size and the DOM shows what scripts wrote", { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "cdp-test-"));
  try {
    const html = join(dir, "p.html");
    writeFileSync(html, "<!doctype html><html><body style='margin:0;background:#123456'><p id=x>before</p><script>document.fonts.ready.then(()=>{document.getElementById('x').textContent='after'})</script></body></html>");
    const size = { width: 300, height: 200 };
    const png = await screenshotPng(chrome, html, size);
    assert.equal(png.readUInt32BE(16), 300);
    assert.equal(png.readUInt32BE(20), 200);
    const dom = await domHtml(chrome, html, size);
    assert.match(dom, /<p id="x">after<\/p>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
