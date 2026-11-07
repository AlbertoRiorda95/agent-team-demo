---
feature: orders-list
ready: yes
updated: 2026-11-07
owner: designer
milestone: M2
features: orders-list
---

# Orders list

## Goal
Staff find any order fast. The list is the home page after login: newest
orders first, 25 per page, filtered by status, searched by order number,
customer name or email. Success: with 10,000 orders the list answers in under
300 ms (p95) and a staff member finds an order in under 10 seconds.

## Out of scope
- The order detail page and status changes (`order-detail`).
- Sorting by other columns, date-range filters, export, bulk actions, saved views.
- Creating or editing orders in the web app.

## User flows
1. **Open the list** (`/`): newest first, page 1. The health panel of M1 is removed.
2. **Filter by status**: pick a status in the "Status" control (All, New, Paid,
   Shipped, Cancelled); page goes back to 1.
3. **Search**: type in "Search orders" (number, customer name or email,
   case-insensitive, contained text); results update 300 ms after the last
   keystroke; page goes back to 1. Search and filter combine.
4. **Page**: Previous / Next and page numbers; 25 per page.
5. **Share or reload**: status, search and page live in the URL
   (`/?status=paid&q=ana&page=2`); Back/Forward move between views; an invalid
   value in the URL (unknown status, page < 1, non-numeric) is ignored (default).
6. **Open an order**: the order number is a link to `/orders/<number>`
   (`order-detail`).
7. **Errors and edge cases**: no orders at all → "No orders yet"; no match →
   "No orders match" with a "Clear filters" link; page beyond the last →
   the app replaces the URL with the last page (no extra history entry) and
   shows it; with no orders at all the page parameter is dropped;
   load failure (network or 5xx) → inline error with Retry; 401 → login and back
   (existing handler); a slow earlier request never overwrites a newer one
   (aborted).

## Screens and states
| Screen / component | States | Notes |
|---|---|---|
| Orders list (`/`) | loading (spinner, `aria-busy` on the results region), loaded, empty ("No orders yet"), no match ("No orders match" + Clear filters), page out of range (redirected to the last page), error (message + Retry) | h1 "Orders"; toolbar with "Status" select and "Search orders" field; summary line "26–50 of 137 orders"; table; pagination |
| Table (≥ 768 px) | as above | columns: Number (mono, link), Date, Customer, Status (badge with text), Total (right-aligned, with currency) |
| Cards (< 768 px) | as above | one card per order: number link and badge on the first line, customer, date and total below; whole card content readable at 320 px |
| StatusBadge | new, paid, shipped, cancelled | text always shown; colors from `--status-*` |
| Pagination | first page, middle, last page, single page (hidden) | `nav` with `aria-label="Pagination"`, current page `aria-current="page"`, 44 px targets |

Status control: a Select, not chips. Totals are never summed
across orders. Dates: `Intl.DateTimeFormat` in the browser locale and time
zone, date and time. Amounts: `money.format`, currency always visible.
Responsive: desktop first, usable from 320 px, cards below `--bp-md`.
Accessibility: labelled controls, the results region is a landmark with
`aria-busy`, the result count is announced politely (`aria-live="polite"`)
after a filter or search, keyboard only, visible focus.
Tokens: design system only; none new proposed.

## Data and API
Entities: Order (project design). Contract: `GET /api/v1/orders` already exists
in `services/orders/openapi.yaml` (`status`, `q`, `page`, `pageSize` ≤ 100,
default 25; `OrderPage` = `items` of `OrderSummary`, `page`, `pageSize`,
`total`); no contract change. Behaviour backend implements:
- Order: `createdAt` descending, then `number` descending (stable).
- `q`: trimmed, case-insensitive contains on number, customer name and
  customer email; `%` and `_` in `q` are literal; empty `q` = no search.
- A page beyond the last: 200 with empty `items` and the real `total` (the web app uses `total` to jump to the last page).
- Performance: p95 < 300 ms at 10,000 orders. Indexes: existing
  `(status, created_at desc)`; for the search `pg_trgm` GIN indexes on lower
  customer name, lower customer email and number. Additive
  migration with rollback notes.
- The web app uses `@albertoriorda95/money` (registry, `^0.1`) to format amounts.
Breaking for existing clients: no.

## Acceptance criteria
- [x] `GET /orders` returns newest first, 25 per page by default, with `total`
      of the filter; `status` filters; an unknown `status`, `page` < 1 or
      `pageSize` > 100 returns 422 with the field.
- [x] `q` finds by number (`ORD-000012` and `000012`), by part of the customer
      name and of the email, ignoring case; `q=%` matches only a literal `%`.
- [x] A page beyond the last returns 200 with empty `items`.
- [x] Without a session the route returns 401.
- [x] With 10,000 seeded orders the list and a search answer in under 300 ms
      p95 (measured once in a test or script, result in the MR).
- [x] Web: `/` shows the list; status, search and page are in the URL and a
      reload or Back restores the same view; invalid URL values are ignored.
- [x] Web: `/?page=99` with 137 orders lands on page 6 (URL replaced, Back does
      not return to page 99); loading, empty, no match and error with Retry are
      each reachable in the UI tests.
- [x] Web: table at 1280 and 768, cards at 320; no axe violations, no
      horizontal scroll, touch targets 44 px; status shown by text.
- [x] Web: amounts show their currency (EUR, USD, GBP, JPY with the right
      decimals).
- [x] CI is green, including the scans for the new dependency of `apps/web`.

## Test seams
- API: `GET /api/v1/orders`, integration tests with `app.inject` on the test
  database with a few dozen orders; catches filter, search, order, pagination,
  validation, 401; misses the 10,000-order performance (separate measurement).
- UI: the list page at 320, 768 and 1280, API mocked with `page.route()`
  (pages, empty, no match, out of range, 401, 503); catches layout, URL state,
  accessibility; misses the real API.
- Unit: URL-state parsing and the amount/date formatters (Vitest).

## Reuse
- Amounts: team library `@albertoriorda95/money` (`format`); added to `apps/web`.
- Routing and URL state: existing `react-router` (`useSearchParams`).
- API types: generated `schema.d.ts`; request helper: the existing client.
- Table, Badge, Spinner, Select, TextField, Pagination: written here on the
  tokens (in-house, as the project design says); no UI library.
- Search: PostgreSQL `pg_trgm` (contrib extension, bundled with the Postgres
  image) via a migration; no search service.

## Decisions
- 2026-11-07 — Spec starts from `project.md`, the existing contract and the
  M1 code — nothing invented that those already settle.
- 2026-11-07 — No contract change: `GET /orders` already says what the list
  needs — avoids an alignment change.
- 2026-11-07 — Search updates by itself 300 ms after the last keystroke — fastest
  way to find an order.
- 2026-11-07 — `pg_trgm` GIN indexes for the search — keeps p95 < 300 ms at 10,000
  orders, as the project design requires.
- 2026-11-07 — A page beyond the last silently becomes the last page (URL
  replaced) — the user always sees orders, no dead end.
- 2026-11-07 — Status filter is a Select — in the design system, fits 320 px.

## Open questions
- (none)

## Task breakdown
| # | Role | Task | Depends on | Issue |
|---|---|---|---|---|
| 1 | backend | [orders] Implement `GET /orders` (status filter, `q` search, pagination, newest first, 422 on bad params); migration for the search indexes; integration tests; one measurement at 10,000 orders | — | - |
| 2 | frontend | [web] Add `@albertoriorda95/money`; amount and date formatters; StatusBadge, Spinner and error-with-Retry components; Vitest tests | — | - |
| 3 | frontend | [web] Orders list page at `/` (replaces the health panel): toolbar, table/cards, Pagination, URL state, all states; regenerate `schema.d.ts`; Vitest and Playwright UI tests at 320, 768, 1280 | 1, 2 | - |

## Readiness checklist
- [x] goal, users and out of scope agreed
- [x] every flow has its error and edge cases
- [x] every screen has empty, loading, error and success states
- [x] contract changes written, breaking changes approved by the user
- [x] acceptance criteria are observable
- [x] test seams agreed
- [x] reuse decided: team libraries and new dependencies named, or "none"
- [x] task breakdown with roles and dependencies
- [x] no open questions
