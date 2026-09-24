import { beforeAll, describe, expect, it } from "vitest";
import { isSealed, open, seal } from "./sealed";

beforeAll(() => {
  const key = new Uint8Array(32).map((_, i) => i * 7);
  process.env.TOKEN_ENCRYPTION_KEY = btoa(String.fromCharCode(...key));
});

describe("sealed", () => {
  it("round-trips a value", async () => {
    const tokens = { access_token: "a", refresh_token: "r", expires_at: 1 };
    const sealed = await seal(tokens);
    expect(isSealed(sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain("refresh_token");
    expect(await open(sealed)).toEqual(tokens);
  });

  it("uses a fresh nonce every time", async () => {
    const a = await seal({ x: 1 });
    const b = await seal({ x: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("refuses a tampered value instead of opening it into something else", async () => {
    const sealed = await seal({ x: 1 });
    const bytes = atob(sealed.data).split("");
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
    await expect(open({ ...sealed, data: btoa(bytes.join("")) })).rejects.toThrow();
  });

  it("tells plaintext legacy tokens apart from sealed ones", () => {
    expect(isSealed({ access_token: "a", refresh_token: null, expires_at: 1 })).toBe(false);
    expect(isSealed(null)).toBe(false);
  });
});
