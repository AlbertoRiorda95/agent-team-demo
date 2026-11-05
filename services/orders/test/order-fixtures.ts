// Shared by the order-intake tests: a valid CreateOrderRequest, the test API
// key and an in-memory OrderStore (for the tests that do not need Postgres;
// orders.test.ts runs the Drizzle store on the test database).
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp, type OrderIntakeOptions } from '../src/adapters/http/app.js';
import { fakeAuth, WEB } from './fake-auth.js';
import {
  ExternalReferenceTakenError,
  type OrderRecord,
  type OrderStore,
} from '../src/application/ports/order-store.js';

/** 40 characters, like a real key; never a real one. */
export const TEST_API_KEY = 'test-order-api-key-0123456789-abcdefghij';
export const ORDERS_URL = '/api/v1/orders';
export const API_KEY_HEADERS = { authorization: `Bearer ${TEST_API_KEY}` };

/** The app with order intake; every log line (trace level) goes to `logLines`. */
export function makeOrderApp(
  orderOptions: OrderIntakeOptions | undefined,
  logLines: string[] = [],
): FastifyInstance {
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logLines.push(chunk.toString());
      callback();
    },
  });
  return buildApp({
    databaseHealth: { isReachable: () => Promise.resolve(true) },
    auth: fakeAuth(),
    web: WEB,
    ...(orderOptions ? { orders: orderOptions } : {}),
    // the most verbose level: nothing personal may appear even there
    logger: { level: 'trace', stream },
  });
}

export function postOrder(
  app: FastifyInstance,
  payload: object | string,
  headers: Record<string, string> = API_KEY_HEADERS,
): Promise<LightMyRequestResponse> {
  const options: InjectOptions = { method: 'POST', url: ORDERS_URL, headers, payload };
  return app.inject(options);
}

export interface OrderPayload {
  externalReference: string;
  currency: string;
  customer: { name: string; email: string };
  shippingAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    country: string;
  };
  items: { sku: string; name: string; quantity: number; unitPrice: string }[];
  shippingCost: string;
}

export function validOrder(overrides: Partial<OrderPayload> = {}): OrderPayload {
  return {
    externalReference: `shop-${randomUUID()}`,
    currency: 'EUR',
    customer: { name: 'Ada Lovelace', email: 'ada@example.com' },
    shippingAddress: {
      name: 'Ada Lovelace',
      line1: '1 Main St',
      city: 'Turin',
      postalCode: '10100',
      country: 'IT',
    },
    items: [
      { sku: 'MUG-1', name: 'Mug', quantity: 2, unitPrice: '12.50' },
      { sku: 'TEA-1', name: 'Tea', quantity: 1, unitPrice: '4.95' },
    ],
    shippingCost: '4.90',
    ...overrides,
  };
}

export interface MemoryOrderStore extends OrderStore {
  readonly orders: OrderRecord[];
}

/** An OrderStore in memory, with the same unique rule on externalReference. */
export function memoryOrderStore(): MemoryOrderStore {
  const orders: OrderRecord[] = [];
  let sequence = 0;
  return {
    orders,
    findByExternalReference: (ref) =>
      Promise.resolve(orders.find((o) => o.externalReference === ref)),
    insert: (draft, { now, numberFor }) => {
      sequence += 1;
      if (orders.some((o) => o.externalReference === draft.externalReference)) {
        return Promise.reject(new ExternalReferenceTakenError());
      }
      const order: OrderRecord = {
        ...draft,
        id: randomUUID(),
        number: numberFor(sequence),
        status: 'new',
        version: 1,
        history: [],
        createdAt: now,
        updatedAt: now,
      };
      orders.push(order);
      return Promise.resolve(order);
    },
  };
}
