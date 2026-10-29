# Captions and CTA lines

## Formula

Use `voice.caption_formula` from the brand profile. The default is four parts:

1. **Hook**: the reason to open the carousel, in one line. It is not the cover headline copied.
2. **Body**: one to three short lines of substance that stand on their own for readers who do not swipe.
3. **Proof**: one sourced fact, only if there is one. Skip the part otherwise.
4. **CTA**: one action, with the contact the user gave for this campaign.

## Rules

- Follow the brand: address form per platform, emoji limit, avoid list, no exclamation marks when banned.
- Repeat no slide verbatim.
- Any number in the caption must already be in a slide's `claims` with source and date.
- Honor length limits in `platforms` for the target platform. When a limit is unknown, keep the caption short.
- One CTA. If the caption has two asks, the reader does neither.
- No price text if `hard_rules.no_prices` is true. No client names from the blocklist.
- Hashtags only if the brand uses them; keep them few and relevant, after the CTA.

## Platform notes

- Instagram: the first line shows before the "more" cut, so put the hook there. Keep emoji within the brand's limit.
- LinkedIn: more formal address, usually no emoji, a slightly longer body is fine. Start with the claim, not a greeting.

## CTA line patterns

Pick the ask by reader stage:

| Stage | Ask | Shape |
|---|---|---|
| Cold | save or share | "Save this for your next [task]." |
| Warm | a question | "Which of these do you check first? Tell us below." |
| Ready | contact | "Want [result]? Message us on [contact]." |

Contact lines use the campaign contact exactly as the user gave it. If none was given, ask before writing the caption. Never invent or reuse one.

Buttons on the last slide follow `cta.button.label_style` (for example verb first, two or three words).

## Review before Gate 2

- Read the caption next to the contact sheet. Do they say the same thing?
- Is the first line strong without the image?
- Is the CTA the same one the last slide shows?
- Does every number have a source on record?
