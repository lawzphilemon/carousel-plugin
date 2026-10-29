import { readFileSync } from "node:fs";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngSize(path) {
  const b = readFileSync(path);
  if (b.length < 24 || !b.subarray(0, 8).equals(SIG) || b.toString("latin1", 12, 16) !== "IHDR") {
    throw new Error(`not a PNG: ${path}`);
  }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
