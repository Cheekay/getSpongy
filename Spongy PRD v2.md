# Spongy — Product Requirements Document (v2)

**Owner:** Chike Onyema
**Status:** Draft — working spec for MVP build
**Last updated:** April 17, 2026

---

## 0. TL;DR

Spongy is a mobile-first event platform that combines lightweight event discovery & RSVP (Partiful-style) with a real-time, DJ-moderated song request system. Attendees RSVP, check in via QR, and submit song requests from their phones. DJs approve, reject, or mark requests as played from a tablet dashboard. Organizers list paid or free events, track attendance, and access post-event analytics.

The wedge is the **song request + moderation loop** — no general-purpose ticketing tool does this, and no DJ request tool handles ticketing/RSVP well. Ticketing gets us distribution (why the DJ and crowd are already in the app); requests drive retention and repeat bookings.

---

## 1. Product Vision & Value Proposition

Spongy bridges the gap between performers and their audience by digitizing the song request experience without compromising the DJ's artistic flow. It's a dual-purpose platform: event discovery/RSVP on one end, real-time audience interaction on the other.

- **For attendees:** Influence the vibe without leaving the dance floor, without yelling at the DJ, and without feeling ignored.
- **For DJs:** See signal through the noise — know what the room wants in real time, keep full creative control, and walk away with data on what actually worked.
- **For organizers:** Sell or distribute tickets, run the door, and get post-event reports on attendance, peak engagement, and top requests.

**One-line positioning:** *Partiful meets Shazam — with the DJ in charge.*

---

## 2. Problem & Opportunity

### 2.1 Problems we're solving

1. **For attendees:** Requesting a song today means elbowing to the booth, shouting, and usually being ignored. There's no feedback loop — you don't know if the DJ heard you, liked the idea, or will play it.
2. **For DJs:** Requests come as a chaotic firehose — drunk guests, duplicate asks, songs that don't fit the set. DJs either ignore everyone (bad experience) or get pulled out of flow (bad performance).
3. **For organizers:** Existing event tools (Eventbrite, Partiful) solve discovery/RSVP but have zero visibility into what happened *during* the event. There's no engagement data, no way to measure what drove the crowd, no artifact to share post-event.

### 2.2 Why now

- Phone-first event behavior is now the default (Partiful, Posh, Dice have normalized mobile RSVP).
- Spotify's API makes song metadata search trivial and free.
- Realtime infra (Supabase, Ably, Pusher) is cheap enough to support a live request feed at small scale.
- DJ-as-creator economy is growing; DJs increasingly want their own fan-facing tools and data.

### 2.3 Competitive landscape

| Competitor | What they do well | Gap we exploit |
| :---- | :---- | :---- |
| **Partiful** | Beautiful RSVP, social invites, free | No in-event interaction, no ticketing at scale, no DJ tools |
| **Eventbrite** | Paid ticketing, discovery, scale | Generic — nothing DJ/nightlife-specific; no in-event layer |
| **Posh / Dice** | Nightlife ticketing, curation | No audience-to-performer feedback loop |
| **RequestNow / DJ Monster** | Song request apps | Standalone — no event/ticketing context, weak UX, low DJ adoption |
| **Shoutout at the venue** | Free, instant | Unreliable, interruptive, no record |

**Our wedge:** We're the only product where the ticket/RSVP, the check-in, and the request all live in one attendee session. That's what lets us deliver both engagement data to organizers and qualified attention to DJs.

---

## 3. Target User Personas

### 3.1 The Attendee — "Maya, 26"
- **Context:** Goes out 2–4x/month, follows DJs on Instagram, uses Partiful and Dice.
- **Jobs to be done:** Discover what's happening tonight → commit to an event → arrive without friction → feel heard during the set → share the night after.
- **Pain points:** Long lines at the booth; feeling ignored; losing friends in a crowd; not knowing if a request will ever land.
- **Success looks like:** Opens app, finds the set, RSVPs in under 10 seconds, checks in by flashing a QR, submits a request, sees it get accepted and played.

### 3.2 The DJ — "Kalani, 31"
- **Context:** Residency DJ and occasional touring act. Uses Rekordbox. Has 15k IG followers. Runs a monthly party.
- **Jobs to be done:** Read the room → deliver a great set → build a fanbase → get rebooked.
- **Pain points:** Drunk guests interrupting; having no data to show a venue "look how engaged my crowd is"; wasting time on a personal mailing list.
- **Success looks like:** Opens dashboard on a tablet in the booth, glances every 5–10 min, accepts 2–3 good requests, ignores noise, leaves with a post-event report they can screenshot for a pitch.

### 3.3 The Organizer — "Jordan, 34"
- **Context:** Runs a small event series (200–600 people). Currently juggles Eventbrite + a Google Sheet + Venmo.
- **Jobs to be done:** Sell tickets → get people in the door fast → prove ROI to venue/sponsor → do the next one.
- **Pain points:** Fees eat margins; door line gets ugly; no data to share with sponsors; DJ coordination is all text messages.
- **Success looks like:** Lists an event in under 3 minutes, runs door from one phone, pulls a one-page attendance + engagement report the next morning.

---

## 4. Goals, Non-Goals, and Success Metrics

### 4.1 Goals (what this product MUST do well)

1. Make listing and RSVPing to an event feel as easy as Partiful.
2. Make in-event song requests feel instant and trustworthy (submit → visible feedback in <2 seconds).
3. Give DJs total creative control with zero cognitive overhead.
4. Get organizers door-ready with a check-in flow that works under bad WiFi.
5. Produce a post-event artifact (analytics) worth opening.

### 4.2 Non-goals (explicitly out of scope for MVP)

- Controlling DJ software (Rekordbox/Serato) — we surface requests; DJs play them manually.
- Full-scale ticketing competitor to Eventbrite (no secondary market, no complex allocations in v1).
- Social feed / follow graph / DMs — Spongy is transactional, not a social network.
- Streaming audio or video.
- Native iOS/Android apps at MVP — web-based PWA only.

### 4.3 Success metrics (North Star + supporting)

**North Star:** *Approved requests per event* — captures attendee engagement, DJ satisfaction, and event liveliness in one number.

| Layer | Metric | MVP target |
| :---- | :---- | :---- |
| Acquisition | Organizer signups / week | 10 |
| Activation | % of listed events that receive ≥1 RSVP | 80% |
| Engagement | % of checked-in attendees who submit ≥1 request | 40% |
| DJ satisfaction | Requests accepted / total requests | ≥25% (sanity check that DJs actually use the dashboard) |
| Retention | Organizer 30-day repeat event rate | 30% |
| Revenue (Phase 3+) | Take rate on paid events | 3–5% + $0.99 |
| Reliability | Request submit-to-dashboard latency p95 | <2s |
| Reliability | Check-in success rate offline | ≥99% |

---

## 5. User Stories (by surface)

Written as `As a [persona], I want to [action] so that [outcome]` with acceptance criteria. These are the stories that MUST pass for MVP.

### 5.1 Organizer

- **O-1.** As an organizer, I want to create an event with title, date, venue, description, cover image, and ticket type (Free RSVP / Paid) in under 3 minutes.
  - AC: Form is a single scrollable page; image upload is optional; saves as draft if I close the tab.
- **O-2.** As an organizer, I want a shareable event URL and auto-generated Instagram-story-ready graphic.
  - AC: URL is short, URL previews with OG tags, downloadable 1080×1920 image.
- **O-3.** As an organizer, I want to run the door from my phone: scan QR codes, see live attendance, manually check in a guest whose phone is dead.
  - AC: Scanner works in <0.5s per scan; supports manual name lookup; flags duplicate check-ins.
- **O-4.** As an organizer, I want a post-event report the next morning.
  - AC: Email + in-app; includes attendance vs RSVP, top requests, peak engagement time, check-in curve.

### 5.2 Attendee

- **A-1.** As an attendee, I want to RSVP with just my name + phone, no account required.
  - AC: Phone OTP verification; guest-mode session persists for 30 days on that device.
- **A-2.** As an attendee, I want to join the request queue by scanning a QR at the venue OR entering a 4–6 digit event code.
  - AC: Code is visible on DJ booth display; scanning the QR deep-links directly to the request screen.
- **A-3.** As an attendee, I want to search Spotify for a song and submit it with an optional shoutout.
  - AC: Autocomplete within 300ms; shows title, artist, album art; 140-char shoutout limit.
- **A-4.** As an attendee, I want to see the status of my request update live: Pending → Accepted → Played (or Rejected).
  - AC: State changes push within 2s; a played request triggers a celebratory animation.
- **A-5.** As an attendee, I want to upvote other people's requests.
  - AC: One vote per request per user; votes sort the DJ's queue.

### 5.3 DJ

- **D-1.** As a DJ, I want a tablet-optimized dashboard with a glanceable feed of incoming requests.
  - AC: High-contrast dark mode; minimum 18px font; one tap = one decision.
- **D-2.** As a DJ, I want to accept, reject, or mark-as-played with a single tap each, including a swipe shortcut.
  - AC: Undo available for 5s after each action.
- **D-3.** As a DJ, I want to pause incoming requests when I'm mixing a tricky transition or ending the set.
  - AC: Pause shows attendees an "on cooldown" state with an ETA.
- **D-4.** As a DJ, I want spam controls: rate limits per user, duplicate song suppression, profanity filter on shoutouts.
  - AC: Defaults sensible, all toggleable per event.
- **D-5.** As a DJ, I want to see which requests are most upvoted at a glance.
  - AC: Feed sort toggle: Newest / Most upvoted / Tips first.

---

## 6. Functional Requirements — Detailed

### 6.1 Event Discovery & Management (Organizer Portal)

- **Event creation.** Title, description, date/time (with timezone), venue (with map pin), cover image, host profile, RSVP type (Free / Paid), capacity, privacy (public / link-only), ticket tiers (for paid).
- **Invite & share.** Short URL; OG image auto-generated; one-tap share to iMessage/WhatsApp/IG Story.
- **Guest list.** Searchable, filter by status (RSVP'd / Checked-in / Paid), CSV export.
- **Co-host/DJ assignment.** Invite a DJ by email or username; they get dashboard access at event time.
- **Event states.** Draft → Published → Live (door open) → Ended → Archived.

### 6.2 Ticketing & Payments (Deep dive)

This is the monetization + growth flywheel, so it's worth building right.

- **Ticket types per event.**
  - Free RSVP (no payment; optional phone OTP).
  - Paid single tier (one price, one inventory count).
  - Paid multi-tier (e.g., Early Bird / GA / VIP — post-MVP).
  - Pay-what-you-want (post-MVP; useful for tip-jar-style community events).
- **Payments processor.** Stripe Connect (Express accounts) — organizers onboard Stripe, Spongy takes platform fee, payouts go to organizer.
- **Fee structure.**
  - Platform fee: 3% + $0.99 per paid ticket (competitive with Dice, below Eventbrite).
  - Pass-through: Stripe's 2.9% + $0.30.
  - Option at checkout to pass fees to buyer (default) or absorb.
- **Refunds.** Organizer-initiated; full or partial; up to 24h before event start by default (configurable). Automatic refunds if event is cancelled.
- **Tax & receipts.** Stripe generates receipts; tax collection is organizer's responsibility at MVP (flag this in ToS).
- **Payout timing.** T+3 days after event end, held against chargebacks (standard Stripe Connect).
- **Edge cases to spec.**
  - Waitlist when sold out (post-MVP but design the data model for it now).
  - Transferable tickets (send-to-a-friend) via a one-time link.
  - Duplicate payment / retry on flaky mobile network.
  - Chargeback policy: organizer absorbs; Spongy recoups fee.

### 6.3 Check-in Module (Deep dive)

The door is where organizers judge us. This has to be rock solid.

- **Attendee QR.** Generated on RSVP confirmation; shown in app + emailed/texted as a link. Rotating QR (signed JWT, 24-hour expiry) to prevent screenshot sharing at paid events.
- **Organizer scanner.** Web-based, opens device camera; continuous scan mode; audible + haptic confirmation.
- **Offline mode.** Critical for basement clubs. On event start, the organizer's device downloads the full guest list (encrypted). Scans validate locally against the cached list. Check-in events queue and sync when online.
- **Manual check-in.** Search by name/phone last-4 for the guest who forgot their ticket or has a dead phone.
- **Duplicate detection.** Flag if the same QR is scanned twice; allow override with a "same person, new wristband" confirmation.
- **Multi-scanner coordination.** Multiple door staff can scan simultaneously; conflicts resolved last-write-wins with a visible warning.
- **Attendance dashboard.** Real-time: RSVPs / Checked-in / % capacity / check-in rate per minute.
- **Edge cases.**
  - Transferred ticket: original QR invalidated on transfer, new one issued.
  - Re-entry: configurable per event (allow / disallow / staff-override).
  - Group RSVP: one QR per attendee, even within a group.

### 6.4 Song Request & DJ Moderation Flow (Deep dive)

The differentiator. Spec this precisely — this is what makes the product.

#### 6.4.1 Attendee submission flow

1. Attendee lands on request screen (via QR, event code, or direct from checked-in event).
2. Search box with Spotify autocomplete (title, artist, album art).
3. Tap to select → optional shoutout (max 140 chars, profanity filtered).
4. Submit → request enters queue in **Pending** state.
5. Attendee sees their request pinned at the top of their own view with live status.
6. Subsequent requests are rate-limited (default: 1 per 10 min per user; configurable per event).
7. If DJ has paused requests, submit button is disabled with a "DJ is focused — back in a few" message.

#### 6.4.2 Request states

`Pending → Accepted → Played` (happy path)
`Pending → Rejected` (DJ declines)
`Pending → Expired` (auto-expire 60 min after submission if still pending, to keep the queue clean)
`Any → Withdrawn` (attendee cancels their own request)

#### 6.4.3 DJ dashboard

- **Feed view.** Incoming requests stream in. Each card shows: album art, title, artist, shoutout, requester first name, upvote count, time submitted.
- **Actions.** Accept / Reject / Mark Played — big buttons, swipe gestures, keyboard shortcuts for keyboard-connected tablets.
- **Sort toggle.** Newest / Most upvoted / Priority tips first.
- **Filters.** Hide already-played artists (avoid repetition); hide rejected; show only tipped.
- **Moderation controls.**
  - Rate limit (requests per user per interval).
  - Duplicate suppression (if a track is already in queue, don't show it again — just upvote the existing one).
  - Profanity filter on shoutouts (configurable strictness).
  - Block user (removes their requests, blocks re-submit from that session).
  - Pause requests globally.
- **Queue capacity.** Configurable cap (e.g., max 20 pending); oldest pending auto-expires when full.

#### 6.4.4 Upvoting

- Any checked-in attendee can upvote any pending request (one vote per user per request).
- Upvotes are signal to DJ, not binding — DJ can still reject a highly-upvoted request.
- Upvoting is off by default for intimate events (<50 people) to avoid social pressure; on by default for 100+.

#### 6.4.5 Anti-abuse

- Phone OTP on RSVP prevents trivial sockpuppets.
- Rate limits per user AND per IP.
- Server-side profanity + slur filter on shoutouts (allow DJ to override for their own event).
- Report button on any shoutout; 2+ reports auto-hide pending DJ review.
- Shadow-ban option for persistent spammers (they see their requests submit, DJ doesn't).

### 6.5 Post-Event Analytics

Sent via email + in-app within 1 hour of event end.

- **Attendance funnel.** Page views → RSVPs → Checked-in → % conversion at each step.
- **Check-in timeline.** Graph of check-ins per 5-min bucket — useful to spot door bottlenecks.
- **Request stats.** Total submitted, accepted, rejected, played. Top 10 most-requested tracks. Most-upvoted tracks.
- **Engagement curve.** Requests per minute over the event — identifies peak energy moments.
- **Shareable recap.** One-page image export, DJ-brandable, Instagram-story-ready.
- **CSV export.** For organizers who want raw data.

---

## 7. Data Model (core entities)

Not exhaustive, but enough to anchor engineering decisions.

```
User
  id, phone, name, email?, role_flags {attendee, dj, organizer}, created_at

Organizer (profile)
  user_id, display_name, bio, stripe_connect_account_id, payout_status

DJ (profile)
  user_id, stage_name, bio, instagram_handle, default_moderation_settings

Event
  id, organizer_id, dj_id?, title, description, cover_image_url,
  start_at, end_at, timezone, venue_name, venue_lat, venue_lng,
  privacy {public, unlisted, private}, state {draft, published, live, ended, archived},
  rsvp_type {free, paid}, capacity, event_code_6digit, qr_secret

TicketTier
  id, event_id, name, price_cents, inventory, sold_count, active

RSVP / Ticket
  id, event_id, user_id, tier_id?, status {rsvpd, paid, checked_in, refunded, cancelled},
  qr_jwt, price_paid_cents, stripe_payment_intent_id, rsvpd_at, checked_in_at

SongRequest
  id, event_id, user_id, spotify_track_id, track_title, track_artist, album_art_url,
  shoutout_text?, state {pending, accepted, rejected, played, expired, withdrawn},
  upvote_count, tip_cents, created_at, state_changed_at

Upvote
  id, request_id, user_id, created_at   -- UNIQUE(request_id, user_id)

ModerationAction
  id, event_id, actor_user_id, target {user|request}, action, reason, at

EventAnalyticsSnapshot
  event_id, generated_at, payload_json
```

Key indexes: `SongRequest(event_id, state, created_at)` for the live feed; `RSVP(event_id, status)` for door scanner; `Upvote(request_id)` for counts.

---

## 8. Technical Architecture

- **Frontend.** Next.js (React) as a PWA. Mobile-first for attendees, tablet-optimized layout for DJ dashboard, responsive for organizer.
- **Backend.** Node.js (TypeScript) on a serverless runtime (Vercel or Fly) for API routes; a persistent service (Fly machines or Railway) for WebSocket connections if Supabase Realtime falls short.
- **Database.** Postgres (Supabase) — gets us auth, Postgres, realtime channels, storage in one.
- **Realtime.** Supabase Realtime for MVP (publish on `song_requests` table changes). Fallback plan: swap to Ably or Pusher if latency/scale becomes an issue.
- **Auth.** Phone OTP via Supabase Auth / Twilio Verify. Magic link fallback for desktop (organizer portal).
- **Payments.** Stripe Connect (Express accounts).
- **Music metadata.** Spotify Web API (client credentials flow — no user Spotify login needed).
- **Storage.** Supabase Storage for event cover images & generated recap graphics.
- **Jobs.** Inngest or a simple cron on serverless for post-event analytics generation, expired-request sweep, payout reconciliation.
- **Observability.** Sentry for errors; PostHog for product analytics; a custom latency metric for submit→dashboard end-to-end.

### 8.1 Key constraint

Spotify's API does **not** allow us to control the DJ's performance software (Serato, Rekordbox, Traktor). DJs see accepted requests and pull them up manually. This is a feature, not a bug — it preserves the DJ's workflow. But we should:
- Offer a one-tap "copy to clipboard" of `artist — title` from the dashboard.
- (Post-MVP) Offer CSV/M3U export for DJs who want a consolidated pull-list.

### 8.2 Scale assumptions (MVP)

- 100 concurrent events, 500 attendees each → 50k concurrent users peak.
- ~5 requests/attendee/event → ~250k requests per peak night.
- Realtime: ~50k concurrent WebSocket subscribers.

These are upper bounds; plan for 10% of that in year 1.

---

## 9. Non-Functional Requirements

- **Performance.** Attendee page load <2s on 4G; request submit p95 <500ms; submit-to-DJ-dashboard p95 <2s.
- **Reliability.** 99.5% uptime target for MVP; request submit must degrade gracefully (queue locally, sync on reconnect).
- **Accessibility.** WCAG 2.1 AA; 18px minimum on DJ dashboard; screen reader support on the attendee RSVP flow.
- **Internationalization.** English-only at MVP; structure copy for i18n from day 1.
- **Security.** HTTPS everywhere; signed, expiring QR JWTs; rate limits at API + edge; PII minimization (we don't need more than phone + first name for attendees).
- **Privacy.** Attendee phone numbers visible only to the organizer/DJ of their RSVP'd events; purge guest-mode sessions after 30 days of inactivity.
- **Compliance.** GDPR-ready data export & deletion endpoints from day 1; CCPA compliance for California.

---

## 10. Monetization Strategy

Three revenue streams, staged across phases.

### 10.1 Platform fee on paid tickets (Phase 1)
- 3% + $0.99 per paid ticket, passed to buyer by default.
- Competitive: below Eventbrite (3.7% + $1.79), on par with Dice.
- Free events = free to host (loss leader for distribution).

### 10.2 Priority requests / tipping (Phase 3)
- Attendees can pay $1–$5 to "tip the DJ" and boost their request.
- Spongy takes 20% + Stripe fees; DJ gets the rest at event end.
- Ethical guardrail: tipping boosts position in the feed, but DJ still must accept it — tips are not a buy-to-play guarantee. Messaging on this is critical or we erode DJ trust.

### 10.3 DJ / Organizer pro tier (Phase 4)
- $15–$25/mo per DJ or organizer.
- Unlocks: advanced analytics, multi-event dashboards, custom branding on event pages, no Spongy watermark on recap graphics, API access, team seats.
- Targets: working DJs with residencies; recurring event series operators.

### 10.4 What we're explicitly NOT doing
- No ads on attendee or DJ surfaces — would erode trust and cognitive load.
- No data resale.
- No subscription for attendees (kills viral loop).

---

## 11. Security, Privacy & Trust

- **Attendee PII.** Phone, first name, optional email. No last name required, no DOB, no address.
- **QR security.** Signed JWT with event ID, RSVP ID, expiry; rotating signature per event; server-side revocation on transfer/refund.
- **Stripe.** We never see card data; PCI scope limited to SAQ-A.
- **DJ data.** DJs own their event's request data; can export and delete.
- **Attendee consent.** Clear disclosure at RSVP that the organizer sees their phone/name; separate consent for SMS marketing (off by default).
- **Content moderation.** Profanity filter is server-side, not client-side (client filters are trivially bypassed). DJs can override.
- **Incident response.** Documented runbook for: data breach, Stripe fraud, event cancellation at scale.

---

## 12. Roadmap & Phasing

Estimates are for a small team (1–2 engineers + part-time designer) and assume no major pivots.

### Phase 0 — Foundations (1–2 weeks)
Infra setup: Supabase project, Stripe Connect sandbox, Next.js scaffold, CI/CD, Sentry, PostHog.

### Phase 1 — The Core Event Layer (3–4 weeks)
- Organizer account + event creation + publish.
- Attendee RSVP (free events only) with phone OTP.
- Event page (public) with share URL + OG image.
- Simple organizer check-in (search-by-name, no QR yet).

**Milestone:** Run one friends-and-family free event end-to-end.

### Phase 2 — Realtime Request Loop (3–4 weeks)
- Spotify search + request submission.
- DJ dashboard with realtime feed.
- Accept / Reject / Mark Played with live status sync.
- Rate limits, duplicate suppression, profanity filter.
- QR-based check-in with offline mode.

**Milestone:** Private beta at 3–5 partner DJ events.

### Phase 3 — Paid Events & Engagement (3–4 weeks)
- Stripe Connect onboarding for organizers.
- Paid ticket creation, checkout, refunds.
- Upvoting on requests.
- Post-event analytics email + shareable recap graphic.
- Priority request / tip feature.

**Milestone:** First paid event processed; organizer retention loop measurable.

### Phase 4 — Polish & Pro Tier (ongoing)
- Multi-tier tickets, waitlists, ticket transfer.
- Organizer/DJ pro subscriptions.
- Multi-event dashboards, team seats, custom branding.
- Native app wrapper (Expo) if PWA adoption stalls.

---

## 13. Risks & Mitigations

| Risk | Severity | Mitigation |
| :---- | :---- | :---- |
| Venue WiFi is unreliable | High | Offline queue for requests + check-ins; graceful resync; local caching of guest list. |
| DJs don't adopt — see it as a distraction | High | Design for glanceability; partner with 5–10 DJs as design partners; prove the analytics value so they can charge venues more. |
| Chicken-and-egg: no DJs = no attendee value; no attendees = no DJ value | High | Seed each launch market with 3–5 DJ "champions" pre-launch; start with free events where DJ is also the organizer. |
| Spotify API rate limits or policy changes | Medium | Cache track metadata aggressively; design the search layer to be provider-agnostic (could swap to Apple Music / MusicKit). |
| Payment disputes and chargebacks | Medium | Stripe Radar; clear refund policy surfaced at checkout; T+3 day payout hold. |
| Scaling realtime at festival-size events | Medium | Start with Supabase Realtime; pre-engineer an abstraction so we can swap to Ably/Pusher without rewriting. |
| Abusive attendees (racist shoutouts, spam) | High (brand risk) | Server-side filters; DJ override; report + shadow-ban; phone OTP gating; blocklist per DJ. |
| Legal/licensing (public performance) | Low/Medium | Not our liability in MVP — the venue has the PRO license. Flag clearly in ToS. |
| Organizer fraud (list fake event, take payments, disappear) | High | Stripe Connect KYC; payout hold until T+3 post-event; fraud signal monitoring; manual review for first event by any organizer. |

---

## 14. Open Questions

These need answers before or during the relevant phase.

1. **Identity.** Phone OTP or email magic link as primary? (Current bet: phone, because it's the medium people actually check at a club.)
2. **DJ-led vs Organizer-led events.** Is the DJ or the organizer the "owner" of the request feed? Current bet: organizer owns the event, DJ owns the request settings for their slot. Needs UX validation.
3. **Multiple DJs per event.** How do we hand off the request feed between back-to-back sets? (Defer to Phase 4?)
4. **Tipping ethics.** Do we let DJs turn tipping off entirely? (Lean yes — their event, their call.)
5. **International payments.** USD only at MVP or support multi-currency? (Lean USD only until we have paying demand outside US.)
6. **Data retention.** How long do we keep request data post-event? Default 90 days with organizer export; indefinite if on pro tier? Needs legal review.
7. **Genre/context awareness.** Should we warn attendees "this DJ plays house — maybe don't request Taylor Swift"? (Fun, but probably Phase 4.)

---

## 15. Appendix

### 15.1 Glossary
- **RSVP:** A commitment to attend — may or may not involve payment.
- **Check-in:** Physical arrival validated at the door.
- **Request:** An attendee-submitted song suggestion to the DJ.
- **Shoutout:** A short optional message attached to a request.
- **Priority request:** A tipped request that appears higher in the DJ's feed.
- **Event code:** A 4–6 digit numeric code that lets attendees join the request feed without scanning a QR.

### 15.2 References & inspirations
- Partiful (RSVP UX)
- Dice (nightlife ticketing, fair fee structure)
- Shazam (search UX for music)
- Uber Eats (live status updates on a request/order)
- Twitch (moderation patterns for realtime audience feeds)

---

*End of v2. This document should be treated as a living spec — update it, don't let it calcify.*
