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

Tips: keep `applyTo` tight so rules only load where they apply. Do not use `applyTo: '**'` for long files.
