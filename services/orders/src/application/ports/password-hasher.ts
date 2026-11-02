/** Port: one-way password hashing. Implemented with Argon2id by the security adapter. */
export interface PasswordHasher {
  /** Returns a self-describing hash string (algorithm, parameters, salt, hash). */
  hash(password: string): Promise<string>;
  /** True when the password matches the hash. Never rejects for a wrong password. */
  verify(hash: string, password: string): Promise<boolean>;
}
