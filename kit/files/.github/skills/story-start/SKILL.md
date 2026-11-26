---
name: story-start
description: Start a user story the spec-driven way - read the story, find what it touches in every repo open in the window, size it, gather only the context it needs, show the pack in the chat, prepare one OpenSpec change per repo that changes, and get a fresh-eyes review of the plan before any code. Use when asked to "start story <ID>", "plan this story", "pick up <work item>" or before running /opsx-propose.
---

# Story start

Goal: give the planning step exactly the context this story needs, in every repo it touches, and
nothing global. The user reads the result in the chat; files are only a copy for the next steps.

**No person in the chat** (a cloud or background agent working from an assigned work item): do not wait
for answers. Take the most reasonable reading, write every assumption and open question at the top of
`context.md`, stop after the plan (step 9) and hand the plan back for approval. Never start code on a
normal-size story without an approved plan.

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
   - Rules: its AGENTS.md lines and the rule files (`.github/instructions/`, `.claude/rules/`) that apply to
     those files. `node .ai-kit/context-tools.cjs pages-for <file> ...` lists the context lines anchored to
     them (in a product workspace, run the home repo's copy with `--repo <repo>`).
   - Product pages: in a product workspace, `pages-for` also lists the home repo's pages anchored to those
     files (flows across repos, platform rules). Read every flow page it names: they hold what other repos
     rely on (event names, calls that must happen, field mapping) and the code of this repo cannot show it.
   - Area pages and traps: its `docs/context/` page for the area, and matching `known-traps.md` entries.
   - Data: the pages in `docs/context/data/tables/` for the tables the story reads or changes.
   - Contracts: the API definitions (OpenAPI files, DTOs) the story changes or calls.
   Read each page once; the story pack lists what you read, so later steps use the pack instead of reading
   the pages again. Do not read `openspec/changes/archive/` or `docs/stories/` unless the user asks about
   past stories.
5. **Size it and order it.** Say which path you recommend; the user decides.
   - **Tiny** (one or two files in one repo, no API, data or permission change): no change folder.
     Failing test that shows the problem, fix, run the tests, then `/story-finish`.
   - **Small** (one repo, one layer or a small slice): one OpenSpec change (or one `plan.md`).
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
   - Choose one change id for the whole story: lowercase kebab-case, the work item number first, then a
     verb (e.g. `48213-add-report-export`). Use the same id in every repo.
   - **Branch name**, if `.ai-kit/conventions.json` exists (here or in the home repo): work out the kind of
     work from the work item (its type, its "Found In" field for a Bug, a "Maintenance" tag; the field and
     tag names are in the file). Run `node .ai-kit/context-tools.cjs conventions type --work-item-type
     "<type>" --found-in "<value>" --tags "<tags>"`; if it says unknown, or you could not read the work
     item, ask the user once which kind it is. Then `conventions name --type <type> --id <id> --summary
     "<what changes>"` gives the branch name, the PR title and the work item link; use its change id too.
     If `createBranch` is `ask`, ask before creating the branch (`git switch -c <branch>`) in each repo that
     changes, from the branch the team starts work from. Never push. With `never`, show the name only.
   - For **each repo that changes and has `openspec/`**, in that repo's folder: run
     `openspec new change <change-id>` FIRST, then save `openspec/changes/<change-id>/context.md`: the full pack, with
     that repo's section first and the other repos' sections kept short, so a reviewer of this repo
     still sees the whole story and where the other half lives.
   - For a repo that changes but has **no `openspec/`**: say so plainly and ask whether to set it up now
     (`openspec init --tools github-copilot --no-copilot-cloud`; in a product workspace
     `openspec init --tools none`, because the home repo already has the OpenSpec commands) or plan that
     repo without OpenSpec (see step 9). Do not silently treat the whole story as
     "no OpenSpec" because one repo lacks it.
   - Then add one line to the chat per repo: the clickable path of each `context.md` you wrote.
9. **Hand over, one repo at a time, in the order from step 5.**
   - With OpenSpec, for each repo: the user runs `/opsx-propose <change-id>` and names the repo
     ("in report-service"), because in a window with several repos the commands and the terminal
     otherwise default to the first folder. When propose says the change exists, choose **continue**.
     Plan the producer first; plan a consumer only after the producer's plan is approved, and point it at
     the producer's specs (and its `design.md`, if it has one) for the API instead of restating it. Do not
     write the change documents yourself: OpenSpec's own workflow creates `proposal.md`, the delta specs,
     `design.md` when the change needs one, and `tasks.md`.
     **In a product workspace** the OpenSpec commands live in the home repo: run every `openspec`
     command inside the repo that changes (`cd <repo>` first), never in the home repo.
   - Without OpenSpec (small or normal story, in that repo): write one document,
     `docs/stories/<story-id>/plan.md`, from `references/plan.template.md`, and wait for approval before
     changing any code.
   - If the team has its own skill for a technical design or test scenarios in its house format, run it
     now, after the plan exists, and save its output next to the plan.
10. **Fresh-eyes review of the plan** (small and normal stories). Once the change's documents exist in a
   repo (or `plan.md` without OpenSpec), ask the `design-reviewer` agent to review them before any code is
   written. It starts with no memory of this chat, so a plan that only makes sense to
   the person who wrote it gets caught. Run it as a subagent if your tool supports that (for example
   "run the design-reviewer agent on change <change-id> in <repo>"); otherwise the user opens a new chat
   with that agent and gives it the change id. Show its findings; the user decides what to change.

## Finish
End your reply with this block, filled in:
- **What changed:** the change folders and `context.md` files created, as links, per repo.
- **Checks:** the code map queries run per repo, and anything you could not find.
- **Next:** the exact next command per repo, in order (for example "in report-service:
  `/opsx-propose 48213-add-report-export`, choose continue"), then the design review, then `/opsx-apply`.
