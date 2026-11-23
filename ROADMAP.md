# Roadmap: from AI-assisted to AI-native delivery

How the kit fits each stage of AI adoption in software delivery, what it already does for the next stage,
and what is planned. Kit 2.0.0 · November 2026.

## The stages

| Level | Name | Who does the work | Where people stay involved | What context has to do |
| --- | --- | --- | --- | --- |
| 1 | Ad hoc | People, with chat assistants on the side | Everything | Nothing systematic |
| 2 | AI-assisted | A developer drives an agent in the editor, step by step | Every step | Help one person prompt well; checks run when the developer runs them |
| 3 | AI-native | Agents take an approved story to a pull request, often in the cloud, with no chat window | Spec and design approval; security and quality review of the pull request | Be queryable by any agent, verified automatically on every pull request, the same whichever agent runs |
| 4 | Autonomous with governance | Several agents coordinated by an orchestrator; people set goals and policy | Goals, policy, exceptions, measured outcomes | Kept current by the agents themselves, checked by independent reviewers, measured against results |

Most brownfield teams are at level 2 today. The risk is building something that only works at level 2: a
workflow that assumes a person in a chat window typing commands, with checks that live in one editor.

## What makes the kit portable between stages

The kit is built in four layers. Only the thinnest one is tied to a tool.

| Layer | What it is | Tied to a tool? |
| --- | --- | --- |
| **1. Knowledge** | `AGENTS.md`, `docs/context/` pages with anchors, OpenSpec specs and change folders, table pages. Plain Markdown with frontmatter in the shape of the Open Knowledge Format | No. `AGENTS.md` and MCP are both stewarded by the Linux Foundation's Agentic AI Foundation and read by every major agent |
| **2. Checks** | `context-tools.cjs`: check, readiness, pages-for, migrate, schema-import, doctor | No. Runs from a terminal, a git hook, CI or an MCP call |
| **3. Workflow** | Skills (`story-start`, `story-finish`, `context-*`), OpenSpec's default workflow, the design reviewer | Lightly. `SKILL.md` is a shared format; the installer places it where each tool looks |
| **4. Adapters** | Hook files, agent files, MCP registrations per tool | Yes, and deliberately small: `--tool` adds or removes them |

Supporting a new agent means adding an adapter, never rewriting knowledge.

## What the kit does at each stage

| Need | Level 2 (today) | Level 3 (the kit already supports) | Level 4 (planned) |
| --- | --- | --- | --- |
| Knowledge an agent can trust | Reviewed, anchored pages; readiness score | Same pages, readable by any agent; OKF-shaped metadata so catalogue and knowledge tools can read them | Agents propose context updates in every change; independent review events recorded per page |
| Checks | Agent hooks in the editor, git hook | **Pull request check (`ci`)** runs whoever wrote the change, including a cloud agent | Policy as code: which change types may merge with which evidence |
| Asking "what do I need to know about this file?" | After-edit hook | **MCP server (`mcp`)** and `pages-for` for agents with no editor | Context service shared across repos in a product |
| Plan before code | OpenSpec change (proposal, specs, tasks), reviewed by a person | **Fresh-eyes design review** by an agent with no memory of the planning chat; the approved change folder is the handoff to any agent | Several reviewers with different roles; findings tracked to closure |
| Running without a person in the chat | — | `story-start` records assumptions and stops after the plan when nobody can answer | Orchestrator assigns stories by type and readiness |
| Several agent tools | Copilot, Claude Code, Codex (`--tool`) | Same | New tools added as adapters |
| Upgrades | `--upgrade`, `migrate`: no tokens spent | Same, in CI | Same |
| Proof it helps | Story log, readiness score | Same | Evaluation set of real stories run against each agent |

## How it works with agent platforms

| Kind of tool | Examples | How the kit fits |
| --- | --- | --- |
| Agents in the editor and terminal | GitHub Copilot, Claude Code, OpenAI Codex | Full support through adapters |
| Cloud coding agents | Copilot cloud agent, Codex cloud, Devin | They read `AGENTS.md` and the repo; the pull request check verifies their work; the MCP server answers context questions where the platform allows MCP |
| Autonomous development platforms | Blitzy and similar | They build their own model of the codebase. The kit's reviewed pages and approved specs are inputs they can read from the repo, and the pull request check applies to their output as to anyone's |
| Services from delivery partners | Spec-driven delivery platforms from integrators | Same contract: the repo's context and specs in, a pull request that passes the check out |
| Agent orchestration frameworks | Frameworks that run several agents in sequence | Call the context tool's commands or MCP server as tools; use the OpenSpec change folder as the shared state between agents |

The common thread: whatever does the work, the knowledge stays in the repo, owned and reviewed by the
team, and every change passes the same check. That is what keeps an organisation free to change tools.

## Planned

In rough order. Each item ships only after it has been tried on real stories.

1. **Autonomy policy.** A small file per repo naming which kinds of change an agent may take from plan to
   pull request on its own (for example: low-risk changes in repos scoring "AI ready" or higher), and which
   always need a person to approve the design (permissions, personal data, public APIs).
2. **Evaluation set.** Real past stories with their accepted solutions, run against an agent with and
   without the kit, to measure the difference on the team's own code.
3. **Context in every agent change.** Cloud agents update context pages in the same pull request, with the
   design reviewer checking them.
4. **Product-wide context service.** The MCP server answering across the repos of a product hub.
5. **Distribution as a plugin** once agent plugin marketplaces are stable enough for organisation use.

## Not planned

- **An agent or orchestrator of our own.** Good ones exist and change fast; the kit stays the layer under them.
- **A code graph or data catalogue of our own.** Graphify, OpenMetadata, DataHub and similar tools do this;
  the kit links to them.
- **Vendor-specific integrations** before a pilot shows they are needed.

## Evidence so far, and what is not proven

Published studies support the kit's choices (small always-loaded context, reviewed pages, test-first
plans; see [ARCHITECTURE.md](ARCHITECTURE.md#where-it-came-from)), but the spec-driven development papers
so far describe approaches without measured results, and studies of context files disagree. The kit
therefore measures itself on the team's own stories before anything is scaled.
