// The pure rules of staff-auth: lockout and session lifetime.
import { describe, expect, it } from 'vitest';
import { lockedUntil, secondsUntil } from '../src/domain/lockout.js';
import {
  isSessionExpired,
  newSessionTimes,
  sessionExpiry,
  touchSession,
} from '../src/domain/session.js';

const T0 = new Date('2026-11-04T10:00:00Z').getTime();
const min = (m: number) => new Date(T0 + m * 60_000);
const hours = (h: number) => min(h * 60);

describe('lockedUntil', () => {
  it('is not locked with 4 failures', () => {
    expect(lockedUntil([min(0), min(1), min(2), min(3)], min(4))).toBeUndefined();
  });

  it('locks for 15 minutes from the 5th failure within 15 minutes', () => {
    const failures = [min(0), min(1), min(2), min(3), min(4)];
    expect(lockedUntil(failures, min(5))).toEqual(min(19));
    expect(lockedUntil(failures, min(18.9))).toEqual(min(19));
    expect(lockedUntil(failures, min(19))).toBeUndefined();
  });

  it('counts the 15-minute window inclusively, and not beyond it', () => {
    expect(lockedUntil([min(0), min(5), min(10), min(14), min(15)], min(16))).toEqual(min(30));
    expect(lockedUntil([min(0), min(5), min(10), min(14), min(15.1)], min(16))).toBeUndefined();
  });

  it('does not depend on the order of the failures', () => {
    const failures = [min(4), min(0), min(3), min(1), min(2)];
    expect(lockedUntil(failures, min(5))).toEqual(min(19));
  });

  it('after the lock, older failures alone do not lock again', () => {
    const failures = [min(0), min(1), min(2), min(3), min(4), min(20)];
    expect(lockedUntil(failures, min(20.5))).toBeUndefined();
  });

  it('rounds Retry-After up to whole seconds, at least 1', () => {
    expect(secondsUntil(min(19), min(5))).toBe(14 * 60);
    expect(secondsUntil(new Date(T0 + 1500), new Date(T0))).toBe(2);
    expect(secondsUntil(new Date(T0), new Date(T0))).toBe(1);
  });
});

describe('session lifetime', () => {
  it('a new session expires after 8 hours idle', () => {
    expect(newSessionTimes(min(0)).expiresAt).toEqual(hours(8));
  });

  it('never lives longer than 24 hours from login', () => {
    expect(sessionExpiry(hours(0), hours(20))).toEqual(hours(24));
  });

  it('is expired at its expiry, not before', () => {
    const s = newSessionTimes(min(0));
    expect(isSessionExpired(s, new Date(hours(8).getTime() - 1))).toBe(false);
    expect(isSessionExpired(s, hours(8))).toBe(true);
  });

  it('is touched at most once a minute, sliding the idle expiry', () => {
    const s = newSessionTimes(min(0));
    expect(touchSession(s, new Date(T0 + 59_999))).toBeUndefined();
    expect(touchSession(s, min(1))).toEqual({
      createdAt: min(0),
      lastSeenAt: min(1),
      expiresAt: new Date(hours(8).getTime() + 60_000),
    });
  });
});
