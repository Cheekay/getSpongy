# Phase 4 Design: Pro Subscriptions, Advanced Ticketing & DJ Payments

**Date:** 2026-04-21
**Status:** Approved
**Phase:** 4 of 4

---

## 1. Overview

Phase 4 closes the loop on monetisation and platform completeness. It ships in two parallel worktrees:

- **Track A — Pro & Branding:** Stripe Billing subscriptions, feature gating, custom branding, team seats
- **Track B — Ticketing & DJ Payments:** Waitlists, ticket transfers, organizer-approved refunds, DJ Stripe Connect + payout history

Per-IP rate limiting, post-event email delivery, and the Expo native wrapper are explicitly deferred — they require infrastructure (Upstash Redis, Inngest + email provider) that should be scoped separately.

---

## 2. Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Subscription billing | Stripe Billing (Subscriptions API) | Already have Stripe; handles trials, dunning, billing portal, receipts automatically |
| Feature gating | `isProUser()` server helper + `<ProGate>` client component | One canonical check, usable in both RSC and client contexts |
| Pro tier price | $19/mo with 14-day free trial | Matches PRD §10.3 ($15–$25 range); trial lowers activation friction |
| Refund model | Organizer-approved (attendee requests, organizer approves/denies) | Organizer stays in control; reduces chargeback risk |
| Ticket transfer | JWT-based one-time claim link (24h expiry) | Matches PRD §6.2 spec; prevents screenshot sharing |
| Waitlist notification | SMS on first position when ticket freed | Simple, no email infra required yet |
| DJ Stripe Connect | Reuse existing Express account pattern from organizer onboarding | Same Stripe flow, scoped by `role_flags.dj`; no new OAuth plumbing |
| Tip routing | DJ Connect account when onboarded, organizer fallback | Enables direct DJ payouts without breaking existing events |
| Team seat scope | Per-organizer account (not per-event) | Simpler — team members get access to all that organizer's events |

---

## 3. Execution Strategy

Two parallel worktrees via subagent-driven development:

- **Track A** — migrations `011_phase4_pro.sql`, new subscription/branding/team server actions, `/upgrade`, `/manage/subscription`, `/manage/brand`, `/manage/team` routes
- **Track B** — migrations `012_phase4_ticketing.sql`, new waitlist/transfer/refund/dj-payout server actions, all new attendee + DJ routes

Tracks have zero shared-state during implementation. Both must pass the full existing test suite before merging to master. Each adds its own tests targeting ≥80% coverage of new server actions.

---

## 4. Track A: Pro Subscriptions, Branding & Team

### 4.1 Database (`011_phase4_pro.sql`)

```sql
ALTER TABLE users
  ADD COLUMN subscription_status      TEXT NOT NULL DEFAULT 'free',
  -- values: free | trialing | active | past_due | canceled
  ADD COLUMN stripe_customer_id       TEXT,
  ADD COLUMN stripe_subscription_id   TEXT,
  ADD COLUMN subscription_period_end  TIMESTAMPTZ,
  ADD COLUMN brand_logo_url           TEXT,
  ADD COLUMN brand_accent_color       TEXT,
  ADD COLUMN brand_hide_watermark     BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_phone   TEXT NOT NULL,
  role            TEXT NOT NULL,  -- co_organizer | door_staff
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at     TIMESTAMPTZ
);
```

### 4.2 Feature Gating (`lib/pro.ts`)

- `isProUser(userId)` — queries `users.subscription_status IN ('trialing', 'active')`. Used in server actions and RSC pages.
- `requirePro()` — server-side guard; throws `redirect('/upgrade')` if not pro.
- `<ProGate feature="...">` — client component; renders children for pro users, renders the paywall bottom sheet for free users. Takes a `feature` prop for the paywall description copy.

### 4.3 Stripe Billing (`lib/actions/subscription.ts`)

- `createCheckoutSession()` — creates or retrieves a Stripe Customer, then creates a Checkout Session with a 14-day trial and the Pro monthly price ID. Returns `{url}` for client-side redirect.
- `createBillingPortalSession()` — creates a Stripe Billing Portal Session against the user's `stripe_customer_id`. Returns `{url}`.

Webhook events (extend `app/api/stripe/webhook/route.ts`):

| Event | Action |
|---|---|
| `customer.subscription.created` | Set `subscription_status = trialing\|active`, store `stripe_subscription_id`, `subscription_period_end` |
| `customer.subscription.updated` | Sync `subscription_status` + `subscription_period_end` |
| `customer.subscription.deleted` | Set `subscription_status = canceled` |
| `invoice.payment_failed` | Set `subscription_status = past_due` |
| `invoice.payment_succeeded` | Set `subscription_status = active` (recovers from `past_due`) |

### 4.4 Custom Branding (`lib/actions/branding.ts`)

- `saveBrandSettings({ logoUrl?, accentColor?, hideWatermark })` — pro-gated via `requirePro()`. Updates `brand_logo_url`, `brand_accent_color`, `brand_hide_watermark` on the user row.
- Logo upload uses existing Supabase Storage (`event-covers` bucket, new `brand-logos/` prefix).
- Recap graphic route (`/api/events/[id]/recap`) reads `organizer.brand_logo_url` and `brand_hide_watermark`; omits Spongy footer when `hide_watermark = true`.

### 4.5 Team Seats (`lib/actions/team.ts`)

- `inviteTeamMember(phone, role)` — pro-gated. Inserts `team_members` row with `status = pending`. Sends SMS with a `/join-team/[token]` link (signed JWT, 48h expiry).
- `acceptTeamInvite(token)` — validates JWT, sets `member_user_id = auth.uid()`, `status = accepted`, `accepted_at = now()`.
- `removeTeamMember(id)` — organizer only; deletes row.
- `resendInvite(id)` — regenerates JWT token, re-sends SMS.

Team members with `role = door_staff` get read access to the event's RSVP list (RLS policy on `rsvps`) for door scanning. `co_organizer` additionally gets write access to event settings.

### 4.6 New Routes (Track A)

| Route | Guard | Description |
|---|---|---|
| `/upgrade` | None | Pricing page — Free vs Pro, Organizer/DJ toggle, `createCheckoutSession` action |
| `/manage/subscription` | Auth | Current plan, billing history via Stripe portal redirect |
| `/manage/brand` | Pro | Brand settings — logo upload, accent color, watermark toggle |
| `/manage/team` | Pro | Team list, invite form, pending invites |
| `/join-team/[token]` | None (OTP if not authed) | Accept team invite |

**Modifications to existing routes:**
- `/manage/layout.tsx` — "Upgrade to Pro" banner for free-tier users; `<ProGate>` wraps Brand and Team nav items
- `/manage/events/[id]` — link to Team page; payout status chip remains unchanged

---

## 5. Track B: Advanced Ticketing & DJ Payments

### 5.1 Database (`012_phase4_ticketing.sql`)

```sql
CREATE TABLE waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id     UUID REFERENCES ticket_tiers(id),
  position    INTEGER NOT NULL,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE ticket_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id         UUID NOT NULL REFERENCES rsvps(id),
  from_user_id    UUID NOT NULL REFERENCES users(id),
  recipient_phone TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | expired | cancelled
  expires_at      TIMESTAMPTZ NOT NULL,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refund_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id          UUID NOT NULL REFERENCES rsvps(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  reason           TEXT NOT NULL,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | denied
  stripe_refund_id TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);
```

No new columns needed for DJ Stripe Connect — `stripe_connect_account_id` and `stripe_connect_onboarded` already exist on `users` from Phase 3. DJ onboarding reuses `initiateStripeConnect` and the existing callback route; role is determined by `role_flags.dj`.

### 5.2 Waitlist (`lib/actions/waitlist.ts`)

- `joinWaitlist(eventId, tierId?)` — validates event is sold out, inserts at `MAX(position) + 1`. Returns position number shown to user.
- `leaveWaitlist(eventId)` — removes user's row.
- `notifyWaitlist(eventId, tierId?)` — called internally when a ticket is freed (refund approved or cancellation). Finds position-1 entry, sends SMS with a time-limited checkout link. Sets `notified_at`. If user doesn't claim within 24h, an Inngest cron job (`waitlist/expire-notification`) re-runs `notifyWaitlist` for position 2. This job must be registered as part of Track B.

`/e/[code]` attendee page: when all `ticket_tiers` have `sold_count >= inventory`, replace checkout with "Sold Out — Join Waitlist" state linking to `/e/[code]/waitlist`.

### 5.3 Ticket Transfers (`lib/actions/transfers.ts`)

- `initiateTransfer(rsvpId, recipientPhone)` — validates RSVP belongs to auth user and is `paid` or `checked_in`. Creates `ticket_transfers` row with JWT token (HMAC-signed, 24h expiry, payload: `{transferId, rsvpId}`). Sends SMS to recipient with `/claim/[token]` link.
- `cancelTransfer(transferId)` — sets `status = cancelled`. Original RSVP remains valid.
- `claimTransfer(token)` — verifies JWT + expiry; checks `status = pending`. Creates new RSVP for `auth.uid()` (copied from original), generates new QR JWT. Sets original RSVP `status = transferred` (invalidating its QR). Sets transfer `status = claimed`, `claimed_at = now()`. Note: `transferred` must be added to the valid `rsvps.status` enum alongside `rsvpd | paid | checked_in | refunded | cancelled`.

### 5.4 Refunds (`lib/actions/refunds.ts`)

- `requestRefund(rsvpId, reason, note?)` — validates RSVP belongs to auth user, is `paid`/`checked_in`, and event `start_at > now() + 24h` (policy window). Inserts `refund_requests` row.
- `approveRefund(requestId)` — organizer only. Calls `stripe.refunds.create({ payment_intent: rsvp.stripe_payment_intent_id })`. On success: sets RSVP `status = refunded`, sets request `status = approved`, `resolved_at = now()`, calls `notifyWaitlist(eventId)`.
- `denyRefund(requestId)` — organizer only. Sets `status = denied`, `resolved_at = now()`. RSVP unchanged.

Organizer sees pending count badge on `/manage/events/[id]` linking to `/manage/events/[id]/refunds`.

### 5.5 DJ Stripe Connect & Payouts (`lib/actions/dj-payouts.ts`)

Onboarding: DJ visits `/studio/payouts` → taps "Connect with Stripe" → calls existing `initiateStripeConnect` (no changes needed) → redirects through existing callback route → `stripe_connect_onboarded = true` set on user row.

- `getDjPayoutHistory()` — calls `stripe.transfers.list({ destination: user.stripe_connect_account_id })` + `stripe.payouts.list` on the connected account. Returns combined list for the payout history UI.
- `requestDjPayout()` — calls `stripe.payouts.create` on the connected account for the available balance.

**Tip routing change in `lib/actions/tips.ts`:**

```
if event.dj_id AND dj.stripe_connect_onboarded:
  route PaymentIntent application_fee to platform,
  transfer remainder to dj.stripe_connect_account_id
else:
  existing behaviour (route to organizer Connect account)
```

### 5.6 New Routes (Track B)

| Route | Guard | Description |
|---|---|---|
| `/e/[code]/waitlist` | Auth | Join waitlist for sold-out event |
| `/tickets/[rsvpId]/transfer` | Auth + owns RSVP | Initiate ticket transfer |
| `/claim/[token]` | None (OTP if not authed) | Accept transferred ticket |
| `/manage/events/[id]/refunds` | Organizer | Pending refund requests — approve/deny |
| `/studio/payouts` | DJ | Stripe Connect onboarding + payout history |

**Modifications to existing routes:**
- `/e/[code]` — sold-out state with waitlist CTA
- `/live/[eventId]` — "Transfer Ticket" action in ticket menu
- `/manage/events/[id]` — refund requests badge chip

---

## 6. Testing Strategy

| Area | Approach |
|---|---|
| Stripe Billing actions | Mock Stripe SDK; test checkout session creation, portal session, all 5 webhook event types |
| `isProUser` / `requirePro` | Unit tests for all 5 subscription states |
| `<ProGate>` | Component test — renders paywall for free, renders children for pro/trialing |
| Branding actions | Real DB; test pro guard blocks free users, logo URL persisted correctly |
| Team actions | Real DB; test invite creation, accept flow, role-based RLS on rsvps |
| `joinWaitlist` | Real DB; test duplicate guard (`UNIQUE`), position ordering |
| `initiateTransfer` / `claimTransfer` | Real DB; test JWT expiry rejection, double-claim prevention, RSVP status transitions |
| `requestRefund` | Real DB; test policy window guard (blocks if < 24h before event) |
| `approveRefund` / `denyRefund` | Mock Stripe `refunds.create`; test state transitions, `notifyWaitlist` called on approve |
| DJ tip routing | Mock Stripe; test routes to DJ Connect when onboarded, falls back to organizer |
| DJ payout history | Mock Stripe transfers API; assert correct aggregation |

Full existing test suite must pass before either track merges to master.

---

## 7. Out of Scope (Phase 4)

- Per-IP rate limiting (requires Upstash Redis + edge middleware)
- Post-event recap email (requires Inngest + email provider)
- Stripe Radar fraud rules
- Multi-currency support (USD only)
- Native Expo app wrapper (deferred pending PWA adoption data)
- Secondary ticket market / resale
- Pay-what-you-want ticket type
