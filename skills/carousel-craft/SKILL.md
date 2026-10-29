---
name: carousel-craft
description: Bundled guide for writing social carousels - hook angles, one idea per slide, slide anatomy, swipe rhythm, CTA patterns, caption formula and the evidence rule. Use when drafting or reviewing carousel copy.
---

# Carousel craft

A carousel is read one swipe at a time. Each swipe must earn the next one. This guide is the always-on baseline for `/carousel:make`. The brand profile (`brand.json`) decides voice, words to avoid and limits; this guide decides structure.

Details: `references/hooks.md` (hook angles), `references/anatomy.md` (slides and rhythm), `references/captions.md` (captions and CTA lines).

## 1. One idea per slide

If a slide needs "and" to describe its point, split it. A reader should be able to say what the slide taught in five words. Keep headlines short (respect `layout.max_headline_words`) and bodies shorter than the limit, not at it.

## 2. Pick the hook by angle

Choose the angle first, then write the cover. Six angles cover most topics:

| Angle | Use when | Shape |
|---|---|---|
| Problem | the reader has a pain they already feel | name the pain in their words |
| Contrast | two approaches give different results | A looks right, B works |
| Number | there is a real, sourced figure | the figure plus what it changes |
| Mistake | people commonly do the wrong thing | "the error that costs you X" without inventing X |
| Myth | a belief is widely held and wrong | state the belief, then break it |
| How-to | the reader wants a result | the result, then the count of steps |

Write three hooks in three angles, pick one, and say why in a sentence. The cover promises; every later slide pays that promise off.

## 3. Slide anatomy

Default order for 6 to 10 slides:

1. **Hook** (cover): the promise, nothing else.
2. **Problem**: why it matters now, in one statement.
3. **Points** (2 to 5 slides): one point each, with a concrete example where possible.
4. **Proof**: a sourced figure, a before and after, or a quote the user supplied.
5. **CTA**: one action, one contact the user gave for this campaign.

Pick the layout kind from the content: a figure is `stat`, two options are `compare`, three or four parallel items are `points` or `list`, a supplied quote is `quote`, a single claim is `statement`.

## 4. Swipe rhythm

- Open a loop on the cover; close it on the last content slide.
- Alternate dense and light: after a slide with a list, give one short statement.
- End slide titles so the next one feels needed ("The second check is cheaper.").
- Never repeat the cover headline later; never end with a slide that only says thanks.

## 5. CTA patterns

One action per carousel. Verbs first, two or three words on the button. Match the ask to the reader's stage: save or share for cold readers, a free check or a question for warm ones. Use the brand's `cta.standard` line for the pillar when one exists. The contact (phone, email or link) is asked per campaign. Never assume one.

## 6. Caption formula

Follow the brand's `voice.caption_formula`; the default is hook, body, proof, CTA. The caption repeats no slide verbatim. It gives the reason to open the carousel, one or two lines of substance, one sourced fact if there is one, then the single CTA.

## 7. Evidence rule

Every number needs a source and a date: statistics, percentages, years, counts, prices. Put them in the slide's `claims`. No source from the user or from research done in this session means `needs_confirmation: true` and a direct question. Do not round up, do not "about" a figure you do not have, do not borrow a figure from memory. Hard rules in the brand profile (no prices, no client names) always win over a good story.

## 8. Voice

Voice comes from `brand.json`: point of view, address form per platform, tone, words to use and avoid, emoji limit, exclamation and capital-letter rules. Read them before writing the first line. Write plain sentences the audience would say out loud.

## Optional skills

If `brand.json.knowledge` names hook, script or humanizer skills and they are installed in this session, `/carousel:make` uses them for those roles (hook generation and audit, script structure, final language polish). Such skills are optional, user-installed and not bundled with this plugin. When a named skill is not installed, use this guide and the references instead; the engine's `knowledge` command reports which case applies.
