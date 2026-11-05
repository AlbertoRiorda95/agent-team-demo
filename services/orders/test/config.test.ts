import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadHttpConfig } from '../src/config.js';

const url = 'postgres://orders:secret@localhost:5432/orders';

describe('loadConfig', () => {
  it('reads DATABASE_URL and defaults PORT to 3000', () => {
    expect(loadConfig({ DATABASE_URL: url })).toEqual({ port: 3000, databaseUrl: url });
  });

  it('reads PORT', () => {
    expect(loadConfig({ DATABASE_URL: url, PORT: '8080' }).port).toBe(8080);
  });

  it.each(['abc', '0', '70000', '3000.5', '-1'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ DATABASE_URL: url, PORT: port })).toThrow(ConfigError);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL is required');
  });

  it('rejects a non-postgres DATABASE_URL without echoing its value', () => {
    const error = captureError(() => loadConfig({ DATABASE_URL: 'mysql://u:hunter2@h/db' }));
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).not.toContain('hunter2');
  });

  it('rejects a DATABASE_URL that is not a URL', () => {
    expect(() => loadConfig({ DATABASE_URL: 'not a url' })).toThrow(ConfigError);
  });
});

describe('loadHttpConfig', () => {
  const secret = 's'.repeat(32);

  const apiKey = 'k'.repeat(32);

  it('defaults PUBLIC_ORIGIN outside production and leaves the secrets unset', () => {
    expect(loadHttpConfig({})).toEqual({
      production: false,
      publicOrigin: 'http://localhost:5173',
      sessionSecret: undefined,
      orderApiKey: undefined,
    });
  });

  it('reads PUBLIC_ORIGIN, SESSION_SECRET and ORDER_API_KEY; a trailing slash is dropped', () => {
    const config = loadHttpConfig({
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://orders.example.com/',
      SESSION_SECRET: secret,
      ORDER_API_KEY: apiKey,
    });
    expect(config).toEqual({
      production: true,
      publicOrigin: 'https://orders.example.com',
      sessionSecret: secret,
      orderApiKey: apiKey,
    });
  });

  it('requires PUBLIC_ORIGIN, SESSION_SECRET and ORDER_API_KEY in production', () => {
    const origin = 'https://o.example.com';
    expect(() =>
      loadHttpConfig({ NODE_ENV: 'production', SESSION_SECRET: secret, ORDER_API_KEY: apiKey }),
    ).toThrow('PUBLIC_ORIGIN is required in production');
    expect(() =>
      loadHttpConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: origin, ORDER_API_KEY: apiKey }),
    ).toThrow('SESSION_SECRET is required in production');
    expect(() =>
      loadHttpConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: origin, SESSION_SECRET: secret }),
    ).toThrow('ORDER_API_KEY is required in production');
  });

  it('rejects a short ORDER_API_KEY without echoing it', () => {
    const error = captureError(() => loadHttpConfig({ ORDER_API_KEY: 'short-key-123' }));
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).toContain('ORDER_API_KEY must have at least 32 characters');
    expect(String(error)).not.toContain('short-key-123');
  });

  it.each([
    'not a url',
    'ftp://o.example.com',
    'https://o.example.com/app',
    'https://u:p@o.example.com',
  ])('rejects PUBLIC_ORIGIN=%s', (origin) => {
    expect(() => loadHttpConfig({ PUBLIC_ORIGIN: origin })).toThrow(ConfigError);
  });

  it('rejects a short SESSION_SECRET without echoing it', () => {
    const error = captureError(() => loadHttpConfig({ SESSION_SECRET: 'hunter2' }));
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).toContain('at least 32 characters');
    expect(String(error)).not.toContain('hunter2');
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
