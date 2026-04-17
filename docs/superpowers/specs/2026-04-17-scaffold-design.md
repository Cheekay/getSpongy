# Spongy — Phase 0 Scaffold Design Spec

**Date:** 2026-04-17
**Status:** Approved
**Scope:** Project foundation — Next.js app scaffold, design system, Supabase integration, environment config

---

## 1. Project Structure & Routing

Single Next.js 14+ App Router application. Three role-based route groups share one codebase, one Tailwind config, and one Supabase project. Middleware enforces access by role.

```
spongy/
├── app/
│   ├── (auth)/
│   │   ├── login/          ← phone number entry (OTP)
│   │   └── verify/         ← 6-digit OTP confirmation
│   ├── (attendee)/
│   │   ├── layout.tsx      ← attendee bottom nav: Explore / Live / Requests / My Pulse
│   │   ├── explore/        ← event discovery
│   │   ├── e/[code]/       ← QR / 6-digit code deep-link entry point
│   │   ├── live/[eventId]/ ← live event view + crowd request feed
│   │   ├── requests/       ← search & submit a song
│   │   ├── profile/        ← user profile + gamification stats
│   │   └── alerts/         ← notification center
│   ├── (studio)/
│   │   ├── layout.tsx      ← DJ bottom nav: Explore / Live / Studio / Stats
│   │   ├── queue/          ← request moderation dashboard (tablet-optimized)
│   │   └── stats/          ← DJ event analytics
│   ├── (manage)/
│   │   ├── layout.tsx      ← organizer nav
│   │   ├── events/         ← event list + creation form
│   │   └── analytics/      ← live stats + post-event report
│   ├── layout.tsx          ← root layout: fonts, providers, PWA meta
│   └── page.tsx            ← redirect based on auth state + role flags
├── components/
│   ├── ui/                 ← primitive components (see Section 2)
│   └── shared/             ← cross-surface composites (TrackCard, RequestItem, etc.)
├── lib/
│   ├── supabase/
│   │   ├── client.ts       ← browser Supabase client
│   │   ├── server.ts       ← server Supabase client (RSC + API routes, uses cookies)
│   │   └── realtime.ts     ← realtime abstraction layer (swappable to Ably/Pusher)
│   ├── spotify.ts          ← Spotify search via client credentials flow
│   └── auth.ts             ← role helpers, session utils, redirect logic
├── middleware.ts            ← route protection by role
├── supabase/
│   └── migrations/         ← SQL migration files (see Section 3)
└── styles/
    └── globals.css         ← ambient glow utilities, parallax hook base styles
```

**Middleware logic:**
- Unauthenticated user → `/login?redirect=<original_path>` (redirect preserved for post-auth)
- Exception: `/e/[code]` is publicly accessible unauthenticated — QR scans arrive cold; the page itself handles the auth prompt after rendering
- Authenticated attendee accessing `(studio)` or `(manage)` routes → redirect to `/explore`
- Authenticated DJ with no active event accessing `/queue` → redirect to `/explore`
- Role flags are read from the Supabase user profile and cached in the session cookie

---

## 2. Design System

All tokens lifted directly from Stitch-generated HTML files. Authoritative reference: `DESIGN.md` and `stitch_spongyApp/neon_pulse/DESIGN.md`.

### Tailwind Config (`tailwind.config.ts`)

**Colors — full token set:**
```ts
colors: {
  background:                    "#0e0e13",
  surface:                       "#0e0e13",
  "surface-dim":                 "#0e0e13",
  "surface-container-lowest":    "#000000",
  "surface-container-low":       "#131318",
  "surface-container":           "#19191f",
  "surface-container-high":      "#1f1f26",
  "surface-container-highest":   "#25252c",
  "surface-bright":              "#2c2b33",
  "surface-variant":             "#25252c",
  "surface-tint":                "#de8eff",
  "inverse-surface":             "#fbf8ff",
  "on-surface":                  "#f8f5fd",
  "on-surface-variant":          "#acaab1",
  "inverse-on-surface":          "#55545a",
  primary:                       "#de8eff",
  "primary-container":           "#d779ff",
  "primary-fixed":               "#d779ff",
  "primary-fixed-dim":           "#cf62ff",
  "primary-dim":                 "#b90afc",
  "on-primary":                  "#4f006e",
  "on-primary-container":        "#3d0056",
  "on-primary-fixed":            "#000000",
  "on-primary-fixed-variant":    "#4b0069",
  "inverse-primary":             "#9900d1",
  secondary:                     "#00f4fe",
  "secondary-container":         "#00696e",
  "secondary-fixed":             "#00f4fe",
  "secondary-fixed-dim":         "#00e5ee",
  "secondary-dim":               "#00e5ee",
  "on-secondary":                "#00575b",
  "on-secondary-container":      "#dffdff",
  "on-secondary-fixed":          "#004346",
  "on-secondary-fixed-variant":  "#006266",
  tertiary:                      "#bcff5f",
  "tertiary-container":          "#a2f31f",
  "tertiary-fixed":              "#a2f31f",
  "tertiary-fixed-dim":          "#95e400",
  "tertiary-dim":                "#95e400",
  "on-tertiary":                 "#3d6100",
  "on-tertiary-container":       "#365700",
  "on-tertiary-fixed":           "#294300",
  "on-tertiary-fixed-variant":   "#3d6200",
  error:                         "#ff6e84",
  "error-container":             "#a70138",
  "error-dim":                   "#d73357",
  "on-error":                    "#490013",
  "on-error-container":          "#ffb2b9",
  outline:                       "#76747b",
  "outline-variant":             "#48474d",
}
```

**Border radius:**
```ts
borderRadius: {
  DEFAULT: "1rem",
  sm:      "0.5rem",   // inputs — "technical" feel
  lg:      "2rem",
  xl:      "3rem",     // large image containers
  full:    "9999px",   // buttons, chips
}
```

**Fonts:**
```ts
fontFamily: {
  headline: ["Space Grotesk", "sans-serif"],
  body:     ["Be Vietnam Pro", "sans-serif"],
  label:    ["Be Vietnam Pro", "sans-serif"],
}
```
Loaded via `next/font/google` in root layout — not a CDN `<link>` tag.

### `globals.css` Custom Utilities

```css
/* Ambient glows — cannot be expressed in Tailwind utilities */
.ambient-glow-primary   { box-shadow: 0 0 40px rgba(222, 142, 255, 0.08); }
.ambient-glow-secondary { box-shadow: 0 0 40px rgba(0, 244, 254, 0.08); }
.text-glow-tertiary     { text-shadow: 0 0 20px rgba(188, 255, 95, 0.4); }

/* Pulse CTA hover — heartbeat gradient shift */
.btn-pulse:hover {
  background-position: right center;
  box-shadow: 0 0 20px rgba(222, 142, 255, 0.4);
}

/* Parallax image wrapper — images scroll at 0.9x speed */
.parallax-image {
  will-change: transform;
  transition: transform 0.1s linear;
}
```

### UI Primitives (`components/ui/`)

| Component | Variants | Notes |
|---|---|---|
| `Button` | `primary` (gradient + pulse hover), `secondary` (ghost border), `tertiary` (text + underline) | Full roundedness (`9999px`); black text on primary |
| `Card` | `default`, `glowing` | Glowing variant adds `ambient-glow-secondary` — used for top-voted requests |
| `Input` | `search` | `sm` radius; cyan focus glow; base `surface-container-highest` |
| `Chip` | `live`, `selling-fast`, `fire`, `played`, `pending`, `rejected` | Tertiary/lime for live states; high contrast |
| `BottomNav` | `attendee`, `studio`, `manage` | Each layout renders its own variant |

**Design rules enforced in components:**
- No `border` utilities for sectioning — tonal layering only
- No pure `#FFFFFF` text — `on-surface-variant` for secondary copy
- No standard drop shadows — ambient glows or tonal layering only
- Max three `surface-container` tiers nested at once

---

## 3. Supabase Integration

### Three Clients

```ts
// lib/supabase/client.ts  — browser (attendee/DJ realtime interactions)
// lib/supabase/server.ts  — server (RSC, API routes, middleware)
// lib/supabase/realtime.ts — abstraction layer
```

**Realtime abstraction** — all components subscribe through this interface, never directly to Supabase channels:

```ts
export function subscribeToRequests(
  eventId: string,
  onUpdate: (payload: RequestPayload) => void
): () => void   // returns unsubscribe fn

export function subscribeToCheckIns(
  eventId: string,
  onUpdate: (payload: CheckInPayload) => void
): () => void
```

Today's implementation uses Supabase Realtime. Swapping to Ably/Pusher means changing only this file.

### Database Migrations

```
supabase/migrations/
  001_users.sql           ← users table + organizer_profiles + dj_profiles
  002_events.sql          ← events + ticket_tiers
  003_rsvp.sql            ← rsvps / tickets (qr_jwt, stripe fields, check-in fields)
  004_requests.sql        ← song_requests + upvotes + moderation_actions
  005_analytics.sql       ← event_analytics_snapshots
  006_indexes.sql         ← performance-critical indexes:
                              SongRequest(event_id, state, created_at)
                              RSVP(event_id, status)
                              UNIQUE(upvote.request_id, upvote.user_id)
```

### Row Level Security (enabled from day one)

- Attendees: read/write own RSVPs and requests only
- DJs: read + moderate requests for events they are assigned to
- Organizers: full CRUD on their own events; read RSVPs for their events
- Service role key (server-side only): unrestricted — used for check-in validation and analytics jobs

### Storage Buckets

| Bucket | Access |
|---|---|
| `event-covers` | Public read; organizer write (own events only) |
| `recap-graphics` | Public read; service role write (generated by Inngest job) |

---

## 4. Environment Config

### `.env.local.example`

```bash
# ─── Supabase ───────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# ─── Spotify ────────────────────────────────────────────
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# ─── Stripe ─────────────────────────────────────────────
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# ─── Twilio (Phone OTP) ─────────────────────────────────
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=your_twilio_verify_service_sid

# ─── Inngest (Background jobs) ──────────────────────────
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key

# ─── Observability ──────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_api_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# ─── App ────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### `next.config.ts`

- PWA via `next-pwa` (service worker + manifest)
- Image domains: `i.scdn.co` (Spotify CDN), Supabase Storage hostname
- React strict mode enabled

### `public/manifest.json`

- `name`: "Spongy"
- `theme_color`: `#0e0e13`
- `background_color`: `#0e0e13`
- `display`: `standalone`
- `orientation`: `portrait`

### Key Dependencies

```
next@14+, react, react-dom
@supabase/supabase-js, @supabase/ssr
tailwindcss, @tailwindcss/forms
next-pwa
@sentry/nextjs
inngest
stripe
posthog-js
```

---

## 5. Out of Scope for Phase 0

The following are explicitly deferred to later phases:

- Any page content beyond routing skeletons and layout shells
- Spotify search implementation (Phase 2)
- Stripe Connect onboarding (Phase 3)
- Inngest job definitions (Phase 3)
- Sentry + PostHog instrumentation beyond initial setup (Phase 2+)
- Native app wrapper / Expo (Phase 4)
