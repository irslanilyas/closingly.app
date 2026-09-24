import { describe, expect, it } from "vitest";
import { isActionKind, parseAction, riskOf } from "@/lib/ask/actions";
import { AGENT_TOOLS, kindOfTool, linkFor } from "@/lib/ask/tools";
import { nextProgress } from "@/lib/meetings/progress";

const DEAL = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

describe("agent tools", () => {
  it("gives every tool a JSON schema object without the $schema key", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.input_schema.type).toBe("object");
      expect((tool.input_schema as Record<string, unknown>).$schema).toBeUndefined();
    }
  });

  it("sorts tools into reads, writes and navigation", () => {
    expect(kindOfTool("search_workspace")).toBe("read");
    expect(kindOfTool("update_deal")).toBe("write");
    expect(kindOfTool("open_page")).toBe("navigate");
    expect(kindOfTool("drop_database")).toBeNull();
  });

  it("marks deletions destructive and share links external", () => {
    expect(riskOf("delete_deal")).toBe("destructive");
    expect(riskOf("delete_note")).toBe("destructive");
    expect(riskOf("share_proposal")).toBe("external");
    expect(riskOf("update_deal")).toBe("safe");
  });

  it("rejects write input that does not fit the schema", () => {
    expect(parseAction("update_deal", { deal_id: "not-a-uuid", changes: {} }).ok).toBe(false);
    expect(parseAction("update_deal", { deal_id: DEAL, changes: { stage: "closed" } }).ok).toBe(false);
    expect(parseAction("update_deal", { deal_id: DEAL, changes: { stage: "won" } }).ok).toBe(true);
    expect(isActionKind("update_deal")).toBe(true);
    expect(isActionKind("toString")).toBe(false);
  });

  it("builds in-app links and refuses a deal link without an id", () => {
    expect(linkFor("open_page", { page: "tour" })).toMatchObject({ href: "/tour" });
    expect(linkFor("open_page", { page: "deal", deal_id: DEAL })).toMatchObject({ href: `/pipeline/${DEAL}` });
    expect(linkFor("open_page", { page: "deal" })).toHaveProperty("error");
    expect(linkFor("sync_calendar", {})).toMatchObject({ run: "sync_calendar" });
  });
});

describe("meeting progress", () => {
  it("keeps the start time across stages and stamps each stage", () => {
    const queued = nextProgress(null, "queued");
    const reading = nextProgress(queued, "reading");
    expect(reading.started_at).toBe(queued.started_at);
    expect(reading.stage).toBe("reading");
    expect(new Date(reading.stage_at).getTime()).toBeGreaterThanOrEqual(new Date(queued.stage_at).getTime());
  });
});
