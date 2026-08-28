/**
 * Gates the internal "Progress" page. Not a security boundary for anything
 * sensitive — it's a build log, not customer data — but it shouldn't show up
 * in a beta tester's nav next to their actual client work.
 */
export const FOUNDER_EMAILS = [
  "irslanilyas6@gmail.com",
  "atifsajjad32@gmail.com",
];

export function isFounder(email: string | null | undefined): boolean {
  return !!email && FOUNDER_EMAILS.includes(email.toLowerCase());
}
