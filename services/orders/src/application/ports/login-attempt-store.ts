/** Port: login attempts per email, for the lockout. Emails arrive normalized. */
export interface LoginAttemptStore {
  record(email: string, at: Date, success: boolean): Promise<void>;
  /** The times of the failed attempts for the email at or after `since`. */
  failuresSince(email: string, since: Date): Promise<Date[]>;
  /** Deletes every attempt (any email) before `before`. */
  deleteBefore(before: Date): Promise<void>;
}
