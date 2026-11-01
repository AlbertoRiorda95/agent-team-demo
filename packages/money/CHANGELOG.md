# Changelog

All notable changes to `@albertoriorda95/money`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses
[semantic versioning](https://semver.org/).

## [0.1.0] - 2026-11-01

### Added
- Currencies EUR, USD, GBP (2 minor digits) and JPY (0): `CurrencyCode`,
  `currencies`, `isCurrencyCode`.
- Immutable `Money` in safe-integer minor units: `parse` (never rounds),
  `fromMinor`, `toDecimalString`.
- Exact arithmetic: `add`, `subtract`, `multiply`, `sum`.
- Rounding: `multiplyBy` with a decimal factor and `RoundingMode`
  (`"half-up"` default, `"half-even"`); `allocate` with the largest
  remainder method.
- Comparison: `equals`, `compare`, `isZero`, `isNegative`.
- `format` with `Intl.NumberFormat` (`currencyDisplay` `"symbol"` or `"code"`).
- `toJSON` / `fromJSON` for the orders contract's `Amount`.
- Typed errors: `MoneyError`, `UnknownCurrencyError`, `InvalidAmountError`,
  `CurrencyMismatchError`.
