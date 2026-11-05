// The status rules of an order (project design, Decisions 2026-11-01):
// new → paid → shipped; new or paid → cancelled; shipped and cancelled are
// final. Every change adds 1 to the order's version.
import type { OrderStatus } from './order.js';

const ALLOWED: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  new: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

/** True when an order in status `from` may move to `to`. */
export function canChangeStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** One step of a status history: `from` → `to`. */
export interface StatusStep {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
}

/** Thrown when a chain of status changes breaks the rules. */
export class InvalidStatusChainError extends Error {
  override readonly name = 'InvalidStatusChainError';
}

/**
 * Checks a status history that starts from `new` (oldest first) and returns
 * the order's resulting status and version (1 + the number of changes).
 */
export function applyStatusChain(steps: readonly StatusStep[]): {
  readonly status: OrderStatus;
  readonly version: number;
} {
  let status: OrderStatus = 'new';
  for (const step of steps) {
    if (step.from !== status || !canChangeStatus(step.from, step.to)) {
      throw new InvalidStatusChainError(
        `A status change ${step.from} → ${step.to} is not allowed from ${status}`,
      );
    }
    status = step.to;
  }
  return { status, version: 1 + steps.length };
}
