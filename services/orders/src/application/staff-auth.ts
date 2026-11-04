// Use cases of staff authentication (staff-auth): log in with the lockout,
// authenticate a request by its session token, log out.
import { randomBytes } from 'node:crypto';
import {
  LOCKOUT_LOOKBACK_MS,
  LOGIN_ATTEMPT_RETENTION_MS,
  lockedUntil,
  secondsUntil,
} from '../domain/lockout.js';
import { isSessionExpired, newSessionTimes, touchSession } from '../domain/session.js';
import { normalizeEmail } from '../domain/staff-user.js';
import type { Clock } from './ports/clock.js';
import type { LoginAttemptStore } from './ports/login-attempt-store.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import type { SessionStore } from './ports/session-store.js';
import type { SessionTokens } from './ports/session-tokens.js';
import type { StaffUserRecord, StaffUserStore } from './ports/staff-user-store.js';

export interface StaffAuthDeps {
  readonly users: StaffUserStore;
  readonly sessions: SessionStore;
  readonly attempts: LoginAttemptStore;
  readonly hasher: PasswordHasher;
  readonly tokens: SessionTokens;
  readonly clock: Clock;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export type LoginResult =
  | { readonly kind: 'ok'; readonly user: StaffUserRecord; readonly token: string }
  /** Wrong email or password, or a deactivated account: never told apart. */
  | { readonly kind: 'invalid' }
  | { readonly kind: 'locked'; readonly retryAfterSeconds: number };

/** What the HTTP layer needs; built once with `createStaffAuth`. */
export interface StaffAuth {
  logIn(input: LoginInput): Promise<LoginResult>;
  /** The active account of a valid session, or `undefined` (unknown, expired, deactivated). */
  authenticate(token: string): Promise<StaffUserRecord | undefined>;
  /** Deletes the session of the token, if any. */
  logOut(token: string): Promise<void>;
  /** True when the value could be a session token (checked before any lookup). */
  isWellFormedToken(value: string): boolean;
}

export function createStaffAuth(deps: StaffAuthDeps): StaffAuth {
  // An unknown email still costs one verification, so timing does not reveal
  // which emails have an account. Hashed lazily, once.
  let dummyHash: Promise<string> | undefined;
  const verifyAgainstDummy = async (password: string): Promise<void> => {
    dummyHash ??= deps.hasher.hash(randomBytes(32).toString('base64url'));
    await deps.hasher.verify(await dummyHash, password);
  };

  return {
    async logIn(input) {
      const now = deps.clock();
      const email = normalizeEmail(input.email);

      // housekeeping, as the spec asks: at login
      await deps.sessions.deleteExpired(now);
      await deps.attempts.deleteBefore(new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_MS));

      const failures = await deps.attempts.failuresSince(
        email,
        new Date(now.getTime() - LOCKOUT_LOOKBACK_MS),
      );
      const until = lockedUntil(failures, now);
      // not recorded: attempts during the lock do not extend it
      if (until) return { kind: 'locked', retryAfterSeconds: secondsUntil(until, now) };

      const credentials = await deps.users.findCredentialsByEmail(email);
      let valid = false;
      if (credentials) {
        // a deactivated account is verified too: same cost, same answer
        valid =
          (await deps.hasher.verify(credentials.passwordHash, input.password)) &&
          credentials.user.active;
      } else {
        await verifyAgainstDummy(input.password);
      }

      await deps.attempts.record(email, now, valid);
      if (!valid || !credentials) return { kind: 'invalid' };

      const token = deps.tokens.generate();
      await deps.sessions.insert({
        tokenHash: deps.tokens.hash(token),
        userId: credentials.user.id,
        ...newSessionTimes(now),
      });
      return { kind: 'ok', user: credentials.user, token };
    },

    async authenticate(token) {
      if (!deps.tokens.isWellFormed(token)) return undefined;
      const tokenHash = deps.tokens.hash(token);
      const found = await deps.sessions.findWithUser(tokenHash);
      if (!found) return undefined;
      const now = deps.clock();
      if (isSessionExpired(found.session, now) || !found.user.active) {
        await deps.sessions.delete(tokenHash);
        return undefined;
      }
      const touched = touchSession(found.session, now);
      if (touched) await deps.sessions.touch(tokenHash, touched);
      return found.user;
    },

    async logOut(token) {
      if (!deps.tokens.isWellFormed(token)) return;
      await deps.sessions.delete(deps.tokens.hash(token));
    },

    isWellFormedToken: (value) => deps.tokens.isWellFormed(value),
  };
}
