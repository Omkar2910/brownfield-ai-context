---
name: story-to-change
description: Start a user story the spec-driven way - read the story, find what it touches in every repo open in the window, size it, gather only the context it needs, show the pack in the chat and prepare one OpenSpec change per repo that changes. Use when asked to "start story <ID>", "plan this story", "pick up <work item>" or before running /opsx-propose.
---

# Story to change

Goal: give the planning step exactly the context this story needs, in every repo it touches, and
nothing global. The user reads the result in the chat; files are only a copy for the next steps.

## Steps
1. **See what is open, and what the user asked for.** List the repos in this window (each workspace
   folder that is a git repo; a window can hold one UI and several services). For each, note in one
   line: has `openspec/`? has `graphify-out/graph.json`? A folder with `catalog.json` and
   `scripts/hub.mjs` is the product context hub: note it, it is not a repo to change.
   **Scope from the prompt:** if the user named repos ("in report-service and report-ui"), search only
   those plus what they directly call. If they said they are not sure, or named none, search every
   repo in the window. Never ask for scope up front; ask only in step 5 if the search leaves it unclear.
2. **Get the story.** If an Azure DevOps or Jira tool is connected, read the work item (title,
   description, acceptance criteria, linked items). Otherwise ask the user to paste it.
   Restate it in 3–5 lines and list acceptance criteria as numbered checks (AC1, AC2…).
3. **Find what it touches, in every repo.** Search each repo the story could involve, not just the
   first one that answers.
   - **Repos with a code map:** run the map's command line against that repo's own map, so the answer
     is never from the wrong repo:
     `graphify query "<story topic>" --budget 1000 --graph <repo>/graphify-out/graph.json`
     then, for each class you expect to change,
     `graphify affected "<ClassName>" --graph <repo>/graphify-out/graph.json`
     (it lists callers, references and subclasses; if a name is ambiguous, repeat with the full id it
     lists). With a single repo open, the graphify MCP tools (`query_graph`, `get_neighbors`) work too.
     If the map's report says it is older than HEAD, run `graphify update <repo>` first (a few seconds).
     At most two queries per repo; stop when you have the files.
   - **Repos without one:** search for the endpoints, components, services and tables involved.
   - **Across repos:** match the UI's HTTP calls to the service's endpoints (path and method) to confirm
     which service each UI change depends on.
   - **Connections outside the window:** note outgoing calls from a repo you will change to a service
     that is not open (base URLs in config, HTTP or Feign clients, module federation remotes). If the
     product hub is open, run `node <hub>/scripts/hub.mjs impact <repo>` for each repo you will change:
     it lists the repos that call or load it, including ones that are not open.
   Keep 3–8 files per repo that matter, and the dependents that may need tests.
4. **Collect relevant knowledge only,** from each repo that changes:
   - Current behaviour: specs in its `openspec/specs/` for the domains touched (if any).
   - Rules: its AGENTS.md lines and `.github/instructions/` files that apply to those files.
   - Area pages and traps: its `docs/context/` page for the area, and matching `known-traps.md` entries.
   - Contracts: the API definitions (OpenAPI files, DTOs) the story changes or calls.
   Do not read `openspec/changes/archive/` or `docs/stories/` unless the user asks about past stories.
5. **Size it and order it.** Say which path you recommend; the user decides.
   - **Tiny** (one or two files in one repo, no API, data or permission change): no change folder.
     Failing test that shows the problem, fix, run the tests, then `/story-finish`.
   - **Small** (one repo, one layer or a small slice): one OpenSpec change; "Lite" technical design.
   - **Normal** (several layers, an API or data change, or more than one repo): one OpenSpec change
     **in each repo that changes**, all with the same change id.
   Order the repos producers first: database and services before the UIs that call them. Put every repo
   in one of three groups: **changes**, **read only** (needed for a contract or an example, gets no
   change folder), **connected but not open** (calls or is called by a repo that changes).
   **Ask one question only when it is unclear:** the story matches code in more than one candidate repo,
   a repo you will change has a consumer or provider that is not open and the change touches that
   contract, or the user said they are not sure. Ask it with the groups in front of the user, e.g.
   "This changes report-service and report-ui. report-service is also called by admin-mfe, which isn't
   open, and the export endpoint is changing. Include admin-mfe (add it to the window), or is it
   unaffected?" Otherwise do not ask; carry on.
6. **List open questions** for the product owner or tech lead (unclear rules, edge cases, data limits,
   permissions, which service owns a new field). Ask them now if the user is available.
7. **Show the pack in the chat** using `references/story-pack.template.md`. Always in the chat, whether
   or not OpenSpec is set up: it is what the user reads and clicks through. Link every file you name,
   with its path from the workspace, so it opens with one click. Keep it under ~150 lines.
8. **Save the change folders** (not for tiny stories).
   - Choose one change id for the whole story, in kebab-case, starting with the work item number and a
     verb (e.g. `wi1234-add-report-export`). Use the same id in every repo.
   - For **each repo that changes and has `openspec/`**, in that repo's folder: run
     `openspec new change <change-id>` FIRST (it records the workflow from that repo's
     `openspec/config.yaml`), then save `openspec/changes/<change-id>/context.md`: the full pack, with
     that repo's section first and the other repos' sections kept short, so a reviewer of this repo
     still sees the whole story and where the other half lives.
   - For a repo that changes but has **no `openspec/`**: say so plainly and ask whether to set it up now
     (`openspec init --tools github-copilot --no-copilot-cloud`, then the kit installer again in that
     repo) or plan that repo without OpenSpec (see step 9). Do not silently treat the whole story as
     "no OpenSpec" because one repo lacks it.
   - Then add one line to the chat per repo: the clickable path of each `context.md` you wrote.
9. **Hand over, one repo at a time, in the order from step 5.**
   - With OpenSpec, for each repo: the user runs `/opsx-propose <change-id>` and names the repo
     ("in report-service"), because in a window with several repos the commands and the terminal
     otherwise default to the first folder. When propose says the change exists, choose **continue**.
     Plan the producer first; plan a consumer only after the producer's plan is approved, and point it at
     the producer's `design.md` for the API instead of restating it. Do not write the change documents
     yourself. With the kit's `story-tdd` workflow (check `schema:` in that repo's
     `openspec/config.yaml`), propose creates proposal, specs, `design.md` (the technical design
     document), `test-plan.md` and test-first `tasks.md`.
   - Without OpenSpec (small or normal story, in that repo): write two documents in that repo's
     `docs/stories/<story-id>/` and wait for approval before changing any code:
     - `technical-design.md` from `references/technical-design.template.md` (the "Lite" form for a
       small story: Overview, Approach, Changes by layer, Risks). If the team has its own TDD skill,
       use that instead.
     - `test-plan.md` from `references/test-plan.template.md`: each acceptance check mapped to a
       named test, plus extra cases and regression.
     Then list the ordered steps, test-first: for each layer, write its tests from the plan, confirm
     they fail, then implement until they pass.
