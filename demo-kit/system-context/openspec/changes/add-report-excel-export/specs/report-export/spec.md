## ADDED Requirements

### Requirement: Excel export of a filtered report
The report service SHALL export the rows of a report that match the given filters and sort as an
.xlsx file, for users with CIAM permission `REPORT_EXPORT`.

#### Scenario: Authorised user exports filtered rows
- **WHEN** a user with `REPORT_EXPORT` requests an export of report R with asOfDate 2026-09-30 and sector BANKS
- **THEN** the service returns HTTP 200 with an .xlsx file containing only BANKS rows in the requested sort order
- **AND** the file name is `ratings-report-20260930.xlsx`

#### Scenario: User without export permission
- **WHEN** a user with `REPORT_VIEW` but without `REPORT_EXPORT` requests an export
- **THEN** the service returns HTTP 403 with code `FORBIDDEN`

### Requirement: Export size limit
The report service SHALL refuse exports of more than 50,000 rows without generating a file.

#### Scenario: Export above the limit
- **WHEN** the filters match 61,204 rows
- **THEN** the service returns HTTP 422 with code `REPORT_TOO_LARGE` and a message stating the row count and the limit
