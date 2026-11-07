import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './App';
import { logout } from './api/client';
import { AuthProvider } from './auth/AuthProvider';
import { Shell } from './Shell';
import { safeNext } from './auth/next';

const user = { id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', email: 'ana@shop.test', name: 'Ana' };

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** Stubs fetch with one handler per "METHOD /path"; anything else is a network error. */
function stubApi(routes: Record<string, Handler>) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const handler = routes[key];
    return handler ? Promise.resolve(handler(init)) : Promise.reject(new Error('down'));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json =
  (status: number, body: unknown, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(body), { status, headers });
const none = (status: number) => () => new Response(null, { status });

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  );
}

async function fillAndSubmit(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const emptyPage = { items: [], page: 1, pageSize: 25, total: 0 };

test('signed in: the shell shows the name and the orders list', async () => {
  stubApi({
    'GET /api/v1/auth/me': json(200, user),
    'GET /api/v1/orders': json(200, emptyPage),
  });
  renderAt('/');
  expect(await screen.findByText('Ana')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
  expect(await screen.findByText('No orders yet')).toBeTruthy();
});

test('no session: redirects to /login, keeping the page in next', async () => {
  stubApi({ 'GET /api/v1/auth/me': json(401, { status: 401 }) });
  renderAt('/');
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
  expect(screen.getByTestId('where').textContent).toBe('/login');
});

test('session check failing shows the error state with Retry', async () => {
  stubApi({});
  renderAt('/');
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("Can't reach the service.");
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});

test('login success goes to next', async () => {
  stubApi({
    'GET /api/v1/auth/me': json(401, {}),
    'POST /api/v1/auth/login': json(200, user),
    'GET /api/v1/orders': json(200, emptyPage),
  });
  renderAt('/login?next=%2F');
  await fillAndSubmit('ana@shop.test', 'correct horse battery');
  expect(await screen.findByText('Ana')).toBeTruthy();
  expect(screen.getByTestId('where').textContent).toBe('/');
});

test('login: wrong credentials keep the email and clear the password', async () => {
  stubApi({
    'GET /api/v1/auth/me': json(401, {}),
    'POST /api/v1/auth/login': json(401, {}),
  });
  renderAt('/login');
  await fillAndSubmit('ana@shop.test', 'nope');
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Wrong email or password.');
  expect(document.activeElement).toBe(alert);
  expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('ana@shop.test');
  expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('');
});

test('login: locked shows the wait rounded up in minutes', async () => {
  stubApi({
    'GET /api/v1/auth/me': json(401, {}),
    'POST /api/v1/auth/login': json(429, {}, { 'Retry-After': '61' }),
  });
  renderAt('/login');
  await fillAndSubmit('ana@shop.test', 'x');
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Too many attempts. Try again in 2 minutes.',
  );
});

test('login: service down shows Retry, which submits again', async () => {
  const fn = stubApi({ 'GET /api/v1/auth/me': json(401, {}) });
  renderAt('/login');
  await fillAndSubmit('ana@shop.test', 'x');
  expect((await screen.findByRole('alert')).textContent).toContain("Can't reach the service.");
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'again' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => {
    expect(fn.mock.calls.filter(([u]) => u === '/api/v1/auth/login').length).toBe(2);
  });
});

test('login: empty and invalid fields are checked before any request', async () => {
  const fn = stubApi({ 'GET /api/v1/auth/me': json(401, {}) });
  renderAt('/login');
  await fillAndSubmit('', '');
  expect((await screen.findByRole('alert')).textContent).toBe('Enter your email.');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await waitFor(() => {
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid email.');
  });
  expect(fn.mock.calls.some(([u]) => u === '/api/v1/auth/login')).toBe(false);
});

test('a signed-in user opening /login is sent to next, an external next is ignored', async () => {
  stubApi({
    'GET /api/v1/auth/me': json(200, user),
    'GET /api/v1/orders': json(200, emptyPage),
  });
  renderAt('/login?next=https%3A%2F%2Fevil.test');
  expect(await screen.findByText('Ana')).toBeTruthy();
  expect(screen.getByTestId('where').textContent).toBe('/');
});

test('a signed-in user opening /login?next=//evil.test lands on /', async () => {
  stubApi({
    'GET /api/v1/auth/me': json(200, user),
    'GET /api/v1/orders': json(200, emptyPage),
  });
  renderAt('/login?next=' + encodeURIComponent('//evil.test'));
  expect(await screen.findByText('Ana')).toBeTruthy();
  expect(screen.getByTestId('where').textContent).toBe('/');
});

test('an expired session on a staff request lands on /login?next=<page>', async () => {
  stubApi({
    'GET /api/v1/auth/me': json(200, user),
    'POST /api/v1/auth/logout': json(401, {}),
  });
  // there is no staff screen with a path yet: a test page makes a staff request
  render(
    <MemoryRouter initialEntries={['/orders?page=2']}>
      <AuthProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route
              path="/orders"
              element={
                <button type="button" onClick={() => void logout().catch(() => undefined)}>
                  Staff request
                </button>
              }
            />
          </Route>
          <Route path="/login" element={<h1>Log in</h1>} />
        </Routes>
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Staff request' }));
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
  expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Forders%3Fpage%3D2');
});

test('Log out calls the API and goes to /login', async () => {
  stubApi({
    'GET /api/v1/auth/me': json(200, user),
    'GET /api/v1/orders': json(200, emptyPage),
    'POST /api/v1/auth/logout': none(204),
  });
  renderAt('/');
  fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
  expect(screen.getByTestId('where').textContent).toBe('/login');
});

test('an unknown route shows Not found inside the shell', async () => {
  stubApi({ 'GET /api/v1/auth/me': json(200, user) });
  renderAt('/nope/at/all');
  expect(await screen.findByRole('heading', { name: 'Not found' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Back to orders' })).toBeTruthy();
  expect(screen.getByText('Log out')).toBeTruthy();
});

test('an unknown route sends a signed-out visitor to login first', async () => {
  stubApi({ 'GET /api/v1/auth/me': json(401, {}) });
  renderAt('/nope');
  expect(await screen.findByLabelText('Email')).toBeTruthy();
  expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Fnope');
});

test('safeNext only accepts paths of this site', () => {
  expect(safeNext('/orders?page=2')).toBe('/orders?page=2');
  expect(safeNext(null)).toBe('/');
  expect(safeNext('')).toBe('/');
  expect(safeNext('//evil.test')).toBe('/');
  expect(safeNext('/\\evil.test')).toBe('/');
  expect(safeNext('https://evil.test')).toBe('/');
  expect(safeNext('orders')).toBe('/');
});
