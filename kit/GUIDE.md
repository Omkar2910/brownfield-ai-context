# AI Context Kit: user guide

Kit 2.4 · for developers and tech leads · plain language

This guide covers everything you need to use the kit: setting it up, the skills, and running a story from
start to finish in GitHub Copilot, Claude Code or OpenAI Codex. It assumes you have the kit's folder on
your machine (the folder that contains this guide and `install.mjs`). Below, `<kit>` means that folder.

---

## 1. What the kit does

AI agents write good code in new projects but make mistakes in older ones, because what matters (how
things are done here, the traps, why the code is the way it is) is not written down. The kit fixes that
with three things:

1. **Knowledge the agent reads.** A short `AGENTS.md` in each repo, rule files for certain kinds of
   files, and in-depth pages (`docs/context/`) the agent opens only when a task needs them. Every fact
   points at the code it describes (an *anchor*), so the kit can tell when it goes out of date.
2. **Skills for each job.** Saved step-by-step instructions you start with a slash command:
   create context, start a story, finish a story, learn from a mistake.
3. **Checks.** The kit warns when knowledge no longer matches the code: in the agent's chat, when you
   commit, and on every pull request.

Nothing is sent anywhere by the kit. It only adds plain files, which you review and commit like code.

---

## 2. Choose your setup

| | **Product workspace** (recommended for a product) | **One repo** |
| --- | --- | --- |
| Use it when | Your product has several repos (micro-frontends, services, libraries) that you open together | A single repo, or a repo a team works on alone |
| Where the tools live | Once, in a **home repo** for the product | Inside the repo |
| What each repo holds | Only its own knowledge: `AGENTS.md`, rule files, `docs/context/`, `openspec/` | Its knowledge **and** its own copy of the tools |
| Skills shown in the editor | Each skill once | Once per repo you open |
| Product-wide context (system map, flows across repos) | In the home repo, updated as repos are added | Not included (add a product hub later if needed) |
| Updating the kit | Once, in the home repo | In every repo |

**Why knowledge stays in each repo, even in a workspace:** a cloud agent or a pipeline sees only one repo,
and a page should change in the same pull request as the code it describes.

You can switch a repo from "one repo" to the workspace later (section 11).

---

## 3. What you need

- **Node.js 18 or newer** (`node --version`).
- **git**.
- **An agent:** GitHub Copilot in VS Code (agent mode), Claude Code, or OpenAI Codex.
- Optional, recommended:
  - **OpenSpec** for planning stories: `npm install -g @fission-ai/openspec@latest`.
  - **Graphify** for a code map the agent can search: `pip install "graphifyy[mcp]"`.

---

## 4. Set up with the setup agent (easiest)

Put the kit's folder next to your repos, open that folder in your agent, and type one sentence:

```
projects/
  ai-context-kit/      ← the kit (the folder that holds kit/setup.mjs)
  report-service/
  report-ui/
```

> Set up the AI context kit for the repos in this folder. Follow ai-context-kit/kit/SETUP-AGENT.md.

The agent looks at every repo, asks you once what you want, shows the plan, and runs it after you say yes:

| It asks | Your choices |
| --- | --- |
| What to do | Set up or update · only check · upgrade only |
| Setup | One home repo for the product (recommended for two or more repos) · each repo on its own |
| Repos | All it found, or the ones you pick |
| Agents | GitHub Copilot, Claude Code, Codex |
| Product context | Write the product pages (system map, flows across repos), or not |
| Pull request check | Not now · add it to the pipeline each repo already has · a separate Azure pipeline · a GitHub workflow |
| OpenSpec, Graphify | Set them up, or not (asked only if they are installed) |
| Context now | Which repos to write context for after the install |

Then it offers, one at a time: context for each repo (services first), database pages where there is a schema
export, the product pages, and the pull request step for your pipeline. It never commits or pushes, and it
skips repos with uncommitted changes. Run it again at any time: it shows only what is left. After setup the
same agent is the `/kit-setup` skill: "add repo X", "we also use Codex", "upgrade the kit", "is it working?".

**Without an agent:** `node ai-context-kit/kit/setup.mjs` in a terminal asks the same questions and runs the
same plan. `node ai-context-kit/kit/setup.mjs scan` only shows what it found.

### The pull request check (`--ci`)

The check is optional. It runs the same check as the commit check, on every pull request, whoever (or
whichever agent) wrote it. You choose where it runs:

- **In the pipeline each repo already has** (recommended when you have one): add the step from
  `kit/snippets/ci-step-member-azure.yml` (workspace) or `ci-step-azure.yml` (repo on its own); GitHub
  versions sit next to them. In a workspace it is its own job, so the extra checkout of the home repo does not
  change your build's paths. Nothing else in your pipeline changes.
- **A separate pipeline:** `--ci azure` writes `azure-pipelines.ai-context.yml` into the repo. It does nothing
  until someone creates a pipeline from it in Azure DevOps and adds it as build validation. `--ci github` writes
  `.github/workflows/ai-context.yml`, which runs on every pull request.
- **Not now:** leave it out. The commit check and the agent hooks still work.

`--ci` never edits a pipeline you already have. `doctor` shows whether the check runs, wherever it is.

---

## 5. Set up a product workspace by hand

These are the commands the setup agent runs for you. Put the home repo and your repos side by side in one
folder:

```
projects/
  product-context/     ← the home repo (created below)
  report-service/
  report-ui/
```

**Step 1: create the home repo.**

```bash
node <kit>/install.mjs --create-workspace product-context --tool copilot,claude
```

- `--tool` picks the agents your team uses: `copilot`, `claude`, `codex`, a comma list, or `all`.
- Add `--org <path-to-org-context>` if your organisation has shared rules (see [ORG-LEVEL.md](../ORG-LEVEL.md)).

This creates the home repo with every skill, both helper agents, the hooks, the context tool, the commit
check, `catalog.json` (the list of repos), `product.code-workspace`, and the product context pages.

**Step 2: add each repo.**

```bash
node <kit>/install.mjs report-service --workspace product-context
node <kit>/install.mjs report-ui      --workspace product-context
```

Each command registers the repo in the home repo's catalogue and workspace file, links its commit check
to the home repo, and adds a small stamp (`.ai-kit/kit.json`) and a pull request template. It adds no
skills or hooks to the repo. Optional: `--graphify` prepares the repo for a code map; `--ci azure` (or
`github`) adds a separate pull request pipeline file (see "The pull request check" above).

**Step 3: OpenSpec (if you use it).** Once, in the home repo, so its commands exist once:

```bash
cd product-context && openspec init --tools github-copilot,claude      # your tools
cd ../report-service && openspec init --tools none                    # each repo: folder only
node <kit>/install.mjs report-service --workspace product-context      # adds the kit's OpenSpec settings
```

**Step 4: build each code map** (if you use Graphify), in each repo:

```bash
graphify extract . --code-only && graphify cluster-only . --no-label
```

**Step 5: check the setup.**

```bash
cd product-context
node .ai-kit/context-tools.cjs doctor
```

It lists every repo, whether it has context yet, and whether its commit check is linked.

**Step 6: commit.** Commit the home repo and push it where the team can clone it next to the repos.
Commit each repo's new files on a branch through a normal pull request.

**Each teammate,** after cloning the home repo and the repos side by side, runs once per repo:

```bash
node <kit>/install.mjs <repo> --workspace product-context
```

(It only links the commit check on their clone; everything else is already committed. Without the kit
folder, the same thing is one command: `git config core.hooksPath ../product-context/.githooks`.)

---

## 6. Set up one repo by hand

```bash
node <kit>/install.mjs <repo> --tool copilot
node <repo>/.ai-kit/context-tools.cjs doctor
```

The repo gets its own copy of the skills, agents, hooks, context tool and checks. If you use OpenSpec, run
`openspec init --tools github-copilot` (or your tool) in the repo first, then the installer.

---

## 7. Open it in your agent

| Agent | Product workspace | One repo |
| --- | --- | --- |
| **Copilot in VS Code** | Open `product-context/product.code-workspace` (the home repo is listed first). Switch Chat to agent mode | Open the repo folder |
| **Claude Code** | From the home repo: `node scripts/hub.mjs claude`. It starts Claude Code in the home repo with every repo added, and loads each repo's `CLAUDE.md` and rules | `claude` in the repo |
| **Codex** | Start Codex in the home repo. Skills come from there; the skills tell Codex to read each repo's `AGENTS.md` before working in it | `codex` in the repo |

Type `/` in the chat to see the skills. In Claude Code, OpenSpec's commands are written `/opsx:propose`
instead of `/opsx-propose`.

---

## 8. The skills

| Skill | When | What you get |
| --- | --- | --- |
| `/context-create` | Once per repo | A lean `AGENTS.md`, two to four rule files, an architecture page and a traps page, after five questions to you |
| `/context-create deep` | After that, one page at a time | In-depth pages per area: architecture, business rules, screens, data and table pages, API, dependencies, security, testing, operations, decisions |
| `/context-assess` | After pages are reviewed | A readiness score from 0 to 100, with the three biggest gaps |
| `/context-update` | When a check says context is out of date, after a database migration, after a kit upgrade | Only the out-of-date lines fixed |
| `/context-learn` | When the agent got something wrong | The correction turned into a one-line rule in the right file |
| `/story-start <id>` | Start of every story | The story read, the repos and files it touches, what to know, one change folder per repo, a fresh-eyes plan review |
| `/story-finish` | End of every story | Tests and scenarios checked, impact checked, context fixed, the pull request description drafted |
| `/onboard-me` | A new joiner's first day | A guided tour built from the same knowledge |
| `/product-context` (workspace) | Once, then after repos are added (`/product-context update`) | System map, flows across repos, glossary, platform rules |
| `/cross-repo-story` (workspace) | A story across several repos | One plan that links each repo's change |
| `/kit-setup` | Adding a repo or an agent, the pull request check, an upgrade, "is it working?" | The setup agent: it asks, shows the plan, runs it after your yes |

Two helper agents: **context-steward** (can only edit knowledge files) and **design-reviewer** (reviews a
plan with no memory of the chat that wrote it, and changes nothing).

**Every skill ends with the same three lines,** so you always see what happened:
**What changed** (files, as links) · **Checks** (what was run, and the result) · **Next** (your next step).

---

## 9. A story, start to finish

The work item number (for example `48213`) names the story everywhere. A change id is the number plus a
few words: `48213-add-report-export`.

| Step | You type | What happens | You do |
| --- | --- | --- | --- |
| 1. Start | `/story-start 48213` | The agent reads the work item (or asks you to paste it), finds the repos and files it touches, pulls the context lines anchored to those files (in a workspace also the product flow pages), sizes it, and proposes the branch name from your naming convention | Answer at most one question; say yes or no to creating the branch |
| 2. Plan | `/opsx-propose 48213-add-report-export` (say which repo; services before UIs) | OpenSpec writes the proposal, the specs (scenarios), a design if the change needs one, and the tasks. Without OpenSpec, the agent writes one `plan.md` | Read it |
| 3. Fresh-eyes review | Run the `design-reviewer` agent on the change | A table of gaps: scenarios without a test, files that don't exist, rules broken, context to update | Decide what to fix |
| 4. **Approve** | — | — | **Approve the plan, or ask for changes. Nothing is coded before this.** |
| 5. Build | `/opsx-apply` | The agent writes each test first, sees it fail, then writes the code, a slice at a time | Review each slice |
| 6. Finish | `/story-finish` | Tests run, every scenario has a test, impact checked, `/opsx-verify`, context updated, pull request title and text drafted with the work item link | Review the diff |
| 7. Pull request | — | The pull request check runs | Commit, push, open the pull request yourself; the team reviews |
| 8. Archive | `/opsx-archive 48213-add-report-export` | The story's specs merge into the repo's record of what it does | Push it as the last commit of the same pull request |

**Tiny stories** (one or two files, no API, data or permission change) skip steps 2 to 4: a failing test,
the fix, then `/story-finish`.

**Stories across repos:** one change folder per repo, same change id. Plan and build the service first,
then the UI against the finished API. One pull request per repo, each linking the others.

**Branch and pull request names.** If `.ai-kit/conventions.json` exists (the kit ships one; your
organisation can supply its own), every pull request says what kind of work it is, so an engineering-metrics
tool can count features, production fixes, QA and UAT fixes and maintenance separately:

| Kind of work | Work item | Branch | Pull request title |
| --- | --- | --- | --- |
| New capability or enhancement | User Story or Feature | `feature/<id>-<short-name>` | `feat: <id> <what changed>` |
| Defect found in production | Bug, Found In: Production | `hotfix/<id>-<short-name>` | `hotfix: <id> <what changed>` |
| Defect found in QA or UAT | Bug, Found In: QA or UAT | `bugfix/<id>-<short-name>` | `fix: <id> <what changed>` |
| Maintenance (security findings, upgrades) | Task or Story tagged Maintenance | `maint/<id>-<short-name>` | `maint: <id> <what changed>` |
| Promotion between sprint and release branches | None | `feature_20`, `release_20` (unchanged) | `promote: feature_20 to release_20` |

`node .ai-kit/context-tools.cjs conventions name --type bugfix --id 812 --summary "Price is null for
archived items"` prints the branch, the title and the work item link for work that did not start with
`/story-start`. The commit check warns when a branch does not follow it; the pull request check compares the
branch and the title. In the file, `check` is `off`, `warn` or `block`, `createBranch` is `ask` or `never`,
and `workItem` names your "Found In" field and maintenance tag.

**Your own design or test format:** if your team has a skill for a technical design document or test
scenarios in its house format, run it after step 2 and keep its output next to the plan.

---

## 10. Keeping context current

| When | What catches it | What you do |
| --- | --- | --- |
| While the agent works | The hooks tell the agent which context line describes the file it just edited, and ask it once at the end to check those lines | Nothing, unless it asks |
| When you commit | The commit is stopped if a context line points at a file that no longer exists | Fix that line, or run `/context-update` |
| On every pull request | The pull request check lists lines whose code changed | Fix them in the same pull request |
| You change an entity, repository, query or migration | The hooks ask the agent to run `schema-import`; the commit check and the pull request check say which table pages are out of date | Nothing, or run `node .ai-kit/context-tools.cjs schema-import docs/context/data/schema.sql` yourself |
| After a database migration | The commit check says the migration changed but the schema file did not | Once the migration has run on your local or development database, export the DDL again over `docs/context/data/schema.sql` and run `schema-import` (only the generated part of each table page changes) |
| You have checked a page against the code | — | In your own terminal: `node .ai-kit/context-tools.cjs review <page or folder> --by <your name>` (sets it reviewed; an agent cannot run it) |
| A new repo joins the workspace | The home repo's session note says "no context yet" | `/context-create` for it, then `/product-context update` |
| Each sprint or quarter | — | Run the context-steward agent in "sprint-digest" or "quarterly-review" mode, about 30 minutes |

To see whether the hooks actually run, use `node .ai-kit/context-tools.cjs doctor`. It shows when each
hook last ran. Hook notes go to the agent, not to you, so "I don't see anything" is normal.

**Is the context used?** The hooks record each time an agent opens a context page (in Copilot and Claude
Code). `node .ai-kit/context-tools.cjs usage` lists the pages agents opened in the last 90 days, in how many
chats, and the pages nobody opened. A page nobody opens is either not needed (merge, shorten or delete it)
or not linked from where agents look (add a "Where to look" line in `AGENTS.md`). Check it monthly.

### Database context, step by step

1. **Export the schema (a person, once).** Structure only, with a read-only user, from a development or QA
   database: `pg_dump --schema-only --no-owner --no-privileges …`, or your DB viewer's "Generate DDL".
   Save it as `docs/context/data/schema.sql`.
2. **In the agent chat:** `/context-create deep data`. The agent runs the import: one page per table,
   linked to its entity, repository, SQL and migrations. It shows you where the code and the schema
   disagree and asks only what the code cannot answer.
3. **Answer the questions:** what the main status values mean, where the `_id` columns without a foreign
   key point, which flows write each main table.
4. **Review:** check a page against the code, then in your own terminal:
   `node .ai-kit/context-tools.cjs review docs/context/data/tables/<table>.md --by <your name>`
   (or a whole folder).
5. **Commit on a branch and open a pull request.**

After that, the only thing you do by hand is export the schema again after a migration; the checks tell
you when.

---

## 11. Adding, moving and removing repos

- **Add a repo to the workspace:** `node <kit>/install.mjs <repo> --workspace product-context`, then
  `/context-create` for it and `/product-context update`.
- **Move a one-repo install into the workspace:** run the same command with `--upgrade`. It removes the
  repo's own copies of the skills, hooks, context tool and OpenSpec tool files (the home repo has them) and
  keeps everything your team wrote.
- **Remove a repo:** delete its entry in `catalog.json` and `product.code-workspace`, run
  `/product-context update` (it lists the product lines that mention the repo), and in the repo run
  `git config --unset core.hooksPath`.

---

## 12. Upgrading the kit

**Easiest:** put the new kit next to your repos and ask the agent "upgrade the kit" (`/kit-setup`), or run
`node <kit>/setup.mjs` in a terminal. It shows what is new, which repos are older, and the steps (including
refreshing table pages and the page format when a version needs it), and runs them after your yes.

By hand:

```bash
node <kit>/install.mjs product-context --upgrade      # workspace: once, in the home repo
node <kit>/install.mjs <repo> --upgrade               # one-repo setup: in each repo
node .ai-kit/context-tools.cjs migrate                # if the page format changed (no AI, no tokens)
node .ai-kit/context-tools.cjs doctor
```

`--upgrade` replaces only the kit's own files. It never touches `AGENTS.md`, rule files, `docs/context/`
or your pull request template. Add `--dry-run` first to see what it would do.

---

## 13. When something goes wrong

| Problem | What to do |
| --- | --- |
| Skills don't appear | VS Code: run "Chat: Open Customizations". In a workspace, open `product.code-workspace`, not a single repo. Claude Code: start it with `node scripts/hub.mjs claude` |
| The same skill shows twice | A repo still has its own copy: `node <kit>/install.mjs <repo> --workspace product-context --upgrade` |
| Hooks never run | Run `doctor`. In VS Code check the chat's session target, the `chat.useHooks` setting, your organisation's policy, and "Developer: Open Agent Debug Logs". The commit check and the pull request check still work without hooks |
| The commit is stopped | Read the ERROR line: a context line points at a file that is gone. Fix the line. In an emergency: `git commit --no-verify` |
| OpenSpec created the change in the home repo | Move the folder into the right repo; next time say which repo ("in report-service"). The skills tell the agent to run OpenSpec inside the repo that changes |
| OpenSpec feels slow | The OpenSpec program is fast (about 0.25 seconds per command). The time is the agent writing each document. Keep `openspec/config.yaml`'s `context:` short, and let tiny stories skip OpenSpec |

---

## 14. Words used in this guide

| Word | Meaning |
| --- | --- |
| Anchor | `[anchor: path]` at the end of a context line: the code that line describes |
| Context | What the agent reads about your code: `AGENTS.md`, rule files, `docs/context/` |
| Home repo | In a product workspace, the one repo that holds the kit's tools and the product context |
| Change folder | `openspec/changes/<id>/`: a story's plan in one repo |
| Work item | The story, bug or task in your tracker (Azure DevOps, Jira) |
| Fresh-eyes review | A review by an agent that has not seen how the plan was made |
| Readiness score | 0–100: how much trustworthy context a repo has, capped by evidence such as reviews |
