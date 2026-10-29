const tokens = (s) => s.split(/\s+/).filter(Boolean);

export const wordCount = (s) => tokens(s).length;

export const headlineWordCount = (s) => tokens(s).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

const SEG = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const countEmoji = (s) =>
  [...SEG.segment(s)].filter(({ segment: g }) => /\p{Extended_Pictographic}|^\p{Regional_Indicator}{2}/u.test(g)).length;

export const hasExclamation = (s) => s.includes("!");

export function findShoutedWords(s, acronyms) {
  const ok = new Set(acronyms);
  return (s.match(/\p{L}+/gu) || []).filter(
    (w) => w.length >= 2 && w === w.toUpperCase() && w !== w.toLowerCase() && !ok.has(w),
  );
}

const UNIT = String.raw`(?:jt|juta|rb|ribu|k|million|billion)`;
const END = String.raw`(?![\p{L}\p{N}])`;
const CUR = String.raw`(?<![A-Za-z])(?:Rp|IDR|USD)\s?|\$\s?`;
const NUM = String.raw`\d+(?:[.,]\d+)*`;

const PRICE = new RegExp(String.raw`(?:${CUR})\d|\d\s?${UNIT}${END}`, "iu");

export const hasPrice = (s) => PRICE.test(s);

const CLAIM = new RegExp(String.raw`(${CUR})?(${NUM})(\s?(?:%|x${END}|${UNIT}${END}))?`, "giu");

export function numericClaims(s) {
  const out = [];
  for (const m of s.matchAll(CLAIM)) {
    const digits = m[2].replace(/\D/g, "").length;
    if (m[1] || m[3] || digits >= 4) out.push(m[0]);
  }
  return out;
}
