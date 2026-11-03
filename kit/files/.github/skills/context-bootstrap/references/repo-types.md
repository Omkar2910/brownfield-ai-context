# What each kind of repo must say in its context

When the product has many micro-frontends and services, an agent working in one repo needs to know how
that repo connects to the others. Add these lines (short, with anchors) according to the repo type.
If a product context hub exists (usually `../product-context/`), link to it instead of copying.

## Every repo
- "Where to look" includes: `Product-wide context (system map, platform rules, contracts): ../product-context/`
- Platform rules that apply to almost every task here, as 2–3 short lines (details stay in the hub).

## Micro-frontend shell (host)
- Which remotes it loads and where that list lives (manifest or config file). [anchor]
- Top-level routes it owns, and which routes belong to remotes.
- Shared dependencies and their pinned versions (the source of truth for every remote). [anchor]
- "Adding a remote or a top-level route is a change here."

## Micro-frontend remote
- What it exposes (module or routes) and the exact name/path the shell uses. Renaming breaks the shell
  at runtime. [anchor: the federation config file]
- Which backend services it calls and where their clients come from (generated client folder; never
  edit by hand). Link the service contracts in the hub.
- How it talks to other micro-frontends (shared event bus or URL), and the events it sends or listens to.
- "Never import from another remote; shared code goes in the shared library."
- How to run it alone and inside the shell locally.

## Backend service
- Its API base path and where the contract lives (OpenAPI file or DTO package). [anchor]
- Which micro-frontends and services call it (from the hub's system map); an API change must check them.
- The permission each endpoint needs and how it is declared. [anchor]
- Services it calls, with timeouts or retry rules that matter.

## Shared library
- Who uses it (from the hub) and how releases reach them (version, publish command).
- "A breaking change needs a cross-repo initiative: library first, then each consumer."
