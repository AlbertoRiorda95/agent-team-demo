// The order-creation use case with `money` (spec order-intake, Test seams:
// Domain): totals, currency digits, validation with JSON paths, idempotency.
// In-memory store: the SQL is covered by orders.test.ts.
import { toJSON } from '@albertoriorda95/money';
import { describe, expect, it } from 'vitest';
import { createOrder } from '../src/application/create-order.js';
import {
  ExternalReferenceTakenError,
  type OrderStore,
} from '../src/application/ports/order-store.js';
import { draftOrder, formatOrderNumber, InvalidOrderError } from '../src/domain/order.js';
import { memoryOrderStore, validOrder, type OrderPayload } from './order-fixtures.js';

const NOW = new Date('2026-11-05T10:00:00Z');

function errorsOf(payload: OrderPayload): { field: string; message: string }[] {
  try {
    draftOrder(payload);
  } catch (error) {
    if (error instanceof InvalidOrderError) return [...error.errors];
    throw error;
  }
  throw new Error('expected InvalidOrderError');
}

describe('draftOrder: totals', () => {
  it('computes line totals and lines + shipping in EUR', () => {
    const draft = draftOrder(validOrder());
    expect(draft.items.map((l) => toJSON(l.lineTotal).amount)).toEqual(['25.00', '4.95']);
    expect(toJSON(draft.total)).toEqual({ amount: '34.85', currency: 'EUR' });
    expect(draft.total.minor).toBe(3485);
  });

  it.each([
    ['EUR', '0.10', '0.20', '0.30'],
    ['USD', '0.10', '0.20', '0.30'],
    ['GBP', '0.1', '0.2', '0.30'],
    ['JPY', '1', '2', '3'],
  ])('is exact in %s with 0.1 + 0.2-style amounts', (currency, price, shipping, total) => {
    const draft = draftOrder(
      validOrder({
        currency,
        items: [{ sku: 'A', name: 'A', quantity: 1, unitPrice: price }],
        shippingCost: shipping,
      }),
    );
    expect(toJSON(draft.total)).toEqual({ amount: total, currency });
  });

  it('adds many 0.1 prices without float drift', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      sku: `S${String(i)}`,
      name: 'x',
      quantity: 3,
      unitPrice: '0.10',
    }));
    const draft = draftOrder(validOrder({ items, shippingCost: '0.00' }));
    expect(toJSON(draft.total).amount).toBe('3.00');
  });

  it('uses no decimals in JPY', () => {
    const draft = draftOrder(
      validOrder({
        currency: 'JPY',
        items: [{ sku: 'A', name: 'A', quantity: 3, unitPrice: '1250' }],
        shippingCost: '500',
      }),
    );
    expect(toJSON(draft.total)).toEqual({ amount: '4250', currency: 'JPY' });
  });

  it('keeps the order of the lines', () => {
    expect(draftOrder(validOrder()).items.map((l) => l.sku)).toEqual(['MUG-1', 'TEA-1']);
  });
});

describe('draftOrder: validation', () => {
  it('rejects more decimals than the currency allows, on that field', () => {
    expect(errorsOf(validOrder({ shippingCost: '4.905' }))).toEqual([
      { field: 'shippingCost', message: expect.stringContaining('EUR') as unknown },
    ]);
    const jpy = validOrder({
      currency: 'JPY',
      items: [{ sku: 'A', name: 'A', quantity: 1, unitPrice: '10.5' }],
      shippingCost: '0',
    });
    expect(errorsOf(jpy).map((e) => e.field)).toEqual(['items[0].unitPrice']);
  });

  it.each(['-1.00', '1e3', '', 'abc', '1.'])('rejects the price %j', (price) => {
    const payload = validOrder({
      items: [{ sku: 'A', name: 'A', quantity: 1, unitPrice: price }],
    });
    expect(errorsOf(payload).map((e) => e.field)).toEqual(['items[0].unitPrice']);
  });

  it('rejects an unknown currency', () => {
    expect(errorsOf(validOrder({ currency: 'CHF' })).map((e) => e.field)).toEqual(['currency']);
  });

  it.each([0, -1, 1.5, 10_001])('rejects the quantity %d', (quantity) => {
    const payload = validOrder({ items: [{ sku: 'A', name: 'A', quantity, unitPrice: '1.00' }] });
    expect(errorsOf(payload).map((e) => e.field)).toEqual(['items[0].quantity']);
  });

  it('accepts the quantity 10000', () => {
    const payload = validOrder({
      items: [{ sku: 'A', name: 'A', quantity: 10_000, unitPrice: '0.01' }],
      shippingCost: '0.00',
    });
    expect(toJSON(draftOrder(payload).total).amount).toBe('100.00');
  });

  it('rejects empty items and a bad country', () => {
    const payload = validOrder({ items: [] });
    payload.shippingAddress.country = 'it';
    expect(errorsOf(payload).map((e) => e.field)).toEqual(['shippingAddress.country', 'items']);
  });

  it('lists every invalid field, not only the first', () => {
    const payload = validOrder({
      items: [
        { sku: 'A', name: 'A', quantity: 0, unitPrice: '1.00' },
        { sku: 'B', name: 'B', quantity: 1, unitPrice: '1.001' },
      ],
      shippingCost: 'x',
    });
    expect(errorsOf(payload).map((e) => e.field)).toEqual([
      'items[0].quantity',
      'items[1].unitPrice',
      'shippingCost',
    ]);
  });

  it('rejects a line total beyond the safe integer range', () => {
    const payload = validOrder({
      items: [{ sku: 'A', name: 'A', quantity: 10_000, unitPrice: '9007199254740.99' }],
    });
    expect(errorsOf(payload).map((e) => e.field)).toEqual(['items[0].unitPrice']);
  });
});

describe('formatOrderNumber', () => {
  it('pads to 6 digits and grows past 999999', () => {
    expect(formatOrderNumber(1)).toBe('ORD-000001');
    expect(formatOrderNumber(999_999)).toBe('ORD-999999');
    expect(formatOrderNumber(1_234_567)).toBe('ORD-1234567');
  });

  it('refuses a non-positive value', () => {
    expect(() => formatOrderNumber(0)).toThrow(RangeError);
  });
});

describe('createOrder', () => {
  it('creates an order in status new, version 1, with a number', async () => {
    const store = memoryOrderStore();
    const result = await createOrder({ store, clock: () => NOW }, validOrder());
    expect(result.kind).toBe('created');
    expect(result.order).toMatchObject({
      number: 'ORD-000001',
      status: 'new',
      version: 1,
      history: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('returns the existing order for the same reference, whatever the body says', async () => {
    const store = memoryOrderStore();
    const deps = { store, clock: () => NOW };
    const first = await createOrder(deps, validOrder({ externalReference: 'ref-1' }));
    const again = await createOrder(
      deps,
      validOrder({ externalReference: 'ref-1', shippingCost: '99.00' }),
    );
    expect(again).toEqual({ kind: 'existing', order: first.order });
    expect(store.orders).toHaveLength(1);
  });

  it('returns the winner when the unique index refuses the insert (race)', async () => {
    const memory = memoryOrderStore();
    const winner = (await createOrder({ store: memory, clock: () => NOW }, validOrder())).order;
    let lookups = 0;
    // the first lookup misses (the winner was not committed yet), the insert loses
    const racing: OrderStore = {
      findByExternalReference: () => {
        lookups += 1;
        return Promise.resolve(lookups === 1 ? undefined : winner);
      },
      insert: () => Promise.reject(new ExternalReferenceTakenError()),
      findByNumber: (number) => memory.findByNumber(number),
      list: (query) => memory.list(query),
      changeStatus: (change) => memory.changeStatus(change),
    };
    const result = await createOrder(
      { store: racing, clock: () => NOW },
      validOrder({ externalReference: winner.externalReference }),
    );
    expect(result).toEqual({ kind: 'existing', order: winner });
  });

  it('writes nothing for an invalid order', async () => {
    const store = memoryOrderStore();
    await expect(
      createOrder({ store, clock: () => NOW }, validOrder({ shippingCost: '-1' })),
    ).rejects.toBeInstanceOf(InvalidOrderError);
    expect(store.orders).toHaveLength(0);
  });
});
