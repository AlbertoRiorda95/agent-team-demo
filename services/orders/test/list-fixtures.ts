// Shared by the orders-list database tests: orders written straight into the
// table, so their number, status and createdAt are chosen by the test.
import { sql } from 'drizzle-orm';
import type { Database } from '../src/adapters/persistence/database.js';
import { orders } from '../src/adapters/persistence/schema.js';

export interface ListRow {
  number: string;
  customerName: string;
  customerEmail: string;
  status?: 'new' | 'paid' | 'shipped' | 'cancelled';
  currency?: 'EUR' | 'USD' | 'GBP' | 'JPY';
  /** Minor units. */
  total?: number;
  createdAt: Date;
}

/** Inserts the rows in batches of 1,000 (one statement each). */
export async function insertListRows(database: Database, rows: readonly ListRow[]): Promise<void> {
  for (let start = 0; start < rows.length; start += 1000) {
    await database.db.insert(orders).values(
      rows.slice(start, start + 1000).map((row) => ({
        number: row.number,
        externalReference: `list-test-${row.number}`,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        shippingName: row.customerName,
        shippingLine1: '1 Main St',
        shippingCity: 'Turin',
        shippingPostalCode: '10100',
        shippingCountry: 'IT',
        currency: row.currency ?? 'EUR',
        shippingCost: 0,
        total: row.total ?? 1000,
        status: row.status ?? 'new',
        version: 1,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      })),
    );
  }
}

/**
 * Empties the orders table (lines and status changes cascade). The list tests
 * count every order, and the test files run one after another. Refuses any
 * database whose name does not end in `_test` (CI: orders_test), so a
 * DATABASE_URL pointing at a real database is never wiped.
 */
export async function deleteAllOrders(database: Database): Promise<void> {
  const result = await database.db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  const name = result.rows[0]?.name ?? '';
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to delete every order of database "${name}": not a *_test database`);
  }
  await database.db.execute(sql`delete from ${orders}`);
}
