/**
 * The shapes Ask Closingly streams to the panel and stores per message.
 * Shared by the server and the browser, so kept free of server-only code.
 */

export type ActionRisk = "safe" | "external" | "destructive";

export type ActionStatus = "pending" | "running" | "done" | "cancelled" | "failed" | "expired";

export interface ActionField {
  label: string;
  before?: string | null;
  after: string;
}

export interface ActionSummary {
  title: string;
  detail?: string;
  fields?: ActionField[];
}

export interface ActionResult {
  message: string;
  href?: string;
}

/** What the panel draws for a proposed change, stored and streamed alike. */
export interface ActionView extends ActionSummary {
  id: string;
  kind: string;
  risk: ActionRisk;
  status: ActionStatus;
  result?: ActionResult | null;
  error?: string | null;
}

export interface LinkPart {
  type: "link";
  label: string;
  href?: string;
  run?: "sync_calendar";
}

export type AskPart =
  | { type: "text"; text: string }
  | { type: "step"; id: string; label: string; status: "running" | "done" | "error" }
  | { type: "action"; action: ActionView }
  | LinkPart;

/** One line of the NDJSON stream from POST /api/ask. */
export type AskEvent =
  | { type: "conversation"; id: string | null; title: string }
  | { type: "text"; delta: string }
  | { type: "part"; part: AskPart }
  | { type: "step"; id: string; status: "done" | "error" }
  | { type: "done"; message_id: string | null }
  | { type: "error"; message: string };

export interface AskMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: AskPart[];
}
