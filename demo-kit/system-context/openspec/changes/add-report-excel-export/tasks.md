# Tasks: add-report-excel-export

## 0. Platform
- [ ] 0.1 Raise CIAM ticket to register permission `REPORT_EXPORT` (owner: Report Platform)

## 1. report-service (producer — do first)
- [ ] 1.1 Add `GET /api/v1/reports/{reportId}/export` to `src/main/resources/openapi/report-api.yaml` (version 1.5.0)
- [ ] 1.2 Add `ReportExportController` with `@RequiresPermission("REPORT_EXPORT")`, reusing `ReportFilterDto`
- [ ] 1.3 Add `ReportExportService`: count with `ReportFilterSpec`, return 422 `REPORT_TOO_LARGE` above 50,000
- [ ] 1.4 Stream workbook with Aspose.Cells `LightCellsDataProvider`; file name from `asOfDate`
- [ ] 1.5 Integration tests: with permission (200 + header), without permission (403), over cap (422)
- [ ] 1.6 Update `docs/context/architecture.md` (`export` module) and `known-traps.md` if needed

## 2. report-ui (consumer)
- [ ] 2.1 Regenerate API client from the updated consumer brief / OpenAPI
- [ ] 2.2 Add Export button to the grid toolbar behind `*hasPermission="'REPORT_EXPORT'"`
- [ ] 2.3 Call export with `appliedFilters()` and sort; save via `DownloadService.saveBlob`
- [ ] 2.4 Show error envelope `message` as a toast on 403/422
- [ ] 2.5 Tests: button hidden without permission; visible and calls export with applied filters
- [ ] 2.6 Update `AGENTS.md` if any convention changed

## 3. Close-out
- [ ] 3.1 Confirm consumer brief regenerated in `system-context/contracts/report-service/`
- [ ] 3.2 Run `scripts/check-context.sh` for both repos; fix stale anchors
