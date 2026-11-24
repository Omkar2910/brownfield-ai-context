# Data context: sources and how they combine

The data pages combine what the code says with what the database says. Neither is enough alone: the
code shows how tables are used, the schema shows what really exists (including columns and references
no entity maps).

| Source | What it gives | How to use it | Needs a database connection? |
| --- | --- | --- | --- |
| Migrations (Flyway, Liquibase, SQL scripts) | How the schema got here; naming rules | Read the folder; anchor the data page to it | No |
| Entities and repositories | Which code owns which table; mapped columns; references and enums the database does not declare | `schema-import` reads them and writes them into each table page (JPA in Java and Kotlin, Spring Data) | No |
| Query constants, native SQL, MyBatis mappers | Which code queries which table | `schema-import` lists the files per table; the main flows go under "How the main flows read and write data" in `data.md` | No |
| Schema file: a DDL dump (`.sql`) or a tbls `schema.json` | Every table, column, default, key, reference, index, enum value, comment and trigger as it exists | `node .ai-kit/context-tools.cjs schema-import <file>` writes the generated part of each table page | Once, by a person, with a read-only user, against a non-production database |
| Data catalogue (OpenMetadata, DataHub, Collibra, Purview, Alation) | Owners, lineage, business glossary, data classification | Link the catalogue entry from the table page; do not copy it | No (read the catalogue) |
| Database MCP server | Live answers while working | Optional, local or development databases only, read-only user | Yes |

## Rules
- The generated part of a table page (between the `generated` markers) is replaced on every import.
  Everything else on the page is written by people and kept. When only the code part changes (a new
  query, a renamed field), the owner's review still counts; when the table's structure changes, it does
  not, and the owner looks at the page again.
- The commit check, CI and the agent hooks say when pages no longer match the schema file or the code,
  and when a migration is newer than the schema file. The fix is always to run the import again.
- Commit the schema file next to the pages (`docs/context/data/schema.sql` or `schema.json`) only if your team allows the
  schema itself in the repo. It contains structure, never data. If it may not be committed, import from a
  local copy: the pages then say the source is outside the repo and count as untraceable.
- Never point an agent at a production database. Use a read-only role on a development or QA copy.
- Write table pages first for the tables the main flows use. Twenty good pages beat four hundred empty ones.
- A table owned by another service gets its page in that service's repo, or in the product hub. Link to it.

## Producing the schema file

**A DDL dump (simplest, no extra tools).** Export the schema only, no data, with a read-only user from a
development or QA database:
- `pg_dump --schema-only --no-owner --no-privileges -h <host> -U <user> <db> > docs/context/data/schema.sql`
- or your DB viewer's export: DBeaver "Generate SQL → DDL" on the schema, pgAdmin "Backup… → Only schema",
  DataGrip "SQL Scripts → Generate DDL to clipboard".

Then: `node .ai-kit/context-tools.cjs schema-import docs/context/data/schema.sql` (add `--no-code` to
skip reading the code).

The importer reads PostgreSQL DDL (simple MySQL and SQL Server `CREATE TABLE` statements mostly work):
tables, columns, defaults, keys, foreign keys, unique and check constraints, indexes, comments, views,
enum types and triggers. It skips Flyway and Liquibase history tables, never runs any SQL, and reports
statements it did not understand.

**A tbls `schema.json`** (when you can connect tbls to a database):
- macOS / Linux: `TBLS_DSN="postgres://<user>@<host>:5432/<db>?sslmode=require" tbls out -t json -o docs/context/data/schema.json`
- PowerShell: `$env:TBLS_DSN="postgres://..."; tbls out -t json -o docs/context/data/schema.json`

**Pages that already exist** (for example written by `/context-create deep`): a page named
`tables/<table>.md` or `tables/<schema>.<table>.md` keeps every word; the importer adds a "Generated from the
schema" section to it. Its earlier review stops counting (the page changed), so the owner looks at it again.

**What it reads from the code** (without running it; test code is left out): JPA entities (`@Entity`,
`@Table`, `@Column`, `@JoinColumn`, `@Enumerated`, fields from a `@MappedSuperclass`) in Java, and in Kotlin
with their constructor properties; Spring Data repositories; table names in SQL strings, native queries
and MyBatis mapper XML; migrations (Flyway SQL and Java, Liquibase XML and YAML). It cannot see jOOQ,
`JdbcTemplate` calls that build table names at run time, or other services: people add those under
"Other code that reads or writes it".

**After a migration:** once it has run on your local or development database, export again over the same
file and import again. Only the generated parts change. The commit check reminds you when a migration
changed and the schema file did not.
