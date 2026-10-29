# Context rituals: story, sprint, quarter

Context is organised by **how long a fact stays true**, not by calendar. We do not keep
quarter or sprint folders of documents for agents: agents cannot tell which one is current,
and every extra file is more for them to read and for us to maintain.
The calendar decides **when we review**, not **where facts live**.

| Cadence | What happens | Who | Output | Loaded by agents? |
|---|---|---|---|---|
| Every edit (automatic) | `post-edit` hook flags context lines anchored to the file just edited | Hook | A reminder in the agent's context | Yes, transiently |
| Every agent session end (automatic) | `stop` hook checks broken/stale anchors once | Hook | Agent fixes or explains | — |
| Every commit (automatic) | Git `pre-commit` blocks broken anchors | Git hook | Commit refused until fixed | — |
| Every PR (automatic) | CI `check-context.sh` (warn → blocking) + same-PR checkbox | Pipeline + reviewer | Findings on the PR | — |
| Every story | `/opsx:archive` merges delta specs; archive guidance + `/context-refresh` update affected lines | Developer + agent | Updated specs and context in the same PR | Specs on demand |
| Every sprint (15 min in retro) | `context-steward sprint-digest`; review `#agent-miss` tags | Tech lead | 5 bullets in `CHANGELOG.md` | **No** (human-facing) |
| Every quarter (1 hour) | `context-steward quarterly-review`; re-run golden tasks; prune; tidy specs per domain | Tech leads + architecture | Smaller, verified context; keep/trim/delete decisions | — |

## Where things live (unchanged by cadence)
- Story-level detail: `openspec/changes/<id>/` while active, `openspec/changes/archive/YYYY-MM-DD-<id>/` after. Dated automatically, never loaded unless asked.
- Current behaviour: `openspec/specs/<domain>/spec.md`.
- Rules and traps: `AGENTS.md`, `.github/instructions/`, `docs/context/`.
- History for humans: `CHANGELOG.md`.
