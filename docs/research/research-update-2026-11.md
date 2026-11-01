# Research update — November 2026

What changed since the first round of research (October 2026), and how it changed the recommendations.

## New evidence on context

| Source | Finding | What we changed |
| --- | --- | --- |
| [Do Context Files Help Coding Agents? Two-agent ablation (arXiv 2607.27250, Jul 2026)](https://www.alphaxiv.org/abs/2607.27250) | Claude Code and Codex CLI on 17 real tasks: no measurable change in correctness with no guide (53.3%), an always-on guide (55.6%) or topic files read on demand (55.6%). Most failures came from implementation skill, not missing repo knowledge. Small study; cannot rule out effects under ~30 points. | Context alone will not fix quality. The workflow puts the proposal review, tests and `/opsx-verify` at the centre, and treats context as support. |
| [Vercel eval, reported by mcp.directory (Jan 2026)](https://mcp.directory/blog/claude-md-vs-agents-md-vs-skills-2026) | A compressed docs index in AGENTS.md reached 100% pass; skills topped out at 79% and were never invoked in 56% of cases. | AGENTS.md now includes a short "Where to look" index, and the guide calls skills explicitly by name at fixed steps instead of relying on automatic triggering. |
| AuggieBench (Augment Code), same article | Context files of 100–150 lines performed best; the worst files did worse than none. | Budget is "about 100 lines, never above 150"; the check warns at 150. |
| [SkillJuror (arXiv 2606.11543, Jun 2026)](https://www.emergentmind.com/papers/2606.11543) | Splitting a skill into a short root file plus on-demand references raised pass rate modestly (42.0% → 46.1%) on coding tasks, with large changes in how agents used resources. | Skills keep a short SKILL.md with `references/` for templates and checklists. |
| [Evaluating AGENTS.md (ETH Zurich, ICLR 2026)](https://arxiv.org/html/2602.11988v1) | LLM-generated context files lowered success in most settings and added 20–23% cost; human-written ones helped about 4%. | Unchanged: generate, then prune hard, then review. |

## Tooling changes

| Tool | Change | Impact on the kit |
| --- | --- | --- |
| OpenSpec 1.14–1.16 (Sep–Nov 2026) | Standalone install without Node.js (1.15); many `/opsx:verify` fixes; store-backed apply fixed (1.14); `openspec update --dry-run`. Tested here with 1.16.0. | Guide enables `verify`. Stores remain beta, so the single-repo setup is the default. |
| OpenSpec in VS Code | Commands are installed as prompt files named `/opsx-propose`, `/opsx-apply`, … (hyphen), plus `openspec-*` skills in `.github/skills`. | Guide uses the hyphen spelling. Claude Code uses `/opsx:propose`. |
| [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference) | `.github/hooks/*.json`; camelCase events (`sessionStart`, `postToolUse`, `agentStop`); `command` field runs on both bash and PowerShell; `cwd` relative to repo root. Preview in VS Code. | Kit hook file uses `command` + `cwd: "."`, so it works on Windows. Git hook and CI check remain the backstop. |
| [VS Code agent plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins.md) | Agent Plugins 1.0: skills, agents, hooks and MCP servers in one installable package; marketplaces from a git repo; enterprise policy controls. Marketplace settings are experimental. | Listed as the future org-wide distribution route; the kit uses a plain installer today. |
| [APM — Agent Package Manager](https://cdn.jsdelivr.net/gh/microsoft/apm@main/README.md) | `apm.yml` manifest to install skills, instructions, agents, hooks and MCP servers from git hosts including Azure DevOps, for Copilot, Claude and others. | Alternative distribution route once several teams adopt the kit. |
| [Azure DevOps MCP server](https://learn.microsoft.com/en-us/azure/devops/mcp-server/mcp-server-overview) | Work items, pull requests, pipelines and test plans for agents; remote (hosted) server recommended for VS Code, local `npx @azure-devops/mcp` also available. | Optional: lets `/story-to-change` read the work item and lets the agent create the PR with approval. |

## Recommendations, updated

1. Keep always-on context lean (~100 lines) **and** include an index of where knowledge lives.
2. Call skills explicitly at fixed points in the story workflow.
3. Spend the effort on the proposal review and on tests; context supports, it does not replace them.
4. Keep context honest automatically (anchors, hooks, pre-commit, PR check).
5. Measure on your own stories; published results disagree and are small.
