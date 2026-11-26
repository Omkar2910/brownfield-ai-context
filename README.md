# Brownfield AI Context

A practical kit and guide for building user stories in **existing (brownfield) services** with AI agents.
It works with **GitHub Copilot** (VS Code, CLI and cloud agent), **Claude Code** and **OpenAI Codex**, and
keeps the parts that matter in plain files any agent can read:

- small context files the agent reads, and reviewed in-depth pages it opens when a task needs them, every
  fact anchored to the code it describes;
- a **Graphify** code map it can query;
- **OpenSpec** (its default workflow) to agree on the plan before code, with a fresh-eyes review of every
  plan and tasks written test-first;
- reusable **skills**, a **context-steward** agent, and **checks** (git hook, pull request check, agent
  hooks) that keep the context true, plus a readiness score that measures it.

## Start here

| I want to… | Open |
| --- | --- |
| Use the kit: both setups, every skill, a story start to finish in each agent | **[kit/GUIDE.md](kit/GUIDE.md)** (web page: [docs/kit-guide.html](docs/kit-guide.html)) |
| Set it up in one repo and run a story, step by step, in plain English | **[GUIDE.md](GUIDE.md)** (web page: [docs/index.html](docs/index.html)) |
| Understand how to create, use and maintain context for any task, with or without OpenSpec | **[CONTEXT-GUIDE.md](CONTEXT-GUIDE.md)** (web page: [docs/context.html](docs/context.html)) |
| See every tool (core, recommended, optional), Graphify in depth, and which workflow fits which task | **[TOOLBOX.md](TOOLBOX.md)** (web page: [docs/toolbox.html](docs/toolbox.html)) |
| See how the kit is built: components, layers, when each part runs, where it came from | **[ARCHITECTURE.md](ARCHITECTURE.md)** (web page: [docs/architecture.html](docs/architecture.html)) |
| Roll it out across the organisation: org rules, product hubs, repos, measuring readiness | **[ORG-LEVEL.md](ORG-LEVEL.md)** (web page: [docs/org-level.html](docs/org-level.html)) |
| Set it up across many repos: micro-frontends, backend services, shared libraries | **[MULTI-REPO.md](MULTI-REPO.md)** (web page: [docs/multi-repo.html](docs/multi-repo.html)) |
| Build an in-depth reference per repo and score context readiness | `/context-create deep`, `/context-assess` — see [CONTEXT-GUIDE.md](CONTEXT-GUIDE.md#in-depth-context-the-baseline-area-pages-and-the-readiness-score) |
| Install the kit into my repo | `node kit/install.mjs <path-to-your-repo>` — details in [kit/README.md](kit/README.md) |
| Track my first story and present the results | [templates/story-log.md](templates/story-log.md), [templates/presentation-outline.md](templates/presentation-outline.md) |
| Try everything in a sandbox first | [demo-kit/](demo-kit/README.md) (made-up UI + backend services) |
| See where this is heading: AI-assisted now, AI-native next | **[ROADMAP.md](ROADMAP.md)** |
| See what changed between versions and how to upgrade | **[CHANGELOG.md](CHANGELOG.md)** |
| Read the research and sources | [docs/research/](docs/research/) — start with the [November 2026 update](docs/research/research-update-2026-11.md) |

## Quick start

Put the kit next to your repos, open that folder in your agent (GitHub Copilot agent mode, Claude Code or
Codex) and type:

> Set up the AI context kit for the repos in this folder. Follow brownfield-ai-context/kit/SETUP-AGENT.md.

The setup agent looks at every repo, asks once what you want (a product workspace or each repo on its own,
which repos and agents, product context, a pull request check), shows the plan and runs it after your yes. In
a terminal, `node brownfield-ai-context/kit/setup.mjs` asks the same questions. Then type `/context-create` in
each repo. Everything else is in [kit/GUIDE.md](kit/GUIDE.md).

## Repository layout

```
GUIDE.md            setup + story workflow (start here)
CONTEXT-GUIDE.md    creating, using and maintaining context (any task, OpenSpec optional)
TOOLBOX.md          every tool by tier, Graphify in depth, workflow per task type, module rewrites
MULTI-REPO.md       many micro-frontends + services: product context hub, workspaces, cross-repo stories
ORG-LEVEL.md        organisation layer: org rules synced into every repo, rollout, measuring
ARCHITECTURE.md     how the kit is built and why, with sources
ROADMAP.md          maturity levels: what the kit does at each, what comes next
CHANGELOG.md        versions and upgrade notes
kit/                installer, the files it adds to each repo, hub and org templates
templates/          story log and presentation outline
demo-kit/           sandbox: two made-up services and a shared context repo
docs/*.html         the guides as web pages
docs/research/      playbook, FAQ, research update, sources
internal/           working notes for the maintainer (briefing, strategy, validation); not part of the product
```

## Status

Kit 2.3.1. Tested with OpenSpec 1.16, Graphify 0.9.100 and Node 22 on Linux (Node 18 or newer is required); written for Windows, macOS and Linux.
Agent hooks are preview features in VS Code; the git hook, the pull request check and the skills work without
them, and `context-tools.cjs doctor` shows whether they run. The MCP server is a preview.
Last updated November 2026. MIT licence.
