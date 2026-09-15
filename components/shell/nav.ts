import {
  LayoutDashboard,
  Mic,
  Columns3,
  Send,
  LineChart,
  Settings2,
  Hammer,
  type LucideIcon,
} from "lucide-react";
import { isFounder } from "@/lib/founders";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Read by the topbar so the page never has to repeat its own name. */
  section: string;
}

/**
 * The destinations, in the order the work moves through them: a call happens,
 * it becomes a deal, the deal needs chasing, the whole thing is read back to
 * you, and settings sit at the end because they are visited once.
 */
const DESTINATIONS: NavItem[] = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard, section: "Dashboard" },
  { href: "/meetings", label: "Meetings", Icon: Mic, section: "Meetings" },
  { href: "/pipeline", label: "Pipeline", Icon: Columns3, section: "Pipeline" },
  {
    href: "/follow-ups",
    label: "Follow-ups",
    Icon: Send,
    section: "Follow-ups",
  },
  {
    href: "/intelligence",
    label: "Intelligence",
    Icon: LineChart,
    section: "Intelligence",
  },
  { href: "/settings", label: "Account", Icon: Settings2, section: "Account" },
];

/** Internal build log. Founders only — not a beta tester's concern. */
const PROGRESS: NavItem = {
  href: "/progress",
  label: "Progress",
  Icon: Hammer,
  section: "Progress",
};

export function navFor(email: string | null | undefined): NavItem[] {
  return isFounder(email) ? [...DESTINATIONS, PROGRESS] : DESTINATIONS;
}

/** Exact for the root, prefix for everything else, so deal pages stay lit. */
export function isActive(href: string, path: string): boolean {
  return href === "/"
    ? path === "/"
    : path === href || path.startsWith(`${href}/`);
}

/**
 * What the topbar calls the current place. Routes that live under a
 * destination but aren't in the rail get their own name here.
 */
export function sectionFor(path: string, items: NavItem[]): string {
  if (path.startsWith("/proposals/")) return "Proposal";
  const match = items.find((i) => isActive(i.href, path));
  return match?.section ?? "Closingly";
}
