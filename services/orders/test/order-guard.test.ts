// POST /api/v1/orders at the edge (spec order-intake, Test seams: API): the
// API key guard and the 256 KB limit, through app.inject on an in-memory store
// (refused requests never reach it). Persistence, idempotency and concurrency
// are in orders.test.ts on the test database.
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { VALID_TOKEN, WEB } from './fake-auth.js';
import {
  API_KEY_HEADERS,
  makeOrderApp,
  memoryOrderStore,
  postOrder,
  TEST_API_KEY,
  validOrder,
  type MemoryOrderStore,
} from './order-fixtures.js';

const UNAUTHORIZED = { type: 'about:blank', title: 'Unauthorized', status: 401 };

describe('POST /orders: API key and size', () => {
  let app: FastifyInstance;
  let store: MemoryOrderStore;

  beforeEach(() => {
    store = memoryOrderStore();
    app = makeOrderApp({ store, clock: () => new Date(), apiKey: TEST_API_KEY });
  });

  const refused: [string, Record<string, string>][] = [
    ['no Authorization', {}],
    ['a wrong key', { authorization: `Bearer ${TEST_API_KEY.slice(0, -1)}x` }],
    ['a longer key', { authorization: `Bearer ${TEST_API_KEY}x` }],
    ['an empty Bearer', { authorization: 'Bearer ' }],
    ['a Basic scheme', { authorization: `Basic ${TEST_API_KEY}` }],
    ['the key without a scheme', { authorization: TEST_API_KEY }],
    ['a staff session cookie', { cookie: `session=${VALID_TOKEN}`, origin: WEB.publicOrigin }],
  ];

  it.each(refused)('%s: 401 with the same body, nothing created', async (_case, headers) => {
    const res = await postOrder(app, validOrder(), headers);
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(store.orders).toHaveLength(0);
  });

  it('accepts the key: 201, then 200 on replay', async () => {
    const payload = validOrder();
    expect((await postOrder(app, payload)).statusCode).toBe(201);
    expect((await postOrder(app, payload)).statusCode).toBe(200);
    expect(store.orders).toHaveLength(1);
  });

  it('accepts the scheme in any case', async () => {
    const res = await postOrder(app, validOrder(), { authorization: `bearer ${TEST_API_KEY}` });
    expect(res.statusCode).toBe(201);
  });

  it('answers 401 to everything when no key is configured (never fails open)', async () => {
    const closed = makeOrderApp({ store, clock: () => new Date(), apiKey: undefined });
    for (const headers of [API_KEY_HEADERS, {}, { authorization: 'Bearer undefined' }]) {
      const res = await postOrder(closed, validOrder(), headers);
      expect(res.statusCode).toBe(401);
    }
    const unwired = makeOrderApp(undefined);
    expect((await postOrder(unwired, validOrder())).statusCode).toBe(401);
    expect(store.orders).toHaveLength(0);
  });

  it('answers 413 above 256 KB, and 401 first without the key', async () => {
    const big = validOrder();
    big.customer.name = 'x'.repeat(256 * 1024);
    const res = await postOrder(app, big);
    expect(res.statusCode).toBe(413);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toMatchObject({ title: 'Payload Too Large', status: 413 });
    expect((await postOrder(app, big, {})).statusCode).toBe(401);
    expect(store.orders).toHaveLength(0);
  });

  it('lets a body under the limit through to validation', async () => {
    const payload = validOrder();
    payload.customer.name = 'x'.repeat(200 * 1024);
    const res = await postOrder(app, payload);
    // past the size check: the schema's maxLength refuses the name
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ errors: [{ field: 'customer.name' }] });
  });

  it('answers 422 with the domain errors (more decimals than the currency allows)', async () => {
    const res = await postOrder(app, validOrder({ shippingCost: '4.905' }));
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      title: 'Validation failed',
      status: 422,
      errors: [{ field: 'shippingCost' }],
    });
    expect(store.orders).toHaveLength(0);
  });
});
