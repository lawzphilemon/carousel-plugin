# Carousel Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public Claude Code plugin that turns a topic into brand-correct carousels (PNG + caption) checked against a private per-brand rule profile, and schedules them as Repliz drafts behind explicit user gates.

**Architecture:** A zero-dependency Node ESM engine (`engine/`) does the deterministic work: brand profile validation, text and visual lint, HTML-to-PNG render through local Chrome, project folders, knowledge resolution, and Repliz payload building. Three slash commands (`commands/*.md`) and one craft skill drive the agent through the gated workflow and call the engine CLI. Repliz is reached only through the existing Repliz MCP tools by the agent; the engine only builds and validates payloads.

**Tech Stack:** Node 20+ (ESM, `node:test`, no npm dependencies), Chrome/Chromium installed locally, Markdown commands and skills.

**Spec:** `docs/superpowers/specs/2026-10-29-carousel-plugin-design.md`

## Global Constraints

- Repo root: the repository root. All paths below are relative to it.
- No runtime npm dependencies. Tests run with `node --test`.
- No real brand, client, contact detail or price anywhere in tracked files. Only the fictional brand `acme` (spec section 3).
- CTA `contact` has no default; it stays `null` until a campaign sets it.
- No third-party framework text (wtf-hook-999, HookLab, creator-os) in the repo.
- Missing brand font makes render fail with an error naming the file; never a silent system-font fallback.
- Output layout: `carousel-output/<brand-slug>/CAR-YYMMDD-XXXX_<slug>/` with `copy.json`, `caption.txt`, `carousel.html`, `slides/slide-NN.png`, `verification.json`, `meta.json`. `carousel-output/` and `brands/` are gitignored.
- Repliz album payload: `type: "album"`, `medias` as `{type:"image", url}` in slide order, `additionalInfo.isDraft: true` unless live is requested, `scheduleAt` in UTC ISO 8601.
- Two clarifications to the spec, adopted here and to be mirrored into the spec in Task 12: (a) `brand.json` gains `timezone` (IANA string) and `voice.acronyms` (array of all-caps words that are allowed); (b) a "numeric claim" means a number with `%`, `x`, a currency or magnitude word (`juta`, `ribu`, `jt`, `rb`, `k`, `million`, `billion`) , a four-digit year, or any number of 4+ digits; plain integers 0-999 without units (such as "3 angka") are exempt.

### Shared data shapes (used by several tasks)

`copy.json`:
```json
{ "code": "CAR-261030-A1B2", "brand": "acme", "topic": "string", "platform": "instagram",
  "slides": [ { "kind": "cover|statement|points|stat|compare|quote|list|cta",
                "pill": "string?", "kicker": "string?", "headline": "string", "sub": "string?",
                "body": "string?", "accent": "substring of headline?", "check": "string?",
                "items": ["string?"], "stat": {"value": "string", "label": "string"},
                "left": {"title": "string", "body": "string"}, "right": {"title": "string", "body": "string"},
                "button": "string?", "contact": "string? (cta slide only)", "needs_confirmation": false,
                "claims": [ { "text": "string", "source": "string", "date": "YYYY-MM-DD" } ] } ],
  "caption": "string" }
```
`Issue` (returned by every lint function): `{ slide: number | null, rule: string, message: string }`; `slide` is 1-based, `null` for whole-carousel issues.

## Review Focus

- Acronyms (ROAS, SEO) must not trip the all-caps rule; a shouted word must. Pinned in Task 2.
- Prices written as `Rp 1,5 juta`, `1.5jt`, `$20`, `Rp500rb` must be caught; ordinary text with the letters "rp" must not. Pinned in Task 2.
- A local time like `2026-11-03 00:30` in `Asia/Jakarta` must convert to the previous UTC day. Pinned in Task 9.
- Headline word count must ignore trailing punctuation and treat hyphenated words as one; a 10-word headline fails, 9 passes. Pinned in Task 4.
- A slide whose text overflows the canvas must fail visual lint even when the PNG size is right. Pinned in Tasks 6 and 7.
- Missing logo, font or palette file in a profile must produce a named error, not a crash. Pinned in Task 3.

---

### Task 1: Repo scaffold and fictional example brand

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE` (MIT), `.claude-plugin/plugin.json`, `README.md` (stub), `CHANGELOG.md`
- Create: `examples/acme/brand.json`, `examples/acme/logos/logo-on-dark.png`, `examples/acme/logos/logo-on-light.png`, `examples/acme/fonts/Montserrat-Variable.ttf`, `examples/acme/fonts/OFL.txt`
- Test: `tests/scaffold.test.mjs`

**Interfaces:**
- Produces: `examples/acme/brand.json` valid against the spec section 5 schema plus the two additions (`timezone: "Asia/Jakarta"`, `voice.acronyms: ["ROAS","SEO","CTR","ROI"]`). Palette: `background_dark #14213D`, `background_light #FFFFFF`, `accent #FCA311`, `text_on_dark #FFFFFF`, `text_on_light #14213D`, `muted #A8B0BF`, `card #F1F3F7`, `forbidden ["#FF0000"]`; `contrast_pairs` for accent on dark (min 4.5), white on dark (4.5), dark on white (4.5). Logos `on_dark`, `on_light`, `on_accent` (= on_light file). Font family Montserrat, `file: "fonts/Montserrat-Variable.ttf"`, weights `{hook:800,title:800,body:500,caption:500}`, sizes `{hook:[96,120],title:[64,80],body:[38,44],caption:[26,30]}`, `max_weights_per_slide: 2`. `canvas {1080,1350}`, `layout {margin_px:80,max_body_words:35,max_headline_words:9,slides:[5,10]}`. `voice.address {instagram:"you", linkedin:"you"}`, `avoid ["guaranteed","cheapest","discount"]`, `emoji_max {instagram:1, linkedin:0}`, `hard_rules` with `no_prices:true`, `claims_need_source:true`, `client_name_blocklist:["Globex"]`, `headline_ends_with_period:true`, `headline_case:"sentence"`. `cta.standard` has one `ads` line, `cta.contact: null`. `platforms {instagram:{max_slides:20}, linkedin:{max_slides:20}}`. `knowledge {hook:[], script:[], humanizer:[]}`.

- [ ] **Step 1: Write the failing test** in `tests/scaffold.test.mjs`: it reads `examples/acme/brand.json` and asserts `slug === "acme"`, `cta.contact === null`, `timezone === "Asia/Jakarta"`, every file referenced by `fonts.file` and `logos.on_dark|on_light|on_accent` exists, and `.claude-plugin/plugin.json` parses with `name === "carousel"`.
- [ ] **Step 2: Run** `node --test tests/scaffold.test.mjs`. Expected: FAIL (files missing).
- [ ] **Step 3: Create the files.** `git init` first. `package.json`: `{"name":"carousel-plugin","private":true,"type":"module","scripts":{"test":"node --test"}}`. `.gitignore` lists `carousel-output/`, `brands/`, `node_modules/`. Generate the two logo PNGs once with Pillow (text "acme" in the example palette, transparent background, about 600x260, white text for `on-dark`, navy for `on-light`); commit the PNGs, not the script. Copy Montserrat-Variable.ttf (SIL OFL) into `examples/acme/fonts/` and fetch its `OFL.txt` from the `google/fonts` repository (`ofl/montserrat/OFL.txt`) next to it.
- [ ] **Step 4: Run** `node --test tests/scaffold.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "chore: scaffold plugin repo and fictional example brand"`.

---

### Task 2: Color and text helpers

**Files:**
- Create: `engine/lib/color.mjs`, `engine/lib/text.mjs`
- Test: `tests/color.test.mjs`, `tests/text.test.mjs`

**Interfaces:**
- Produces (`color.mjs`): `hexToRgb(hex: string): [number, number, number]`; `luminance(hex: string): number` (WCAG relative luminance); `contrast(fg: string, bg: string): number` (ratio, 2 decimals max).
- Produces (`text.mjs`): `wordCount(s: string): number` (whitespace split; hyphenated word counts once; empty string is 0); `headlineWordCount(s: string): number` (same, ignoring tokens that are only punctuation); `countEmoji(s: string): number` (`\p{Extended_Pictographic}` matches); `hasExclamation(s: string): boolean`; `findShoutedWords(s: string, acronyms: string[]): string[]` (words of 2+ letters, all uppercase, not in `acronyms`); `hasPrice(s: string): boolean`; `numericClaims(s: string): string[]` (matches per the Global Constraints definition).

- [ ] **Step 1: Write failing tests.** Color: `contrast("#FFFFFF","#000000") === 21`; `contrast("#FDDE5A","#FFFFFF") < 1.5`; `contrast("#FDDE5A","#1D1D1D") > 12`. Text: `wordCount("self-driven ads work") === 3`; `countEmoji("ok 🙂 fine 🙂") === 2`; `findShoutedWords("ROAS is key, STOP now", ["ROAS"])` equals `["STOP"]`; `hasPrice` true for `"Rp 1,5 juta"`, `"1.5jt"`, `"$20"`, `"Rp500rb"` and false for `"corporate"` and `"3 angka"`; `numericClaims("naik 30% dalam 2 minggu")` equals `["30%"]`; `numericClaims("3 angka penting")` equals `[]`; `numericClaims("sejak 2024")` equals `["2024"]`.
- [ ] **Step 2: Run** `node --test tests/color.test.mjs tests/text.test.mjs`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** the signatures above in the two files. Currency detection: `Rp`, `IDR`, `$`, `USD` followed by a number, or a number followed by `jt|juta|rb|ribu|k|million|billion` as a whole token.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add engine tests && git commit -m "feat: color and text helpers"`.

---

### Task 3: Brand loader, validator and `--self-check`

**Files:**
- Create: `engine/lib/brand.mjs`
- Test: `tests/brand.test.mjs`, fixture `tests/fixtures/broken-brand/brand.json` (copy of acme with `fonts.file` pointing to a missing file and one failing contrast pair)

**Interfaces:**
- Consumes: `contrast` from `engine/lib/color.mjs`.
- Produces: `loadBrand(brandJsonPath: string): { brand: object, dir: string }` (throws `Error("brand.json not found: <path>")` or on invalid JSON with the path in the message); `validateBrand(brand: object, dir: string): string[]` returns human-readable errors; empty array means valid.
- `validateBrand` checks: required top-level keys (`slug,name,handle,language,timezone,canvas,palette,contrast_pairs,fonts,logos,layout,voice,hard_rules,cta,pillars,knowledge,platforms`); every file path in `fonts.file` and `logos.*` exists under `dir` (error text includes the relative path); every `contrast_pairs` entry meets its `min`; hex strings are `#RRGGBB`; `timezone` is accepted by `Intl.DateTimeFormat`.

- [ ] **Step 1: Write failing tests.** `validateBrand(acme, acmeDir)` equals `[]`. For the broken fixture the result contains a string including `fonts/missing.ttf` and one including `contrast`. `loadBrand` on a non-existent path throws with message containing `brand.json not found`. A brand missing `timezone` yields an error naming `timezone`.
- [ ] **Step 2: Run** `node --test tests/brand.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `loadBrand` and `validateBrand` per the checks above.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: brand profile loader and validator"`.

---

### Task 4: Text lint

**Files:**
- Create: `engine/lib/lint-text.mjs`
- Test: `tests/lint-text.test.mjs`, fixtures `tests/fixtures/copy-ok.json` and one inline failing copy per rule

**Interfaces:**
- Consumes: helpers from `text.mjs`; brand object shape from Task 1.
- Produces: `lintText(copy: object, brand: object): Issue[]`. Rule ids: `structure`, `slide-count`, `headline-words`, `headline-case`, `headline-period`, `body-words`, `forbidden-word`, `price`, `exclamation`, `all-caps`, `emoji`, `client-name`, `claim-source`, `needs-confirmation`, `address`.
- Behaviors: `slides.length` must be within `brand.layout.slides` and `brand.platforms[copy.platform].max_slides` (rule `slide-count`, `slide: null`). Headlines: word count above `layout.max_headline_words` fails; with `headline_case:"sentence"` a headline whose words after the first are Title Case (more than half capitalized, excluding acronyms) fails; `headline_ends_with_period` requires a final `.` (cover included; `cta` headlines exempt). Body: `body` word count above `layout.max_body_words` fails. Case-insensitive scan of every text field (kicker, headline, sub, body, items, left/right, stat label, button, caption) for `voice.avoid`, prices (when `hard_rules.no_prices`), `!` (when `voice.exclamation` is false), shouted words (when `all_caps_emphasis` is false, using `voice.acronyms`), emoji over `voice.emoji_max[copy.platform]` counted over the caption, and names in `hard_rules.client_name_blocklist`. Any `numericClaims` hit in headline/body/sub not contained in a `claims[].text` of that slide fails `claim-source`; each claim lacking `source` or `date` fails the same rule. A slide with `needs_confirmation: true` fails `needs-confirmation`.

- [ ] **Step 1: Write failing tests.** `copy-ok.json` (7 slides, acme-compliant, includes the acronym ROAS and "3 angka") returns `[]`. Then one test per rule id with a minimal mutation asserting the exact `rule` appears: a 10-word headline fails `headline-words` and the same headline cut to 9 words passes; `"Get a discount"` fails `forbidden-word`; `"Rp 2 juta"` fails `price`; `"Stop now!"` fails `exclamation`; `"STOP guessing"` fails `all-caps`; a caption with two emoji on instagram fails `emoji`; body containing `Globex` fails `client-name`; headline `"Naik 30% bulan ini."` with no claims fails `claim-source`, and passes once `claims:[{text:"30%",source:"internal report",date:"2026-10-01"}]` is added.
- [ ] **Step 2: Run** `node --test tests/lint-text.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `lintText(copy, brand): Issue[]` as specified. Collect all issues; do not stop at the first.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: text lint driven by brand rules"`.

---

### Task 5: Project folders and meta.json

**Files:**
- Create: `engine/lib/project.mjs`
- Test: `tests/project.test.mjs`

**Interfaces:**
- Produces: `STATUSES: string[]` = `["draft","copy_approved","rendered","caption_approved","scheduled"]`; `newCode(date?: Date, rand?: () => string): string` returning `CAR-YYMMDD-XXXX` (XXXX four uppercase hex chars; `rand` injectable for tests); `slugify(s: string): string` (lowercase, ASCII, hyphens, max 40 chars); `createProject({ outRoot, brandSlug, topic, slug?, date? }): { dir: string, meta: object }` creating `<outRoot>/<brandSlug>/<code>_<slug>/slides/` and writing `meta.json` with `{code, kind:"Carousel", brand, topic, status:"draft", created: "YYYY-MM-DD", repliz:{account:null, schedule_id:null, schedule_at:null}}`; `readMeta(dir: string): object`; `updateMeta(dir: string, patch: object): object` (shallow merge, `repliz` merged one level; throws if `patch.status` is not in `STATUSES` or moves backwards).

- [ ] **Step 1: Write failing tests** using `os.tmpdir()`: `newCode(new Date("2026-10-30T00:00:00Z"), () => "A1B2") === "CAR-261030-A1B2"`; `slugify("Ads: 3 Angka Penting!")` is `ads-3-angka-penting`; `createProject` creates `<root>/acme/CAR-..._<slug>/slides` and a parsable `meta.json` with status `draft`; `updateMeta(dir,{status:"rendered"})` works, then `updateMeta(dir,{status:"draft"})` throws; `updateMeta(dir,{status:"nope"})` throws.
- [ ] **Step 2: Run** `node --test tests/project.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions in `engine/lib/project.mjs` with `node:fs` and `node:crypto`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: project folders and meta.json"`.

---

### Task 6: Chrome, PNG size, layouts and render

**Files:**
- Create: `engine/lib/chrome.mjs`, `engine/lib/png.mjs`, `engine/lib/layouts.mjs`, `engine/render.mjs`
- Test: `tests/png.test.mjs`, `tests/layouts.test.mjs`, `tests/render.test.mjs` (render test skipped with `t.skip` when no Chrome is found)

**Interfaces:**
- Consumes: `loadBrand`/`validateBrand` (Task 3), `copy.json` shape.
- Produces (`png.mjs`): `readPngSize(path: string): { width: number, height: number }` reading the IHDR chunk; throws on a non-PNG.
- Produces (`chrome.mjs`): `findChrome(override?: string): string` (order: override, `CHROME_PATH`, standard Windows/macOS/Linux install paths; throws `Error("Chrome not found; pass --chrome or set CHROME_PATH")`); `chromeScreenshot(chrome: string, htmlPath: string, pngPath: string, size: {width:number,height:number}): void`; `chromeDom(chrome: string, htmlPath: string, size): string` (runs `--dump-dom` with `--virtual-time-budget=3000`).
- Produces (`layouts.mjs`): `slideHtml(slide: object, index: number, total: number, brand: object): string` returns one `<section class="slide" id="slide-NN" data-kind="...">`; `pageHtml(sections: string[], brand: object, brandDir: string, opts?: { measure?: boolean }): string` returns a full document with `@font-face` for `brand.fonts.file` as `file:` URL, brand CSS variables, and (when `measure`) the measurement script described in Task 7. Layout rules: logo variant chosen by the slide background (`cover`, `statement`, `quote`, `stat`, `compare` on dark use `on_dark`; `points` and `list` on light use `on_light`; `cta` on accent uses `on_accent`); logo width from `brand.logos.width_px` (`cover` and `cta` use that key, others `content`); on light backgrounds `accent` is a filled block behind dark text, on dark it is accent-colored text; at most one accented phrase per slide; page indicator `NN/TT`; `kicker` and `pill` only where the kind uses them.
- Produces (`render.mjs`): `renderProject(opts: { projectDir: string, brandsDir: string, chrome?: string }): { slides: string[] }` reads `copy.json` and the brand (`brands/<brand>/brand.json` under `brandsDir`), runs `validateBrand` and aborts with its first error, writes `html/slide-NN.html`, `carousel.html`, `slides/slide-NN.png`, and `contact-sheet.png`, asserts each PNG equals `brand.canvas` via `readPngSize`, then sets meta status `rendered`.

- [ ] **Step 1: Write failing tests.** `png.test`: a 1x1 PNG buffer written to tmp returns `{width:1,height:1}`; a text file throws. `layouts.test` (no Chrome): `slideHtml` for a cover slide contains `data-kind="cover"`, the logo `on_dark` filename, `1/7`; a points slide on light contains the `on_light` filename and a `background` rule for the accent block rather than `color:#FCA311` on the accented phrase; `pageHtml` contains the font file path and no `http` font URLs. `render.test` (needs Chrome): rendering the acme fixture copy to a tmp project yields 7 PNGs, each exactly 1080x1350, plus `contact-sheet.png`; rendering with a brand whose font file is missing throws an error containing the font path.
- [ ] **Step 2: Run** `node --test tests/png.test.mjs tests/layouts.test.mjs tests/render.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the four modules per the signatures. Eight layout kinds map to these fields: `cover` pill, headline, sub; `statement` headline, body; `points` headline, body, check (card); `stat` stat.value (accent, hook size), stat.label, body; `compare` left/right cards; `quote` body, sub as attribution; `list` headline, items (max 3, accent em dash markers, not bullets); `cta` headline and a pill button using `cta.button` colors, with no contact line unless `brand.cta.contact` is set. Contact sheet: an HTML page with all slides as `<img>` thumbnails, screenshotted by Chrome.
- [ ] **Step 4: Run** the same command. Expected: PASS (render tests skipped only if Chrome is absent; state that in the report).
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: layouts and Chrome render"`.

---

### Task 7: Visual lint

**Files:**
- Create: `engine/lib/lint-visual.mjs`, `engine/lib/measure.mjs`
- Test: `tests/lint-visual.test.mjs`

**Interfaces:**
- Consumes: brand object, `contrast`, `chromeDom`.
- Produces (`measure.mjs`): `MEASURE_SCRIPT: string` (inline JS, embedded by `pageHtml` when `measure:true`) which for each `.slide` computes a report and writes `JSON.stringify` of `{ slides: Report[] }` to `document.body.dataset.report`; `parseReport(dom: string): { slides: Report[] }` extracts it from a `--dump-dom` string. `Report` = `{ index: number, width: number, height: number, overflow: boolean, minMargin: number, fonts: {size:number, weight:number}[], colors: {fg:string, bg:string}[], logos: {src:string, width:number}[], palette: string[] }` where `overflow` is true if any descendant's bounding rect leaves the slide, `minMargin` is the smallest distance from any text element to a slide edge, `colors` are computed text and background pairs per text element, `palette` is every distinct computed color used, all as `#RRGGBB`.
- Produces (`lint-visual.mjs`): `lintVisual(report: { slides: Report[] }, brand: object, pngSizes: {width:number,height:number}[]): Issue[]` (pure, no Chrome). Rule ids: `png-size`, `overflow`, `margin`, `font-size`, `font-weights`, `contrast`, `logo`, `palette`. `runVisual(projectDir: string, brandsDir: string, chrome?: string): Issue[]` renders measure pages with `chromeDom`, calls `lintVisual`, writes `verification.json` (`{ passed: boolean, issues: Issue[], checked_at: ISO string }`) and returns issues.
- Rules: PNG size must equal `brand.canvas`; `overflow` false; `minMargin >= layout.margin_px`; each font size within the range of its role in `fonts.sizes_px` (a size outside every range fails); distinct weights per slide at most `max_weights_per_slide`; each text color/background pair must have `contrast >= 4.5` or match a `contrast_pairs` entry's own `min`; exactly one logo whose width is at least `logos.min_width_px`; every color in `palette` is in `brand.palette` values (case-insensitive) and none in `palette.forbidden`.

- [ ] **Step 1: Write failing tests** against `lintVisual` with hand-built reports: a clean report returns `[]`; an `overflow:true` report returns `overflow`; `minMargin: 40` returns `margin`; a 20px font returns `font-size`; three distinct weights return `font-weights`; accent text on white returns `contrast`; two logos returns `logo`; a `#FF0000` in palette returns `palette`; a 1080x1080 PNG size returns `png-size`. Also `parseReport` round-trips a hand-made DOM string.
- [ ] **Step 2: Run** `node --test tests/lint-visual.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules. Make sure `pageHtml(..., {measure:true})` (Task 6) embeds `MEASURE_SCRIPT`; add the import in `layouts.mjs`.
- [ ] **Step 4: Run** the test, then `node --test` to confirm Task 6 still passes. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: visual lint and verification.json"`.

---

### Task 8: Knowledge resolution

**Files:**
- Create: `engine/lib/knowledge.mjs`
- Test: `tests/knowledge.test.mjs`

**Interfaces:**
- Produces: `resolveKnowledge(brand: object, installed: string[]): { hook: { use: string[], fallback: boolean }, script: { use: string[], fallback: boolean }, humanizer: { use: string[], fallback: boolean }, notes: string[] }`. For each role (`hook`, `script`, `humanizer`) `use` is the subset of `brand.knowledge[role]` present in `installed`; `fallback` is true when `use` is empty (meaning the bundled `carousel-craft` guide is used, or no humanizer pass). `notes` has one line per configured skill that is not installed, formatted `"<skill> is not installed; using bundled guide"`, and none when nothing is configured.

- [ ] **Step 1: Write failing tests:** configured `["wtf-hook-999"]` with `installed=[]` gives `hook.fallback === true` and one note containing `wtf-hook-999 is not installed`; with `installed=["wtf-hook-999"]` gives `use` equal to `["wtf-hook-999"]`, `fallback === false`, `notes` empty; an empty `knowledge` config gives all fallbacks and empty notes.
- [ ] **Step 2: Run** `node --test tests/knowledge.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `resolveKnowledge`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: knowledge tier resolution"`.

---

### Task 9: Repliz payload builder

**Files:**
- Create: `engine/lib/publish.mjs`
- Test: `tests/publish.test.mjs`

**Interfaces:**
- Produces: `toUtcIso(localDateTime: string, timeZone: string): string` (input `YYYY-MM-DD HH:mm`, output `YYYY-MM-DDTHH:mm:00.000Z`, using `Intl.DateTimeFormat` offset resolution; throws on an unknown zone or malformed input); `checkStagger(items: { accountId: string, scheduleAt: string }[]): string[]` (one error per pair sharing account and instant); `precheck(meta: object, verification: object): string[]` (errors if `meta.status !== "caption_approved"` or `verification.passed !== true`); `buildSchedulePayload(opts: { accountId: string, caption: string, mediaUrls: string[], scheduleAt: string, live?: boolean }): object` returning `{ accountId, type: "album", description: caption, scheduleAt, medias: [{type:"image", url}...], additionalInfo: { isDraft: !live } }`; throws if `mediaUrls` is empty or any URL is not `https://`.

- [ ] **Step 1: Write failing tests:** `toUtcIso("2026-11-03 11:00","Asia/Jakarta") === "2026-11-03T04:00:00.000Z"`; `toUtcIso("2026-11-03 00:30","Asia/Jakarta") === "2026-11-02T17:30:00.000Z"`; `toUtcIso("2026-11-03 11:00","Nowhere/City")` throws; `checkStagger` returns one error for two items with the same account and instant and none when accounts differ; `precheck({status:"rendered"},{passed:true})` returns an error mentioning `caption_approved`; `buildSchedulePayload` keeps media order, sets `type` to `album` and `isDraft` true by default, and false with `live:true`; empty `mediaUrls` throws; an `http://` URL throws.
- [ ] **Step 2: Run** `node --test tests/publish.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the four functions. Offset resolution: format the candidate instant in the target zone with `Intl.DateTimeFormat` and adjust once more with the recomputed offset (two-pass) so zones with DST work.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: Repliz payload builder and checks"`.

---

### Task 10: Engine CLI

**Files:**
- Create: `engine/cli.mjs`
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: `node engine/cli.mjs <command> [flags]`; exit code 0 on success, 1 when any issue is found, 2 on usage error; JSON on stdout for machine use, one-line human summary on stderr. Commands:
  - `lint --self-check --brand <brand.json>`: `validateBrand`; prints `{ok, errors}`.
  - `lint --stage text --project <dir> --brands <dir>`: reads `copy.json`, runs `lintText`, prints `{ok, issues}`.
  - `lint --stage visual --project <dir> --brands <dir> [--chrome <path>]`: `runVisual`.
  - `render --project <dir> --brands <dir> [--chrome <path>]`: `renderProject`; refuses unless `copy.json` exists and `meta.status` is `copy_approved`.
  - `new --brand <slug> --topic <text> --out <dir>`: `createProject`; prints the project dir and code.
  - `knowledge --brand <brand.json> --installed <comma list>`: `resolveKnowledge`.
  - `publish-payload --project <dir> --brands <dir> --account <id> --at "YYYY-MM-DD HH:mm" [--live]`: reads `uploads.json` (array of public URLs written by the agent after upload), `caption.txt`, runs `precheck` against `meta.json` and `verification.json`, converts the time with the brand `timezone`, prints the payload; does not call Repliz.

- [ ] **Step 1: Write failing tests** with `child_process.spawnSync` against tmp projects: `lint --self-check` on acme exits 0 with `ok:true`, on the broken fixture exits 1 and the JSON names the missing font; `lint --stage text` on a tmp project holding `copy-ok.json` exits 0 and on a copy with `"Get a discount"` exits 1 listing `forbidden-word`; `new` creates a folder and prints a code matching `/^CAR-\d{6}-[0-9A-F]{4}$/`; `publish-payload` with status `caption_approved`, `verification.passed:true`, a 2-URL `uploads.json` prints a payload whose `type` is `album` and `scheduleAt` is UTC; the same call with status `rendered` exits 1 naming `caption_approved`; an unknown command exits 2.
- [ ] **Step 2: Run** `node --test tests/cli.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `engine/cli.mjs` with a small hand-written flag parser (no dependency).
- [ ] **Step 4: Run** `node --test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: engine CLI"`.

---

### Task 11: Commands and craft skill

**Files:**
- Create: `commands/brand.md`, `commands/make.md`, `commands/publish.md`
- Create: `skills/carousel-craft/SKILL.md`, `skills/carousel-craft/references/hooks.md`, `references/anatomy.md`, `references/captions.md`
- Test: `tests/docs.test.mjs`

**Interfaces:**
- Consumes: CLI commands from Task 10; spec sections 4, 7, 9.
- Produces: three commands with front matter (`name`, `description`, `allowed-tools`), each following the spec stage order and naming the exact CLI calls: `brand.md` (interview or document import, then `lint --self-check`); `make.md` (context, copy with Gate 1, `new`, `lint --stage text`, `render` after setting status `copy_approved`, `lint --stage visual`, caption with Gate 2, status `caption_approved`; knowledge via the `knowledge` command; unsourced numbers marked `needs_confirmation`; CTA contact always asked); `publish.md` (precheck through `publish-payload`, upload sequence `repliz_init_file` then `repliz_upload_file` then `repliz_complete_file`, write `uploads.json`, ask account/date/time per carousel, show summary, Gate 3 explicit yes, `repliz_create_schedule` as draft, read back with `repliz_get_schedule`, update meta to `scheduled`, never schedule to an account the user did not name this session). `carousel-craft` is the bundled tier-1 guide: hook selection by angle, one idea per slide, slide anatomy (hook, problem, points, proof, CTA), swipe rhythm, CTA patterns, caption formula; written originally, no third-party framework text.

- [ ] **Step 1: Write the failing test** `tests/docs.test.mjs`: every `commands/*.md` has front matter with `name` and `description`; every `node engine/cli.mjs <cmd>` string found in the commands names a command the CLI supports (parse the CLI's command list from `engine/cli.mjs` export `COMMANDS`, add that export in this task); `skills/carousel-craft/SKILL.md` exists with front matter; no file under `skills/` or `commands/` mentions `wtf-hook` or `creator-os` unless in a sentence stating that those skills are optional and not bundled; names of third-party course material are never written in the repo, so a second test reads them from the private file named by `CAROUSEL_BLOCKLIST_FILE` (one per line; skipped with a visible message when unset) and asserts none appears under `commands/` or `skills/`.
- [ ] **Step 2: Run** `node --test tests/docs.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Write the files**, and export `COMMANDS` (string array) from `engine/cli.mjs`.
- [ ] **Step 4: Run** `node --test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: commands and bundled craft guide"`.

---

### Task 12: README, repo-scan test and spec sync

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `docs/superpowers/specs/2026-10-29-carousel-plugin-design.md`
- Create: `tests/repo-scan.test.mjs`

**Interfaces:**
- Consumes: the whole repo.
- Produces: README covering install, the three commands, the brand profile and where to keep it privately, the knowledge tiers, the three gates, and requirements (Node 20+, Chrome). The spec gains the `timezone` and `voice.acronyms` fields and the numeric-claim definition from Global Constraints. `repo-scan.test.mjs` runs `git ls-files` and fails if any tracked file (excluding binaries and `examples/acme/fonts/OFL.txt`) contains an email address other than `@example.com`, a `+62` or `08`-prefixed phone number, or any name from the file named by env `CAROUSEL_BLOCKLIST_FILE` (one name per line; the test passes and notes "blocklist not set" when the variable is unset). The real blocklist stays outside the repo.

- [ ] **Step 1: Write the failing test** `tests/repo-scan.test.mjs` as described, plus an assertion that the README mentions `carousel-output` and `brand.json`.
- [ ] **Step 2: Run** `node --test tests/repo-scan.test.mjs`. Expected: FAIL (README stub).
- [ ] **Step 3: Write the README and CHANGELOG entry `0.1.0`**, update the spec, then run `node --test`.
- [ ] **Step 4: Run** `CAROUSEL_BLOCKLIST_FILE=<private file> node --test tests/repo-scan.test.mjs` once with the user's private list of real brand and client names. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "docs: README, repo scan, spec sync; release 0.1.0"`.

---

## Self-review notes

- Spec coverage: commands (T11), brand schema and self-check (T1, T3), render and layouts (T6), text and visual lint (T4, T7), knowledge tiers (T8, T11), output layout and meta (T5), Repliz flow and gates (T9, T11), testing section (all tasks; dry-run is `publish-payload`), public/private boundary (T1 gitignore, T12 scan).
- Open spec items stay open: plugin name (`carousel`, working), live Repliz verification of media URLs (one test draft on a test account before first real use), current platform slide limits.
