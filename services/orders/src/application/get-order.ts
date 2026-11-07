// Use case of the order detail (order-detail): one order with its lines and
// its status history, by number.
import type { OrderRecord, OrderStore } from './ports/order-store.js';

export interface GetOrderDeps {
  readonly store: OrderStore;
}

/**
 * The order with this number, or `undefined` when there is none. The number
 * is already validated at the edge (the contract's `OrderNumber` pattern).
 */
export async function getOrder(
  deps: GetOrderDeps,
  number: string,
): Promise<OrderRecord | undefined> {
  return deps.store.findByNumber(number);
}
