# The complete workflow and toolbox

This is the full picture: **every tool you can use**, what each is for, whether you need it, and
**where it fits in the workflow**. [GUIDE.md](GUIDE.md) is the step-by-step setup;
[CONTEXT-GUIDE.md](CONTEXT-GUIDE.md) explains context itself. Last checked November 2026.

---

## 1. The best workflow, with tools at each step

Each step names the tool that does it best. Steps marked *(optional)* still work without that tool,
just less well.

| Step | What happens | Tool | Need it? |
| --- | --- | --- | --- |
| **Once per repo** | | | |
| 1. Install | Skills, steward agent, hooks, checks added to the repo | Kit installer `kit/install.mjs --graphify` | Core |
| 2. Map the code | Builds a local map of classes, calls and imports | **Graphify** (code-only, no API key) | Recommended |
| 3. Create context | Lean `AGENTS.md`, scoped rules, `docs/context/`, guided by the code map | `/context-bootstrap` skill | Core |
| 4. Add the plan layer | `/opsx-*` commands for agreeing on stories | **OpenSpec** | Recommended for stories |
| **Every story** | | | |
| 5. Read the story | Work item text and acceptance criteria | Azure DevOps MCP server *(optional)*, or paste it | Optional |
| 6. Gather task context | Relevant files, dependents, rules, traps — nothing else | `/story-to-change` + Graphify `query_graph` / `affected` | Core (+ Graphify) |
| 7. Explore risky parts | Understand the area before planning | `/opsx-explore` + Graphify `shortest_path` | Recommended |
| 8. Agree the plan | Proposal, spec scenarios, technical design (TDD), test plan, test-first tasks — **reviewed by a person** | `/opsx-propose` with the kit's `story-tdd` schema (or the documents from `/story-to-change`) | Core |
| 9. Build | Code in slices, tests first; hooks flag context lines that may now be wrong | `/opsx-apply` + agent hooks | Core |
| 10. Test the UI | Click through the Angular screen the story changed | VS Code browser tools or Playwright MCP *(optional)* | Optional |
| 11. Check | Tests, test-plan rows all passing, impact of changes, spec and design coverage, context freshness | `/story-finish` + `/opsx-verify` + Graphify `affected` + `context-tools check` | Core |
| 12. Pull request | Description drafted; created by you or by the agent with approval | `/story-finish`, Azure DevOps MCP *(optional)*, PR template | Core |
| 13. CI | Context check on the PR (warnings first, blocking later) | Azure Pipelines template | Later |
| 14. After merge | Spec record updated; code map refreshed automatically | `/opsx-archive` + git hooks | Core |
| 15. Learn | Agent mistakes and repeated review comments become rules | `/context-learn` | Core |
| **Every sprint / quarter** | | | |
| 16. Upkeep | Digest, prune, review against the code map | `context-steward` agent | Core |

---

## 2. Every tool, by tier

### Core — use from day one

| Tool | What it does | Where | Notes |
| --- | --- | --- | --- |
| **VS Code + GitHub Copilot (agent mode)** | The agent | Your editor | Any model; use your strongest for planning (step 8) |
| **AGENTS.md + scoped instructions + docs/context** | Lasting context | Repo | Created by `/context-bootstrap` |
| **Kit skills** | `context-bootstrap`, `story-to-change`, `story-finish`, `context-refresh`, `context-learn`, `onboard-me` | `.github/skills/` | Call by name; agents often skip skills they are not told to use |
| **context-steward agent** | Maintains context files only | `.github/agents/` | Sprint and quarter upkeep |
| **Agent hooks** | Session-start note, post-edit reminders, one check before finishing | `.github/hooks/` | Preview in VS Code; git hook and check cover the gap |
| **Git hooks** | Block commits with broken context; refresh the code map | `.githooks/` | Work for every developer, with or without an agent |
| **context-tools.cjs** | `check` and `status` | `.github/hooks/scripts/` | Node, no dependencies |

### Recommended — use for real stories

| Tool | What it does | Why it matters |
| --- | --- | --- |
| **Graphify** | Local code map: who calls what, what depends on what | Agents find the right files with fewer reads; `affected` shows the blast radius before you change shared code; central classes guide what to document. See Section 3. |
| **OpenSpec** | Proposal → reviewed spec → tasks → verify → archive | Agreeing the plan before code is the biggest quality lever; the archive is a free, dated record of every change |

### Optional — add when useful and allowed

| Tool | What it does | Check first |
| --- | --- | --- |
| **Azure DevOps MCP server** | Agent reads work items, creates PRs | Company policy; Microsoft recommends its hosted server where available. Config in `kit/optional/` |
| **VS Code browser tools / Playwright MCP** | Agent opens the Angular app, clicks through the change, takes screenshots | Local app running; test data only |
| **Library docs MCP (for example Context7)** | Up-to-date docs for the exact Angular / Spring versions you use | It sends your queries to an outside service; policy |
| **Static analysis (for example SonarQube)** | Add its findings to the story-finish check | Whatever your team already runs |
| **Claude Code** | Same kit for terminal-based work (`--tool claude`) | Licences |
| **Repomix** | Packs a folder into one file for an agent | Use only when Graphify is not available |

### Later — when several teams adopt it

| Tool | What it does |
| --- | --- |
| **Azure Pipelines context check** | Context check on every PR (`kit/optional/`) |
| **Weekly steward run** | Scheduled check; steward proposes fixes as a PR (see `demo-kit/system-context/pipelines/`) |
| **Agent plugins or APM** | Install the kit's skills, agent and hooks across many repos from one package. New; check policy and maturity |
| **Product context hub** | Catalog of repos, platform rules, API contracts, cross-repo story notes and a workspace generator for many micro-frontends and services: [MULTI-REPO.md](MULTI-REPO.md) |
| **Graphify served centrally** | One graph server for a team (`graphify-mcp --transport http`) |

### For special cases

| Tool | When |
| --- | --- |
| **GitHub Spec Kit** | Building a genuinely new service or module from scratch (see Section 5). Not for changes to existing code. |
| **BMAD `document-project`** | A one-off survey of a large, undocumented legacy system before anything else |

---

## 3. Graphify in depth

### What it gives you
Graphify reads your code with a parser (Java, TypeScript and about 40 other languages) and builds a
map of classes, methods, calls, imports and references. The map lives in `graphify-out/`:
`graph.json` (the map), `GRAPH_REPORT.md` (central classes, module groups, surprising links) and
`graph.html` (an interactive picture). Building it from code needs **no API key and sends nothing
anywhere**.

It helps in four places:

| Where | How |
| --- | --- |
| Creating context | The report's "God Nodes" (most connected classes) show what `docs/context/architecture.md` must explain |
| Gathering task context | `query_graph` and `get_neighbors` find the relevant code without opening dozens of files |
| Before and after changing code | `graphify affected "<Class>"` lists everything that depends on it: callers, references, subclasses |
| Onboarding and presenting | `graph.html`, `graphify tree` and `graphify export callflow-html` give pictures of the code |

What it does **not** give: rules, intent or behaviour (that is AGENTS.md and OpenSpec), and links
between services over HTTP (the Angular call to the Spring endpoint is not in the map; use the API
contract for that).

### Setup (5 minutes per developer)

```bash
pip install "graphifyy[mcp]"          # or: pipx install "graphifyy[mcp]"  /  uv tool install "graphifyy[mcp]"
cd <your-service-repo>
graphify extract . --code-only         # local parser only, no API key
graphify cluster-only . --no-label     # writes GRAPH_REPORT.md and graph.html
```

Needs Python 3.10 or newer. The package name has two y's. The `[mcp]` part adds the server Copilot talks to.

If you installed the kit with `--graphify`, the repo already has:
- `.vscode/mcp.json` — starts the `graphify` MCP server for Copilot. Open the MCP view in VS Code (or
  run **MCP: List Servers**), start **graphify** and trust it the first time. Its tools then appear in
  the chat tool picker.
- `.graphifyignore` — keeps generated and vendored code out of the map. Add your generated API client
  folder if you have one.
- `graphify-out/` in `.gitignore` — each developer builds their own map in seconds.
- Git hooks that run `graphify update .` after every commit, merge and branch switch (local, no API
  key, in the background).

The agent's session-start note tells it if the map is older than the code.

### Which tool for which question

| Question | MCP tool (in chat) | Terminal |
| --- | --- | --- |
| Where is X, how does Y work? | `query_graph` (set `token_budget` ~1500) | `graphify query "how does report export work"` |
| What is directly connected to X? | `get_neighbors` | `graphify explain "X"` |
| How is A connected to B? | `shortest_path` | `graphify path "A" "B"` |
| What breaks if I change X? | — | `graphify affected "X"` |
| What are the central classes? | `god_nodes` | `graphify god-nodes` |
| Is the map current? | — | `node .github/hooks/scripts/context-tools.cjs status` |
| Refresh the map now | — | `graphify update .` |
| How many tokens does it save? | — | `graphify benchmark` (useful numbers for a presentation) |

When a name matches several nodes (a class and its constructor, for example), Graphify lists the
candidate ids; repeat the command with the full id.

The agent runs terminal commands only with your approval. To avoid approving the same safe command
again and again, add read-only Graphify commands (`graphify query`, `graphify affected`,
`graphify path`, `graphify explain`, `graphify god-nodes`, `graphify update`) to the terminal
auto-approve list in VS Code settings (search settings for "auto approve"). Never auto-approve
`git push` or anything that changes remote systems.

### Choices you can make later

| Choice | Default in the kit | Alternative |
| --- | --- | --- |
| Code-only or with documents | Code-only: local, no API key | `graphify extract .` also maps docs, PDFs and images, but needs an LLM (Gemini, Claude, OpenAI, a company gateway via `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL`, or local Ollama). Check policy first. |
| How the agent reaches it | MCP server + a 3-line pointer in AGENTS.md | `graphify vscode install` adds a `/graphify` skill for your user and a section in `.github/copilot-instructions.md`. Use one approach, not both, so the instructions are not duplicated. |
| Share the map | Each developer builds locally | Commit `graphify-out/graph.json` (Graphify has a merge driver: `graphify hook install` registers it), or serve one map over HTTP: `graphify-mcp --transport http` |
| Several repos | One map per repo | `graphify merge-graphs a/graph.json b/graph.json` joins maps; useful for shared libraries, not for HTTP calls between services |

Note: `graphify hook install` writes to `.git/hooks`, which git ignores once the kit sets
`core.hooksPath` to `.githooks`. The kit's own git hooks already do the refresh, so you don't need it.

### Don't
- Paste `GRAPH_REPORT.md` into AGENTS.md or other context files. The agent queries the map when it needs it.
- Trust INFERRED edges blindly; the report marks them with a confidence score.
- Rely on a stale map; refresh with `graphify update .` (the session-start note tells the agent).

---

## 4. Which workflow for which task

| Task | Workflow |
| --- | --- |
| **Typo, config tweak, one-line fix** | Just ask the agent. Context loads automatically. |
| **Bug fix** | Ask the agent to find the cause with `query_graph`, check `known-traps.md`, and run `graphify affected` on what it plans to change. Fix, add a regression test, `/context-learn` if the bug came from a missing rule. |
| **Small change (under a day)** | `/story-to-change` → approve its short plan → build → `/story-finish`. OpenSpec optional. |
| **Story (1–5 days)** | Full workflow in Section 1, with OpenSpec. This is the one to demo. |
| **Story across UI and backend** | Open both repos in one VS Code window. Backend first. One OpenSpec change per repo with the same id. The API contract is the hand-off between them. |
| **Story across several micro-frontends and services** | `/cross-repo-story` from the product context hub; `hub.mjs workspace` for the window; producers first, shell last ([MULTI-REPO.md](MULTI-REPO.md)). |
| **Rewriting an old module** | Section 5. |
| **Code review** | Ask: "Review this diff against AGENTS.md and the instructions that apply; run graphify affected on the changed classes and list untested dependents." |
| **New team member** | `/onboard-me`, `graph.html`, then a small story with a buddy. |
| **Incident or production bug** | Fix it, then add the trap to `docs/context/known-traps.md` with `/context-learn`. |

---

## 5. Rewriting an old module

Old modules that come back into development are where agents help most and fail worst. Do it in this
order.

1. **Map it.** `graphify god-nodes` and `graphify affected "<main classes>"` show what the module is
   built around and what outside code depends on it. `graphify export callflow-html` gives a picture
   for the team.
2. **Write its context.** Run `/context-bootstrap` focused on the module: a `docs/context/<module>.md`
   page, its traps, and scoped rules for its folders.
3. **Pin down current behaviour.** Before changing anything, add tests that record what it does today
   (including the odd parts). With OpenSpec, run `/opsx-explore` on the module and write baseline
   specs for it. This is the one case where writing specs for existing code is worth it, because you
   are about to change all of it.
4. **Choose the approach.**
   - **Replace it piece by piece** (usually safer): each slice is a normal OpenSpec story; old code is
     removed as each slice lands.
   - **Build a new module beside it**: plan the new module with Spec Kit (made for building from
     scratch), switch callers over, then turn its spec into OpenSpec baseline specs so later changes
     use the normal story workflow.
5. **Each slice:** `affected` before and after, the behaviour tests must still pass, and
   `/context-refresh` as the module's structure changes.

---

## 6. Choosing a model

Copilot lets you pick the model per chat. A simple rule:

| Step | Model |
| --- | --- |
| Explore, propose, review plans, bootstrap context | Your strongest available model |
| Apply well-specified tasks, write tests | Your standard model |
| Quick questions, small edits | The fastest model |

Note which model you used in your story log; it helps others repeat your results.

---

## 7. Checklist: is my setup complete?

- [ ] Kit installed (`kit/install.mjs --graphify`), setup PR merged
- [ ] `AGENTS.md` about 100 lines, with "Where to look" and the code map pointer
- [ ] Graphify map built; `context-tools.cjs status` says "up to date"; `graphify` MCP server running in VS Code
- [ ] OpenSpec initialised with `verify` enabled
- [ ] **Chat: Open Customizations** lists the skills, the steward agent and the hooks
- [ ] `git config core.hooksPath` is `.githooks` on your clone
- [ ] Optional: Azure DevOps MCP connected; read-only Graphify commands auto-approved
