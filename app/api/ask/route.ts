import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropic } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAiBudget, rateLimitResponse } from "@/lib/rate-limit";
import { field, readJson } from "@/lib/validate";
import { AGENT_SYSTEM, agentContext } from "@/lib/ask/agent-prompt";
import { AGENT_TOOLS, kindOfTool, linkFor, readLabel, runRead, type NavigateName } from "@/lib/ask/tools";
import {
  ActionError,
  executeAction,
  isActionKind,
  parseAction,
  riskOf,
  summarizeAction,
} from "@/lib/ask/actions";
import type { ActionView, AskEvent, AskPart } from "@/lib/ask/parts";

/**
 * Ask Closingly: an agent over the person's own workspace.
 *
 * One request is one turn. Claude reads with tools, answers in streamed text,
 * and proposes changes as action cards; the loop runs server-side and the
 * browser receives a stream of newline-delimited JSON events describing what
 * to draw. Writes are never executed by the model's say-so alone: see
 * lib/ask/actions.ts.
 */

/**
 * Sonnet 5 rather than Opus: workspace lookups and small edits don't need the
 * larger model, and it costs $2/$10 per million tokens against $5/$25.
 */
const AGENT_MODEL = "claude-sonnet-5";
/** Questions per person: plenty for real work, a hard stop for anything else. */
const HOURLY_LIMIT = { action: "ask", limit: 30, windowMinutes: 60 };
const DAILY_LIMIT = { action: "ask_daily", limit: 100, windowMinutes: 24 * 60 };
/** Model rounds per turn. Bounds cost and the free plan's 50-request cap. */
const MAX_ROUNDS = 5;
const MAX_WRITES = 5;
/**
 * Output per round, thinking included. Room for an answer and a drafted
 * email; not room for an essay. Worst case per question is MAX_ROUNDS times it.
 */
const MAX_OUTPUT_TOKENS = 6_000;
const HISTORY_MESSAGES = 12;
/** A long past reply is replayed trimmed: history is context, not a payload. */
const HISTORY_CHARS = 3_000;
const TOOL_RESULT_CHARS = 16_000;

const Body = z.object({
  message: z.string().trim().min(1).max(2000),
  conversation_id: field.id.nullish(),
  mode: z.enum(["ask", "auto"]).default("ask"),
  context: z
    .object({
      path: z.string().max(200).optional(),
      deal_id: field.id.optional(),
    })
    .optional(),
});

function describePage(path: string | undefined): string | null {
  if (!path) return null;
  if (path === "/") return "their dashboard";
  if (path.startsWith("/pipeline/")) return "a deal page";
  if (path.startsWith("/pipeline")) return "their pipeline";
  if (path.startsWith("/proposals/")) return "a proposal";
  if (path.startsWith("/follow-ups")) return "their follow-up queue";
  if (path.startsWith("/meetings")) return "their calls";
  if (path.startsWith("/intelligence")) return "their insights";
  if (path.startsWith("/settings")) return "settings";
  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const limit = await checkAiBudget(user.id, HOURLY_LIMIT, DAILY_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await readJson(request, Body);
  if (!parsed.ok) return parsed.response;
  const { message, mode, context } = parsed.data;

  const admin = createAdminClient();
  const ctx = { supabase, userId: user.id };

  // ── Conversation ────────────────────────────────────────────────────────
  // Saved when the tables exist. Before their migration is applied the agent
  // still works, one turn at a time, with nothing remembered.
  let conversationId: string | null = null;
  let title = message.length > 60 ? `${message.slice(0, 57).trimEnd()}...` : message;
  let history: Anthropic.Beta.BetaMessageParam[] = [];

  if (parsed.data.conversation_id) {
    const { data: existing } = await admin
      .from("ask_conversations")
      .select("id, title")
      .eq("id", parsed.data.conversation_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      conversationId = existing.id as string;
      title = existing.title as string;
      const { data: past } = await admin
        .from("ask_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_MESSAGES);
      history = (past ?? [])
        .reverse()
        .filter((m) => typeof m.content === "string" && m.content.trim())
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: (m.content as string).slice(0, HISTORY_CHARS),
        }));
      while (history.length && history[0].role !== "user") history.shift();
    }
  }
  if (!conversationId) {
    const { data: created } = await admin
      .from("ask_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .maybeSingle();
    conversationId = (created?.id as string | undefined) ?? null;
  }
  if (conversationId) {
    await admin.from("ask_messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content: message,
      parts: [{ type: "text", text: message }],
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: AGENT_SYSTEM, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: agentContext({
        today: new Date().toISOString().slice(0, 10),
        name: (profile?.full_name as string | null)?.split(" ")[0] ?? null,
        page: describePage(context?.path),
        dealId: context?.deal_id ?? null,
        mode,
      }),
    },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AskEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const parts: AskPart[] = [];
      const appendText = (delta: string) => {
        const last = parts[parts.length - 1];
        if (last?.type === "text") last.text += delta;
        else parts.push({ type: "text", text: delta });
        emit({ type: "text", delta });
      };
      const addPart = (part: AskPart) => {
        parts.push(part);
        emit({ type: "part", part });
      };

      emit({ type: "conversation", id: conversationId, title });

      const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: message }];
      let writes = 0;
      let jsonRetries = 0;

      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const turn = anthropic.beta.messages.stream({
            model: AGENT_MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            output_config: { effort: "medium" },
            system,
            tools: AGENT_TOOLS,
            messages,
          });
          turn.on("text", appendText);

          let reply: Anthropic.Beta.BetaMessage;
          try {
            reply = await turn.finalMessage();
            jsonRetries = 0;
          } catch (err) {
            // Only a tool input that could not be parsed at all is retried;
            // API errors go to the outer handler.
            if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
            round--;
            continue;
          }

          if (reply.stop_reason === "refusal") {
            appendText(parts.length ? "\n\nI can't help with that one." : "I can't help with that one.");
            break;
          }
          if (reply.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: reply.content });
            continue;
          }

          const toolUses = reply.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
          );
          if (toolUses.length === 0) break;
          if (reply.stop_reason === "max_tokens") {
            appendText("\n\nThat answer ran long and was cut off. Try asking for something narrower.");
            break;
          }

          messages.push({ role: "assistant", content: reply.content });
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];

          for (const call of toolUses) {
            const kind = kindOfTool(call.name);
            const result = (content: string, isError = false): Anthropic.Beta.BetaToolResultBlockParam => ({
              type: "tool_result",
              tool_use_id: call.id,
              content: content.slice(0, TOOL_RESULT_CHARS),
              ...(isError ? { is_error: true } : {}),
            });

            if (kind === "read") {
              addPart({ type: "step", id: call.id, label: readLabel(call.name), status: "running" });
              try {
                const data = await runRead(ctx, call.name, call.input);
                emit({ type: "step", id: call.id, status: "done" });
                markStep(parts, call.id, "done");
                results.push(result(JSON.stringify(data)));
              } catch (err) {
                console.error(`[ask] ${call.name} failed:`, err);
                emit({ type: "step", id: call.id, status: "error" });
                markStep(parts, call.id, "error");
                results.push(result("That lookup failed. Say so rather than guessing.", true));
              }
              continue;
            }

            if (kind === "navigate") {
              const link = linkFor(call.name as NavigateName, call.input);
              if ("error" in link) {
                results.push(result(link.error, true));
              } else {
                addPart(link);
                results.push(result(`A button labelled "${link.label}" is shown under your reply.`));
              }
              continue;
            }

            if (kind === "write" && isActionKind(call.name)) {
              if (writes >= MAX_WRITES) {
                results.push(result("Too many changes in one reply. Ask the person to confirm these first.", true));
                continue;
              }
              const params = parseAction(call.name, call.input);
              if (!params.ok) {
                results.push(result(`Invalid input: ${params.error}`, true));
                continue;
              }
              let summary;
              try {
                summary = await summarizeAction(ctx, call.name, params.params);
              } catch (err) {
                results.push(result(err instanceof ActionError ? err.message : "Couldn't prepare that change.", true));
                continue;
              }
              writes++;
              const risk = riskOf(call.name);
              const auto = mode === "auto" && risk === "safe";
              const { data: row } = await admin
                .from("ask_actions")
                .insert({
                  user_id: user.id,
                  conversation_id: conversationId,
                  kind: call.name,
                  params: params.params,
                  status: auto ? "running" : "pending",
                })
                .select("id")
                .maybeSingle();
              if (!row) {
                results.push(
                  result("Changes can't be proposed yet: the workspace needs a database update. Tell the person.", true)
                );
                continue;
              }

              const view: ActionView = { id: row.id as string, kind: call.name, risk, status: "pending", ...summary };
              if (auto) {
                try {
                  view.result = await executeAction(ctx, call.name, params.params);
                  view.status = "done";
                } catch (err) {
                  view.status = "failed";
                  view.error = err instanceof ActionError ? err.message : "That didn't work.";
                }
                await admin
                  .from("ask_actions")
                  .update({
                    status: view.status,
                    result: view.result ?? null,
                    error: view.error ?? null,
                    decided_at: new Date().toISOString(),
                  })
                  .eq("id", view.id);
              }
              addPart({ type: "action", action: view });
              results.push(
                result(
                  view.status === "done"
                    ? `Done: ${view.result?.message ?? view.title}`
                    : view.status === "failed"
                      ? `Tried and failed: ${view.error}`
                      : `Shown to the person as a card: "${view.title}". It has NOT happened yet; it waits for their confirmation.`
                )
              );
              continue;
            }

            results.push(result(`Unknown tool ${call.name}.`, true));
          }

          messages.push({ role: "user", content: results });
        }
      } catch (err) {
        console.error("[ask] turn failed:", err);
        const message =
          err instanceof Anthropic.RateLimitError
            ? "The AI service is busy right now. Try again in a moment."
            : "Something went wrong reaching the AI service. Try that again.";
        emit({ type: "error", message });
        parts.push({ type: "text", text: message });
      }

      // ── Save the turn ───────────────────────────────────────────────────
      let messageId: string | null = null;
      if (conversationId) {
        const content = parts
          .map((p) =>
            p.type === "text"
              ? p.text
              : p.type === "action"
                ? `[Proposed change: ${p.action.title} (${p.action.status})]`
                : p.type === "link"
                  ? `[Button: ${p.label}]`
                  : ""
          )
          .filter(Boolean)
          .join("\n")
          .trim();
        const { data: saved } = await admin
          .from("ask_messages")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: content || "(no reply)",
            parts,
          })
          .select("id")
          .maybeSingle();
        messageId = (saved?.id as string | undefined) ?? null;
        await admin.from("ask_conversations").update({ title }).eq("id", conversationId);
      }

      emit({ type: "done", message_id: messageId });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function markStep(parts: AskPart[], id: string, status: "done" | "error") {
  const step = parts.find((p) => p.type === "step" && p.id === id);
  if (step && step.type === "step") step.status = status;
}
