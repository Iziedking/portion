import { describe, expect, it } from "vitest";
import { allocate, parseAmount, splitEqually, toAmount } from "@/lib/money";
import { divide } from "@/lib/plan";
import { pot } from "./helpers";

describe("cents", () => {
  it("splits 100.00 between 7 as four of 14.29 and three of 14.28", () => {
    const parts = splitEqually(10_000, 7);
    expect(parts.map(toAmount)).toEqual(["14.29", "14.29", "14.29", "14.29", "14.28", "14.28", "14.28"]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it("every division adds up to the payment", () => {
    const weights = [3333, 3333, 3334];
    for (let total = 1; total < 5_000; total += 37) {
      expect(allocate(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
    for (const total of [1, 99, 101, 12_345, 99_999_999]) {
      const result = divide(total, [pot("A", 3333), pot("B", 3333), pot("C", 3334)]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parts.reduce((s, p) => s + p.cents, 0)).toBe(total);
    }
  });

  it("takes fixed amounts first and splits the rest by percent", () => {
    const result = divide(100_000, [
      { ...pot("Sister", 0), shareKind: "fixed", shareBps: 0, fixedCents: 5_000 },
      pot("Tax", 3000),
      pot("Rest", 7000),
    ]);
    expect(result).toEqual({ ok: true, parts: [{ index: 0, cents: 5_000 }, { index: 1, cents: 28_500 }, { index: 2, cents: 66_500 }] });
  });

  it("refuses when fixed amounts are more than the payment", () => {
    const result = divide(1_000, [{ ...pot("Rent", 0), shareKind: "fixed", fixedCents: 2_000 }, pot("Rest", 10_000)]);
    expect(result.ok).toBe(false);
  });

  it("parses and prints amounts without floating point", () => {
    expect(parseAmount("0.1")).toBe(10);
    expect(parseAmount("1200")).toBe(120_000);
    expect(parseAmount("19.99")).toBe(1_999);
    expect(() => parseAmount("1.999")).toThrow();
    expect(() => parseAmount("-5")).toThrow();
    expect(toAmount(5)).toBe("0.05");
  });
});
