# Phase 4 Track A: Pro Subscriptions, Branding & Team Seats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe Billing subscriptions ($19/mo, 14-day trial), feature gating, custom event-page branding, and team seat management to Spongy.

**Architecture:** New `lib/pro.ts` module owns the `isProUser()` check and `<ProGate>` component. `lib/actions/subscription.ts` handles Checkout + Billing Portal session creation. The existing webhook handler at `app/api/stripe/webhook/route.ts` is extended with subscription lifecycle events. Branding fields live on the `users` row; team members get their own `team_members` table scoped to `organizer_id`.

**Tech Stack:** Stripe Billing API (Subscriptions, Checkout Sessions, Customer Portal), Next.js App Router server actions, Supabase Postgres + service client, `jose` for invite JWTs, vitest + `vi.mock` for tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/011_phase4_pro.sql` | Create | Adds subscription columns + `team_members` table |
| `lib/pro.ts` | Create | `isProUser()`, `requirePro()` server helpers |
| `components/ProGate.tsx` | Create | Client component — renders paywall bottom sheet for free users |
| `lib/actions/subscription.ts` | Create | `createCheckoutSession`, `createBillingPortalSession` |
| `app/api/stripe/webhook/route.ts` | Modify | Add subscription lifecycle event handlers |
| `lib/actions/branding.ts` | Create | `saveBrandSettings` server action |
| `lib/actions/team.ts` | Create | `inviteTeamMember`, `acceptTeamInvite`, `removeTeamMember`, `resendInvite` |
| `app/(manage)/upgrade/page.tsx` | Create | Pricing page — Free vs Pro, Organizer/DJ toggle |
| `app/(manage)/subscription/page.tsx` | Create | Subscription management — plan status + portal redirect |
| `app/(manage)/brand/page.tsx` | Create | Brand settings — logo, accent color, watermark toggle (pro-gated) |
| `app/(manage)/team/page.tsx` | Create | Team management — member list + invite form (pro-gated) |
| `app/(manage)/team/TeamClient.tsx` | Create | Client component — invite form + remove member |
| `app/join-team/[token]/page.tsx` | Create | Accept team invite — validates token, OTP if unauthenticated |
| `app/(manage)/layout.tsx` | Modify | Add "Upgrade to Pro" banner for free users |
| `app/api/events/[id]/recap/route.tsx` | Modify | Read organizer branding fields; omit Spongy watermark when `brand_hide_watermark = true` |
| `tests/lib/pro.test.ts` | Create | Unit tests for `isProUser` across all 5 subscription states |
| `tests/lib/actions/subscription.test.ts` | Create | Tests for `createCheckoutSession`, `createBillingPortalSession` |
| `tests/app/api/stripe/webhook.test.ts` | Modify | Add tests for 5 subscription webhook event types |
| `tests/lib/actions/branding.test.ts` | Create | Tests for `saveBrandSettings` + pro gate enforcement |
| `tests/lib/actions/team.test.ts` | Create | Tests for all 4 team actions |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/011_phase4_pro.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/011_phase4_pro.sql

-- Subscription state on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_status      TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,
  ADD COLUMN IF NOT EXISTS subscription_period_end  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brand_logo_url           TEXT,
  ADD COLUMN IF NOT EXISTS brand_accent_color       TEXT,
  ADD COLUMN IF NOT EXISTS brand_hide_watermark     BOOLEAN NOT NULL DEFAULT FALSE;

-- Team members scoped per organizer account
CREATE TABLE IF NOT EXISTS team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_phone   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('co_organizer', 'door_staff')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at     TIMESTAMPTZ,
  UNIQUE(organizer_id, invited_phone)
);

-- RLS: organizer reads their own team
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_organizer_all" ON team_members
  USING (organizer_id = auth.uid());

-- door_staff read access to rsvps for their organizer's events
CREATE POLICY "rsvps_team_read" ON rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN events e ON e.organizer_id = tm.organizer_id
      WHERE tm.member_user_id = auth.uid()
        AND tm.status = 'accepted'
        AND e.id = rsvps.event_id
    )
  );
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
npx supabase db reset
```

Expected: migration applies without error, `team_members` table exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_phase4_pro.sql
git commit -m "feat: migration 011 — pro subscription columns + team_members table"
```

---

## Task 2: Pro Gating Helpers

**Files:**
- Create: `lib/pro.ts`
- Create: `tests/lib/pro.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/pro.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  return q
}

import { isProUser, requirePro } from '@/lib/pro'

describe('isProUser', () => {
  it('returns true for active subscription', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'active' } })
    )
    expect(await isProUser('user-1')).toBe(true)
  })

  it('returns true for trialing subscription', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'trialing' } })
    )
    expect(await isProUser('user-1')).toBe(true)
  })

  it('returns false for free', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'free' } })
    )
    expect(await isProUser('user-1')).toBe(false)
  })

  it('returns false for past_due', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'past_due' } })
    )
    expect(await isProUser('user-1')).toBe(false)
  })

  it('returns false for canceled', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'canceled' } })
    )
    expect(await isProUser('user-1')).toBe(false)
  })
})

describe('requirePro', () => {
  it('throws redirect to /upgrade for free user', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'free' } })
    )
    await expect(requirePro()).rejects.toThrow('REDIRECT:/upgrade')
  })

  it('does not throw for active user', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'active' } })
    )
    await expect(requirePro()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/pro.test.ts
```

Expected: FAIL — `lib/pro.ts` does not exist.

- [ ] **Step 3: Implement `lib/pro.ts`**

```typescript
// lib/pro.ts
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const PRO_STATUSES = new Set(['trialing', 'active'])

export async function isProUser(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', userId)
    .single()
  return PRO_STATUSES.has(data?.subscription_status ?? 'free')
}

export async function requirePro(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const isPro = await isProUser(user.id)
  if (!isPro) redirect('/upgrade')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/pro.test.ts
```

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/pro.ts tests/lib/pro.test.ts
git commit -m "feat: isProUser + requirePro helpers with subscription status gating"
```

---

## Task 3: Stripe Billing Actions

**Files:**
- Create: `lib/actions/subscription.ts`
- Create: `tests/lib/actions/subscription.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/actions/subscription.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

const mockServiceClient = { from: vi.fn() }
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: vi.fn(), list: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
  },
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { createCheckoutSession, createBillingPortalSession } from '@/lib/actions/subscription'
import { stripe } from '@/lib/stripe'

describe('createCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro_monthly'
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await createCheckoutSession()
    expect(result.error).toBe('Not authenticated')
  })

  it('creates a new Stripe customer when none exists and returns checkout URL', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_customer_id: null }, error: null })
    )
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    vi.mocked(stripe.customers.create).mockResolvedValue({ id: 'cus_new' } as any)
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/session' } as any)

    const result = await createCheckoutSession()
    expect(result.url).toBe('https://checkout.stripe.com/session')
    expect(stripe.customers.create).toHaveBeenCalled()
  })

  it('reuses existing Stripe customer ID', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_customer_id: 'cus_existing' }, error: null })
    )
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/session2' } as any)

    const result = await createCheckoutSession()
    expect(result.url).toBe('https://checkout.stripe.com/session2')
    expect(stripe.customers.create).not.toHaveBeenCalled()
  })
})

describe('createBillingPortalSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  it('returns error when no stripe_customer_id', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_customer_id: null }, error: null })
    )
    const result = await createBillingPortalSession()
    expect(result.error).toMatch(/no billing account/)
  })

  it('returns portal URL for existing customer', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_customer_id: 'cus_existing' }, error: null })
    )
    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({ url: 'https://billing.stripe.com/portal' } as any)

    const result = await createBillingPortalSession()
    expect(result.url).toBe('https://billing.stripe.com/portal')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/actions/subscription.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/actions/subscription.ts`**

```typescript
// lib/actions/subscription.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'

export async function createCheckoutSession(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const priceId = process.env.STRIPE_PRO_PRICE_ID
  if (!appUrl || !priceId) return { error: 'Billing not configured' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id, name')
    .eq('id', user.id)
    .single()

  let customerId = userData?.stripe_customer_id ?? null

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { spongy_user_id: user.id },
      name: userData?.name ?? undefined,
    })
    customerId = customer.id
    const admin = createServiceClient()
    await admin.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  let session: { url: string | null }
  try {
    session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: `${appUrl}/manage/subscription?success=1`,
      cancel_url: `${appUrl}/upgrade`,
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Checkout setup failed' }
  }

  return { url: session.url ?? undefined }
}

export async function createBillingPortalSession(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return { error: 'App URL not configured' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_customer_id) return { error: 'No billing account found. Subscribe first.' }

  let portalSession: { url: string }
  try {
    portalSession = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: `${appUrl}/manage/subscription`,
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Portal setup failed' }
  }

  return { url: portalSession.url }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/actions/subscription.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/subscription.ts tests/lib/actions/subscription.test.ts
git commit -m "feat: createCheckoutSession + createBillingPortalSession for Stripe Billing"
```

---

## Task 4: Subscription Webhook Handlers

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`
- Modify: `tests/app/api/stripe/webhook.test.ts`

- [ ] **Step 1: Write the failing tests** (add to the existing describe block)

Open `tests/app/api/stripe/webhook.test.ts` and append these tests inside the `describe('POST /api/stripe/webhook', ...)` block:

```typescript
  it('sets subscription_status to trialing on customer.subscription.created with trial', async () => {
    const now = Math.floor(Date.now() / 1000)
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'trialing',
          current_period_end: now + 86400 * 14,
        },
      },
    } as any)
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      subscription_status: 'trialing',
      stripe_subscription_id: 'sub_123',
    }))
  })

  it('sets subscription_status to active on customer.subscription.updated', async () => {
    const now = Math.floor(Date.now() / 1000)
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          current_period_end: now + 86400 * 30,
        },
      },
    } as any)
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ subscription_status: 'active' }))
  })

  it('sets subscription_status to canceled on customer.subscription.deleted', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_123', customer: 'cus_123' } },
    } as any)
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ subscription_status: 'canceled' }))
  })

  it('sets subscription_status to past_due on invoice.payment_failed', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_123' } },
    } as any)
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ subscription_status: 'past_due' }))
  })

  it('sets subscription_status to active on invoice.payment_succeeded', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: { object: { customer: 'cus_123', subscription: 'sub_123' } },
    } as any)
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ subscription_status: 'active' }))
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/app/api/stripe/webhook.test.ts
```

Expected: 5 new tests FAIL.

- [ ] **Step 3: Extend the webhook handler**

In `app/api/stripe/webhook/route.ts`, add the following block after the existing `if (event.type === 'account.updated')` block, before `return new NextResponse('OK', ...)`:

```typescript
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    await admin.from('users').update({
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    }).eq('stripe_customer_id', sub.customer as string)
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await admin.from('users').update({
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      subscription_period_end: null,
    }).eq('stripe_customer_id', sub.customer as string)
  }

  if (event.type === 'invoice.payment_failed') {
    const inv = event.data.object as Stripe.Invoice
    await admin.from('users').update({ subscription_status: 'past_due' })
      .eq('stripe_customer_id', inv.customer as string)
  }

  if (event.type === 'invoice.payment_succeeded') {
    const inv = event.data.object as Stripe.Invoice
    if (inv.subscription) {
      await admin.from('users').update({ subscription_status: 'active' })
        .eq('stripe_customer_id', inv.customer as string)
    }
  }
```

Also add `STRIPE_PRO_PRICE_ID` to `.env.local.example` (if it exists) — value: `price_pro_monthly_test`.

- [ ] **Step 4: Run the full webhook test suite**

```bash
npx vitest run tests/app/api/stripe/webhook.test.ts
```

Expected: all tests PASS (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe/webhook/route.ts tests/app/api/stripe/webhook.test.ts
git commit -m "feat: subscription lifecycle webhook handlers (created/updated/deleted/payment)"
```

---

## Task 5: Branding Actions

**Files:**
- Create: `lib/actions/branding.ts`
- Create: `tests/lib/actions/branding.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/actions/branding.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'org-1' }
const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

const mockServiceClient = { from: vi.fn() }
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

// Pro gate: mock isProUser
vi.mock('@/lib/pro', () => ({
  isProUser: vi.fn(),
  requirePro: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { saveBrandSettings } from '@/lib/actions/branding'
import { requirePro } from '@/lib/pro'

describe('saveBrandSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    vi.mocked(requirePro).mockResolvedValue(undefined)
  })

  it('redirects to /upgrade when not pro', async () => {
    vi.mocked(requirePro).mockRejectedValue(new Error('REDIRECT:/upgrade'))
    await expect(saveBrandSettings({ hideWatermark: true })).rejects.toThrow('REDIRECT:/upgrade')
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await saveBrandSettings({ hideWatermark: false })
    expect(result.error).toBe('Not authenticated')
  })

  it('saves brand settings for pro user', async () => {
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await saveBrandSettings({
      logoUrl: 'https://example.com/logo.png',
      accentColor: '#ff00ff',
      hideWatermark: true,
    })
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith({
      brand_logo_url: 'https://example.com/logo.png',
      brand_accent_color: '#ff00ff',
      brand_hide_watermark: true,
    })
  })

  it('accepts partial update (only hideWatermark)', async () => {
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await saveBrandSettings({ hideWatermark: false })
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith({
      brand_logo_url: undefined,
      brand_accent_color: undefined,
      brand_hide_watermark: false,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/actions/branding.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/actions/branding.ts`**

```typescript
// lib/actions/branding.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePro } from '@/lib/pro'

interface BrandPatch {
  logoUrl?: string
  accentColor?: string
  hideWatermark: boolean
}

export async function saveBrandSettings(patch: BrandPatch): Promise<{ error?: string }> {
  await requirePro()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin.from('users').update({
    brand_logo_url: patch.logoUrl,
    brand_accent_color: patch.accentColor,
    brand_hide_watermark: patch.hideWatermark,
  }).eq('id', user.id)

  if (error) return { error: error.message }
  return {}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/actions/branding.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/branding.ts tests/lib/actions/branding.test.ts
git commit -m "feat: saveBrandSettings server action with pro gate"
```

---

## Task 6: Team Actions

**Files:**
- Create: `lib/actions/team.ts`
- Create: `tests/lib/actions/team.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/actions/team.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'org-1' }
const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

const mockServiceClient = {
  from: vi.fn(),
}
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/pro', () => ({
  requirePro: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

// Mock jose for invite JWT signing
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    SignJWT: vi.fn().mockReturnValue({
      setProtectedHeader: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue('mock-invite-token'),
    }),
    jwtVerify: vi.fn(),
  }
})

function makeQuery(result: unknown, extra: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    ...extra,
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { inviteTeamMember, removeTeamMember, acceptTeamInvite } from '@/lib/actions/team'
import { requirePro } from '@/lib/pro'
import { jwtVerify } from 'jose'

describe('inviteTeamMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    vi.mocked(requirePro).mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await inviteTeamMember({ phone: '+15551234567', role: 'door_staff' })
    expect(result.error).toBe('Not authenticated')
  })

  it('creates team member and returns invite token', async () => {
    const insertQuery = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'tm-1' }, error: null }) }
    mockServiceClient.from.mockReturnValue(insertQuery)

    const result = await inviteTeamMember({ phone: '+15551234567', role: 'door_staff' })
    expect(result.error).toBeUndefined()
    expect(result.inviteToken).toBe('mock-invite-token')
  })
})

describe('removeTeamMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    vi.mocked(requirePro).mockResolvedValue(undefined)
  })

  it('deletes the team member row', async () => {
    const deleteQuery = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(deleteQuery)

    const result = await removeTeamMember('tm-1')
    expect(result.error).toBeUndefined()
    expect(deleteQuery.delete).toHaveBeenCalled()
  })
})

describe('acceptTeamInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'member-1' } } })
  })

  it('returns error for invalid token', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid token'))
    const result = await acceptTeamInvite('bad-token')
    expect(result.error).toMatch(/invalid/i)
  })

  it('updates team member row on valid token', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { teamMemberId: 'tm-1', organizerId: 'org-1' } } as any)
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await acceptTeamInvite('valid-token')
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      member_user_id: 'member-1',
      status: 'accepted',
    }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/actions/team.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/actions/team.ts`**

```typescript
// lib/actions/team.ts
'use server'

import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePro } from '@/lib/pro'

const INVITE_EXPIRY = '48h'

function getInviteSecret() {
  return new TextEncoder().encode(process.env.QR_JWT_SECRET!)
}

async function signInviteToken(payload: { teamMemberId: string; organizerId: string }): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(INVITE_EXPIRY)
    .setIssuedAt()
    .sign(getInviteSecret())
}

export async function inviteTeamMember(params: {
  phone: string
  role: 'co_organizer' | 'door_staff'
}): Promise<{ inviteToken?: string; error?: string }> {
  await requirePro()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { data: member, error } = await admin
    .from('team_members')
    .insert({ organizer_id: user.id, invited_phone: params.phone, role: params.role })
    .select('id')
    .single()

  if (error || !member) return { error: error?.message ?? 'Failed to create invite' }

  const inviteToken = await signInviteToken({ teamMemberId: member.id, organizerId: user.id })
  return { inviteToken }
}

export async function removeTeamMember(memberId: string): Promise<{ error?: string }> {
  await requirePro()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('organizer_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function resendInvite(memberId: string): Promise<{ inviteToken?: string; error?: string }> {
  await requirePro()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('team_members')
    .select('id, organizer_id')
    .eq('id', memberId)
    .eq('organizer_id', user.id)
    .single()

  if (!member) return { error: 'Team member not found' }

  const inviteToken = await signInviteToken({ teamMemberId: member.id, organizerId: user.id })
  return { inviteToken }
}

export async function acceptTeamInvite(token: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  let payload: { teamMemberId: string; organizerId: string }
  try {
    const result = await jwtVerify(token, getInviteSecret())
    payload = result.payload as { teamMemberId: string; organizerId: string }
  } catch {
    return { error: 'Invalid or expired invite link' }
  }

  const admin = createServiceClient()
  const { error } = await admin.from('team_members').update({
    member_user_id: user.id,
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  }).eq('id', payload.teamMemberId)

  if (error) return { error: error.message }
  return {}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/actions/team.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/team.ts tests/lib/actions/team.test.ts
git commit -m "feat: team member invite/accept/remove server actions"
```

---

## Task 7: ProGate Client Component

**Files:**
- Create: `components/ProGate.tsx`

- [ ] **Step 1: Implement `components/ProGate.tsx`**

```tsx
// components/ProGate.tsx
'use client'

import { useState } from 'react'
import { createCheckoutSession } from '@/lib/actions/subscription'

interface Props {
  isPro: boolean
  feature: string
  featureDescription: string
  otherFeatures?: string[]
  children: React.ReactNode
}

export function ProGate({ isPro, feature, featureDescription, otherFeatures = [], children }: Props) {
  if (isPro) return <>{children}</>
  return <PaywallSheet feature={feature} featureDescription={featureDescription} otherFeatures={otherFeatures} />
}

function PaywallSheet({ feature, featureDescription, otherFeatures }: Omit<Props, 'isPro' | 'children'>) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const result = await createCheckoutSession()
    if (result.url) {
      window.location.href = result.url
    } else {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
        <span className="text-3xl">🔒</span>
      </div>
      <div className="space-y-2">
        <h2 className="font-headline text-2xl font-bold text-on-surface">Pro feature</h2>
        <p className="text-on-surface-variant text-sm leading-relaxed">{featureDescription}</p>
      </div>
      {otherFeatures.length > 0 && (
        <ul className="text-left space-y-2 w-full max-w-xs">
          {otherFeatures.map(f => (
            <li key={f} className="flex items-center gap-2 text-on-surface-variant text-sm">
              <span className="text-tertiary">✓</span> {f}
            </li>
          ))}
        </ul>
      )}
      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-semibold disabled:opacity-60"
        >
          {loading ? 'Redirecting…' : 'Upgrade to Pro — $19/mo'}
        </button>
        <p className="text-on-surface-variant text-xs">14-day free trial · Cancel anytime</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors related to `components/ProGate.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/ProGate.tsx
git commit -m "feat: ProGate client component with paywall bottom sheet"
```

---

## Task 8: Pro-Gated Routes

**Files:**
- Create: `app/(manage)/upgrade/page.tsx`
- Create: `app/(manage)/subscription/page.tsx`
- Create: `app/(manage)/brand/page.tsx`
- Create: `app/(manage)/team/page.tsx`
- Create: `app/(manage)/team/TeamClient.tsx`
- Create: `app/join-team/[token]/page.tsx`

- [ ] **Step 1: Implement `/upgrade` page**

```tsx
// app/(manage)/upgrade/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createCheckoutSession } from '@/lib/actions/subscription'

export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', user.id)
    .single()

  if (['trialing', 'active'].includes(userData?.subscription_status ?? '')) {
    redirect('/manage/subscription')
  }

  return (
    <main className="px-4 py-6 space-y-8 max-w-md mx-auto">
      <h1 className="font-headline text-3xl font-bold">Go Pro</h1>

      <div className="bg-surface-container-low rounded-2xl p-6 space-y-4 ring-1 ring-primary/30">
        <div className="flex items-baseline gap-1">
          <span className="font-headline text-4xl font-bold text-primary">$19</span>
          <span className="text-on-surface-variant text-sm">/month</span>
        </div>
        <p className="text-on-surface-variant text-sm">14-day free trial · Cancel anytime</p>
        <ul className="space-y-2 text-sm text-on-surface">
          {[
            'Multi-event analytics dashboard',
            'Custom branding + no Spongy watermark',
            'Team seats (door staff + co-organizers)',
            'DJ payout via Stripe Connect',
            'Priority support',
          ].map(f => (
            <li key={f} className="flex gap-2"><span className="text-tertiary">✓</span>{f}</li>
          ))}
        </ul>
        <form action={createCheckoutSession}>
          <button
            type="submit"
            className="w-full py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-semibold"
          >
            Start free trial
          </button>
        </form>
      </div>

      <div className="bg-surface-container-low rounded-2xl p-6 space-y-4">
        <p className="font-headline text-lg font-bold">Free</p>
        <ul className="space-y-2 text-sm text-on-surface-variant">
          {[
            'List unlimited free events',
            'Basic per-event analytics',
            'Spongy watermark on recap graphics',
            'Single organizer account',
          ].map(f => (
            <li key={f} className="flex gap-2"><span>·</span>{f}</li>
          ))}
        </ul>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Implement `/manage/subscription` page**

```tsx
// app/(manage)/subscription/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createBillingPortalSession } from '@/lib/actions/subscription'
import { Chip } from '@/components/ui/Chip'

export default async function SubscriptionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status, subscription_period_end')
    .eq('id', user.id)
    .single()

  const status = userData?.subscription_status ?? 'free'
  const periodEnd = userData?.subscription_period_end
    ? new Date(userData.subscription_period_end).toLocaleDateString()
    : null

  return (
    <main className="px-4 py-6 space-y-6">
      <h1 className="font-headline text-2xl font-bold">Subscription</h1>

      <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-on-surface-variant text-sm uppercase tracking-wider">Current plan</span>
          <StatusChip status={status} />
        </div>
        {periodEnd && (
          <p className="text-on-surface-variant text-xs">
            {status === 'trialing' ? 'Trial ends' : status === 'canceled' ? 'Access until' : 'Renews'}: {periodEnd}
          </p>
        )}
      </div>

      {status === 'free' && (
        <a href="/upgrade" className="block w-full py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-semibold text-center">
          Upgrade to Pro
        </a>
      )}

      {status !== 'free' && (
        <form action={createBillingPortalSession}>
          <button type="submit" className="w-full py-3 rounded-full border border-outline/30 text-on-surface font-label font-semibold">
            Manage billing →
          </button>
        </form>
      )}
    </main>
  )
}

function StatusChip({ status }: { status: string }) {
  if (status === 'active') return <Chip variant="live">PRO · ACTIVE</Chip>
  if (status === 'trialing') return <Chip variant="pending">PRO · TRIAL</Chip>
  if (status === 'past_due') return <Chip variant="played">PAST DUE</Chip>
  if (status === 'canceled') return <Chip variant="played">CANCELED</Chip>
  return <Chip variant="played">FREE</Chip>
}
```

- [ ] **Step 3: Implement `/manage/brand` page**

```tsx
// app/(manage)/brand/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isProUser } from '@/lib/pro'
import { ProGate } from '@/components/ProGate'
import { saveBrandSettings } from '@/lib/actions/branding'

export default async function BrandPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [isPro, { data: userData }] = await Promise.all([
    isProUser(user.id),
    supabase.from('users').select('brand_logo_url, brand_accent_color, brand_hide_watermark').eq('id', user.id).single(),
  ])

  return (
    <main className="px-4 py-6 space-y-6">
      <h1 className="font-headline text-2xl font-bold">Brand Settings</h1>
      <ProGate
        isPro={isPro}
        feature="Custom Branding"
        featureDescription="Add your own logo and colors to event pages and recap graphics. Remove the Spongy watermark."
        otherFeatures={['Multi-event analytics', 'Team seats', 'DJ payouts']}
      >
        <form action={saveBrandSettings} className="space-y-6">
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <p className="text-on-surface-variant text-xs uppercase tracking-wider">Logo URL</p>
            <input
              name="logoUrl"
              type="url"
              defaultValue={userData?.brand_logo_url ?? ''}
              placeholder="https://example.com/logo.png"
              className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <p className="text-on-surface-variant text-xs uppercase tracking-wider">Accent Color</p>
            <input
              name="accentColor"
              type="text"
              defaultValue={userData?.brand_accent_color ?? ''}
              placeholder="#BC13FE"
              className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-on-surface text-sm">Hide Spongy watermark</p>
              <p className="text-on-surface-variant text-xs">Remove "Made with Spongy" from recap graphics</p>
            </div>
            <input type="checkbox" name="hideWatermark" defaultChecked={userData?.brand_hide_watermark ?? false} className="accent-primary" />
          </div>
          <button type="submit" className="w-full py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-semibold">
            Save
          </button>
        </form>
      </ProGate>
    </main>
  )
}
```

- [ ] **Step 4: Implement `/manage/team` page and TeamClient**

```tsx
// app/(manage)/team/TeamClient.tsx
'use client'

import { useState } from 'react'
import { inviteTeamMember, removeTeamMember } from '@/lib/actions/team'

interface Member {
  id: string
  invited_phone: string
  role: string
  status: string
  member_user_id: string | null
}

export function TeamClient({ members }: { members: Member[] }) {
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'door_staff' | 'co_organizer'>('door_staff')
  const [error, setError] = useState('')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const result = await inviteTeamMember({ phone, role })
    if (result.error) { setError(result.error); return }
    setPhone('')
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleInvite} className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <p className="text-on-surface-variant text-xs uppercase tracking-wider">Invite Member</p>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          type="tel"
          placeholder="+1 (555) 000-0000"
          className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value as typeof role)}
          className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none"
        >
          <option value="door_staff">Door Staff</option>
          <option value="co_organizer">Co-Organizer</option>
        </select>
        {error && <p className="text-error text-xs">{error}</p>}
        <button type="submit" className="w-full py-2 rounded-full bg-primary text-on-primary font-label font-semibold text-sm">
          Send Invite
        </button>
      </form>

      <div className="space-y-2">
        {members.map(m => (
          <div key={m.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-on-surface text-sm font-semibold">{m.invited_phone}</p>
              <p className="text-on-surface-variant text-xs">{m.role.replace('_', ' ')} · {m.status}</p>
            </div>
            <form action={removeTeamMember.bind(null, m.id)}>
              <button type="submit" className="text-error text-xs font-label">Remove</button>
            </form>
          </div>
        ))}
        {members.length === 0 && <p className="text-on-surface-variant text-sm text-center py-4">No team members yet.</p>}
      </div>
    </div>
  )
}
```

```tsx
// app/(manage)/team/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isProUser } from '@/lib/pro'
import { ProGate } from '@/components/ProGate'
import { TeamClient } from './TeamClient'

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [isPro, { data: members }] = await Promise.all([
    isProUser(user.id),
    supabase.from('team_members').select('id, invited_phone, role, status, member_user_id').eq('organizer_id', user.id),
  ])

  return (
    <main className="px-4 py-6 space-y-6">
      <h1 className="font-headline text-2xl font-bold">Your Team</h1>
      <ProGate
        isPro={isPro}
        feature="Team Seats"
        featureDescription="Invite door staff and co-organizers to help run your events."
        otherFeatures={['Custom branding', 'Multi-event analytics', 'DJ payouts']}
      >
        <TeamClient members={members ?? []} />
      </ProGate>
    </main>
  )
}
```

- [ ] **Step 5: Implement `/join-team/[token]` page**

```tsx
// app/join-team/[token]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { acceptTeamInvite } from '@/lib/actions/team'

export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/join-team/${token}`)

  const result = await acceptTeamInvite(token)

  if (result.error) {
    return (
      <main className="px-4 py-6 text-center space-y-4">
        <h1 className="font-headline text-2xl font-bold text-error">Invite Invalid</h1>
        <p className="text-on-surface-variant text-sm">{result.error}</p>
        <a href="/explore" className="text-secondary text-sm">Go home →</a>
      </main>
    )
  }

  redirect('/explore')
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add app/(manage)/upgrade/page.tsx app/(manage)/subscription/page.tsx \
        app/(manage)/brand/page.tsx app/(manage)/team/page.tsx \
        app/(manage)/team/TeamClient.tsx app/join-team/[token]/page.tsx \
        components/ProGate.tsx
git commit -m "feat: upgrade, subscription, brand, team, and join-team routes"
```

---

## Task 9: Layout Banner + Recap Branding

**Files:**
- Modify: `app/(manage)/layout.tsx`
- Modify: `app/api/events/[id]/recap/route.tsx`

- [ ] **Step 1: Add upgrade banner to manage layout**

Read `app/(manage)/layout.tsx`. After the `const user = ...` auth check, add a subscription status fetch and render a banner. Insert this block before the `return`:

```tsx
  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', user.id)
    .single()

  const isFree = !['trialing', 'active'].includes(userData?.subscription_status ?? 'free')
```

Then inside the returned JSX, add above the main content slot:

```tsx
  {isFree && (
    <a href="/upgrade" className="block w-full bg-primary/10 text-center text-primary text-xs font-label font-semibold py-2">
      ✦ Upgrade to Pro — unlock custom branding, team seats & more →
    </a>
  )}
```

- [ ] **Step 2: Read branding fields in recap route**

In `app/api/events/[id]/recap/route.tsx`, find where the organizer's data is fetched. Add `brand_logo_url, brand_hide_watermark` to the select:

```typescript
  const { data: organizer } = await supabase
    .from('users')
    .select('brand_logo_url, brand_hide_watermark')
    .eq('id', event.organizer_id)
    .single()
```

Then in the Satori JSX, conditionally render the footer:

```tsx
  {!(organizer?.brand_hide_watermark) && (
    <div style={{ fontSize: 12, color: '#acaab1' }}>Made with Spongy</div>
  )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests pass + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/(manage)/layout.tsx app/api/events/[id]/recap/route.tsx
git commit -m "feat: pro upgrade banner in manage layout; branding fields in recap graphic"
```

---

## Task 10: Final Track A Verification

- [ ] **Step 1: Run the complete test suite**

```bash
npx vitest run
```

Expected: all tests pass. Count should be ≥ 102 (baseline) + new Track A tests.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Phase 4 Track A complete — Pro subscriptions, branding, team seats"
```
