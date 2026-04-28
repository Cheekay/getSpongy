# Attendee Queue View — Design Spec

**Date:** 2026-04-28
**Status:** Approved

## Summary

Add a public "Queue" tab to the attendee Live page (`/live/[eventId]`) showing all DJ-accepted song requests in real-time. Any checked-in attendee can upvote any accepted request, with one upvote per song per user. Songs are sorted by upvote count descending, with time-accepted as a tiebreaker.

---

## 1. User Stories

- As an attendee, I can switch between "My Request" and "Queue" tabs on the Live page.
- As an attendee, I can see all songs the DJ has accepted, sorted by crowd upvotes.
- As an attendee, I can upvote any accepted song (including ones I didn't submit), limited to one upvote per song.
- As an attendee, I can toggle my upvote off by tapping again.
- The queue updates in real-time as the DJ accepts new requests or attendees upvote.

---

## 2. Layout

**Tab switcher** — pill-style row below the live event header:
- `My Request` tab — existing request submission + status UI (unchanged)
- `Queue` tab — accepted songs list with upvote buttons; badge shows count

**Queue tab content:**
- Section label: "Up Next"
- Each row: album art thumbnail | track title + artist | upvote button (`↑ N`)
- Upvote button states: filled primary (already upvoted by me) / outlined grey (not yet upvoted)
- Empty state: "No songs accepted yet — check back soon 🎵"

---

## 3. Data Flow

### Server-side (page.tsx)
Add a query for initial accepted requests, passed to `LiveClient` as `initialQueue: RequestPayload[]`:

```ts
supabase
  .from('song_requests')
  .select('*')
  .eq('event_id', eventId)
  .eq('state', 'accepted')
  .order('upvote_count', { ascending: false })
  .order('state_changed_at', { ascending: true })
```

Also fetch the current user's upvoted request IDs for the event (from the `upvotes` table), passed as `initialUpvotedIds: string[]`, so the upvote button renders the correct state on first paint.

### Client-side state (LiveClient)
Three new state values:
- `activeTab: 'my-request' | 'queue'` — defaults to `'my-request'`
- `acceptedQueue: RequestPayload[]` — initialised from `initialQueue`
- `upvotedIds: Set<string>` — initialised from `initialUpvotedIds`

### Realtime (existing channel)
The existing `subscribeToRequests` handler currently filters to `payload.user_id === userId`. Extend it to also maintain the queue. The two branches are **not mutually exclusive** — a user's own accepted request must update both `myRequest` and `acceptedQueue`:

```
on any song_requests change for this event:
  if payload.user_id === userId → existing own-request logic (unchanged)
  if payload.state === 'accepted' → upsert into acceptedQueue, re-sort
  else → remove payload.id from acceptedQueue (state changed away from accepted)
```

Sort order after every upsert: `upvote_count DESC`, `state_changed_at ASC`.

No new Supabase channel required.

---

## 4. Components

### Modified: `LiveClient.tsx`
- Add `initialQueue` and `initialUpvotedIds` props
- Add `activeTab`, `acceptedQueue`, `upvotedIds` state
- Add tab switcher UI (pill row)
- Extend realtime handler to maintain `acceptedQueue`
- Render `<QueueTab>` when `activeTab === 'queue'`

### New: `QueueTab.tsx` (same directory as `LiveClient.tsx`)
Props:
```ts
{
  queue: RequestPayload[]
  upvotedIds: Set<string>
  onUpvote: (requestId: string) => Promise<void>
}
```
Renders the sorted list. Calls `onUpvote` (handled in LiveClient) on button tap. Optimistic update: toggle the ID in `upvotedIds` and adjust count immediately, roll back on error.

---

## 5. Server Action Change

**File:** `lib/actions/upvotes.ts`

Change the state guard from:
```ts
if (request.state !== 'pending') return { error: 'Can only upvote pending requests' }
```
to:
```ts
if (!['pending', 'accepted'].includes(request.state)) return { error: 'Can only upvote active requests' }
```

All other logic (unique constraint enforcement, count update, toggle) is unchanged. The `checked_in` requirement is preserved.

---

## 6. Upvote UX

- **Optimistic update:** button flips to filled/outlined immediately; server confirms or rolls back
- **One vote per song:** enforced by `UNIQUE(request_id, user_id)` in the database and the toggle logic in the server action
- **No self-upvote restriction:** any checked-in attendee can upvote any accepted request including their own
- **Checked-in requirement:** upvoting requires `rsvp.status === 'checked_in'`; unauthenticated or non-checked-in users see an error toast

---

## 7. Edge Cases

| Scenario | Behaviour |
|---|---|
| DJ un-accepts a request (back to pending) | Row removed from queue in real-time |
| DJ marks a request as played | Row removed from queue |
| No accepted requests | Empty state: "No songs accepted yet — check back soon 🎵" |
| User not checked in taps upvote | Error toast: "Must be checked in to upvote" |
| Queue tab badge when count is 0 | Badge hidden |

---

## 8. Files Changed

| File | Change |
|---|---|
| `app/(attendee)/live/[eventId]/page.tsx` | Add `initialQueue` + `initialUpvotedIds` queries |
| `app/(attendee)/live/[eventId]/LiveClient.tsx` | Tab switcher, new state, extended realtime handler |
| `app/(attendee)/live/[eventId]/QueueTab.tsx` | New component |
| `lib/actions/upvotes.ts` | Extend state guard to include `accepted` |
