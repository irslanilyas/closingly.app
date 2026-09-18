import type { GeneratedProposal, ProposalData } from "@/lib/types";

/**
 * One column, two shapes.
 *
 * `proposals.proposal_data` is written by two different paths. A proposal cut
 * from a call transcript is stored as `ProposalData` — the fixed seven fields
 * the document renders. The starter proposal written at onboarding is stored
 * as `GeneratedProposal`, which is a list of sections keyed by the sections
 * the person picked in the wizard.
 *
 * The document only ever knew the first shape, so opening a starter proposal
 * threw on `data.deliverables.map`. Rather than teach the document a second
 * schema — which would fork the editor, the public page, the PDF and the
 * analytics that all read those field names — the generated shape is folded
 * into the fixed one on the way in.
 *
 * Nothing is dropped. Sections the fixed structure has no slot for are
 * appended under their own heading to the nearest field, so the words survive
 * and stay editable. The first save writes the fixed shape back, so a record
 * is converted exactly once.
 */

export const EMPTY_PROPOSAL: ProposalData = {
  challenge: "",
  approach: "",
  deliverables: [],
  timeline_phased: "",
  investment_number: "",
  investment_terms: "",
  next_steps: "",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
}

function isGenerated(value: Record<string, unknown>): boolean {
  return Array.isArray(value.sections);
}

/** Joins the parts that actually have words, leaving a blank line between. */
function paragraphs(...parts: string[]): string {
  return parts.filter((p) => p.trim()).join("\n\n");
}

/**
 * Splits a written section into deliverable lines.
 *
 * The model is asked for prose, so this may arrive as a bulleted list, as
 * numbered lines, or as a single paragraph. Bullets are unwrapped; a single
 * paragraph is kept whole rather than chopped at sentence boundaries, because
 * a half-sentence deliverable reads like a bug to whoever opens the document.
 */
function toDeliverables(body: string): string[] {
  const lines = body
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  return lines.length > 1 ? lines : body.trim() ? [body.trim()] : [];
}

/** The first money-shaped token, which is all the headline number can show. */
function priceFrom(pricing: string): string {
  const match = pricing.match(
    /(?:[$£€]|\b(?:USD|EUR|GBP|PKR|AUD|CAD)\s?)\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?/
  );
  return match ? match[0].trim() : "";
}

function fromGenerated(raw: GeneratedProposal): ProposalData {
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const find = (key: string) => sections.find((s) => s?.key === key);
  const bodyOf = (key: string) => text(find(key)?.body);

  /** A section under its own heading, for the ones with no dedicated field. */
  const titled = (key: string) => {
    const section = find(key);
    const body = text(section?.body);
    if (!body) return "";
    const heading = text(section?.heading);
    return heading ? `${heading}\n${body}` : body;
  };

  const commercial = raw.commercial_summary ?? {
    pricing_text: "",
    timeline_text: "",
    assumptions: [],
    requires_approval: true,
  };

  const pricing = text(commercial.pricing_text);
  const assumptions = list(commercial.assumptions);
  const risks = list(raw.scope_risks);
  const questions = list(raw.open_questions);

  const deliverablesBody = bodyOf("deliverables_timeline");

  return {
    challenge: bodyOf("opportunity"),
    // Proof and team have no slot of their own. They belong with the approach:
    // it is the part of the document that argues you can do the work.
    approach: paragraphs(
      bodyOf("recommended_approach"),
      titled("proof_case_studies"),
      titled("team_who_does_the_work")
    ),
    deliverables: toDeliverables(deliverablesBody),
    // The wizard folds timeline into the deliverables section, so the
    // commercial summary is the only place a phased timeline reliably lives.
    timeline_phased: text(commercial.timeline_text),
    investment_number: priceFrom(pricing),
    // Terms carry everything that fences the price: the pricing sentence
    // itself when no number could be pulled out of it, the written terms, and
    // the assumptions and exclusions that stop scope creep.
    investment_terms: paragraphs(
      bodyOf("investment_terms"),
      priceFrom(pricing) ? "" : pricing,
      assumptions.length ? `Assumptions\n${assumptions.map((a) => `- ${a}`).join("\n")}` : "",
      risks.length ? `Exclusions\n${risks.map((r) => `- ${r}`).join("\n")}` : ""
    ),
    next_steps: paragraphs(
      text(raw.recommended_next_step) || bodyOf("next_steps"),
      questions.length
        ? `Open questions\n${questions.map((q) => `- ${q}`).join("\n")}`
        : ""
    ),
  };
}

/**
 * Whatever is in the column, rendered as the document's seven fields.
 *
 * Also the null guard: a row that is empty, half-written, or written by a
 * future shape returns the empty document rather than throwing inside render.
 */
export function toProposalData(raw: unknown): ProposalData {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PROPOSAL };

  const value = raw as Record<string, unknown>;

  if (isGenerated(value)) {
    return fromGenerated(value as unknown as GeneratedProposal);
  }

  return {
    challenge: text(value.challenge),
    approach: text(value.approach),
    deliverables: list(value.deliverables),
    timeline_phased: text(value.timeline_phased),
    investment_number: text(value.investment_number),
    investment_terms: text(value.investment_terms),
    next_steps: text(value.next_steps),
  };
}
