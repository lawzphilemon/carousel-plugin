# Changelog

## 0.4.0 - 2026-11-06

- Add: Hermes Agent support. The root `plugin.json` is the Agent Plugins manifest Hermes reads, and the new `carousel-hermes` skill routes `/carousel brand|make|publish` to the existing command files and translates Claude Code tools to Hermes tools (files, shell, questions, web, image display, Repliz MCP, Google Sheets, knowledge skills).
- Add: Hermes rules in the skill: no subagents or advisor, approval only from the user in the chat, no publishing from a scheduled run, and a curl fallback for a failing Repliz upload.
- Unchanged: the engine, the commands, the agents and the Claude Code install. The pipeline and its gates are identical in both hosts.

## 0.3.1 - 2026-11-01

- Fix: live posts no longer get the draft status text in the sheet. `meta --live` records a live schedule, and `sheet-row` writes the brand's optional `tracking.status_values.scheduled_live` for it (falling back to `scheduled`).

## 0.3.0 - 2026-11-01

- Add: the `carousel` agent runs on Sonnet (`model: sonnet`) and can be the main session: `claude --agent carousel:carousel --advisor opus`.
- Add: `carousel-scout` agent on Haiku, read-only (`Read, Grep, Glob, WebFetch, WebSearch`). The carousel agent must hand it the source-page checks and the overlap check against earlier carousels in `carousel-output/<slug>/`.
- Add: the agent consults the advisor before a carousel's copy locks, after the same error twice, and before the review report; without the advisor it runs those checks itself and says so.
- Add: every knowledge skill the brand resolves in `use` (hook, script, humanizer) is required: the agent invokes it with the Skill tool and lists it under `skills_used` in the review report.
- Unchanged: publishing still needs the user's own verbatim `APPROVED:` line per carousel.

## 0.2.0 - 2026-10-29

- Add: `carousel` subagent (single review stop, approval-gated publish).
- Add: optional per-brand `tracking` block and validation.
- Add: `sheet-row` command and `meta --tracked`.
- Add: Google Sheet tracking step in `/carousel:publish` and the agent (shared sheet with a tab per brand, idempotent, CSV fallback).
- Docs: README sections "Agent mode" and "Sheet tracking".

## 0.1.1 - 2026-10-29

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
