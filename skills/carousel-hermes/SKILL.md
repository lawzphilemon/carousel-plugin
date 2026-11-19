---
name: carousel-plugin
description: "Use when making carousels with the carousel-plugin engine."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [carousel, render, instagram, repliz, chrome, node]
    related_skills: [ahwy-carousel, repliz-integration, social-media-ops]
---

# carousel-plugin engine

`github.com/lawzphilemon/carousel-plugin` turns a topic + `brand.json` into Instagram/LinkedIn carousel
slides (PNG) plus a caption, and builds the Repliz schedule payload. Zero npm dependencies, Node 20+,
and a local Chrome/Chromium for rendering.

**Only `engine/cli.mjs` runs under Hermes.** `commands/`, `agents/` and `.claude-plugin/` are Claude
Code surfaces; drive the engine from the CLI (or a thin skill over it) and do not try to load the
plugin the Claude way.

## When to Use

- The user asks for Instagram/LinkedIn carousel slides, a caption, or a carousel batch for a brand.
- Carousel output must follow a brand profile (palette, fonts, word limits, compliance rules) rather than one-off styling.
- The slides need to end up scheduled or drafted on Repliz with a per-slide PNG payload.
- Not for video/motion reels (use the Remotion/ffmpeg path) and not for a one-off single image.

## Install

Chrome without apt or snap — `chrome-headless-shell` is a single binary and needs no extra libs:

```bash
bash scripts/install-chrome-headless-shell.sh ~/.hermes/tools/chrome-headless-shell
export CHROME_PATH=~/.hermes/tools/chrome-headless-shell/chrome-headless-shell
```

The engine looks for `CHROME_PATH`, else a hardcoded list of system paths (`/usr/bin/chromium`,
`google-chrome`, macOS/Windows defaults). Pass `--chrome <path>` per command if neither is set.

## Project pipeline (the status machine enforces the order)

Status is forward-only: `draft → copy_approved → rendered → caption_approved → scheduled`.

```bash
W=~/work/carousel          # workspace holding brands/ and carousel-output/
R=<repo>
cd $R
node engine/cli.mjs new    --brand <slug> --topic "<topic>" --out $W/carousel-output --brands $W/brands
# write copy.json (slides[], caption, brand, platform) into the new project dir
node engine/cli.mjs lint   --stage text --project P --brands $W/brands      # writes lint-text.json
node engine/cli.mjs meta   --project P --status copy_approved              # render refuses while draft
node engine/cli.mjs render --project P --brands $W/brands                  # slides/slide-NN.png
node engine/cli.mjs lint   --stage visual --project P --brands $W/brands    # overflow + 4.5:1 contrast
node engine/cli.mjs publish-payload --project P --brands $W/brands \
     --account <repliz-account-id> --at "YYYY-MM-DD HH:MM" [--live]        # dry run, prints JSON
```

`status`, `meta`, `knowledge`, `sheet-row` round out the eight commands. Every command prints JSON on
stdout and a summary on stderr; exit 1 means issues.

## Brand profile

`brands/<slug>/brand.json` plus `fonts/` and `logos/` beside it. Brand data is deliberately **not** in
the repo — copy `examples/acme/` as the starting point (bundled Montserrat is OFL-licensed). The file
carries canvas size, palette and contrast pairs, font file + weight/size ranges, layout margins and
word limits, voice rules, `hard_rules` (no prices, claims need sources, blocked client names),
per-platform slide limits and optional sheet `tracking`. One engine, one profile per brand — this is
what keeps each brand's compliance rules out of the code.

## Measured on the 2 vCPU / 3.6 GB VPS

| Operation | Wall time | Peak RSS |
|---|---|---|
| render 7 slides | 2.8 s | 113 MB (node) |
| visual lint 7 slides | 1.9 s | 105 MB |

Output 1080×1350 PNG, ~60 KB/slide. Chrome is spawned **per slide** (one screenshot each, plus a DOM
dump per slide for visual lint), so cost scales linearly with slide count and each launch spikes
memory transiently. **Run one render at a time** on this box: it has ~300 MB free with swap already in
use, and two concurrent renders push it into swap thrash. Render as a subprocess, not inside the
gateway session — a gateway restart mid-render kills it.

## News-to-carousel flow (Roroy)

- Google News RSS links resolve to the publisher page. If the browser hits a Cloudflare wall, use `web_extract` on the same URL for the article text; facts still come only from that page.
- `new` creates only `meta.json` + `slides/`. Write `copy.json` yourself (pattern: copy an earlier project's `copy.json` in the same brand folder).
- Text lint scans every number in the caption, including digits inside a pasted URL (article IDs, date paths). A matching `claims[]` entry does not exempt the URL. Keep the full URL only in `claims[].url`; the caption source line names the publisher and date in words. Slide body numbers still need a `claims[].text` that contains the same digits.
- Lawrence cannot open VPS folders and may ask for the copy. Export copy as `<code>-copy.md` and send via `hermes -p roroy send --to discord:<channel> "... MEDIA:/path"` (one file per command).
- After copy approval: `meta --status copy_approved`, render with `CAROUSEL_CHROME_MODE=cdp --chrome <chromium path>` one project at a time, `lint --stage visual`, view at least one slide, then send every slide PNG to Discord. Stop there; caption approval and Repliz scheduling are separate gates.

## Matching a user's visual reference (series style)

- When the user sends a reference screenshot and says "follow the design language, not a template", add a series mode to `engine/lib/layouts.mjs` keyed by a `series` field in `copy.json` (`lint-visual.mjs` must inject `brand.series` from `copy.json` too). Do not hardcode one layout. Break the reference into elements (bg, logo, pager pill, eyebrow, headline with one accent phrase, footer source, ghost numeral, numbered cards, before/after boxes, CTA pill) and map each slide kind to them.
- Kabarsosmed compare boxes: stack title over body, never a long uppercase sentence beside the title. Letter-spacing .04em (max .06em), gap 20px, padding 40px 48px, both boxes fixed height 240px, content top-aligned. A min-height plus space-between leaves the short box looking shorter and pushes its text to the edges. Visual lint does not catch this. Full design language: `references/gwenchana-kabarsosmed-lessons.md` and `clients/gwenchana/carousel-design.md`.
- Visual lint passing is NOT proof of fidelity. It missed clipped text and overlap. Check every slide full-size with vision, and crop (`region`) text-heavy areas; contact-sheet reads are unreliable (OCR errors, false "missing" claims). Verify against the full-size PNG before acting on or reporting a defect.
- Render literals must be brand palette colors (`#000`, `#D0D0D0`, `transparent` fail lint). Decorative oversize glyphs as DOM elements fail overflow/margin/font-size/weight lint. Use a `::after{content:attr(data-n)}` pseudo-element, and disable it on slide kinds with dense content (points, compare), because it overprints text.
- Visual lint needs explicit `--chrome <path>` even when `CAROUSEL_CHROME_MODE=cdp` is set for render. After editing `copy.json`, re-run `lint --stage text` before render.
- Before showing copy, proofread items for duplicated words. After a user says "kok beda", audit all slides, not one, and say plainly which slides were not re-verified.

## Scheduling to Repliz (after caption_approved)

1. Write `caption.txt` from the approved caption, re-run `lint --stage text`, then `meta --status caption_approved`. If it answers `slides are older than copy.json`, re-run `render` + `lint --stage visual` first.
2. Upload each slide as JPEG (convert PNG, q95; TikTok rejects PNG) to Repliz Storage: `POST /public/storage/file/init` `{filename,size,mimetype}` -> PUT presigned URL (no Authorization header, same Content-Type) -> `POST /public/storage/file/{id}/complete` (204). Never Imgur/catbox. Write the public URLs as a JSON array to `<project>/uploads.json` (length must equal the number of `slides/slide-*.png`). Details: `repliz-integration` references.
3. Account flag needs the Repliz account ID, not the name: `GET /public/account?page=1&limit=50`.
4. `publish-payload --account <ID> --at "YYYY-MM-DD HH:mm"` (local brand timezone, space separator; ISO `T` is rejected). Prints the payload with `isDraft: true` unless `--live`.
5. `POST /public/schedule` with that payload (Basic auth from `REPLIZ_BASIC_AUTH`) -> 201 `{scheduleId}`. Do not `source` the whole `.env` (not shell-valid); extract the one var with `grep ^NAME= | cut -d= -f2-`.
6. `meta --status scheduled --account <ID> --schedule-id <id> --schedule-at <ISO UTC, e.g. 2026-11-12T12:00:00Z>`.
7. Draft stays draft: the user activates it in Repliz or approves going live explicitly. When the user already approved scheduling and named the account, pick the slot and post live. Do not stop to ask for a time.
8. Before choosing a time, list pending schedules for that account and skip occupied hours. Prefer the brand's usual hours (Gwenchana 10.00 and 19.00). Put the most perishable news first. Say the slot and the reason after it is booked, not as a question.

## Gwenchana keyword `diskusi`

Caption Gwenchana yang memakai keyword `diskusi` selalu menempel automation Repliz yang sudah ada. Jangan buat automation baru, jangan tanya ulang.

- `templateId`: `6af7c150196cb78532df7b3a`. Field top-level pada body `POST /public/schedule`, bukan di dalam `additionalInfo`.
- Akun: `6a60cba762caae1e04e96bee` (@gwenchana.agency).
- Alur sudah aktif: komentar `diskusi` → balasan komentar + DM → tombol WhatsApp +62 812-4466-5885, prefill general. Tanpa janji waktu balas.
- Pasang saat jadwal, bukan saat copy. Tetap butuh `setuju <kode>` sebelum POST.
- `scripts/schedule.py` menyuntik `templateId` itu bila brand `gwenchana` dan caption memuat `diskusi`, setelah `publish-payload` dan sebelum `payload.json` ditulis. Kalau skrip tidak menyuntik, set field itu pada payload sebelum POST.
- GET `/public/schedule/:id` tidak mengembalikan `templateId` meski POST mengirimnya. Verifikasi objek `automation`: `reply.isActive` + keyword `Diskusi`, dan `message.isActive` + tombol WhatsApp. Jangan anggap kosongnya `templateId` berarti automation tidak menempel.

## Pitfalls

- **`render` refuses on `draft`** with `status is "draft"; render needs copy_approved`. Set the status
  with `meta --status copy_approved` after a passing text lint; `lint-text.json` must be newer than
  `copy.json` or the gate fails again.
- **Visual lint on un-rendered slides reports ~7 bogus issues.** They are missing PNGs, not layout
  defects. Render first, then lint.
- **`lint --self-check --brand <slug> --brands <dir>` resolves the brand differently from `new`** and
  can answer `brand.json not found` for a profile the other commands accept. Validate through a real
  project instead of trusting that flag.
- **PNG only.** No video or motion; reels stay on Remotion/ffmpeg.
- **Ship the font inside the brand folder.** The render uses the font file named in `brand.json`; the
  system font list is irrelevant and a missing file falls back silently to a default face.
- **Publishing stays human-gated** (copy → caption → schedule). Build the payload with
  `publish-payload`; sending needs Repliz MCP or the REST schedule call from `repliz-integration`.
