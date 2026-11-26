## Story
<!-- Work item link (e.g. AB#48213) and one-line summary. Title: <prefix>: <id> <what changed>, e.g.
     feat: 48213 Export reports to Excel (feat, hotfix, fix, maint; see .ai-kit/conventions.json).
     Promotion between sprint and release branches: promote: feature_20 to release_20 -->

## What changed
<!-- Grouped by area. /story-finish drafts this from openspec/changes/<change-id>/ -->

## Spec
- OpenSpec change: `openspec/changes/<change-id>/`
- [ ] The plan (OpenSpec proposal, specs, design if any, tasks; or `plan.md`) was reviewed before implementation, including the fresh-eyes design review
- [ ] `/opsx-verify` (or a manual scenario walk-through) done

## AI context (same-PR rule)
Did this PR change a command, convention, trap, contract or integration?
- [ ] No
- [ ] Yes, and the context files are updated in this PR
- [ ] `node .ai-kit/context-tools.cjs check` shows no errors (the pull request check runs it too)

## Testing
- [ ] Every spec scenario or acceptance check has a test that exists and passes, or says why it is manual
<!-- Anything else about how it was tested -->

<!-- Reviewers: tag comments where an AI agent got something wrong with #agent-miss -->
