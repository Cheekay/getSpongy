# Attendee Queue View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-tab Live page ("My Request" / "Queue") so attendees can see all DJ-accepted songs in real-time and upvote any of them.

**Architecture:** Extend the existing `LiveClient` with tab state and an `acceptedQueue` list maintained by the already-open Supabase realtime channel. A new `QueueTab` component renders the sorted list. The `toggleUpvote` server action is extended to accept `accepted`-state requests in addition to `pending`.

**Tech Stack:** Next.js server components, Supabase SSR client, Supabase Realtime (postgres_changes), React state, Vitest

---

## File Map

| File | Change |
|---|---|
| `lib/actions/upvotes.ts` | Extend state guard to allow `accepted` |
| `tests/lib/actions/upvotes.test.ts` | Update existing test + add 2 new tests |
| `app/(attendee)/live/[eventId]/page.tsx` | Add `initialQueue` + `initialUpvotedIds` queries |
| `app/(attendee)/live/[eventId]/QueueTab.tsx` | **New** — queue list with upvote buttons |
| `app/(attendee)/live/[eventId]/LiveClient.tsx` | Tab switcher, new state, extended realtime handler, render QueueTab |

---

## Task 1: Extend `toggleUpvote` to allow upvoting accepted requests

**Files:**
- Modify: `lib/actions/upvotes.ts:20`
- Modify: `tests/lib/actions/upvotes.test.ts`

- [ ] **Step 1: Update the existing test that uses `accepted` state**

The test "returns error when request is not pending" currently passes `state: 'accepted'` — after our change that will succeed, not error. Change it to use `state: 'played'` (a terminal state that should still error):

In `tests/lib/actions/upvotes.test.ts`, replace:
```ts
it('returns error when request is not pending', async () => {
  mockSupabaseClient.from
    .mockReturnValueOnce(makeQuery({ data: { state: 'accepted', event_id: 'e-1', upvote_count: 3 }, error: null }))
  const result = await toggleUpvote('req-1')
  expect(result.error).toBe('Can only upvote pending requests')
})
```
with:
```ts
it('returns error when request is not in an active state', async () => {
  mockSupabaseClient.from
    .mockReturnValueOnce(makeQuery({ data: { state: 'played', event_id: 'e-1', upvote_count: 3 }, error: null }))
  const result = await toggleUpvote('req-1')
  expect(result.error).toBe('Can only upvote active requests')
})
```

- [ ] **Step 2: Add a test for upvoting an accepted request**

Append inside the `describe('toggleUpvote')` block in `tests/lib/actions/upvotes.test.ts`:
```ts
it('allows upvoting an accepted request when checked in', async () => {
  mockSupabaseClient.from
    .mockReturnValueOnce(makeQuery({ data: { state: 'accepted', event_id: 'e-1', upvote_count: 2 }, error: null }))
    .mockReturnValueOnce(makeQuery({ data: { status: 'checked_in' }, error: null }))
    .mockReturnValueOnce(makeQuery({ data: null, error: null })) // no existing upvote
  mockServiceClient.from.mockReturnValueOnce(makeQuery({ error: null })) // insert

  const result = await toggleUpvote('req-accepted')
  expect(result.voted).toBe(true)
  expect(result.count).toBe(3)
})

it('returns error when upvoting a played (terminal) request', async () => {
  mockSupabaseClient.from
    .mockReturnValueOnce(makeQuery({ data: { state: 'played', event_id: 'e-1', upvote_count: 5 }, error: null }))
  const result = await toggleUpvote('req-played')
  expect(result.error).toBe('Can only upvote active requests')
})
```

- [ ] **Step 3: Run tests to confirm the new tests fail and the updated test is correct**

```bash
npx vitest run tests/lib/actions/upvotes.test.ts
```

Expected: 2 failures (the two new tests) + 1 updated test now fails with wrong message.

- [ ] **Step 4: Update the state guard in `lib/actions/upvotes.ts`**

Replace line 20:
```ts
if (request.state !== 'pending') return { error: 'Can only upvote pending requests' }
```
with:
```ts
if (!['pending', 'accepted'].includes(request.state)) return { error: 'Can only upvote active requests' }
```

- [ ] **Step 5: Run tests to confirm all pass**

```bash
npx vitest run tests/lib/actions/upvotes.test.ts
```

Expected: 6 tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/upvotes.ts tests/lib/actions/upvotes.test.ts
git commit -m "feat: allow upvoting accepted song requests"
```

---

## Task 2: Extend `page.tsx` with server-side queue data

**Files:**
- Modify: `app/(attendee)/live/[eventId]/page.tsx`

- [ ] **Step 1: Add `queueResult` to the existing `Promise.all`**

In `app/(attendee)/live/[eventId]/page.tsx`, replace the `Promise.all` call:
```ts
const [eventResult, rsvpResult, myRequestResult] = await Promise.all([
```
with:
```ts
const [eventResult, rsvpResult, myRequestResult, queueResult] = await Promise.all([
```

Then add the fourth query as the last item inside the array, after the `myRequestResult` query:
```ts
  supabase
    .from('song_requests')
    .select('*')
    .eq('event_id', eventId)
    .eq('state', 'accepted')
    .order('upvote_count', { ascending: false })
    .order('state_changed_at', { ascending: true }),
```

- [ ] **Step 2: Fetch upvoted IDs after the Promise.all**

After the `Promise.all` and before the `const event = eventResult.data` line, add:
```ts
const initialQueue = queueResult.data ?? []

const queueIds = initialQueue.map((r: { id: string }) => r.id)
const upvotedResult = queueIds.length > 0
  ? await supabase
      .from('upvotes')
      .select('request_id')
      .eq('user_id', user.id)
      .in('request_id', queueIds)
  : { data: [] as { request_id: string }[] }

const initialUpvotedIds = (upvotedResult.data ?? []).map((u: { request_id: string }) => u.request_id)
```

- [ ] **Step 3: Pass new props to `LiveClient`**

In the `return` statement, add two new props to `<LiveClient>`:
```tsx
<LiveClient
  event={event}
  userId={user.id}
  rsvpId={rsvpResult.data!.id}
  initialMyRequest={myRequestResult.data ?? null}
  initialQueue={initialQueue}
  initialUpvotedIds={initialUpvotedIds}
/>
```

- [ ] **Step 4: Verify the page.tsx file is valid TypeScript (LiveClient will show a prop error — expected)**

```bash
npx tsc --noEmit 2>&1 | grep "live/\[eventId\]"
```

Expected: one error about `initialQueue` and `initialUpvotedIds` not existing on `LiveClient` props. This is resolved in Task 4. Any other errors in this file are a problem — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add app/\(attendee\)/live/\[eventId\]/page.tsx
git commit -m "feat: fetch initial accepted queue and upvoted IDs server-side"
```

---

## Task 3: Create `QueueTab` component

**Files:**
- Create: `app/(attendee)/live/[eventId]/QueueTab.tsx`

- [ ] **Step 1: Create the file**

Create `app/(attendee)/live/[eventId]/QueueTab.tsx` with:
```tsx
'use client'

import type { RequestPayload } from '@/lib/supabase/realtime'

type QueueTabProps = {
  queue: RequestPayload[]
  upvotedIds: Set<string>
  onUpvote: (requestId: string) => Promise<void>
}

export default function QueueTab({ queue, upvotedIds, onUpvote }: QueueTabProps) {
  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-2xl mb-2">🎵</p>
        <p className="text-on-surface-variant text-sm">No songs accepted yet — check back soon</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-label font-semibold text-on-surface-variant uppercase tracking-wider">Up Next</p>
      {queue.map((track) => {
        const voted = upvotedIds.has(track.id)
        return (
          <div key={track.id} className="flex items-center gap-3 bg-surface-container-low rounded-xl px-3 py-2.5">
            {track.album_art_url ? (
              <img src={track.album_art_url} alt="" className="w-9 h-9 rounded-md object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-md bg-surface-container-high shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-label font-semibold text-on-surface text-sm truncate">{track.track_title}</p>
              <p className="text-on-surface-variant text-xs truncate">{track.track_artist}</p>
            </div>
            <button
              onClick={() => onUpvote(track.id)}
              aria-label={voted ? 'Remove upvote' : 'Upvote this song'}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-label font-semibold shrink-0 transition-colors ${
                voted
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-highest text-on-surface-variant border border-outline-variant'
              }`}
            >
              ↑ {track.upvote_count}
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(attendee\)/live/\[eventId\]/QueueTab.tsx
git commit -m "feat: add QueueTab component for accepted song queue"
```

---

## Task 4: Update `LiveClient` with tabs, queue state, and extended realtime handler

**Files:**
- Modify: `app/(attendee)/live/[eventId]/LiveClient.tsx`

- [ ] **Step 1: Add the `QueueTab` dynamic import**

After the existing `const TipModal = dynamic(...)` line, add:
```tsx
const QueueTab = dynamic(() => import('./QueueTab'), { ssr: false })
```

- [ ] **Step 2: Add new props to the component signature**

Replace:
```tsx
export default function LiveClient({
  event, user, hasProfile, existingRsvp, rsvpCount, atCapacity, appUrl, tiers, allTiersSoldOut,
}: LivePageClientProps) {
```

Actually the signature in LiveClient.tsx is:
```tsx
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

Replace with:
```tsx
export default function LiveClient({
  event,
  userId,
  rsvpId,
  initialMyRequest,
  initialQueue,
  initialUpvotedIds,
}: {
  event: EventData
  userId: string
  rsvpId: string
  initialMyRequest: RequestPayload | null
  initialQueue: RequestPayload[]
  initialUpvotedIds: string[]
}) {
```

- [ ] **Step 3: Add new state declarations**

After the existing `const [toastMessage, setToastMessage] = useState` line, add:
```tsx
const [activeTab, setActiveTab] = useState<'my-request' | 'queue'>('my-request')
const [acceptedQueue, setAcceptedQueue] = useState<RequestPayload[]>(initialQueue)
const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set(initialUpvotedIds))
```

- [ ] **Step 4: Replace the realtime `useEffect` handler**

Find and replace the existing realtime `useEffect` (the one that uses `subscribeToRequests`):
```tsx
// OLD — remove this entire useEffect:
useEffect(() => {
  const TERMINAL: RequestPayload['state'][] = ['rejected', 'played', 'expired', 'withdrawn']
  const unsub = subscribeToRequests(event.id, (payload) => {
    if (payload.user_id !== userId) return
    if (TERMINAL.includes(payload.state)) {
      const msg =
        payload.state === 'played' ? '🎵 Your song was played!'
        : payload.state === 'rejected' ? '✕ Your request was passed on'
        : 'Your request is no longer active'
      setToastMessage(msg)
      setMyRequest(null)
      setUpvoteCount(0)
      setVoted(false)
    } else {
      setMyRequest(payload)
      setUpvoteCount(payload.upvote_count)
    }
  })
  return unsub
}, [event.id, userId])
```

Replace with:
```tsx
useEffect(() => {
  const TERMINAL: RequestPayload['state'][] = ['rejected', 'played', 'expired', 'withdrawn']
  const unsub = subscribeToRequests(event.id, (payload) => {
    // Own-request branch (unchanged logic)
    if (payload.user_id === userId) {
      if (TERMINAL.includes(payload.state)) {
        const msg =
          payload.state === 'played' ? '🎵 Your song was played!'
          : payload.state === 'rejected' ? '✕ Your request was passed on'
          : 'Your request is no longer active'
        setToastMessage(msg)
        setMyRequest(null)
        setUpvoteCount(0)
        setVoted(false)
      } else {
        setMyRequest(payload)
        setUpvoteCount(payload.upvote_count)
      }
    }

    // Queue branch — not mutually exclusive with own-request branch
    if (payload.state === 'accepted') {
      setAcceptedQueue(prev => {
        const without = prev.filter(r => r.id !== payload.id)
        return [...without, payload].sort((a, b) =>
          b.upvote_count !== a.upvote_count
            ? b.upvote_count - a.upvote_count
            : new Date(a.state_changed_at).getTime() - new Date(b.state_changed_at).getTime()
        )
      })
    } else {
      setAcceptedQueue(prev => prev.filter(r => r.id !== payload.id))
    }
  })
  return unsub
}, [event.id, userId])
```

- [ ] **Step 5: Add `handleQueueUpvote` function**

After the existing `handleWithdraw` function, add:
```tsx
async function handleQueueUpvote(requestId: string) {
  const wasVoted = upvotedIds.has(requestId)
  // Optimistic update
  setUpvotedIds(prev => {
    const next = new Set(prev)
    wasVoted ? next.delete(requestId) : next.add(requestId)
    return next
  })
  setAcceptedQueue(prev =>
    prev.map(r =>
      r.id === requestId
        ? { ...r, upvote_count: Math.max(0, r.upvote_count + (wasVoted ? -1 : 1)) }
        : r
    ).sort((a, b) =>
      b.upvote_count !== a.upvote_count
        ? b.upvote_count - a.upvote_count
        : new Date(a.state_changed_at).getTime() - new Date(b.state_changed_at).getTime()
    )
  )

  const result = await toggleUpvote(requestId)
  if (result.error) {
    // Roll back
    setUpvotedIds(prev => {
      const next = new Set(prev)
      wasVoted ? next.add(requestId) : next.delete(requestId)
      return next
    })
    setAcceptedQueue(prev =>
      prev.map(r =>
        r.id === requestId
          ? { ...r, upvote_count: Math.max(0, r.upvote_count + (wasVoted ? 1 : -1)) }
          : r
      )
    )
    setToastMessage(result.error)
  }
}
```

- [ ] **Step 6: Add tab switcher UI and wire up QueueTab in the return JSX**

In the `return (...)` block, directly after the live header `<div>` (the one with the green dot and event title) and the existing `{toastMessage && ...}` block, add the tab switcher:
```tsx
{/* Tab switcher */}
<div className="flex gap-1.5 bg-surface-container-high rounded-full p-1">
  <button
    onClick={() => setActiveTab('my-request')}
    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-label font-semibold transition-colors ${
      activeTab === 'my-request' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
    }`}
  >
    My Request
  </button>
  <button
    onClick={() => setActiveTab('queue')}
    className={`flex-1 flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-label font-semibold transition-colors ${
      activeTab === 'queue' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
    }`}
  >
    Queue
    {acceptedQueue.length > 0 && (
      <span className={`rounded-full px-1.5 text-[10px] ${
        activeTab === 'queue'
          ? 'bg-on-primary/20 text-on-primary'
          : 'bg-surface-container-highest text-on-surface-variant'
      }`}>
        {acceptedQueue.length}
      </span>
    )}
  </button>
</div>
```

Then, at the very end of the `return (...)` block, just before the closing `</main>` tag (after the `{tipRequestId && ...}` block and the transfer link), add:
```tsx
{/* Queue tab */}
{activeTab === 'queue' && (
  <QueueTab
    queue={acceptedQueue}
    upvotedIds={upvotedIds}
    onUpvote={handleQueueUpvote}
  />
)}
```

Wrap the three existing conditional blocks in the `return` JSX — the active-request card, the rate limit countdown, and the search form — in a single `activeTab` guard. In `LiveClient.tsx`, find these three blocks and wrap them together:

```tsx
{activeTab === 'my-request' && (
  <>
    {/* Active request card */}
    {isRequestActive && myRequest && (
      // ... existing block unchanged ...
    )}

    {/* Rate limit countdown */}
    {retryAfter && !myRequest && (
      // ... existing block unchanged ...
    )}

    {/* Search + submit form */}
    {!myRequest && !retryAfter && (
      // ... existing block unchanged ...
    )}
  </>
)}
```

Do not change any content inside these three blocks — only add the outer `{activeTab === 'my-request' && (<>...</>)}` wrapper around all three.

- [ ] **Step 7: Run the full test suite**

```bash
npx vitest run
```

Expected: all existing tests pass (228+), no regressions.

- [ ] **Step 8: Smoke test in browser**

1. Open `localhost:3000` and navigate to the Live page for a live event
2. Confirm two tabs render: "My Request" and "Queue"
3. From the DJ Studio dashboard, accept a pending request
4. Confirm the song appears in the Queue tab in real-time without a page refresh
5. Click the upvote button — confirm it fills purple and count increments
6. Click again — confirm it toggles back to outlined

- [ ] **Step 9: Commit**

```bash
git add app/\(attendee\)/live/\[eventId\]/LiveClient.tsx
git commit -m "feat: add Queue tab with real-time accepted songs and crowd upvoting"
```
