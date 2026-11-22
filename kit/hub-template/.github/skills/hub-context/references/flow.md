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
<Numbered, one line each, crossing repos. Each step anchored with repo:path.>
1. User clicks Export on the report grid. [anchor: <ui-repo>:<path>]
2. The UI calls `<METHOD /path>` with <fields>. [anchor: <ui-repo>:<path>]
3. The service checks <permission> and <rules>. [anchor: <service-repo>:<path>]
4. Data read from <tables / columns>. [anchor: <service-repo>:<path>]

## Field mapping
| Screen field | API field | Column | Notes |
| --- | --- | --- | --- |

## Rules that span repos
<Limits, validations done in both UI and service, status lifecycles. Say which repo is the authority.>

## Failure cases
<What the user sees when each hop fails.>

## Unverified
