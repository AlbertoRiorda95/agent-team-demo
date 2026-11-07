import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { OrderDetailPage } from './OrderDetailPage';

const amount = (a: string) => ({ amount: a, currency: 'EUR' });
const order = (over: Record<string, unknown> = {}) => ({
  number: 'ORD-000123',
  externalReference: 'EXT-1',
  status: 'new',
  version: 1,
  currency: 'EUR',
  customer: { name: 'Ana Ruiz', email: 'ana@shop.test' },
  shippingAddress: {
    name: 'Ana Ruiz',
    line1: '1 Main St',
    city: 'Madrid',
    postalCode: '28001',
    country: 'ES',
  },
  items: [
    {
      sku: 'SKU-1',
      name: 'Mug',
      quantity: 2,
      unitPrice: amount('5.00'),
      lineTotal: amount('10.00'),
    },
    {
      sku: 'SKU-2',
      name: 'Plate',
      quantity: 1,
      unitPrice: amount('7.50'),
      lineTotal: amount('7.50'),
    },
  ],
  shippingCost: amount('2.50'),
  total: amount('20.00'),
  history: [],
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  ...over,
});
const paid = order({
  status: 'paid',
  version: 2,
  history: [
    { from: 'new', to: 'paid', changedBy: { id: 'u1', name: 'Ana' }, at: '2026-11-07T10:42:00Z' },
  ],
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function stub(answer: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init?: RequestInit) => Promise.resolve(answer(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}
function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/orders/:number" element={<OrderDetailPage />} />
        <Route path="/" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeAll(() => {
  // jsdom has no <dialog> methods
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('shows every section, the subtotal and only the allowed actions', async () => {
  stub(() => json(200, order()));
  renderAt('/orders/ORD-000123');
  expect(await screen.findByRole('heading', { level: 1, name: 'ORD-000123' })).toBeTruthy();
  for (const h of ['Customer', 'Shipping address', 'Items', 'History']) {
    expect(screen.getByRole('heading', { level: 2, name: h })).toBeTruthy();
  }
  expect(screen.getByText('No status changes yet')).toBeTruthy();
  expect(screen.getByText('Items subtotal').nextElementSibling?.textContent).toMatch(/17[.,]50/);
  expect(screen.getByRole('button', { name: 'Mark paid' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Mark shipped' })).toBeNull();
});

test('a final order shows no actions and says so', async () => {
  stub(() => json(200, order({ status: 'shipped' })));
  renderAt('/orders/ORD-000123');
  expect(await screen.findByText(/This order is final/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
});

test('Mark paid sends the version, updates the page and announces a toast', async () => {
  const fn = stub((url) => (url.endsWith('/status') ? json(200, paid) : json(200, order())));
  renderAt('/orders/ORD-000123');
  fireEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
  expect(await screen.findByRole('button', { name: 'Mark shipped' })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Order ORD-000123 marked as paid');
  const post = fn.mock.calls.find(([u]) => u.endsWith('/status'));
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ to: 'paid', version: 1 });
});

test('a double click sends one request', async () => {
  const fn = stub((url) => (url.endsWith('/status') ? json(200, paid) : json(200, order())));
  renderAt('/orders/ORD-000123');
  const button = await screen.findByRole('button', { name: 'Mark paid' });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByRole('button', { name: 'Mark shipped' });
  expect(fn.mock.calls.filter(([u]) => u.endsWith('/status'))).toHaveLength(1);
});

test('cancel: the dialog sends the reason; 422 shows on the field', async () => {
  let n = 0;
  const fn = stub((url) => {
    if (!url.endsWith('/status')) return json(200, order());
    n += 1;
    return n === 1
      ? json(422, { type: 'about:blank', title: 'Invalid', status: 422 })
      : json(200, order({ status: 'cancelled', version: 2 }));
  });
  renderAt('/orders/ORD-000123');
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(await screen.findByRole('heading', { name: 'Cancel order ORD-000123?' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: ' too late ' } });
  expect(screen.getByText('10 / 500')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
  expect(await screen.findByText(/The reason is not valid/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
  await waitFor(() => {
    expect(screen.getByRole('status').textContent).toContain('marked as cancelled');
  });
  const posts = fn.mock.calls.filter(([u]) => u.endsWith('/status'));
  expect(JSON.parse(String(posts[1]?.[1]?.body))).toEqual({
    to: 'cancelled',
    version: 1,
    reason: 'too late',
  });
});

test('Keep order closes the dialog without a request', async () => {
  const fn = stub(() => json(200, order()));
  renderAt('/orders/ORD-000123');
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Keep order' }));
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: /Cancel order/ })).toBeNull();
  });
  expect(fn).toHaveBeenCalledTimes(1);
});

test('a 409 shows the reload alert, disables the actions and Reload refetches', async () => {
  let reloaded = false;
  const fn = stub((url) => {
    if (url.endsWith('/status')) {
      return json(409, {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        currentStatus: 'paid',
        currentVersion: 2,
      });
    }
    return json(200, reloaded ? paid : order());
  });
  renderAt('/orders/ORD-000123');
  fireEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
  expect(await screen.findByText('This order changed: reload.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Mark paid' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  reloaded = true;
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(await screen.findByRole('button', { name: 'Mark shipped' })).toBeTruthy();
  expect(screen.queryByText('This order changed: reload.')).toBeNull();
  expect(fn).toHaveBeenCalledTimes(3);
});

test('a failed change shows an error with Retry and keeps the order', async () => {
  let fail = true;
  stub((url) => {
    if (!url.endsWith('/status')) return json(200, order());
    return fail ? json(503, { type: 'about:blank', title: 'x', status: 503 }) : json(200, paid);
  });
  renderAt('/orders/ORD-000123');
  fireEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
  expect(await screen.findByText("Couldn't change the status.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mark paid' })).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Mark shipped' })).toBeTruthy();
});

test('unknown and malformed numbers show Not found; a load error has Retry', async () => {
  stub(() => json(404, { type: 'about:blank', title: 'Not found', status: 404 }));
  renderAt('/orders/ORD-999999');
  expect(await screen.findByText("We can't find that page.")).toBeTruthy();
  cleanup();

  const fn = stub(() => json(200, order()));
  renderAt('/orders/abc');
  expect(screen.getByText("We can't find that page.")).toBeTruthy();
  expect(fn).not.toHaveBeenCalled();
  cleanup();

  let fail = true;
  stub(() => (fail ? json(500, {}) : json(200, order())));
  renderAt('/orders/ORD-000123');
  expect(await screen.findByText("Can't load the order.")).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Mark paid' })).toBeTruthy();
});

test('Back to orders returns to the list query it came from, or to /', async () => {
  stub(() => json(200, order()));
  renderAt('/orders/ORD-000123', { fromSearch: '?status=paid&q=ana&page=2' });
  expect((await screen.findByRole('link', { name: 'Back to orders' })).getAttribute('href')).toBe(
    '/?status=paid&q=ana&page=2',
  );
  cleanup();

  stub(() => json(200, order()));
  renderAt('/orders/ORD-000123');
  expect((await screen.findByRole('link', { name: 'Back to orders' })).getAttribute('href')).toBe(
    '/',
  );
});
