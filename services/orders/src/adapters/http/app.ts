import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
  type onRequestAsyncHookHandler,
  type RouteHandlerMethod,
} from 'fastify';
import { checkHealth } from '../../application/check-health.js';
import type { CreateOrderDeps } from '../../application/create-order.js';
import type { DatabaseHealth } from '../../application/ports/database-health.js';
import type { StaffAuth } from '../../application/staff-auth.js';
import { apiKeyGuard, requiresApiKey } from './api-key.js';
import { authHandlers } from './auth-routes.js';
import { listOperations, loadContract, type Operation } from './contract.js';
import { CREATE_ORDER_BODY_LIMIT, orderHandlers } from './order-routes.js';
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
  /**
   * Order intake (POST /orders). Without it, or without `apiKey`, the route
   * answers 401 to every request: it never fails open.
   */
  readonly orders?: OrderIntakeOptions;
}

export interface OrderIntakeOptions extends CreateOrderDeps {
  /** ORDER_API_KEY; `undefined` closes the route. */
  readonly apiKey: string | undefined;
}

/**
 * Builds the HTTP app: one route per operation of the contract, validated with
 * the contract's request schemas, closed by the session guard when the
 * operation's `security` requires a session, or by the API key guard when it
 * requires the `apiKey` scheme. Operations without a handler yet
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
    ...(deps.orders ? orderHandlers(deps.orders) : {}),
  };
  const bodyLimits: Record<string, number> = {
    'POST /api/v1/orders': CREATE_ORDER_BODY_LIMIT,
  };

  const notYet: RouteHandlerMethod = (_request, reply) => notImplemented(reply);
  const guardOf = (operation: Operation): onRequestAsyncHookHandler | undefined => {
    if (requiresSession(operation)) {
      return sessionGuard(operation, {
        auth: deps.auth,
        publicOrigin: deps.web.publicOrigin,
        cookie,
      });
    }
    if (requiresApiKey(operation)) return apiKeyGuard(deps.orders?.apiKey);
    return undefined;
  };

  const operations = listOperations(loadContract(deps.contractPath));
  // Registered as a plugin (on ready), so onRoute hooks added after buildApp see every route.
  void app.register((instance, _options, done) => {
    for (const operation of operations) {
      const guard = guardOf(operation);
      const bodyLimit = bodyLimits[operation.key];
      instance.route({
        method: operation.method,
        url: operation.url,
        schema: operation.schema,
        ...(guard ? { onRequest: guard } : {}),
        ...(bodyLimit === undefined ? {} : { bodyLimit }),
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
