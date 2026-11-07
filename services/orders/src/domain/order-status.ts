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

/** The longest cancellation reason, after trimming (order-detail). */
export const MAX_REASON_LENGTH = 500;

/** Thrown when a status change request breaks an input rule (422 at the edge). */
export class InvalidStatusChangeError extends Error {
  override readonly name = 'InvalidStatusChangeError';
  constructor(
    readonly field: string,
    readonly problem: string,
  ) {
    super(`${field} ${problem}`);
  }
}

/**
 * The reason to store with a change to `to`: only a cancellation may have
 * one; it is trimmed, at most MAX_REASON_LENGTH characters, and an empty one
 * is no reason. Throws InvalidStatusChangeError otherwise.
 */
export function statusChangeReason(
  to: OrderStatus,
  reason: string | undefined,
): string | undefined {
  if (reason === undefined) return undefined;
  if (to !== 'cancelled') {
    throw new InvalidStatusChangeError('reason', 'is allowed only when cancelling an order');
  }
  const trimmed = reason.trim();
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new InvalidStatusChangeError(
      'reason',
      `must be at most ${String(MAX_REASON_LENGTH)} characters`,
    );
  }
  return trimmed === '' ? undefined : trimmed;
}

/** Why a status change cannot be applied to the order as it is now. */
export type StatusChangeConflict = 'stale-version' | 'not-allowed';

/**
 * Checks a change to `to` of an order in state `current`, requested for
 * `expectedVersion`: the version first (a client with a stale order must
 * reload, never see a misleading transition error), then the transition.
 * `undefined` when the change may be applied.
 */
export function statusChangeConflict(
  current: { readonly status: OrderStatus; readonly version: number },
  expectedVersion: number,
  to: OrderStatus,
): StatusChangeConflict | undefined {
  if (current.version !== expectedVersion) return 'stale-version';
  if (!canChangeStatus(current.status, to)) return 'not-allowed';
  return undefined;
}
