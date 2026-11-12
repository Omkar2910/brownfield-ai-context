# Architecture: <repo name>
> Dimension: architecture · Status: draft · Last verified: never · Independent review: no · Owner: <team>

## Purpose and boundaries
<What this repo does, what it deliberately does not do, who uses it.>

## Modules and layers
| Module / package / folder | Responsibility | Anchor |
| --- | --- | --- |
| <name> | <one line> | [anchor: <path>] |

## How a typical request flows
<Numbered steps from the entry point to the response, one line each, each anchored.
UI repo: route → component → service → HTTP call → state update.>
1. <step> [anchor: <path>]

## Integrations
| System | Direction (calls / called by) | How (REST, events, files, DB) | Anchor |
| --- | --- | --- | --- |

## Most-connected parts (generated from the code map: `graphify god-nodes`)
<Top 5–10 classes or components, one line each on why everything depends on them.>

## Why it is like this
<Only reasons found in code comments, commit messages, existing docs or stated by the team.
Bigger decisions get a page in decisions/.>

## Unverified
<Anything you could not prove from the code. A reviewer confirms or deletes each line.>
