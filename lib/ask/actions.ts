import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DealPatch } from "@/lib/deal-patch";
import { formatCurrency } from "@/lib/format";
import { field } from "@/lib/validate";
import { STAGE_LABELS, STAGE_ORDER, type DealStage } from "@/lib/types";

/**
 * Everything Ask Closingly can change, and nothing else.
 *
 * The agent never writes directly. A write tool call becomes an action: a
 * stored proposal with a before-and-after summary the person reads on a card.
 * Only when they confirm (or, in "act on safe changes" mode, when the action
 * is marked safe) does `execute` run, and it runs through the person's own
 * session, so row-level security bounds it exactly as if they had clicked the
 * button themselves. The agent can never do more than the person can.
 */

import type { ActionResult, ActionRisk, ActionSummary } from "./parts";
export type { ActionResult, ActionRisk, ActionSummary, ActionView } from "./parts";

interface ActionContext {
  supabase: SupabaseClient;
  userId: string;
}

interface ActionSpec<P> {
  description: string;
  schema: z.ZodType<P>;
  risk: ActionRisk;
  summarize: (ctx: ActionContext, params: P) => Promise<ActionSummary>;
  execute: (ctx: ActionContext, params: P) => Promise<ActionResult>;
}

class ActionError extends Error {}

const dealName = (d: { client_company?: string | null; client_name?: string | null } | null) =>
  d?.client_company || d?.client_name || "this deal";

async function readDeal(ctx: ActionContext, id: string) {
  const { data } = await ctx.supabase
    .from("deals")
    .select("id, client_name, client_company, client_email, stage, proposed_amount, timeline, budget_signal, decision_maker, estimated_hours, start_date, target_end_date, pain_point")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new ActionError("That deal doesn't exist, or isn't yours.");
  return data as Record<string, unknown> & { client_name: string | null; client_company: string | null };
}

const FIELD_LABELS: Record<string, string> = {
  stage: "Stage",
  proposed_amount: "Value",
  client_name: "Client",
  client_company: "Company",
  client_email: "Email",
  timeline: "Timeline",
  budget_signal: "Budget signal",
  decision_maker: "Decision maker",
  estimated_hours: "Estimated hours",
  start_date: "Start date",
  target_end_date: "Target end date",
  pain_point: "What they need",
};

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (key === "stage") return STAGE_LABELS[value as DealStage] ?? String(value);
  if (key === "proposed_amount") return formatCurrency(Number(value));
  return String(value);
}

const SNOOZE_DAYS = { tomorrow: 1, three_days: 3, next_week: 7, two_weeks: 14 } as const;

/* ── The registry ─────────────────────────────────────────────────────── */

const updateDeal: ActionSpec<{ deal_id: string; changes: Record<string, unknown> }> = {
  description:
    "Change a deal: its stage (lead, proposal_sent, negotiating, won, lost), value, contact details, timeline, budget signal, decision maker, hours or dates. Only the fields in `changes` are touched.",
  schema: z.object({
    deal_id: field.id,
    changes: z
      .object({
        stage: z.enum(STAGE_ORDER as [DealStage, ...DealStage[]]),
        proposed_amount: z.number().nonnegative(),
        client_name: z.string().max(200),
        client_company: z.string().max(200),
        client_email: z.string().max(320),
        timeline: z.string().max(1000),
        budget_signal: z.string().max(1000),
        decision_maker: z.string().max(500),
        estimated_hours: z.number().nonnegative(),
        start_date: z.string().max(10),
        target_end_date: z.string().max(10),
        pain_point: z.string().max(4000),
      })
      .partial(),
  }),
  risk: "safe",
  async summarize(ctx, { deal_id, changes }) {
    const deal = await readDeal(ctx, deal_id);
    const keys = Object.keys(changes);
    const name = dealName(deal);
    const title =
      keys.length === 1 && keys[0] === "stage"
        ? `Move ${name} to ${show("stage", changes.stage)}`
        : `Update ${name}`;
    return {
      title,
      fields: keys.map((key) => ({
        label: FIELD_LABELS[key] ?? key,
        before: show(key, deal[key]),
        after: show(key, changes[key]),
      })),
    };
  },
  async execute(ctx, { deal_id, changes }) {
    const parsed = DealPatch.safeParse(changes);
    if (!parsed.success) throw new ActionError("Those changes don't fit the deal's fields.");
    const deal = await readDeal(ctx, deal_id);
    const { error } = await ctx.supabase
      .from("deals")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", deal_id);
    if (error) throw new ActionError("The deal couldn't be saved.");
    if (parsed.data.stage && parsed.data.stage !== deal.stage) {
      await ctx.supabase.from("deal_events").insert({
        deal_id,
        user_id: ctx.userId,
        kind: "stage_changed",
        from_value: deal.stage as string,
        to_value: parsed.data.stage,
      });
    }
    return { message: `${dealName(deal)} updated.`, href: `/pipeline/${deal_id}` };
  },
};

const createDeal: ActionSpec<{
  client_name: string;
  client_company?: string;
  client_email?: string;
  pain_point?: string;
  proposed_amount?: number;
  stage?: DealStage;
}> = {
  description: "Add a new deal to the pipeline by hand, for a client who has no recorded call yet.",
  schema: z.object({
    client_name: z.string().min(1).max(200),
    client_company: z.string().max(200).optional(),
    client_email: z.string().max(320).optional(),
    pain_point: z.string().max(4000).optional(),
    proposed_amount: z.number().nonnegative().optional(),
    stage: z.enum(STAGE_ORDER as [DealStage, ...DealStage[]]).optional(),
  }),
  risk: "safe",
  async summarize(_ctx, p) {
    return {
      title: `Add ${p.client_company || p.client_name} to the pipeline`,
      fields: [
        { label: "Client", after: p.client_name },
        ...(p.client_company ? [{ label: "Company", after: p.client_company }] : []),
        ...(p.client_email ? [{ label: "Email", after: p.client_email }] : []),
        ...(p.proposed_amount != null ? [{ label: "Value", after: formatCurrency(p.proposed_amount) }] : []),
        { label: "Stage", after: show("stage", p.stage ?? "lead") },
      ],
    };
  },
  async execute(ctx, p) {
    const email = p.client_email?.trim();
    if (email && !z.email().safeParse(email).success) throw new ActionError("That email address doesn't look right.");
    const { data, error } = await ctx.supabase
      .from("deals")
      .insert({
        user_id: ctx.userId,
        client_name: p.client_name.trim(),
        client_company: p.client_company?.trim() || null,
        client_email: email || null,
        pain_point: p.pain_point?.trim() || null,
        proposed_amount: p.proposed_amount ?? null,
        stage: p.stage ?? "lead",
        source: "manual",
      })
      .select("id")
      .single();
    if (error || !data) throw new ActionError("The deal couldn't be created.");
    await ctx.supabase.from("deal_events").insert({ deal_id: data.id, user_id: ctx.userId, kind: "created" });
    return { message: `${p.client_company || p.client_name} is in your pipeline.`, href: `/pipeline/${data.id}` };
  },
};

const deleteDeal: ActionSpec<{ deal_id: string }> = {
  description: "Delete a deal permanently, with its proposal, notes and follow-ups. Only when the person explicitly asks for it.",
  schema: z.object({ deal_id: field.id }),
  risk: "destructive",
  async summarize(ctx, { deal_id }) {
    const deal = await readDeal(ctx, deal_id);
    return {
      title: `Delete ${dealName(deal)}`,
      detail: "Removes the deal, its proposal, notes and follow-ups. This can't be undone.",
    };
  },
  async execute(ctx, { deal_id }) {
    const deal = await readDeal(ctx, deal_id);
    const { error } = await ctx.supabase.from("deals").delete().eq("id", deal_id);
    if (error) throw new ActionError("The deal couldn't be deleted.");
    return { message: `${dealName(deal)} was deleted.`, href: "/pipeline" };
  },
};

const addNote: ActionSpec<{ deal_id: string; body: string; shareable?: boolean }> = {
  description:
    "Add a note to a deal. Private by default; set shareable only if the person says the note may be used in client-facing drafts.",
  schema: z.object({ deal_id: field.id, body: z.string().min(1).max(4000), shareable: z.boolean().optional() }),
  risk: "safe",
  async summarize(ctx, p) {
    const deal = await readDeal(ctx, p.deal_id);
    return {
      title: `Add a note to ${dealName(deal)}`,
      detail: p.body.length > 240 ? `${p.body.slice(0, 237)}...` : p.body,
      fields: [{ label: "Visibility", after: p.shareable ? "Usable in drafts" : "Private" }],
    };
  },
  async execute(ctx, p) {
    const deal = await readDeal(ctx, p.deal_id);
    const { error } = await ctx.supabase
      .from("deal_notes")
      .insert({ deal_id: p.deal_id, user_id: ctx.userId, body: p.body.trim(), is_private: !p.shareable });
    if (error) throw new ActionError("The note couldn't be saved.");
    await ctx.supabase.from("deal_events").insert({ deal_id: p.deal_id, user_id: ctx.userId, kind: "note_added" });
    return { message: `Note added to ${dealName(deal)}.`, href: `/pipeline/${p.deal_id}` };
  },
};

const deleteNote: ActionSpec<{ note_id: string }> = {
  description: "Delete one note permanently. Only when the person explicitly asks for it.",
  schema: z.object({ note_id: field.id }),
  risk: "destructive",
  async summarize(ctx, { note_id }) {
    const { data } = await ctx.supabase.from("deal_notes").select("body").eq("id", note_id).maybeSingle();
    if (!data) throw new ActionError("That note doesn't exist, or isn't yours.");
    const body = data.body as string;
    return { title: "Delete this note", detail: body.length > 200 ? `${body.slice(0, 197)}...` : body };
  },
  async execute(ctx, { note_id }) {
    const { error } = await ctx.supabase.from("deal_notes").delete().eq("id", note_id);
    if (error) throw new ActionError("The note couldn't be deleted.");
    return { message: "Note deleted." };
  },
};

const createFollowUp: ActionSpec<{ deal_id: string; reason: string; priority?: 1 | 2 | 3 }> = {
  description: "Put a follow-up for a deal into the queue, with the reason it's needed. Priority 1 is today.",
  schema: z.object({
    deal_id: field.id,
    reason: z.string().min(3).max(400),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  }),
  risk: "safe",
  async summarize(ctx, p) {
    const deal = await readDeal(ctx, p.deal_id);
    return {
      title: `Queue a follow-up for ${dealName(deal)}`,
      detail: p.reason,
      fields: [{ label: "When", after: { 1: "Today", 2: "This week", 3: "When you have time" }[p.priority ?? 2] }],
    };
  },
  async execute(ctx, p) {
    const deal = await readDeal(ctx, p.deal_id);
    const { error } = await ctx.supabase.from("follow_ups").insert({
      user_id: ctx.userId,
      deal_id: p.deal_id,
      kind: "custom",
      reason: p.reason.trim(),
      priority: p.priority ?? 2,
      due_at: new Date().toISOString(),
      source: "manual",
    });
    if (error) throw new ActionError("The follow-up couldn't be created.");
    return { message: `Follow-up queued for ${dealName(deal)}. Open the deal to write it.`, href: `/pipeline/${p.deal_id}` };
  },
};

const updateFollowUp: ActionSpec<{
  follow_up_id: string;
  action: "done" | "snooze" | "dismiss";
  snooze?: keyof typeof SNOOZE_DAYS;
}> = {
  description: "Mark a follow-up done, snooze it (tomorrow, three_days, next_week, two_weeks) or dismiss it.",
  schema: z.object({
    follow_up_id: field.id,
    action: z.enum(["done", "snooze", "dismiss"]),
    snooze: z.enum(["tomorrow", "three_days", "next_week", "two_weeks"]).optional(),
  }),
  risk: "safe",
  async summarize(ctx, p) {
    const { data } = await ctx.supabase
      .from("follow_ups")
      .select("reason, deals(client_name, client_company)")
      .eq("id", p.follow_up_id)
      .maybeSingle();
    if (!data) throw new ActionError("That follow-up doesn't exist, or isn't yours.");
    const deal = (Array.isArray(data.deals) ? data.deals[0] : data.deals) as { client_name: string | null; client_company: string | null } | null;
    const verb =
      p.action === "done"
        ? "Mark done"
        : p.action === "dismiss"
          ? "Dismiss"
          : `Snooze until ${{ tomorrow: "tomorrow", three_days: "in 3 days", next_week: "next week", two_weeks: "in 2 weeks" }[p.snooze ?? "three_days"]}`;
    return { title: `${verb}: follow-up for ${dealName(deal)}`, detail: data.reason as string };
  },
  async execute(ctx, p) {
    const patch: Record<string, unknown> =
      p.action === "snooze"
        ? {
            status: "snoozed",
            snoozed_until: new Date(Date.now() + SNOOZE_DAYS[p.snooze ?? "three_days"] * 86_400_000).toISOString(),
          }
        : { status: p.action === "done" ? "done" : "dismissed" };
    const { error } = await ctx.supabase.from("follow_ups").update(patch).eq("id", p.follow_up_id);
    if (error) throw new ActionError("The follow-up couldn't be updated.");
    return { message: "Follow-up updated.", href: "/follow-ups" };
  },
};

const shareProposal: ActionSpec<{ proposal_id: string }> = {
  description:
    "Create the client-facing link for a proposal, so it can be sent. Tracking starts when the client opens it.",
  schema: z.object({ proposal_id: field.id }),
  risk: "external",
  async summarize(ctx, { proposal_id }) {
    const { data } = await ctx.supabase
      .from("proposals")
      .select("id, share_token, deals(client_name, client_company)")
      .eq("id", proposal_id)
      .maybeSingle();
    if (!data) throw new ActionError("That proposal doesn't exist, or isn't yours.");
    const deal = (Array.isArray(data.deals) ? data.deals[0] : data.deals) as { client_name: string | null; client_company: string | null } | null;
    return {
      title: `Create the share link for ${dealName(deal)}'s proposal`,
      detail: data.share_token
        ? "It already has a link; this returns the same one."
        : "Anyone with the link can read the proposal. Nothing is sent: you send the link yourself.",
    };
  },
  async execute(ctx, { proposal_id }) {
    const { data: proposal } = await ctx.supabase
      .from("proposals")
      .select("id, deal_id, share_token")
      .eq("id", proposal_id)
      .maybeSingle();
    if (!proposal) throw new ActionError("That proposal doesn't exist, or isn't yours.");
    let token = proposal.share_token as string | null;
    if (!token) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const { error } = await ctx.supabase
        .from("proposals")
        .update({ share_token: token, shared_at: new Date().toISOString(), status: "shared" })
        .eq("id", proposal_id);
      if (error) throw new ActionError("The link couldn't be created.");
      await ctx.supabase.from("deal_events").insert({
        deal_id: proposal.deal_id,
        user_id: ctx.userId,
        kind: "proposal_shared",
        metadata: { proposal_id },
      });
    }
    return { message: "The share link is ready.", href: `/p/${token}` };
  },
};

export const ACTIONS = {
  update_deal: updateDeal,
  create_deal: createDeal,
  delete_deal: deleteDeal,
  add_note: addNote,
  delete_note: deleteNote,
  create_follow_up: createFollowUp,
  update_follow_up: updateFollowUp,
  share_proposal: shareProposal,
} as const;

export type ActionKind = keyof typeof ACTIONS;

export function isActionKind(name: string): name is ActionKind {
  return Object.hasOwn(ACTIONS, name);
}

/** Validated params, or a message the model can correct itself from. */
export function parseAction(kind: ActionKind, input: unknown) {
  const spec = ACTIONS[kind] as ActionSpec<unknown>;
  const parsed = spec.schema.safeParse(input);
  return parsed.success
    ? { ok: true as const, params: parsed.data }
    : { ok: false as const, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

export async function summarizeAction(ctx: ActionContext, kind: ActionKind, params: unknown): Promise<ActionSummary> {
  return (ACTIONS[kind] as ActionSpec<unknown>).summarize(ctx, params);
}

/** Runs a confirmed action. Throws only messages that are safe to show. */
export async function executeAction(ctx: ActionContext, kind: ActionKind, params: unknown): Promise<ActionResult> {
  const spec = ACTIONS[kind] as ActionSpec<unknown>;
  const parsed = spec.schema.safeParse(params);
  if (!parsed.success) throw new ActionError("That change is no longer valid.");
  try {
    return await spec.execute(ctx, parsed.data);
  } catch (err) {
    if (err instanceof ActionError) throw err;
    console.error(`[ask/actions] ${kind} failed:`, err);
    throw new ActionError("That didn't work. Nothing was changed.");
  }
}

export function riskOf(kind: ActionKind): ActionRisk {
  return ACTIONS[kind].risk;
}

export function describeActionTool(kind: ActionKind) {
  const spec = ACTIONS[kind] as ActionSpec<unknown>;
  return { description: spec.description, schema: spec.schema };
}

export { ActionError };
