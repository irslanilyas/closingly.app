/**
 * Deliberately minimal:
 *   - `calendar.events.readonly` — we read events, never write to the calendar.
 *   - `gmail.send` — Google classes this as *sensitive*. The draft/read scopes
 *     (`gmail.compose`, `gmail.readonly`, `gmail.modify`) are *restricted* and
 *     require a paid third-party security assessment before public launch.
 *
 * Adding a scope later forces every user to re-consent, so widen this only
 * when a feature genuinely needs it.
 */
export const GOOGLE_SCOPE_LIST = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;
