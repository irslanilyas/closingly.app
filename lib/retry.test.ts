import { describe, it, expect } from "vitest";
import { isRetryable } from "@/lib/retry";
import { TranscriptNotReadyError } from "@/lib/recall";

/**
 * Wrong in either direction costs money: too retryable and a permanently
 * broken job burns three AI calls on the same guaranteed failure; too strict
 * and a genuine network blip never gets a second chance.
 */
describe("isRetryable", () => {
  it("respects an explicit retryable flag on the error object", () => {
    expect(isRetryable(Object.assign(new Error("x"), { retryable: true }))).toBe(true);
    expect(isRetryable(Object.assign(new Error("x"), { retryable: false }))).toBe(false);
  });

  it("treats a not-yet-ready transcript as retryable", () => {
    expect(isRetryable(new TranscriptNotReadyError("bot_123"))).toBe(true);
  });

  it.each([
    "fetch failed",
    "Request timeout",
    "ECONNRESET",
    "rate_limit exceeded",
    "model overloaded",
    "HTTP 429",
    "HTTP 529",
  ])("treats %j as retryable by message content", (message) => {
    expect(isRetryable(new Error(message))).toBe(true);
  });

  it("defaults to not retryable for an unrecognised error", () => {
    expect(isRetryable(new Error("schema validation failed"))).toBe(false);
  });

  it("defaults to not retryable for non-Error throws", () => {
    expect(isRetryable("a plain string")).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});
