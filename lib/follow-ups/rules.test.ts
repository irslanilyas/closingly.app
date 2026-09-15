import { describe, it, expect } from "vitest";
import {
  raiseForDeal,
  raiseAll,
  UNOPENED_DAYS,
  OPENED_NO_REPLY_DAYS,
  STALLED_DAYS,
  LEAD_COLD_DAYS,
  WON_QUIET_DAYS,
  type DealSnapshot,
} from "./rules";

const NOW = new Date("2026-09-09T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

function deal(over: Partial<DealSnapshot> = {}): DealSnapshot {
  return {
    id: "d1",
    client_name: "Dana",
    client_company: "Acme",
    stage: "proposal_sent",
    proposed_amount: 12000,
    created_at: daysAgo(20),
    updated_at: daysAgo(1),
    last_activity_at: daysAgo(1),
    proposal: null,
    ...over,
  };
}

describe("proposal sent and never opened", () => {
  it("raises a chase once it has sat past the threshold", () => {
    const items = raiseForDeal(
      deal({
        proposal: {
          id: "p1",
          shared_at: daysAgo(UNOPENED_DAYS + 1),
          last_viewed_at: null,
          view_count: 0,
        },
      }),
      NOW
    );

    const chase = items.find((i) => i.kind === "proposal_chase");
    expect(chase).toBeDefined();
    expect(chase!.priority).toBe(1);
    expect(chase!.reason).toContain("Acme");
    expect(chase!.reason).toContain("never been opened");
  });

  it("stays quiet before the threshold", () => {
    const items = raiseForDeal(
      deal({
        proposal: {
          id: "p1",
          shared_at: daysAgo(1),
          last_viewed_at: null,
          view_count: 0,
        },
      }),
      NOW
    );
    expect(items.some((i) => i.kind === "proposal_chase")).toBe(false);
  });

  it("keys on the proposal so an hourly sweep raises it once", () => {
    const snapshot = deal({
      proposal: {
        id: "p1",
        shared_at: daysAgo(UNOPENED_DAYS + 1),
        last_viewed_at: null,
        view_count: 0,
      },
    });
    const a = raiseForDeal(snapshot, NOW);
    const b = raiseForDeal(snapshot, new Date(NOW.getTime() + 3_600_000));
    expect(a[0].dedupe_key).toBe(b[0].dedupe_key);
  });
});

describe("opened then silence", () => {
  it("is the highest priority item there is", () => {
    const items = raiseForDeal(
      deal({
        last_activity_at: daysAgo(9),
        proposal: {
          id: "p1",
          shared_at: daysAgo(8),
          last_viewed_at: daysAgo(OPENED_NO_REPLY_DAYS + 1),
          view_count: 3,
        },
      }),
      NOW
    );

    const nudge = items.find((i) => i.dedupe_key.startsWith("read_silence"));
    expect(nudge).toBeDefined();
    expect(nudge!.priority).toBe(1);
    expect(nudge!.reason).toContain("back 3 times");
  });

  it("does not fire when the deal moved after they read it", () => {
    const items = raiseForDeal(
      deal({
        last_activity_at: daysAgo(1),
        proposal: {
          id: "p1",
          shared_at: daysAgo(8),
          last_viewed_at: daysAgo(4),
          view_count: 2,
        },
      }),
      NOW
    );
    expect(items.some((i) => i.dedupe_key.startsWith("read_silence"))).toBe(
      false
    );
  });
});

describe("leads with no proposal", () => {
  it("raises once the conversation starts going cold", () => {
    const items = raiseForDeal(
      deal({
        stage: "lead",
        proposal: null,
        created_at: daysAgo(LEAD_COLD_DAYS + 1),
        last_activity_at: daysAgo(1),
      }),
      NOW
    );
    const item = items.find((i) => i.dedupe_key.startsWith("no_proposal"));
    expect(item?.priority).toBe(2);
  });

  it("leaves a fresh lead alone", () => {
    const items = raiseForDeal(
      deal({ stage: "lead", proposal: null, created_at: daysAgo(1), last_activity_at: daysAgo(1) }),
      NOW
    );
    expect(items).toHaveLength(0);
  });
});

describe("stalled deals", () => {
  it("raises when nothing has been recorded for a while", () => {
    const items = raiseForDeal(
      deal({ last_activity_at: daysAgo(STALLED_DAYS + 2) }),
      NOW
    );
    expect(items.some((i) => i.dedupe_key.startsWith("stalled"))).toBe(true);
  });

  it("falls back to created_at when a deal has no activity at all", () => {
    const items = raiseForDeal(
      deal({ last_activity_at: null, created_at: daysAgo(STALLED_DAYS + 2) }),
      NOW
    );
    expect(items.some((i) => i.dedupe_key.startsWith("stalled"))).toBe(true);
  });
});

describe("stage gates", () => {
  it("never chases a lost deal", () => {
    expect(
      raiseForDeal(
        deal({ stage: "lost", last_activity_at: daysAgo(90) }),
        NOW
      )
    ).toHaveLength(0);
  });

  it("checks in on won work that has gone quiet, at low priority", () => {
    const items = raiseForDeal(
      deal({ stage: "won", last_activity_at: daysAgo(WON_QUIET_DAYS + 1) }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("check_in");
    expect(items[0].priority).toBe(3);
  });

  it("leaves recently active won work alone", () => {
    expect(
      raiseForDeal(deal({ stage: "won", last_activity_at: daysAgo(2) }), NOW)
    ).toHaveLength(0);
  });
});

describe("raiseAll", () => {
  it("keeps only the most urgent item per deal", () => {
    // This deal is both stalled and sitting on an unopened proposal.
    const items = raiseAll(
      [
        deal({
          last_activity_at: daysAgo(STALLED_DAYS + 5),
          proposal: {
            id: "p1",
            shared_at: daysAgo(UNOPENED_DAYS + 5),
            last_viewed_at: null,
            view_count: 0,
          },
        }),
      ],
      NOW
    );

    expect(items).toHaveLength(1);
    expect(items[0].priority).toBe(1);
    expect(items[0].kind).toBe("proposal_chase");
  });

  it("returns the most urgent deals first", () => {
    const items = raiseAll(
      [
        deal({ id: "quiet", stage: "won", last_activity_at: daysAgo(WON_QUIET_DAYS + 1) }),
        deal({
          id: "urgent",
          proposal: {
            id: "p9",
            shared_at: daysAgo(UNOPENED_DAYS + 1),
            last_viewed_at: null,
            view_count: 0,
          },
        }),
      ],
      NOW
    );

    expect(items.map((i) => i.deal_id)).toEqual(["urgent", "quiet"]);
  });

  it("falls back to a generic name when the client was never captured", () => {
    const items = raiseAll(
      [
        deal({
          client_name: null,
          client_company: null,
          last_activity_at: daysAgo(STALLED_DAYS + 1),
        }),
      ],
      NOW
    );
    expect(items[0].reason).toContain("this client");
  });
});
