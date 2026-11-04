// Smoke test: the app builds from the contract and answers through app.inject.
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/adapters/http/app.js';
import { fakeAuth, WEB } from './fake-auth.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function appWithDatabase(reachable: boolean, production = false): FastifyInstance {
  app = buildApp({
    databaseHealth: { isReachable: () => Promise.resolve(reachable) },
    auth: fakeAuth(),
    web: { ...WEB, production },
  });
  return app;
}

describe('orders app', () => {
  it('GET /health answers 200 ok when the database is reachable', async () => {
    const res = await appWithDatabase(true).inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health answers 503 unavailable when the database is not reachable', async () => {
    const res = await appWithDatabase(false).inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable' });
  });

  it('answers 404 problem+json for a route outside the contract', async () => {
    const res = await appWithDatabase(true).inject({ method: 'GET', url: '/nope?x=1' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toMatchObject({
      title: 'Not Found',
      status: 404,
      detail: 'No route for GET /nope',
    });
  });
});

describe('security headers', () => {
  it.each([
    ['a success', '/health'],
    ['a 404', '/nope'],
    ['a 401', '/api/v1/auth/me'],
  ])('are on %s', async (_case, url) => {
    const res = await appWithDatabase(true).inject({ method: 'GET', url });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('include HSTS in production', async () => {
    const res = await appWithDatabase(true, true).inject({ method: 'GET', url: '/health' });
    expect(res.headers['strict-transport-security']).toMatch(/^max-age=\d+; includeSubDomains$/);
  });
});
