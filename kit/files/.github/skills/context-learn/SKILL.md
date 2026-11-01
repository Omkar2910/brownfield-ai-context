---
name: context-learn
description: Turn a mistake, review comment, incident or repeated question into a short context rule in the right file, with a reason and anchor. Use when asked to "learn from this", "remember this rule", "add a rule", "the agent got X wrong", or after correcting an agent.
---

# Context learn

Goal: fix a gap in the context once, for everyone, without bloating it.

## Steps
1. **Understand what happened.** From the user's message or the recent conversation: what was done,
   what was right instead, and why. If the reason is unclear, ask for it; a rule without a reason is
   often misapplied.
2. **Check it isn't already covered.** Search AGENTS.md, `.github/instructions/` and `docs/context/`.
   If an existing line covers it but was missed, make that line clearer instead of adding a new one.
3. **Pick the narrowest place** (stop at the first match):
   - true for almost every task and costly to get wrong → `AGENTS.md`, "Rules that are not obvious"
   - only for certain files → the matching `.github/instructions/*.instructions.md` (create one with a
     tight `applyTo` if none fits)
   - a trap in one area, with history → `docs/context/known-traps.md`
   - a multi-step procedure → suggest a new skill instead of a rule
   - only about the current task → do not add it to permanent context; say so
4. **Write one line.** Format: `<rule>. <reason in a few words>. [anchor: <path or glob>]`.
   Use concrete names from the code. No generic advice.
5. **Check the budget.** Run `node .github/hooks/scripts/context-tools.cjs status`. If AGENTS.md is
   over ~100 lines, propose a line to move to a scoped file or `docs/context/` in exchange.
6. **Show the diff** and the reason for the chosen file. The user commits it with their change, or in a
   small context PR.
