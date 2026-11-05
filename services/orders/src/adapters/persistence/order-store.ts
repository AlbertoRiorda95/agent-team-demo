import { fromMinor, type CurrencyCode } from '@albertoriorda95/money';
import { asc, eq, sql } from 'drizzle-orm';
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
  };
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
