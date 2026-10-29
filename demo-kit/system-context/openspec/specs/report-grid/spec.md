# report-grid Specification

## Purpose
Let analysts browse a rating report with filters, sort and paging.

## Requirements

### Requirement: Applied filters drive data requests
The grid SHALL request rows using the last applied filters and sort, not unsaved form input.

#### Scenario: User edits a filter without applying
- **WHEN** the user changes the sector filter but does not press Apply
- **THEN** paging requests keep using the previously applied filters

### Requirement: View permission
The grid SHALL be visible only to users with CIAM permission `REPORT_VIEW`.

#### Scenario: User without view permission
- **WHEN** a user without `REPORT_VIEW` opens the reports page
- **THEN** the page shows the "no access" state and makes no row requests
