// `npm run seed` as a child process, the cases that need no database (spec
// order-intake, Test seams: CLI): the production guard and the command line,
// against an unreachable DATABASE_URL. The database cases are in
// seed-command.test.ts.
import { describe, expect, it } from 'vitest';
import { runSeed, UNREACHABLE_DB } from './seed-cli.js';

describe('seed command line (no database needed)', () => {
  it('refuses NODE_ENV=production before opening the database', async () => {
    const res = await runSeed([], UNREACHABLE_DB, { NODE_ENV: 'production' });
    expect(res.code).toBe(1);
    expect(res.stderr).toBe(
      'Error: the seed never runs with NODE_ENV=production. Nothing was written.\n',
    );
  });

  it('refuses production even with a valid --count and no DATABASE_URL', async () => {
    const res = await runSeed(['--count', '5'], '', { NODE_ENV: 'production' });
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('NODE_ENV=production');
  });

  it.each([['0'], ['10000'], ['abc'], ['-3'], ['2.5'], ['']])(
    'refuses --count=%s',
    async (value) => {
      const res = await runSeed([`--count=${value}`], UNREACHABLE_DB);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain('--count must be an integer from 1 to 9999');
    },
  );

  it('refuses an unknown option', async () => {
    const res = await runSeed(['--force'], UNREACHABLE_DB);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Usage: npm run seed');
  });

  it('needs DATABASE_URL outside production', async () => {
    const res = await runSeed([], '');
    expect(res.code).toBe(1);
    expect(res.stderr).toBe('Error: DATABASE_URL is required\n');
  });

  it('fails with a non-zero exit code when the database is down, without the URL', async () => {
    const res = await runSeed(['--count', '1'], UNREACHABLE_DB);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/^Error: /);
    expect(res.stderr).not.toContain('orders:orders');
  });
});
