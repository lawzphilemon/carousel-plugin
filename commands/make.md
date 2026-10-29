---
name: make
description: Turn a topic into N brand-correct carousels (copy, lint, render, caption) with user approval gates on copy and caption
allowed-tools: Read, Write, Edit, Glob, Bash, AskUserQuestion, WebSearch, WebFetch
---

# /carousel:make "<topic>" --brand <slug> --count N [--slides S]

Produce N carousels for one brand. Three rules run through every stage:

- **Never invent a number.** Any statistic, percentage, year or count needs a source and date supplied by the user or found in-session. Otherwise set `needs_confirmation: true` on that slide and ask the user.
- **Never default a contact.** Ask for the CTA contact (phone, email or link) for this campaign. Never reuse one from memory.
- **No stage skips a gate.** Copy is approved before anything renders. The caption is approved before anything can be published.

Paths: `<workspace>` is the user's workspace. `<brands>` = `<workspace>/brands`. `<out>` = `<workspace>/carousel-output/<slug>`. `<project>` = the folder printed by `new`, `<out>/CAR-YYMMDD-XXXX_<topic-slug>/`. Talk to the user in their language.

## 1. Context

Read `<brands>/<slug>/brand.json`. If it does not exist, stop and point to `/carousel:brand`. Ask only what is missing: angle, audience, facts and sources they want used, platform, and the CTA contact for this campaign. Load the `carousel-craft` skill for the writing rules.

## 2. Knowledge

List the skills actually available in this session (not the ones merely named in the brand). Pass their names:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" knowledge --brand "<brands>/<slug>/brand.json" --installed "<comma-separated available skill names>"
```

The JSON gives, per role (hook, script, humanizer), `use` (skills to invoke) and `fallback` (true means use the bundled `carousel-craft` guide). When `notes` is not empty, say in one line what fell back, for example: "Hook skill not installed, using the bundled guide." Hook frameworks such as wtf-hook-999 and creator workflow skills are optional, user-installed and not bundled with this plugin; use them only when `use` lists them.

## 3. Copy drafts

Write N distinct angles on the topic, one folder per carousel. `--slides S` is the target number of slides per carousel; keep it inside the brand's `layout.slides` range and the platform's `max_slides`, and default to the middle of the range when it is not given. Create each folder first:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" new --brand "<slug>" --topic "<topic or angle>" --out "<out>" --brands "<brands>"
```

It prints `{ "dir", "code" }`; `dir` is that carousel's `<project>`. Write `<project>/copy.json` in this shape (omit what a slide kind does not use):

```json
{ "code": "CAR-...", "brand": "<slug>", "topic": "...", "platform": "instagram",
  "slides": [ { "kind": "cover|statement|points|stat|compare|quote|list|cta",
                "pill": "", "kicker": "", "headline": "", "sub": "", "body": "",
                "accent": "substring of headline", "check": "", "items": [],
                "stat": { "value": "", "label": "" },
                "left": { "title": "", "body": "" }, "right": { "title": "", "body": "" },
                "button": "", "contact": "", "needs_confirmation": false,
                "claims": [ { "text": "", "source": "", "date": "YYYY-MM-DD" } ] } ],
  "caption": "draft caption" }
```

Put the CTA contact the user gave for this campaign in `contact` on the `cta` slide (rendered as a small line under the button; leave it out if the user wants none). Never copy it from `brand.json` or memory. Every numeric claim goes in `claims` with `source` and `date`. If you have no source, set `needs_confirmation: true` and ask the user a direct question. Do not guess. If a hook skill is in `use`, invoke it for hook options and audit; otherwise follow `carousel-craft`.

### Gate 1: copy approval

Show all N drafts in readable form (slide by slide). Ask the user to approve or request changes. Re-edit until they approve. Resolve every `needs_confirmation` first. Do not continue without an explicit approval.

## 4. Text lint

For each carousel, run until it exits 0:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" lint --stage text --project "<project>" --brands "<brands>"
```

Exit 1 lists issues (`slide`, `rule`, `message`; `slide` is 1-based). Fix the copy and re-run. If a fix changes meaning or a fact, show the user. If a humanizer skill is in `use`, run it on the copy before the final lint run, then lint again.

## 5. Mark approved, then render

Status moves only forward through `meta`. `meta --status copy_approved` and `render` refuse unless `lint --stage text` passed after the last edit of `copy.json`. `render` accepts `copy_approved`, `rendered` or `caption_approved`, so you can render again after a fix; it sets status back to `rendered` and deletes `verification.json`. `meta --status caption_approved` also refuses when `verification.json` is older than `copy.json`, so after any copy change run lint text, render and lint visual again. Update `meta.json` only through the `meta` command, never by hand. `--brand` is a slug for `new` and a path to `brand.json` for `lint --self-check` and `knowledge`.

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" meta --project "<project>" --status copy_approved
```

Then render. It sets status `rendered` itself and writes `slides/slide-NN.png`, `carousel.html` and `contact-sheet.png`:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" render --project "<project>" --brands "<brands>"
```

If Chrome is not found, ask the user for its path and add `--chrome "<path>"`. A missing font file is an error naming the file: report it, do not work around it.

## 6. Visual lint

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" lint --stage visual --project "<project>" --brands "<brands>"
```

Exit 1 lists issues (overflow, margin, font size, contrast, logo, off-palette color). Shorten the copy in `copy.json`, run `lint --stage text` again (render refuses otherwise), render again, then lint visual again. If the copy change is more than trimming a few words, show the user. Repeat until exit 0; it writes `verification.json`.

## 7. Caption

Write `<project>/caption.txt` per carousel with the brand's `voice.caption_formula` (default: hook, body, proof, CTA). Use the CTA contact the user gave for this campaign. Follow the `voice` rules (address form, emoji limit, avoid list) and the evidence rule: no number without a source (a number in the caption must also appear in some slide's `claims`).

Then lint the caption file. When `caption.txt` exists, `lint --stage text` checks it in place of `copy.caption`, and `meta --status caption_approved` needs that run to pass after the last edit of `caption.txt`:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" lint --stage text --project "<project>" --brands "<brands>"
```

Fix the caption and re-run until it exits 0, then go to Gate 2.

### Gate 2: caption approval

Open each `<project>/contact-sheet.png` for the user (view the image and show its path). Show the caption beside it. Ask the user to approve or change the caption and the slides. Apply changes (slide changes go back to step 4). On approval, set the status:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" meta --project "<project>" --status caption_approved
```

## 8. Hand off

List each carousel code, folder and slide count. Offer `/carousel:publish <project>`. Do not publish from this command.
