# Polish Pass — Track 2: UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the LiveClient rejected/played stuck-state bug, add loading skeletons and empty states across key routes, harden accessibility (aria-labels, keyboard nav, focus trap, skip link), and do a visual consistency pass on typography, padding, and interactive states.

**Architecture:** All changes are isolated to `app/` and `components/` — no server-action or database changes. Track 2 runs in a separate worktree from Track 1 and targets different files, except for the two manage-route files touched by Task 5 in Track 1 — merge Track 1 first to avoid conflicts on those.

**Tech Stack:** Next.js 15 (App Router), React 18, Tailwind CSS, Supabase Realtime.

---

## File Map

| File | Change |
|---|---|
| `components/ui/Spinner.tsx` | Create — reusable loading spinner |
| `app/(attendee)/live/[eventId]/LiveClient.tsx` | Terminal state toast fix; Spotify skeleton; aria-labels; keyboard nav |
| `app/(attendee)/live/[eventId]/TipModal.tsx` | Focus trap + Escape to close + aria attributes |
| `app/(studio)/queue/QueueClient.tsx` | Disable buttons during pending action; aria-labels |
| `app/(manage)/events/[id]/door/DoorClient.tsx` | QR scan spinner overlay |
| `app/(attendee)/explore/page.tsx` | Replace stub with join-by-code UI |
| `app/(manage)/analytics/page.tsx` | Replace stub with proper empty state |
| `app/(attendee)/requests/page.tsx` | Replace stub with proper empty state |
| `app/(attendee)/profile/page.tsx` | Visual consistency (heading scale, padding) |
| `app/(attendee)/alerts/page.tsx` | Visual consistency (heading scale, padding) |
| `app/layout.tsx` | Add skip-to-main-content link |
| `app/(attendee)/layout.tsx` | Add `id="main-content"` to content wrapper |

---

## Task 1: Create `Spinner` component

**Files:**
- Create: `components/ui/Spinner.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/ui/Spinner.tsx
export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-2 border-outline-variant border-t-secondary animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
```

- [ ] **Step 2: Verify the file exists and TypeScript is happy**

```bash
npx tsc --noEmit 2>&1 | grep Spinner
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Spinner.tsx
git commit -m "feat: add Spinner component for loading states"
```

---

## Task 2: Fix LiveClient — terminal state toast + form reappearance

**Files:**
- Modify: `app/(attendee)/live/[eventId]/LiveClient.tsx`

**Context (the bug):** `subscribeToRequests` fires for all state changes, including terminal ones (`rejected`, `played`, `expired`, `withdrawn`). `setMyRequest(payload)` is called for all of them, which hides the search form permanently because the form only renders when `myRequest` is null. Fix: for terminal states, clear `myRequest` and show a 2.5s toast instead.

- [ ] **Step 1: Add `toastMessage` state declaration**

After the existing state declarations (around line 44, after `const [retryAfter, setRetryAfter] = useState`), add:

```ts
const [toastMessage, setToastMessage] = useState<string | null>(null)
```

- [ ] **Step 2: Replace the first `useEffect` (the one that subscribes to requests)**

Replace the existing block (lines 48–56):
```ts
// Watch own request state changes via realtime
useEffect(() => {
  const unsub = subscribeToRequests(event.id, (payload) => {
    if (payload.user_id === userId) {
      setMyRequest(payload)
      setUpvoteCount(payload.upvote_count)
    }
  })
  return unsub
}, [event.id, userId])
```

With:
```ts
// Watch own request state changes via realtime
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

- [ ] **Step 3: Add toast auto-dismiss effect**

After the countdown effect (the `useEffect` for `retryAfter`, around line 83), add:

```ts
// Auto-dismiss toast after 2.5 seconds
useEffect(() => {
  if (!toastMessage) return
  const id = setTimeout(() => setToastMessage(null), 2500)
  return () => clearTimeout(id)
}, [toastMessage])
```

- [ ] **Step 4: Add toast to JSX**

Inside the `return (...)`, after the live header div (after the `<div className="flex items-center gap-2">` block, around line 194), add:

```tsx
{toastMessage && (
  <div
    aria-live="polite"
    className="rounded-xl px-4 py-3 bg-surface-container-high text-on-surface text-sm font-label text-center"
  >
    {toastMessage}
  </div>
)}
```

- [ ] **Step 5: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep LiveClient
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add "app/(attendee)/live/[eventId]/LiveClient.tsx"
git commit -m "fix: clear myRequest on terminal realtime state; show auto-dismiss toast"
```

---

## Task 3: LiveClient — Spotify search loading skeleton

**Files:**
- Modify: `app/(attendee)/live/[eventId]/LiveClient.tsx`

- [ ] **Step 1: Add `searching` state declaration**

After `const [results, setResults] = useState<SpotifyTrack[]>([])` add:

```ts
const [searching, setSearching] = useState(false)
```

- [ ] **Step 2: Update `handleQueryChange` to set `searching`**

Replace the existing `handleQueryChange` (lines 89–104):

```ts
const handleQueryChange = useCallback((q: string) => {
  setQuery(q)
  setSelected(null)
  if (debounceRef.current) clearTimeout(debounceRef.current)
  if (!q.trim() || q.length < 2) { setResults([]); setSearching(false); return }
  setSearching(true)
  debounceRef.current = setTimeout(async () => {
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) { setResults([]); return }
      const data = await res.json()
      setResults(data.tracks ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, 300)
}, [])
```

- [ ] **Step 3: Add skeleton and update results rendering**

In the search results section, find the existing block:

```tsx
{/* Search results */}
{results.length > 0 && !selected && (
  <div className="space-y-2">
    ...
  </div>
)}
```

Replace with:

```tsx
{/* Search results skeleton */}
{searching && !selected && (
  <div className="space-y-2" aria-label="Searching…">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex gap-3 items-center bg-surface-container-low rounded-xl px-3 py-2.5">
        <div className="w-10 h-10 rounded-md bg-surface-container-high animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-surface-container-high animate-pulse rounded-full w-3/4" />
          <div className="h-2.5 bg-surface-container-high animate-pulse rounded-full w-1/2" />
        </div>
      </div>
    ))}
  </div>
)}

{/* Search results */}
{results.length > 0 && !selected && !searching && (
  <div className="space-y-2">
    {results.map((track) => (
      <button
        key={track.id}
        onClick={() => { setSelected(track); setResults([]) }}
        className="w-full flex gap-3 items-center bg-surface-container-low rounded-xl px-3 py-2.5 text-left hover:bg-surface-container focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-secondary"
      >
        {track.albumArtUrl ? (
          <img src={track.albumArtUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-md bg-surface-container-high shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-label font-semibold text-on-surface text-sm truncate">{track.title}</p>
          <p className="text-on-surface-variant text-xs truncate">{track.artist}</p>
        </div>
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep LiveClient
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "app/(attendee)/live/[eventId]/LiveClient.tsx"
git commit -m "feat: add Spotify search loading skeleton in LiveClient"
```

---

## Task 4: QueueClient — disable action buttons during pending moderation

**Files:**
- Modify: `app/(studio)/queue/QueueClient.tsx`

- [ ] **Step 1: Add `pendingId` state**

After `const [undoItem, setUndoItem] = useState<UndoItem | null>(null)` add:

```ts
const [pendingId, setPendingId] = useState<string | null>(null)
```

- [ ] **Step 2: Update `handleModerate` to set/clear `pendingId`**

Replace the existing `handleModerate` (lines 69–98) with:

```ts
const handleModerate = useCallback(
  async (requestId: string, action: ModerateAction) => {
    const req = requests.find((r) => r.id === requestId)
    if (!req) return
    const previousState = req.state

    setPendingId(requestId)

    // Optimistic update
    setRequests((prev) =>
      prev
        .map((r) => (r.id === requestId ? { ...r, state: action } : r))
        .filter((r) => ['pending', 'accepted'].includes(r.state))
    )

    // Queue undo (5 seconds)
    if (undoItem) clearTimeout(undoItem.timer)
    const timer = setTimeout(() => setUndoItem(null), 5000)
    setUndoItem({ requestId, previousState, label: action, timer })

    const { error } = await moderateRequest(requestId, action)
    setPendingId(null)
    if (error) {
      setRequests((prev) => {
        const exists = prev.find((r) => r.id === requestId)
        if (exists) return prev.map((r) => (r.id === requestId ? { ...r, state: previousState as RequestPayload['state'] } : r))
        return ['pending', 'accepted'].includes(previousState) ? [{ ...req, state: previousState as RequestPayload['state'] }, ...prev] : prev
      })
      setUndoItem(null)
    }
  },
  [requests, undoItem]
)
```

- [ ] **Step 3: Pass `isPending` prop to `RequestCard`**

In the map over `sorted` (around line 160), update to:

```tsx
sorted.map((req) => (
  <RequestCard
    key={req.id}
    request={req}
    onModerate={handleModerate}
    formatTimeAgo={formatTimeAgo}
    isPending={pendingId === req.id}
  />
))
```

- [ ] **Step 4: Update `RequestCard` to accept and use `isPending`**

Update the `RequestCard` function signature and add `disabled={isPending}` to all action buttons:

```tsx
function RequestCard({
  request,
  onModerate,
  formatTimeAgo,
  isPending,
}: {
  request: RequestPayload
  onModerate: (id: string, action: ModerateAction) => void
  formatTimeAgo: (iso: string) => string
  isPending: boolean
}) {
  return (
    <div
      className={`rounded-2xl p-4 flex flex-col gap-3 ${
        request.state === 'accepted' ? 'bg-tertiary/10 ring-1 ring-tertiary/30' : 'bg-surface-container-low'
      }`}
    >
      <div className="flex gap-3 items-start">
        {request.album_art_url ? (
          <img src={request.album_art_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-surface-container-high shrink-0 flex items-center justify-center text-xl">
            🎵
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-label font-semibold text-on-surface text-lg leading-tight truncate">
            {request.track_title}
          </p>
          <p className="text-on-surface-variant text-base truncate">{request.track_artist}</p>
          {request.shoutout_text && (
            <p className="text-on-surface-variant text-sm mt-1 line-clamp-2 italic">
              &quot;{request.shoutout_text}&quot;
            </p>
          )}
          <p className="text-on-surface-variant text-xs mt-1 flex items-center gap-2">
            <span>↑ {request.upvote_count}</span>
            {request.tip_cents > 0 && (
              <span className="text-tertiary font-semibold">💰 ${(request.tip_cents / 100).toFixed(2)}</span>
            )}
            <span>· {formatTimeAgo(request.created_at)} ago</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {request.state === 'pending' && (
          <>
            <button
              onClick={() => onModerate(request.id, 'rejected')}
              disabled={isPending}
              className="flex-1 py-3 rounded-xl bg-error/10 text-error font-label font-semibold text-lg hover:bg-error/20 active:scale-95 disabled:opacity-50 transition-all"
            >
              Reject
            </button>
            <button
              onClick={() => onModerate(request.id, 'accepted')}
              disabled={isPending}
              className="flex-1 py-3 rounded-xl bg-tertiary/10 text-tertiary font-label font-semibold text-lg hover:bg-tertiary/20 active:scale-95 disabled:opacity-50 transition-all"
            >
              Accept
            </button>
          </>
        )}
        {request.state === 'accepted' && (
          <>
            <button
              onClick={() => onModerate(request.id, 'rejected')}
              disabled={isPending}
              className="flex-1 py-3 rounded-xl bg-error/10 text-error font-label font-semibold text-lg hover:bg-error/20 active:scale-95 disabled:opacity-50 transition-all"
            >
              Reject
            </button>
            <button
              onClick={() => onModerate(request.id, 'played')}
              disabled={isPending}
              className="flex-1 py-3 rounded-xl bg-primary/10 text-primary font-label font-semibold text-lg hover:bg-primary/20 active:scale-95 disabled:opacity-50 transition-all"
            >
              ✓ Played
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep QueueClient
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add "app/(studio)/queue/QueueClient.tsx"
git commit -m "feat: disable moderation buttons during pending action in QueueClient"
```

---

## Task 5: DoorClient — QR scan spinner overlay

**Files:**
- Modify: `app/(manage)/events/[id]/door/DoorClient.tsx`

- [ ] **Step 1: Add `Spinner` import and `scanning` state**

Add import at the top of the file (after the existing imports):
```ts
import { Spinner } from '@/components/ui/Spinner'
```

Add state after `const scanLockRef = useRef(false)`:
```ts
const [scanning, setScanning] = useState(false)
```

- [ ] **Step 2: Wrap `handleQrScan` in try/finally to set `scanning`**

Replace the existing `handleQrScan` (lines 137–176) with:

```ts
const handleQrScan = useCallback(async (text: string) => {
  if (scanLockRef.current) return
  scanLockRef.current = true
  setScanning(true)
  setTimeout(() => { scanLockRef.current = false }, 1500)

  try {
    if (!isOnline) {
      try {
        const parts = text.split('.')
        if (parts.length < 2) throw new Error('bad format')
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        const rsvpId = payload.rsvpId as string
        const cached = getCachedGuestList(eventId)
        const guest = cached?.find((g) => g.id === rsvpId)
        if (!guest) { showToast('QR not recognised', 'error'); return }
        if (guest.status === 'checked_in') { showToast('Already checked in', 'warn'); return }
        applyCheckIn(rsvpId)
        queueCheckIn(eventId, rsvpId)
        showToast('Checked in (offline)', 'ok')
      } catch {
        showToast('Invalid QR code', 'error')
      }
      return
    }

    const result = await verifyAndCheckIn(text)
    if (result.error) {
      showToast(result.error, 'error')
    } else if (result.duplicate) {
      showToast('Already checked in', 'warn')
    } else {
      try {
        const parts = text.split('.')
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        applyCheckIn(payload.rsvpId)
      } catch { /* local state will sync on next page load */ }
      showToast('Checked in ✓', 'ok')
    }
  } finally {
    setScanning(false)
  }
}, [eventId, isOnline, applyCheckIn]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Add spinner overlay to the scan tab**

Replace the existing scan tab content:
```tsx
{tab === 'scan' && (
  <div className="flex-1 px-4">
    <QrScannerWidget onScan={handleQrScan} />
  </div>
)}
```

With:
```tsx
{tab === 'scan' && (
  <div className="flex-1 px-4 relative">
    <QrScannerWidget onScan={handleQrScan} />
    {scanning && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
        <Spinner size={36} />
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep DoorClient
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "app/(manage)/events/[id]/door/DoorClient.tsx"
git commit -m "feat: show spinner overlay during QR scan validation in DoorClient"
```

---

## Task 6: Empty states — Explore, Analytics, Requests pages

**Files:**
- Modify: `app/(attendee)/explore/page.tsx`
- Modify: `app/(manage)/analytics/page.tsx`
- Modify: `app/(attendee)/requests/page.tsx`

- [ ] **Step 1: Replace `app/(attendee)/explore/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ExplorePage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    router.push(`/e/${trimmed}`)
  }

  return (
    <main className="px-4 py-6 pb-24">
      <h1 className="font-headline text-3xl font-bold">
        Find the <span className="text-primary">Pulse.</span>
      </h1>
      <p className="text-on-surface-variant mt-2 text-sm">Have an event code? Jump straight in.</p>

      <form onSubmit={handleJoin} className="mt-6 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Event code (e.g. SPONGY)"
          maxLength={6}
          aria-label="Event code"
          className="flex-1 rounded-full bg-surface-container-highest px-4 py-3 text-on-surface uppercase placeholder:normal-case placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary text-sm tracking-widest"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="px-5 py-3 rounded-full bg-primary text-on-primary font-label font-semibold text-sm disabled:opacity-50 hover:opacity-90 active:scale-95 transition-all"
        >
          Join
        </button>
      </form>

      <div className="mt-10 flex flex-col items-center text-center py-8 text-on-surface-variant">
        <p className="text-4xl mb-3">🎉</p>
        <p className="font-label font-semibold text-on-surface">Event discovery coming soon</p>
        <p className="text-sm mt-1">Browse and discover public events in a future update.</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Replace `app/(manage)/analytics/page.tsx`**

```tsx
export default function AnalyticsPage() {
  return (
    <main className="px-5 py-6 pb-24">
      <h1 className="font-headline text-2xl font-bold">Analytics</h1>
      <div className="mt-12 flex flex-col items-center text-center text-on-surface-variant">
        <p className="text-4xl mb-3">📊</p>
        <p className="font-label font-semibold text-on-surface">Nothing to show yet</p>
        <p className="text-sm mt-1">Analytics appear after your first live event ends.</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Replace `app/(attendee)/requests/page.tsx`**

```tsx
export default function RequestsPage() {
  return (
    <main className="px-4 py-6 pb-24">
      <h1 className="font-headline text-2xl font-bold">My Requests</h1>
      <div className="mt-12 flex flex-col items-center text-center text-on-surface-variant">
        <p className="text-4xl mb-3">🎵</p>
        <p className="font-label font-semibold text-on-surface">No requests yet</p>
        <p className="text-sm mt-1">Head to a live event to request your first song.</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep -E "explore|analytics|requests/page"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "app/(attendee)/explore/page.tsx" "app/(manage)/analytics/page.tsx" "app/(attendee)/requests/page.tsx"
git commit -m "feat: replace stub pages with proper empty states (explore, analytics, requests)"
```

---

## Task 7: Accessibility — `aria-label` on icon buttons

**Files:**
- Modify: `app/(attendee)/live/[eventId]/LiveClient.tsx`
- Modify: `app/(studio)/queue/QueueClient.tsx`

- [ ] **Step 1: Add `aria-label` to LiveClient buttons**

Find the upvote button (the one with `↑ {upvoteCount}`). Add `aria-label`:
```tsx
<button
  onClick={handleUpvote}
  disabled={upvoting}
  aria-label={voted ? 'Remove upvote' : 'Upvote this request'}
  className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-label font-semibold transition-colors ${
    voted
      ? 'bg-primary text-on-primary'
      : 'bg-surface-container-highest text-on-surface-variant'
  }`}
>
  ↑ {upvoteCount} {voted ? 'Upvoted' : 'Upvote'}
</button>
```

Find the Cancel/withdraw button (text "Cancel"). Add `aria-label`:
```tsx
<button
  onClick={handleWithdraw}
  aria-label="Cancel request"
  className="text-on-surface-variant text-xs shrink-0 hover:text-on-surface transition-colors"
>
  Cancel
</button>
```

- [ ] **Step 2: Add `aria-label` to QueueClient buttons**

Find the sort cycle button (text varies by sort mode). Update:
```tsx
<button
  onClick={() => setSort((s) => s === 'newest' ? 'upvotes' : s === 'upvotes' ? 'tips' : 'newest')}
  aria-label={`Sort by: ${sort === 'newest' ? 'newest first' : sort === 'upvotes' ? 'top voted' : 'tips first'}`}
  className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant text-sm font-label"
>
  {sort === 'newest' ? '↓ Newest' : sort === 'upvotes' ? '↑ Top Voted' : '💰 Tips First'}
</button>
```

Find the pause/resume button. Update:
```tsx
<button
  onClick={handlePause}
  aria-label={paused ? 'Resume requests' : 'Pause requests'}
  className={`px-3 py-1.5 rounded-full text-sm font-label font-semibold transition-colors ${
    paused ? 'bg-error text-on-error' : 'bg-surface-container-high text-on-surface-variant'
  }`}
>
  {paused ? 'Paused' : 'Pause'}
</button>
```

- [ ] **Step 3: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep -E "LiveClient|QueueClient"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "app/(attendee)/live/[eventId]/LiveClient.tsx" "app/(studio)/queue/QueueClient.tsx"
git commit -m "feat: add aria-labels to icon buttons in LiveClient and QueueClient"
```

---

## Task 8: Accessibility — keyboard navigation for song search results

**Files:**
- Modify: `app/(attendee)/live/[eventId]/LiveClient.tsx`

- [ ] **Step 1: Add ref declarations**

After the `debounceRef` declaration (around line 45), add:

```ts
const searchInputRef = useRef<HTMLInputElement>(null)
const resultButtonRefs = useRef<(HTMLButtonElement | null)[]>([])
const [focusedResultIndex, setFocusedResultIndex] = useState(-1)
```

- [ ] **Step 2: Reset focused index when results change**

Add a new `useEffect` after the countdown effect:

```ts
useEffect(() => {
  setFocusedResultIndex(-1)
  resultButtonRefs.current = []
}, [results])
```

- [ ] **Step 3: Add `ref` and `onKeyDown` to the search input**

Find the `<input type="search" ...>` element. Add `ref` and `onKeyDown`:

```tsx
<input
  ref={searchInputRef}
  type="search"
  aria-label="Search for a song"
  aria-controls="song-search-results"
  aria-activedescendant={focusedResultIndex >= 0 ? `song-result-${focusedResultIndex}` : undefined}
  placeholder="Search for a song…"
  value={query}
  onChange={(e) => handleQueryChange(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      const next = Math.min(focusedResultIndex + 1, results.length - 1)
      setFocusedResultIndex(next)
      resultButtonRefs.current[next]?.focus()
    }
  }}
  className="w-full rounded-full bg-surface-container-highest px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary"
/>
```

- [ ] **Step 4: Update the results list to use listbox role and keyboard nav**

Replace the results list section (currently in the `!searching` block added in Task 3):

```tsx
{results.length > 0 && !selected && !searching && (
  <ul
    id="song-search-results"
    role="listbox"
    aria-label="Search results"
    className="space-y-2"
  >
    {results.map((track, i) => (
      <li key={track.id} role="option" id={`song-result-${i}`} aria-selected={focusedResultIndex === i}>
        <button
          ref={(el) => { resultButtonRefs.current[i] = el }}
          onClick={() => { setSelected(track); setResults([]); setFocusedResultIndex(-1) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && i < results.length - 1) {
              e.preventDefault()
              const next = i + 1
              setFocusedResultIndex(next)
              resultButtonRefs.current[next]?.focus()
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (i === 0) {
                setFocusedResultIndex(-1)
                searchInputRef.current?.focus()
              } else {
                const prev = i - 1
                setFocusedResultIndex(prev)
                resultButtonRefs.current[prev]?.focus()
              }
            }
          }}
          className="w-full flex gap-3 items-center bg-surface-container-low rounded-xl px-3 py-2.5 text-left focus:outline-none focus:ring-1 focus:ring-secondary hover:bg-surface-container transition-colors"
        >
          {track.albumArtUrl ? (
            <img src={track.albumArtUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-md bg-surface-container-high shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-label font-semibold text-on-surface text-sm truncate">{track.title}</p>
            <p className="text-on-surface-variant text-xs truncate">{track.artist}</p>
          </div>
        </button>
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 5: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep LiveClient
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add "app/(attendee)/live/[eventId]/LiveClient.tsx"
git commit -m "feat: keyboard nav (ArrowUp/Down/Enter) for song search results"
```

---

## Task 9: Accessibility — TipModal focus trap

**Files:**
- Modify: `app/(attendee)/live/[eventId]/TipModal.tsx`

- [ ] **Step 1: Update the React import in `TipModal.tsx`**

`TipModal.tsx` currently only imports `useState`. Replace the import line:

```ts
// Before:
import { useState } from 'react'
// After:
import { useState, useRef, useEffect } from 'react'
```

- [ ] **Step 2: Add focus trap ref and effect to `TipFormInner`**

Add a ref and effect to `TipFormInner`:

After the existing state declarations (around line 32, after `const [clientSecret, setClientSecret] = useState`), add the ref and effect:

```ts
const modalRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  const modal = modalRef.current
  if (!modal) return

  const focusable = Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  )
  focusable[0]?.focus()

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key !== 'Tab') return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [onClose])
```

- [ ] **Step 3: Add `ref`, `role`, `aria-modal`, and `aria-label` to the modal panel div**

Find the inner content div (`className="w-full max-w-md bg-surface rounded-t-3xl p-6 space-y-5"`). Update to:

```tsx
<div
  ref={modalRef}
  role="dialog"
  aria-modal="true"
  aria-label="Send a tip"
  className="w-full max-w-md bg-surface rounded-t-3xl p-6 space-y-5"
  onClick={(e) => e.stopPropagation()}
>
```

- [ ] **Step 4: Add `aria-label` to the close button**

Find `<button onClick={onClose} className="text-on-surface-variant text-2xl">✕</button>`. Update to:

```tsx
<button onClick={onClose} aria-label="Close tip modal" className="text-on-surface-variant text-2xl hover:opacity-80 transition-opacity">✕</button>
```

- [ ] **Step 5: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep TipModal
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add "app/(attendee)/live/[eventId]/TipModal.tsx"
git commit -m "feat: focus trap + Escape-to-close + aria attributes in TipModal"
```

---

## Task 10: Accessibility — skip-to-main-content link

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/(attendee)/layout.tsx`

- [ ] **Step 1: Add skip link to `app/layout.tsx`**

Inside `<body ...>`, add the skip link as the FIRST child before `<NativeTokenSync />`:

```tsx
<body
  className={`${spaceGrotesk.variable} ${beVietnamPro.variable} bg-background text-on-surface font-body antialiased overflow-x-hidden selection:bg-primary selection:text-on-primary-fixed`}
>
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-full focus:bg-primary focus:text-on-primary focus:font-label focus:font-semibold focus:text-sm"
  >
    Skip to main content
  </a>
  <NativeTokenSync />
  {children}
</body>
```

- [ ] **Step 2: Add `id="main-content"` to `app/(attendee)/layout.tsx`**

Update the content wrapper div:

```tsx
export default function AttendeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div id="main-content" className="flex-1 pb-20">
        {children}
      </div>
      <BottomNav variant="attendee" />
    </div>
  )
}
```

- [ ] **Step 3: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep -E "layout"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx "app/(attendee)/layout.tsx"
git commit -m "feat: add skip-to-main-content link in root layout"
```

---

## Task 11: Visual consistency pass

**Files:**
- Modify: `app/(attendee)/profile/page.tsx`
- Modify: `app/(attendee)/alerts/page.tsx`

**Note:** Explore, Requests, and Analytics pages were already fixed in Task 6. The manage and studio pages already use correct heading scale and padding (`px-5 py-6`, `text-2xl`). This task covers the remaining attendee stubs.

- [ ] **Step 1: Fix `app/(attendee)/profile/page.tsx`**

Replace the full file:

```tsx
import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'

export default function ProfilePage() {
  return (
    <main className="px-4 py-6 pb-24 space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold">Profile</h1>
        <p className="text-on-surface-variant mt-1 text-sm">Account settings — coming soon.</p>
      </div>

      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full text-error border-error/30">
          Sign out
        </Button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Fix `app/(attendee)/alerts/page.tsx`**

Replace the full file:

```tsx
export default function AlertsPage() {
  return (
    <main className="px-4 py-6 pb-24">
      <h1 className="font-headline text-2xl font-bold">Alerts</h1>
      <div className="mt-12 flex flex-col items-center text-center text-on-surface-variant">
        <p className="text-4xl mb-3">🔔</p>
        <p className="font-label font-semibold text-on-surface">No alerts yet</p>
        <p className="text-sm mt-1">Event updates and notifications will appear here.</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep -E "profile|alerts"
```

Expected: no output.

- [ ] **Step 4: Final full tsc check**

```bash
npx tsc --noEmit 2>&1 | grep -v "^mobile/"
```

Expected: no output.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests passing (no regressions from UI changes).

- [ ] **Step 6: Commit**

```bash
git add "app/(attendee)/profile/page.tsx" "app/(attendee)/alerts/page.tsx"
git commit -m "fix: visual consistency — heading scale and pb-24 on profile and alerts pages"
```
