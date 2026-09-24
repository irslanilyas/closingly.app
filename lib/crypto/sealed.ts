import "server-only";
/**
 * Authenticated encryption for secrets stored in the database.
 *
 * AES-256-GCM through Web Crypto, which is the same API on Cloudflare Workers
 * and in Node, so nothing here depends on where it runs. GCM authenticates as
 * well as encrypts: a sealed value that has been altered fails to open rather
 * than opening into something else.
 *
 * The key is `TOKEN_ENCRYPTION_KEY`, 32 random bytes in base64, held only as a
 * server secret. It never reaches the browser, which is the point: a row read
 * through a user's own session, or a leaked database dump, holds ciphertext.
 */

export interface Sealed {
  /** Format version, so the scheme can change without guessing. */
  v: 1;
  /** 12-byte GCM nonce, base64. Fresh for every seal. */
  iv: string;
  /** Ciphertext with the GCM tag appended, base64. */
  data: string;
}

export function isSealed(value: unknown): value is Sealed {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Sealed).v === 1 &&
    typeof (value as Sealed).iv === "string" &&
    typeof (value as Sealed).data === "string"
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedKey: Promise<CryptoKey> | null = null;

/** Null when no key is configured, so callers can decide what that means. */
function loadKey(): Promise<CryptoKey> | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  cachedKey ??= (async () => {
    const bytes = fromBase64(raw.trim());
    if (bytes.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    }
    return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  })();

  return cachedKey;
}

export function hasSealingKey(): boolean {
  return !!process.env.TOKEN_ENCRYPTION_KEY;
}

export async function seal(value: unknown): Promise<Sealed> {
  const keyPromise = loadKey();
  if (!keyPromise) throw new Error("TOKEN_ENCRYPTION_KEY is not set");

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyPromise,
    plaintext
  );

  return { v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) };
}

export async function open<T>(sealed: Sealed): Promise<T> {
  const keyPromise = loadKey();
  if (!keyPromise) throw new Error("TOKEN_ENCRYPTION_KEY is not set");

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    await keyPromise,
    fromBase64(sealed.data)
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
