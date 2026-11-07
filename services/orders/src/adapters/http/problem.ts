// RFC 9457 problem details, the error shape of the contract (components.schemas.Problem).
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface FieldError {
  field: string;
  message: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: FieldError[];
}

export function sendProblem(reply: FastifyReply, problem: Problem): FastifyReply {
  return reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
}

export function notImplemented(reply: FastifyReply): FastifyReply {
  return sendProblem(reply, {
    type: 'about:blank',
    title: 'Not implemented yet',
    status: 501,
  });
}

export function notFound(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return sendProblem(reply, {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: `No route for ${request.method} ${request.url.split('?')[0] ?? ''}`,
  });
}

interface ValidationIssue {
  instancePath: string;
  message?: string | undefined;
  params: Record<string, unknown>;
}

/**
 * Error handler: an invalid path parameter (a malformed order number) is a
 * 404, as the contract says; other request validation and malformed bodies
 * become 422 with the invalid fields, other client errors keep their status, anything else is a
 * 500 with no internal detail (the error is logged).
 */
export function handleError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  // a path parameter outside its pattern (`/orders/123`) names no resource
  if (error.validation && error.validationContext === 'params') {
    return sendProblem(reply, { type: 'about:blank', title: 'Not Found', status: 404 });
  }
  if (error.validation) {
    return sendProblem(reply, {
      type: 'about:blank',
      title: 'Validation failed',
      status: 422,
      errors: error.validation.map((issue) =>
        fieldError(error.validationContext, issue as ValidationIssue),
      ),
    });
  }
  const status = error.statusCode ?? 500;
  if (status === 400) {
    return sendProblem(reply, {
      type: 'about:blank',
      title: 'Validation failed',
      status: 422,
      detail: error.message,
    });
  }
  if (status === 413) {
    return sendProblem(reply, {
      type: 'about:blank',
      title: 'Payload Too Large',
      status: 413,
      detail: 'The request body is larger than this operation accepts.',
    });
  }
  if (status >= 400 && status < 500) {
    return sendProblem(reply, { type: 'about:blank', title: error.message, status });
  }
  request.log.error({ err: loggableError(error) }, 'Unhandled error');
  return sendProblem(reply, { type: 'about:blank', title: 'Internal Server Error', status: 500 });
}

/**
 * What is logged of an unexpected error. Drizzle's query errors put the query
 * parameters (an email, a token hash) in their message and stack, so only the
 * innermost cause (the driver's error) is logged, with the outer error's type.
 */
export function loggableError(error: Error): Record<string, unknown> {
  let inner: Error = error;
  while (inner.cause instanceof Error) inner = inner.cause;
  if (inner.name === 'DrizzleQueryError') return { type: error.name, message: 'Query failed' };
  const code = (inner as { code?: unknown }).code;
  return {
    type: error.name,
    ...(inner === error ? {} : { causeType: inner.name }),
    ...(typeof code === 'string' ? { code } : {}),
    message: inner.message,
    stack: inner.stack,
  };
}

/** `/items/0/quantity` + missing `sku` → `items[0].sku`; query and path fields get no prefix. */
function fieldError(context: string | undefined, issue: ValidationIssue): FieldError {
  const segments = issue.instancePath.split('/').slice(1);
  const extra = issue.params['missingProperty'] ?? issue.params['additionalProperty'];
  if (typeof extra === 'string') segments.push(extra);
  const field = segments
    .map((s, i) => (/^\d+$/.test(s) ? `[${s}]` : i === 0 ? s : `.${s}`))
    .join('');
  const message =
    typeof issue.params['additionalProperty'] === 'string'
      ? 'is not allowed'
      : (issue.message ?? 'is invalid');
  return { field: field || (context ?? 'request'), message };
}
