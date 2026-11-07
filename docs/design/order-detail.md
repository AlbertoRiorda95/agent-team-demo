---
feature: order-detail
ready: yes
updated: 2026-11-07
owner: designer
milestone: M2
features: order-detail
---

# Order detail

## Goal
Staff open an order, check it and move it through its statuses. Success: the
detail shows everything about the order, only the allowed transitions are
offered, and a status change is applied and visible within 1 second without a
page reload; two people changing the same order never overwrite each other.

## Out of scope
- Editing customer, address or lines; deleting orders; undoing a status.
- Live refresh or polling of the order.
- Notifications to the customer (no email integration).
- The orders list (`orders-list`).

## User flows
1. **Open an order**: from the list, or by URL `/orders/ORD-000123`. Shows
   header (number, status badge, allowed actions), customer, shipping address,
   lines (SKU, name, quantity, unit price, line total), shipping cost and total
   in the order's currency, status history (oldest first: who, when, from → to,
   reason). A "Back to orders" link returns to the list with the
   filter, search and page the user came from (the list's query travels in the
   router state; without it, `/`).
2. **Change the status**: allowed transitions are buttons — new: Mark paid,
   Cancel; paid: Mark shipped, Cancel; shipped and cancelled: none (the page
   says the order is final). Mark paid / Mark shipped apply immediately. The
   request sends the order's `version`.
3. **Cancel**: opens a dialog "Cancel order ORD-000123?" with an optional
   reason (max 500 characters, counter) and the buttons "Keep order" and
   "Cancel order" (danger). Escape or "Keep order" closes it with no change.
4. **After a change**: the badge, the actions and the history update from the
   response; a toast announces "Order ORD-000123 marked as paid" (shipped /
   cancelled likewise).
5. **Conflicts and errors**: someone changed the order meanwhile (409 with
   `currentStatus`, `currentVersion`) or the transition is no longer allowed
   (409) → an inline alert "This order changed: reload." with a Reload button,
   actions disabled until the order is reloaded, nothing overwritten
  ; version mismatch is checked before the transition;
   network or 5xx on the change → an inline error with Retry, the order stays
   as shown; 422 (reason too long) → field error in the dialog; 401 → login and
   back (existing handler); a double click sends one request (buttons busy).
6. **Unknown order**: `/orders/ORD-999999` (404) and malformed numbers show
   "Not found" with a link to the list; any unknown route shows the same page
   inside the shell, so a signed-out visitor goes through login first.
7. **Load failure**: inline error with Retry.

## Screens and states
| Screen / component | States | Notes |
|---|---|---|
| Order detail (`/orders/:number`) | loading (spinner, `aria-busy`), loaded, final order (no actions), changing (buttons busy), conflict (alert + Reload), change failed (error + Retry), not found, load error | h1 is the order number (mono) with the badge; sections "Customer", "Shipping address", "Items", "History" |
| Lines table | normal | amounts right-aligned with currency; below 768 px each line is a stacked block; totals block: Items subtotal (sum of line totals), Shipping, Total |
| History | one entry (order has had no change yet: "No status changes yet"), many | list oldest first: "Paid · Ana Ruiz · 7 Nov 2026, 10:42" + "from new", reason shown in quotes for cancellations |
| Cancel dialog | open, reason empty, reason too long (field error), submitting (busy), error | native `<dialog>` (modal), focus trapped, focus returns to the Cancel button on close; Escape closes |
| Toast | success | `role="status"`, `aria-live="polite"`, disappears after 5 s, does not steal focus |
| Not found | — | message "We can't find that page." + link "Back to orders" |

Responsive: desktop first, usable from 320 px; header actions wrap under the
number. Accessibility: one h1, section headings, the badge has text, dialog
labelled by its title, errors `role="alert"`, keyboard only, 44 px targets.
Tokens: design system only; none new proposed.

## Data and API
Entities: Order, OrderLine, StatusChange (tables exist since `order-intake`).
Contract in `services/orders/openapi.yaml`, no change:
- `GET /orders/{number}` → `Order` (with `history`, oldest first, `changedBy`
  `{id, name}`); 404 problem if unknown; a number that does not match the
  pattern → 404 as well.
- `POST /orders/{number}/status` `{ to, reason?, version }` → updated `Order`.
  Allowed: new → paid, new → cancelled, paid → shipped, paid → cancelled. One
  transaction: check `version` (409 `currentStatus`, `currentVersion`), check
  the transition (409 with `currentStatus`), insert a StatusChange
  (`changedBy` = the session user), set status, `version + 1`, `updatedAt`.
  `reason` only with `to: cancelled` (422 otherwise), trimmed, ≤ 500, empty →
  none. 403 for non-same-origin or non-JSON (existing guard); 401 without a
  session.
- Concurrency: the version check is atomic (conditional update), so of two
  simultaneous requests one wins and the other gets 409.
Breaking for existing clients: no.

## Acceptance criteria
- [x] `GET /orders/{number}` returns the order with lines, `lineTotal`s,
      `total` and `history`; 404 for an unknown or malformed number; 401
      without a session.
- [x] Each allowed transition returns 200, the new status, `version` + 1 and a
      history entry with the session user and the reason (cancel only).
- [x] Not allowed transitions (shipped → anything, cancelled → anything,
      new → shipped, paid → paid) return 409 with `currentStatus` and change
      nothing; a stale `version` returns 409 with `currentVersion`.
- [x] Two concurrent requests with the same `version`: exactly one succeeds.
- [x] `reason` with a non-cancel target or over 500 characters returns 422.
- [x] A change without the right `Origin` returns 403 and changes nothing.
- [x] Web: the detail shows all sections; amounts with currency; dates in the
      browser locale and time zone.
- [x] Web: opening an order from `/?status=paid&q=ana&page=2` and choosing
      "Back to orders" returns to that exact list view; opened by URL, it goes to `/`.
- [x] Web: only the allowed buttons appear for each status; final orders show
      none and say so.
- [x] Web: Mark paid updates badge, actions and history without reload and
      shows a toast announced to screen readers.
- [x] Web: the cancel dialog traps focus, closes with Escape, returns focus to
      its button, sends the reason, and shows 422 on the field.
- [x] Web: 409 shows the "reload" alert, disables the actions, and Reload
      refetches; 404 and unknown routes show Not found; load/change errors have Retry.
- [x] Web: UI tests at 320, 768, 1280 with no axe violations, no horizontal
      scroll, touch targets of 44 px.
- [x] CI is green.

## Test seams
- API: `GET /orders/{number}` and `POST /orders/{number}/status`, integration
  tests with `app.inject` on the test database (every transition, 409 cases,
  concurrency with two parallel requests, 403, 422); catches the state machine
  and atomicity; misses real browsers.
- Domain: the transition table as a unit test; catches illegal moves quickly.
- UI: the detail page at 320, 768, 1280 with the API mocked (`page.route()`):
  each status, change success, 409, 422, 404, 5xx, 401; catches states,
  dialog behaviour, accessibility; misses the real API.

## Reuse
- Amounts and dates: formatters from `orders-list#2` (`money`).
- Routing, API client and 401 handling: existing `react-router` and client.
- Dialog: native `<dialog>`; Toast, Button variants, Not found page: written
  here on the tokens (in-house, as the project design says).
- Transition rules and optimistic concurrency: written here (a few lines).

## Decisions
- 2026-11-07 — Spec starts from `project.md`, the existing contract and the
  M1 code — nothing invented that those already settle.
- 2026-11-07 — No contract change: the endpoints and errors already exist —
  avoids an alignment change.
- 2026-11-07 — Version mismatch is checked before the transition — the client
  always learns "reload" first, never a misleading transition error.
- 2026-11-07 — "Back to orders" keeps the filtered list query — staff work
  through a filtered list and should not lose their place.
- 2026-11-07 — A 409 shows an alert with Reload and disables the actions; the
  page never changes by itself — as in the project design.
- 2026-11-07 — Mark paid and Mark shipped apply without confirmation; only
  Cancel confirms — as in the project design.

## Open questions
- (none)

## Task breakdown
| # | Role | Task | Depends on | Issue |
|---|---|---|---|---|
| 1 | backend | [orders] Implement `GET /orders/{number}` (order, lines, history) and tests | orders-list#1 | - |
| 2 | backend | [orders] Implement `POST /orders/{number}/status` (transitions, atomic version check, StatusChange, 409/422) and integration, concurrency and contract tests | 1 | - |
| 3 | frontend | [web] Native-`<dialog>` Dialog, Toast, danger Button; Not found page and catch-all route; Vitest tests | orders-list#3 | - |
| 4 | frontend | [web] Order detail page at `/orders/:number`: sections, allowed actions, cancel dialog, toast, conflict/error states; regenerate `schema.d.ts`; Vitest and Playwright UI tests at 320, 768, 1280 | 2, 3 | - |

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
