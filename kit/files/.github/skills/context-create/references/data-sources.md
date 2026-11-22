# Data context: sources and how they combine

The data pages combine what the code says with what the database says. Neither is enough alone: the
code shows how tables are used, the schema shows what really exists (including columns and references
no entity maps).

| Source | What it gives | How to use it | Needs a database connection? |
| --- | --- | --- | --- |
| Migrations (Flyway, Liquibase, SQL scripts) | How the schema got here; naming rules | Read the folder; anchor the data page to it | No |
| Entities and repositories | Which code owns which table; mapped columns | Read the entity package; anchor table pages to the entity | No |
| Query constants, native SQL, views in code | Joins and filters the entities do not show | Search for SQL strings; list them under "How the main flows read and write data" | No |
| Schema file (tbls `schema.json`) | Every table, column, key, index, trigger and reference as it exists | `node .ai-kit/context-tools.cjs schema-import <schema.json>` writes the generated part of each table page | Once, by a person, with a read-only user, against a non-production database |
| Data catalogue (OpenMetadata, DataHub, Collibra, Purview, Alation) | Owners, lineage, business glossary, data classification | Link the catalogue entry from the table page; do not copy it | No (read the catalogue) |
| Database MCP server | Live answers while working | Optional, local or development databases only, read-only user | Yes |

## Rules
- The generated part of a table page (between the `generated` markers) is replaced on every import.
  Everything else on the page is written by people and kept.
- Commit the schema file next to the pages (`docs/context/data/schema.json`) only if your team allows the
  schema itself in the repo. It contains structure, never data. If it may not be committed, import from a
  local copy: the pages then say the source is outside the repo and count as untraceable.
- Never point an agent at a production database. Use a read-only role on a development or QA copy.
- Write table pages first for the tables the main flows use. Twenty good pages beat four hundred empty ones.
- A table owned by another service gets its page in that service's repo, or in the product hub. Link to it.

## Producing the schema file
1. Install tbls (a single binary: <https://github.com/k1LoW/tbls>).
2. Point it at the database with a read-only user, then write the JSON file:
   - macOS / Linux: `TBLS_DSN="postgres://<user>@<host>:5432/<db>?sslmode=require" tbls out -t json -o docs/context/data/schema.json`
   - PowerShell: `$env:TBLS_DSN="postgres://..."; tbls out -t json -o docs/context/data/schema.json`
   (or put `dsn:` in a local `.tbls.yml` that is not committed). tbls also reads MySQL, SQL Server, SQLite,
   BigQuery and others; see its README for the DSN of each.
3. Run `node .ai-kit/context-tools.cjs schema-import docs/context/data/schema.json`.
4. Repeat steps 2 and 3 after a migration; only the generated parts change, and the diff shows what moved.
