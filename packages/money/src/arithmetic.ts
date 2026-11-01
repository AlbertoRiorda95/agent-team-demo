import { parseDecimal, pow10 } from "./decimal.js";
import { InvalidAmountError, MoneyError } from "./errors.js";
import { assertMoney, assertSameCurrency, make, type Money } from "./money.js";

/** How a result with extra decimals is rounded to the minor unit. */
export type RoundingMode = "half-up" | "half-even";

/** `a + b`, same currency. */
export function add(a: Money, b: Money): Money {
  assertMoney(a);
  assertMoney(b);
  assertSameCurrency(a, b);
  return make(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

/** `a - b`, same currency. */
export function subtract(a: Money, b: Money): Money {
  assertMoney(a);
  assertMoney(b);
  assertSameCurrency(a, b);
  return make(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

/** `money * factor` for a safe integer `factor` (a quantity). */
export function multiply(money: Money, factor: number): Money {
  assertMoney(money);
  if (typeof factor !== "number" || !Number.isSafeInteger(factor)) {
    throw new InvalidAmountError("multiply needs a safe integer factor");
  }
  return make(BigInt(money.minor) * BigInt(factor), money.currency);
}

/** The sum of a non-empty list of amounts in one currency. */
export function sum(list: readonly Money[]): Money {
  const [first] = list;
  if (first === undefined) {
    throw new InvalidAmountError("sum needs at least one amount");
  }
  assertMoney(first);
  let total = 0n;
  for (const item of list) {
    assertMoney(item);
    assertSameCurrency(first, item);
    total += BigInt(item.minor);
  }
  return make(total, first.currency);
}

/** `n / d` rounded to an integer with `mode`; `d` is positive. */
function divideRounded(n: bigint, d: bigint, mode: RoundingMode): bigint {
  const quotient = n / d; // truncates toward zero
  const remainder = n % d; // has the sign of n
  if (remainder === 0n) return quotient;
  const away = quotient + (n < 0n ? -1n : 1n);
  const twice = 2n * (remainder < 0n ? -remainder : remainder);
  if (twice > d) return away;
  if (twice < d) return quotient;
  return mode === "half-up" || quotient % 2n !== 0n ? away : quotient;
}

/**
 * `money * factor` for a decimal string `factor` (`"0.15"`), rounded to the
 * currency's minor digits with `mode` (half-up: away from zero on .5).
 */
export function multiplyBy(
  money: Money,
  factor: string,
  mode: RoundingMode = "half-up",
): Money {
  assertMoney(money);
  // Untyped callers can pass anything: check the mode at runtime too.
  const modeValue: unknown = mode;
  if (modeValue !== "half-up" && modeValue !== "half-even") {
    throw new MoneyError(`Unknown rounding mode: ${String(modeValue)}`);
  }
  const { units, scale } = parseDecimal(factor, "Factor");
  const product = BigInt(money.minor) * units;
  return make(divideRounded(product, pow10(scale), mode), money.currency);
}

/** A non-negative finite ratio as an exact decimal. */
function ratioToDecimal(ratio: unknown): { units: bigint; scale: number } {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0) {
    throw new InvalidAmountError("Ratios must be finite, non-negative numbers");
  }
  // The shortest decimal that round-trips: 0.7 is "0.7", 1e-7 is "1e-7".
  const [mantissa = "", exponentText = "0"] = String(ratio).split("e");
  const { units, scale } = parseDecimal(mantissa, "Ratio");
  const exponent = Number(exponentText);
  return exponent >= scale
    ? { units: units * pow10(exponent - scale), scale: 0 }
    : { units, scale: scale - exponent };
}

/**
 * Splits `money` in parts proportional to `ratios` with the largest
 * remainder method: the parts always add up to `money`, ties go to the
 * earlier parts. A negative amount splits like its opposite.
 */
export function allocate(money: Money, ratios: readonly number[]): Money[] {
  assertMoney(money);
  if (!Array.isArray(ratios) || ratios.length === 0) {
    throw new InvalidAmountError("allocate needs at least one ratio");
  }
  const decimals = ratios.map(ratioToDecimal);
  const scale = Math.max(...decimals.map((d) => d.scale));
  const weights = decimals.map((d) => d.units * pow10(scale - d.scale));
  const totalWeight = weights.reduce((a, b) => a + b, 0n);
  if (totalWeight === 0n) {
    throw new InvalidAmountError("allocate needs at least one non-zero ratio");
  }

  const negative = money.minor < 0;
  const amount = BigInt(Math.abs(money.minor));
  const parts = weights.map((weight) => amount * weight / totalWeight);
  const remainders = weights.map((weight) => amount * weight % totalWeight);
  let leftover = amount - parts.reduce((a, b) => a + b, 0n);

  // Largest remainder first; Array.prototype.sort is stable, so equal
  // remainders keep their order and the earlier parts win the ties.
  const order = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((x, y) => (x.remainder === y.remainder ? 0 : x.remainder > y.remainder ? -1 : 1));
  for (const { index } of order) {
    if (leftover === 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    leftover -= 1n;
  }

  return parts.map((part) => make(negative ? -part : part, money.currency));
}
