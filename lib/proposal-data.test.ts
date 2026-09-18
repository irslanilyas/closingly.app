import { describe, expect, it } from "vitest";
import { toProposalData } from "./proposal-data";
import type { GeneratedProposal, ProposalData } from "./types";

const generated: GeneratedProposal = {
  title: "Proposal",
  subtitle: "",
  sections: [
    {
      key: "opportunity",
      heading: "The opportunity",
      body: "Leads arrive faster than they are followed up.",
      evidence: [],
      confidence: "inferred",
    },
    {
      key: "recommended_approach",
      heading: "Recommended approach",
      body: "Two weeks of discovery, then a build.",
      evidence: [],
      confidence: "inferred",
    },
    {
      key: "deliverables_timeline",
      heading: "Deliverables and timeline",
      body: "- A qualification flow\n- A follow-up sequence\n- One round of revisions",
      evidence: [],
      confidence: "confirmed",
    },
    {
      key: "investment_terms",
      heading: "Investment and terms",
      body: "Half up front, half on delivery.",
      evidence: [],
      confidence: "placeholder",
    },
    {
      key: "proof_case_studies",
      heading: "Proof and past work",
      body: "Three similar builds last year.",
      evidence: [],
      confidence: "placeholder",
    },
  ],
  commercial_summary: {
    pricing_text: "$4,500 fixed fee",
    timeline_text: "Four weeks from kickoff",
    assumptions: ["Content is supplied by the client"],
    requires_approval: true,
  },
  recommended_next_step: "A 20 minute call to confirm scope.",
  open_questions: ["Who signs off?"],
  scope_risks: ["Migration of old records is excluded"],
};

describe("toProposalData", () => {
  it("renders a starter proposal as the document's fixed fields", () => {
    const data = toProposalData(generated);

    expect(data.challenge).toBe("Leads arrive faster than they are followed up.");
    expect(data.deliverables).toEqual([
      "A qualification flow",
      "A follow-up sequence",
      "One round of revisions",
    ]);
    expect(data.timeline_phased).toBe("Four weeks from kickoff");
    expect(data.investment_number).toBe("$4,500");
    expect(data.next_steps).toContain("A 20 minute call to confirm scope.");
  });

  it("keeps sections the fixed structure has no field for", () => {
    const data = toProposalData(generated);

    expect(data.approach).toContain("Two weeks of discovery");
    expect(data.approach).toContain("Proof and past work");
    expect(data.approach).toContain("Three similar builds last year.");
    expect(data.investment_terms).toContain("Content is supplied by the client");
    expect(data.investment_terms).toContain("Migration of old records is excluded");
  });

  it("keeps the pricing sentence when no number can be read out of it", () => {
    const data = toProposalData({
      ...generated,
      commercial_summary: {
        ...generated.commercial_summary,
        pricing_text: "Priced per workshop, agreed before each one",
      },
    });

    expect(data.investment_number).toBe("");
    expect(data.investment_terms).toContain("Priced per workshop");
  });

  it("keeps an unbulleted deliverables section whole", () => {
    const data = toProposalData({
      ...generated,
      sections: generated.sections.map((s) =>
        s.key === "deliverables_timeline"
          ? { ...s, body: "A single written recommendation." }
          : s
      ),
    });

    expect(data.deliverables).toEqual(["A single written recommendation."]);
  });

  it("passes a transcript-derived proposal through unchanged", () => {
    const legacy: ProposalData = {
      challenge: "Churn is climbing.",
      approach: "Interviews, then a fix list.",
      deliverables: ["Interviews", "Fix list"],
      timeline_phased: "Three weeks",
      investment_number: "$8,000",
      investment_terms: "Net 14",
      next_steps: "Say yes by Friday.",
    };

    expect(toProposalData(legacy)).toEqual(legacy);
  });

  it("returns an empty document rather than throwing on junk", () => {
    for (const junk of [null, undefined, "", 7, [], {}]) {
      const data = toProposalData(junk);
      expect(data.deliverables).toEqual([]);
      expect(data.challenge).toBe("");
    }
  });
});
