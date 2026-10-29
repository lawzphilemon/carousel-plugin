# Changelog

## Unreleased

- Fix: render can run again (after a visual-lint fix or a slide change) from `copy_approved`, `rendered` or `caption_approved`; it resets status to `rendered` and deletes stale `verification.json` and slide PNGs.
- Fix: engine enforces the gates: `render` and `meta --status copy_approved` need a fresh passing text lint; `meta --status caption_approved` needs a passing visual lint and a fresh text lint of `caption.txt`.
- Add: per-campaign `contact` on the `cta` slide (falls back to `brand.json` `cta.contact`), exempt from numeric-claim checks.
- Fix: numeric-claim rule covers items, check, pill, kicker, compare sides, stat label and the caption; `caption.txt` is linted in place of `copy.caption`.
- Fix: `publish-payload` checks the upload count against the slide PNGs, the `uploads.json` shape and the project path, and takes `--existing` to check the schedule stagger.
- Fix: `points` slides with a `check` allow at most 3 items; `lint --stage text` validates the brand first.
- Fix: brand validation covers `fonts.family` and CTA button colors; brand slugs read from project files are validated; `--no-sandbox` only on Linux.
- Fix: example logos trimmed of transparent padding; docs and spec names synced with the real CLI.

## 0.1.0 - 2026-10-29

- Brand profile (`brand.json`) with self-check, plus a fictional example brand (Acme Studio).
- Render engine: HTML layouts to 1080x1350 PNG slides through local Chrome.
- Text lint (copy rules, claims need a source) and visual lint (size, margin, contrast, logo, palette).
- `/carousel:brand`, `/carousel:make`, `/carousel:publish` with three approval gates.
- Bundled `carousel-craft` guide; optional user-installed knowledge skills with fallback.
- Repliz scheduling as drafts by default, via a dry-runnable payload builder.
- CLI with seven commands and a repo scan test that keeps private data out.
