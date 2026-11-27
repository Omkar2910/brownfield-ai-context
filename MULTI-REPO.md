# Many repos: micro-frontends and backend services

How to set up and run AI-assisted work when a product is split across **many separate repos**:
a micro-frontend shell, several micro-frontend remotes, several backend services and shared libraries.
Plain English, about 15 minutes. Read [GUIDE.md](GUIDE.md) first for the single-repo setup.

---

## 1. The idea in one paragraph

Set the product up as a **product workspace**. One **home repo** (`product-context`) holds the kit's skills,
agents, hooks and tool once, plus what no single repo owns: which repos exist and who calls whom, flows across
repos, platform rules, contracts and notes for stories that cross repos. Each code repo keeps **only its own
knowledge**, so it changes in the same pull request as its code. You open the repos a story touches together
with the home repo.

| Level | Holds | Lives in | Owner |
| --- | --- | --- | --- |
| **Organization** | Rules for every product (security, coding standards, branch and PR naming) | An org context repo, synced into each repo ([ORG-LEVEL.md](ORG-LEVEL.md)) | Architecture / platform team |
| **Product (home repo)** | The kit's tools; repo catalogue, system map, flows across repos, platform rules, contracts, cross-repo story notes | `product-context` | Tech leads of the product |
| **Repo** | Its commands, rules, traps, tables, code map, its own specs and changes | Each repo (`AGENTS.md`, rule files, `docs/context/`, `openspec/`) | That repo's team |

**The rule for what goes where:** if one team can change it in one pull request, it lives in that repo. If
changing it needs two repos to agree, it lives in the home repo. Product pages link down to repo pages and
never copy them.

| In each repo (`docs/context/`) | In the home repo (`context/`) |
| --- | --- |
| How the repo is built; its commands and traps | Which repos exist, who owns them, who calls whom (`catalog.json`) |
| Its business rules, as its code implements them | Flows across repos: 5–10 steps, one line each saying which repo does what, linked to that repo's page |
| Its tables: meaning of columns and status values | Field mapping across repos: screen field → API field → column |
| The API it offers and the calls it makes | What one repo relies on from another: event names, endpoints, who consumes them |
| Deep detail inside the repo (an invoice calculation) | Platform rules, glossary, decisions that cross repos |

A product flow page is short on purpose. In a test, an agent planning a cancel-order story got the event name
billing listens for and a stock-release call to another service right only because the flow page said so; it
did not need the internals of either service.

---

## 2. What goes where on disk

```
work/
├── ai-context-kit/                  ← the kit (for setup and upgrades)
├── product-context/                 ← the home repo (one per product)
│   ├── AGENTS.md, CLAUDE.md         how to work across the repos
│   ├── .github/skills, .claude/…    the kit's skills, agents and hooks, once for every repo
│   ├── .ai-kit/                     the context tool, conventions.json, readiness weights
│   ├── .githooks/                   the commit check every repo runs
│   ├── catalog.json                 every repo: type, owner, areas, exposes/API, calls, uses
│   ├── context/system-map.md        generated: tables, "which UI calls which API" matrix, diagram
│   ├── context/flows/               one page per flow across repos
│   ├── context/platform/            auth, micro-frontends, errors and logging rules
│   ├── contracts/<service>/         copies of each service's API contract
│   ├── initiatives/<change-id>.md   one note per cross-repo story
│   ├── product.code-workspace       every repo in one VS Code window
│   └── scripts/hub.mjs              map, workspace, impact, status, clone, contracts, claude
├── shell-app/                       ← micro-frontend shell
├── reports-mfe/                     ← micro-frontend remote
├── report-service/                  ← backend service
└── ui-shared-lib/                   ← shared library
    (each repo: AGENTS.md, rule files, docs/context/, openspec/, .ai-kit/kit.json stamp)
```

Keep all clones **side by side in one folder**. The home repo's scripts and the workspace file assume that.

### What each kind of repo says about the others

`/context-create` asks what kind of repo it is working in and adds these (details in
`kit/files/.github/skills/context-create/references/repo-types.md`):

| Repo type | Its AGENTS.md must say |
| --- | --- |
| **Micro-frontend shell** | Which remotes it loads and where that list lives; top-level routes it owns; pinned shared dependency versions |
| **Micro-frontend remote** | What it exposes and the exact name the shell uses; which services it calls and where the generated clients are; events it sends or listens to; "never import from another remote" |
| **Backend service** | API base path and where the contract lives; who calls it (from the catalogue); permission per endpoint |
| **Shared library** | Who uses it; how releases reach them; breaking changes are a cross-repo initiative |
| **Every repo** | 2–3 lines of platform rules that apply to almost every task, with a link to the home repo's page |

Rules that apply everywhere (the identity provider for login, the permission service, one error format, how
micro-frontends share dependencies) are written **once** in the home repo's `context/platform/`.

---

## 3. Setting it up

**Easiest:** put the kit next to the repos, open that folder in your agent and say *"Set up the AI context kit
for the repos in this folder. Follow ai-context-kit/kit/SETUP-AGENT.md."* It suggests the workspace as soon as
there are two repos, asks once, shows the plan and runs it after your yes (in a terminal:
`node ai-context-kit/kit/setup.mjs`). The steps below are what it runs; details in [kit/GUIDE.md](kit/GUIDE.md).

### Once per product (one person)
```bash
node ai-context-kit/kit/install.mjs --create-workspace product-context --tool copilot,claude
node ai-context-kit/kit/install.mjs report-service --workspace product-context
node ai-context-kit/kit/install.mjs reports-mfe    --workspace product-context
```

### Then, in this order
1. **Context for each repo, services first:** `/context-create` in each repo (and `/context-create deep data`
   where a repo owns tables). Each team reviews its own.
2. **The product picture, last:** `/product-context` in the home repo. It fills `catalog.json` (who calls
   whom), writes `context/architecture.md`, `context/glossary.md`, one `context/flows/<flow>.md` per important
   flow across repos, and `context/platform/`. Every fact names the code it is about in backticks (the event,
   endpoint, class, table and column), so each repo's own checks warn when a change removes something a
   product page relies on. It comes out better once each repo has its own context, because it links to those
   pages instead of guessing. If there is a database, it starts with `context-tools schemas` (below).
3. **Check and review:** `node scripts/hub.mjs check` confirms every name exists in some repo and every
   anchor resolves; owners
   review their pages and run `node .ai-kit/context-tools.cjs review <page> --by <name>` in their own terminal.
4. **A repo added later:** run setup again (it adds the repo), `/context-create` in it, then
   `/product-context update`.

**How stories use the product pages.** `pages-for <file>` (which `/story-start` and `/story-finish` run)
lists the home repo's lines that anchor or name the files a story touches, next to the repo's own pages. So
an agent changing `OrderService.java` is pointed at the cancellation flow page that says which event billing
listens for, without anyone having to remember it. Agents also find these pages by searching for the names
they change; in a test, that worked as well.

**How a service's change is checked against the product pages.** The home repo is checked out next to each
repo in its commit check and pull request check, so both also read the product pages:

| A change in orders-service | Warns, in orders-service's commit and pull request |
| --- | --- |
| Renames the event `OrderCreated` | `context/flows/placing.md:2` names `OrderCreated` |
| Drops `orders.status`, which billing reads (new migration and schema export) | `context/data/across-services.md:2` names `orders.status` |
| Deletes a file a product page anchors | That page and line |
| A billing migration alters a table in the `orders` schema | `catalog.json` says the `orders` schema belongs to orders-service |

Before raising the pull requests of a story across several repos, `node scripts/hub.mjs check` runs the same
name checks over every cloned repo at once.

### Database schemas: one home per schema

Each schema's export (`schema.sql`) and table pages live once, with whoever changes that schema, because they
must change in the same pull request as its migrations:

| Who changes the schema | Where its export and table pages go |
| --- | --- |
| One service (most schemas) | That service: `docs/context/data/` (a service with two schemas: one folder per schema) |
| A separate migrations repo | That repo |
| Several services, no owner | The home repo: `context/data/<schema>/` |

`node .ai-kit/context-tools.cjs schemas` (in the home repo) proposes this from the code: migrations show who
creates, alters or fills each table; entities and SQL show who reads. A person confirms or corrects it, and
`schemas --write` records it in `catalog.json` (`"schemas"`, with `"confirmed": true` once confirmed).
`/context-create deep data` and `/product-context` both start from it. The home repo keeps
`context/data/across-services.md` for what crosses services only: IDs that point into another service's data,
and which columns another service reads. Nothing is copied up from the services.

### Keeping the kit the same everywhere
The tools live once in the home repo, so an upgrade is one command there
(`node ai-context-kit/kit/install.mjs product-context --upgrade`, or ask the agent "upgrade the kit").
Repos record only a small stamp. A product hub (`--create-hub`) is the older form, for repos that each keep
their own copy of the kit; it holds the same product pages and works with the same scripts.

---

## 4. Opening the right repos for a story

`product.code-workspace` opens every repo. For a large product, open only the **working set** for the story:
more folders mean more code for the agent to wade through.

```bash
cd product-context
node scripts/hub.mjs workspace reports                    # the "reports" area + its direct dependencies
node scripts/hub.mjs workspace reports-mfe report-service # exactly these repos
node scripts/hub.mjs workspace reports ciam-service --name reports-with-auth
```

This writes `workspaces/<name>.code-workspace` with the repos (producers first, then micro-frontends, then
the shell) **plus the home repo**. Open it with **File → Open Workspace from File**. Platform repos (areas
include `platform`) are listed but not added unless you name them, so they don't end up in every window.
It warns when a repo isn't cloned (`node scripts/hub.mjs clone reports --run` clones it) and when the
window would hold more than five repos.

| Story touches | Open |
| --- | --- |
| One repo | That repo plus the home repo (it holds the skills and the product pages). |
| One micro-frontend + the service it calls | `hub.mjs workspace <mfe> <service>` |
| A whole area | `hub.mjs workspace <area>` |
| A shared library or a platform service | Start with `hub.mjs impact <repo>`, then open the library or service plus the consumers you will change |

With the home repo in the window, its skills (including `cross-repo-story`) serve every repo.

---

## 5. Running a story that crosses repos

1. **Plan across repos:** `/cross-repo-story <story>`. It reads the catalog and system map, lists the
   repos involved, runs `hub.mjs impact` on every service whose API changes (to find every
   micro-frontend that calls it), agrees the API contract first, and writes
   `initiatives/<change-id>.md` with the repos **in order**:
   services and shared libraries → micro-frontend remotes → shell.
2. **Review the initiative note** with the tech lead. This replaces many late surprises between teams.
3. **Per repo, in that order:** the normal single-repo flow (`/story-start` → `/opsx-propose <change-id>`
   → review → `/opsx-apply` → `/story-finish`). Same change id in every repo. One PR per repo, each linking
   the initiative note.
4. **After each service PR merges:** `node scripts/hub.mjs contracts --sync` in the home repo and commit, so the
   micro-frontends see the new contract.
5. **Finish:** archive each repo's OpenSpec change; update `catalog.json` if a dependency was added or
   removed (`hub.mjs map`); mark the initiative done.

Why one change per repo with a shared id (and not one change in the hub): each repo's specs keep describing
that repo, each team reviews its own part, and nothing depends on beta features. OpenSpec's "stores" feature
can hold one change for several repos; try it later if this becomes awkward (see `demo-kit/`).

---

## 6. Seeing impact across repos

| Question | Tool |
| --- | --- |
| Which repos break if this service, library or remote changes? | `node scripts/hub.mjs impact <repo>` (from the catalog) |
| Which micro-frontends call this API? | The matrix in `context/system-map.md` |
| Which classes inside a repo depend on this one? | `graphify affected "<Class>"` in that repo |
| Where is a concept anywhere in the product? | Graphify global graph: `graphify global add graphify-out/graph.json --as <repo>` in each repo, then query with `--graph` pointing at `graphify global path` |
| Has a service's contract changed since the home repo's copy? | `node scripts/hub.mjs contracts` |

Graphify maps code inside repos; it does not connect an Angular HTTP call to a Spring endpoint or a shell
to its remotes. The catalog's `calls` and `loads` fields fill exactly that gap. Keep them current: a new
dependency is added to the catalog in the same PR that introduces it.

---

## 7. Keeping it maintained

| When | What | Who |
| --- | --- | --- |
| Every PR in any repo | Normal per-repo checks (hooks, pre-commit, same-PR rule) | Everyone |
| A dependency is added or removed | Update `catalog.json`, run `hub.mjs map` | The PR author |
| A service API changes | `hub.mjs contracts --sync` after merge (or automate it in the service's pipeline) | Service team |
| A platform rule changes | Edit `context/platform/`, announce it; repos only link to it | Platform / architecture team |
| Weekly (5 min) | `hub.mjs status`: repos missing context, failing checks, missing code maps | Product tech lead |
| Weekly (5 min) | `hub.mjs check` (after pulling the repos): product lines whose code changed since review | Product tech lead |
| Monthly (5 min) | `context-tools usage`: pages agents never opened; merge, shorten or delete them | Product tech lead |
| A story changes a cross-repo flow or contract | `pages-for` names the product page; a linked PR in the home repo updates it | Story author |
| Each kit release | One upgrade in the home repo | Product tech lead |
| Quarterly | `context-steward quarterly-review` in each repo; review the catalog for drift | Tech leads |

Ownership: put the home repo under CODEOWNERS (or branch policies in Azure Repos): platform rules → platform
team; catalog and initiatives → product tech leads; `contracts/` → updated only by the sync, never by hand.

---

## 8. Rolling it out

1. **Start small:** the home repo with a catalogue of every repo (cheap, immediately useful), context only for
   one micro-frontend and the service it calls. Run one real cross-repo story.
2. **Add repos as teams pick up stories**, not all at once. Each team owns its setup PR.
3. **Automate later:** contract sync in service pipelines, the context check in PR pipelines, kit
   distribution via plugin or APM, a central Graphify server.

---

## 9. Commands at a glance

| Task | Command |
| --- | --- |
| Set up or upgrade everything | Ask the agent (`SETUP-AGENT.md`, later `/kit-setup`), or `node ai-context-kit/kit/setup.mjs` |
| Create the home repo | `node kit/install.mjs --create-workspace product-context --tool copilot,claude` |
| Add a repo | `node kit/install.mjs <repo> --workspace product-context` |
| Upgrade the kit | `node kit/install.mjs product-context --upgrade` |
| Product pages for a file | `node .ai-kit/context-tools.cjs pages-for <file> --repo <repo>` (in the home repo) |
| Pages agents actually read | `node .ai-kit/context-tools.cjs usage` |
| Branch name and PR title | `node .ai-kit/context-tools.cjs conventions name --type <type> --id <id> --summary "<text>"` |
| Regenerate the system map | `node scripts/hub.mjs map` |
| Window for a story | `node scripts/hub.mjs workspace <area or repos>` |
| Claude Code with every repo | `node scripts/hub.mjs claude` |
| What does a change affect | `node scripts/hub.mjs impact <repo>` |
| Context health of every repo | `node scripts/hub.mjs status` |
| Clone what's missing | `node scripts/hub.mjs clone <area> --run` |
| Contract copies up to date? | `node scripts/hub.mjs contracts [--sync]` |
| Product pages still true in the repos (names and anchors)? | `node scripts/hub.mjs check` |
| Who changes and who reads each database schema | `node .ai-kit/context-tools.cjs schemas [--write]` |
