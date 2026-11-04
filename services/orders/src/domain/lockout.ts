// Login lockout rules (staff-auth): 5 failed logins for an email within 15
// minutes lock it for 15 minutes from the last of them. Attempts during the
// lock are not recorded (so they do not extend it) and a success does not
// reset the count. Pure functions: no I/O, no framework.

const MINUTE = 60_000;

export const LOCKOUT_MAX_FAILURES = 5;
/** The window the failures must fall in. */
export const LOCKOUT_WINDOW_MS = 15 * MINUTE;
/** How long the email stays locked after the failure that locked it. */
export const LOCKOUT_DURATION_MS = 15 * MINUTE;
/** Older failures cannot lock anything any more: only these need to be read. */
export const LOCKOUT_LOOKBACK_MS = LOCKOUT_WINDOW_MS + LOCKOUT_DURATION_MS;
/** Login attempts older than this are deleted. */
export const LOGIN_ATTEMPT_RETENTION_MS = 24 * 60 * MINUTE;

/**
 * Until when the email is locked, given the times of its failed logins (any
 * order, at least those of the last LOCKOUT_LOOKBACK_MS); `undefined` when it
 * is not locked at `now`.
 */
export function lockedUntil(failures: readonly Date[], now: Date): Date | undefined {
  const times = failures.map((f) => f.getTime()).sort((a, b) => a - b);
  let until: number | undefined;
  for (let last = LOCKOUT_MAX_FAILURES - 1; last < times.length; last++) {
    const lastAt = times[last] as number;
    const firstAt = times[last - (LOCKOUT_MAX_FAILURES - 1)] as number;
    if (lastAt - firstAt > LOCKOUT_WINDOW_MS) continue;
    const end = lastAt + LOCKOUT_DURATION_MS;
    if (end > now.getTime() && (until === undefined || end > until)) until = end;
  }
  return until === undefined ? undefined : new Date(until);
}

/** Whole seconds until `until`, rounded up, at least 1 (the Retry-After value). */
export function secondsUntil(until: Date, now: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
}
