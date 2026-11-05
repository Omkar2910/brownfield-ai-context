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
3. **The code map.** If `graphify-out/` exists: show the top "God Nodes" from `GRAPH_REPORT.md` (the
   central classes) and suggest opening `graphify-out/graph.html` in a browser to explore. Show one
   `graphify affected "<a central class>"` result to explain why changes there need care.
4. **How context is organised.** AGENTS.md (always read), .github/instructions/ (loaded for matching
   files), docs/context/ (read when needed, including area pages for complex flows), openspec/specs/ (current behaviour), openspec/changes/
   (work in progress), skills in .github/skills/. Open one example of each.
5. **How we build a story.** /story-to-change (sizes the story) → /opsx-propose (proposal, specs,
   technical design, test plan, test-first tasks) → review → /opsx-apply → /story-finish → pull request
   → /opsx-archive once the PR is approved. Tiny fixes skip the change folder: failing test, fix, finish.
6. **Worked examples.** List the most recent folders in openspec/changes/archive/ and walk through one:
   proposal, delta spec, technical design (`design.md`), test plan, tasks, and the code that changed.
7. **First task.** Suggest a small open story and offer to run /story-to-change together.

End by asking: "What did you have to ask a person about today?" Write the answers down as possible
gaps in the context for the tech lead.
