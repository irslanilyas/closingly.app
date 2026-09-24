"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActionView, AskEvent, AskMessage, AskPart } from "@/lib/ask/parts";

export interface UiMessage extends AskMessage {
  /** Still arriving from the stream. */
  streaming?: boolean;
  /** Arrived in this session, so its words develop in; reopened history just shows. */
  live?: boolean;
}

export type AskMode = "ask" | "auto";

export interface AskContext {
  path: string;
  dealId: string | null;
}

/* ── Mode, remembered per browser ─────────────────────────────────────── */

const MODE_KEY = "closingly:ask-mode";
const modeListeners = new Set<() => void>();

function readMode(): AskMode {
  try {
    return localStorage.getItem(MODE_KEY) === "auto" ? "auto" : "ask";
  } catch {
    return "ask";
  }
}

function useMode(): [AskMode, (mode: AskMode) => void] {
  const mode = useSyncExternalStore(
    (l) => {
      modeListeners.add(l);
      return () => modeListeners.delete(l);
    },
    readMode,
    () => "ask" as AskMode
  );
  const set = useCallback((next: AskMode) => {
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {}
    modeListeners.forEach((l) => l());
  }, []);
  return [mode, set];
}

/* ── The conversation ─────────────────────────────────────────────────── */

let tempId = 0;
const nextId = () => `local-${++tempId}`;

function applyEvent(message: UiMessage, event: AskEvent): UiMessage {
  const parts = [...message.parts];
  switch (event.type) {
    case "text": {
      const last = parts[parts.length - 1];
      if (last?.type === "text") parts[parts.length - 1] = { ...last, text: last.text + event.delta };
      else parts.push({ type: "text", text: event.delta });
      return { ...message, parts };
    }
    case "part":
      return { ...message, parts: [...parts, event.part] };
    case "step":
      return {
        ...message,
        parts: parts.map((p) => (p.type === "step" && p.id === event.id ? { ...p, status: event.status } : p)),
      };
    case "error":
      return { ...message, parts: [...parts, { type: "text", text: event.message }] };
    case "done":
      return { ...message, streaming: false, id: event.message_id ?? message.id };
    default:
      return message;
  }
}

export function useAsk(context: AskContext, open: boolean) {
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useMode();
  const abortRef = useRef<AbortController | null>(null);

  const conversations = useQuery({
    queryKey: ["ask", "conversations"],
    queryFn: async () => {
      const res = await fetch("/api/ask/conversations");
      if (!res.ok) return [] as Array<{ id: string; title: string; updated_at: string }>;
      return ((await res.json()) as { conversations: Array<{ id: string; title: string; updated_at: string }> })
        .conversations;
    },
    enabled: open,
    staleTime: 30_000,
  });

  const updateLast = useCallback((fn: (m: UiMessage) => UiMessage) => {
    setMessages((current) => {
      if (!current.length) return current;
      const next = [...current];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;

      setBusy(true);
      setMessages((current) => [
        ...current,
        { id: nextId(), role: "user", content: message, parts: [{ type: "text", text: message }], live: true },
        { id: nextId(), role: "assistant", content: "", parts: [], streaming: true, live: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      let stopped = false;

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            conversation_id: conversationId,
            mode,
            context: { path: context.path, ...(context.dealId ? { deal_id: context.dealId } : {}) },
          }),
          signal: controller.signal,
        });

        // A lapsed session is answered by the proxy with the login page, not
        // an error status, so the content type is the reliable tell.
        const streamed = res.headers.get("content-type")?.includes("ndjson");
        if (!res.ok || !res.body || !streamed) {
          // A 429 says which limit it hit: a busy hour or the day's cap.
          const limited =
            res.status === 429
              ? ((await res.json().catch(() => null)) as { message?: string } | null)?.message
              : undefined;
          const reason =
            res.status === 429
              ? (limited ?? "That's a lot of questions at once. Give it a minute.")
              : res.ok && !streamed
                ? "Your session has ended. Sign in again to keep going."
                : "Couldn't reach Ask Closingly. Try again.";
          updateLast((m) => ({ ...m, streaming: false, parts: [{ type: "text", text: reason }] }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: AskEvent;
            try {
              event = JSON.parse(line) as AskEvent;
            } catch {
              continue;
            }
            if (event.type === "conversation") {
              if (event.id) setConversationId(event.id);
              setTitle(event.title);
              continue;
            }
            updateLast((m) => applyEvent(m, event));
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") stopped = true;
        else {
          updateLast((m) => ({
            ...m,
            parts: [...m.parts, { type: "text", text: "The connection dropped. Try that again." }],
          }));
        }
      } finally {
        updateLast((m) =>
          m.role === "assistant" && m.parts.length === 0
            ? { ...m, streaming: false, parts: [{ type: "text", text: stopped ? "Stopped." : "No reply came back. Try that again." }] }
            : { ...m, streaming: false }
        );
        abortRef.current = null;
        setBusy(false);
        qc.invalidateQueries({ queryKey: ["ask", "conversations"] });
      }
    },
    [busy, conversationId, mode, context.path, context.dealId, updateLast, qc]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const setActionState = useCallback((id: string, patch: Partial<ActionView>) => {
    setMessages((current) =>
      current.map((m) => ({
        ...m,
        parts: m.parts.map((p): AskPart =>
          p.type === "action" && p.action.id === id ? { ...p, action: { ...p.action, ...patch } } : p
        ),
      }))
    );
  }, []);

  const decide = useCallback(
    async (action: ActionView, decision: "confirm" | "cancel") => {
      setActionState(action.id, { status: decision === "confirm" ? "running" : "cancelled" });
      const res = await fetch(`/api/ask/actions/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      }).catch(() => null);

      const body = (await res?.json().catch(() => null)) as Partial<ActionView> & { error?: string; status?: string } | null;
      if (!res) {
        setActionState(action.id, { status: "pending" });
        return;
      }
      if (res.status === 410) {
        setActionState(action.id, { status: "expired" });
        return;
      }
      if (decision === "cancel") return;
      if (body?.status === "done") {
        setActionState(action.id, { status: "done", result: body.result ?? null });
        // Whatever the change touched, the pages showing it should catch up.
        qc.invalidateQueries();
      } else if (body?.status === "failed") {
        setActionState(action.id, { status: "failed", error: body.error ?? "That didn't work." });
      } else if (res.status === 409) {
        setActionState(action.id, { status: (body?.status as ActionView["status"]) ?? "done" });
      } else {
        setActionState(action.id, { status: "failed", error: "That didn't work. Nothing was changed." });
      }
    },
    [qc, setActionState]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setConversationId(null);
    setTitle(null);
    setMessages([]);
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      const res = await fetch(`/api/ask/conversations/${id}`).catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { id: string; title: string; messages: AskMessage[] };
      setConversationId(body.id);
      setTitle(body.title);
      setMessages(body.messages.map((m) => ({ ...m, live: false })));
    },
    []
  );

  const removeConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/ask/conversations/${id}`, { method: "DELETE" }).catch(() => null);
      if (id === conversationId) reset();
      qc.invalidateQueries({ queryKey: ["ask", "conversations"] });
    },
    [conversationId, reset, qc]
  );

  return {
    conversationId,
    title,
    messages,
    busy,
    mode,
    setMode,
    conversations: conversations.data ?? [],
    send,
    stop,
    decide,
    reset,
    openConversation,
    removeConversation,
  };
}
