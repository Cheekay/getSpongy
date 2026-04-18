# Spongy — Phase 1: Core Event Layer Design Spec

**Date:** 2026-04-18
**Status:** Approved
**Scope:** Organizer event creation, attendee free RSVP with phone OTP, public event page with OG/story image, simple organizer door check-in (name search)
**Milestone:** Run one friends-and-family free event end-to-end

---

## Decisions Made

| Topic | Decision |
|---|---|
| Auth provider | Supabase-managed phone OTP; Twilio Verify wired in later for production |
| Dev/test OTP | `[auth.sms.test_otp]` in `supabase/config.toml` — no real SMS in development |
| Name capture | Immediately after first OTP verify, `/setup` screen, stored on user profile once |
| Event state transitions | Hybrid: auto-flip to `live` at `start_at`; organizer can go live early or hold |
| Cover image | Required before an event can be published |
| Share output | OG meta tags (1200×630) + downloadable Instagram story (1080×1920), both via `@vercel/og` |
| Mutation strategy | Hybrid C: Server Actions for simple forms; API Routes for event creation (file upload) and image generation |

---

## 1. Auth & Profile Setup

### Flow

```
/login → /verify → [new user?] → /setup → destination
                 → [returning]  → destination
```

1. **`/login`** — Phone number entry. Server Action calls `supabase.auth.signInWithOtp({ phone })`. In dev, test OTPs resolve from `supabase/config.toml` with no real SMS.
2. **`/verify`** — 6-digit code entry. Server Action calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. Session written to cookie via `@supabase/ssr`.
3. **`/setup`** — Single "What's your name?" screen for first-time users only. Server Action writes `name` to `users` table. Guard: if `users.name IS NOT NULL`, redirect immediately to destination.
4. **Redirect preservation** — middleware stores `?redirect=<original_path>` through the full auth flow so deep links (e.g. `/e/ABC123`) survive login.

### New vs returning user detection

After `verifyOtp` succeeds, the server action reads `users.name` via the service role client. `NULL` → `/setup`. Non-null → destination.

### `supabase/config.toml` addition (dev only)

```toml
[auth.sms.test_otp]
14155550000 = "123456"
```

---

## 2. Organizer: Event Creation & Management

### `/events` — My Events list

- **RSC** — fetches all events for `organizer_id = auth.uid()` ordered by `start_at DESC`.
- Filter chips (All / Upcoming / Live / Past) are **client-side state** — all events loaded on mount, filtered in memory. No re-fetch per chip tap.
- **"Go Live" button** on Published events → Server Action sets `state = 'live'`, records `live_at = now()`.
- **Auto-flip** — handled via a middleware check: on any authenticated page load, a lightweight server-side check transitions `state = 'live'` for events where `state = 'published' AND start_at <= now()`. This avoids a pg_cron dependency (not available on Supabase free tier). The check runs at most once per page load and is idempotent (uses an upsert with a `WHERE state = 'published'` guard).
- **"End Event" button** on Live events → Server Action sets `state = 'ended'`.

### `/events/new` — Create Event

**Client component** — the cover image upload requires interactive preview before submit.

**Fields:**
- `title` (required)
- `start_at` / `end_at` with timezone (required)
- `venue_name` (required)
- `description` (optional)
- `cover_image` file input (required to publish, optional to save draft)
- `rsvp_type`: "Free RSVP" only in Phase 1 (Paid deferred to Phase 3)
- `capacity` numeric (optional; `NULL` = unlimited)
- `privacy`: Public / Link-only

**Submit flow:**
1. Client POSTs `multipart/form-data` to `POST /api/events`
2. API route uploads cover to Supabase Storage `event-covers` bucket → gets public URL
3. Inserts event row; generates `event_code_6digit` (random 6-digit string, unique-checked against DB)
4. Returns `{ id, event_code_6digit }`
5. Client redirects to `/events/[id]`

**Draft saving:** "Save Draft" submits with `publish: false`. "Publish" submits with `publish: true`. Cover image required for publish, enforced server-side (returns 422 if missing).

**Validation:** Server-side only. Client shows field errors returned from the API route.

### `/events/[id]` — Event Detail (organizer view)

- Shows event status chip, share URL, "Download Story" button, and link to door check-in.
- "Download Story" → `GET /api/story?eventId=[id]` (triggers browser download).
- Edit flow: deferred to Phase 2.

---

## 3. Attendee: Public Event Page & RSVP

### `/e/[code]` — Public Event Page

**RSC** — fetches event by `event_code_6digit`. No auth required (middleware already allows this route unauthenticated).

**Render branches:**

| State | What the user sees |
|---|---|
| Unauthenticated | "RSVP Free" button → `/login?redirect=/e/[code]` |
| Authenticated, no name | Redirect to `/setup?redirect=/e/[code]` |
| Authenticated, already RSVPd | RSVP confirmation view (QR card + actions) |
| At capacity | Button disabled, "This event is full" |
| Default | "RSVP Free" button, triggers RSVP Server Action |

**Event page content:**
- Hero cover image (full-bleed, xl rounded bottom corners)
- "FREE ENTRY" chip in tertiary lime
- Info card: date/time (formatted with `date-fns-tz` respecting event timezone), venue, host name, DJ name (if assigned)
- Description paragraph
- Attendee count ("42 people going") derived from `COUNT(rsvps WHERE status != 'cancelled')` — cached, refreshed on page load
- Sticky bottom bar with RSVP CTA

**OG metadata** via `generateMetadata()`:
```ts
openGraph: {
  title: event.title,
  description: `${formattedDate} · ${event.venue_name}`,
  images: [{ url: `${process.env.NEXT_PUBLIC_APP_URL}/api/og?eventId=${event.id}`, width: 1200, height: 630 }],
}
```
OG image URLs must be absolute — social crawlers do not resolve relative paths.

### RSVP Server Action

`rsvpToEvent(eventId: string)`

1. Checks capacity: if `capacity IS NOT NULL` and `checked_count >= capacity`, returns error.
2. Checks duplicate: if RSVP already exists for this `(user_id, event_id)`, returns the existing row (idempotent).
3. Inserts RSVP row: `status = 'rsvpd'`, `rsvpd_at = now()`.
4. Generates `qr_jwt`: signed with `QR_JWT_SECRET` (a dedicated env var, not the service role key) as HMAC-SHA256 secret via `jose`:
   ```json
   { "rsvpId": "...", "eventId": "...", "userId": "...", "exp": "+24h" }
   ```
5. Writes `qr_jwt` to the RSVP row.
6. Returns `{ rsvp, qr_jwt }`.

**QR expiry refresh:** if an attendee opens `/e/[code]` and their stored `qr_jwt` is within 1 hour of expiry (or already expired), the server action `refreshQrJwt(rsvpId)` re-signs and updates the row. The page detects this server-side and always returns a fresh token in the confirmation view.

### RSVP Confirmation view

Rendered within the same `/e/[code]` page when user has an RSVP:

- **QR code** — rendered client-side from `qr_jwt` using `qrcode.react`
- **"Add to Calendar"** — generates `.ics` blob client-side using `ical-generator`, triggers download
- **"Share Event"** — calls `navigator.share({ url: eventUrl, title: event.title })` with fallback copy-to-clipboard
- **"Submit a Song Request"** — links to `/live/[eventId]` with a Phase 2 placeholder

---

## 4. Organizer: Door Check-in

### `/events/[id]/door`

**Client component** — needs instant tap feedback and client-side search.

**Access guard:** server-side check that `auth.uid() === event.organizer_id`. Returns 403 if not.

**Data loading:** on mount, fetches full guest list: `name`, `phone` (last 4 digits only, never full number), `status`, `checked_in_at`. At Phase 1 scale (< 500 guests), entire list loads into client state.

**Search:** filters `name` and `phone_last4` client-side — no round-trip per keystroke.

**Check-in Server Action:** `checkInGuest(rsvpId: string)`
1. Reads current RSVP row.
2. If `status = 'checked_in'`, returns `{ duplicate: true }` — UI shows a warning toast ("Already checked in at [time]").
3. Sets `status = 'checked_in'`, `checked_in_at = now()`.
4. Returns updated row.

**Optimistic UI:** row flips to "✓ checked in" immediately on tap, before server confirmation. On error, reverts with a toast.

**Stats bar** (bottom of screen): `checkedIn / total / % capacity` derived from local state — updates instantly with each check-in, no re-fetch.

**Multi-device note:** Phase 1 uses last-write-wins with a duplicate warning. Full multi-scanner coordination deferred to Phase 2 (offline mode).

---

## 5. OG Image & Instagram Story Generation

### `GET /api/og?eventId=[id]`

Returns a 1200×630 `image/png` via `ImageResponse` (`@vercel/og`):

**Layout:**
- Background: `#0e0e13`
- Right 55%: event cover image, `object-cover`, slight right-edge bleed
- Left 45%: stacked vertically — "Spongy" wordmark (small, primary purple), event title (Space Grotesk bold, large, white), date + venue (muted), Free/price chip (lime)
- Subtle purple ambient glow behind the title

**Caching:** `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`

### `GET /api/story?eventId=[id]`

Returns a 1080×1920 `image/png` via `ImageResponse`:

**Layout:**
- Full-bleed cover image background
- Dark gradient overlay (bottom 60%)
- Top-left: "Spongy" wordmark
- Center: event title large, date + venue below
- Bottom third: "RSVP free at spongy.app/e/[code]" in lime
- `Content-Disposition: attachment; filename="[event-slug]-story.png"` — triggers download

Both routes fetch event data using the Supabase **server client** (no auth needed — published events are public). No user session required.

---

## 6. New Routes & Files

```
app/
  (auth)/
    login/page.tsx          ← implement phone input + Server Action
    verify/page.tsx         ← implement OTP input + Server Action
    setup/page.tsx          ← NEW: name capture, Server Action
  (attendee)/
    e/[code]/page.tsx       ← implement full event page + RSVP
  (manage)/
    events/page.tsx         ← implement My Events list
    events/new/page.tsx     ← implement Create Event form (client)
    events/[id]/page.tsx    ← NEW: event detail + download story
    events/[id]/door/       ← NEW: check-in screen (client)
      page.tsx
app/api/
  events/route.ts           ← NEW: POST (create event + image upload)
  og/route.ts               ← NEW: GET (OG image)
  story/route.ts            ← NEW: GET (Instagram story image)
lib/
  actions/
    auth.ts                 ← NEW: sendOtp, verifyOtp, saveName Server Actions
    events.ts               ← NEW: goLive, endEvent Server Actions
    rsvp.ts                 ← NEW: rsvpToEvent Server Action
    checkin.ts              ← NEW: checkInGuest Server Action
  jwt.ts                    ← NEW: sign/verify qr_jwt using jose
```

---

## 7. Key Dependencies to Add

New env var to add to `.env.local.example`:
```bash
QR_JWT_SECRET=your_random_secret_min_32_chars
```

```
jose                  — JWT signing/verification for QR codes
qrcode.react          — QR code rendering (client-side)
@vercel/og            — ImageResponse for OG + story images
date-fns-tz           — Timezone-aware date formatting
ical-generator        — .ics calendar file generation (client-side)
```

---

## 8. Out of Scope for Phase 1

- QR code scanning at the door (Phase 2)
- Offline check-in mode (Phase 2)
- Paid tickets / Stripe Connect (Phase 3)
- Twilio Verify direct integration (post-Phase 1 production wiring)
- Edit event after publish (Phase 2)
- DJ assignment from organizer portal (Phase 2)
- Post-event analytics email (Phase 3)
- Upvoting (Phase 3)
