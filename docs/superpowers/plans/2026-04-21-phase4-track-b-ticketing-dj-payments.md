# Phase 4 Track B: Advanced Ticketing & DJ Payments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add waitlists, ticket transfers, organizer-approved refunds, and DJ Stripe Connect payouts to Spongy.

**Architecture:** Three new server action modules (`waitlist.ts`, `transfers.ts`, `refunds.ts`, `dj-payouts.ts`) each own their feature area and are independently testable. `transfers.ts` reuses the `jose` HMAC-HS256 JWT pattern already in use for QR codes. `lib/actions/tips.ts` is modified to route to a DJ's Connect account when one is onboarded. New attendee routes extend the existing `/e/[code]` and `/live/[eventId]` pages. The organizer `/manage/events/[id]` page gets a refund-count badge. DJ payouts live under a new `/studio/payouts` route.

**Tech Stack:** Next.js App Router server actions, Supabase Postgres + service client, `jose` for transfer JWTs (same secret as QR), Stripe Connect transfers/payouts API, vitest + `vi.mock` for tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/012_phase4_ticketing.sql` | Create | `waitlist`, `ticket_transfers`, `refund_requests` tables; add `transferred` to rsvps status |
| `lib/actions/waitlist.ts` | Create | `joinWaitlist`, `leaveWaitlist`, `notifyWaitlist` |
| `lib/actions/transfers.ts` | Create | `initiateTransfer`, `cancelTransfer`, `claimTransfer` |
| `lib/actions/refunds.ts` | Create | `requestRefund`, `approveRefund`, `denyRefund` |
| `lib/actions/dj-payouts.ts` | Create | `getDjPayoutHistory`, `requestDjPayout` |
| `lib/actions/tips.ts` | Modify | Route tip PaymentIntent to DJ Connect when DJ is onboarded |
| `app/(attendee)/e/[code]/page.tsx` | Modify | Pass `soldOut` and `waitlistPosition` props; detect all tiers sold out |
| `app/(attendee)/e/[code]/EventPageClient.tsx` | Modify | Sold-out state renders "Join Waitlist" CTA linking to `/e/[code]/waitlist` |
| `app/(attendee)/e/[code]/waitlist/page.tsx` | Create | Waitlist join/leave page |
| `app/(attendee)/tickets/[rsvpId]/transfer/page.tsx` | Create | Initiate ticket transfer — enter recipient phone |
| `app/claim/[token]/page.tsx` | Create | Accept transferred ticket — validates JWT, creates new RSVP |
| `app/(manage)/events/[id]/refunds/page.tsx` | Create | Organizer refund queue — approve/deny pending requests |
| `app/(manage)/events/[id]/page.tsx` | Modify | Add refund pending count badge chip |
| `app/(dj)/studio/payouts/page.tsx` | Create | DJ Stripe Connect onboarding + payout history |
| `tests/lib/actions/waitlist.test.ts` | Create | Tests for join/leave/notify |
| `tests/lib/actions/transfers.test.ts` | Create | Tests for initiate/cancel/claim including JWT expiry rejection |
| `tests/lib/actions/refunds.test.ts` | Create | Tests for request/approve/deny, policy window guard |
| `tests/lib/actions/dj-payouts.test.ts` | Create | Tests for getDjPayoutHistory + requestDjPayout |
| `tests/lib/actions/tips.test.ts` | Modify | Add DJ-routing test cases |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/012_phase4_ticketing.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/012_phase4_ticketing.sql

-- Attendees waiting for a sold-out ticket tier
CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id     UUID REFERENCES ticket_tiers(id),
  position    INTEGER NOT NULL,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_own_read" ON waitlist FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "waitlist_own_insert" ON waitlist FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "waitlist_own_delete" ON waitlist FOR DELETE
  USING (user_id = auth.uid());

-- Ticket transfers (JWT one-time claim links)
CREATE TABLE IF NOT EXISTS ticket_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id         UUID NOT NULL REFERENCES rsvps(id),
  from_user_id    UUID NOT NULL REFERENCES users(id),
  recipient_phone TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'claimed', 'expired', 'cancelled')),
  expires_at      TIMESTAMPTZ NOT NULL,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfers_from_user_read" ON ticket_transfers FOR SELECT
  USING (from_user_id = auth.uid());

-- Organizer-approved refund requests
CREATE TABLE IF NOT EXISTS refund_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id          UUID NOT NULL REFERENCES rsvps(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  reason           TEXT NOT NULL,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'denied')),
  stripe_refund_id TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refund_requests_own_read" ON refund_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "refund_requests_own_insert" ON refund_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Add 'transferred' to valid rsvps status values
-- Postgres CHECK constraint must be dropped and re-added
DO $$
BEGIN
  -- Remove the old check constraint if it exists
  ALTER TABLE rsvps DROP CONSTRAINT IF EXISTS rsvps_status_check;
  -- Re-add including 'transferred'
  ALTER TABLE rsvps ADD CONSTRAINT rsvps_status_check
    CHECK (status IN ('rsvpd', 'paid', 'checked_in', 'refunded', 'cancelled', 'transferred'));
END $$;
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
npx supabase db reset
```

Expected: migration applies without error; `waitlist`, `ticket_transfers`, `refund_requests` tables exist; `rsvps_status_check` constraint includes `transferred`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_phase4_ticketing.sql
git commit -m "feat: migration 012 — waitlist, ticket_transfers, refund_requests tables"
```

---

## Task 2: Waitlist Actions

**Files:**
- Create: `lib/actions/waitlist.ts`
- Create: `tests/lib/actions/waitlist.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/actions/waitlist.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'attendee-1' }
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

function makeQuery(result: unknown, extra: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    ...extra,
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { joinWaitlist, leaveWaitlist } from '@/lib/actions/waitlist'

describe('joinWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await joinWaitlist({ eventId: 'event-1' })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when already on waitlist', async () => {
    // max position query
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { position: 2 }, error: null }))
    // insert fails with unique constraint
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } }),
    }
    mockServiceClient.from.mockReturnValueOnce(insertQuery)

    const result = await joinWaitlist({ eventId: 'event-1' })
    expect(result.error).toMatch(/already/i)
  })

  it('returns position on success', async () => {
    // max position query
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { position: 3 }, error: null }))
    // insert success
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { position: 4 }, error: null }),
    }
    mockServiceClient.from.mockReturnValueOnce(insertQuery)

    const result = await joinWaitlist({ eventId: 'event-1' })
    expect(result.error).toBeUndefined()
    expect(result.position).toBe(4)
  })
})

describe('leaveWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await leaveWaitlist('event-1')
    expect(result.error).toBe('Not authenticated')
  })

  it('removes waitlist row', async () => {
    const deleteQuery = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r),
    }
    mockServiceClient.from.mockReturnValue(deleteQuery)

    const result = await leaveWaitlist('event-1')
    expect(result.error).toBeUndefined()
    expect(deleteQuery.delete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/actions/waitlist.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/actions/waitlist.ts`**

```typescript
// lib/actions/waitlist.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function joinWaitlist(params: {
  eventId: string
  tierId?: string
}): Promise<{ position?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  // Determine next position
  const { data: maxRow } = await admin
    .from('waitlist')
    .select('position')
    .eq('event_id', params.eventId)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const nextPosition = (maxRow?.position ?? 0) + 1

  const { data: entry, error } = await admin
    .from('waitlist')
    .insert({
      event_id: params.eventId,
      user_id: user.id,
      tier_id: params.tierId ?? null,
      position: nextPosition,
    })
    .select('position')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Already on waitlist for this event' }
    return { error: error.message }
  }

  return { position: entry.position }
}

export async function leaveWaitlist(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin
    .from('waitlist')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function notifyWaitlist(eventId: string, tierId?: string): Promise<void> {
  const admin = createServiceClient()

  const query = admin
    .from('waitlist')
    .select('id, user_id, position')
    .eq('event_id', eventId)
    .is('notified_at', null)
    .order('position', { ascending: true })
    .limit(1)

  if (tierId) (query as any).eq('tier_id', tierId)

  const { data: entry } = await query.single()
  if (!entry) return

  await admin.from('waitlist').update({ notified_at: new Date().toISOString() }).eq('id', entry.id)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/actions/waitlist.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/waitlist.ts tests/lib/actions/waitlist.test.ts
git commit -m "feat: joinWaitlist + leaveWaitlist + notifyWaitlist server actions"
```

---

## Task 3: Transfer Actions

**Files:**
- Create: `lib/actions/transfers.ts`
- Create: `tests/lib/actions/transfers.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/actions/transfers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'attendee-1' }
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

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    SignJWT: vi.fn().mockReturnValue({
      setProtectedHeader: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue('mock-transfer-token'),
    }),
    jwtVerify: vi.fn(),
  }
})

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { initiateTransfer, cancelTransfer, claimTransfer } from '@/lib/actions/transfers'
import { jwtVerify } from 'jose'

describe('initiateTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await initiateTransfer({ rsvpId: 'rsvp-1', recipientPhone: '+15550000001' })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when RSVP not owned by user', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: null, error: { message: 'not found' } })
    )
    const result = await initiateTransfer({ rsvpId: 'rsvp-1', recipientPhone: '+15550000001' })
    expect(result.error).toBeDefined()
  })

  it('returns error when RSVP status is not paid or checked_in', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { id: 'rsvp-1', status: 'rsvpd', event_id: 'event-1' }, error: null })
    )
    const result = await initiateTransfer({ rsvpId: 'rsvp-1', recipientPhone: '+15550000001' })
    expect(result.error).toMatch(/paid.*ticket/i)
  })

  it('returns transfer token on success', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { id: 'rsvp-1', status: 'paid', event_id: 'event-1' }, error: null })
    )
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'transfer-1' }, error: null }),
    }
    mockServiceClient.from.mockReturnValue(insertQuery)

    const result = await initiateTransfer({ rsvpId: 'rsvp-1', recipientPhone: '+15550000001' })
    expect(result.error).toBeUndefined()
    expect(result.token).toBe('mock-transfer-token')
  })
})

describe('cancelTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('sets transfer status to cancelled', async () => {
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await cancelTransfer('transfer-1')
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith({ status: 'cancelled' })
  })
})

describe('claimTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'recipient-1' } } })
  })

  it('returns error for invalid JWT', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('invalid'))
    const result = await claimTransfer('bad-token')
    expect(result.error).toMatch(/invalid/i)
  })

  it('returns error when transfer not pending', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { transferId: 'transfer-1', rsvpId: 'rsvp-1' },
    } as any)
    mockServiceClient.from.mockReturnValue(
      makeQuery({ data: { id: 'transfer-1', status: 'claimed', rsvp_id: 'rsvp-1' }, error: null })
    )
    const result = await claimTransfer('valid-token')
    expect(result.error).toMatch(/already/i)
  })

  it('creates new RSVP and marks original as transferred on success', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { transferId: 'transfer-1', rsvpId: 'rsvp-1' },
    } as any)

    // 1. Fetch transfer row
    const transferRow = { id: 'transfer-1', status: 'pending', rsvp_id: 'rsvp-1' }
    // 2. Fetch original RSVP
    const rsvpRow = { id: 'rsvp-1', event_id: 'event-1', tier_id: 'tier-1', status: 'paid' }
    // 3. Insert new RSVP → returns new rsvp with qr_jwt
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'rsvp-new', qr_jwt: 'qr-new' }, error: null }),
    }
    // 4 & 5. Updates (original RSVP + transfer status)
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: transferRow, error: null })) // fetch transfer
      .mockReturnValueOnce(makeQuery({ data: rsvpRow, error: null }))     // fetch original rsvp
      .mockReturnValueOnce(insertQuery)                                   // insert new rsvp
      .mockReturnValueOnce(updateQuery)                                   // update original rsvp status
      .mockReturnValueOnce(updateQuery)                                   // update transfer status

    const result = await claimTransfer('valid-token')
    expect(result.error).toBeUndefined()
    expect(result.qrJwt).toBe('qr-new')
    expect(insertQuery.insert).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/actions/transfers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/actions/transfers.ts`**

```typescript
// lib/actions/transfers.ts
'use server'

import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const TRANSFER_EXPIRY = '24h'

function getTransferSecret() {
  return new TextEncoder().encode(process.env.QR_JWT_SECRET!)
}

async function signTransferToken(payload: { transferId: string; rsvpId: string }): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(TRANSFER_EXPIRY)
    .setIssuedAt()
    .sign(getTransferSecret())
}

export async function initiateTransfer(params: {
  rsvpId: string
  recipientPhone: string
}): Promise<{ token?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: rsvp, error: rsvpError } = await supabase
    .from('rsvps')
    .select('id, status, event_id')
    .eq('id', params.rsvpId)
    .eq('user_id', user.id)
    .single()

  if (rsvpError || !rsvp) return { error: rsvpError?.message ?? 'RSVP not found' }
  if (!['paid', 'checked_in'].includes(rsvp.status)) {
    return { error: 'Can only transfer a paid ticket' }
  }

  const token = await signTransferToken({ transferId: 'pending', rsvpId: params.rsvpId })
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const admin = createServiceClient()
  const { data: transfer, error: insertError } = await admin
    .from('ticket_transfers')
    .insert({
      rsvp_id: params.rsvpId,
      from_user_id: user.id,
      recipient_phone: params.recipientPhone,
      token,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (insertError || !transfer) return { error: insertError?.message ?? 'Transfer creation failed' }

  return { token }
}

export async function cancelTransfer(transferId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin
    .from('ticket_transfers')
    .update({ status: 'cancelled' })
    .eq('id', transferId)
    .eq('from_user_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function claimTransfer(token: string): Promise<{ qrJwt?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  let payload: { transferId: string; rsvpId: string }
  try {
    const result = await jwtVerify(token, getTransferSecret())
    payload = result.payload as { transferId: string; rsvpId: string }
  } catch {
    return { error: 'Invalid or expired transfer link' }
  }

  const admin = createServiceClient()

  const { data: transfer, error: transferErr } = await admin
    .from('ticket_transfers')
    .select('id, status, rsvp_id')
    .eq('token', token)
    .single()

  if (transferErr || !transfer) return { error: 'Transfer not found' }
  if (transfer.status !== 'pending') return { error: 'Transfer already claimed or cancelled' }

  const { data: originalRsvp, error: rsvpErr } = await admin
    .from('rsvps')
    .select('id, event_id, tier_id, status')
    .eq('id', payload.rsvpId)
    .single()

  if (rsvpErr || !originalRsvp) return { error: 'Original ticket not found' }

  const { data: newRsvp, error: newRsvpErr } = await admin
    .from('rsvps')
    .insert({
      event_id: originalRsvp.event_id,
      user_id: user.id,
      tier_id: originalRsvp.tier_id,
      status: 'paid',
      qr_jwt: crypto.randomUUID(),
    })
    .select('id, qr_jwt')
    .single()

  if (newRsvpErr || !newRsvp) return { error: newRsvpErr?.message ?? 'Failed to create ticket' }

  await admin.from('rsvps').update({ status: 'transferred' }).eq('id', payload.rsvpId)
  await admin.from('ticket_transfers').update({ status: 'claimed', claimed_at: new Date().toISOString() }).eq('id', transfer.id)

  return { qrJwt: newRsvp.qr_jwt }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/actions/transfers.test.ts
```

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/transfers.ts tests/lib/actions/transfers.test.ts
git commit -m "feat: initiateTransfer + cancelTransfer + claimTransfer server actions"
```

---

## Task 4: Refund Actions

**Files:**
- Create: `lib/actions/refunds.ts`
- Create: `tests/lib/actions/refunds.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/actions/refunds.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'attendee-1' }
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
    refunds: { create: vi.fn() },
  },
}))

vi.mock('@/lib/actions/waitlist', () => ({
  notifyWaitlist: vi.fn(),
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { requestRefund, approveRefund, denyRefund } from '@/lib/actions/refunds'
import { stripe } from '@/lib/stripe'
import { notifyWaitlist } from '@/lib/actions/waitlist'

describe('requestRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await requestRefund({ rsvpId: 'rsvp-1', reason: 'cant make it' })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when RSVP not owned by user', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: null, error: { message: 'not found' } })
    )
    const result = await requestRefund({ rsvpId: 'rsvp-1', reason: 'cant make it' })
    expect(result.error).toBeDefined()
  })

  it('returns error when event starts within 24h', async () => {
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'rsvp-1', status: 'paid', event_id: 'event-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { start_at: soon }, error: null }))
    const result = await requestRefund({ rsvpId: 'rsvp-1', reason: 'cant make it' })
    expect(result.error).toMatch(/24 hours/i)
  })

  it('creates refund request row when event is far enough away', async () => {
    const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'rsvp-1', status: 'paid', event_id: 'event-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { start_at: farFuture }, error: null }))
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      then: (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r),
    }
    mockServiceClient.from.mockReturnValue(insertQuery)

    const result = await requestRefund({ rsvpId: 'rsvp-1', reason: 'cant make it' })
    expect(result.error).toBeUndefined()
    expect(insertQuery.insert).toHaveBeenCalled()
  })
})

describe('approveRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'org-1' } } })
  })

  it('issues Stripe refund and updates RSVP + request status', async () => {
    // 1. Fetch refund request + rsvp + stripe_payment_intent_id
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({
        data: {
          id: 'req-1', rsvp_id: 'rsvp-1', status: 'pending',
          rsvp: { id: 'rsvp-1', stripe_payment_intent_id: 'pi_123', event_id: 'event-1' },
        },
        error: null,
      }))
    vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_123' } as any)
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockServiceClient.from
      .mockReturnValue(updateQuery)
    vi.mocked(notifyWaitlist).mockResolvedValue(undefined)

    const result = await approveRefund('req-1')
    expect(result.error).toBeUndefined()
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_123' })
    expect(notifyWaitlist).toHaveBeenCalledWith('event-1', undefined)
  })

  it('returns error when Stripe refund fails', async () => {
    mockServiceClient.from.mockReturnValueOnce(makeQuery({
      data: {
        id: 'req-1', rsvp_id: 'rsvp-1', status: 'pending',
        rsvp: { id: 'rsvp-1', stripe_payment_intent_id: 'pi_123', event_id: 'event-1' },
      },
      error: null,
    }))
    vi.mocked(stripe.refunds.create).mockRejectedValue(new Error('Card declined'))

    const result = await approveRefund('req-1')
    expect(result.error).toMatch(/Card declined/)
  })
})

describe('denyRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'org-1' } } })
  })

  it('sets request status to denied', async () => {
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await denyRefund('req-1')
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/actions/refunds.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/actions/refunds.ts`**

```typescript
// lib/actions/refunds.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'
import { notifyWaitlist } from '@/lib/actions/waitlist'

const POLICY_WINDOW_MS = 24 * 60 * 60 * 1000

export async function requestRefund(params: {
  rsvpId: string
  reason: string
  note?: string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: rsvp, error: rsvpErr } = await supabase
    .from('rsvps')
    .select('id, status, event_id')
    .eq('id', params.rsvpId)
    .eq('user_id', user.id)
    .single()

  if (rsvpErr || !rsvp) return { error: rsvpErr?.message ?? 'Ticket not found' }
  if (!['paid', 'checked_in'].includes(rsvp.status)) {
    return { error: 'Only paid tickets can be refunded' }
  }

  const { data: event } = await supabase
    .from('events')
    .select('start_at')
    .eq('id', rsvp.event_id)
    .single()

  if (!event) return { error: 'Event not found' }

  const msUntilEvent = new Date(event.start_at).getTime() - Date.now()
  if (msUntilEvent < POLICY_WINDOW_MS) {
    return { error: 'Refunds are not available within 24 hours of the event' }
  }

  const admin = createServiceClient()
  const { error: insertErr } = await admin.from('refund_requests').insert({
    rsvp_id: params.rsvpId,
    user_id: user.id,
    reason: params.reason,
    note: params.note ?? null,
  })

  if (insertErr) return { error: insertErr.message }
  return {}
}

export async function approveRefund(requestId: string): Promise<{ error?: string }> {
  const admin = createServiceClient()

  const { data: req, error: reqErr } = await admin
    .from('refund_requests')
    .select('id, rsvp_id, status, rsvp:rsvps(id, stripe_payment_intent_id, event_id, tier_id)')
    .eq('id', requestId)
    .single()

  if (reqErr || !req) return { error: reqErr?.message ?? 'Request not found' }

  const rsvp = Array.isArray(req.rsvp) ? req.rsvp[0] : req.rsvp
  if (!rsvp?.stripe_payment_intent_id) return { error: 'No payment intent to refund' }

  let refundId: string
  try {
    const refund = await stripe.refunds.create({ payment_intent: rsvp.stripe_payment_intent_id })
    refundId = refund.id
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Stripe refund failed' }
  }

  await admin.from('rsvps').update({ status: 'refunded' }).eq('id', req.rsvp_id)
  await admin.from('refund_requests').update({
    status: 'approved',
    stripe_refund_id: refundId,
    resolved_at: new Date().toISOString(),
  }).eq('id', requestId)

  await notifyWaitlist(rsvp.event_id, rsvp.tier_id ?? undefined)

  return {}
}

export async function denyRefund(requestId: string): Promise<{ error?: string }> {
  const admin = createServiceClient()
  const { error } = await admin.from('refund_requests').update({
    status: 'denied',
    resolved_at: new Date().toISOString(),
  }).eq('id', requestId)

  if (error) return { error: error.message }
  return {}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/actions/refunds.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/refunds.ts tests/lib/actions/refunds.test.ts
git commit -m "feat: requestRefund + approveRefund + denyRefund server actions"
```

---

## Task 5: DJ Payout Actions + Tip Routing

**Files:**
- Create: `lib/actions/dj-payouts.ts`
- Create: `tests/lib/actions/dj-payouts.test.ts`
- Modify: `lib/actions/tips.ts`
- Modify: `tests/lib/actions/tips.test.ts`

- [ ] **Step 1: Write failing tests for DJ payouts**

```typescript
// tests/lib/actions/dj-payouts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'dj-1' }
const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    transfers: { list: vi.fn() },
    payouts: {
      list: vi.fn(),
      create: vi.fn(),
    },
  },
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { getDjPayoutHistory, requestDjPayout } from '@/lib/actions/dj-payouts'
import { stripe } from '@/lib/stripe'

describe('getDjPayoutHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await getDjPayoutHistory()
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when Stripe Connect not onboarded', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_account_id: null, stripe_connect_onboarded: false }, error: null })
    )
    const result = await getDjPayoutHistory()
    expect(result.error).toMatch(/not connected/i)
  })

  it('returns combined transfers and payouts list', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_account_id: 'acct_dj1', stripe_connect_onboarded: true }, error: null })
    )
    vi.mocked(stripe.transfers.list).mockResolvedValue({
      data: [{ id: 'tr_1', amount: 5000, created: 1700000000 }],
    } as any)
    vi.mocked(stripe.payouts.list).mockResolvedValue({
      data: [{ id: 'po_1', amount: 4700, created: 1700000100, status: 'paid' }],
    } as any)

    const result = await getDjPayoutHistory()
    expect(result.error).toBeUndefined()
    expect(result.transfers).toHaveLength(1)
    expect(result.payouts).toHaveLength(1)
  })
})

describe('requestDjPayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not onboarded', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_account_id: null, stripe_connect_onboarded: false }, error: null })
    )
    const result = await requestDjPayout()
    expect(result.error).toMatch(/not connected/i)
  })

  it('creates a Stripe payout on the connected account', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_account_id: 'acct_dj1', stripe_connect_onboarded: true }, error: null })
    )
    vi.mocked(stripe.payouts.create).mockResolvedValue({ id: 'po_new', status: 'pending' } as any)

    const result = await requestDjPayout()
    expect(result.error).toBeUndefined()
    expect(stripe.payouts.create).toHaveBeenCalledWith(
      { currency: 'usd', method: 'instant' },
      { stripeAccount: 'acct_dj1' }
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/actions/dj-payouts.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/actions/dj-payouts.ts`**

```typescript
// lib/actions/dj-payouts.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function getDjPayoutHistory(): Promise<{
  transfers?: Stripe.Transfer[]
  payouts?: Stripe.Payout[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_onboarded')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_connect_account_id || !userData.stripe_connect_onboarded) {
    return { error: 'Stripe not connected. Complete onboarding first.' }
  }

  const accountId = userData.stripe_connect_account_id

  const [transfersResult, payoutsResult] = await Promise.all([
    stripe.transfers.list({ destination: accountId, limit: 50 }),
    stripe.payouts.list({ limit: 50 }, { stripeAccount: accountId }),
  ])

  return {
    transfers: transfersResult.data,
    payouts: payoutsResult.data,
  }
}

export async function requestDjPayout(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_onboarded')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_connect_account_id || !userData.stripe_connect_onboarded) {
    return { error: 'Stripe not connected. Complete onboarding first.' }
  }

  try {
    await stripe.payouts.create(
      { currency: 'usd', method: 'instant' },
      { stripeAccount: userData.stripe_connect_account_id }
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Payout failed' }
  }

  return {}
}
```

Add the Stripe type import at the top of the file — `import type Stripe from 'stripe'`.

The full top of the file should be:

```typescript
// lib/actions/dj-payouts.ts
'use server'

import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
```

- [ ] **Step 4: Run DJ payout tests to verify they pass**

```bash
npx vitest run tests/lib/actions/dj-payouts.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Add DJ tip routing tests to `tests/lib/actions/tips.test.ts`**

Open `tests/lib/actions/tips.test.ts`. The existing mock of `@/lib/stripe` mocks `paymentIntents.create`. Add these two tests at the end of the `describe('submitTip', ...)` block:

```typescript
  it('routes tip to DJ Connect account when DJ is onboarded', async () => {
    // event has dj_id set
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1', dj_id: 'dj-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { tips_enabled: true, min_tip_cents: 100, organizer_id: 'org-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { status: 'checked_in' }, error: null }))
    // DJ is onboarded
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { stripe_connect_account_id: 'acct_dj1', stripe_connect_onboarded: true }, error: null }))
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ client_secret: 'pi_dj_secret' } as any)

    const result = await submitTip({ requestId: 'req-1', amountCents: 200 })
    expect(result.clientSecret).toBe('pi_dj_secret')
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ transfer_data: { destination: 'acct_dj1' } })
    )
  })

  it('falls back to organizer Connect account when DJ is not onboarded', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1', dj_id: 'dj-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { tips_enabled: true, min_tip_cents: 100, organizer_id: 'org-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { status: 'checked_in' }, error: null }))
    // DJ not onboarded → fall back to organizer
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { stripe_connect_account_id: 'acct_dj1', stripe_connect_onboarded: false }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { stripe_connect_account_id: 'acct_org' }, error: null }))
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ client_secret: 'pi_org_secret' } as any)

    const result = await submitTip({ requestId: 'req-1', amountCents: 200 })
    expect(result.clientSecret).toBe('pi_org_secret')
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ transfer_data: { destination: 'acct_org' } })
    )
  })
```

- [ ] **Step 6: Run tip tests to verify new tests fail**

```bash
npx vitest run tests/lib/actions/tips.test.ts
```

Expected: the 2 new DJ-routing tests FAIL; existing 5 pass.

- [ ] **Step 7: Update `lib/actions/tips.ts` for DJ routing**

Replace the organizer lookup block (lines 47–54 in the original file) with the following logic. The full updated section from the RSVP status check to the `paymentIntents.create` call:

```typescript
  if (rsvp?.status !== 'checked_in') return { error: 'Must be checked in to tip' }

  const admin = createServiceClient()

  // Route to DJ Connect account when onboarded; fall back to organizer
  let destinationAccountId: string | null = null

  if (request.dj_id) {
    const { data: dj } = await admin
      .from('users')
      .select('stripe_connect_account_id, stripe_connect_onboarded')
      .eq('id', request.dj_id)
      .single()
    if (dj?.stripe_connect_onboarded && dj.stripe_connect_account_id) {
      destinationAccountId = dj.stripe_connect_account_id
    }
  }

  if (!destinationAccountId) {
    const { data: organizer } = await admin
      .from('users')
      .select('stripe_connect_account_id')
      .eq('id', event.organizer_id)
      .single()
    destinationAccountId = organizer?.stripe_connect_account_id ?? null
  }

  if (!destinationAccountId) return { error: 'Organizer Stripe not connected' }

  const applicationFee = Math.floor(amountCents * 0.03) + 99
```

Also update the `song_requests` select to include `dj_id` (it's on the event, not the request). Actually, `dj_id` is on the `events` table. Update the event select:

```typescript
  const { data: event } = await supabase
    .from('events')
    .select('tips_enabled, min_tip_cents, organizer_id, dj_id')
    .eq('id', request.event_id)
    .single()
```

And remove the old organizer lookup block since it's replaced by the DJ-routing block above.

- [ ] **Step 8: Run all tip tests to verify they pass**

```bash
npx vitest run tests/lib/actions/tips.test.ts
```

Expected: all 7 tests (5 original + 2 new) PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/actions/dj-payouts.ts tests/lib/actions/dj-payouts.test.ts \
        lib/actions/tips.ts tests/lib/actions/tips.test.ts
git commit -m "feat: DJ payout actions + DJ tip routing in submitTip"
```

---

## Task 6: Waitlist & Transfer Attendee Routes

**Files:**
- Modify: `app/(attendee)/e/[code]/page.tsx`
- Modify: `app/(attendee)/e/[code]/EventPageClient.tsx`
- Create: `app/(attendee)/e/[code]/waitlist/page.tsx`
- Create: `app/(attendee)/tickets/[rsvpId]/transfer/page.tsx`
- Create: `app/claim/[token]/page.tsx`

- [ ] **Step 1: Pass sold-out state from event server page**

In `app/(attendee)/e/[code]/page.tsx`, after the `tiers` fetch, add:

```typescript
  const allTiersSoldOut = tiers.length > 0 && tiers.every(
    (t) => t.inventory !== null && t.sold_count >= t.inventory
  )
```

Then add `allTiersSoldOut` and the event code to the `EventPageClient` call:

```tsx
  return (
    <EventPageClient
      event={event as any}
      user={user ? { id: user.id } : null}
      hasProfile={hasProfile}
      existingRsvp={existingRsvp}
      rsvpCount={rsvpCount}
      atCapacity={atCapacity}
      appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
      tiers={tiers}
      allTiersSoldOut={allTiersSoldOut}
    />
  )
```

- [ ] **Step 2: Add sold-out waitlist CTA to EventPageClient**

In `app/(attendee)/e/[code]/EventPageClient.tsx`, add `allTiersSoldOut: boolean` to the `EventPageClientProps` type and destructure it in the component.

Then in the `event.rsvp_type === 'paid'` branch, at the top of the tiers list, add a sold-out banner when all tiers are sold out:

```tsx
  {event.rsvp_type === 'paid' && allTiersSoldOut && (
    <div className="px-4 py-4 space-y-3">
      <div className="bg-surface-container rounded-xl p-4 text-center space-y-3">
        <p className="font-headline text-lg font-bold">Sold Out</p>
        <p className="text-on-surface-variant text-sm">All ticket tiers are sold out.</p>
        <a
          href={`/e/${event.event_code}/waitlist`}
          className="block w-full py-3 rounded-full border border-primary text-primary font-label font-semibold text-sm"
        >
          Join Waitlist
        </a>
      </div>
    </div>
  )}
```

Place this block before the existing `!checkoutSecret` tiers list block. Keep the existing tiers list rendering (individual tiers still show as "sold out" per tier).

- [ ] **Step 3: Implement `/e/[code]/waitlist` page**

```tsx
// app/(attendee)/e/[code]/waitlist/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { joinWaitlist, leaveWaitlist } from '@/lib/actions/waitlist'

export default async function WaitlistPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/e/${code}/waitlist`)

  const { data: event } = await supabase
    .from('events')
    .select('id, title')
    .eq('event_code', code)
    .single()

  if (!event) notFound()

  const { data: existing } = await supabase
    .from('waitlist')
    .select('position')
    .eq('event_id', event.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return (
      <main className="px-4 py-12 text-center space-y-4">
        <h1 className="font-headline text-2xl font-bold">You're on the waitlist</h1>
        <p className="text-on-surface-variant">Position #{existing.position} for {event.title}</p>
        <p className="text-on-surface-variant text-sm">We'll text you if a spot opens up.</p>
        <form action={leaveWaitlist.bind(null, event.id)}>
          <button type="submit" className="text-error text-sm font-label">Leave waitlist</button>
        </form>
      </main>
    )
  }

  return (
    <main className="px-4 py-12 text-center space-y-4">
      <h1 className="font-headline text-2xl font-bold">Join Waitlist</h1>
      <p className="text-on-surface-variant">{event.title} is sold out. Join the waitlist and we'll text you if a spot opens up.</p>
      <form action={joinWaitlist.bind(null, { eventId: event.id })}>
        <button
          type="submit"
          className="w-full py-3 rounded-full bg-primary text-on-primary font-label font-semibold"
        >
          Join Waitlist
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Implement `/tickets/[rsvpId]/transfer` page**

```tsx
// app/(attendee)/tickets/[rsvpId]/transfer/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { initiateTransfer } from '@/lib/actions/transfers'

export default function TransferPage({ params }: { params: { rsvpId: string } }) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await initiateTransfer({ rsvpId: params.rsvpId, recipientPhone: phone })
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setDone(true)
  }

  if (done) {
    return (
      <main className="px-4 py-12 text-center space-y-4">
        <h1 className="font-headline text-2xl font-bold">Transfer Sent</h1>
        <p className="text-on-surface-variant text-sm">A claim link has been sent to {phone}. Your ticket is on hold for 24 hours.</p>
        <a href="/tickets" className="text-secondary text-sm">Back to my tickets →</a>
      </main>
    )
  }

  return (
    <main className="px-4 py-12 space-y-6">
      <h1 className="font-headline text-2xl font-bold">Transfer Ticket</h1>
      <p className="text-on-surface-variant text-sm">Enter the recipient's phone number. They'll receive a one-time claim link (valid 24h).</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          type="tel"
          placeholder="+1 (555) 000-0000"
          required
          className="w-full bg-surface-container-highest rounded-lg px-3 py-3 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
        />
        {error && <p className="text-error text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-full bg-primary text-on-primary font-label font-semibold disabled:opacity-60"
        >
          {loading ? 'Sending…' : 'Send Transfer Link'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 5: Implement `/claim/[token]` page**

```tsx
// app/claim/[token]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { claimTransfer } from '@/lib/actions/transfers'
import { QRCodeSVG } from 'qrcode.react'

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/claim/${token}`)

  const result = await claimTransfer(token)

  if (result.error) {
    return (
      <main className="px-4 py-12 text-center space-y-4">
        <h1 className="font-headline text-2xl font-bold text-error">Transfer Invalid</h1>
        <p className="text-on-surface-variant text-sm">{result.error}</p>
        <a href="/explore" className="text-secondary text-sm">Explore events →</a>
      </main>
    )
  }

  return (
    <main className="px-4 py-12 flex flex-col items-center space-y-6">
      <h1 className="font-headline text-3xl font-bold">Ticket Claimed!</h1>
      <p className="text-on-surface-variant text-sm">Your ticket has been transferred to you.</p>
      <div className="bg-surface-container rounded-xl p-6 flex flex-col items-center space-y-3">
        <QRCodeSVG value={result.qrJwt!} size={180} bgColor="transparent" fgColor="#f8f5fd" />
        <p className="text-secondary text-sm">Show this at the door</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Add "Transfer Ticket" link to the live event page**

In `app/(attendee)/live/[eventId]/page.tsx`, pass `rsvpId` to `LiveClient`:

```typescript
  return (
    <LiveClient
      event={event}
      userId={user.id}
      rsvpId={rsvpResult.data!.id}
      initialMyRequest={myRequestResult.data ?? null}
    />
  )
```

In `app/(attendee)/live/[eventId]/LiveClient.tsx`, add `rsvpId: string` to the component props type:

```typescript
export default function LiveClient({
  event,
  userId,
  rsvpId,
  initialMyRequest,
}: {
  event: EventData
  userId: string
  rsvpId: string
  initialMyRequest: RequestPayload | null
}) {
```

Then add a "Transfer Ticket" link in the LiveClient JSX footer area (anywhere after the main song request section):

```tsx
  <div className="px-4 pb-4">
    <a
      href={`/tickets/${rsvpId}/transfer`}
      className="block text-center text-on-surface-variant text-xs underline"
    >
      Transfer my ticket →
    </a>
  </div>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add app/(attendee)/e/[code]/page.tsx \
        app/(attendee)/e/[code]/EventPageClient.tsx \
        "app/(attendee)/e/[code]/waitlist/page.tsx" \
        "app/(attendee)/tickets/[rsvpId]/transfer/page.tsx" \
        app/claim/[token]/page.tsx \
        app/(attendee)/live/[eventId]/page.tsx \
        app/(attendee)/live/[eventId]/LiveClient.tsx
git commit -m "feat: sold-out waitlist CTA + transfer initiation + claim routes + live transfer link"
```

---

## Task 7: Organizer Refund Management Route

**Files:**
- Create: `app/(manage)/events/[id]/refunds/page.tsx`
- Modify: `app/(manage)/events/[id]/page.tsx`

- [ ] **Step 1: Implement the refunds management page**

```tsx
// app/(manage)/events/[id]/refunds/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { approveRefund, denyRefund } from '@/lib/actions/refunds'
import { Chip } from '@/components/ui/Chip'

export default async function RefundsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, organizer_id')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  const { data: requests } = await supabase
    .from('refund_requests')
    .select('id, reason, note, status, requested_at, rsvp:rsvps(id, user_id, users(name, phone))')
    .eq('rsvp.event_id', id)
    .order('requested_at', { ascending: false })

  const pending = requests?.filter(r => r.status === 'pending') ?? []
  const resolved = requests?.filter(r => r.status !== 'pending') ?? []

  return (
    <main className="px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <a href={`/manage/events/${id}`} className="text-on-surface-variant">←</a>
        <h1 className="font-headline text-2xl font-bold flex-1">Refund Requests</h1>
      </div>

      {pending.length === 0 && (
        <p className="text-on-surface-variant text-sm text-center py-8">No pending refund requests.</p>
      )}

      {pending.map(req => (
        <div key={req.id} className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-label font-semibold text-on-surface">{(req.rsvp as any)?.users?.name ?? 'Unknown'}</p>
            <Chip variant="pending">PENDING</Chip>
          </div>
          <p className="text-on-surface-variant text-sm">{req.reason}</p>
          {req.note && <p className="text-on-surface-variant text-xs italic">{req.note}</p>}
          <p className="text-on-surface-variant text-xs">{new Date(req.requested_at).toLocaleDateString()}</p>
          <div className="flex gap-3">
            <form action={approveRefund.bind(null, req.id)} className="flex-1">
              <button type="submit" className="w-full py-2 rounded-full bg-primary text-on-primary font-label font-semibold text-sm">
                Approve Refund
              </button>
            </form>
            <form action={denyRefund.bind(null, req.id)} className="flex-1">
              <button type="submit" className="w-full py-2 rounded-full border border-outline/30 text-on-surface font-label font-semibold text-sm">
                Deny
              </button>
            </form>
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Resolved</p>
          {resolved.map(req => (
            <div key={req.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-on-surface text-sm">{(req.rsvp as any)?.users?.name ?? 'Unknown'}</p>
              <Chip variant={req.status === 'approved' ? 'live' : 'played'}>
                {req.status.toUpperCase()}
              </Chip>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Add refund badge to event detail page**

In `app/(manage)/events/[id]/page.tsx`, after the event fetch, add a pending refund count fetch:

```typescript
  const { count: pendingRefundCount } = await supabase
    .from('refund_requests')
    .select('id', { count: 'exact', head: true })
    .eq('rsvp.event_id', id)
    .eq('status', 'pending')
```

Then in the JSX actions section, add a link to the refunds page:

```tsx
  {(event.state === 'published' || event.state === 'live' || event.state === 'ended') && (
    <Link href={`/manage/events/${event.id}/refunds`}>
      <Button variant="secondary" className="w-full relative">
        Refund Requests
        {(pendingRefundCount ?? 0) > 0 && (
          <span className="absolute top-1 right-3 bg-error text-on-error text-xs font-bold rounded-full px-1.5 py-0.5">
            {pendingRefundCount}
          </span>
        )}
      </Button>
    </Link>
  )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(manage)/events/[id]/refunds/page.tsx" \
        "app/(manage)/events/[id]/page.tsx"
git commit -m "feat: refund requests management route + badge on event detail page"
```

---

## Task 8: DJ Payouts Route

**Files:**
- Create: `app/(dj)/studio/payouts/page.tsx`

- [ ] **Step 1: Implement the DJ payouts page**

```tsx
// app/(dj)/studio/payouts/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getDjPayoutHistory, requestDjPayout } from '@/lib/actions/dj-payouts'
import { initiateStripeConnect } from '@/lib/actions/stripe'
import { Chip } from '@/components/ui/Chip'

export default async function DjPayoutsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_onboarded, role_flags')
    .eq('id', user.id)
    .single()

  const isDj = userData?.role_flags?.dj === true
  if (!isDj) redirect('/explore')

  const isOnboarded = userData?.stripe_connect_onboarded === true

  const { transfers, payouts, error } = isOnboarded
    ? await getDjPayoutHistory()
    : { transfers: [], payouts: [], error: undefined }

  return (
    <main className="px-4 py-6 space-y-6">
      <h1 className="font-headline text-2xl font-bold">DJ Payouts</h1>

      {!isOnboarded && (
        <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <p className="text-on-surface-variant text-sm">Connect with Stripe to receive tips and payouts directly to your bank account.</p>
          <form action={initiateStripeConnect}>
            <button type="submit" className="w-full py-3 rounded-full bg-primary text-on-primary font-label font-semibold">
              Connect with Stripe →
            </button>
          </form>
        </div>
      )}

      {isOnboarded && (
        <>
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-on-surface-variant text-xs uppercase tracking-wider">Status</p>
              <Chip variant="live">Connected</Chip>
            </div>
            <form action={requestDjPayout}>
              <button type="submit" className="w-full py-2 rounded-full border border-primary text-primary font-label font-semibold text-sm">
                Request Instant Payout
              </button>
            </form>
          </div>

          {error && <p className="text-error text-sm">{error}</p>}

          {(transfers?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-on-surface-variant text-xs uppercase tracking-wider">Earnings</p>
              {transfers!.map(tr => (
                <div key={tr.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-on-surface text-sm">${(tr.amount / 100).toFixed(2)}</p>
                  <p className="text-on-surface-variant text-xs">{new Date((tr.created as number) * 1000).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}

          {(payouts?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-on-surface-variant text-xs uppercase tracking-wider">Bank Payouts</p>
              {payouts!.map(po => (
                <div key={po.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-on-surface text-sm">${(po.amount / 100).toFixed(2)}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-on-surface-variant text-xs">{new Date((po.created as number) * 1000).toLocaleDateString()}</p>
                    <Chip variant={po.status === 'paid' ? 'live' : 'pending'}>{(po.status as string).toUpperCase()}</Chip>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!transfers?.length && !payouts?.length && (
            <p className="text-on-surface-variant text-sm text-center py-8">No payout history yet.</p>
          )}
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dj)/studio/payouts/page.tsx"
git commit -m "feat: DJ Stripe Connect onboarding + payout history route"
```

---

## Task 9: Final Track B Verification

- [ ] **Step 1: Run the complete test suite**

```bash
npx vitest run
```

Expected: all tests pass. Count should be ≥ 102 (baseline) + Track B tests.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Phase 4 Track B complete — waitlists, transfers, refunds, DJ payouts"
```
