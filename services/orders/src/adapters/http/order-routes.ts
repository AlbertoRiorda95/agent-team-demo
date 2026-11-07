// Handlers of GET /orders (orders-list) and GET /orders/{number}
// (order-detail), after the session guard, and POST /orders (order-intake,
// after the API key guard). All run after the contract's schema validation;
// the use cases hold the rules.
import { toJSON } from '@albertoriorda95/money';
import type { RouteHandlerMethod } from 'fastify';
import {
  createOrder,
  type CreateOrderDeps,
  type CreateOrderResult,
} from '../../application/create-order.js';
import { getOrder } from '../../application/get-order.js';
import { listOrders, type ListOrdersInput } from '../../application/list-orders.js';
import type { OrderRecord, OrderSummaryRecord } from '../../application/ports/order-store.js';
import { InvalidOrderError, type NewOrderInput } from '../../domain/order.js';
import { sendProblem } from './problem.js';

/** The request body limit of POST /orders (the contract's 256 KB). */
export const CREATE_ORDER_BODY_LIMIT = 256 * 1024;

export function orderHandlers(deps: CreateOrderDeps): Record<string, RouteHandlerMethod> {
  return {
    'GET /api/v1/orders': async (request, reply) => {
      // validated and defaulted from the contract (status enum, page ≥ 1, pageSize 1..100)
      const query = request.query as ListOrdersInput;
      const page = await listOrders(deps, {
        status: query.status,
        q: query.q,
        page: query.page,
        pageSize: query.pageSize,
      });
      return reply.send({
        items: page.items.map(orderSummaryResponse),
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
      });
    },
    'GET /api/v1/orders/{number}': async (request, reply) => {
      // matched against the contract's OrderNumber pattern (a malformed one is a 404)
      const { number } = request.params as { number: string };
      const order = await getOrder(deps, number);
      if (!order) {
        return sendProblem(reply, {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: 'No such order.',
        });
      }
      return reply.send(orderResponse(order));
    },
    'POST /api/v1/orders': async (request, reply) => {
      let result: CreateOrderResult;
      try {
        result = await createOrder(deps, request.body as NewOrderInput);
      } catch (error) {
        if (!(error instanceof InvalidOrderError)) throw error;
        return sendProblem(reply, {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          errors: error.errors.map((e) => ({ field: e.field, message: e.message })),
        });
      }
      return reply.status(result.kind === 'created' ? 201 : 200).send(orderResponse(result.order));
    },
  };
}

/** The contract's OrderSummary. */
export function orderSummaryResponse(order: OrderSummaryRecord): Record<string, unknown> {
  return {
    number: order.number,
    status: order.status,
    customerName: order.customerName,
    total: toJSON(order.total),
    createdAt: order.createdAt.toISOString(),
  };
}

/** The contract's Order: no internal id. */
export function orderResponse(order: OrderRecord): Record<string, unknown> {
  return {
    number: order.number,
    externalReference: order.externalReference,
    status: order.status,
    version: order.version,
    currency: order.currency,
    customer: { name: order.customer.name, email: order.customer.email },
    shippingAddress: { ...order.shippingAddress },
    items: order.items.map((line) => ({
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      unitPrice: toJSON(line.unitPrice),
      lineTotal: toJSON(line.lineTotal),
    })),
    shippingCost: toJSON(order.shippingCost),
    total: toJSON(order.total),
    history: order.history.map((change) => ({
      from: change.from,
      to: change.to,
      ...(change.reason === undefined ? {} : { reason: change.reason }),
      changedBy: { id: change.changedBy.id, name: change.changedBy.name },
      at: change.at.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
