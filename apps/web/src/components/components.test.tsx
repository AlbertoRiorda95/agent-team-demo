import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { formatAmount, formatDateTime } from '../lib/format';
import { ErrorRetry } from './ErrorRetry';
import { Spinner } from './Spinner';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

test('formatAmount shows the currency and the right decimals', () => {
  expect(formatAmount({ amount: '1234.50', currency: 'EUR' }, 'en-US')).toBe('€1,234.50');
  expect(formatAmount({ amount: '12.50', currency: 'USD' }, 'en-US')).toBe('$12.50');
  expect(formatAmount({ amount: '9.99', currency: 'GBP' }, 'en-US')).toBe('£9.99');
  expect(formatAmount({ amount: '1250', currency: 'JPY' }, 'en-US')).toBe('¥1,250');
});

test('formatDateTime shows date and time, and keeps an invalid value as is', () => {
  const out = formatDateTime('2026-11-07T10:30:00Z', 'en-US');
  expect(out).toContain('2026');
  expect(out).toMatch(/\d{1,2}:\d{2}/);
  expect(formatDateTime('nope', 'en-US')).toBe('nope');
});

test('StatusBadge always shows the status as text', () => {
  for (const [status, text] of [
    ['new', 'New'],
    ['paid', 'Paid'],
    ['shipped', 'Shipped'],
    ['cancelled', 'Cancelled'],
  ] as const) {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(text).className).toContain(`badge-${status}`);
    cleanup();
  }
});

test('Spinner announces a status', () => {
  render(<Spinner />);
  expect(screen.getByRole('status').textContent).toBe('Loading…');
});

test('ErrorRetry shows an alert and calls onRetry', () => {
  const onRetry = vi.fn();
  render(<ErrorRetry message="Boom" onRetry={onRetry} />);
  expect(screen.getByRole('alert').textContent).toContain('Boom');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledOnce();
});
