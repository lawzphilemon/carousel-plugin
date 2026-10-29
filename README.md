# carousel

A Claude Code plugin that turns a topic into a batch of brand-correct social carousels (PNG slides plus caption) and schedules them as drafts on Repliz. Every brand lives in one private `brand.json`; no brand data ships in this repo.

## Requirements

- Node 20 or newer. No npm dependencies.
- Local Chrome or Chromium (used for rendering and visual lint). Pass `--chrome <path>` if it is not found automatically.
- The Repliz MCP connected, only for publishing.
- The Google Sheets connector, only for sheet tracking (optional).

## Install

Clone this repo, then load it as a Claude Code plugin:

```
git clone <repo-url> carousel-plugin
claude --plugin-dir carousel-plugin
```

## Commands

| Command | What it does |
| --- | --- |
| `/carousel:brand` | Creates or updates a brand profile by short interview or by importing a guideline document, then runs the profile self-check. |
| `/carousel:make` | Topic to copy, lint, render, visual lint and caption, with two approval gates. |
| `/carousel:publish` | Uploads approved slides to Repliz and schedules them. Draft by default. Then logs the row in the brand's sheet, if it has `tracking`. |

```
/carousel:brand
/carousel:make "three numbers to check before raising ad budget" --brand acme --count 3
/carousel:publish carousel-output/acme/CAR-261030-A1B2_three-numbers
```

## The three gates

Nothing moves on without a yes from you.

1. **Copy**: you approve the written copy before anything is rendered. Claims without a source you supplied are marked `needs_confirmation`, never invented.
2. **Caption**: you approve the caption and look at the contact sheet of rendered slides.
3. **Schedule**: you name the account, date and time, see a summary, and say yes. The plugin never schedules to an account you did not name in that session.

## Brand profile

The profile lives in your own workspace, outside the plugin, at `brands/<slug>/brand.json`, with its fonts and logos beside it. Create it with `/carousel:brand`. Never commit `brands/`; the repo `.gitignore` already excludes it.

`examples/acme/brand.json` is a complete fictional profile to copy from. The example font (Montserrat) is under the SIL Open Font License; the licence text is `examples/acme/fonts/OFL.txt`, next to the font file. Keys at a glance:

- `slug`, `name`, `handle`, `language`, `timezone` (IANA, for example `Asia/Jakarta`)
- `canvas`: slide size in px
- `palette`, `contrast_pairs`: allowed colors, forbidden colors, minimum contrast per pair
- `fonts`: family, file, weights and size ranges per role
- `logos`: variant per background, width per slide kind, minimum width
- `layout`: margin, word limits, allowed slide count
- `voice`: point of view, how to address the reader per platform, tone, words to use and avoid, allowed all-caps `acronyms`, emoji limits, caption formula
- `hard_rules`: no prices, claims need a source, client-name blocklist, headline case and ending
- `cta`: standard lines per pillar, button style, and a `contact` that stays `null` (the contact is set per campaign as `contact` on the `cta` slide in `copy.json`)
- `pillars`: content themes and their share
- `knowledge`: optional skills per role (see below)
- `platforms`: slide limits per platform

## Knowledge tiers

1. **Bundled guide, always on.** The `carousel-craft` skill covers hooks, slide anatomy and captions.
2. **Optional user-installed skills.** Name them in `brand.json` under `knowledge` (`hook`, `script`, `humanizer`). They are not bundled. When one is not installed, the plugin says so and falls back to the bundled guide.
3. **Humanizer pass.** If a humanizer skill is named, the copy goes through it before lint.

## Output layout

```
carousel-output/<brand-slug>/CAR-YYMMDD-XXXX_<slug>/
  copy.json          approved copy
  caption.txt
  carousel.html      editable source of the render
  slides/slide-NN.png
  verification.json  lint and render checks
  meta.json          status, brand, topic, Repliz ids
```

Status moves forward only: `draft`, `copy_approved`, `rendered`, `caption_approved`, `scheduled`, and the engine enforces the gates. `copy_approved` and `render` need a passing `lint --stage text` newer than `copy.json`; `render` can run again from `copy_approved`, `rendered` or `caption_approved` (it resets the status to `rendered` and drops `verification.json`); `caption_approved` needs a passing visual lint plus a passing text lint newer than `caption.txt`, which is linted in place of `copy.caption`. `publish-payload` refuses when the number of uploaded URLs differs from the number of slide PNGs.

A batch of N carousels creates N sibling folders. Never commit `carousel-output/`; it is gitignored.

## Agent mode

The `carousel` agent (`agents/carousel.md`) builds carousels without asking questions and stops once for your review. Ask in plain words, for example: "make three carousels for acme about checking ad budget, CTA contact: none, no sources". It needs the brand, topic, count, CTA contact (or an explicit "no contact") and the facts with source and date (or "none").

There are two stops:

1. **Review.** If an input is missing, the agent answers `STATUS: NEEDS_INPUT` with a `MISSING:` list and does nothing else. Otherwise it builds every carousel to `caption_approved` and returns a `STATUS: REVIEW` report: contact sheet path, caption, assumptions, removed claims, open questions, and the Repliz accounts available. You ask for changes with `revise CAR-...: <notes>`.
2. **Publish.** Nothing is scheduled until you approve each carousel with exactly this line (`at` is in the brand's timezone, `account` is the Repliz account id):

```
APPROVED: CAR-261030-A1B2 account: <id> at: 2026-11-03 11:00 live: false
```

A carousel without a valid line is left untouched and reported `REFUSED`. Statuses: `NEEDS_INPUT`, `REVIEW`, `BLOCKED` (per carousel, with the reason), `REFUSED`, `PUBLISHED`. A draft still needs a manual publish in Repliz.

The agent locates the plugin files through `${CLAUDE_PLUGIN_ROOT}`; if that is not substituted inside the agent, it falls back to finding them with Glob. This variant is unverified until the release checklist has been run.

## Sheet tracking

Optionally, every scheduled carousel is logged as a row in a Google Sheet: one shared spreadsheet with one tab per brand, or a separate sheet per brand. Add a `tracking` block to the brand (see `examples/acme/brand.json`, with the fictional `EXAMPLE_SHEET_ID`): `sheet_id`, `tab`, `mode` (`append` or `update`), `match_column` and `match_by`, `columns` (the header names of your tab) and `status_values.scheduled`. `/carousel:brand` asks for these. A brand without `tracking` skips the step.

- Share the sheet as **Editor** with the Google account connected to Claude. A sheet owned by another account fails the access check.
- Header names are matched exactly against row 1 of the tab. Unmapped columns stay empty.
- Re-running does not duplicate a row (append mode checks the match column first); update mode only fills the row that matches and never appends.
- A written value that starts with `=`, `+`, `-` or `@` gets a leading apostrophe so the sheet keeps it as text.
- If anything fails, `sheet-row.csv` stays in the carousel folder (header row plus the row) and the failure is reported with the sheet and tab. Tracking never blocks, changes or undoes a schedule.

## Repliz

- The Repliz MCP must be connected in Claude Code.
- Slides are uploaded for staging, then scheduled as an album. The default is a **draft**; live scheduling only when you say so for that batch.
- Before relying on it, schedule one test draft on a test account and check the media in Repliz.

## CLI

The eight commands call `engine/cli.mjs`. Each prints JSON on stdout and a summary on stderr; exit code 1 means issues.

- `lint`: check a brand profile (`--self-check`) or a project (`--stage text|visual`).
- `render`: render a project's `copy.json` to slide PNGs.
- `new`: create a project folder and `meta.json`.
- `knowledge`: resolve which skills to use per role, with fallbacks.
- `publish-payload`: build the exact Repliz schedule payload (a dry run; sends nothing).
- `status`: print a project's status and verification result.
- `meta`: update status and Repliz fields in `meta.json`; `--tracked written|csv|skipped` records the sheet result.
- `sheet-row`: build the sheet row for a scheduled carousel and write `sheet-row.csv` (offline; a brand without `tracking` prints `"tracked": false`).

## Tests

```
node --test
```

Run it from the repo root. `node --test tests/` fails on Windows with Node 24; use `node --test` or a file path. To scan for private names, set `CAROUSEL_BLOCKLIST_FILE` to a text file with one name per line; the repo scan test then fails if any tracked file contains one.

## Known limits

- Logo PNGs with transparent padding look indented from the margin. Trim logos before use.
- Long copy is not shrunk automatically. Lint flags overflow and you shorten the text.
- Platform slide limits live in `brand.json` and change over time. Check them against the platform.
- The contrast rule is 4.5:1 for all text.

## Privacy

Never commit `brands/` or `carousel-output/`. A test (`tests/repo-scan.test.mjs`) fails if tracked files contain email addresses outside `example.com`, phone numbers or blocklisted names.

## License

See `LICENSE`.
