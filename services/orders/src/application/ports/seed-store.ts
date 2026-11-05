import type { OrderStatus } from '../../domain/order.js';

/** One status change to write, oldest first. */
export interface NewStatusChange {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly reason?: string;
  readonly at: Date;
}

/** Port: what only the development seed writes (order-intake, flow 4). */
export interface SeedStore {
  /**
   * Creates the seed staff account, or resets it when it exists: inactive,
   * with the given (unusable) password hash and no sessions. Returns its id.
   */
  ensureSeedStaffUser(user: {
    readonly email: string;
    readonly name: string;
    readonly passwordHash: string;
  }): Promise<string>;
  /**
   * In one transaction, only when the order is still `new` at version 1:
   * writes the changes (by `changedBy`) and sets the order's status, version
   * and updatedAt. Returns false, writing nothing, when the order has moved.
   */
  applyHistory(
    orderId: string,
    changedBy: string,
    changes: readonly NewStatusChange[],
    result: { readonly status: OrderStatus; readonly version: number; readonly updatedAt: Date },
  ): Promise<boolean>;
}
