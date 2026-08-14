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
  location?: string;
  hangoutLink?: string;
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

/**
 * Drops all-day entries and cancelled events. All-day items are holidays,
 * birthdays and OOO blocks — never a client call, and they'd bury the real
 * meetings in noise.
 */
export function normaliseEvents(
  events: GoogleCalendarEvent[]
): NormalisedEvent[] {
  const out: NormalisedEvent[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;
    if (!event.start?.dateTime) continue;

    const meetLink = extractMeetLink(event);

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
    });
  }

  return out;
}
