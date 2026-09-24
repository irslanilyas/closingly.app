import { describe, expect, it } from "vitest";
import type { Meeting } from "@/lib/types";
import { splitCalls } from "./split";

const NOW = Date.parse("2026-09-24T18:00:00Z");
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

function meeting(overrides: Partial<Meeting>): Meeting {
  return {
    id: "m",
    user_id: "u",
    deal_id: null,
    google_event_id: "evt",
    recall_bot_id: null,
    title: "Call",
    starts_at: at(60),
    ends_at: at(90),
    attendees: [],
    meet_link: "https://meet.google.com/abc",
    platform: "google_meet",
    agent_enabled: false,
    status: "scheduled",
    transcript: null,
    transcript_segments: null,
    transcript_fetched_at: null,
    recording_seconds: null,
    meeting_kind: null,
    is_call: true,
    event_type: null,
    not_call_reason: null,
    error: null,
    created_at: at(-1000),
    updated_at: at(-1000),
    ...overrides,
  } as Meeting;
}

const where = (m: Meeting) => {
  const { upcoming, past, other } = splitCalls([m], NOW);
  return upcoming.length ? "upcoming" : past.length ? "past" : other.length ? "other" : "none";
};

describe("splitCalls", () => {
  it("keeps a future call upcoming", () => {
    expect(where(meeting({}))).toBe("upcoming");
  });

  it("moves a recorded call to history as soon as its recording ends, even inside its slot", () => {
    for (const status of ["processing", "completed", "failed"] as const) {
      expect(where(meeting({ status, starts_at: at(-10), ends_at: at(20) }))).toBe("past");
    }
  });

  it("keeps a call that is being recorded upcoming, even past its calendar end", () => {
    expect(where(meeting({ status: "recording", starts_at: at(-90), ends_at: at(-30) }))).toBe("upcoming");
  });

  it("moves an unrecorded call to history once its slot and a short overrun are over", () => {
    expect(where(meeting({ status: "bot_scheduled", starts_at: at(-60), ends_at: at(-10) }))).toBe("upcoming");
    expect(where(meeting({ status: "bot_scheduled", starts_at: at(-60), ends_at: at(-16) }))).toBe("past");
  });

  it("assumes an hour when the event has no end time", () => {
    expect(where(meeting({ starts_at: at(-50), ends_at: null }))).toBe("upcoming");
    expect(where(meeting({ starts_at: at(-80), ends_at: null }))).toBe("past");
  });

  it("files imports under history and non-calls under other", () => {
    expect(where(meeting({ google_event_id: null, transcript: "x" }))).toBe("past");
    expect(where(meeting({ is_call: false }))).toBe("other");
  });
});
