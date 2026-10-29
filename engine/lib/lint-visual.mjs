import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBrand, brandPath } from "./brand.mjs";
import { contrast } from "./color.mjs";
import { findChrome, chromeDom } from "./chrome.mjs";
import { readPngSize } from "./png.mjs";
import { slideHtml, pageHtml } from "./layouts.mjs";
import { parseReport } from "./measure.mjs";

const variants = { background_dark: "on_dark", background_light: "on_light", accent: "on_accent" };
const pad = (n) => String(n).padStart(2, "0");
const up = (s) => String(s).toUpperCase();

export function lintVisual(report, brand, pngSizes) {
  const issues = [];
  const { canvas, fonts, logos, layout } = brand;
  const ranges = Object.values(fonts.sizes_px);
  const allowed = new Set(Object.entries(brand.palette).filter(([, v]) => typeof v === "string").map(([, v]) => up(v)));
  const forbidden = new Set((brand.palette.forbidden ?? []).map(up));
  const pairs = brand.contrast_pairs ?? [];

  report.slides.forEach((s, i) => {
    const slide = i + 1;
    const add = (rule, message) => issues.push({ slide, rule, message });
    const png = pngSizes[i];
    if (!png || png.width !== canvas.width || png.height !== canvas.height) {
      add("png-size", png ? `PNG is ${png.width}x${png.height}, expected ${canvas.width}x${canvas.height}` : `slides/slide-${pad(slide)}.png not found; run render first`);
    }
    if (s.overflow) add("overflow", "an element extends beyond the slide");
    if (s.minMargin + 0.5 < layout.margin_px) add("margin", `text is ${s.minMargin}px from an edge, minimum ${layout.margin_px}px`);

    for (const size of new Set(s.fonts.map((f) => f.size))) {
      if (!ranges.some(([lo, hi]) => size >= lo - 0.5 && size <= hi + 0.5)) add("font-size", `${size}px is outside every configured size range`);
    }
    const weights = new Set(s.fonts.map((f) => f.weight));
    if (weights.size > fonts.max_weights_per_slide) add("font-weights", `${weights.size} font weights (${[...weights].join(", ")}), maximum ${fonts.max_weights_per_slide}`);

    // 4.5:1 applies to all text on purpose (no large-text relaxation).
    const seen = new Set();
    for (const { fg, bg } of s.colors) {
      const key = up(fg) + up(bg);
      if (seen.has(key)) continue;
      seen.add(key);
      const ratio = contrast(fg, bg);
      const pair = pairs.find((p) => up(p.fg) === up(fg) && up(p.bg) === up(bg));
      if (ratio < (pair?.min ?? 4.5)) add("contrast", `${up(fg)} on ${up(bg)} is ${ratio}:1, minimum ${pair?.min ?? 4.5}:1`);
    }

    if (s.logos.length !== 1) add("logo", `${s.logos.length} logos, expected exactly 1`);
    else {
      if (s.logos[0].width < logos.min_width_px) add("logo", `logo is ${s.logos[0].width}px wide, minimum ${logos.min_width_px}px`);
      const variant = Object.entries(variants).find(([k]) => up(brand.palette[k]) === up(s.bg))?.[1];
      const base = (f) => String(f).split("/").pop();
      if (!variant) add("logo", `background ${s.bg} has no logo variant`);
      else if (base(logos[variant]) !== base(s.logos[0].src)) add("logo", `logo is ${base(s.logos[0].src)}, expected ${base(logos[variant])} (${variant}) on ${s.bg}`);
    }

    for (const c of new Set(s.palette.map(up))) {
      if (forbidden.has(c)) add("palette", `${c} is a forbidden color`);
      else if (!allowed.has(c)) add("palette", `${c} is not in the brand palette`);
    }
  });
  return issues;
}

export function runVisual(projectDir, brandsDir, chrome) {
  const copy = JSON.parse(readFileSync(join(projectDir, "copy.json"), "utf8"));
  const { brand, dir } = loadBrand(brandPath(brandsDir, copy.brand));
  const exe = findChrome(chrome);
  const n = copy.slides.length;
  const tmp = mkdtempSync(join(tmpdir(), "carousel-measure-"));
  let slides, pngSizes;
  try {
    slides = copy.slides.map((s, i) => {
      const html = join(tmp, `slide-${pad(i + 1)}.html`);
      writeFileSync(html, pageHtml([slideHtml(s, i, n, brand)], brand, dir, { measure: true }));
      const rep = parseReport(chromeDom(exe, html, brand.canvas)).slides[0];
      return { ...rep, index: i };
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  pngSizes = copy.slides.map((_, i) => {
    try { return readPngSize(join(projectDir, "slides", `slide-${pad(i + 1)}.png`)); } catch { return null; }
  });
  const issues = lintVisual({ slides }, brand, pngSizes);
  writeFileSync(join(projectDir, "verification.json"), JSON.stringify({ passed: issues.length === 0, issues, checked_at: new Date().toISOString() }, null, 2));
  return issues;
}
