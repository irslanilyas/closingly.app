"use client";

import {
  COLOR_DIRECTIONS,
  PROPOSAL_SECTIONS,
  type ColorDirection,
  type ProposalSection,
  type TypographyDirection,
} from "@/lib/onboarding/schema";

/**
 * A live sketch of the document being configured.
 *
 * It renders in the chosen palette and type direction, in the chosen section
 * order, with lorem-weight rules standing in for body copy — deliberately not
 * generated text, because showing invented prose here would imply the product
 * already knows what to say. It shows structure and feel, which is exactly
 * what the two questions on this screen control.
 */

const TYPE_STYLES: Record<
  TypographyDirection,
  { heading: string; body: string; headingWeight: number; tracking: string }
> = {
  modern_editorial: {
    // The display serif proposals are actually set in (loaded by
    // app/onboarding/layout.tsx), not the app's own heading face.
    heading: "var(--font-proposal-display), Georgia, serif",
    body: "var(--font-sans), system-ui, sans-serif",
    headingWeight: 400,
    tracking: "-0.02em",
  },
  clean_neutral: {
    heading: "var(--font-sans), system-ui, sans-serif",
    body: "var(--font-sans), system-ui, sans-serif",
    headingWeight: 600,
    tracking: "-0.02em",
  },
  classic_professional: {
    heading: "Georgia, 'Times New Roman', serif",
    body: "Georgia, 'Times New Roman', serif",
    headingWeight: 400,
    tracking: "0",
  },
  bold_confident: {
    heading: "var(--font-sans), system-ui, sans-serif",
    body: "var(--font-sans), system-ui, sans-serif",
    headingWeight: 700,
    tracking: "-0.035em",
  },
};

export function ProposalPreview({
  sections,
  colorDirection,
  typographyDirection,
}: {
  sections: ProposalSection[];
  colorDirection: ColorDirection;
  typographyDirection: TypographyDirection;
}) {
  const palette = COLOR_DIRECTIONS.find((c) => c.value === colorDirection);
  const [ink, paper] = palette?.swatch ?? ["#1b1a18", "#f6f1e8"];
  const type = TYPE_STYLES[typographyDirection];

  const ordered = PROPOSAL_SECTIONS.filter((s) =>
    sections.includes(s.value)
  ).slice(0, 6);

  return (
    <div className="lg:sticky lg:top-8">
      <div className="label mb-3">Your proposal</div>

      <div
        aria-label="Preview of your proposal layout"
        className="rounded-lg border border-border overflow-hidden"
        style={{ background: paper, color: ink }}
      >
        <div className="px-5 pt-6 pb-5 sm:px-6 sm:pt-7 sm:pb-6">
          <div
            style={{
              fontFamily: type.heading,
              fontWeight: type.headingWeight,
              letterSpacing: type.tracking,
            }}
            className="text-[20px] leading-[1.15]"
          >
            Proposal for [client]
          </div>
          <div
            style={{ fontFamily: type.body, opacity: 0.6 }}
            className="mt-1.5 text-[11.5px]"
          >
            Prepared by you
          </div>

          <div
            aria-hidden
            className="mt-5 h-px w-full"
            style={{ background: ink, opacity: 0.18 }}
          />

          <div className="mt-5 space-y-5">
            {ordered.map((section) => (
              <div key={section.value}>
                <div
                  style={{
                    fontFamily: type.heading,
                    fontWeight: type.headingWeight,
                    letterSpacing: type.tracking,
                  }}
                  className="text-[13px] leading-snug"
                >
                  {section.label}
                </div>
                {/* Rules, not sentences: the words come from the writing you
                    approve, never from a preview pretending to know them. */}
                <div aria-hidden className="mt-2 space-y-1.5">
                  {[100, 94, 72].map((width, i) => (
                    <div
                      key={i}
                      className="h-[3px] rounded-full"
                      style={{ width: `${width}%`, background: ink, opacity: 0.13 }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11.5px] text-muted-foreground leading-relaxed">
        Structure and feel only. The writing is generated after this step, and
        nothing is ever sent without you reading it first.
      </p>
    </div>
  );
}
