---
name: context-bootstrap
description: Create or rebuild AI-agent context for an existing (brownfield) repo - AGENTS.md, scoped .instructions.md rules and docs/context pages. Use when asked to "create context", "bootstrap context", "generate AGENTS.md" or "make this repo agent-ready".
---

# Context bootstrap

Goal: a SMALL, accurate context set that tells an agent only what it cannot work out from the
code in a minute. Research shows bloated or generic context files lower agent success and raise
cost by 20%+, so pruning is the main job, not writing.

## Inputs
- Target repo root (ask if unclear).
- Optional: Graphify output (`graphify-out/`), the repo's OpenAPI files, existing README/docs.

## Steps

1. **Inventory facts (do not write prose yet).**
   - Build/test/lint/run commands from build files and CI config. Run each one to confirm it works.
   - Module/package layout from the code graph or directory listing (for your own use only).
   - External integrations: auth, databases, queues, other services, from config and clients.
   - Existing docs that are still true.
2. **Find the non-obvious.** Look for and list:
   - Conventions the code follows that a newcomer would break (layering, error envelope, naming).
   - "Why" behind odd code: comments with WHY/HACK/NOTE, ADRs, incident references.
   - Platform rules from `system-context/context/platform/` that apply here (link, do not copy).
   - Traps: timeouts, size caps, time-zone rules, caches, licences, generated code not to edit.
3. **Draft with the templates** in `references/`:
   - `AGENTS.md` from `references/AGENTS.template.md` — under 100 lines.
   - 2–4 `.github/instructions/*.instructions.md` files, one per layer/framework, each with a tight `applyTo`.
   - `docs/context/architecture.md` and `docs/context/known-traps.md`.
   - `CLAUDE.md` containing only `@AGENTS.md`.
4. **Prune with `references/prune-checklist.md`.** Delete every line that fails it. Report the
   before/after line counts.
5. **Anchor.** Add `[anchor: <path or glob>]` after each fact that depends on a file, so
   `scripts/check-context.sh` can detect drift.
6. **Hand back for review.** Output a summary: files created, line counts, open questions for the
   tech lead (things you could not verify). Never invent commands or rules you did not see.

## Do not
- Do not include directory trees, dependency lists, or anything a grep finds quickly.
- Do not copy platform rules into the repo; link to `system-context`.
- Do not write OpenSpec specs for code nobody is changing.
