---
name: publish
description: Upload approved carousel slides to Repliz and schedule them as drafts (live only on explicit request), with an explicit yes before anything is scheduled
allowed-tools: Read, Write, Edit, Glob, Bash, AskUserQuestion, mcp__repliz__repliz_init_file, mcp__repliz__repliz_upload_file, mcp__repliz__repliz_complete_file, mcp__repliz__repliz_list_accounts, mcp__repliz__repliz_create_schedule, mcp__repliz__repliz_get_schedule
---

# /carousel:publish <project> [<project> ...]

Schedule finished carousels on Repliz through the Repliz MCP tools. The default is a **draft**. Live scheduling happens only if the user says "live" for that batch. Talk to the user in their language.

`<project>` is a carousel folder `<workspace>/carousel-output/<slug>/CAR-YYMMDD-XXXX_<slug>/`. `<brands>` = `<workspace>/brands`.

**Hard rule: never schedule to an account the user did not name in this session.** Do not reuse an account from memory or a previous run.

## 1. Precheck

For each project:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" status --project "<project>"
```

Read `meta.status` and `verification`. Continue only when status is `caption_approved` and verification passed. Otherwise tell the user what is missing and send them back to `/carousel:make`. Stop for that project.

## 2. Upload the slides

For every `slides/slide-NN.png`, in order, call `repliz_init_file`, then `repliz_upload_file`, then `repliz_complete_file`, and collect the public URL. If any upload fails or returns no URL, abort the whole batch and report which file failed.

Uploads are staging only: nothing is scheduled until Gate 3.

Write the URLs, in slide order, as a JSON array of strings to `<project>/uploads.json`.

## 3. Account, date and time

Call `repliz_list_accounts` and show only the accounts for the carousel's platform. Ask the user which account, and the date and time for each carousel, in the brand's timezone (the engine converts to UTC). Stagger: no two posts share an account, date and time; if the user gives a clash, ask again. Use the form `YYYY-MM-DD HH:mm`.

## 4. Build the payload

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" publish-payload --project "<project>" --brands "<brands>" --account "<account id>" --at "<YYYY-MM-DD HH:mm>"
```

Add `--live` only if the user said live for this batch. When other carousels in this batch or session are already scheduled or planned, write them to a temporary JSON file as an array of `{ "accountId": "...", "scheduleAt": "<UTC ISO time>" }` (built from what you scheduled or planned in this session) and add `--existing "<that file>"`; a clash on the same account in the same minute exits 1. The command also refuses when `uploads.json` is not an array or its length differs from the number of `slides/slide-NN.png` files. Exit 1 lists errors (for example wrong status or missing uploads): fix and retry. Otherwise stdout is the exact `repliz_create_schedule` payload: use it unchanged.

## 5. Summary and Gate 3

Show a table per carousel: code, account name, slide count, first line of the caption, scheduled time in the user's timezone, and draft or live. Ask for an explicit yes. Anything other than a clear yes means do not schedule. A yes for one batch does not carry over to the next.

## 6. Schedule and read back

For each carousel call `repliz_create_schedule` with the printed payload, then `repliz_get_schedule` with the returned id. Compare the read-back account, time and media count with what the user approved. If they differ, tell the user and do not mark it scheduled.

Then update `meta.json` only through the `meta` command, never by hand:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" meta --project "<project>" --status scheduled --account "<account id>" --schedule-id "<id>" --schedule-at "<UTC ISO time>"
```

## 7. Track in the sheet

Run only after the read-back matched and `meta --status scheduled` was recorded. Tracking never blocks, changes or undoes a schedule. A brand without `tracking` skips this step silently.

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" sheet-row --project "<project>" --brands "<brands>"
```

- Exit non-zero (brand invalid, empty topic, missing schedule id): no CSV was written. Run `meta --project "<project>" --tracked skipped` with the same CLI path and tell the user the CLI message.
- JSON `"tracked": false`: the brand has no `tracking`. Run `node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" meta --project "<project>" --tracked skipped` and say nothing else.
- Otherwise take `sheet_id`, `tab`, `mode`, `expected_headers`, `cells` and `match` from the JSON and use the Google Sheets tools:

1. `get_spreadsheet` on `sheet_id`. If it fails (no access, other Google account) or `tab` is not in it: fall back.
2. `get_values` on row 1 of `tab`. Every name in `expected_headers` must be a header; otherwise fall back. A header's column letter comes from its index in row 1 (A, B, ... Z, AA). In A1 ranges, quote a tab name with spaces or symbols, for example `'My Tab'!A1`, and double any apostrophe in it (`'Bob''s Tab'!A1`).
3. Read the `match.column` column. In append mode, if `match.value` is already there, write nothing and record `written`.
4. Append mode: build one row in the sheet's header order from `cells` (unmapped columns empty) and `append_values` to `'<tab>'!A1`. Update mode: find the row whose `match.column` equals `match.value` (case-insensitive when `match.by` is `topic`) and `update_values` only the mapped cells of that row. No matching row, or more than one: fall back. Never append in update mode.
5. Neutralize formula-like values before writing: for every cell value you write that starts with `=`, `+`, `-` or `@`, prefix a single quote (`'`) so it stays literal text. Never alter the match value used for lookups or the header names; apply the prefix only to the values written.
6. Never read or write any other tab or sheet. Do not retry in a loop.

On success run `node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" meta --project "<project>" --tracked written`. Fall back means: keep `sheet-row.csv` (written by the successful `sheet-row` run), run `meta --project "<project>" --tracked csv` with the same CLI path, and tell the user which brand, sheet and tab failed and why (for example the sheet belongs to a different Google account than the one connected to Claude). The schedule stays as it is.

Finish with the list of codes, accounts, times and whether each is a draft. Remind the user that a draft still needs a manual publish in Repliz.
