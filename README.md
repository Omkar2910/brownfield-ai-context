# Brownfield AI Context

A practical kit and guide for building user stories in **existing (brownfield) services** with AI agents
in **VS Code + GitHub Copilot** (also Claude Code): small context files the agent reads, **OpenSpec** to
agree on the plan before code, reusable **skills**, a **context-steward** agent, and **hooks and checks**
that keep the context up to date.

## Start here

| I want to… | Open |
| --- | --- |
| Set it up and run a story, step by step, in plain English | **[GUIDE.md](GUIDE.md)** (web page: [docs/index.html](docs/index.html)) |
| Understand how to create, use and maintain context for any task, with or without OpenSpec | **[CONTEXT-GUIDE.md](CONTEXT-GUIDE.md)** (web page: [docs/context.html](docs/context.html)) |
| Install the kit into my repo | `node kit/install.mjs <path-to-your-repo>` — details in [kit/README.md](kit/README.md) |
| Track my first story and present the results | [templates/story-log.md](templates/story-log.md), [templates/presentation-outline.md](templates/presentation-outline.md) |
| Try everything in a sandbox first | [demo-kit/](demo-kit/README.md) (made-up UI + backend services) |
| Read the research and sources | [docs/research/](docs/research/) — start with the [November 2026 update](docs/research/research-update-2026-11.md) |

## Quick start

```bash
git clone https://github.com/<your-account>/brownfield-ai-context.git
cd <your-service-repo> && git checkout -b ai/context-setup
npm install -g @fission-ai/openspec@latest
openspec init --tools github-copilot --no-copilot-cloud
node ../brownfield-ai-context/kit/install.mjs .
```

Then open the repo in VS Code, switch Chat to agent mode and type `/context-bootstrap`.

## Repository layout

```
GUIDE.md            setup + story workflow (start here)
CONTEXT-GUIDE.md    creating, using and maintaining context (any task, OpenSpec optional)
kit/                installer + the files it adds to your repo
templates/          story log and presentation outline
demo-kit/           sandbox: two made-up services and a shared context repo
docs/*.html         both guides as web pages
docs/research/      playbook, FAQ, explainer, research update, sources
```

## Status

Tested with OpenSpec 1.16 and Node 20 on Linux; written for Windows, macOS and Linux. Copilot hooks
and agent plugins are preview features in VS Code; the git hook and the context check work without them.
Last updated November 2026. MIT licence.
