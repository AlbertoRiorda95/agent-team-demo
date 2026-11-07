// Use case of the order detail (order-detail): a staff user moves an order to
// its next status, with optimistic concurrency on the order's version.
import type { OrderStatus } from '../domain/order.js';
import {
  statusChangeConflict,
  statusChangeReason,
  type StatusChangeConflict,
} from '../domain/order-status.js';
import type { Clock } from './ports/clock.js';
import type { OrderRecord, OrderStore } from './ports/order-store.js';

export interface ChangeOrderStatusDeps {
  readonly store: OrderStore;
  readonly clock: Clock;
}

export interface ChangeOrderStatusInput {
  /** Already matched against the contract's OrderNumber pattern. */
  readonly number: string;
  readonly to: OrderStatus;
  readonly reason?: string | undefined;
  /** The version of the order the client saw. */
  readonly version: number;
  /** The session user's id. */
  readonly changedBy: string;
}

export type ChangeOrderStatusResult =
  | { readonly kind: 'changed'; readonly order: OrderRecord }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly conflict: StatusChangeConflict;
      readonly currentStatus: OrderStatus;
      readonly currentVersion: number;
    };

/**
 * Checks the reason (InvalidStatusChangeError before anything is read), then
 * the version and the transition against the stored order, then writes the
 * change with a conditional update. When another change wins between the read
 * and the write, the order is read again and the result is a conflict with its
 * current status and version: of two concurrent changes exactly one applies.
 */
export async function changeOrderStatus(
  deps: ChangeOrderStatusDeps,
  input: ChangeOrderStatusInput,
): Promise<ChangeOrderStatusResult> {
  const reason = statusChangeReason(input.to, input.reason);
  const order = await deps.store.findByNumber(input.number);
  if (!order) return { kind: 'not-found' };

  const conflict = statusChangeConflict(order, input.version, input.to);
  if (conflict) return conflictWith(order, conflict);

  const changed = await deps.store.changeStatus({
    orderId: order.id,
    from: order.status,
    expectedVersion: order.version,
    to: input.to,
    ...(reason === undefined ? {} : { reason }),
    changedBy: input.changedBy,
    at: deps.clock(),
  });
  if (changed) return { kind: 'changed', order: changed };

  // another change won the race: report the order as it is now
  const current = await deps.store.findByNumber(input.number);
  if (!current) return { kind: 'not-found' };
  return conflictWith(
    current,
    statusChangeConflict(current, input.version, input.to) ?? 'stale-version',
  );
}

function conflictWith(order: OrderRecord, conflict: StatusChangeConflict): ChangeOrderStatusResult {
  return {
    kind: 'conflict',
    conflict,
    currentStatus: order.status,
    currentVersion: order.version,
  };
}
