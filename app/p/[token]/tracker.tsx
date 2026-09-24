"use client";

import { useEffect, useRef } from "react";

/** Push dwell time to the server on this cadence while the tab is visible. */
const HEARTBEAT_MS = 15_000;

/**
 * Records that the proposal was opened, how long it was read for, and which
 * sections actually came into view.
 *
 * Renders nothing. Every failure is swallowed — a tracking problem must never
 * degrade the page the client is reading.
 */
export function ViewTracker({ token }: { token: string }) {
  const viewId = useRef<string | null>(null);
  // Set when the effect starts: reading the clock during render is impure.
  const startedAt = useRef(0);
  const visibleMs = useRef(0);
  const lastTick = useRef(0);
  const sections = useRef<Set<string>>(new Set());

  useEffect(() => {
    startedAt.current = Date.now();
    lastTick.current = startedAt.current;
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const elapsedSeconds = () => {
      // Only count time the tab was actually in front of them.
      const now = Date.now();
      if (document.visibilityState === "visible") {
        visibleMs.current += now - lastTick.current;
      }
      lastTick.current = now;
      return Math.round(visibleMs.current / 1000);
    };

    const push = () => {
      if (!viewId.current) return;
      const payload = JSON.stringify({
        view_id: viewId.current,
        duration_seconds: elapsedSeconds(),
        sections_viewed: Array.from(sections.current),
      });

      fetch(`/api/track/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true, // survives the page being closed
      }).catch(() => {});
    };

    (async () => {
      try {
        const res = await fetch(`/api/track/${token}`, { method: "POST" });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        viewId.current = body.view_id;
        startedAt.current = Date.now();
        lastTick.current = Date.now();
        heartbeat = setInterval(push, HEARTBEAT_MS);
      } catch {
        /* tracking is best-effort */
      }
    })();

    // Which sections came into view, and roughly in what order.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = entry.target.getAttribute("data-section");
          if (key) sections.current.add(key);
        }
      },
      { threshold: 0.5 }
    );

    document
      .querySelectorAll("[data-section]")
      .forEach((el) => observer.observe(el));

    const onVisibility = () => {
      elapsedSeconds();
      if (document.visibilityState === "hidden") push();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", push);

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", push);
      push();
    };
  }, [token]);

  return null;
}
