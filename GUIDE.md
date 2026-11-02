# Guide: building brownfield stories with AI agents

For developers using **VS Code + GitHub Copilot** (agent mode, any Claude or GPT model) on existing services.
Written in plain English. Read it top to bottom once (about 15 minutes), then use it as a checklist.

Last checked: November 2026. Tools in this area change monthly; see [What is still changing](#10-what-is-still-changing).

> **Three guides.** This one is the setup and the story workflow. How to create, use and maintain the
> context itself, for any task, is in **[CONTEXT-GUIDE.md](CONTEXT-GUIDE.md)**. Every tool you can use
> (core, recommended, optional), Graphify in depth, and which workflow fits which task are in
> **[TOOLBOX.md](TOOLBOX.md)**.

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
 build code map (Graphify)             /opsx-propose       proposal, design, tasks, spec changes
     │                                        │
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
- `design.md`: does it follow your codebase's patterns?
- `tasks.md`: small, ordered steps, each testable?

Edit the files directly or ask the agent to change them. **Show the proposal and spec to your tech lead**
before any code. This replaces a lot of later review comments.
**Write down:** how many changes you made to the proposal, and what they were.

### Phase 3 — Build (most of the time)
**Type:**
```
/opsx-apply <change-id>
```
Work in slices: ask it to do tasks 1–3, review the diff, run the tests, commit, then continue.
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
`/opsx-verify` checks the code against the requirements and scenarios. `/story-finish` runs the tests,
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
the change to `openspec/changes/archive/`. Commit it.
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
| **OpenSpec change** | A folder with proposal, design, tasks and spec changes for one story |
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
