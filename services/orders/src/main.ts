// Composition root of the orders service: configuration from the environment,
// the adapters wired together, then the HTTP server.
import { randomBytes } from 'node:crypto';
import { buildApp } from './adapters/http/app.js';
import { openDatabase } from './adapters/persistence/database.js';
import { createLoginAttemptStore } from './adapters/persistence/login-attempt-store.js';
import { createSessionStore } from './adapters/persistence/session-store.js';
import { createStaffUserStore } from './adapters/persistence/staff-user-store.js';
import { createArgon2PasswordHasher } from './adapters/security/argon2-password-hasher.js';
import { createHmacSessionTokens } from './adapters/security/hmac-session-tokens.js';
import { systemClock } from './application/ports/clock.js';
import { createStaffAuth } from './application/staff-auth.js';
import { loadConfig, loadHttpConfig } from './config.js';

const config = loadConfig(process.env);
const httpConfig = loadHttpConfig(process.env);
const database = openDatabase(config.databaseUrl, {
  // called only on pool events, after the app below exists
  onIdleError: (error) => {
    app.log.warn({ err: error }, 'Idle database connection failed');
  },
});

// Outside production SESSION_SECRET may be unset: a random key per process,
// so sessions simply end when the service restarts.
const sessionSecret = httpConfig.sessionSecret ?? randomBytes(32).toString('base64url');

const auth = createStaffAuth({
  users: createStaffUserStore(database.db),
  sessions: createSessionStore(database.db),
  attempts: createLoginAttemptStore(database.db),
  hasher: createArgon2PasswordHasher(),
  tokens: createHmacSessionTokens(sessionSecret),
  clock: systemClock,
});

const app = buildApp({
  databaseHealth: database.health,
  auth,
  web: { production: httpConfig.production, publicOrigin: httpConfig.publicOrigin },
  logger: { level: 'info' },
});

if (httpConfig.sessionSecret === undefined) {
  app.log.warn('SESSION_SECRET is not set: using a random key, sessions end on restart');
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Shutting down');
  try {
    await app.close();
    await database.close();
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));

// 0.0.0.0: reachable from outside a container (compose maps the port).
await app.listen({ port: config.port, host: '0.0.0.0' });
