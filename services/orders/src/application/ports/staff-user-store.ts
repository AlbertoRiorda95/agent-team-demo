/** A stored staff account, as the use cases see it. */
export interface StaffUserRecord {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly active: boolean;
  readonly createdAt: Date;
}

export interface NewStaffUser {
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
}

/** Thrown by `insert` when the email is already used (unique constraint). */
export class EmailAlreadyUsedError extends Error {
  override readonly name = 'EmailAlreadyUsedError';
  constructor() {
    super('This email is already used by an account (active or deactivated).');
  }
}

/** Port: persistence of staff accounts. Emails are passed already normalized. */
export interface StaffUserStore {
  findByEmail(email: string): Promise<StaffUserRecord | undefined>;
  /** The account with its password hash, for the login only. */
  findCredentialsByEmail(
    email: string,
  ): Promise<{ user: StaffUserRecord; passwordHash: string } | undefined>;
  /** Inserts an active account. Throws EmailAlreadyUsedError on a duplicate email. */
  insert(user: NewStaffUser): Promise<StaffUserRecord>;
  /** Sets the account inactive and deletes all its sessions, atomically. */
  deactivate(userId: string): Promise<void>;
  /** Replaces the password hash and deletes all the account's sessions, atomically. */
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
}
