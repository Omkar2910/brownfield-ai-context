# Platform rules: errors and logging

> Template. Replace with your platform's real rules.

- Every service returns errors in one format: `{ "code": "...", "message": "...", "traceId": "..." }`.
  UIs show `message` to the user and log `traceId`.
- Never log request bodies, tokens or personal data.
- Use the trace id from the incoming request in every log line, so one user action can be followed
  across the shell, the micro-frontend and every service it calls.
