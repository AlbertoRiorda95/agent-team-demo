// Contract test: the routes the app registers are exactly the operations of
// openapi.yaml (drift either way fails), the session guard follows each
// operation's `security` (401 without a session, 403 for a state-changing
// request that is not same-origin JSON), operations without a handler answer
// 501 problem+json, and input is validated with the contract's schemas (422).
// The use cases are stubbed (fake-auth.ts): auth.test.ts runs the real ones.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { parse } from 'yaml';
import { buildApp } from '../src/adapters/http/app.js';
import { fakeAuth, OTHER_TOKEN, VALID_TOKEN, WEB, type FakeAuth } from './fake-auth.js';

const CONTRACT = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];
const SAFE = ['GET', 'HEAD', 'OPTIONS'];

interface Server {
  url: string;
}
type Security = Record<string, unknown>[];
interface ContractOperation {
  servers?: Server[];
  security?: Security;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}
interface Contract {
  servers?: Server[];
  security?: Security;
  paths: Record<string, Record<string, unknown> & { servers?: Server[] }>;
}

interface OperationInfo {
  key: string;
  /** Every alternative of the effective `security` requires the session cookie. */
  staff: boolean;
  stateChanging: boolean;
  responses: string[];
}

/** Every contract operation, read independently of the app's code. */
function contractOperations(): OperationInfo[] {
  const doc = parse(readFileSync(CONTRACT, 'utf8')) as Contract;
  const prefixOf = (servers: Server[] | undefined) => servers?.[0]?.url.replace(/\/+$/, '');
  const root = prefixOf(doc.servers) ?? '';
  const ops: OperationInfo[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method] as ContractOperation | undefined;
      if (!op) continue;
      const prefix = prefixOf(op.servers) ?? prefixOf(item.servers) ?? root;
      const security = op.security ?? doc.security ?? [];
      const upper = method.toUpperCase();
      ops.push({
        key: `${upper} ${prefix}${path}`,
        staff: security.length > 0 && security.every((alt) => 'session' in alt),
        stateChanging: !SAFE.includes(upper),
        responses: Object.keys(op.responses ?? {}),
      });
    }
  }
  return ops.sort((a, b) => a.key.localeCompare(b.key));
}

const operations = contractOperations();
const staffOperations = operations.filter((op) => op.staff);
const stateChangingStaff = staffOperations.filter((op) => op.stateChanging);

// A valid request for each /api/v1 operation, so the answer is the handler's.
const validRequests: Record<string, { url: string; payload?: object }> = {
  'POST /api/v1/auth/login': {
    url: '/api/v1/auth/login',
    payload: { email: 'staff@example.com', password: 'x' },
  },
  'POST /api/v1/auth/logout': { url: '/api/v1/auth/logout' },
  'GET /api/v1/auth/me': { url: '/api/v1/auth/me' },
  'GET /api/v1/orders': { url: '/api/v1/orders?status=paid&page=2&pageSize=10' },
  'POST /api/v1/orders': {
    url: '/api/v1/orders',
    payload: {
      externalReference: 'shop-1',
      currency: 'EUR',
      customer: { name: 'Ada', email: 'ada@example.com' },
      shippingAddress: {
        name: 'Ada',
        line1: '1 Main St',
        city: 'Turin',
        postalCode: '10100',
        country: 'IT',
      },
      items: [{ sku: 'SKU-1', name: 'Mug', quantity: 2, unitPrice: '12.50' }],
      shippingCost: '4.90',
    },
  },
  'GET /api/v1/orders/{number}': { url: '/api/v1/orders/ORD-000123' },
  'POST /api/v1/orders/{number}/status': {
    url: '/api/v1/orders/ORD-000123/status',
    payload: { to: 'paid', version: 1 },
  },
};

/** Operations with their handler; every other /api/v1 operation still answers 501. */
const IMPLEMENTED = ['POST /api/v1/auth/login', 'POST /api/v1/auth/logout', 'GET /api/v1/auth/me'];

const sessionHeaders = { cookie: `session=${VALID_TOKEN}`, origin: WEB.publicOrigin };

function requestFor(key: string, headers: Record<string, string> = {}): InjectOptions {
  const req = validRequests[key];
  if (!req) throw new Error(`No fixture for ${key}`);
  return {
    method: key.split(' ')[0] as 'GET' | 'POST',
    url: req.url,
    headers,
    ...(req.payload ? { payload: req.payload } : {}),
  };
}

let app: FastifyInstance;
let auth: FakeAuth;
const registered: string[] = [];

beforeAll(async () => {
  auth = fakeAuth();
  app = buildApp({
    databaseHealth: { isReachable: () => Promise.resolve(true) },
    auth,
    web: WEB,
  });
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const m of methods) {
      registered.push(`${m} ${route.url.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`);
    }
  });
  await app.ready();
});

beforeEach(() => {
  auth.calls.length = 0;
});

afterAll(async () => {
  await app.close();
});

describe('contract', () => {
  it('registers exactly the operations of openapi.yaml', () => {
    expect([...registered].sort()).toEqual(operations.map((op) => op.key));
  });

  it('has a valid request fixture for every /api/v1 operation', () => {
    const apiOps = operations.filter((op) => op.key.includes(' /api/v1/')).map((op) => op.key);
    expect(Object.keys(validRequests).sort()).toEqual(apiOps);
  });

  it('marks the staff operations: all but login, POST /orders and /health', () => {
    expect(operations.filter((op) => !op.staff).map((op) => op.key)).toEqual([
      'GET /health',
      'POST /api/v1/auth/login',
      'POST /api/v1/orders',
    ]);
  });

  it.each(staffOperations.map((op) => [op.key, op] as const))(
    '%s declares 401, and 403 when it changes state',
    (_key, op) => {
      expect(op.responses).toContain('401');
      if (op.stateChanging) expect(op.responses).toContain('403');
      else expect(op.responses).not.toContain('403');
    },
  );

  const notImplemented = Object.keys(validRequests).filter((key) => !IMPLEMENTED.includes(key));
  it.each(notImplemented)('%s answers 501 problem+json (with a session)', async (key) => {
    const res = await app.inject(requestFor(key, sessionHeaders));
    expect(res.statusCode).toBe(501);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toEqual({ type: 'about:blank', title: 'Not implemented yet', status: 501 });
  });
});

describe('session guard from the contract security', () => {
  it.each(staffOperations.map((op) => op.key))(
    '%s answers 401 problem+json without a session',
    async (key) => {
      const res = await app.inject(requestFor(key, { origin: WEB.publicOrigin }));
      expect(res.statusCode).toBe(401);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.json()).toEqual({ type: 'about:blank', title: 'Unauthorized', status: 401 });
    },
  );

  it.each(staffOperations.map((op) => op.key))(
    '%s answers 401 for an unknown session and clears the cookie',
    async (key) => {
      const res = await app.inject(
        requestFor(key, { cookie: `session=${OTHER_TOKEN}`, origin: WEB.publicOrigin }),
      );
      expect(res.statusCode).toBe(401);
      expect(String(res.headers['set-cookie'])).toMatch(/^session=; .*Max-Age=0/);
    },
  );

  it('answers 401 before validating the input', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/orders?pageSize=500' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed cookie without looking it up', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: "session=' or 1=1 --" },
    });
    expect(res.statusCode).toBe(401);
    expect(auth.calls).toEqual([]);
  });

  it('leaves POST /orders (API key, order-intake) to its own handler', async () => {
    const res = await app.inject(requestFor('POST /api/v1/orders'));
    expect(res.statusCode).toBe(501);
  });
});

describe('CSRF check of the state-changing staff operations', () => {
  const cases: [string, Record<string, string | undefined>][] = [
    ['no Origin', { origin: undefined }],
    ['another Origin', { origin: 'https://evil.example.com' }],
    ['the Origin with a path-like suffix', { origin: `${WEB.publicOrigin}.evil.example.com` }],
    ['a form content type', { 'content-type': 'application/x-www-form-urlencoded' }],
    ['a text/plain content type', { 'content-type': 'text/plain' }],
  ];

  for (const op of stateChangingStaff) {
    it.each(cases)(`${op.key} with %s answers 403 and reaches no use case`, async (_c, extra) => {
      const base = requestFor(op.key, sessionHeaders);
      const headers = { ...(base.headers as Record<string, string>) };
      for (const [name, value] of Object.entries(extra)) {
        if (value === undefined) Reflect.deleteProperty(headers, name);
        else headers[name] = value;
      }
      const res = await app.inject({
        ...base,
        headers,
        // a non-JSON content type needs a string body
        ...(extra['content-type'] ? { payload: 'to=paid&version=1' } : {}),
      });
      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.json()).toMatchObject({ type: 'about:blank', title: 'Forbidden', status: 403 });
      expect(auth.calls).toEqual([]);
    });
  }

  it('a body operation without a content type answers 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/ORD-000123/status',
      headers: sessionHeaders,
    });
    expect(res.statusCode).toBe(403);
  });

  it('logout without a body may still say it is JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...sessionHeaders, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('safe staff operations need no Origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `session=${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('input validation from the contract', () => {
  async function post(url: string, payload: unknown) {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: sessionHeaders,
      payload: payload as object,
    });
    return { status: res.statusCode, type: res.headers['content-type'], body: res.json<unknown>() };
  }

  it('POST /api/v1/auth/login with {} answers 422 with the missing fields', async () => {
    const res = await post('/api/v1/auth/login', {});
    expect(res.status).toBe(422);
    expect(res.type).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Validation failed',
      status: 422,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'password' }),
      ]) as unknown,
    });
  });

  it('rejects unknown properties instead of dropping them', async () => {
    const res = await post('/api/v1/auth/login', {
      email: 'a@example.com',
      password: 'x',
      admin: true,
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ errors: [{ field: 'admin', message: 'is not allowed' }] });
  });

  it('does not coerce body types', async () => {
    const res = await post('/api/v1/orders/ORD-000123/status', { to: 'paid', version: '1' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ errors: [{ field: 'version' }] });
  });

  it('names nested fields with their JSON path', async () => {
    const payload = structuredClone(validRequests['POST /api/v1/orders']?.payload) as {
      items: { quantity: number }[];
    };
    payload.items[0] = { ...payload.items[0], quantity: 0 };
    const res = await post('/api/v1/orders', payload);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ errors: [{ field: 'items[0].quantity' }] });
  });

  it('checks formats (email)', async () => {
    const res = await post('/api/v1/auth/login', { email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ errors: [{ field: 'email' }] });
  });

  it('validates path parameters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/123',
      headers: sessionHeaders,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ errors: [{ field: 'number' }] });
  });

  it('validates query parameters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders?pageSize=500',
      headers: sessionHeaders,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ errors: [{ field: 'pageSize' }] });
  });

  it('answers 422 to a malformed JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });
    expect(res.statusCode).toBe(422);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('answers 422 to an empty JSON body where the contract requires one', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('refuses prototype poisoning in a JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":"a@example.com","password":"x","__proto__":{"admin":true}}',
    });
    expect(res.statusCode).toBe(422);
  });
});
