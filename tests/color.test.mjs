import test from "node:test";
import assert from "node:assert/strict";
import { hexToRgb, luminance, contrast } from "../engine/lib/color.mjs";

test("hexToRgb", () => assert.deepEqual(hexToRgb("#FDDE5A"), [253, 222, 90]));
test("luminance bounds", () => {
  assert.equal(luminance("#000000"), 0);
  assert.equal(luminance("#FFFFFF"), 1);
});
test("contrast", () => {
  assert.equal(contrast("#FFFFFF", "#000000"), 21);
  assert.ok(contrast("#FDDE5A", "#FFFFFF") < 1.5);
  assert.ok(contrast("#FDDE5A", "#1D1D1D") > 12);
});
