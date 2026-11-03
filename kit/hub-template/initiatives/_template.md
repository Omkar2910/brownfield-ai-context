# <change-id>: <one-line title>

- Story / work item: <ID and link>
- Owner: <name>
- Status: planning | in progress | done

## Repos and order
Producers first (services, shared libraries), then micro-frontends, then the shell.

| # | Repo | What changes | OpenSpec change | PR | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | <service> | <new or changed endpoint> | `openspec/changes/<change-id>/` | <link> | |
| 2 | <micro-frontend> | <screen or action> | `openspec/changes/<change-id>/` | <link> | |
| 3 | shell-app | <only if routes or remotes change> | | | |

## Contract
<Request/response examples for every API change. The service's OpenSpec design is the source; copy the
final version here or link to it.>

## Platform items
- [ ] New permission codes registered: <codes>
- [ ] Shared library change released: <version>

## Impact
<Output of `node scripts/hub.mjs impact <repo>` for each producer, and which callers were checked.>

## Done when
- [ ] All PRs merged in the order above
- [ ] Each repo's OpenSpec change archived
- [ ] `node scripts/hub.mjs contracts --sync` run and committed
- [ ] `catalog.json` updated if a dependency was added or removed
