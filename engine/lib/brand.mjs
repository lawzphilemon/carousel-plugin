import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { contrast } from "./color.mjs";

const REQUIRED = [
  "slug", "name", "handle", "language", "timezone", "canvas", "palette", "contrast_pairs", "fonts",
  "logos", "layout", "voice", "hard_rules", "cta", "pillars", "knowledge", "platforms",
  ...["background_dark", "background_light", "accent", "text_on_dark", "text_on_light", "muted", "card", "forbidden"].map((k) => `palette.${k}`),
  ...["family", "file", "weights", "sizes_px", "max_weights_per_slide"].map((k) => `fonts.${k}`),
  ...["on_dark", "on_light", "on_accent", "width_px", "min_width_px", "width_px.cover", "width_px.content", "width_px.cta"].map((k) => `logos.${k}`),
  ...["margin_px", "max_body_words", "max_headline_words", "slides"].map((k) => `layout.${k}`),
  ...["pov", "address", "avoid", "emoji_max", "acronyms"].map((k) => `voice.${k}`),
  ...["no_prices", "claims_need_source", "client_name_blocklist", "headline_case", "headline_ends_with_period"].map((k) => `hard_rules.${k}`),
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const get = (o, path) => path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), o);

export function loadBrand(brandJsonPath) {
  const p = resolve(brandJsonPath);
  if (!existsSync(p)) throw new Error(`brand.json not found: ${brandJsonPath}`);
  try {
    return { brand: JSON.parse(readFileSync(p, "utf8")), dir: dirname(p) };
  } catch (e) {
    throw new Error(`invalid brand.json at ${p}: ${e.message}`);
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

// brand.json path for a slug read from project files; refuses anything that could leave brandsDir
export function brandPath(brandsDir, slug) {
  if (typeof slug !== "string" || !SLUG.test(slug)) throw new Error(`invalid brand slug: ${JSON.stringify(slug)}`);
  return join(brandsDir, slug, "brand.json");
}

export function validateBrand(brand, dir) {
  const errors = [];
  if (!brand || typeof brand !== "object") return ["brand: not an object"];
  const missing = new Set();
  for (const path of REQUIRED) {
    // skip children of an already-missing parent
    if (get(brand, path) == null && ![...missing].some((m) => path.startsWith(m + "."))) {
      missing.add(path);
      errors.push(`missing required key: ${path}`);
    }
  }
  const has = (p) => !missing.has(p) && get(brand, p) != null;

  if (has("timezone")) {
    try { new Intl.DateTimeFormat("en", { timeZone: brand.timezone }); }
    catch { errors.push(`timezone: invalid timezone "${brand.timezone}"`); }
  }

  if (has("palette")) {
    for (const [k, v] of Object.entries(brand.palette)) {
      for (const h of Array.isArray(v) ? v : [v]) {
        if (typeof h !== "string" || !HEX.test(h)) errors.push(`palette.${k}: "${h}" is not #RRGGBB`);
      }
    }
  }

  if (has("contrast_pairs")) {
    const pairs = Array.isArray(brand.contrast_pairs) ? brand.contrast_pairs : [];
    if (!Array.isArray(brand.contrast_pairs)) errors.push("contrast_pairs: must be an array");
    pairs.forEach((p, i) => {
      if (!p || !HEX.test(p.fg) || !HEX.test(p.bg)) return errors.push(`contrast_pairs[${i}]: fg/bg must be #RRGGBB`);
      const r = contrast(p.fg, p.bg);
      if (typeof p.min !== "number") return errors.push(`contrast_pairs[${i}]: min must be a number`);
      if (r < p.min) errors.push(`contrast_pairs[${i}]: ${p.fg} on ${p.bg} is ${r}, needs ${p.min}`);
    });
  }

  if (has("fonts.family") && !(typeof brand.fonts.family === "string" && /^[A-Za-z0-9 \-]+$/.test(brand.fonts.family))) {
    errors.push(`fonts.family: "${brand.fonts.family}" may only contain letters, digits, spaces and hyphens`);
  }
  for (const k of ["bg", "fg"]) {
    const v = brand.cta?.button?.[k];
    if (v !== undefined && !(typeof v === "string" && HEX.test(v))) errors.push(`cta.button.${k}: "${v}" is not #RRGGBB`);
  }

  const files = [];
  if (has("fonts.file")) files.push(["fonts.file", brand.fonts.file]);
  for (const k of ["on_dark", "on_light", "on_accent"]) if (has(`logos.${k}`)) files.push([`logos.${k}`, brand.logos[k]]);
  for (const [key, rel] of files) {
    if (typeof rel !== "string" || !rel || !existsSync(join(dir, rel))) errors.push(`${key}: file not found: ${rel}`);
  }
  return errors;
}
