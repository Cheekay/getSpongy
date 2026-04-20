# Phase 3 Design: Paid Tickets, Upvoting, Tipping & Analytics

**Date:** 2026-04-20  
**Status:** Approved  
**Phase:** 3 of 4

---

## 1. Overview

Phase 3 delivers the monetisation and engagement layer on top of the Phase 2 request loop:

- **Stripe Connect** — organiser onboarding, paid ticket checkout, platform fee collection
- **Upvoting** — checked-in attendees boost pending requests; DJ feed sortable by votes
- **Tipping** — attendees tip on pending requests to boost feed position; DJ controls the setting
- **Post-event analytics** — organiser stats page, CSV export, shareable recap graphic

Per-IP rate limiting and post-event email delivery are explicitly deferred to Phase 4.

---

## 2. Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Stripe Connect timing | Lazy connect — blocked at publish | Lets organisers draft paid events freely; gate enforced before it matters |
| Tip toggle scope | Per-event, set before going live | Avoids race conditions with in-flight PaymentIntents mid-event |
| Recap delivery | In-app PNG download only (no email) | Email pipeline deferred; shareable value delivered without new infra |
| Per-IP rate limiting | Deferred to Phase 4 | Per-user rate limit already in place; Phase 3 is dense enough |
| Upvote scope | Pending requests only | Upvotes are a prioritisation signal; accepted requests are already decided |
| Tip recipient | Organiser's Stripe Connect account | DJs onboarding Stripe is Phase 4; organiser settles with DJ separately |

---

## 3. Execution Strategy

Two parallel worktrees via subagent-driven development:

- **Track 1** — Stripe & Payments (migration `008_phase3_stripe.sql`)
- **Track 2** — Engagement & Analytics (migration `009_phase3_engagement.sql`)

Tracks have zero shared-state during implementation. Both must pass the full existing test suite before merging to master. Each adds its own tests targeting ≥80% coverage of new server actions.

---

## 4. Track 1: Stripe & Payments

### 4.1 Database changes (`008_phase3_stripe.sql`)

```sql
ALTER TABLE users
  ADD COLUMN stripe_connect_account_id TEXT,
  ADD COLUMN stripe_connect_onboarded  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE events
  ADD COLUMN tips_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN min_tip_cents  INTEGER NOT NULL DEFAULT 100;
```

### 4.2 Stripe Connect onboarding

- `initiateStripeConnect` server action: creates a Stripe Express account, returns the OAuth redirect URL.
- Callback route `GET /api/stripe/connect/callback`: exchanges auth code for account ID, sets `stripe_connect_onboarded = true` on the user row.
- `publishEvent` server action gains a pre-flight: if `rsvp_type = 'paid'` and `stripe_connect_onboarded = false`, return an error surfacing "Connect Stripe to publish" CTA.
- Payout status on event detail page reads `account.payouts_enabled` from the Stripe API (5-min server-side cache), mapping to three display states:
  - Not connected — neutral chip
  - Pending verification — amber chip
  - Connected / payouts enabled — lime chip

### 4.3 Ticket tier management

`ticket_tiers` is already in the schema. New server actions:

- `createTier(eventId, { name, priceCents, inventory })` — organiser only
- `updateTier(tierId, patch)` — organiser only
- `deleteTier(tierId)` — organiser only; blocked if `sold_count > 0`

UI: `/manage/events/[id]/tiers` — tier list with inline edit (screen 2 design).

### 4.4 Paid ticket checkout

Flow:
1. Attendee selects tier on event page → `createPaymentIntent` server action
2. Server validates inventory (`sold_count < inventory`), creates Stripe PaymentIntent with `application_fee_amount = floor(price * 0.03) + 99`
3. Client renders `<PaymentForm>` (Stripe Elements, `dynamic(..., { ssr: false })`)
4. On payment confirmation, Stripe fires `payment_intent.succeeded` webhook

Webhook handler `POST /api/stripe/webhook` (raw body, signature verified):
- `payment_intent.succeeded` → flip RSVP to `paid`, generate QR JWT, decrement `tier.sold_count`
- `payment_intent.payment_failed` → surface error; RSVP remains `rsvpd`
- `account.updated` → refresh `stripe_connect_onboarded` flag

Inventory guard: `sold_count >= inventory` renders tier as "Sold out" and blocks checkout client-side and server-side.

### 4.5 Tipping

Setup: DJ sets `tips_enabled` and `min_tip_cents` in event settings before going live. Immutable once `state = 'live'`.

`submitTip(requestId, amountCents, note?)` server action:
1. Validates: user is checked in, request is `pending`, `tips_enabled = true`, `amountCents >= min_tip_cents`
2. Creates Stripe PaymentIntent against organiser's Connect account
3. On synchronous confirmation: `UPDATE song_requests SET tip_cents = tip_cents + amountCents WHERE id = requestId`
4. Realtime broadcast picks up the updated row automatically

Tip modal (screen 7): preset chips ($1/$2/$5/Other), optional note, "Send $X Tip" CTA, "Tips are non-refundable" disclaimer.

DJ feed "Tips First" sort: `ORDER BY tip_cents DESC, created_at ASC`.

---

## 5. Track 2: Engagement & Analytics

### 5.1 Database changes (`009_phase3_engagement.sql`)

No new tables. Existing `upvotes` table and `upvote_count` column on `song_requests` are sufficient. Migration file adds only RLS policy additions if needed (to be determined during implementation).

### 5.2 Upvoting

`toggleUpvote(requestId)` server action:
1. Validates: user is checked in, request is `pending`
2. Attempts `INSERT INTO upvotes (request_id, user_id)` — if UNIQUE violation, deletes the existing row instead (toggle pattern)
3. `UPDATE song_requests SET upvote_count = upvote_count ± 1` accordingly
4. Returns new count and voted state

Client behaviour (LiveClient):
- Optimistic update: flip button state + increment/decrement count immediately
- On server error: revert to previous state
- Realtime subscription on `song_requests` keeps count in sync across all attendees

DJ dashboard:
- Request cards show upvote count with arrow-up icon (screen 8)
- "Most Upvoted" sort: `ORDER BY upvote_count DESC, created_at ASC`
- "Tips First" sort also available (Track 1 dependency; both sorts active once tracks merge)

### 5.3 Analytics page

Route: `GET /manage/events/[id]/analytics` — RSC, organiser-only middleware guard.

Queries (all on-demand, no snapshot table):

| Metric | Query |
|---|---|
| Attended | `COUNT(*) FROM rsvps WHERE event_id = ? AND status = 'checked_in'` |
| Revenue | `SUM(price_paid_cents) FROM rsvps WHERE event_id = ? AND status IN ('paid','checked_in')` |
| Requests by state | `COUNT(*) GROUP BY state FROM song_requests WHERE event_id = ?` |
| Top 10 tracks | `GROUP BY spotify_track_id ORDER BY COUNT(*) DESC LIMIT 10` with `SUM(upvote_count)` |
| Check-in timeline | `checked_in_at` bucketed by hour |

Check-in chart: lightweight custom SVG bar chart — no new charting library dependency.

CSV export: `GET /api/events/[id]/analytics/export` — streams CSV of all requests (title, artist, state, upvotes, tip_cents).

"Share Recap" button links to `/api/events/[id]/recap`.

### 5.4 Recap graphic

Route: `GET /api/events/[id]/recap` — returns PNG, `Content-Disposition: attachment`.

- Only available when `event.state = 'ended'`; returns 404 otherwise
- Generated server-side using `satori` (same as existing `/api/og` route)
- Layout: event name (Space Grotesk display), date, attendance count, top 3 most-played tracks with album art (URLs from `song_requests.album_art_url`), Spongy branding footer
- Neon nightlife aesthetic matching the app design system

---

## 6. Testing Strategy

| Area | Approach |
|---|---|
| Stripe Connect actions | Mock Stripe SDK; test success + already-onboarded + not-onboarded paths |
| Checkout / webhook | Mock Stripe webhook events; test PaymentIntent success, failure, inventory guard |
| Tipping | Mock Stripe; test min-amount guard, tips-disabled guard, checked-in guard |
| toggleUpvote | Real DB (vitest + Supabase local); test toggle on/off, pending-only guard, UNIQUE enforcement |
| Analytics queries | Real DB; seed known fixture data, assert correct counts |
| Recap route | Mock satori; assert 404 on non-ended event, 200 with correct content-type on ended |

Full existing 102-test suite must pass before either track merges.

---

## 7. Out of Scope (Phase 3)

- Per-IP rate limiting (requires Upstash/Redis + edge middleware — Phase 4)
- Post-event recap email (requires Inngest + email provider — Phase 4)
- Direct DJ tip payouts via Stripe Connect (requires DJ Stripe onboarding — Phase 4)
- Multi-tier ticket refunds (Phase 4)
- Stripe Radar fraud rules (Phase 4)
