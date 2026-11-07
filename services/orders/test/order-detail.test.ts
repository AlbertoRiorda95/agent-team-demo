// GET /api/v1/orders/{number} through app.inject on the test database (spec
// order-detail, Test seams: API): the order with its lines in the order they
// were sent, the line totals and the total in minor units of its currency,
// the status history oldest first with the staff user's id and name and the
// reason only when stored, 404 for an unknown or malformed number, 401.
// Needs DATABASE_URL; skipped locally without it, required in CI. The status
// changes are written straight into the table (POST /orders/{number}/status
// is the next task).
import { eq, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import { createOrderStore } from '../src/adapters/persistence/order-store.js';
import { orders, staffUsers, statusChanges } from '../src/adapters/persistence/schema.js';
import { createOrder } from '../src/application/create-order.js';
import type { OrderRecord } from '../src/application/ports/order-store.js';
import { VALID_TOKEN } from './fake-auth.js';
import { makeOrderApp, ORDERS_URL, postOrder, TEST_API_KEY, validOrder } from './order-fixtures.js';
import { testDatabaseUrl } from './test-database.js';

const databaseUrl = testDatabaseUrl();
const SESSION = { cookie: `session=${VALID_TOKEN}` };
const REF_PREFIX = 'order-detail-test-';
const EMAIL_DOMAIN = 'order-detail.test';
const NOW = new Date('2026-11-07T09:00:00.000Z');

describe.runIf(databaseUrl)('GET /orders/{number} (test database)', () => {
  let database: Database;
  let app: FastifyInstance;
  let fresh: OrderRecord;
  let cancelled: OrderRecord;
  const staff = { ana: { id: '', name: 'Ana Ruiz' }, bo: { id: '', name: 'Bo Chen' } };

  beforeAll(async () => {
    database = openDatabase(databaseUrl ?? '');
    await applyMigrations(database.db);
    await cleanUp();

    const store = createOrderStore(database.db);
    const clock = () => NOW;
    fresh = (
      await createOrder({ store, clock }, validOrder({ externalReference: `${REF_PREFIX}fresh` }))
    ).order;
    cancelled = (
      await createOrder(
        { store, clock },
        validOrder({
          externalReference: `${REF_PREFIX}cancelled`,
          currency: 'JPY',
          items: [
            { sku: 'Z-LAST', name: 'Zebra', quantity: 1, unitPrice: '300' },
            { sku: 'A-FIRST', name: 'Apple', quantity: 3, unitPrice: '1250' },
          ],
          shippingCost: '500',
        }),
      )
    ).order;

    for (const [key, user] of Object.entries(staff)) {
      const [row] = await database.db
        .insert(staffUsers)
        .values({ email: `${key}@${EMAIL_DOMAIN}`, name: user.name, passwordHash: 'not-a-hash' })
        .returning({ id: staffUsers.id });
      user.id = row?.id ?? '';
    }
    // inserted newest first: the history must still come oldest first
    await database.db.insert(statusChanges).values([
      {
        orderId: cancelled.id,
        fromStatus: 'paid',
        toStatus: 'cancelled',
        reason: 'Customer asked',
        changedBy: staff.bo.id,
        at: new Date('2026-11-07T11:00:00.000Z'),
      },
      {
        orderId: cancelled.id,
        fromStatus: 'new',
        toStatus: 'paid',
        reason: null,
        changedBy: staff.ana.id,
        at: new Date('2026-11-07T10:00:00.000Z'),
      },
    ]);
    await database.db
      .update(orders)
      .set({ status: 'cancelled', version: 3, updatedAt: new Date('2026-11-07T11:00:00.000Z') })
      .where(eq(orders.id, cancelled.id));

    app = makeOrderApp({ store, clock, apiKey: TEST_API_KEY });
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

  function get(number: string, headers: Record<string, string> = SESSION) {
    return app.inject({ method: 'GET', url: `${ORDERS_URL}/${number}`, headers });
  }

  it('answers 401 without a session', async () => {
    const res = await get(fresh.number, {});
    expect(res.statusCode).toBe(401);
  });

  it('returns a new order with its lines, line totals, total and an empty history', async () => {
    const res = await get(fresh.number);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      number: fresh.number,
      externalReference: `${REF_PREFIX}fresh`,
      status: 'new',
      version: 1,
      currency: 'EUR',
      customer: { name: 'Ada Lovelace', email: 'ada@example.com' },
      shippingAddress: {
        name: 'Ada Lovelace',
        line1: '1 Main St',
        city: 'Turin',
        postalCode: '10100',
        country: 'IT',
      },
      items: [
        {
          sku: 'MUG-1',
          name: 'Mug',
          quantity: 2,
          unitPrice: { amount: '12.50', currency: 'EUR' },
          lineTotal: { amount: '25.00', currency: 'EUR' },
        },
        {
          sku: 'TEA-1',
          name: 'Tea',
          quantity: 1,
          unitPrice: { amount: '4.95', currency: 'EUR' },
          lineTotal: { amount: '4.95', currency: 'EUR' },
        },
      ],
      shippingCost: { amount: '4.90', currency: 'EUR' },
      total: { amount: '34.85', currency: 'EUR' },
      history: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it('keeps the lines in the order they were sent and the amounts in the currency', async () => {
    const body = (await get(cancelled.number)).json<Record<string, unknown>>();
    expect(body).toMatchObject({
      status: 'cancelled',
      version: 3,
      currency: 'JPY',
      items: [
        { sku: 'Z-LAST', lineTotal: { amount: '300', currency: 'JPY' } },
        { sku: 'A-FIRST', lineTotal: { amount: '3750', currency: 'JPY' } },
      ],
      shippingCost: { amount: '500', currency: 'JPY' },
      total: { amount: '4550', currency: 'JPY' },
      updatedAt: '2026-11-07T11:00:00.000Z',
    });
  });

  it('returns the history oldest first, with who changed it and the reason only when stored', async () => {
    const body = (await get(cancelled.number)).json<{ history: unknown[] }>();
    expect(body.history).toEqual([
      {
        from: 'new',
        to: 'paid',
        changedBy: { id: staff.ana.id, name: 'Ana Ruiz' },
        at: '2026-11-07T10:00:00.000Z',
      },
      {
        from: 'paid',
        to: 'cancelled',
        reason: 'Customer asked',
        changedBy: { id: staff.bo.id, name: 'Bo Chen' },
        at: '2026-11-07T11:00:00.000Z',
      },
    ]);
  });

  it('gives the same history to an order source repeating its POST /orders', async () => {
    const res = await postOrder(app, validOrder({ externalReference: `${REF_PREFIX}cancelled` }));
    expect(res.statusCode).toBe(200);
    expect(res.json<{ history: unknown[] }>().history).toHaveLength(2);
  });

  it('answers 404 for an unknown number', async () => {
    const res = await get('ORD-999999999');
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('answers 404 for a malformed number, and does not match it loosely', async () => {
    expect((await get('123')).statusCode).toBe(404);
    expect((await get(fresh.number.toLowerCase())).statusCode).toBe(404);
    expect((await get(`${fresh.number}0`)).statusCode).toBe(404);
  });
});
