'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { subscribeToRequests, type RequestPayload } from '@/lib/supabase/realtime'
import { submitRequest, withdrawRequest } from '@/lib/actions/requests'
import type { SpotifyTrack } from '@/lib/spotify'

type EventData = {
  id: string
  title: string
  requests_paused: boolean
  requests_paused_until: string | null
}

export default function LiveClient({
  event,
  userId,
  initialMyRequest,
}: {
  event: EventData
  userId: string
  initialMyRequest: RequestPayload | null
}) {
  const [myRequest, setMyRequest] = useState<RequestPayload | null>(initialMyRequest)
  const [paused, setPaused] = useState(event.requests_paused)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotifyTrack[]>([])
  const [selected, setSelected] = useState<SpotifyTrack | null>(null)
  const [shoutout, setShoutout] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Watch own request state changes via realtime
  useEffect(() => {
    const unsub = subscribeToRequests(event.id, (payload) => {
      if (payload.user_id === userId) setMyRequest(payload)
    })
    return unsub
  }, [event.id, userId])

  // Countdown for rate limit
  useEffect(() => {
    if (!retryAfter || retryAfter <= 0) { setRetryAfter(null); return }
    const id = setInterval(() => setRetryAfter((s) => (s && s > 1 ? s - 1 : null)), 1000)
    return () => clearInterval(id)
  }, [retryAfter])

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q)
    setSelected(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim() || q.length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.tracks ?? [])
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
    await withdrawRequest(myRequest.id)
    setMyRequest(null)
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

      {/* My active request */}
      {isRequestActive && myRequest && (
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
          </div>
          {myRequest.state === 'pending' && (
            <button onClick={handleWithdraw} className="text-on-surface-variant text-xs shrink-0">
              Cancel
            </button>
          )}
        </div>
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
            type="search"
            placeholder="Search for a song…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="w-full rounded-full bg-surface-container-highest px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary"
          />

          {/* Search results */}
          {results.length > 0 && !selected && (
            <div className="space-y-2">
              {results.map((track) => (
                <button
                  key={track.id}
                  onClick={() => { setSelected(track); setResults([]) }}
                  className="w-full flex gap-3 items-center bg-surface-container-low rounded-xl px-3 py-2.5 text-left"
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
                <button onClick={() => setSelected(null)} className="text-on-surface-variant px-2 shrink-0">
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
    </main>
  )
}
