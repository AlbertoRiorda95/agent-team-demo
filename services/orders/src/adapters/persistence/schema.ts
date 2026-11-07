// Drizzle schema of the orders database. Tables arrive with their features
// (order-intake, staff-auth...). After a change here run `npm run db:generate`
// and commit the new migration.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Staff accounts (staff-auth). Created and deactivated from the command line only. */
export const staffUsers = pgTable(
  'staff_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Trimmed and lower-cased by the application; the check keeps it so. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Argon2id hash in PHC string format; never the password. */
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('staff_users_email_key').on(t.email),
    check('staff_users_email_lower', sql`${t.email} = lower(${t.email})`),
  ],
);

/** Server-side sessions. Only the HMAC of the token is stored, never the token. */
export const sessions = pgTable(
  'sessions',
  {
    /** HMAC-SHA-256 of the session token keyed with SESSION_SECRET, hex. */
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/** Login attempts per email, for the lockout (unknown emails are recorded too). */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    email: text('email').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    success: boolean('success').notNull(),
  },
  (t) => [
    index('login_attempts_email_at_idx').on(t.email, t.at),
    index('login_attempts_at_idx').on(t.at),
  ],
);

/**
 * Source of the order numbers (order-intake): `ORD-` + at least 6 digits.
 * Gaps (rolled-back inserts) are accepted.
 */
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 1, increment: 1 });

/** Orders (order-intake). Amounts are bigint minor units of `currency`. */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull(),
    externalReference: text('external_reference').notNull(),
    customerName: text('customer_name').notNull(),
    customerEmail: text('customer_email').notNull(),
    shippingName: text('shipping_name').notNull(),
    shippingLine1: text('shipping_line1').notNull(),
    shippingLine2: text('shipping_line2'),
    shippingCity: text('shipping_city').notNull(),
    shippingPostalCode: text('shipping_postal_code').notNull(),
    shippingCountry: text('shipping_country').notNull(),
    currency: text('currency').notNull(),
    shippingCost: bigint('shipping_cost', { mode: 'number' }).notNull(),
    total: bigint('total', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('new'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('orders_external_reference_key').on(t.externalReference),
    uniqueIndex('orders_number_key').on(t.number),
    index('orders_status_created_at_idx').on(t.status, t.createdAt.desc()),
    // orders-list search (pg_trgm, created in migration 0003): contains, any case
    index('orders_number_trgm_idx').using('gin', t.number.op('gin_trgm_ops')),
    index('orders_customer_name_trgm_idx').using('gin', sql`lower(${t.customerName}) gin_trgm_ops`),
    index('orders_customer_email_trgm_idx').using(
      'gin',
      sql`lower(${t.customerEmail}) gin_trgm_ops`,
    ),
    check('orders_status_check', sql`${t.status} in ('new', 'paid', 'shipped', 'cancelled')`),
    check('orders_currency_check', sql`${t.currency} in ('EUR', 'USD', 'GBP', 'JPY')`),
    check('orders_amounts_check', sql`${t.shippingCost} >= 0 and ${t.total} >= 0`),
    check('orders_version_check', sql`${t.version} >= 1`),
  ],
);

/** The lines of an order, in the order they were sent (`position` from 0). */
export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull(),
    /** Minor units of the order's currency. */
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
  },
  (t) => [
    uniqueIndex('order_lines_order_id_position_key').on(t.orderId, t.position),
    check('order_lines_quantity_check', sql`${t.quantity} >= 1`),
    check('order_lines_unit_price_check', sql`${t.unitPrice} >= 0`),
  ],
);

/** Status history of an order (written by order-detail; created empty here). */
export const statusChanges = pgTable(
  'status_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    reason: text('reason'),
    changedBy: uuid('changed_by')
      .notNull()
      .references(() => staffUsers.id),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [index('status_changes_order_id_at_idx').on(t.orderId, t.at)],
);
