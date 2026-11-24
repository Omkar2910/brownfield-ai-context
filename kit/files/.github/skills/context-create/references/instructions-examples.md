# Examples of scoped instruction files

Copy the shape, not the content. Every rule must come from this repository's code or from the user.

## Spring Boot controllers — `.github/instructions/controllers.instructions.md`

```markdown
---
name: 'REST controllers'
description: 'Use when creating or changing REST controllers or request/response DTOs.'
applyTo: '**/src/main/java/**/controller/**/*.java'
---
# Controllers

- Every handler declares its permission with `@RequiresPermission("<CODE>")`; the ArchUnit test
  `SecurityRulesTest` fails without it. [anchor: src/test/java/**/SecurityRulesTest.java]
- Return DTOs, never JPA entities (lazy-loading errors reach Jackson).
- Errors go through `ApiExceptionHandler` so every response uses the standard error body.
- Large downloads stream with `StreamingResponseBody`; byte arrays have caused out-of-memory errors.
```

## Database migrations — `.github/instructions/migrations.instructions.md`

```markdown
---
name: 'Database migrations'
description: 'Use when adding or changing tables, indexes or migration scripts.'
applyTo: '**/src/main/resources/db/migration/**'
---
# Migrations

- Never edit an applied migration; add a new versioned file.
- Large tables: create indexes in a separate migration, outside a transaction.
```

## Data access — `.github/instructions/data-access.instructions.md`

Loads when the agent touches entities, repositories or migrations, so it opens the table page first and
keeps it current. (Claude Code: `.claude/rules/data-access.md` with `paths:` instead of `applyTo`.)

```markdown
---
applyTo: '**/src/main/java/**/{entity,entities,model,domain,repository,repositories}/**/*.java,**/src/main/resources/db/**'
---
# Data access
- Before changing a table, entity, repository or query, open its page in docs/context/data/tables/ (list:
  docs/context/data/index.md). Respect its "Rules and traps" and "Allowed values".
- After a migration, the schema file docs/context/data/schema.sql is exported again and
  `node .ai-kit/context-tools.cjs schema-import docs/context/data/schema.sql` refreshes the pages.
- If the change alters what a table page says (meaning, rules, which code uses it), update that page in
  the same change.
```

## Angular components — `.github/instructions/angular-components.instructions.md`

```markdown
---
name: 'Angular components'
description: 'Use when creating or changing Angular components, templates or component tests.'
applyTo: '**/src/app/**/*.{ts,html}'
---
# Components

- Standalone components with OnPush change detection.
- Call the backend only through the generated API client in `src/app/api/` (never edit it by hand).
- Show or hide actions by permission with the `*hasPermission` directive, not by login roles.
- One test per permission state for every permission-gated action.
```

## Micro-frontend remote — `.github/instructions/federation.instructions.md`

```markdown
---
name: 'Micro-frontend boundaries'
description: 'Use when changing exposed modules, routes, federation config, shared dependencies or cross-app events.'
applyTo: '**/{federation.config.js,webpack.config.js,module-federation.config.ts,src/app/app.routes.ts}'
---
# Micro-frontend boundaries

- This remote exposes `./ReportsRoutes`; the shell loads it by that exact name. Renaming it breaks
  the shell at runtime, not at build time. [anchor: federation.config.js]
- Angular, RxJS and the shared library are singletons with versions pinned by the shell; do not
  upgrade them here alone.
- Never import from another remote. Send events through the shared event bus (see
  ../product-context/context/platform/micro-frontends.md).
```

Tips: keep `applyTo` tight so rules only load where they apply. Do not use `applyTo: '**'` for long files.
