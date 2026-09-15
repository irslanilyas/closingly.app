# Product


## Platform

web

## Users

Independent consultants and freelance service providers running their own business alone — the person who does the client work *and* the selling, with no ops support behind them.

Small agencies are a plausible later market. They are not a target today, but architecture should avoid decisions that make multi-user, roles, or shared pipelines expensive to add.

The user is the seller, not a sales team. There is no manager reviewing their pipeline and no CRM administrator configuring anything for them.

## Product Purpose

Closingly removes the administrative tail that follows every client call.

A consultant finishes a discovery call and would normally spend the next couple of hours writing a proposal, guessing at a price, drafting a follow-up, and updating wherever they track deals. Closingly takes the recorded conversation and produces those artifacts directly: a drafted proposal, a pricing recommendation grounded in the user's own past deals, and a tracked deal on a pipeline.

Success, as confirmed by the founders, is all four of:

- hours returned after every call
- a higher share of pitched work actually won
- pricing that reflects what the work is worth, rather than a nervous guess
- nothing slipping — no deal going quiet unnoticed, no follow-up forgotten, no scope creep silently absorbed

## Positioning

Horizontal meeting-intelligence tools stop at the transcript. They produce notes and action items, and the actual work — writing the proposal, setting the price, chasing the follow-up — still falls to the user.

Closingly carries a single conversation all the way through to a priced proposal, a tracked deal, and post-close learning from the outcome. That continuity is the mechanism, and it depends on being vertical: a general-purpose notetaker serving every team on earth cannot encode consulting-deal logic without alienating most of its users.

The system also learns from the user's own closed deals rather than generic benchmarks, which is only possible because it owns the full loop rather than the front half.

## Operating Context

- Discovery and client calls happen on Google Meet, Zoom, and Teams.
- Calls reach the product two ways: a bot joins from the user's synced calendar, or the user pastes a transcript exported from another tool. Both paths run through the same processing pipeline.
- The bot joins as a **visible participant**, named in-call. This is a deliberate product stance, not a limitation — covert or desktop-SDK capture was considered and rejected, and the visibility is stated in the terms.
- Only meetings the user explicitly enables are recorded. Nothing is captured by default.
- Finished proposals are shared with clients as links, and client engagement with those links is tracked.
- Currently in invite-only private beta.

## Capabilities and Constraints

**Confirmed capabilities:** calendar-triggered meeting bot; transcript import; automatic classification of call type (only discovery calls produce a deal); proposal generation and plain-language refinement; shareable proposal links with per-section view tracking; pricing recommendations; scope-creep detection; follow-up drafting; pipeline in kanban, list, and forecast views; client health signalling; win/loss analysis; capacity forecasting; loss post-mortems; case-study drafting; competitor-mention capture; recording playback with a transcript that follows along.

**Constraints:**

- Recording media is retained by the meeting provider, not stored by Closingly. Playback URLs are fetched fresh per view and expire.
- Recording time is metered and capped per user, because the meeting provider bills by the hour.
- Uploaded audio files cannot be transcribed. The meeting provider only transcribes what its own bot captured. Supporting file upload requires a separate transcription vendor and is deliberately deferred.
- Multi-tenant, with per-user isolation enforced at the database layer.

**Terminology:** the unit of work is a *deal*, progressing through Lead → Proposal Sent → Negotiating → Won/Lost. Calls are *meetings*.

**Market and currency:** pricing recommendations should infer market and currency from the client and the conversation rather than assuming a default. *Known defect:* the pricing prompt currently hardcodes Pakistani market context as its default, which contradicts this and needs correcting.

**Explicitly undecided:** monetization model, pricing tiers, and free-tier boundaries. Public launch timing. Whether agencies become a supported segment.

## Brand Commitments

- **Name:** Closingly. Primary domain `closingly.app`.
- The in-call bot presents as "Closingly Notetaker" and is visible to every participant by design.
- Transparency about recording is a product position, not a compliance checkbox. Copy should never soften or obscure the fact that a call is being recorded.

## Evidence on Hand

- A deployed, working application currently used only by the two founders.
- Real recorded client calls processed end to end through the system.
- A recorded product walkthrough (Loom).

**Absences that future work must not fabricate:** there are no customers, no testimonials, no case studies, no usage statistics, no revenue, and no third-party validation. Nothing may imply otherwise in product copy, marketing surfaces, or generated content.

## Product Principles

1. **The conversation is the input.** Anything already said on the call should never be re-typed by the user. Every field the product asks for is a small failure.
2. **Visible, never covert.** The bot announces itself and consent is explicit. Trust is the product's foundation, and a single covert-feeling behavior would cost more than any feature gains.
3. **Ground advice in their history, not averages.** Pricing and win/loss guidance come from this user's own closed deals. Generic benchmarks are worse than silence.
4. **Silence is a signal.** Surface deals going quiet, follow-ups unsent, and scope quietly expanding — without waiting to be asked.
5. **Solo-first, but never a dead end.** Optimize entirely for one person today; avoid choices that would make supporting a second person a rewrite.

## Accessibility & Inclusion

No formal product-specific standard has been set. Recorded as undecided rather than assumed.

Relevant context: one founder builds accessibility tooling professionally (a Framer plugin that detects and remediates WCAG issues during development), so accessibility competence exists in-house and shipped interfaces should reflect it.
