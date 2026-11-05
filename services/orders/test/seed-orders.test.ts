// The seed's generator, the status rules and the seed use case (spec
// order-intake, Test seams: Domain), with in-memory stores. The SQL and the
// command line are covered by seed-command.test.ts.
import { describe, expect, it } from 'vitest';
import { createArgon2PasswordHasher } from '../src/adapters/security/argon2-password-hasher.js';
import type { NewStatusChange, SeedStore } from '../src/application/ports/seed-store.js';
import { seedOrders, seedReference } from '../src/application/seed-data.js';
import {
  SEED_STAFF_EMAIL,
  seedDemoOrders,
  UNUSABLE_PASSWORD_HASH,
} from '../src/application/seed-orders.js';
import { draftOrder, ORDER_STATUSES } from '../src/domain/order.js';
import {
  applyStatusChain,
  canChangeStatus,
  InvalidStatusChainError,
} from '../src/domain/order-status.js';
import { memoryOrderStore } from './order-fixtures.js';

const NOW = new Date('2026-11-05T10:00:00Z');

describe('status rules', () => {
  it('allows new → paid → shipped and new or paid → cancelled, nothing else', () => {
    const allowed = ORDER_STATUSES.flatMap((from) =>
      ORDER_STATUSES.filter((to) => canChangeStatus(from, to)).map((to) => `${from}→${to}`),
    );
    expect(allowed.sort()).toEqual(['new→cancelled', 'new→paid', 'paid→cancelled', 'paid→shipped']);
  });

  it('gives version 1 + changes', () => {
    expect(applyStatusChain([])).toEqual({ status: 'new', version: 1 });
    expect(
      applyStatusChain([
        { from: 'new', to: 'paid' },
        { from: 'paid', to: 'shipped' },
      ]),
    ).toEqual({ status: 'shipped', version: 3 });
  });

  it('refuses a broken chain', () => {
    expect(() => applyStatusChain([{ from: 'new', to: 'shipped' }])).toThrow(
      InvalidStatusChainError,
    );
    expect(() => applyStatusChain([{ from: 'paid', to: 'shipped' }])).toThrow(
      InvalidStatusChainError,
    );
  });
});

describe('seed data', () => {
  const demo = seedOrders(40, NOW);

  it('uses seed-0001… references', () => {
    expect(demo.map((d) => d.input.externalReference).slice(0, 2)).toEqual([
      'seed-0001',
      'seed-0002',
    ]);
    expect(seedReference(9998)).toBe('seed-9999');
  });

  it('is deterministic', () => {
    expect(seedOrders(40, NOW)).toEqual(demo);
  });

  it('covers every currency and every status', () => {
    expect(new Set(demo.map((d) => d.input.currency))).toEqual(
      new Set(['EUR', 'USD', 'GBP', 'JPY']),
    );
    expect(new Set(demo.map((d) => applyStatusChain(d.history).status))).toEqual(
      new Set(ORDER_STATUSES),
    );
  });

  it('only produces valid orders and valid, dated histories', () => {
    for (const d of seedOrders(500, NOW)) {
      expect(() => draftOrder(d.input)).not.toThrow();
      expect(() => applyStatusChain(d.history)).not.toThrow();
      let previous = d.createdAt.getTime();
      for (const change of d.history) {
        expect(change.at.getTime()).toBeGreaterThan(previous);
        previous = change.at.getTime();
        expect(change.reason !== undefined).toBe(change.to === 'cancelled');
      }
      expect(previous).toBeLessThan(NOW.getTime());
    }
  });

  it('uses made-up emails only', () => {
    for (const d of demo) expect(d.input.customer.email).toMatch(/@example\.test$/);
  });
});

interface MemorySeedStore extends SeedStore {
  readonly user: { email: string; active: boolean; passwordHash: string } | undefined;
  readonly applied: Map<string, readonly NewStatusChange[]>;
}

function memorySeedStore(statusOf: (orderId: string) => string): MemorySeedStore {
  const applied = new Map<string, readonly NewStatusChange[]>();
  const state: { user: MemorySeedStore['user'] } = { user: undefined };
  return {
    get user() {
      return state.user;
    },
    applied,
    ensureSeedStaffUser(user) {
      state.user = { email: user.email, active: false, passwordHash: user.passwordHash };
      return Promise.resolve('seed-user-id');
    },
    applyHistory(orderId, _changedBy, changes) {
      if (applied.has(orderId) || statusOf(orderId) !== 'new') return Promise.resolve(false);
      applied.set(orderId, changes);
      return Promise.resolve(true);
    },
  };
}

describe('seedDemoOrders', () => {
  it('creates the orders once and their history once', async () => {
    const orders = memoryOrderStore();
    const seed = memorySeedStore(() => 'new');
    const first = await seedDemoOrders({ orders, seed, now: NOW }, 40);
    const withHistory = seedOrders(40, NOW).filter((d) => d.history.length > 0).length;
    expect(first).toEqual({ created: 40, existing: 0, withHistory });
    expect(orders.orders).toHaveLength(40);
    expect(orders.orders[0]?.createdAt).toEqual(seedOrders(40, NOW)[0]?.createdAt);

    const second = await seedDemoOrders({ orders, seed, now: NOW }, 40);
    expect(second).toEqual({ created: 0, existing: 40, withHistory: 0 });
    expect(orders.orders).toHaveLength(40);
  });

  it('creates an inactive seed staff user whose hash verifies no password', async () => {
    const seed = memorySeedStore(() => 'new');
    await seedDemoOrders({ orders: memoryOrderStore(), seed, now: NOW }, 1);
    expect(seed.user).toEqual({
      email: SEED_STAFF_EMAIL,
      active: false,
      passwordHash: UNUSABLE_PASSWORD_HASH,
    });
    const hasher = createArgon2PasswordHasher();
    expect(await hasher.verify(UNUSABLE_PASSWORD_HASH, UNUSABLE_PASSWORD_HASH)).toBe(false);
    expect(await hasher.verify(UNUSABLE_PASSWORD_HASH, '')).toBe(false);
  });
});
