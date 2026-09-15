import { describe, it, expect } from "vitest";
import { extractTerms } from "./retrieve";

describe("extractTerms", () => {
  it("keeps the words that identify a deal", () => {
    expect(extractTerms("What did Acme say their budget was?")).toContain("acme");
    expect(extractTerms("What did Acme say their budget was?")).toContain("budget");
  });

  it("drops the words every question contains", () => {
    const terms = extractTerms("What did they say about the deal last quarter?");
    for (const noise of ["what", "did", "they", "say", "about", "the", "deal", "last", "quarter"]) {
      expect(terms).not.toContain(noise);
    }
  });

  it("deduplicates", () => {
    const terms = extractTerms("Acme acme ACME pricing");
    expect(terms.filter((t) => t === "acme")).toHaveLength(1);
  });

  it("keeps two-letter domain words that actually narrow a search", () => {
    expect(extractTerms("who mentioned ai tooling")).toContain("ai");
  });

  it("survives punctuation and possessives", () => {
    const terms = extractTerms("Ridgeline's scope — what changed?");
    expect(terms).toContain("ridgeline's");
    expect(terms).toContain("scope");
    expect(terms).toContain("changed");
  });

  it("caps how many terms it will use", () => {
    const terms = extractTerms(
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet"
    );
    expect(terms.length).toBeLessThanOrEqual(6);
  });

  it("returns nothing for a question made entirely of stop words", () => {
    expect(extractTerms("what about the deals?")).toEqual([]);
  });
});
