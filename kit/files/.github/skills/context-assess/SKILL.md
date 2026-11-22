---
name: context-assess
description: Rate this repo's context readiness on the 12-dimension scale (0-100) with evidence - code understanding, architecture, business domain, data, API, dependencies, security, testing, operations, decisions, provenance, freshness. Use when asked for a "readiness score", "context readiness", "how AI-ready is this repo", or after deep pages are reviewed.
---

# Context assess

Goal: an honest readiness score that the team and its leaders can trust, backed by evidence, and the three
gaps that would raise it most.

## Rating scale (each dimension 0-5)
| Rating | Meaning | Evidence needed |
| --- | --- | --- |
| 0 | Missing | Nothing usable exists |
| 1 | Fragmented | Minimal, scattered or largely outdated |
| 2 | Partial | Some usable context; significant gaps or needs manual interpretation |
| 3 | Usable | Key context documented and accessible; known gaps recorded |
| 4 | Strong | Comprehensive, traceable (anchored) and reviewed against the current code |
| 5 | Verified | Complete, current, and independently verified by someone who did not write it |

## Steps
1. Run `node .ai-kit/context-tools.cjs readiness --json`. For each dimension it gives the pages found, their
   status, anchor counts, broken or stale anchors, and a **cap**: the highest rating the evidence allows (a
   draft page caps at 2, a reviewed page at 4, 5 needs an independent review). Provenance and freshness are
   measured, not rated.
2. For each rated dimension, open its pages and judge them against the scale: are the important parts
   covered (for data: the tables the main flows use; for security: every permission check path), are the
   Unverified lists short, do spot-checks of 3 anchored lines match the code? Rate it, never above the
   cap. Write one line of evidence and the main gap.
   - code-understanding: `AGENTS.md` (commands, rules, traps), rule files, the code map.
   - domain: also counts `openspec/specs/`; for UI repos, `screens.md`.
   - decisions: decision pages, plus archived `design.md` files with a Decisions section.
3. Fill `docs/context/readiness.md` (create it from the `context-create` skill's
   `references/pages/readiness.md` if missing): one row per dimension. Set "Independent check" to yes only
   if the user confirms a second person reviewed that dimension.
4. Run `node .ai-kit/context-tools.cjs readiness` again: it combines your ratings with the caps and prints
   the weighted score, the band and the points lost per dimension. Append one line to the History section:
   `<date> · <score> · <band> · <who>`.

## Honesty rules
- The score measures context, not results. Report it next to the always-loaded size from the same output,
  and next to the story log's outcomes if there are any.
- Never raise a rating because a page is long. Length is not coverage.
- Weights and band names come from `.ai-kit/readiness.json` if the team or organisation has one.

## Finish
End your reply with this block, filled in:
- **What changed:** `docs/context/readiness.md` (link) and the History line added.
- **Checks:** the score table, total and band, and the always-loaded size.
- **Next:** the top three gaps by points lost, each with the step that fixes it (`/context-create deep
  <page>` for a missing page, the owner's review for a draft, `/context-update` for stale anchors, a
  second reviewer for 5s).
