---
name: onboard-me
description: Guided tour of this repository and its AI workflow for a new team member. Use when someone says "onboard me", "I'm new here", "explain this project" or "where do I start".
---

# Onboard me

Give a 15-minute guided tour. Ask the person's role first (developer, QA, BA) and adjust the depth.

1. **The service in one picture.** From AGENTS.md and docs/context/architecture.md: what it does,
   who calls it, what it calls, how a request flows.
2. **Rules you must not break.** The non-obvious rules in AGENTS.md and the top 3 traps from
   docs/context/known-traps.md, each with its reason.
3. **How context is organised.** AGENTS.md (always read), .github/instructions/ (loaded for matching
   files), docs/context/ (read when needed), openspec/specs/ (current behaviour), openspec/changes/
   (work in progress), skills in .github/skills/. Open one example of each.
4. **How we build a story.** /story-to-change → /opsx-propose → review → /opsx-apply → /story-finish →
   pull request → /opsx-archive after merge.
5. **Worked examples.** List the most recent folders in openspec/changes/archive/ and walk through one:
   proposal, delta spec, tasks, and the code that changed.
6. **First task.** Suggest a small open story and offer to run /story-to-change together.

End by asking: "What did you have to ask a person about today?" Write the answers down as possible
gaps in the context for the tech lead.
