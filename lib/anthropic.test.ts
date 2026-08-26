import { describe, it, expect } from "vitest";
import { parseJsonResponse } from "@/lib/anthropic";

interface Sample {
  a: number;
  b: string;
}

describe("parseJsonResponse", () => {
  it("parses clean JSON", () => {
    expect(parseJsonResponse<Sample>('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("strips a markdown fence the model added despite being told not to", () => {
    const raw = '```json\n{"a":1,"b":"x"}\n```';
    expect(parseJsonResponse<Sample>(raw)).toEqual({ a: 1, b: "x" });
  });

  it("strips a fence with no language tag", () => {
    const raw = '```\n{"a":1,"b":"x"}\n```';
    expect(parseJsonResponse<Sample>(raw)).toEqual({ a: 1, b: "x" });
  });

  it("falls back to the outermost braces when there's stray prose around the object", () => {
    const raw = 'Sure, here you go:\n{"a":1,"b":"x"}\nHope that helps!';
    expect(parseJsonResponse<Sample>(raw)).toEqual({ a: 1, b: "x" });
  });

  it("throws rather than silently returning garbage for unparseable input", () => {
    expect(() => parseJsonResponse("not json at all")).toThrow();
  });
});
