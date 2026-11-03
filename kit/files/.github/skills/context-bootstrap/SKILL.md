---
name: context-bootstrap
description: Create or rebuild the AI-agent context for this repository - a lean AGENTS.md, scoped .instructions.md rules and docs/context pages with anchors. Use when asked to "bootstrap context", "create context", "set up AGENTS.md" or "make this repo agent-ready".
---

# Context bootstrap

Goal: a SMALL, accurate set of context files that tells an agent what it cannot work out from the
code in about a minute. Studies of coding agents found long, generated context files make agents
slower and often less accurate, so most of this job is deciding what to leave out.

Work in this order and show the user the result of each step before moving on.

## 1. Gather facts (write nothing yet)
- Build, test, lint and run commands: read the build files (pom.xml, build.gradle, package.json,
  angular.json) and CI pipeline files. Run the test command once if it is quick, to confirm it works.
- Layout: list the top-level modules/packages and what each is for (for your own understanding).
- Code map: if `graphify-out/graph.json` exists or the graphify MCP tools are available, run
  `god_nodes` (or `graphify god-nodes`) and read the "God Nodes" and "Surprising Connections" parts of
  `graphify-out/GRAPH_REPORT.md`. The most connected classes are what `docs/context/architecture.md`
  must explain. Do NOT copy graph output into context files; agents can query the graph themselves.
- Integrations: authentication, authorization, databases, queues, caches, other services. Read config
  files and HTTP/API clients.
- Existing docs (README, docs/, ADRs, wiki exports the user points you to). Note what is still true.
- Conventions the code follows consistently: layering, error format, naming, test style.
- Traps: comments with WHY / HACK / NOTE / TODO, unusual code, timeouts, size limits, caches, generated
  code that must not be edited by hand, licence loading, time zones.

## 2. Ask the user (5 minutes)
Ask these questions together, in one message, and wait for answers:
1. What do new joiners usually get wrong in their first month here?
2. Which rules from the platform or architecture team apply (for example authentication, permissions, logging, error format)?
3. Is there anything in this repo that looks wrong but is deliberate?
4. Which files or folders should an agent never change?
5. What kind of repo is this: micro-frontend shell, micro-frontend remote, backend service, or shared
   library? Is there a product context hub (for example `../product-context/`)?

## 3. Draft the files
Use the templates in `references/`:
- `AGENTS.md` from `references/AGENTS.template.md`. Aim for about 100 lines; never more than 150.
  It must contain: what the service is (2 lines), commands, non-obvious rules, and a short
  "Where to look" index that points to the other files. The index matters: agents reliably read
  AGENTS.md, but they do not always open other files unless told where they are.
- 2–4 scoped rule files in `.github/instructions/`, one per layer or framework (for example
  controllers, persistence, migrations, Angular components). Each has a tight `applyTo` glob and is
  under ~50 lines. See `references/instructions-examples.md`.
- `docs/context/architecture.md` (modules, request flow, integrations, why odd things are the way they are)
  and `docs/context/known-traps.md` (numbered list, each trap with its reason).
- `CLAUDE.md` containing only the line `@AGENTS.md` (so Claude-based tools read the same file).
- The lines `references/repo-types.md` requires for this kind of repo (how it connects to the other
  micro-frontends and services). Link to the product context hub instead of copying its content.
Do not overwrite files that already exist without showing the user a diff first.

## 4. Prune
Go through every line with `references/prune-checklist.md`. Delete lines that fail. Tell the user
the before and after line counts.

## 5. Anchor
After each fact that depends on specific code, add `[anchor: <path or glob>]`, for example
`[anchor: src/main/java/**/security/RequiresPermission.java]`. Anchors let the checker detect when
code moves or changes and the context line may be out of date.

## 6. Connect OpenSpec (if `openspec/config.yaml` exists)
Make its `context:` block 5–10 lines: the stack in one line, "Read AGENTS.md and docs/context/
before writing any artifact", and the one or two platform rules every change must respect.
Keep it short; everything in it is sent with every OpenSpec step.

## 7. Check and hand back
Run `node .github/hooks/scripts/context-tools.cjs check` and fix any ERROR lines.
Then give the user a short summary: files created, line counts, always-on size, and any
questions you could not answer from the code. Never invent a command or rule you did not see.
