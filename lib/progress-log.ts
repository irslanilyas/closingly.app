import {
  Mic,
  Kanban,
  FileText,
  DollarSign,
  Sparkles,
  UserCog,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface ProgressSection {
  title: string;
  Icon: LucideIcon;
  items: string[];
}

/**
 * The internal "Progress" page's content. Plain data, not fetched from
 * anywhere — updated by hand each time a phase ships. Deliberately short
 * per line: this exists so a co-founder can scan it in a minute, not read it.
 */
export const PROGRESS_LOG: ProgressSection[] = [
  {
    title: "Meetings",
    Icon: Mic,
    items: [
      "Bot joins scheduled calls and transcribes automatically",
      "Or paste any transcript to import manually",
      "Auto-detects discovery calls vs internal syncs",
      "Self-heals if a bot's status gets stuck",
      "Hard cap on recording minutes — no runaway usage",
    ],
  },
  {
    title: "Pipeline",
    Icon: Kanban,
    items: [
      "Kanban, list, and forecast views",
      "Full activity timeline on every deal",
      "Five-stage tracking: Lead → Proposal → Negotiating → Won/Lost",
    ],
  },
  {
    title: "Proposals",
    Icon: FileText,
    items: [
      "AI drafts a proposal straight from the call",
      "Refine with a plain-language instruction",
      "Branded share links, with expiry",
      "Tracks which sections a client actually reads",
      "Multiple AI-generated visual templates",
      "Every edit versioned and undoable",
    ],
  },
  {
    title: "Pricing & scope",
    Icon: DollarSign,
    items: [
      "Price recommendations from your own deal history",
      "Scope-creep detector for new client requests",
      "Auto-drafted follow-up emails, several tones",
    ],
  },
  {
    title: "Deal intelligence",
    Icon: Sparkles,
    items: [
      "Client health flags deals going quiet",
      "Win/loss stats by proposal template",
      "Capacity forecast warns before you overcommit",
      "Loss post-mortems — private, no sugarcoating",
      "Case-study drafts from deals you win",
    ],
  },
  {
    title: "Account",
    Icon: UserCog,
    items: [
      "Google Calendar + Gmail sign-in",
      "Full data export, one file",
      "Permanent account deletion, typed confirmation required",
    ],
  },
  {
    title: "Security & reliability",
    Icon: ShieldCheck,
    items: [
      "Every user's data isolated at the database level (Row-Level Security)",
      "Rate limits on every AI feature — no runaway spend",
      "Webhook signatures verified, replay attacks rejected",
      "OAuth tokens never leave the server",
      "AI proposal designs are a fixed set of choices, never executable code",
      "Live error monitoring in production (Sentry)",
      "Automated tests gate every deploy",
      "IP addresses hashed, never stored raw",
    ],
  },
];
