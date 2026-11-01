import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  compare,
  currencies,
  CurrencyMismatchError,
  equals,
  format,
  fromJSON,
  fromMinor,
  InvalidAmountError,
  isCurrencyCode,
  isNegative,
  isZero,
  MoneyError,
  multiply,
  multiplyBy,
  parse,
  subtract,
  sum,
  toDecimalString,
  toJSON,
  UnknownCurrencyError,
  type CurrencyCode,
  type Money,
  type RoundingMode,
} from "../src/index.js";

const MAX = Number.MAX_SAFE_INTEGER;
const eur = (d: string): Money => parse(d, "EUR");
const minors = (list: Money[]): number[] => list.map((m) => m.minor);

describe("currencies", () => {
  it("knows EUR, USD, GBP with 2 digits and JPY with 0", () => {
    expect(currencies).toEqual({
      EUR: { code: "EUR", minorDigits: 2 },
      USD: { code: "USD", minorDigits: 2 },
      GBP: { code: "GBP", minorDigits: 2 },
      JPY: { code: "JPY", minorDigits: 0 },
    });
    expect(Object.isFrozen(currencies)).toBe(true);
    expect(Object.isFrozen(currencies.EUR)).toBe(true);
  });

  it.each([
    ["EUR", true],
    ["JPY", true],
    ["XXX", false],
    ["eur", false],
    ["toString", false],
    [1, false],
    [null, false],
  ])("isCurrencyCode(%j) is %s", (x, expected) => {
    expect(isCurrencyCode(x)).toBe(expected);
  });
});

describe("parse", () => {
  it.each([
    ["12.50", "EUR", 1250],
    ["12.5", "EUR", 1250],
    ["12", "USD", 1200],
    ["-0.05", "GBP", -5],
    ["0", "EUR", 0],
    ["-0", "EUR", 0],
    ["1250", "JPY", 1250],
    ["-7", "JPY", -7],
    ["90071992547409.91", "EUR", MAX],
  ] as const)("parse(%j, %s) has minor %d", (text, currency, minor) => {
    const m = parse(text, currency);
    expect(m).toEqual({ minor, currency });
    expect(Object.is(m.minor, -0)).toBe(false);
    expect(Object.isFrozen(m)).toBe(true);
  });

  it.each([
    ["12.505", "EUR"],
    ["12.500", "EUR"],
    ["10.5", "JPY"],
    ["1e3", "EUR"],
    ["", "EUR"],
    [" 1", "EUR"],
    ["+1", "EUR"],
    ["1.", "EUR"],
    [".5", "EUR"],
    ["1,50", "EUR"],
    ["NaN", "EUR"],
    ["Infinity", "EUR"],
    ["90071992547409.92", "EUR"],
  ] as const)("parse(%j, %s) throws InvalidAmountError", (text, currency) => {
    expect(() => parse(text, currency)).toThrow(InvalidAmountError);
  });

  it("accepts leading zeros, as the contract's pattern does", () => {
    expect(parse("0000000000000000000012.50", "EUR").minor).toBe(1250);
  });

  it("rejects a huge untrusted string quickly, without echoing it", () => {
    const huge = "9".repeat(1_000_000);
    const start = performance.now();
    expect(() => parse(huge, "EUR")).toThrow(InvalidAmountError);
    expect(() => parse(`1.${huge}`, "EUR")).toThrow(InvalidAmountError);
    expect(performance.now() - start).toBeLessThan(500);
    expect(() => parse("1\nforged log line", "EUR")).toThrow(
      /^EUR amount is not a decimal string$/,
    );
    expect(() => fromJSON({ amount: "1", currency: "X\nforged" })).toThrow(
      'Unknown currency: "X\\nforged"',
    );
  });

  it("rejects a non-string amount", () => {
    expect(() => parse(12 as unknown as string, "EUR")).toThrow(
      InvalidAmountError,
    );
  });

  it("throws UnknownCurrencyError for an unknown currency", () => {
    expect(() => parse("1", "XXX" as CurrencyCode)).toThrow(
      UnknownCurrencyError,
    );
  });
});

describe("toDecimalString and fromMinor", () => {
  it.each([
    [1250, "EUR", "12.50"],
    [-5, "EUR", "-0.05"],
    [0, "USD", "0.00"],
    [7, "GBP", "0.07"],
    [1250, "JPY", "1250"],
    [-1250, "JPY", "-1250"],
    [MAX, "EUR", "90071992547409.91"],
    [-MAX, "JPY", "-9007199254740991"],
  ] as const)("fromMinor(%d, %s) is %j", (minor, currency, text) => {
    expect(toDecimalString(fromMinor(minor, currency))).toBe(text);
  });

  it.each([1.5, NaN, Infinity, MAX + 1, -MAX - 1])(
    "fromMinor(%d) throws InvalidAmountError",
    (minor) => {
      expect(() => fromMinor(minor, "EUR")).toThrow(InvalidAmountError);
    },
  );

  it("fromMinor rejects an unknown currency", () => {
    expect(() => fromMinor(1, "XXX" as CurrencyCode)).toThrow(
      UnknownCurrencyError,
    );
  });

  it("rejects a hand-made value that is not a valid Money", () => {
    const bad = { minor: 0.5, currency: "EUR" } as Money;
    expect(() => toDecimalString(bad)).toThrow(InvalidAmountError);
    expect(() => add(bad, eur("1"))).toThrow(InvalidAmountError);
    expect(() => isZero(null as unknown as Money)).toThrow(InvalidAmountError);
  });
});

describe("add, subtract, multiply, sum", () => {
  it("are exact", () => {
    expect(add(eur("0.10"), eur("0.20"))).toEqual(eur("0.30"));
    expect(subtract(eur("1.00"), eur("1.05"))).toEqual(eur("-0.05"));
    expect(multiply(eur("19.99"), 3)).toEqual(eur("59.97"));
    expect(multiply(eur("19.99"), 0)).toEqual(eur("0"));
    expect(multiply(eur("-1.50"), -2)).toEqual(eur("3"));
    expect(sum([eur("12.50"), eur("0.01"), eur("4.99")])).toEqual(eur("17.50"));
    expect(sum([eur("1")])).toEqual(eur("1"));
  });

  it("throw CurrencyMismatchError with two currencies", () => {
    const usd = parse("1", "USD");
    expect(() => add(eur("1"), usd)).toThrow(CurrencyMismatchError);
    expect(() => subtract(eur("1"), usd)).toThrow(CurrencyMismatchError);
    expect(() => sum([eur("1"), eur("2"), usd])).toThrow(CurrencyMismatchError);
    expect(() => compare(eur("1"), usd)).toThrow(CurrencyMismatchError);
  });

  it("sum([]) throws InvalidAmountError", () => {
    expect(() => sum([])).toThrow(InvalidAmountError);
  });

  it("multiply needs a safe integer", () => {
    expect(() => multiply(eur("1"), 1.5)).toThrow(InvalidAmountError);
    expect(() => multiply(eur("1"), NaN)).toThrow(InvalidAmountError);
  });

  it("throw InvalidAmountError beyond the safe integer range", () => {
    const max = fromMinor(MAX, "EUR");
    const min = fromMinor(-MAX, "EUR");
    const cent = fromMinor(1, "EUR");
    expect(() => add(max, cent)).toThrow(InvalidAmountError);
    expect(() => subtract(min, cent)).toThrow(InvalidAmountError);
    expect(() => multiply(max, 2)).toThrow(InvalidAmountError);
    expect(() => sum([max, cent])).toThrow(InvalidAmountError);
    expect(() => multiplyBy(max, "1.5")).toThrow(InvalidAmountError);
    expect(add(max, fromMinor(-1, "EUR")).minor).toBe(MAX - 1);
  });
});

describe("multiplyBy", () => {
  it.each([
    ["0.05", "0.5", "half-up", "0.03"],
    ["0.05", "0.5", "half-even", "0.02"],
    ["1.25", "0.1", "half-up", "0.13"],
    ["1.25", "0.1", "half-even", "0.12"],
    ["-0.05", "0.5", "half-up", "-0.03"],
    ["-0.05", "0.5", "half-even", "-0.02"],
    ["-1.25", "0.1", "half-up", "-0.13"],
    ["-1.25", "0.1", "half-even", "-0.12"],
    ["0.15", "0.5", "half-even", "0.08"],
    ["0.07", "0.5", "half-even", "0.04"],
    ["10.00", "0.15", "half-up", "1.50"],
    ["10.01", "0.333", "half-up", "3.33"],
    ["10.00", "-0.15", "half-up", "-1.50"],
    ["1.00", "2", "half-up", "2.00"],
  ] as const)(
    "multiplyBy(%s EUR, %j, %s) is %s",
    (amount, factor, mode, expected) => {
      expect(multiplyBy(eur(amount), factor, mode)).toEqual(
        eur(expected),
      );
    },
  );

  it("rounds JPY to whole yen", () => {
    expect(multiplyBy(parse("125", "JPY"), "0.1")).toEqual(parse("13", "JPY"));
    expect(multiplyBy(parse("125", "JPY"), "0.1", "half-even")).toEqual(
      parse("12", "JPY"),
    );
  });

  it("defaults to half-up", () => {
    expect(multiplyBy(eur("0.05"), "0.5")).toEqual(eur("0.03"));
  });

  it.each(["", "1e2", "0,5", "abc", ".5", "NaN"])(
    "rejects the factor %j with InvalidAmountError",
    (factor) => {
      expect(() => multiplyBy(eur("1"), factor)).toThrow(InvalidAmountError);
    },
  );

  it("rejects an unknown rounding mode", () => {
    expect(() =>
      multiplyBy(eur("1"), "0.5", "down" as RoundingMode),
    ).toThrow(MoneyError);
  });
});

describe("allocate", () => {
  it.each([
    ["10.00", [1, 1, 1], ["3.34", "3.33", "3.33"]],
    ["0.05", [1, 1], ["0.03", "0.02"]],
    ["0.02", [1, 1, 1], ["0.01", "0.01", "0.00"]],
    ["100.00", [70, 30], ["70.00", "30.00"]],
    ["100.00", [0.7, 0.3], ["70.00", "30.00"]],
    ["1.00", [1, 0, 1], ["0.50", "0.00", "0.50"]],
    ["0.01", [0, 1], ["0.00", "0.01"]],
    ["-10.00", [1, 1, 1], ["-3.34", "-3.33", "-3.33"]],
    ["5.00", [1], ["5.00"]],
    ["0", [1, 2], ["0.00", "0.00"]],
    ["1.00", [1e-7, 1e-7], ["0.50", "0.50"]],
  ] as const)("allocate(%s EUR, %j) is %j", (amount, ratios, expected) => {
    expect(allocate(eur(amount), ratios)).toEqual(expected.map(eur));
  });

  it("gives the leftover cents to the largest remainders", () => {
    // 1.00 * [1, 2, 2] / 5 = 0.20, 0.40, 0.40: exact.
    expect(minors(allocate(eur("1.00"), [1, 2, 2]))).toEqual([20, 40, 40]);
    // 0.10 * [1, 3] / 4 = 2.5, 7.5 cents: tie, the earlier part wins.
    expect(minors(allocate(eur("0.10"), [1, 3]))).toEqual([3, 7]);
    // 0.10 * [3, 4] / 7 = 4.28, 5.71 cents: the larger remainder wins.
    expect(minors(allocate(eur("0.10"), [3, 4]))).toEqual([4, 6]);
  });

  it.each([
    [[]],
    [[-1, 2]],
    [[0, 0]],
    [[NaN]],
    [[Infinity, 1]],
  ])("rejects the ratios %j with InvalidAmountError", (ratios) => {
    expect(() => allocate(eur("1"), ratios)).toThrow(InvalidAmountError);
  });
});

describe("equals, compare, isZero, isNegative", () => {
  it("compare", () => {
    expect(compare(eur("1"), eur("2"))).toBe(-1);
    expect(compare(eur("2"), eur("2.00"))).toBe(0);
    expect(compare(eur("2"), eur("-2"))).toBe(1);
  });

  it("equals", () => {
    expect(equals(eur("1.5"), eur("1.50"))).toBe(true);
    expect(equals(eur("1"), eur("2"))).toBe(false);
    expect(equals(parse("1", "EUR"), parse("1", "USD"))).toBe(false);
  });

  it("isZero and isNegative", () => {
    expect(isZero(eur("0"))).toBe(true);
    expect(isZero(eur("-0"))).toBe(true);
    expect(isZero(eur("0.01"))).toBe(false);
    expect(isNegative(eur("-0.01"))).toBe(true);
    expect(isNegative(eur("0"))).toBe(false);
  });
});

describe("format", () => {
  // Node 24's Intl puts a non-breaking space (U+00A0) before € and after EUR.
  const NBSP = " ";

  it.each([
    [eur("1234.50"), "en-US", {}, "€1,234.50"],
    [eur("1234.50"), "de-DE", {}, `1.234,50${NBSP}€`],
    [parse("1250", "JPY"), "ja-JP", {}, "￥1,250"],
    [eur("1234.50"), "en-US", { currencyDisplay: "code" }, `EUR${NBSP}1,234.50`],
    [eur("12.5"), "en-US", {}, "€12.50"],
    [eur("-0.05"), "en-US", {}, "-€0.05"],
    [parse("9.99", "USD"), "en-US", {}, "$9.99"],
    [parse("9.99", "GBP"), "en-GB", {}, "£9.99"],
    [fromMinor(MAX, "EUR"), "en-US", {}, "€90,071,992,547,409.91"],
  ] as const)("format(%j, %s, %j) is %j", (m, locale, options, expected) => {
    expect(format(m, locale, options)).toBe(expected);
  });
});

describe("toJSON and fromJSON", () => {
  const schema = (
    readFileSync(
      new URL("../../../services/orders/openapi.yaml", import.meta.url),
      "utf8",
    )
  );
  const pattern = /Amount:[\s\S]*?pattern: '([^']+)'/.exec(schema)?.[1];

  it("toJSON gives the contract's Amount", () => {
    expect(toJSON(eur("12.5"))).toEqual({ amount: "12.50", currency: "EUR" });
    expect(toJSON(parse("1250", "JPY"))).toEqual({
      amount: "1250",
      currency: "JPY",
    });
    expect(JSON.stringify(toJSON(eur("-0.05")))).toBe(
      '{"amount":"-0.05","currency":"EUR"}',
    );
  });

  it("matches the Amount pattern of services/orders/openapi.yaml", () => {
    expect(pattern).toBe("^-?\\d+(\\.\\d+)?$");
    const regex = new RegExp(pattern ?? "");
    for (const m of [eur("12.50"), eur("-0.05"), parse("1250", "JPY")]) {
      expect(toJSON(m).amount).toMatch(regex);
    }
  });

  it("fromJSON reads it back", () => {
    expect(fromJSON({ amount: "12.50", currency: "EUR" })).toEqual(eur("12.50"));
    expect(fromJSON(JSON.parse('{"currency":"JPY","amount":"1250"}'))).toEqual(
      parse("1250", "JPY"),
    );
  });

  it.each([
    [null, InvalidAmountError],
    ["12.50", InvalidAmountError],
    [[], InvalidAmountError],
    [{ amount: "12.50" }, InvalidAmountError],
    [{ amount: 12.5, currency: "EUR" }, InvalidAmountError],
    [{ amount: "12.505", currency: "EUR" }, InvalidAmountError],
    [{ amount: "1", currency: "EUR", extra: 1 }, InvalidAmountError],
    [{ amount: "1", currency: "XXX" }, UnknownCurrencyError],
  ])("fromJSON(%j) throws", (value, error) => {
    expect(() => fromJSON(value)).toThrow(error);
  });
});

describe("errors", () => {
  it("are MoneyError subclasses with their own name", () => {
    for (const E of [
      UnknownCurrencyError,
      InvalidAmountError,
      CurrencyMismatchError,
    ]) {
      const error = new E("x");
      expect(error).toBeInstanceOf(MoneyError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(E.name);
    }
  });
});
