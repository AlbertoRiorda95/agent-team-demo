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

const healthOk = (page: Page) =>
  page.route('**/health', (r) => r.fulfill({ status: 200, json: { status: 'ok' } }));

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

const screens: Screen[] = [
  {
    name: 'home-ok',
    path: '/',
    expect: 'Orders — API ok',
    mock: async (page) => {
      await session(page, true);
      await healthOk(page);
    },
  },
  {
    name: 'home-error',
    path: '/',
    expect: 'The API is unreachable.',
    mock: async (page) => {
      await session(page, true);
      await page.route('**/health', (r) =>
        r.fulfill({ status: 503, json: { status: 'unavailable' } }),
      );
    },
  },
  // never answers: the loading state stays visible
  {
    name: 'home-loading',
    path: '/',
    expect: 'Loading…',
    mock: async (page) => {
      await session(page, true);
      await page.route('**/health', () => new Promise(() => undefined));
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
      await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
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
  await healthOk(page);

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
  await healthOk(page);

  // an unknown path under the shell is not a route; use /login?next= directly
  await page.goto('/login?next=%2F%3Ffrom%3Dexpired');
  await submitLogin(page);
  await expect(page).toHaveURL(/\/\?from=expired$/);

  await page.goto('/login?next=https%3A%2F%2Fevil.test%2F');
  await submitLogin(page);
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});
