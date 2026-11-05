# <Area name>: how it works

Last verified: <date> by <name>, in story <id> · Owner: <team or person>
Behaviour (what it must do) lives in openspec/specs/<capability>/ — this page is how the code does it.

## Purpose
<One or two sentences: what this area does and who uses it.>

## Flow
<Numbered steps from the entry point to the result, one line each, each with its anchor.>
1. <UI component or caller> calls <endpoint>. [anchor: <path>]
2. <Controller> checks <permission> and calls <service method>. [anchor: <path>]
3. ...

## Rules the code enforces
<Only rules you can point at in the code or a test. One line each, with the reason if known.>
- <Rule>. <Why.> [anchor: <path>]

## Data
<Tables, files or messages read and written, with the important columns or fields.>

## Edge cases and errors
<What happens with empty, large or invalid data, timeouts, partial failure.>

## Traps
<Things that look wrong but are deliberate, or that broke before.> [anchor: <path>]

## Tests that cover it
<Test classes or spec files to run after changing this area.>

## Unverified
<Anything said in a story, ticket or by a person that the code does not show. Ask before relying on it.>
