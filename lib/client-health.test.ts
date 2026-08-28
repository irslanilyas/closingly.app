import { describe, expect, it } from "vitest";
import { computeClientHealth } from "@/lib/client-health";

const NOW = new Date("2026-03-15T12:00:00Z");

describe("computeClientHealth", () => {
  it("is healthy when recently active and the proposal was viewed", () => {
    const result = computeClientHealth({
      lastEventAt: "2026-03-14T12:00:00Z",
      hasSharedProposal: true,
      hasViewedProposal: true,
      now: NOW,
    });
    expect(result.level).toBe("healthy");
  });

  it("is at_risk when silent for over three weeks", () => {
    const result = computeClientHealth({
      lastEventAt: "2026-02-01T12:00:00Z",
      hasSharedProposal: true,
      hasViewedProposal: false,
      now: NOW,
    });
    expect(result.level).toBe("at_risk");
    expect(result.reasons.some((r) => r.includes("No activity"))).toBe(true);
  });

  it("penalizes a shared proposal that was never opened", () => {
    const withView = computeClientHealth({
      lastEventAt: "2026-03-13T12:00:00Z",
      hasSharedProposal: true,
      hasViewedProposal: true,
      now: NOW,
    });
    const withoutView = computeClientHealth({
      lastEventAt: "2026-03-13T12:00:00Z",
      hasSharedProposal: true,
      hasViewedProposal: false,
      now: NOW,
    });
    expect(withoutView.score).toBeLessThan(withView.score);
  });

  it("clamps score between 0 and 100", () => {
    const result = computeClientHealth({
      lastEventAt: "2020-01-01T12:00:00Z",
      hasSharedProposal: true,
      hasViewedProposal: false,
      now: NOW,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
