import type { ProposalData } from "@/lib/types";

/**
 * The proposal's six sections, in document order.
 *
 * `key` is what the public page's tracker records when a section scrolls into
 * view: ProposalDocument derives it from the heading (lowercased, spaces to
 * underscores), so these must stay in step with the headings there.
 */
export const PROPOSAL_SECTIONS = [
  { key: "the_challenge", title: "The challenge" },
  { key: "approach", title: "Approach" },
  { key: "what_you_get", title: "What you get" },
  { key: "timeline", title: "Timeline" },
  { key: "investment", title: "Investment" },
  { key: "next_steps", title: "Next steps" },
] as const;

export type ProposalSectionKey = (typeof PROPOSAL_SECTIONS)[number]["key"];

/** A one-line preview of each section, for the page's proposal card. */
export function sectionPreview(data: ProposalData, key: ProposalSectionKey): string {
  switch (key) {
    case "the_challenge":
      return data.challenge;
    case "approach":
      return data.approach;
    case "what_you_get":
      return data.deliverables.join(" · ");
    case "timeline":
      return data.timeline_phased;
    case "investment":
      return [data.investment_number, data.investment_terms].filter(Boolean).join(" · ");
    case "next_steps":
      return data.next_steps;
  }
}
