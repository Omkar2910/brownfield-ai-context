# System map (L0/L3)

```
analyst browser
   │  (Keycloak login, JWT)
   ▼
report-ui ──GET/POST /api/v1/reports/**──▶ API gateway ──▶ report-service ──▶ PostgreSQL
   │                                                         │
   └──GET /ciam/permissions/me──▶ CIAM service ◀──POST /authorize──┘
```

| Edge | Contract | Owner |
|---|---|---|
| report-ui → report-service | contracts/report-service/openapi.yaml | report-service team |
| report-ui → CIAM | platform API, see context/platform/ciam-authorization.md | platform team |
| report-service → CIAM | platform API | platform team |

Permissions used by this product: `REPORT_VIEW`, `REPORT_EXPORT` (new in REPORT-142).
