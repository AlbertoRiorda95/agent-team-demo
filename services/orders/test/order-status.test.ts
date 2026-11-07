// POST /api/v1/orders/{number}/status through app.inject on the test database
// (spec order-detail, Test seams: API): every allowed transition writes the
// order (status, version + 1, updatedAt) and one status_changes row with the
// session user in one transaction; 409 and 422 write nothing; two parallel
// requests with one version: exactly one wins; 403 writes nothing.
// Needs DATABASE_URL; skipped locally without it, required in CI.
import { asc, eq, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/adapters/http/app.js';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import { createOrderStore } from '../src/adapters/persistence/order-store.js';
import { orders, staffUsers, statusChanges } from '../src/adapters/persistence/schema.js';
import { createOrder } from '../src/application/create-order.js';
import type { OrderRecord, OrderStore } from '../src/application/ports/order-store.js';
import type { StaffUserRecord } from '../src/application/ports/staff-user-store.js';
import { fakeAuth, VALID_TOKEN, WEB } from './fake-auth.js';
import { ORDERS_URL, TEST_API_KEY, validOrder } from './order-fixtures.js';
import { testDatabaseUrl } from './test-database.js';

const databaseUrl = testDatabaseUrl();
const HEADERS = { cookie: `session=${VALID_TOKEN}`, origin: WEB.publicOrigin };
const REF_PREFIX = 'order-status-test-';
const EMAIL_DOMAIN = 'order-status.test';
const START = Date.parse('2026-11-07T09:00:00.000Z');

describe.runIf(databaseUrl)('POST /orders/{number}/status (test database)', () => {
  let database: Database;
  let store: OrderStore;
  let app: FastifyInstance;
  let user: StaffUserRecord;
  let tick = 0;
  // every reading moves one minute on: history entries never share a timestamp
  const clock = () => new Date(START + 60_000 * tick++);
  let created = 0;

  beforeAll(async () => {
    database = openDatabase(databaseUrl ?? '');
    await applyMigrations(database.db);
    await cleanUp();
    store = createOrderStore(database.db);

    const [row] = await database.db
      .insert(staffUsers)
      .values({ email: `ana@${EMAIL_DOMAIN}`, name: 'Ana Ruiz', passwordHash: 'not-a-hash' })
      .returning();
    if (!row) throw new Error('no staff user inserted');
    user = { id: row.id, email: row.email, name: row.name, active: true, createdAt: row.createdAt };

    // the fake session resolves to a real staff user: changedBy references staff_users
    const auth = fakeAuth();
    app = buildApp({
      databaseHealth: { isReachable: () => Promise.resolve(true) },
      auth: {
        ...auth,
        authenticate: (token) => Promise.resolve(token === VALID_TOKEN ? user : undefined),
      },
      web: WEB,
      orders: { store, clock, apiKey: TEST_API_KEY },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await cleanUp();
    await database.close();
  });

  async function cleanUp(): Promise<void> {
    // status changes go with their orders (on delete cascade), before their users
    await database.db.delete(orders).where(like(orders.externalReference, `${REF_PREFIX}%`));
    await database.db.delete(staffUsers).where(like(staffUsers.email, `%@${EMAIL_DOMAIN}`));
  }

  async function newOrder(): Promise<OrderRecord> {
    created += 1;
    const input = validOrder({ externalReference: `${REF_PREFIX}${String(created)}` });
    return (await createOrder({ store, clock }, input)).order;
  }

  function change(number: string, payload: object, headers: Record<string, string> = HEADERS) {
    return app.inject({ method: 'POST', url: `${ORDERS_URL}/${number}/status`, headers, payload });
  }

  async function storedRow(id: string) {
    const [row] = await database.db.select().from(orders).where(eq(orders.id, id));
    return row;
  }

  async function storedChanges(id: string) {
    return database.db
      .select()
      .from(statusChanges)
      .where(eq(statusChanges.orderId, id))
      .orderBy(asc(statusChanges.at));
  }

  it.each([
    ['new', 'paid'],
    ['new', 'cancelled'],
    ['paid', 'shipped'],
    ['paid', 'cancelled'],
  ] as const)('%s → %s updates the order and appends one status change', async (from, to) => {
    const order = await newOrder();
    let version = 1;
    if (from === 'paid') {
      expect((await change(order.number, { to: 'paid', version })).statusCode).toBe(200);
      version = 2;
    }
    const res = await change(order.number, { to, version });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      status: string;
      version: number;
      updatedAt: string;
      history: unknown[];
    }>();
    expect(body).toMatchObject({ status: to, version: version + 1 });
    expect(body.history).toHaveLength(version);
    expect(body.history.at(-1)).toMatchObject({
      from,
      to,
      changedBy: { id: user.id, name: 'Ana Ruiz' },
    });

    const row = await storedRow(order.id);
    expect(row).toMatchObject({ status: to, version: version + 1 });
    expect(row?.updatedAt.toISOString()).toBe(body.updatedAt);
    const changes = await storedChanges(order.id);
    expect(changes.map((c) => `${c.fromStatus}→${c.toStatus}`).at(-1)).toBe(`${from}→${to}`);
    expect(changes.at(-1)).toMatchObject({ changedBy: user.id, reason: null });

    // GET returns the same order
    const get = await app.inject({
      method: 'GET',
      url: `${ORDERS_URL}/${order.number}`,
      headers: HEADERS,
    });
    expect(get.json()).toEqual(body);
  });

  it('stores the cancellation reason trimmed', async () => {
    const order = await newOrder();
    const res = await change(order.number, { to: 'cancelled', version: 1, reason: '  Asked  ' });
    expect(res.statusCode).toBe(200);
    expect((await storedChanges(order.id))[0]).toMatchObject({ reason: 'Asked' });
  });

  it('answers 409 for a transition that is not allowed and writes nothing', async () => {
    const order = await newOrder();
    expect((await change(order.number, { to: 'cancelled', version: 1 })).statusCode).toBe(200);
    const before = await storedRow(order.id);
    const res = await change(order.number, { to: 'paid', version: 2 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ currentStatus: 'cancelled', currentVersion: 2 });
    expect(await storedRow(order.id)).toEqual(before);
    expect(await storedChanges(order.id)).toHaveLength(1);
  });

  it('answers 409 with currentVersion for a stale version and writes nothing', async () => {
    const order = await newOrder();
    expect((await change(order.number, { to: 'paid', version: 1 })).statusCode).toBe(200);
    const res = await change(order.number, { to: 'shipped', version: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ currentStatus: 'paid', currentVersion: 2 });
    expect(await storedRow(order.id)).toMatchObject({ status: 'paid', version: 2 });
    expect(await storedChanges(order.id)).toHaveLength(1);
  });

  it('of two parallel requests with the same version exactly one succeeds', async () => {
    const order = await newOrder();
    const results = await Promise.all([
      change(order.number, { to: 'paid', version: 1 }),
      change(order.number, { to: 'cancelled', version: 1 }),
    ]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 409]);
    const winner = results.find((r) => r.statusCode === 200)?.json<{ status: string }>();
    const loser = results.find((r) => r.statusCode === 409)?.json<Record<string, unknown>>();
    expect(loser).toMatchObject({ currentStatus: winner?.status, currentVersion: 2 });
    expect(await storedRow(order.id)).toMatchObject({ status: winner?.status, version: 2 });
    expect(await storedChanges(order.id)).toHaveLength(1);
  });

  it('of five parallel identical requests exactly one succeeds', async () => {
    const order = await newOrder();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => change(order.number, { to: 'paid', version: 1 })),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4);
    expect(await storedRow(order.id)).toMatchObject({ status: 'paid', version: 2 });
    expect(await storedChanges(order.id)).toHaveLength(1);
  });

  it('answers 422 for a reason with a non-cancel target and writes nothing', async () => {
    const order = await newOrder();
    const res = await change(order.number, { to: 'paid', version: 1, reason: 'why' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ errors: [{ field: 'reason' }] });
    expect(await storedRow(order.id)).toMatchObject({ status: 'new', version: 1 });
    expect(await storedChanges(order.id)).toHaveLength(0);
  });

  it('answers 403 without the right Origin and writes nothing', async () => {
    const order = await newOrder();
    const res = await change(
      order.number,
      { to: 'paid', version: 1 },
      { ...HEADERS, origin: 'https://evil.example.com' },
    );
    expect(res.statusCode).toBe(403);
    expect(await storedRow(order.id)).toMatchObject({ status: 'new', version: 1 });
    expect(await storedChanges(order.id)).toHaveLength(0);
  });

  it('answers 404 for an unknown number', async () => {
    const res = await change('ORD-999999999', { to: 'paid', version: 1 });
    expect(res.statusCode).toBe(404);
  });
});
