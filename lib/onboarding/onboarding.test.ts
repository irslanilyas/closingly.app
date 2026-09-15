import { describe, it, expect } from "vitest";
import {
  validateAnswers,
  normalizeWebsite,
  REQUIRED_SECTIONS,
  type OnboardingAnswers,
} from "./schema";
import { normalizeFacts, buildSpecification } from "./model";
import { validateGeneration, StarterProposalError } from "./starter-proposal";

const VALID: Record<string, unknown> = {
  role: "independent_consultant",
  primary_service: "strategy_advisory",
  target_audience: "Seed-stage founders with no ops function",
  primary_goal: "close_better_fit_work",
  voice: "clear_warm_direct",
  sections: ["opportunity", "next_steps"],
  color_direction: "ink_and_paper",
  typography_direction: "modern_editorial",
  pricing_model: "fixed_project",
  currency: "GBP",
  minimum_project_value: "5000",
};

describe("validateAnswers", () => {
  it("accepts a complete payload", () => {
    const result = validateAnswers(VALID);
    expect(result.ok).toBe(true);
    expect(result.answers?.currency).toBe("GBP");
    expect(result.answers?.minimum_project_value).toBe(5000);
  });

  it("forces the four sections a proposal cannot do without", () => {
    // The client only sent two, one of which is optional.
    const result = validateAnswers(VALID);
    for (const key of REQUIRED_SECTIONS) {
      expect(result.answers?.sections).toContain(key);
    }
    expect(result.answers?.sections).toContain("next_steps");
  });

  it("returns sections in canonical order, not click order", () => {
    const result = validateAnswers({
      ...VALID,
      sections: ["next_steps", "opportunity", "proof_case_studies"],
    });
    const sections = result.answers!.sections;
    expect(sections.indexOf("opportunity")).toBeLessThan(
      sections.indexOf("investment_terms")
    );
    expect(sections.indexOf("investment_terms")).toBeLessThan(
      sections.indexOf("next_steps")
    );
  });

  it("rejects a value that is not in the controlled vocabulary", () => {
    const result = validateAnswers({ ...VALID, role: "ceo_of_everything" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("role");
  });

  it("reports every bad field at once, not just the first", () => {
    const result = validateAnswers({
      ...VALID,
      role: "nope",
      currency: "XXX",
      target_audience: "",
    });
    expect(result.errors).toEqual(
      expect.arrayContaining(["role", "currency", "target_audience"])
    );
  });

  it("treats a blank minimum as no minimum rather than zero", () => {
    const result = validateAnswers({ ...VALID, minimum_project_value: "" });
    expect(result.ok).toBe(true);
    expect(result.answers?.minimum_project_value).toBeNull();
  });

  it("drops an unparseable website instead of blocking the whole wizard", () => {
    const result = validateAnswers({ ...VALID, website_url: "not a url at all" });
    expect(result.ok).toBe(true);
    expect(result.answers?.website_url).toBeNull();
  });
});

describe("normalizeWebsite", () => {
  it("adds a scheme to a bare domain", () => {
    expect(normalizeWebsite("yourstudio.com")).toBe("https://yourstudio.com/");
  });

  it("refuses a non-http scheme", () => {
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("file:///etc/passwd")).toBeNull();
  });

  it("refuses something with no dot in the host", () => {
    expect(normalizeWebsite("localhost")).toBeNull();
  });
});

describe("normalizeFacts", () => {
  it("marks an omitted minimum as a default so it is never read as a price", () => {
    const answers = validateAnswers({
      ...VALID,
      minimum_project_value: "",
    }).answers!;
    const facts = normalizeFacts(answers);
    expect(facts.commercial.minimum_project_value_is_default).toBe(true);
  });

  it("does not mark a stated minimum as a default", () => {
    const facts = normalizeFacts(validateAnswers(VALID).answers!);
    expect(facts.commercial.minimum_project_value).toBe(5000);
    expect(facts.commercial.minimum_project_value_is_default).toBe(false);
  });

  it("labels onboarding answers as confirmed, not inferred", () => {
    const facts = normalizeFacts(validateAnswers(VALID).answers!);
    expect(facts.professional.confidence).toBe("confirmed");
    expect(facts.business.source).toBe("onboarding");
  });
});

describe("buildSpecification", () => {
  const facts = normalizeFacts(validateAnswers(VALID).answers!);

  it("splits required from optional sections", () => {
    const spec = buildSpecification(facts);
    expect(spec.required_sections).toEqual(REQUIRED_SECTIONS);
    expect(spec.optional_sections).toContain("next_steps");
  });

  it("always forbids quoting without deal context, whatever was answered", () => {
    const spec = buildSpecification(facts);
    expect(spec.commercial_boundaries.must_not_quote_without_deal_context).toBe(
      true
    );
    expect(spec.commercial_boundaries.requires_human_approval).toBe(true);
  });

  it("keeps the currency the user chose", () => {
    expect(buildSpecification(facts).commercial_boundaries.currency).toBe("GBP");
  });

  it("uses placeholder policy for a starter and deal context for a client one", () => {
    expect(buildSpecification(facts).missing_context_policy.client_name).toBe(
      "use_placeholder"
    );
    expect(
      buildSpecification(facts, { documentType: "client_proposal" })
        .missing_context_policy.client_name
    ).toBe("use the deal record");
  });
});

describe("validateGeneration", () => {
  const spec = buildSpecification(
    normalizeFacts(validateAnswers(VALID).answers!)
  );

  const goodSections = REQUIRED_SECTIONS.map((key) => ({
    key,
    heading: key,
    body: "Body text.",
    evidence: [],
    confidence: "placeholder",
  }));

  const wrap = (proposal: Record<string, unknown>) =>
    JSON.stringify({
      proposal: { title: "T", subtitle: "S", sections: goodSections, ...proposal },
      quality: { ready_for_human_review: true },
    });

  it("parses a reply the model wrapped in a markdown fence", () => {
    const raw = "```json\n" + wrap({}) + "\n```";
    expect(validateGeneration(raw, spec).proposal.sections).toHaveLength(4);
  });

  it("throws on a reply that is not JSON", () => {
    expect(() => validateGeneration("Sure! Here you go.", spec)).toThrow(
      StarterProposalError
    );
  });

  it("throws when no section survived", () => {
    expect(() =>
      validateGeneration(JSON.stringify({ proposal: { sections: [] } }), spec)
    ).toThrow(StarterProposalError);
  });

  it("forces requires_approval on, whatever the model returned", () => {
    const raw = wrap({
      commercial_summary: {
        pricing_text: "Fixed fee",
        timeline_text: "Phased",
        assumptions: [],
        requires_approval: false,
      },
    });
    expect(
      validateGeneration(raw, spec).proposal.commercial_summary.requires_approval
    ).toBe(true);
  });

  it("discards invented evidence — a starter proposal has nothing to cite", () => {
    const raw = JSON.stringify({
      proposal: {
        title: "T",
        subtitle: "S",
        sections: goodSections.map((s) => ({
          ...s,
          evidence: ["segment_42", "segment_7"],
        })),
      },
      quality: {},
    });
    for (const section of validateGeneration(raw, spec).proposal.sections) {
      expect(section.evidence).toEqual([]);
    }
  });

  it("falls back to placeholder for an unrecognised confidence value", () => {
    const raw = JSON.stringify({
      proposal: {
        title: "T",
        sections: goodSections.map((s) => ({ ...s, confidence: "very sure" })),
      },
      quality: {},
    });
    expect(validateGeneration(raw, spec).proposal.sections[0].confidence).toBe(
      "placeholder"
    );
  });

  it("withholds review-ready when a required section is missing", () => {
    const raw = JSON.stringify({
      proposal: {
        title: "T",
        sections: goodSections.slice(0, 2),
      },
      quality: { ready_for_human_review: true },
    });
    const result = validateGeneration(raw, spec);
    expect(result.quality.ready_for_human_review).toBe(false);
    expect(result.quality.missing_required_fields).toContain("investment_terms");
  });
});

describe("answers type", () => {
  it("stays assignable from the validator output", () => {
    const answers: OnboardingAnswers | undefined = validateAnswers(VALID).answers;
    expect(answers?.role).toBe("independent_consultant");
  });
});
