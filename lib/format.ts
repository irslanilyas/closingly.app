export function formatCurrency(
  amount: number | null | undefined,
  currency = "USD"
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount))
    return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function parseAmountFromString(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Heuristic partial JSON parser — returns the largest valid JSON value parsable
 * from a possibly truncated string. Used for streaming AI output.
 */
export function tryParsePartialJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  // strip code fences
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  // Trim to start of JSON value
  const start = s.search(/[{\[]/);
  if (start === -1) return null;
  s = s.slice(start);

  // Walk the string, balance braces/brackets/strings, close gracefully.
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastSafeEnd = -1;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      if (!inString && stack.length === 0) lastSafeEnd = i;
      continue;
    }
    if (inString) continue;
    if (c === "{" || c === "[") stack.push(c);
    if (c === "}" || c === "]") {
      stack.pop();
      if (stack.length === 0) lastSafeEnd = i;
    }
  }

  // Try direct parse first
  try {
    return JSON.parse(s) as T;
  } catch {
    /* fall through */
  }

  // Build a candidate by closing open structures.
  let candidate = s;
  if (inString) candidate += '"';
  for (let i = stack.length - 1; i >= 0; i--) {
    candidate += stack[i] === "{" ? "}" : "]";
  }

  // Remove trailing commas before closers
  candidate = candidate.replace(/,(\s*[}\]])/g, "$1");

  try {
    return JSON.parse(candidate) as T;
  } catch {
    if (lastSafeEnd > 0) {
      try {
        return JSON.parse(s.slice(0, lastSafeEnd + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
