'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { subscribeToRequests, type RequestPayload } from '@/lib/supabase/realtime'
import { submitRequest, withdrawRequest } from '@/lib/actions/requests'
import { toggleUpvote } from '@/lib/actions/upvotes'
import type { SpotifyTrack } from '@/lib/spotify'
import dynamic from 'next/dynamic'
const TipModal = dynamic(() => import('./TipModal'), { ssr: false })
const QueueTab = dynamic(() => import('./QueueTab'), { ssr: false })

type EventData = {
  id: string
  title: string
  requests_paused: boolean
  requests_paused_until: string | null
  tips_enabled: boolean
  min_tip_cents: number
}

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
  const [myRequest, setMyRequest] = useState<RequestPayload | null>(initialMyRequest)
  const [upvoteCount, setUpvoteCount] = useState(initialMyRequest?.upvote_count ?? 0)
  const [voted, setVoted] = useState(false)
  const [upvoting, setUpvoting] = useState(false)
  const [paused, setPaused] = useState(event.requests_paused)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotifyTrack[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SpotifyTrack | null>(null)
  const [shoutout, setShoutout] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const [tipRequestId, setTipRequestId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'my-request' | 'queue'>('my-request')
  const [acceptedQueue, setAcceptedQueue] = useState<RequestPayload[]>(initialQueue)
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set(initialUpvotedIds))
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultButtonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [focusedResultIndex, setFocusedResultIndex] = useState(-1)

  // Watch own request + queue state changes via realtime
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

  // Watch event pause state via realtime
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supabase
      .channel(`event-pause-${event.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${event.id}` },
        (payload) => {
          setPaused((payload.new as { requests_paused: boolean }).requests_paused)
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event.id])

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  // Countdown for rate limit
  useEffect(() => {
    if (!retryAfter || retryAfter <= 0) { setRetryAfter(null); return }
    const id = setInterval(() => setRetryAfter((s) => (s && s > 1 ? s - 1 : null)), 1000)
    return () => clearInterval(id)
  }, [retryAfter])

  // Auto-dismiss toast after 2.5 seconds
  useEffect(() => {
    if (!toastMessage) return
    const id = setTimeout(() => setToastMessage(null), 2500)
    return () => clearTimeout(id)
  }, [toastMessage])

  // Reset focused index when results change
  useEffect(() => {
    setFocusedResultIndex(-1)
    resultButtonRefs.current = []
  }, [results])

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

  async function handleSubmit() {
    if (!selected) return
    setSubmitting(true)
    setSubmitError(null)
    const result = await submitRequest({
      eventId: event.id,
      spotifyTrackId: selected.id,
      trackTitle: selected.title,
      trackArtist: selected.artist,
      albumArtUrl: selected.albumArtUrl,
      shoutoutText: shoutout.trim() || undefined,
    })
    setSubmitting(false)
    if (result.error) {
      setSubmitError(result.error)
      if (result.retryAfterSeconds) setRetryAfter(result.retryAfterSeconds)
    } else {
      setSelected(null)
      setQuery('')
      setShoutout('')
    }
  }

  async function handleWithdraw() {
    if (!myRequest) return
    const result = await withdrawRequest(myRequest.id)
    if (result.error) return
    setMyRequest(null)
  }

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

  async function handleUpvote() {
    if (!myRequest || myRequest.state !== 'pending' || upvoting) return
    const prev = { voted, count: upvoteCount }
    setVoted((v) => !v)
    setUpvoteCount((c) => prev.voted ? Math.max(0, c - 1) : c + 1)
    setUpvoting(true)

    const result = await toggleUpvote(myRequest.id)
    setUpvoting(false)
    if (result.error) {
      setVoted(prev.voted)
      setUpvoteCount(prev.count)
    } else {
      setVoted(result.voted!)
      setUpvoteCount(result.count!)
    }
  }

  // Paused state
  if (paused) {
    const etaMin = event.requests_paused_until
      ? Math.ceil((new Date(event.requests_paused_until).getTime() - Date.now()) / 60000)
      : null
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-surface-container-high flex items-center justify-center mb-4 text-2xl">
          🎧
        </div>
        <h1 className="font-headline text-2xl font-bold">DJ is in the mix</h1>
        <p className="text-on-surface-variant mt-2">
          Requests are paused{etaMin && etaMin > 0 ? ` — back in ~${etaMin} min` : ' right now'}.
        </p>
      </main>
    )
  }

  const isRequestActive = myRequest && ['pending', 'accepted', 'played', 'rejected'].includes(myRequest.state)

  const statusLabel =
    myRequest?.state === 'accepted' ? '✓ Accepted'
    : myRequest?.state === 'played'   ? '🎵 Played!'
    : myRequest?.state === 'rejected' ? '✕ Rejected'
    : '⏳ Pending'

  const statusCardClass =
    myRequest?.state === 'accepted' ? 'bg-tertiary/10 ring-1 ring-tertiary/30'
    : myRequest?.state === 'rejected' ? 'bg-error/10'
    : 'bg-surface-container-low'

  const statusLabelClass =
    myRequest?.state === 'accepted' ? 'text-tertiary'
    : myRequest?.state === 'rejected' ? 'text-error'
    : 'text-on-surface-variant'

  return (
    <main className="px-4 py-6 pb-24 flex flex-col gap-5">
      {/* Live header */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
        <span className="font-label text-xs text-tertiary uppercase tracking-wider">{event.title}</span>
      </div>

      {toastMessage && (
        <div
          aria-live="polite"
          className="rounded-xl px-4 py-3 bg-surface-container-high text-on-surface text-sm font-label text-center"
        >
          {toastMessage}
        </div>
      )}

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

      {activeTab === 'my-request' && (
        <>
          {/* My active request */}
          {isRequestActive && myRequest && (
            <>
              <div className={`rounded-2xl p-4 flex gap-3 items-start ${statusCardClass}`}>
                {myRequest.album_art_url && (
                  <img src={myRequest.album_art_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-label font-semibold text-on-surface truncate">{myRequest.track_title}</p>
                  <p className="text-on-surface-variant text-sm truncate">{myRequest.track_artist}</p>
                  <p className={`text-xs mt-1 font-label font-semibold ${statusLabelClass}`}>
                    {statusLabel}
                  </p>
                  {myRequest.state === 'pending' && (
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
                  )}
                </div>
                {myRequest.state === 'pending' && (
                  <button onClick={handleWithdraw} aria-label="Cancel request" className="text-on-surface-variant text-xs shrink-0">
                    Cancel
                  </button>
                )}
              </div>
              {myRequest.state === 'pending' && event.tips_enabled && (
                <button
                  onClick={() => setTipRequestId(myRequest.id)}
                  className="mt-2 px-4 py-1.5 rounded-full bg-surface-container-highest text-on-surface-variant text-xs font-label font-semibold"
                >
                  💰 Tip to boost
                </button>
              )}
            </>
          )}

          {/* Rate limit countdown */}
          {retryAfter && !myRequest && (
            <div className="text-center text-on-surface-variant text-sm">
              Next request in{' '}
              <span className="font-label font-semibold text-on-surface">
                {Math.floor(retryAfter / 60)}:{String(retryAfter % 60).padStart(2, '0')}
              </span>
            </div>
          )}

          {/* Search + submit (hidden when user has active request or rate-limited) */}
          {!myRequest && !retryAfter && (
            <div className="flex flex-col gap-4">
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

              {/* Selected track + shoutout + submit */}
              {selected && (
                <div className="space-y-3">
                  <div className="flex gap-3 items-center bg-surface-container-low rounded-xl px-3 py-3">
                    {selected.albumArtUrl ? (
                      <img src={selected.albumArtUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-surface-container-high shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-label font-semibold text-on-surface truncate">{selected.title}</p>
                      <p className="text-on-surface-variant text-sm truncate">{selected.artist}</p>
                    </div>
                    <button onClick={() => setSelected(null)} aria-label="Remove selected track" className="text-on-surface-variant px-2 shrink-0">
                      ✕
                    </button>
                  </div>

                  <textarea
                    placeholder="Add a shoutout (optional)"
                    maxLength={140}
                    value={shoutout}
                    onChange={(e) => setShoutout(e.target.value)}
                    rows={2}
                    className="w-full bg-surface-container-highest rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary resize-none text-sm"
                  />
                  <p className="text-right text-xs text-on-surface-variant">{shoutout.length}/140</p>

                  {submitError && (
                    <p className="text-error text-sm text-center">{submitError}</p>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full py-3.5 rounded-full bg-primary text-on-primary font-label font-semibold text-base disabled:opacity-50"
                  >
                    {submitting ? 'Sending…' : 'Request Song'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tipRequestId && (
        <TipModal
          requestId={tipRequestId}
          minTipCents={event.min_tip_cents}
          onSuccess={() => setTipRequestId(null)}
          onClose={() => setTipRequestId(null)}
        />
      )}

      <div className="px-4 pb-4">
        <a
          href={`/tickets/${rsvpId}/transfer`}
          className="block text-center text-on-surface-variant text-xs underline"
        >
          Transfer my ticket →
        </a>
      </div>

      {/* Queue tab */}
      {activeTab === 'queue' && (
        <QueueTab
          queue={acceptedQueue}
          upvotedIds={upvotedIds}
          onUpvote={handleQueueUpvote}
        />
      )}
    </main>
  )
}
