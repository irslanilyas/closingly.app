import { describe, it, expect } from "vitest";
import { clampScore, parseAmount } from "@/lib/pipeline/from-transcript";

describe("clampScore", () => {
  it("clamps within the 1–10 check constraint the deals table enforces", () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(11)).toBe(10);
    expect(clampScore(7)).toBe(7);
  });

  it("rounds a fractional score", () => {
    expect(clampScore(7.6)).toBe(8);
  });

  it("returns null rather than a value that would fail the insert", () => {
    expect(clampScore("high")).toBeNull();
    expect(clampScore(NaN)).toBeNull();
    expect(clampScore(undefined)).toBeNull();
    expect(clampScore(null)).toBeNull();
  });
});

describe("parseAmount", () => {
  it("parses a plain number string", () => {
    expect(parseAmount("12000")).toBe(12000);
  });

  it("strips thousands separators", () => {
    expect(parseAmount("PKR 450,000")).toBe(450000);
  });

  it("expands a k/m suffix", () => {
    expect(parseAmount("$12k")).toBe(12000);
    expect(parseAmount("1.5m")).toBe(1_500_000);
  });

  it("is case-insensitive on the suffix", () => {
    expect(parseAmount("6.8K")).toBe(6800);
  });

  it("returns null for text with no extractable number", () => {
    expect(parseAmount("Not mentioned")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });

  it("returns null for non-string input rather than throwing", () => {
    expect(parseAmount(450000)).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});
