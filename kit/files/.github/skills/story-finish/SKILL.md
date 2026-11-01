---
name: story-finish
description: Finish a story before opening a pull request - run tests, verify against the OpenSpec change, check and refresh context, and draft the PR description. Use when asked to "finish the story", "wrap up", "prepare the PR" or after /opsx-apply completes.
---

# Story finish

Goal: a pull request a reviewer can approve quickly, with specs, code and context in agreement.

## Steps
1. **Tasks.** Open `openspec/changes/<change-id>/tasks.md`. List any unchecked tasks and ask the user
   whether to finish them or move them to a follow-up.
2. **Tests.** Run the test command from AGENTS.md. Fix failures caused by this change; report others.
3. **Verify.** If the `/opsx-verify` command is installed, tell the user to run it now (it checks the
   code against the change's requirements and scenarios). Otherwise, go through each scenario in the
   change's delta specs and state where the code and a test cover it.
4. **Context.** Run `node .github/hooks/scripts/context-tools.cjs check --base origin/<main-branch>`.
   For each finding, follow the `context-refresh` skill. Context edits go in this same PR.
5. **PR description.** Draft it from the change folder:
   - Story id and one-line summary
   - What changed, grouped by area (from tasks.md)
   - Requirements and scenarios covered (from the delta specs)
   - Context files updated, and why
   - How it was tested
   - Link: `openspec/changes/<change-id>/`
6. **Hand over.** Show the description and the list of changed files. The user decides how to commit,
   push and open the PR. If the user asks you to do it, use the terminal for git and the Azure DevOps
   tool (if connected) for the pull request, and show each command before running it.
7. **Remind** the user that after the PR merges, `/opsx-archive <change-id>` merges the specs into
   `openspec/specs/`.
