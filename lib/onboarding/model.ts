import {
  type OnboardingAnswers,
  type ProposalSection,
  REQUIRED_SECTIONS,
} from "./schema";

/**
 * The layered conversion from wizard answers to a generation requirement.
 *
 *   Layer 1  normalized facts        — what the person told us, with provenance
 *   Layer 2  proposal specification  — what a document must satisfy
 *   Layer 3  generation instruction  — the provider-specific rendering (prompts.ts)
 *
 * The layers exist so the answers survive a change of generation service, and
 * so any generated document can be traced back to the exact facts behind it.
 * Nothing here interpolates user text into an instruction — that only happens
 * in Layer 3, inside explicitly delimited untrusted blocks.
 */

/** Where a fact came from. Inferred values must never be treated as confirmed. */
export type FactSource = "onboarding" | "website_import" | "brand_book";
export type FactConfidence = "confirmed" | "inferred";

export interface ProfessionalFacts {
  role: string;
  primary_goal: string;
  voice: string;
  source: FactSource;
  confidence: FactConfidence;
}

export interface BusinessFacts {
  primary_service: string;
  target_audience: string;
  website_url: string | null;
  source: FactSource;
  confidence: FactConfidence;
}

export interface ProposalFacts {
  sections: ProposalSection[];
  source: FactSource;
}

export interface BrandFacts {
  color_direction: string;
  typography_direction: string;
  brand_book_asset_id: string | null;
  source: FactSource;
}

export interface CommercialFacts {
  pricing_model: string;
  currency: string;
  minimum_project_value: number | null;
  /** True when we filled this in, so no system can read it as a stated price. */
  minimum_project_value_is_default: boolean;
  source: FactSource;
}

export interface NormalizedFacts {
  professional: ProfessionalFacts;
  business: BusinessFacts;
  proposal: ProposalFacts;
  brand: BrandFacts;
  commercial: CommercialFacts;
}

export function normalizeFacts(answers: OnboardingAnswers): NormalizedFacts {
  return {
    professional: {
      role: answers.role,
      primary_goal: answers.primary_goal,
      voice: answers.voice,
      source: "onboarding",
      confidence: "confirmed",
    },
    business: {
      primary_service: answers.primary_service,
      target_audience: answers.target_audience,
      website_url: answers.website_url,
      source: "onboarding",
      confidence: "confirmed",
    },
    proposal: {
      sections: answers.sections,
      source: "onboarding",
    },
    brand: {
      color_direction: answers.color_direction,
      typography_direction: answers.typography_direction,
      brand_book_asset_id: null,
      source: "onboarding",
    },
    commercial: {
      pricing_model: answers.pricing_model,
      currency: answers.currency,
      minimum_project_value: answers.minimum_project_value,
      minimum_project_value_is_default: answers.minimum_project_value == null,
      source: "onboarding",
    },
  };
}

/* ── Layer 2 ───────────────────────────────────────────────────────────── */

export interface ProposalSpecification {
  document_type: "starter_proposal" | "client_proposal";
  purpose: string;
  audience: string;
  required_sections: ProposalSection[];
  optional_sections: ProposalSection[];
  voice: {
    primary: string;
    avoid: string[];
  };
  visual_direction: {
    colors: string;
    typography: string;
    brand_book_available: boolean;
  };
  commercial_boundaries: {
    pricing_model: string;
    currency: string;
    minimum_project_value: number | null;
    must_not_quote_without_deal_context: boolean;
    requires_human_approval: boolean;
  };
  missing_context_policy: Record<string, string>;
}

const VOICE_AVOID = [
  "generic claims",
  "unapproved promises",
  "overly aggressive sales language",
  "invented client names, results, testimonials or budgets",
];

/**
 * Builds the specification a generated document must satisfy.
 *
 * The commercial boundaries are the load-bearing part. A minimum project value
 * given during onboarding is a floor for recommendations, never a price to
 * paste into a document — a starter proposal written before any conversation
 * has happened cannot know what this engagement is worth.
 */
export function buildSpecification(
  facts: NormalizedFacts,
  opts: { documentType?: "starter_proposal" | "client_proposal" } = {}
): ProposalSpecification {
  const documentType = opts.documentType ?? "starter_proposal";
  const isStarter = documentType === "starter_proposal";

  const required = facts.proposal.sections.filter((s) =>
    REQUIRED_SECTIONS.includes(s)
  );
  const optional = facts.proposal.sections.filter(
    (s) => !REQUIRED_SECTIONS.includes(s)
  );

  return {
    document_type: documentType,
    purpose: isStarter
      ? "Create a reusable proposal foundation the professional can adapt for future client-specific proposals."
      : "Create a client-specific proposal grounded in the recorded conversation and deal record.",
    audience: `Prospective clients of this practice: ${facts.business.target_audience}`,
    required_sections: required,
    optional_sections: optional,
    voice: {
      primary: facts.professional.voice,
      avoid: VOICE_AVOID,
    },
    visual_direction: {
      colors: facts.brand.color_direction,
      typography: facts.brand.typography_direction,
      brand_book_available: facts.brand.brand_book_asset_id != null,
    },
    commercial_boundaries: {
      pricing_model: facts.commercial.pricing_model,
      currency: facts.commercial.currency,
      minimum_project_value: facts.commercial.minimum_project_value,
      must_not_quote_without_deal_context: true,
      requires_human_approval: true,
    },
    missing_context_policy: isStarter
      ? {
          client_name: "use_placeholder",
          client_problem:
            "write as a reusable frame the professional fills in after discovery, not as a stated fact",
          timeline: "leave as a configurable field",
          investment:
            "show a configurable investment area with the pricing model explained, never a final number",
        }
      : {
          client_name: "use the deal record",
          client_problem: "use only what the transcript supports",
          timeline: "use only what was agreed; otherwise leave configurable",
          investment: "propose a range with assumptions; requires approval",
        },
  };
}
