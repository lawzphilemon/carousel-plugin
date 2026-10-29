import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];

export function findChrome(override) {
  const found = [override, process.env.CHROME_PATH, ...PATHS].find((p) => p && existsSync(p));
  if (!found) throw new Error("Chrome not found; pass --chrome or set CHROME_PATH");
  return found;
}

// Chrome as root in a Linux container needs --no-sandbox; elsewhere keep the sandbox on
export const sandboxArgs = (platform = process.platform) => (platform === "linux" ? ["--no-sandbox"] : []);

function run(chrome, htmlPath, size, extra, budget) {
  const profile = mkdtempSync(join(tmpdir(), "carousel-chrome-"));
  try {
    const r = spawnSync(chrome, [
      "--headless=new", "--disable-gpu", ...sandboxArgs(), "--hide-scrollbars", "--force-device-scale-factor=1",
      `--user-data-dir=${profile}`, `--window-size=${size.width},${size.height}`,
      `--virtual-time-budget=${budget}`, ...extra, pathToFileURL(htmlPath).href,
    ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
    if (r.error) throw new Error(`Chrome failed: ${r.error.message}`);
    return r;
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

export function chromeScreenshot(chrome, htmlPath, pngPath, size) {
  const r = run(chrome, htmlPath, size, [`--screenshot=${pngPath}`], 2000);
  if (!existsSync(pngPath)) throw new Error(`Chrome produced no screenshot for ${htmlPath}: ${r.stderr?.slice(-300)}`);
}

export function chromeDom(chrome, htmlPath, size) {
  const r = run(chrome, htmlPath, size, ["--dump-dom"], 3000);
  if (r.status !== 0 || !r.stdout) throw new Error(`Chrome dump-dom failed for ${htmlPath}: ${r.stderr?.slice(-300)}`);
  return r.stdout;
}
