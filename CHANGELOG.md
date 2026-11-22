# Changelog

## 2.0.0 (November 2026)

The kit now works the same in GitHub Copilot, Claude Code and OpenAI Codex, shows whether its checks run,
upgrades without spending tokens, and has the groundwork for agents that work without a chat window.

**Upgrading from 1.x**

```bash
node kit/install.mjs <repo> --upgrade --dry-run     # see the changes first
node kit/install.mjs <repo> --upgrade
node .ai-kit/context-tools.cjs migrate               # page format; no AI, no tokens
node .ai-kit/context-tools.cjs doctor
```

Then replace old skill names in your own files if the installer lists any (`AGENTS.md`, pipelines):
`/story-to-change` → `/story-start`, `/context-bootstrap` and `/context-baseline` → `/context-create`
(`/context-create deep` for the in-depth pages), `/context-refresh` → `/context-update`, and
`.github/hooks/scripts/context-tools.cjs` → `.ai-kit/context-tools.cjs`. A plain install on a 1.x repo
stops and asks for `--upgrade`.

**Changed**
- One home for the kit's own files: `.ai-kit/` (context tool, version stamp `kit.json`, readiness weights
  `readiness.json`, CI templates). Every tool, the git hook and CI use the same path.
- Skills, seven instead of eight: `context-create` (quick, or `deep` for one page per dimension),
  `context-update` (also page format and table pages), `context-assess`, `context-learn`, `story-start`,
  `story-finish`, `onboard-me`.
- Page metadata moved from a one-line header to frontmatter following the Open Knowledge Format (OKF
  v0.3): `type`, `status` (draft, stable, deprecated), `verified` review events, `generated`, plus the
  kit's `dimension` and `owner`. Two different reviewers make an independent review. Reviews older than a
  page's `generated` date stop counting. 1.x pages are still read until migrated.
- Generated pages without a human review are capped at 3 in the readiness score.
- Always-loaded size counts one tool's rule folder, not every tool's.
- Product hub skill `hub-baseline` is now `hub-context` (existing hubs keep their copy; copy the folder from
  `kit/hub-template/` to update).

**Added**
- `--tool codex`, `--tool copilot,claude`, `--tool all`. Codex gets `AGENTS.md` and `.agents/skills/`
  (the design reviewer becomes the `design-review` skill there). With Copilot and Claude Code together,
  duplicate hook calls are ignored.
- `context-tools doctor`: hook files, harness settings, git hook, skills, CI, and when each hook last ran.
- Hook activity log in `.git/ai-kit/hook-log.jsonl`; `status` shows the last runs. Claude Code shows a
  one-line message at session start.
- Every skill ends with **What changed · Checks · Next**.
- `design-reviewer` agent: fresh-eyes, read-only review of a story's plan before code, called from
  `/story-start`. The idea comes from Google's Elephant-Goldfish Model.
- `context-tools schema-import`: one page per table from a tbls `schema.json`, refreshing only the
  generated part; detects references without a foreign key. `data-sources.md` explains code, schema file,
  catalogue and database MCP sources.
- `context-tools ci` and `--ci azure|github`: the pull request check, with a note when code changes arrive
  without an OpenSpec change folder.
- `context-tools mcp` and `--mcp` (preview): an MCP server with `context_for_files`, `context_check`,
  `context_readiness`, `context_status`.
- `context-tools pages-for <file>`.
- `/story-start` works without a person in the chat: it records assumptions and stops after the plan.
- Claude Code hooks are merged into an existing `.claude/settings.json` instead of asking you to merge.
- `ROADMAP.md` (maturity levels), `tools/test-kit.sh` (end-to-end test of the kit, 37 checks).

**Removed**
- `kit/optional/azure-pipelines-context-check.yml` (now `.ai-kit/ci/azure-pipelines.yml`, installed).

## 1.6.1 and earlier

See the git history: organisation layer (1.6), in-depth context and readiness score (1.5), stories across
several repos (1.4.1), fixes from a full review and story sizing (1.4), the story-tdd OpenSpec workflow.
