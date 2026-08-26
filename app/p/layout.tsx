import { proposalFontVars } from "@/lib/fonts";

/**
 * Wraps the public share pages so template serif faces resolve here without
 * being downloaded on every other route.
 */
export default function PublicProposalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={proposalFontVars}>{children}</div>;
}
