# AI context kit

Installs skills, agents, agent hooks, the context tool and a pull request check into one of your
repositories. Read [`../GUIDE.md`](../GUIDE.md) first; this page is the reference.

```bash
node kit/install.mjs <repo>                          # GitHub Copilot (default)
node kit/install.mjs <repo> --tool claude            # Claude Code
node kit/install.mjs <repo> --tool codex             # OpenAI Codex
node kit/install.mjs <repo> --tool copilot,claude    # several tools; --tool all = copilot, claude, codex
node kit/install.mjs <repo> --graphify               # also connect the Graphify code map (recommended)
node kit/install.mjs <repo> --ci azure               # pull request check (Azure Pipelines); --ci github for Actions
node kit/install.mjs <repo> --mcp                    # register the kit's MCP server (preview)
node kit/install.mjs <repo> --org ../org-context     # copy the org's rules and readiness weights in, stamped
node kit/install.mjs <repo> --upgrade                # replace the kit's own files; moves a 1.x repo to 2.x
node kit/install.mjs <repo> --dry-run                # show what it would do, change nothing
node kit/install.mjs <repo> --keep-schema            # with OpenSpec: don't switch to the story-tdd workflow
node kit/install.mjs <repo> --no-git-hook            # skip the git hooks
node kit/install.mjs --create-hub ../product-context # new product context hub (many repos, see MULTI-REPO.md)
node kit/install.mjs --create-org ../org-context     # new organisation context repo (see ORG-LEVEL.md)
```

The installer only adds files. Existing files are never overwritten (JSON settings are merged); it lists
them and tells you what to merge by hand. `--upgrade` also replaces the files the kit owns. OpenSpec is
optional: run `openspec init` first so the installer can add the story workflow.

## What goes where

| Kit file | Installed to | Purpose |
| --- | --- | --- |
| `files/.ai-kit/context-tools.cjs` | `.ai-kit/` (every tool) | The context tool: check, status, doctor, readiness, pages-for, migrate, schema-import, ci, mcp, and the agent hooks. Node 18+, no dependencies |
| `files/.ai-kit/ci/` | `.ai-kit/ci/` | Pull request check templates (Azure Pipelines, GitHub Actions) |
| (generated) | `.ai-kit/kit.json` | Kit version, tools, org rules carried (with their fingerprints) |
| `files/.github/skills/*` | Copilot `.github/skills/`, Claude Code `.claude/skills/`, Codex `.agents/skills/` | `context-create` (quick and deep), `context-update`, `context-assess`, `context-learn`, `story-start`, `story-finish`, `onboard-me` |
| `files/.github/agents/context-steward.agent.md` | `.github/agents/`, `.claude/agents/context-steward.md` | Agent that edits context files only (a guard hook enforces it) |
| `files/.github/agents/design-reviewer.agent.md` | `.github/agents/`, `.claude/agents/design-reviewer.md`, Codex: `.agents/skills/design-review/` | Fresh-eyes, read-only review of a story's plan before code |
| `files/.github/hooks/ai-context.json` | `.github/hooks/` (Copilot) | Copilot hooks: session start, after edit, before finishing |
| `optional/claude-code-settings.json` | merged into `.claude/settings.json` (Claude Code) | The same hooks in Claude Code's format |
| `files/.githooks/pre-commit` | `.githooks/` + `git config core.hooksPath .githooks` | Refuses commits with broken anchors (every tool) |
| `files/.githooks/post-commit`, `post-merge`, `post-checkout`, `graph-refresh` | `.githooks/` | Refresh the Graphify code map in the background; no-op without Graphify |
| `files-graphify/` | `.vscode/mcp.json` / `.mcp.json`, `.graphifyignore` (with `--graphify`) | Graphify MCP server and ignore file; adds `graphify-out/` to `.gitignore` |
| `files/.azuredevops/pull_request_template.md` | `.azuredevops/` | PR template with the context checklist |
| `snippets/openspec-config.yaml` | appended to `openspec/config.yaml` | Points OpenSpec at your context, adds rules |
| `openspec-schema/story-tdd/` | `openspec/schemas/story-tdd/` + `schema: story-tdd` | Story workflow: proposal → specs → technical design (`design.md`) → `test-plan.md` → test-first tasks. `schema.yaml` is kit-owned; `templates/` are yours |
| `<org-context>/rules/*.md` | `.github/instructions/org/` and/or `.claude/rules/org/` (with `--org`) | Organisation rules, stamped with the org repo's commit; org-owned, replaced on every sync |
| `<org-context>/context-readiness.json` | `.ai-kit/readiness.json` | The organisation's readiness weights, unless the repo keeps its own |
| `hub-template/`, `org-template/` | new folders, with `--create-hub` / `--create-org` | Product context hub; organisation context repo |

**What each tool reads.** Copilot: `AGENTS.md`, `.github/instructions/`, `.github/skills/`,
`.github/agents/`, `.github/hooks/`. Claude Code: `CLAUDE.md` (which imports `AGENTS.md`), `.claude/rules/`,
`.claude/skills/`, `.claude/agents/`, `.claude/settings.json`. Codex: `AGENTS.md` files (root and nested)
and `.agents/skills/`; no rule files and no hooks, so the git hook and the pull request check carry the
checks there. With Copilot and Claude Code in one repo, VS Code's Copilot harness reads both hook files;
the context tool ignores the duplicate call.

`git config core.hooksPath` is stored per clone, so each teammate runs `git config core.hooksPath .githooks`
once (or add it to your project's setup script).

## Upgrading

```bash
node kit/install.mjs <repo> --upgrade --dry-run   # see what changes
node kit/install.mjs <repo> --upgrade
node .ai-kit/context-tools.cjs migrate            # convert context pages to the current page format (no AI)
node .ai-kit/context-tools.cjs doctor
```

From 1.x, `--upgrade` moves the context tool to `.ai-kit/`, the version stamp to `.ai-kit/kit.json` and the
readiness weights to `.ai-kit/readiness.json`; renames the skills (`context-bootstrap` and
`context-baseline` → `context-create`, `context-refresh` → `context-update`, `story-to-change` →
`story-start`); points the Claude Code hooks at the new path; and lists files your team wrote that still
name the old paths. It never edits `AGENTS.md`, rule files or `docs/context/`. `migrate` then converts the
1.x status line (`> Dimension: … · Status: …`) into frontmatter. Upgrades cost no tokens: nothing in them
needs an agent. See [`../CHANGELOG.md`](../CHANGELOG.md).

## The story workflow (OpenSpec schema)

When the repo has `openspec/`, the installer adds the `story-tdd` schema and makes it the default for
**new** changes (changes already started keep theirs; `--keep-schema` skips the switch). Each change then
has five documents, created in this order:

| Artifact | File | Needs |
| --- | --- | --- |
| proposal | `proposal.md` (with the story's acceptance criteria) | — |
| specs | `specs/<capability>/spec.md` | proposal |
| design | `design.md`: the technical design document, always created, "Lite" for small stories | proposal |
| test-plan | `test-plan.md`: each scenario and acceptance criterion mapped to a named test, extra cases, regression, test data | specs, design |
| tasks | `tasks.md`: per layer, tests first, then code, then mark test-plan rows `passing` | specs, design, test-plan |

It keeps the id `design` and the file name `design.md` on purpose: `/opsx-verify` checks the code against
an artifact with that id. Customise with `openspec/schemas/story-tdd/templates/` (your TDD format) and
`rules:` in `openspec/config.yaml` (for example, name your own TDD skill under `design:`). Check it with
`openspec schema validate story-tdd`. After `design.md` and `test-plan.md` exist, `/story-start` asks the
`design-reviewer` agent for a fresh-eyes review before any code.

## The context tool

```bash
node .ai-kit/context-tools.cjs status                     # summary, always-on size, last hook runs
node .ai-kit/context-tools.cjs doctor                     # is everything wired up? hooks, git hook, skills, CI
node .ai-kit/context-tools.cjs check [--base origin/main] [--staged] [--strict]
node .ai-kit/context-tools.cjs readiness [--json]         # readiness score 0-100 over 12 dimensions
node .ai-kit/context-tools.cjs pages-for <file> ...       # which context lines describe these files
node .ai-kit/context-tools.cjs migrate [--dry-run]        # upgrade page format after a kit upgrade
node .ai-kit/context-tools.cjs schema-import <schema.json> [--out docs/context/data]   # table pages from tbls
node .ai-kit/context-tools.cjs ci --base origin/main      # the pull request check
node .ai-kit/context-tools.cjs mcp                        # MCP server on stdio (preview)
```

**Anchors.** End a context line with `[anchor: <path>]` when it depends on code. `<path>` can be a file, a
folder (`src/main/resources/db/migration/`), a glob (`src/**/security/*.java`) or several of these separated
by commas. Backticks, `#L12` or `:12` suffixes and Windows backslashes are accepted. Paths outside the repo
(`../product-context/…`) are allowed but not checked; `repo-name:path` anchors are checked by the hub.

- **ERROR**: a `[anchor: …]` points at a file that no longer exists. A `--base` that does not exist is
  exit 2, not a silent pass.
- **WARN**: anchored code changed but the context file did not; pages still in the 1.x format; `AGENTS.md`
  over 150 lines; always-on context over ~2,000 tokens (`CONTEXT_MAX_AGENTS_LINES`,
  `CONTEXT_ALWAYS_ON_TOKENS` change the limits).

**Page metadata.** Every deep page starts with frontmatter the tool reads:

```yaml
---
type: Context Page        # or Database Table, Decision, Area Guide
status: stable            # draft | stable | deprecated
dimension: data           # kit extension: which readiness dimension
owner: "reports-team"     # kit extension
verified:                 # review events; human: actors count as reviews
  - { by: "human:asha", at: "2026-11-20" }
  - { by: "human:ravi", at: "2026-11-24" }     # a second person: independent review
generated: { by: "context-tools/schema-import", at: "2026-11-18" }   # only on machine-written pages
---
```

These fields follow the Open Knowledge Format (OKF v0.3: `type` required, `status`, `verified` events,
`generated`; reviews dated before `generated.at` stop counting), with `dimension` and `owner` as the kit's
extension keys, so tools that read OKF can read the pages. A page counts as reviewed when its status is not
`draft` and it has a current `human:` verification; two different reviewers make an independent review.
If OKF later defines a field differently, `migrate` will convert the pages.

**Readiness.** Reads each page's metadata, its anchors and whether its anchored code changed since review,
plus ratings from `/context-assess` in `docs/context/readiness.md`. Each rating is capped by the evidence
(draft ≤ 2; generated, unanchored, stale or old review ≤ 3; reviewed ≤ 4; independently reviewed = 5);
provenance and freshness are measured. Weights and bands: `.ai-kit/readiness.json`
(`{"dimensions":[{"id","label","weight"}…],"bands":[{"min","name"}…],"reviewMaxAgeDays":180}`).

**Table pages.** `schema-import` reads a tbls `schema.json` and writes one page per table in
`docs/context/data/tables/` plus `docs/context/data/index.md`. Only the part between the `generated`
markers is replaced on a later import; what people wrote is kept. Tables that disappeared are reported,
never deleted. See the `context-create` skill's `references/data-sources.md`.

**ci.** Runs `check --base`, notes code changes that arrive without an OpenSpec change folder (in repos that
use OpenSpec), and prints the readiness score. On GitHub Actions it also writes the job summary.

**mcp (preview).** A small MCP server on stdio with four tools: `context_for_files`, `context_check`,
`context_readiness`, `context_status`. It lets agents that work without the editor (cloud agents,
orchestrators) ask the same questions the hooks answer in the editor. Register it with `--mcp`; for cloud
agents, add the same command in the hosting service's MCP settings.

## Hooks

| Hook | Copilot event | Claude Code event | What happens |
| --- | --- | --- | --- |
| `session-start` | `sessionStart` | `SessionStart` | A 2–4 line context health note for the agent; in Claude Code also a one-line message you see |
| `post-edit` | `postToolUse` | `PostToolUse` | "This file is referenced by docs/context/data.md:12 (…)" when the agent edits anchored code |
| `stop` | `agentStop` | `Stop` | Only about files **the agent edited in this session**: blocks once with broken anchors and context lines anchored to those files it did not revisit |
| `guard` | `PreToolUse` in the steward's frontmatter | same | Refuses edits outside context files while the context steward runs |

**Can I see that they run?** Hook notes go to the agent, not to you (Claude Code also shows the session-start
line). Every run is written to `.git/ai-kit/hook-log.jsonl` in your clone (never committed), and
`context-tools.cjs status` and `doctor` show the last run of each hook. If `doctor` says no hook has run
after you have used agent chat, hooks are off: see the troubleshooting section in the guide. The skills do
not depend on hooks: each ends with a **What changed · Checks · Next** block.

The script reads no network, writes nothing in your working tree (session state goes to the system temp
folder, the log into `.git/`), and exits quietly on any internal error so it cannot break an agent session.

## Area pages

`story-finish/references/area-page.template.md` is the format for `docs/context/areas/<area>.md`: a deep
page for one complex area. `/story-finish` offers to write one when a story needed a lot of tracing to
understand an area that has no page yet.

## Security

Hook scripts and git hooks run on developers' machines, and MCP configs start programs. Have a named
reviewer for `.ai-kit/`, `.github/hooks/`, `.githooks/`, `.claude/settings.json`, `.vscode/mcp.json` and
`.mcp.json` (CODEOWNERS or a branch policy), and pin the OpenSpec, Graphify and MCP server versions you
tested.

## Removing it

Everything is plain files. Delete the added folders, remove the kit's entries from `.claude/settings.json`
and the MCP files, run `git config --unset core.hooksPath`, and remove the appended block from
`openspec/config.yaml`.
