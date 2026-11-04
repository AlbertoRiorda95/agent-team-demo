// Session lifetime rules (staff-auth): 8 hours idle, sliding, and at most 24
// hours from login. Pure functions: no I/O, no framework.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A session expires after this long without a request. */
export const SESSION_IDLE_TIMEOUT_MS = 8 * HOUR;
/** A session never lives longer than this from login. */
export const SESSION_MAX_AGE_MS = 24 * HOUR;
/** `lastSeenAt` is written at most this often. */
export const SESSION_TOUCH_INTERVAL_MS = MINUTE;

export interface SessionTimes {
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
}

/**
 * The moment a session seen at `lastSeenAt` expires: 8 hours later, but never
 * after 24 hours from its creation. Stored as `expiresAt`, so expired sessions
 * are found with one indexed comparison.
 */
export function sessionExpiry(createdAt: Date, lastSeenAt: Date): Date {
  const idle = lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS;
  const absolute = createdAt.getTime() + SESSION_MAX_AGE_MS;
  return new Date(Math.min(idle, absolute));
}

/** The times of a session started now. */
export function newSessionTimes(now: Date): SessionTimes {
  return { createdAt: now, lastSeenAt: now, expiresAt: sessionExpiry(now, now) };
}

export function isSessionExpired(session: SessionTimes, now: Date): boolean {
  return now.getTime() >= session.expiresAt.getTime();
}

/**
 * The new times when the session should be touched (its last write is at
 * least a minute old), otherwise `undefined`. Touching slides the idle expiry.
 */
export function touchSession(session: SessionTimes, now: Date): SessionTimes | undefined {
  if (now.getTime() - session.lastSeenAt.getTime() < SESSION_TOUCH_INTERVAL_MS) return undefined;
  return {
    createdAt: session.createdAt,
    lastSeenAt: now,
    expiresAt: sessionExpiry(session.createdAt, now),
  };
}
