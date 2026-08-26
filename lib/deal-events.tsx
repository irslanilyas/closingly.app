import type { DealEvent, DealEventKind } from "@/lib/types";
import {
  ArrowRight,
  CircleDot,
  Eye,
  FileText,
  Link2,
  Mail,
  Mic,
  StickyNote,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for how a deal event is presented.
 *
 * This existed twice before: the activity panel had icons and rich labels,
 * and the dashboard had a stripped copy of the same labels with no icons at
 * all — so the same event rendered differently depending on which page you
 * happened to be looking at. Adding a ninth event kind meant remembering to
 * edit both. Now the two call sites differ only in layout, never in meaning.
 */

/**
 * `tone` drives the icon's colour. Deliberately semantic rather than
 * decorative: the two events that represent a *client* doing something
 * (opening a proposal, the deal advancing) are the ones worth spotting in a
 * glance down the feed, so only those carry the accent.
 */
export type EventTone = "accent" | "neutral";

interface EventPresentation {
  Icon: LucideIcon;
  label: React.ReactNode;
  tone: EventTone;
}

const ICONS: Record<DealEventKind, LucideIcon> = {
  created: CircleDot,
  stage_changed: ArrowRight,
  meeting_recorded: Mic,
  proposal_drafted: FileText,
  proposal_shared: Link2,
  proposal_viewed: Eye,
  followup_generated: Mail,
  note_added: StickyNote,
};

/**
 * @param emphasis `"rich"` returns JSX with the changed value bolded, for the
 * roomy deal-page timeline. `"plain"` returns a flat string for the narrow
 * dashboard rail, where nested markup fights the truncation.
 */
export function describeDealEvent(
  event: DealEvent,
  emphasis: "rich" | "plain" = "rich"
): EventPresentation {
  const Icon = ICONS[event.kind] ?? CircleDot;
  const strong = (text: string) =>
    emphasis === "rich" ? <strong className="font-medium">{text}</strong> : text;

  switch (event.kind) {
    case "meeting_recorded":
      return {
        Icon,
        tone: "neutral",
        label: <>Recorded {strong(event.to_value ?? "a meeting")}</>,
      };
    case "proposal_drafted":
      return {
        Icon,
        tone: "neutral",
        label: (
          <>
            Proposal drafted
            {event.to_value ? <> — {strong(event.to_value)}</> : null}
          </>
        ),
      };
    case "proposal_shared":
      return { Icon, tone: "neutral", label: "Share link created" };
    case "proposal_viewed":
      // The client actually opened it — the single most useful signal here.
      return { Icon, tone: "accent", label: "Client opened the proposal" };
    case "stage_changed":
      return {
        Icon,
        tone: "accent",
        label: <>Moved to {strong(event.to_value ?? "a new stage")}</>,
      };
    case "followup_generated":
      return { Icon, tone: "neutral", label: "Follow-up drafted" };
    case "note_added":
      return { Icon, tone: "neutral", label: "Note added" };
    case "created":
      return { Icon, tone: "neutral", label: "Deal created" };
    default:
      // Unreachable as far as the type system is concerned — the cases above
      // cover every DealEventKind. Kept because the *database* can hand us a
      // kind this build doesn't know about yet (a migration lands before a
      // deploy), and a missing label should degrade to something readable
      // rather than crash the feed.
      return {
        Icon,
        tone: "neutral",
        label:
          event.to_value ?? String(event.kind).replace(/_/g, " "),
      };
  }
}
