// GET /api/v1/orders through app.inject on the test database (spec
// orders-list, Test seams: API): order (newest first, then number), status
// filter, `q` search on number, name and email (any case, `%` and `_`
// literal), pagination and its total, a page beyond the last, 401. Needs
// DATABASE_URL; skipped locally without it, required in CI. The 10,000-order
// measurement is in orders-list-perf.test.ts.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import { createOrderStore } from '../src/adapters/persistence/order-store.js';
import { VALID_TOKEN } from './fake-auth.js';
import { deleteAllOrders, insertListRows, type ListRow } from './list-fixtures.js';
import { makeOrderApp, ORDERS_URL, TEST_API_KEY } from './order-fixtures.js';
import { testDatabaseUrl } from './test-database.js';

const databaseUrl = testDatabaseUrl();
const SESSION = { cookie: `session=${VALID_TOKEN}` };

const at = (iso: string) => new Date(iso);
const NAMED: ListRow[] = [
  {
    number: 'ORD-000012',
    customerName: 'Ana Lima',
    customerEmail: 'ana.lima@example.com',
    status: 'new',
    total: 1250,
    createdAt: at('2026-11-01T10:00:00.000Z'),
  },
  {
    number: 'ORD-000013',
    customerName: 'Bruno Rossi',
    customerEmail: 'bruno@shop.example',
    status: 'paid',
    currency: 'JPY',
    total: 1250,
    createdAt: at('2026-11-02T10:00:00.000Z'),
  },
  {
    number: 'ORD-000014',
    customerName: 'Carla 100% Cotton',
    customerEmail: 'carla@example.com',
    status: 'shipped',
    createdAt: at('2026-11-03T10:00:00.000Z'),
  },
  {
    // same createdAt as ORD-000014: the number decides (descending)
    number: 'ORD-000015',
    customerName: 'Diana_Prince',
    customerEmail: 'DIANA@Example.com',
    status: 'cancelled',
    createdAt: at('2026-11-03T10:00:00.000Z'),
  },
];
const FILLERS: ListRow[] = Array.from({ length: 30 }, (_, i) => ({
  number: `ORD-${String(200000 + i)}`,
  customerName: `Filler ${String(i)}`,
  customerEmail: `filler${String(i)}@example.org`,
  createdAt: new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * 3_600_000),
}));

interface Page {
  items: {
    number: string;
    status: string;
    customerName: string;
    total: unknown;
    createdAt: string;
  }[];
  page: number;
  pageSize: number;
  total: number;
}

describe.runIf(databaseUrl)('GET /orders (test database)', () => {
  let database: Database;
  let app: FastifyInstance;

  beforeAll(async () => {
    database = openDatabase(databaseUrl ?? '');
    await applyMigrations(database.db);
    await deleteAllOrders(database);
    await insertListRows(database, [...NAMED, ...FILLERS]);
    app = makeOrderApp({
      store: createOrderStore(database.db),
      clock: () => new Date(),
      apiKey: TEST_API_KEY,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await deleteAllOrders(database);
    await database.close();
  });

  async function list(query: Record<string, string> = {}): Promise<Page> {
    const res = await app.inject({ method: 'GET', url: ORDERS_URL, query, headers: SESSION });
    expect(res.statusCode).toBe(200);
    return res.json<Page>();
  }
  const numbers = (page: Page) => page.items.map((item) => item.number);

  it('answers 401 without a session', async () => {
    const res = await app.inject({ method: 'GET', url: ORDERS_URL });
    expect(res.statusCode).toBe(401);
  });

  it('returns newest first (ties by number, descending), 25 per page, with the total', async () => {
    const page = await list();
    expect(page.total).toBe(34);
    expect(page.pageSize).toBe(25);
    expect(numbers(page).slice(0, 6)).toEqual([
      'ORD-000015',
      'ORD-000014',
      'ORD-000013',
      'ORD-000012',
      'ORD-200029',
      'ORD-200028',
    ]);
    expect(page.items).toHaveLength(25);
    expect(page.items[2]).toEqual({
      number: 'ORD-000013',
      status: 'paid',
      customerName: 'Bruno Rossi',
      total: { amount: '1250', currency: 'JPY' },
      createdAt: '2026-11-02T10:00:00.000Z',
    });
    expect(page.items[3]?.total).toEqual({ amount: '12.50', currency: 'EUR' });
  });

  it('pages on: page 2 holds the rest, a page beyond the last is empty with the total', async () => {
    const second = await list({ page: '2' });
    expect(second.items).toHaveLength(9);
    expect(numbers(second).at(-1)).toBe('ORD-200000');
    const all = [...numbers(await list()), ...numbers(second)];
    expect(new Set(all).size).toBe(34);

    expect(await list({ page: '3' })).toEqual({ items: [], page: 3, pageSize: 25, total: 34 });
    const small = await list({ page: '2', pageSize: '2' });
    expect(numbers(small)).toEqual(['ORD-000013', 'ORD-000012']);
  });

  it('filters by status, with the total of the filter', async () => {
    const paid = await list({ status: 'paid' });
    expect(numbers(paid)).toEqual(['ORD-000013']);
    expect(paid.total).toBe(1);
    expect((await list({ status: 'new' })).total).toBe(31);
  });

  it.each([
    ['ORD-000012', ['ORD-000012']],
    ['000012', ['ORD-000012']],
    ['ord-000012', ['ORD-000012']],
    // part of the name, any case: "Ana Lima" and "Diana_Prince"
    ['ANA', ['ORD-000015', 'ORD-000012']],
    ['lima', ['ORD-000012']],
    // part of the email, any case
    ['SHOP.example', ['ORD-000013']],
    ['diana@example', ['ORD-000015']],
    // the LIKE wildcards are literal
    ['%', ['ORD-000014']],
    ['100%', ['ORD-000014']],
    ['_', ['ORD-000015']],
    ['a_p', ['ORD-000015']],
    ['\\', []],
    // trimmed
    ['  bruno  ', ['ORD-000013']],
    ['nobody', []],
  ])('q=%j finds %j', async (q, expected) => {
    const page = await list({ q });
    expect(numbers(page)).toEqual(expected);
    expect(page.total).toBe(expected.length);
  });

  it('combines status and q', async () => {
    expect(numbers(await list({ status: 'cancelled', q: 'ana' }))).toEqual(['ORD-000015']);
    expect(numbers(await list({ status: 'paid', q: 'ana' }))).toEqual([]);
  });

  it('a blank q is no search', async () => {
    expect((await list({ q: '   ' })).total).toBe(34);
  });

  it('answers 422 with the field for an unknown status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${ORDERS_URL}?status=refunded`,
      headers: SESSION,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ errors: { field: string }[] }>().errors[0]?.field).toBe('status');
  });
});
