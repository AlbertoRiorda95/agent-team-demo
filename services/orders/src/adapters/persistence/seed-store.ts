import { and, eq } from 'drizzle-orm';
import type { SeedStore } from '../../application/ports/seed-store.js';
import type { Db } from './database.js';
import { orders, sessions, staffUsers, statusChanges } from './schema.js';

/** Drizzle implementation of the SeedStore port (development seed only). */
export function createSeedStore(db: Db): SeedStore {
  return {
    async ensureSeedStaffUser(user) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .insert(staffUsers)
          .values({ ...user, active: false })
          .onConflictDoUpdate({
            target: staffUsers.email,
            set: { passwordHash: user.passwordHash, active: false },
          })
          .returning({ id: staffUsers.id });
        const id = rows[0]?.id;
        if (!id) throw new Error('INSERT ... RETURNING returned no row');
        await tx.delete(sessions).where(eq(sessions.userId, id));
        return id;
      });
    },

    async applyHistory(orderId, changedBy, changes, result) {
      if (changes.length === 0) return false;
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(orders)
          .set({ status: result.status, version: result.version, updatedAt: result.updatedAt })
          .where(and(eq(orders.id, orderId), eq(orders.status, 'new'), eq(orders.version, 1)))
          .returning({ id: orders.id });
        if (updated.length === 0) return false;
        await tx.insert(statusChanges).values(
          changes.map((change) => ({
            orderId,
            fromStatus: change.from,
            toStatus: change.to,
            reason: change.reason ?? null,
            changedBy,
            at: change.at,
          })),
        );
        return true;
      });
    },
  };
}
