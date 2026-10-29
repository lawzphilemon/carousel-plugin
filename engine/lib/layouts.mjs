import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { MEASURE_SCRIPT } from "./measure.mjs";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad = (n) => String(n).padStart(2, "0");

// background per kind: dark | light | accent
const BG = { cover: "dark", statement: "dark", points: "light", stat: "dark", compare: "dark", quote: "dark", list: "light", cta: "accent" };
const LOGO = { dark: "on_dark", light: "on_light", accent: "on_accent" };

// One accented phrase; ignored when it is not a substring of the headline.
function headline(slide) {
  const h = String(slide.headline ?? "");
  const a = slide.accent;
  const i = a ? h.indexOf(a) : -1;
  if (i < 0) return esc(h);
  return `${esc(h.slice(0, i))}<span class="hl">${esc(a)}</span>${esc(h.slice(i + a.length))}`;
}

const p = (cls, t) => (t ? `<p class="${cls}">${esc(t)}</p>` : "");
const kicker = (t) => (t ? `<span class="kicker">${esc(t)}</span>` : "");

function body(kind, s, brand) {
  const h = (c = "title") => `<h1 class="${c}">${headline(s)}</h1>`;
  switch (kind) {
    case "cover":
      return `${s.pill ? `<span class="pill">${esc(s.pill)}</span>` : ""}${h("hook")}${p("sub", s.sub)}`;
    case "statement":
      return `${kicker(s.kicker)}${h()}${p("text", s.body)}${p("sub", s.sub)}`;
    case "points": {
      const cards = [...(s.items ?? []), ...(s.check ? [s.check] : [])].slice(0, 4);
      return `${kicker(s.kicker)}${h()}${p("text", s.body)}
        <div class="cards">${cards.map((c) => `<div class="card"><i class="tick"></i><span>${esc(c)}</span></div>`).join("")}</div>`;
    }
    case "stat":
      return `${s.headline ? h("title small") : ""}<div class="statval">${esc(s.stat?.value)}</div>${p("text", s.stat?.label)}${p("text", s.body)}${p("sub", s.sub)}`;
    case "compare": {
      const side = (x, cls) => `<div class="card ${cls}"><h2>${esc(x?.title)}</h2><p>${esc(x?.body)}</p></div>`;
      return `${s.headline ? h("title small") : ""}<div class="cols">${side(s.left, "l")}${side(s.right, "r")}</div>`;
    }
    case "quote":
      return `${s.body && s.headline ? kicker(s.headline) : ""}<div class="qmark">&ldquo;</div><p class="quote">${esc(s.body ?? s.headline)}</p>${s.sub ? `<p class="attr">${esc(s.sub)}</p>` : ""}`;
    case "list":
      return `${kicker(s.kicker)}${h()}
        <ul class="list">${(s.items ?? []).slice(0, 3).map((c) => `<li><b>&mdash;</b><span>${esc(c)}</span></li>`).join("")}</ul>`;
    case "cta": {
      const contact = s.contact ?? brand.cta?.contact;
      return `${h("hook cta")}${p("sub", s.sub)}${s.button ? `<span class="btn">${esc(s.button)}</span>` : ""}${contact ? p("contact", contact) : ""}`;
    }
  }
}

export function slideHtml(slide, index, total, brand) {
  const kind = slide.kind;
  if (!(kind in BG)) throw new Error(`unknown slide kind: ${kind}`);
  const bg = BG[kind];
  const logoW = brand.logos.width_px[kind === "cover" || kind === "cta" ? kind : "content"];
  const logo = brand.logos[LOGO[bg]];
  return `<section class="slide ${bg}" id="slide-${pad(index + 1)}" data-kind="${kind}" data-bg="${bg}">
  <header><img class="logo" src="${esc(logo)}" style="width:${logoW}px" alt=""><span class="pager">${index + 1}/${total}</span></header>
  <main>${body(kind, slide, brand)}</main>
</section>`;
}

export function pageHtml(sections, brand, brandDir, opts = {}) {
  const c = brand.palette, f = brand.fonts, W = brand.canvas.width, H = brand.canvas.height, m = brand.layout.margin_px;
  const sz = f.sizes_px, w = f.weights;
  const fontUrl = pathToFileURL(join(brandDir, f.file)).href;
  const baseUrl = pathToFileURL(brandDir + "/").href;
  const btn = brand.cta?.button ?? { bg: c.background_dark, fg: c.text_on_dark };
  const css = `
@font-face{font-family:"${f.family}";src:url("${fontUrl}");font-weight:100 900;font-display:block}
:root{--dark:${c.background_dark};--light:${c.background_light};--accent:${c.accent};--ton-dark:${c.text_on_dark};--ton-light:${c.text_on_light};--muted:${c.muted};--card:${c.card};--btn-bg:${btn.bg};--btn-fg:${btn.fg}}
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:var(--dark)}
body{font-family:"${f.family}",sans-serif;font-weight:${w.body};font-size:${sz.body[0]}px;line-height:1.3}
.slide{position:relative;width:${W}px;height:${H}px;padding:${m}px;display:flex;flex-direction:column;overflow:hidden;page-break-after:always}
.slide.dark{background:var(--dark);color:var(--ton-dark)}
.slide.light{background:var(--light);color:var(--ton-light)}
.slide.accent{background:var(--accent);color:var(--ton-light)}
header{display:flex;justify-content:space-between;align-items:center;height:110px;flex:none}
.logo{display:block;height:auto}
.pager{font-size:${sz.caption[0]}px;font-weight:${w.body}}
.dark .pager{color:var(--muted)}
main{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:36px;padding-bottom:30px}
h1,h2,p{margin:0}
h1{font-weight:${w.title};line-height:1.08;letter-spacing:-.01em}
.light h1{line-height:1.18}
h1.hook{font-size:${sz.hook[0]}px}
h1.title{font-size:${sz.title[1]}px}
h1.title.small{font-size:${sz.title[0]}px}
.sub,.text{font-size:${sz.body[1]}px}
.dark .sub,.dark .text{color:var(--muted)}
.hl{padding:0 .12em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.dark .hl{color:var(--accent);padding:0}
.light .hl{background:var(--accent);color:var(--ton-light)}
.accent .hl{background:var(--dark);color:var(--ton-dark)}
.pill,.kicker{align-self:flex-start;font-size:${sz.caption[1]}px;font-weight:${w.body}}
.pill{background:var(--accent);color:var(--ton-light);padding:10px 28px;border-radius:999px}
.dark .kicker{color:var(--accent)}
.light .kicker{border-bottom:6px solid var(--accent);padding-bottom:8px}
.cards{display:flex;flex-direction:column;gap:24px}
.card{background:var(--card);color:var(--ton-light);border-radius:24px;padding:30px 36px;display:flex;gap:28px;align-items:center;font-size:${sz.body[1]}px}
.tick{flex:none;width:22px;height:22px;border-radius:50%;background:var(--accent)}
.statval{font-size:${sz.hook[1]}px;font-weight:${w.title};line-height:1;color:var(--accent)}
.cols{display:flex;gap:28px}
.cols .card{flex:1;flex-direction:column;align-items:flex-start;gap:20px}
.cols h2{font-size:${sz.body[1]}px;font-weight:${w.title};line-height:1.1}
.cols p{font-size:${sz.body[0]}px}
.cols .r{background:var(--accent)}
.qmark{font-size:${sz.hook[1]}px;font-weight:${w.title};color:var(--accent);line-height:.6;height:70px}
.quote{font-size:${sz.title[0]}px;font-weight:${w.title};line-height:1.2}
.attr{font-size:${sz.body[0]}px;color:var(--muted)}
.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:36px}
.list li{display:flex;gap:28px;font-size:${sz.body[1]}px}
.list b{flex:none;font-weight:${w.title}}
.btn{align-self:flex-start;background:var(--btn-bg);color:var(--btn-fg);font-size:${sz.body[0]}px;font-weight:${w.title};padding:26px 56px;border-radius:999px}
.contact{font-size:${sz.body[0]}px}
.thumbs{display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:#fff}
.thumbs img{width:270px;height:auto;display:block}
@page{size:${W}px ${H}px;margin:0}`;
  const script = opts.measure ? `<script>${opts.measureScript ?? MEASURE_SCRIPT}</script>` : "";
  return `<!doctype html>
<html lang="${esc(brand.language)}"><head><meta charset="utf-8"><base href="${baseUrl}">
<meta name="viewport" content="width=${W}"><title>${esc(brand.name)} carousel</title>
<style>${css}</style></head>
<body>
${sections.join("\n")}
${script}
</body></html>`;
}
