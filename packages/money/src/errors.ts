/** Base class of every error this library throws. */
export class MoneyError extends Error {
  override name = "MoneyError";
}

/** A currency code that is not in `currencies`. */
export class UnknownCurrencyError extends MoneyError {
  override name = "UnknownCurrencyError";
}

/**
 * An amount, factor or ratio list that cannot be used: not a decimal string,
 * too many decimals, outside the safe integer range, bad ratios or factor.
 */
export class InvalidAmountError extends MoneyError {
  override name = "InvalidAmountError";
}

/** An operation between two amounts in different currencies. */
export class CurrencyMismatchError extends MoneyError {
  override name = "CurrencyMismatchError";
}
