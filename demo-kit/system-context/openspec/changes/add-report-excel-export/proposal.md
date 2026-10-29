# Proposal: add-report-excel-export (REPORT-142)

## Why
Analysts copy grid pages into Excel by hand to share reports offline. It is slow and error-prone,
and they often copy the wrong filters. REPORT-142 asks for a one-click Excel export of exactly
what the grid shows.

## What Changes
- **report-service (producer):** new endpoint `GET /api/v1/reports/{reportId}/export?format=xlsx`
  using the same filters as `/rows`, guarded by new CIAM permission `REPORT_EXPORT`.
  Over 50,000 rows returns 422 `REPORT_TOO_LARGE`. Streams the file; name
  `ratings-report-<yyyyMMdd>.xlsx` from `asOfDate`.
- **report-ui (consumer):** Export button on the grid toolbar, visible only with `REPORT_EXPORT`,
  sends the grid's *applied* filters and sort; shows the error `message` as a toast.
- **Contract:** additive. OpenAPI minor version bump 1.4.0 → 1.5.0; consumer brief regenerated.
- **Platform:** register CIAM permission `REPORT_EXPORT` (platform ticket, task 0).

## Impact
- Affected repos: report-service, report-ui. No breaking change for other consumers.
- Affected specs: `report-export` (new, report-service), `report-grid` (modified, report-ui).
- Risk: large exports and memory. Mitigated by the row cap and streaming (see design.md).
