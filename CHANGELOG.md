# Changelog

## 2.4.0 (November 2026)

Context that is used, and pull requests that say what they are.

**Added**
- **Product pages reach stories.** In a product workspace, `pages-for <file>` also lists the home repo's pages
  anchored to that file (flows across repos, platform rules), so `/story-start` reads the flow that says which
  event another service listens for, and `/story-finish` names the product page a change affects.
- **Which pages agents read.** The agent hooks record each context page an agent opens (Copilot, and Claude
  Code, whose hook now also sees reads and shell commands), whether through the file-read tool or printed in
  the shell (`cat`, `head`, `tail`, `sed`, `Get-Content`, with `cd` and `*` understood). `context-tools usage`
  lists pages by how many chats opened them, and the pages nobody opened.
- **Branch and pull request convention** (`.ai-kit/conventions.json`, team- or org-owned): per kind of work
  (feature, production fix, QA/UAT fix, maintenance) the work item type, branch pattern, title prefix and
  metrics category; promotion branches exempt. `context-tools conventions` works out the type from the work
  item and prints the branch, title and work item link. `/story-start` proposes the branch and creates it
  after asking; `/story-finish` writes the title and link; the commit check warns about a branch that does not
  follow it; the pull request check compares branch and title. `check`: off, warn or block. `install.mjs --org`
  copies the organisation's version.
- The workspace home repo gets a `CLAUDE.md` (`@AGENTS.md`), so Claude Code reads its rules.

**Changed**
- `--upgrade` refreshes the kit's own Claude Code hook entries and keeps the team's own hooks.
- `/story-start` starts its knowledge step with one `pages-for` call over the files the story touches, reads
  every page it names, and no longer lists or reads whole context folders; the story pack records each page
  read and why. The plan template has a "Context read" section.
- `MULTI-REPO.md` rewritten around the product workspace, with the rule for what lives in a repo and what in
  the home repo; `ORG-LEVEL.md`, the root `GUIDE.md`, `kit/GUIDE.md` and the management briefing updated.

## 2.3.1 (November 2026)

**Changed**
- Setup planner: two or more repos next to the kit suggest a product workspace, even when one already has
  its own copy (it moves in and keeps its knowledge); choosing the workspace turns product context on.
- `ARCHITECTURE.md` checked against the kit and corrected: skill and principle counts, the skills table
  (`/kit-setup`, `/cross-repo-story`), what the checks block and what they only flag, the file-level limit of
  anchors, generated knowledge going stale until rebuilt, the optional pull request check, OpenSpec's default
  workflow, the product workspace as the model for many repos and what belongs in a repo versus the home repo,
  the schema export, the research that does not support context files, and the first with/without test.
- The four architecture diagrams redrawn for 2.3; their sources are now in `docs/images/src/`
  (`tools/diagrams.py` writes them, `tools/build-diagrams.py` renders the PNGs).

## 2.3.0 (November 2026)

Setting up the kit is one sentence to an agent, or one command in a terminal.

**Added**
- **Setup agent** (`kit/SETUP-AGENT.md`): put the kit next to your repos and tell any agent "Set up the AI
  context kit for the repos in this folder. Follow <kit>/kit/SETUP-AGENT.md." It looks at every repo, asks
  once (a product workspace or each repo on its own, which repos, which agents, product context or not, the
  pull request check, OpenSpec, Graphify, which repos get context now), shows the plan, runs it after a yes,
  then offers context repo by repo, database pages, product pages and the pipeline step.
- **`kit/setup.mjs`**, the planner behind it: `scan`, `plan` (`--json` for agents), `apply --yes`, or no
  command for questions in a terminal. The plan comes from what is on disk each time, so running it again shows
  only what is left; it moves repos with their own copy into a workspace, upgrades older repos (with the
  follow-up steps a version needs), links a teammate's clone, skips repos with uncommitted changes, never
  commits or pushes, and ends with each repo's `doctor` result.
- **`/kit-setup` skill** in every set-up repo: "add repo X", "we also use Codex", "upgrade the kit", "is it
  working?".
- **Pull request check in the pipeline you already have:** `kit/snippets/ci-step-azure.yml`,
  `ci-step-member-azure.yml` (its own job, so the home repo checkout does not change your build's paths) and
  GitHub versions.

**Changed**
- `--ci` is optional everywhere and no longer in the example commands. It never edits an existing pipeline:
  it writes a separate pipeline file.
- `doctor` finds the pull request check in any pipeline file that runs it, and no longer warns when there is
  none (it is optional).
- `kit/GUIDE.md`: setup with the agent first, then by hand; a section on the pull request check.

## 2.2.0 (November 2026)

The database context needs less hand work and catches its own mistakes.

**Added**
- `schema-import` reads the code without running it (JPA entities in Java and Kotlin, `@MappedSuperclass`
  fields, Spring Data repositories, SQL strings, MyBatis mappers, migrations; not test code). Each table
  page lists its entity, repository, SQL and migrations with anchors, the fields named differently from
  their column, references that exist only as `@JoinColumn`, and allowed values from Java enums.
  It flags enums stored as numbers (ORDINAL) and lists where the code and the schema disagree: a column
  or table the export does not have, enum values that differ. `--no-code` skips this.
- The import prints only the questions the code cannot answer: references without a foreign key that no
  entity explains.
- `check`, `ci` and the commit check say when table pages are out of date with the schema file or the
  code, and when a migration changed but the schema file did not. They do this only when a schema file,
  table page, migration or data-access code changed.
- Agent hooks: editing an entity, repository or migration asks the agent to run `schema-import`, not to
  edit the generated part; the end-of-task check lists only problems in files the agent touched.
- `context-tools review <page|folder> --by <name>`: a person marks pages reviewed (status `stable`, the OKF
  review event), unused template lines are removed, and pages with broken anchors or no "Meaning" are
  refused. It runs only in a terminal a person types in, so an agent cannot sign off its own pages.
- `doctor` shows the data context: schema file, table pages, how many are linked to code and reviewed, and
  whether a rule file sends agents to the pages.
- `kit/GUIDE.md`: database context, step by step.
- `install.mjs --source <url>`: records where your team keeps its copy of the kit in `.ai-kit/kit.json`
  (a user name or token in the URL is removed).

**Changed**
- `.ai-kit/kit.json` no longer records the public kit repo's address, and names the kit `ai-context-kit`.
  `--upgrade` removes the old address from existing repos; an address set with `--source` is kept.
- A refresh that changes only the code lines on a table page keeps the owner's review; a change to the
  table's structure still resets it.
- New table pages have "Other code that reads or writes it" (only what the import cannot see) instead of
  "Code that reads or writes it".
- Anchors inside generated parts no longer raise "is this line still true?" warnings; the import check
  covers them.
- The commit check reads files from disk unless they have unstaged edits: about ten times faster with
  hundreds of table pages.

## 2.1.1 (November 2026)

- `schema-import` reads a **DDL dump** (`.sql`) directly: PostgreSQL `pg_dump --schema-only` and DB
  viewer exports (DBeaver, pgAdmin, DataGrip); simple MySQL and SQL Server tables mostly work. Tables,
  columns, defaults, keys, foreign keys (inline or `ALTER TABLE`), unique and check constraints, indexes,
  comments, views, enum values and triggers. Flyway and Liquibase history tables are skipped. No database
  connection and no extra tool needed.
- A table page that already exists (for example from `/context-create deep`) keeps every word; the
  importer adds a "Generated from the schema" section, and finds pages named with or without the schema.
- Rows inside a generated block count as anchored when its `Source:` line is anchored.
- A relative schema path works together with `--repo`.
- `/context-create deep data` spells out the data steps: import, link tables to code with anchors, ask about
  references without a foreign key and status values, link from `data.md`, add a data-access rule file.

## 2.1.0 (November 2026)

Two ways to set the kit up, OpenSpec back to its default documents, and a user guide inside the kit.

**Added**
- **Product workspace** (recommended for a product with several repos): one home repo holds every skill,
  agent, hook, the context tool and the product context; each repo holds only its own knowledge, so each
  skill appears once in the editor and the kit is upgraded once.
  - `install.mjs --create-workspace <home>` creates the home repo; `install.mjs <repo> --workspace <home>`
    registers a repo (catalogue, `product.code-workspace`, commit check from the home repo, a small stamp,
    the PR template, and with `--ci` a pipeline that checks out the home repo).
  - `--upgrade` with `--workspace` removes a repo's own copies of the kit and of OpenSpec's tool files.
  - The home repo's session note lists every repo, those without context yet and those not registered;
    `doctor` in the home repo checks every repo.
  - `node scripts/hub.mjs claude` starts Claude Code in the home repo with every repo added.
  - `/product-context update` refreshes only the product pages a new or removed repo affects.
- `kit/GUIDE.md`: the kit's user guide (both setups, every skill, a story start to finish in each agent).
- A discovery pass at the start of `/context-create deep` (stack, file categories, domains, style per
  file kind).
- Change ids start with the work item number as it is: `48213-add-report-export`.

**Changed**
- OpenSpec uses its **default** documents (proposal, specs, a design when needed, tasks). The kit no
  longer installs the custom `story-tdd` schema; `openspec/config.yaml` gets only a short context and
  test-first guidance. `--upgrade` switches a repo back to `schema: spec-driven`; changes already started
  with `story-tdd` keep it until archived. A team's own design or test-scenario format runs as its own
  skill after `/opsx-propose`.
- Without OpenSpec, `/story-start` writes one `plan.md` instead of a technical design and a test plan.
- `/story-finish` and the design reviewer check that every scenario has a test, from the specs and tasks.
- The product hub skill is now `product-context`.
- Git hooks find the context tool next to themselves, so one `.githooks/` folder serves every repo.

**Removed**
- `kit/openspec-schema/` and `--keep-schema`.

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
- `ROADMAP.md` (maturity levels), `tools/test-kit.sh` (end-to-end test of the kit).

**Removed**
- `kit/optional/azure-pipelines-context-check.yml` (now `.ai-kit/ci/azure-pipelines.yml`, installed).

## 1.6.1 and earlier

See the git history: organisation layer (1.6), in-depth context and readiness score (1.5), stories across
several repos (1.4.1), fixes from a full review and story sizing (1.4), the story-tdd OpenSpec workflow.
