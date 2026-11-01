import { UnknownCurrencyError } from "./errors.js";

/** The currencies this library knows. */
export type CurrencyCode = "EUR" | "USD" | "GBP" | "JPY";

/** A currency and the number of digits of its minor unit. */
export interface Currency {
  readonly code: CurrencyCode;
  readonly minorDigits: number;
}

/** Every known currency, by code. */
export const currencies: Readonly<Record<CurrencyCode, Currency>> =
  Object.freeze({
    EUR: Object.freeze({ code: "EUR", minorDigits: 2 }),
    USD: Object.freeze({ code: "USD", minorDigits: 2 }),
    GBP: Object.freeze({ code: "GBP", minorDigits: 2 }),
    JPY: Object.freeze({ code: "JPY", minorDigits: 0 }),
  });

/** Whether `x` is one of the known currency codes. */
export function isCurrencyCode(x: unknown): x is CurrencyCode {
  return typeof x === "string" && Object.hasOwn(currencies, x);
}

/** The currency for `code`, or `UnknownCurrencyError`. */
export function currencyOf(code: unknown): Currency {
  if (!isCurrencyCode(code)) {
    // The code may be untrusted: quote it, escaped and truncated, for logs.
    const shown = JSON.stringify(String(code).slice(0, 8));
    throw new UnknownCurrencyError(`Unknown currency: ${shown}`);
  }
  return currencies[code];
}
