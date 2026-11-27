---
type: Context Page
status: draft
dimension: domain
owner: "<team>"
verified: []
---
# Flow: <name, e.g. Export a report to Excel>

Who uses it: <role> · Repos involved, in order: <reports-mfe → report-service → database>
Behaviour specs: <repo>/openspec/specs/<capability>/ for each repo

## Steps
<Numbered, one line each, crossing repos. Each step names the code in backticks: component, endpoint, class,
event, table and column. The checks warn when a repo's change removes one of them.>
1. <ui-repo>: the user clicks Export in `ReportGridComponent`.
2. <ui-repo> calls `<METHOD /path>` with <fields> through `ReportApiService.export`.
3. <service-repo>: `ReportExportService.export` checks <permission> and <rules>.
4. <service-repo> reads `<table>.<column>`, then publishes `<EventName>`; <other-repo> listens for it.

## Field mapping
| Screen field | API field | Column | Notes |
| --- | --- | --- | --- |

## Rules that span repos
<Limits, validations done in both UI and service, status lifecycles. Say which repo is the authority.>

## Failure cases
<What the user sees when each hop fails.>

## Unverified
