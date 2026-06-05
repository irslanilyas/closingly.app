# RevOps Builder — Handoff

Internal workbench for testing seven revenue-operations AI modules before
designing the production product. Built with Next.js 16 (App Router) + Tailwind v4
+ shadcn/ui + Supabase + the Claude API (`claude-sonnet-4-20250514`). All seven
modules are functional, streaming, and persist deals to Postgres via Supabase.

---

## What's built

| # | Module | Route | Notes |
|---|---|---|---|
| 1 | Proposal Generator | `/proposal-generator` | Streaming JSON parsed field-by-field; saves to pipeline |
| 2 | Deal Pipeline (kanban + list + detail) | `/pipeline`, `/pipeline/[deal_id]` | dnd-kit drag-between-stages, save-on-blur edits |
| 3 | Follow-up Writer | `/follow-up-writer` | 3 tones, optional deal context preloaded |
| 4 | Pricing Advisor | `/pricing-advisor` | Grounded in your historical deals |
| 5 | Pipeline Forecaster | `/forecaster` | recharts bar chart, weighted by stage probability |
| 6 | Meeting Transcriber | `/meeting-transcriber` | Text-only for now; hands off cleaned text to module 1 |
| 7 | Scope Guardian | `/scope-guardian` | In-scope / scope-creep / grey-area verdict + suggested reply |

Plus: magic-link login (`/login`), settings (`/settings`), generations audit log,
and an editorial dashboard launcher (`/`).

---

## What you do next

### 1. Supabase setup

The database migration has already been applied to your **RevOps Builder**
project (`fdearocznjaxwplndpyb`). If you ever rerun it:

1. Open Supabase → SQL Editor.
2. Paste `supabase/migrations/001_initial_schema.sql` and run it.

### 2. Whitelist your two emails

Magic-link auth is enabled by default in Supabase, which means anyone with an
email could request a link. To lock it down to just you and your teammate:

- Go to **Authentication → Sign In / Up** in the Supabase dashboard.
- Either:
  - Toggle **"Allow new users to sign up"** OFF and pre-create both users via
    **Authentication → Users → Add user**, or
  - Add an "Authentication Hook" that rejects unknown emails.

The simpler path is to add both users manually under
**Authentication → Users → Add user** and then turn off public sign-up.

### 3. Auth redirect URL

For magic-link redirects to work locally, add this to Supabase →
**Authentication → URL Configuration → Redirect URLs**:

```
http://localhost:3000/api/auth/callback
```

### 4. Environment variables

`.env.local` is already populated with the Supabase URL, anon key, and the
Anthropic API key you handed me. `.env.example` is committed for reference.

If you ever want to use the service-role key (e.g. for an admin script),
fill in `SUPABASE_SERVICE_ROLE_KEY` — none of the app code uses it currently.

### 5. Run it

```bash
cd revops-builder
npm run dev
```

Open <http://localhost:3000>, request a magic link, click it from your email,
and you land on the dashboard.

---

## Architectural decisions worth knowing

### Next.js 16 (not 15)

`create-next-app` resolved to **16.2.7** with React 19. A few API surfaces
differ from Next 15:

- **`middleware.ts` was renamed `proxy.ts`**. The file is at the project root.
- **`params` and `searchParams`** in pages and route handlers are now
  `Promise`-wrapped — they're awaited everywhere they're used.
- **`cookies()`** from `next/headers` is async.
- Anything calling `useSearchParams()` is wrapped in `<Suspense>` to avoid the
  prerender bailout error.

### Auth gating

Two layers:

1. **`proxy.ts`** intercepts every non-static request, refreshes the Supabase
   session, and redirects to `/login` if there's no user. Authenticated users
   visiting `/login` are bounced back to `/`.
2. Each client page renders inside `AppShellClient`, which also checks the user
   in the browser as a belt-and-braces guard and shows a quick loading dot
   while the check runs.

### Streaming + partial JSON

All AI endpoints return `text/plain` streams from the Anthropic SDK
(`anthropic.messages.stream`). On the client we read the body as a
`ReadableStream`, accumulate text, and call `tryParsePartialJson()` after every
chunk — that helper closes unfinished braces / brackets and strips trailing
commas so the UI can render the proposal fields field-by-field as they arrive.

For the transcript cleaner the model returns plain text, so we stream straight
into the output card.

### Data model

- `profiles` is mirrored from `auth.users` via a trigger.
- `deals` is the central entity. Proposal fields, transcript, replies (jsonb),
  and the lifecycle `stage` enum live on this table.
- `generations` is a non-blocking audit log — every AI call appends a row with
  module name, input, output, and optional `deal_id`. Useful for prompt
  iteration later.

RLS is enabled on all three with `auth.uid() = user_id` policies, so each user
only ever reads their own rows even though the anon key is shipped to the
browser.

### Design

- Palette: warm neutral (oklch warm-grey scale) + sage green
  (`oklch(0.45 0.06 160)` ≈ `#2D5F4F`). One accent, used sparingly for prices,
  primary CTAs, and the won-deal stage.
- Typography: Inter via `next/font/google`, two weights (regular + medium),
  four sizes — `26-32px` titles, `15px` body, `13-13.5px` UI, `10.5-11px`
  uppercase eyebrows with `0.14em-0.18em` tracking.
- No gradients, no shadows above 4px, no emoji, no responsive code. The page
  containers cap at `max-w-[1280px]` and the dashboard / detail layouts assume
  ≥1440 px width.
- Dark theme tokens are wired in `globals.css` even though the topbar never
  toggles it — it's there so anything you build later inherits the same
  variables.

---

## Shortcuts taken (deliberate)

1. **No audio transcription.** Module 6 accepts pasted text only — an info
   banner says so. Adding Whisper / Deepgram is a Phase-4 follow-up.
2. **Pipeline → Quick Action "Re-analyze with Scope Guardian"** routes to
   `/scope-guardian?sow={deal_id}`, but the Scope Guardian page does not yet
   preload the original SOW from the linked deal — the user still pastes both
   panes. Same with the `?deal=` deep link on Follow-up Writer; the dropdown
   is preselected but the situation textarea stays empty (correct UX — you'll
   describe the situation in your own words).
3. **No Supabase migration tooling.** The schema lives at
   `supabase/migrations/001_initial_schema.sql` as a single committed file. I
   applied it directly via the Supabase MCP — no `supabase` CLI is wired up.
4. **TanStack Query is configured but only used by `/pipeline`.** Other pages
   use plain `fetch` since they're one-shot generations. Nothing wrong with
   wiring more queries in later.
5. **Activity log is minimal.** The deal-detail right sidebar shows
   `created_at` and a "last updated" line — there's no granular stage-change
   history. Adding it means a small `deal_events` table.
6. **No file uploads, no storage, no team invites, no marketing pages,
   no settings galore.** Per the brief.

---

## Project layout

```
revops-builder/
├── app/
│   ├── layout.tsx                 # Inter font, sonner, TanStack provider
│   ├── globals.css                # Sage + warm-grey theme tokens
│   ├── page.tsx                   # Dashboard launcher (4 phases)
│   ├── login/page.tsx             # Magic-link form
│   ├── settings/page.tsx
│   ├── proposal-generator/page.tsx
│   ├── pipeline/page.tsx          # Kanban + list view
│   ├── pipeline/[deal_id]/page.tsx
│   ├── follow-up-writer/page.tsx
│   ├── pricing-advisor/page.tsx
│   ├── forecaster/page.tsx
│   ├── meeting-transcriber/page.tsx
│   ├── scope-guardian/page.tsx
│   └── api/
│       ├── auth/callback/route.ts
│       ├── deals/route.ts
│       ├── deals/[id]/route.ts
│       ├── proposal/generate/route.ts
│       ├── followup/generate/route.ts
│       ├── pricing/generate/route.ts
│       ├── transcript/clean/route.ts
│       └── scope/analyze/route.ts
├── components/
│   ├── ui/                        # shadcn primitives
│   ├── providers/query-provider.tsx
│   ├── app-shell.tsx              # server-side gate
│   ├── app-shell-client.tsx       # client-side gate (used by interactive pages)
│   ├── topbar.tsx                 # sticky nav + email + logout
│   ├── page-header.tsx
│   ├── module-card.tsx
│   ├── proposal-output.tsx
│   ├── reply-card.tsx
│   ├── fit-score.tsx
│   ├── stage-badge.tsx
│   └── copy-button.tsx
├── lib/
│   ├── supabase/{client,server,middleware}.ts
│   ├── anthropic.ts
│   ├── prompts.ts                 # All five AI prompts in one file
│   ├── types.ts
│   ├── format.ts                  # tryParsePartialJson + currency helpers
│   └── utils.ts                   # cn()
├── supabase/
│   └── migrations/001_initial_schema.sql
├── proxy.ts                       # auth gating (was middleware.ts in N15)
└── .env.local / .env.example
```

---

## Verifying it works

A quick sanity loop after `npm run dev`:

1. Sign in with `irslanilyas6@gmail.com` (magic link).
2. Land on `/`. See all 7 module cards in their 4 phases.
3. `/proposal-generator` → paste any discovery call → watch fields stream in
   → click **Save to pipeline**.
4. `/pipeline` → see the deal in the **Lead** column → drag to **Negotiating**.
5. Click the deal → tabs show Overview, Transcript, Proposal, Replies, Notes.
6. `/forecaster` → the new deal contributes to the weighted bar chart.
7. `/follow-up-writer` → pick the deal from the dropdown → describe situation
   → three replies arrive.
8. `/scope-guardian` → paste any SOW + any new request → verdict + reply.
9. `/meeting-transcriber` → paste a messy transcript → cleaned text →
   **Send to Proposal Generator** routes you back with it pre-filled.

If anything 500s, check the dev server console — every API route logs to
`console.error` on failure.

---

That's the whole workbench. The prompts in `lib/prompts.ts` are the cheapest
place to iterate; everything else stays put.
