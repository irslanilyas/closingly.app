import type { Meeting } from "@/lib/types";

/** Calls often run over; one still inside this after its end stays upcoming. */
export const OVERRUN_GRACE_MINUTES = 15;

/** A calendar event with no end time is assumed to last this long. */
const ASSUMED_LENGTH_MINUTES = 60;

/** Statuses that mean the notetaker has already done its part. */
const FINISHED = new Set<Meeting["status"]>(["processing", "completed", "failed"]);

/**
 * Where a meeting belongs on the calls page.
 *
 * "Upcoming" means there is still something to do before or during the call:
 * a call being recorded right now stays, a call that has been recorded moves
 * to History the moment its recording ends, and one that was never recorded
 * moves once its calendar slot (plus a little overrun) is over.
 */
export function splitCalls(meetings: Meeting[], now: number) {
  const upcoming: Meeting[] = [];
  const past: Meeting[] = [];
  const other: Meeting[] = [];

  for (const m of meetings) {
    if (m.is_call === false) {
      other.push(m);
      continue;
    }
    // An imported transcript is always history: it was pasted after the fact.
    if (!m.google_event_id || FINISHED.has(m.status)) {
      past.push(m);
      continue;
    }
    if (m.status === "recording") {
      upcoming.push(m);
      continue;
    }
    const starts = m.starts_at ? new Date(m.starts_at).getTime() : 0;
    const ends = m.ends_at
      ? new Date(m.ends_at).getTime()
      : starts + ASSUMED_LENGTH_MINUTES * 60_000;
    if (ends + OVERRUN_GRACE_MINUTES * 60_000 > now) upcoming.push(m);
    else past.push(m);
  }

  // Upcoming reads forward in time; history reads backward from today.
  upcoming.sort(
    (a, b) => new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime()
  );

  return { upcoming, past, other };
}
