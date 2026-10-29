# Platform rule: authorization with CIAM (L0)

- Every feature action maps to a CIAM permission code (UPPER_SNAKE, e.g. `REPORT_EXPORT`).
- New permission codes are registered by the platform team: raise a CIAM ticket with code,
  description and owning product **before** the story starts. Agents should add this as task 0.
- Backend (Spring): annotate handlers with `@RequiresPermission("CODE")`. The aspect calls
  `POST /authorize` and caches results 60 s per user+code.
- Frontend (Angular): `PermissionService.has('CODE')` or `*hasPermission="'CODE'"`.
  Hiding a button is UX only; the backend check is the real control.
- Denied requests return 403 with code `FORBIDDEN` in the platform error envelope.
