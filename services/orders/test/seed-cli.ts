// Runs `npm run seed`'s entry point as a child process, for the seed tests.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVICE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = 'src/adapters/cli/seed.ts';

export const UNREACHABLE_DB = 'postgres://orders:orders@127.0.0.1:1/orders';

export interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export function runSeed(
  args: string[],
  databaseUrl: string,
  extraEnv: Record<string, string> = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ENTRY, ...args], {
      cwd: SERVICE_DIR,
      env: { PATH: process.env['PATH'], DATABASE_URL: databaseUrl, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
