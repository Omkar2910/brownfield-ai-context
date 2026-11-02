---
name: context-refresh
description: Update AI-agent context files (AGENTS.md, .instructions.md, docs/context) after code changes or before archiving an OpenSpec change. Use when asked to "refresh context", "update AGENTS.md", or when the context check reports broken or stale anchors.
---

# Context refresh

Goal: change only the context lines whose facts changed. Never rewrite context files wholesale.

## Steps
0. If `graphify-out/graph.json` exists, run `graphify update .` so the code map matches the code
   (local, no API key). For a moved or renamed class, `graphify query "<old name>"` helps find where it went.
1. Run `node .github/hooks/scripts/context-tools.cjs check --base origin/<main-branch>` (ask the user
   for the main branch name if unsure; `main`, `master` and `develop` are common). Collect:
   - ERROR lines: an anchor points at a file that no longer exists.
   - WARN lines: anchored code changed but the context file did not.
2. If the user names an OpenSpec change, read its `proposal.md` and `design.md` first. Note any new
   convention, trap, command, permission or contract the change introduced.
3. For each finding, open the anchored code and decide one of:
   - update the line (the fact changed),
   - move the anchor (the code moved, the fact is the same),
   - delete the line (no longer true or no longer needed),
   - leave it (still true; say so).
4. Add a new line only if it passes `../context-bootstrap/references/prune-checklist.md`.
5. Run the check again until there are no ERROR lines.
6. Report each edit as `file: old → new (reason)`. The user reviews it in the same pull request as the code.
