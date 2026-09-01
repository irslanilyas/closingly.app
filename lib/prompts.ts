/**
 * Classifies a meeting before any expensive work happens.
 *
 * Runs on every recorded call, so it's deliberately cheap: a truncated
 * transcript is plenty to tell a sales call from a standup, and only
 * `discovery` goes on to generate a proposal. Without this, every internal
 * sync would produce a junk deal and a junk proposal.
 */
export const triagePrompt = (transcript: string) => `Classify this meeting transcript.

Categories:
- "discovery": a prospective client describing a problem or project. Someone is being sold to. Scope, budget, or timeline come up.
- "check_in": an update on work already agreed or underway with an existing client.
- "kickoff": work is already won; this is about starting it.
- "internal": no external client — a team sync, standup, or one-to-one.
- "other": none of the above, or too little was said to tell.

Return ONLY valid JSON:
{
  "kind": "discovery" | "check_in" | "kickoff" | "internal" | "other",
  "confidence": "high" | "medium" | "low",
  "reason": "one short sentence"
}

Lean toward "other" when the transcript is very short or mostly small talk — a wrong "discovery" wastes a proposal on nothing.

TRANSCRIPT:
${transcript}`;

export const proposalPrompt = (transcript: string) => `You are a sales proposal generator for an independent professional.

Read the discovery call transcript and return ONLY valid JSON with this exact structure:

{
  "client_name": "first name",
  "client_company": "company name",
  "pain_point": "1-2 sentence summary in their words",
  "budget_signal": "what they said about money, or 'Not mentioned'",
  "timeline": "their stated timeline",
  "decision_maker": "who decides",
  "fit_score": 1-10 integer,
  "competitor_mentioned": "name of a competing option/vendor/tool the client brought up, or null if none was mentioned",
  "competitive_note": "one short sentence on how to position against them, or null if competitor_mentioned is null",
  "proposal": {
    "challenge": "2-3 sentences",
    "approach": "3-4 sentences, no fluff",
    "deliverables": ["item 1", "item 2", "item 3"],
    "timeline_phased": "week-by-week or phase breakdown, 3-5 lines",
    "investment_number": "exact figure with currency",
    "investment_terms": "one short line on payment structure",
    "next_steps": "one short sentence"
  },
  "suggested_replies": [
    {"tone": "Warm + action", "subject": "...", "body": "2-3 sentences ending in one question"},
    {"tone": "Direct + confident", "subject": "...", "body": "2-3 sentences, no question"}
  ]
}

Rules: tight language, no filler phrases, use client's exact pain words where possible. Never invent a competitor mention that isn't in the transcript — leave both competitor fields null rather than guess. Output the JSON object only — no markdown fences, no commentary.

TRANSCRIPT:
${transcript}`;

/**
 * Applies a plain-language instruction to an existing proposal.
 *
 * Returns the whole object rather than a patch: partial returns were
 * unreliable, and the diff is computed client-side anyway so we can show the
 * user exactly what moved.
 */
export const refineProposalPrompt = (
  proposal: string,
  instruction: string
) => `You are editing an existing proposal for an independent professional.

CURRENT PROPOSAL (JSON):
${proposal}

INSTRUCTION FROM THE USER:
${instruction}

Return the COMPLETE proposal as valid JSON with exactly the same keys and the same structure. Change only what the instruction asks for — leave every other field byte-identical.

Rules:
- Keep "deliverables" an array of strings.
- Keep "investment_number" a string including the currency, e.g. "$10,000".
- Do not invent facts about the client, their budget, or their timeline. If the instruction asks for something the proposal doesn't support, make the smallest reasonable change and leave the rest alone.
- Match the existing voice: tight, plain, no filler.

Output the JSON object only — no markdown fences, no commentary.`;

export const followUpPrompt = (situation: string, dealContext?: string) => `You are a follow-up email writer for an independent professional.

Situation: ${situation}
${dealContext ? `\nDeal context: ${dealContext}\n` : ""}

Return ONLY valid JSON:
{
  "replies": [
    {"tone": "Warm + nudge", "subject": "...", "body": "2-3 sentences, ends with one short question"},
    {"tone": "Direct + close", "subject": "...", "body": "2-3 sentences, no question"},
    {"tone": "Value-first", "subject": "...", "body": "2-3 sentences with a useful insight, no ask"}
  ]
}

Rules: short, human, no "I hope this email finds you well", no "just checking in". Output JSON only.`;

export const pricingPrompt = (input: {
  project_description: string;
  industry: string;
  scope: string;
  budget_signal: string;
  timeline: string;
  deals_json: string;
}) => `You are a pricing advisor for an independent professional.

Project info: ${input.project_description}
Industry: ${input.industry}
Scope: ${input.scope}
Budget signal: ${input.budget_signal}
Timeline: ${input.timeline}

Historical deals from user's pipeline (for context):
${input.deals_json}

Return ONLY valid JSON:
{
  "price_low": number,
  "price_mid": number,
  "price_high": number,
  "currency": "PKR" | "USD" | "EUR" | "GBP",
  "reasoning": ["point 1", "point 2", "point 3"],
  "confidence": "high" | "medium" | "low",
  "confidence_reason": "one sentence"
}

Rules: prices should reflect Pakistani market context unless context suggests otherwise. Round to clean numbers. Output JSON only.`;

export const transcriptCleanPrompt = (raw: string) => `You are a meeting transcript cleaner.

Raw transcript: ${raw}

Clean this up:
- Add speaker labels (Me: / [Name]:) if missing — infer from context
- Remove all filler words: um, uh, like, you know, sort of, kind of
- Remove timestamps if present
- Add natural paragraph breaks
- Mark logical sections with these headers (only if relevant): Introduction, Discovery, Pricing/Scope, Next Steps

Return ONLY the cleaned transcript as plain text. No JSON wrapping, no explanation.`;

/**
 * Runs once, when a deal is marked lost. Reads the discovery transcript plus
 * whatever the deal accumulated (pain point, budget signal, notes) and tries
 * to name the actual failure point rather than a generic "it didn't work out".
 */
export const postmortemPrompt = (dealContext: string, transcript: string) =>
  `You are helping an independent professional understand why a deal was lost, so the same mistake doesn't repeat.

DEAL CONTEXT:
${dealContext}

DISCOVERY TRANSCRIPT (if available):
${transcript || "No transcript on this deal."}

Return ONLY valid JSON:
{
  "what_went_wrong": "2-3 blunt sentences naming the actual reason, not a vague summary",
  "earliest_warning_sign": "the earliest moment in the deal that hinted this was going to fail, quoting or referencing the transcript/context if possible",
  "price_or_scope_factor": "did price, scope, or timeline play a role, and how — or 'Not a factor' if genuinely unrelated",
  "what_to_try_next_time": "one concrete, specific action for a similar future deal — not generic advice like 'follow up more'"
}

Rules: be direct, not diplomatic — this is private and only the user reads it. If the transcript or context genuinely doesn't support a confident answer, say so plainly rather than inventing a reason. Output JSON only.`;

/**
 * Runs once, when a deal is marked won. Pulls real language from the
 * transcript rather than inventing generic praise, so the testimonial ask
 * doesn't read as fabricated when the client sees it.
 */
export const caseStudyPrompt = (dealContext: string, transcript: string) =>
  `You are drafting case-study material for an independent professional, from a deal they just won.

DEAL CONTEXT:
${dealContext}

DISCOVERY TRANSCRIPT (if available):
${transcript || "No transcript on this deal."}

Return ONLY valid JSON:
{
  "headline": "one line, specific outcome or transformation, not generic",
  "summary": "3-4 sentences: the client's situation, what was done, the result — written for a prospective client to read",
  "client_quote": "a short quote that sounds like something the client actually said, grounded in the transcript's language — never invent a quote they didn't imply",
  "results": ["concrete outcome 1", "concrete outcome 2", "concrete outcome 3"],
  "testimonial_request_email": {
    "subject": "short, specific",
    "body": "2-3 sentences asking the client to confirm or lightly edit the quote above for public use — warm, not pushy"
  }
}

Rules: never fabricate a metric or outcome the transcript/context doesn't support — if there's nothing concrete, keep "results" short rather than making numbers up. Tight language, no filler. Output JSON only.`;

export const scopePrompt = (sow: string, message: string) => `You are a scope-creep detector for an independent professional.

Original SOW:
${sow}

New client request:
${message}

Return ONLY valid JSON:
{
  "verdict": "in_scope" | "scope_creep" | "grey_area",
  "reasoning": "2-3 sentences explaining your decision",
  "suggested_response": "draft message the user can send back — polite, professional, firm if needed",
  "estimated_additional_billing": "string with figure or 'N/A'"
}

Rules: lean toward "scope_creep" if it's genuinely additional work. Don't be a pushover. The user is the freelancer being protected. Output JSON only.`;

/**
 * Asks Kimi for a proposal design.
 *
 * The output is a fixed set of choices, not markup. Spelling out the whole
 * vocabulary inline is what keeps it that way — the model never has to invent
 * a value, so almost everything it returns survives validation instead of
 * silently falling back to the default.
 */
export const templatePrompt = (brief: string, existingNames: string[]) =>
  `You are a book and brand designer choosing a look for a consultant's client proposal.

Return ONLY valid JSON, exactly this shape:

{
  "name": "two words max, evocative, e.g. 'Slate' or 'Warm Press'",
  "description": "one short sentence a non-designer would understand",
  "design": {
    "heading_font": "sans" | "serif" | "display" | "mono",
    "body_font": "sans" | "serif",
    "density": "compact" | "normal" | "spacious",
    "paper": "#rrggbb",
    "ink": "#rrggbb",
    "accent": "#rrggbb",
    "header": "minimal" | "rule" | "block" | "centered",
    "section_label": "caps" | "numbered" | "serif" | "hidden",
    "divider": "none" | "hairline" | "rule",
    "bullet": "dot" | "check" | "number" | "card",
    "investment": "plain" | "boxed" | "hero",
    "corners": "square" | "soft" | "round"
  }
}

What the fields do:
- paper is the page background, ink is the body text, accent carries the price and the bullets.
- "display" is a high-contrast serif for headlines only; pair it with a serif or sans body.
- "block" prints the title white-on-accent, so the accent must be dark enough to read against.
- "hero" makes the fee large and centred on a tinted panel. Use it when the price is a selling point, not when it is high.
- "numbered" labels sections 01, 02, 03 — formal, good for corporate readers.

Rules:
- ink against paper must be genuinely readable — aim past 7:1. Near-black on off-white is never wrong.
- Pick a paper that is white or a very light tint. This document gets printed.
- One accent only. It should feel chosen, not default: avoid pure #000000, #ffffff and stock blue #0000ff.
- Make coherent choices. Spacious + display + centered + hairline reads editorial; compact + sans + numbered + rule reads corporate. Do not mix at random.
${existingNames.length ? `- Must feel clearly different from what this user already has: ${existingNames.join(", ")}.` : ""}

The consultant describes the impression they want:
"${brief}"`;
