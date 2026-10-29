# Agent mode and Google Sheet tracking: design

Date: 2026-10-29. Status: draft for review. Extends `2026-10-29-carousel-plugin-design.md` (v0.1.0). Target release: 0.2.0.

## 1. Goal

1. **Agent mode.** The user asks in plain words for carousels ("make 5 carousels about X for brand Y"). A subagent runs the whole pipeline alone and stops once, with finished slides and captions ready for review. Publishing stays behind an explicit approval.
2. **Sheet tracking.** After a carousel is scheduled, the agent records it in the brand's Google Sheet. Several brands may share one spreadsheet, each with its own tab, or have separate sheets.

Success means:
- One request produces N reviewed-ready carousels with no questions in between.
- Nothing is uploaded or scheduled without an explicit approval that names account, date and time.
- A tracking failure never blocks or undoes a schedule, and never writes outside the brand's own tab.
- Everything stays brand-agnostic: sheet ids and tab names live only in the private `brand.json`.

## 2. Non-goals

- Fully autonomous publishing (no approval at all).
- Creating spreadsheets. Creating a missing tab and header row is allowed only inside `/carousel:brand`, after the user agrees.
- Later status sync ("published" / "failed" from Repliz back to the sheet). Listed as a follow-up (`/carousel:sync`).
- Changing the manual commands. `/carousel:make` and `/carousel:publish` keep their three-gate flow.

## 3. Agent mode

### 3.1 Shape
`agents/carousel.md` in the plugin: a subagent (front matter `name: carousel`, a `description` that triggers when the user asks to create, render, revise or schedule social carousels for a brand, `tools` omitted so it inherits all tools including the Repliz and Google Sheets MCP tools).

A subagent cannot ask the user questions; it returns one final message to the calling conversation. So the design has exactly two stops, both ending in a returned report, and the caller (the main conversation) talks to the user.

### 3.2 Single source of truth
The agent does not copy the workflow. Its instructions say: read the plugin's `commands/make.md` and `commands/publish.md` and follow them, with these overrides:
- Skip Gate 1 and Gate 2 prompts. Set the statuses through `meta` as the commands describe once the lint gates pass.
- Never ask the user anything; collect missing input by returning `NEEDS_INPUT` (3.3).
- Stop at the review report (3.4).
If `${CLAUDE_PLUGIN_ROOT}` is not substituted inside agent bodies, the agent locates the files with Glob (`**/commands/make.md` under the plugin install directory, accepted only when the sibling `engine/cli.mjs` exists). Verify this during implementation and document the working variant in the README.

### 3.3 Phase 0: input check
The dispatch must carry: brand slug, topic, count, CTA contact for the campaign (or an explicit "no contact"), and any sources/numbers the user wants used. If any is missing the agent returns immediately:

```
STATUS: NEEDS_INPUT
MISSING: cta_contact, sources
```

The caller asks the user once and re-dispatches. The agent never invents a contact, a source or a number.

### 3.4 Phase 1: build, then one review stop
Runs without questions, per carousel: knowledge resolution, copy, `lint --stage text`, `meta copy_approved`, `render`, `lint --stage visual`, caption, `lint --stage text`, `meta caption_approved`. On a lint failure it fixes and retries, at most 3 attempts per failing step; then it marks that carousel `BLOCKED` with the lint output and continues with the others.

Claims without a user-supplied source are never kept: the agent rewrites the slide without the number and records the removal. It must not leave a number in with `needs_confirmation`, because that fails lint and would stall the unattended run.

The agent then returns:

```
STATUS: REVIEW
CAROUSELS:
  - code: CAR-...        folder: <path>
    contact_sheet: <path>/contact-sheet.png
    slides: <n>          lint_text: pass   lint_visual: pass
    caption: |
      <full caption text>
    assumptions: [..]    removed_claims: [..]   open_questions: [..]
  - code: ...  STATUS: BLOCKED  reason: <lint output>
```

The caller shows the user the contact sheet paths and captions and relays the answer.

### 3.5 Revisions
Feedback from the user is passed back verbatim ("revise CAR-... : <notes>"). The agent edits `copy.json` and `caption.txt`, re-runs the pipeline for that carousel (re-render is allowed from any status via the existing reset) and returns a new `REVIEW` report for it. No limit on rounds; each round is user-initiated.

### 3.6 Phase 2: publish
Only on a dispatch that contains an approval of this shape, per carousel:

```
APPROVED: CAR-...   account: <repliz account id or name>   at: YYYY-MM-DD HH:mm   live: false
```

Without it the agent refuses and returns `STATUS: REFUSED` (reason: missing approval). With it, the agent follows `commands/publish.md` steps 1-7 (status and gates, upload, `publish-payload`, `repliz_create_schedule`, read-back, `meta --status scheduled ...`) and then runs tracking (section 4). `live: true` is accepted only when the approval says so. It never schedules to an account the caller did not name in the approval.

Stops and returns `STATUS: PUBLISHED` with schedule ids and the tracking result.

### 3.7 Resumability
No hidden conversation state. Each dispatch starts with `status --project <dir>` for the carousels it is given (or lists `carousel-output/<brand>/` for the latest batch) and continues from `meta.status`.

## 4. Sheet tracking

### 4.1 Brand config (private)
New optional block in `brand.json`:

```json
"tracking": {
  "sheet_id": "EXAMPLE_SHEET_ID",
  "tab": "Acme",
  "mode": "append",
  "match_column": "Code",
  "match_by": "code",
  "columns": {
    "code": "Code", "topic": "Topic", "status": "Status",
    "scheduled_at": "Scheduled", "account": "Account",
    "repliz_id": "Repliz ID", "folder": "Folder"
  },
  "status_values": { "scheduled": "Scheduled (draft)" }
}
```

- Shared spreadsheet: same `sheet_id`, different `tab` per brand. Separate sheets: different `sheet_id`.
- `mode`: `append` adds one row per scheduled carousel (a log); `update` finds an existing row and fills the mapped cells (a queue). `match_column` is the header of the column searched; `match_by` (`code` or `topic`) says which value of the carousel is looked up there: `code` for logs and for queues that carry the carousel code, `topic` for queues the user filled with topics before the carousel existed (the match is an exact, case-insensitive comparison with the carousel's `topic`). `match_by` defaults to `code`.
- Required `columns` keys: `code`, `status`, `scheduled_at`. The others are optional; unmapped sheet columns stay empty. Header names are the exact text of row 1 in the tab.
- A brand without `tracking` skips this step silently.

`validateBrand` checks: types, `mode` is `append|update`, `match_by` is `code|topic` when present and the matching `columns` key exists, `match_column` is one of the mapped header names, required column keys exist, `status_values.scheduled` is a non-empty string. The example brand ships a fictional block with `sheet_id: "EXAMPLE_SHEET_ID"`.

### 4.2 Engine
New command `sheet-row --project <dir> --brands <dir>` (8th command; added to `COMMANDS`/`FLAGS`). Pure and offline. Reads `meta.json`, `copy.json` and the brand, prints JSON:

```json
{ "tracked": true, "sheet_id": "...", "tab": "...", "mode": "append",
  "expected_headers": ["Code","Topic","Status","Scheduled","Account","Repliz ID","Folder"],
  "match": { "column": "Code", "by": "code", "value": "CAR-261030-A1B2" },
  "cells": { "Code": "CAR-...", "Topic": "...", "Status": "Scheduled (draft)",
             "Scheduled": "2026-11-03T04:00:00.000Z", "Account": "...", "Repliz ID": "...", "Folder": "..." } }
```

`tracked: false` when the brand has no `tracking`. It refuses (exit 1) unless `meta.status` is `scheduled` and `repliz.schedule_id` is set, so a row can only describe a confirmed schedule. `meta` gains `--tracked <written|csv|skipped>` which stores `meta.tracking = {state, at}` for the record. The command also writes `sheet-row.csv` (header row plus the row, cells in `expected_headers` order) into the project folder so the fallback always exists.

### 4.3 Agent procedure (after a confirmed schedule)
Uses the Google Sheets MCP tools; the engine does no network I/O.
1. `get_spreadsheet(sheet_id)`: if it fails (no access, wrong Google account), fall back (4.4).
2. Confirm the tab exists. Read row 1 of the tab (`get_values`). Every name in `expected_headers` must be present; otherwise fall back.
3. Idempotency: read the match column; if the value is already present (append mode), do nothing more and record `written`.
4. `append`: build the row in the sheet's header order from `cells` (unmapped columns empty) and `append_values` to that tab only. `update`: find the row whose match column equals `match.value`, then `update_values` only the mapped cells of that row; if no row matches, fall back (never append in update mode).
5. Record `meta --tracked written`.
6. Never read or write any other tab.

### 4.4 Failure handling
Any failure leaves the Repliz schedule untouched. The agent keeps `sheet-row.csv`, records `meta --tracked csv`, and reports which brand, sheet and tab failed and why (for example "this sheet belongs to a different Google account than the one connected"). It does not retry in a loop and does not choose a different sheet.

### 4.5 Accounts
The Sheets connector is bound to one Google account. The sheet must be shared with that account as Editor. The access check in 4.3 step 1 is the only detection; the plugin cannot switch accounts. This is documented in the README.

### 4.6 `/carousel:brand` addition
The brand interview asks for `tracking` (sheet id or URL, tab, mode, column names). If the tab or header row does not exist, the command offers to create them, shows exactly what it will write, and only does so after the user agrees; otherwise it saves the config and notes that the tab is missing.

## 5. Safety summary
- Two stops only (review, then publish approval); no hidden approvals; `live` false by default.
- The publish approval must name account, date and time; the agent refuses otherwise.
- Tracking writes are confined to one tab, by header name, idempotent, and never block publishing.
- No sheet id, tab name, account or contact is stored in the public repo.

## 6. Testing
- `sheet-row`: success mapping for `append` and `update`, `tracked:false` without config, refusal when not `scheduled`, `sheet-row.csv` header order, missing optional columns left empty, a status value from `status_values`.
- `validateBrand`: each invalid `tracking` shape gives a named error; the example brand passes.
- `meta --tracked`: stores state; rejects other values.
- Docs tests: `agents/carousel.md` has front matter, mentions `NEEDS_INPUT`, `REVIEW`, `REFUSED`, `PUBLISHED`, references `commands/make.md` and `commands/publish.md` that exist, contains no brand names, and every engine invocation in it passes the existing COMMANDS/FLAGS check. `commands/brand.md` mentions tracking. README has an "Agent mode" and a "Sheet tracking" section.
- Manual verification before release: one agent run on the example brand to REVIEW; one Repliz draft on a test account; one real sheet write to a test tab, including the failure path (revoked access) producing `sheet-row.csv`.

## 7. Open items
- Whether `${CLAUDE_PLUGIN_ROOT}` resolves inside agent bodies (3.2 fallback).
- Whether the Google Sheets tools can append rows addressed by header name directly; if not, the agent maps names to column letters from row 1.
- `/carousel:sync` (status "published/failed" back to the sheet): separate spec.
