---
name: cross-repo-story
description: Plan and run a story that touches several repos (micro-frontends, shell, backend services, shared libraries) using the product context hub. Use when a story spans more than one repo, changes an API that other repos call, or when asked to "plan this across repos".
---

# Cross-repo story

Goal: one agreed plan for the whole story, then a normal, small change in each repo, in the right order.

## Steps
1. **Read the story** (from the Azure DevOps tool if connected, otherwise ask the user to paste it).
2. **Find the repos.** Read `catalog.json` and `context/system-map.md` in the hub. List the repos the
   story touches and why. For each service whose API changes, run `node scripts/hub.mjs impact <service>`
   to find every micro-frontend that calls it, and say whether each is affected.
3. **Check the window.** If a needed repo is not open in this VS Code window, tell the user to run
   `node scripts/hub.mjs workspace <repos or area>` in the hub and open the generated workspace file.
4. **Agree the contract first.** For every API change, write request and response examples and the
   permission it needs. For micro-frontend changes, list exposed routes/modules, shared dependencies and
   events that change. Read `context/platform/` for the rules that apply.
5. **Write the initiative note** `initiatives/<change-id>.md` from `initiatives/_template.md`: repos in
   order (services and libraries first, then micro-frontends, then the shell), the contract, platform
   items, impact. Use one change id for the whole story. Ask the user to review it with the tech lead.
6. **Per repo, in order:** in that repo, follow the `story-to-change` skill and then `/opsx-propose <change-id>`
   (OpenSpec creates the change in the repo whose folder the command runs in; say "create the change in
   <repo>"). Each repo's own AGENTS.md and rules apply. Do not change two repos in one step.
7. **After each merge:** update the initiative table (PR link, status). After a service merge, run
   `node scripts/hub.mjs contracts --sync` in the hub and commit the updated contract copy.
8. **Finish:** every repo's change archived, the catalog updated if a dependency was added or removed
   (then `node scripts/hub.mjs map`), the initiative marked done.
