# Organisation level: rolling the kit out across many products

For architecture and engineering-excellence groups who want every team to use the kit the same way. How the
layers fit together is in [ARCHITECTURE.md](ARCHITECTURE.md#organisation-level); this page is how to set it up
and run it.

## 1. The layers

| Layer | Holds | Lives in | Owner | Changes |
| --- | --- | --- | --- | --- |
| **Organisation** | The few rules every repo must follow; shared platforms; AI usage policy; kit version; readiness weights | One `org-context` repo | Architecture / engineering excellence | Rarely; reviewed by the owners |
| **Product** | Catalogue of repos, system architecture, end-to-end flows, glossary, product-wide platform rules | One `product-context` hub per product ([MULTI-REPO.md](MULTI-REPO.md)) | Product tech leads | When flows or contracts change |
| **Repo** | `AGENTS.md`, rule files, in-depth pages, specs, code map | Each repo | The owning team | With every PR that changes the code it describes |
| **Story** | Proposal, specs, technical design, test plan, tasks | `openspec/changes/<id>/` | Developer + reviewer | Every story |
| **Personal** | A developer's own preferences | Their VS Code profile | The developer | Any time; never team rules |

**The rule for where something goes:** put it at the lowest layer where it is true, and only once. A rule true
for every repo goes in the org layer; a flow across one product's repos goes in that product's hub; a column's
meaning goes in the repo that owns the table. Lower layers link to higher ones instead of copying them.

**When layers disagree:** VS Code loads every applicable file and defines no precedence, so contradictions are
not resolved for you. Keep org rules to things that are never overridden (security, personal data, approved
platforms). If a repo genuinely needs an exception, say so in its `AGENTS.md` with the reason and the approval,
and raise it with the org owners.

## 2. How organisation rules reach every repo

| Option | Works with Azure DevOps repos? | Reaches CI and every agent? | Visible in PRs? | Verdict |
| --- | --- | --- | --- | --- |
| GitHub organisation custom instructions | No: needs GitHub-hosted repos on Copilot Business or Enterprise, and GitHub says they don't apply to local editor sessions | No | No | Not usable for local VS Code work |
| VS Code settings pointing at a shared folder (`chat.instructionsFilesLocations`, `chat.agentSkillsLocations`) | Yes | No: per machine; other agent tools don't inherit them; the skills setting is deprecated | No | Optional convenience only |
| Personal skill folder (`~/.copilot/skills/`) | Yes | No: per machine | No | For personal skills, not team rules |
| **Copy into each repo, stamped (`install.mjs --org`)** | **Yes** | **Yes** | **Yes** | **Recommended** |

The copy is what the kit implements:

- `install.mjs <repo> --org ../org-context` copies `org-context/rules/*.instructions.md` into
  `.github/instructions/org/` (Claude Code: `.claude/rules/org/`, with `applyTo` converted to `paths`).
- Each copy carries a line naming its source: `Organisation rule from org-context @ 38f3122. Do not edit here`.
- `.github/ai-kit.json` records the org repo's path and commit, and a fingerprint of each file.
- The org's `context-readiness.json` is copied to `.github/context-readiness.json`, so every repo is scored on
  the same weights, unless the repo keeps its own.
- `context-tools check` warns when the copies are older than the local clone of the org repo, or were edited
  in the repo. The session-start note tells the agent which org rules it carries.
- The agent is told not to edit org rules, and the context-steward agent is blocked from editing them.
- `install.mjs <repo> --upgrade` re-syncs from the recorded path: new rules are added, changed ones replaced,
  withdrawn ones removed.

## 3. Setting up the organisation layer (once)

```bash
node brownfield-ai-context/kit/install.mjs --create-org ../org-context
cd ../org-context
# 1. Replace every <replace: …> in rules/ and context/ with your real platforms and policies.
# 2. Set kit.json (kit version every repo should run) and context-readiness.json (weights, band names).
# 3. List products and their hubs in products.json.
git init && git add -A && git commit -m "Organisation context"   # push to a protected Azure Repos repo
```

What the template contains:

| File | Purpose | Size guide |
| --- | --- | --- |
| `rules/org-engineering.instructions.md` | `applyTo: '**'`: secrets, personal data, identity and permission services, denied-case tests, approved libraries, agents never push | Under 40 lines: it loads in every repo on every request |
| `rules/org-api.instructions.md` | Scoped to service and UI code: error body, correlation id, versioning, dates | 10–30 lines |
| `context/platform.md` | Shared platforms (identity, permissions, logging, cloud): what each is for, how a repo uses it, owner | On demand |
| `context/ai-usage.md` | Approved agents, models and MCP servers; what may be shared; agents never push | On demand |
| `kit.json`, `context-readiness.json`, `products.json` | Kit version, scoring weights, product list | — |
| `CODEOWNERS` | Who must review changes | — |

Two rules for writing org rules:
1. **Keep them few.** Research found agents follow even simple written rules only part of the time, and every
   org line costs tokens in every repo. Ten clear rules beat fifty.
2. **Enforce what must never break.** A rule like "never log personal data" should also be a check (a lint
   rule, an architecture test, a pipeline scan). The written rule helps the agent; the check guarantees it.

## 4. Each team (once per repo)

```bash
git clone <org-context-repo-url> ../org-context            # next to your repos
node brownfield-ai-context/kit/install.mjs <repo> --graphify --org ../org-context
```

Commit the result with the rest of the kit setup. From then on, `--upgrade` re-syncs.

## 5. Keeping it current

| When | What | Who |
| --- | --- | --- |
| An org rule changes | PR in `org-context`, reviewed by the owners; announce it | Architecture group |
| After the org change merges | Each team: `git pull` in their org clone, `install.mjs <repo> --upgrade`, commit | Each team (or a scripted rollout PR per repo) |
| Every PR | `context-tools check` warns if the repo's org copies are older than the local org clone | Automatic |
| A new kit version | Change `kitVersion` in `kit.json`; teams run `--upgrade` | Engineering excellence |
| Monthly | Product tech leads run `hub.mjs status` and report each product's readiness average | Product tech leads |
| Quarterly | Org owners review org rules: still true, still needed, enforced by a check where possible | Architecture group |

## 6. Measuring across the organisation

- **Per repo:** `context-tools readiness` gives the 0–100 score, with evidence caps.
- **Per product:** `hub.mjs status` lists every repo's score and the product average.
- **Organisation:** collect the product averages each month. Report them with the story log outcomes (rework,
  review rounds, premium requests) from teams that track their stories, never on their own: the score measures
  context, not results.

## 7. Rollout plan

1. **Pilot:** one product, two or three repos, a few real stories, measured with the story log.
2. **Second pilot:** one more team, once the kit lives in an internal repository with a named owner.
3. **Org layer:** create `org-context` with the first ten rules; sync it into the pilot repos.
4. **Product hubs:** one per product that has three or more repos in regular use.
5. **Wider rollout:** teams adopt on their next story; the context check joins the PR pipeline as a warning
   first, then a required check.
