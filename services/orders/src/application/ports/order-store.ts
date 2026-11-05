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

/** Port: persistence of orders. */
export interface OrderStore {
  findByExternalReference(externalReference: string): Promise<OrderRecord | undefined>;
  /**
   * Stores the order, its lines and a new number (`numberFor` of the next
   * sequence value) in one transaction, in status `new`, version 1.
   * Throws ExternalReferenceTakenError when the reference is already used.
   */
  insert(
    draft: OrderDraft,
    options: { readonly now: Date; readonly numberFor: (sequenceValue: number) => string },
  ): Promise<OrderRecord>;
}
