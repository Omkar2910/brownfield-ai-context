---
type: Context Page
status: draft
dimension: data
owner: "<team>"
verified: []
---
# Data: <repo name>

The overview of how this repo stores data. One page per table lives in `data/tables/`, with an index in
`data/index.md`, built with `node .ai-kit/context-tools.cjs schema-import` (sources: the `context-create`
skill's `references/data-sources.md`). This page explains what no single table page can.

## Stores
| Store | Used for | Config | Anchor |
| --- | --- | --- | --- |
| <PostgreSQL / Redis / S3 / files> | <one line> | <config key> | [anchor: <path>] |

## Main tables at a glance
Source: [anchor: <migrations folder>], [anchor: <entity package>]
| Table | Purpose | Owning code | Page |
| --- | --- | --- | --- |
| <table> | <one line> | <repository or entity> | [tables/<table>.md](data/tables/<table>.md) |

## Relationships and constraints worth knowing
<Foreign keys and the references that have no foreign key, unique rules, soft deletes, audit columns,
partitions: anything a new change must respect.>

## How the main flows read and write data
<For each important flow: which queries or repositories, which columns, transactions, caching.
Query constants and native SQL count: they show joins the entities do not.>
- <flow>: <tables and queries> [anchor: <path>]

## Migrations
<Tool (Flyway, Liquibase, scripts), folder, naming, baseline, rules (never edit an applied migration), how
to roll back.> [anchor: <path>]

## Data owned elsewhere
<Tables this repo reads but another service owns, and where their pages live (product hub or data catalogue).>

## Why
<Reasons for odd columns, denormalisation, legacy tables. Only from evidence or the team.>

## Unverified
