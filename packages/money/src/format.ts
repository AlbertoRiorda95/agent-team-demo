import { currencyOf } from "./currency.js";
import { assertMoney, toDecimalString, type Money } from "./money.js";

/** Options of `format`. */
export interface FormatOptions {
  /** `"symbol"` (default): `€12.50`; `"code"`: `EUR 12.50`. */
  currencyDisplay?: "symbol" | "code";
}

/**
 * Formats an amount for `locale` with `Intl.NumberFormat`, always with the
 * currency and its minor digits: `€1,234.50` (en-US), `1.234,50 €` (de-DE).
 */
export function format(
  money: Money,
  locale: string,
  options: FormatOptions = {},
): string {
  assertMoney(money);
  const { minorDigits } = currencyOf(money.currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    currencyDisplay: options.currencyDisplay ?? "symbol",
    minimumFractionDigits: minorDigits,
    maximumFractionDigits: minorDigits,
  });
  // A decimal string keeps every digit exact, even near the safe-integer limit.
  return formatter.format(toDecimalString(money) as Intl.StringNumericLiteral);
}
