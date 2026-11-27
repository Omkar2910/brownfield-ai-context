---
name: product-context
description: Create, refresh or update (after repos were added) the product-level context in this home repo or hub - system architecture, end-to-end flows across micro-frontends and services, glossary, platform rules (auth, errors, logging, micro-frontend loading) and cross-service decisions, every fact anchored into the repos with repo:path anchors. Use when asked for "product context", "/product-context update", "common context across services", "system architecture document", or after a repo joined the workspace.
---

# Product context

Goal: the knowledge no single repo owns, written once, reviewed by the tech leads, kept current by
checks against the cloned repos. Per-repo detail (its data, API, screens, security) stays in each
repo's `docs/context/` (made with `/context-create deep` there); this hub links to it.

## Before you start
- `catalog.json` lists every repo with type, owner and calls/uses/loads; `node scripts/hub.mjs map`
  has generated `context/system-map.md`.
- The repos are cloned next to the hub (`node scripts/hub.mjs status`), and ideally all open in this
  window (`node scripts/hub.mjs workspace all`). Code you cannot see, you cannot check.

## Steps
1. **Agree the list with the user.** Pages: `context/architecture.md`, `context/glossary.md`,
   one `context/flows/<flow>.md` per important end-to-end flow (ask which flows matter: usually the
   3–6 things users do most or that break most), the existing `context/platform/*.md`, and
   `context/decisions/` for product-wide decisions, and `context/data/across-services.md` when services
   share data (template `references/data-across-services.md`). Templates: `references/`.
   **Data first, if there is a database.** Run `node .ai-kit/context-tools.cjs schemas`: from the migrations
   (who changes) and the entities and SQL (who reads), it proposes, per schema, where its export and table
   pages belong. Owned by one repo: that repo (its `/context-create deep data`). A migrations repo: that
   repo. Changed by several repos with no owner: once here, in `context/data/<schema>/`
   (`node .ai-kit/context-tools.cjs schema-import context/data/<schema>/schema.sql --out context/data/<schema>`).
   Show the proposal, ask the user to confirm or correct each owner, then `schemas --write` and set
   `"confirmed": true` in `catalog.json` for the ones they confirmed. Never copy a table page here that a
   repo owns.
2. **Write one page at a time, architecture first.** For each fact, find it in a repo and name the code in
   backticks: the event (`OrderVoided`), the endpoint, the class (`InventoryClient.release`), the table and
   column (`orders.status`). Every service's check then warns when its change removes a name a product page
   relies on. Add `[anchor: <repo-name>:<path or glob>]` (the repo name exactly as in `catalog.json`) only
   for a fact with no name to point at. Use
   `graphify query/path --graph <repo>/graphify-out/graph.json` inside each repo to trace a flow, and
   match UI HTTP calls to service endpoints to confirm each hop. Field mappings come from the code
   (form controls, DTOs, entities, columns), never from memory.
3. **Same rules as repo pages:** frontmatter kept, `status: draft` until reviewed, the "why" only from
   evidence or the user, everything unproven under `## Unverified`, 60–250 lines a page, link to repo
   pages instead of copying them.
4. **Check:** `node scripts/hub.mjs check` (every repo:path anchor resolves in the cloned repos, and every
   name the pages mention exists in some repo), then `node scripts/hub.mjs readiness`.
5. **Hand over the review:** each page's owner (the catalog owner of the repos it covers, or the tech
   lead) reviews it, then sets `status: stable` and adds a line under `verified:` (`- { by: "human:<name>", at: "<date>" }`). Changes reach the
   hub through pull requests reviewed by the tech leads.

## Update after repos were added or removed (`/product-context update`)
1. Run `node scripts/hub.mjs map` (system map from `catalog.json`) and `node scripts/hub.mjs status`.
2. For each repo in the catalogue that no product page mentions yet: make sure its `catalog.json` entry
   has type, description, owner, areas and calls/uses/loads (read its config, HTTP clients and routes to
   fill them, then show the user). If the repo has no `AGENTS.md`, tell the user to run `/context-create`
   for it first: product pages link to repo pages, they do not replace them.
3. Change only the pages the new repo affects: the architecture page (where it sits, what it talks to),
   the flows it takes part in, glossary terms it introduces, platform rules it uses, the data it shares
   (`schemas` again). Name the repo's code in every new line, in backticks. Leave other pages alone.
4. For a removed repo: list every line that names it or anchors into it, and ask before deleting them.
5. Run `node scripts/hub.mjs check`. Changed pages go back to `status: draft` until their owner reviews.

## Keeping it current
- When a story changes a cross-repo flow, contract or platform rule, its technical design lists the hub
  page under "Context impact"; `/story-finish` drafts the hub change for a linked PR in this repo.
- Each repo's own commit check and pull request check warn when the change removes a name a product page
  mentions (an event, a class, a column of shared data), or a file a product page anchors, and when a
  migration changes a schema `catalog.json` says another repo owns or several repos share.
- `node scripts/hub.mjs check` lists names no repo has any more, unresolved anchors, and lines whose anchored
  code changed since their page's review date. Run it before raising the pull requests of a cross-repo
  story, and fix or re-confirm those lines.

## Finish
End your reply with this block, filled in:
- **What changed:** each hub page created or edited, as a link, with its line count.
- **Checks:** `hub.mjs check` (names and anchors) and `hub.mjs readiness` (score and band).
- **Next:** who reviews each draft page, and the next page to write.
