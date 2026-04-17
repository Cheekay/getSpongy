# Phase 0 — Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the Spongy Next.js PWA with role-based routing, the Neon Nocturne design system, Supabase integration, and all environment scaffolding — ready for Phase 1 feature development.

**Architecture:** Single Next.js 14+ App Router app with three route groups `(attendee)`, `(studio)`, `(manage)` protected by middleware. Supabase provides auth, database, realtime, and storage. All credentials are placeholders in `.env.local.example`; no feature logic is implemented — only the foundation.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS, @supabase/ssr, Vitest, @testing-library/react

---

## File Map

```
Files created in this plan:
─── Bootstrap & Config ──────────────────────────────────────
app/layout.tsx                      Root layout: fonts, body classes
app/page.tsx                        Root redirect by role
next.config.ts                      PWA, image domains, strict mode
tailwind.config.ts                  Full Neon Nocturne token set
styles/globals.css                  Ambient glow utilities, parallax base
public/manifest.json                PWA manifest
.env.local.example                  All credential placeholders
.gitignore additions                .env.local

─── Test Infrastructure ─────────────────────────────────────
vitest.config.ts                    Vitest + jsdom + path alias
tests/setup.ts                      @testing-library/jest-dom import

─── Library ─────────────────────────────────────────────────
lib/utils.ts                        cn() helper (clsx + tailwind-merge)
lib/auth.ts                         Role helpers, getRouteAccess, getDefaultRoute
lib/supabase/client.ts              Browser Supabase client
lib/supabase/server.ts              Server Supabase client (cookies)
lib/supabase/realtime.ts            Realtime abstraction (swappable)
lib/spotify.ts                      Spotify scaffold (Phase 2 stub)

─── Middleware ───────────────────────────────────────────────
middleware.ts                       Route protection by role

─── UI Primitives ───────────────────────────────────────────
components/ui/Button.tsx            primary / secondary / tertiary variants
components/ui/Card.tsx              default / glowing variants
components/ui/Input.tsx             search input with icon support
components/ui/Chip.tsx              live / selling-fast / fire / played / pending / rejected
components/ui/BottomNav.tsx         attendee / studio / manage variants

─── Route Group Layouts ─────────────────────────────────────
app/(auth)/layout.tsx               Minimal dark wrapper
app/(attendee)/layout.tsx           BottomNav attendee variant + pb-20
app/(studio)/layout.tsx             BottomNav studio variant + pb-20
app/(manage)/layout.tsx             BottomNav manage variant + pb-20

─── Page Skeletons ──────────────────────────────────────────
app/(auth)/login/page.tsx
app/(auth)/verify/page.tsx
app/(attendee)/explore/page.tsx
app/(attendee)/e/[code]/page.tsx
app/(attendee)/live/[eventId]/page.tsx
app/(attendee)/requests/page.tsx
app/(attendee)/profile/page.tsx
app/(attendee)/alerts/page.tsx
app/(studio)/queue/page.tsx
app/(studio)/stats/page.tsx
app/(manage)/events/page.tsx
app/(manage)/analytics/page.tsx

─── Database Migrations ─────────────────────────────────────
supabase/migrations/001_users.sql
supabase/migrations/002_events.sql
supabase/migrations/003_rsvp.sql
supabase/migrations/004_requests.sql
supabase/migrations/005_analytics.sql
supabase/migrations/006_indexes.sql

─── Tests ───────────────────────────────────────────────────
tests/lib/auth.test.ts
tests/lib/supabase/realtime.test.ts
tests/components/ui/Button.test.tsx
tests/components/ui/Card.test.tsx
tests/components/ui/Input.test.tsx
tests/components/ui/Chip.test.tsx
tests/components/ui/BottomNav.test.tsx
```

---

## Task 1: Bootstrap Next.js in project root

**Files:**
- Create: `package.json`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx` (via create-next-app)
- Modify: `.gitignore`

- [ ] **Step 1: Scaffold the app**

Run this from `/Users/willimbo/projects/claudeProjects/spongyApp`:
```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --no-git
```
When prompted "The directory . contains files that could conflict" → choose to continue.
When prompted about the `app/` router → Yes.

Expected: `package.json`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css` created.

- [ ] **Step 2: Remove create-next-app boilerplate**

```bash
rm -f app/globals.css public/next.svg public/vercel.svg
```

Then open `app/page.tsx` and replace its content with a temporary placeholder:
```tsx
export default function RootPage() {
  return <div>Spongy</div>
}
```

And `app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Add `.env.local` to .gitignore**

Open `.gitignore` and confirm it contains (add if missing):
```
.env.local
.env*.local
```

- [ ] **Step 4: Verify the app starts**

```bash
npm run dev
```
Expected: Server starts on `http://localhost:3000`. Browser shows "Spongy". No errors in terminal. `Ctrl+C` to stop.

- [ ] **Step 5: Commit**

```bash
git init
git add .
git commit -m "chore: bootstrap Next.js app with TypeScript and Tailwind"
```

---

## Task 2: Install Additional Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
npm install \
  @supabase/supabase-js \
  @supabase/ssr \
  @ducanh2912/next-pwa \
  @sentry/nextjs \
  inngest \
  stripe \
  posthog-js \
  clsx \
  tailwind-merge \
  @tailwindcss/forms
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D \
  vitest \
  @vitejs/plugin-react \
  jsdom \
  @testing-library/react \
  @testing-library/user-event \
  @testing-library/jest-dom
```

- [ ] **Step 3: Add test script to package.json**

Open `package.json` and add to the `"scripts"` section:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 4: Verify install**

```bash
npm run build
```
Expected: Build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install project dependencies"
```

---

## Task 3: Tailwind Design System Tokens

**Files:**
- Create: `tailwind.config.ts` (replace generated one)
- Create: `styles/globals.css`

- [ ] **Step 1: Replace `tailwind.config.ts` with Neon Nocturne tokens**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background:                    '#0e0e13',
        surface:                       '#0e0e13',
        'surface-dim':                 '#0e0e13',
        'surface-container-lowest':    '#000000',
        'surface-container-low':       '#131318',
        'surface-container':           '#19191f',
        'surface-container-high':      '#1f1f26',
        'surface-container-highest':   '#25252c',
        'surface-bright':              '#2c2b33',
        'surface-variant':             '#25252c',
        'surface-tint':                '#de8eff',
        'inverse-surface':             '#fbf8ff',
        'on-surface':                  '#f8f5fd',
        'on-surface-variant':          '#acaab1',
        'inverse-on-surface':          '#55545a',
        primary:                       '#de8eff',
        'primary-container':           '#d779ff',
        'primary-fixed':               '#d779ff',
        'primary-fixed-dim':           '#cf62ff',
        'primary-dim':                 '#b90afc',
        'on-primary':                  '#4f006e',
        'on-primary-container':        '#3d0056',
        'on-primary-fixed':            '#000000',
        'on-primary-fixed-variant':    '#4b0069',
        'inverse-primary':             '#9900d1',
        secondary:                     '#00f4fe',
        'secondary-container':         '#00696e',
        'secondary-fixed':             '#00f4fe',
        'secondary-fixed-dim':         '#00e5ee',
        'secondary-dim':               '#00e5ee',
        'on-secondary':                '#00575b',
        'on-secondary-container':      '#dffdff',
        'on-secondary-fixed':          '#004346',
        'on-secondary-fixed-variant':  '#006266',
        tertiary:                      '#bcff5f',
        'tertiary-container':          '#a2f31f',
        'tertiary-fixed':              '#a2f31f',
        'tertiary-fixed-dim':          '#95e400',
        'tertiary-dim':                '#95e400',
        'on-tertiary':                 '#3d6100',
        'on-tertiary-container':       '#365700',
        'on-tertiary-fixed':           '#294300',
        'on-tertiary-fixed-variant':   '#3d6200',
        error:                         '#ff6e84',
        'error-container':             '#a70138',
        'error-dim':                   '#d73357',
        'on-error':                    '#490013',
        'on-error-container':          '#ffb2b9',
        outline:                       '#76747b',
        'outline-variant':             '#48474d',
      },
      borderRadius: {
        DEFAULT: '1rem',
        sm:      '0.5rem',
        lg:      '2rem',
        xl:      '3rem',
        full:    '9999px',
      },
      fontFamily: {
        headline: ['var(--font-headline)', 'sans-serif'],
        body:     ['var(--font-body)', 'sans-serif'],
        label:    ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}

export default config
```

- [ ] **Step 2: Create `styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  /* Ambient glows — not expressible as Tailwind utilities */
  .ambient-glow-primary {
    box-shadow: 0 0 40px rgba(222, 142, 255, 0.08);
  }
  .ambient-glow-secondary {
    box-shadow: 0 0 40px rgba(0, 244, 254, 0.08);
  }
  .text-glow-tertiary {
    text-shadow: 0 0 20px rgba(188, 255, 95, 0.4);
  }

  /* Pulse CTA: gradient shifts right on hover, mimicking a bass kick */
  .btn-pulse {
    background-size: 200% auto;
    transition: background-position 0.3s ease, box-shadow 0.3s ease;
  }
  .btn-pulse:hover {
    background-position: right center;
    box-shadow: 0 0 20px rgba(222, 142, 255, 0.4);
  }

  /* Parallax image: JS sets --scroll-y via useEffect; images move at 0.9x */
  .parallax-image {
    will-change: transform;
    transform: translateY(calc(var(--scroll-y, 0px) * 0.1));
    transition: transform 0.1s linear;
  }
}
```

- [ ] **Step 3: Verify Tailwind picks up the new config**

```bash
npm run dev
```
Expected: Server starts. No Tailwind config errors in terminal. `Ctrl+C`.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts styles/globals.css
git commit -m "feat: add Neon Nocturne design system tokens and global utilities"
```

---

## Task 4: Environment & PWA Configuration

**Files:**
- Create: `.env.local.example`
- Create: `public/manifest.json`
- Create: `public/icons/.gitkeep`
- Modify: `next.config.ts`

- [ ] **Step 1: Create `.env.local.example`**

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

Copy to `.env.local` for local development:
```bash
cp .env.local.example .env.local
```

- [ ] **Step 2: Create `public/manifest.json`**

```json
{
  "name": "Spongy",
  "short_name": "Spongy",
  "description": "The event platform where the crowd controls the vibe.",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0e0e13",
  "theme_color": "#0e0e13",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 3: Create icon placeholder**

```bash
mkdir -p public/icons
touch public/icons/.gitkeep
```

Note: actual icon PNG files (`icon-192.png`, `icon-512.png`) are added in Phase 1 with the brand assets.

- [ ] **Step 4: Replace `next.config.ts`**

```ts
import type { NextConfig } from 'next'
import withPWA from '@ducanh2912/next-pwa'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: 'i.scdn.co' },                    // Spotify album art CDN
      { hostname: '*.supabase.co' },                 // Supabase Storage
      { hostname: 'lh3.googleusercontent.com' },     // Stitch placeholder images
    ],
  },
}

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
})(nextConfig)
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```
Expected: Build completes. No errors about missing env vars (Next.js only warns on missing `NEXT_PUBLIC_` vars at runtime, not build time for placeholders).

- [ ] **Step 6: Commit**

```bash
git add .env.local.example public/manifest.json public/icons/.gitkeep next.config.ts
git commit -m "chore: add environment config, PWA manifest, and next.config"
```

---

## Task 5: Test Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Verify test runner works**

```bash
npm run test:run
```
Expected: Output shows "No test files found". Exit 0.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/setup.ts
git commit -m "chore: add Vitest test infrastructure"
```

---

## Task 6: Utility & Auth Helpers (TDD)

**Files:**
- Create: `lib/utils.ts`
- Create: `lib/auth.ts`
- Create: `tests/lib/auth.test.ts`

- [ ] **Step 1: Write the failing tests for auth helpers**

Create `tests/lib/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { hasRole, getPrimaryRole, getDefaultRoute, getRouteAccess } from '@/lib/auth'

describe('hasRole', () => {
  it('returns true when role flag is set', () => {
    expect(hasRole({ dj: true }, 'dj')).toBe(true)
  })
  it('returns false when role flag is not set', () => {
    expect(hasRole({ attendee: true }, 'dj')).toBe(false)
  })
  it('returns false for empty flags', () => {
    expect(hasRole({}, 'organizer')).toBe(false)
  })
})

describe('getPrimaryRole', () => {
  it('returns organizer when organizer flag is true (highest priority)', () => {
    expect(getPrimaryRole({ organizer: true, dj: true })).toBe('organizer')
  })
  it('returns dj when dj flag is true and organizer is false', () => {
    expect(getPrimaryRole({ dj: true, attendee: true })).toBe('dj')
  })
  it('defaults to attendee for empty flags', () => {
    expect(getPrimaryRole({})).toBe('attendee')
  })
})

describe('getDefaultRoute', () => {
  it('routes organizer to /events', () => {
    expect(getDefaultRoute({ organizer: true })).toBe('/events')
  })
  it('routes dj to /queue', () => {
    expect(getDefaultRoute({ dj: true })).toBe('/queue')
  })
  it('routes attendee to /explore', () => {
    expect(getDefaultRoute({})).toBe('/explore')
  })
})

describe('getRouteAccess', () => {
  it('allows deep link routes unauthenticated', () => {
    expect(getRouteAccess('/e/ABC123', {})).toBe('allow')
  })
  it('allows public auth routes', () => {
    expect(getRouteAccess('/login', {})).toBe('allow')
    expect(getRouteAccess('/verify', {})).toBe('allow')
  })
  it('allows studio routes for dj role', () => {
    expect(getRouteAccess('/queue', { dj: true })).toBe('allow')
    expect(getRouteAccess('/stats', { dj: true })).toBe('allow')
  })
  it('redirects non-dj from studio routes', () => {
    expect(getRouteAccess('/queue', {})).toBe('redirect-explore')
    expect(getRouteAccess('/queue', { attendee: true })).toBe('redirect-explore')
  })
  it('allows manage routes for organizer role', () => {
    expect(getRouteAccess('/events', { organizer: true })).toBe('allow')
    expect(getRouteAccess('/analytics', { organizer: true })).toBe('allow')
  })
  it('redirects non-organizer from manage routes', () => {
    expect(getRouteAccess('/events', {})).toBe('redirect-explore')
    expect(getRouteAccess('/analytics', { dj: true })).toBe('redirect-explore')
  })
  it('allows general attendee routes for any authenticated user', () => {
    expect(getRouteAccess('/explore', {})).toBe('allow')
    expect(getRouteAccess('/profile', { attendee: true })).toBe('allow')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/lib/auth.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/auth'"

- [ ] **Step 3: Create `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 4: Create `lib/auth.ts`**

```ts
export type UserRole = 'attendee' | 'dj' | 'organizer'

export type RoleFlags = {
  attendee: boolean
  dj: boolean
  organizer: boolean
}

const DEEP_LINK_PATTERN = /^\/e\//
const PUBLIC_ROUTES = ['/login', '/verify']
const STUDIO_ROUTES = ['/queue', '/stats']
const MANAGE_ROUTES = ['/events', '/analytics']

export function hasRole(roleFlags: Partial<RoleFlags>, role: UserRole): boolean {
  return roleFlags[role] === true
}

export function getPrimaryRole(roleFlags: Partial<RoleFlags>): UserRole {
  if (roleFlags.organizer) return 'organizer'
  if (roleFlags.dj) return 'dj'
  return 'attendee'
}

export function getDefaultRoute(roleFlags: Partial<RoleFlags>): string {
  const primary = getPrimaryRole(roleFlags)
  switch (primary) {
    case 'organizer': return '/events'
    case 'dj':        return '/queue'
    default:          return '/explore'
  }
}

export type RouteAccess = 'allow' | 'redirect-explore'

export function getRouteAccess(pathname: string, roleFlags: Partial<RoleFlags>): RouteAccess {
  if (DEEP_LINK_PATTERN.test(pathname)) return 'allow'
  if (PUBLIC_ROUTES.includes(pathname)) return 'allow'

  const isStudioRoute = STUDIO_ROUTES.some(r => pathname.startsWith(r))
  if (isStudioRoute) return roleFlags.dj ? 'allow' : 'redirect-explore'

  const isManageRoute = MANAGE_ROUTES.some(r => pathname.startsWith(r))
  if (isManageRoute) return roleFlags.organizer ? 'allow' : 'redirect-explore'

  return 'allow'
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/auth.test.ts
```
Expected: All 14 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/auth.ts tests/lib/auth.test.ts
git commit -m "feat: add auth role helpers and route access logic"
```

---

## Task 7: Supabase Clients

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

Note: these files wrap `@supabase/ssr` helpers and are not unit-tested directly (they require a live Supabase connection). Integration tests are Phase 2+.

- [ ] **Step 1: Create `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create `lib/supabase/server.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — cookies are read-only; safe to ignore
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/client.ts lib/supabase/server.ts
git commit -m "feat: add Supabase browser and server clients"
```

---

## Task 8: Realtime Abstraction (TDD)

**Files:**
- Create: `lib/supabase/realtime.ts`
- Create: `tests/lib/supabase/realtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/supabase/realtime.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRemoveChannel = vi.fn()
const mockSubscribe = vi.fn().mockReturnThis()
const mockOn = vi.fn().mockReturnThis()
const mockChannel = vi.fn().mockReturnValue({
  on: mockOn,
  subscribe: mockSubscribe,
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}))

import { subscribeToRequests, subscribeToCheckIns } from '@/lib/supabase/realtime'

describe('subscribeToRequests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('subscribes to the correct event-scoped channel', () => {
    subscribeToRequests('event-123', vi.fn())
    expect(mockChannel).toHaveBeenCalledWith('requests:event-123')
  })

  it('listens on the song_requests table', () => {
    subscribeToRequests('event-123', vi.fn())
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'song_requests', filter: 'event_id=eq.event-123' }),
      expect.any(Function)
    )
  })

  it('returns an unsubscribe function', () => {
    const unsubscribe = subscribeToRequests('event-123', vi.fn())
    expect(typeof unsubscribe).toBe('function')
  })

  it('calls removeChannel when unsubscribed', () => {
    const unsubscribe = subscribeToRequests('event-123', vi.fn())
    unsubscribe()
    expect(mockRemoveChannel).toHaveBeenCalledOnce()
  })
})

describe('subscribeToCheckIns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('subscribes to the correct event-scoped channel', () => {
    subscribeToCheckIns('event-456', vi.fn())
    expect(mockChannel).toHaveBeenCalledWith('checkins:event-456')
  })

  it('listens on the rsvps table', () => {
    subscribeToCheckIns('event-456', vi.fn())
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'rsvps', filter: 'event_id=eq.event-456' }),
      expect.any(Function)
    )
  })

  it('returns an unsubscribe function', () => {
    const unsubscribe = subscribeToCheckIns('event-456', vi.fn())
    expect(typeof unsubscribe).toBe('function')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/lib/supabase/realtime.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/supabase/realtime'"

- [ ] **Step 3: Create `lib/supabase/realtime.ts`**

```ts
import { createClient } from './client'

export type RequestState =
  | 'pending' | 'accepted' | 'rejected'
  | 'played'  | 'expired'  | 'withdrawn'

export type RequestPayload = {
  id: string
  event_id: string
  user_id: string
  spotify_track_id: string
  track_title: string
  track_artist: string
  album_art_url: string | null
  shoutout_text: string | null
  state: RequestState
  upvote_count: number
  tip_cents: number
  created_at: string
  state_changed_at: string
}

export type CheckInStatus = 'rsvpd' | 'paid' | 'checked_in' | 'refunded' | 'cancelled'

export type CheckInPayload = {
  id: string
  event_id: string
  user_id: string
  status: CheckInStatus
  checked_in_at: string | null
}

export function subscribeToRequests(
  eventId: string,
  onUpdate: (payload: RequestPayload) => void
): () => void {
  const supabase = createClient()
  const channel = supabase
    .channel(`requests:${eventId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'song_requests',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => onUpdate(payload.new as RequestPayload)
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

export function subscribeToCheckIns(
  eventId: string,
  onUpdate: (payload: CheckInPayload) => void
): () => void {
  const supabase = createClient()
  const channel = supabase
    .channel(`checkins:${eventId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rsvps',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => onUpdate(payload.new as CheckInPayload)
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/supabase/realtime.test.ts
```
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/realtime.ts tests/lib/supabase/realtime.test.ts
git commit -m "feat: add realtime abstraction layer for requests and check-ins"
```

---

## Task 9: Middleware

**Files:**
- Create: `middleware.ts`

The route access logic is already tested via `lib/auth.ts`. The middleware wires it to Next.js request/response — no additional unit tests needed here.

- [ ] **Step 1: Create `middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getRouteAccess, getDefaultRoute } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Deep links and auth routes are always public
  const isDeepLink = /^\/e\//.test(pathname)
  const isAuthRoute = ['/login', '/verify'].includes(pathname)

  if (!user && !isDeepLink && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role_flags')
      .eq('id', user.id)
      .single()

    const roleFlags = profile?.role_flags ?? {}
    const access = getRouteAccess(pathname, roleFlags)

    if (access === 'redirect-explore') {
      return NextResponse.redirect(new URL('/explore', request.url))
    }

    // Redirect authenticated users away from auth pages to their default route
    if (isAuthRoute) {
      return NextResponse.redirect(new URL(getDefaultRoute(roleFlags), request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add role-based route protection middleware"
```

---

## Task 10: Spotify Scaffold

**Files:**
- Create: `lib/spotify.ts`

- [ ] **Step 1: Create `lib/spotify.ts`**

```ts
// Spotify track search via Client Credentials flow (no user login required).
// Full implementation in Phase 2.

export type SpotifyTrack = {
  id: string
  title: string
  artist: string
  albumArtUrl: string
  durationMs: number
}

let cachedToken: string | null = null
let tokenExpiry = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials',
    next: { revalidate: 0 },
  })

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

// Implemented in Phase 2
export async function searchTracks(_query: string): Promise<SpotifyTrack[]> {
  await getAccessToken() // validates credentials are set
  throw new Error('searchTracks: not yet implemented (Phase 2)')
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/spotify.ts
git commit -m "feat: add Spotify client scaffold (Phase 2 stub)"
```

---

## Task 11: UI Primitives — Button & Card (TDD)

**Files:**
- Create: `components/ui/Button.tsx`
- Create: `components/ui/Card.tsx`
- Create: `tests/components/ui/Button.test.tsx`
- Create: `tests/components/ui/Card.test.tsx`

- [ ] **Step 1: Write failing Button tests**

Create `tests/components/ui/Button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const handler = vi.fn()
    render(<Button onClick={handler}>Click</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('applies primary gradient classes by default', () => {
    render(<Button>Primary</Button>)
    expect(screen.getByRole('button').className).toContain('from-primary')
  })

  it('applies ghost border for secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button').className).toContain('ring-outline-variant')
  })

  it('applies text-secondary for tertiary variant', () => {
    render(<Button variant="tertiary">Tertiary</Button>)
    expect(screen.getByRole('button').className).toContain('text-secondary')
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Write failing Card tests**

Create `tests/components/ui/Card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Card } from '@/components/ui/Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies surface-container background by default', () => {
    const { container } = render(<Card>Content</Card>)
    expect((container.firstChild as HTMLElement).className).toContain('bg-surface-container')
  })

  it('applies ambient-glow-secondary for glowing variant', () => {
    const { container } = render(<Card variant="glowing">Content</Card>)
    expect((container.firstChild as HTMLElement).className).toContain('ambient-glow-secondary')
  })

  it('passes through additional className', () => {
    const { container } = render(<Card className="extra-class">Content</Card>)
    expect((container.firstChild as HTMLElement).className).toContain('extra-class')
  })
})
```

- [ ] **Step 3: Run failing tests**

```bash
npm run test:run -- tests/components/ui/Button.test.tsx tests/components/ui/Card.test.tsx
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 4: Create `components/ui/Button.tsx`**

```tsx
import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-label font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
          variant === 'primary' && [
            'rounded-full px-8 py-3',
            'bg-gradient-to-r from-primary to-primary-container',
            'text-on-primary-fixed',
            'btn-pulse',
          ],
          variant === 'secondary' && [
            'rounded-full px-8 py-3',
            'bg-transparent ring-1 ring-outline-variant/20',
            'text-on-surface-variant',
            'hover:bg-surface-bright',
          ],
          variant === 'tertiary' && [
            'px-4 py-2',
            'text-secondary',
            'underline-offset-2 hover:underline',
          ],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
```

- [ ] **Step 5: Create `components/ui/Card.tsx`**

```tsx
import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

type CardVariant = 'default' | 'glowing'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
}

export function Card({ variant = 'default', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface-container rounded-xl p-4 ring-1 ring-outline-variant/15',
        variant === 'default' && 'hover:bg-surface-container-high transition-colors',
        variant === 'glowing' && 'ambient-glow-secondary hover:ring-outline-variant/30 transition-all',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test:run -- tests/components/ui/Button.test.tsx tests/components/ui/Card.test.tsx
```
Expected: All 10 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add components/ui/Button.tsx components/ui/Card.tsx \
  tests/components/ui/Button.test.tsx tests/components/ui/Card.test.tsx
git commit -m "feat: add Button and Card UI primitives"
```

---

## Task 12: UI Primitives — Input, Chip & BottomNav (TDD)

**Files:**
- Create: `components/ui/Input.tsx`
- Create: `components/ui/Chip.tsx`
- Create: `components/ui/BottomNav.tsx`
- Create: `tests/components/ui/Input.test.tsx`
- Create: `tests/components/ui/Chip.test.tsx`
- Create: `tests/components/ui/BottomNav.test.tsx`

- [ ] **Step 1: Write failing Input tests**

Create `tests/components/ui/Input.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Input } from '@/components/ui/Input'

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Search tracks..." />)
    expect(screen.getByPlaceholderText('Search tracks...')).toBeInTheDocument()
  })

  it('calls onChange when value changes', () => {
    const handler = vi.fn()
    render(<Input onChange={handler} placeholder="Search" />)
    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'midnight' },
    })
    expect(handler).toHaveBeenCalled()
  })

  it('adds left padding when icon is provided', () => {
    render(<Input icon={<span data-testid="icon" />} placeholder="With icon" />)
    expect(screen.getByPlaceholderText('With icon').className).toContain('pl-12')
  })

  it('does not add left padding without icon', () => {
    render(<Input placeholder="No icon" />)
    expect(screen.getByPlaceholderText('No icon').className).not.toContain('pl-12')
  })
})
```

- [ ] **Step 2: Write failing Chip tests**

Create `tests/components/ui/Chip.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Chip } from '@/components/ui/Chip'

describe('Chip', () => {
  it('renders children', () => {
    render(<Chip variant="live">LIVE</Chip>)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('applies tertiary color for live variant', () => {
    render(<Chip variant="live">LIVE</Chip>)
    expect(screen.getByText('LIVE').className).toContain('text-tertiary')
  })

  it('applies tertiary color for fire variant', () => {
    render(<Chip variant="fire">FIRE</Chip>)
    expect(screen.getByText('FIRE').className).toContain('text-tertiary')
  })

  it('applies secondary color for played variant', () => {
    render(<Chip variant="played">PLAYED</Chip>)
    expect(screen.getByText('PLAYED').className).toContain('text-secondary')
  })

  it('applies error color for rejected variant', () => {
    render(<Chip variant="rejected">REJECTED</Chip>)
    expect(screen.getByText('REJECTED').className).toContain('text-error')
  })
})
```

- [ ] **Step 3: Write failing BottomNav tests**

Create `tests/components/ui/BottomNav.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BottomNav } from '@/components/ui/BottomNav'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
}))

describe('BottomNav — attendee variant', () => {
  it('renders all four attendee nav items', () => {
    render(<BottomNav variant="attendee" />)
    expect(screen.getByText('Explore')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Requests')).toBeInTheDocument()
    expect(screen.getByText('My Pulse')).toBeInTheDocument()
  })
})

describe('BottomNav — studio variant', () => {
  it('renders studio-specific items', () => {
    render(<BottomNav variant="studio" />)
    expect(screen.getByText('Studio')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()
  })
  it('does not render attendee-only items', () => {
    render(<BottomNav variant="studio" />)
    expect(screen.queryByText('My Pulse')).not.toBeInTheDocument()
    expect(screen.queryByText('Requests')).not.toBeInTheDocument()
  })
})

describe('BottomNav — manage variant', () => {
  it('renders organizer-specific items', () => {
    render(<BottomNav variant="manage" />)
    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run failing tests**

```bash
npm run test:run -- tests/components/ui/Input.test.tsx tests/components/ui/Chip.test.tsx tests/components/ui/BottomNav.test.tsx
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 5: Create `components/ui/Input.tsx`**

```tsx
import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full rounded-sm bg-surface-container-highest px-4 py-3',
            'font-body text-on-surface placeholder:text-on-surface-variant',
            'border border-outline-variant/10',
            'focus:outline-none focus:border-secondary',
            'focus:shadow-[0_0_0_4px_rgba(0,244,254,0.1)]',
            'transition-all duration-200',
            icon && 'pl-12',
            className
          )}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = 'Input'
```

- [ ] **Step 6: Create `components/ui/Chip.tsx`**

```tsx
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

type ChipVariant = 'live' | 'selling-fast' | 'fire' | 'played' | 'pending' | 'rejected'

interface ChipProps {
  variant: ChipVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<ChipVariant, string> = {
  'live':         'bg-tertiary/10 text-tertiary border border-tertiary/20',
  'selling-fast': 'bg-tertiary/10 text-tertiary border border-tertiary/20',
  'fire':         'bg-tertiary/10 text-tertiary border border-tertiary/20',
  'played':       'bg-secondary/10 text-secondary border border-secondary/20',
  'pending':      'bg-surface-container-high text-on-surface-variant',
  'rejected':     'bg-error/10 text-error border border-error/20',
}

export function Chip({ variant, children, className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1',
        'font-label text-xs font-semibold uppercase tracking-wider',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
```

- [ ] **Step 7: Create `components/ui/BottomNav.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type BottomNavVariant = 'attendee' | 'studio' | 'manage'

type NavItem = { href: string; icon: string; label: string }

const navItems: Record<BottomNavVariant, NavItem[]> = {
  attendee: [
    { href: '/explore',  icon: 'explore',      label: 'Explore'   },
    { href: '/live',     icon: 'equalizer',    label: 'Live'      },
    { href: '/requests', icon: 'queue_music',  label: 'Requests'  },
    { href: '/profile',  icon: 'person',       label: 'My Pulse'  },
  ],
  studio: [
    { href: '/explore',  icon: 'explore',      label: 'Explore'   },
    { href: '/live',     icon: 'equalizer',    label: 'Live'      },
    { href: '/queue',    icon: 'queue_music',  label: 'Studio'    },
    { href: '/stats',    icon: 'bar_chart',    label: 'Stats'     },
  ],
  manage: [
    { href: '/events',    icon: 'event',       label: 'Events'    },
    { href: '/analytics', icon: 'analytics',   label: 'Analytics' },
  ],
}

interface BottomNavProps {
  variant: BottomNavVariant
}

export function BottomNav({ variant }: BottomNavProps) {
  const pathname = usePathname()
  const items = navItems[variant]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container-low/80 backdrop-blur-xl border-t border-outline-variant/10">
      <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors',
                isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
              <span className="font-label text-[10px] font-semibold uppercase tracking-wider">
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npm run test:run -- tests/components/ui/Input.test.tsx tests/components/ui/Chip.test.tsx tests/components/ui/BottomNav.test.tsx
```
Expected: All 12 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add components/ui/Input.tsx components/ui/Chip.tsx components/ui/BottomNav.tsx \
  tests/components/ui/Input.test.tsx tests/components/ui/Chip.test.tsx tests/components/ui/BottomNav.test.tsx
git commit -m "feat: add Input, Chip, and BottomNav UI primitives"
```

---

## Task 13: Root Layout & Fonts

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/layout.tsx` with font-loaded root layout**

```tsx
import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Be_Vietnam_Pro } from 'next/font/google'
import '../styles/globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-headline',
  display: 'swap',
})

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Spongy',
  description: 'The event platform where the crowd controls the vibe.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0e0e13',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Material Symbols for icons used in BottomNav and UI components */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${beVietnamPro.variable} bg-background text-on-background font-body antialiased overflow-x-hidden selection:bg-primary selection:text-on-primary-fixed`}
      >
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Replace `app/page.tsx` with role-based redirect**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDefaultRoute } from '@/lib/auth'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role_flags')
    .eq('id', user.id)
    .single()

  redirect(getDefaultRoute(profile?.role_flags ?? {}))
}
```

- [ ] **Step 3: Verify app builds**

```bash
npm run build
```
Expected: Build completes. No font loading errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "feat: add root layout with Space Grotesk and Be Vietnam Pro fonts"
```

---

## Task 14: Route Group Layouts & Page Skeletons

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(attendee)/layout.tsx`
- Create: `app/(studio)/layout.tsx`
- Create: `app/(manage)/layout.tsx`
- Create: all `page.tsx` skeletons (12 files)

- [ ] **Step 1: Create `app/(auth)/layout.tsx`**

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(attendee)/layout.tsx`**

```tsx
import { BottomNav } from '@/components/ui/BottomNav'

export default function AttendeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-20">
        {children}
      </div>
      <BottomNav variant="attendee" />
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(studio)/layout.tsx`**

```tsx
import { BottomNav } from '@/components/ui/BottomNav'

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-20">
        {children}
      </div>
      <BottomNav variant="studio" />
    </div>
  )
}
```

- [ ] **Step 4: Create `app/(manage)/layout.tsx`**

```tsx
import { BottomNav } from '@/components/ui/BottomNav'

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-20">
        {children}
      </div>
      <BottomNav variant="manage" />
    </div>
  )
}
```

- [ ] **Step 5: Create all auth page skeletons**

`app/(auth)/login/page.tsx`:
```tsx
export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-headline text-4xl font-bold mb-2">
          Welcome to <span className="text-primary">Spongy</span>
        </h1>
        <p className="text-on-surface-variant">Phone OTP login — Phase 1</p>
      </div>
    </main>
  )
}
```

`app/(auth)/verify/page.tsx`:
```tsx
export default function VerifyPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-headline text-4xl font-bold mb-2 text-primary">Verify</h1>
        <p className="text-on-surface-variant">OTP verification — Phase 1</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Create all attendee page skeletons**

`app/(attendee)/explore/page.tsx`:
```tsx
export default function ExplorePage() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold">
        Find the <span className="text-primary">Pulse.</span>
      </h1>
      <p className="text-on-surface-variant mt-2">Event discovery — Phase 1</p>
    </main>
  )
}
```

`app/(attendee)/e/[code]/page.tsx`:
```tsx
export default async function EventCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold text-primary">{code}</h1>
      <p className="text-on-surface-variant mt-2">Event entry — Phase 2</p>
    </main>
  )
}
```

`app/(attendee)/live/[eventId]/page.tsx`:
```tsx
export default async function LiveEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    <main className="px-4 py-6">
      <span className="font-label text-xs text-tertiary uppercase tracking-wider flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse inline-block" />
        Live Now
      </span>
      <h1 className="font-headline text-4xl font-bold mt-2">{eventId}</h1>
      <p className="text-on-surface-variant mt-2">Live event view — Phase 2</p>
    </main>
  )
}
```

`app/(attendee)/requests/page.tsx`:
```tsx
export default function RequestsPage() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold text-primary uppercase">Requests</h1>
      <p className="text-on-surface-variant mt-2">Song request — Phase 2</p>
    </main>
  )
}
```

`app/(attendee)/profile/page.tsx`:
```tsx
export default function ProfilePage() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold">Pulse Profile</h1>
      <p className="text-on-surface-variant mt-2">User profile & stats — Phase 2</p>
    </main>
  )
}
```

`app/(attendee)/alerts/page.tsx`:
```tsx
export default function AlertsPage() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold">Alerts</h1>
      <p className="text-on-surface-variant mt-2">Notification centre — Phase 2</p>
    </main>
  )
}
```

- [ ] **Step 7: Create studio and manage page skeletons**

`app/(studio)/queue/page.tsx`:
```tsx
export default function QueuePage() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold">
        Request Queue
        <span className="ml-3 font-label text-xs text-tertiary uppercase tracking-wider align-middle">
          Live
        </span>
      </h1>
      <p className="text-on-surface-variant mt-2">DJ moderation dashboard — Phase 2</p>
    </main>
  )
}
```

`app/(studio)/stats/page.tsx`:
```tsx
export default function StatsPage() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold">Stats</h1>
      <p className="text-on-surface-variant mt-2">DJ event analytics — Phase 3</p>
    </main>
  )
}
```

`app/(manage)/events/page.tsx`:
```tsx
export default function EventsPage() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold">Your Events</h1>
      <p className="text-on-surface-variant mt-2">Organiser event list — Phase 1</p>
    </main>
  )
}
```

`app/(manage)/analytics/page.tsx`:
```tsx
export default function AnalyticsPage() {
  return (
    <main className="px-4 py-6">
      <h1 className="font-headline text-4xl font-bold">Live Stats</h1>
      <p className="text-on-surface-variant mt-2">Organiser analytics — Phase 3</p>
    </main>
  )
}
```

- [ ] **Step 8: Verify all routes build**

```bash
npm run build
```
Expected: Build completes. All routes listed in the output. No errors.

- [ ] **Step 9: Commit**

```bash
git add app/
git commit -m "feat: add route group layouts and page skeletons for all surfaces"
```

---

## Task 15: Database Migrations

**Files:**
- Create: `supabase/migrations/001_users.sql`
- Create: `supabase/migrations/002_events.sql`
- Create: `supabase/migrations/003_rsvp.sql`
- Create: `supabase/migrations/004_requests.sql`
- Create: `supabase/migrations/005_analytics.sql`
- Create: `supabase/migrations/006_indexes.sql`

- [ ] **Step 1: Create `supabase/migrations/001_users.sql`**

```sql
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  role_flags JSONB NOT NULL DEFAULT '{"attendee": true, "dj": false, "organizer": false}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizer_profiles (
  user_id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name             TEXT NOT NULL,
  bio                      TEXT,
  stripe_connect_account_id TEXT,
  payout_status            TEXT DEFAULT 'pending',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dj_profiles (
  user_id                      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stage_name                   TEXT NOT NULL,
  bio                          TEXT,
  instagram_handle             TEXT,
  default_moderation_settings  JSONB NOT NULL DEFAULT '{
    "rate_limit_minutes": 10,
    "duplicate_suppression": true,
    "profanity_filter": true,
    "upvoting_enabled": true,
    "queue_capacity": 20
  }',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dj_profiles        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own"    ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own"  ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "organizer_profiles_own" ON organizer_profiles FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "dj_profiles_own"         ON dj_profiles FOR ALL    USING (auth.uid() = user_id);
CREATE POLICY "dj_profiles_public_read" ON dj_profiles FOR SELECT USING (true);
```

- [ ] **Step 2: Create `supabase/migrations/002_events.sql`**

```sql
CREATE TYPE event_state  AS ENUM ('draft', 'published', 'live', 'ended', 'archived');
CREATE TYPE rsvp_type    AS ENUM ('free', 'paid');
CREATE TYPE privacy_type AS ENUM ('public', 'unlisted', 'private');

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dj_id           UUID REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  venue_name      TEXT,
  venue_lat       DECIMAL(10, 8),
  venue_lng       DECIMAL(11, 8),
  privacy         privacy_type NOT NULL DEFAULT 'public',
  state           event_state  NOT NULL DEFAULT 'draft',
  rsvp_type       rsvp_type    NOT NULL DEFAULT 'free',
  capacity        INTEGER,
  event_code      TEXT UNIQUE NOT NULL,
  qr_secret       TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_tiers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  inventory  INTEGER,
  sold_count INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_public_read"   ON events FOR SELECT USING (privacy = 'public' AND state != 'draft');
CREATE POLICY "events_organizer_all" ON events FOR ALL    USING (auth.uid() = organizer_id);
CREATE POLICY "events_dj_read"       ON events FOR SELECT USING (auth.uid() = dj_id);

CREATE POLICY "ticket_tiers_public_read" ON ticket_tiers FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = ticket_tiers.event_id AND events.privacy = 'public')
);
CREATE POLICY "ticket_tiers_organizer_all" ON ticket_tiers FOR ALL USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = ticket_tiers.event_id AND events.organizer_id = auth.uid())
);
```

- [ ] **Step 3: Create `supabase/migrations/003_rsvp.sql`**

```sql
CREATE TYPE rsvp_status AS ENUM ('rsvpd', 'paid', 'checked_in', 'refunded', 'cancelled');

CREATE TABLE rsvps (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id                  UUID REFERENCES ticket_tiers(id),
  status                   rsvp_status NOT NULL DEFAULT 'rsvpd',
  qr_jwt                   TEXT,
  price_paid_cents         INTEGER NOT NULL DEFAULT 0,
  stripe_payment_intent_id TEXT,
  rsvpd_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_at            TIMESTAMPTZ,
  UNIQUE(event_id, user_id)
);

ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsvps_own_read"       ON rsvps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "rsvps_own_insert"     ON rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rsvps_organizer_read" ON rsvps FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = rsvps.event_id AND events.organizer_id = auth.uid())
);
CREATE POLICY "rsvps_organizer_checkin" ON rsvps FOR UPDATE USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = rsvps.event_id AND events.organizer_id = auth.uid())
);
```

- [ ] **Step 4: Create `supabase/migrations/004_requests.sql`**

```sql
CREATE TYPE request_state AS ENUM ('pending', 'accepted', 'rejected', 'played', 'expired', 'withdrawn');

CREATE TABLE song_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spotify_track_id TEXT NOT NULL,
  track_title      TEXT NOT NULL,
  track_artist     TEXT NOT NULL,
  album_art_url    TEXT,
  shoutout_text    TEXT CHECK (char_length(shoutout_text) <= 140),
  state            request_state NOT NULL DEFAULT 'pending',
  upvote_count     INTEGER NOT NULL DEFAULT 0,
  tip_cents        INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE upvotes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES song_requests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, user_id)
);

CREATE TABLE moderation_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  target_type   TEXT NOT NULL CHECK (target_type IN ('user', 'request')),
  target_id     UUID NOT NULL,
  action        TEXT NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE song_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE upvotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_read_rsvpd" ON song_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM rsvps WHERE rsvps.event_id = song_requests.event_id AND rsvps.user_id = auth.uid())
);
CREATE POLICY "requests_create_own" ON song_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "requests_update_own" ON song_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "requests_dj_update"  ON song_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = song_requests.event_id AND events.dj_id = auth.uid())
);

CREATE POLICY "upvotes_read_all"   ON upvotes FOR SELECT USING (true);
CREATE POLICY "upvotes_create_own" ON upvotes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "upvotes_delete_own" ON upvotes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "moderation_dj_insert" ON moderation_actions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM events WHERE events.id = moderation_actions.event_id AND events.dj_id = auth.uid())
);
```

- [ ] **Step 5: Create `supabase/migrations/005_analytics.sql`**

```sql
CREATE TABLE event_analytics_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload      JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE event_analytics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_organizer_read" ON event_analytics_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = event_analytics_snapshots.event_id AND events.organizer_id = auth.uid())
);
CREATE POLICY "analytics_dj_read" ON event_analytics_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = event_analytics_snapshots.event_id AND events.dj_id = auth.uid())
);
```

- [ ] **Step 6: Create `supabase/migrations/006_indexes.sql`**

```sql
-- Live request feed (most critical query in the app)
CREATE INDEX idx_song_requests_event_state_created
  ON song_requests(event_id, state, created_at DESC);

-- Door scanner check-in lookup
CREATE INDEX idx_rsvps_event_status
  ON rsvps(event_id, status);

-- Upvote uniqueness (already enforced by UNIQUE constraint; explicit index for perf)
CREATE UNIQUE INDEX idx_upvotes_request_user
  ON upvotes(request_id, user_id);

-- Event discovery feed
CREATE INDEX idx_events_state_start
  ON events(state, start_at);

-- QR / 6-digit code entry
CREATE UNIQUE INDEX idx_events_code
  ON events(event_code);

-- Auth phone lookup
CREATE UNIQUE INDEX idx_users_phone
  ON users(phone);
```

- [ ] **Step 7: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase database migrations with RLS policies and indexes"
```

---

## Task 16: Full Test Suite & Final Smoke Test

- [ ] **Step 1: Run the full test suite**

```bash
npm run test:run
```
Expected output:
```
✓ tests/lib/auth.test.ts (14 tests)
✓ tests/lib/supabase/realtime.test.ts (7 tests)
✓ tests/components/ui/Button.test.tsx (6 tests)
✓ tests/components/ui/Card.test.tsx (4 tests)
✓ tests/components/ui/Input.test.tsx (4 tests)
✓ tests/components/ui/Chip.test.tsx (5 tests)
✓ tests/components/ui/BottomNav.test.tsx (5 tests)

Test Files: 7 passed
Tests:      45 passed
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
npx tsc --noEmit
```
Expected: No errors, no output.

- [ ] **Step 3: Start the dev server and verify each route**

```bash
npm run dev
```

Open in browser and confirm these routes render without errors:
- `http://localhost:3000/login` — "Welcome to Spongy"
- `http://localhost:3000/explore` — "Find the Pulse." (will redirect to /login without Supabase creds — that's correct)
- `http://localhost:3000/e/TEST123` — shows event code "TEST123" (no redirect — deep link is public)
- `http://localhost:3000/queue` — redirects to /login (correct, studio route is protected)

`Ctrl+C` to stop.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: Phase 0 scaffold complete — all routes, design system, Supabase, and migrations"
```

---

## Phase 0 Complete

The scaffold is ready for Phase 1. Hand off notes:

- All credentials go in `.env.local` (copy from `.env.local.example`)
- Supabase migrations: run via Supabase dashboard SQL editor or `supabase db push` once project is linked
- PWA icons: add `public/icons/icon-192.png` and `public/icons/icon-512.png` in Phase 1
- Next phase target: **Phase 1 — Core Event Layer** (organizer account + event creation + free RSVP + phone OTP auth)
