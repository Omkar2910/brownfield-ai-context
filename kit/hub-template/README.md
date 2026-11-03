# Product context hub (template)

One small repo per product that holds the context shared by all its micro-frontends and services.
Full explanation: `MULTI-REPO.md` in the kit repository.

## Create it (30 minutes)
1. Create an empty repo, for example `product-context`, next to your other repos.
2. Copy everything in this folder into it.
3. Edit `catalog.json`: one entry per repo (micro-frontend shell, remotes, services, shared libraries)
   with its owner, areas, what it exposes or its API, and what it calls or uses.
4. Replace the templates in `context/platform/` with your real platform rules (keep them short).
5. Run `node scripts/hub.mjs map` and commit everything.
6. Add the hub to each repo's AGENTS.md "Where to look":
   `Product-wide context (system map, platform rules, contracts): ../product-context/`

## Use it
| When | Command (run in the hub) |
| --- | --- |
| Starting a story that touches several repos | `node scripts/hub.mjs workspace <area or repos>` then open the file in `workspaces/` |
| Before changing a service API | `node scripts/hub.mjs impact <service>` |
| New teammate | `node scripts/hub.mjs clone <area> --run` then the workspace command |
| After a service's API change merges | `node scripts/hub.mjs contracts --sync`, commit |
| Weekly | `node scripts/hub.mjs status` |
| After adding or removing a repo or dependency | edit `catalog.json`, `node scripts/hub.mjs map` |

## Layout
```
catalog.json              repos, owners, areas, dependencies (source of truth)
context/system-map.md     generated: tables, dependency matrix, diagram
context/platform/         rules every repo follows (auth, micro-frontends, errors)
contracts/<service>/      copies of each service's API contract
initiatives/              one note per cross-repo story
workspaces/               generated VS Code workspace files (one per story or area)
.github/skills/           cross-repo-story skill (loaded when the hub is open in the window)
scripts/hub.mjs           the helper (Node 18+, no dependencies)
```
