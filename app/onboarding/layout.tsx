import { proposalFontVars } from "@/lib/fonts";

/**
 * Setup previews how proposals will look, so the proposal serif faces have to
 * resolve here too; like the proposal routes, only this route downloads them.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={proposalFontVars}>{children}</div>;
}
