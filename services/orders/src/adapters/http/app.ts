import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
  type RouteHandlerMethod,
} from 'fastify';
import { checkHealth } from '../../application/check-health.js';
import type { DatabaseHealth } from '../../application/ports/database-health.js';
import { listOperations, loadContract } from './contract.js';
import { handleError, notFound, notImplemented } from './problem.js';
import { createValidatorCompiler } from './validation.js';

export interface AppDependencies {
  readonly databaseHealth: DatabaseHealth;
  /** Fastify logger option or instance; off by default (tests). */
  readonly logger?: FastifyServerOptions['logger'] | FastifyBaseLogger;
  /** Path of the OpenAPI contract; services/orders/openapi.yaml by default. */
  readonly contractPath?: string;
}

/**
 * Builds the HTTP app: one route per operation of the contract, validated with
 * the contract's request schemas. Operations without a handler yet answer 501.
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

  const handlers: Record<string, RouteHandlerMethod> = {
    'GET /health': async (_request, reply) => {
      const status = await checkHealth(deps.databaseHealth);
      return reply.status(status === 'ok' ? 200 : 503).send({ status });
    },
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
        handler: handlers[operation.key] ?? notYet,
      });
    }
    done();
  });

  return app;
}
