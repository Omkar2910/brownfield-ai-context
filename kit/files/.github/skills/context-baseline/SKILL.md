---
name: context-baseline
description: Create or refresh the in-depth context reference for one repo - one page per readiness dimension (architecture, business domain, screens, data, API, dependencies, security, testing, operations, decisions), every fact anchored to code, generated sections where code is the source, unproven claims marked. Use when asked for "in-depth context", a "context baseline", "deep context", "document this service for the agent", or to raise the context readiness score.
---

# Context baseline

Goal: a reviewed, traceable reference of how this repo works, one page per dimension, that people
can read and agents open only when a task needs it. It is never loaded on every request:
`AGENTS.md` stays short and only links here.

## Before you start
- `AGENTS.md` must exist (run `/context-bootstrap` first). The baseline adds depth; it does not replace it.
- Build or refresh the code map if Graphify is installed: `graphify update .`
- If older documentation exists (generated analysis files, earlier context documents, wiki pages),
  read it as a SOURCE, never copy it: every line you keep must be confirmed in today's code.

## Steps
1. **Plan the pages.** Templates are in `references/pages/`. Decide which apply:
   - Service: architecture, domain, data, api, dependencies, security, testing, operations.
   - UI / micro-frontend: architecture, domain, screens, api (calls it makes), dependencies,
     security, testing, operations. Add data only if it stores data itself.
   - Library: architecture, domain (what it offers), dependencies, testing.
   Show the list to the user and ask two questions: which screens, flows or rules matter most, and who
   owns each page. Then work through the pages one at a time, in this order: architecture, domain
   (and screens), data, api, dependencies, security; then testing, operations, decisions.
2. **For each page, gather evidence first, then write.**
   - Architecture: folder and package layout, entry points, `graphify god-nodes`,
     `graphify query` for the main flows, integration clients and config.
   - Domain and screens: controllers and services named after business concepts, validation and
     calculation code, enums and status lifecycles, `openspec/specs/`, routes and components, how
     form fields map to API fields and columns.
   - Data: migrations, entities, repositories and queries, cache config. The tables section is
     generated from migrations and entities: list what is there, don't describe from memory.
   - API: the OpenAPI file or controllers and DTOs (generate the endpoint table from them), HTTP
     clients for outbound calls, the error handler.
   - Dependencies: the build file (versions stay there), internal libraries, config for services and
     infrastructure, `node <hub>/scripts/hub.mjs impact <repo>` if a product hub is cloned.
   - Security: security config, token handling, permission checks, logging of personal data.
   - Testing: test folders, frameworks, fixtures, the commands in `AGENTS.md`.
   - Operations: profiles and config, pipeline files, scheduled jobs, logging setup.
   - Decisions: one page per real decision found (comments explaining a choice, commit messages,
     archived `design.md` files), from `references/pages/decision.md`, in `docs/context/decisions/`.
3. **Write rules for every page.**
   - Save as `docs/context/<page>.md`. Keep the header line from the template; set `Status: draft`,
     `Last verified: never`, and the owner the user named.
   - Every statement about the code ends with `[anchor: <path>]` (a file, folder or glob). Group a
     section under one anchor line when every row comes from the same source.
   - Sections marked "generated" list what the code contains, not prose. Name the source.
   - Write the "why" only from evidence (comments, commit messages, docs) or the user. Everything you
     believe but cannot prove goes under `## Unverified`, never in the main text.
   - Do not repeat `AGENTS.md`, the build file or the API file; point at them.
   - Aim for 60–250 lines per page. A flow or format that needs more becomes an area page in
     `docs/context/areas/<area>.md` (template: the `story-finish` skill's `area-page.template.md`).
   - Show each finished page to the user before starting the next, so they can correct it early.
4. **Index it.** Create `docs/context/README.md` from `references/pages/index.md` (only pages that
   exist). In `AGENTS.md` under "Where to look", add one line per page in the form
   "Changing <what> → docs/context/<page>.md". Keep `AGENTS.md` under 150 lines.
5. **Check it.** Run `node .github/hooks/scripts/context-tools.cjs check` (fix every broken anchor),
   then `node .github/hooks/scripts/context-tools.cjs readiness` and show the result.
6. **Hand over the review.** Tell the user: each page stays `draft` (counts at most 2 out of 5) until
   its owner reviews it against the code, resolves the Unverified lines, and changes the header to
   `Status: reviewed · Last verified: <date> by <name>`. A second person who did not write it can then
   set `Independent review: yes` (needed for a 5). Then run `/context-assess` for the readiness score.
   The pages are committed through a normal pull request, like code.

## Refreshing later
`/context-baseline refresh <page>`: regenerate the generated sections of that page from the code,
re-check its anchors, and list lines whose anchored code changed since `Last verified`. Change only
those; reset `Status` to `draft` for any section you rewrote, so a person reviews it again.
Day-to-day changes do not need this: stories update pages through the "Context impact" section of
their technical design and `/story-finish`.
