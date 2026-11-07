import type { CurrencyCode, Money } from '@albertoriorda95/money';
import type { Address, Customer, OrderDraft, OrderLine, OrderStatus } from '../../domain/order.js';

/** One status change of an order, oldest first in `history`. */
export interface StatusChangeRecord {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly reason?: string;
  readonly changedBy: { readonly id: string; readonly name: string };
  readonly at: Date;
}

/** A stored order, as the use cases see it. */
export interface OrderRecord {
  readonly id: string;
  readonly number: string;
  readonly externalReference: string;
  readonly status: OrderStatus;
  readonly version: number;
  readonly currency: CurrencyCode;
  readonly customer: Customer;
  readonly shippingAddress: Address;
  readonly items: readonly OrderLine[];
  readonly shippingCost: Money;
  readonly total: Money;
  readonly history: readonly StatusChangeRecord[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Thrown by `insert` when an order with this externalReference exists (unique index). */
export class ExternalReferenceTakenError extends Error {
  override readonly name = 'ExternalReferenceTakenError';
  constructor() {
    super('An order with this externalReference already exists.');
  }
}

/** One row of the orders list (orders-list). */
export interface OrderSummaryRecord {
  readonly number: string;
  readonly status: OrderStatus;
  readonly customerName: string;
  readonly total: Money;
  readonly createdAt: Date;
}

/** What the orders list asks the store for; `search` is already trimmed and non-empty. */
export interface OrderListQuery {
  readonly status?: OrderStatus;
  /** Case-insensitive contained text of number, customer name or email; taken literally. */
  readonly search?: string;
  readonly offset: number;
  readonly limit: number;
}

export interface OrderListResult {
  readonly items: readonly OrderSummaryRecord[];
  /** Number of orders matching status and search, whatever the page. */
  readonly total: number;
}

/** Port: persistence of orders. */
export interface OrderStore {
  findByExternalReference(externalReference: string): Promise<OrderRecord | undefined>;
  /**
   * The order with this exact number, its lines in the order they were sent
   * and its status history oldest first; `undefined` when there is none.
   */
  findByNumber(number: string): Promise<OrderRecord | undefined>;
  /**
   * Stores the order, its lines and a new number (`numberFor` of the next
   * sequence value) in one transaction, in status `new`, version 1.
   * Throws ExternalReferenceTakenError when the reference is already used.
   */
  insert(
    draft: OrderDraft,
    options: { readonly now: Date; readonly numberFor: (sequenceValue: number) => string },
  ): Promise<OrderRecord>;
  /**
   * One page of orders, `createdAt` descending then `number` descending, and
   * the total of the filter. An offset at or beyond the total gives no items.
   */
  list(query: OrderListQuery): Promise<OrderListResult>;
}
