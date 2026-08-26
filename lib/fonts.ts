import { Instrument_Serif, Source_Serif_4 } from "next/font/google";

/**
 * Serif faces for proposal templates.
 *
 * Kept out of the root layout deliberately. next/font emits its CSS on the
 * routes that import it, so applying these in the proposal layouts alone means
 * the dashboard and pipeline never download a face they cannot use.
 */

export const displaySerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const bodySerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

/** Apply to a wrapper around anything that renders a themed proposal. */
export const proposalFontVars = `${displaySerif.variable} ${bodySerif.variable}`;
