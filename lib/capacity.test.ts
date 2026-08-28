import { describe, expect, it } from "vitest";
import { computeCapacityWeeks } from "@/lib/capacity";

const MONDAY = new Date("2026-03-02T12:00:00Z"); // a Monday

describe("computeCapacityWeeks", () => {
  it("spreads hours evenly across the deal's weeks", () => {
    const weeks = computeCapacityWeeks(
      [
        {
          id: "1",
          estimated_hours: 60,
          start_date: "2026-03-02",
          target_end_date: "2026-03-15", // 2 weeks, Mon-to-Mon inclusive
        },
      ],
      30,
      4,
      MONDAY
    );

    expect(weeks[0].hours_committed).toBe(30);
    expect(weeks[1].hours_committed).toBe(30);
    expect(weeks[2].hours_committed).toBe(0);
  });

  it("flags a week as over capacity when committed hours exceed it", () => {
    const weeks = computeCapacityWeeks(
      [
        {
          id: "1",
          estimated_hours: 50,
          start_date: "2026-03-02",
          target_end_date: "2026-03-02",
        },
      ],
      30,
      2,
      MONDAY
    );

    expect(weeks[0].over_capacity).toBe(true);
    expect(weeks[1].over_capacity).toBe(false);
  });

  it("sums overlapping deals in the same week", () => {
    const weeks = computeCapacityWeeks(
      [
        { id: "1", estimated_hours: 20, start_date: "2026-03-02", target_end_date: "2026-03-02" },
        { id: "2", estimated_hours: 15, start_date: "2026-03-02", target_end_date: "2026-03-02" },
      ],
      30,
      1,
      MONDAY
    );

    expect(weeks[0].hours_committed).toBe(35);
    expect(weeks[0].over_capacity).toBe(true);
  });

  it("ignores a deal whose dates fall entirely outside the lookahead window", () => {
    const weeks = computeCapacityWeeks(
      [
        {
          id: "1",
          estimated_hours: 40,
          start_date: "2025-01-06",
          target_end_date: "2025-01-13",
        },
      ],
      30,
      4,
      MONDAY
    );

    expect(weeks.every((w) => w.hours_committed === 0)).toBe(true);
  });
});
