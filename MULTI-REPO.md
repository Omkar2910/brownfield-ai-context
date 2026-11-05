# Many repos: micro-frontends and backend services

How to set up and run AI-assisted work when a product is split across **many separate repos**:
a micro-frontend shell, several micro-frontend remotes, several backend services and shared libraries.
Plain English, about 15 minutes. Read [GUIDE.md](GUIDE.md) first for the single-repo setup.

---

## 1. The idea in one paragraph

Context lives at **three levels**, and each fact goes to exactly one of them. Each repo keeps its own
rules. A small **product context hub** repo keeps what no single repo owns: which repos exist and how
they depend on each other, platform rules, API contracts, and notes for stories that cross repos. For
each story you open **only the repos it touches, plus the hub**, in one VS Code window. A small script
in the hub generates that window for you.

| Level | Holds | Lives in | Owner |
| --- | --- | --- | --- |
| **Organization** | Rules for every product (security, coding standards) | GitHub organization custom instructions, or a platform hub | Architecture / platform team |
| **Product (hub)** | Repo catalog, system map, platform rules for this product, API contracts, cross-repo story notes, cross-repo skill | `product-context` repo | Tech leads of the product |
| **Repo** | Its commands, rules, traps, code map, its own specs and changes | Each repo (`AGENTS.md`, `.github/`, `docs/context/`, `openspec/`) | That repo's team |

---

## 2. What goes where

```
work/
├── product-context/                 ← the hub (one per product)
│   ├── catalog.json                 every repo: type, owner, areas, exposes/API, calls, uses
│   ├── context/system-map.md        generated: tables, "which UI calls which API" matrix, diagram
│   ├── context/platform/            auth, micro-frontends, errors and logging rules
│   ├── contracts/<service>/         copies of each service's API contract
│   ├── initiatives/<change-id>.md   one note per cross-repo story
│   ├── workspaces/*.code-workspace  generated VS Code windows per story or area
│   ├── .github/skills/cross-repo-story/
│   └── scripts/hub.mjs              map, workspace, impact, status, clone, contracts
├── shell-app/                       ← micro-frontend shell
├── reports-mfe/                     ← micro-frontend remote
├── admin-mfe/
├── report-service/                  ← backend service
├── ciam-service/
└── ui-shared-lib/                   ← shared library
    (each repo: AGENTS.md, .github/instructions, .github/skills, hooks, .githooks,
     docs/context, openspec/, graphify-out/)
```

Keep all clones **side by side in one folder**. The hub's scripts and the workspace files assume that.

### What each kind of repo says about the others

`/context-bootstrap` asks what kind of repo it is working in and adds these (details in
`kit/files/.github/skills/context-bootstrap/references/repo-types.md`):

| Repo type | Its AGENTS.md must say |
| --- | --- |
| **Micro-frontend shell** | Which remotes it loads and where that list lives; top-level routes it owns; pinned shared dependency versions |
| **Micro-frontend remote** | What it exposes and the exact name the shell uses; which services it calls and where the generated clients are; events it sends or listens to; "never import from another remote" |
| **Backend service** | API base path and where the contract lives; who calls it (from the hub); permission per endpoint |
| **Shared library** | Who uses it; how releases reach them; breaking changes are a cross-repo initiative |
| **Every repo** | A "Where to look" line pointing at `../product-context/`; 2–3 lines of platform rules that apply to almost every task |

Rules that apply everywhere (Keycloak for login, CIAM for permissions, one error format, how
micro-frontends share dependencies) are written **once** in the hub's `context/platform/`. Each repo has
only a short summary line and the link.

---

## 3. Setting it up

### Once per product (about an hour, one person)
```bash
node brownfield-ai-context/kit/install.mjs --create-hub ../product-context
cd ../product-context
# edit catalog.json: one entry per repo
# edit context/platform/*.md: your real rules, short, with reasons
node scripts/hub.mjs map
git init && git add -A && git commit -m "Product context hub"   # then push to Azure Repos
```

The catalog is the most valuable part. For each repo record: `type` (`mfe-shell`, `mfe-remote`,
`service`, `library`), `owner`, `areas` (business areas such as `reports`; use `platform` for repos
almost everything uses), `exposes` (micro-frontends) or `api` and `contract` (services), and `calls`,
`uses`, `loads` (dependencies). See the example `catalog.json`.

### Once per repo (each team, on their own setup PR)
```bash
node brownfield-ai-context/kit/install.mjs ../reports-mfe --graphify
# then in VS Code: /context-bootstrap, build the code map, review, commit
```

For many repos at once (PowerShell):
```powershell
foreach ($r in "shell-app","reports-mfe","admin-mfe","report-service") {
  node brownfield-ai-context/kit/install.mjs "..\$r" --graphify
}
```

### Keeping the kit the same everywhere
Each repo records its kit version in `.github/ai-kit.json`. When the kit improves:
```bash
node brownfield-ai-context/kit/install.mjs ../reports-mfe --upgrade
```
This replaces only the kit's own files (skills, steward agent, hook script and config, git hooks, and
`openspec/schemas/story-tdd/schema.yaml`). It never touches `AGENTS.md`, instructions, `docs/context/`,
your PR template or the story workflow's templates. Commit the result in a
small PR. Later, an agent plugin or APM package can do this centrally (see [TOOLBOX.md](TOOLBOX.md)).

---

## 4. Opening the right repos for a story

Do not open every repo at once: more folders mean more rules, more duplicate skills and more code for
the agent to wade through. Open the **working set** for the story.

```bash
cd product-context
node scripts/hub.mjs workspace reports                    # the "reports" area + its direct dependencies
node scripts/hub.mjs workspace reports-mfe report-service # exactly these repos
node scripts/hub.mjs workspace reports ciam-service --name reports-with-auth
```

This writes `workspaces/<name>.code-workspace` with the repos (producers first, then micro-frontends, then
the shell) **plus the hub**. Open it with **File → Open Workspace from File**. Platform repos (areas
include `platform`) are listed but not added unless you name them, so they don't end up in every window.
It warns when a repo isn't cloned (`node scripts/hub.mjs clone reports --run` clones it) and when the
window would hold more than five repos.

| Story touches | Open |
| --- | --- |
| One repo | That repo alone. Add the hub only if you need the platform rules or contracts. |
| One micro-frontend + the service it calls | `hub.mjs workspace <mfe> <service>` |
| A whole area | `hub.mjs workspace <area>` |
| A shared library or a platform service | Start with `hub.mjs impact <repo>`, then open the library or service plus the consumers you will change |

With the hub in the window, its `cross-repo-story` skill is available alongside each repo's own skills.

---

## 5. Running a story that crosses repos

1. **Plan across repos:** `/cross-repo-story <story>`. It reads the catalog and system map, lists the
   repos involved, runs `hub.mjs impact` on every service whose API changes (to find every
   micro-frontend that calls it), agrees the API contract first, and writes
   `initiatives/<change-id>.md` with the repos **in order**:
   services and shared libraries → micro-frontend remotes → shell.
2. **Review the initiative note** with the tech lead. This replaces many late surprises between teams.
3. **Per repo, in that order:** the normal single-repo flow (`/story-to-change` → `/opsx-propose <change-id>`
   → review → `/opsx-apply` → `/story-finish`). Same change id in every repo. One PR per repo, each linking
   the initiative note.
4. **After each service PR merges:** `node scripts/hub.mjs contracts --sync` in the hub and commit, so the
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
| Has a service's contract changed since the hub copy? | `node scripts/hub.mjs contracts` |

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
| Each kit release | `install.mjs <repo> --upgrade` per repo | Each team |
| Quarterly | `context-steward quarterly-review` in each repo; review the catalog for drift | Tech leads |

Ownership: put the hub under CODEOWNERS (or branch policies in Azure Repos): platform rules → platform
team; catalog and initiatives → product tech leads; `contracts/` → updated only by the sync, never by hand.

---

## 8. Rolling it out

1. **Start small:** the hub with a catalog of every repo (cheap, immediately useful), but the kit only in
   one micro-frontend and the service it calls. Run one real cross-repo story.
2. **Add repos as teams pick up stories**, not all at once. Each team owns its setup PR.
3. **Automate later:** contract sync in service pipelines, the context check in PR pipelines, kit
   distribution via plugin or APM, a central Graphify server.

---

## 9. Commands at a glance

| Task | Command |
| --- | --- |
| Create the hub | `node kit/install.mjs --create-hub ../product-context` |
| Install the kit in a repo | `node kit/install.mjs ../<repo> --graphify` |
| Upgrade the kit in a repo | `node kit/install.mjs ../<repo> --upgrade` |
| Regenerate the system map | `node scripts/hub.mjs map` |
| Window for a story | `node scripts/hub.mjs workspace <area or repos>` |
| What does a change affect | `node scripts/hub.mjs impact <repo>` |
| Context health of every repo | `node scripts/hub.mjs status` |
| Clone what's missing | `node scripts/hub.mjs clone <area> --run` |
| Contract copies up to date? | `node scripts/hub.mjs contracts [--sync]` |
