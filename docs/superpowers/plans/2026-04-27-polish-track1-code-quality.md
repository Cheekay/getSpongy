# Polish Pass — Track 1: Code Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all TypeScript errors in the web app and add 9 missing test cases covering gaps in the request loop, moderation, and realtime layers.

**Architecture:** Six isolated TypeScript fixes (each targeting a single file or package), followed by three test-file additions. Each fix is independently verifiable with `npx tsc --noEmit`. New tests exercise existing server-action behavior — they should pass as written since the implementation already handles these paths.

**Tech Stack:** TypeScript, Vitest, Next.js 15 Server Actions, Supabase, Stripe SDK, jose JWT library.

---

## File Map

| File | Change |
|---|---|
| `package.json` / `package-lock.json` | Add `@stripe/stripe-js` and `@stripe/react-stripe-js` deps |
| `lib/stripe.ts` | Update Stripe API version string |
| `lib/jwt.ts` | Remove `KeyLike` import; fix two casts |
| `lib/actions/tiers.ts` | Fix two `as` casts that treat arrays as single objects |
| `app/(manage)/events/[id]/page.tsx` | Void-cast three server action form bindings |
| `app/(manage)/events/EventList.tsx` | Void-cast two server action form bindings |
| `tests/lib/stripe.test.ts` | Fix private property access on Stripe instance |
| `tests/lib/actions/requests.test.ts` | Add 3 new tests |
| `tests/lib/actions/moderation.test.ts` | Add 4 new tests |
| `tests/lib/supabase/realtime.test.ts` | Add 2 new tests |

---

## Task 1: Install missing Stripe frontend packages

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the packages**

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

Expected: installs cleanly, no peer dep warnings.

- [ ] **Step 2: Verify those specific TS errors are gone**

```bash
npx tsc --noEmit 2>&1 | grep -E "stripe-js|react-stripe"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @stripe/stripe-js and @stripe/react-stripe-js"
```

---

## Task 2: Fix `lib/stripe.ts` API version + `tests/lib/stripe.test.ts` private props

**Files:**
- Modify: `lib/stripe.ts:4`
- Modify: `tests/lib/stripe.test.ts:23-26`

**Context:** The Stripe SDK bumped its API version type from `"2025-01-27.acacia"` to `"2026-03-25.dahlia"`. The test also accesses `.key` and `.options` which are not on Stripe's public TypeScript type — fix with `as any` casts.

- [ ] **Step 1: Update `lib/stripe.ts`**

Replace line 4:

```ts
// lib/stripe.ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-03-25.dahlia',
})
```

- [ ] **Step 2: Update `tests/lib/stripe.test.ts`**

Replace the full file:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('stripe', () => {
  class MockStripe {
    accounts = {}
    accountLinks = {}
    paymentIntents = {}
    webhooks = {}

    constructor(public key: string, public options: any) {}
  }
  return { default: MockStripe }
})

import Stripe from 'stripe'

describe('stripe singleton', () => {
  it('exports a Stripe instance configured with the correct key and API version', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    const { stripe } = await import('@/lib/stripe')
    expect(stripe).toBeDefined()
    expect(stripe).toBeInstanceOf(Stripe)
    expect((stripe as any).key).toBe('sk_test_dummy')
    expect((stripe as any).options).toEqual(expect.objectContaining({
      apiVersion: '2026-03-25.dahlia',
    }))
  })
})
```

- [ ] **Step 3: Verify TS is clean for these files**

```bash
npx tsc --noEmit 2>&1 | grep -E "lib/stripe|stripe.test"
```

Expected: no output.

- [ ] **Step 4: Run the stripe tests**

```bash
npm test -- tests/lib/stripe.test.ts
```

Expected: 1 test passing.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe.ts tests/lib/stripe.test.ts
git commit -m "fix: update Stripe API version to 2026-03-25.dahlia; fix test assertions"
```

---

## Task 3: Fix `lib/jwt.ts` — remove `KeyLike`

**Files:**
- Modify: `lib/jwt.ts:1,12-13,17`

**Context:** The `jose` library removed the `KeyLike` type export in newer versions. `getSecret()` actually returns `Uint8Array` (from `TextEncoder`), so the return type should be `Uint8Array` and the cast can be dropped. The `QrPayload as Record<string, unknown>` cast needs `unknown` as an intermediate step.

- [ ] **Step 1: Rewrite `lib/jwt.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose'

const TOKEN_EXPIRY = '24h'
const NEAR_EXPIRY_THRESHOLD_SECONDS = 3600

export interface QrPayload {
  rsvpId: string
  eventId: string
  userId: string
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.QR_JWT_SECRET!)
}

export async function signQrJwt(payload: QrPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(TOKEN_EXPIRY)
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
    const oneHourFromNow = Math.floor(Date.now() / 1000) + NEAR_EXPIRY_THRESHOLD_SECONDS
    return exp < oneHourFromNow
  } catch {
    return true
  }
}
```

- [ ] **Step 2: Verify TS clean for jwt**

```bash
npx tsc --noEmit 2>&1 | grep lib/jwt
```

Expected: no output.

- [ ] **Step 3: Run jwt tests**

```bash
npm test -- tests/lib/jwt.test.ts
```

Expected: all tests passing.

- [ ] **Step 4: Commit**

```bash
git add lib/jwt.ts
git commit -m "fix: remove KeyLike import from jose; use Uint8Array return type"
```

---

## Task 4: Fix `lib/actions/tiers.ts` — broken array-as-object casts

**Files:**
- Modify: `lib/actions/tiers.ts:50,82`

**Context:** The Supabase join syntax `event:events!inner(organizer_id)` causes TypeScript to infer `event` as `{ organizer_id: any }[]` (an array). Direct casting to `{ organizer_id: string } | null` fails because the types don't overlap. Routing through `unknown` first resolves this.

- [ ] **Step 1: Fix line 50 in `updateTier`**

Find this line (inside `updateTier`):
```ts
const eventData = tier?.event as { organizer_id: string } | null
```

Replace with:
```ts
const eventData = tier?.event as unknown as { organizer_id: string } | null
```

- [ ] **Step 2: Fix line 82 in `deleteTier`**

Find this line (inside `deleteTier`):
```ts
const eventData = tier?.event as { organizer_id: string } | null
```

Replace with:
```ts
const eventData = tier?.event as unknown as { organizer_id: string } | null
```

- [ ] **Step 3: Verify TS clean**

```bash
npx tsc --noEmit 2>&1 | grep tiers
```

Expected: no output.

- [ ] **Step 4: Run tiers tests**

```bash
npm test -- tests/lib/actions/tiers.test.ts
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/tiers.ts
git commit -m "fix: route tiers event join cast through unknown to satisfy TS"
```

---

## Task 5: Fix form action return types

**Files:**
- Modify: `app/(manage)/events/[id]/page.tsx:105,116,150`
- Modify: `app/(manage)/events/EventList.tsx:76,87`

**Context:** Next.js `<form action={...}>` expects `(formData: FormData) => void | Promise<void>`. Our server actions return `Promise<{ error?: string }>` or `Promise<PublishEventResult>`. The TypeScript error is a false positive — Next.js handles the return value correctly at runtime. Fix with `as unknown as` casts at the call site, which is the idiomatic workaround until Next.js types catch up.

- [ ] **Step 1: Fix `app/(manage)/events/[id]/page.tsx`**

Change line 105 (form for Stripe Connect):
```tsx
// Before:
<form action={initiateStripeConnect}>
// After:
<form action={initiateStripeConnect as unknown as (formData: FormData) => Promise<void>}>
```

Change line 116 (form for tip settings):
```tsx
// Before:
<form action={updateTipSettings.bind(null, event.id)} className="bg-surface-container-low rounded-xl p-4 space-y-3">
// After:
<form action={updateTipSettings.bind(null, event.id) as unknown as (formData: FormData) => Promise<void>} className="bg-surface-container-low rounded-xl p-4 space-y-3">
```

Change line 150 (form for publish):
```tsx
// Before:
<form action={publishEvent.bind(null, event.id)}>
// After:
<form action={publishEvent.bind(null, event.id) as unknown as (formData: FormData) => Promise<void>}>
```

- [ ] **Step 2: Fix `app/(manage)/events/EventList.tsx`**

Change line 76 (Go Live form):
```tsx
// Before:
<form action={goLive.bind(null, event.id)}>
// After:
<form action={goLive.bind(null, event.id) as unknown as (formData: FormData) => Promise<void>}>
```

Change line 87 (End Event form):
```tsx
// Before:
<form action={endEvent.bind(null, event.id)}>
// After:
<form action={endEvent.bind(null, event.id) as unknown as (formData: FormData) => Promise<void>}>
```

- [ ] **Step 3: Verify TS clean**

```bash
npx tsc --noEmit 2>&1 | grep -E "events/\[id\]/page|EventList"
```

Expected: no output.

- [ ] **Step 4: Verify full tsc is now clean (web app only)**

```bash
npx tsc --noEmit 2>&1 | grep -v "^mobile/"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "app/(manage)/events/[id]/page.tsx" "app/(manage)/events/EventList.tsx"
git commit -m "fix: cast server action form bindings to satisfy Next.js form action types"
```

---

## Task 6: Add missing `submitRequest` tests

**Files:**
- Modify: `tests/lib/actions/requests.test.ts`

**Context:** Three paths in `submitRequest` have no test coverage: (1) user has no RSVP, (2) rate-limited with `retryAfterSeconds`, (3) DB insert failure. The implementation already handles all three — these tests just verify that behavior.

Add the following three tests inside the existing `describe('submitRequest', ...)` block, after the last existing test (the successful submission test, around line 118):

- [ ] **Step 1: Add the three tests**

```ts
  it('returns error when user has no RSVP', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', requests_paused: false, requests_paused_until: null } }))
      .mockReturnValueOnce(makeQuery({ count: 0 })) // RSVP check → none
    const result = await submitRequest(validParams)
    expect(result.error).toBe('You must RSVP before submitting requests')
  })

  it('returns retryAfterSeconds when rate-limited', async () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 1000).toISOString() // submitted 2 min ago
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', requests_paused: false, requests_paused_until: null } }))
      .mockReturnValueOnce(makeQuery({ count: 1 })) // RSVP exists
      .mockReturnValueOnce(makeQuery({ count: 1 })) // recent requests → rate limited
      .mockReturnValueOnce(makeQuery({ data: { created_at: createdAt } })) // latest request
    const result = await submitRequest(validParams)
    expect(result.error).toMatch(/Please wait/)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThan(600) // less than 10 min
  })

  it('returns error when the DB insert fails', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', requests_paused: false, requests_paused_until: null } }))
      .mockReturnValueOnce(makeQuery({ count: 1 })) // RSVP exists
      .mockReturnValueOnce(makeQuery({ count: 0 })) // no rate limit
      .mockReturnValueOnce(makeQuery({ count: 0 })) // no duplicate
    mockServiceClient.from.mockReturnValue(makeQuery({ data: null, error: { message: 'insert failed' } }))
    const result = await submitRequest(validParams)
    expect(result.error).toBe('insert failed')
  })
```

- [ ] **Step 2: Run the tests**

```bash
npm test -- tests/lib/actions/requests.test.ts
```

Expected: all tests pass (was 5, now 8).

- [ ] **Step 3: Commit**

```bash
git add tests/lib/actions/requests.test.ts
git commit -m "test: add missing submitRequest coverage (no-RSVP, rate-limit, insert-fail)"
```

---

## Task 7: Add missing `moderateRequest` / `revertRequest` tests

**Files:**
- Modify: `tests/lib/actions/moderation.test.ts`

**Context:** Four paths not covered: `played` action on an accepted request, `rejected` action on an accepted request (re-rejection), reverting a `rejected` request, and the error path when reverting a `played` request.

Add the following inside the existing `describe` blocks:

- [ ] **Step 1: Add two tests to `describe('moderateRequest', ...)`**

Add after the last existing test (around line 85):

```ts
  it('played action succeeds when request is accepted', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'accepted' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } }))
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    const result = await moderateRequest('req-1', 'played')
    expect(result.error).toBeUndefined()
  })

  it('rejected action succeeds on an already-accepted request', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'accepted' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } }))
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    const result = await moderateRequest('req-1', 'rejected')
    expect(result.error).toBeUndefined()
  })
```

- [ ] **Step 2: Add two tests to `describe('revertRequest', ...)`**

Add after the last existing test (around line 109):

```ts
  it('reverts a rejected request back to pending', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'rejected' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } }))
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    const result = await revertRequest('req-1')
    expect(result.error).toBeUndefined()
  })

  it('returns error when reverting a played request', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'played' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } }))
    const result = await revertRequest('req-1')
    expect(result.error).toBe('Can only revert accepted or rejected requests')
  })
```

- [ ] **Step 3: Run the tests**

```bash
npm test -- tests/lib/actions/moderation.test.ts
```

Expected: all tests pass (was 9, now 13).

- [ ] **Step 4: Commit**

```bash
git add tests/lib/actions/moderation.test.ts
git commit -m "test: add missing moderation coverage (played, re-reject, revert-rejected, revert-played-error)"
```

---

## Task 8: Add missing realtime callback tests

**Files:**
- Modify: `tests/lib/supabase/realtime.test.ts`

**Context:** The existing tests verify channel name and table filter. Two tests are missing: that the registered callback actually fires with `payload.new` when a change comes in. The mock captures the handler via `mockOn.mock.calls[0][2]` — calling it directly simulates a Supabase Realtime event.

- [ ] **Step 1: Add callback test to `describe('subscribeToRequests', ...)`**

Add after the existing `'calls removeChannel when unsubscribed'` test (around line 47):

```ts
  it('invokes the onUpdate callback with payload.new when a change fires', () => {
    const onUpdate = vi.fn()
    subscribeToRequests('event-123', onUpdate)
    // mockOn.mock.calls[0][2] is the handler passed to .on('postgres_changes', filter, handler)
    const handler = mockOn.mock.calls[0][2] as (p: { new: unknown }) => void
    const mockPayload = { id: 'req-1', state: 'accepted', event_id: 'event-123' }
    handler({ new: mockPayload })
    expect(onUpdate).toHaveBeenCalledWith(mockPayload)
  })
```

- [ ] **Step 2: Add callback test to `describe('subscribeToCheckIns', ...)`**

Add after the existing `'returns an unsubscribe function'` test (around line 67):

```ts
  it('invokes the onUpdate callback with payload.new when a change fires', () => {
    const onUpdate = vi.fn()
    subscribeToCheckIns('event-456', onUpdate)
    const handler = mockOn.mock.calls[0][2] as (p: { new: unknown }) => void
    const mockPayload = { id: 'rsvp-1', status: 'checked_in', event_id: 'event-456' }
    handler({ new: mockPayload })
    expect(onUpdate).toHaveBeenCalledWith(mockPayload)
  })
```

- [ ] **Step 3: Run the tests**

```bash
npm test -- tests/lib/supabase/realtime.test.ts
```

Expected: all tests pass (was 7, now 9).

- [ ] **Step 4: Commit**

```bash
git add tests/lib/supabase/realtime.test.ts
git commit -m "test: verify realtime subscription callbacks fire with payload.new"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full tsc (web app only)**

```bash
npx tsc --noEmit 2>&1 | grep -v "^mobile/"
```

Expected: no output.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: 37 test files, ≥ 228 tests, all passing.

- [ ] **Step 3: If any failures, fix inline before merging**

Debug with:
```bash
npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|✕|Error"
```
