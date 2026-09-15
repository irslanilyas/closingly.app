import type { Attendee, MeetingPlatform } from "@/lib/types";

interface GoogleEventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface GoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  /**
   * default | outOfOffice | focusTime | workingLocation | birthday | fromGmail.
   * The single most useful field for telling a client call from a flight
   * confirmation, and Google fills it in reliably.
   */
  eventType?: string;
  transparency?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  attendees?: Attendee[];
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
}

export interface NormalisedEvent {
  google_event_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  attendees: Attendee[];
  meet_link: string | null;
  platform: MeetingPlatform | null;
  event_type: string | null;
  /** Whether this looks like a call worth offering the notetaker for. */
  is_call: boolean;
  /** Why not, when it is not. Shown to the user rather than hidden. */
  not_call_reason: string | null;
}

export async function fetchCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events"
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true"); // expand recurring series
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "100");
  url.searchParams.set("conferenceDataVersion", "1"); // required for entryPoints

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Google Calendar request failed (${res.status}): ${await res.text()}`
    );
  }

  const data = (await res.json()) as { items?: GoogleCalendarEvent[] };
  return data.items ?? [];
}

/**
 * Where the meeting link hides, in priority order. Google is inconsistent about
 * this: properly-created Meet events populate `conferenceData`, older ones only
 * have `hangoutLink`, and Zoom/Teams invites usually paste the URL into
 * `location` or the description.
 */
function extractMeetLink(event: GoogleCalendarEvent): string | null {
  const video = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video"
  );
  if (video?.uri) return video.uri;

  if (event.hangoutLink) return event.hangoutLink;

  if (event.location) {
    const match = event.location.match(
      /https?:\/\/[^\s]*(meet\.google\.com|zoom\.us|teams\.microsoft\.com)[^\s]*/i
    );
    if (match) return match[0];
  }

  return null;
}

function detectPlatform(link: string | null): MeetingPlatform | null {
  if (!link) return null;
  if (link.includes("meet.google.com")) return "google_meet";
  if (link.includes("zoom.us")) return "zoom";
  if (link.includes("teams.microsoft.com")) return "teams";
  return "other";
}

/* ── Is this actually a call? ──────────────────────────────────────────────
   A calendar is mostly not meetings. Flight confirmations, birthdays, focus
   blocks and personal reminders all sit in the same feed as the four client
   calls that matter, and showing them together buries the ones worth
   recording.

   Nothing is dropped. Each entry is classified and the reason recorded, so a
   real call the rules get wrong is still findable rather than silently gone. */

/** Google fills eventType in reliably, and these are never client calls. */
const NON_MEETING_EVENT_TYPES: Record<string, string> = {
  outOfOffice: "Out of office",
  focusTime: "Focus time",
  workingLocation: "Working location",
  birthday: "Birthday",
  fromGmail: "Added automatically from Gmail",
};

/** A meeting has other people in it. One attendee is the organiser alone. */
const MIN_ATTENDEES_FOR_CALL = 2;

interface CallVerdict {
  is_call: boolean;
  reason: string | null;
}

export function classifyEvent(
  event: {
    eventType?: string;
    transparency?: string;
    attendees?: Attendee[];
    summary?: string;
  },
  meetLink: string | null
): CallVerdict {
  const typeReason = event.eventType
    ? NON_MEETING_EVENT_TYPES[event.eventType]
    : undefined;
  if (typeReason) return { is_call: false, reason: typeReason };

  const attendees = event.attendees ?? [];

  // The user turned this down. It is on the calendar but it is not their call.
  if (attendees.some((a) => a.self && a.responseStatus === "declined")) {
    return { is_call: false, reason: "You declined this" };
  }

  // A join link is the strongest possible signal and outranks everything else:
  // a one-to-one where the client never accepted still has a link.
  if (meetLink) return { is_call: true, reason: null };

  if (attendees.length >= MIN_ATTENDEES_FOR_CALL) {
    return { is_call: true, reason: null };
  }

  // Free-marked time with nobody else in it is a personal block, not a call.
  if (event.transparency === "transparent") {
    return { is_call: false, reason: "Marked free, no attendees" };
  }

  return { is_call: false, reason: "No call link and nobody else invited" };
}

/**
 * Drops all-day entries and cancelled events, then classifies the rest.
 *
 * All-day items are holidays, birthdays and OOO blocks — never a client call,
 * and unlike the classified-out entries below there is nothing recoverable
 * about them, so they are dropped outright.
 */
export function normaliseEvents(
  events: GoogleCalendarEvent[]
): NormalisedEvent[] {
  const out: NormalisedEvent[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;
    if (!event.start?.dateTime) continue;

    const meetLink = extractMeetLink(event);
    const verdict = classifyEvent(event, meetLink);

    out.push({
      google_event_id: event.id,
      title: event.summary ?? "Untitled meeting",
      starts_at: new Date(event.start.dateTime).toISOString(),
      ends_at: event.end?.dateTime
        ? new Date(event.end.dateTime).toISOString()
        : null,
      attendees: event.attendees ?? [],
      meet_link: meetLink,
      platform: detectPlatform(meetLink),
      event_type: event.eventType ?? null,
      is_call: verdict.is_call,
      not_call_reason: verdict.reason,
    });
  }

  return out;
}
