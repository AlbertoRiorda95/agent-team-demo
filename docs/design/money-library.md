---
feature: money-library
ready: yes
updated: 2026-11-01
owner: designer
milestone: M0
---

# Money library

## Goal
`@albertoriorda95/money` v0.1: the one place where the project handles amounts,
currencies, rounding and formatting, used by `services/orders` (computing order
totals, validating amounts) and `apps/web` (showing them). Nobody else does
arithmetic on amounts or formats them by hand. It works when the service and
the web app can use it from GitHub Packages after the `v0.1.0` tag, and the
behavior below is covered by its tests.

## Out of scope
- Currency conversion, exchange rates, totals across currencies.
- Currencies beyond EUR, USD, GBP, JPY (added later as data, not code).
- Tax computation (prices are tax-inclusive, project design).
- Persistence helpers (Drizzle column types live in the service).

## User flows
The users are developers of the service and the web app.
1. **Parse an amount** from the API or the seed: `parse("12.50", "EUR")` →
   Money. Errors: unknown currency; not a decimal string; more decimals than
   the currency allows (`"12.505"` EUR, `"10.5"` JPY).
2. **Compute an order total**: line totals with `multiply(unitPrice,
   quantity)`, then `sum([...lines, shipping])`. Errors: mixed currencies;
   result beyond the safe integer range; an empty list.
3. **Send it**: `toJSON(money)` → `{ "amount": "12.50", "currency": "EUR" }`
   (the contract's `Amount`), and `fromJSON` back.
4. **Show it**: `format(money, locale)` → `€12.50` / `12,50 €`, currency always
   visible.
5. **Split or scale an amount** (future discounts, refunds): `allocate(money,
   [1, 1, 1])` → €3.34 / €3.33 / €3.33 (largest remainder, never loses a
   cent); `multiplyBy(money, "0.15", "half-up")` rounded to the currency's
   minor digits. Errors: empty or negative ratios, all ratios zero; a factor
   that is not a decimal string.

## Screens and states
Not applicable (a library).

## Data and API
Public API (`src/index.ts`, the only entry):
- `type CurrencyCode = "EUR" | "USD" | "GBP" | "JPY"`; `currencies`: code →
  `{ code, minorDigits }` (EUR, USD, GBP 2; JPY 0); `isCurrencyCode(x)`.
- `Money`: immutable (frozen) `{ minor: number, currency: CurrencyCode }`;
  `minor` is always a safe integer (`Number.isSafeInteger`), any operation
  that would leave that range throws `InvalidAmountError`.
- `parse(decimal: string, currency)` (never rounds: rejects extra decimals),
  `toDecimalString(money)` (always the currency's minor digits: `"12.50"`,
  `"1250"`), `fromMinor(minor, currency)`.
- `add(a, b)`, `subtract(a, b)`, `multiply(money, integer)`, `sum(list)`
  (non-empty list): exact.
- `multiplyBy(money, factor: string, mode = "half-up")`: decimal factor,
  result rounded to the currency's minor digits.
- `allocate(money, ratios: number[])`: largest remainder method; the parts
  always add up to `money`; ties go to the earlier parts.
- `type RoundingMode = "half-up" | "half-even"` (half-up: away from zero on .5).
- `equals`, `compare` (-1/0/1, same currency only), `isZero`, `isNegative`.
- `format(money, locale, options?: { currencyDisplay?: "symbol" | "code" })`
  via `Intl.NumberFormat` with the currency's minor digits.
- `toJSON(money)` → `{ amount: string, currency }` and `fromJSON(obj)`,
  matching the contract's `Amount`.
- Errors: `MoneyError` (base) with `UnknownCurrencyError`,
  `InvalidAmountError` (not a decimal string, too many decimals, unsafe
  integer, bad ratios or factor), `CurrencyMismatchError`. Never `NaN`, never
  a silent float.
Contract changes: none (the `Amount` schema of `services/orders/openapi.yaml`
already matches).
Breaking for existing clients: no (first release).

## Acceptance criteria
- [ ] `parse("12.50","EUR")` → minor 1250; `parse("1250","JPY")` → 1250;
      `parse("12.505","EUR")`, `parse("10.5","JPY")`, `parse("1e3","EUR")`,
      `parse("","EUR")` throw `InvalidAmountError`; `parse("1","XXX")` throws
      `UnknownCurrencyError`.
- [ ] `toDecimalString` gives `"12.50"`, `"-0.05"`, `"1250"` (JPY); for every
      Money `m`, `parse(toDecimalString(m), m.currency)` equals `m` (property test).
- [ ] `add`, `subtract`, `sum`, `compare` with two currencies throw
      `CurrencyMismatchError`; `sum([])` throws `InvalidAmountError`.
- [ ] Results beyond `Number.MAX_SAFE_INTEGER` minor units throw
      `InvalidAmountError`.
- [ ] `allocate(10.00 EUR, [1,1,1])` → 3.34, 3.33, 3.33; for any amount and
      ratios the parts add up to the amount (property test).
- [ ] `multiplyBy(0.05 EUR, "0.5")` → 0.03 half-up, 0.02 half-even;
      `multiplyBy(1.25 EUR, "0.1")` → 0.13 half-up, 0.12 half-even; negative
      amounts round symmetrically.
- [ ] `format(1234.50 EUR, "en-US")` → `€1,234.50`; `"de-DE"` → `1.234,50 €`;
      `format(1250 JPY, "ja-JP")` → `￥1,250`; `currencyDisplay: "code"` →
      `EUR 1,234.50` (en-US). The outputs are those of Node 24's `Intl`, whose
      separator before `€` and after `EUR` is a non-breaking space (U+00A0):
      tests compare with it, not with a plain space.
- [ ] `toJSON`/`fromJSON` round-trip and match the `Amount` schema of
      `services/orders/openapi.yaml`.
- [ ] No runtime dependencies in `package.json`; the build produces ESM and
      `.d.ts`; `package.json` version `0.1.0`; README with the API and
      examples, CHANGELOG entry for 0.1.0.
- [ ] `npm test --prefix packages/money` and lint/typecheck pass; CI green.

## Test seams
- The public entry `src/index.ts` only, with Vitest: example tables per
  currency and rounding mode, property tests with fast-check (round trip,
  allocation sums, add/subtract inverse), format checks for en-US, de-DE,
  ja-JP. Catches arithmetic, rounding, parsing and formatting errors; misses
  how the service and the web app use it (their own specs).

## Reuse
- Arithmetic, parsing, allocation: written here (~300 lines). dinero.js v2
  (MIT) has stayed in pre-release for years and adds its own concepts;
  currency.js computes with floats; the project design asks for no runtime
  dependencies.
- Formatting: the platform's `Intl.NumberFormat` (no dependency).
- Tests: Vitest (project standard), fast-check (MIT, dev dependency only).

## Decisions
- 2026-11-01 — API, half-up default rounding, no runtime dependencies, Node and
  browser — project design.
- 2026-11-01 — Minor units in the database, decimal strings with currency in
  JSON — project design.
- 2026-11-01 — Minor units are a safe-integer `number`, not `bigint` — passes
  through JSON, React and Drizzle unchanged; ~90 trillion EUR is enough.
- 2026-11-01 — Rounding only where results have extra decimals: `multiplyBy`
  and `allocate`, half-up default, half-even available; `parse` never rounds.
- 2026-11-01 — Typed errors (`MoneyError` and three subclasses), never `NaN`.
- 2026-11-01 — Written in-house, zero runtime dependencies; fast-check as a
  dev dependency for property tests.
- 2026-11-01 — Released as `v0.1.0` by the user (tag push) after the merge;
  agents never push tags.

## Open questions
- (none)

## Task breakdown
| # | Role | Task | Depends on | Issue |
|---|---|---|---|---|
| 1 | backend | [money] Implement `@albertoriorda95/money` v0.1 as in Data and API: values, parse/format, arithmetic, `multiplyBy` and `allocate` with rounding modes, JSON, typed errors; example and property tests (fast-check); README and CHANGELOG; version 0.1.0 | foundations#1 | - |

## Readiness checklist
- [x] goal, users and out of scope agreed
- [x] every flow has its error and edge cases
- [x] every screen has empty, loading, error and success states (not applicable)
- [x] contract changes written, breaking changes approved by the user (none)
- [x] acceptance criteria are observable
- [x] test seams agreed
- [x] reuse decided: team libraries and new dependencies named, or "none"
- [x] task breakdown with roles and dependencies
- [x] no open questions
