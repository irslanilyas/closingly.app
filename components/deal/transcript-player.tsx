"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "@/lib/types";
import { Pause, Play, Rewind, FastForward } from "lucide-react";

interface MeetingRow {
  id: string;
  transcript: string | null;
  transcript_segments: TranscriptSegment[] | null;
  recall_bot_id: string | null;
}

/** How long to leave auto-scroll alone after the user scrolls themselves. */
const MANUAL_SCROLL_GRACE_MS = 4000;

const SPEEDS = [1, 1.25, 1.5, 2] as const;

export function TranscriptPlayer({
  dealId,
  fallbackTranscript,
}: {
  dealId: string;
  fallbackTranscript: string | null;
}) {
  const [meeting, setMeeting] = useState<MeetingRow | null | undefined>(undefined);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("meetings")
      .select("id, transcript, transcript_segments, recall_bot_id")
      .eq("deal_id", dealId)
      .not("transcript", "is", null)
      .order("starts_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setMeeting((data?.[0] as MeetingRow) ?? null));
  }, [dealId]);

  // Signed URLs die after five hours, so this is fetched on open, never stored.
  useEffect(() => {
    if (!meeting?.recall_bot_id) return;
    fetch(`/api/meetings/${meeting.id}/recording`)
      .then((r) => r.json())
      .then((j) => setAudioUrl(j.url ?? null))
      .catch(() => setAudioUrl(null));
  }, [meeting]);

  if (meeting === undefined) {
    return <Skeleton className="h-[320px] w-full rounded-lg" />;
  }

  const segments = meeting?.transcript_segments ?? null;
  const text = meeting?.transcript ?? fallbackTranscript;

  if (!text) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        No transcript on this deal.
      </p>
    );
  }

  // Imported calls and anything recorded before timed transcripts existed.
  if (!segments || segments.length === 0) {
    return (
      <pre className="rounded-lg border border-border bg-card p-4 sm:p-5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/80 max-h-[65dvh] sm:max-h-[600px] overflow-y-auto">
        {text}
      </pre>
    );
  }

  return <SyncedTranscript segments={segments} audioUrl={audioUrl} />;
}

function SyncedTranscript({
  segments,
  audioUrl,
}: {
  segments: TranscriptSegment[];
  audioUrl: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Mirrors `active` outside React so the animation loop can compare without
  // re-subscribing every frame.
  const activeRef = useRef(-1);
  const lastManualScroll = useRef(0);

  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  const indexAt = useCallback(
    (t: number) => {
      // Segments are ordered, so a linear walk from the current position is
      // cheaper than a search and handles the common case (playing forward).
      for (let i = 0; i < segments.length; i++) {
        if (t >= segments[i].start && t < segments[i].end) return i;
        if (t < segments[i].start) return i > 0 ? i - 1 : -1;
      }
      return segments.length - 1;
    },
    [segments]
  );

  /**
   * `timeupdate` only fires about four times a second, which reads as the
   * highlight lagging the audio. A rAF loop tracks it at frame rate, and
   * state is only touched when the active line actually changes, so this
   * costs one comparison per frame rather than a re-render.
   */
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !playing) return;

    let raf = 0;
    const tick = () => {
      setTime(el.currentTime);
      const idx = indexAt(el.currentTime);
      if (idx !== activeRef.current) {
        activeRef.current = idx;
        setActive(idx);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, indexAt]);

  // Follow along, unless the user has just taken control of the scroll.
  useEffect(() => {
    if (active < 0) return;
    if (Date.now() - lastManualScroll.current < MANUAL_SCROLL_GRACE_MS) return;
    rowRefs.current[active]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [active]);

  const seekTo = (seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    setTime(seconds);
    const idx = indexAt(seconds);
    activeRef.current = idx;
    setActive(idx);
    if (!playing) el.play().catch(() => {});
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  const nudge = (delta: number) => {
    const el = audioRef.current;
    if (el) seekTo(Math.max(0, Math.min(el.duration || 0, el.currentTime + delta)));
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as 1) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="space-y-4">
      {audioUrl && (
        <div className="sticky top-[68px] z-10 rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-3 sm:px-4">
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-90 transition-opacity cursor-pointer sm:size-9"
            >
              {playing ? (
                <Pause className="size-4" strokeWidth={2} />
              ) : (
                <Play className="size-4 ml-0.5" strokeWidth={2} />
              )}
            </button>

            <button
              type="button"
              onClick={() => nudge(-10)}
              aria-label="Back 10 seconds"
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer sm:size-auto"
            >
              <Rewind className="size-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => nudge(10)}
              aria-label="Forward 10 seconds"
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer sm:size-auto"
            >
              <FastForward className="size-4" strokeWidth={1.75} />
            </button>

            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={time}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              aria-label="Seek"
              className="order-last h-6 w-full basis-full accent-[var(--brand)] cursor-pointer sm:order-none sm:h-1 sm:w-auto sm:flex-1 sm:basis-auto"
            />

            <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground shrink-0 sm:ml-0">
              {fmt(time)} / {fmt(duration)}
            </span>

            <button
              type="button"
              onClick={cycleSpeed}
              className="h-9 w-10 rounded-md text-right text-[11.5px] tabular-nums text-muted-foreground hover:text-foreground transition-colors cursor-pointer sm:h-auto sm:w-9"
            >
              {speed}×
            </button>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={() => {
          lastManualScroll.current = Date.now();
        }}
        className="rounded-lg border border-border bg-card divide-y divide-border max-h-[65dvh] overflow-y-auto sm:max-h-[560px]"
      >
        {segments.map((s, i) => (
          <button
            key={i}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            type="button"
            onClick={() => audioUrl && seekTo(s.start)}
            disabled={!audioUrl}
            className={cn(
              "w-full text-left px-4 py-3 transition-colors",
              audioUrl && "hover:bg-secondary/60 cursor-pointer",
              i === active && "bg-[var(--brand)]/10"
            )}
          >
            <div className="flex items-baseline gap-2.5 mb-1">
              <span
                className={cn(
                  "text-[12px] font-medium",
                  i === active ? "text-[var(--brand)]" : "text-foreground/70"
                )}
              >
                {s.speaker}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {fmt(s.start)}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-foreground/85">
              {s.text}
            </p>
          </button>
        ))}
      </div>

      {!audioUrl && (
        <p className="text-[11.5px] text-muted-foreground">
          Recording unavailable for playback. Transcript shown with speakers and
          timings.
        </p>
      )}
    </div>
  );
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
