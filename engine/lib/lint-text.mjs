import { wordCount, headlineWordCount, countEmoji, hasExclamation, findShoutedWords, hasPrice, numericClaims } from "./text.mjs";

const KINDS = ["cover", "statement", "points", "stat", "compare", "quote", "list", "cta"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wholeWord = (w, tail = "") => new RegExp(String.raw`(?<![\p{L}\p{N}])${esc(w)}${tail}(?![\p{L}\p{N}])`, "iu");
const INFLECT = "(?:s|es|ed|d|ing)?";
const POSSESSIVE = "(?:['’]s)?";

function fields(s) {
  const f = [];
  const add = (v) => { if (typeof v === "string" && v) f.push(v); };
  for (const k of ["kicker", "pill", "check", "headline", "sub", "body", "button", "contact"]) add(s[k]);
  (Array.isArray(s.items) ? s.items : []).forEach(add);
  for (const side of [s.left, s.right]) if (side) { add(side.title); add(side.body); }
  if (s.stat) { add(s.stat.value); add(s.stat.label); }
  return f;
}

// text that can carry a numeric claim; contact is deliberately absent (phone numbers are not claims)
function claimTexts(s) {
  const v = [s.headline, s.body, s.sub, s.kicker, s.pill, s.check, s.stat?.value, s.stat?.label, s.left?.title, s.left?.body, s.right?.title, s.right?.body];
  if (Array.isArray(s.items)) v.push(...s.items);
  return v.filter((x) => typeof x === "string");
}
const isCovered = (claims, m) => claims.some((c) => typeof c?.text === "string" && c.text.toLowerCase().includes(m.toLowerCase()));

export function lintText(copy, brand) {
  const out = [];
  const add = (slide, rule, message) => out.push({ slide, rule, message });
  if (!copy || typeof copy !== "object" || !Array.isArray(copy.slides)) {
    add(null, "structure", "copy.slides must be an array");
    return out;
  }
  const { layout, voice, hard_rules: hr } = brand;
  const platform = copy.platform;
  if (!brand.platforms?.[platform]) add(null, "structure", `unknown platform: ${platform}`);
  if (typeof copy.caption !== "string") add(null, "structure", "caption must be a string");

  const n = copy.slides.length;
  const [min, max] = layout.slides;
  const cap = brand.platforms?.[platform]?.max_slides ?? Infinity;
  if (n < min || n > max || n > cap) add(null, "slide-count", `${n} slides; allowed ${min}-${Math.min(max, cap)}`);

  // contacts declared for this campaign are not claims and their letters are not shouting
  const contacts = [brand.cta?.contact, ...copy.slides.map((s) => s?.contact)].filter((c) => typeof c === "string" && c.trim()).sort((a, b) => b.length - a.length);
  const stripContacts = (t) => contacts.reduce((a, c) => a.split(c).join(" "), t);
  const acr = voice.acronyms || [];
  const texts = [{ slide: null, list: typeof copy.caption === "string" ? [copy.caption] : [] }];

  copy.slides.forEach((s, idx) => {
    const no = idx + 1;
    if (!s || typeof s !== "object" || typeof s.headline !== "string" || !s.headline.trim() || !KINDS.includes(s.kind)) {
      add(no, "structure", "slide needs a known kind and a headline");
      return;
    }
    const h = s.headline.trim();
    const hw = headlineWordCount(h);
    if (hw > layout.max_headline_words) add(no, "headline-words", `headline has ${hw} words, max ${layout.max_headline_words}`);
    if (hr.headline_case === "sentence") {
      const rest = h.split(/\s+/).slice(1).map((w) => w.replace(/^[^\p{L}]+/u, "")).filter((w) => /^\p{L}/u.test(w) && !acr.includes(w.replace(/[^\p{L}]+$/u, "")));
      const caps = rest.filter((w) => /^\p{Lu}/u.test(w)).length;
      if (rest.length && caps > rest.length / 2) add(no, "headline-case", "headline is Title Case, use sentence case");
    }
    if (hr.headline_ends_with_period && s.kind !== "cta" && !h.endsWith(".")) add(no, "headline-period", "headline must end with a period");
    if (typeof s.body === "string" && wordCount(s.body) > layout.max_body_words) add(no, "body-words", `body has ${wordCount(s.body)} words, max ${layout.max_body_words}`);
    if (s.needs_confirmation === true) add(no, "needs-confirmation", "slide still needs confirmation");

    const n_items = Array.isArray(s.items) ? s.items.length : 0;
    if (s.kind === "list" && (n_items < 1 || n_items > 3)) add(no, "items-count", `list needs 1-3 items, has ${n_items}`);
    if (s.kind === "points" && s.check && n_items > 3) add(no, "items-count", `points with a check allows at most 3 items, has ${n_items}`);
    if (s.kind === "points" && n_items > 4) add(no, "items-count", `points allows at most 4 items, has ${n_items}`);
    if (s.claims !== undefined && !Array.isArray(s.claims)) add(no, "structure", "claims must be an array");

    if (hr.claims_need_source) {
      const claims = Array.isArray(s.claims) ? s.claims : [];
      for (const m of claimTexts(s).flatMap(numericClaims)) {
        if (!isCovered(claims, m)) add(no, "claim-source", `numeric claim "${m}" has no matching claims[] entry`);
      }
      claims.forEach((c) => { if (!c?.source || !c?.date) add(no, "claim-source", `claim "${c?.text}" needs source and date`); });
    }
    texts.push({ slide: no, list: fields(s) });
  });

  if (hr.claims_need_source && typeof copy.caption === "string") {
    const all = copy.slides.flatMap((s) => (Array.isArray(s?.claims) ? s.claims : []));
    for (const m of numericClaims(stripContacts(copy.caption))) {
      if (!isCovered(all, m)) add(null, "claim-source", `caption numeric claim "${m}" has no matching claims[] entry on any slide`);
    }
  }

  const [self, ...others] = [platform, ...Object.keys(voice.address || {}).filter((p) => p !== platform)];
  const mine = voice.address?.[self];
  const foreign = [...new Set(others.map((p) => voice.address[p]))].filter((w) => typeof w === "string" && !/\s/.test(w) && typeof mine === "string" && !/\s/.test(mine) && w.toLowerCase() !== mine.toLowerCase());

  for (const { slide, list } of texts) {
    for (const t of list) {
      for (const w of voice.avoid || []) if (wholeWord(w, INFLECT).test(t)) add(slide, "forbidden-word", `avoid word "${w}"`);
      for (const w of hr.client_name_blocklist || []) if (wholeWord(w, POSSESSIVE).test(t)) add(slide, "client-name", `client name "${w}"`);
      for (const w of foreign) if (wholeWord(w).test(t)) add(slide, "address", `"${w}" is the address word for another platform; use "${mine}"`);
      if (hr.no_prices && hasPrice(t)) add(slide, "price", `price found in "${t}"`);
      if (!voice.exclamation && hasExclamation(t)) add(slide, "exclamation", `exclamation mark in "${t}"`);
      if (!voice.all_caps_emphasis) for (const w of findShoutedWords(stripContacts(t), acr)) add(slide, "all-caps", `shouted word "${w}"`);
    }
  }
  const lim = voice.emoji_max?.[platform];
  if (typeof lim === "number" && typeof copy.caption === "string") {
    const e = countEmoji(copy.caption);
    if (e > lim) add(null, "emoji", `caption has ${e} emoji, max ${lim}`);
  }
  return out;
}
