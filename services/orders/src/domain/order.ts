// The order (order-intake): the rules of a new order. Every amount is parsed
// with `money` in the order's currency (never rounded, never a float), each
// line total is unitPrice × quantity, the total is lines + shipping.
import {
  InvalidAmountError,
  isCurrencyCode,
  isNegative,
  multiply,
  parse,
  sum,
  type CurrencyCode,
  type Money,
} from '@albertoriorda95/money';

export const ORDER_STATUSES = ['new', 'paid', 'shipped', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MAX_QUANTITY = 10_000;
export const MAX_ITEMS = 200;

export interface Customer {
  readonly name: string;
  readonly email: string;
}

export interface Address {
  readonly name: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly postalCode: string;
  /** ISO 3166-1 alpha-2. */
  readonly country: string;
}

/** An order as it arrives from the order source (amounts as decimal strings). */
export interface NewOrderInput {
  readonly externalReference: string;
  readonly currency: string;
  readonly customer: Customer;
  readonly shippingAddress: Address;
  readonly items: readonly {
    readonly sku: string;
    readonly name: string;
    readonly quantity: number;
    readonly unitPrice: string;
  }[];
  readonly shippingCost: string;
}

export interface OrderLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

/** A valid new order, before it has a number: what is stored. */
export interface OrderDraft {
  readonly externalReference: string;
  readonly currency: CurrencyCode;
  readonly customer: Customer;
  readonly shippingAddress: Address;
  readonly items: readonly OrderLine[];
  readonly shippingCost: Money;
  readonly total: Money;
}

export interface FieldError {
  /** JSON path of the invalid field, e.g. `items[0].unitPrice`. */
  readonly field: string;
  readonly message: string;
}

/** Thrown when a new order breaks a rule; lists every invalid field. */
export class InvalidOrderError extends Error {
  override readonly name = 'InvalidOrderError';
  constructor(readonly errors: readonly FieldError[]) {
    super('The order is not valid.');
  }
}

const COUNTRY = /^[A-Z]{2}$/;

/**
 * Validates a new order and computes its line totals and total. Throws
 * InvalidOrderError with every invalid field (not only the first one).
 */
export function draftOrder(input: NewOrderInput): OrderDraft {
  const errors: FieldError[] = [];
  const fail = (field: string, message: string) => errors.push({ field, message });

  if (input.externalReference.trim() === '') fail('externalReference', 'must not be empty');
  if (!COUNTRY.test(input.shippingAddress.country)) {
    fail('shippingAddress.country', 'must be an ISO 3166-1 alpha-2 code (e.g. IT)');
  }
  if (input.items.length === 0) fail('items', 'must contain at least one item');
  if (input.items.length > MAX_ITEMS) {
    fail('items', `must contain at most ${String(MAX_ITEMS)} items`);
  }

  if (!isCurrencyCode(input.currency)) {
    fail('currency', 'is not a supported currency');
    // the amounts cannot be read without a currency
    throw new InvalidOrderError(errors);
  }
  const currency = input.currency;

  const lines: OrderLine[] = [];
  input.items.forEach((item, i) => {
    const at = `items[${String(i)}]`;
    const quantityOk = Number.isInteger(item.quantity) && item.quantity >= 1;
    if (!quantityOk) fail(`${at}.quantity`, 'must be an integer of at least 1');
    else if (item.quantity > MAX_QUANTITY) {
      fail(`${at}.quantity`, `must be at most ${String(MAX_QUANTITY)}`);
    }
    const unitPrice = parseAmount(item.unitPrice, currency, `${at}.unitPrice`, fail);
    if (!unitPrice || !quantityOk || item.quantity > MAX_QUANTITY) return;
    const lineTotal = exact(() => multiply(unitPrice, item.quantity));
    if (!lineTotal) {
      fail(`${at}.unitPrice`, 'is too large for this quantity');
      return;
    }
    lines.push({ sku: item.sku, name: item.name, quantity: item.quantity, unitPrice, lineTotal });
  });
  const shippingCost = parseAmount(input.shippingCost, currency, 'shippingCost', fail);

  if (errors.length > 0 || !shippingCost) throw new InvalidOrderError(errors);

  const total = exact(() => sum([...lines.map((l) => l.lineTotal), shippingCost]));
  if (!total) throw new InvalidOrderError([{ field: 'items', message: 'the total is too large' }]);

  return {
    externalReference: input.externalReference,
    currency,
    customer: input.customer,
    shippingAddress: input.shippingAddress,
    items: lines,
    shippingCost,
    total,
  };
}

/** A stored line with its line total (unitPrice × quantity), recomputed exactly. */
export function orderLine(
  sku: string,
  name: string,
  quantity: number,
  unitPrice: Money,
): OrderLine {
  return { sku, name, quantity, unitPrice, lineTotal: multiply(unitPrice, quantity) };
}

/** `ORD-` + the sequence value on at least 6 digits (`ORD-000001`, `ORD-1234567`). */
export function formatOrderNumber(sequenceValue: number): string {
  if (!Number.isSafeInteger(sequenceValue) || sequenceValue < 1) {
    throw new RangeError('An order number comes from a positive integer');
  }
  return `ORD-${String(sequenceValue).padStart(6, '0')}`;
}

function parseAmount(
  raw: string,
  currency: CurrencyCode,
  field: string,
  fail: (field: string, message: string) => void,
): Money | undefined {
  let money: Money;
  try {
    money = parse(raw, currency);
  } catch (error) {
    if (!(error instanceof InvalidAmountError)) throw error;
    fail(field, `must be a decimal amount with at most the ${currency} minor digits`);
    return undefined;
  }
  if (isNegative(money)) {
    fail(field, 'must not be negative');
    return undefined;
  }
  return money;
}

/** The result, or `undefined` when it leaves the safe integer range. */
function exact(operation: () => Money): Money | undefined {
  try {
    return operation();
  } catch (error) {
    if (error instanceof InvalidAmountError) return undefined;
    throw error;
  }
}
