import { createHmac, randomBytes } from 'node:crypto';
import type { SessionTokens } from '../../application/ports/session-tokens.js';

const TOKEN_BYTES = 32; // 256 bits
// 32 bytes in base64url without padding: 43 characters
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Random 256-bit tokens (base64url); the database stores their HMAC-SHA-256
 * keyed with SESSION_SECRET (hex), so a leaked table holds no usable token.
 */
export function createHmacSessionTokens(secret: string): SessionTokens {
  return {
    generate: () => randomBytes(TOKEN_BYTES).toString('base64url'),
    isWellFormed: (value) => TOKEN_PATTERN.test(value),
    hash: (token) => createHmac('sha256', secret).update(token).digest('hex'),
  };
}
