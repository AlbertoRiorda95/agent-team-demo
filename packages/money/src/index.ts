/**
 * `@albertoriorda95/money`: amounts, currencies, rounding and formatting.
 *
 * This is the package's only public entry (docs/design/money-library.md).
 */

/** The version of this package, kept in sync with `package.json`. */
export const VERSION = "0.1.0";

export {
  MoneyError,
  UnknownCurrencyError,
  InvalidAmountError,
  CurrencyMismatchError,
} from "./errors.js";
export {
  currencies,
  isCurrencyCode,
  type Currency,
  type CurrencyCode,
} from "./currency.js";
export {
  fromMinor,
  parse,
  toDecimalString,
  type Money,
} from "./money.js";
export {
  add,
  subtract,
  multiply,
  sum,
  multiplyBy,
  allocate,
  type RoundingMode,
} from "./arithmetic.js";
export { equals, compare, isZero, isNegative } from "./compare.js";
export { format, type FormatOptions } from "./format.js";
export { toJSON, fromJSON, type AmountJSON } from "./json.js";
