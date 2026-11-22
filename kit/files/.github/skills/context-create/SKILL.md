---
name: context-create
description: Create this repository's AI-agent context. Quick (default) - a lean AGENTS.md, scoped rule files and two short pages. Deep ("deep", "deep <page>") - one reviewed, anchored page per readiness dimension (architecture, domain, screens, data and table pages, API, dependencies, security, testing, operations, decisions). Use when asked to "create context", "bootstrap context", "set up AGENTS.md", "in-depth context", "document this service for the agent" or to raise the readiness score.
---

# Context create

Two depths. Ask which if the user did not say; recommend **quick** first for a repo with no context.
- **quick** (default, about an hour with review): what an agent cannot work out from the code in a minute.
- **deep** (one page at a time, over days): the in-depth reference people review. Read
  `references/deep.md` now and follow it instead of the steps below. `deep <page>` does one page.

Studies of coding agents found long generated context files make agents slower and often less accurate,
so most of the quick job is deciding what to leave out. Show the user the result of each step.

## 1. Gather facts (write nothing yet)
- Build, test, lint and run commands: build files (pom.xml, build.gradle, package.json, angular.json) and
  pipeline files. Run the test command once if it is quick, to confirm it works.
- Layout: top-level modules and what each is for.
- Code map: if `graphify-out/graph.json` exists or the graphify MCP tools are available, run `god_nodes`
  (or `graphify god-nodes`) and read "God Nodes" in `graphify-out/GRAPH_REPORT.md`. Do NOT copy graph
  output into context files; agents can query the graph themselves.
- Integrations: authentication, authorisation, databases, queues, caches, other services (config files,
  HTTP clients).
- Existing docs (README, docs/, ADRs, earlier generated analysis, wiki exports the user points you to).
  Read them as a SOURCE, never copy them: every line you keep must be confirmed in today's code.
- Conventions the code follows consistently, and traps: comments with WHY / HACK / NOTE / TODO, generated
  code, timeouts, size limits, caches, time zones.

## 2. Ask the user (one message, then wait)
1. What do new joiners usually get wrong in their first month here?
2. Which platform or architecture rules apply (authentication, permissions, logging, error format)?
3. Is there anything that looks wrong but is deliberate?
4. Which files or folders should an agent never change?
5. What kind of repo is this: micro-frontend shell or remote, backend service, or shared library? Is there
   a product context hub (for example `../product-context/`)?

## 3. Draft the files (templates in `references/`)
- `AGENTS.md` from `AGENTS.template.md`: about 100 lines, never more than 150. What the repo is (2 lines),
  commands, non-obvious rules, and a short "Where to look" index (agents read AGENTS.md reliably, other
  files only when told where they are).
- 2–4 scoped rule files, one per layer or framework, each under ~50 lines with a tight glob
  (`instructions-examples.md`): `.github/instructions/<name>.instructions.md` with `applyTo` for Copilot;
  `.claude/rules/<name>.md` with `paths:` for Claude Code. Codex reads only `AGENTS.md` files, so a rule
  every tool must follow goes in `AGENTS.md` (or a nested `AGENTS.md` in that folder).
- `docs/context/architecture.md` and `docs/context/known-traps.md` (numbered, each trap with its reason).
- `CLAUDE.md` containing only `@AGENTS.md`, if the repo is set up for Claude Code.
- The lines `repo-types.md` requires for this kind of repo. Link to the product hub instead of copying it.
Show a diff before changing any file that already exists.

## 4. Prune and anchor
Go through every line with `prune-checklist.md`; delete lines that fail and report the line counts before
and after. After each fact that depends on code, add `[anchor: <path or glob>]`.

## 5. Connect OpenSpec (if `openspec/config.yaml` exists)
Keep its `context:` block to 5–10 lines: the stack, "Read AGENTS.md first", and the one or two platform
rules every change must respect. Everything in it is sent with every OpenSpec step.

## 6. Check
Run `node .ai-kit/context-tools.cjs check` and fix every ERROR line, then
`node .ai-kit/context-tools.cjs readiness` for the starting score. Never invent a command or rule you did
not see.

## Finish
End your reply with this block, filled in:
- **What changed:** each file created or edited, as a link, with its line count.
- **Checks:** the commands you ran and their result (errors, warnings, readiness score and band).
- **Next:** 1) review and commit on a branch; 2) `/context-create deep` for the in-depth pages, starting
  with the dimension the readiness output names as the biggest gap.
