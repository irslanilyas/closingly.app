import {
  Cog6ToothIcon,
  PaperAirplaneIcon,
  PresentationChartLineIcon,
  Squares2X2Icon,
  VideoCameraIcon,
  ViewColumnsIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { Icon } from "@/lib/icon";
import { isFounder } from "@/lib/founders";

export interface NavItem {
  href: string;
  label: string;
  Icon: Icon;
  /** Read by the topbar so the page never has to repeat its own name. */
  section: string;
  /**
   * On the bottom bar below the rail breakpoint. Everything that is not lives
   * in the account menu there, so the bar holds only the places work happens.
   */
  bar: boolean;
}

/**
 * The destinations, in the order the work moves through them: a call happens,
 * it becomes a deal, the deal needs chasing, the whole thing is read back to
 * you, and settings sit at the end because they are visited once.
 */
const DESTINATIONS: NavItem[] = [
  { href: "/", label: "Dashboard", Icon: Squares2X2Icon, section: "Dashboard", bar: true },
  { href: "/meetings", label: "Meetings", Icon: VideoCameraIcon, section: "Meetings", bar: true },
  { href: "/pipeline", label: "Pipeline", Icon: ViewColumnsIcon, section: "Pipeline", bar: true },
  { href: "/follow-ups", label: "Follow-ups", Icon: PaperAirplaneIcon, section: "Follow-ups", bar: true },
  { href: "/intelligence", label: "Intelligence", Icon: PresentationChartLineIcon, section: "Intelligence", bar: true },
  { href: "/settings", label: "Account", Icon: Cog6ToothIcon, section: "Account", bar: false },
];

/** Internal build log. Founders only — not a beta tester's concern. */
const PROGRESS: NavItem = {
  href: "/progress",
  label: "Progress",
  Icon: WrenchScrewdriverIcon,
  section: "Progress",
  bar: false,
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
