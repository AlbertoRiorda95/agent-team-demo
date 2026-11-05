// Entry point of `npm run seed` (see seed-command.ts).
import { runSeedCommand } from './seed-command.js';

process.exitCode = await runSeedCommand(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  now: () => new Date(),
});
