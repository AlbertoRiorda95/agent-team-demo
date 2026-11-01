// Exact decimal helpers on bigint. Internal: not exported by index.ts.
import { InvalidAmountError } from "./errors.js";

/** The decimal string format of the contract's `Amount.amount`. */
const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

/** A decimal number as `units / 10 ** scale`. */
export interface Decimal {
  units: bigint;
  scale: number;
}

/** Digits of `Number.MAX_SAFE_INTEGER` (9007199254740991). */
const MAX_DIGITS = 16;

/**
 * Parses a decimal string (`"-12.50"`); anything else is `InvalidAmountError`.
 * With `maxScale` (amounts), more decimals than `maxScale` or an integer part
 * that cannot fit the safe range are rejected before any bigint is built, so
 * a huge untrusted string costs no more than the regex scan. Error messages
 * never echo the input: it may be untrusted and end up in logs.
 */
export function parseDecimal(
  text: unknown,
  what: string,
  maxScale?: number,
): Decimal {
  if (typeof text !== "string") {
    throw new InvalidAmountError(`${what} must be a decimal string`);
  }
  const match = DECIMAL.exec(text);
  if (!match) {
    throw new InvalidAmountError(`${what} is not a decimal string`);
  }
  const [, sign = "", whole = "", fraction = ""] = match;
  if (maxScale !== undefined) {
    if (fraction.length > maxScale) {
      throw new InvalidAmountError(
        `${what} has more than ${String(maxScale)} decimals`,
      );
    }
    if (whole.replace(/^0+/, "").length > MAX_DIGITS) {
      throw new InvalidAmountError(
        `${what} is outside the safe integer range of minor units`,
      );
    }
  }
  const units = BigInt(whole + fraction);
  return { units: sign === "-" ? -units : units, scale: fraction.length };
}

/** `10 ** n` as a bigint. */
export function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** Converts a bigint to a safe-integer number, or `InvalidAmountError`. */
export function toSafeNumber(value: bigint): number {
  if (value > MAX || value < -MAX) {
    throw new InvalidAmountError(
      "Amount is outside the safe integer range of minor units",
    );
  }
  // `+ 0` turns a possible -0 into 0.
  return Number(value) + 0;
}

/** The decimal string of `minor` minor units with `digits` decimals. */
export function formatMinor(minor: number, digits: number): string {
  const negative = minor < 0;
  const abs = String(Math.abs(minor)).padStart(digits + 1, "0");
  const whole = abs.slice(0, abs.length - digits);
  const fraction = abs.slice(abs.length - digits);
  const body = digits === 0 ? whole : `${whole}.${fraction}`;
  return negative ? `-${body}` : body;
}
