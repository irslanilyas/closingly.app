import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { kimiComplete, KimiError } from "@/lib/kimi";
import { parseJsonResponse } from "@/lib/anthropic";
import { templatePrompt } from "@/lib/prompts";
import { coerceTheme } from "@/lib/proposal-theme";

export const maxDuration = 60;

/** Generations per user per hour. The only billable action in this feature. */
const HOURLY_LIMIT = 8;

/** Total saved custom templates. A picker past this stops being a picker. */
const TOTAL_LIMIT = 24;

/** Built-ins plus the caller's own, newest first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS already returns built-ins plus this user's rows; the ordering is what
  // puts the three we ship first and anything generated after them.
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, description, design, is_builtin, created_at")
    .order("is_builtin", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[templates] list failed:", error);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

/** Generate a new look from a plain-English brief. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { brief?: string };
  const brief = (body.brief ?? "").trim().slice(0, 400);

  if (!brief) {
    return NextResponse.json({ error: "missing_brief" }, { status: 400 });
  }

  const { data: mine } = await supabase
    .from("templates")
    .select("name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const own = mine ?? [];

  if (own.length >= TOTAL_LIMIT) {
    return NextResponse.json(
      { error: "too_many", message: "Delete a template before making another." },
      { status: 429 }
    );
  }

  // Rate limit read off the templates table itself. A generation always leaves
  // a row, so the row count *is* the counter — no second store to keep in sync
  // and nothing to reset when a serverless instance goes away.
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = own.filter((t) => new Date(t.created_at).getTime() > hourAgo);

  if (recent.length >= HOURLY_LIMIT) {
    return NextResponse.json(
      { error: "rate_limited", message: "That's plenty of designs for one hour." },
      { status: 429 }
    );
  }

  let generated: { name?: string; description?: string; design?: unknown };

  try {
    const raw = await kimiComplete({
      prompt: templatePrompt(
        brief,
        own.map((t) => t.name)
      ),
    });
    generated = parseJsonResponse(raw);
  } catch (err) {
    const status = err instanceof KimiError && err.retryable ? 503 : 502;
    console.error("[templates] generation failed:", err);
    return NextResponse.json(
      { error: "generation_failed", message: "Couldn't design that. Try again." },
      { status }
    );
  }

  // coerceTheme is the security boundary: everything above this line came from
  // a model, everything below is a known-good enum or a validated hex colour.
  const design = coerceTheme(generated.design);

  const name =
    typeof generated.name === "string" && generated.name.trim()
      ? generated.name.trim().slice(0, 40)
      : "Untitled";

  const description =
    typeof generated.description === "string"
      ? generated.description.trim().slice(0, 120)
      : null;

  const { data: saved, error } = await supabase
    .from("templates")
    .insert({ user_id: user.id, name, description, design, is_builtin: false })
    .select("id, name, description, design, is_builtin, created_at")
    .single();

  if (error) {
    console.error("[templates] insert failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ template: saved });
}
