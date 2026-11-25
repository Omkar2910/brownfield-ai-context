---
name: kit-setup
description: Set up, extend or upgrade the AI Context Kit. Install it for repos, add a repo to the product workspace, add an agent (Copilot, Claude Code, Codex), add the pull request check, upgrade to a newer kit, link a teammate's clone, or check that everything works. Use when asked to "install the kit", "set up", "upgrade", "add a repo", "add Codex", "is the kit working".
---

# Kit setup

1. **Find the kit folder:** a folder next to this repo (or next to the home repo) that contains
   `kit/setup.mjs`. If there is none, ask the person where their team keeps the kit (`.ai-kit/kit.json` may name
   it under `source`) and to put a copy next to the repos.
2. **Follow `<kit>/kit/SETUP-AGENT.md`** from step 1: look, ask in one message, show the plan, run it after a
   yes, then offer context and the rest.

Every change goes through `node <kit>/kit/setup.mjs`; never copy kit files or write install commands yourself.
Never commit, push or run `review`.

## Finish
End your reply with this block, filled in:
- **What changed:** each repo and what happened to it.
- **Checks:** the `doctor` results.
- **Next:** the one or two things the person does next.
