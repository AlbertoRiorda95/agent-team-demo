// Staff account rules (staff-auth): email, name and password validation.
// Pure functions: no I/O, no framework.
import { fullFormats } from 'ajv-formats/dist/formats.js';

/** Minimum password length, in characters (Unicode code points). */
export const MIN_PASSWORD_LENGTH = 12;
/** Maximum password length, in characters: the login contract accepts up to 256. */
export const MAX_PASSWORD_LENGTH = 256;
/** Maximum email length, as in the login contract. */
export const MAX_EMAIL_LENGTH = 254;

// The same `format: email` the HTTP layer validates the login body with, so an
// account created here can always log in.
const EMAIL_PATTERN = fullFormats.email as RegExp;

export type StaffUserRuleViolation =
  | 'invalid-email'
  | 'empty-name'
  | 'password-too-short'
  | 'password-too-long';

/** Thrown when an account input breaks a rule. The message never contains the input. */
export class StaffUserRuleError extends Error {
  override readonly name = 'StaffUserRuleError';
  constructor(readonly violation: StaffUserRuleViolation) {
    super(VIOLATION_MESSAGES[violation]);
  }
}

const VIOLATION_MESSAGES: Record<StaffUserRuleViolation, string> = {
  'invalid-email': 'The email is not a valid email address.',
  'empty-name': 'The name must not be empty.',
  'password-too-short': `The password must have at least ${String(MIN_PASSWORD_LENGTH)} characters.`,
  'password-too-long': `The password must have at most ${String(MAX_PASSWORD_LENGTH)} characters.`,
};

/** Emails are compared and stored trimmed and lower-cased. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns the normalized email, or throws `invalid-email`. */
export function parseEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new StaffUserRuleError('invalid-email');
  }
  return email;
}

/** Returns the trimmed name, or throws `empty-name`. */
export function parseName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) throw new StaffUserRuleError('empty-name');
  return name;
}

/** Checks the password length in characters; the password is used as given (not trimmed). */
export function checkPassword(password: string): void {
  // code points, so a non-ASCII character counts once (not as two UTF-16 units)
  const length = Array.from(password).length;
  if (length < MIN_PASSWORD_LENGTH) throw new StaffUserRuleError('password-too-short');
  if (length > MAX_PASSWORD_LENGTH) throw new StaffUserRuleError('password-too-long');
}
