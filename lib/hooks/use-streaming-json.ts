"use client";

import { useCallback, useState } from "react";
import { tryParsePartialJson } from "@/lib/format";
import { toast } from "sonner";

/**
 * Streams a JSON response from one of the AI routes, surfacing partial objects
 * as they arrive so the UI can fill in field by field.
 *
 * This loop was copy-pasted into five pages before it lived here. Every copy
 * had the same reader/decoder/accumulator shape and the same silent failure
 * mode, so a fix in one never reached the others.
 */
export function useStreamingJson<T>(endpoint: string) {
  const [data, setData] = useState<Partial<T> | null>(null);
  const [streaming, setStreaming] = useState(false);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      if (streaming) return;
      setStreaming(true);
      setData({});

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          // Closes unbalanced braces so half-written JSON still renders.
          const parsed = tryParsePartialJson<Partial<T>>(accumulated);
          if (parsed) setData(parsed);
        }
      } catch (err) {
        console.error(`[${endpoint}]`, err);
        toast.error("Generation failed. Try again.");
        setData(null);
      } finally {
        setStreaming(false);
      }
    },
    [endpoint, streaming]
  );

  const reset = useCallback(() => setData(null), []);

  return { data, streaming, run, reset };
}
