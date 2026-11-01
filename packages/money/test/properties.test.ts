import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  currencies,
  fromJSON,
  fromMinor,
  multiplyBy,
  parse,
  subtract,
  sum,
  toDecimalString,
  toJSON,
  type CurrencyCode,
} from "../src/index.js";

const MAX = Number.MAX_SAFE_INTEGER;
const currency = fc.constantFrom(
  ...(Object.keys(currencies) as CurrencyCode[]),
);
const minor = fc.integer({ min: -MAX, max: MAX });
const money = fc
  .tuple(minor, currency)
  .map(([m, c]) => fromMinor(m, c));

describe("properties", () => {
  it("parse(toDecimalString(m)) equals m", () => {
    fc.assert(
      fc.property(money, (m) => {
        expect(parse(toDecimalString(m), m.currency)).toEqual(m);
      }),
    );
  });

  it("fromJSON(toJSON(m)) equals m, also through JSON text", () => {
    fc.assert(
      fc.property(money, (m) => {
        expect(fromJSON(toJSON(m))).toEqual(m);
        expect(fromJSON(JSON.parse(JSON.stringify(toJSON(m))))).toEqual(m);
      }),
    );
  });

  it("subtract(add(a, b), b) equals a", () => {
    const half = fc.integer({ min: -Math.floor(MAX / 2), max: Math.floor(MAX / 2) });
    fc.assert(
      fc.property(half, half, currency, (a, b, c) => {
        const x = fromMinor(a, c);
        const y = fromMinor(b, c);
        expect(subtract(add(x, y), y)).toEqual(x);
      }),
    );
  });

  it("the parts of allocate add up to the amount", () => {
    const ratios = fc
      .array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 20 })
      .filter((r) => r.some((x) => x > 0));
    fc.assert(
      fc.property(money, ratios, (m, r) => {
        const parts = allocate(m, r);
        expect(parts).toHaveLength(r.length);
        expect(sum(parts)).toEqual(m);
        r.forEach((ratio, i) => {
          if (ratio === 0) expect(parts[i]?.minor).toBe(0);
        });
      }),
    );
  });

  it("the parts of allocate with decimal ratios add up to the amount", () => {
    const ratios = fc
      .array(fc.double({ min: 0, max: 100, noNaN: true }), {
        minLength: 1,
        maxLength: 10,
      })
      .filter((r) => r.some((x) => x > 0));
    fc.assert(
      fc.property(money, ratios, (m, r) => {
        expect(sum(allocate(m, r))).toEqual(m);
      }),
    );
  });

  it("multiplyBy rounds negative amounts symmetrically", () => {
    const factor = fc
      .tuple(fc.integer({ min: 0, max: 10000 }), fc.integer({ min: 0, max: 4 }))
      .map(([u, s]) => (u / 10 ** s).toFixed(s));
    const small = fc.integer({ min: 0, max: 1e9 });
    const mode = fc.constantFrom("half-up" as const, "half-even" as const);
    fc.assert(
      fc.property(small, currency, factor, mode, (a, c, f, md) => {
        const positive = multiplyBy(fromMinor(a, c), f, md);
        const negative = multiplyBy(fromMinor(-a, c), f, md);
        expect(negative.minor).toBe(-positive.minor || 0);
      }),
    );
  });
});
