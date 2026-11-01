// `npm run db:migrate`: applies the pending migrations to DATABASE_URL.
import { loadConfig } from '../../config.js';
import { openDatabase } from './database.js';
import { applyMigrations } from './migrations.js';

const config = loadConfig(process.env);
const database = openDatabase(config.databaseUrl);
try {
  await applyMigrations(database.db);
  console.log('Migrations applied.');
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await database.close();
}
