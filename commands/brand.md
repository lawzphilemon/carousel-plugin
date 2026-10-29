---
name: brand
description: Create or update a private brand profile (brands/<slug>/brand.json) by interview or by importing a brand guideline document, then self-check it
allowed-tools: Read, Write, Edit, Glob, Bash, AskUserQuestion
---

# /carousel:brand

Create or update `<workspace>/brands/<slug>/brand.json`. The profile and its assets (fonts, logos) stay private in the user's workspace. Never write them into the plugin repo. Talk to the user in their language.

The schema is the one in `examples/acme/brand.json` inside this plugin. Read it first as the shape reference (its values are fictional).

## 1. Pick the entry mode

Ask which one:

1. **Interview.** Ask in small groups, not all at once: name, handle, language, platforms; palette (dark, light, accent, text colors, forbidden colors); font family and font file; logo files per background (on dark, on light, on accent); voice (point of view, how to address the reader per platform, words to use and avoid, emoji limit); hard rules (prices, claims needing a source, client names to block); standard CTA lines per pillar; content pillars; timezone; optional knowledge skills per role (hook, script, humanizer).
2. **Import.** The user points at a brand guideline PDF or document. Read it yourself. The engine never parses documents.

## 2. Propose, then confirm

Write a complete proposed `brand.json` and show it. Directly under it list two groups:

- **Stated**: fields found in the document or said by the user.
- **Inferred**: fields you filled in yourself (for example sizes, contrast pairs, `max_headline_words`). Say why for each.

Ask the user to confirm or correct. Do not save until they confirm. Leave `cta.contact` as `null`: contact details are asked per campaign, never stored as a default. Ask the user to place the font and logo files at the paths the profile names, or tell you where they are and copy them in.

## 3. Save and self-check

Write the confirmed file, then run:

```
node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" lint --self-check --brand "<workspace>/brands/<slug>/brand.json"
```

Exit 0 means every referenced file exists, required keys are present and the contrast pairs pass. Exit 1 prints a list of errors as JSON: fix them with the user (a missing file, a weak color pair) and re-run until it exits 0. Then tell the user the slug to use with `/carousel:make`.
