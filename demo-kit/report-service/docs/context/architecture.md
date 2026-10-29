# report-service architecture (L3)

Purpose: serve paged, filtered rating reports and file exports to `report-ui`.

## Modules
| Package | Responsibility | Anchor |
|---|---|---|
| `api` | Controllers, DTOs, exception mapping | [anchor: src/main/java/com/example/report/api/ReportController.java] |
| `query` | Read-side queries using `ReportFilterSpec` | [anchor: src/main/java/com/example/report/query/ReportQueryService.java] |
| `export` | (new in REPORT-142) Excel generation with Aspose.Cells | — |
| `security` | `@RequiresPermission` aspect calling CIAM | — |

## Request flow
`report-ui` → API gateway (Keycloak token check) → `ReportController` → CIAM permission check
→ `ReportQueryService` → PostgreSQL (partitioned by `as_of_date`).

## Integrations
- Keycloak: JWT validation only (resource server). Realm and audience are config, not code.
- CIAM service: `POST /authorize` per request, cached 60 s per user+permission.
- PostgreSQL via Spring Data JPA for writes, JDBC template for heavy reads.

## Why things look odd
- Heavy reads use `JdbcTemplate`, not JPA: a 2025 incident showed Hibernate loading 200k rows
  into memory for the grid. Keep it that way.
