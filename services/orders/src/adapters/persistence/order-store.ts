import { fromMinor, type CurrencyCode } from '@albertoriorda95/money';
import { and, asc, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import {
  ExternalReferenceTakenError,
  type OrderRecord,
  type OrderStore,
} from '../../application/ports/order-store.js';
import { orderLine, type Address, type OrderStatus } from '../../domain/order.js';
import type { Db } from './database.js';
import { orderLines, orders } from './schema.js';

const UNIQUE_VIOLATION = '23505';
const EXTERNAL_REFERENCE_KEY = 'orders_external_reference_key';

type OrderRow = typeof orders.$inferSelect;
type LineRow = typeof orderLines.$inferSelect;

/** Drizzle implementation of the OrderStore port. */
export function createOrderStore(db: Db): OrderStore {
  return {
    async findByExternalReference(externalReference) {
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.externalReference, externalReference))
        .limit(1);
      const row = rows[0];
      if (!row) return undefined;
      const lines = await db
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, row.id))
        .orderBy(asc(orderLines.position));
      // status history arrives with order-detail; nothing writes it yet
      return toRecord(row, lines);
    },

    async insert(draft, { now, numberFor }) {
      try {
        return await db.transaction(async (tx) => {
          const seq = await tx.execute<{ value: string }>(
            sql`select nextval('order_number_seq')::text as value`,
          );
          const number = numberFor(Number(seq.rows[0]?.value));
          const address = draft.shippingAddress;
          const inserted = await tx
            .insert(orders)
            .values({
              number,
              externalReference: draft.externalReference,
              customerName: draft.customer.name,
              customerEmail: draft.customer.email,
              shippingName: address.name,
              shippingLine1: address.line1,
              shippingLine2: address.line2 ?? null,
              shippingCity: address.city,
              shippingPostalCode: address.postalCode,
              shippingCountry: address.country,
              currency: draft.currency,
              shippingCost: draft.shippingCost.minor,
              total: draft.total.minor,
              status: 'new',
              version: 1,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          const row = inserted[0];
          if (!row) throw new Error('INSERT ... RETURNING returned no row');
          const lines = await tx
            .insert(orderLines)
            .values(
              draft.items.map((item, position) => ({
                orderId: row.id,
                position,
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice.minor,
              })),
            )
            .returning();
          return toRecord(
            row,
            lines.sort((a, b) => a.position - b.position),
          );
        });
      } catch (error) {
        if (isUniqueViolation(error, EXTERNAL_REFERENCE_KEY)) {
          throw new ExternalReferenceTakenError();
        }
        throw error;
      }
    },

    async list({ status, search, offset, limit }) {
      const where = and(
        status === undefined ? undefined : eq(orders.status, status),
        search === undefined ? undefined : matchesSearch(search),
      );
      // PERF: two queries (count, then the page); the count of a broad filter
      // scans its matches. Measured fine at 10,000 orders (see the MR).
      const counted = await db.select({ n: count() }).from(orders).where(where);
      const total = counted[0]?.n ?? 0;
      // a page beyond the last (or an offset too large for Postgres) has no rows
      if (offset >= total) return { items: [], total };
      const rows = await db
        .select({
          number: orders.number,
          status: orders.status,
          customerName: orders.customerName,
          currency: orders.currency,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt), desc(orders.number))
        .limit(limit)
        .offset(offset);
      return {
        items: rows.map((row) => ({
          number: row.number,
          // the check constraints keep status and currency within these values
          status: row.status as OrderStatus,
          customerName: row.customerName,
          total: fromMinor(row.total, row.currency as CurrencyCode),
          createdAt: row.createdAt,
        })),
        total,
      };
    },
  };
}

/**
 * Case-insensitive contains on number, customer name and email, with `%`,
 * `_` and `\` taken literally. The expressions match the pg_trgm GIN indexes
 * of migration 0003 (`number`, `lower(customer_name)`, `lower(customer_email)`).
 */
function matchesSearch(search: string): SQL | undefined {
  const pattern = `%${escapeLike(search)}%`;
  return or(
    sql`${orders.number} ilike ${pattern} escape '\\'`,
    sql`lower(${orders.customerName}) like lower(${pattern}) escape '\\'`,
    sql`lower(${orders.customerEmail}) like lower(${pattern}) escape '\\'`,
  );
}

/** Escapes the LIKE wildcards and the escape character itself. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

function toRecord(row: OrderRow, lines: LineRow[]): OrderRecord {
  // the check constraints keep currency and status within these values
  const currency = row.currency as CurrencyCode;
  const shippingAddress: Address = {
    name: row.shippingName,
    line1: row.shippingLine1,
    ...(row.shippingLine2 === null ? {} : { line2: row.shippingLine2 }),
    city: row.shippingCity,
    postalCode: row.shippingPostalCode,
    country: row.shippingCountry,
  };
  return {
    id: row.id,
    number: row.number,
    externalReference: row.externalReference,
    status: row.status as OrderStatus,
    version: row.version,
    currency,
    customer: { name: row.customerName, email: row.customerEmail },
    shippingAddress,
    items: lines.map((l) => orderLine(l.sku, l.name, l.quantity, fromMinor(l.unitPrice, currency))),
    shippingCost: fromMinor(row.shippingCost, currency),
    total: fromMinor(row.total, currency),
    history: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  // drizzle wraps the driver error in `cause` (0.45)
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const pgError = e as { code?: unknown; constraint?: unknown };
    if (pgError.code === UNIQUE_VIOLATION && pgError.constraint === constraint) return true;
  }
  return false;
}
