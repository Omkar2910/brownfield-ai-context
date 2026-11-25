# Validation plan

How to convince yourself (and others) that kit 2.0 works, before and during the pilot.

## 1. Automated (every kit change)

```bash
bash tools/test-kit.sh
```

84 checks on throwaway repos: fresh install per tool, all tools at once, upgrade from 1.6.1 and `migrate`,
`doctor`, hooks (dedupe, post-edit, stop, guard), `schema-import` (tbls JSON and DDL dumps; create, refresh,
keep human text; the code map from JPA entities, repositories, SQL and migrations), the data checks in
`check`, the hooks and `doctor`, `review`, readiness caps, `ci`, `mcp`, org sync for two tools, hub map,
product workspace (home, members, commit check, hooks across repos, joining with --upgrade). Run it on
Windows (Git Bash) once too.

## 2. Manual checks in real tools (once per tool, on your machine)

| # | Check | How | Pass when |
| --- | --- | --- | --- |
| 1 | Copilot sees the kit | VS Code → Chat: Open Customizations | 7 kit skills, 2 agents, hooks listed |
| 2 | Hooks really run in Copilot | Start an agent chat, ask a question, then `node .ai-kit/context-tools.cjs doctor` | "session-start: last run … from copilot" |
| 3 | If 2 fails | Check the session target (Copilot harness), `chat.useHooks` for Local, Agent Debug Logs, org policy | You know which of the four it is |
| 4 | Post-edit note | Ask the agent to change a file that a context line anchors | Debug log shows `additionalContext`; agent mentions the line |
| 5 | Stop hook | Let it finish without updating that line | It is asked once to re-check |
| 6 | Steward guard | Select context-steward, ask it to edit a Java file | Refused |
| 7 | Design reviewer | After `/opsx-propose`, run the design reviewer in a new chat | Findings table; it reads only the change and named files |
| 8 | Claude Code | `/hooks`, `/agents`, start a session | Session-start message visible to you |
| 9 | Codex | `/skills` in the repo | Kit skills and `design-review` listed |
| 10 | Copilot + Claude in one repo | Start a Copilot chat, check the hook log | Second call marked duplicate, no double notes |
| 11 | PR check | Push a branch with a stale anchor through the pipeline | Warning in the pipeline output |
| 12 | Schema import | Run tbls against a QA database (read-only user), then `schema-import` | Table pages generated; re-import after a migration changes only generated parts |
| 14 | Product workspace in VS Code | Open `product.code-workspace` with the home repo and two repos | Each kit skill listed once; each repo's `AGENTS.md` and rules still apply |
| 15 | Workspace hooks | Ask the agent to edit a file in a service repo, then `doctor` in the home repo | post-edit ran; the note names the service repo's context line |
| 16 | OpenSpec in a workspace | `/opsx-propose <id>` "in report-service" | The change folder is created in report-service, not in the home repo |
| 17 | Claude Code in a workspace | `node scripts/hub.mjs claude` | Skills from the home repo; each repo's `CLAUDE.md` loaded |
| 13 | Upgrade of a real 1.x repo | `--upgrade --dry-run`, `--upgrade`, `migrate`, `doctor` | No team file edited; pages converted; doctor clean |
| 18 | Code map on a real service | `schema-import` on a service with its DDL export; compare the "Code: N entities" line with the entity count in the code; open five table pages | Every entity found; no wrong repository or SQL file on the five pages; each "Code and schema disagree" line is real |
| 19 | Review in real terminals | `review <page> --by <name>` in the VS Code terminal (PowerShell and Git Bash) and in Windows Terminal; then ask an agent to run it | People can run it; the agent's attempt is refused |
| 21 | Setup agent in each tool | In Copilot, Claude Code and Codex: open a folder with the kit and three repos (one with its own older kit, one with uncommitted changes), say "Set up the AI context kit… Follow <kit>/kit/SETUP-AGENT.md" | It scans, asks once, shows the plan, waits for yes, skips the dirty repo, ends with doctor results; nothing committed |
| 22 | Setup agent, vague requests | After setup: "add repo X", "we also use Codex", "upgrade the kit", "is it working?", "push it" | Each goes through the planner; the last is refused |
| 23 | Pull request step in an existing pipeline | Add `kit/snippets/ci-step-member-azure.yml` to a real repo's pull request pipeline | The team's build still passes; the check job runs; `doctor` shows it |
| 20 | Commit check speed | `git commit` in the largest service after the import | Under a second when no data code changed |

Record results in a short table with the date, tool version and outcome; anything that fails becomes an
issue before the wider pilot.

## 3. Pilot measures (per story)

From `templates/story-log.md`: agent corrections (`#agent-miss`), files read before first edit, review
rounds, rework after review, premium requests, time to PR, design-reviewer findings that were real. Compare
with similar stories done without the kit. One story is a demonstration; three to five per repo start to be
evidence.

## 4. What would make us stop or change course

- The design reviewer's findings are mostly noise after five stories → make it optional.
- Hooks never run on managed laptops → drop them from the default install; rely on the git hook and PR check.
- Readiness rises without outcomes improving → stop reporting the score upward until it correlates.
