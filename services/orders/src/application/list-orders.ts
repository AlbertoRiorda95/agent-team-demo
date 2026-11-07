// Use case of the orders list (orders-list): one page of orders, newest
// first, filtered by status and searched by number, customer name or email.
import type { OrderStatus } from '../domain/order.js';
import type { OrderStore, OrderSummaryRecord } from './ports/order-store.js';

export interface ListOrdersDeps {
  readonly store: OrderStore;
}

/** The list request, already validated at the edge (page ≥ 1, 1 ≤ pageSize ≤ 100). */
export interface ListOrdersInput {
  readonly status?: OrderStatus | undefined;
  readonly q?: string | undefined;
  readonly page: number;
  readonly pageSize: number;
}

export interface OrderPage {
  readonly items: readonly OrderSummaryRecord[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/**
 * `q` is trimmed and an empty one means no search. A page beyond the last
 * gives no items and the real total (the web app jumps to the last page).
 */
export async function listOrders(deps: ListOrdersDeps, input: ListOrdersInput): Promise<OrderPage> {
  const search = input.q?.trim();
  const { items, total } = await deps.store.list({
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(search ? { search } : {}),
    offset: (input.page - 1) * input.pageSize,
    limit: input.pageSize,
  });
  return { items, page: input.page, pageSize: input.pageSize, total };
}
