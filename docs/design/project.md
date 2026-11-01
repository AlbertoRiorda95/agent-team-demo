---
ready: yes
updated: 2026-11-01
---

# Orders — project design

## Product
Orders is the back office of a small shop. Staff see the shop's orders, open
one, and move it through its statuses (new, paid, shipped, cancelled). Orders
carry amounts in several currencies, handled by the shared `money` library.
Orders arrive through the API (a future storefront, or the seed script in
development); there is no storefront here. Success: staff find any order in
under 10 seconds and see a status change applied within 1 second.

## Users and roles
| User type | Goals | Permissions |
|---|---|---|
| Staff (named account) | find an order, check it, update its status | every staff account has the same permissions: read all orders, change status |
| Order source (machine client: the future storefront, the seed script) | create orders | create orders only, with an API key from configuration (bearer token), never a staff session |

## Core flows
1. **Create a staff account** (operator, command line): `npm run user:create -w
   services/orders -- --email <e> --name <n>` prompts for the password.
   Errors: email already used; password shorter than 12 characters.
   `user:deactivate --email <e>` deactivates an account and ends its sessions.
   No user-management screen.
2. **Log in / log out** (staff): email + password → session cookie (HttpOnly,
   Secure, SameSite=Lax; expires after 8 hours without activity).
   Errors: wrong email or password → one generic message; a deactivated account
   gets the same message; 5 failed attempts for an email within 15 minutes lock
   that email for 15 minutes (the message says to try later). An expired
   session sends the user back to login, then to the page they were on.
   Logout ends the session on the server.
3. **Receive an order** (order source): `POST /orders` with the API key. The
   service validates the payload, computes the total with `money` and creates
   the order in status `new` with its order number. Errors: missing or wrong
   key → 401; invalid payload (unknown currency, quantity < 1, negative price,
   empty items, amount with more decimals than the currency allows) → 422 with
   the fields; the same `externalReference` again → 200 with the existing order,
   nothing created.
4. **Find an order** (staff): orders list, newest first, paginated; filter by
   status; search by order number, customer name or email. Edge cases: no
   orders yet; no match for the search; a page beyond the last.
5. **Check an order** (staff): open it from the list (or by URL): customer,
   shipping address, lines, shipping cost, total in its currency, status and
   status history. Error: unknown order → not found page.
6. **Change the status** (staff): on the detail page only the allowed
   transitions are buttons (new: Mark paid, Cancel; paid: Mark shipped,
   Cancel; shipped and cancelled: none). Cancel asks for confirmation and an
   optional reason. The change records who and when. Errors: someone changed
   the order meanwhile (version mismatch) → 409, "This order changed: reload",
   nothing overwritten; a transition no longer allowed → 409 with the current
   status; session expired → login, then back.

## Screens
| Screen | Purpose | Main components |
|---|---|---|
| Login | staff sign in | email and password fields, Log in button, error message |
| Orders list | find orders | status filter, search box, orders table (number, date, customer, status badge, total) — cards below 768 px, pagination (25 per page); filter, search and page in the URL |
| Order detail | read one order, change its status | header (number, status badge, allowed actions), customer, shipping address, lines table with shipping and total, status history (who, when, from → to, reason), cancel confirmation dialog with optional reason |
| Not found / error | unknown order or route, unexpected error | message, link back to the list |

Every page after login has a top bar with the staff member's name and Log out.

States: empty list "No orders yet"; no search match "No orders match" with a
clear-filters link; loading shows a spinner (accessible, `aria-busy` on the
region being loaded); a failed load shows an inline error with Retry; a status
change shows a toast ("Order ORD-000123 marked as paid") and updates the badge
and the history without a page reload.

Responsive: desktop first, usable from 320 px; Playwright viewports 320, 768,
1280.

## Domain model
| Entity | Key fields | Relations |
|---|---|---|
| StaffUser | id (uuid), email (unique), name, passwordHash (Argon2id), active, createdAt | has Sessions; authors StatusChanges |
| Session | tokenHash, lastSeenAt, expiresAt | belongs to a StaffUser |
| LoginAttempt | email, at, success | used for the lockout (5 failures / 15 min per email) |
| Order | id (uuid), number (`ORD-` + 6 digits from a Postgres sequence), externalReference (unique), customerName, customerEmail, shipping address (name, line1, line2, city, postalCode, country ISO 3166-1 alpha-2), currency (ISO 4217), shippingCost, total, status (new, paid, shipped, cancelled), version, createdAt, updatedAt | has OrderLines (≥ 1) and StatusChanges |
| OrderLine | id, sku, name, quantity (≥ 1), unitPrice | belongs to an Order |
| StatusChange | id, from, to, reason (optional), changedBy, at | belongs to an Order; changedBy is a StaffUser |

Amounts: in the database, integer minor units (`bigint`) next to the order's
currency code; in the API, `{ "amount": "12.50", "currency": "EUR" }` (a
decimal string, never a float). Orders are never deleted. Times in UTC.

### The `money` library (v0.1)
`Money` value (minor units + currency), immutable; `parse(decimalString,
currency)` (rejects more decimals than the currency allows),
`toDecimalString`; `add`, `multiply(integer)`, `sum` (refuses mixed
currencies); `round`/`allocate` with half-up by default, half-even available;
`format(money, locale)` via `Intl`; `currencies` (code, minor digits) for EUR,
USD, GBP, JPY. No runtime dependencies; runs in Node and the browser.

## API surface
The first version of the contract is in `services/orders/openapi.yaml`
(OpenAPI 3.1, hand-written, the source of truth). Base path `/api/v1`.
| Area | Endpoints |
|---|---|
| Auth (staff) | `POST /auth/login` (public), `POST /auth/logout`, `GET /auth/me` |
| Orders (staff) | `GET /orders?status=&q=&page=&pageSize=` (newest first, pageSize ≤ 100, default 25), `GET /orders/{number}`, `POST /orders/{number}/status` `{ to, reason?, version }` |
| Orders (order source, API key) | `POST /orders` (idempotent on `externalReference`) |
| Health | `GET /health` (outside `/api/v1`) |

Errors are RFC 9457 `application/problem+json`: 401, 404, 409 (with
`currentStatus` and `currentVersion`), 422 (with `errors[]`), 429.
The web app and the API share one origin (Vite proxy in development, a
reverse proxy in production): no CORS; changes require JSON and a matching
`Origin` header (CSRF). The backend validates requests and responses with the
contract's schemas, and a contract test fails when a route or a response
differs from the file.

## Integrations
None: no email, payment or carrier service. The only external dependency is
Postgres. When it is unreachable, `/health` returns 503, the API answers 503
problem responses, and the web app shows its error state with Retry.

## Non-functional requirements
- Accessibility: WCAG 2.1 AA; everything usable with the keyboard; status
  badges carry text, never color alone; toasts announced (`aria-live`); the
  cancel dialog traps focus and returns it to its button.
- Languages and formats: English interface only; amounts formatted with
  `money` and dates with `Intl` in the browser's locale, the currency always
  visible; times stored in UTC, shown in the browser's time zone.
- Privacy: customer names, emails and addresses are kept as long as the order;
  logs never contain emails, addresses, passwords or tokens. Erasure and
  export requests are out of scope for now.
- Performance: p95 under 300 ms for the list and the detail with up to 10,000
  orders (indexes on status + createdAt, number, externalReference, and for the
  search); web bundle under 250 KB gzipped.
- Availability: one instance, no high-availability requirement.
- Security: Argon2id passwords; secrets (database URL, API key, session
  secret) only in the environment; security headers (CSP without inline
  scripts, HSTS in production); request logs with a request id and no personal
  data; dependency audit and semgrep in CI.
- Browsers: the last two versions of Chrome, Firefox, Safari and Edge.

## Design direction
Calm, dense, work-focused: a neutral grey palette with one blue accent, the
system font stack (no web fonts), a 4 px spacing base. Status badges: new
blue, paid green, shipped grey, cancelled red, always with their text.
Small in-house components on the tokens (Button, TextField, Select, Table,
Badge, Dialog on native `<dialog>`, Toast, Spinner, Pagination), no UI
library. Details in the design-system skill (`.claude/skills/design-system/`).

## Out of scope for now
- Payments (no payment provider: "paid" is a status set by staff).
- Authentication beyond a single staff login.
- Real shipping (no carrier integration: "shipped" is a status set by staff).
- Creating or editing orders in the web app; user management screens.
- Currency conversion and totals across currencies.
- Personal data erasure and export requests.
- Translations of the interface (English only).

## Roadmap
| Milestone | Features (one spec each) |
|---|---|
| M0 Foundations | foundations (walking skeleton: structure, services start, contract served, database, tests, green CI), money-library (`money` v0.1, tested, released as `v0.1.0`) |
| M1 Core | order-intake (order domain, persistence, `POST /orders`, seed script), staff-auth (account commands, login/logout, sessions, app shell with top bar and login page) |
| M2 Back office | orders-list (list, filter, search, pagination), order-detail (detail page, status changes, history) |

Order: M0 → M1 → M2. In M1, order-intake and staff-auth can run in parallel.

## Decisions
- 2026-11-01 — TypeScript monorepo: `packages/money`, `services/orders`
  (Fastify, Postgres + Drizzle), `apps/web` (React + Vite) — setup interview.
- 2026-11-01 — `money` is released on its own to GitHub Packages and used from
  the registry, never through a local path — project brief.
- 2026-11-01 — Named staff accounts, all with the same permissions; every status
  change records who made it and when — accountability without roles.
- 2026-11-01 — No order creation in the web app: orders come in through
  `POST /orders` and a seed script — there is no storefront in scope.
- 2026-11-01 — Statuses: new → paid → shipped; new or paid → cancelled; shipped
  and cancelled are final; every change is kept in a status history — matches
  the shop's real process, no going back.
- 2026-11-01 — One currency per order (ISO 4217), no conversion, no sums across
  currencies; EUR, USD, GBP, JPY at first; `money` owns currencies, rounding
  and formatting — the brief's multi-currency need without FX.
- 2026-11-01 — Scale: a few thousand orders, a few hundred a day; paginated
  list, filter by status, search by order number or customer — small shop.
- 2026-11-01 — Staff accounts are created and deactivated with operator
  commands; passwords ≥ 12 characters, Argon2id — no user-management screen
  needed for a small team.
- 2026-11-01 — Login: generic error, lockout after 5 failures in 15 minutes per
  email, HttpOnly session cookie expiring after 8 hours idle, server-side
  logout — single-tenant back office, simple and safe.
- 2026-11-01 — Status changes use optimistic concurrency (order version):
  the second concurrent change gets 409 and nothing is overwritten.
- 2026-11-01 — `POST /orders` uses an API key from configuration (bearer) that
  can only create orders; `externalReference` makes it idempotent — the source
  is a machine, not a person.
- 2026-11-01 — An order: number `ORD-000123`, customer name and email,
  structured shipping address, lines (SKU, name, quantity, unit price),
  shipping cost, currency, tax-inclusive prices; the total is computed by the
  service with `money`, never sent by the client.
- 2026-11-01 — Four screens: login, orders list, order detail, not found/error;
  list state (filter, search, page) in the URL — shareable views, working back button.
- 2026-11-01 — Loading states use spinners — the user's choice over skeletons.
- 2026-11-01 — Desktop first, usable from 320 px, cards below 768 px — staff
  work at a desk but may check an order on a phone.
- 2026-11-01 — WCAG 2.1 AA; English UI; locale-aware formatting via `money` and `Intl`.
- 2026-11-01 — Entities StaffUser, Session, LoginAttempt, Order, OrderLine,
  StatusChange; orders never deleted — the history is the audit trail.
- 2026-11-01 — Amounts as integer minor units in the database and decimal
  strings with a currency in the API — no float rounding anywhere.
- 2026-11-01 — `money` v0.1 API as in Domain model, half-up rounding by default,
  no runtime dependencies — shared by the service and the browser.
- 2026-11-01 — The first `money` release (`v0.1.0`, tag pushed by the user)
  comes before the orders and web tasks that use it; the foundations skeleton
  does not depend on it. Tags are `v*` (`money-v*` if a second package is ever
  released from this repository).
- 2026-11-01 — Personal data kept with the order; never logged; erasure and
  export out of scope for now.
- 2026-11-01 — API under `/api/v1`, orders addressed by number, RFC 9457
  errors — readable URLs and one error shape for the web app.
- 2026-11-01 — Same origin for web and API, no CORS, CSRF by JSON + Origin
  check — the session cookie stays simple.
- 2026-11-01 — Hand-written OpenAPI is the source of truth; validation and a
  contract test keep the service honest — the web types never drift.
- 2026-11-01 — No integrations; Postgres down → 503 and the error state.
- 2026-11-01 — p95 < 300 ms at 10,000 orders, one instance, bundle < 250 KB
  gzipped, last two versions of the major browsers.
- 2026-11-01 — Neutral palette, blue accent, system fonts, 4 px base; in-house
  components with native `<dialog>`, no UI library — few components, nothing
  to keep up to date.
- 2026-11-01 — Roadmap M0 Foundations, M1 Core, M2 Back office — the skeleton
  and money first, then the data and access, then the screens.
- 2026-11-01 — The contract lives with the service: `services/orders/openapi.yaml`;
  the web app generates its types with openapi-typescript — setup interview.

## Open questions
- (none)
