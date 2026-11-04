---
feature: order-intake
ready: yes
updated: 2026-11-04
owner: designer
milestone: M1
features: order-intake
---

# Order intake

## Goal
Orders enter the system. An order source (the future storefront, the seed
script) creates an order with `POST /api/v1/orders` and an API key; the service
validates it, computes the total with `money`, stores the order in status `new`
with its number, and replaying the same `externalReference` creates nothing.
A seed script fills a development database with realistic orders. Success: a
valid payload gives 201 with the stored order; the same payload again gives 200
and the same order; every invalid payload gives 422 listing the fields; no key
or a wrong key gives 401; money values are never floats.

## Out of scope
- Reading orders: `GET /orders`, `GET /orders/{number}` (`orders-list`,
  `order-detail`, M2) and status changes (`order-detail`); they stay 501.
- Staff authentication (done, `staff-auth`); any web screen.
- Editing or cancelling an order from the source; several API keys or key
  rotation without a restart; rate limiting; webhooks; stock or payments.

## User flows
1. **Create an order** (order source): `POST /api/v1/orders`, `Authorization:
   Bearer <key>`, JSON body as `CreateOrderRequest`. The service validates the
   body, parses every amount with `money` in the order's currency, computes each
   line total (`unitPrice × quantity`), the order total (lines + shipping) and
   stores order, lines and number in one transaction. 201 with the `Order`
   (status `new`, version 1, empty history).
2. **Replay** (same `externalReference`): 200 with the existing order, nothing
   written, whatever else the body says. Two concurrent
   requests with the same reference: one creates (201), the other gets 200
   (unique index, no 500).
3. **Errors**: missing, malformed or wrong key → 401 (same body for all, no hint
   which); body not JSON or schema-invalid → 422 with `errors[]` (`field` =
   JSON path); unknown currency; quantity < 1; negative or non-decimal price;
   more decimals than the currency allows (`money.parse` rejects, reported on
   that field); empty `items`; unknown country format; body above the size limit
   → 413. A valid staff session cookie is **not** accepted on this route.
4. **Seed** (developer): `npm run seed -w services/orders [-- --count N]` inserts
   N demo orders (default 40) in several currencies and statuses through the
   same application use case for the order, with `externalReference` `seed-0001`…, so running
   it twice adds nothing (**assumed**, see Q3). Orders beyond `new` also get their
   status history (chain of StatusChange rows, `changedBy` the seed staff user,
   a reason on cancelled, `version` = 1 + changes), written directly by the
   seed so M2 screens have history to show. The seed staff user
   `seed@example.test` is created inactive with an unusable password hash: it
   cannot log in. Refuses to run when `NODE_ENV=production`.

## Screens and states
None. Interface: the HTTP API and a command.

## Data and API
Entities (project design): Order, OrderLine, and the StatusChange table created
here empty (used by `order-detail`). Order: id uuid, number from a Postgres
sequence (`ORD-` + 6 digits, more digits past 999999), externalReference unique,
customer name/email, shipping address columns, currency, shippingCost and total
as `bigint` minor units, status, version (1), createdAt, updatedAt (UTC).
Lines: id, orderId, position, sku, name, quantity, unitPrice (minor units).
Indexes: unique externalReference, unique number, (status, createdAt desc);
search indexes belong to `orders-list`. Sequence gaps (rolled-back inserts) are
accepted.
Amounts: orders depends on `@albertoriorda95/money` from the registry (`^0.1`),
never a local path.
Configuration: new `ORDER_API_KEY` — at least 32 characters, required in
production, compared in constant time; outside production, when unset, the
route answers 401 to everything. Alignment change for
devops (`.env.example`, `compose.yml`, CI orders job).
Contract changes (applied by backend to `services/orders/openapi.yaml`): add
`413` to `POST /orders`; `Amount` response values use the order's currency
digits (`"12.50"`, JPY `"1250"`); `maximum` on `quantity`: `quantity` maximum 10000; request body limit 256 KB.
Additive, not breaking (`POST /orders` has no caller yet).
Breaking for existing clients: no.

## Acceptance criteria
- [x] A valid payload returns 201 with number `ORD-000001`-style, status `new`,
      version 1, empty history, lines with `lineTotal`, and the computed
      `total`; the rows exist in the database with minor-unit amounts.
- [x] The total is lines + shipping, exact in EUR, USD, GBP and JPY (JPY has no
      decimals), with no float arithmetic (test with 0.1 + 0.2-style prices).
- [x] The same `externalReference` again returns 200 and the same order; the
      count of orders and lines is unchanged; 20 concurrent requests with one
      reference produce exactly one order.
- [x] No `Authorization`, a wrong key, a non-Bearer scheme, and a staff session
      cookie each return 401 with the same body and create nothing.
- [x] Each invalid case of flow 3 returns 422 with the right JSON path in
      `errors[]` and creates nothing; an oversize body returns 413.
- [x] Order numbers are unique and increasing under concurrent creation.
- [x] `npm run seed` creates the orders once, with consistent status history
      (each order's status and version match its StatusChange rows); running it
      again creates none; `NODE_ENV=production` makes it exit non-zero without
      writing; the seed user cannot log in.
- [x] No log line contains the API key, an email, a name or an address.
- [x] The contract test passes with the changed `openapi.yaml`; CI is green,
      including the scans for the new `@albertoriorda95/money` dependency.

## Test seams
- API: `POST /api/v1/orders`, integration tests with `app.inject` on the test
  database; catches validation, auth, idempotency, concurrency, totals,
  persistence; misses real network, proxy and the production key check.
- Domain: the order-creation use case (total and validation) as unit tests with
  `money`; catches rounding and currency rules faster than HTTP; misses SQL.
- CLI: `seed` as a child process against the test database; catches the
  idempotent re-run and the production guard; misses data realism (by eye once).
- Contract: the existing contract test.

## Reuse
- Amounts, currencies, rounding: team library `@albertoriorda95/money` (no
  hand-written decimal code).
- Validation: the existing contract validation (ajv) in the HTTP adapter.
- Errors, guard and logging: the existing problem helper and request logging.
- API key check: written here, Node `crypto.timingSafeEqual` on equal-length
  digests.
- Seed data: written here, a small deterministic generator (no faker
  dependency).

## Decisions
- 2026-11-04 — Replay with a different body returns 200 with the existing order,
  body ignored — as the project design says; sources retry, they do not edit.
- 2026-11-04 — One `ORDER_API_KEY` (≥ 32 chars, constant-time compare, required
  in production, unset outside production → 401) — never fails open.
- 2026-11-04 — Seed writes status history and an inactive seed staff user — M2
  screens need history in development data.
- 2026-11-04 — `quantity` ≤ 10000 and 256 KB body limit (413) — bounded totals,
  additive since `POST /orders` has no caller yet.
- 2026-11-04 — Order numbers may have gaps (sequence) — unique and increasing,
  no lock on the hot path.
- 2026-11-04 — Spec starts from `project.md`, the existing contract and the
  staff-auth code — nothing is invented that those already settle.

## Open questions
- (none)

## Task breakdown
| # | Role | Task | Depends on | Issue |
|---|---|---|---|---|
| 1 | backend | [orders] Add `@albertoriorda95/money`; schema and migration for Order, OrderLine, StatusChange and the number sequence; order-creation use case; `POST /orders` with the API key guard, idempotency and 413; `ORDER_API_KEY` in the config; `openapi.yaml` changes; integration and contract tests | — | - |
| 2 | backend | [orders] `seed` command (orders, history, inactive seed staff user, production guard) and tests | 1 | - |
| 3 | devops | [orders] `ORDER_API_KEY` in `.env.example`, `compose.yml` and the CI orders job | 1 | - |

## Readiness checklist
- [x] goal, users and out of scope agreed
- [x] every flow has its error and edge cases
- [x] every screen has empty, loading, error and success states (no screens)
- [x] contract changes written, breaking changes approved by the user
- [x] acceptance criteria are observable
- [x] test seams agreed
- [x] reuse decided: team libraries and new dependencies named, or "none"
- [x] task breakdown with roles and dependencies
- [x] no open questions
