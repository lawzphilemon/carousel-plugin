# Slide anatomy and rhythm

## Slide budget

Respect `layout.slides` in the brand profile and the platform's `max_slides`. If the user gives `--slides S`, use S inside that range. Without it, 7 is a good default: hook, problem, three points, proof, CTA.

## The five parts

| Part | Job | Typical kind | Words |
|---|---|---|---|
| Hook | promise | `cover` | headline only, plus an optional kicker |
| Problem | why now | `statement` | one sentence of body at most |
| Points | the teaching | `points`, `list`, `compare` | one idea each |
| Proof | why believe it | `stat`, `quote`, `compare` | figure with source and date |
| CTA | one action | `cta` | headline, one line, a button label |

Skip proof when no sourced proof exists. Do not fill the slot with a vague claim.

## Choosing a kind

- One strong claim: `statement`.
- A figure with a label: `stat`. The figure and its source go in `claims`.
- Two options side by side: `compare` (`left` and `right`, each a title and a short body).
- Three or four parallel short items: `points` or `list` (`items`).
- A quote the user supplied, with attribution: `quote`.
- Closing action: `cta` with a `button` label in the brand's label style.

Do not use the same kind more than twice in a row.

## Writing a slide

1. State the one idea as a headline in the brand's headline case.
2. Add the smallest body that makes it usable: an example, a check or a consequence.
3. Cut every word that does not change what the reader does or understands.
4. Mark at most one phrase as `accent`. It must be a substring of the headline.

## Swipe rhythm

- Cover opens a question; the last content slide answers it.
- Alternate load: heavy slide (list, compare), light slide (single statement).
- Each slide's last line should make the next slide feel needed, not just follow.
- Put the strongest proof in the middle to late, not on the cover, unless the hook is a number.
- Do not end content early: the CTA follows the answer, it does not replace it.

## Common failures

- Two ideas on one slide (split it).
- A recap slide that repeats the cover (cut it).
- A CTA that asks for three things (keep one).
- A stat with no source (set `needs_confirmation` and ask).
- Body text near the word limit on every slide (vary the load).

## Checklist before Gate 1

- Count within the allowed range.
- Every slide states one idea.
- Every number has `claims` with `source` and `date`, or `needs_confirmation: true`.
- Only the contact the user gave for this campaign appears in the CTA.
- Voice rules from the brand profile hold on every slide.
