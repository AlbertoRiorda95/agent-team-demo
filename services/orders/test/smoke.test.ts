// Smoke test: the app builds from the contract and answers through app.inject.
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/adapters/http/app.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function appWithDatabase(reachable: boolean): FastifyInstance {
  app = buildApp({ databaseHealth: { isReachable: () => Promise.resolve(reachable) } });
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
