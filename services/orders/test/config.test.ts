import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

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

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
