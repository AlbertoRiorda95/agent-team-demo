import { eq, lte } from 'drizzle-orm';
import type { SessionStore } from '../../application/ports/session-store.js';
import type { Db } from './database.js';
import { sessions, staffUsers } from './schema.js';

/** Drizzle implementation of the SessionStore port. */
export function createSessionStore(db: Db): SessionStore {
  return {
    async insert(session) {
      await db.insert(sessions).values(session);
    },

    async findWithUser(tokenHash) {
      const rows = await db
        .select({
          session: {
            tokenHash: sessions.tokenHash,
            userId: sessions.userId,
            createdAt: sessions.createdAt,
            lastSeenAt: sessions.lastSeenAt,
            expiresAt: sessions.expiresAt,
          },
          user: {
            id: staffUsers.id,
            email: staffUsers.email,
            name: staffUsers.name,
            active: staffUsers.active,
            createdAt: staffUsers.createdAt,
          },
        })
        .from(sessions)
        .innerJoin(staffUsers, eq(staffUsers.id, sessions.userId))
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      return rows[0];
    },

    async touch(tokenHash, times) {
      await db
        .update(sessions)
        .set({ lastSeenAt: times.lastSeenAt, expiresAt: times.expiresAt })
        .where(eq(sessions.tokenHash, tokenHash));
    },

    async delete(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },

    async deleteExpired(now) {
      await db.delete(sessions).where(lte(sessions.expiresAt, now));
    },
  };
}
