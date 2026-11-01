// Contract test: the routes the app registers are exactly the operations of
// openapi.yaml (drift either way fails), every /api/v1 operation answers 501
// problem+json, and input is validated with the contract's schemas (422).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { parse } from 'yaml';
import { buildApp } from '../src/adapters/http/app.js';

const CONTRACT = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];

interface Server {
  url: string;
}
interface Contract {
  servers?: Server[];
  paths: Record<string, Record<string, unknown> & { servers?: Server[] }>;
}

/** `METHOD /path` of every contract operation, read independently of the app's code. */
function contractOperations(): string[] {
  const doc = parse(readFileSync(CONTRACT, 'utf8')) as Contract;
  const prefixOf = (servers: Server[] | undefined) => servers?.[0]?.url.replace(/\/+$/, '');
  const root = prefixOf(doc.servers) ?? '';
  const ops: string[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method] as { servers?: Server[] } | undefined;
      if (!op) continue;
      const prefix = prefixOf(op.servers) ?? prefixOf(item.servers) ?? root;
      ops.push(`${method.toUpperCase()} ${prefix}${path}`);
    }
  }
  return ops.sort();
}

// A valid request for each /api/v1 operation, so the answer is the handler's (501).
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

let app: FastifyInstance;
const registered: string[] = [];

beforeAll(async () => {
  app = buildApp({ databaseHealth: { isReachable: () => Promise.resolve(true) } });
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const m of methods) {
      registered.push(`${m} ${route.url.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`);
    }
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('contract', () => {
  it('registers exactly the operations of openapi.yaml', () => {
    expect([...registered].sort()).toEqual(contractOperations());
  });

  it('has a valid request fixture for every /api/v1 operation', () => {
    const apiOps = contractOperations().filter((op) => op.includes(' /api/v1/'));
    expect(Object.keys(validRequests).sort()).toEqual(apiOps);
  });

  it.each(Object.entries(validRequests))('%s answers 501 problem+json', async (key, req) => {
    const method = key.split(' ')[0] as 'GET' | 'POST';
    const res = await app.inject({
      method,
      url: req.url,
      ...(req.payload ? { payload: req.payload } : {}),
    });
    expect(res.statusCode).toBe(501);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toEqual({ type: 'about:blank', title: 'Not implemented yet', status: 501 });
  });
});

describe('input validation from the contract', () => {
  async function post(url: string, payload: unknown) {
    const res = await app.inject({ method: 'POST', url, payload: payload as object });
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
    const res = await app.inject({ method: 'GET', url: '/api/v1/orders/123' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ errors: [{ field: 'number' }] });
  });

  it('validates query parameters', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/orders?pageSize=500' });
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
});
