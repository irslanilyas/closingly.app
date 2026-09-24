import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * The one way a route reads a JSON body.
 *
 * Every request body is untrusted: parsed against a schema, bounded in size,
 * and rejected with a 400 that names the offending field rather than being
 * cast to a type and trusted. Unknown keys are dropped by the schemas (zod's
 * default), which is what keeps a client from writing a column it was never
 * offered, on top of the database's own column grants.
 */

/** Far above any real body here; a cap before parsing, not after. */
const MAX_BODY_BYTES = 256 * 1024;

type Parsed<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<Parsed<z.infer<S>>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ error: "body_too_large" }, { status: 413 }),
    };
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return {
        ok: false,
        response: NextResponse.json({ error: "body_too_large" }, { status: 413 }),
      };
    }
    raw = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "invalid_body",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/** Shared field shapes, so the same thing is validated the same way everywhere. */
export const field = {
  id: z.uuid(),
  /** Trimmed text with an upper bound; empty strings become null. */
  text: (max: number) =>
    z
      .string()
      .trim()
      .max(max)
      .transform((value) => (value === "" ? null : value)),
  money: z.number().finite().min(0).max(100_000_000),
  isoDate: z.iso.date(),
};
