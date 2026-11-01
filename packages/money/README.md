# @albertoriorda95/money

Amounts, currencies, rounding and formatting for the Orders project: the one
place where the service and the web app do arithmetic on amounts or format
them. Exact integer arithmetic on minor units, no floats, no `NaN`, no runtime
dependencies; runs in Node 24 and in the browser.

Design: `docs/design/money-library.md`.

## Install
Install it from GitHub Packages (the repository's `.npmrc` maps the
`@albertoriorda95` scope; run `./ci/registry.sh login` first). Never import it
through a relative path or a workspace link.

```sh
npm install @albertoriorda95/money@^0.1.0
```

## Example

```ts
import {
  parse, multiply, sum, toJSON, format, allocate, multiplyBy,
} from "@albertoriorda95/money";

const unitPrice = parse("12.50", "EUR");             // { minor: 1250, currency: "EUR" }
const shipping = parse("4.90", "EUR");
const total = sum([multiply(unitPrice, 3), shipping]); // 42.40 EUR

toJSON(total);             // { amount: "42.40", currency: "EUR" }
format(total, "en-US");    // "€42.40"
format(total, "de-DE");    // "42,40 €" (U+00A0 before €)

allocate(parse("10.00", "EUR"), [1, 1, 1]);   // 3.34, 3.33, 3.33
multiplyBy(parse("1.25", "EUR"), "0.1");      // 0.13 (half-up)
multiplyBy(parse("1.25", "EUR"), "0.1", "half-even"); // 0.12
```

## API
Everything is exported from the package root (`src/index.ts`).

### Currencies
- `type CurrencyCode = "EUR" | "USD" | "GBP" | "JPY"`.
- `currencies`: code → `{ code, minorDigits }` (EUR, USD, GBP 2; JPY 0).
- `isCurrencyCode(x): x is CurrencyCode`.

### Values
- `type Money = Readonly<{ minor: number; currency: CurrencyCode }>`: frozen;
  `minor` is always a safe integer (`Number.isSafeInteger`). Any operation
  whose result leaves that range throws `InvalidAmountError`.
- `parse(decimal, currency)`: `"12.50"`, `"-0.05"`, `"1250"` (JPY). Never
  rounds: more decimals than the currency allows (`"12.505"` EUR, `"10.5"`
  JPY), exponents (`"1e3"`), empty strings and anything that is not
  `-?digits(.digits)?` throw `InvalidAmountError`.
- `fromMinor(minor, currency)`: from a safe integer of minor units.
- `toDecimalString(money)`: always the currency's minor digits (`"12.50"`,
  `"1250"`).

### Arithmetic (exact)
- `add(a, b)`, `subtract(a, b)`: same currency.
- `multiply(money, integer)`: a safe integer factor (a quantity).
- `sum(list)`: a non-empty list in one currency.

### Rounding
- `type RoundingMode = "half-up" | "half-even"`; half-up rounds .5 away from
  zero, half-even to the even neighbour. Negative amounts round symmetrically.
- `multiplyBy(money, factor, mode = "half-up")`: `factor` is a decimal string
  (`"0.15"`, `"-1.5"`), the result is rounded to the currency's minor digits.
- `allocate(money, ratios)`: splits with the largest remainder method; the
  parts always add up to `money`, ties go to the earlier parts, a zero ratio
  gets zero, a negative amount splits like its opposite. Ratios are finite,
  non-negative numbers, not all zero; decimal ratios are read as their
  shortest decimal form (`0.7` is 7/10).

### Comparison
- `equals(a, b)`: same currency and amount (`false` across currencies).
- `compare(a, b)`: `-1 | 0 | 1`, same currency only.
- `isZero(money)`, `isNegative(money)`.

### Formatting
- `format(money, locale, { currencyDisplay?: "symbol" | "code" })`:
  `Intl.NumberFormat` with the currency's minor digits; the currency is
  always shown. `€1,234.50` (en-US), `1.234,50 €` (de-DE), `￥1,250` (ja-JP),
  `EUR 1,234.50` with `"code"`. Intl separates the symbol or code with a
  non-breaking space (U+00A0) where the locale puts one.

### JSON
- `toJSON(money)` → `{ amount: string, currency }`, the `Amount` schema of
  `services/orders/openapi.yaml`.
- `fromJSON(value)`: the reverse; rejects anything that is not exactly that
  shape.

### Errors
All extend `MoneyError` (which extends `Error`):
- `UnknownCurrencyError`: a currency code not in `currencies`.
- `InvalidAmountError`: not a decimal string, too many decimals, outside the
  safe integer range, bad ratios or factor, a bad `Amount` object.
- `CurrencyMismatchError`: two currencies in `add`, `subtract`, `sum`,
  `compare`.

An unknown rounding mode passed by an untyped caller throws `MoneyError`.

## Develop
This is a standalone npm project with its own lockfile, not a root workspace.
From the repository root:

```sh
npm ci --prefix packages/money
npm --prefix packages/money run lint
npm --prefix packages/money run typecheck
npm --prefix packages/money run build   # ESM + .d.ts in dist/
npm test --prefix packages/money        # Vitest examples + fast-check properties
```

Releases are published by `.github/workflows/publish.yml` when a `v*` tag is
pushed; see `CHANGELOG.md`.
