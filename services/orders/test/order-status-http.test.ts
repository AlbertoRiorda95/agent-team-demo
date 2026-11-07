// POST /api/v1/orders/{number}/status at the HTTP edge with the in-memory
// store (spec order-detail, Test seams: API, the parts that need no
// database): every allowed transition, the 409 cases with currentStatus and
// currentVersion, 422 for the reason, 401, 403, 404. The atomic update on
// Postgres and two parallel requests are in order-status.test.ts.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changeOrderStatus } from '../src/application/change-order-status.js';
import { createOrder } from '../src/application/create-order.js';
import type { OrderRecord, OrderStore } from '../src/application/ports/order-store.js';
import { STUB_USER, VALID_TOKEN, WEB } from './fake-auth.js';
import {
  makeOrderApp,
  memoryOrderStore,
  ORDERS_URL,
  TEST_API_KEY,
  validOrder,
  type MemoryOrderStore,
} from './order-fixtures.js';

const HEADERS = { cookie: `session=${VALID_TOKEN}`, origin: WEB.publicOrigin };
const NOW = new Date('2026-11-07T10:00:00.000Z');
const LATER = new Date('2026-11-07T10:42:00.000Z');

let app: FastifyInstance;
let store: MemoryOrderStore;
let now = NOW;

beforeAll(async () => {
  store = memoryOrderStore();
  app = makeOrderApp({ store, clock: () => now, apiKey: TEST_API_KEY });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function newOrder(): Promise<OrderRecord> {
  return (await createOrder({ store, clock: () => NOW }, validOrder())).order;
}

function stored(number: string): OrderRecord | undefined {
  return store.orders.find((o) => o.number === number);
}

function change(number: string, payload: object, headers: Record<string, string> = HEADERS) {
  return app.inject({
    method: 'POST',
    url: `${ORDERS_URL}/${number}/status`,
    headers,
    payload,
  });
}

describe('POST /orders/{number}/status (HTTP edge)', () => {
  it.each([
    ['new', 'paid'],
    ['new', 'cancelled'],
    ['paid', 'shipped'],
    ['paid', 'cancelled'],
  ] as const)(
    '%s → %s returns 200 with the new status, version + 1 and a history entry',
    async (from, to) => {
      let order = await newOrder();
      if (from === 'paid') {
        const paid = await change(order.number, { to: 'paid', version: 1 });
        expect(paid.statusCode).toBe(200);
        order = stored(order.number) ?? order;
      }
      now = LATER;
      const res = await change(order.number, { to, version: order.version });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      const body = res.json<Record<string, unknown>>();
      expect(body).toMatchObject({
        number: order.number,
        status: to,
        version: order.version + 1,
        updatedAt: LATER.toISOString(),
      });
      const history = body['history'] as unknown[];
      expect(history).toHaveLength(order.version);
      expect(history.at(-1)).toEqual({
        from,
        to,
        changedBy: { id: STUB_USER.id, name: STUB_USER.name },
        at: LATER.toISOString(),
      });
      now = NOW;
    },
  );

  it('stores a cancellation reason trimmed, and an empty one as none', async () => {
    const order = await newOrder();
    const res = await change(order.number, {
      to: 'cancelled',
      version: 1,
      reason: '  Customer asked  ',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ history: unknown[] }>().history[0]).toMatchObject({
      reason: 'Customer asked',
    });

    const other = await newOrder();
    const empty = await change(other.number, { to: 'cancelled', version: 1, reason: '   ' });
    expect(empty.statusCode).toBe(200);
    expect(empty.json<{ history: object[] }>().history[0]).not.toHaveProperty('reason');
  });

  it.each([
    ['shipped', 'cancelled'],
    ['cancelled', 'paid'],
    ['new', 'shipped'],
    ['paid', 'paid'],
  ] as const)('%s → %s answers 409 with currentStatus and changes nothing', async (status, to) => {
    const order = await newOrder();
    const path: Record<string, readonly ('paid' | 'shipped' | 'cancelled')[]> = {
      new: [],
      paid: ['paid'],
      shipped: ['paid', 'shipped'],
      cancelled: ['cancelled'],
    };
    let version = 1;
    for (const step of path[status] ?? []) {
      expect((await change(order.number, { to: step, version })).statusCode).toBe(200);
      version += 1;
    }
    const before = stored(order.number);

    const res = await change(order.number, { to, version });
    expect(res.statusCode).toBe(409);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: `An order in status ${status} cannot move to ${to}.`,
      currentStatus: status,
      currentVersion: version,
    });
    expect(stored(order.number)).toEqual(before);
  });

  it('answers 409 with currentVersion for a stale version, before the transition check', async () => {
    const order = await newOrder();
    expect((await change(order.number, { to: 'paid', version: 1 })).statusCode).toBe(200);
    const before = stored(order.number);
    // stale, and paid → paid would not be allowed either: the version wins
    const res = await change(order.number, { to: 'paid', version: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'The order changed meanwhile: reload it.',
      currentStatus: 'paid',
      currentVersion: 2,
    });
    expect(stored(order.number)).toEqual(before);
  });

  it.each([
    ['a reason with to: paid', { to: 'paid', version: 1, reason: 'why' }, 'reason'],
    ['an empty reason with to: shipped', { to: 'shipped', version: 1, reason: '' }, 'reason'],
    [
      'a reason over 500 characters',
      { to: 'cancelled', version: 1, reason: 'a'.repeat(501) },
      'reason',
    ],
    ['to: new', { to: 'new', version: 1 }, 'to'],
    ['no version', { to: 'paid' }, 'version'],
    ['version 0', { to: 'paid', version: 0 }, 'version'],
    ['an unknown field', { to: 'paid', version: 1, status: 'paid' }, 'status'],
  ])('answers 422 for %s and changes nothing', async (_name, payload, field) => {
    const order = await newOrder();
    const res = await change(order.number, payload);
    expect(res.statusCode).toBe(422);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toMatchObject({
      title: 'Validation failed',
      status: 422,
      errors: [expect.objectContaining({ field }) as unknown],
    });
    expect(stored(order.number)).toEqual(order);
  });

  it('answers 404 for an unknown or a malformed number', async () => {
    expect((await change('ORD-999999', { to: 'paid', version: 1 })).statusCode).toBe(404);
    const malformed = await change('123', { to: 'paid', version: 1 });
    expect(malformed.statusCode).toBe(404);
    expect(malformed.json()).toMatchObject({ title: 'Not Found', status: 404 });
  });

  it('answers 401 without a session and changes nothing', async () => {
    const order = await newOrder();
    const res = await change(
      order.number,
      { to: 'paid', version: 1 },
      { origin: WEB.publicOrigin },
    );
    expect(res.statusCode).toBe(401);
    expect(stored(order.number)).toEqual(order);
  });

  it.each([
    ['another Origin', { ...HEADERS, origin: 'https://evil.example.com' }],
    ['no Origin', { cookie: HEADERS.cookie }],
  ])('answers 403 with %s and changes nothing', async (_name, headers) => {
    const order = await newOrder();
    const res = await change(order.number, { to: 'paid', version: 1 }, headers);
    expect(res.statusCode).toBe(403);
    expect(stored(order.number)).toEqual(order);
  });

  it('answers 403 to a non-JSON body and changes nothing', async () => {
    const order = await newOrder();
    const res = await app.inject({
      method: 'POST',
      url: `${ORDERS_URL}/${order.number}/status`,
      headers: { ...HEADERS, 'content-type': 'text/plain' },
      payload: 'to=paid&version=1',
    });
    expect(res.statusCode).toBe(403);
    expect(stored(order.number)).toEqual(order);
  });
});

describe('changeOrderStatus when another change wins the race', () => {
  it('reports the order as it is now (409), never the lost write', async () => {
    const memory = memoryOrderStore();
    const order = (await createOrder({ store: memory, clock: () => NOW }, validOrder())).order;
    // the other request commits between our read and our conditional update
    const racing: OrderStore = {
      ...memory,
      changeStatus: async (write) => {
        await memory.changeStatus({ ...write, to: 'cancelled', changedBy: 'other' });
        return memory.changeStatus(write);
      },
    };
    const result = await changeOrderStatus(
      { store: racing, clock: () => NOW },
      { number: order.number, to: 'paid', version: 1, changedBy: STUB_USER.id },
    );
    expect(result).toEqual({
      kind: 'conflict',
      conflict: 'stale-version',
      currentStatus: 'cancelled',
      currentVersion: 2,
    });
    expect(memory.orders[0]?.history).toHaveLength(1);
  });
});
