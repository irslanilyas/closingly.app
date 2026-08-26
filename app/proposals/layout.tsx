import { proposalFontVars } from "@/lib/fonts";

/** Same font scoping as the public viewer, so the editor previews accurately. */
export default function ProposalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={proposalFontVars}>{children}</div>;
}
