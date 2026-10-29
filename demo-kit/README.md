# Brownfield AI Context — Demo Kit

A ready-made three-repo workspace that shows how to create, use and manage AI-agent context
for a brownfield product with a UI service and a backend service.

It pairs with the "Brownfield AI Context Playbook" doc. Copy the folders onto your example
repos (or use them as-is for a dry run) and follow `DEMO-SCRIPT.md`.

## What is in here

```
context-demo-kit/
├── DEMO-SCRIPT.md                 20-minute demo, step by step, with exact prompts
├── report-service/                Spring Boot producer (stub code so anchors resolve)
│   ├── .claude/settings.json      hooks for Claude Code
│   ├── .github/hooks/context.json hooks for GitHub Copilot (preview)
│   ├── AGENTS.md                  L1 always-on context (canonical)
│   ├── CLAUDE.md                  imports AGENTS.md for Claude Code
│   ├── .github/instructions/      L2 scoped rules (applyTo)
│   ├── docs/context/              L3 on-demand knowledge
│   └── openspec/config.yaml       `store: system-context` (specs live in the store)
├── report-ui/                     Angular consumer (same layout)
└── system-context/                Shared "store" repo — owned by architecture
    ├── AGENTS.md                  map of the product and how to use this repo
    ├── context/platform/          L0 platform rules (Keycloak, CIAM)
    ├── context/system-map.md      who calls whom
    ├── contracts/report-service/  consumer brief + OpenAPI (published by producer CI)
    ├── openspec/                  ALL behaviour specs + the cross-service change for REPORT-142
    ├── .github/skills/            team skills: context-bootstrap, context-refresh,
    │                              story-to-change, onboard-me
    ├── .github/agents/            context-steward custom agent (Copilot format)
    ├── .claude/agents/            context-steward subagent (Claude Code format)
    ├── hooks/context-hooks.cjs    session-start / post-edit / stop / guard hooks (Node, no deps)
    ├── githooks/pre-commit        blocks commits with broken context anchors
    ├── agents/steward-settings.json  guard hook for headless steward runs
    ├── context/RITUALS.md         story / sprint / quarter cadence
    ├── CHANGELOG.md               sprint digests for humans (agents never load it)
    ├── workspaces/                multi-root .code-workspace files (one per product)
    ├── scripts/check-context.sh   anchor + drift check for CI
    ├── pipelines/                 Azure Pipelines: PR check + optional weekly steward
    ├── golden-tasks/              stories used to A/B test context changes
    ├── .github/pull_request_template.md
    └── CODEOWNERS
```

## The layer model in one table

| Layer | Lives in | Loaded |
|---|---|---|
| L0 Platform | `system-context/context/platform/` (or GitHub org instructions) | always / on demand |
| L1 Repo core | `<repo>/AGENTS.md` (+ `CLAUDE.md` import) | every request |
| L2 Scoped rules | `<repo>/.github/instructions/*.instructions.md` | when matching files change |
| L3 Knowledge | `<repo>/docs/context/*.md` | on demand via links/skills |
| L4 Behaviour | `openspec/specs/` | when a change touches the domain |
| L5 Task | `openspec/changes/<id>/` | during one story |
| L6 Retrieval | Graphify graph / MCP, OpenAPI | queried, never pasted |

## Quick start

1. Install OpenSpec: `npm install -g @fission-ai/openspec@latest`
2. In each repo: `openspec init` (pick GitHub Copilot and/or Claude Code) — keep the
   `openspec/config.yaml` from this kit when prompted.
3. Open `system-context/workspaces/report-platform.code-workspace` in VS Code.
4. Claude Code users: `cd report-service && claude --add-dir ../report-ui --add-dir ../system-context`
   (set `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` to also load the other repos' CLAUDE.md).
5. Skills live in `system-context/.github/skills/`. For Claude Code, also expose them under
   `.claude/skills/` (copy or symlink): `ln -s ../.github/skills system-context/.claude/skills`.
6. Run the drift check: `bash system-context/scripts/check-context.sh report-service report-ui`
7. Turn on the git hook in each service repo:
   `git -C report-service config core.hooksPath ../system-context/githooks`
8. Agent hooks are already wired in `.claude/settings.json` (Claude Code) and
   `.github/hooks/context.json` (Copilot, preview; enable hooks in VS Code if your version
   requires it). They expect `system-context` cloned next to the service repos.
   Try one by hand: `echo '{}' | node system-context/hooks/context-hooks.cjs session-start --repo report-service`

## Notes and caveats

- The kit uses OpenSpec **store-only** mode: UI and backend keep no specs of their own, so a
  cross-service change archives into one home (`system-context/openspec/specs/`). This suits a
  producer/consumer pair owned by one team. Independent teams can instead keep repo-local specs
  and add `references: [system-context]` to read shared specs.
- Stores/worksets are **beta**. Command names can change; check `openspec --help` on your
  installed version. A no-stores fallback is at the end of `DEMO-SCRIPT.md`.
- Stub source files exist only so anchors resolve. Replace them with your real repos.
- Everything here is plain Markdown/YAML — nothing is tied to one agent.
