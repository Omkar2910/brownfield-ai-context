# Strategy: the kit from AI-assisted to AI-native delivery

November 2026 · working note

## The question

The target is AI-native delivery (level 3) by the end of 2027: agents execute most development activities,
with targeted human oversight for strategy, security and quality, on mature brownfield systems. Tools
include GitHub Copilot, Claude Code, OpenAI Codex, in-house tools, third-party services (Devin, Blitzy,
delivery partners' platforms) and agent orchestration frameworks, with spec-driven development and medium
human oversight. Is the kit heading there, or is it stuck at level 2?

## Honest answer

The **knowledge layer** is already level-3 shaped: plain Markdown, `AGENTS.md`, anchors, reviewed pages,
OpenSpec change folders, the readiness score. It belongs to no tool.

Until 1.6 the **workflow and enforcement** were level-2 shaped: they assumed a developer in a chat window
typing slash commands, and checks that live in one editor's hooks. A cloud agent sees none of that.

2.0 closes the most important gaps:

| Gap at 1.6 | 2.0 answer |
| --- | --- |
| Checks only in the editor and git hook | `context-tools ci` and `--ci`: the same check on every pull request, whoever wrote it |
| Tool-specific paths everywhere | `.ai-kit/` as one neutral home; adapters per tool (`--tool copilot,claude,codex`) |
| No way for a headless agent to ask "what context covers this file?" | `pages-for` and the MCP server (preview) |
| Plan review only by the person who prompted it | `design-reviewer`: memoryless review before code (the elephant-goldfish idea) |
| Skills wait for a person | `story-start` records assumptions and stops after the plan when nobody can answer |
| Context metadata in a kit-only format | OKF-shaped frontmatter that catalogue and knowledge tools can read |
| Upgrades need an agent | `--upgrade` + `migrate`: deterministic, no tokens |

Still missing for level 3 (planned, see [ROADMAP.md](../ROADMAP.md)): an autonomy policy (which change
types may go agent-only), an evaluation set of real stories, and cloud agents updating context in their own
pull requests.

## The landscape, and where the kit sits

| Kind | Examples | What they do with context | Implication |
| --- | --- | --- | --- |
| IDE and terminal agents | Copilot, Claude Code, Codex | Read `AGENTS.md`, rule files, skills | Fully supported through adapters |
| Cloud agents | Copilot cloud agent, Codex cloud, Devin | Read `AGENTS.md` and the repo; some take MCP servers from settings | The PR check is the control; MCP server answers context questions |
| Autonomous platforms | Blitzy and similar | Reverse-engineer the code into their own knowledge graph; humans approve an action plan | They duplicate, privately, what the kit keeps reviewed in the repo. Our pages and specs are better inputs than their guesses, and our check applies to their output |
| Partner delivery platforms | Integrators' spec-driven platforms (often on a cloud provider's agentic IDE) | Their own spec formats and traceability | Same contract: repo context and specs in, checked PR out |
| Orchestration frameworks | Multi-agent frameworks | Need tools to call and shared state | Context tool commands and MCP as tools; the OpenSpec change folder as shared state |

**Position:** the kit is not an agent and should not become one. It is the **context and governance layer
under any agent**: knowledge the organisation owns, a workflow contract (approved specs and test-first tasks),
and checks that do not care who wrote the code. That is also the honest "novel" part: individual pieces
exist elsewhere (code-coupled docs, generated analyses, spec-driven tools, memoryless review), but the
combination of reviewed, anchored, evidence-scored knowledge, tool-neutral checks and a spec-first story
contract for brownfield systems is not something any of the tools above offers.

## Mapping to the framework's columns

The management framework lists a destination per context dimension (a code graph for most rows, a knowledge
format for business, a data catalogue for data). The kit's view, argued in CONTEXT-GUIDE:

- **Code graph (Graphify)** is right for "what calls what". It cannot hold what a column means or why a rule
  exists, so it should not be the home for domain, data, security or decisions.
- **Reviewed pages in the repo** are the home for those, because they travel with the code, change in the
  same PR, and every agent can read them.
- **Data catalogue (OpenMetadata and similar)** is the home for cross-system lineage and ownership; link it
  from table pages rather than copying.
- **OKF-shaped frontmatter** makes the pages readable by knowledge and catalogue tools, so the
  "destination" can be both the repo and a catalogue without double maintenance.

## What to build next, in order

1. Pilot 2.0 on real stories; collect the story log numbers. Nothing else matters as much.
2. Turn on the PR check (warning) on the pilot repos.
3. Autonomy policy file plus documentation of which change types may be agent-only.
4. Evaluation set: 10–20 past stories per pilot repo, run with and without the kit, per agent.
5. Try one cloud agent (Copilot cloud agent or Codex cloud) on a small story with the MCP server, and record
   what it did and did not use.
6. Only then: plugin packaging, product-wide context service.

## What not to do

- Build our own agent, orchestrator, code graph or data catalogue.
- Integrate with one vendor's platform before a pilot needs it.
- Claim time savings before the pilot measures them.

## Risks

| Risk | Mitigation |
| --- | --- |
| OpenSpec or Graphify stops being maintained | Both optional; content is plain Markdown; story-start works without OpenSpec |
| Spec formats converge on something else (Spec Kit, Kiro, a vendor format) | Specs are Markdown; a converter is cheap compared with the reviewed content |
| OKF changes before 1.0 | `migrate` exists for exactly this |
| Agents ignore instructions | Checks, not instructions, enforce what must not break |
| Hooks blocked by policy | Git hook, PR check and skills' final block work without them |
| The score becomes a target | It is evidence-capped and always reported with outcomes and always-loaded size |
