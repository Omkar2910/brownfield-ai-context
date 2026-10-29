---
name: story-to-change
description: Turn a Jira or Azure DevOps user story into a scoped OpenSpec change with a task-specific context pack. Use when asked to "start story <ID>", "plan REPORT-142", "create a change from this story" or before /opsx:propose on a cross-service story.
---

# Story to change

Goal: give the proposal step exactly the context this story needs, nothing global.

## Steps
1. Get the story text and acceptance criteria (from the user, or the Jira/ADO MCP tool if connected).
2. Identify affected repos using `context/system-map.md`. Mark the producer and consumers.
3. Build the context pack (keep it under ~150 lines):
   - Relevant behaviour specs from `openspec/specs/` (only the domains touched).
   - The producer's consumer brief from `contracts/<service>/consumer-brief.md`.
   - Code neighbourhood: if Graphify is available, `graphify query "<story topic>"` and
     `graphify path <entry> <target>` per repo; otherwise list the 3–6 files to read and why.
   - Applicable platform rules (links) and any traps from each repo's `docs/context/known-traps.md`.
   - Open questions for the product owner or tech lead.
4. Run `/opsx:explore` with the pack, then `/opsx:propose <change-id>`. Save the pack as
   `openspec/changes/<change-id>/context.md` so reviewers see what the agent was given.
5. Stop for human review of proposal, design and delta specs before any `/opsx:apply`.
