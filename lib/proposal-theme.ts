/**
 * The design half of a proposal.
 *
 * A template is a *validated spec*, not generated code. Kimi picks values from
 * closed sets; we render them. That choice buys three things at once:
 *
 *   1. No injection surface. The public share page at /p/[token] is opened by
 *      the client, not the user, and every byte of a template originates from
 *      a language model. Enums and hex triples cannot carry a payload, so
 *      there is nothing to sanitise and nothing to get wrong.
 *   2. Editing survives. Fields stay editable in place and `data-section`
 *      stays intact, so per-section view tracking keeps working — generated
 *      markup would break both.
 *   3. It cannot produce a broken proposal. The worst a bad generation can do
 *      is look plain.
 *
 * The tradeoff is that a template cannot invent a new *structure*. That is
 * fine: the structure is the schema, and clients read proposals for the terms.
 */

export type FontChoice = "sans" | "serif" | "display" | "mono";
export type Density = "compact" | "normal" | "spacious";
export type HeaderStyle = "minimal" | "rule" | "block" | "centered";
export type LabelStyle = "caps" | "numbered" | "serif" | "hidden";
export type DividerStyle = "none" | "hairline" | "rule";
export type BulletStyle = "dot" | "check" | "number" | "card";
export type InvestmentStyle = "plain" | "boxed" | "hero";
export type Corners = "square" | "soft" | "round";

export interface ProposalTheme {
  heading_font: FontChoice;
  body_font: FontChoice;
  density: Density;
  /** Page background. */
  paper: string;
  /** Body text. Contrast against `paper` is enforced, not trusted. */
  ink: string;
  /** Figures, bullets, rules. */
  accent: string;
  header: HeaderStyle;
  section_label: LabelStyle;
  divider: DividerStyle;
  bullet: BulletStyle;
  investment: InvestmentStyle;
  corners: Corners;
}

/**
 * Matches the app's own look, so an untemplated proposal is not a downgrade.
 * Also the fallback for every field a generation gets wrong.
 */
export const DEFAULT_THEME: ProposalTheme = {
  heading_font: "sans",
  body_font: "sans",
  density: "normal",
  paper: "#fdfdfc",
  ink: "#26241f",
  accent: "#5c7a5c",
  header: "minimal",
  section_label: "caps",
  divider: "none",
  bullet: "dot",
  investment: "plain",
  corners: "soft",
};

const ENUMS = {
  heading_font: ["sans", "serif", "display", "mono"],
  body_font: ["sans", "serif", "display", "mono"],
  density: ["compact", "normal", "spacious"],
  header: ["minimal", "rule", "block", "centered"],
  section_label: ["caps", "numbered", "serif", "hidden"],
  divider: ["none", "hairline", "rule"],
  bullet: ["dot", "check", "number", "card"],
  investment: ["plain", "boxed", "hero"],
  corners: ["square", "soft", "round"],
} as const;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Force arbitrary input into a valid theme.
 *
 * Never throws and never returns a partial object: unknown keys are dropped,
 * bad values fall back to the default. Callers get something renderable no
 * matter what came out of the model or the database.
 */
export function coerceTheme(input: unknown): ProposalTheme {
  const raw = (input ?? {}) as Record<string, unknown>;
  const theme: ProposalTheme = { ...DEFAULT_THEME };

  for (const [key, allowed] of Object.entries(ENUMS)) {
    const value = raw[key];
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
      // Safe: `key` and `value` were both just checked against ENUMS.
      (theme as unknown as Record<string, string>)[key] = value;
    }
  }

  for (const key of ["paper", "ink", "accent"] as const) {
    const value = raw[key];
    if (typeof value === "string" && HEX.test(value)) theme[key] = value.toLowerCase();
  }

  // A model asked for "moody and dark" will happily pick charcoal text on a
  // near-black page. Readability is not a matter of taste, so it is repaired
  // rather than rejected — the palette is kept and the text is forced legible.
  if (contrastRatio(theme.ink, theme.paper) < 4.5) {
    theme.ink = isLight(theme.paper) ? "#1a1a1a" : "#f5f5f4";
  }
  // The accent carries the investment figure. Below 3:1 it stops being a
  // highlight and starts being a smudge.
  if (contrastRatio(theme.accent, theme.paper) < 3) {
    theme.accent = theme.ink;
  }

  return theme;
}

/* ── Contrast ─────────────────────────────────────────────────────────── */

function channel(hex: string, offset: number): number {
  const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function isLight(hex: string): boolean {
  return luminance(hex) > 0.5;
}

/* ── Rendering ────────────────────────────────────────────────────────── */

const FONT_STACKS: Record<FontChoice, string> = {
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  serif: "var(--font-serif), ui-serif, Georgia, serif",
  display: "var(--font-display), var(--font-serif), ui-serif, Georgia, serif",
  mono: "var(--font-geist-mono), ui-monospace, monospace",
};

const DENSITY: Record<Density, { gap: string; body: string; lead: string }> = {
  compact: { gap: "2rem", body: "14px", lead: "1.6" },
  normal: { gap: "2.75rem", body: "15px", lead: "1.7" },
  spacious: { gap: "3.75rem", body: "16px", lead: "1.85" },
};

const RADII: Record<Corners, string> = {
  square: "0px",
  soft: "6px",
  round: "14px",
};

/**
 * The theme as inline custom properties.
 *
 * Everything downstream reads `var(--p-*)`, so a template never needs a class
 * name generated for it and Tailwind never needs to know these values exist.
 */
export function themeVars(theme: ProposalTheme): React.CSSProperties {
  const d = DENSITY[theme.density];

  return {
    "--p-paper": theme.paper,
    "--p-ink": theme.ink,
    "--p-accent": theme.accent,
    // Derived rather than specified: three colours are enough for a model to
    // reason about, and mixing keeps the tints in the same family.
    "--p-muted": `color-mix(in oklab, ${theme.ink} 58%, ${theme.paper})`,
    "--p-rule": `color-mix(in oklab, ${theme.ink} 14%, ${theme.paper})`,
    "--p-accent-soft": `color-mix(in oklab, ${theme.accent} 12%, ${theme.paper})`,
    "--p-heading-font": FONT_STACKS[theme.heading_font],
    "--p-body-font": FONT_STACKS[theme.body_font],
    "--p-gap": d.gap,
    "--p-body-size": d.body,
    "--p-lead": d.lead,
    "--p-radius": RADII[theme.corners],
  } as React.CSSProperties;
}
