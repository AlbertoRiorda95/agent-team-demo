// Operator commands for staff accounts (staff-auth):
//   user:create --email <e> --name <n>
//   user:deactivate --email <e>
//   user:set-password --email <e>
// The password comes from a hidden prompt, or from stdin when it is not a
// terminal. Input is checked before the database is opened.
import { parseArgs } from 'node:util';
import {
  createStaffUser,
  deactivateStaffUser,
  setStaffUserPassword,
  UnknownStaffUserError,
} from '../../application/manage-staff-users.js';
import { EmailAlreadyUsedError } from '../../application/ports/staff-user-store.js';
import { ConfigError, loadConfig } from '../../config.js';
import {
  checkPassword,
  parseEmail,
  parseName,
  StaffUserRuleError,
} from '../../domain/staff-user.js';
import { openDatabase } from '../persistence/database.js';
import { createStaffUserStore } from '../persistence/staff-user-store.js';
import { createArgon2PasswordHasher } from '../security/argon2-password-hasher.js';
import { PromptCancelledError, readPassword } from './read-password.js';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;
export const EXIT_CANCELLED = 130;

export interface CliIo {
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** Thrown for a malformed command line; the message says how to call the command. */
class UsageError extends Error {
  override readonly name = 'UsageError';
}

type Command =
  | { kind: 'create'; email: string; name: string; password: string }
  | { kind: 'deactivate'; email: string }
  | { kind: 'set-password'; email: string; password: string };

const USAGE: Record<Command['kind'], string> = {
  create: 'Usage: npm run user:create -w services/orders -- --email <email> --name <name>',
  deactivate: 'Usage: npm run user:deactivate -w services/orders -- --email <email>',
  'set-password': 'Usage: npm run user:set-password -w services/orders -- --email <email>',
};

/** Runs one command (`create`, `deactivate`, `set-password` plus its options); returns the exit code. */
export async function runUserCommand(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    const command = await parseCommand(argv, io);
    await execute(command, io);
    return EXIT_OK;
  } catch (error) {
    return report(error, io.stderr);
  }
}

async function parseCommand(argv: readonly string[], io: CliIo): Promise<Command> {
  const [kind, ...rest] = argv;
  if (kind !== 'create' && kind !== 'deactivate' && kind !== 'set-password') {
    throw new UsageError('Unknown command. Use one of: create, deactivate, set-password.');
  }
  const options = parseOptions(kind, rest);
  const email = parseEmail(requireOption(kind, options.email, 'email'));
  switch (kind) {
    case 'create': {
      const name = parseName(requireOption(kind, options.name, 'name'));
      const password = await readPassword(io.stdin, io.stderr);
      checkPassword(password);
      return { kind, email, name, password };
    }
    case 'deactivate':
      if (options.name !== undefined) throw new UsageError(USAGE[kind]);
      return { kind, email };
    case 'set-password': {
      if (options.name !== undefined) throw new UsageError(USAGE[kind]);
      const password = await readPassword(io.stdin, io.stderr);
      checkPassword(password);
      return { kind, email, password };
    }
  }
}

function parseOptions(
  kind: Command['kind'],
  args: string[],
): { email?: string | undefined; name?: string | undefined } {
  try {
    // strict: unknown options (a `--password`, for one) are refused, not ignored
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: { email: { type: 'string' }, name: { type: 'string' } },
    });
    return values;
  } catch {
    throw new UsageError(USAGE[kind]);
  }
}

function requireOption(kind: Command['kind'], value: string | undefined, option: string): string {
  if (value === undefined) throw new UsageError(`Missing --${option}.\n${USAGE[kind]}`);
  return value;
}

async function execute(command: Command, io: CliIo): Promise<void> {
  const config = loadConfig(io.env);
  const database = openDatabase(config.databaseUrl);
  try {
    const store = createStaffUserStore(database.db);
    const hasher = createArgon2PasswordHasher();
    switch (command.kind) {
      case 'create': {
        const user = await createStaffUser({ store, hasher }, command);
        io.stdout.write(`Account created (id ${user.id}).\n`);
        return;
      }
      case 'deactivate': {
        const user = await deactivateStaffUser({ store }, command.email);
        io.stdout.write(`Account deactivated and its sessions ended (id ${user.id}).\n`);
        return;
      }
      case 'set-password': {
        const user = await setStaffUserPassword({ store, hasher }, command.email, command.password);
        io.stdout.write(`Password set and sessions ended (id ${user.id}).\n`);
        return;
      }
    }
  } finally {
    await database.close();
  }
}

/** Prints a message the operator can act on; never the password, never a stack for known errors. */
function report(error: unknown, stderr: NodeJS.WritableStream): number {
  if (error instanceof UsageError) {
    stderr.write(`Error: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (error instanceof PromptCancelledError) {
    stderr.write(`${error.message}\n`);
    return EXIT_CANCELLED;
  }
  if (
    error instanceof StaffUserRuleError ||
    error instanceof EmailAlreadyUsedError ||
    error instanceof UnknownStaffUserError ||
    error instanceof ConfigError
  ) {
    stderr.write(`Error: ${error.message}\n`);
    return EXIT_FAILURE;
  }
  // database unreachable and the like: the message only, it may not name a secret
  // (pg error messages do not contain the connection string)
  stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  return EXIT_FAILURE;
}
