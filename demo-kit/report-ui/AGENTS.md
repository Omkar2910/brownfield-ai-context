# report-ui — agent context

Angular 18 app (standalone components, signals) for credit analysts. Consumer of
`report-service` `/api/v1/reports/**`. Auth via Keycloak (keycloak-angular), permissions via CIAM.

Read this file first. Load the linked docs only when the task needs them.

## Commands
- Install: `npm ci` [anchor: package.json]
- Unit tests: `npm test -- --watch=false`
- Lint: `npm run lint`

## Rules that are not obvious from the code
- Never call `report-service` with `HttpClient` directly from components. Use the generated
  client in `src/app/api/` (regenerated from the contract; do not hand-edit).
- Show or hide actions with `PermissionService.has('<CIAM_CODE>')`, never with Keycloak roles.
  [anchor: src/app/core/auth/permission.service.ts]
- The report grid owns filter and sort state in a signal store; read it, do not copy it.
  [anchor: src/app/reports/report-grid/report-grid.component.ts]
- Backend errors arrive in the platform envelope (`code`, `message`, `traceId`). Show `message`
  in a toast via `NotifyService`; log `traceId`.
- Contract source of truth: ../system-context/contracts/report-service/ — read the consumer brief
  before calling a new endpoint.

## Where to look
- Frontend architecture and state: docs/context/frontend-architecture.md
- Current behaviour specs: ../system-context/openspec/specs/ (this repo is store-only)
- Platform rules (auth, permissions): ../system-context/context/platform/

## Definition of done for agent work
- Unit tests + lint pass; new UI action has a test for both permission states.
- If you changed a command, convention or contract usage, update this file in the same PR.
