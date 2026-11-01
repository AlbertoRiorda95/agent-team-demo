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
