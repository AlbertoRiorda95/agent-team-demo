// Entry point of `npm run user:create | user:deactivate | user:set-password`
// (see user-commands.ts). Built to dist/adapters/cli/user.js as well.
import { runUserCommand } from './user-commands.js';

process.exitCode = await runUserCommand(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
});
