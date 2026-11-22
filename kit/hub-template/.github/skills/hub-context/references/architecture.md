---
type: Context Page
status: draft
dimension: architecture
owner: "<tech lead>"
verified: []
---
# System architecture: <product>

## What the product does
<Two or three sentences for a new joiner.>

## Parts and how they fit
<The shell, each micro-frontend, each service, shared libraries, data stores and external systems, one
line each. The generated picture of who calls whom is context/system-map.md; this page explains it.>
| Part | Type | Responsibility | Repo |
| --- | --- | --- | --- |

## How a request travels
<One end-to-end example: browser → shell → micro-frontend → service → database → back, each hop with
its cross-repo anchor, e.g. [anchor: report-service:src/main/java/**/ReportController.java]>

## Shared building blocks
<Authentication (context/platform/auth.md), error format and logging (context/platform/errors-and-logging.md),
micro-frontend loading (context/platform/micro-frontends.md), shared UI library.>

## Why it is like this
<Product-wide decisions, each linked to context/decisions/.>

## Unverified
