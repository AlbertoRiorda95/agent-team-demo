import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { buildSearch, pageItems, parseListState, summary } from '../lib/listState';
import { OrdersListPage } from './OrdersListPage';

const order = (n: number) => ({
  number: `ORD-${String(n).padStart(6, '0')}`,
  status: 'paid',
  customerName: `Customer ${String(n)}`,
  total: { amount: '12.50', currency: 'EUR' },
  createdAt: '2026-11-01T10:00:00Z',
});
const page = (items: number[], p: number, total: number) => ({
  items: items.map(order),
  page: p,
  pageSize: 25,
  total,
});

function stub(answer: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => Promise.resolve(answer(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<OrdersListPage />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('parseListState ignores invalid values', () => {
  const p = (s: string) => parseListState(new URLSearchParams(s));
  expect(p('status=paid&q=%20ana%20&page=2')).toEqual({ status: 'paid', q: 'ana', page: 2 });
  expect(p('status=bogus&page=0')).toEqual({ status: undefined, q: '', page: 1 });
  expect(p('page=abc').page).toBe(1);
  expect(p('page=-3').page).toBe(1);
  expect(p('page=1.5').page).toBe(1);
});

test('buildSearch leaves defaults out; summary and pageItems', () => {
  expect(buildSearch({ status: undefined, q: '', page: 1 })).toBe('');
  expect(buildSearch({ status: 'paid', q: 'ana', page: 2 })).toBe('?status=paid&q=ana&page=2');
  expect(summary(2, 25, 137, 25)).toBe('26–50 of 137 orders');
  expect(pageItems(1, 3)).toEqual([1, 2, 3]);
  expect(pageItems(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
});

test('shows the orders with a link, the status as text, the summary and pagination', async () => {
  const fn = stub(() => ok(page([1, 2], 1, 137)));
  renderAt('/');
  const link = await screen.findByRole('link', { name: 'ORD-000001' });
  expect(link.getAttribute('href')).toBe('/orders/ORD-000001');
  expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/€/).length).toBeGreaterThan(0);
  expect(screen.getByText('1–2 of 137 orders')).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy();
  expect(fn.mock.calls[0]?.[0]).toBe('/api/v1/orders');
});

test('the URL state is sent to the API', async () => {
  const fn = stub(() => ok(page([26], 2, 137)));
  renderAt('/?status=paid&q=ana&page=2');
  await screen.findByRole('link', { name: 'ORD-000026' });
  expect(fn.mock.calls[0]?.[0]).toBe('/api/v1/orders?status=paid&q=ana&page=2');
  expect(screen.getByRole('link', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page');
});

test('changing the status goes back to page 1', async () => {
  stub(() => ok(page([26], 2, 137)));
  renderAt('/?page=2');
  await screen.findByRole('link', { name: 'ORD-000026' });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'shipped' } });
  await waitFor(() => {
    expect(screen.getByTestId('where').textContent).toBe('/?status=shipped');
  });
});

test('search updates the URL 300 ms after the last keystroke', async () => {
  stub(() => ok(page([1], 1, 1)));
  renderAt('/');
  await screen.findByRole('link', { name: 'ORD-000001' });
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'an' } });
  vi.advanceTimersByTime(200);
  fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'ana' } });
  vi.advanceTimersByTime(200);
  expect(screen.getByTestId('where').textContent).toBe('/');
  vi.advanceTimersByTime(150);
  vi.useRealTimers();
  await waitFor(() => {
    expect(screen.getByTestId('where').textContent).toBe('/?q=ana');
  });
});

test('no orders at all and no match', async () => {
  stub(() => ok(page([], 1, 0)));
  renderAt('/');
  expect(await screen.findByText('No orders yet')).toBeTruthy();
  cleanup();
  renderAt('/?q=zzz');
  expect(await screen.findByText('No orders match')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/');
});

test('a page beyond the last is replaced by the last page', async () => {
  stub((url) => (url.includes('page=99') ? ok(page([], 99, 137)) : ok(page([126], 6, 137))));
  renderAt('/?page=99');
  await screen.findByRole('link', { name: 'ORD-000126' });
  expect(screen.getByTestId('where').textContent).toBe('/?page=6');
});

test('with no orders the page parameter is dropped', async () => {
  stub(() => ok(page([], 3, 0)));
  renderAt('/?page=3');
  await screen.findByText('No orders yet');
  expect(screen.getByTestId('where').textContent).toBe('/');
});

test('a failure shows an error with Retry, which loads again', async () => {
  let fail = true;
  stub(() => (fail ? new Response(null, { status: 503 }) : ok(page([1], 1, 1))));
  renderAt('/');
  expect((await screen.findByRole('alert')).textContent).toContain("Can't load the orders.");
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('link', { name: 'ORD-000001' })).toBeTruthy();
});

test('loading marks the results region busy', () => {
  stub(() => new Promise<Response>(() => undefined));
  renderAt('/');
  expect(screen.getByRole('region', { name: 'Results' }).getAttribute('aria-busy')).toBe('true');
  expect(screen.getByText('Loading orders…')).toBeTruthy();
});
