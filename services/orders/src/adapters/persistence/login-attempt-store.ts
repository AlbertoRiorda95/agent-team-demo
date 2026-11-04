import { and, eq, gte, lt } from 'drizzle-orm';
import type { LoginAttemptStore } from '../../application/ports/login-attempt-store.js';
import type { Db } from './database.js';
import { loginAttempts } from './schema.js';

/** Drizzle implementation of the LoginAttemptStore port. */
export function createLoginAttemptStore(db: Db): LoginAttemptStore {
  return {
    async record(email, at, success) {
      await db.insert(loginAttempts).values({ email, at, success });
    },

    async failuresSince(email, since) {
      const rows = await db
        .select({ at: loginAttempts.at })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.email, email),
            eq(loginAttempts.success, false),
            gte(loginAttempts.at, since),
          ),
        );
      return rows.map((row) => row.at);
    },

    async deleteBefore(before) {
      await db.delete(loginAttempts).where(lt(loginAttempts.at, before));
    },
  };
}
