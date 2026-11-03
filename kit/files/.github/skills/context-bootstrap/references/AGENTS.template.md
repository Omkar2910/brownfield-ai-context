# <service-name> — agent context

<What this service does and who calls it, in one or two sentences. Main stack.>

Read this file first. Open the files under "Where to look" only when the task needs them.

## Commands
- Build and unit tests: `<command>` [anchor: <build file>]
- Run locally: `<command>`
- Integration tests / lint: `<command>`

## Rules that are not obvious from the code
- <Rule>. <Why, in a few words.> [anchor: <path>]
- <Platform rule that applies here, e.g. permissions always checked through X, never through Y.>
- <Files or folders never to edit by hand, e.g. generated clients.>
- <Error/response format every endpoint must use.> [anchor: <path>]

## Where to look
- Architecture, modules and request flow: docs/context/architecture.md
- Known traps (read before changing <risky area>): docs/context/known-traps.md
- Rules per layer: .github/instructions/ (loaded automatically for matching files)
- Code map (if built): query it before reading many files — graphify MCP tools (`query_graph`,
  `get_neighbors`, `shortest_path`) or `graphify query "<question>"`. Before changing shared code,
  run `graphify affected "<ClassName>"` to see what depends on it.
- Product-wide context (system map, platform rules, API contracts), if the product has a hub:
  ../product-context/ — open it in the same VS Code window for work that crosses repos.
- Current behaviour specs: openspec/specs/
- Story workflow: /story-to-change → /opsx-propose → review → /opsx-apply → /story-finish → /opsx-archive

## Definition of done for agent work
- `<test command>` passes; new behaviour has tests.
- If you changed a command, convention, trap or contract, update this file or docs/context/ in the same change.
