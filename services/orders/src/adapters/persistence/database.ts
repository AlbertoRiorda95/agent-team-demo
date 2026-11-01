import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DatabaseHealth } from '../../application/ports/database-health.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

export interface Database {
  readonly db: Db;
  readonly health: DatabaseHealth;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  /** Called when an idle connection fails (the pool replaces it). */
  readonly onIdleError?: (error: Error) => void;
}

/** Opens a connection pool on the given Postgres URL. Connections are made lazily. */
export function openDatabase(url: string, options: DatabaseOptions = {}): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 2_000,
    query_timeout: 5_000,
  });
  // Without a listener an idle client error would crash the process.
  pool.on('error', (error) => options.onIdleError?.(error));

  const db = drizzle(pool, { schema });

  const health: DatabaseHealth = {
    async isReachable() {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
  };

  return {
    db,
    health,
    close: () => pool.end(),
  };
}
