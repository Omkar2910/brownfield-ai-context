# Plan: <!-- work item id and title -->

<!-- Used when the repo has no OpenSpec. One file, the same parts OpenSpec would produce, kept short.
     Delete any section that does not apply. -->

## Why
<!-- One or two lines: the problem or need. -->

## What changes
<!-- Bullets: behaviour, files, endpoints, components, tables. Say if an API contract or data changes. -->

## Acceptance checks
<!-- Numbered, testable: AC1 When … then …  One per acceptance criterion in the work item. -->
- AC1:

## Approach (only if it is not obvious)
<!-- How it will work, decisions and alternatives, risks. A short sequence if it crosses UI, API,
     service and database. -->

## Tasks
<!-- Ordered, producers first. For each layer: the test to write first (name it), then the code. -->
- [ ] 1.1 Test: <!-- ReportExportServiceTest#rejectsMoreThan50kRows --> (fails first)
- [ ] 1.2 Code: <!-- what to change -->
- [ ] Last: check the context lines for the files changed (`context-tools.cjs pages-for <file>`)
