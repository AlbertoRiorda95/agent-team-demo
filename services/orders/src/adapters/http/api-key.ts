// The order source's API key at the HTTP edge: `Authorization: Bearer <key>`
// on the operations whose contract `security` is the `apiKey` scheme. A staff
// session cookie is never accepted instead.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { onRequestAsyncHookHandler } from 'fastify';
import type { Operation } from './contract.js';
import { unauthorized } from './session.js';

const API_KEY_SCHEME = 'apiKey';

/** True when every alternative of the operation's `security` includes the API key scheme. */
export function requiresApiKey(operation: Operation): boolean {
  return (
    operation.security.length > 0 &&
    operation.security.every((alternative) => alternative.includes(API_KEY_SCHEME))
  );
}

/**
 * onRequest hook, before the body is read: 401 (one body for every case) when
 * the header is missing, not Bearer, or not the key. With no key configured
 * every request gets 401: the guard never fails open. The comparison is in
 * constant time on SHA-256 digests (equal length whatever the input).
 */
export function apiKeyGuard(apiKey: string | undefined): onRequestAsyncHookHandler {
  const expected = apiKey === undefined ? undefined : digest(apiKey);
  return async (request, reply) => {
    const presented = bearerToken(request.headers.authorization);
    if (expected === undefined || presented === undefined) return unauthorized(reply);
    if (!timingSafeEqual(digest(presented), expected)) return unauthorized(reply);
  };
}

/** The credentials of `Bearer <token>` (scheme case-insensitive), or `undefined`. */
function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer +(\S+) *$/i.exec(header);
  return match?.[1];
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
