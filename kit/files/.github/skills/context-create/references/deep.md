# Context create: deep

Goal: a reviewed, traceable reference of how this repo works, one page per dimension, that people read
and agents open only when a task needs it. It is never loaded on every request: `AGENTS.md` stays short
and only links here.

## Before you start
- `AGENTS.md` must exist (run `/context-create` quick first). Deep pages add depth; they do not replace it.
- Refresh the code map if Graphify is installed: `graphify update .`
- Older documentation is a SOURCE, never copied: every line you keep must be confirmed in today's code.

## 0. Discovery pass (notes only, not committed)
Before writing any page, look at the whole repo once, in this order, and keep short notes in the chat:
1. **Stack:** languages, frameworks, build tool, test tools, main libraries (build files).
2. **File categories:** what kinds of files exist and where (controllers, services, repositories,
   entities, migrations, components, routes, tests, config), with counts.
3. **Domains:** the business areas the code is organised around, and the main classes of each.
4. **Style per file kind:** how each category is usually written (naming, error handling, tests).
These notes decide which pages to write and feed the rule files (one per file kind). If an earlier
generated analysis exists (for example a results folder from another tool), use it as this pass's input,
and keep only what today's code confirms.

## 1. Plan the pages (templates in `pages/`)
- Service: architecture, domain, data, api, dependencies, security, testing, operations.
- UI / micro-frontend: architecture, domain, screens, api (calls it makes), dependencies, security,
  testing, operations. Data only if it stores data itself.
- Library: architecture, domain (what it offers), dependencies, testing.
Show the list and ask: which screens, flows or rules matter most, and who owns each page. Then work through
the pages one at a time: architecture, domain (and screens), data, api, dependencies, security; then
testing, operations, decisions. With `deep <page>`, do only that page.

## 2. For each page, gather evidence first, then write
- Architecture: layout, entry points, `graphify god-nodes`, `graphify query` for the main flows,
  integration clients and config.
- Domain and screens: services named after business concepts, validation and calculation code, enums and
  status lifecycles, `openspec/specs/`, routes and components, how form fields map to API fields and columns.
- Data: follow `data-sources.md`. Overview page from `pages/data.md`. In this order:
  0. **Which schemas this repo owns.** Run `node .ai-kit/context-tools.cjs schemas` (in a product workspace,
     the home repo's copy with `--repo .`): per schema, which repo's migrations change it and which repos
     only read it. Show it and ask the user to confirm. Pages and an export only for the schemas this repo
     changes, one folder each when there are several (`docs/context/data/<schema>/schema.sql`, imported with
     `--out docs/context/data/<schema>`). A schema another repo changes: no copy here; name the tables this
     repo reads in its data overview and link to the owner's pages. A schema several repos change: its
     export and pages go once in the home repo (the `product-context` skill). In a workspace, record the
     result with `schemas --write` in the home repo.
  1. Find the schema file. Look for `docs/context/data/schema.sql` or `schema.json` first, then for other
     `.sql` files with `CREATE TABLE` outside the migrations folder. If you find none, ask the user once:
     "Do you have a schema export (a DDL .sql dump or a tbls schema.json)? If yes, tell me where it is, or
     put it at docs/context/data/schema.sql. If not, I'll work from migrations and entities only (how to
     export one: data-sources.md)." If they give a path elsewhere, suggest moving it to
     `docs/context/data/schema.sql` so the pages can anchor to it.
     Then run `node .ai-kit/context-tools.cjs schema-import <file>`. It writes `data/tables/<table>.md` and
     `data/index.md`, and reads the code itself: JPA entities and their columns, Spring Data repositories,
     SQL in strings and MyBatis mappers, migrations, references that exist only as `@JoinColumn`, and
     allowed values from Java enums (it flags enums stored as numbers). Never edit between the
     `generated` markers: run the import again instead.
  2. Read the import's output. **"Code and schema disagree"** lines are real findings (an entity maps a
     column or table the export does not have): show them to the user; either the code is wrong or the
     export is old. Do not hide them.
  3. Ask the user, in one message, only the **"Questions for people"** the import printed (references
     without a foreign key that the code does not explain), plus what the main status values mean and
     which flows write each main table. Write the answers into "Meaning" and "Rules and traps"; anything
     not confirmed goes under "Unverified". Fill "Other code that reads or writes it" only with what the
     generated part cannot show (other services, batch jobs, reports, code in other languages), with anchors.
  4. In `data.md`, link each table to its page and describe how the main flows read and write data, with
     anchors. Make sure `AGENTS.md` has "Changing tables, queries or migrations → docs/context/data.md".
     If the repo has no data-access rule file, create it from `instructions-examples.md` ("Data access"),
     so agents open the table page whenever they touch entities, repositories or migrations.
  5. Run `check` (0 errors) and `pages-for <an entity or repository>` to show the links work, and
     `doctor` for the data line (pages, pages linked to code, rule file).
  Without a schema file (the user has none), write table pages only for the main tables, from migrations,
  entities and query constants, and say in the Finish block that a schema export would make them exact.
  From then on the commit check, CI and the agent hooks say when a table page no longer matches the
  schema file or the code, and the fix is always to run the import again, never to edit the generated part.
- API: the OpenAPI file or controllers and DTOs (generate the endpoint table from them), HTTP clients for
  outbound calls, the error handler.
- Dependencies: the build file (versions stay there), internal libraries, config for services and
  infrastructure, `node <hub>/scripts/hub.mjs impact <repo>` if a product hub is cloned.
- Security: security config, token handling, permission checks, logging of personal data.
- Testing: test folders, frameworks, fixtures, the commands in `AGENTS.md`.
- Operations: profiles and config, pipeline files, scheduled jobs, logging setup.
- Decisions: one page per real decision found (comments explaining a choice, commit messages, archived
  `design.md` files), from `pages/decision.md`, in `docs/context/decisions/`.

## 3. Writing rules for every page
- **If the page already exists, update it; never start it again from the template.** Keep what is there,
  correct what the code or schema shows is wrong, add what is missing, and show the diff before saving.
  The same goes for table pages: only the part between the `generated` markers belongs to the import.
- Save as `docs/context/<page>.md`. Keep the template's frontmatter: `status: draft`, `verified: []`, and the
  owner the user named.
- Every statement about the code ends with `[anchor: <path>]` (a file, folder or glob). A section whose
  rows all come from one source can carry one `Source: [anchor: …]` line instead.
- Sections marked "generated" list what the code contains, not prose. Name the source.
- Write the "why" only from evidence (comments, commit messages, docs) or the user. Everything you believe
  but cannot prove goes under `## Unverified`, never in the main text.
- Do not repeat `AGENTS.md`, the build file or the API file; point at them.
- 60–250 lines per page. A flow that needs more becomes `docs/context/areas/<area>.md` (template: the
  `story-finish` skill's `area-page.template.md`).
- Show each finished page to the user before starting the next.

## 4. Index, check, hand over the review
- Create `docs/context/README.md` from `pages/index.md` (only pages that exist). In `AGENTS.md` under
  "Where to look", add one line per page: "Changing <what> → docs/context/<page>.md". Keep `AGENTS.md`
  under 150 lines.
- Run `node .ai-kit/context-tools.cjs check` (fix every broken anchor), then `readiness`.
- Each page stays `draft` (counts at most 2 out of 5) until its owner reviews it against the code and
  resolves the Unverified lines. The owner then runs, in their own terminal,
  `node .ai-kit/context-tools.cjs review <page or folder> --by <name>`: it sets `status: stable`, adds the
  review entry, removes unused template lines, and refuses pages with broken anchors or no "Meaning". A
  second person who did not write the page runs it too (needed for a 5). **Never run `review` yourself**,
  and never write a `verified` entry: a review is a person's statement. Pages go through a normal pull
  request, like code.

**Product workspace:** when this repo has no `.ai-kit/context-tools.cjs`, the tool is in the home repo:
run `node <home>/.ai-kit/context-tools.cjs <command> --repo <this repo>` instead.

## Finish
End your reply with this block, filled in:
- **What changed:** each page created or edited, as a link, with its line count and Unverified count.
- **Checks:** `check` result and the readiness score and band.
- **Next:** 1) the owner reviews the draft pages and runs `review` on them; 2) the next page to write; 3)
  `/context-assess` once the pages are reviewed.
