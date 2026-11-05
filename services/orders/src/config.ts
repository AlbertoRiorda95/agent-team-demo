/** Configuration of the orders service, read from the environment. */
export interface Config {
  /** HTTP port the service listens on (PORT, default 3000). */
  readonly port: number;
  /** Postgres connection string (DATABASE_URL, required). */
  readonly databaseUrl: string;
}

/** Thrown when the environment does not describe a valid configuration. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

const DEFAULT_PORT = 3000;

/**
 * Reads and validates the configuration from an environment map.
 * Error messages name the variable, never its value (it may be a secret).
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  return {
    port: parsePort(env['PORT']),
    databaseUrl: parseDatabaseUrl(env['DATABASE_URL']),
  };
}

/** Configuration of the HTTP API only (the operator commands do not need it). */
export interface HttpConfig {
  /** NODE_ENV=production: Secure cookie, HSTS, PUBLIC_ORIGIN and SESSION_SECRET required. */
  readonly production: boolean;
  /**
   * Origin of the web app (PUBLIC_ORIGIN, scheme://host[:port]); state-changing
   * staff requests must carry it in their Origin header. Default
   * http://localhost:5173 outside production.
   */
  readonly publicOrigin: string;
  /**
   * Key of the HMAC that stores session tokens (SESSION_SECRET, at least 32
   * characters). Outside production, when it is not set, `undefined`: the app
   * then uses a random key per process (sessions do not survive a restart).
   */
  readonly sessionSecret: string | undefined;
  /**
   * The order source's API key for POST /orders (ORDER_API_KEY, at least 32
   * characters, required in production). Outside production, when it is not
   * set, `undefined`: the route then answers 401 to every request.
   */
  readonly orderApiKey: string | undefined;
}

export const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:5173';
export const MIN_SESSION_SECRET_LENGTH = 32;
export const MIN_ORDER_API_KEY_LENGTH = 32;

/** Reads and validates the HTTP configuration. Messages never contain a value. */
export function loadHttpConfig(env: Readonly<Record<string, string | undefined>>): HttpConfig {
  const production = env['NODE_ENV'] === 'production';
  return {
    production,
    publicOrigin: parsePublicOrigin(env['PUBLIC_ORIGIN'], production),
    sessionSecret: parseSessionSecret(env['SESSION_SECRET'], production),
    orderApiKey: parseOrderApiKey(env['ORDER_API_KEY'], production),
  };
}

function parseOrderApiKey(raw: string | undefined, production: boolean): string | undefined {
  if (raw === undefined || raw === '') {
    if (production) throw new ConfigError('ORDER_API_KEY is required in production');
    return undefined;
  }
  if (raw.length < MIN_ORDER_API_KEY_LENGTH) {
    throw new ConfigError(
      `ORDER_API_KEY must have at least ${String(MIN_ORDER_API_KEY_LENGTH)} characters`,
    );
  }
  return raw;
}

function parsePublicOrigin(raw: string | undefined, production: boolean): string {
  if (raw === undefined || raw === '') {
    if (production) throw new ConfigError('PUBLIC_ORIGIN is required in production');
    return DEFAULT_PUBLIC_ORIGIN;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError('PUBLIC_ORIGIN must be a URL such as https://orders.example.com');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('PUBLIC_ORIGIN must use http:// or https://');
  }
  // an origin only: no path, query, fragment or credentials
  if (raw.replace(/\/$/, '') !== url.origin) {
    throw new ConfigError('PUBLIC_ORIGIN must be an origin only (scheme://host[:port])');
  }
  return url.origin;
}

function parseSessionSecret(raw: string | undefined, production: boolean): string | undefined {
  if (raw === undefined || raw === '') {
    if (production) throw new ConfigError('SESSION_SECRET is required in production');
    return undefined;
  }
  if (raw.length < MIN_SESSION_SECRET_LENGTH) {
    throw new ConfigError(
      `SESSION_SECRET must have at least ${String(MIN_SESSION_SECRET_LENGTH)} characters`,
    );
  }
  return raw;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(raw)) throw new ConfigError('PORT must be an integer between 1 and 65535');
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new ConfigError('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseDatabaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw === '') throw new ConfigError('DATABASE_URL is required');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError('DATABASE_URL must be a valid URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new ConfigError('DATABASE_URL must use the postgres:// or postgresql:// scheme');
  }
  return raw;
}
