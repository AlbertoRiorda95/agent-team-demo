// The status change rules (spec order-detail, Test seams: Domain): the
// transition table, the order of the checks (version before transition) and
// the reason rules (only for a cancellation, trimmed, at most 500, empty is none).
import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, type OrderStatus } from '../src/domain/order.js';
import {
  InvalidStatusChangeError,
  MAX_REASON_LENGTH,
  statusChangeConflict,
  statusChangeReason,
} from '../src/domain/order-status.js';

const ALLOWED = ['new→paid', 'new→cancelled', 'paid→shipped', 'paid→cancelled'];

describe('statusChangeConflict', () => {
  const pairs = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.map((to) => [from, to] as [OrderStatus, OrderStatus]),
  );

  it.each(pairs)('%s → %s is allowed only when it is in the table', (from, to) => {
    const conflict = statusChangeConflict({ status: from, version: 4 }, 4, to);
    expect(conflict).toBe(ALLOWED.includes(`${from}→${to}`) ? undefined : 'not-allowed');
  });

  it('checks the version before the transition', () => {
    expect(statusChangeConflict({ status: 'shipped', version: 3 }, 2, 'paid')).toBe(
      'stale-version',
    );
    expect(statusChangeConflict({ status: 'new', version: 1 }, 2, 'paid')).toBe('stale-version');
  });
});

describe('statusChangeReason', () => {
  it('is none when none is sent', () => {
    expect(statusChangeReason('paid', undefined)).toBeUndefined();
    expect(statusChangeReason('cancelled', undefined)).toBeUndefined();
  });

  it('is trimmed for a cancellation, and an empty one is none', () => {
    expect(statusChangeReason('cancelled', '  Customer asked \n')).toBe('Customer asked');
    expect(statusChangeReason('cancelled', '   ')).toBeUndefined();
    expect(statusChangeReason('cancelled', '')).toBeUndefined();
  });

  it.each(['paid', 'shipped'] as const)('is refused with to: %s, even empty', (to) => {
    expect(() => statusChangeReason(to, 'x')).toThrow(InvalidStatusChangeError);
    expect(() => statusChangeReason(to, '')).toThrow(InvalidStatusChangeError);
  });

  it('accepts 500 characters after trimming and refuses 501', () => {
    const max = 'a'.repeat(MAX_REASON_LENGTH);
    expect(statusChangeReason('cancelled', ` ${max} `)).toBe(max);
    let error: unknown;
    try {
      statusChangeReason('cancelled', `${max}b`);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InvalidStatusChangeError);
    expect(error).toMatchObject({ field: 'reason', problem: 'must be at most 500 characters' });
  });
});
