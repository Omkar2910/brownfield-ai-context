---
name: context-update
description: Bring AI-agent context up to date - after code changes, before archiving an OpenSpec change, when the context check reports broken or stale anchors, after a kit upgrade (page format) or after a migration (table pages). Changes only the lines whose facts changed. Use when asked to "update context", "refresh context", "fix stale anchors", "refresh the data pages" or "the kit was upgraded".
---

# Context update

Goal: change only the context lines whose facts changed. Never rewrite context files wholesale.

## Steps
1. **Format first (no AI needed).** Run `node .ai-kit/context-tools.cjs migrate --dry-run`. If it lists
   pages, run it without `--dry-run`: it converts pages to the current kit format and changes nothing
   else. Mention it in the summary.
2. **Code map.** If `graphify-out/graph.json` exists, run `graphify update .` (local, no API key). For a
   moved or renamed class, `graphify query "<old name>"` helps find where it went.
3. **Table pages.** If `docs/context/data/schema.sql` (or `schema.json`) exists, run
   `node .ai-kit/context-tools.cjs schema-import <file>` whenever the check says pages are out of date or
   the code changed entities, queries or migrations; ask the user for a newer export after a migration.
   Only the generated parts change, and the diff shows what moved. Never edit between the markers.
   Pages it lists as "no longer in the schema" and lines under "Code and schema disagree" need a decision
   from the user.
4. **Find what is out of date.** Run `node .ai-kit/context-tools.cjs check --base origin/<main-branch>`
   (ask for the branch if unsure; `main`, `master` and `develop` are common). ERROR: an anchor points at a
   file that no longer exists. WARN: a page names code (in backticks) that this branch removed, or anchored
   code changed but the context file did not. `node .ai-kit/context-tools.cjs names` lists every name the
   code no longer has, on this repo's pages and, in a product workspace, the home repo's.
   With `<page>` given (`/context-update data`), also list lines in that page whose anchored code changed
   since its `verified` date (`git log --since=<date> -- <anchored paths>`).
5. **Read the story, if there is one.** If the user names an OpenSpec change, read its `proposal.md` and
   `design.md` ("Context impact" table first).
6. **Decide each finding.** Open the code and either update the line (the fact changed), rename the name or
   move the anchor (the code moved, the fact is the same), delete the line (no longer true or needed), or
   leave it (still true; say so). A finding on a home-repo page goes into a pull request in the home repo. Add a new line only if it passes the `context-create` skill's
   `references/prune-checklist.md`.
7. **Review state.** A reviewed page whose lines you rewrote goes back to `status: draft`, and its owner
   runs `node .ai-kit/context-tools.cjs review <page> --by <name>` in their own terminal after checking it.
   Never run `review` or write a `verified` entry yourself.
8. Run the check again until there are no ERROR lines.

**Product workspace:** when this repo has no `.ai-kit/context-tools.cjs`, the tool is in the home repo:
run `node <home>/.ai-kit/context-tools.cjs <command> --repo <this repo>` instead.

## Finish
End your reply with this block, filled in:
- **What changed:** each edit as `file: old → new (reason)`, plus migrated pages and refreshed table pages.
- **Checks:** `check` before and after (errors, warnings).
- **Next:** commit the context edits in the same pull request as the code, and who should review them.
