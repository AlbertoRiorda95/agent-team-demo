import type { DatabaseHealth } from './ports/database-health.js';

export type HealthStatus = 'ok' | 'unavailable';

/** Use case: the service is healthy when its database is reachable. */
export async function checkHealth(database: DatabaseHealth): Promise<HealthStatus> {
  return (await database.isReachable()) ? 'ok' : 'unavailable';
}
