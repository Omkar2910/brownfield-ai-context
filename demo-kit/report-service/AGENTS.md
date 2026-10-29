# report-service — agent context

Spring Boot 3 service that serves rating reports to `report-ui`. Producer of the
`/api/v1/reports/**` contract. Java 21, PostgreSQL, Aspose.Cells for Excel.

Read this file first. Load the linked docs only when the task needs them.

## Commands
- Build + unit tests: `./mvnw -q verify` [anchor: pom.xml]
- Run locally (needs local Keycloak): `./mvnw spring-boot:run -Dspring-boot.run.profiles=local`
- Integration tests only: `./mvnw -q -Pit verify`

## Rules that are not obvious from the code
- Every endpoint checks a CIAM permission via `@RequiresPermission("<CODE>")`. Never check
  Keycloak roles directly; roles are for login only. See ../system-context/context/platform/ciam-authorization.md
- Controllers stay thin: validation + mapping only. Queries live in the query layer.
  [anchor: src/main/java/com/example/report/api/ReportController.java]
  [anchor: src/main/java/com/example/report/query/ReportQueryService.java]
- Report filters are built only through `ReportFilterSpec`; never concatenate SQL. The report
  tables are partitioned by `as_of_date` and unfiltered queries time out in UAT.
- Errors use the platform error envelope (`code`, `message`, `traceId`). Do not return stack traces.
- Aspose.Cells needs the licence loaded once at startup (`AsposeLicenceConfig`); do not load it per request.
- Contract changes: update `src/main/resources/openapi/report-api.yaml` in the same PR. CI publishes
  the consumer brief to `system-context/contracts/report-service/` on merge.

## Where to look
- Architecture and module map: docs/context/architecture.md
- Known traps (read before touching queries or exports): docs/context/known-traps.md
- Current behaviour specs: ../system-context/openspec/specs/ (this repo is store-only)
- Shared platform rules and contracts: ../system-context/

## Definition of done for agent work
- `./mvnw -q verify` passes, new endpoint has an integration test with and without permission.
- If you changed a command, convention or contract, update this file or docs/context/ in the same PR.
