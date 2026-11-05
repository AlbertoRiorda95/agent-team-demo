// Demo orders for a development database (order-intake, flow 4): a small
// deterministic generator, no faker. Order `i` is always the same order
// (`seed-0001`, `seed-0002`...); only its timestamps follow `now`.
// Every name, email and address here is made up (example.test / reserved
// formats), never real personal data.
import { fromMinor, toDecimalString, type CurrencyCode } from '@albertoriorda95/money';
import type { NewOrderInput, OrderStatus } from '../domain/order.js';
import type { StatusStep } from '../domain/order-status.js';

export const DEFAULT_SEED_COUNT = 40;
/** `seed-` + 4 digits: the references stay `seed-0001`…`seed-9999`. */
export const MAX_SEED_COUNT = 9999;

export interface SeedStatusChange extends StatusStep {
  readonly reason?: string;
  readonly at: Date;
}

/** One demo order: what the order source would send, plus its status history. */
export interface SeedOrder {
  readonly input: NewOrderInput;
  readonly createdAt: Date;
  /** Oldest first; empty for an order that stays `new`. */
  readonly history: readonly SeedStatusChange[];
}

export function seedReference(index: number): string {
  return `seed-${String(index + 1).padStart(4, '0')}`;
}

const CURRENCIES: readonly CurrencyCode[] = ['EUR', 'USD', 'GBP', 'JPY'];

/** Prices in minor units per currency (JPY has no minor digits). */
const CATALOG: readonly {
  readonly sku: string;
  readonly name: string;
  readonly price: Readonly<Record<CurrencyCode, number>>;
}[] = [
  { sku: 'MUG-001', name: 'Ceramic mug', price: { EUR: 1250, USD: 1399, GBP: 1100, JPY: 1800 } },
  { sku: 'TEE-002', name: 'Cotton T-shirt', price: { EUR: 2490, USD: 2700, GBP: 2200, JPY: 3500 } },
  { sku: 'PEN-003', name: 'Ballpoint pen', price: { EUR: 10, USD: 20, GBP: 10, JPY: 100 } },
  { sku: 'NTB-004', name: 'Dotted notebook', price: { EUR: 890, USD: 999, GBP: 799, JPY: 1200 } },
  {
    sku: 'BAG-005',
    name: 'Canvas tote bag',
    price: { EUR: 1990, USD: 2199, GBP: 1750, JPY: 2800 },
  },
  { sku: 'STK-006', name: 'Sticker pack', price: { EUR: 20, USD: 30, GBP: 20, JPY: 150 } },
  { sku: 'LMP-007', name: 'Desk lamp', price: { EUR: 4999, USD: 5499, GBP: 4499, JPY: 7200 } },
];

const SHIPPING: Readonly<Record<CurrencyCode, number>> = { EUR: 490, USD: 599, GBP: 395, JPY: 800 };

const FIRST_NAMES = ['Ada', 'Bruno', 'Chiara', 'Dev', 'Elena', 'Femi', 'Greta', 'Hiro', 'Ines'];
const LAST_NAMES = ['Rossi', 'Smith', 'Tanaka', 'Müller', 'Okafor', 'Dubois', 'Jones', 'Costa'];

const PLACES: Readonly<
  Record<CurrencyCode, readonly { city: string; postalCode: string; country: string }[]>
> = {
  EUR: [
    { city: 'Milano', postalCode: '20121', country: 'IT' },
    { city: 'Berlin', postalCode: '10115', country: 'DE' },
    { city: 'Lyon', postalCode: '69001', country: 'FR' },
  ],
  USD: [{ city: 'Springfield', postalCode: '62701', country: 'US' }],
  GBP: [{ city: 'Leeds', postalCode: 'LS1 1AA', country: 'GB' }],
  JPY: [{ city: 'Osaka', postalCode: '530-0001', country: 'JP' }],
};

/** The status each order ends in, as a chain of changes from `new`. */
const CHAINS: readonly (readonly OrderStatus[])[] = [
  [],
  ['paid'],
  ['paid', 'shipped'],
  [],
  ['cancelled'],
  ['paid'],
  ['paid', 'shipped'],
  [],
  ['paid', 'cancelled'],
  ['paid', 'shipped'],
];

const CANCEL_REASONS = ['Customer asked to cancel', 'Out of stock', 'Duplicate order'];

const HOUR_MS = 3_600_000;
/** Orders are created this far apart, the newest one this long before `now`. */
const ORDER_SPACING_MS = 7 * HOUR_MS;
const STATUS_STEP_MS = 5 * HOUR_MS;

/** The demo order number `index` (from 0) of a seed of `count` orders. */
export function seedOrder(index: number, count: number, now: Date): SeedOrder {
  const currency = CURRENCIES[index % CURRENCIES.length] ?? 'EUR';
  const first = pick(FIRST_NAMES, index);
  const last = pick(LAST_NAMES, index * 5 + 3);
  const place = pick(PLACES[currency], index);

  const lineCount = 1 + ((index * 3) % 4);
  const items = Array.from({ length: lineCount }, (_, line) => {
    const product = pick(CATALOG, index + line * 2);
    return {
      sku: product.sku,
      name: product.name,
      quantity: 1 + ((index + line) % 3),
      unitPrice: amount(product.price[currency], currency),
    };
  });
  const shippingMinor = index % 5 === 4 ? 0 : SHIPPING[currency];

  const createdAt = new Date(
    now.getTime() - (count - index) * ORDER_SPACING_MS - (index % 6) * 13 * 60_000,
  );

  const chain = pick(CHAINS, index * 7);
  // the history fits between the creation and `now`
  const step = Math.min(STATUS_STEP_MS, (now.getTime() - createdAt.getTime()) / (chain.length + 1));
  let from: OrderStatus = 'new';
  const history = chain.map((to, k): SeedStatusChange => {
    const change: SeedStatusChange = {
      from,
      to,
      at: new Date(createdAt.getTime() + Math.round((k + 1) * step)),
      ...(to === 'cancelled' ? { reason: pick(CANCEL_REASONS, index) } : {}),
    };
    from = to;
    return change;
  });

  return {
    input: {
      externalReference: seedReference(index),
      currency,
      customer: {
        name: `${first} ${last}`,
        email: `${ascii(first)}.${ascii(last)}.${String(index + 1)}@example.test`,
      },
      shippingAddress: {
        name: `${first} ${last}`,
        line1: `${String(1 + ((index * 17) % 180))} Demo Street`,
        ...(index % 3 === 0 ? { line2: `Flat ${String(1 + (index % 9))}` } : {}),
        city: place.city,
        postalCode: place.postalCode,
        country: place.country,
      },
      items,
      shippingCost: amount(shippingMinor, currency),
    },
    createdAt,
    history,
  };
}

/** The `count` demo orders, oldest first. */
export function seedOrders(count: number, now: Date): SeedOrder[] {
  return Array.from({ length: count }, (_, index) => seedOrder(index, count, now));
}

function amount(minor: number, currency: CurrencyCode): string {
  return toDecimalString(fromMinor(minor, currency));
}

function pick<T>(values: readonly T[], index: number): T {
  const value = values[index % values.length];
  if (value === undefined) throw new RangeError('pick from an empty list');
  return value;
}

function ascii(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();
}
