import { describe, expect, it } from "vitest";
import { parseTranscriptSegments } from "@/lib/recall";

describe("parseTranscriptSegments", () => {
  // Shape confirmed against a live Recall payload: the display name is on
  // `participant`, and reading `speaker` instead labels every line "Speaker".
  it("takes the speaker name from participant.name", () => {
    const out = parseTranscriptSegments([
      {
        participant: { id: 100, name: "Atif Sajjad", is_host: false },
        words: [{ text: "hello", start_timestamp: { relative: 1 }, end_timestamp: { relative: 2 } }],
      },
      {
        participant: { id: 101, name: "Stephane Nasser", is_host: true },
        words: [{ text: "hi", start_timestamp: { relative: 2 }, end_timestamp: { relative: 3 } }],
      },
    ]);

    expect(out.map((s) => s.speaker)).toEqual(["Atif Sajjad", "Stephane Nasser"]);
  });

  it("falls back to a bare speaker field when participant is absent", () => {
    const out = parseTranscriptSegments([
      { speaker: "Legacy Name", words: [{ text: "still works" }] },
    ]);
    expect(out[0].speaker).toBe("Legacy Name");
  });

  it("reads the nested { relative } timestamp shape", () => {
    const out = parseTranscriptSegments([
      {
        participant: { name: "Irslan" },
        words: [
          { text: "Hello", start_timestamp: { relative: 1.2 }, end_timestamp: { relative: 1.6 } },
          { text: "there", start_timestamp: { relative: 1.6 }, end_timestamp: { relative: 2.1 } },
        ],
      },
    ]);

    expect(out).toEqual([
      { speaker: "Irslan", start: 1.2, end: 2.1, text: "Hello there" },
    ]);
  });

  it("reads bare numeric timestamps", () => {
    const out = parseTranscriptSegments([
      {
        participant: { name: "Atif" },
        words: [
          { text: "Sure", start_timestamp: 4, end_timestamp: 4.5 },
          { text: "thing", start_timestamp: 4.5, end_timestamp: 5 },
        ],
      },
    ]);

    expect(out[0].start).toBe(4);
    expect(out[0].end).toBe(5);
  });

  it("keeps the text when timestamps are missing entirely", () => {
    const out = parseTranscriptSegments([
      { participant: { name: "Unknown" }, words: [{ text: "no" }, { text: "timing" }] },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("no timing");
    expect(out[0].start).toBe(0);
  });

  it("falls back to a generic speaker label", () => {
    const out = parseTranscriptSegments([{ words: [{ text: "anonymous" }] }]);
    expect(out[0].speaker).toBe("Speaker");
  });

  it("drops empty turns rather than rendering blank rows", () => {
    const out = parseTranscriptSegments([
      { participant: { name: "A" }, words: [] },
      { participant: { name: "B" }, words: [{ text: "   " }] },
      { participant: { name: "C" }, words: [{ text: "real" }] },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].speaker).toBe("C");
  });

  it("returns nothing for a payload that isn't an array", () => {
    expect(parseTranscriptSegments(null)).toEqual([]);
    expect(parseTranscriptSegments({ error: "nope" })).toEqual([]);
  });
});
