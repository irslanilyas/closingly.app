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
 */
export async function scheduleBot(opts: {
  meetingUrl: string;
  joinAt: string;
  botName?: string;
}): Promise<ScheduledBot> {
  const res = await fetch(`${BASE()}/bot/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      meeting_url: opts.meetingUrl,
      bot_name: opts.botName ?? "ROS Notetaker",
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

export interface BotTranscript {
  text: string;
  durationSeconds: number | null;
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

  const segments = await transcriptRes.json();

  const text = Array.isArray(segments)
    ? segments
        .map((s: { speaker?: string; words?: Array<{ text?: string }> }) => {
          const words = (s.words ?? []).map((w) => w.text ?? "").join(" ");
          return `${s.speaker ?? "Speaker"}: ${words}`.trim();
        })
        .filter(Boolean)
        .join("\n")
    : "";

  return {
    text,
    durationSeconds: durationOf(recording),
  };
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
