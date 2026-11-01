# FAQ

Follow-up questions from the research, answered in short form. The explainer (`explainer.html`) has the visual version; `GUIDE.md` at the repo root has the setup steps.

## Where does Graphify help?

Anywhere an agent would otherwise rediscover code structure by grepping. It is the L6 retrieval layer: "what calls what, and where does this live". It does not supply rules, intent or behaviour.

1. **Creating context.** Run it first as inventory. Its report of central concepts and module clusters tells you what to write about, so you never paste directory trees into `AGENTS.md`.
2. **Explore before propose.** During `/opsx:explore`, `graphify query "how does report filtering work"` or `graphify path ReportController ReportQueryService` replaces many file reads.
3. **Story context packs.** The `story-to-change` skill uses it to pull only the code neighbourhood a story touches.
4. **Impact checks.** Before changing a class or endpoint, see what depends on it inside the repo. `graphify serve` exposes the graph over MCP for a team.
5. **Freshness.** Its post-commit hook or `--update` keeps structure current, so hand-written context only needs rules.
6. **Onboarding.** `graph.html` gives new joiners a visual map.

Where it does not help: conventions and traps (use `AGENTS.md`, instructions, `known-traps.md`), intended behaviour (OpenSpec specs), and cross-service HTTP calls (use the OpenAPI / consumer brief; a per-repo code graph does not link an Angular HTTP call to the Spring endpoint it hits).

## Can we combine Spec Kit and OpenSpec?

Yes, if you split them by scope and never run both on the same change.

1. **OpenSpec owns current behaviour.** `openspec/specs/` is the only "what the system does today". All changes to existing code go through `/opsx:propose → apply → archive`.
2. **Spec Kit only for greenfield pieces:** a new microservice, module or large new feature area. It writes to `.specify/` and `specs/<feature>/`, so it does not touch `openspec/`.
3. **Graduate when it ships.** Convert the Spec Kit spec into an OpenSpec baseline spec and mark the Spec Kit folder historical. After that, every change is an OpenSpec delta.
4. **One set of rules.** Spec Kit's constitution and OpenSpec's `config.yaml` both point at the same `AGENTS.md` and platform rules instead of restating them.
5. **Routing line in `AGENTS.md`:** "New service/module → Spec Kit. Change to existing code → OpenSpec. Behaviour source of truth: `openspec/specs/`."

Lighter alternative: fork an OpenSpec schema to add Spec Kit-style gates (a research step, a constitution check) only for large changes, and keep one tool.

## How do we keep context updated?

Do not rely on discipline. Use a system:

1. **Shrink what needs maintaining.** Structure → Graphify; contracts → generated from OpenAPI; commands → build file. Hand-written context is only rules, traps and the "why".
2. **Generate what can be generated** (graph per commit, consumer brief per merge, specs per archive).
3. **Make drift visible.** Every hand-written fact carries `[anchor: <path>]`; `check-context.sh` fails on missing anchors and warns when anchored code changed but its context file did not.
4. **Tie updates to existing events.** Agent hooks (session start, post-edit, stop), git pre-commit, PR pipeline, OpenSpec archive guidance, `#agent-miss` tags, new-joiner questions.
5. **Prove it helps** with golden tasks; revert context changes that do not beat the no-context baseline.

## Should we use hooks?

Yes, as deterministic detectors and reminders, not as LLM writers. Hooks in the demo kit:

| Hook | Tool event | Effect |
| --- | --- | --- |
| session-start | Claude `SessionStart` / Copilot `sessionStart` | 3–6 line context health summary |
| post-edit | Claude `PostToolUse` / Copilot `postToolUse` | Names the context line anchored to the file just edited |
| stop | Claude `Stop` / Copilot `agentStop` | Checks broken/stale anchors; blocks once, never loops |
| guard | Claude `PreToolUse` / Copilot `preToolUse` | Steward runs only: denies edits outside context files |
| git pre-commit | git | Refuses commits with broken anchors (covers humans too) |

Agent hooks only run inside agent sessions, and Copilot hooks in VS Code are a preview feature, so keep the git hook and the CI check as the backstop.

## Should we build a custom agent to maintain context?

Yes, one narrow **context-steward** with limited tools, fixed modes (bootstrap, refresh, audit, prune, sprint-digest, quarterly-review) and a hard rule that it edits context files only. It proposes PRs; humans merge. Do not build one mega-agent that writes specs, code and context; keep roles separate.

## Should context be organised by quarter, sprint and story?

Use those as review cadences, not as folders. Dated documents confuse agents about what is current and add tokens. Story history already exists in `openspec/changes/archive/YYYY-MM-DD-<id>/`. Sprint: a 5-bullet human-facing `CHANGELOG.md`. Quarter: a one-hour prune and golden-task re-run. See `demo-kit/system-context/context/RITUALS.md`.

## How much context is enough?

As little as passes your golden tasks. Starting budgets: always-on (platform + `AGENTS.md`) about 1,500 tokens, `AGENTS.md` under 100 lines, each scoped instruction under ~50 lines, a story context pack under ~150 lines, everything else on demand. Too much shows up as more agent steps and cost with no quality gain; too little shows up as repeated `#agent-miss` comments and the same questions every session.
