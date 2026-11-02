// Use cases of the operator commands (staff-auth): create an account,
// deactivate it, set its password.
import { checkPassword, parseEmail, parseName } from '../domain/staff-user.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import {
  EmailAlreadyUsedError,
  type StaffUserRecord,
  type StaffUserStore,
} from './ports/staff-user-store.js';

/** Thrown when no account has the given email. */
export class UnknownStaffUserError extends Error {
  override readonly name = 'UnknownStaffUserError';
  constructor() {
    super('No account has this email.');
  }
}

export interface StaffUserDeps {
  readonly store: StaffUserStore;
  readonly hasher: PasswordHasher;
}

export interface CreateStaffUserInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

/**
 * Validates the input, then creates an active account with the Argon2id hash
 * of the password. The email must not be used by any account, deactivated ones
 * included (compared case-insensitively).
 */
export async function createStaffUser(
  deps: StaffUserDeps,
  input: CreateStaffUserInput,
): Promise<StaffUserRecord> {
  const email = parseEmail(input.email);
  const name = parseName(input.name);
  checkPassword(input.password);
  if (await deps.store.findByEmail(email)) throw new EmailAlreadyUsedError();
  const passwordHash = await deps.hasher.hash(input.password);
  return deps.store.insert({ email, name, passwordHash });
}

/** Deactivates the account and deletes its sessions. Already inactive: same result. */
export async function deactivateStaffUser(
  deps: Pick<StaffUserDeps, 'store'>,
  rawEmail: string,
): Promise<StaffUserRecord> {
  const user = await requireUser(deps.store, rawEmail);
  await deps.store.deactivate(user.id);
  return { ...user, active: false };
}

/** Replaces the account's password and deletes its sessions. */
export async function setStaffUserPassword(
  deps: StaffUserDeps,
  rawEmail: string,
  password: string,
): Promise<StaffUserRecord> {
  const email = parseEmail(rawEmail);
  checkPassword(password);
  const user = await requireUser(deps.store, email);
  const passwordHash = await deps.hasher.hash(password);
  await deps.store.setPasswordHash(user.id, passwordHash);
  return user;
}

async function requireUser(store: StaffUserStore, rawEmail: string): Promise<StaffUserRecord> {
  const user = await store.findByEmail(parseEmail(rawEmail));
  if (!user) throw new UnknownStaffUserError();
  return user;
}
