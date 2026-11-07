// GET /api/v1/orders/{number} at the HTTP edge with the in-memory store (spec
// order-detail, Test seams: API, the parts that need no database): the
// session guard, the contract's Order shape with lines, totals and history,
// 404 for an unknown and for a malformed number. Lines and history read from
// Postgres are in order-detail.test.ts.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrder } from '../src/application/create-order.js';
import type { OrderRecord } from '../src/application/ports/order-store.js';
import { VALID_TOKEN } from './fake-auth.js';
import {
  makeOrderApp,
  memoryOrderStore,
  ORDERS_URL,
  TEST_API_KEY,
  validOrder,
} from './order-fixtures.js';

const SESSION = { cookie: `session=${VALID_TOKEN}` };
const NOW = new Date('2026-11-07T10:00:00.000Z');
const STAFF = { id: '7d5b8f62-3c1e-4a0b-9f6d-2e8c1a4b5d70', name: 'Ana Ruiz' };

let app: FastifyInstance;
let fresh: OrderRecord;
let cancelled: OrderRecord;

beforeAll(async () => {
  const store = memoryOrderStore();
  const clock = () => NOW;
  fresh = (await createOrder({ store, clock }, validOrder())).order;
  const second = (
    await createOrder(
      { store, clock },
      validOrder({
        currency: 'JPY',
        items: [{ sku: 'K-1', name: 'Kettle', quantity: 3, unitPrice: '1250' }],
        shippingCost: '500',
      }),
    )
  ).order;
  // the memory store writes no history: put the changes in as the store would return them
  cancelled = {
    ...second,
    status: 'cancelled',
    version: 3,
    updatedAt: new Date('2026-11-07T12:00:00.000Z'),
    history: [
      { from: 'new', to: 'paid', changedBy: STAFF, at: new Date('2026-11-07T11:00:00.000Z') },
      {
        from: 'paid',
        to: 'cancelled',
        reason: 'Customer asked',
        changedBy: STAFF,
        at: new Date('2026-11-07T12:00:00.000Z'),
      },
    ],
  };
  store.orders[1] = cancelled;
  app = makeOrderApp({ store, clock, apiKey: TEST_API_KEY });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function get(number: string, headers: Record<string, string> = SESSION) {
  return app.inject({ method: 'GET', url: `${ORDERS_URL}/${number}`, headers });
}

describe('GET /orders/{number} (HTTP edge)', () => {
  it('answers 401 without a session', async () => {
    const res = await get(fresh.number, {});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ type: 'about:blank', title: 'Unauthorized', status: 401 });
  });

  it('answers 401 with the order API key instead of a session', async () => {
    const res = await get(fresh.number, { authorization: `Bearer ${TEST_API_KEY}` });
    expect(res.statusCode).toBe(401);
  });

  it('answers 401 before checking a malformed number', async () => {
    const res = await get('nope', {});
    expect(res.statusCode).toBe(401);
  });

  it('returns the order in the contract shape, with lines, totals and no history yet', async () => {
    const res = await get(fresh.number);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.json()).toEqual({
      number: fresh.number,
      externalReference: fresh.externalReference,
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

  it('returns the history oldest first, with changedBy and the reason only when there is one', async () => {
    const res = await get(cancelled.number);
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      status: 'cancelled',
      version: 3,
      currency: 'JPY',
      items: [
        {
          unitPrice: { amount: '1250', currency: 'JPY' },
          lineTotal: { amount: '3750', currency: 'JPY' },
        },
      ],
      total: { amount: '4250', currency: 'JPY' },
      updatedAt: '2026-11-07T12:00:00.000Z',
    });
    expect(body['history']).toEqual([
      { from: 'new', to: 'paid', changedBy: STAFF, at: '2026-11-07T11:00:00.000Z' },
      {
        from: 'paid',
        to: 'cancelled',
        reason: 'Customer asked',
        changedBy: STAFF,
        at: '2026-11-07T12:00:00.000Z',
      },
    ]);
    expect(body).not.toHaveProperty('id');
  });

  it('answers 404 problem+json for an unknown number', async () => {
    const res = await get('ORD-999999');
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'No such order.',
    });
  });

  it.each([
    '123',
    'ORD-12345',
    'ord-000001',
    'ORD-00000A',
    'ORD-000001x',
    encodeURIComponent("ORD-000001' or 1=1 --"),
  ])('answers 404 problem+json for the malformed number %s', async (number) => {
    const res = await get(number);
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toMatchObject({ type: 'about:blank', title: 'Not Found', status: 404 });
  });
});
