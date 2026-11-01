import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as money from "../src/index.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string; dependencies?: Record<string, string> };

describe("@albertoriorda95/money public entry", () => {
  it("exports VERSION matching package.json", () => {
    expect(money.VERSION).toBe(pkg.version);
    expect(pkg.version).toBe("0.1.0");
  });

  it("exports exactly the public API of the spec", () => {
    expect(Object.keys(money).sort()).toEqual(
      [
        "VERSION",
        "MoneyError",
        "UnknownCurrencyError",
        "InvalidAmountError",
        "CurrencyMismatchError",
        "currencies",
        "isCurrencyCode",
        "fromMinor",
        "parse",
        "toDecimalString",
        "add",
        "subtract",
        "multiply",
        "sum",
        "multiplyBy",
        "allocate",
        "equals",
        "compare",
        "isZero",
        "isNegative",
        "format",
        "toJSON",
        "fromJSON",
      ].sort(),
    );
  });

  it("has no runtime dependencies", () => {
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
