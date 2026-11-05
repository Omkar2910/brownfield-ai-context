# Guide: building brownfield stories with AI agents

For developers using **VS Code + GitHub Copilot** (agent mode, any Claude or GPT model) on existing services.
Written in plain English. Read it top to bottom once (about 15 minutes), then use it as a checklist.

Last checked: November 2026. Tools in this area change monthly; see [What is still changing](#10-what-is-still-changing).

> **Four guides.** This one is the setup and the story workflow. How to create, use and maintain the
> context itself, for any task, is in **[CONTEXT-GUIDE.md](CONTEXT-GUIDE.md)**. Every tool you can use
> (core, recommended, optional), Graphify in depth, and which workflow fits which task are in
> **[TOOLBOX.md](TOOLBOX.md)**. Many micro-frontends and services in separate repos: **[MULTI-REPO.md](MULTI-REPO.md)**.

---

## 1. What you are setting up

An AI agent writes better code when it knows four things: **the rules of your codebase**, **where the
relevant code is**, **what the story should do**, and **whether its work broke anything**. This kit
covers all four with five parts:

| Part | What it is | Where it lives in your repo |
| --- | --- | --- |
| **Context files** | Short notes the agent reads: commands, rules, traps, where to look | `AGENTS.md`, `.github/instructions/`, `docs/context/` |
| **Code map (Graphify)** | A local map of classes, calls and dependencies the agent can query, so it reads fewer files and sees what a change affects | `graphify-out/` (not committed) |
| **OpenSpec** | A way to agree on *what* to build before code is written, and a record of what the system does | `openspec/` |
| **Skills and one agent** | Reusable step-by-step instructions you call with a slash command, plus a "context steward" agent | `.github/skills/`, `.github/agents/` |
| **Checks and hooks** | Small scripts that notice when the context is out of date and tell the agent (or stop a commit) | `.github/hooks/`, `.githooks/` |

Three ideas behind it, all from published studies of coding agents:

1. **Less is more.** Long, generated context files make agents slower and often *less* accurate.
   Keep `AGENTS.md` around 100 lines and only include what the code does not make obvious.
2. **Agents read what is always loaded, and often skip the rest.** Put the critical rules in `AGENTS.md`
   with a short "where to look" list, and call skills **by name** (`/story-to-change`) instead of
   hoping the agent picks them up.
3. **The biggest gains come from agreeing on the plan and testing, not from more context.** That is why
   the workflow has a human review of the OpenSpec proposal before any code, and a verify step after.

---

## 2. The workflow in one picture

```
 One-time per repo                     Every story
 ─────────────────                     ───────────
 install kit (--graphify)              /story-to-change   read story; code map finds the files
     │                                        │            and what depends on them
 build code map (Graphify)             /opsx-propose       proposal, spec changes, technical design
     │                                        │            (TDD), test plan, test-first tasks
 /context-bootstrap                    YOU REVIEW          ← the most important step
     │                                        │
 review + commit                       /opsx-apply         agent codes task by task
                                              │            (hooks remind it about context)
                                       /story-finish       tests, impact (graphify affected),
                                              │            /opsx-verify, context check, PR text
                                       pull request        (you, or the agent with your approval)
                                              │
                                       /opsx-archive       after merge: specs updated,
                                       /context-learn      code map refreshed by git hooks,
                                                           mistakes turned into rules
```

The full table of steps and tools, including optional ones, is in [TOOLBOX.md](TOOLBOX.md).

---

## 3. One-time setup (about an hour)

### Before you start

- [ ] VS Code with the GitHub Copilot Chat extension, signed in, agent mode available
- [ ] Node.js 20 or newer (`node --version`). Angular developers usually have it already.
- [ ] Python 3.10 or newer (`python --version`), for Graphify
- [ ] Git, and (on Windows) Git Bash or PowerShell
- [ ] Permission to install an npm package globally. If that is blocked, OpenSpec also has a standalone installer that needs no Node.js (see openspec.dev).
- [ ] A service repo you can create a branch in
- [ ] Check your company's rules on AI tools, MCP servers and pushing code from agents

### Step 1 — Get this kit onto your laptop

```bash
git clone https://github.com/Omkar2910/brownfield-ai-context.git
```

You only need this folder to *install* the kit. Nothing in your service repo will depend on it afterwards.

### Step 2 — Make a branch in your service repo

```bash
cd <your-service-repo>
git checkout -b ai/context-setup
```

Keep the setup in its own small pull request, separate from the story. Reviewers then see "tooling and
context" and "feature" separately.

### Step 3 — Install OpenSpec and turn on the verify step (optional, recommended for stories)

```bash
npm install -g @fission-ai/openspec@latest
openspec init --tools github-copilot --no-copilot-cloud
```

This adds `openspec/` and the `/opsx-*` commands to `.github/prompts/` and `.github/skills/`.

Then add the optional **verify** step (it checks the code against the spec at the end):

```bash
openspec config profile     # a menu opens: keep the defaults ticked, also tick "verify"
openspec update             # writes /opsx-verify into the repo
```

The profile is saved for your user, so other repos get it too. (Non-interactive version for
Git Bash or macOS/Linux: `openspec config set profile custom` then
`openspec config set workflows '["propose","explore","apply","update","sync","archive","verify"]'`.)

### Step 4 — Install the kit

From the folder where you cloned this kit:

```bash
node brownfield-ai-context/kit/install.mjs <your-service-repo> --graphify
```

It **only adds files** and never overwrites. It prints what it added, what it skipped, and anything
you need to do by hand (for example, if your repo already uses Husky for git hooks, it tells you the
one line to add). Use `--dry-run` first if you want to see the list without changing anything.

What it adds:

| File | What it does |
| --- | --- |
| `.github/skills/context-bootstrap/` | Creates your context files (Step 6) |
| `.github/skills/context-refresh/` | Updates only the context lines a change made out of date |
| `.github/skills/context-learn/` | Turns an agent mistake or review comment into a short rule in the right file |
| `.github/skills/story-to-change/` | Starts a story: reads it, gathers just the context it needs |
| `.github/skills/story-finish/` | Ends a story: tests, verify, context check, PR description |
| `.github/skills/onboard-me/` | 15-minute tour for a new team member |
| `.github/agents/context-steward.agent.md` | An agent that only maintains context files |
| `.github/hooks/ai-context.json` + `scripts/context-tools.cjs` | Agent hooks and the context check (one small script, no dependencies) |
| `.githooks/pre-commit` | Stops a commit if a context line points at a file that no longer exists |
| `.githooks/post-commit`, `post-merge`, `post-checkout` | Refresh the Graphify code map in the background (do nothing if Graphify isn't installed) |
| `.vscode/mcp.json`, `.graphifyignore`, `.gitignore` entry | Connect Copilot to the code map (with `--graphify`) |
| `.azuredevops/pull_request_template.md` | PR template with the context checklist |
| `openspec/config.yaml` (appended) | Tells OpenSpec to read your context and adds a few rules |
| `openspec/schemas/story-tdd/` + `schema: story-tdd` | The story workflow: every change also gets a technical design document and a test plan, and tasks are written test-first (Step 4c) |

### Step 4b — Build the code map (5 minutes)

```bash
pip install "graphifyy[mcp]"
cd <your-service-repo>
graphify extract . --code-only
graphify cluster-only . --no-label
```

This runs only on your machine: no API key, nothing is sent anywhere. It writes `graphify-out/`
(ignored by git). From now on the git hooks refresh it after each commit, merge and branch switch.
Open `graphify-out/graph.html` in a browser to see your code as a picture. Details and choices:
[TOOLBOX.md, Section 3](TOOLBOX.md#3-graphify-in-depth).

### Step 4c — Fit the technical design and test plan to your team (10 minutes)

With OpenSpec, the kit sets your repo to its **story workflow** (`schema: story-tdd` in
`openspec/config.yaml`). Every `/opsx-propose` then creates five documents instead of four:

| Document | What it is |
| --- | --- |
| `proposal.md` | Why, what changes, and the story's acceptance criteria (AC1, AC2…) |
| `specs/…/spec.md` | The behaviour, as requirements and WHEN/THEN scenarios |
| `design.md` | **The technical design document (TDD)**, always created: changes per layer, API and data changes, security, errors, risks, rollback. A small story gets the short "Lite" form. |
| `test-plan.md` | **The test cases**: every scenario and acceptance criterion mapped to a named test, plus extra cases (permissions, bad input, failures), regression on dependents, test data and manual checks |
| `tasks.md` | Ordered **test-first**: each group writes its tests, sees them fail, then implements until they pass |

Make it yours:

- **Your team's TDD format:** replace `openspec/schemas/story-tdd/templates/design.md` with your
  sections (keep the file name). The kit never overwrites the templates.
- **Your test stack:** add a rule under `test-plan:`, for example
  `- Backend tests use JUnit 5, Mockito and Testcontainers; UI tests use Jasmine and Karma`.
- **Your own TDD skill:** if you already have one, put it in `.github/skills/` and name it in
  `openspec/config.yaml` (example below). You no longer have to ask for it each time.
- **Don't want it?** Install with `--keep-schema`, or set `schema: spec-driven` again. Changes you
  already started keep the workflow they were created with.

```yaml
rules:
  design:
    - Write this artifact with the tdd-doc skill, using our team's TDD format
  test-plan:
    - Backend tests use JUnit 5, Mockito and Testcontainers; UI tests use Jasmine and Karma
```

Already installed the kit before this existed? Run the installer again with `--upgrade`.

Not using OpenSpec? `/story-to-change` writes the same two documents to `docs/stories/<story-id>/`
(`technical-design.md` and `test-plan.md`) and waits for your approval before any code.

### Step 5 — Check that VS Code sees everything

1. Open the service repo in VS Code. Restart VS Code if it was already open (new commands load on start).
2. Open the Chat view, switch to **Agent** mode, and pick your model (for example Claude Sonnet 5.5).
3. Run **Chat: Open Customizations** from the Command Palette. You should see:
   - **Skills:** `context-bootstrap`, `context-refresh`, `context-learn`, `story-to-change`, `story-finish`, `onboard-me`, plus the `openspec-*` skills
   - **Agents:** `context-steward`
   - **MCP servers:** `graphify` (open the MCP view or run **MCP: List Servers**, start it, and trust it the first time)
   - **Hooks:** `ai-context.json` (hooks are a preview feature; if they are not listed, your VS Code version or company policy may not allow them yet — everything else still works, and the git hook and context check cover the gap)
4. Type `/` in the chat box: the skills and the `/opsx-*` commands should appear.

### Step 6 — Create the context (30–60 minutes)

In agent mode, type:

```
/context-bootstrap
```

The agent reads your build files, code, docs and the code map's list of central classes, asks you four questions (what do new joiners get
wrong, which platform rules apply, what looks wrong but is deliberate, what must never be edited), then
writes `AGENTS.md`, two to four scoped rule files and two pages in `docs/context/`.

**Your job is to review and cut.** For every line ask: *would someone find this in a minute by
searching?* If yes, delete it. Then run:

```bash
node .github/hooks/scripts/context-tools.cjs check
```

Fix any `ERROR` lines, commit everything, and open the setup pull request.

### UI and backend: one VS Code window or two?

**Rule: install per repo, open per story.** Each repo carries its own kit and context. You choose how
to open them based on what the story touches.

> **Several micro-frontends and services?** Use a product context hub (catalog of repos, platform rules,
> contracts, cross-repo story notes, a script that builds the right VS Code window per story). See
> **[MULTI-REPO.md](MULTI-REPO.md)**. This section covers the simplest case: one UI repo and one service repo.

**If the UI and the service are two separate git repos (the usual case):**

1. **Install the kit in each repo**, each on its own setup branch and setup PR:

        node brownfield-ai-context/kit/install.mjs ../report-service --graphify
        node brownfield-ai-context/kit/install.mjs ../report-ui --graphify

    Then run `/context-bootstrap` in each and build each code map (Step 4b) inside each repo.
2. **What each repo ends up with:**

    | In each repo | report-service | report-ui |
    | --- | --- | --- |
    | `AGENTS.md` | Spring rules, Maven commands, its traps | Angular rules, npm commands, its traps |
    | `.github/instructions/` | Controllers, persistence, migrations | Components, services, tests |
    | `docs/context/` | Its architecture and traps | Its architecture and traps |
    | `.github/skills/`, `.github/agents/`, hooks, `.githooks/` | Same kit files | Same kit files (identical) |
    | `openspec/` | Its own specs and changes | Its own specs and changes |
    | `graphify-out/` (not committed) | Map of the Java code | Map of the TypeScript code |

    Platform rules that apply to both (login with Keycloak, permissions through CIAM, error format) go in
    each `AGENTS.md` as the same 2–3 short lines. With more services, move them to one shared place
    (GitHub organization instructions or a shared repo, see `demo-kit/`).
3. **The API contract is the link.** The service owns it (OpenAPI file or DTOs). In the UI's `AGENTS.md`,
   under "Where to look", point to it, for example
   `API contract: ../report-service/src/main/resources/openapi/report-api.yaml`.

**How to open them:**

| Story touches | Open | Why |
| --- | --- | --- |
| Only the service, or only the UI | That repo alone (**File → Open Folder**) | The agent sees one set of rules and one code map; less noise |
| Both | One window with both repos as separate folders: open the service, then **File → Add Folder to Workspace** → the UI, then **File → Save Workspace As** `report-platform.code-workspace` | Each folder keeps its own context; the agent reads both codebases and the contract |

- Save the `.code-workspace` file **next to** the two repos (for example `C:\work\report-platform.code-workspace`),
  not inside either repo. Each developer keeps their own.
- **Do not** open the parent folder that contains both clones as a single folder. VS Code then looks for
  `AGENTS.md`, skills and hooks only at that parent level and misses the ones inside each repo.
- **Do not** copy both into one repo just for the agent.
- In a two-folder window the skills and `/opsx-*` commands may appear twice (one per repo). They are the
  same files, so either works. The agent hooks follow edits into either repo; the git hooks and the
  context check run separately in each repo when you commit there.

**Running a cross-service story with OpenSpec:** make one change per repo with the same id.
1. In the service: `/opsx-propose add-report-excel-export` (tell the agent "create the change in
   report-service"). Review it; the design holds the API request/response examples.
2. In the UI: `/opsx-propose add-report-excel-export` ("create the change in report-ui; use the API
   design from report-service's change").
3. Build the service first, then the UI. Two PRs, one per repo, each linking the other.
4. Archive each after its merge.

For Graphify across both: each repo's map answers questions about its own code. Start each repo's
`graphify` server in the MCP view, or ask the agent to run `graphify query` / `affected` inside the right
folder. The maps do not connect the Angular HTTP call to the Spring endpoint; the API contract does.

**If the UI and the service are folders in one git repo:** install the kit once at the root and open the
root folder. Keep the root `AGENTS.md` short (shared rules and the map of folders), add `ui/AGENTS.md` and
`service/AGENTS.md` for each side, and give the scoped instruction files `applyTo` patterns such as
`ui/**/*.ts` and `service/**/*.java`. One `openspec/`, one code map.

### Optional extras

| Extra | Why | How |
| --- | --- | --- |
| **Azure DevOps MCP server** | The agent can read the work item and create the pull request | Merge `kit/optional/vscode-mcp-azure-devops.json` into `.vscode/mcp.json`. Check company policy first. Microsoft recommends their hosted (remote) server where your organization supports it. |
| **PR check in Azure Pipelines** | Runs the context check on every pull request | `kit/optional/azure-pipelines-context-check.yml` — add after your first story, warnings only at first |
| **Claude Code** | Same kit for Claude Code users | `node kit/install.mjs <repo> --tool claude` |

---

## 4. Your story, start to finish

This is the roadmap for your real story. Each phase says **what you type**, **what you check**, and
**what to write down** for your presentation. Copy `templates/story-log.md` somewhere private and fill
it in as you go — the numbers in it are what make the demo convincing.

### Phase 0 — Before you begin (10 minutes)
- Write down your normal estimate for the story and how you would usually approach it.
- Note the story ID, its size, and which repos it touches.
- **If it touches two repos** (UI + backend): open both in one VS Code window
  (**File → Add Folder to Workspace**, then **Save Workspace As**). Install the kit in both.
  Do the backend half first, because the UI depends on its API.

### Phase 1 — Understand the story (20–40 minutes)
**Type:**
```
/story-to-change <story ID or paste the story text>
```
**Check:** the agent's summary matches the story; the 3–8 files it lists are the right ones (it finds
them with the code map, and runs `graphify affected` to list what depends on them); its open
questions are real. Answer them (ask your BA or tech lead if needed).
**Result:** `openspec/changes/<change-id>/context.md`
**Write down:** did it find the right files? What did it miss?

Optionally, before proposing, explore the risky part:
```
/opsx-explore How does <the area> work today and where would <the change> fit?
```

### Phase 2 — Agree on the plan (30–60 minutes, including review)
**Type:**
```
/opsx-propose <change-id>   (use openspec/changes/<change-id>/context.md)
```
**Check — this is the most important step in the whole workflow:**
- `proposal.md`: is the scope right? Anything out of scope that crept in?
- `specs/.../spec.md`: are the requirements and scenarios what the story really means? Missing edge cases (permissions, empty data, large data, errors)?
- `design.md` (the technical design): does it follow your codebase's patterns? Are the API examples, data changes and rollback right?
- `test-plan.md`: does every scenario and acceptance criterion have a named test? Are the denied, empty, large and failure cases there?
- `tasks.md`: small, ordered steps, each group starting with its tests?

Edit the files directly or ask the agent to change them. **Show the proposal and spec to your tech lead**
before any code. This replaces a lot of later review comments.
**Write down:** how many changes you made to the proposal, and what they were.

### Phase 3 — Build (most of the time)
**Type:**
```
/opsx-apply <change-id>
```
Work in slices: ask it to do tasks 1–3, review the diff, run the tests, commit, then continue.
With the story workflow, each slice starts with its tests: check that they fail before the code is
written (a test that passes straight away is not testing the change). The agent marks rows in
`test-plan.md` as `passing` as it goes.
**Check:** each diff before accepting it. Watch for the hook messages: when the agent edits a file that a
context line points to, it is told which line to re-check.
**Write down:** every time you corrected the agent, one line each (what it did, what was right). These
are your `#agent-miss` notes. For anything that would trip up the agent again, run
`/context-learn <what happened>` so it becomes a rule for everyone.

### Phase 4 — Finish (20–40 minutes)
**Type:**
```
/opsx-verify <change-id>
/story-finish <change-id>
```
`/opsx-verify` checks the code against the requirements, scenarios and `design.md`. `/story-finish` runs the tests,
checks every test-plan row names a test that exists and passes,
refreshes the code map and runs `graphify affected` on every class you changed (so you can confirm each
dependent is tested), runs the context check, fixes out-of-date context lines with you, and drafts the
PR description.
**Check:** any requirement marked not covered; any context line it wants to change.

### Phase 5 — Pull request
Two options:

- **You do it (normal):** commit, push and open the PR as usual. Paste the drafted description.
- **The agent does it (experiment):** ask *"commit with message …, push the branch and create a pull
  request to `<main branch>` with this description"*. VS Code asks your approval before each terminal
  command; read each one. For the PR itself the agent needs the Azure DevOps MCP server (or the `az repos pr create` command if the Azure CLI is installed). **Do not turn on auto-approve for git or PR commands.**

**Write down:** review comments received, and how many were about things the spec or context should have caught.

### Phase 6 — After the merge (10 minutes)
```
/opsx-archive <change-id>
```
This merges the spec changes into `openspec/specs/` (the record of what the system now does) and moves
the change to `openspec/changes/archive/`. Commit it. The story's technical design and test plan stay
there (`openspec/changes/archive/<date>-<change-id>/design.md` and `test-plan.md`); link them from the
work item or copy them to your wiki if your process asks for that.
At the end of the sprint, select the **context-steward** agent and type `sprint-digest`.

### Rough timeline for a 3–5 day story

| When | What |
| --- | --- |
| Day 0 | Setup PR (Section 3), if this repo has none yet |
| Day 1 | Phases 0–2: understand, propose, tech lead review |
| Days 2–3 | Phase 3: build in slices |
| Day 4 | Phases 4–5: finish and PR |
| After merge | Phase 6: archive |

---

## 5. How to tell if it worked

Compare against your Phase 0 notes and your last similar story:

| Measure | Where it comes from |
| --- | --- |
| Time from start to PR | Your story log |
| Number of corrections you made to the agent | Your `#agent-miss` notes |
| Review comments on the PR, and how many the spec should have caught | The PR |
| Rework after review | The PR |
| Tests added | The diff |
| Copilot premium requests used (if your plan shows them) | Copilot usage page |
| Token savings from the code map | `graphify benchmark` |

One story is a demonstration, not proof. If it looks promising, repeat with 2–3 more stories, ideally
with a colleague using the same kit.

---

## 6. Presenting it

A ready outline is in `templates/presentation-outline.md`. The short version (10–12 minutes):

1. **The problem** (1 min): agents guess conventions in old code; everyone prompts differently.
2. **The approach** (2 min): the four parts table from Section 1.
3. **The real story** (5 min): show the actual proposal, a spec scenario, the tasks, one diff, and one
   moment where a hook or the check caught something. Real files beat slides.
4. **Results** (2 min): the numbers from your story log, including what did *not* work.
5. **How to adopt** (1 min): one install command per repo; the setup PR you already merged.
6. **The ask** (1 min): two or three more teams try it for a sprint.

Record the key steps as a short screen recording in case the live demo is slow. The `demo-kit/` folder
is a safe sandbox (made-up services, no company code) if you need to demo without your real repo.

---

## 7. Sharing it with other teams

| Stage | How teams get the kit |
| --- | --- |
| Now | Each repo runs `node kit/install.mjs <repo>` once. Files live in the repo, are reviewed like code, and work in every editor. |
| When several teams use it | Keep the kit in an internal repo. Update skills there; teams re-run the installer (it only adds new files) or copy updated skill folders. |
| Later | Package the skills, agent and hooks as an **agent plugin** that VS Code installs from your internal marketplace, or use **APM** (Agent Package Manager) to install versioned packages per repo. Both are new; check company policy and maturity before relying on them. |
| Several services per story | Add a shared `system-context` repo for contracts and platform rules (see `demo-kit/` and `docs/research/playbook.md`). |

---

## 8. When something goes wrong

| Problem | Fix |
| --- | --- |
| `/opsx-*` commands or skills don't appear | Restart VS Code. Check the files exist in `.github/prompts/` and `.github/skills/`. |
| Hooks not listed or not running | Hooks are a preview feature. Check **Chat: Open Customizations → Hooks** and the agent debug logs. If your company disables them, rely on the git hook and the context check. |
| Agent ignores a rule | Is the rule in `AGENTS.md` (always read)? Rules in other files are only read when matched or linked. Make the rule short and give the reason. |
| Agent reads too much / is slow | `AGENTS.md` too long, or an instructions file uses `applyTo: '**'`. Run `context-tools.cjs status` to see the always-on size. |
| Commit refused by the pre-commit hook | A context line points at a file that moved or was deleted. Fix the line (or run `/context-refresh`). Emergency: `git commit --no-verify`. |
| Proposal is too big or vague | Split the story, or give `/opsx-propose` a narrower goal. Edit the files; they are plain Markdown. |
| `openspec` not found | Re-open the terminal after installing, or use `npx @fission-ai/openspec`. |
| `graphify` MCP server won't start | Install with the `[mcp]` extra; check `graphify-mcp` runs in a terminal; build the map first (Step 4b). |
| Agent says the code map is stale | `graphify update .` (seconds, local). The git hooks normally do this. |

---

## 9. Words used in this guide

| Word | Meaning |
| --- | --- |
| **Context** | What the agent reads besides your prompt: rules, notes, specs |
| **AGENTS.md** | A file at the repo root that Copilot (and most other agents) reads on every request |
| **Instructions file** | A rules file that is loaded only when the agent touches matching files (`applyTo`) |
| **Skill** | A folder with step-by-step instructions the agent follows when you call `/skill-name` |
| **Custom agent** | A named agent with its own instructions and limited tools (here: `context-steward`) |
| **Hook** | A small script the editor runs at a moment in the agent's work (session start, after an edit, before finishing) |
| **Code map** | Graphify's local graph of classes, calls and dependencies (`graphify-out/`) |
| **Anchor** | `[anchor: path]` at the end of a context line, saying which code the line describes, so changes can be detected |
| **OpenSpec change** | A folder with proposal, spec changes, technical design, test plan and tasks for one story |
| **Technical design document (TDD)** | `design.md` in the change: how the story will be built, reviewed before code |
| **Test-first** | Write the test, see it fail, then write the code that makes it pass |
| **Delta spec** | The requirements a change adds, modifies or removes |
| **Archive** | Merging a finished change's spec into the main spec record |
| **MCP server** | A connector that lets the agent use another tool, such as Azure DevOps |

---

## 10. What is still changing

- **Copilot hooks in VS Code** are a preview feature. File formats may change.
- **Agent plugins** and their marketplace settings are experimental.
- **Graphify** releases very often (0.9.x at the time of writing); command names occasionally change. Check `graphify --help`.
- **OpenSpec** releases often (1.16 at the time of writing). Its multi-repo "stores" and "worksets" are beta. Run `openspec update` after upgrading.
- **Research on context files** is young and some results disagree. Measure on your own stories.

Background research, sources and the longer explanations: `docs/research/`.
