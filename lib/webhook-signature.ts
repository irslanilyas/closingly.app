import crypto from "node:crypto";

/** Reject anything older than this to make replaying a captured request useless. */
const TOLERANCE_SECONDS = 5 * 60;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verify a Svix-signed webhook (the scheme Recall.ai uses).
 *
 * Hand-rolled rather than pulling in the `svix` package — the scheme is small
 * and fully specified, and this avoids a dependency in the hot path. The parts
 * that matter for correctness:
 *
 *   - the signed content is `id.timestamp.body`, using the **raw** body, so the
 *     caller must pass the unparsed string (re-serialising JSON changes bytes
 *     and every signature fails)
 *   - the secret is base64 *after* stripping the `whsec_` prefix
 *   - the header holds a space-separated list of `v1,<sig>` — a secret rotation
 *     sends several, and any one matching is valid
 *   - comparison is constant-time
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string
): VerifyResult {
  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const timestamp =
    headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const signature =
    headers.get("webhook-signature") ?? headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing_signature_headers" };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const drift = Math.abs(Date.now() / 1000 - sentAt);
  if (drift > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  const expectedBuf = Buffer.from(expected);

  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;

    const candidate = Buffer.from(value);
    if (
      candidate.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidate, expectedBuf)
    ) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "signature_mismatch" };
}
