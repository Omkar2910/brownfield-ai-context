---
name: story-to-change
description: Start a user story the spec-driven way - read the story, gather only the context it needs, and prepare an OpenSpec change. Use when asked to "start story <ID>", "plan this story", "pick up <work item>" or before running /opsx-propose.
---

# Story to change

Goal: give the proposal step exactly the context this story needs, and nothing global.

## Steps
1. **Get the story.** If an Azure DevOps or Jira tool is connected, read the work item (title,
   description, acceptance criteria, linked items). Otherwise ask the user to paste it.
   Restate it in 3–5 lines and list acceptance criteria as numbered checks.
2. **Find what it touches.** Search the code for the entry points (endpoints, components, services,
   tables) the story involves. If a code-graph tool such as Graphify is available, use its query
   and path commands instead of reading many files. List the 3–8 files that matter and why.
3. **Collect relevant knowledge only.**
   - Current behaviour: the specs in `openspec/specs/` for the domains touched (if any exist yet).
   - Rules: the AGENTS.md lines and `.github/instructions/` files that apply to those files.
   - Traps: matching entries in `docs/context/known-traps.md`.
   - Contracts: API definitions (OpenAPI files, DTOs) the story changes or calls.
4. **List open questions** for the product owner or tech lead (unclear rules, edge cases, data limits,
   permissions). Ask them now if the user is available.
5. **Write the pack** (under ~150 lines): story summary, acceptance checks, files that matter,
   relevant rules and traps, open questions and answers.
   - **If the repo has an `openspec/` folder:** choose a change id in kebab-case that starts with a
     verb (e.g. `add-report-excel-export`) and save the pack to `openspec/changes/<change-id>/context.md`.
   - **Otherwise:** show the pack in the chat. Save it as a file only if the user asks, and never
     inside permanent context folders (`docs/context/`, `.github/instructions/`).
6. **Hand over.**
   - With OpenSpec: tell the user to run `/opsx-propose <change-id>` and mention `context.md`.
     Do not write proposal, design or tasks yourself.
   - Without OpenSpec: propose a short plan (files to change, ordered steps, tests to add, risks)
     and wait for the user to approve it before changing any code.
