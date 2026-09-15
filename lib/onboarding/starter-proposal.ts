import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { starterProposalPrompt } from "@/lib/prompts";
import {
  ROLES,
  SERVICES,
  GOALS,
  VOICES,
  PRICING_MODELS,
  PROPOSAL_SECTIONS,
  labelFor,
} from "./schema";
import type { NormalizedFacts, ProposalSpecification } from "./model";
import type {
  GeneratedProposal,
  GeneratedSection,
  GenerationQuality,
  GenerationResult,
  SectionConfidence,
} from "@/lib/types";

/**
 * Generates the starter proposal.
 *
 * The PRD names Kimi as the generation service. This uses Claude instead, and
 * the layered model above is exactly what makes that a one-file decision: the
 * specification is provider-neutral, so only this renderer changes. The reason
 * is the split this codebase already runs on — Kimi does visual template work
 * where a bad result is an ugly page, Claude does the work that touches money
 * and reputation. This document is the first thing a consultant will consider
 * sending to a client.
 */

const MAX_TOKENS = 4000;

export class StarterProposalError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
    this.name = "StarterProposalError";
  }
}

const CONFIDENCES: SectionConfidence[] = ["confirmed", "inferred", "placeholder"];

/** Strips a markdown fence if the model added one despite being told not to. */
function unfence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
}

/**
 * Coerces the model's reply into the output contract.
 *
 * Repairs what is safely repairable — a missing array, an unknown confidence
 * value — and throws on what is not. A document is not shareable because
 * generation returned 200; it becomes reviewable only after it satisfies the
 * schema and the commercial boundaries.
 */
export function validateGeneration(
  raw: string,
  spec: ProposalSpecification
): GenerationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfence(raw));
  } catch {
    throw new StarterProposalError("Generation did not return JSON");
  }

  const root = parsed as Record<string, unknown>;
  const p = (root.proposal ?? {}) as Record<string, unknown>;

  const sectionsRaw = Array.isArray(p.sections) ? p.sections : [];
  const sections: GeneratedSection[] = sectionsRaw
    .map((s) => s as Record<string, unknown>)
    .filter((s) => typeof s.key === "string" && typeof s.body === "string")
    .map((s) => ({
      key: s.key as string,
      heading:
        typeof s.heading === "string" && s.heading.trim()
          ? (s.heading as string)
          : labelFor(PROPOSAL_SECTIONS, s.key as string),
      body: (s.body as string).trim(),
      // Always empty for a starter proposal — there is nothing to cite. A
      // model that invents segment ids here would be fabricating provenance,
      // which is worse than having none.
      evidence: [],
      confidence: CONFIDENCES.includes(s.confidence as SectionConfidence)
        ? (s.confidence as SectionConfidence)
        : "placeholder",
    }));

  if (sections.length === 0) {
    throw new StarterProposalError("Generation returned no usable sections");
  }

  const required = spec.required_sections;
  const present = new Set(sections.map((s) => s.key));
  const missing = required.filter((key) => !present.has(key));

  if (missing.length === required.length) {
    throw new StarterProposalError(
      `Generation missed every required section: ${missing.join(", ")}`
    );
  }

  const commercial = (p.commercial_summary ?? {}) as Record<string, unknown>;
  const quality = (root.quality ?? {}) as Record<string, unknown>;

  const proposal: GeneratedProposal = {
    title:
      typeof p.title === "string" && p.title.trim()
        ? p.title.trim()
        : "Starter proposal",
    subtitle: typeof p.subtitle === "string" ? p.subtitle.trim() : "",
    sections,
    commercial_summary: {
      pricing_text:
        typeof commercial.pricing_text === "string" ? commercial.pricing_text : "",
      timeline_text:
        typeof commercial.timeline_text === "string"
          ? commercial.timeline_text
          : "",
      assumptions: asStringArray(commercial.assumptions),
      // Not read from the model. Onboarding defaults are not approvals, so
      // this is a fact about the product, not something generation may decide.
      requires_approval: true,
    },
    recommended_next_step:
      typeof p.recommended_next_step === "string" ? p.recommended_next_step : "",
    open_questions: asStringArray(p.open_questions),
    scope_risks: asStringArray(p.scope_risks),
  };

  const qualityResult: GenerationQuality = {
    missing_required_fields: [
      ...missing,
      ...asStringArray(quality.missing_required_fields),
    ],
    unsupported_claims: asStringArray(quality.unsupported_claims),
    brand_alignment_notes: asStringArray(quality.brand_alignment_notes),
    ready_for_human_review: missing.length === 0,
  };

  return { proposal, quality: qualityResult };
}

export async function generateStarterProposal(
  facts: NormalizedFacts,
  spec: ProposalSpecification
): Promise<GenerationResult & { requestId: string | null }> {
  const orderedKeys = [...spec.required_sections, ...spec.optional_sections];
  const sectionLabels = orderedKeys.map((key) => {
    const meta = PROPOSAL_SECTIONS.find((s) => s.value === key);
    return { key, label: meta?.label ?? key, hint: meta?.hint ?? "" };
  });

  const prompt = starterProposalPrompt({
    spec,
    role_label: labelFor(ROLES, facts.professional.role),
    service_label: labelFor(SERVICES, facts.business.primary_service),
    goal_label: labelFor(GOALS, facts.professional.primary_goal),
    voice_label: labelFor(VOICES, facts.professional.voice),
    currency: facts.commercial.currency,
    pricing_model_label: labelFor(PRICING_MODELS, facts.commercial.pricing_model),
    section_labels: sectionLabels,
    target_audience: facts.business.target_audience,
  });

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("");

  if (!text.trim()) {
    throw new StarterProposalError("Generation returned an empty response");
  }

  return { ...validateGeneration(text, spec), requestId: response.id ?? null };
}
