# Context guide: creating, using and maintaining AI context

This guide is about the **context** itself: the knowledge an AI agent needs to work well in an existing
codebase. It works **with or without OpenSpec** and for any task: a bug fix, a small change, a
refactor, a story. OpenSpec (see [GUIDE.md](GUIDE.md)) adds a way to agree on *what to build* for a
story; this guide is about *what the agent should know* every time.

Plain English, about 20 minutes to read. Last checked November 2026.

---

## 1. What "context" means

Everything the agent reads besides your prompt. There are two kinds:

| Kind | What it is | Example | Lifetime |
| --- | --- | --- | --- |
| **Lasting context** | Knowledge about the codebase that stays true for months | "Every endpoint checks a permission with `@RequiresPermission`; login roles are never used for access" | Months to years |
| **Task context** | What one piece of work needs | "This bug is in the export path; these 4 files matter; the row limit is 50,000" | Hours to days |

Most problems come from mixing them: task notes pasted into permanent files (which then go stale), or
permanent rules re-typed into every prompt (which then vary by developer).

OpenSpec covers one slice of this: the record of what the system *does* (specs) and the task context
for a story (a change folder). This guide covers the rest: rules, traps, commands, and how the agent
finds things.

---

## 2. What good context looks like

Six properties. If a line fails one, fix or delete it.

| Property | Test | Bad | Good |
| --- | --- | --- | --- |
| **Non-obvious** | Could someone find it by searching in a minute? | "The project uses Spring Boot." | "Heavy report queries use `JdbcTemplate`, not JPA: JPA loaded 200k rows into memory once." |
| **True** | Does the code still do this? | A command that was renamed last year | A command copied from the current build file |
| **Specific** | Could an agent act on it? | "Follow security best practices." | "Never log request bodies: they contain client PII." |
| **Has a reason** | Does it say why? | "Don't use `ZonedDateTime` for `as_of_date`." | "…: it is a business date with no time zone; conversion shifts it by a day for US users." |
| **Anchored** | Does it name the code it describes? | (no link to code) | `… [anchor: src/main/java/**/ReportFilterSpec.java]` |
| **In the right place** | Is it loaded only when needed? | Angular rules in the root file that every Java task also reads | Angular rules in an instructions file that loads only for `.ts`/`.html` |

Why so strict: published studies found long, generated context files made agents slower (about 20%
more cost) and often less accurate, while short human-checked files helped a little. Agents follow what
you write, so every unnecessary rule is work they will do.

---

## 3. Where each kind of fact goes

Ask these questions in order. Stop at the first "yes".

1. **Is it true for almost every task in this repo, and would a mistake be costly?**
   → `AGENTS.md` (read on every request). Keep the file around 100 lines, never above 150.
2. **Does it apply only to certain files** (controllers, migrations, Angular components, tests)?
   → a scoped rules file in `.github/instructions/` with a tight `applyTo` pattern.
3. **Is it background someone needs only for some tasks** (architecture, data flow, traps in one area)?
   → a page in `docs/context/`, listed in the "Where to look" section of `AGENTS.md`.
4. **Is it a procedure** (how to add an endpoint end to end, how to release, how to create context)?
   → a skill in `.github/skills/`, called by name (`/skill-name`).
5. **Is it structure** (what calls what, where a class lives, what depends on what)?
   → don't write it down. The agent queries the Graphify code map (or searches the code). Context
   files only point to the map; they never copy it.
6. **Is it about how the system behaves** (requirements and scenarios)?
   → OpenSpec specs, if you use OpenSpec; otherwise tests are the best record.
7. **Is it only about the current task?**
   → task context: the chat, or a task note (a story context pack). Never a permanent file.
8. **Is it shared by several repos** (platform rules, API contracts)?
   → one shared place (organization instructions or the product context hub, see [MULTI-REPO.md](MULTI-REPO.md)), linked from each repo.

---

## 4. Creating context for an existing repo

Budget about two hours per repo, spread over a day. The kit's `/context-bootstrap` skill does steps
2, 4 and 5 for you, but you own the result.

### Step 1 — Harvest what already exists (30 min)
The best rules are already written somewhere, just not for agents. Collect, don't write:

| Source | What it gives you |
| --- | --- |
| Build files and CI pipeline | The real commands |
| README, wiki, onboarding docs | Architecture, setup (check it is still true) |
| **Pull request review comments** from the last few months | Rules people keep repeating ("use the error helper", "no entities in responses") |
| Incident and bug reports | Traps, with reasons |
| Code comments with WHY / HACK / NOTE | Deliberate oddities |
| ADRs and design docs | Decisions and their reasons |
| Team chat FAQs | Questions people ask again and again |

### Step 1b — Build the code map (5 min)
`graphify extract . --code-only` then `graphify cluster-only . --no-label` (local, no API key). The report's
most connected classes tell you what the architecture page must explain. See [TOOLBOX.md](TOOLBOX.md#3-graphify-in-depth).

### Step 2 — Draft with the agent (20 min)
In agent mode: `/context-bootstrap`. It reads the code and build files and drafts `AGENTS.md`, two to four
scoped rule files and `docs/context/architecture.md` and `known-traps.md`. Paste the harvest notes
into the chat so it uses them.

### Step 3 — Interview the people who know (30 min)
The skill asks these; get a senior engineer or tech lead to answer:
1. What do new joiners get wrong in their first month?
2. Which platform rules apply (authentication, permissions, logging, error format)?
3. What looks wrong but is deliberate?
4. What must never be edited by hand?

### Step 4 — Prune (20 min)
Go line by line with the six properties from Section 2. Expect to delete a third or more of the draft.
That is normal and the most valuable part of the work.

### Step 5 — Anchor (10 min)
Add `[anchor: <path or glob>]` after each line that depends on specific code. This is what lets the
tools notice later when the code changes and the line may be wrong.

### Step 6 — Try it on real tasks (20 min)
Pick two small tasks you did recently. Start a fresh chat for each and ask the agent to do it again.
Watch: did it follow the rules? Did it open the right files? Did it ask fewer questions? If a rule
didn't help, cut or reword it.

### Step 7 — Review and merge
Run `node .github/hooks/scripts/context-tools.cjs check`, then open a pull request like any code change.
The tech lead reviews the context files; that review is the quality gate.

---

## 5. Using context day to day

The point of good context is that you **stop re-typing the same instructions**. The agent reads
`AGENTS.md` and matching rule files automatically.

| Task | What to do |
| --- | --- |
| **Small change or bug fix** | Just describe it. Add "check docs/context/known-traps.md first" if it touches a risky area, and "run graphify affected on what you change" if it touches shared code. |
| **Bigger change or story** | `/story-to-change` gathers only the context the task needs (works with or without OpenSpec), then you agree a plan before coding. |
| **Unfamiliar area** | Ask the agent to explain the area first and list which rules apply, before any edits. |
| **Code review** | "Review this diff against AGENTS.md and the instructions that apply. List violations with file and line." |
| **Agent got something wrong** | Correct it, then `/context-learn <what went wrong>` so it is fixed for everyone (see Section 6). |
| **New team member** | `/onboard-me` for a guided tour. |

Two habits that make a big difference:
- **Ask the agent to say which rules apply** before it codes. If it can't name them, the context did not load.
- **Check what was loaded.** In VS Code, expand **References** under a chat response to see which instruction files were used.

---

## 6. Maintaining context

Context rots for one reason: updating it depends on someone remembering. The kit replaces remembering
with four layers, from fully automatic to occasional.

### Layer 1 — Automatic (no effort)
| What | When | What happens |
| --- | --- | --- |
| Agent hook: session start | Each new chat | The agent gets a short note: how many context files, any broken anchors |
| Agent hook: after an edit | Each time the agent edits a file | If a context line is anchored to that file, the agent is told which line to re-check |
| Agent hook: before finishing | When the agent tries to stop | It checks for broken or stale anchors once and asks the agent to fix or confirm |
| Git pre-commit hook | Each commit, by anyone | Refuses the commit if a context line points at a file that no longer exists |
| Git post-commit / post-merge / post-checkout hooks | Each commit, merge, branch switch | Refresh the Graphify code map in the background, so structure is never stale |
| PR pipeline check (optional) | Each pull request | Same check, against the target branch; warnings at first, blocking later |

### Layer 2 — When something happens (minutes)
| Trigger | Action |
| --- | --- |
| You changed a command, convention, contract or integration | Update the context line **in the same pull request** (the PR template asks) |
| The checks report a stale or broken line | `/context-refresh`: it updates, moves or deletes only the affected lines |
| The agent made a mistake a rule would have prevented | `/context-learn <what happened>`: it adds a short rule in the right place, with a reason and anchor |
| A reviewer writes the same comment twice | Same: it becomes a rule |
| An incident or production bug | Add a trap to `docs/context/known-traps.md` with the reason |
| A framework or library upgrade | Re-check the lines anchored to config and build files |
| A new joiner had to ask a person something | That answer is a missing rule |

### Layer 3 — On a schedule (minutes per sprint, an hour per quarter)
| When | What | Who |
| --- | --- | --- |
| End of each sprint (15 min) | Select the **context-steward** agent: `sprint-digest`. Look at agent mistakes noted this sprint; turn repeats into rules. | Tech lead |
| Each quarter (1 hour) | `context-steward`: `quarterly-review` and `prune`. Re-run two or three past tasks. Delete rules that never mattered. | Tech lead + one developer |

### Layer 4 — Ownership
| File | Owner | Rule |
| --- | --- | --- |
| `AGENTS.md`, `.github/instructions/` | Service tech lead | Changes reviewed like code |
| `docs/context/` | Service team | Updated in the PR that changes the behaviour |
| Skills and the steward agent | Whoever maintains the kit for your teams | Versioned; changes announced |
| Shared platform rules | Architecture or platform team | One copy, linked from each repo |

### The update loop
Every update, whoever or whatever triggers it, follows the same four steps:

1. **Detect** — a hook, the check, a reviewer, or a person notices.
2. **Decide** — for each line: update it, move its anchor, delete it, or confirm it is still true.
3. **Change in the same PR** as the code that caused it.
4. **Review** — a person approves. Agents propose context changes; they never merge them.

### What not to do
- Don't only add. Every quarter, deleting is as important as adding.
- Don't keep dated documents (sprint notes, meeting notes) where agents read them. Agents can't tell
  what is current. Keep history in git, in `CHANGELOG.md`, or in OpenSpec's archive.
- Don't paste task notes into permanent files.
- Don't let an agent rewrite context files from scratch. Refresh changes only what changed.

---

## 7. How much context is enough?

As little as makes the agent do the right thing. Starting budgets:

| Context | Budget |
| --- | --- |
| `AGENTS.md` | About 100 lines; never above 150 (the check warns) |
| Everything loaded on every request | About 2,000 tokens (`context-tools.cjs status` shows it) |
| Each scoped rules file | Under about 50 lines |
| A task context pack | Under about 150 lines |
| `docs/context/` pages | Only loaded when needed; an area page under about 150 lines |

**Too much:** the agent takes more steps and reads more files for the same task; rules contradict each
other; lines describe things a search finds quickly.
**Too little:** the same mistake shows up twice; the agent asks the same question every session; new
joiners ask people about the same trap.

To know for sure, keep three to five past tasks with known-good results and re-run them in a fresh chat
when you change the context. Keep the change only if results are the same or better.

### Deep context: area pages, added when a story needs one

Some areas need more than a line in `AGENTS.md`: a flow that crosses UI, API, service and database, or
domain rules such as an Excel export format. For those, write an **area page**
(`docs/context/<area>.md`): the flow as numbered steps with anchors, the rules the code enforces, data,
edge cases, traps, the tests to run, and an "Unverified" section. The template is in the
`story-finish` skill's references.

**When:** not up front, and not for every area. Write one when a real story needed a lot of tracing to
understand an area (many files read, a wrong first guess, a flow across several layers), the area has no
page yet, and it will be changed again. `/story-finish` asks this question at the end of each story and
offers to turn the story's verified `design.md` sections into the page.

**Why not generate deep docs for the whole codebase at once:**
- Files that load on every request and were written by AI made agents slightly worse and about 20% more
  expensive in the largest study so far (ETH Zurich, 138 repositories).
- Models get worse as their input grows, even on easy tasks ("context rot", Chroma Research).
- The project with the strongest results from deep docs (the "Codified Context" case study) wrote them in
  response to observed failures, kept them on demand, and still found stale docs were its main failure.
- Every generated line needs a person to check it. A page written at the end of a story has just been
  checked by the story's own tests and review.

**Exception:** before a large story in an undocumented area, run `/opsx-explore` on it and ask the agent to
save the result as an area page, then check it like any other context change.

---

## 8. Several repos (UI + backend)

- Each repo owns its own context. Never merge two services' rules into one file.
- When a task crosses repos, open both in one VS Code window (multi-root workspace); each keeps its own
  context and the agent sees both.
- What crosses the boundary is the **contract**: the backend's API definition (OpenAPI or DTOs). Point
  the UI's context at it rather than describing the API in prose.
- Platform rules (authentication, permissions, error format) live once, in organization instructions or a
  shared repo, and each `AGENTS.md` links to them.
- The `demo-kit/` folder shows this layout with two made-up services.

---

## 9. How the kit supports all this

| Need | Kit piece |
| --- | --- |
| Create context | `/context-bootstrap` skill, templates, prune checklist |
| Gather task context | `/story-to-change` skill (OpenSpec optional) |
| Fix context after changes | `/context-refresh` skill |
| Learn from mistakes | `/context-learn` skill |
| Tour for new joiners | `/onboard-me` skill |
| Sprint and quarter upkeep | `context-steward` agent |
| Notice drift automatically | Agent hooks, git pre-commit hook, `context-tools.cjs check` |
| Structure and impact without writing it down | Graphify code map (`--graphify`), refreshed by git hooks |
| Same-PR rule | Pull request template |

Install it with `node kit/install.mjs <your-repo>` (see [GUIDE.md](GUIDE.md), Section 3). OpenSpec is
not required; without it, skip the OpenSpec steps and everything above still works.

---

## 10. Checklists

**Creating context (once per repo)**
- [ ] Harvest: build files, CI, README, review comments, incidents, code comments
- [ ] Build the Graphify code map
- [ ] `/context-bootstrap`, answer the five questions
- [ ] Prune with the six properties; `AGENTS.md` about 100 lines
- [ ] Anchors on code-dependent lines
- [ ] Try two past tasks in a fresh chat
- [ ] `context-tools.cjs check` clean; PR reviewed by the tech lead

**Every pull request**
- [ ] Did this change a command, convention, trap, contract or integration? Context updated in this PR
- [ ] Check passes (pre-commit or pipeline)

**Every sprint (15 min)**
- [ ] Agent mistakes noted this sprint → repeated ones become rules (`/context-learn`)
- [ ] `context-steward`: `sprint-digest`

**Every quarter (1 hour)**
- [ ] `context-steward`: `quarterly-review`, then `prune`
- [ ] Re-run two or three past tasks
- [ ] Delete rules that never mattered
