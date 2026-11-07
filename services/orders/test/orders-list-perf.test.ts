// The one measurement of the orders list (spec orders-list, acceptance
// criteria): 10,000 orders on the test database, then GET /api/v1/orders
// through app.inject for the default list, a status filter, a name search and
// a number search; p95 of each must be under 300 ms. The numbers are printed
// for the MR. Needs DATABASE_URL; skipped locally without it, required in CI.
// Not measured: the network, a real browser, concurrent load.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import { createOrderStore } from '../src/adapters/persistence/order-store.js';
import { VALID_TOKEN } from './fake-auth.js';
import { deleteAllOrders, insertListRows, type ListRow } from './list-fixtures.js';
import { makeOrderApp, ORDERS_URL, TEST_API_KEY } from './order-fixtures.js';
import { testDatabaseUrl } from './test-database.js';

const databaseUrl = testDatabaseUrl();
const ORDERS = 10_000;
const RUNS = 50;
const P95_BUDGET_MS = 300;
const STATUSES = ['new', 'paid', 'shipped', 'cancelled'] as const;
const FIRST = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elena',
  'Franco',
  'Giulia',
  'Hugo',
  'Irene',
  'Jonas',
];
const LAST = [
  'Lima',
  'Rossi',
  'Moreau',
  'Schmidt',
  'Novak',
  'Silva',
  'Berg',
  'Costa',
  'Weber',
  'Kim',
];

function rows(): ListRow[] {
  const start = Date.parse('2025-01-01T00:00:00.000Z');
  return Array.from({ length: ORDERS }, (_, i) => {
    const first = FIRST[i % FIRST.length] ?? 'Ana';
    const last = LAST[Math.floor(i / FIRST.length) % LAST.length] ?? 'Lima';
    return {
      number: `ORD-${String(i + 1).padStart(6, '0')}`,
      customerName: `${first} ${last} ${String(i)}`,
      customerEmail: `${first}.${last}.${String(i)}@example.com`.toLowerCase(),
      status: STATUSES[i % STATUSES.length] ?? 'new',
      total: 1000 + i,
      createdAt: new Date(start + i * 60_000),
    };
  });
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.NaN;
}

describe.runIf(databaseUrl)('GET /orders at 10,000 orders (measurement)', () => {
  let database: Database;
  let app: FastifyInstance;

  beforeAll(async () => {
    database = openDatabase(databaseUrl ?? '');
    await applyMigrations(database.db);
    await deleteAllOrders(database);
    await insertListRows(database, rows());
    await database.db.execute(sql`analyze orders`);
    app = makeOrderApp({
      store: createOrderStore(database.db),
      clock: () => new Date(),
      apiKey: TEST_API_KEY,
    });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await deleteAllOrders(database);
    await database.close();
  });

  it.each([
    ['default list', ''],
    ['status filter', '?status=paid'],
    ['status filter, page 100', '?status=shipped&page=100'],
    ['name search', '?q=giulia'],
    ['email search', '?q=novak.4'],
    ['number search', '?q=004321'],
    ['search, no match', '?q=zzzz'],
  ])(
    '%s answers under 300 ms p95',
    async (label, query) => {
      const request = () =>
        app.inject({
          method: 'GET',
          url: `${ORDERS_URL}${query}`,
          headers: { cookie: `session=${VALID_TOKEN}` },
        });
      for (let i = 0; i < 5; i += 1) await request(); // warm up
      const samples: number[] = [];
      for (let i = 0; i < RUNS; i += 1) {
        const started = performance.now();
        const res = await request();
        samples.push(performance.now() - started);
        expect(res.statusCode).toBe(200);
      }
      const result = p95(samples);
      console.log(
        `[orders-list measurement] ${label} (${query || 'no params'}): p95 ${result.toFixed(1)} ms, ` +
          `median ${(samples.sort((a, b) => a - b)[Math.floor(RUNS / 2)] ?? 0).toFixed(1)} ms ` +
          `over ${String(RUNS)} requests at ${String(ORDERS)} orders`,
      );
      expect(result).toBeLessThan(P95_BUDGET_MS);
    },
    60_000,
  );
});
