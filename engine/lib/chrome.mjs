import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
    // Chrome's helper processes can still write into the profile for a moment after the main process exits (seen on Linux: ENOTEMPTY)
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

// CAROUSEL_CHROME_MODE=cdp drives Chrome over the DevTools protocol (needs Node 22+); use it when the one-shot
// --screenshot / --dump-dom flags hang, as seen with Chrome for Testing 145 on a headless Linux VPS.
const useCdp = () => process.env.CAROUSEL_CHROME_MODE === "cdp";
const CDP = fileURLToPath(new URL("./chrome-cdp.mjs", import.meta.url));

function runCdp(args) {
  const r = spawnSync(process.execPath, [CDP, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  if (r.error) throw new Error(`Chrome (cdp) failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`Chrome (cdp) failed: ${(r.stderr || "").trim().slice(-300)}`);
  return r;
}

export function chromeScreenshot(chrome, htmlPath, pngPath, size) {
  if (useCdp()) {
    runCdp(["screenshot", chrome, htmlPath, pngPath, String(size.width), String(size.height)]);
    if (!existsSync(pngPath)) throw new Error(`Chrome produced no screenshot for ${htmlPath}`);
    return;
  }
  const r = run(chrome, htmlPath, size, [`--screenshot=${pngPath}`], 2000);
  if (!existsSync(pngPath)) throw new Error(`Chrome produced no screenshot for ${htmlPath}: ${r.stderr?.slice(-300)}`);
}

export function chromeDom(chrome, htmlPath, size) {
  if (useCdp()) return runCdp(["dom", chrome, htmlPath, String(size.width), String(size.height)]).stdout;
  const r = run(chrome, htmlPath, size, ["--dump-dom"], 3000);
  if (r.status !== 0 || !r.stdout) throw new Error(`Chrome dump-dom failed for ${htmlPath}: ${r.stderr?.slice(-300)}`);
  return r.stdout;
}
