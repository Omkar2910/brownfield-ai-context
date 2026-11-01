# AI context kit

Installs skills, a context-steward agent, agent hooks and a context check into one of your repositories.
Read [`../GUIDE.md`](../GUIDE.md) first; this page is the reference.

```bash
node kit/install.mjs <path-to-your-repo>                  # GitHub Copilot (default)
node kit/install.mjs <path-to-your-repo> --dry-run        # show what it would do
node kit/install.mjs <path-to-your-repo> --tool claude    # Claude Code instead
node kit/install.mjs <path-to-your-repo> --no-git-hook    # skip the git pre-commit hook
```

The installer only adds files. Existing files are never overwritten; it lists them and tells you what
to merge by hand. Run OpenSpec's `openspec init` first so it can add settings to `openspec/config.yaml`.

## What goes where

| Kit file | Installed to (Copilot) | Purpose |
| --- | --- | --- |
| `files/.github/skills/*` | `.github/skills/` | `context-bootstrap`, `context-refresh`, `story-to-change`, `story-finish`, `onboard-me` |
| `files/.github/agents/context-steward.agent.md` | `.github/agents/` | Agent that edits context files only |
| `files/.github/hooks/ai-context.json` | `.github/hooks/` | Copilot hooks: session start, after edit, before finishing |
| `files/.github/hooks/scripts/context-tools.cjs` | `.github/hooks/scripts/` | The hooks and the `check` / `status` commands (Node 18+, no dependencies) |
| `files/.githooks/pre-commit` | `.githooks/` + `git config core.hooksPath .githooks` | Refuses commits with broken anchors |
| `files/.azuredevops/pull_request_template.md` | `.azuredevops/` | PR template with the context checklist |
| `snippets/openspec-config.yaml` | appended to `openspec/config.yaml` | Points OpenSpec at your context, adds rules |
| `optional/*` | not installed | Azure Pipelines check, Azure DevOps MCP config, Claude Code hook settings |

`git config core.hooksPath` is stored per clone, so each teammate runs
`git config core.hooksPath .githooks` once (or add it to your project's setup script).

## The context tool

```bash
node .github/hooks/scripts/context-tools.cjs status                     # summary and always-on size
node .github/hooks/scripts/context-tools.cjs check                      # errors and warnings now
node .github/hooks/scripts/context-tools.cjs check --base origin/main   # include changes since main
node .github/hooks/scripts/context-tools.cjs check --strict             # warnings fail too (for CI later)
```

- **ERROR**: a `[anchor: …]` points at a file that no longer exists.
- **WARN**: anchored code changed but the context file did not; `AGENTS.md` over 150 lines;
  always-on context over ~2,000 tokens. Change the limits with `CONTEXT_MAX_AGENTS_LINES` and
  `CONTEXT_ALWAYS_ON_TOKENS`.

## Hooks

| Hook | Copilot event | What the agent sees |
| --- | --- | --- |
| `session-start` | `sessionStart` | A 2–4 line context health note and active OpenSpec changes |
| `post-edit` | `postToolUse` | "This file is referenced by AGENTS.md:12 (…)" when it edits anchored code |
| `stop` | `agentStop` | Blocks once with a list of broken or stale anchors; never twice, so it cannot loop |
| `guard` | `preToolUse` (steward runs only, not installed by default) | Refuses edits outside context files |

The script reads no network, writes nothing in your repo, and exits quietly on any internal error so it
cannot break an agent session. Read it before installing; it is about 300 lines.

## Removing it

Everything is plain files. Delete the added folders, run `git config --unset core.hooksPath`, and
remove the appended block from `openspec/config.yaml`.
