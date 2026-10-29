import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readPngSize } from "../engine/lib/png.mjs";

const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("readPngSize reads IHDR; rejects non-PNG", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "car-png-"));
  try {
    fs.writeFileSync(path.join(d, "a.png"), PNG_1x1);
    assert.deepEqual(readPngSize(path.join(d, "a.png")), { width: 1, height: 1 });
    fs.writeFileSync(path.join(d, "t.png"), "this is definitely not a png file at all");
    assert.throws(() => readPngSize(path.join(d, "t.png")), /not a PNG/);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
