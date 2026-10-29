# Agent Mode and Sheet Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an autonomous `carousel` subagent (one review stop, publish only on explicit approval) and per-brand Google Sheet tracking after a confirmed Repliz schedule, as release 0.2.0.

**Architecture:** The engine stays pure and offline: `validateBrand` learns an optional `tracking` block, a new `sheet-row` command maps a scheduled project to sheet cells plus a CSV fallback, and `meta` records the tracking outcome. The subagent (`agents/carousel.md`) and the Sheets procedure are Markdown instructions that call the existing CLI and the Repliz and Google Sheets MCP tools; no network code is added to the engine.

**Tech Stack:** Node 20+ ESM, `node:test`, no npm dependencies; Markdown agent and commands.

**Spec:** `docs/superpowers/specs/2026-10-29-agent-mode-and-sheet-tracking-design.md` (extends `2026-10-29-carousel-plugin-design.md`).

## Global Constraints

- Repo root is the repository root; all paths are relative to it. Branch off `main` (`feat/agent-mode-and-tracking`); one commit per task, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` as its own paragraph.
- Run tests with `node --test` or by file path; never `node --test tests/` (fails on Windows Node 24).
- No runtime npm dependencies. No real brand, client, sheet id, account, contact or price in tracked files; the example brand uses `sheet_id: "EXAMPLE_SHEET_ID"`. `tests/repo-scan.test.mjs` must keep passing.
- `COMMANDS` and `FLAGS` in `engine/cli.mjs` must stay in sync (existing docs test asserts equal key sets); `sheet-row` is the 8th command.
- `tracking` is optional in `brand.json`; a brand without it must behave exactly as in 0.1.0.
- Tracking never changes `meta.status`; a row may only be built for `meta.status === "scheduled"` with `meta.repliz.schedule_id` set.
- Header names are matched exactly (the text of row 1 of the tab); `match_by` default is `code`.
- Agent statuses are exactly `NEEDS_INPUT`, `REVIEW`, `BLOCKED` (per carousel), `REFUSED`, `PUBLISHED`. `tools` is omitted from the agent front matter.
- Version becomes `0.2.0` in `.claude-plugin/plugin.json` and `CHANGELOG.md`.

### Shared shapes

`brand.tracking` (all keys as in spec 4.1): `{ sheet_id: string, tab: string, mode: "append"|"update", match_column: string, match_by?: "code"|"topic", columns: { code, status, scheduled_at, topic?, account?, repliz_id?, folder? : string }, status_values: { scheduled: string } }`.

`SheetRow` (stdout of `sheet-row`): `{ tracked: false }` or `{ tracked: true, sheet_id, tab, mode, expected_headers: string[], match: { column: string, by: "code"|"topic", value: string }, cells: { [header: string]: string } }`.

## Review Focus

- Two logical columns mapped to the same header, or `match_column` not among mapped headers, must be a named validation error, not a silently wrong row. Pinned in Task 1.
- Topic or caption-like text with commas, quotes and newlines must survive `sheet-row.csv` round trip. Pinned in Task 2.
- `sheet-row` on a project that is not `scheduled` (or has no `schedule_id`) must exit 1; with no `tracking` configured it must exit 0 with `tracked: false`. Pinned in Task 3.
- `meta --tracked` with a value outside `written|csv|skipped` must be refused. Pinned in Task 3.
- The agent must refuse to publish without an approval naming account, date and time, and must never ask the user questions. Pinned in Task 4 (document test on the agent text).
- A brand without `tracking` must skip the sheet step silently in every document that describes it. Pinned in Task 5.

---

### Task 1: `tracking` validation and example config

**Files:**
- Modify: `engine/lib/brand.mjs` (inside `validateBrand`), `examples/acme/brand.json`
- Test: `tests/brand.test.mjs`

**Interfaces:**
- Produces: `validateBrand(brand, dir): string[]` additionally validates `brand.tracking` when present. Errors are strings starting `tracking.`; `tracking` absent adds nothing. Rules: `sheet_id`, `tab`, `match_column` are non-empty strings; `mode` is `append` or `update`; `match_by`, when present, is `code` or `topic`, and `columns[match_by]` must exist (default `code`); `columns` is an object whose required keys `code`, `status`, `scheduled_at` are non-empty strings; every `columns` value is a non-empty string; header values are unique (error `tracking.columns: header "X" is mapped twice`); `match_column` equals one of the `columns` values; `status_values.scheduled` is a non-empty string.

- [ ] **Step 1: Write the failing tests** in `tests/brand.test.mjs`: the acme example (after Step 3) validates `[]`; a brand with `tracking` removed validates `[]`; and for a copy of acme with each mutation, `validateBrand` returns an error containing the given text: `mode: "sync"` -> `tracking.mode`; `columns.status` deleted -> `tracking.columns.status`; `columns.topic = columns.code` ("Code") -> `mapped twice`; `match_column: "Nope"` -> `tracking.match_column`; `match_by: "topic"` with no `columns.topic` -> `tracking.match_by`; `status_values: {}` -> `tracking.status_values.scheduled`; `tab: ""` -> `tracking.tab`.
- [ ] **Step 2: Run** `node --test tests/brand.test.mjs`. Expected: FAIL (new cases, example not updated).
- [ ] **Step 3: Implement** the `tracking` checks in `validateBrand` and add to `examples/acme/brand.json` the block of spec 4.1 verbatim (`sheet_id "EXAMPLE_SHEET_ID"`, `tab "Acme"`, `mode "append"`, `match_column "Code"`, `match_by "code"`, the seven `columns` with the English headers `Code, Topic, Status, Scheduled, Account, Repliz ID, Folder`, `status_values.scheduled "Scheduled (draft)"`).
- [ ] **Step 4: Run** `node --test tests/brand.test.mjs tests/scaffold.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: validate optional per-brand tracking config`.

---

### Task 2: Sheet row builder and CSV

**Files:**
- Create: `engine/lib/sheet-row.mjs`
- Test: `tests/sheet-row.test.mjs`

**Interfaces:**
- Consumes: brand shape from Task 1; `meta` shape from `engine/lib/project.mjs` (`code`, `topic`, `brand`, `status`, `repliz.account|schedule_id|schedule_at`).
- Produces: `buildSheetRow(meta: object, brand: object, projectDir: string): SheetRow` (pure; throws `Error` with message containing `scheduled` when `meta.status !== "scheduled"` and containing `schedule_id` when `meta.repliz?.schedule_id` is missing; returns `{ tracked: false }` when `brand.tracking` is absent). `cells` maps each header of `brand.tracking.columns` to a string: `code` -> `meta.code`; `topic` -> `meta.topic`; `status` -> `status_values.scheduled`; `scheduled_at` -> `meta.repliz.schedule_at`; `account` -> `meta.repliz.account`; `repliz_id` -> `meta.repliz.schedule_id`; `folder` -> `<meta.brand>/<basename of projectDir>`. Only mapped columns appear; a mapped column with no source value is `""`. `expected_headers` is the `columns` values in the order `code, topic, status, scheduled_at, account, repliz_id, folder` filtered to those mapped. `match` is `{ column: tracking.match_column, by: tracking.match_by ?? "code", value }` with `value` = `meta.code` for `code`, `meta.topic.trim()` for `topic`.
- Produces: `rowToCsv(row: SheetRow): string` returning the header line and one data line (cells in `expected_headers` order), RFC 4180 quoting (quote fields containing `,`, `"`, CR or LF; double inner quotes), `\r\n` line endings, trailing `\r\n`.

- [ ] **Step 1: Write the failing tests:** with the acme example and a meta `{code:"CAR-261030-A1B2", topic:"three numbers", brand:"acme", status:"scheduled", repliz:{account:"acct1", schedule_id:"s9", schedule_at:"2026-11-03T04:00:00.000Z"}}`: `buildSheetRow` returns `tracked:true`, `expected_headers` equal `["Code","Topic","Status","Scheduled","Account","Repliz ID","Folder"]`, `cells.Status === "Scheduled (draft)"`, `cells.Folder === "acme/<basename>"`, `match` `{column:"Code", by:"code", value:"CAR-261030-A1B2"}`; with `match_by:"topic"` plus `columns.topic`, `match.value` is the trimmed topic; a brand without `tracking` returns `{tracked:false}`; `status:"rendered"` throws a message containing `scheduled`; missing `schedule_id` throws a message containing `schedule_id`; an unmapped optional column (remove `columns.account`) leaves no `Account` key and shortens `expected_headers`; `rowToCsv` with topic `He said "hi", then\nleft` yields a data line whose parsed value (use a tiny RFC 4180 parser in the test) equals the original topic, header line is first, and both lines end in `\r\n`.
- [ ] **Step 2: Run** `node --test tests/sheet-row.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `buildSheetRow` and `rowToCsv` in `engine/lib/sheet-row.mjs`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat: sheet row builder and CSV fallback`.

---

### Task 3: `sheet-row` command and `meta --tracked`

**Files:**
- Modify: `engine/cli.mjs` (`COMMANDS`, `FLAGS`, handlers), `engine/lib/project.mjs` only if `updateMeta` rejects the new key
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `buildSheetRow`, `rowToCsv` (Task 2); `loadBrand`, `brandPath`, `readMeta`, `updateMeta`.
- Produces: `sheet-row --project <dir> --brands <dir>` (both required): `needProject`, loads brand via `brandPath(brands, meta.brand)`, prints the `SheetRow` JSON on stdout and exit 0; for `tracked:true` also writes `<project>/sheet-row.csv` (UTF-8, `rowToCsv` output); `tracked:false` writes nothing; refusals from `buildSheetRow` exit 1 with the message (no stack trace). `meta` gains `--tracked <written|csv|skipped>`: patches `meta.tracking = { state, at: <ISO now> }`, counts as one of the allowed patch flags in the usage check; any other value exits 1 with `--tracked must be written, csv or skipped`. `COMMANDS` gets `"sheet-row"`; `FLAGS["sheet-row"] = ["project","brands"]`; `FLAGS.meta` gains `"tracked"`.

- [ ] **Step 1: Write the failing tests** in `tests/cli.test.mjs` using a temp project from `new` and `meta` calls (status moved to `scheduled` with `--account acct1 --schedule-id s9 --schedule-at 2026-11-03T04:00:00Z` after faking the earlier statuses via the same helpers other CLI tests use): `sheet-row` prints `tracked:true`, `cells.Code` equals the project code, and `sheet-row.csv` exists with the header line first; on a project with status `draft` it exits 1 and the message contains `scheduled`; with a temp brands dir whose acme brand has no `tracking` it exits 0 with `{"tracked":false}` and no CSV is written; `meta --tracked written` stores `tracking.state === "written"` and a parsable `at`; `meta --tracked maybe` exits 1; `COMMANDS` contains `sheet-row` and `FLAGS.meta` contains `tracked`.
- [ ] **Step 2: Run** `node --test tests/cli.test.mjs`. Expected: FAIL (command unknown).
- [ ] **Step 3: Implement** the `sheet-row` handler and the `--tracked` flag in `engine/cli.mjs`; update the `meta` usage message to list `--tracked`.
- [ ] **Step 4: Run** `node --test tests/cli.test.mjs tests/docs.test.mjs`. Expected: PASS (docs test also confirms FLAGS/COMMANDS stay in sync).
- [ ] **Step 5: Commit** `feat: sheet-row command and meta --tracked`.

---

### Task 4: The `carousel` subagent

**Files:**
- Create: `agents/carousel.md`
- Modify: `tests/docs.test.mjs`

**Interfaces:**
- Consumes: CLI commands (`new`, `lint`, `render`, `meta`, `status`, `knowledge`, `publish-payload`, `sheet-row`); `commands/make.md` and `commands/publish.md`.
- Produces: `agents/carousel.md` with front matter `name: carousel`, a trigger `description` (create, render, revise or schedule social carousels for a brand), `tools` omitted. Body sections, in this order: purpose and the two-stop model; single source of truth (read `make.md` and `publish.md`, overrides: skip Gate 1 and Gate 2 prompts, never ask the user, stop at the review report; locate those files via `${CLAUDE_PLUGIN_ROOT}` or else Glob `**/commands/make.md` accepted only where a sibling `engine/cli.mjs` exists); Phase 0 input check returning `STATUS: NEEDS_INPUT` with `MISSING:` (brand, topic, count, cta_contact, sources); Phase 1 pipeline with the 3-attempt fix limit, `BLOCKED` per carousel, unsourced numbers removed (never left as `needs_confirmation`), and the `STATUS: REVIEW` report format of spec 3.4; revisions (spec 3.5); Phase 2 publish only with `APPROVED: <code> account: <id> at: YYYY-MM-DD HH:mm live: <bool>` lines else `STATUS: REFUSED`, then the sheet-tracking procedure of spec 4.3 and 4.4 using `sheet-row` and the Google Sheets tools, ending `STATUS: PUBLISHED`; resumability (start from `status`).

- [ ] **Step 1: Write the failing tests** in `tests/docs.test.mjs`: `agents/carousel.md` exists; its front matter has `name: carousel`, a `description:` line, and no `tools:` line; the text contains each of `NEEDS_INPUT`, `REVIEW`, `BLOCKED`, `REFUSED`, `PUBLISHED`, `APPROVED:`, `sheet-row`, `commands/make.md`, `commands/publish.md`; it contains no `AskUserQuestion`; extend the existing "every engine invocation" test and the blocklist and optional-skill walks to include `agents/` (the agent file must pass the same checks as commands); the section order matches the list above (assert the index of `NEEDS_INPUT` < `REVIEW` < `APPROVED:`).
- [ ] **Step 2: Run** `node --test tests/docs.test.mjs`. Expected: FAIL (agent missing).
- [ ] **Step 3: Write `agents/carousel.md`** per the Interfaces block. English, under ~160 lines, no brand names, no third-party framework text.
- [ ] **Step 4: Run** `node --test tests/docs.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: carousel subagent with review stop and approved publish`.

---

### Task 5: Commands, README, spec sync and release 0.2.0

**Files:**
- Modify: `commands/publish.md`, `commands/brand.md`, `commands/make.md`, `README.md`, `CHANGELOG.md`, `.claude-plugin/plugin.json`, `docs/superpowers/specs/2026-10-29-carousel-plugin-design.md`
- Test: `tests/docs.test.mjs`, `tests/repo-scan.test.mjs` (existing)

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: `commands/publish.md` gains a final step "Track in the sheet" (skipped silently for a brand without `tracking`): `sheet-row`, then the procedure of spec 4.3 in manual form (verify access, tab and headers, idempotent append or update, `meta --tracked written`, fallback `sheet-row.csv` and `meta --tracked csv` on any failure, never touching other tabs). `commands/brand.md` adds the tracking interview questions and the offer to create a missing tab and header row only after the user agrees, showing exactly what will be written. `commands/make.md` gets a short note that the `carousel` agent runs this flow unattended. README gets "Agent mode" (how to ask; the two stops; how approval for publish is phrased; the `${CLAUDE_PLUGIN_ROOT}` fallback note) and "Sheet tracking" (shared sheet with one tab per brand or separate sheets; the sheet must be shared as Editor with the Google account connected to Claude; the CSV fallback). The base spec's CLI list gets `sheet-row` (8 commands) and a pointer to the new spec. `CHANGELOG.md` gets `0.2.0`; `plugin.json` version `0.2.0`.

- [ ] **Step 1: Write the failing tests** in `tests/docs.test.mjs`: README contains `Agent mode`, `Sheet tracking`, `Editor`, `sheet-row.csv`; `commands/publish.md` and `commands/brand.md` mention `tracking`; `commands/publish.md` states that a brand without `tracking` skips the step; `.claude-plugin/plugin.json` version is `0.2.0`; `CHANGELOG.md` has a `0.2.0` heading; the base spec lists `sheet-row`.
- [ ] **Step 2: Run** `node --test tests/docs.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Write the documentation changes** as described; run `node --test` (all files) and, with `CAROUSEL_BLOCKLIST_FILE` pointing at the author's private name list, `node --test tests/repo-scan.test.mjs tests/docs.test.mjs`.
- [ ] **Step 4: Run** the full suite. Expected: PASS (blocklist test skips when the variable is unset).
- [ ] **Step 5: Commit** `docs: agent mode, sheet tracking, release 0.2.0`.

---

## Release checklist (manual, after Task 5; not agent-executable)

1. Run the agent on the example brand through to `REVIEW` in a scratch workspace.
2. One Repliz draft on a test account via `/carousel:publish` or the agent; confirm the album URLs are accepted.
3. One sheet write to a test tab (append mode), then a second run to confirm idempotency, then revoke access to confirm `sheet-row.csv` and `meta --tracked csv`.
4. Confirm whether `${CLAUDE_PLUGIN_ROOT}` resolves inside the agent body; record the working variant in the README.
5. Confirm whether the Sheets tools append by header name; if not, document the letter-mapping step the agent uses.

## Self-review notes

- Spec coverage: agent phases and statuses (Task 4), tracking config (Task 1), `sheet-row` and CSV (Tasks 2-3), `meta --tracked` (Task 3), brand interview and manual flow (Task 5), safety rules (Tasks 3-5), testing section (all tasks), open items (release checklist). `/carousel:sync` stays out of scope.
- Proportion: five tasks for two small engine additions and three Markdown surfaces.
