# Platform rule: authentication with Keycloak (L0)

- Keycloak does **authentication only**: login, token issue, token refresh.
- Services are OAuth2 resource servers: validate JWT signature, issuer and audience. Nothing else.
- Do not use Keycloak realm or client roles for feature access. That is CIAM's job.
- UIs use keycloak-angular with silent refresh; never store tokens in localStorage.
- Local development: `docker compose -f dev/keycloak.yml up` in each service repo (realm `local`).
