// A StaffAuth stub for the tests that do not need the database: one valid
// session token, every login refused. The real use cases are tested in
// auth.test.ts against the test database.
import type { StaffUserRecord } from '../src/application/ports/staff-user-store.js';
import type { StaffAuth } from '../src/application/staff-auth.js';
import type { WebOptions } from '../src/adapters/http/app.js';

export const WEB: WebOptions = { production: false, publicOrigin: 'http://localhost:5173' };
/** 43 base64url characters, like a real token. */
export const VALID_TOKEN = 'A'.repeat(43);
export const OTHER_TOKEN = 'B'.repeat(43);

export const STUB_USER: StaffUserRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'staff@example.com',
  name: 'Staff Member',
  active: true,
  createdAt: new Date('2026-11-01T00:00:00Z'),
};

export interface FakeAuth extends StaffAuth {
  /** Every call that reached the use cases, in order. */
  readonly calls: string[];
}

export function fakeAuth(): FakeAuth {
  const calls: string[] = [];
  return {
    calls,
    logIn: () => {
      calls.push('logIn');
      return Promise.resolve({ kind: 'invalid' });
    },
    authenticate: (token) => {
      calls.push('authenticate');
      return Promise.resolve(token === VALID_TOKEN ? STUB_USER : undefined);
    },
    logOut: () => {
      calls.push('logOut');
      return Promise.resolve();
    },
    isWellFormedToken: (value) => /^[A-Za-z0-9_-]{43}$/.test(value),
  };
}
