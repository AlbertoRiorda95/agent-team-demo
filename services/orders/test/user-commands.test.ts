// The operator commands user:create, user:deactivate and user:set-password,
// run as child processes with the password on stdin (spec staff-auth, Test
// seams: CLI). Input errors are caught before the database is opened, so those
// cases always run, against an unreachable DATABASE_URL. The cases that write
// accounts need the test database in DATABASE_URL; without it they are
// reported as skipped. Not covered: the interactive hidden prompt (by hand).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import { sessions, staffUsers } from '../src/adapters/persistence/schema.js';

const SERVICE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = 'src/adapters/cli/user.ts';
const UNREACHABLE_DB = 'postgres://orders:orders@127.0.0.1:1/orders';
const PASSWORD = 'correct horse battery';
const EMAIL_DOMAIN = 'cli-test.example.com';

interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: string[], stdin: string, databaseUrl: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ENTRY, ...args], {
      cwd: SERVICE_DIR,
      env: { PATH: process.env['PATH'], DATABASE_URL: databaseUrl },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

function uniqueEmail(): string {
  return `staff-${randomUUID()}@${EMAIL_DOMAIN}`;
}

describe('input errors (no database needed)', () => {
  const run = (args: string[], stdin = `${PASSWORD}\n`) => runCli(args, stdin, UNREACHABLE_DB);

  it('user:create refuses an invalid email', async () => {
    const res = await run(['create', '--email', 'not-an-email', '--name', 'Ann']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('not a valid email');
  });

  it('user:create refuses an empty name', async () => {
    const res = await run(['create', '--email', uniqueEmail(), '--name', '   ']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('name must not be empty');
  });

  it('user:create refuses a password under 12 characters, without echoing it', async () => {
    const res = await run(['create', '--email', uniqueEmail(), '--name', 'Ann'], 'elevenchars\n');
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('at least 12 characters');
    expect(res.stderr + res.stdout).not.toContain('elevenchars');
  });

  it('counts characters, not bytes: 12 non-ASCII characters are accepted by the check', async () => {
    // passes validation and reaches the (unreachable) database
    const res = await run(['create', '--email', uniqueEmail(), '--name', 'Ann'], 'ééééééééééé\n');
    expect(res.stderr).toContain('at least 12 characters');
    const ok = await run(['create', '--email', uniqueEmail(), '--name', 'Ann'], 'éééééééééééé\n');
    expect(ok.stderr).not.toContain('at least 12 characters');
    expect(ok.code).toBe(1); // database down
  });

  it('never takes the password from a flag', async () => {
    const res = await run(['create', '--email', uniqueEmail(), '--name', 'Ann', '--password', PASSWORD]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Usage: npm run user:create');
  });

  it('requires --email', async () => {
    const res = await run(['deactivate']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Missing --email');
  });

  it('user:set-password refuses a short password', async () => {
    const res = await run(['set-password', '--email', uniqueEmail()], 'short\n');
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('at least 12 characters');
  });

  it('refuses an unknown command', async () => {
    const res = await run(['delete', '--email', uniqueEmail()]);
    expect(res.code).toBe(2);
  });

  it('fails with a non-zero exit code when the database is down', async () => {
    const res = await run(['deactivate', '--email', uniqueEmail()]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/^Error: /);
    expect(res.stderr).not.toContain('orders:orders');
  });
});

const testDatabaseUrl = process.env['DATABASE_URL'];

describe.runIf(testDatabaseUrl)('with the test database (DATABASE_URL)', () => {
  const url = testDatabaseUrl ?? '';
  const run = (args: string[], stdin = `${PASSWORD}\n`) => runCli(args, stdin, url);
  let database: Database;

  beforeAll(async () => {
    database = openDatabase(url);
    await applyMigrations(database.db);
    await database.db.delete(staffUsers).where(like(staffUsers.email, `%@${EMAIL_DOMAIN}`));
  });

  afterAll(async () => {
    await database.db.delete(staffUsers).where(like(staffUsers.email, `%@${EMAIL_DOMAIN}`));
    await database.close();
  });

  async function findUser(email: string) {
    const rows = await database.db.select().from(staffUsers).where(eq(staffUsers.email, email));
    return rows[0];
  }

  async function addSession(userId: string): Promise<void> {
    const now = new Date();
    await database.db.insert(sessions).values({
      tokenHash: randomUUID(),
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 8 * 3600_000),
    });
  }

  async function sessionCount(userId: string): Promise<number> {
    const rows = await database.db.select().from(sessions).where(eq(sessions.userId, userId));
    return rows.length;
  }

  it('user:create stores a trimmed lower-case email and an Argon2id hash, never the password', async () => {
    const email = uniqueEmail();
    const res = await run(['create', '--email', `  ${email.toUpperCase()} `, '--name', ' Ann Lee ']);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    const user = await findUser(email);
    expect(user).toMatchObject({ email, name: 'Ann Lee', active: true });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain(PASSWORD);
    expect(await argon2.verify(user?.passwordHash ?? '', PASSWORD)).toBe(true);
    expect(res.stdout).toContain(user?.id);
  });

  it('user:create refuses an email already used, in any case', async () => {
    const email = uniqueEmail();
    expect((await run(['create', '--email', email, '--name', 'Ann'])).code).toBe(0);
    const res = await run(['create', '--email', email.toUpperCase(), '--name', 'Bob']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('already used');
  });

  it('user:create refuses the email of a deactivated account', async () => {
    const email = uniqueEmail();
    expect((await run(['create', '--email', email, '--name', 'Ann'])).code).toBe(0);
    expect((await run(['deactivate', '--email', email])).code).toBe(0);
    const res = await run(['create', '--email', email, '--name', 'Ann']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('already used');
  });

  it('user:deactivate sets the account inactive and deletes its sessions', async () => {
    const email = uniqueEmail();
    expect((await run(['create', '--email', email, '--name', 'Ann'])).code).toBe(0);
    const user = await findUser(email);
    await addSession(user?.id ?? '');
    await addSession(user?.id ?? '');

    const res = await run(['deactivate', '--email', email.toUpperCase()]);
    expect(res.code).toBe(0);
    expect((await findUser(email))?.active).toBe(false);
    expect(await sessionCount(user?.id ?? '')).toBe(0);
  });

  it('user:set-password replaces the hash and deletes the sessions', async () => {
    const email = uniqueEmail();
    expect((await run(['create', '--email', email, '--name', 'Ann'])).code).toBe(0);
    const before = await findUser(email);
    await addSession(before?.id ?? '');

    const newPassword = 'another long passphrase';
    const res = await run(['set-password', '--email', email], `${newPassword}\n`);
    expect(res.code).toBe(0);
    const after = await findUser(email);
    expect(await argon2.verify(after?.passwordHash ?? '', newPassword)).toBe(true);
    expect(await argon2.verify(after?.passwordHash ?? '', PASSWORD)).toBe(false);
    expect(await sessionCount(before?.id ?? '')).toBe(0);
  });

  it.each(['deactivate', 'set-password'])('user:%s fails for an unknown email', async (command) => {
    const res = await run([command, '--email', uniqueEmail()]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('No account has this email');
  });
});
