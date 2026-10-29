// Runs inside headless Chrome (stringified below); writes the report to body[data-report].
function measure() {
  const col = (c) => {
    const n = String(c).match(/[\d.]+/g).map(Number);
    return { hex: "#" + n.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase(), a: n.length > 3 ? n[3] : 1 };
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  const effBg = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = col(getComputedStyle(e).backgroundColor);
      if (c.a > 0) return c.hex;
    }
    return "#FFFFFF";
  };
  const run = () => {
    const slides = [...document.querySelectorAll(".slide")].map((s, index) => {
      const sr = s.getBoundingClientRect();
      const all = [...s.querySelectorAll("*")];
      const isText = (e) => e.tagName !== "IMG" && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const texts = all.filter(isText);
      const overflow = all.some((e) => {
        const r = e.getBoundingClientRect();
        return r.left < sr.left - 1 || r.top < sr.top - 1 || r.right > sr.right + 1 || r.bottom > sr.bottom + 1;
      });
      let minMargin = 9999;
      for (const e of texts) {
        const r = e.getBoundingClientRect();
        minMargin = Math.min(minMargin, r.left - sr.left, r.top - sr.top, sr.right - r.right, sr.bottom - r.bottom);
      }
      const palette = new Set();
      for (const e of [s, ...all]) {
        const c = col(getComputedStyle(e).backgroundColor);
        if (c.a > 0) palette.add(c.hex);
      }
      const colors = [], fonts = [];
      for (const e of texts) {
        const cs = getComputedStyle(e);
        const fg = col(cs.color).hex;
        palette.add(fg);
        colors.push({ fg, bg: effBg(e) });
        fonts.push({ size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) });
      }
      const logos = [...s.querySelectorAll("img")].map((i) => ({
        src: (i.getAttribute("src") || "").split("/").pop(),
        width: r2(i.getBoundingClientRect().width),
      }));
      return { index, bg: col(getComputedStyle(s).backgroundColor).hex, width: r2(sr.width), height: r2(sr.height), overflow, minMargin: r2(minMargin), fonts, colors, logos, palette: [...palette] };
    });
    document.body.dataset.report = JSON.stringify({ slides });
  };
  document.fonts.ready.then(run);
}

export const MEASURE_SCRIPT = `(${measure.toString()})()`;

const ENT = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'" };
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, d, h, n) =>
    d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : (ENT[n] ?? m));

export function parseReport(dom) {
  const m = /data-report="([^"]*)"/.exec(dom);
  if (!m) throw new Error("measure report missing from page (script did not finish)");
  return JSON.parse(decode(m[1]));
}
