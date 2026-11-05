---
name: story-to-change
description: Start a user story the spec-driven way - read the story, size it, gather only the context it needs, and prepare an OpenSpec change. Use when asked to "start story <ID>", "plan this story", "pick up <work item>" or before running /opsx-propose.
---

# Story to change

Goal: give the planning step exactly the context this story needs, and nothing global.

## Steps
1. **Get the story.** If an Azure DevOps or Jira tool is connected, read the work item (title,
   description, acceptance criteria, linked items). Otherwise ask the user to paste it.
   Restate it in 3–5 lines and list acceptance criteria as numbered checks (AC1, AC2…).
2. **Find what it touches.**
   - **With the code map (preferred, if `graphify-out/graph.json` exists):** call the graphify MCP tool
     `query_graph` with the story's topic (token_budget about 1500), then `get_neighbors` on the main
     classes. Then run `graphify affected "<ClassName>"` in the terminal for each class you expect to
     change: it lists everything that depends on it (callers, references, subclasses). If a name is
     ambiguous, Graphify lists candidate ids; repeat with the full id. If the report says the map is
     older than HEAD, run `graphify update .` first (local, a few seconds).
   - **Without it:** search for the endpoints, components, services and tables the story involves.
   List the 3–8 files that matter and why, plus the dependents that may need tests.
   In a window with several repos, say which repo each file is in.
3. **Collect relevant knowledge only.**
   - Current behaviour: the specs in `openspec/specs/` for the domains touched (if any exist yet).
   - Rules: the AGENTS.md lines and `.github/instructions/` files that apply to those files.
   - Area pages and traps: the `docs/context/` page for the area, if there is one, and matching
     entries in `docs/context/known-traps.md`.
   - Contracts: API definitions (OpenAPI files, DTOs) the story changes or calls.
   Do not read `openspec/changes/archive/` or `docs/stories/` unless the user asks about past stories.
4. **Size it** and say which path you recommend; the user decides:
   - **Tiny** (a fix in one or two files, no change to API, data or permissions): no change folder.
     Write a failing test that shows the problem, fix it, run the tests, then `/story-finish`.
   - **Small** (one repo, one layer or a small slice): an OpenSpec change; the technical design will be
     the short "Lite" form.
   - **Normal** (several layers, an API or data change, or more than one repo): an OpenSpec change in each
     repo that changes, producers first (database and service before the UI).
5. **List open questions** for the product owner or tech lead (unclear rules, edge cases, data limits,
   permissions). Ask them now if the user is available.
6. **Write the pack** (under ~150 lines): story summary, acceptance checks, files that matter,
   relevant rules and traps, open questions and answers.
   - **If the repo has an `openspec/` folder and the story is not tiny:** choose a change id in
     kebab-case that starts with a verb (e.g. `add-report-excel-export`). Create the change FIRST with
     `openspec new change <change-id>` (it records the workflow from `openspec/config.yaml`), then save
     the pack as `openspec/changes/<change-id>/context.md`.
   - **Otherwise:** show the pack in the chat. Save it as a file only if the user asks, and never
     inside permanent context folders (`docs/context/`, `.github/instructions/`).
7. **Hand over.**
   - With OpenSpec: tell the user to run `/opsx-propose <change-id>` and, when it says the change already
     exists, to choose **continue** (the change was created in step 6 so `context.md` could go in it).
     Do not write the change documents yourself. With the kit's `story-tdd` workflow (check `schema:`
     in `openspec/config.yaml`), propose creates proposal, specs, `design.md` (the technical design
     document), `test-plan.md` and test-first `tasks.md`.
   - Without OpenSpec (small or normal story): write two documents in `docs/stories/<story-id>/` and
     wait for the user to approve them before changing any code:
     - `technical-design.md` from `references/technical-design.template.md` (the "Lite" form for a
       small story: Overview, Approach, Changes by layer, Risks). If the team has its own TDD skill,
       use that instead.
     - `test-plan.md` from `references/test-plan.template.md`: each acceptance check mapped to a
       named test, plus extra cases and regression.
     Then list the ordered steps, test-first: for each layer, write its tests from the plan, confirm
     they fail, then implement until they pass.
