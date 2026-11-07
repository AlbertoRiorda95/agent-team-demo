// apps/web/e2e/ui.spec.ts: the checks every screen gets. One entry per
// screen and state of the specs in docs/design/. Mock the API with page.route()
// so that every state (loading, empty, error, success) is reachable without a
// backend. The frontend fills in the screens, states and mocks of each spec.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

interface Screen {
  name: string;
  path: string;
  expect: string | RegExp;
  mock?: (page: Page) => Promise<unknown>;
  /** steps after load that bring the screen to the state under test */
  act?: (page: Page) => Promise<unknown>;
}

const staff = { id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', email: 'ana@shop.test', name: 'Ana' };
const problem = { type: 'about:blank', title: 'Problem', status: 400 };

/** Mocks `GET /auth/me`: a staff session, or none (401). */
const session = (page: Page, signedIn: boolean) =>
  page.route('**/api/v1/auth/me', (r) =>
    signedIn
      ? r.fulfill({ status: 200, json: staff })
      : r.fulfill({ status: 401, contentType: 'application/problem+json', json: problem }),
  );

const currencies = ['EUR', 'USD', 'GBP', 'JPY'] as const;
const statuses = ['new', 'paid', 'shipped', 'cancelled'] as const;

/** A page of the mocked list: `count` orders from number `first`, `total` in all. */
const pageOf = (page: number, count: number, total: number) => ({
  page,
  pageSize: 25,
  total,
  items: Array.from({ length: count }, (_, i) => {
    const n = (page - 1) * 25 + i + 1;
    const currency = currencies[n % 4] ?? 'EUR';
    return {
      number: `ORD-${String(n).padStart(6, '0')}`,
      status: statuses[n % 4] ?? 'new',
      customerName: `Customer with a rather long name ${String(n)}`,
      total: { amount: currency === 'JPY' ? '12500' : '1234.50', currency },
      createdAt: '2026-11-01T10:30:00Z',
    };
  }),
});

/** Mocks `GET /orders` with 137 orders, 25 per page; a page beyond the last is empty. */
const ordersApi = (page: Page) =>
  page.route('**/api/v1/orders*', (r) => {
    const p = Number(new URL(r.request().url()).searchParams.get('page') ?? '1');
    const count = Math.max(0, Math.min(25, 137 - (p - 1) * 25));
    return r.fulfill({ json: pageOf(p, count, 137) });
  });

/** Mocks `POST /auth/login` with one answer. */
const loginAnswer = async (page: Page, status: number, headers: Record<string, string> = {}) => {
  await session(page, false);
  await page.route('**/api/v1/auth/login', (r) =>
    r.fulfill({
      status,
      headers,
      contentType: 'application/problem+json',
      json: { ...problem, status },
    }),
  );
};

const submitLogin = async (page: Page) => {
  await page.getByLabel('Email').fill('ana@shop.test');
  await page.getByLabel('Password').fill('a wrong password');
  await page.getByRole('button', { name: 'Log in' }).click();
};

const eur = (a: string) => ({ amount: a, currency: 'EUR' });
const detail = (over: Record<string, unknown> = {}) => ({
  number: 'ORD-000123',
  externalReference: 'EXT-1',
  status: 'new',
  version: 1,
  currency: 'EUR',
  customer: { name: 'Ana Ruiz', email: 'ana.ruiz@shop.test' },
  shippingAddress: {
    name: 'Ana Ruiz',
    line1: '1 Main Street',
    line2: 'Floor 3',
    city: 'Madrid',
    postalCode: '28001',
    country: 'ES',
  },
  items: [
    { sku: 'MUG-001', name: 'Mug', quantity: 2, unitPrice: eur('5.00'), lineTotal: eur('10.00') },
    {
      sku: 'PLATE-002',
      name: 'A plate with a rather long product name',
      quantity: 1,
      unitPrice: eur('7.50'),
      lineTotal: eur('7.50'),
    },
  ],
  shippingCost: eur('2.50'),
  total: eur('20.00'),
  history: [],
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  ...over,
});
const change = (from: string, to: string, reason?: string) => ({
  from,
  to,
  ...(reason ? { reason } : {}),
  changedBy: { id: staff.id, name: 'Ana' },
  at: '2026-11-07T10:42:00Z',
});
const paidOrder = detail({ status: 'paid', version: 2, history: [change('new', 'paid')] });

/** Mocks the order `ORD-000123` as `GET`; `post` answers `POST .../status` (default: 200 paid). */
const orderApi = async (
  page: Page,
  get: () => { status?: number; json: unknown },
  post?: (body: Record<string, unknown>) => { status?: number; json: unknown },
) => {
  await session(page, true);
  await page.route('**/api/v1/orders/ORD-**', (r) => {
    const isPost = r.request().method() === 'POST';
    const answer = isPost
      ? (post?.(r.request().postDataJSON() as Record<string, unknown>) ?? { json: paidOrder })
      : get();
    return r.fulfill({
      status: answer.status ?? 200,
      contentType: (answer.status ?? 200) >= 400 ? 'application/problem+json' : 'application/json',
      json: answer.json,
    });
  });
};
const problemOf = (status: number, extra: object = {}) => ({
  json: { ...problem, status, ...extra },
});

function detailScreens(): Screen[] {
  const base = (name: string, status: string, history: unknown[], expect: string): Screen => ({
    name,
    path: '/orders/ORD-000123',
    expect,
    mock: (page) => orderApi(page, () => ({ json: detail({ status, history }) })),
  });
  return [
    base('detail-new', 'new', [], 'No status changes yet'),
    base('detail-paid', 'paid', [change('new', 'paid')], 'Mark shipped'),
    base(
      'detail-shipped',
      'shipped',
      [change('new', 'paid'), change('paid', 'shipped')],
      'This order is final',
    ),
    base(
      'detail-cancelled',
      'cancelled',
      [change('new', 'cancelled', 'Customer asked to cancel')],
      'Customer asked to cancel',
    ),
    {
      name: 'detail-loading',
      path: '/orders/ORD-000123',
      expect: 'Loading order…',
      mock: async (page) => {
        await session(page, true);
        await page.route('**/api/v1/orders/ORD-**', () => new Promise(() => undefined));
      },
    },
    {
      name: 'detail-load-error',
      path: '/orders/ORD-000123',
      expect: "Can't load the order.",
      mock: (page) => orderApi(page, () => ({ status: 503, ...problemOf(503) })),
    },
    {
      name: 'detail-not-found',
      path: '/orders/ORD-999999',
      expect: "We can't find that page.",
      mock: (page) => orderApi(page, () => ({ status: 404, ...problemOf(404) })),
    },
    {
      name: 'detail-malformed-number',
      path: '/orders/nope',
      expect: "We can't find that page.",
      mock: (page) => session(page, true),
    },
    {
      name: 'detail-unknown-route',
      path: '/nowhere',
      expect: "We can't find that page.",
      mock: (page) => session(page, true),
    },
    {
      name: 'detail-conflict',
      path: '/orders/ORD-000123',
      expect: 'This order changed: reload.',
      mock: (page) =>
        orderApi(
          page,
          () => ({ json: detail() }),
          () => ({ status: 409, ...problemOf(409, { currentStatus: 'paid', currentVersion: 2 }) }),
        ),
      act: (page) => page.getByRole('button', { name: 'Mark paid' }).click(),
    },
    {
      name: 'detail-change-failed',
      path: '/orders/ORD-000123',
      expect: "Couldn't change the status.",
      mock: (page) =>
        orderApi(
          page,
          () => ({ json: detail() }),
          () => ({ status: 503, ...problemOf(503) }),
        ),
      act: (page) => page.getByRole('button', { name: 'Mark paid' }).click(),
    },
    {
      name: 'detail-toast',
      path: '/orders/ORD-000123',
      expect: 'Order ORD-000123 marked as paid',
      mock: (page) => orderApi(page, () => ({ json: detail() })),
      act: (page) => page.getByRole('button', { name: 'Mark paid' }).click(),
    },
    {
      name: 'detail-cancel-dialog',
      path: '/orders/ORD-000123',
      expect: 'Cancel order ORD-000123?',
      mock: (page) => orderApi(page, () => ({ json: detail() })),
      act: (page) => page.getByRole('button', { name: 'Cancel', exact: true }).click(),
    },
    {
      name: 'detail-cancel-dialog-422',
      path: '/orders/ORD-000123',
      expect: 'The reason is not valid',
      mock: (page) =>
        orderApi(
          page,
          () => ({ json: detail() }),
          () => ({ status: 422, ...problemOf(422) }),
        ),
      act: async (page) => {
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByRole('button', { name: 'Cancel order' }).click();
      },
    },
  ];
}

const screens: Screen[] = [
  {
    name: 'list-page-1',
    path: '/',
    expect: '1–25 of 137 orders',
    mock: async (page) => {
      await session(page, true);
      await ordersApi(page);
    },
  },
  {
    name: 'list-last-page',
    path: '/?page=6',
    expect: '126–137 of 137 orders',
    mock: async (page) => {
      await session(page, true);
      await ordersApi(page);
    },
  },
  {
    name: 'list-single-page',
    path: '/?status=cancelled',
    expect: '1–3 of 3 orders',
    mock: async (page) => {
      await session(page, true);
      await page.route('**/api/v1/orders*', (r) => r.fulfill({ json: pageOf(1, 3, 3) }));
    },
  },
  {
    name: 'list-out-of-range',
    path: '/?page=99',
    expect: '126–137 of 137 orders',
    mock: async (page) => {
      await session(page, true);
      await ordersApi(page);
    },
  },
  {
    name: 'list-empty',
    path: '/',
    expect: 'No orders yet',
    mock: async (page) => {
      await session(page, true);
      await page.route('**/api/v1/orders*', (r) => r.fulfill({ json: pageOf(1, 0, 0) }));
    },
  },
  {
    name: 'list-no-match',
    path: '/?q=zzz',
    expect: 'No orders match',
    mock: async (page) => {
      await session(page, true);
      await page.route('**/api/v1/orders*', (r) => r.fulfill({ json: pageOf(1, 0, 0) }));
    },
  },
  {
    name: 'list-error',
    path: '/',
    expect: "Can't load the orders.",
    mock: async (page) => {
      await session(page, true);
      await page.route('**/api/v1/orders*', (r) =>
        r.fulfill({ status: 503, contentType: 'application/problem+json', json: problem }),
      );
    },
  },
  // never answers: the loading state stays visible
  {
    name: 'list-loading',
    path: '/',
    expect: 'Loading orders…',
    mock: async (page) => {
      await session(page, true);
      await page.route('**/api/v1/orders*', () => new Promise(() => undefined));
    },
  },
  // the session check never answers: the shell is checking
  {
    name: 'shell-checking',
    path: '/',
    expect: 'Checking your session…',
    mock: (page) => page.route('**/api/v1/auth/me', () => new Promise(() => undefined)),
  },
  {
    name: 'shell-error',
    path: '/',
    expect: "Can't reach the service.",
    mock: (page) =>
      page.route('**/api/v1/auth/me', (r) =>
        r.fulfill({ status: 503, contentType: 'application/problem+json', json: problem }),
      ),
  },
  {
    name: 'login-idle',
    path: '/login',
    expect: 'Log in',
    mock: (page) => session(page, false),
  },
  {
    name: 'login-wrong-credentials',
    path: '/login',
    expect: 'Wrong email or password.',
    mock: (page) => loginAnswer(page, 401),
    act: submitLogin,
  },
  {
    name: 'login-invalid-email',
    path: '/login',
    expect: 'Enter your email.',
    mock: (page) => session(page, false),
    act: (page) => page.getByRole('button', { name: 'Log in' }).click(),
  },
  {
    name: 'login-invalid-422',
    path: '/login',
    expect: 'Enter a valid email and password.',
    mock: (page) => loginAnswer(page, 422),
    act: submitLogin,
  },
  {
    name: 'login-locked',
    path: '/login',
    expect: 'Too many attempts. Try again in 15 minutes.',
    mock: (page) => loginAnswer(page, 429, { 'Retry-After': '900' }),
    act: submitLogin,
  },
  {
    name: 'login-down',
    path: '/login',
    expect: "Can't reach the service.",
    mock: (page) => loginAnswer(page, 503),
    act: submitLogin,
  },
  ...detailScreens(),
  // the login request never answers: the button is busy
  {
    name: 'login-submitting',
    path: '/login',
    expect: 'Log in',
    mock: async (page) => {
      await session(page, false);
      await page.route('**/api/v1/auth/login', () => new Promise(() => undefined));
    },
    act: async (page) => {
      await submitLogin(page);
      await expect(page.getByRole('button', { name: 'Log in' })).toBeDisabled();
    },
  },
];

for (const s of screens) {
  test(`${s.name}: layout, accessibility, screenshot`, async ({ page }, info) => {
    if (s.mock) await s.mock(page);
    await page.goto(s.path);
    if (s.act) {
      const ready = s.path.startsWith('/login') ? 'Log in' : /Mark paid|Cancel/;
      await expect(page.getByRole('button', { name: ready }).first()).toBeVisible();
      await s.act(page);
    }
    await expect(page.getByText(s.expect).first()).toBeVisible();

    // one full-page screenshot per screen and viewport, for the designer's review
    await page.screenshot({ path: info.outputPath(`${s.name}.png`), fullPage: true });

    // soft checks: every problem is reported in one run, not only the first
    // no horizontal scroll at any viewport
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect.soft(overflow, 'horizontal scroll in px').toBeLessThanOrEqual(0);

    // no automatic WCAG A/AA violations
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect
      .soft(
        axe.violations.map((v) => `${v.id}: ${v.help}`),
        'accessibility (axe)',
      )
      .toEqual([]);

    // touch targets of at least 44 px on the touch viewport
    if (info.project.use.hasTouch) {
      const small = await page.$$eval(
        'button, [role=button], select, input:not([type=hidden])',
        (els) =>
          els
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && (r.width < 44 || r.height < 44);
            })
            .map((e) => e.outerHTML.slice(0, 80)),
      );
      expect.soft(small, 'touch targets under 44 px').toEqual([]);
    }

    // keyboard focus is visible on the first focusable element
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return 'nothing focusable';
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' ? 'visible' : 'invisible';
    });
    expect.soft(focus, 'keyboard focus').not.toBe('invisible');
  });
}

test('flow: log in, log out, and Back does not show the shell again', async ({ page }) => {
  let signedIn = false;
  await page.route('**/api/v1/auth/me', (r) =>
    signedIn
      ? r.fulfill({ status: 200, json: staff })
      : r.fulfill({ status: 401, contentType: 'application/problem+json', json: problem }),
  );
  await page.route('**/api/v1/auth/login', (r) => {
    signedIn = true;
    return r.fulfill({ status: 200, json: staff });
  });
  await page.route('**/api/v1/auth/logout', (r) => {
    signedIn = false;
    return r.fulfill({ status: 204 });
  });
  await ordersApi(page);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await submitLogin(page);
  await expect(page.getByText('Ana')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
});

test('flow: an expired session returns to login, then to the page, external next ignored', async ({
  page,
}) => {
  await session(page, false);
  await page.route('**/api/v1/auth/login', (r) => r.fulfill({ status: 200, json: staff }));
  await ordersApi(page);

  // an unknown path under the shell is not a route; use /login?next= directly
  await page.goto('/login?next=%2F%3Ffrom%3Dexpired');
  await submitLogin(page);
  await expect(page).toHaveURL(/\/\?from=expired$/);

  await page.goto('/login?next=https%3A%2F%2Fevil.test%2F');
  await submitLogin(page);
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test('flow: a signed-in user opening /login?next=//evil.test lands on /', async ({ page }) => {
  await session(page, true);
  await ordersApi(page);
  await page.goto('/login?next=' + encodeURIComponent('//evil.test'));
  await expect(page.getByText('Ana')).toBeVisible();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test('flow: a 401 on a staff request while signed in returns to login', async ({ page }) => {
  await session(page, true);
  await ordersApi(page);
  await page.route('**/api/v1/auth/logout', (r) => r.fulfill({ status: 401, json: {} }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('flow: status, search and page live in the URL; Back restores; invalid values ignored', async ({
  page,
}) => {
  await session(page, true);
  await ordersApi(page);

  await page.goto('/?status=bogus&page=-2');
  await expect(page.getByText('1–25 of 137 orders')).toBeVisible();

  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect(page.getByText('26–50 of 137 orders')).toBeVisible();

  await page.getByLabel('Status').selectOption('paid');
  await expect(page).toHaveURL(/\?status=paid$/);

  await page.getByLabel('Search orders').fill('ana');
  await expect(page).toHaveURL(/\?status=paid&q=ana$/);

  await page.goBack();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect(page.getByLabel('Status')).toHaveValue('');
  await expect(page.getByLabel('Search orders')).toHaveValue('');
});

test('flow: a page beyond the last replaces the URL; Back does not return to it', async ({
  page,
}) => {
  await session(page, true);
  await ordersApi(page);
  await page.goto('/?page=2');
  await page.goto('/?page=99');
  await expect(page).toHaveURL(/\?page=6$/);
  await page.goBack();
  await expect(page).toHaveURL(/\?page=2$/);
});

test('flow: Retry after a failure loads the list', async ({ page }) => {
  await session(page, true);
  let fail = true;
  await page.route('**/api/v1/orders*', (r) =>
    fail
      ? r.fulfill({ status: 503, contentType: 'application/problem+json', json: problem })
      : r.fulfill({ json: pageOf(1, 25, 137) }),
  );
  await page.goto('/');
  await expect(page.getByText("Can't load the orders.")).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('1–25 of 137 orders')).toBeVisible();
});

test('flow: Back to orders keeps the list query; opened by URL it goes to /', async ({ page }) => {
  await session(page, true);
  await ordersApi(page);
  await page.route('**/api/v1/orders/ORD-**', (r) => r.fulfill({ json: detail() }));

  await page.goto('/?status=paid&q=ana&page=2');
  await page.getByRole('link', { name: 'ORD-000026' }).click();
  await expect(page).toHaveURL(/\/orders\/ORD-000026$/);
  await page.getByRole('link', { name: 'Back to orders' }).click();
  await expect(page).toHaveURL(/\/\?status=paid&q=ana&page=2$/);

  await page.goto('/orders/ORD-000123');
  await page.getByRole('link', { name: 'Back to orders' }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test('flow: the cancel dialog closes with Escape and returns focus to its button', async ({
  page,
}) => {
  await orderApi(page, () => ({ json: detail() }));
  await page.goto('/orders/ORD-000123');
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Cancel order ORD-000123?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(cancel).toBeFocused();
});

test('flow: cancelling sends the reason and shows the cancelled order', async ({ page }) => {
  let body: Record<string, unknown> = {};
  await orderApi(
    page,
    () => ({ json: detail() }),
    (b) => {
      body = b;
      return {
        json: detail({
          status: 'cancelled',
          version: 2,
          history: [change('new', 'cancelled', 'Out of stock')],
        }),
      };
    },
  );
  await page.goto('/orders/ORD-000123');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByLabel('Reason (optional)').fill('Out of stock');
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByText('This order is final')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Order ORD-000123 marked as cancelled');
  expect(body).toEqual({ to: 'cancelled', version: 1, reason: 'Out of stock' });
});
