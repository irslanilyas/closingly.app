/**
 * The digest email.
 *
 * Written as inline-styled HTML with a plain-text twin, because that is what
 * survives contact with real mail clients: no external stylesheet, no web
 * font, no flexbox, no dark-mode media query that Outlook will ignore and
 * Gmail will strip. Colours are hardcoded hex rather than tokens for the same
 * reason — an email cannot read the app's CSS variables.
 *
 * The palette here mirrors the product's own: near-white paper, graphite ink,
 * the steel blue accent.
 */

export interface DigestItem {
  title: string;
  body?: string | null;
  href?: string | null;
}

export interface DigestInput {
  /** Their first name if we have one, otherwise nothing. Never "there". */
  name?: string | null;
  appUrl: string;
  /** Things that happened. Ordered most consequential first. */
  items: DigestItem[];
  /** Open follow-ups worth naming, already sorted by priority. */
  followUps: DigestItem[];
}

const INK = "#1c1913";
const MUTED = "#6b6459";
const PAPER = "#fbfaf8";
const CARD = "#ffffff";
const RULE = "#e6e2db";
const BRAND = "#2b6ba8";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemHtml(item: DigestItem, appUrl: string): string {
  const title = escapeHtml(item.title);
  const heading = item.href
    ? `<a href="${appUrl}${escapeHtml(item.href)}" style="color:${INK};text-decoration:none;">${title}</a>`
    : title;

  return `
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid ${RULE};">
        <div style="font-size:14px;line-height:1.4;color:${INK};font-weight:500;">${heading}</div>
        ${
          item.body
            ? `<div style="margin-top:4px;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(item.body)}</div>`
            : ""
        }
      </td>
    </tr>`;
}

function sectionHtml(
  label: string,
  items: DigestItem[],
  appUrl: string
): string {
  if (items.length === 0) return "";

  return `
    <tr>
      <td style="padding:22px 18px 8px;">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};font-weight:600;">${escapeHtml(label)}</div>
      </td>
    </tr>
    ${items.map((i) => itemHtml(i, appUrl)).join("")}`;
}

export function renderDigest(input: DigestInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { items, followUps, appUrl } = input;

  // The subject is the single most important line in the whole email. Say what
  // happened, not "Your daily digest".
  const subject =
    followUps.length > 0 && items.length > 0
      ? `${items[0].title}, and ${followUps.length} follow-up${followUps.length === 1 ? "" : "s"} waiting`
      : items.length > 0
        ? items[0].title
        : `${followUps.length} follow-up${followUps.length === 1 ? "" : "s"} waiting`;

  const greeting = input.name?.trim()
    ? `${escapeHtml(input.name.trim())}, here is where things stand.`
    : "Here is where things stand.";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${PAPER};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(subject)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:${CARD};border:1px solid ${RULE};border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:20px 18px 4px;">
                <div style="font-size:15px;font-weight:600;color:${INK};letter-spacing:-0.01em;">Closingly</div>
                <div style="margin-top:10px;font-size:15px;line-height:1.5;color:${INK};">${greeting}</div>
              </td>
            </tr>
            ${sectionHtml("What happened", items, appUrl)}
            ${sectionHtml("Waiting on you", followUps, appUrl)}
            <tr>
              <td style="padding:20px 18px 24px;">
                <a href="${appUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:8px;">Open the workspace</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 18px 20px;border-top:1px solid ${RULE};">
                <div style="margin-top:14px;font-size:11.5px;line-height:1.5;color:${MUTED};">
                  You are getting this because your digest is switched on.
                  <a href="${appUrl}/settings" style="color:${MUTED};">Change it in Account</a>.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const lines: string[] = [greeting, ""];
  if (items.length > 0) {
    lines.push("WHAT HAPPENED");
    for (const i of items) {
      lines.push(`- ${i.title}${i.body ? `: ${i.body}` : ""}`);
    }
    lines.push("");
  }
  if (followUps.length > 0) {
    lines.push("WAITING ON YOU");
    for (const f of followUps) {
      lines.push(`- ${f.title}${f.body ? `: ${f.body}` : ""}`);
    }
    lines.push("");
  }
  lines.push(appUrl);

  return { subject, html, text: lines.join("\n") };
}
