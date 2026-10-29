# report-ui architecture (L3)

## Feature layout
| Folder | What | Anchor |
|---|---|---|
| `core/auth` | Keycloak bootstrap, `PermissionService`, `hasPermission` directive | [anchor: src/app/core/auth/permission.service.ts] |
| `api` | Generated client for report-service (do not edit) | — |
| `reports/report-grid` | Grid, filters, sort, paging (signal store) | [anchor: src/app/reports/report-grid/report-grid.component.ts] |
| `shared/notify` | Toasts for errors and success | — |

## Data flow
Grid filter change → signal store → generated client `GET /reports/{id}/rows` → grid render.
Permissions are fetched once after login (`GET /ciam/permissions/me`) and cached in `PermissionService`.

## Why things look odd
- The grid store keeps the *last applied* filters separately from the form state, because
  exports and paging must use applied filters, not half-typed ones. Exports read `appliedFilters()`.
