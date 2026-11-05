---
name: story-finish
description: Finish a story before opening a pull request - run tests, verify against the OpenSpec change, check and refresh context, and draft the PR description. Use when asked to "finish the story", "wrap up", "prepare the PR" or after /opsx-apply completes.
---

# Story finish

Goal: a pull request a reviewer can approve quickly, with specs, code and context in agreement.

## Steps
1. **Tasks.** If there is an OpenSpec change, open `openspec/changes/<change-id>/tasks.md`;
   otherwise use the plan agreed earlier in the conversation. List anything unfinished and ask the
   user whether to finish it or move it to a follow-up.
2. **Tests.** Run the test command from AGENTS.md. Fix failures caused by this change; report others.
   Then open the test plan (`openspec/changes/<change-id>/test-plan.md`, or
   `docs/stories/<story-id>/test-plan.md` without OpenSpec). Every row must name a test that exists
   and passes, or say why it is manual. Set each row's Status, and list any row still `planned`.
3. **Impact.** If the code map exists, run `graphify update .` and then `graphify affected "<ClassName>"`
   for each class this change modified. For each dependent, confirm it is covered by a test or not
   affected. Add an "Impact" list to the PR description.
4. **Verify.** If the `/opsx-verify` command is installed, tell the user to run it now (it checks the
   code against the change's requirements and scenarios). Otherwise, go through each scenario in the
   change's delta specs and state where the code and a test cover it.
5. **Context.** Run `node .github/hooks/scripts/context-tools.cjs check --base origin/<main-branch>`.
   For each finding, follow the `context-refresh` skill. Context edits go in this same PR.
6. **PR description.** Draft it from the change folder (or, without OpenSpec, from the agreed plan
   and the diff):
   - Story id and one-line summary
   - What changed, grouped by area
   - Requirements and scenarios or acceptance checks covered, with the test that proves each
     (from the test plan)
   - Link to the technical design (`design.md` or `technical-design.md`)
   - Context files updated, and why
   - Impact (dependents checked) and how it was tested
   - Link to `openspec/changes/<change-id>/` if there is one
7. **Hand over.** Show the description and the list of changed files. The user decides how to commit,
   push and open the PR. If the user asks you to do it, use the terminal for git and the Azure DevOps
   tool (if connected) for the pull request, and show each command before running it.
8. **Remind** the user what happens after the PR merges: with OpenSpec, `/opsx-archive <change-id>`
   merges the specs into `openspec/specs/`. In every case, if an agent was corrected during this
   story, `/context-learn` turns the correction into a rule.
