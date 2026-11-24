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

Budget about two hours per repo, spread over a day. The kit's `/context-create` skill does steps
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
In agent mode: `/context-create`. It reads the code and build files and drafts `AGENTS.md`, two to four
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
Run `node .ai-kit/context-tools.cjs check`, then open a pull request like any code change.
The tech lead reviews the context files; that review is the quality gate.

---

## 5. Using context day to day

The point of good context is that you **stop re-typing the same instructions**. The agent reads
`AGENTS.md` and matching rule files automatically.

| Task | What to do |
| --- | --- |
| **Small change or bug fix** | Just describe it. Add "check docs/context/known-traps.md first" if it touches a risky area, and "run graphify affected on what you change" if it touches shared code. |
| **Bigger change or story** | `/story-start` gathers only the context the task needs (works with or without OpenSpec), then you agree a plan before coding. |
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
| The checks report a stale or broken line | `/context-update`: it updates, moves or deletes only the affected lines |
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

### In-depth context: the baseline, area pages and the readiness score

Teams and management often want a full reference of each service: architecture, business rules, data,
API, dependencies, security, testing, operations and decisions, the brownfield equivalent of a
greenfield project's constitution. That is compatible with the research above, as long as three rules hold:

1. **It is read when needed, never loaded on every request.** `AGENTS.md` stays under 150 lines and only
   points to the pages ("Changing the export → docs/context/data.md"). The research warns against loading
   long generated files every time, not against having them.
2. **It only counts once a person has checked it.** AI drafts make two kinds of mistake most often:
   leaving things out, and confident but wrong explanations of "why". Every page starts as a draft with
   its unproven claims listed under "Unverified"; its owner reviews it against the code.
3. **It is kept current by the same machinery as everything else**: anchors on every claim, the checks,
   and each story's plan review listing the pages it makes out of date.

**The pages** (`/context-create deep` creates them in `docs/context/`, one per dimension):

| Page | Dimension | Generated from code, or written |
| --- | --- | --- |
| `architecture.md` | Architecture | Written, anchored; most-connected parts from the code map |
| `domain.md` (+ `screens.md` in UI repos) | Business/domain | Glossary and rules written; the behaviour record is `openspec/specs/`, updated by every archived story |
| `data.md` + `data/tables/*.md` | Data | Overview written; one page per table, its structure generated from a schema file, its meaning written |
| `api.md` | API/integration | Endpoints generated from OpenAPI or controllers; conventions and odd behaviour written |
| `dependencies.md` | Dependencies | Libraries from the build file; consumers from the product hub |
| `security.md` | Security | Written, anchored to security config and permission checks |
| `testing.md`, `operations.md` | Testing, Runtime/operations | Written, anchored to test folders, config and pipelines |
| `decisions/*.md` | Decision history | One page per real decision, plus each story's design decisions in the OpenSpec archive |

Each page starts with a short frontmatter block the tools read:

```yaml
---
type: Context Page
status: draft
dimension: data
owner: "reports-team"
verified: []
---
```

After review it becomes `status: stable` with a line under `verified:`, for example
`- { by: "human:asha", at: "2026-11-20" }`; when a second person who did not write it has checked it, they
add their own line (an independent review). These fields follow the Open Knowledge Format (OKF v0.3), with
`dimension` and `owner` as the kit's own keys, so tools that read OKF can read these pages. Pages written with kit 1.x used a one-line header instead; `context-tools.cjs migrate`
converts them without an agent.

**Where each dimension comes from, and where it lives.** The kit keeps the reviewed, anchored version in
the repo, next to the code it describes, because that is the copy every agent and every pull request can
see. Catalogues and code maps are sources and companions, not replacements:

| Dimension | Sources | Kept in (the kit) | Companion tools, if your organisation has them |
| --- | --- | --- | --- |
| Code understanding | Code, build and pipeline files, the code map | `AGENTS.md`, rule files | Graphify (queried, never copied) |
| Architecture | Code map, entry points, config, integration clients | `architecture.md`; product-wide in the hub | Graphify; architecture diagrams in the hub |
| Business/domain | Code named after business concepts, specs, the team | `domain.md`, `screens.md`, `openspec/specs/` | A business glossary in a data catalogue, linked |
| Data | Migrations, entities, query constants, a schema file | `data.md`, `data/tables/` | OpenMetadata, DataHub, Collibra, Purview or Alation for lineage, owners and classification, linked from table pages |
| API/integration | OpenAPI files, controllers, DTOs, HTTP clients | `api.md`; contracts in the hub | An API catalogue, linked |
| Dependencies | Build files, config, the hub catalogue | `dependencies.md`, hub `system-map.md` | Software catalogue (for example Backstage), linked |
| Security | Security config, permission checks, logging | `security.md`, org rules | Security scanners: their rules belong in checks, not prose |
| Testing, operations | Test folders, pipelines, config, runbooks | `testing.md`, `operations.md` | Observability tools, linked |
| Decisions | Comments, commit messages, archived designs | `decisions/`, `openspec/changes/archive/` | — |

A code map is the right tool for questions about code ("what calls this?"); it does not know what a column
means or why a rule exists, so it cannot be the home for business, data or security knowledge. A data
catalogue is the right home for lineage and ownership across systems; it does not travel with the code
and agents in the editor rarely reach it. Link both from the pages rather than copying them.

#### Data context from code and from the database

The code shows how tables are used; the database shows what really exists, including columns and
references no entity maps. The kit combines them:

1. **From code (always):** migrations (Flyway, Liquibase or scripts), entities and repositories, and
   query constants or native SQL, which show joins the entities do not.
2. **From a schema file (when you can get one):** a person exports the schema once, with a read-only user,
   from a development or QA database: a DDL dump (`pg_dump --schema-only`, or a DB viewer's "Generate
   DDL") saved as `docs/context/data/schema.sql`, or a tbls `schema.json`. Then
   `node .ai-kit/context-tools.cjs schema-import docs/context/data/schema.sql`. It writes one page per
   table in `docs/context/data/tables/` (columns, defaults, keys, references, "looks like a reference but
   has no foreign key", allowed enum values, indexes, triggers, comments) and an index. A table page that
   already exists keeps every word; the importer adds a generated section to it. Later imports replace only the generated part; what
   people wrote (meaning, rules, which code reads or writes the table) is kept.
3. **From a data catalogue (if you have one):** link the table's catalogue entry; do not copy it.
4. **A database MCP server** is optional and only for local or development databases with a read-only
   user. Never point an agent at production.

Write the "meaning" part first for the tables the main flows use. Twenty good table pages beat four
hundred empty ones.

**How a story keeps it current.** A story that changes the database, an API and a screen lists those pages
in its design's "Context impact" table (`data.md`, `api.md`, `screens.md`). The agent updates them in the
same PR; `/story-finish` checks every listed page was updated and that no anchored page was missed. Even if
both are skipped, the anchors flag the lines whose code changed, and the readiness score drops until they
are fixed.

**Area pages** (`docs/context/areas/<area>.md`) are for one complex area in more depth than a dimension
page holds: a flow across UI, API, service and database, or a format such as an Excel export. Write one
when a real story needed a lot of tracing to understand the area; `/story-finish` offers it at the end of
such a story, built from the story's checked `design.md`.

**The readiness score.** `node .ai-kit/context-tools.cjs readiness` scores the repo from 0 to
100 over 12 weighted dimensions (code understanding 15%; architecture, domain, data, API, dependencies and
security 10% each; testing, operations, decisions, provenance and freshness 5% each). Each dimension is
rated 0–5 (missing, fragmented, partial, usable, strong, verified):

- The tool caps each rating at what the evidence supports: no page → 0, a draft → at most 2, generated,
  unanchored, stale or reviewed over 180 days ago → at most 3, reviewed → at most 4, independently reviewed → 5.
- Provenance (the share of statements with an anchor) and freshness (broken anchors, code changed since
  review, age of reviews) are measured, not rated.
- `/context-assess` rates each dimension within its cap, with evidence, in `docs/context/readiness.md`.
- Weights and band names can be changed in `.ai-kit/readiness.json`.

The score measures the context, not the results. Read it next to the always-loaded size it prints (a high
score with a bloated `AGENTS.md` is a warning sign) and next to the story log's outcomes.

**Why not just generate everything and load it:**
- Files that load on every request and were written by AI made agents slightly worse and about 20% more
  expensive in the largest study so far (ETH Zurich, 138 repositories).
- Models get worse as their input grows, even on easy tasks ("context rot", Chroma Research).
- The project with the strongest results from deep docs (the "Codified Context" case study) kept them on
  demand and still found stale docs were its main failure. That is why every page is anchored and scored
  for freshness.

---

## 8. Several repos (UI + backend)

- Each repo owns its own context. Never merge two services' rules into one file.
- When a task crosses repos, open both in one VS Code window (multi-root workspace); each keeps its own
  context and the agent sees both.
- What crosses the boundary is the **contract**: the backend's API definition (OpenAPI or DTOs). Point
  the UI's context at it rather than describing the API in prose.
- Platform rules (authentication, permissions, error format) live once, in the organisation context repo,
  and are synced into each repo ([ORG-LEVEL.md](ORG-LEVEL.md)).
- The `demo-kit/` folder shows this layout with two made-up services.

---

## 9. How the kit supports all this

| Need | Kit piece |
| --- | --- |
| Create context | `/context-create` skill, templates, prune checklist |
| Gather task context | `/story-start` skill (OpenSpec optional) |
| Create the in-depth pages | `/context-create deep`, page templates, `schema-import` for tables |
| Fix context after changes, or after a kit upgrade | `/context-update` skill, `context-tools.cjs migrate` |
| Score it | `/context-assess` skill, `context-tools.cjs readiness` |
| Know which context covers a file | `context-tools.cjs pages-for <file>`, the after-edit hook, the MCP server |
| See that the checks run | `context-tools.cjs doctor`, the final block of every skill |
| Learn from mistakes | `/context-learn` skill |
| Tour for new joiners | `/onboard-me` skill |
| Sprint and quarter upkeep | `context-steward` agent |
| Notice drift automatically | Agent hooks, git pre-commit hook, the pull request check (`context-tools.cjs ci`) |
| Structure and impact without writing it down | Graphify code map (`--graphify`), refreshed by git hooks |
| Same-PR rule | Pull request template |
| A second opinion on the plan | `design-reviewer` agent (fresh eyes, read-only) |

Install it with `node kit/install.mjs <your-repo>` (see [GUIDE.md](GUIDE.md), Section 3). OpenSpec is
not required; without it, skip the OpenSpec steps and everything above still works.

---

## 10. Checklists

**Creating context (once per repo)**
- [ ] Harvest: build files, CI, README, review comments, incidents, code comments
- [ ] Build the Graphify code map
- [ ] `/context-create`, answer the five questions
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
