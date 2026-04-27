# Polish & Testing Pass — Design Spec
**Date:** 2026-04-27
**Status:** Approved

## Overview

Pre-production quality pass across two parallel tracks before the Vercel/Supabase prod deploy.

- **Track 1 (Code Quality):** TypeScript error fixes + new test cases for coverage gaps
- **Track 2 (UX Polish):** Bug fix for the rejected/played request loop + loading/empty states + accessibility + visual consistency

Both tracks run in parallel via isolated git worktrees. Track 1 primarily targets `lib/`, `tests/`, and a small number of `app/` files for TypeScript fixes (`app/(manage)/events/[id]/page.tsx`, `app/(manage)/events/EventList.tsx`). Track 2 targets `app/` and `components/` for UX work. The two manage-route files touched by Track 1 may also receive visual-consistency edits in Track 2 — merge Track 1 first to avoid conflicts.

---

## Track 1 — Code Quality

### TypeScript Fixes

**1. `lib/stripe.ts` — stale API version**
- Change `"2025-01-27.acacia"` → `"2026-03-25.dahlia"` in the Stripe constructor options.

**2. `lib/jwt.ts` — `KeyLike` removed from jose**
- Replace `import { ..., KeyLike } from 'jose'` with `CryptoKey | Uint8Array` inline type.
- Fix `QrPayload as Record<string, unknown>` cast: route through `unknown` first (`payload as unknown as Record<string, unknown>`).

**3. `lib/actions/tiers.ts` — broken array-as-object casts**
- Two locations cast `{ organizer_id: any }[] | undefined` directly to `{ organizer_id: string } | null`.
- Fix: use `result?.[0] ?? null` before the cast, or use `.single()` on the query if only one row is expected.

**4. Form action return types — `app/(manage)/events/[id]/page.tsx` and `app/(manage)/events/EventList.tsx`**
- Next.js `<form action={...}>` prop expects `(formData: FormData) => void | Promise<void>`.
- Our server actions return `Promise<{ error?: string }>`.
- Fix: void-wrap each handler at the call site: `action={() => { void publishEvent(...) }}` or extract to a local async function with no return value annotation.

**5. Install missing Stripe frontend packages**
- Run `npm install @stripe/stripe-js @stripe/react-stripe-js`.
- These are already used in `app/(attendee)/e/[code]/PaymentForm.tsx` and `app/(attendee)/live/[eventId]/TipModal.tsx` but were never installed as dependencies.

**6. `tests/lib/stripe.test.ts` — private property access**
- Remove assertions on `.key` and `.options` (non-public Stripe SDK internals).
- Replace with assertions on public-facing behavior (e.g., the returned client is an instance of the expected type, or spy on `stripe.charges.create`).

---

### New Test Cases

#### `tests/lib/actions/requests.test.ts`

| Test | Description |
|---|---|
| `submitRequest → returns error when user has no RSVP` | `rsvpCount` comes back as 0 → expect `{ error: 'You must RSVP before submitting requests' }` |
| `submitRequest → returns retryAfterSeconds on rate-limited submission` | `recentCount > 0` path → expect `result.retryAfterSeconds` to be a positive integer |
| `submitRequest → returns error when DB insert fails` | Service client insert returns `{ error: { message: 'DB error' } }` → expect `{ error: 'DB error' }` |

#### `tests/lib/actions/moderation.test.ts`

| Test | Description |
|---|---|
| `moderateRequest → played action succeeds when request is accepted` | Request state is `accepted`, action is `played` → expect no error |
| `moderateRequest → rejected action succeeds on an accepted request` | Request state is `accepted`, action is `rejected` → expect no error |
| `revertRequest → succeeds reverting a rejected request` | Request state is `rejected` → revert sets it back to pending, no error |
| `revertRequest → returns error when request is in non-revertable state` | Request state is `played` → expect `{ error: 'Can only revert accepted or rejected requests' }` |

#### `tests/lib/supabase/realtime.test.ts`

| Test | Description |
|---|---|
| `subscribeToRequests → invokes callback with payload.new on change` | Capture the handler passed to `.on()`, call it with `{ new: mockPayload }`, expect `onUpdate` called with `mockPayload` |
| `subscribeToCheckIns → invokes callback with payload.new on change` | Same pattern for the check-in channel |

---

## Track 2 — UX Polish

### Bug Fix: LiveClient Rejected/Played Loop

**Root cause:** `LiveClient` realtime handler calls `setMyRequest(payload)` for all state transitions, including terminal ones (`rejected`, `played`, `expired`, `withdrawn`). The search form only shows when `myRequest` is null, so a rejected attendee is stuck with no way to submit again short of a page refresh.

**Fix:**
1. In the `subscribeToRequests` callback inside `LiveClient`, check if the incoming state is terminal.
2. For terminal states: set `myRequest` to null (clears the form block) and set a new `toastMessage` state string (e.g., `"✕ Your request was rejected"` or `"🎵 Your song was played!"`).
3. Render a non-blocking toast at the top of the live page that auto-dismisses after 2.5s via `setTimeout`.
4. The search form reappears immediately after the toast is set (it only blocks on `myRequest !== null`).

**Rate-limit note:** A rejected request still counts against the 10-minute rate limit (by design — the PRD doesn't distinguish). After dismissal, the rate-limit countdown UI already handles this correctly.

---

### Loading States

**Spotify search (LiveClient):**
- Add `searching` boolean state, set true when debounce fires, false when results arrive.
- While `searching && !selected`, render 3 skeleton rows (rounded-xl, h-14, animate-pulse) instead of the empty results list.

**DJ queue moderation buttons (QueueClient):**
- Add `pendingId` state (string | null). Set it to the request ID when `handleModerate` is called, clear it on resolution.
- Disable both action buttons on the card matching `pendingId` while the action is in-flight.

**Door scanner (DoorClient):**
- Add a `scanning` boolean. Show a `<Spinner />` component overlay during QR validation (between scan and result display).

---

### Empty States

**Explore page (`app/(attendee)/explore/page.tsx`):**
- Replace the current stub with:
  - Header: "Find your next event"
  - A join-by-code input (text field + "Join" button) that navigates to `/e/[code]`
  - A placeholder section for event cards (Phase 1 note: discovery feed comes in a future phase)

**Analytics page (`app/(manage)/analytics/page.tsx`):**
- If no events have ended yet (or event has no check-in data), show: "Nothing to show yet — analytics appear after your first live event."

**Requests history page (`app/(attendee)/requests/page.tsx`):**
- If the user has no song request history, show: "No requests yet — head to a live event to get started."

---

### Accessibility

**Icon-only buttons — add `aria-label`:**
- LiveClient: Cancel button (`aria-label="Cancel request"`), Remove selected track button (`aria-label="Remove selected track"` — already present ✓), Upvote button (`aria-label="Upvote this request"`)
- QueueClient: Sort cycle button (`aria-label="Change sort order"`), Pause/Resume button (`aria-label={paused ? 'Resume requests' : 'Pause requests'}`)

**Song search results — keyboard navigation:**
- Wrap results in `<ul role="listbox" aria-label="Search results">` with each result as `<li role="option">`.
- Add `onKeyDown` on the search input: `ArrowDown` focuses first result, `ArrowUp`/`ArrowDown` navigate the list, `Enter` selects focused item.
- Selected item gets `aria-selected="true"`.

**TipModal — focus trap:**
- On mount, move focus to the first interactive element inside the modal.
- Trap Tab/Shift+Tab within the modal while open.
- `Escape` key calls `onClose`.

**Skip link:**
- Add `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to main content</a>` as the first element in `app/layout.tsx`.
- Add `id="main-content"` to the `<main>` element in the attendee layout.

---

### Visual Consistency Pass

**Typography audit (all attendee + manage routes):**
- Page titles: `font-headline text-2xl font-bold` (or `text-3xl` for hero headings).
- Section labels / metadata: `font-label text-xs uppercase tracking-wider text-on-surface-variant`.
- Body copy: `text-sm text-on-surface-variant`.
- Fix any raw `font-bold` or inline `text-xl` that bypasses the design token scale.

**Bottom nav clearance:**
- Confirm all attendee `<main>` elements use `pb-24` so content clears the bottom nav.
- Routes to audit: `/explore`, `/requests`, `/profile`, `/alerts`, `/live/[eventId]`.

**Interactive element states:**
- All `<button>` elements must have at minimum `hover:opacity-80` (or a token-based hover) and `disabled:opacity-50`.
- All `<a>` used as buttons must have `hover:` and `focus-visible:ring-2` variants.
- Audit: LiveClient submit, QueueClient action buttons, DoorClient scan button, form submits across manage routes.

**Page padding consistency:**
- Attendee pages: `px-4 py-6`.
- Manage pages: `px-5 py-6`.
- Studio (DJ) pages: match existing `px-5 py-4` established in QueueClient header.

---

## Out of Scope

- End-to-end / integration tests (no Playwright/Cypress in this pass)
- New feature work
- Mobile (`mobile/`) TypeScript fixes — mobile has its own tsconfig with Expo deps; those errors are expected in the root `tsc` run
- Visual redesign or brand changes
- Performance optimization / bundle analysis

---

## Success Criteria

- `npx tsc --noEmit` produces zero errors for the web app (mobile excluded via path filter)
- `npm test` passes with ≥ 228 tests (219 current + 9 new: 3 requests + 4 moderation + 2 realtime)
- All interactive elements in the core wedge (LiveClient, QueueClient) have `aria-label`, keyboard support, and visible focus rings
- No stuck UI state after request rejection/played in LiveClient
- Loading skeletons visible during Spotify search
- All empty-state routes show a real UI instead of stubs or blank space
