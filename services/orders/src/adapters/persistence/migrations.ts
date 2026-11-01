import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './database.js';

/** The drizzle-kit output folder, services/orders/migrations (same path from src/ and dist/). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../migrations', import.meta.url));

/** Applies the pending migrations. Idempotent: applied ones are recorded and skipped. */
export async function applyMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
