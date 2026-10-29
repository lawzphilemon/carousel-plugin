# Carousel plugin: design

Date: 2026-10-29. Status: implemented in 0.1.0. Working name: `carousel-plugin` (public repo, Claude Code plugin).

## 1. Goal

Turn a topic into a batch of brand-correct social carousels and schedule them as drafts on Repliz, with the user approving at fixed gates. It must work for many brands without any brand data living in the public repo.

Success means:
- One command turns "topic + count + brand" into N rendered carousels (PNG slides plus caption) that pass an automatic rule check against the brand's own rules.
- The user reviews copy before render and caption before publish; nothing is scheduled without an explicit yes on account, date and time.
- Adding a brand means adding one private `brand.json` plus its assets, never editing the plugin.

## 2. Non-goals

- Converting an existing post into a carousel (an existing carousel converter plugin already does that). This plugin is topic-driven.
- Video, Reels, Stories, single images.
- A Google Sheet queue (deferred; `/carousel:make` can be wrapped later).
- Bundling third-party copywriting frameworks (see section 7).
- Analytics or performance tracking.

## 3. Public / private boundary

| Public repo (this plugin) | Private, in the user's workspace |
|---|---|
| Engine (`render`, `lint`), layouts, commands, skills | `brands/<brand-slug>/brand.json` |
| Generic carousel writing guide (written for this plugin) | Brand fonts, logos, watermark files |
| One fictional example brand (`examples/acme/`) | Real client names, contacts, claims, sources |
| Tests and fixtures with fictional data | `carousel-output/` (generated slides, captions) |

Rules:
- No real brand, client, contact detail or price appears in the repo, tests, README or examples.
- CTA contact details (phone, email, link) have no default. The plugin asks for them per campaign.
- Third-party framework content (wtf-hook-999, HookLab, creator-os) is never copied in.

## 4. Commands

### 4.1 `/carousel:brand`
Creates or updates `brands/<slug>/brand.json`. Two entry modes:
1. Short interview (palette, fonts, logos, voice, hard rules, CTA, pillars).
2. Import from a brand guideline PDF or document the user points at: the agent reads it, proposes a filled `brand.json`, lists every field it inferred vs. found stated, and the user confirms. The engine never parses PDFs.

Ends by running `lint --self-check` on the profile (every referenced file exists, contrast pairs pass).

### 4.2 `/carousel:make "<topic>" --brand <slug> --count N [--slides S]`
Stages, with gates:
1. **Context**: load `brand.json`; ask only what is missing (angle, audience, facts and sources the user wants used, CTA contact for this campaign).
2. **Copy**: write N `copy.json` drafts (hook, slides, caption draft) using the knowledge layer (section 7). Claims without a source supplied by the user are marked `needs_confirmation`, never invented. **Gate 1: user approves copy.**
3. **Lint (text)**: `engine/cli.mjs lint --stage text`. Fix and re-run until it passes.
4. **Render**: `engine/cli.mjs render` produces `slides/slide-NN.png`.
5. **Lint (visual)**: `engine/cli.mjs lint --stage visual`; writes `verification.json`. Must pass.
6. **Caption**: finalize `caption.txt` per carousel. **Gate 2: user approves caption and looks at the contact sheet.**

### 4.3 `/carousel:publish <project> [--draft]`
Section 9. Default is draft; scheduling live requires an explicit yes.

### 4.4 Engine CLI
`engine/cli.mjs` has seven commands: `lint`, `render`, `new`, `knowledge`, `publish-payload`, `status`, `meta`. `status` prints a project's `meta.json` status and verification result. Status and Repliz field updates go through `meta`, never by hand-editing `meta.json`.

## 5. Brand profile (`brand.json`)

Stored privately at `brands/<slug>/brand.json`; assets beside it. Schema (all keys required unless marked optional):

```json
{
  "slug": "acme",
  "name": "Acme Co",
  "handle": "@acme",
  "language": "id",
  "timezone": "Asia/Jakarta",
  "canvas": { "width": 1080, "height": 1350 },
  "palette": {
    "background_dark": "#1D1D1D", "background_light": "#FFFFFF", "accent": "#FDDE5A",
    "text_on_dark": "#FFFFFF", "text_on_light": "#1D1D1D", "muted": "#9A9A9A",
    "card": "#F1F1F1", "forbidden": ["#007BFF"]
  },
  "contrast_pairs": [{ "fg": "#FDDE5A", "bg": "#1D1D1D", "min": 4.5 }],
  "fonts": {
    "family": "Montserrat",
    "file": "fonts/Montserrat-Variable.ttf",
    "weights": { "hook": 800, "title": 800, "body": 500, "caption": 500 },
    "sizes_px": { "hook": [96, 120], "title": [64, 80], "body": [38, 44], "caption": [26, 30] },
    "max_weights_per_slide": 2
  },
  "logos": {
    "on_dark": "logos/logo-color.png", "on_light": "logos/logo-dark.png", "on_accent": "logos/logo-dark.png",
    "width_px": { "cover": 360, "content": 200, "cta": 360 },
    "min_width_px": 160
  },
  "layout": { "margin_px": 80, "max_body_words": 35, "max_headline_words": 9, "slides": [5, 10] },
  "voice": {
    "pov": "we",
    "address": { "instagram": "kamu", "linkedin": "Anda" },
    "tone": "semi-formal, consultative, plain business language",
    "use": ["strategi", "terukur"],
    "avoid": ["dijamin", "pasti", "terbaik", "murah", "diskon"],
    "acronyms": ["SEO", "ROAS"],
    "emoji_max": { "instagram": 1, "linkedin": 0 },
    "exclamation": false, "all_caps_emphasis": false,
    "caption_formula": ["hook", "body", "proof", "cta"]
  },
  "hard_rules": {
    "no_prices": true,
    "claims_need_source": true,
    "no_client_names": true, "client_name_blocklist": [],
    "headline_case": "sentence", "headline_ends_with_period": true
  },
  "cta": {
    "standard": [{ "pillar": "ads", "line": "Want ads with clear results? Tell us your target." }],
    "button": { "label_style": "verb-first, 2-3 words", "bg": "#1D1D1D", "fg": "#FFFFFF" },
    "contact": null
  },
  "pillars": [{ "id": "ads", "label": "Ads", "share": 0.3 }],
  "knowledge": { "hook": ["wtf-hook-999"], "script": ["creator-os"], "humanizer": ["humanizer-id"] },
  "platforms": { "instagram": { "max_slides": 20 }, "linkedin": { "max_slides": 20 } }
}
```

`timezone` is an IANA zone name and is required; schedule times are entered in it and converted to UTC. `voice.acronyms` lists all-caps words that are allowed and do not count as all-caps emphasis. `contact` stays `null` until a campaign sets it. Values above are illustrative; the shipped example uses a fictional brand.

## 6. Engine

Node ESM, no runtime dependencies. Chrome (installed locally) does the rendering.

### 6.1 `engine/cli.mjs render`
- Input: `copy.json` (approved), `brand.json`. Output: `slides/slide-NN.png` and an editable `carousel.html`.
- Layout kinds: `cover`, `statement`, `points`, `stat`, `compare`, `quote`, `list`, `cta`. The copy stage assigns a kind per slide from its content; the renderer maps kind plus brand tokens to HTML/CSS. Nothing is hardcoded to a brand: colors, fonts, logo choice per background (`on_dark` / `on_light` / `on_accent`), sizes and margins all come from the profile.
- Accent rule: at most one highlighted phrase per slide. On light backgrounds the highlight is a filled block behind dark text, never accent-colored text, unless a contrast pair allows it.
- If the brand font file is missing, render stops with an error naming the file. It never falls back to a system font.
- Chrome is found via `--chrome`, `CHROME_PATH`, or standard install paths. Slides render at `--force-device-scale-factor=1`.

### 6.2 `engine/cli.mjs lint`
Stage `text` (runs on `copy.json`):
- forbidden words (`voice.avoid`), price patterns when `no_prices`, exclamation marks, all-caps emphasis, emoji count per platform, headline length and case and final period, body word limit, address form (the `address` rule: when `voice.address` differs between platforms, flag the address word configured for another platform; skipped when all platforms use the same word), client-name blocklist.
- A numeric claim is a number with `%`, `x`, a currency or a magnitude word (`juta`, `ribu`, `jt`, `rb`, `k`, `million`, `billion`), a four-digit year, or any number of 4+ digits. Plain integers 0-999 without units are exempt.
- Every numeric claim must carry a `source` and `date` field; otherwise the slide fails.
- Slide count within `layout.slides` and the target platform's `max_slides`.

Stage `visual` (runs on rendered output; writes `verification.json`):
- PNG dimensions equal `canvas`; numbering consistent.
- No element overflows its slide; margin at least `layout.margin_px`.
- Font size within the configured range; at most `max_weights_per_slide` weights.
- Contrast pairs used on the slide meet `contrast_pairs` minimums.
- Logo present once, width at least `logos.min_width_px`, correct variant for its background.
- Only palette colors used; no `palette.forbidden` colors.

`--self-check` validates a `brand.json` itself (files exist, contrast pairs pass, required keys present).

## 7. Knowledge layer

Three tiers, resolved per brand through `brand.json.knowledge`:
1. **Bundled craft guide** (`skills/carousel-craft/`, written for this plugin, always on): hook selection by angle, one idea per slide, slide anatomy (hook, problem, points, proof, CTA), swipe rhythm, CTA patterns, caption formula. Fallback when nothing else is installed.
2. **Optional installed skills**, named in `brand.json`: if present on the user's machine (for example a hook framework or a creator-workflow skill), the copy stage invokes them for hook generation and audit and for script structure. If a named skill is not installed the stage falls back to tier 1 and says so in one line.
3. **Humanizer pass** as the final text step when a skill is named for the brand's language.

Topic facts come from sources the user supplies or from research done in-session; unsourced claims are flagged `needs_confirmation` and block the text lint until resolved or removed.

No third-party framework text is stored in this repo.

## 8. Output layout

```
carousel-output/<brand-slug>/CAR-YYMMDD-XXXX_<slug>/
  copy.json          approved copy, per slide: kind, kicker, headline, body, sources
  caption.txt
  carousel.html      editable source of the render
  slides/slide-NN.png
  verification.json  lint + render checks
  meta.json
```

`meta.json`:
```json
{ "code": "CAR-261030-A1B2", "kind": "Carousel", "brand": "acme", "topic": "three numbers to check before raising ad budget",
  "status": "draft|copy_approved|rendered|caption_approved|scheduled",
  "created": "2026-10-30", "repliz": { "account": null, "schedule_id": null, "schedule_at": null } }
```
A batch of N carousels creates N sibling folders. `carousel-output/` is gitignored by default.

## 9. Repliz publish

Uses the Repliz MCP tools; the plugin adds no HTTP client.
1. Pre-check: `verification.json` passes and status is `caption_approved`.
2. Upload each PNG: `repliz_init_file` -> `repliz_upload_file` -> `repliz_complete_file`; collect the public URLs. Uploads are staging only: they hold the files for scheduling and publish nothing. Abort the batch if any upload fails or returns no URL.
3. Ask for the account (listed via `repliz_list_accounts`, filtered by platform), date and time per carousel. Stagger: no two posts share an account, date and time. Times are entered in the user's timezone and converted to UTC ISO 8601.
4. Show a summary (account, slide count, caption head, scheduled time). **Gate 3: explicit yes.**
5. `repliz_create_schedule` with `type: "album"`, `medias` in slide order, `description` = caption, `additionalInfo.isDraft: true` by default. Live scheduling only if the user says so for that batch.
6. Read back with `repliz_get_schedule`, write the id and time to `meta.json`, set status `scheduled`.

Never schedule to an account the user did not name in this session.

## 10. Repo layout

```
.claude-plugin/plugin.json
commands/brand.md  make.md  publish.md
skills/carousel-craft/SKILL.md   (+ references/)
engine/cli.mjs  render.mjs  lib/*.mjs (layouts.mjs, lint-text.mjs, lint-visual.mjs, ...)
examples/acme/brand.json  (+ fictional assets)
tests/                    node --test
docs/superpowers/specs/
README.md  LICENSE  CHANGELOG.md
```

## 11. Testing

- `node --test` unit tests for lint rules (one passing and one failing fixture per rule) and for contrast and word-count helpers.
- Render test: render the fictional brand's fixture copy, assert every PNG is exactly the canvas size, and that a deliberately overflowing fixture fails `visual` lint.
- `--self-check` test with a broken profile (missing font file) expects a clear error.
- `publish-payload` is the dry-run payload builder: it builds the full Repliz request without calling any tool; tests assert the payload shape (album type, ordered medias, isDraft true, UTC time).
- Repo scan test: fails if any blocklisted real brand name appears in tracked files.

## 12. Risks and open items

- **Name**: `carousel-plugin` is a working name; decide before the first release.
- **Fonts**: the example brand must use an open-licensed font; users supply their own brand fonts privately.
- **Platform limits** (max slides, caption length) change; they live in `brand.json.platforms` so they can be updated without a release. Check current limits before first publish.
- **Repliz media URLs**: the plan assumes URLs from `repliz_init_file` are accepted by `create_schedule` for Instagram albums. Verify with one draft on a test account before relying on it.
- **Layout variety vs. consistency**: layouts vary by slide kind but follow one brand look; if reviewers want more variety, add layout kinds, not per-run randomness.
- **PDF import** quality depends on the guideline document; the confirm step in `/carousel:brand` is the safeguard.
