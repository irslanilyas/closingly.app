import { describe, it, expect } from "vitest";
import { classifyEvent } from "./calendar";

const link = "https://meet.google.com/abc-defg-hij";

describe("classifyEvent", () => {
  it("keeps anything with a join link, even a one-to-one nobody accepted", () => {
    expect(
      classifyEvent({ attendees: [{ email: "me@x.com", self: true }] }, link)
        .is_call
    ).toBe(true);
  });

  it("keeps a meeting with other people but no link", () => {
    const verdict = classifyEvent(
      {
        attendees: [
          { email: "me@x.com", self: true },
          { email: "client@y.com" },
        ],
      },
      null
    );
    expect(verdict.is_call).toBe(true);
  });

  it("rejects a flight confirmation Google added from Gmail", () => {
    const verdict = classifyEvent(
      { eventType: "fromGmail", summary: "Flight to Bahrain (GF771)" },
      null
    );
    expect(verdict.is_call).toBe(false);
    expect(verdict.reason).toBe("Added automatically from Gmail");
  });

  it("rejects a birthday", () => {
    const verdict = classifyEvent(
      { eventType: "birthday", summary: "Happy birthday to soulmate" },
      null
    );
    expect(verdict.is_call).toBe(false);
    expect(verdict.reason).toBe("Birthday");
  });

  it("rejects focus time and out of office", () => {
    expect(classifyEvent({ eventType: "focusTime" }, null).is_call).toBe(false);
    expect(classifyEvent({ eventType: "outOfOffice" }, null).is_call).toBe(false);
  });

  it("rejects a call the user declined, even with a link", () => {
    const verdict = classifyEvent(
      {
        attendees: [
          { email: "me@x.com", self: true, responseStatus: "declined" },
          { email: "client@y.com" },
        ],
      },
      link
    );
    expect(verdict.is_call).toBe(false);
    expect(verdict.reason).toBe("You declined this");
  });

  it("rejects a solo block with no link and nobody else", () => {
    const verdict = classifyEvent({ attendees: [] }, null);
    expect(verdict.is_call).toBe(false);
    expect(verdict.reason).toContain("nobody else");
  });

  it("rejects free-marked personal time", () => {
    const verdict = classifyEvent(
      { transparency: "transparent", attendees: [{ email: "me@x.com", self: true }] },
      null
    );
    expect(verdict.is_call).toBe(false);
    expect(verdict.reason).toBe("Marked free, no attendees");
  });

  it("always gives a reason when it says no, and never when it says yes", () => {
    const no = classifyEvent({ eventType: "birthday" }, null);
    const yes = classifyEvent({ attendees: [] }, link);
    expect(no.reason).toBeTruthy();
    expect(yes.reason).toBeNull();
  });
});
