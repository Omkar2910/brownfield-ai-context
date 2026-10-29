# report-query Specification

## Purpose
Serve paged, filtered rows of a rating report to authorised users.

## Requirements

### Requirement: Paged filtered report rows
The service SHALL return report rows filtered by `asOfDate` and optional sector, rating and
outlook filters, sorted by the requested column, in pages of at most 500 rows.

#### Scenario: Analyst requests first page
- **WHEN** a user with permission `REPORT_VIEW` requests page 0 of report R for asOfDate 2026-09-30
- **THEN** the service returns at most 500 rows matching the filters and the total row count

#### Scenario: Missing as-of date
- **WHEN** a request omits `asOfDate`
- **THEN** the service returns HTTP 400 with code `AS_OF_DATE_REQUIRED`

### Requirement: Permission check
The service SHALL reject report requests from users without CIAM permission `REPORT_VIEW`.

#### Scenario: User without permission
- **WHEN** a user without `REPORT_VIEW` requests report rows
- **THEN** the service returns HTTP 403 with code `FORBIDDEN`
