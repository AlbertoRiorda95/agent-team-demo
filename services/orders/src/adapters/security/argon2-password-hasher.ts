import argon2 from 'argon2';
import type { PasswordHasher } from '../../application/ports/password-hasher.js';

/**
 * Argon2id with the library's defaults (m=64 MiB, t=3, p=4: above the OWASP
 * minimum). The parameters are stored in each hash, so raising them later
 * keeps the old hashes verifiable.
 */
export function createArgon2PasswordHasher(): PasswordHasher {
  return {
    hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
    async verify(hash, password) {
      try {
        return await argon2.verify(hash, password);
      } catch {
        // a malformed hash is a mismatch, not a crash
        return false;
      }
    },
  };
}
