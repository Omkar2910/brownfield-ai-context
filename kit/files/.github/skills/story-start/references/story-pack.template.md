# <Work item id>: <title>

<3–5 line summary of the story in your own words.>

**Acceptance criteria**
- AC1 <…>
- AC2 <…>

**Size:** <tiny | small | normal> · **Repos that change, in order:** 1. <service-repo> 2. <ui-repo>
**Change id:** `<48213-verb-noun>` (same in every repo)

## 1. <service-repo> (producer: plan and build first)

| File | Change | Why |
| --- | --- | --- |
| [ReportController.java](<service-repo>/src/main/java/.../ReportController.java) | New endpoint `GET /reports/{id}/export` | AC1 |
| [ReportExportService.java](<service-repo>/src/main/java/.../ReportExportService.java) | Row limit check | AC2 |

**Dependents to test** (from `graphify affected`): [ScheduledExportJob.java](<…>), [ReportServiceTest.java](<…>)
**Rules and traps that apply:** <AGENTS.md line or rule file, linked> · <known trap, linked>
**API contract after this change:** <endpoint, request, response, errors> (the UI section uses this)

## 2. <ui-repo> (consumer: plan after the service plan is approved)

| File | Change | Why |
| --- | --- | --- |
| [report-detail.component.ts](<ui-repo>/src/app/.../report-detail.component.ts) | Export button, loading and error states | AC1, AC2 |
| [report.service.ts](<ui-repo>/src/app/.../report.service.ts) | Call the new endpoint | AC1 |

**Dependents to test:** <…>
**Rules and traps that apply:** <…>

## Context read
- <page, linked> — named by `pages-for` for <file> | from the AGENTS.md index for <topic>

## Read only (no change)
- <repo>: <file, linked> — <why it matters, e.g. shared DTO or an example to follow>

## Connected but not open
- <repo>: <how it connects, e.g. "calls GET /reports/{id}" or "loaded by the shell"> — <affected or not, and why>
  (Source: <config or client file, linked> or `hub.mjs impact`)

## Open questions
1. <question> — <who can answer>

## Next steps
1. In <service-repo>: `/opsx-propose <change-id>` → choose **continue** → review the plan.
2. After approval, in <ui-repo>: `/opsx-propose <change-id>`, using the service's `design.md` for the API.
