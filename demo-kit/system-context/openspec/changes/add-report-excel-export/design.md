# Design: add-report-excel-export

## Context
- Grid rows come from `ReportQueryService` via `ReportFilterSpec` (report-service).
- The UI keeps `appliedFilters()` separate from form state (report-ui docs/context).
- Aspose.Cells licence is loaded once at startup; exports must not reload it.

## Goals / Non-Goals
- Goal: export exactly the applied filters and sort, up to 50,000 rows, as .xlsx.
- Non-goal: CSV/PDF formats, scheduled exports, exports above the cap (future story).

## Decisions
1. **Reuse `ReportFilterSpec`.** The export endpoint accepts the same query params as `/rows`,
   so the UI can pass `appliedFilters()` unchanged and the backend shares one validation path.
2. **Count before generate.** Run a `COUNT(*)` with the same spec; if > 50,000 return 422
   `REPORT_TOO_LARGE` before touching Aspose. Cheaper than failing mid-stream.
3. **Stream the workbook.** `ResponseEntity<StreamingResponseBody>` with Aspose's
   `LightCellsDataProvider` to avoid holding 50k rows in memory.
4. **Permission `REPORT_EXPORT`, separate from `REPORT_VIEW`.** Some viewers must not export
   (data distribution rules).

## Contract (examples)
Request:
```
GET /api/v1/reports/7f1c.../export?format=xlsx&asOfDate=2026-09-30&sector=BANKS&sort=rating,desc
Authorization: Bearer <jwt>
```
Success: `200`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`Content-Disposition: attachment; filename="ratings-report-20260930.xlsx"`

Too large:
```json
{ "code": "REPORT_TOO_LARGE", "message": "This report has 61,204 rows. Narrow the filters to 50,000 or fewer.", "traceId": "..." }
```

## Risks / Trade-offs
- Count + query doubles DB work for exports; acceptable at expected volume (< 200 exports/day).
- Permission cache (60 s) delays revocation; accepted platform-wide behaviour.
