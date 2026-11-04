// The staff session at the HTTP edge: the `session` cookie, the guard of the
// operations whose contract `security` requires it, and the CSRF check of the
// state-changing ones (JSON and Origin equal to PUBLIC_ORIGIN).
import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import type { StaffAuth } from '../../application/staff-auth.js';
import type { StaffUserRecord } from '../../application/ports/staff-user-store.js';
import type { Operation } from './contract.js';
import { sendProblem } from './problem.js';

export const SESSION_COOKIE = 'session';
const SESSION_SCHEME = 'session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

declare module 'fastify' {
  interface FastifyRequest {
    /** The account of the session, on operations that require one. */
    staffUser: StaffUserRecord | null;
    /** The session token of the request, on operations that require one. */
    sessionToken: string | null;
  }
}

export interface CookieOptions {
  /** Adds `Secure` (NODE_ENV=production). */
  readonly secure: boolean;
}

/**
 * True when every alternative of the operation's `security` includes the
 * session scheme: the operation is closed to requests without a session.
 */
export function requiresSession(operation: Operation): boolean {
  return (
    operation.security.length > 0 &&
    operation.security.every((alternative) => alternative.includes(SESSION_SCHEME))
  );
}

export function isStateChanging(operation: Operation): boolean {
  return !SAFE_METHODS.has(operation.method);
}

/** The value of the `session` cookie, or `undefined`. */
export function readSessionCookie(request: FastifyRequest): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** The token is base64url (checked before), so it needs no encoding. */
export function setSessionCookie(reply: FastifyReply, token: string, options: CookieOptions): void {
  void reply.header('set-cookie', cookie(token, options));
}

export function clearSessionCookie(reply: FastifyReply, options: CookieOptions): void {
  void reply.header('set-cookie', `${cookie('', options)}; Max-Age=0`);
}

function cookie(value: string, options: CookieOptions): string {
  // no Max-Age: a browser-session cookie; the server enforces the 8 h / 24 h expiry
  const attributes = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function unauthorized(reply: FastifyReply, title = 'Unauthorized'): FastifyReply {
  return sendProblem(reply, { type: 'about:blank', title, status: 401 });
}

export interface GuardOptions {
  readonly auth: StaffAuth;
  /** The web app's origin, compared with the Origin header of state-changing requests. */
  readonly publicOrigin: string;
  readonly cookie: CookieOptions;
}

/**
 * onRequest hook of an operation that requires a session, before the body is
 * parsed or validated: 401 without a valid session; for a state-changing
 * operation, 403 when the request is not JSON or its Origin is not
 * PUBLIC_ORIGIN, checked before the session is looked up, so a refused request
 * writes nothing (not even `lastSeenAt`).
 */
export function sessionGuard(
  operation: Operation,
  options: GuardOptions,
): onRequestAsyncHookHandler {
  const stateChanging = isStateChanging(operation);
  return async (request, reply) => {
    const token = readSessionCookie(request);
    if (token === undefined || !options.auth.isWellFormedToken(token)) {
      if (token !== undefined) clearSessionCookie(reply, options.cookie);
      return unauthorized(reply);
    }
    if (stateChanging && !isSameOriginJson(request, operation, options.publicOrigin)) {
      return sendProblem(reply, {
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail: 'State-changing requests must be JSON and come from the web app.',
      });
    }
    const user = await options.auth.authenticate(token);
    if (!user) {
      clearSessionCookie(reply, options.cookie);
      return unauthorized(reply);
    }
    request.staffUser = user;
    request.sessionToken = token;
  };
}

/**
 * Origin equal to PUBLIC_ORIGIN, and a JSON content type: required when the
 * operation has a body, and when a content type is sent anyway.
 */
function isSameOriginJson(
  request: FastifyRequest,
  operation: Operation,
  publicOrigin: string,
): boolean {
  if (request.headers.origin !== publicOrigin) return false;
  const contentType = request.headers['content-type'];
  if (contentType === undefined) return !operation.hasRequestBody;
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}
