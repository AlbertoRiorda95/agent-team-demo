// The test database for the integration tests (DATABASE_URL, a Postgres 17
// whose schema the tests may migrate and write to). Locally, without it, those
// tests are reported as skipped. In CI (CI=true) a missing database is an
// error: a skipped integration test must never look like a green one.
export function testDatabaseUrl(): string | undefined {
  const url = process.env['DATABASE_URL'];
  if (url) return url;
  if (process.env['CI']) {
    throw new Error(
      'DATABASE_URL is required in CI: the integration tests need the Postgres service container',
    );
  }
  return undefined;
}
