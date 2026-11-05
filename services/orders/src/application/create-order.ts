// Use case of the order source (order-intake): create an order, idempotent on
// its externalReference.
import { draftOrder, formatOrderNumber, type NewOrderInput } from '../domain/order.js';
import type { Clock } from './ports/clock.js';
import {
  ExternalReferenceTakenError,
  type OrderRecord,
  type OrderStore,
} from './ports/order-store.js';

export interface CreateOrderDeps {
  readonly store: OrderStore;
  readonly clock: Clock;
}

export type CreateOrderResult =
  | { readonly kind: 'created'; readonly order: OrderRecord }
  | { readonly kind: 'existing'; readonly order: OrderRecord };

/**
 * Validates the order (InvalidOrderError lists the invalid fields), then
 * stores it in status `new` with a new number. When an order with the same
 * externalReference exists, it is returned and nothing is written, whatever
 * else the input says: sources retry, they do not edit. Two concurrent
 * creations with one reference: the unique index decides, the loser gets the
 * winner's order.
 */
export async function createOrder(
  deps: CreateOrderDeps,
  input: NewOrderInput,
): Promise<CreateOrderResult> {
  const draft = draftOrder(input);
  const existing = await deps.store.findByExternalReference(draft.externalReference);
  if (existing) return { kind: 'existing', order: existing };
  try {
    const order = await deps.store.insert(draft, {
      now: deps.clock(),
      numberFor: formatOrderNumber,
    });
    return { kind: 'created', order };
  } catch (error) {
    if (!(error instanceof ExternalReferenceTakenError)) throw error;
    const winner = await deps.store.findByExternalReference(draft.externalReference);
    // the winner committed before our insert failed: it is there
    if (!winner) {
      throw new Error('The order with this externalReference vanished', { cause: error });
    }
    return { kind: 'existing', order: winner };
  }
}
