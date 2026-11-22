# Validation plan

How to convince yourself (and others) that kit 2.0 works, before and during the pilot.

## 1. Automated (every kit change)

```bash
bash tools/test-kit.sh
```

37 checks on throwaway repos: fresh install per tool, all tools at once, upgrade from 1.6.1 and `migrate`,
`doctor`, hooks (dedupe, post-edit, stop, guard), `schema-import` (create, refresh, keep human text),
readiness caps, `ci`, `mcp`, org sync for two tools, hub map. Run it on Windows (Git Bash) once too.

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
| 13 | Upgrade of a real 1.x repo | `--upgrade --dry-run`, `--upgrade`, `migrate`, `doctor` | No team file edited; pages converted; doctor clean |

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
