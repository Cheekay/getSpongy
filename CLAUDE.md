# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spongy is a mobile-first event platform combining Partiful-style event discovery/RSVP with a real-time, DJ-moderated song request system. The wedge is the **song request + moderation loop** — no competitor does ticketing and DJ tools in one session.

Three personas: **Organizer** (lists events, runs the door), **Attendee** (RSVPs, checks in via QR, submits requests), **DJ** (tablet dashboard to accept/reject/play requests).

Full spec is in `Spongy PRD v2.md`.

## Planned Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (React) PWA | Mobile-first attendee UI, tablet-optimized DJ dashboard |
| Backend | Node.js/TypeScript | Serverless (Vercel/Fly) for API; persistent service for WebSockets if needed |
| Database | Postgres via Supabase | Also provides Auth, Realtime channels, and Storage |
| Realtime | Supabase Realtime | Abstract behind a layer so Ably/Pusher can be swapped without rewrite |
| Auth | Supabase Auth + Twilio Verify | Phone OTP primary; magic link fallback for organizer portal on desktop |
| Payments | Stripe Connect (Express) | Organizers onboard Stripe; platform takes 3% + $0.99 per paid ticket |
| Music search | Spotify Web API | Client credentials flow — no user Spotify login required |
| Storage | Supabase Storage | Event cover images + generated recap graphics |
| Background jobs | Inngest or serverless cron | Post-event analytics, expired-request sweep, payout reconciliation |
| Observability | Sentry (errors) + PostHog (product analytics) | Also track custom submit→dashboard latency metric |

## Core Data Model

Key entities and their relationships (see PRD §7 for full field list):

- `User` — phone, name, role_flags (attendee/dj/organizer)
- `Event` — organizer_id, dj_id, state (draft→published→live→ended→archived), rsvp_type (free/paid), event_code_6digit, qr_secret
- `RSVP / Ticket` — status (rsvpd/paid/checked_in/refunded/cancelled), qr_jwt, stripe_payment_intent_id
- `SongRequest` — state (pending→accepted→played, or rejected/expired/withdrawn), upvote_count, tip_cents
- `Upvote` — UNIQUE(request_id, user_id)

Critical indexes: `SongRequest(event_id, state, created_at)` for the live feed; `RSVP(event_id, status)` for door scanner.

## Architecture Decisions to Respect

**QR security:** Rotating JWTs (signed, 24h expiry, server-side revocation on transfer/refund). Never static QR codes for paid events.

**Offline check-in:** On event start, organizer's device downloads the full encrypted guest list. Scans validate locally; sync on reconnect. This is non-negotiable — venues have bad WiFi.

**Spotify integration:** We only search metadata (title, artist, album art). We cannot and must not attempt to control Rekordbox/Serato/Traktor. DJs play accepted requests manually.

**Realtime abstraction:** Wrap Supabase Realtime behind an interface from the start so it can be swapped for Ably/Pusher without rewriting consumers.

**Profanity filtering:** Server-side only — client-side filters are trivially bypassed.

**Rate limits:** Per user AND per IP on request submission.

## Build Phases

- **Phase 0:** Infra scaffold (Supabase, Stripe sandbox, Next.js, CI/CD, Sentry, PostHog)
- **Phase 1:** Organizer event creation + free RSVP + event page
- **Phase 2:** Spotify search + DJ dashboard + realtime request loop + QR check-in with offline mode
- **Phase 3:** Paid tickets (Stripe Connect) + upvoting + post-event analytics + tipping
- **Phase 4:** Multi-tier tickets, pro subscriptions, native app wrapper (Expo)

## Key Performance Targets

- Attendee page load: <2s on 4G
- Request submit p95: <500ms
- Submit-to-DJ-dashboard p95: <2s
- QR scan per door: <0.5s
- Check-in success rate offline: ≥99%
