# Data: <repo name>
> Dimension: data · Status: draft · Last verified: never · Independent review: no · Owner: <team>

## Stores
| Store | Used for | Config | Anchor |
| --- | --- | --- | --- |
| <PostgreSQL / Redis / S3 / files> | <one line> | <config key> | [anchor: <path>] |

## Tables (generated from migrations and entities; regenerate, don't edit by hand)
Source: [anchor: <migrations folder>], [anchor: <entity package>]
| Table | Purpose | Key columns | Owning code |
| --- | --- | --- | --- |

## Relationships and constraints worth knowing
<Foreign keys, unique rules, soft deletes, audit columns, partitions, anything a new change must respect.>

## How the main flows read and write data
<For each important flow: which queries or repositories, which columns, transactions, caching.>
- <flow>: <tables and queries> [anchor: <path>]

## Migrations
<Tool, folder, naming, rules (never edit an applied migration), how to roll back.> [anchor: <path>]

## Why
<Reasons for odd columns, denormalisation, legacy tables. Only from evidence or the team.>

## Unverified
