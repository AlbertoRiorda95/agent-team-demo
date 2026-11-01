import { type CurrencyCode } from "./currency.js";
import { InvalidAmountError } from "./errors.js";
import { parse, toDecimalString, type Money } from "./money.js";

/** The contract's `Amount`: `{ "amount": "12.50", "currency": "EUR" }`. */
export interface AmountJSON {
  amount: string;
  currency: CurrencyCode;
}

/** The contract's `Amount` for `money`. */
export function toJSON(money: Money): AmountJSON {
  return { amount: toDecimalString(money), currency: money.currency };
}

/**
 * A Money from the contract's `Amount`. Rejects anything else: not an
 * object, missing or extra properties, a bad amount or currency.
 */
export function fromJSON(value: unknown): Money {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidAmountError("Amount must be an object");
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "amount" || keys[1] !== "currency") {
    throw new InvalidAmountError(
      "Amount must have exactly the properties amount and currency",
    );
  }
  const { amount, currency } = value as Record<string, unknown>;
  return parse(amount as string, currency as CurrencyCode);
}
