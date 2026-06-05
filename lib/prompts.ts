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

Rules: tight language, no filler phrases, use client's exact pain words where possible. Output the JSON object only — no markdown fences, no commentary.

TRANSCRIPT:
${transcript}`;

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
