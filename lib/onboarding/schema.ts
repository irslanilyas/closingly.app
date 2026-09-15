/**
 * The controlled vocabulary onboarding answers are normalized into.
 *
 * Every answer that later steers generation is an enum, not free prose. Free
 * text is kept alongside it as a label, never as the value a downstream system
 * branches on — a model reading "Strategy & advisory" and a model reading
 * "strategy_advisory" behave the same, but only the second can be counted,
 * migrated, or compared across users.
 *
 * The one deliberate exception is `target_audience`, which is genuinely
 * specific to each practice and would lose its whole value as an enum.
 */

export const ROLES = [
  { value: "independent_consultant", label: "Independent consultant" },
  { value: "agency_owner", label: "Agency or studio owner" },
  { value: "fractional_executive", label: "Fractional executive" },
  { value: "freelance_specialist", label: "Freelance specialist" },
  { value: "coach_advisor", label: "Coach or advisor" },
] as const;

export const SERVICES = [
  { value: "strategy_advisory", label: "Strategy and advisory" },
  { value: "design_creative", label: "Design and creative" },
  { value: "software_development", label: "Software development" },
  { value: "marketing_growth", label: "Marketing and growth" },
  { value: "operations_process", label: "Operations and process" },
  { value: "data_analytics", label: "Data and analytics" },
  { value: "training_enablement", label: "Training and enablement" },
] as const;

export const GOALS = [
  { value: "close_better_fit_work", label: "Close better-fit work" },
  { value: "raise_average_deal_size", label: "Raise my average deal size" },
  { value: "shorten_sales_cycle", label: "Shorten the time to a yes" },
  { value: "stop_losing_track", label: "Stop losing track of live deals" },
  { value: "spend_less_time_writing", label: "Spend less time writing proposals" },
] as const;

export const VOICES = [
  { value: "clear_warm_direct", label: "Clear, warm and direct" },
  { value: "precise_analytical", label: "Precise and analytical" },
  { value: "confident_senior", label: "Confident and senior" },
  { value: "plain_practical", label: "Plain and practical" },
] as const;

/**
 * The document outline. Ordered as they appear in a proposal, so the order a
 * person picks them in never matters — the document reads correctly either
 * way, and a section they forget to select simply isn't there.
 */
export const PROPOSAL_SECTIONS = [
  {
    value: "opportunity",
    label: "The opportunity",
    hint: "What the client is trying to change",
  },
  {
    value: "recommended_approach",
    label: "Recommended approach",
    hint: "How you'd tackle it",
  },
  {
    value: "deliverables_timeline",
    label: "Deliverables and timeline",
    hint: "What they get, and when",
  },
  {
    value: "investment_terms",
    label: "Investment and terms",
    hint: "Price, payment, what's included",
  },
  {
    value: "proof_case_studies",
    label: "Proof and past work",
    hint: "Relevant results you can point to",
  },
  {
    value: "team_who_does_the_work",
    label: "Who does the work",
    hint: "You, or you plus collaborators",
  },
  {
    value: "assumptions_exclusions",
    label: "Assumptions and exclusions",
    hint: "The scope fence that prevents creep",
  },
  { value: "next_steps", label: "Next steps", hint: "How they say yes" },
] as const;

export const COLOR_DIRECTIONS = [
  { value: "ink_and_paper", label: "Ink and paper", swatch: ["#1b1a18", "#f6f1e8"] },
  { value: "deep_navy", label: "Deep navy", swatch: ["#16233f", "#eef1f6"] },
  { value: "forest_and_stone", label: "Forest and stone", swatch: ["#1f3b2e", "#eef0ea"] },
  { value: "warm_terracotta", label: "Warm terracotta", swatch: ["#a8412a", "#f8efe6"] },
  { value: "graphite_and_amber", label: "Graphite and amber", swatch: ["#2b2b2b", "#e0a032"] },
  { value: "plum_and_bone", label: "Plum and bone", swatch: ["#4a2340", "#f4eee9"] },
] as const;

export const TYPOGRAPHY_DIRECTIONS = [
  { value: "modern_editorial", label: "Modern editorial", hint: "Serif headings, clean body" },
  { value: "clean_neutral", label: "Clean and neutral", hint: "One sans, tight hierarchy" },
  { value: "classic_professional", label: "Classic professional", hint: "Traditional, understated" },
  { value: "bold_confident", label: "Bold and confident", hint: "Heavy headings, high contrast" },
] as const;

export const PRICING_MODELS = [
  { value: "fixed_project", label: "Fixed project fee" },
  { value: "monthly_retainer", label: "Monthly retainer" },
  { value: "day_rate", label: "Day rate" },
  { value: "hourly", label: "Hourly" },
  { value: "value_based", label: "Value-based" },
  { value: "mixed", label: "It varies by engagement" },
] as const;

export const CURRENCIES = [
  { value: "USD", label: "USD — US dollar", symbol: "$" },
  { value: "EUR", label: "EUR — Euro", symbol: "€" },
  { value: "GBP", label: "GBP — Pound sterling", symbol: "£" },
  { value: "AED", label: "AED — UAE dirham", symbol: "AED " },
  { value: "PKR", label: "PKR — Pakistani rupee", symbol: "Rs " },
  { value: "CAD", label: "CAD — Canadian dollar", symbol: "CA$" },
  { value: "AUD", label: "AUD — Australian dollar", symbol: "A$" },
  { value: "INR", label: "INR — Indian rupee", symbol: "₹" },
] as const;

type Value<T extends ReadonlyArray<{ value: string }>> = T[number]["value"];

export type Role = Value<typeof ROLES>;
export type Service = Value<typeof SERVICES>;
export type Goal = Value<typeof GOALS>;
export type Voice = Value<typeof VOICES>;
export type ProposalSection = Value<typeof PROPOSAL_SECTIONS>;
export type ColorDirection = Value<typeof COLOR_DIRECTIONS>;
export type TypographyDirection = Value<typeof TYPOGRAPHY_DIRECTIONS>;
export type PricingModel = Value<typeof PRICING_MODELS>;
export type Currency = Value<typeof CURRENCIES>;

/** Exactly what the wizard submits. Anything else is rejected at the door. */
export interface OnboardingAnswers {
  role: Role;
  primary_service: Service;
  target_audience: string;
  primary_goal: Goal;
  website_url: string | null;
  voice: Voice;

  sections: ProposalSection[];
  color_direction: ColorDirection;
  typography_direction: TypographyDirection;

  pricing_model: PricingModel;
  currency: Currency;
  minimum_project_value: number | null;
}

/** Sections a proposal cannot do without — the wizard cannot deselect these. */
export const REQUIRED_SECTIONS: ProposalSection[] = [
  "opportunity",
  "recommended_approach",
  "deliverables_timeline",
  "investment_terms",
];

export const DEFAULT_SECTIONS: ProposalSection[] = [
  ...REQUIRED_SECTIONS,
  "next_steps",
];

/** Long enough to be a real answer, short enough not to be a pasted essay. */
const AUDIENCE_MAX = 160;
/** Beyond this a "typical minimum" is a data-entry slip, not a price. */
const MINIMUM_VALUE_MAX = 100_000_000;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  answers?: OnboardingAnswers;
}

function oneOf<T extends ReadonlyArray<{ value: string }>>(
  list: T,
  raw: unknown
): Value<T> | null {
  return typeof raw === "string" && list.some((o) => o.value === raw)
    ? (raw as Value<T>)
    : null;
}

/**
 * A website URL is stored, never fetched here. It is user-supplied and points
 * anywhere, so it is normalized to an absolute http(s) URL and nothing more —
 * anything that would fetch it belongs behind an explicit, reviewable import.
 */
export function normalizeWebsite(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Validates a submitted wizard payload. Returns every problem at once rather
 * than the first, because the client shows them against their own fields.
 */
export function validateAnswers(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const input = (raw ?? {}) as Record<string, unknown>;

  const role = oneOf(ROLES, input.role);
  if (!role) errors.push("role");

  const primary_service = oneOf(SERVICES, input.primary_service);
  if (!primary_service) errors.push("primary_service");

  const primary_goal = oneOf(GOALS, input.primary_goal);
  if (!primary_goal) errors.push("primary_goal");

  const voice = oneOf(VOICES, input.voice);
  if (!voice) errors.push("voice");

  const audienceRaw =
    typeof input.target_audience === "string" ? input.target_audience.trim() : "";
  if (audienceRaw.length < 2 || audienceRaw.length > AUDIENCE_MAX) {
    errors.push("target_audience");
  }

  const color_direction = oneOf(COLOR_DIRECTIONS, input.color_direction);
  if (!color_direction) errors.push("color_direction");

  const typography_direction = oneOf(
    TYPOGRAPHY_DIRECTIONS,
    input.typography_direction
  );
  if (!typography_direction) errors.push("typography_direction");

  const pricing_model = oneOf(PRICING_MODELS, input.pricing_model);
  if (!pricing_model) errors.push("pricing_model");

  const currency = oneOf(CURRENCIES, input.currency);
  if (!currency) errors.push("currency");

  // Kept in the canonical order regardless of click order, deduplicated, and
  // forced to contain the four a proposal is meaningless without.
  const picked = Array.isArray(input.sections) ? input.sections : [];
  const sections = PROPOSAL_SECTIONS.map((s) => s.value).filter(
    (value) => picked.includes(value) || REQUIRED_SECTIONS.includes(value)
  );
  if (sections.length === 0) errors.push("sections");

  let minimum_project_value: number | null = null;
  if (input.minimum_project_value != null && input.minimum_project_value !== "") {
    const n = Number(input.minimum_project_value);
    if (!Number.isFinite(n) || n < 0 || n > MINIMUM_VALUE_MAX) {
      errors.push("minimum_project_value");
    } else {
      minimum_project_value = Math.round(n);
    }
  }

  // A website that doesn't parse is dropped rather than rejected: it is
  // optional, and blocking the whole wizard on a typo in an optional field is
  // a worse outcome than storing nothing.
  const website_url = normalizeWebsite(input.website_url);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    answers: {
      role: role!,
      primary_service: primary_service!,
      target_audience: audienceRaw,
      primary_goal: primary_goal!,
      website_url,
      voice: voice!,
      sections,
      color_direction: color_direction!,
      typography_direction: typography_direction!,
      pricing_model: pricing_model!,
      currency: currency!,
      minimum_project_value,
    },
  };
}

export function labelFor<T extends ReadonlyArray<{ value: string; label: string }>>(
  list: T,
  value: string
): string {
  return list.find((o) => o.value === value)?.label ?? value;
}
