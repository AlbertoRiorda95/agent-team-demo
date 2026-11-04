// POST /auth/login, POST /auth/logout, GET /auth/me and one staff route
// (GET /orders) through app.inject, on the test database with a controllable
// clock (spec staff-auth, Test seams: API). Needs DATABASE_URL; without it the
// cases are reported as skipped (and CI fails, see test-database.ts).
// Not covered: real cookies in a browser and the reverse proxy.
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { eq, like } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/adapters/http/app.js';
import { openDatabase, type Database } from '../src/adapters/persistence/database.js';
import { createLoginAttemptStore } from '../src/adapters/persistence/login-attempt-store.js';
import { applyMigrations } from '../src/adapters/persistence/migrations.js';
import { loginAttempts, sessions, staffUsers } from '../src/adapters/persistence/schema.js';
import { createSessionStore } from '../src/adapters/persistence/session-store.js';
import { createStaffUserStore } from '../src/adapters/persistence/staff-user-store.js';
import { createArgon2PasswordHasher } from '../src/adapters/security/argon2-password-hasher.js';
import { createHmacSessionTokens } from '../src/adapters/security/hmac-session-tokens.js';
import { createStaffUser, deactivateStaffUser } from '../src/application/manage-staff-users.js';
import { createStaffAuth } from '../src/application/staff-auth.js';
import { testDatabaseUrl } from './test-database.js';

const EMAIL_DOMAIN = 'auth-test.example.com';
const PASSWORD = 'correct horse battery';
const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-session-secret-of-32-characters!';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const databaseUrl = testDatabaseUrl();

describe.runIf(databaseUrl)('staff authentication (test database)', () => {
  let database: Database;
  let now: Date;
  let logLines: string[];
  const apps: FastifyInstance[] = [];
  const hasher = createArgon2PasswordHasher();
  const tokens = createHmacSessionTokens(SECRET);

  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };

  function makeApp(production = false): FastifyInstance {
    const db = database.db;
    const auth = createStaffAuth({
      users: createStaffUserStore(db),
      sessions: createSessionStore(db),
      attempts: createLoginAttemptStore(db),
      hasher,
      tokens,
      clock: () => now,
    });
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString());
        callback();
      },
    });
    const app = buildApp({
      databaseHealth: database.health,
      auth,
      web: { production, publicOrigin: ORIGIN },
      // the most verbose level: nothing personal may appear even there
      logger: { level: 'trace', stream },
    });
    apps.push(app);
    return app;
  }

  let app: FastifyInstance;

  beforeAll(async () => {
    database = openDatabase(databaseUrl ?? '');
    await applyMigrations(database.db);
    await cleanUp();
  });

  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
    await cleanUp();
    await database.close();
  });

  beforeEach(() => {
    now = new Date();
    logLines = [];
    app = makeApp();
  });

  async function cleanUp(): Promise<void> {
    await database.db.delete(staffUsers).where(like(staffUsers.email, `%@${EMAIL_DOMAIN}`));
    await database.db.delete(loginAttempts).where(like(loginAttempts.email, `%@${EMAIL_DOMAIN}`));
  }

  function uniqueEmail(): string {
    return `staff-${randomUUID()}@${EMAIL_DOMAIN}`;
  }

  async function newUser(email = uniqueEmail()) {
    return createStaffUser(
      { store: createStaffUserStore(database.db), hasher },
      { email, name: 'Ann Lee', password: PASSWORD },
    );
  }

  function logIn(email: string, password = PASSWORD, target = app) {
    return target.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
  }

  function sessionToken(res: LightMyRequestResponse): string {
    const match = /^session=([^;]+);/.exec(String(res.headers['set-cookie']));
    if (!match?.[1]) throw new Error('no session cookie');
    return match[1];
  }

  function me(token: string | undefined): Promise<LightMyRequestResponse> {
    const options: InjectOptions = { method: 'GET', url: '/api/v1/auth/me' };
    if (token) options.headers = { cookie: `session=${token}` };
    return app.inject(options);
  }

  async function storedSession(token: string) {
    const rows = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokens.hash(token)));
    return rows[0];
  }

  describe('POST /auth/login', () => {
    it('answers 200 with the StaffUser and an HttpOnly, SameSite=Lax session cookie', async () => {
      const user = await newUser();
      const res = await logIn(user.email.toUpperCase());
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: user.id, email: user.email, name: 'Ann Lee' });
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/^session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax$/);

      const token = sessionToken(res);
      const session = await storedSession(token);
      expect(session).toMatchObject({ userId: user.id });
      // only the HMAC is stored
      expect(session?.tokenHash).not.toContain(token);
      expect(session?.expiresAt.getTime()).toBe(now.getTime() + 8 * HOUR);
    });

    it('marks the cookie Secure in production', async () => {
      const user = await newUser();
      const res = await logIn(user.email, PASSWORD, makeApp(true));
      expect(res.statusCode).toBe(200);
      expect(String(res.headers['set-cookie'])).toMatch(/; Secure$/);
    });

    it('answers the same 401 for a wrong password, an unknown email and a deactivated account', async () => {
      const user = await newUser();
      const inactive = await newUser();
      await deactivateStaffUser({ store: createStaffUserStore(database.db) }, inactive.email);

      const answers = await Promise.all([
        logIn(user.email, 'wrong password!!'),
        logIn(uniqueEmail()),
        logIn(inactive.email),
      ]);
      for (const res of answers) {
        expect(res.statusCode).toBe(401);
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      }
      const bodies = answers.map((res) => res.body);
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0] ?? '')).toEqual({
        type: 'about:blank',
        title: 'Wrong email or password',
        status: 401,
      });
    });

    it('answers 422 to {}', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
      expect(res.statusCode).toBe(422);
    });

    it('deletes expired sessions and attempts older than 24 hours', async () => {
      const user = await newUser();
      const old = sessionToken(await logIn(user.email));
      await logIn(user.email, 'wrong password!!');
      advance(25 * HOUR);
      await logIn(user.email);

      expect(await storedSession(old)).toBeUndefined();
      const attempts = await database.db
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.email, user.email));
      expect(attempts).toHaveLength(1); // only the login just made
      expect(attempts[0]?.success).toBe(true);
    });
  });

  describe('lockout', () => {
    async function failFiveTimes(email: string) {
      for (let i = 0; i < 5; i++) {
        expect((await logIn(email, 'wrong password!!')).statusCode).toBe(401);
        advance(MINUTE);
      }
      advance(-MINUTE); // now = the time of the 5th failure
    }

    it('locks after 5 failures in 15 minutes, even for the right password, until 15 minutes after the last', async () => {
      const user = await newUser();
      await failFiveTimes(user.email);

      const locked = await logIn(user.email);
      expect(locked.statusCode).toBe(429);
      expect(locked.headers['retry-after']).toBe('900');
      expect(locked.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(locked.headers['set-cookie']).toBeUndefined();

      // attempts during the lock do not extend it
      advance(10 * MINUTE);
      expect((await logIn(user.email, 'wrong password!!')).statusCode).toBe(429);
      advance(5 * MINUTE - 1000);
      const almost = await logIn(user.email);
      expect(almost.statusCode).toBe(429);
      expect(almost.headers['retry-after']).toBe('1');

      advance(1000);
      expect((await logIn(user.email)).statusCode).toBe(200);
    });

    it('counts unknown emails too', async () => {
      const email = uniqueEmail();
      await failFiveTimes(email);
      expect((await logIn(email)).statusCode).toBe(429);
    });

    it('is per email', async () => {
      const user = await newUser();
      const other = await newUser();
      await failFiveTimes(user.email);
      expect((await logIn(other.email)).statusCode).toBe(200);
    });

    it('a success does not reset the count', async () => {
      const user = await newUser();
      for (let i = 0; i < 4; i++) await logIn(user.email, 'wrong password!!');
      expect((await logIn(user.email)).statusCode).toBe(200);
      expect((await logIn(user.email, 'wrong password!!')).statusCode).toBe(401);
      expect((await logIn(user.email)).statusCode).toBe(429);
    });
  });

  describe('GET /auth/me and the session lifetime', () => {
    it('answers the user with the cookie and 401 without it', async () => {
      const user = await newUser();
      const token = sessionToken(await logIn(user.email));
      const res = await me(token);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: user.id, email: user.email, name: 'Ann Lee' });
      expect((await me(undefined)).statusCode).toBe(401);
    });

    it('expires after 8 hours idle', async () => {
      const user = await newUser();
      const token = sessionToken(await logIn(user.email));
      advance(8 * HOUR - 1000);
      expect((await me(token)).statusCode).toBe(200);
      advance(8 * HOUR);
      const res = await me(token);
      expect(res.statusCode).toBe(401);
      expect(String(res.headers['set-cookie'])).toMatch(/^session=; .*Max-Age=0/);
      expect(await storedSession(token)).toBeUndefined();
    });

    it('slides with use, but ends 24 hours after login', async () => {
      const user = await newUser();
      const token = sessionToken(await logIn(user.email));
      for (let h = 0; h < 3; h++) {
        advance(7 * HOUR);
        expect((await me(token)).statusCode).toBe(200); // 7 h, 14 h, 21 h
      }
      advance(3 * HOUR); // 24 h
      expect((await me(token)).statusCode).toBe(401);
    });

    it('writes lastSeenAt at most once a minute', async () => {
      const user = await newUser();
      const token = sessionToken(await logIn(user.email));
      const loggedInAt = now.getTime();
      advance(30_000);
      await me(token);
      expect((await storedSession(token))?.lastSeenAt.getTime()).toBe(loggedInAt);
      advance(30_000);
      await me(token);
      expect((await storedSession(token))?.lastSeenAt.getTime()).toBe(now.getTime());
    });

    it('answers 401 for a deactivated user', async () => {
      const user = await newUser();
      const token = sessionToken(await logIn(user.email));
      // deactivation deletes the sessions; also flip the flag alone to test the guard itself
      await database.db.update(staffUsers).set({ active: false }).where(eq(staffUsers.id, user.id));
      expect((await me(token)).statusCode).toBe(401);
    });

    it('answers 401 for an unknown token', async () => {
      expect((await me('x'.repeat(43))).statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('answers 204, clears the cookie, and the cookie then gets 401', async () => {
      const user = await newUser();
      const token = sessionToken(await logIn(user.email));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: `session=${token}`, origin: ORIGIN },
      });
      expect(res.statusCode).toBe(204);
      expect(String(res.headers['set-cookie'])).toMatch(/^session=; .*Max-Age=0/);
      expect(await storedSession(token)).toBeUndefined();
      expect((await me(token)).statusCode).toBe(401);
    });

    it('with a wrong Origin answers 403 and changes nothing', async () => {
      const user = await newUser();
      const token = sessionToken(await logIn(user.email));
      const before = await storedSession(token);
      advance(5 * MINUTE);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: `session=${token}`, origin: 'https://evil.example.com' },
      });
      expect(res.statusCode).toBe(403);
      expect(await storedSession(token)).toEqual(before); // not deleted, not even touched
    });
  });

  describe('a staff route (GET /orders)', () => {
    it('answers 401 without a session and reaches the handler (501) with one', async () => {
      const user = await newUser();
      const token = sessionToken(await logIn(user.email));
      expect((await app.inject({ method: 'GET', url: '/api/v1/orders' })).statusCode).toBe(401);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/orders',
        headers: { cookie: `session=${token}` },
      });
      expect(res.statusCode).toBe(501);
    });
  });

  describe('logs', () => {
    it('never contain the email, the password or the token of a login', async () => {
      const user = await newUser();
      const ok = await logIn(user.email);
      const token = sessionToken(ok);
      await logIn(user.email, 'wrong password!!');
      await me(token);
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: `session=${token}`, origin: ORIGIN },
      });

      const output = logLines.join('\n');
      expect(logLines.length).toBeGreaterThan(0);
      for (const secret of [user.email, PASSWORD, 'wrong password!!', token, tokens.hash(token)]) {
        expect(output).not.toContain(secret);
      }
    });
  });
});
