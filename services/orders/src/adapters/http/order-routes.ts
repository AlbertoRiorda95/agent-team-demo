// Handlers of GET /orders (orders-list), GET /orders/{number} and POST
// /orders/{number}/status (order-detail), after the session guard (and its
// CSRF check on the POST), and POST /orders (order-intake,
// after the API key guard). All run after the contract's schema validation;
// the use cases hold the rules.
import { toJSON } from '@albertoriorda95/money';
import type { RouteHandlerMethod } from 'fastify';
import {
  createOrder,
  type CreateOrderDeps,
  type CreateOrderResult,
} from '../../application/create-order.js';
import {
  changeOrderStatus,
  type ChangeOrderStatusResult,
} from '../../application/change-order-status.js';
import { getOrder } from '../../application/get-order.js';
import { listOrders, type ListOrdersInput } from '../../application/list-orders.js';
import type { OrderRecord, OrderSummaryRecord } from '../../application/ports/order-store.js';
import { InvalidOrderError, type NewOrderInput, type OrderStatus } from '../../domain/order.js';
import { InvalidStatusChangeError } from '../../domain/order-status.js';
import { sendProblem } from './problem.js';

/** The request body limit of POST /orders (the contract's 256 KB). */
export const CREATE_ORDER_BODY_LIMIT = 256 * 1024;

/** The contract's StatusChangeRequest, as validated. */
interface StatusChangeBody {
  readonly to: Extract<OrderStatus, 'paid' | 'shipped' | 'cancelled'>;
  readonly reason?: string;
  readonly version: number;
}

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
    'POST /api/v1/orders/{number}/status': async (request, reply) => {
      // number matched against OrderNumber, body against StatusChangeRequest
      const { number } = request.params as { number: string };
      const body = request.body as StatusChangeBody;
      // the session guard ran: a session operation always has its user
      const user = request.staffUser;
      if (!user) throw new Error('POST /orders/{number}/status reached without a session user');
      let result: ChangeOrderStatusResult;
      try {
        result = await changeOrderStatus(deps, {
          number,
          to: body.to,
          reason: body.reason,
          version: body.version,
          changedBy: user.id,
        });
      } catch (error) {
        if (!(error instanceof InvalidStatusChangeError)) throw error;
        return sendProblem(reply, {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          errors: [{ field: error.field, message: error.problem }],
        });
      }
      if (result.kind === 'not-found') {
        return sendProblem(reply, {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: 'No such order.',
        });
      }
      if (result.kind === 'conflict') {
        return sendProblem(reply, {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail:
            result.conflict === 'stale-version'
              ? 'The order changed meanwhile: reload it.'
              : `An order in status ${result.currentStatus} cannot move to ${body.to}.`,
          currentStatus: result.currentStatus,
          currentVersion: result.currentVersion,
        });
      }
      return reply.send(orderResponse(result.order));
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
