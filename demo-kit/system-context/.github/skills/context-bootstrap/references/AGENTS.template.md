# <repo-name> — agent context

<One or two sentences: what this service does, who calls it, main stack.>

Read this file first. Load the linked docs only when the task needs them.

## Commands
- Build + unit tests: `<command>` [anchor: <build file>]
- Run locally: `<command>`
- Other checks: `<lint / integration tests>`

## Rules that are not obvious from the code
- <Rule>. <Why, in one clause.> [anchor: <path>]
- <Platform rule that applies here>: see ../system-context/context/platform/<file>.md
- <Generated code / files never to edit by hand>

## Where to look
- Architecture and module map: docs/context/architecture.md
- Known traps: docs/context/known-traps.md
- Behaviour specs: <openspec location>
- Shared platform rules and contracts: ../system-context/

## Definition of done for agent work
- <tests/lint that must pass>
- If you changed a command, convention or contract, update this file or docs/context/ in the same PR.
