// Drizzle schema of the orders database. Tables arrive with their features
// (order-intake, staff-auth...). After a change here run `npm run db:generate`
// and commit the new migration.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
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
  (t) => [index('sessions_user_id_idx').on(t.userId), index('sessions_expires_at_idx').on(t.expiresAt)],
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
  (t) => [index('login_attempts_email_at_idx').on(t.email, t.at), index('login_attempts_at_idx').on(t.at)],
);
