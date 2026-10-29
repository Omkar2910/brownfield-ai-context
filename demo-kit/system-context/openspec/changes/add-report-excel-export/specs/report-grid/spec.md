## ADDED Requirements

### Requirement: Export applied view to Excel
The grid SHALL offer an Export action that downloads the report as Excel using the last applied
filters and sort, shown only to users with CIAM permission `REPORT_EXPORT`.

#### Scenario: User with export permission exports
- **WHEN** a user with `REPORT_EXPORT` applies sector BANKS and presses Export
- **THEN** the UI requests the export with the applied filters and sort and saves the returned file

#### Scenario: User without export permission
- **WHEN** a user without `REPORT_EXPORT` opens the grid
- **THEN** the Export action is not shown

#### Scenario: Export too large
- **WHEN** the export request returns 422 `REPORT_TOO_LARGE`
- **THEN** the UI shows the error message as a toast and keeps the grid unchanged
