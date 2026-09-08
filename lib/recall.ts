const BASE = () =>
  `https://${process.env.RECALL_REGION ?? "us-east-1"}.recall.ai/api/v1`;

function authHeaders() {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error("RECALL_API_KEY is not set");
  return {
    Authorization: `Token ${key}`,
    "Content-Type": "application/json",
  };
}

export interface ScheduledBot {
  botId: string;
}

/**
 * Schedule a bot to join at `joinAt`.
 *
 * `join_at` is the whole point: without it Recall dispatches the bot
 * immediately, so it turns up to an empty room now and is long gone by the
 * time the meeting actually starts.
 *
 * `maxRecordingSeconds`, when given, is enforced by Recall itself via
 * `automatic_leave.in_call_recording_timeout` — the bot leaves on its own the
 * instant it's hit, independent of anything our side does afterward. This is
 * the recording-allowance cap: checking the allowance before scheduling only
 * stops a call from *starting* over budget, not from *running* over budget
 * once it's underway. A polling sweep to cancel a bot mid-call would always
 * lag by however often it polls; a provider-enforced timeout doesn't.
 */
export async function scheduleBot(opts: {
  meetingUrl: string;
  joinAt: string;
  botName?: string;
  maxRecordingSeconds?: number;
}): Promise<ScheduledBot> {
  const res = await fetch(`${BASE()}/bot/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      meeting_url: opts.meetingUrl,
      bot_name: opts.botName ?? "Closingly Notetaker",
      join_at: opts.joinAt,
      recording_config: {
        transcript: {
          provider: {
            recallai_streaming: {
              mode: "prioritize_low_latency",
              language_code: "en",
            },
          },
        },
      },
      ...(opts.maxRecordingSeconds
        ? {
            automatic_leave: {
              in_call_recording_timeout: opts.maxRecordingSeconds,
            },
          }
        : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Recall scheduleBot failed (${res.status}): ${await res.text()}`
    );
  }

  const data = (await res.json()) as { id: string };
  return { botId: data.id };
}

/**
 * Cancel a scheduled bot. Only works before it joins — a 404 means it already
 * joined or was already removed, which is fine either way.
 */
export async function cancelBot(botId: string): Promise<void> {
  const res = await fetch(`${BASE()}/bot/${botId}/`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(
      `Recall cancelBot failed (${res.status}): ${await res.text()}`
    );
  }
}

/** One speaker's continuous turn, with the offsets needed to sync playback. */
export interface TranscriptSegment {
  speaker: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
}

export interface BotTranscript {
  text: string;
  segments: TranscriptSegment[];
  durationSeconds: number | null;
}

/**
 * Recall has moved timestamps between a bare number and `{ relative }`
 * across API versions, and individual words sometimes carry neither. Reading
 * defensively here is cheaper than a transcript that silently loses its
 * timing and takes the whole player down with it.
 */
function offsetOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const rel = (value as { relative?: unknown }).relative;
    if (typeof rel === "number" && Number.isFinite(rel)) return rel;
  }
  return null;
}

/**
 * Flatten Recall's per-word transcript into speaker turns with offsets.
 *
 * Exported for its own sake: this is the one place the whole playback feature
 * depends on a third-party payload shape it doesn't control, and a silent
 * change there would produce an empty transcript rather than an error.
 */
export function parseTranscriptSegments(raw: unknown): TranscriptSegment[] {
  if (!Array.isArray(raw)) return [];

  type RawWord = {
    text?: string;
    start_timestamp?: unknown;
    end_timestamp?: unknown;
  };
  type RawSegment = { speaker?: string; words?: RawWord[] };

  return raw
    .map((s: RawSegment) => {
      const words = s.words ?? [];
      const text = words
        .map((w) => w.text ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const starts = words
        .map((w) => offsetOf(w.start_timestamp))
        .filter((n): n is number => n !== null);
      const ends = words
        .map((w) => offsetOf(w.end_timestamp))
        .filter((n): n is number => n !== null);

      return {
        speaker: s.speaker ?? "Speaker",
        start: starts.length ? Math.min(...starts) : 0,
        end: ends.length ? Math.max(...ends) : 0,
        text,
      };
    })
    .filter((s) => s.text.length > 0);
}

/**
 * Fetch and flatten a bot's transcript.
 *
 * Two things here are load-bearing and non-obvious:
 *
 *  1. `cache: "no-store"` plus a cache-buster. Next.js will otherwise serve the
 *     bot object cached from when the meeting *started*, which has no transcript
 *     on it, and the failure looks like "Recall never produced one".
 *  2. The download URL is four levels deep in `recordings[0].media_shortcuts`,
 *     with a provider-specific fallback.
 */
export async function getTranscript(botId: string): Promise<BotTranscript> {
  const res = await fetch(`${BASE()}/bot/${botId}/?_t=${Date.now()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Recall getBot failed (${res.status}): ${await res.text()}`
    );
  }

  const bot = await res.json();
  const recording = bot?.recordings?.[0];

  const downloadUrl: string | undefined =
    recording?.media_shortcuts?.transcript?.data?.download_url ??
    recording?.media_shortcuts?.transcript?.data?.provider_data_download_url;

  if (!downloadUrl) {
    // The bot finished but the transcript is still processing. Callers retry.
    throw new TranscriptNotReadyError(botId);
  }

  const transcriptRes = await fetch(downloadUrl, { cache: "no-store" });
  if (!transcriptRes.ok) {
    throw new Error(
      `Recall transcript download failed (${transcriptRes.status})`
    );
  }

  const segments = parseTranscriptSegments(await transcriptRes.json());

  // The flat form stays the source of truth for AI extraction — the prompts
  // are tuned to it, and re-deriving it here keeps the two from drifting.
  const text = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");

  return {
    text,
    segments,
    durationSeconds: durationOf(recording),
  };
}

/**
 * A fresh, playable URL for a bot's recording.
 *
 * Deliberately not stored: Recall signs these for five hours and their own
 * guidance is to fetch a new one per playback rather than cache it. Media
 * itself is retained indefinitely on their side, so there's nothing to
 * re-host and nothing of ours to expire.
 *
 * `audio_mixed` is not exposed through `media_shortcuts` — only `video_mixed`
 * is — and the mp4 carries the audio track, so this returns the video URL and
 * lets the player use whichever track it needs.
 */
export async function getRecordingUrl(botId: string): Promise<string | null> {
  const res = await fetch(`${BASE()}/bot/${botId}/?_t=${Date.now()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Recall getBot failed (${res.status}): ${await res.text()}`);
  }

  const bot = await res.json();
  const shortcuts = bot?.recordings?.[0]?.media_shortcuts;

  return (
    shortcuts?.video_mixed?.data?.download_url ??
    shortcuts?.audio_mixed?.data?.download_url ??
    null
  );
}

/** Recall reports duration in a few shapes depending on recording config. */
function durationOf(recording: unknown): number | null {
  const rec = recording as
    | { duration?: number; started_at?: string; completed_at?: string }
    | undefined;
  if (!rec) return null;
  if (typeof rec.duration === "number") return Math.round(rec.duration);
  if (rec.started_at && rec.completed_at) {
    const ms =
      new Date(rec.completed_at).getTime() - new Date(rec.started_at).getTime();
    return ms > 0 ? Math.round(ms / 1000) : null;
  }
  return null;
}

export class TranscriptNotReadyError extends Error {
  constructor(botId: string) {
    super(`Transcript not ready yet for bot ${botId}`);
    this.name = "TranscriptNotReadyError";
  }
}

export interface BotStatus {
  /** The most recent status_changes code, e.g. "in_call_recording", "done". */
  latestCode: string;
  /** The call is over and a transcript should exist (or be close to it). */
  isDone: boolean;
  /** Recall gave up on the bot — nothing to fetch, no point retrying. */
  isFatal: boolean;
}

/**
 * Ask Recall directly what a bot is doing, independent of any webhook.
 *
 * Exists for the reconciliation sweep: a webhook is a promise from Recall to
 * tell us when something happens, and promises get broken — a rotated signing
 * secret, a disabled endpoint, a dropped delivery. This is how the worker
 * checks the truth itself instead of waiting forever for a message that isn't
 * coming.
 */
export async function getBotStatus(botId: string): Promise<BotStatus> {
  const res = await fetch(`${BASE()}/bot/${botId}/?_t=${Date.now()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Recall getBot failed (${res.status}): ${await res.text()}`);
  }

  const bot = await res.json();
  const changes: Array<{ code?: string }> = bot?.status_changes ?? [];
  const latestCode = changes.length
    ? (changes[changes.length - 1].code ?? "")
    : "";

  return {
    latestCode,
    isDone: ["call_ended", "recording_done", "done"].includes(latestCode),
    isFatal: latestCode === "fatal",
  };
}
