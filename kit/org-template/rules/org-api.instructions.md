---
applyTo: '**/*.{java,kt,ts}'
description: Organisation API rules for services and the UIs that call them
---
# Organisation API rules

- Errors use the standard error body: <replace: fields, e.g. code, message, correlationId>.
- Every request and log line carries the correlation id from the incoming request.
- Breaking changes to a published API need a new version; old versions stay until consumers have moved.
- Dates and times in APIs are ISO 8601 in UTC.
