import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
  type RouteHandlerMethod,
} from 'fastify';
import { checkHealth } from '../../application/check-health.js';
import type { DatabaseHealth } from '../../application/ports/database-health.js';
import type { StaffAuth } from '../../application/staff-auth.js';
import { authHandlers } from './auth-routes.js';
import { listOperations, loadContract } from './contract.js';
import { handleError, notFound, notImplemented } from './problem.js';
import { addSecurityHeaders } from './security-headers.js';
import { requiresSession, sessionGuard } from './session.js';
import { createValidatorCompiler } from './validation.js';

export interface WebOptions {
  /** NODE_ENV=production: Secure cookie and HSTS. */
  readonly production: boolean;
  /** The web app's origin (PUBLIC_ORIGIN), required on state-changing staff requests. */
  readonly publicOrigin: string;
}

export interface AppDependencies {
  readonly databaseHealth: DatabaseHealth;
  readonly auth: StaffAuth;
  readonly web: WebOptions;
  /** Fastify logger option or instance; off by default (tests). */
  readonly logger?: FastifyServerOptions['logger'] | FastifyBaseLogger;
  /** Path of the OpenAPI contract; services/orders/openapi.yaml by default. */
  readonly contractPath?: string;
}

/**
 * Builds the HTTP app: one route per operation of the contract, validated with
 * the contract's request schemas, closed by the session guard when the
 * operation's `security` requires a session. Operations without a handler yet
 * answer 501 (after the guard).
 */
export function buildApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    // the API surface is exactly the contract: no implicit HEAD routes
    exposeHeadRoutes: false,
    bodyLimit: 1024 * 1024,
  });
  app.setValidatorCompiler(createValidatorCompiler());
  app.setErrorHandler(handleError);
  app.setNotFoundHandler(notFound);
  allowEmptyJsonBody(app);
  addSecurityHeaders(app, { hsts: deps.web.production });
  app.decorateRequest('staffUser', null);
  app.decorateRequest('sessionToken', null);

  const cookie = { secure: deps.web.production };
  const handlers: Record<string, RouteHandlerMethod> = {
    'GET /health': async (_request, reply) => {
      const status = await checkHealth(deps.databaseHealth);
      return reply.status(status === 'ok' ? 200 : 503).send({ status });
    },
    ...authHandlers({ auth: deps.auth, cookie }),
  };

  const notYet: RouteHandlerMethod = (_request, reply) => notImplemented(reply);

  const operations = listOperations(loadContract(deps.contractPath));
  // Registered as a plugin (on ready), so onRoute hooks added after buildApp see every route.
  void app.register((instance, _options, done) => {
    for (const operation of operations) {
      instance.route({
        method: operation.method,
        url: operation.url,
        schema: operation.schema,
        ...(requiresSession(operation)
          ? {
              onRequest: sessionGuard(operation, {
                auth: deps.auth,
                publicOrigin: deps.web.publicOrigin,
                cookie,
              }),
            }
          : {}),
        handler: handlers[operation.key] ?? notYet,
      });
    }
    done();
  });

  return app;
}

/**
 * The default JSON parser, except that an empty body is no body: a POST
 * without one (logout) may still say it is JSON. Operations that declare a
 * body still get 422 from their schema.
 */
function allowEmptyJsonBody(app: FastifyInstance): void {
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    // parseAs: 'string' always gives a string; the type allows a Buffer too
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.length === 0) {
      done(null, undefined);
      return;
    }
    // the default parser is synchronous and answers through `done`
    void parseJson(request, text, done);
  });
}
