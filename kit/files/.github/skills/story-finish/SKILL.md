---
name: story-finish
description: Finish a story before opening a pull request - run tests, check every scenario has a test, verify against the OpenSpec change, check and refresh context, save what was learned about the area, and draft the PR description. Use when asked to "finish the story", "wrap up", "prepare the PR" or after /opsx-apply completes.
---

# Story finish

Goal: a pull request a reviewer can approve quickly, with specs, code and context in agreement.

**Story across several repos:** run these steps once per repo that changed, producer first (services,
then UIs). Each repo gets its own PR with its own change folder and context fixes. Each PR description
links the other PRs and says which must merge first.

## Steps
1. **Tasks.** If there is an OpenSpec change, open `openspec/changes/<change-id>/tasks.md`;
   otherwise use the plan agreed earlier in the conversation. List anything unfinished and ask the
   user whether to finish it or move it to a follow-up.
2. **Tests.** Run the test command from AGENTS.md. Fix failures caused by this change; report others.
   Then go through every scenario in the change's delta specs (or every acceptance check in
   `docs/stories/<story-id>/plan.md` without OpenSpec) and name the test that covers it. List any that
   have no passing test, or say why the check is manual.
3. **Impact.** If the code map exists, run `graphify update .` and then `graphify affected "<ClassName>"`
   for each class this change modified. For each dependent, confirm it is covered by a test or not
   affected. Add an "Impact" list to the PR description.
4. **Verify.** If `/opsx-verify` was already run for this change after the last code edit, use its
   report. Otherwise, if the command is installed, ask the user to run it now (it checks the code against
   the requirements, scenarios and `design.md` if there is one). Without it, go through each scenario in the change's
   delta specs and state where the code and a test cover it.
5. **Context.** Run `node .ai-kit/context-tools.cjs check --base <base>` (in a product workspace, the
   home repo's copy with `--repo <repo>`), where `<base>` is
   the branch this PR targets (run `git branch -r` if unsure; for example `origin/main` or
   `origin/develop`). If the check says the base does not exist, run `git fetch` and try again.
   For each finding, follow the `context-update` skill. Context edits go in this same PR.
   Then run `pages-for` on the files this PR changed and confirm each context page it names was either
   updated in this PR or is still true. For a page in the product hub, draft its change and tell the user it needs a PR in the
   hub repo, linked from this one. If the repo has a `docs/context/readiness.md`, a reviewed page you
   changed keeps counting as reviewed only if a reviewer checks it in this PR and adds a `verified` line;
   otherwise set it back to `status: draft`.
6. **Promote what this story taught (only if it applies).** Ask: did understanding an area take a lot of
   tracing (many files read, a flow across UI, API, service and database, or a wrong first guess), and
   does `docs/context/` have no page for it? If yes, and the area will be changed again, offer to turn
   what was verified about the area (from `design.md` if there is one, the plan and the code you read)
   into `docs/context/<area>.md` using
   `references/area-page.template.md`: under ~150 lines, every step anchored, rules only when the code or
   a test shows them, everything else under "Unverified". Add one line for it to AGENTS.md "Where to
   look". If the area already has a page, update only the lines this story changed. If neither applies,
   skip this step and say so.
7. **PR description.** Draft it from the change folder (or, without OpenSpec, from the agreed plan
   and the diff):
   - Story id and one-line summary
   - What changed, grouped by area
   - Requirements and scenarios or acceptance checks covered, with the test that proves each
   - Link to `design.md` or `plan.md`, if there is one
   - Context files updated, and why
   - Impact (dependents checked) and how it was tested
   - Link to `openspec/changes/<change-id>/` if there is one
8. **Hand over.** Show the description and the list of changed files. The user decides how to commit,
   push and open the PR. If the user asks you to do it, use the terminal for git and the Azure DevOps
   tool (if connected) for the pull request, and show each command before running it.
9. **Archive.** With OpenSpec, once reviewers have approved the PR, run `/opsx-archive <change-id>` and
   push it as the last commit of the same PR, so the specs in `openspec/specs/` change together with the
   code (no second PR to the main branch). If the team prefers archiving after merge, do that instead.
   In every case, if an agent was corrected during this story, `/context-learn` turns the correction
   into a rule.

## Finish
End your reply with this block, filled in:
- **What changed:** code, tests, context pages and change-folder files in this PR, grouped, as links.
- **Checks:** tests (passed / failed), scenarios without a test, verify result, `context-tools check`
  (errors, warnings), dependents checked.
- **Next:** the user's own steps: review the diff, commit, push, open the PR with the drafted description;
  after approval, `/opsx-archive <change-id>` as the last commit. For a multi-repo story, which repo is next.
