# Platform rules: micro-frontends

> Template. Replace each rule with what is true in your platform, delete what does not apply, keep the reasons.
> Each repo's AGENTS.md links here instead of copying these rules.

## Shell and remotes
- The shell (`shell-app`) owns login, layout, top-level routing and the list of remotes it loads.
  A new remote or a new top-level route needs a change in the shell. Why: the shell is the only place
  that knows which remotes exist.
- A remote exposes only what is listed under "exposes" in `catalog.json` (for example a routes module).
  Changing an exposed name or path breaks the shell at runtime, not at build time.
- Remotes never import code from other remotes. Shared code goes into `ui-shared-lib`.

## Shared dependencies
- Angular, RxJS and `ui-shared-lib` are shared as singletons with the versions pinned in the shell.
  A remote that upgrades one of these alone can load two copies or fail at runtime.
- Upgrades of shared dependencies are a cross-repo initiative (shell first, then each remote).

## Communication between micro-frontends
- Remotes talk to each other only through the shared event bus or the URL, never through global variables.
- Event names and payloads are a contract: list them in `context/platform/events.md` (create it when the
  first event is added).

## Authentication and calls to the backend
- Remotes get the user's token through the interceptor in `ui-shared-lib`; they never read tokens themselves.
- Each remote calls only the services listed under "calls" for it in `catalog.json`. A new dependency is
  added to the catalog in the same change.
- Show or hide actions by permission (from the authorization service), never by login roles.
