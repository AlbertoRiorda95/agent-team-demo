// GET /api/v1/orders at the HTTP edge with the in-memory store (spec
// orders-list, Test seams: API, the parts that need no database): the session
// guard, the 422 of bad parameters with their field, the defaults, the trim
// of `q` and a page beyond the last. Filter, search and order on Postgres are
// in orders-list.test.ts.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrder } from '../src/application/create-order.js';
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

let app: FastifyInstance;

beforeAll(async () => {
  const store = memoryOrderStore();
  for (let i = 0; i < 30; i += 1) {
    const at = new Date(NOW.getTime() + i * 60_000);
    await createOrder(
      { store, clock: () => at },
      validOrder({
        customer: { name: `Customer ${String(i)}`, email: `c${String(i)}@example.com` },
      }),
    );
  }
  app = makeOrderApp({ store, clock: () => NOW, apiKey: TEST_API_KEY });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function list(query = '', headers: Record<string, string> = SESSION) {
  return app.inject({ method: 'GET', url: `${ORDERS_URL}${query}`, headers });
}

describe('GET /orders (HTTP edge)', () => {
  it('answers 401 without a session', async () => {
    const res = await list('', {});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ type: 'about:blank', title: 'Unauthorized', status: 401 });
  });

  it('answers 401 with the order API key instead of a session', async () => {
    const res = await list('', { authorization: `Bearer ${TEST_API_KEY}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns page 1 of 25, newest first, with the total and the OrderSummary shape', async () => {
    const res = await list();
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      items: Record<string, unknown>[];
      page: number;
      pageSize: number;
      total: number;
    }>();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
    expect(body.total).toBe(30);
    expect(body.items).toHaveLength(25);
    expect(body.items[0]).toEqual({
      number: expect.stringMatching(/^ORD-\d{6,}$/) as unknown,
      status: 'new',
      customerName: 'Customer 29',
      total: { amount: '34.85', currency: 'EUR' },
      createdAt: new Date(NOW.getTime() + 29 * 60_000).toISOString(),
    });
    expect(body.items[24]?.['customerName']).toBe('Customer 5');
  });

  it('returns a page beyond the last as 200 with no items and the real total', async () => {
    const res = await list('?page=99');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], page: 99, pageSize: 25, total: 30 });
  });

  it('survives a page whose offset is too large for the database', async () => {
    const res = await list('?page=1000000000000000&pageSize=100');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ items: [], total: 30 });
  });

  it('trims q, and a blank q is no search', async () => {
    const trimmed = await list(`?q=${encodeURIComponent('  customer 2  ')}`);
    // Customer 2, Customer 20..29
    expect(trimmed.json<{ total: number }>().total).toBe(11);
    const blank = await list(`?q=${encodeURIComponent('   ')}`);
    expect(blank.json<{ total: number }>().total).toBe(30);
  });

  it.each([
    ['?status=refunded', 'status'],
    ['?page=0', 'page'],
    ['?page=abc', 'page'],
    ['?page=1.5', 'page'],
    ['?pageSize=0', 'pageSize'],
    ['?pageSize=101', 'pageSize'],
    [`?q=${'x'.repeat(201)}`, 'q'],
    ['?status=new&status=paid', 'status'],
  ])('answers 422 with the field for %s', async (query, field) => {
    const res = await list(query);
    expect(res.statusCode).toBe(422);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    const body = res.json<{ title: string; errors: { field: string }[] }>();
    expect(body.title).toBe('Validation failed');
    expect(body.errors.map((e) => e.field)).toContain(field);
  });
});
