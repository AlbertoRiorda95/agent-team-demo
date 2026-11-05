// Use case of the development seed (order-intake, flow 4): N demo orders
// created through the order-creation use case, so running it again creates
// nothing, plus their status history by an inactive seed staff account.
import { applyStatusChain } from '../domain/order-status.js';
import { createOrder } from './create-order.js';
import type { OrderStore } from './ports/order-store.js';
import type { SeedStore } from './ports/seed-store.js';
import { seedOrders } from './seed-data.js';

export const SEED_STAFF_EMAIL = 'seed@example.test';
export const SEED_STAFF_NAME = 'Seed data';
/**
 * Not a PHC string: no password verifies against it (the Argon2 adapter
 * treats a malformed hash as a mismatch). With `active = false`, the seed
 * account can never log in.
 */
export const UNUSABLE_PASSWORD_HASH = '!seed-account-cannot-log-in';

export interface SeedOrdersDeps {
  readonly orders: OrderStore;
  readonly seed: SeedStore;
  readonly now: Date;
}

export interface SeedOrdersResult {
  /** Orders this run created. */
  readonly created: number;
  /** Orders that were already there (same externalReference). */
  readonly existing: number;
  /** Orders that got their status history in this run. */
  readonly withHistory: number;
}

export async function seedDemoOrders(
  deps: SeedOrdersDeps,
  count: number,
): Promise<SeedOrdersResult> {
  const seedUserId = await deps.seed.ensureSeedStaffUser({
    email: SEED_STAFF_EMAIL,
    name: SEED_STAFF_NAME,
    passwordHash: UNUSABLE_PASSWORD_HASH,
  });

  let created = 0;
  let existing = 0;
  let withHistory = 0;
  for (const demo of seedOrders(count, deps.now)) {
    // checked before anything is written for this order
    const result = applyStatusChain(demo.history);
    // PERF: one order per round trip; fine for a development seed of a few hundred orders
    const outcome = await createOrder(
      { store: deps.orders, clock: () => demo.createdAt },
      demo.input,
    );
    if (outcome.kind === 'created') created += 1;
    else existing += 1;

    const last = demo.history.at(-1);
    if (!last) continue;
    // also completes an order a crashed earlier run created but left at `new`
    const applied = await deps.seed.applyHistory(outcome.order.id, seedUserId, demo.history, {
      ...result,
      updatedAt: last.at,
    });
    if (applied) withHistory += 1;
  }
  return { created, existing, withHistory };
}
