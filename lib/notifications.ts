import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The notification store.
 *
 * Written only from the server. There is no insert policy for the browser on
 * purpose: a client that can create its own notifications can fake a message
 * that looks like it came from the product, and the bell is exactly the
 * surface a person trusts without reading closely.
 */

export type NotificationKind =
  | "proposal_opened"
  | "proposal_reopened"
  | "follow_up_due"
  | "meeting_processed"
  | "meeting_failed"
  | "starter_proposal_ready"
  | "deal_created";

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  /**
   * When set, at most one unread notification with this key exists at a time.
   * A client opening a proposal six times in an afternoon is one thing worth
   * knowing about, not six.
   */
  dedupeKey?: string;
}

/** Kinds a person can switch off. The rest are consequential enough to keep. */
const OPTIONAL_KINDS: NotificationKind[] = [
  "proposal_opened",
  "proposal_reopened",
  "follow_up_due",
  "meeting_processed",
];

export async function notify(input: NotifyInput): Promise<void> {
  const supabase = createAdminClient();

  if (OPTIONAL_KINDS.includes(input.kind)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("notification_prefs")
      .eq("id", input.userId)
      .maybeSingle();

    const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
    // `proposal_reopened` follows the `proposal_opened` switch: they are the
    // same event to a person, and two toggles for one idea is a bad setting.
    const key =
      input.kind === "proposal_reopened" ? "proposal_opened" : input.kind;
    if (prefs[key] === false) return;
  }

  if (input.dedupeKey) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", input.userId)
      .eq("kind", input.kind)
      .eq("entity_id", input.entityId ?? null)
      .is("read_at", null)
      .limit(1);

    if (existing && existing.length > 0) return;
  }

  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  });

  // A failed notification must never fail the thing that caused it. Losing a
  // bell badge is recoverable; losing a processed transcript is not.
  if (error) {
    console.error("[notifications] insert failed:", error.message);
  }
}

/** The bell's badge. Capped so a neglected account doesn't render "1,284". */
export const UNREAD_CAP = 99;
