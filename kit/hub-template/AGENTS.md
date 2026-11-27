# Product context hub — agent context

This repo holds what no single micro-frontend or service owns: the catalog of repos, the system map,
platform rules, published API contracts and notes for stories that span several repos.
It contains no application code. In a product workspace it is also the **home repo**: the kit's skills,
agents, hooks and context tool live here once, for every repo in the workspace.

## Working across the repos (product workspace)
- Each repo keeps its own `AGENTS.md`, rule files and `docs/context/`. Read the repo's `AGENTS.md` before
  working in it; its rules win for its code.
- Run OpenSpec commands inside the repo that changes (`cd <repo>` first), never here.
- The context tool works on any repo: `node .ai-kit/context-tools.cjs check --repo ../<repo>`.

## How to use it
- Which repos exist, who owns them and what depends on what: `catalog.json` (source of truth) and
  `context/system-map.md` (generated from it — never edit by hand; run `node scripts/hub.mjs map`).
- Platform rules every repo must follow: `context/platform/`. Read the relevant file before any work on
  authentication, authorization, micro-frontend loading, shared libraries, errors or logging.
- API contracts: `contracts/<service>/`. These are copies of each service's contract. Change the
  contract in the service repo, never here.
- Stories that touch more than one repo: `initiatives/<id>.md`, and the `cross-repo-story` skill.

## Rules
- Each repo's own rules live in that repo's AGENTS.md. Do not copy them here.
- When a story changes a service API, the service change goes first and every micro-frontend that calls
  it (see the matrix in `context/system-map.md`) is checked.
- Repo-level impact: `node scripts/hub.mjs impact <repo>`. Code-level impact: `graphify affected` inside the repo.

## Commands
- `node scripts/hub.mjs map` — regenerate the system map after editing `catalog.json`
- `node scripts/hub.mjs workspace <area|repo>` — VS Code workspace for a story
- `node scripts/hub.mjs status` — which repos are cloned and their context health
- `node scripts/hub.mjs contracts` — which hub contract copies are out of date
- `node scripts/hub.mjs check` — every name these pages mention still exists in some repo, every `[anchor: repo:path]` resolves; lines whose code changed since review
- `node .ai-kit/context-tools.cjs schemas` — which repo changes and which reads each database schema
- `node scripts/hub.mjs readiness` — readiness score of this hub's context
- `node scripts/hub.mjs claude` — start Claude Code here with every cloned repo added

## Creating the product-level context
Run the `product-context` skill with the hub and the repos open in one window. Name the code each fact is
about in backticks (event, endpoint, class, table and column); add `[anchor: <repo-name>:<path>]` only when
there is no name. Pages start as drafts; owners review them, set `status: stable` and add a `verified` entry.
