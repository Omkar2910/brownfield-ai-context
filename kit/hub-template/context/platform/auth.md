# Platform rules: authentication and authorization

> Template. Replace with your platform's real rules. Keep each rule short and give the reason.

- **Authentication** (who the user is) is done by the identity provider (for example Keycloak). Services
  only validate the token; UIs use the shared login flow in the shell.
- **Authorization** (what the user may do) is always a permission check against the authorization
  service (for example a CIAM service), never a check of login roles. Why: roles describe the identity
  provider's setup; permissions are the business rule and can change without redeploying.
- Every backend endpoint declares the permission it needs. Every UI action that needs a permission is
  hidden without it — but hiding is only for usability; the backend check is the real control.
- New permission codes are registered by the platform team before the story starts (list the ticket in
  the initiative note).
