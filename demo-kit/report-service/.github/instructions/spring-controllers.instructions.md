---
name: 'Spring controllers'
description: 'Use when creating or changing REST controllers or request/response DTOs in report-service.'
applyTo: '**/src/main/java/**/api/**/*.java'
---
# Controllers in report-service

- Annotate every handler with `@RequiresPermission("<CIAM_CODE>")`. Missing it fails the security
  ArchUnit test (`SecurityRulesTest`), so add it first.
- Return DTOs from `api.dto`, never JPA entities. Entities leak lazy-loading exceptions to Jackson.
- Validate with `@Valid` + Bean Validation on DTOs; map violations through `ApiExceptionHandler`
  so the error envelope stays consistent.
- Streaming downloads (Excel, CSV): return `ResponseEntity<StreamingResponseBody>` and set
  `Content-Disposition` with an ASCII-only file name. Large byte arrays have caused OOM in UAT.
- Add the endpoint to `src/main/resources/openapi/report-api.yaml` in the same change.

Preferred:
```java
@GetMapping("/{reportId}/rows")
@RequiresPermission("REPORT_VIEW")
public PageDto<ReportRowDto> rows(@PathVariable UUID reportId, @Valid ReportFilterDto filter) {
    return mapper.toPage(queryService.rows(reportId, filter.toSpec()));
}
```
