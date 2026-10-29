import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadBrand, validateBrand, brandPath } from "./lib/brand.mjs";
import { findChrome, chromeScreenshot } from "./lib/chrome.mjs";
import { readPngSize } from "./lib/png.mjs";
import { slideHtml, pageHtml } from "./lib/layouts.mjs";
import { updateMeta } from "./lib/project.mjs";

const pad = (n) => String(n).padStart(2, "0");

export function renderProject({ projectDir, brandsDir, chrome }) {
  const copy = JSON.parse(readFileSync(join(projectDir, "copy.json"), "utf8"));
  const { brand, dir } = loadBrand(brandPath(brandsDir, copy.brand));
  const errors = validateBrand(brand, dir);
  if (errors.length) throw new Error(errors[0]);
  const exe = findChrome(chrome);
  const size = brand.canvas;
  const n = copy.slides.length;
  mkdirSync(join(projectDir, "html"), { recursive: true });
  mkdirSync(join(projectDir, "slides"), { recursive: true });
  // a re-render voids earlier checks and must not leave PNGs from a longer carousel behind
  rmSync(join(projectDir, "verification.json"), { force: true });
  for (const f of readdirSync(join(projectDir, "slides"))) if (/^slide-\d+\.png$/.test(f)) rmSync(join(projectDir, "slides", f));

  const sections = copy.slides.map((s, i) => slideHtml(s, i, n, brand));
  writeFileSync(join(projectDir, "carousel.html"), pageHtml(sections, brand, dir));
  const slides = [];
  sections.forEach((sec, i) => {
    const html = join(projectDir, "html", `slide-${pad(i + 1)}.html`);
    const png = join(projectDir, "slides", `slide-${pad(i + 1)}.png`);
    writeFileSync(html, pageHtml([sec], brand, dir));
    chromeScreenshot(exe, html, png, size);
    const got = readPngSize(png);
    if (got.width !== size.width || got.height !== size.height) {
      throw new Error(`slide-${pad(i + 1)}.png is ${got.width}x${got.height}, expected ${size.width}x${size.height}`);
    }
    slides.push(png);
  });

  const cols = 4, th = 270, gap = 16;
  const thH = Math.round((th * size.height) / size.width);
  const sheet = join(projectDir, "contact-sheet.html");
  const imgs = slides.map((_, i) => `<img src="slides/slide-${pad(i + 1)}.png" alt="">`).join("");
  writeFileSync(sheet, pageHtml([`<div class="thumbs">${imgs}</div>`], brand, dir).replace(/<base [^>]*>/, "").replace("</style>", "html,body{width:auto;height:auto;background:#fff}</style>"));
  chromeScreenshot(exe, sheet, join(projectDir, "contact-sheet.png"), {
    width: cols * th + (cols + 1) * gap,
    height: Math.ceil(n / cols) * (thH + gap) + gap,
  });

  if (existsSync(join(projectDir, "meta.json"))) updateMeta(projectDir, { status: "rendered" }, { allowStatusReset: true });
  return { slides };
}
