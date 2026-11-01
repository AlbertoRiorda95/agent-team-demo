// Composition root of the orders service: configuration from the environment,
// the adapters wired together, then the HTTP server.
import { buildApp } from './adapters/http/app.js';
import { openDatabase } from './adapters/persistence/database.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.env);
const database = openDatabase(config.databaseUrl, {
  // called only on pool events, after the app below exists
  onIdleError: (error) => {
    app.log.warn({ err: error }, 'Idle database connection failed');
  },
});
const app = buildApp({ databaseHealth: database.health, logger: { level: 'info' } });

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
