# AI Context Kit 2.0: management briefing

November 2026 · for leadership · plain language

## Summary

- **The problem.** AI agents write good code for new projects but make mistakes in our older services,
  because what matters (conventions, traps, why things are the way they are) lives in people's heads.
- **What the kit does.** It adds short, reviewed knowledge files to each repo that any AI agent reads; a
  fixed story workflow (plan → technical design → test plan → fresh-eyes review → tests first → code →
  review); and automatic checks that flag knowledge that has gone out of date.
- **What is new in 2.0.** It works the same with GitHub Copilot, Claude Code and OpenAI Codex. You can see
  that the checks run. Upgrades cost no AI tokens. Database knowledge can be built from a schema file.
  And it has the groundwork for agents that work on their own in the cloud, which is where AI-native
  delivery is heading.
- **What it costs.** No new licences. About half a day per service to set up, most of it review, and a few
  minutes per story.
- **What it changes in a repo.** It only adds plain files. Nothing is sent anywhere by the kit itself. It can
  be removed by deleting folders.
- **What we expect.** Fewer wrong guesses by the agent, fewer review rounds, a design and test plan for every
  story. Measured on real stories, not assumed.

## Why it matters for where we are going

We use AI to assist developers today (level 2). The next stage (level 3, AI-native) is agents taking an
approved story to a pull request with people approving the plan and reviewing security and quality. Many
tools will compete for that work: Copilot's cloud agent, Codex, Devin, platforms such as Blitzy, and
delivery partners' own platforms.

Each of those tools builds its own private picture of our code, unreviewed, and we would rebuild it every
time we switch. The kit's answer: **our knowledge lives in our repos, reviewed by our people, readable by
any tool, and every change, whoever or whatever wrote it, passes the same check.** That keeps us free to
choose and change tools, and gives the "targeted human oversight" of level 3 a concrete form: approved
specs and designs in, checked pull requests out.

## What a repo gets

| Part | Plain words |
| --- | --- |
| `AGENTS.md` | A one-page "read me first" for any agent: commands, top rules, traps, where to look. Under 150 lines |
| In-depth pages | One reviewed page per area of knowledge (architecture, business rules, data, APIs, dependencies, security, testing, operations, decisions), and one page per database table. Read only when needed |
| Anchors | Each fact points at the code it describes, so the kit knows what to re-check when code changes |
| Skills | Saved step-by-step instructions for each job: create context, start a story, finish a story, learn from a mistake. Same way of working for every developer |
| Two helper agents | A steward that may only edit knowledge files, and a design reviewer that checks each plan with fresh eyes |
| Checks | In the agent's chat, at every commit, and on every pull request |
| Readiness score | 0–100 over 12 dimensions, capped by evidence: writing more never raises it, reviewing does |

## How a story runs

1. `/story-start`: the agent reads the work item, finds the files involved in every repo, sizes the story.
2. The agent writes the proposal, specs, technical design, test plan and test-first task list.
3. A design reviewer with no memory of that conversation checks the plan against the code and rules.
4. **A developer approves the plan.** Most mistakes are caught here, while they are cheap.
5. The agent writes tests first, then code, a slice at a time; the developer reviews each slice.
6. `/story-finish`: tests, test plan, impact on other code, knowledge updates, pull request text.
7. **The normal team review of the pull request**, with the pull request check run automatically.

## Cost and risk

| Question | Answer |
| --- | --- |
| Licences | None beyond the agent we already use. OpenSpec, Graphify and tbls are free and open source |
| Effort | About half a day per service to set up; minutes per story; a monthly 30-minute upkeep |
| Data | The kit's scripts never contact the internet. The database schema tool is run by a person, read-only, never against production |
| Lock-in | None: plain files. Each tool's folder can be added or removed |
| Can an agent push or merge? | No. Developers commit; pull requests go through normal review |
| What is not proven | The size of the benefit on our code; hooks inside live chats on our machines; Windows laptops. The pilot measures these |

## The ask

1. Run the pilot on real sprint stories in two or three repos, and report measured results (agent
   corrections, review rounds, rework, premium requests), with and without the kit.
2. If positive, move the kit to an internal repository with a named owner, and make the pull request check
   a warning on those repos, then a required check.
3. Use it as the in-house context and governance layer for the AI-native stage: whichever agent or platform
   we adopt next, it reads our repos' knowledge and passes our check.
