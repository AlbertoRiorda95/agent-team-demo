import { assertMoney, assertSameCurrency, type Money } from "./money.js";

/** Whether `a` and `b` are the same amount in the same currency. */
export function equals(a: Money, b: Money): boolean {
  assertMoney(a);
  assertMoney(b);
  return a.currency === b.currency && a.minor === b.minor;
}

/** -1, 0 or 1 as `a` is less than, equal to or greater than `b`; same currency. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertMoney(a);
  assertMoney(b);
  assertSameCurrency(a, b);
  if (a.minor === b.minor) return 0;
  return a.minor < b.minor ? -1 : 1;
}

/** Whether the amount is zero. */
export function isZero(money: Money): boolean {
  return assertMoney(money).minor === 0;
}

/** Whether the amount is below zero. */
export function isNegative(money: Money): boolean {
  return assertMoney(money).minor < 0;
}
