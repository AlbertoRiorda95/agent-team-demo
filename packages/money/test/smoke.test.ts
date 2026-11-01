import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as money from "../src/index.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

describe("@albertoriorda95/money public entry", () => {
  it("exports VERSION matching package.json", () => {
    expect(money.VERSION).toBe(pkg.version);
  });

  it("exports only VERSION for now", () => {
    expect(Object.keys(money)).toEqual(["VERSION"]);
  });
});
