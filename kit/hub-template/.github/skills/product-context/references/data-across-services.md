---
type: data
status: draft
owner: <tech lead>
verified: []
---
# Data across services

Only what crosses a service boundary. Each table's meaning lives in its owner's table page; link to it.
Owners and readers per schema: `catalog.json` ("schemas"), from `node .ai-kit/context-tools.cjs schemas`.
Name every table and column in backticks as `<table>.<column>` (or `<schema>.<table>.<column>`): a
service's commit and pull request check warn when its change removes one of them.

## IDs that point into another service's data (no foreign key)
- `<billing.invoices.order_id>` stores `<orders.id>`. Owner of orders: <orders-service>; see
  <orders-service>/docs/context/data/tables/<orders>.md.

## Tables one service changes and others read
| Table | Changed by | Read by | What the readers rely on |
| --- | --- | --- | --- |
| `<orders.orders>` | <orders-service> | <billing-service> | `<orders.status>` 7 means cancelled |

## Shared schemas (several services change them)
- `<audit>`: export and table pages here, in `context/data/<audit>/`. Changed by <orders-service, billing-service>.

## Unverified
