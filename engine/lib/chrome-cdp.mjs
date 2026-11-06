#!/usr/bin/env node
// Chrome driven over the DevTools protocol instead of the one-shot --screenshot / --dump-dom flags.
// Why: on some Linux hosts (a headless VPS with Chrome for Testing 145) those flags never finish, while a
// DevTools session works. Needs Node 22 or newer (global WebSocket). No npm dependencies.
// Run as a child process by chrome.mjs when CAROUSEL_CHROME_MODE=cdp, so the engine's synchronous API is unchanged.
//   node chrome-cdp.mjs screenshot <chrome> <html> <png> <width> <height>
//   node chrome-cdp.mjs dom <chrome> <html> <width> <height>        (prints the serialized DOM)
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SETTLE_MS = 400; // after load and fonts, lets the in-page measure script finish

export const sandboxArgs = (platform = process.platform) => (platform === "linux" ? ["--no-sandbox"] : []);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

export async function withPage(chrome, htmlPath, size, fn) {
  if (typeof WebSocket === "undefined") throw new Error("CAROUSEL_CHROME_MODE=cdp needs Node 22 or newer (global WebSocket)");
  const profile = mkdtempSync(join(tmpdir(), "carousel-cdp-"));
  const proc = spawn(chrome, [
    "--headless=new", "--disable-gpu", ...sandboxArgs(), "--hide-scrollbars", "--force-device-scale-factor=1",
    "--disable-background-networking", "--no-first-run", "--disable-sync", "--mute-audio",
    `--user-data-dir=${profile}`, `--window-size=${size.width},${size.height}`, "--remote-debugging-port=0", "about:blank",
  ], { stdio: "ignore" });
  let ws;
  try {
    const portFile = join(profile, "DevToolsActivePort");
    // Chrome may still hold the file while writing it (EBUSY on Windows): treat a failed read as "not yet"
    const readPort = () => { try { const l = readFileSync(portFile, "utf8").split("\n"); return l.length >= 2 && l[0] && l[1] ? l : null; } catch { return null; } };
    const [port, path] = await waitFor(readPort, 20000, "Chrome DevTools port");
    ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("DevTools connection failed")); });
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(`${msg.error.message}`)) : res(msg.result);
      } else if (msg.method) events.push(msg);
    };
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    await page("Page.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
    await page("Page.navigate", { url: pathToFileURL(htmlPath).href });
    await waitFor(() => events.some((e) => e.method === "Page.loadEventFired" && e.sessionId === sessionId), 30000, "page load");
    await page("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
    await sleep(SETTLE_MS);
    return await fn(page);
  } finally {
    try { ws?.close(); } catch { /* already closed */ }
    proc.kill("SIGKILL");
    await sleep(100);
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

export const screenshotPng = (chrome, htmlPath, size) => withPage(chrome, htmlPath, size, async (page) =>
  Buffer.from((await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })).data, "base64"));

export const domHtml = (chrome, htmlPath, size) => withPage(chrome, htmlPath, size, async (page) =>
  (await page("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.value);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [mode, chrome, html, ...rest] = process.argv.slice(2);
  try {
    if (mode === "screenshot") {
      const [png, w, h] = rest;
      writeFileSync(png, await screenshotPng(chrome, html, { width: +w, height: +h }));
    } else if (mode === "dom") {
      const [w, h] = rest;
      process.stdout.write("<!DOCTYPE html>" + (await domHtml(chrome, html, { width: +w, height: +h })));
    } else {
      throw new Error(`unknown mode: ${mode}`);
    }
    process.exit(0);
  } catch (e) {
    process.stderr.write(`chrome-cdp: ${e.message}\n`);
    process.exit(1);
  }
}
