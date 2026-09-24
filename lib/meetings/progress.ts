import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a finished call is on its way to becoming a deal.
 *
 * Written by the server at each step so the page can show what is actually
 * happening, instead of a spinner and a guess. Stored as one jsonb column so
 * the whole state arrives in a single realtime event.
 */
export type ProcessingStage =
  | "queued"
  | "transcript"
  | "reading"
  | "writing"
  | "done"
  | "failed";

export interface MeetingProgress {
  stage: ProcessingStage;
  /** When the call ended, or the transcript was imported. */
  started_at: string;
  /** When the current stage began. */
  stage_at: string;
  /** Minutes Recall has been asked and said "not yet". Shown after a while. */
  waits?: number;
}

export const STAGE_ORDER: ProcessingStage[] = ["queued", "transcript", "reading", "writing", "done"];

/** Honest range for the whole trip, call end to deal, shown to the user. */
export const TYPICAL_MINUTES = { low: 2, high: 5 };

/** Past this, the page says it is taking longer than usual and why. */
export const SLOW_AFTER_MINUTES = 10;

export function nextProgress(
  previous: MeetingProgress | null | undefined,
  stage: ProcessingStage,
  extra: Partial<MeetingProgress> = {}
): MeetingProgress {
  const now = new Date().toISOString();
  return {
    started_at: previous?.started_at ?? now,
    waits: previous?.waits,
    ...extra,
    stage,
    stage_at: now,
  };
}

/**
 * Record a stage. Never throws: progress is a courtesy to the person watching,
 * and a failed write here (including the column not existing yet, before its
 * migration is applied) must never fail the work it describes.
 */
export async function writeProgress(
  supabase: SupabaseClient,
  meetingId: string,
  progress: MeetingProgress
): Promise<void> {
  try {
    const { error } = await supabase.from("meetings").update({ progress }).eq("id", meetingId);
    if (error) console.warn("[progress] not recorded:", error.message);
  } catch (err) {
    console.warn("[progress] not recorded:", err);
  }
}
