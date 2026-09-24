import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildContext } from "@/lib/ask/retrieve";
import { buildSnapshots } from "@/lib/follow-ups/snapshot";
import { daysSince, engagementOf, nextActionOf, ENGAGEMENT_LABELS } from "@/lib/deal-signals";
import { field } from "@/lib/validate";
import { STAGE_LABELS, STAGE_ORDER, type DealStage } from "@/lib/types";
import { ACTIONS, describeActionTool, type ActionKind } from "./actions";
import type { LinkPart } from "./parts";

/**
 * The agent's tools.
 *
 * Three kinds. Reads run on their own and return data. Writes never run here:
 * they become action cards (see ./actions). Navigation hands the person a
 * button that takes them somewhere in the app, including the product tour.
 */

export type ToolKind = "read" | "write" | "navigate";

interface Ctx {
  supabase: SupabaseClient;
  userId: string;
}

const TRANSCRIPT_EXCERPT = 1200;

/* ── Reads ────────────────────────────────────────────────────────────── */

const reads = {
  search_workspace: {
    label: "Searching your workspace",
    description:
      "Keyword search across the person's deals (client, company, what they need, budget, timeline), the calls on the matching deals (with a transcript excerpt), open follow-ups, and a summary of the whole pipeline. Start here for any question about a client or the pipeline.",
    schema: z.object({ query: z.string().min(1).max(300) }),
    async run(ctx: Ctx, { query }: { query: string }) {
      const context = await buildContext(ctx.supabase, ctx.userId, query);
      return {
        ...context,
        meetings: context.meetings.map((m) => ({
          ...m,
          transcript: typeof m.transcript === "string" ? m.transcript.slice(0, TRANSCRIPT_EXCERPT) : null,
        })),
      };
    },
  },

  list_deals: {
    label: "Reading your pipeline",
    description:
      "List deals with their stage, value, days in stage, how engaged the client is with the proposal, and what the follow-up rules say to do next. Filter by stage, or 'open' for everything not won or lost.",
    schema: z.object({
      stage: z.enum(["open", "all", ...STAGE_ORDER] as [string, ...string[]]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async run(ctx: Ctx, { stage = "open", limit = 25 }: { stage?: string; limit?: number }) {
      const snapshots = await buildSnapshots(ctx.supabase, ctx.userId, { includeClosed: stage !== "open" });
      return snapshots
        .filter((s) =>
          stage === "all" ? true : stage === "open" ? s.stage !== "won" && s.stage !== "lost" : s.stage === stage
        )
        .slice(0, limit)
        .map((s) => ({
          deal_id: s.id,
          name: s.client_company || s.client_name || "Untitled",
          contact: s.client_name,
          email: s.client_email,
          stage: STAGE_LABELS[s.stage],
          value: s.proposed_amount,
          days_in_stage: daysSince(s.stage_entered_at),
          engagement: ENGAGEMENT_LABELS[engagementOf(s)],
          next_action: nextActionOf(s)?.reason ?? null,
        }));
    },
  },

  get_deal: {
    label: "Opening the deal",
    description:
      "Everything about one deal: details, its latest proposal (with id, whether it's shared, and how the client has read it), the open follow-up, recent notes (with ids) and the last call.",
    schema: z.object({ deal_id: field.id }),
    async run(ctx: Ctx, { deal_id }: { deal_id: string }) {
      const [{ data: deal }, { data: proposal }, { data: followUp }, { data: notes }, { data: meeting }] =
        await Promise.all([
          ctx.supabase
            .from("deals")
            .select("id, client_name, client_company, client_email, stage, proposed_amount, pain_point, budget_signal, timeline, decision_maker, fit_score, competitor_mentioned, estimated_hours, start_date, target_end_date, created_at, updated_at")
            .eq("id", deal_id)
            .maybeSingle(),
          ctx.supabase
            .from("proposals")
            .select("id, status, share_token, shared_at, created_at, proposal_views(count)")
            .eq("deal_id", deal_id)
            .eq("kind", "client")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          ctx.supabase
            .from("follow_ups")
            .select("id, kind, reason, priority, status, due_at, draft_subject")
            .eq("deal_id", deal_id)
            .in("status", ["open", "snoozed"])
            .order("priority")
            .limit(1)
            .maybeSingle(),
          ctx.supabase
            .from("deal_notes")
            .select("id, body, is_private, created_at")
            .eq("deal_id", deal_id)
            .order("created_at", { ascending: false })
            .limit(5),
          ctx.supabase
            .from("meetings")
            .select("id, title, starts_at, meeting_kind")
            .eq("deal_id", deal_id)
            .order("starts_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
      if (!deal) return { error: "No deal with that id in this workspace." };
      const views = (proposal?.proposal_views as Array<{ count: number }> | undefined)?.[0]?.count ?? 0;
      return {
        deal: { ...deal, stage: STAGE_LABELS[deal.stage as DealStage] },
        proposal: proposal
          ? { id: proposal.id, status: proposal.status, shared: !!proposal.share_token, shared_at: proposal.shared_at, times_opened: views }
          : null,
        open_follow_up: followUp ?? null,
        notes: notes ?? [],
        last_call: meeting ?? null,
      };
    },
  },

  list_follow_ups: {
    label: "Checking your follow-ups",
    description: "The follow-up queue: what is due, for which deal, and why. Includes ids for updating them.",
    schema: z.object({ status: z.enum(["open", "snoozed", "done", "all"]).optional() }),
    async run(ctx: Ctx, { status = "open" }: { status?: string }) {
      let query = ctx.supabase
        .from("follow_ups")
        .select("id, kind, reason, priority, status, due_at, snoozed_until, draft_subject, deal_id, deals(client_name, client_company)")
        .eq("user_id", ctx.userId)
        .order("priority")
        .order("due_at")
        .limit(25);
      if (status !== "all") query = query.eq("status", status);
      const { data } = await query;
      return (data ?? []).map((row) => {
        const deal = (Array.isArray(row.deals) ? row.deals[0] : row.deals) as { client_name: string | null; client_company: string | null } | null;
        return {
          follow_up_id: row.id,
          deal_id: row.deal_id,
          deal: deal?.client_company || deal?.client_name || null,
          reason: row.reason,
          priority: row.priority,
          status: row.status,
          due_at: row.due_at,
          has_draft: !!row.draft_subject,
        };
      });
    },
  },

  list_meetings: {
    label: "Looking at your calls",
    description: "Upcoming calls on the synced calendar (and whether the notetaker is switched on), or recent calls and what became of them.",
    schema: z.object({ when: z.enum(["upcoming", "recent"]) }),
    async run(ctx: Ctx, { when }: { when: "upcoming" | "recent" }) {
      const now = new Date().toISOString();
      let query = ctx.supabase
        .from("meetings")
        .select("id, title, starts_at, status, agent_enabled, meeting_kind, deal_id")
        .eq("user_id", ctx.userId)
        .limit(15);
      query =
        when === "upcoming"
          ? query.gte("starts_at", now).order("starts_at", { ascending: true })
          : query.lt("starts_at", now).order("starts_at", { ascending: false });
      const { data } = await query;
      return data ?? [];
    },
  },
} as const;

type ReadName = keyof typeof reads;

/* ── Navigation ───────────────────────────────────────────────────────── */

const PAGES = {
  dashboard: { href: "/", label: "Open the dashboard" },
  pipeline: { href: "/pipeline", label: "Open the pipeline" },
  follow_ups: { href: "/follow-ups", label: "Open follow-ups" },
  meetings: { href: "/meetings", label: "Open your calls" },
  intelligence: { href: "/intelligence", label: "Open insights" },
  settings: { href: "/settings", label: "Open settings" },
  tour: { href: "/tour", label: "Take the tour" },
} as const;

const navigate = {
  open_page: {
    description:
      "Give the person a button that opens a place in the app: a page, one deal (deal_id), or one proposal (proposal_id). Use page 'tour' when they ask how Closingly works or want a demo. The button appears under your reply; they choose whether to press it.",
    schema: z.object({
      page: z.enum(["dashboard", "pipeline", "follow_ups", "meetings", "intelligence", "settings", "tour", "deal", "proposal"]),
      deal_id: field.id.optional(),
      proposal_id: field.id.optional(),
      label: z.string().max(60).optional(),
    }),
  },
  sync_calendar: {
    description: "Give the person a button that pulls their latest Google Calendar events into Closingly now.",
    schema: z.object({}),
  },
} as const;


export function linkFor(name: keyof typeof navigate, input: unknown): LinkPart | { error: string } {
  if (name === "sync_calendar") return { type: "link", label: "Refresh my calendar", run: "sync_calendar" };
  const parsed = navigate.open_page.schema.safeParse(input);
  if (!parsed.success) return { error: "Invalid page." };
  const { page, deal_id, proposal_id, label } = parsed.data;
  if (page === "deal") {
    if (!deal_id) return { error: "deal_id is required for page 'deal'." };
    return { type: "link", label: label ?? "Open the deal", href: `/pipeline/${deal_id}` };
  }
  if (page === "proposal") {
    if (!proposal_id) return { error: "proposal_id is required for page 'proposal'." };
    return { type: "link", label: label ?? "Open the proposal", href: `/proposals/${proposal_id}` };
  }
  return { type: "link", label: label ?? PAGES[page].label, href: PAGES[page].href };
}

/* ── The tool list the model sees ─────────────────────────────────────── */

function inputSchema(schema: z.ZodType): Anthropic.Beta.BetaTool["input_schema"] {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Beta.BetaTool["input_schema"];
}

const WRITE_NOTE =
  " This does not change anything by itself: it shows the person a card to confirm, unless the tool result says it was done automatically.";

/** Stable order and content, so the tool block caches with the system prompt. */
export const AGENT_TOOLS: Anthropic.Beta.BetaTool[] = [
  ...(Object.keys(reads) as ReadName[]).map((name) => ({
    name,
    description: reads[name].description,
    input_schema: inputSchema(reads[name].schema),
    eager_input_streaming: true,
  })),
  ...(Object.keys(ACTIONS) as ActionKind[]).map((name) => {
    const { description, schema } = describeActionTool(name);
    return {
      name,
      description: description + WRITE_NOTE,
      input_schema: inputSchema(schema),
      eager_input_streaming: true,
    };
  }),
  ...(Object.keys(navigate) as Array<keyof typeof navigate>).map((name) => ({
    name,
    description: navigate[name].description,
    input_schema: inputSchema(navigate[name].schema),
    eager_input_streaming: true,
  })),
];

export function kindOfTool(name: string): ToolKind | null {
  if (Object.hasOwn(reads, name)) return "read";
  if (Object.hasOwn(ACTIONS, name)) return "write";
  if (Object.hasOwn(navigate, name)) return "navigate";
  return null;
}

export function readLabel(name: string): string {
  return Object.hasOwn(reads, name) ? (reads as Record<string, { label: string }>)[name].label : "Working";
}

export async function runRead(ctx: Ctx, name: string, input: unknown): Promise<unknown> {
  const spec = (reads as Record<string, { schema: z.ZodType; run: (ctx: Ctx, p: never) => Promise<unknown> }>)[name];
  const parsed = spec.schema.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }
  return spec.run(ctx, parsed.data as never);
}

export type NavigateName = keyof typeof navigate;
