// POST /api/v1/orders through app.inject on the test database (spec
// order-intake, Test seams: API): persistence in minor units, totals,
// idempotency, concurrency, validation, and no PII in the logs. Needs
// DATABASE_URL; skipped locally without it, required in CI. The guard and the
// size limit are in order-guard.test.ts.
// Not covered: real network, the reverse proxy, the production key check.
import { count, inArray, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import { createOrderStore } from '../src/adapters/persistence/order-store.js';
import { orderLines, orders } from '../src/adapters/persistence/schema.js';
import {
  API_KEY_HEADERS as AUTH,
  makeOrderApp as makeApp,
  postOrder as post,
  TEST_API_KEY,
  validOrder,
  type OrderPayload,
} from './order-fixtures.js';
import { testDatabaseUrl } from './test-database.js';

const databaseUrl = testDatabaseUrl();
const REF_PREFIX = 'orders-test-';

describe.runIf(databaseUrl)('POST /orders (test database)', () => {
  let database: Database;
  let app: FastifyInstance;
  let logLines: string[];
  const now = new Date('2026-11-05T09:30:00.000Z');

  beforeAll(async () => {
    database = openDatabase(databaseUrl ?? '');
    await applyMigrations(database.db);
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await database.close();
  });

  beforeEach(() => {
    logLines = [];
    app = makeApp(
      { store: createOrderStore(database.db), clock: () => now, apiKey: TEST_API_KEY },
      logLines,
    );
  });

  async function cleanUp(): Promise<void> {
    await database.db.delete(orders).where(like(orders.externalReference, `${REF_PREFIX}%`));
  }

  let counter = 0;
  function order(overrides: Partial<OrderPayload> = {}): OrderPayload {
    counter += 1;
    return validOrder({
      externalReference: `${REF_PREFIX}${String(Date.now())}-${String(counter)}`,
      ...overrides,
    });
  }

  async function countsFor(refs: string[]) {
    const ids = database.db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.externalReference, refs));
    const [o] = await database.db
      .select({ n: count() })
      .from(orders)
      .where(inArray(orders.externalReference, refs));
    const [l] = await database.db
      .select({ n: count() })
      .from(orderLines)
      .where(inArray(orderLines.orderId, ids));
    return { orders: o?.n ?? 0, lines: l?.n ?? 0 };
  }

  it('creates the order: 201 with number, status new, version 1, totals', async () => {
    const payload = order();
    const res = await post(app, payload);
    expect(res.statusCode).toBe(201);
    const body = res.json<Record<string, unknown>>();
    expect(body).toEqual({
      number: expect.stringMatching(/^ORD-\d{6,}$/) as unknown,
      externalReference: payload.externalReference,
      status: 'new',
      version: 1,
      currency: 'EUR',
      customer: payload.customer,
      shippingAddress: payload.shippingAddress,
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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(body).not.toHaveProperty('id');

    const rows = await database.db
      .select()
      .from(orders)
      .where(inArray(orders.externalReference, [payload.externalReference]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 3485, shippingCost: 490, currency: 'EUR' });
    const lines = await database.db
      .select()
      .from(orderLines)
      .where(inArray(orderLines.orderId, [rows[0]?.id ?? '']));
    expect(lines.map((l) => [l.position, l.unitPrice, l.quantity]).sort()).toEqual([
      [0, 1250, 2],
      [1, 495, 1],
    ]);
  });

  it('keeps JPY without decimals and an optional line2', async () => {
    const payload = order({
      currency: 'JPY',
      items: [{ sku: 'A', name: 'A', quantity: 3, unitPrice: '1250' }],
      shippingCost: '500',
    });
    payload.shippingAddress.line2 = 'Flat 2';
    const res = await post(app, payload);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      total: { amount: '4250', currency: 'JPY' },
      items: [{ lineTotal: { amount: '3750', currency: 'JPY' } }],
      shippingAddress: { line2: 'Flat 2' },
    });
  });

  it('replays: 200 with the same order, whatever the body says, nothing written', async () => {
    const payload = order();
    const first = await post(app, payload);
    const before = await countsFor([payload.externalReference]);
    const again = await post(app, { ...payload, shippingCost: '99.00' });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());
    expect(await countsFor([payload.externalReference])).toEqual(before);
    expect(before).toEqual({ orders: 1, lines: 2 });
  });

  it('20 concurrent requests with one reference create exactly one order', async () => {
    const payload = order();
    const results = await Promise.all(Array.from({ length: 20 }, () => post(app, payload)));
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(19);
    const numbers = new Set(results.map((r) => r.json<{ number: string }>().number));
    expect(numbers.size).toBe(1);
    expect(await countsFor([payload.externalReference])).toEqual({ orders: 1, lines: 2 });
  });

  it('gives unique, increasing numbers under concurrent creation', async () => {
    const payloads = Array.from({ length: 15 }, () => order());
    const results = await Promise.all(payloads.map((p) => post(app, p)));
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    const numbers = results.map((r) => Number(r.json<{ number: string }>().number.slice(4)));
    expect(new Set(numbers).size).toBe(15);
    const later = await post(app, order());
    const next = Number(later.json<{ number: string }>().number.slice(4));
    expect(next).toBeGreaterThan(Math.max(...numbers));
  });

  const invalid: [string, (p: OrderPayload) => unknown, string][] = [
    ['an unknown currency', (p) => ({ ...p, currency: 'CHF' }), 'currency'],
    ['quantity 0', (p) => ({ ...p, items: [{ ...p.items[0], quantity: 0 }] }), 'items[0].quantity'],
    [
      'quantity above 10000',
      (p) => ({ ...p, items: [{ ...p.items[0], quantity: 10_001 }] }),
      'items[0].quantity',
    ],
    [
      'a negative price',
      (p) => ({ ...p, items: [{ ...p.items[0], unitPrice: '-1.00' }] }),
      'items[0].unitPrice',
    ],
    [
      'a non-decimal price',
      (p) => ({ ...p, items: [{ ...p.items[0], unitPrice: '1e3' }] }),
      'items[0].unitPrice',
    ],
    [
      'too many decimals',
      (p) => ({ ...p, items: [p.items[0], { ...p.items[1], unitPrice: '4.955' }] }),
      'items[1].unitPrice',
    ],
    ['JPY with decimals', (p) => ({ ...p, currency: 'JPY', shippingCost: '4.90' }), 'shippingCost'],
    ['empty items', (p) => ({ ...p, items: [] }), 'items'],
    [
      'a bad country',
      (p) => ({ ...p, shippingAddress: { ...p.shippingAddress, country: 'Italy' } }),
      'shippingAddress.country',
    ],
    [
      'a missing field',
      (p) => {
        const copy: Partial<OrderPayload> = { ...p };
        delete copy.shippingCost;
        return copy;
      },
      'shippingCost',
    ],
  ];

  it.each(invalid)('%s: 422 naming the field, nothing created', async (_c, change, field) => {
    const payload = order();
    const res = await post(app, change(payload) as object);
    expect(res.statusCode).toBe(422);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    const body = res.json<{ errors: { field: string }[] }>();
    expect(body.errors.map((e) => e.field)).toContain(field);
    expect(await countsFor([payload.externalReference])).toEqual({ orders: 0, lines: 0 });
  });

  it('a body that is not JSON: 422, nothing created', async () => {
    const res = await post(app, '{"externalReference":', {
      ...AUTH,
      'content-type': 'application/json',
    });
    expect(res.statusCode).toBe(422);
  });

  it('a wrong key creates nothing', async () => {
    const payload = order();
    const res = await post(app, payload, { authorization: 'Bearer wrong' });
    expect(res.statusCode).toBe(401);
    expect(await countsFor([payload.externalReference])).toEqual({ orders: 0, lines: 0 });
  });

  it('logs no API key, email, name or address', async () => {
    const payload = order();
    payload.customer = { name: 'Zelda Quixote', email: 'zelda.q@example.org' };
    payload.shippingAddress = {
      name: 'Zelda Quixote',
      line1: '42 Unlikely Lane',
      city: 'Faraway',
      postalCode: 'ZZ9 9ZZ',
      country: 'GB',
    };
    await post(app, payload);
    await post(app, payload);
    await post(app, { ...payload, currency: 'CHF' });
    await post(app, payload, { authorization: `Bearer ${TEST_API_KEY}-wrong` });
    const log = logLines.join('\n');
    expect(logLines.length).toBeGreaterThan(0);
    for (const secret of [
      TEST_API_KEY,
      'zelda',
      'Zelda',
      'Quixote',
      'Unlikely Lane',
      'Faraway',
      'ZZ9 9ZZ',
    ]) {
      expect(log).not.toContain(secret);
    }
  });
});
