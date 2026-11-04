// Handlers of /auth/login, /auth/logout and /auth/me. Input is validated by
// the contract's schemas before they run; logout and me run after the session
// guard, so `request.staffUser` and `request.sessionToken` are set.
import type { RouteHandlerMethod } from 'fastify';
import type { StaffAuth } from '../../application/staff-auth.js';
import type { StaffUserRecord } from '../../application/ports/staff-user-store.js';
import { sendProblem } from './problem.js';
import {
  clearSessionCookie,
  setSessionCookie,
  unauthorized,
  type CookieOptions,
} from './session.js';

export interface AuthRouteOptions {
  readonly auth: StaffAuth;
  readonly cookie: CookieOptions;
}

interface LoginBody {
  email: string;
  password: string;
}

/** The contract's StaffUser: no password hash, no internal flags. */
function staffUser(user: StaffUserRecord): { id: string; email: string; name: string } {
  return { id: user.id, email: user.email, name: user.name };
}

export function authHandlers(options: AuthRouteOptions): Record<string, RouteHandlerMethod> {
  const { auth, cookie } = options;
  return {
    'POST /api/v1/auth/login': async (request, reply) => {
      const body = request.body as LoginBody;
      const result = await auth.logIn({ email: body.email, password: body.password });
      switch (result.kind) {
        case 'ok':
          setSessionCookie(reply, result.token, cookie);
          return reply.status(200).send(staffUser(result.user));
        case 'invalid':
          // one answer for a wrong email, a wrong password and a deactivated account
          return unauthorized(reply, 'Wrong email or password');
        case 'locked':
          void reply.header('retry-after', String(result.retryAfterSeconds));
          return sendProblem(reply, {
            type: 'about:blank',
            title: 'Too many attempts',
            status: 429,
            detail: 'Too many failed logins for this email. Try again later.',
          });
      }
    },

    'POST /api/v1/auth/logout': async (request, reply) => {
      if (request.sessionToken) await auth.logOut(request.sessionToken);
      clearSessionCookie(reply, cookie);
      return reply.status(204).send();
    },

    'GET /api/v1/auth/me': async (request, reply) => {
      // the guard answered 401 already when there is no user
      if (!request.staffUser) return unauthorized(reply);
      return reply.status(200).send(staffUser(request.staffUser));
    },
  };
}
