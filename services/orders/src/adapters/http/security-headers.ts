// Security headers on every response (staff-auth; project design > Security).
// A small Fastify hook instead of a plugin, as the spec decides. The API only
// answers JSON, so its CSP allows nothing at all (no script, inline or not).
import type { FastifyInstance } from 'fastify';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export interface SecurityHeadersOptions {
  /** Adds Strict-Transport-Security (NODE_ENV=production, served over HTTPS). */
  readonly hsts: boolean;
}

export function securityHeaders(options: SecurityHeadersOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'content-security-policy':
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    // staff data and session answers are never stored by a browser or a proxy
    'cache-control': 'no-store',
  };
  if (options.hsts) {
    headers['strict-transport-security'] = `max-age=${String(ONE_YEAR_SECONDS)}; includeSubDomains`;
  }
  return headers;
}

export function addSecurityHeaders(app: FastifyInstance, options: SecurityHeadersOptions): void {
  const headers = securityHeaders(options);
  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.headers(headers);
    return payload;
  });
}
