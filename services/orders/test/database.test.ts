// /health and the migrations against a real Postgres (pg driver, Drizzle).
// The "database down" case uses an unreachable DATABASE_URL and always runs.
// The "database up" cases need a test database in DATABASE_URL (the CI job
// provides orders_test and fails without it); locally they are skipped.
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/adapters/http/app.js';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import { fakeAuth, WEB } from './fake-auth.js';
import { testDatabaseUrl } from './test-database.js';

const opened: Database[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((d) => d.close()));
});

function open(url: string): Database {
  const database = openDatabase(url);
  opened.push(database);
  return database;
}

describe('with the database down', () => {
  it('GET /health answers 503 unavailable', async () => {
    // port 1 on localhost: connection refused at once
    const database = open('postgres://orders:orders@127.0.0.1:1/orders');
    const app = buildApp({ databaseHealth: database.health, auth: fakeAuth(), web: WEB });
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable' });
  });
});

const databaseUrl = testDatabaseUrl();

describe.runIf(databaseUrl)('with the test database (DATABASE_URL)', () => {
  const url = databaseUrl ?? '';

  it('GET /health answers 200 ok', async () => {
    const database = open(url);
    const app = buildApp({ databaseHealth: database.health, auth: fakeAuth(), web: WEB });
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('applies the migrations and is idempotent', async () => {
    const database = open(url);
    const applied = async () => {
      const result = await database.db.execute<{ count: string }>(
        sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
      );
      return Number(result.rows[0]?.count);
    };
    await applyMigrations(database.db);
    const first = await applied();
    expect(first).toBeGreaterThanOrEqual(1);
    await applyMigrations(database.db);
    expect(await applied()).toBe(first);
  });
});
