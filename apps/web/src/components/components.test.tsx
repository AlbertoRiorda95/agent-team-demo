import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { formatAmount, formatDateTime } from '../lib/format';
import { MemoryRouter } from 'react-router';
import { NotFoundPage } from '../pages/NotFoundPage';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { TOAST_MS, Toast } from './Toast';
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

test('Button danger variant and busy state', () => {
  const onClick = vi.fn();
  const { rerender } = render(
    <Button variant="danger" onClick={onClick}>
      Cancel order
    </Button>,
  );
  const b = screen.getByRole('button', { name: 'Cancel order' });
  expect(b.className).toContain('btn-danger');
  fireEvent.click(b);
  expect(onClick).toHaveBeenCalledOnce();
  rerender(
    <Button variant="danger" busy onClick={onClick}>
      Cancel order
    </Button>,
  );
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
});

test('Dialog opens as modal labelled by its title, and Escape asks to close', () => {
  // jsdom has no showModal/close: stand-ins that toggle `open` (focus trap and
  // Escape are the browser's, covered by the Playwright tests of the detail page)
  vi.stubGlobal('HTMLDialogElement', HTMLDialogElement);
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  const onClose = vi.fn();
  const view = (open: boolean) => (
    <Dialog open={open} title="Cancel order ORD-1?" onClose={onClose}>
      <p>body</p>
    </Dialog>
  );
  const { rerender, container } = render(view(false));
  expect(screen.queryByText('body')).toBeNull();
  rerender(view(true));
  const dialog = container.querySelector<HTMLDialogElement>('dialog');
  if (!dialog) throw new Error('no dialog');
  expect(dialog.open).toBe(true);
  expect(screen.getByRole('dialog', { name: 'Cancel order ORD-1?' })).toBe(dialog);
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(onClose).toHaveBeenCalledOnce();
  rerender(view(false));
  expect(dialog.open).toBe(false);
});

test('Toast is a polite status, shows the message and ends after 5 s', () => {
  vi.useFakeTimers();
  const onDone = vi.fn();
  render(<Toast message="Order ORD-1 marked as paid" onDone={onDone} />);
  const region = screen.getByRole('status');
  expect(region.getAttribute('aria-live')).toBe('polite');
  expect(region.textContent).toBe('Order ORD-1 marked as paid');
  vi.advanceTimersByTime(TOAST_MS - 1);
  expect(onDone).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onDone).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

test('NotFoundPage links back to the list', () => {
  render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  );
  expect(screen.getByText("We can't find that page.")).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Back to orders' }).getAttribute('href')).toBe('/');
});
