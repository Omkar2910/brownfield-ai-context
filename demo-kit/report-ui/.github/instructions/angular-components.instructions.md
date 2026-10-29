---
name: 'Angular components'
description: 'Use when creating or changing Angular components, templates or component tests in report-ui.'
applyTo: '**/src/app/**/*.{ts,html}'
---
# Angular components in report-ui

- Standalone components only; `ChangeDetectionStrategy.OnPush` always.
- State: signals. Derive with `computed()`; side effects in `effect()` only for DOM/IO.
- Permission-gated UI uses the `*hasPermission="'CODE'"` structural directive, which wraps
  `PermissionService`. Do not inject `KeycloakService` into feature components.
- File downloads: use `DownloadService.saveBlob(response, fallbackName)`; it reads
  `Content-Disposition` and handles IE-safe names.
- Tests: Angular Testing Library; one test per permission state for gated actions.
