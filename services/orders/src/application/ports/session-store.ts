import type { SessionTimes } from '../../domain/session.js';
import type { StaffUserRecord } from './staff-user-store.js';

export interface SessionRecord extends SessionTimes {
  readonly tokenHash: string;
  readonly userId: string;
}

/** Port: persistence of sessions. Only token hashes reach it, never tokens. */
export interface SessionStore {
  insert(session: SessionRecord): Promise<void>;
  /** The session with its account, or `undefined` when no session has this hash. */
  findWithUser(
    tokenHash: string,
  ): Promise<{ session: SessionRecord; user: StaffUserRecord } | undefined>;
  /** Writes new `lastSeenAt` and `expiresAt`. */
  touch(tokenHash: string, times: Pick<SessionTimes, 'lastSeenAt' | 'expiresAt'>): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  /** Deletes every session whose `expiresAt` is not after `now`. */
  deleteExpired(now: Date): Promise<void>;
}
