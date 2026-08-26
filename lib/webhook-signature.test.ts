import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature } from "@/lib/webhook-signature";

const SECRET = "whsec_" + Buffer.from("test-signing-key-32-bytes-long!!").toString("base64");

function sign(id: string, timestamp: string, body: string, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

function headers(overrides: Record<string, string | null> = {}) {
  const now = Math.floor(Date.now() / 1000).toString();
  const id = "msg_test123";
  const body = '{"event":"bot.done"}';
  const sig = sign(id, now, body);

  const map: Record<string, string> = {
    "svix-id": id,
    "svix-timestamp": now,
    "svix-signature": `v1,${sig}`,
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete map[k];
    else map[k] = v;
  }
  return { headers: new Headers(map), id, timestamp: now, body };
}

/**
 * This is the only thing standing between the Recall webhook and anyone who
 * can guess the URL. A signature bug here means either "webhooks silently
 * stop working" (a real incident this app already had) or "an attacker can
 * forge a webhook" — worth locking down permanently.
 */
describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed request", () => {
    const { headers: h, body } = headers();
    expect(verifyWebhookSignature(body, h, SECRET)).toEqual({ ok: true });
  });

  it("rejects a body that doesn't match the signature", () => {
    const { headers: h } = headers();
    const result = verifyWebhookSignature('{"event":"tampered"}', h, SECRET);
    expect(result.ok).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const { headers: h, body } = headers();
    const wrongSecret = "whsec_" + Buffer.from("a-completely-different-key-here").toString("base64");
    const result = verifyWebhookSignature(body, h, wrongSecret);
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a timestamp outside the tolerance window (replay protection)", () => {
    const id = "msg_replay";
    const staleTimestamp = (Math.floor(Date.now() / 1000) - 10 * 60).toString(); // 10 min old
    const body = '{"event":"bot.done"}';
    const sig = sign(id, staleTimestamp, body);
    const h = new Headers({
      "svix-id": id,
      "svix-timestamp": staleTimestamp,
      "svix-signature": `v1,${sig}`,
    });
    expect(verifyWebhookSignature(body, h, SECRET)).toEqual({
      ok: false,
      reason: "timestamp_out_of_tolerance",
    });
  });

  it("rejects missing headers rather than throwing", () => {
    const { headers: h, body } = headers({ "svix-signature": null });
    expect(verifyWebhookSignature(body, h, SECRET)).toEqual({
      ok: false,
      reason: "missing_signature_headers",
    });
  });

  it("rejects a non-numeric timestamp rather than throwing", () => {
    const { headers: h, body } = headers({ "svix-timestamp": "not-a-number" });
    expect(verifyWebhookSignature(body, h, SECRET)).toEqual({
      ok: false,
      reason: "invalid_timestamp",
    });
  });

  it("accepts one matching v1 signature out of several (secret-rotation case)", () => {
    const { id, timestamp, body } = headers();
    const realSig = sign(id, timestamp, body);
    const decoySig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const h = new Headers({
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${decoySig} v1,${realSig}`,
    });
    expect(verifyWebhookSignature(body, h, SECRET)).toEqual({ ok: true });
  });
});
