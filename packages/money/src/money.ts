import { currencyOf, type CurrencyCode } from "./currency.js";
import {
  formatMinor,
  parseDecimal,
  pow10,
  toSafeNumber,
} from "./decimal.js";
import {
  CurrencyMismatchError,
  InvalidAmountError,
} from "./errors.js";

/**
 * An amount: an integer number of minor units (cents; yen for JPY) in a
 * currency. Immutable; `minor` is always a safe integer.
 */
export type Money = Readonly<{ minor: number; currency: CurrencyCode }>;

/** Builds a Money from a bigint number of minor units, checking the range. */
export function make(minor: bigint, currency: CurrencyCode): Money {
  return Object.freeze({ minor: toSafeNumber(minor), currency });
}

/** Checks that a value received at the edge is a valid Money. */
export function assertMoney(value: Money): Money {
  // Values may come from untyped callers: check them at runtime too.
  const candidate = value as unknown;
  if (typeof candidate !== "object" || candidate === null) {
    throw new InvalidAmountError("Not a Money value");
  }
  const { minor, currency } = candidate as Record<string, unknown>;
  currencyOf(currency);
  if (typeof minor !== "number" || !Number.isSafeInteger(minor)) {
    throw new InvalidAmountError("Money.minor must be a safe integer");
  }
  return value;
}

/** Throws `CurrencyMismatchError` unless `a` and `b` share a currency. */
export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(
      `Currency mismatch: ${a.currency} and ${b.currency}`,
    );
  }
}

/** A Money of `minor` minor units; `minor` must be a safe integer. */
export function fromMinor(minor: number, currency: CurrencyCode): Money {
  currencyOf(currency);
  if (typeof minor !== "number" || !Number.isSafeInteger(minor)) {
    throw new InvalidAmountError("minor must be a safe integer");
  }
  return make(BigInt(minor), currency);
}

/**
 * Parses a decimal string (`"12.50"`, `"-0.05"`, `"1250"` for JPY). Never
 * rounds: more decimals than the currency allows is `InvalidAmountError`.
 */
export function parse(decimal: string, currency: CurrencyCode): Money {
  const { minorDigits } = currencyOf(currency);
  const { units, scale } = parseDecimal(
    decimal,
    `${currency} amount`,
    minorDigits,
  );
  return make(units * pow10(minorDigits - scale), currency);
}

/** The decimal string with exactly the currency's minor digits. */
export function toDecimalString(money: Money): string {
  assertMoney(money);
  return formatMinor(money.minor, currencyOf(money.currency).minorDigits);
}
