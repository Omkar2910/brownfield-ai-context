---
name: context-learn
description: Turn a mistake, review comment, incident or repeated question into a short context rule in the right file, with a reason and anchor. Use when asked to "learn from this", "remember this rule", "add a rule", "the agent got X wrong", or after correcting an agent.
---

# Context learn

Goal: fix a gap in the context once, for everyone, without bloating it.

## Steps
1. **Understand what happened.** From the user's message or the recent conversation: what was done, what
   was right instead, and why. If the reason is unclear, ask; a rule without a reason is often misapplied.
2. **Check it isn't already covered.** Search `AGENTS.md`, the rule files (`.github/instructions/`,
   `.claude/rules/`) and `docs/context/`. If a line covers it but was missed, make that line clearer instead.
3. **Pick the narrowest place** (stop at the first match):
   - true for almost every task and costly to get wrong → `AGENTS.md`, "Rules that are not obvious"
   - only for certain files → the matching rule file (create one with a tight glob if none fits). If the
     repo is also used with Codex, which reads only `AGENTS.md` files, put it in a nested `AGENTS.md` in
     that folder instead.
   - a trap in one area, with history → `docs/context/known-traps.md`
   - a fact about one table → its page in `docs/context/data/tables/`, outside the generated markers
   - a multi-step procedure → suggest a new skill instead of a rule
   - only about the current task → do not add it to permanent context; say so
   - true for every repo in the organisation → do not add it here; draft it for the org context repo
4. **Write one line.** `<rule>. <reason in a few words>. [anchor: <path or glob>]`. Concrete names from the
   code; no generic advice.
5. **Check the budget.** Run `node .ai-kit/context-tools.cjs status`. If `AGENTS.md` is over ~100 lines,
   propose a line to move to a scoped file or `docs/context/` in exchange.

## Finish
End your reply with this block, filled in:
- **What changed:** the file and the line added or changed, as a diff, and why that file.
- **Checks:** `status` (AGENTS.md lines, always-on tokens).
- **Next:** commit it with the current change or in a small context pull request.
