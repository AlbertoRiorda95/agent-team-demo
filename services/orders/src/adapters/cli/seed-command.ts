// Developer command `npm run seed -w services/orders [-- --count N]`
// (order-intake, flow 4): fills a development database with demo orders.
// Refuses NODE_ENV=production before reading anything else or opening the
// database. Prints counts only: never a name, an email or an address.
import { parseArgs } from 'node:util';
import { DEFAULT_SEED_COUNT, MAX_SEED_COUNT } from '../../application/seed-data.js';
import { seedDemoOrders } from '../../application/seed-orders.js';
import { ConfigError, loadConfig } from '../../config.js';
import { openDatabase } from '../persistence/database.js';
import { createOrderStore } from '../persistence/order-store.js';
import { createSeedStore } from '../persistence/seed-store.js';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

export interface SeedIo {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly now: () => Date;
}

const USAGE = `Usage: npm run seed -w services/orders [-- --count N] (N from 1 to ${String(MAX_SEED_COUNT)}, default ${String(DEFAULT_SEED_COUNT)})`;

class UsageError extends Error {
  override readonly name = 'UsageError';
}

/** Runs the seed; returns the exit code. */
export async function runSeedCommand(argv: readonly string[], io: SeedIo): Promise<number> {
  if (io.env['NODE_ENV'] === 'production') {
    io.stderr.write('Error: the seed never runs with NODE_ENV=production. Nothing was written.\n');
    return EXIT_FAILURE;
  }
  try {
    const count = parseCount(argv);
    const config = loadConfig(io.env);
    const database = openDatabase(config.databaseUrl);
    try {
      const result = await seedDemoOrders(
        {
          orders: createOrderStore(database.db),
          seed: createSeedStore(database.db),
          now: io.now(),
        },
        count,
      );
      io.stdout.write(
        `Seed: ${String(result.created)} orders created, ${String(result.existing)} already there, ` +
          `${String(result.withHistory)} given a status history.\n`,
      );
      return EXIT_OK;
    } finally {
      await database.close();
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`Error: ${error.message}\n${USAGE}\n`);
      return EXIT_USAGE;
    }
    if (error instanceof ConfigError) {
      io.stderr.write(`Error: ${error.message}\n`);
      return EXIT_FAILURE;
    }
    // database unreachable, migrations missing and the like: the message only
    // (pg error messages do not contain the connection string)
    io.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_FAILURE;
  }
}

function parseCount(argv: readonly string[]): number {
  let raw: string | undefined;
  try {
    const { values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: { count: { type: 'string' } },
    });
    raw = values.count;
  } catch {
    throw new UsageError('Unknown option or missing value.');
  }
  if (raw === undefined) return DEFAULT_SEED_COUNT;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_SEED_COUNT) {
    throw new UsageError(`--count must be an integer from 1 to ${String(MAX_SEED_COUNT)}.`);
  }
  return Number(raw);
}
