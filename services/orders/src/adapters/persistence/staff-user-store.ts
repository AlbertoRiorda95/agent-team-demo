import { eq } from 'drizzle-orm';
import {
  EmailAlreadyUsedError,
  type StaffUserRecord,
  type StaffUserStore,
} from '../../application/ports/staff-user-store.js';
import type { Db } from './database.js';
import { sessions, staffUsers } from './schema.js';

const UNIQUE_VIOLATION = '23505';

const publicColumns = {
  id: staffUsers.id,
  email: staffUsers.email,
  name: staffUsers.name,
  active: staffUsers.active,
  createdAt: staffUsers.createdAt,
};

/** Drizzle implementation of the StaffUserStore port. */
export function createStaffUserStore(db: Db): StaffUserStore {
  return {
    async findByEmail(email) {
      const rows = await db
        .select(publicColumns)
        .from(staffUsers)
        .where(eq(staffUsers.email, email))
        .limit(1);
      return rows[0];
    },

    async findCredentialsByEmail(email) {
      const rows = await db
        .select({ user: publicColumns, passwordHash: staffUsers.passwordHash })
        .from(staffUsers)
        .where(eq(staffUsers.email, email))
        .limit(1);
      return rows[0];
    },

    async insert(user) {
      try {
        const rows = await db.insert(staffUsers).values(user).returning(publicColumns);
        return firstRow(rows);
      } catch (error) {
        // two concurrent creations: the unique index decides
        if (isUniqueViolation(error)) throw new EmailAlreadyUsedError();
        throw error;
      }
    },

    async deactivate(userId) {
      await db.transaction(async (tx) => {
        await tx.update(staffUsers).set({ active: false }).where(eq(staffUsers.id, userId));
        await tx.delete(sessions).where(eq(sessions.userId, userId));
      });
    },

    async setPasswordHash(userId, passwordHash) {
      await db.transaction(async (tx) => {
        await tx.update(staffUsers).set({ passwordHash }).where(eq(staffUsers.id, userId));
        await tx.delete(sessions).where(eq(sessions.userId, userId));
      });
    },
  };
}

function firstRow(rows: StaffUserRecord[]): StaffUserRecord {
  const row = rows[0];
  if (!row) throw new Error('INSERT ... RETURNING returned no row');
  return row;
}

function isUniqueViolation(error: unknown): boolean {
  // drizzle wraps the driver error in `cause` (0.45); older versions throw it directly
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}
