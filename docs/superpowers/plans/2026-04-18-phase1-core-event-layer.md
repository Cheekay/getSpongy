# Phase 1 — Core Event Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement organizer event creation, attendee free RSVP with phone OTP, public event page with OG/story image export, and simple organizer door check-in — enabling one end-to-end friends-and-family free event.

**Architecture:** Hybrid mutation strategy — Next.js Server Actions for simple forms (auth, RSVP, check-in, state transitions); API Routes for event creation (multipart image upload) and image generation (OG, story). All data reads use Supabase server RSC client. JWT-signed QR codes via `jose`.

**Tech Stack:** Next.js 16 App Router, Supabase (auth + postgres + storage), `@supabase/ssr`, `jose`, `qrcode.react`, `@vercel/og`, `date-fns-tz`, `ical-generator`, Vitest + Testing Library

---

## File Map

```
CREATE  lib/supabase/service.ts               — service role client (bypasses RLS)
CREATE  lib/jwt.ts                             — signQrJwt / verifyQrJwt / isQrJwtNearExpiry
CREATE  lib/actions/auth.ts                    — sendOtp, verifyOtp, saveName server actions
CREATE  lib/actions/events.ts                  — goLive, endEvent, autoFlipEvents server actions
CREATE  lib/actions/rsvp.ts                    — rsvpToEvent, refreshQrJwt server actions
CREATE  lib/actions/checkin.ts                 — checkInGuest server action
MODIFY  app/(auth)/login/page.tsx              — phone entry form
MODIFY  app/(auth)/verify/page.tsx             — 6-digit OTP form
CREATE  app/(auth)/setup/page.tsx              — name capture (new user only)
CREATE  app/api/events/route.ts                — POST: image upload + event insert
CREATE  app/api/og/route.ts                    — GET: 1200×630 OG image
CREATE  app/api/story/route.ts                 — GET: 1080×1920 Instagram story image
MODIFY  app/(manage)/events/page.tsx           — My Events list (RSC)
CREATE  app/(manage)/events/new/page.tsx       — Create Event form (client component)
CREATE  app/(manage)/events/[id]/page.tsx      — Event Detail + Download Story
CREATE  app/(manage)/events/[id]/door/page.tsx — Door check-in (client component)
MODIFY  app/(attendee)/e/[code]/page.tsx       — Public event page + RSVP
CREATE  tests/lib/jwt.test.ts
CREATE  tests/lib/actions/rsvp.test.ts
CREATE  tests/lib/actions/checkin.test.ts
MODIFY  .env.local.example                     — add QR_JWT_SECRET
```

**DB column note:** the events table uses `event_code TEXT UNIQUE` (not `event_code_6digit`). Use `event_code` everywhere.

---

## Task 1: Install dependencies + service client

**Files:**
- Create: `lib/supabase/service.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Install packages**

```bash
cd /path/to/spongyApp
npm install jose qrcode.react @vercel/og date-fns-tz ical-generator
```

Expected: packages added to `node_modules/`, no peer dependency errors.

- [ ] **Step 2: Create service role Supabase client**

Create `lib/supabase/service.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 3: Add QR_JWT_SECRET to env example**

In `.env.local.example`, add after the existing Supabase block:

```bash
# ─── QR Code JWT ────────────────────────────────────────
QR_JWT_SECRET=your_random_secret_min_32_chars
```

Generate a local value: `openssl rand -base64 32` and add to your `.env.local`.

- [ ] **Step 4: Configure Supabase test OTPs (hosted dashboard)**

In Supabase Dashboard → Authentication → Providers → Phone:
- Enable Phone provider
- Under "Test phone numbers", add: `+14155550000` → `123456`

This bypasses real SMS during development.

- [ ] **Step 5: Run tests to confirm baseline still passes**

```bash
npm run test:run
```

Expected: all existing tests pass (≥47).

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/service.ts .env.local.example package.json package-lock.json
git commit -m "feat: add service client and Phase 1 dependencies"
```

---

## Task 2: JWT utility (`lib/jwt.ts`)

**Files:**
- Create: `lib/jwt.ts`
- Create: `tests/lib/jwt.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/jwt.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { signQrJwt, verifyQrJwt, isQrJwtNearExpiry } from '@/lib/jwt'

beforeAll(() => {
  process.env.QR_JWT_SECRET = 'test-secret-that-is-at-least-32-chars!!'
})

describe('signQrJwt', () => {
  it('returns a three-part JWT string', async () => {
    const token = await signQrJwt({ rsvpId: 'r1', eventId: 'e1', userId: 'u1' })
    expect(token.split('.')).toHaveLength(3)
  })
})

describe('verifyQrJwt', () => {
  it('round-trips the payload correctly', async () => {
    const payload = { rsvpId: 'r1', eventId: 'e1', userId: 'u1' }
    const token = await signQrJwt(payload)
    const result = await verifyQrJwt(token)
    expect(result.rsvpId).toBe('r1')
    expect(result.eventId).toBe('e1')
    expect(result.userId).toBe('u1')
  })

  it('throws on a tampered token', async () => {
    const token = await signQrJwt({ rsvpId: 'r1', eventId: 'e1', userId: 'u1' })
    const tampered = token.slice(0, -4) + 'xxxx'
    await expect(verifyQrJwt(tampered)).rejects.toThrow()
  })
})

describe('isQrJwtNearExpiry', () => {
  it('returns false for a freshly issued 24h token', async () => {
    const token = await signQrJwt({ rsvpId: 'r1', eventId: 'e1', userId: 'u1' })
    expect(isQrJwtNearExpiry(token)).toBe(false)
  })

  it('returns true for a token expiring in less than 1 hour', () => {
    // Construct a token with exp = now + 30 minutes
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const expIn30Min = Math.floor(Date.now() / 1000) + 1800
    const payloadB64 = Buffer.from(JSON.stringify({ rsvpId: 'r', eventId: 'e', userId: 'u', exp: expIn30Min })).toString('base64url')
    const fakeToken = `${header}.${payloadB64}.fakesig`
    expect(isQrJwtNearExpiry(fakeToken)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/lib/jwt.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/jwt'`

- [ ] **Step 3: Implement `lib/jwt.ts`**

```typescript
import { SignJWT, jwtVerify } from 'jose'

export interface QrPayload {
  rsvpId: string
  eventId: string
  userId: string
}

function getSecret() {
  return new TextEncoder().encode(process.env.QR_JWT_SECRET!)
}

export async function signQrJwt(payload: QrPayload): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifyQrJwt(token: string): Promise<QrPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as QrPayload
}

export function isQrJwtNearExpiry(token: string): boolean {
  const parts = token.split('.')
  if (parts.length < 2) return true
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8')
    const { exp } = JSON.parse(payloadJson) as { exp?: number }
    if (!exp) return true
    const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600
    return exp < oneHourFromNow
  } catch {
    return true
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/jwt.test.ts
```

Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/jwt.ts tests/lib/jwt.test.ts
git commit -m "feat: add JWT utility for QR code signing"
```

---

## Task 3: Auth server actions + login page

**Files:**
- Create: `lib/actions/auth.ts`
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create auth server actions**

Create `lib/actions/auth.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'

export async function sendOtp(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const phone = (formData.get('phone') as string)?.trim()
  if (!phone) return { error: 'Phone number is required' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) return { error: error.message }
  return {}
}

export async function verifyOtp(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const phone = (formData.get('phone') as string)?.trim()
  const token = (formData.get('token') as string)?.trim()
  const redirectTo = (formData.get('redirectTo') as string) || '/explore'

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
  if (error) return { error: error.message }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session not established' }

  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single()

  if (!profile?.name) {
    redirect(`/setup?redirect=${encodeURIComponent(redirectTo)}`)
  }
  redirect(redirectTo)
}

export async function saveName(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const name = (formData.get('name') as string)?.trim()
  const redirectTo = (formData.get('redirectTo') as string) || '/explore'

  if (!name || name.length < 2) return { error: 'Please enter your name (at least 2 characters)' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin.from('users').insert({
    id: user.id,
    phone: user.phone!,
    name,
    role_flags: { attendee: true, dj: false, organizer: false },
  })
  if (error) return { error: error.message }

  redirect(redirectTo)
}
```

- [ ] **Step 2: Implement login page**

Replace `app/(auth)/login/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendOtp } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Sending…' : 'Send Code'}
    </Button>
  )
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/explore'
  const router = useRouter()

  const [state, action] = useActionState(sendOtp, {})

  useEffect(() => {
    if (!state.error && Object.keys(state).length > 0) {
      router.push(`/verify?redirect=${encodeURIComponent(redirectTo)}`)
    }
  }, [state, redirectTo, router])

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h1 className="font-headline text-4xl font-bold">
            Welcome to <span className="text-primary">Spongy</span>
          </h1>
          <p className="text-on-surface-variant">Enter your number to get started</p>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div className="flex gap-2">
            <span className="flex items-center px-3 rounded-sm bg-surface-container-highest text-on-surface-variant text-sm">
              +1
            </span>
            <Input
              name="phone"
              type="tel"
              placeholder="(555) 000-0000"
              autoComplete="tel"
              className="flex-1"
              required
            />
          </div>
          {state.error && (
            <p className="text-error text-sm">{state.error}</p>
          )}
          <SubmitButton />
        </form>

        <p className="text-on-surface-variant text-xs text-center">
          We'll send a one-time code via SMS.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
npm run test:run
```

Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/auth.ts app/(auth)/login/page.tsx
git commit -m "feat: auth server actions and login page"
```

---

## Task 4: Verify page

**Files:**
- Modify: `app/(auth)/verify/page.tsx`

- [ ] **Step 1: Implement verify page**

Replace `app/(auth)/verify/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { verifyOtp } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Verifying…' : 'Verify'}
    </Button>
  )
}

export default function VerifyPage() {
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') || ''
  const redirectTo = searchParams.get('redirect') || '/explore'

  const [state, action] = useActionState(verifyOtp, {})

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-bold">Check your texts</h1>
          <p className="text-on-surface-variant">
            We sent a code to{' '}
            <span className="text-primary">{phone || 'your phone'}</span>
          </p>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input
            name="token"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            autoComplete="one-time-code"
            className="w-full text-center text-2xl tracking-widest rounded-sm bg-surface-container-highest px-4 py-3 text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
            required
          />
          {state.error && (
            <p className="text-error text-sm">{state.error}</p>
          )}
          <SubmitButton />
        </form>

        <div className="text-center space-y-1">
          <p className="text-on-surface-variant text-sm">
            Didn't get it?{' '}
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="text-secondary"
            >
              Resend code
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
```

**Note:** The login page needs to pass the phone number to the verify page. Update the `useEffect` in the login page to include `&phone=${encodeURIComponent(phone)}` in the router.push:

In `app/(auth)/login/page.tsx`, update the `useEffect` and add a `phone` ref:

```tsx
// Add after the redirectTo line in the component:
const phoneRef = useRef<HTMLInputElement>(null)

// Update useEffect:
useEffect(() => {
  if (!state.error && Object.keys(state).length > 0) {
    const phone = phoneRef.current?.value || ''
    router.push(
      `/verify?phone=${encodeURIComponent(phone)}&redirect=${encodeURIComponent(redirectTo)}`
    )
  }
}, [state, redirectTo, router])

// Add ref to Input:
// <Input ref={phoneRef} name="phone" ... />
```

Also add `import { useRef } from 'react'` to the login page.

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/verify/page.tsx app/\(auth\)/login/page.tsx
git commit -m "feat: verify page and phone-to-verify flow"
```

---

## Task 5: Setup page (new user name capture)

**Files:**
- Create: `app/(auth)/setup/page.tsx`

- [ ] **Step 1: Create setup page**

Create `app/(auth)/setup/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SetupForm from './SetupForm'

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo = '/explore' } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/setup?redirect=${encodeURIComponent(redirectTo)}`)

  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single()

  if (profile?.name) redirect(redirectTo)

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-bold">One last thing</h1>
          <p className="text-on-surface-variant">What should we call you?</p>
        </div>
        <SetupForm redirectTo={redirectTo} />
      </div>
    </main>
  )
}
```

Create `app/(auth)/setup/SetupForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveName } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Saving…' : 'Continue'}
    </Button>
  )
}

export default function SetupForm({ redirectTo }: { redirectTo: string }) {
  const [state, action] = useActionState(saveName, {})

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Input
        name="name"
        type="text"
        placeholder="Your first name"
        autoComplete="given-name"
        autoFocus
        required
      />
      {state.error && <p className="text-error text-sm">{state.error}</p>}
      <SubmitButton />
    </form>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/setup/
git commit -m "feat: setup page for new user name capture"
```

---

## Task 6: Event creation API route

**Files:**
- Create: `app/api/events/route.ts`

- [ ] **Step 1: Create event creation API route**

Create `app/api/events/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

function generateEventCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function getUniqueEventCode(admin: ReturnType<typeof createServiceClient>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateEventCode()
    const { data } = await admin.from('events').select('id').eq('event_code', code).single()
    if (!data) return code
  }
  throw new Error('Failed to generate unique event code after 10 attempts')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const title = (formData.get('title') as string)?.trim()
  const startAt = formData.get('startAt') as string
  const endAt = formData.get('endAt') as string
  const timezone = (formData.get('timezone') as string) || 'America/New_York'
  const venueName = (formData.get('venueName') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const capacity = formData.get('capacity') ? Number(formData.get('capacity')) : null
  const privacy = (formData.get('privacy') as string) || 'public'
  const publish = formData.get('publish') === 'true'
  const coverImage = formData.get('coverImage') as File | null

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 422 })
  if (!startAt || !endAt) return NextResponse.json({ error: 'Start and end times are required' }, { status: 422 })
  if (!venueName) return NextResponse.json({ error: 'Venue is required' }, { status: 422 })
  if (publish && !coverImage) return NextResponse.json({ error: 'Cover image is required to publish' }, { status: 422 })

  const admin = createServiceClient()

  let coverImageUrl: string | null = null
  if (coverImage && coverImage.size > 0) {
    const ext = coverImage.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await admin.storage
      .from('event-covers')
      .upload(path, coverImage, { contentType: coverImage.type, upsert: false })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: { publicUrl } } = admin.storage.from('event-covers').getPublicUrl(path)
    coverImageUrl = publicUrl
  }

  const eventCode = await getUniqueEventCode(admin)

  const { data: event, error } = await admin.from('events').insert({
    organizer_id: user.id,
    title,
    start_at: startAt,
    end_at: endAt,
    timezone,
    venue_name: venueName,
    description,
    capacity,
    privacy,
    cover_image_url: coverImageUrl,
    event_code: eventCode,
    state: publish ? 'published' : 'draft',
    rsvp_type: 'free',
  }).select('id, event_code').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: event.id, event_code: event.event_code }, { status: 201 })
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/events/route.ts
git commit -m "feat: event creation API route with image upload"
```

---

## Task 7: Event server actions

**Files:**
- Create: `lib/actions/events.ts`

- [ ] **Step 1: Create event server actions**

Create `lib/actions/events.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function goLive(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('events')
    .update({ state: 'live' })
    .eq('id', eventId)
    .eq('organizer_id', user.id)
    .eq('state', 'published')

  if (error) return { error: error.message }
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
  return {}
}

export async function endEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('events')
    .update({ state: 'ended' })
    .eq('id', eventId)
    .eq('organizer_id', user.id)
    .eq('state', 'live')

  if (error) return { error: error.message }
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
  return {}
}

export async function autoFlipEvents(): Promise<void> {
  const admin = createServiceClient()
  await admin
    .from('events')
    .update({ state: 'live' })
    .eq('state', 'published')
    .lte('start_at', new Date().toISOString())
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/events.ts
git commit -m "feat: event state transition server actions"
```

---

## Task 8: My Events page

**Files:**
- Modify: `app/(manage)/events/page.tsx`

- [ ] **Step 1: Implement My Events page**

Replace `app/(manage)/events/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { autoFlipEvents } from '@/lib/actions/events'
import { redirect } from 'next/navigation'
import EventList from './EventList'

export default async function EventsPage() {
  await autoFlipEvents()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/events')

  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_at, state, cover_image_url, event_code')
    .eq('organizer_id', user.id)
    .order('start_at', { ascending: false })

  return (
    <main className="px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-headline text-3xl font-bold">My Events</h1>
        <a
          href="/events/new"
          className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-primary-container flex items-center justify-center text-on-primary-fixed font-bold text-xl"
        >
          +
        </a>
      </div>
      <EventList events={events ?? []} />
    </main>
  )
}
```

Create `app/(manage)/events/EventList.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { goLive, endEvent } from '@/lib/actions/events'
import { Chip } from '@/components/ui/Chip'

type EventRow = {
  id: string
  title: string
  start_at: string
  state: string
  cover_image_url: string | null
  event_code: string
}

type Filter = 'all' | 'upcoming' | 'live' | 'past'

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Live', value: 'live' },
  { label: 'Past', value: 'past' },
]

function filterEvents(events: EventRow[], filter: Filter): EventRow[] {
  if (filter === 'all') return events
  if (filter === 'live') return events.filter(e => e.state === 'live')
  if (filter === 'upcoming') return events.filter(e => ['draft', 'published'].includes(e.state))
  return events.filter(e => ['ended', 'archived'].includes(e.state))
}

export default function EventList({ events }: { events: EventRow[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const visible = filterEvents(events, filter)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-label transition-colors ${
              filter === f.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-on-surface-variant text-center py-12">No events yet.</p>
      )}

      {visible.map(event => (
        <div key={event.id} className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-headline font-bold text-lg truncate">{event.title}</h2>
              <p className="text-on-surface-variant text-sm">
                {new Date(event.start_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </p>
            </div>
            <StateChip state={event.state} />
          </div>

          <div className="flex items-center gap-3">
            {event.state === 'published' && (
              <form action={goLive.bind(null, event.id)}>
                <button type="submit" className="text-tertiary text-sm font-label font-semibold">
                  Go Live →
                </button>
              </form>
            )}
            {event.state === 'live' && (
              <>
                <Link href={`/events/${event.id}/door`} className="text-secondary text-sm">
                  Manage Door →
                </Link>
                <form action={endEvent.bind(null, event.id)}>
                  <button type="submit" className="text-on-surface-variant text-sm">
                    End Event
                  </button>
                </form>
              </>
            )}
            {['ended', 'archived'].includes(event.state) && (
              <Link href={`/events/${event.id}`} className="text-secondary text-sm">
                View Report →
              </Link>
            )}
            {['draft', 'published'].includes(event.state) && (
              <Link href={`/events/${event.id}`} className="text-on-surface-variant text-sm">
                View Details →
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StateChip({ state }: { state: string }) {
  if (state === 'live') return <Chip variant="live">LIVE</Chip>
  if (state === 'published') return <Chip variant="pending">UPCOMING</Chip>
  if (state === 'draft') return <Chip variant="pending">DRAFT</Chip>
  return <Chip variant="played">ENDED</Chip>
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(manage\)/events/
git commit -m "feat: My Events page with filter chips and state actions"
```

---

## Task 9: Create Event page

**Files:**
- Create: `app/(manage)/events/new/page.tsx`

- [ ] **Step 1: Create the event form page**

Create `app/(manage)/events/new/page.tsx`:

```tsx
'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Image from 'next/image'

export default function NewEventPage() {
  const router = useRouter()
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const form = e.currentTarget
    const formData = new FormData(form)
    const publish = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-action') === 'publish'
    formData.set('publish', String(publish))

    try {
      const res = await fetch('/api/events', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Something went wrong'); return }
      router.push(`/events/${json.id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="px-4 py-6 pb-32">
      <div className="flex items-center justify-between mb-6">
        <a href="/events" className="text-on-surface-variant">← Back</a>
        <h1 className="font-headline text-xl font-bold">Create Event</h1>
        <div className="w-16" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Cover image */}
        <div
          className="w-full aspect-video rounded-xl bg-surface-container-low flex flex-col items-center justify-center cursor-pointer overflow-hidden"
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <Image src={preview} alt="Cover preview" fill className="object-cover" />
          ) : (
            <div className="text-center space-y-2 pointer-events-none">
              <div className="text-4xl">📷</div>
              <p className="text-on-surface-variant text-sm">Add cover photo</p>
              <p className="text-on-surface-variant text-xs">(required to publish)</p>
            </div>
          )}
          <input
            ref={fileRef}
            name="coverImage"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <Input name="title" type="text" placeholder="Event name" required />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-on-surface-variant text-xs uppercase tracking-wider">Start</label>
            <Input name="startAt" type="datetime-local" required />
          </div>
          <div className="space-y-1">
            <label className="text-on-surface-variant text-xs uppercase tracking-wider">End</label>
            <Input name="endAt" type="datetime-local" required />
          </div>
        </div>

        <Input name="venueName" type="text" placeholder="Venue name" required />

        <textarea
          name="description"
          rows={4}
          placeholder="Tell people what to expect…"
          className="w-full rounded-sm bg-surface-container-highest px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
        />

        <div className="space-y-2">
          <label className="text-on-surface-variant text-xs uppercase tracking-wider">Ticket Type</label>
          <div className="flex gap-2">
            <span className="px-4 py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container text-sm font-label">
              Free RSVP
            </span>
            <span className="px-4 py-1.5 rounded-full bg-surface-container text-on-surface-variant text-sm font-label opacity-40">
              Paid (Phase 3)
            </span>
          </div>
          <input type="hidden" name="rsvpType" value="free" />
        </div>

        <div className="space-y-2">
          <label className="text-on-surface-variant text-xs uppercase tracking-wider">Capacity</label>
          <Input name="capacity" type="number" min="1" placeholder="Unlimited" />
        </div>

        <div className="space-y-2">
          <label className="text-on-surface-variant text-xs uppercase tracking-wider">Privacy</label>
          <div className="flex rounded-full bg-surface-container overflow-hidden">
            {['public', 'unlisted'].map(val => (
              <label key={val} className="flex-1 text-center cursor-pointer">
                <input type="radio" name="privacy" value={val} defaultChecked={val === 'public'} className="sr-only peer" />
                <span className="block py-2 text-sm text-on-surface-variant peer-checked:bg-surface-bright peer-checked:text-on-surface capitalize transition-colors">
                  {val === 'unlisted' ? 'Link only' : 'Public'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-error text-sm">{error}</p>}

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-container-lowest space-y-2">
          <Button
            type="submit"
            data-action="publish"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? 'Publishing…' : 'Publish Event'}
          </Button>
          <Button
            type="submit"
            data-action="draft"
            variant="secondary"
            disabled={submitting}
            className="w-full"
          >
            Save Draft
          </Button>
        </div>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(manage\)/events/new/
git commit -m "feat: Create Event form with image upload"
```

---

## Task 10: Event Detail page (organizer)

**Files:**
- Create: `app/(manage)/events/[id]/page.tsx`

- [ ] **Step 1: Create event detail page**

Create `app/(manage)/events/[id]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_at, end_at, timezone, venue_name, state, event_code, cover_image_url, description, organizer_id')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${event.event_code}`
  const storyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/story?eventId=${event.id}`

  return (
    <main className="px-4 py-6 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/events" className="text-on-surface-variant">←</Link>
        <h1 className="font-headline text-2xl font-bold flex-1 truncate">{event.title}</h1>
        <StateChip state={event.state} />
      </div>

      {event.cover_image_url && (
        <img
          src={event.cover_image_url}
          alt="Event cover"
          className="w-full aspect-video object-cover rounded-xl"
        />
      )}

      <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Share link</p>
          <div className="flex items-center gap-2">
            <p className="text-secondary text-sm truncate flex-1">{shareUrl}</p>
            <button
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="text-on-surface-variant text-xs shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {event.state === 'live' && (
          <Link href={`/events/${event.id}/door`}>
            <Button className="w-full">Manage Door →</Button>
          </Link>
        )}
        <a href={storyUrl} download>
          <Button variant="secondary" className="w-full">Download IG Story</Button>
        </a>
      </div>
    </main>
  )
}

function StateChip({ state }: { state: string }) {
  if (state === 'live') return <Chip variant="live">LIVE</Chip>
  if (state === 'published') return <Chip variant="pending">UPCOMING</Chip>
  if (state === 'draft') return <Chip variant="pending">DRAFT</Chip>
  return <Chip variant="played">ENDED</Chip>
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(manage\)/events/\[id\]/page.tsx
git commit -m "feat: event detail page with share URL and story download"
```

---

## Task 11: RSVP server action

**Files:**
- Create: `lib/actions/rsvp.ts`
- Create: `tests/lib/actions/rsvp.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/actions/rsvp.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isEventAtCapacity } from '@/lib/actions/rsvp'

describe('isEventAtCapacity', () => {
  it('returns false when capacity is null (unlimited)', () => {
    expect(isEventAtCapacity(null, 999)).toBe(false)
  })

  it('returns false when rsvp count is below capacity', () => {
    expect(isEventAtCapacity(100, 50)).toBe(false)
  })

  it('returns true when rsvp count equals capacity', () => {
    expect(isEventAtCapacity(100, 100)).toBe(true)
  })

  it('returns true when rsvp count exceeds capacity', () => {
    expect(isEventAtCapacity(100, 150)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/lib/actions/rsvp.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/actions/rsvp'`

- [ ] **Step 3: Implement RSVP server action**

Create `lib/actions/rsvp.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signQrJwt, isQrJwtNearExpiry } from '@/lib/jwt'
import { revalidatePath } from 'next/cache'

export function isEventAtCapacity(capacity: number | null, rsvpCount: number): boolean {
  if (capacity === null) return false
  return rsvpCount >= capacity
}

export async function rsvpToEvent(eventId: string): Promise<{
  error?: string
  rsvpId?: string
  qrJwt?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch event and current RSVP count in parallel
  const [eventResult, countResult, existingResult] = await Promise.all([
    supabase.from('events').select('id, capacity, state').eq('id', eventId).single(),
    supabase.from('rsvps').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).neq('status', 'cancelled'),
    supabase.from('rsvps').select('id, qr_jwt').eq('event_id', eventId).eq('user_id', user.id).single(),
  ])

  if (eventResult.error || !eventResult.data) return { error: 'Event not found' }

  // Return existing RSVP (idempotent) — refresh JWT if near expiry
  if (existingResult.data) {
    let qrJwt = existingResult.data.qr_jwt as string
    if (!qrJwt || isQrJwtNearExpiry(qrJwt)) {
      qrJwt = await refreshQrJwt(existingResult.data.id)
    }
    return { rsvpId: existingResult.data.id, qrJwt }
  }

  // Capacity check
  if (isEventAtCapacity(eventResult.data.capacity, countResult.count ?? 0)) {
    return { error: 'This event is full' }
  }

  // Insert RSVP
  const admin = createServiceClient()
  const { data: rsvp, error: insertError } = await admin
    .from('rsvps')
    .insert({ event_id: eventId, user_id: user.id, status: 'rsvpd' })
    .select('id')
    .single()

  if (insertError || !rsvp) return { error: insertError?.message || 'Failed to RSVP' }

  const qrJwt = await signQrJwt({ rsvpId: rsvp.id, eventId, userId: user.id })

  await admin.from('rsvps').update({ qr_jwt: qrJwt }).eq('id', rsvp.id)

  revalidatePath(`/e/${eventId}`)
  return { rsvpId: rsvp.id, qrJwt }
}

export async function refreshQrJwt(rsvpId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: rsvp } = await supabase
    .from('rsvps')
    .select('id, event_id, user_id')
    .eq('id', rsvpId)
    .single()
  if (!rsvp) throw new Error('RSVP not found')

  const qrJwt = await signQrJwt({ rsvpId: rsvp.id, eventId: rsvp.event_id, userId: rsvp.user_id })
  const admin = createServiceClient()
  await admin.from('rsvps').update({ qr_jwt: qrJwt }).eq('id', rsvpId)
  return qrJwt
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/actions/rsvp.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/rsvp.ts tests/lib/actions/rsvp.test.ts
git commit -m "feat: RSVP server action with QR JWT generation"
```

---

## Task 12: Public event page + RSVP

**Files:**
- Modify: `app/(attendee)/e/[code]/page.tsx`

- [ ] **Step 1: Implement public event page**

Replace `app/(attendee)/e/[code]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { format } from 'date-fns-tz'
import EventPageClient from './EventPageClient'

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const supabase = await createClient()
  const { data: event } = await supabase
    .from('events')
    .select('id, title, venue_name, start_at, timezone, cover_image_url')
    .eq('event_code', code)
    .single()

  if (!event) return { title: 'Event Not Found' }

  const dateStr = format(new Date(event.start_at), 'EEE MMM d · h:mm a', { timeZone: event.timezone })
  return {
    title: event.title,
    description: `${dateStr} · ${event.venue_name}`,
    openGraph: {
      title: event.title,
      description: `${dateStr} · ${event.venue_name}`,
      images: [
        {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/og?eventId=${event.id}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  }
}

export default async function EventCodePage({ params }: Props) {
  const { code } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select(`
      id, title, description, cover_image_url, start_at, end_at, timezone,
      venue_name, state, capacity, event_code, rsvp_type,
      organizer:users!organizer_id(name)
    `)
    .eq('event_code', code)
    .neq('state', 'draft')
    .single()

  if (!event) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  let existingRsvp: { id: string; qr_jwt: string | null } | null = null
  let rsvpCount = 0

  const [rsvpResult, countResult] = await Promise.all([
    user
      ? supabase.from('rsvps').select('id, qr_jwt').eq('event_id', event.id).eq('user_id', user.id).single()
      : Promise.resolve({ data: null }),
    supabase.from('rsvps').select('id', { count: 'exact', head: true }).eq('event_id', event.id).neq('status', 'cancelled'),
  ])

  existingRsvp = rsvpResult.data ?? null
  rsvpCount = countResult.count ?? 0

  const atCapacity = event.capacity !== null && rsvpCount >= event.capacity
  const hasProfile = user
    ? !!(await supabase.from('users').select('name').eq('id', user.id).single()).data?.name
    : false

  return (
    <EventPageClient
      event={event}
      user={user ? { id: user.id } : null}
      hasProfile={hasProfile}
      existingRsvp={existingRsvp}
      rsvpCount={rsvpCount}
      atCapacity={atCapacity}
      appUrl={process.env.NEXT_PUBLIC_APP_URL!}
    />
  )
}
```

Create `app/(attendee)/e/[code]/EventPageClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { rsvpToEvent } from '@/lib/actions/rsvp'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import QRCode from 'qrcode.react'
import { format } from 'date-fns-tz'

type EventPageClientProps = {
  event: {
    id: string
    title: string
    description: string | null
    cover_image_url: string | null
    start_at: string
    end_at: string
    timezone: string
    venue_name: string | null
    state: string
    capacity: number | null
    event_code: string
    organizer: { name: string } | null
  }
  user: { id: string } | null
  hasProfile: boolean
  existingRsvp: { id: string; qr_jwt: string | null } | null
  rsvpCount: number
  atCapacity: boolean
  appUrl: string
}

export default function EventPageClient({
  event, user, hasProfile, existingRsvp, rsvpCount, atCapacity, appUrl,
}: EventPageClientProps) {
  const router = useRouter()
  const [rsvp, setRsvp] = useState(existingRsvp)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventUrl = `${appUrl}/e/${event.event_code}`
  const dateStr = format(new Date(event.start_at), 'EEE MMM d · h:mm a zzz', { timeZone: event.timezone })

  async function handleRsvp() {
    if (!user) {
      router.push(`/login?redirect=/e/${event.event_code}`)
      return
    }
    if (!hasProfile) {
      router.push(`/setup?redirect=/e/${event.event_code}`)
      return
    }
    setLoading(true)
    setError(null)
    const result = await rsvpToEvent(event.id)
    if (result.error) { setError(result.error); setLoading(false); return }
    setRsvp({ id: result.rsvpId!, qr_jwt: result.qrJwt! })
    setLoading(false)
  }

  if (rsvp?.qr_jwt) {
    return <RsvpConfirmation event={event} qrJwt={rsvp.qr_jwt} eventUrl={eventUrl} />
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Hero */}
      <div className="relative w-full aspect-video">
        {event.cover_image_url && (
          <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover rounded-b-xl" />
        )}
        <div className="absolute bottom-3 left-3">
          <Chip variant="live">FREE ENTRY</Chip>
        </div>
        <button
          onClick={() => navigator.share?.({ url: eventUrl, title: event.title })}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface-container-lowest/70 backdrop-blur flex items-center justify-center text-on-surface"
        >
          ↗
        </button>
      </div>

      {/* Info card */}
      <div className="mx-4 -mt-6 bg-surface-container-low rounded-xl p-4 space-y-2">
        <h1 className="font-headline text-2xl font-bold">{event.title}</h1>
        <p className="text-on-surface-variant text-sm uppercase tracking-wider">{dateStr}</p>
        {event.venue_name && (
          <p className="text-on-surface text-sm">📍 {event.venue_name}</p>
        )}
        {event.organizer && (
          <p className="text-on-surface-variant text-sm">Hosted by {event.organizer.name}</p>
        )}
      </div>

      {/* Description */}
      {event.description && (
        <div className="mx-4 mt-4">
          <p className="text-on-surface-variant">{event.description}</p>
        </div>
      )}

      {/* Attendees */}
      <div className="mx-4 mt-4">
        <p className="text-on-surface-variant text-sm">{rsvpCount} people going</p>
      </div>

      {error && <p className="mx-4 mt-2 text-error text-sm">{error}</p>}

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-container-lowest flex items-center gap-4">
        <span className="text-on-surface-variant text-sm">Free Event</span>
        <Button
          className="flex-1"
          onClick={handleRsvp}
          disabled={loading || atCapacity}
        >
          {atCapacity ? 'Event Full' : loading ? 'RSVPing…' : 'RSVP Free'}
        </Button>
      </div>
    </div>
  )
}

function RsvpConfirmation({
  event, qrJwt, eventUrl,
}: {
  event: EventPageClientProps['event']
  qrJwt: string
  eventUrl: string
}) {
  return (
    <div className="min-h-screen px-4 py-12 flex flex-col items-center space-y-6">
      <div className="text-6xl ambient-glow-primary">✨</div>
      <div className="text-center space-y-1">
        <h1 className="font-headline text-3xl font-bold">You're in!</h1>
        <p className="text-on-surface-variant">Your RSVP for {event.title} is confirmed.</p>
      </div>

      <div className="bg-surface-container rounded-xl p-6 flex flex-col items-center space-y-3">
        <QRCode value={qrJwt} size={180} bgColor="transparent" fgColor="#f8f5fd" />
        <p className="text-secondary text-sm">Show this at the door</p>
        <p className="text-on-surface-variant text-xs">
          {event.title} · {new Date(event.start_at).toLocaleDateString()}
        </p>
      </div>

      <div className="flex gap-3 w-full">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => navigator.share?.({ url: eventUrl, title: event.title })}
        >
          Share Event
        </Button>
      </div>

      <Button className="w-full" onClick={() => window.location.href = `/live/${event.id}`}>
        🎵 Submit a Song Request
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(attendee\)/e/
git commit -m "feat: public event page with RSVP and QR confirmation"
```

---

## Task 13: Check-in server action

**Files:**
- Create: `lib/actions/checkin.ts`
- Create: `tests/lib/actions/checkin.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/actions/checkin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isDuplicateCheckIn, formatCheckinTime } from '@/lib/actions/checkin'

describe('isDuplicateCheckIn', () => {
  it('returns true for checked_in status', () => {
    expect(isDuplicateCheckIn('checked_in')).toBe(true)
  })

  it('returns false for rsvpd status', () => {
    expect(isDuplicateCheckIn('rsvpd')).toBe(false)
  })

  it('returns false for paid status', () => {
    expect(isDuplicateCheckIn('paid')).toBe(false)
  })
})

describe('formatCheckinTime', () => {
  it('formats an ISO timestamp to time only', () => {
    const ts = '2026-05-03T21:43:00.000Z'
    const result = formatCheckinTime(ts)
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('returns empty string for null', () => {
    expect(formatCheckinTime(null)).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- tests/lib/actions/checkin.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement check-in server action**

Create `lib/actions/checkin.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export function isDuplicateCheckIn(status: string): boolean {
  return status === 'checked_in'
}

export function formatCheckinTime(checkedInAt: string | null): string {
  if (!checkedInAt) return ''
  return new Date(checkedInAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export type GuestRow = {
  id: string
  status: string
  checked_in_at: string | null
  user: { name: string; phone: string }
}

export async function getGuestList(eventId: string): Promise<{
  guests?: GuestRow[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: event } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single()

  if (!event || event.organizer_id !== user.id) return { error: 'Access denied' }

  const { data: rsvps, error } = await supabase
    .from('rsvps')
    .select('id, status, checked_in_at, user:users!user_id(name, phone)')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .order('status', { ascending: true })

  if (error) return { error: error.message }
  return { guests: (rsvps ?? []) as unknown as GuestRow[] }
}

export async function checkInGuest(rsvpId: string): Promise<{
  duplicate?: boolean
  checkedInAt?: string
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: rsvp } = await supabase
    .from('rsvps')
    .select('id, status, event_id')
    .eq('id', rsvpId)
    .single()

  if (!rsvp) return { error: 'RSVP not found' }
  if (isDuplicateCheckIn(rsvp.status)) return { duplicate: true }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rsvps')
    .update({ status: 'checked_in', checked_in_at: now })
    .eq('id', rsvpId)

  if (error) return { error: error.message }
  revalidatePath(`/events/${rsvp.event_id}/door`)
  return { checkedInAt: now }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/lib/actions/checkin.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/checkin.ts tests/lib/actions/checkin.test.ts
git commit -m "feat: check-in server action with duplicate detection"
```

---

## Task 14: Door check-in page

**Files:**
- Create: `app/(manage)/events/[id]/door/page.tsx`

- [ ] **Step 1: Create the door check-in page**

Create `app/(manage)/events/[id]/door/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import DoorClient from './DoorClient'

export default async function DoorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, capacity, organizer_id')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  const { data: rsvps } = await supabase
    .from('rsvps')
    .select('id, status, checked_in_at, user:users!user_id(name, phone)')
    .eq('event_id', id)
    .neq('status', 'cancelled')
    .order('status', { ascending: true })

  return (
    <DoorClient
      eventId={id}
      eventTitle={event.title}
      capacity={event.capacity}
      initialGuests={(rsvps ?? []) as any}
    />
  )
}
```

Create `app/(manage)/events/[id]/door/DoorClient.tsx`:

```tsx
'use client'

import { useState, useMemo } from 'react'
import { checkInGuest, isDuplicateCheckIn, formatCheckinTime } from '@/lib/actions/checkin'
import type { GuestRow } from '@/lib/actions/checkin'
import Link from 'next/link'

type Props = {
  eventId: string
  eventTitle: string
  capacity: number | null
  initialGuests: GuestRow[]
}

export default function DoorClient({ eventId, eventTitle, capacity, initialGuests }: Props) {
  const [guests, setGuests] = useState<GuestRow[]>(initialGuests)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'warn' | 'error' } | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return guests
    const q = query.toLowerCase()
    return guests.filter(g =>
      g.user.name.toLowerCase().includes(q) ||
      g.user.phone.slice(-4).includes(q)
    )
  }, [guests, query])

  const checkedInCount = guests.filter(g => g.status === 'checked_in').length
  const totalCount = guests.length
  const pct = totalCount > 0 ? Math.round((checkedInCount / (capacity ?? totalCount)) * 100) : 0

  function showToast(message: string, type: 'ok' | 'warn' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleCheckIn(rsvpId: string) {
    const prevGuests = guests
    setGuests(prev => prev.map(g =>
      g.id === rsvpId
        ? { ...g, status: 'checked_in', checked_in_at: new Date().toISOString() }
        : g
    ))

    const result = await checkInGuest(rsvpId)

    if (result.error) {
      setGuests(prevGuests)
      showToast(result.error, 'error')
    } else if (result.duplicate) {
      setGuests(prevGuests)
      const guest = prevGuests.find(g => g.id === rsvpId)
      const time = formatCheckinTime(guest?.checked_in_at ?? null)
      showToast(`Already checked in${time ? ` at ${time}` : ''}`, 'warn')
    } else {
      setGuests(prev => prev.map(g =>
        g.id === rsvpId ? { ...g, checked_in_at: result.checkedInAt! } : g
      ))
      showToast('Checked in ✓', 'ok')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between bg-surface-container-low">
        <Link href={`/events/${eventId}`} className="text-on-surface-variant">←</Link>
        <h1 className="font-headline font-bold text-base truncate flex-1 mx-3">{eventTitle}</h1>
        <span className="text-tertiary font-label font-bold text-sm shrink-0">
          {checkedInCount}/{capacity ?? totalCount}
        </span>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <input
          type="search"
          placeholder="Search by name or last 4 digits…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-full bg-surface-container-highest px-4 py-2 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary text-sm"
        />
      </div>

      {/* Guest list */}
      <div className="flex-1 px-4 space-y-2 overflow-y-auto">
        {filtered.map(guest => (
          <div key={guest.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant text-sm font-bold shrink-0">
              {guest.user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-label font-semibold text-on-surface truncate">{guest.user.name}</p>
              <p className="text-on-surface-variant text-xs">
                {guest.status === 'checked_in'
                  ? `Checked in · ${formatCheckinTime(guest.checked_in_at)}`
                  : 'RSVPd'}
              </p>
            </div>
            {guest.status === 'checked_in' ? (
              <span className="text-tertiary text-lg">✓</span>
            ) : (
              <button
                onClick={() => handleCheckIn(guest.id)}
                className="px-3 py-1.5 rounded-full ring-1 ring-secondary/40 text-secondary text-xs font-label font-semibold shrink-0"
              >
                Check In
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-on-surface-variant text-center py-8 text-sm">No guests found</p>
        )}
      </div>

      {/* Stats bar */}
      <div className="px-4 py-3 bg-surface-container-lowest flex justify-around text-on-surface-variant text-xs">
        <span>{checkedInCount} checked in</span>
        <span>·</span>
        <span>{totalCount - checkedInCount} remaining</span>
        <span>·</span>
        <span>{pct}% capacity</span>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-label font-semibold transition-all ${
          toast.type === 'ok' ? 'bg-tertiary text-on-tertiary' :
          toast.type === 'warn' ? 'bg-primary text-on-primary' :
          'bg-error text-on-error'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(manage\)/events/\[id\]/door/
git commit -m "feat: door check-in page with live search and optimistic UI"
```

---

## Task 15: OG image route

**Files:**
- Create: `app/api/og/route.ts`

- [ ] **Step 1: Create OG image route**

Create `app/api/og/route.ts`:

```typescript
import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')
  if (!eventId) return new Response('Missing eventId', { status: 400 })

  const admin = createServiceClient()
  const { data: event } = await admin
    .from('events')
    .select('title, venue_name, start_at, timezone, cover_image_url')
    .eq('id', eventId)
    .single()

  if (!event) return new Response('Event not found', { status: 404 })

  const dateStr = new Date(event.start_at).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0e0e13',
          position: 'relative',
        }}
      >
        {/* Cover image — right 55% */}
        {event.cover_image_url && (
          <img
            src={event.cover_image_url}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '55%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to right, #0e0e13 45%, transparent 75%)',
          }}
        />
        {/* Left content */}
        <div
          style={{
            position: 'relative',
            width: '50%',
            padding: '48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <span style={{ color: '#de8eff', fontSize: '20px', fontWeight: 700 }}>Spongy</span>
          <span
            style={{
              color: '#f8f5fd',
              fontSize: event.title.length > 30 ? '36px' : '48px',
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            {event.title}
          </span>
          <span style={{ color: '#acaab1', fontSize: '20px' }}>
            {dateStr}
          </span>
          {event.venue_name && (
            <span style={{ color: '#acaab1', fontSize: '18px' }}>📍 {event.venue_name}</span>
          )}
          <span
            style={{
              marginTop: '8px',
              background: '#bcff5f',
              color: '#3d6100',
              borderRadius: '9999px',
              padding: '6px 20px',
              fontSize: '14px',
              fontWeight: 700,
              width: 'fit-content',
            }}
          >
            FREE ENTRY
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/og/route.ts
git commit -m "feat: OG image generation route (1200x630)"
```

---

## Task 16: Instagram story image route

**Files:**
- Create: `app/api/story/route.ts`

- [ ] **Step 1: Create story image route**

Create `app/api/story/route.ts`:

```typescript
import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')
  if (!eventId) return new Response('Missing eventId', { status: 400 })

  const admin = createServiceClient()
  const { data: event } = await admin
    .from('events')
    .select('title, venue_name, start_at, timezone, cover_image_url, event_code')
    .eq('id', eventId)
    .single()

  if (!event) return new Response('Event not found', { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://spongy.app'
  const dateStr = new Date(event.start_at).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  const timeStr = new Date(event.start_at).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
  const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex' }}>
        {/* Full-bleed background */}
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: '#0e0e13' }} />
        )}
        {/* Dark gradient overlay — bottom 70% */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(14,14,19,0.2) 0%, rgba(14,14,19,0.85) 40%, #0e0e13 100%)',
          }}
        />
        {/* Content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '80px 60px',
            width: '100%',
            height: '100%',
          }}
        >
          {/* Top: Spongy wordmark */}
          <span style={{ color: '#de8eff', fontSize: '36px', fontWeight: 800 }}>Spongy</span>

          {/* Center: Event info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <span
              style={{
                color: '#f8f5fd',
                fontSize: event.title.length > 20 ? '72px' : '96px',
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {event.title}
            </span>
            <span style={{ color: '#acaab1', fontSize: '40px' }}>{dateStr}</span>
            <span style={{ color: '#acaab1', fontSize: '36px' }}>{timeStr}</span>
            {event.venue_name && (
              <span style={{ color: '#acaab1', fontSize: '32px' }}>📍 {event.venue_name}</span>
            )}
          </div>

          {/* Bottom: RSVP CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <span
              style={{
                color: '#bcff5f',
                fontSize: '32px',
                fontWeight: 700,
              }}
            >
              RSVP free → {appUrl}/e/{event.event_code}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      headers: {
        'Content-Disposition': `attachment; filename="${slug}-story.png"`,
        'Cache-Control': 'public, max-age=3600',
      },
    }
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass (≥57).

- [ ] **Step 3: Commit**

```bash
git add app/api/story/route.ts
git commit -m "feat: Instagram story image generation route (1080x1920)"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Phone OTP auth (Supabase-managed) | Tasks 3, 4 |
| New user name capture | Tasks 3, 5 |
| `/setup` redirect flow | Tasks 3, 5 |
| Event creation + image upload | Tasks 6, 9 |
| Event state transitions (hybrid) | Tasks 7, 8 |
| My Events list + filter chips | Task 8 |
| Event detail + share URL | Task 10 |
| RSVP Server Action + QR JWT | Tasks 2, 11 |
| QR expiry refresh | Task 11 |
| Public event page + OG metadata | Task 12 |
| RSVP confirmation view + QR | Task 12 |
| Share / Web Share API | Task 12 |
| Capacity enforcement | Task 11 |
| Door check-in (name search) | Tasks 13, 14 |
| Optimistic check-in UI | Task 14 |
| OG image 1200×630 | Task 15 |
| Instagram story 1080×1920 | Task 16 |
| `QR_JWT_SECRET` env var | Task 1 |
| Service role client | Task 1 |
| Test OTP dev config | Task 1 |

All spec requirements have a corresponding task. ✓

**Type consistency:**
- `GuestRow` defined in `lib/actions/checkin.ts` — used in both door page files ✓
- `QrPayload` defined in `lib/jwt.ts` — used in `lib/actions/rsvp.ts` ✓
- `event_code` (not `event_code_6digit`) used consistently throughout ✓
- `createServiceClient()` signature consistent across all uses ✓
