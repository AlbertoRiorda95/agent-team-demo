// `npm run seed` as a child process on the test database (spec order-intake,
// Test seams: CLI): creation, status history, the idempotent re-run, the
// production guard with a reachable database and the seed user. Needs
// DATABASE_URL; skipped locally without it, required in CI. The cases without
// a database are in seed-guard.test.ts. Not covered: whether the data looks
// realistic (by eye).
import { asc, count, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { createLoginAttemptStore } from '../src/adapters/persistence/login-attempt-store.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import {
  loginAttempts,
  orderLines,
  orders,
  staffUsers,
  statusChanges,
} from '../src/adapters/persistence/schema.js';
import { createSessionStore } from '../src/adapters/persistence/session-store.js';
import { createStaffUserStore } from '../src/adapters/persistence/staff-user-store.js';
import { createArgon2PasswordHasher } from '../src/adapters/security/argon2-password-hasher.js';
import { createHmacSessionTokens } from '../src/adapters/security/hmac-session-tokens.js';
import { SEED_STAFF_EMAIL, UNUSABLE_PASSWORD_HASH } from '../src/application/seed-orders.js';
import { createStaffAuth } from '../src/application/staff-auth.js';
import { applyStatusChain } from '../src/domain/order-status.js';
import type { OrderStatus } from '../src/domain/order.js';
import { runSeed } from './seed-cli.js';
import { testDatabaseUrl } from './test-database.js';

const databaseUrl = testDatabaseUrl();

describe.runIf(databaseUrl)('seed with the test database (DATABASE_URL)', () => {
  const url = databaseUrl ?? '';
  const COUNT = 12;
  let database: Database;

  beforeAll(async () => {
    database = openDatabase(url);
    await applyMigrations(database.db);
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await database.close();
  });

  async function cleanUp(): Promise<void> {
    // status changes go with their orders (on delete cascade)
    await database.db.delete(orders).where(like(orders.externalReference, 'seed-%'));
    await database.db.delete(staffUsers).where(eq(staffUsers.email, SEED_STAFF_EMAIL));
    await database.db.delete(loginAttempts).where(eq(loginAttempts.email, SEED_STAFF_EMAIL));
  }

  async function seedRows() {
    return database.db
      .select()
      .from(orders)
      .where(like(orders.externalReference, 'seed-%'))
      .orderBy(asc(orders.externalReference));
  }

  async function seedUser() {
    const rows = await database.db
      .select()
      .from(staffUsers)
      .where(eq(staffUsers.email, SEED_STAFF_EMAIL));
    return rows[0];
  }

  async function counts() {
    const rows = await seedRows();
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return { orders: 0, lines: 0, changes: 0 };
    const [lines] = await database.db
      .select({ n: count() })
      .from(orderLines)
      .where(inArray(orderLines.orderId, ids));
    const [changes] = await database.db
      .select({ n: count() })
      .from(statusChanges)
      .where(inArray(statusChanges.orderId, ids));
    return { orders: rows.length, lines: lines?.n ?? 0, changes: changes?.n ?? 0 };
  }

  it('NODE_ENV=production writes nothing, even with a reachable database', async () => {
    const res = await runSeed(['--count', '3'], url, { NODE_ENV: 'production' });
    expect(res.code).toBe(1);
    expect(await counts()).toEqual({ orders: 0, lines: 0, changes: 0 });
    expect(await seedUser()).toBeUndefined();
  });

  it('creates the orders with a consistent status history', async () => {
    const res = await runSeed(['--count', String(COUNT)], url);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(`${String(COUNT)} orders created, 0 already there`);

    const rows = await seedRows();
    expect(rows.map((r) => r.externalReference)).toEqual(
      Array.from({ length: COUNT }, (_, i) => `seed-${String(i + 1).padStart(4, '0')}`),
    );
    expect(new Set(rows.map((r) => r.currency))).toEqual(new Set(['EUR', 'USD', 'GBP', 'JPY']));
    expect(new Set(rows.map((r) => r.status))).toEqual(
      new Set(['new', 'paid', 'shipped', 'cancelled']),
    );

    const user = await seedUser();
    for (const row of rows) {
      expect(row.number).toMatch(/^ORD-\d{6,}$/);
      const changes = await database.db
        .select()
        .from(statusChanges)
        .where(eq(statusChanges.orderId, row.id))
        .orderBy(asc(statusChanges.at));
      const chain = changes.map((c) => ({
        from: c.fromStatus as OrderStatus,
        to: c.toStatus as OrderStatus,
      }));
      expect(applyStatusChain(chain)).toEqual({ status: row.status, version: row.version });
      for (const change of changes) {
        expect(change.changedBy).toBe(user?.id);
        expect(change.reason !== null).toBe(change.toStatus === 'cancelled');
        expect(change.at.getTime()).toBeGreaterThan(row.createdAt.getTime());
      }
      const lastChange = changes.at(-1);
      expect(row.updatedAt).toEqual(lastChange ? lastChange.at : row.createdAt);
    }
  });

  it('creates nothing when run again', async () => {
    const before = await counts();
    expect(before.orders).toBe(COUNT);
    const res = await runSeed(['--count', String(COUNT)], url);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(`0 orders created, ${String(COUNT)} already there`);
    expect(await counts()).toEqual(before);
  });

  it('leaves a seed staff user that cannot log in', async () => {
    expect(await seedUser()).toMatchObject({
      active: false,
      passwordHash: UNUSABLE_PASSWORD_HASH,
    });
    const auth = createStaffAuth({
      users: createStaffUserStore(database.db),
      sessions: createSessionStore(database.db),
      attempts: createLoginAttemptStore(database.db),
      hasher: createArgon2PasswordHasher(),
      tokens: createHmacSessionTokens('test-session-secret-of-32-characters!'),
      clock: () => new Date(),
    });
    for (const password of [UNUSABLE_PASSWORD_HASH, '', 'correct horse battery']) {
      expect(await auth.logIn({ email: SEED_STAFF_EMAIL, password })).toEqual({
        kind: 'invalid',
      });
    }
  });
});
