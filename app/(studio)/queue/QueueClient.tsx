'use client'

import { useState, useEffect, useCallback } from 'react'
import { subscribeToRequests, type RequestPayload } from '@/lib/supabase/realtime'
import { moderateRequest, revertRequest, pauseRequests, type ModerateAction } from '@/lib/actions/moderation'

type EventData = {
  id: string
  title: string
  requests_paused: boolean
  requests_paused_until: string | null
}

type SortMode = 'newest' | 'upvotes' | 'tips'

type UndoItem = {
  requestId: string
  previousState: string
  label: string
  timer: ReturnType<typeof setTimeout>
}

function formatTimeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h`
}

export default function QueueClient({
  event,
  initialRequests,
}: {
  event: EventData
  initialRequests: RequestPayload[]
}) {
  const [requests, setRequests] = useState<RequestPayload[]>(initialRequests)
  const [sort, setSort] = useState<SortMode>('newest')
  const [paused, setPaused] = useState(event.requests_paused)
  const [undoItem, setUndoItem] = useState<UndoItem | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Realtime: merge incoming request changes
  useEffect(() => {
    const unsub = subscribeToRequests(event.id, (payload) => {
      setRequests((prev) => {
        const idx = prev.findIndex((r) => r.id === payload.id)
        const isActive = ['pending', 'accepted'].includes(payload.state)
        if (idx >= 0) {
          const next = [...prev]
          if (isActive) {
            next[idx] = payload
          } else {
            next.splice(idx, 1)
          }
          return next
        }
        return isActive ? [payload, ...prev] : prev
      })
    })
    return unsub
  }, [event.id])

  const sorted = [...requests].sort((a, b) => {
    if (sort === 'upvotes') return b.upvote_count - a.upvote_count || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sort === 'tips') return b.tip_cents - a.tip_cents || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

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

  const handleUndo = useCallback(async () => {
    if (!undoItem) return
    clearTimeout(undoItem.timer)
    const item = undoItem
    setUndoItem(null)

    // Re-insert with previous state
    setRequests((prev) => {
      const exists = prev.find((r) => r.id === item.requestId)
      if (exists) return prev
      const original = initialRequests.find((r) => r.id === item.requestId)
      if (!original) return prev
      return [{ ...original, state: item.previousState as RequestPayload['state'] }, ...prev]
    })

    await revertRequest(item.requestId)
  }, [undoItem, initialRequests])

  const handlePause = useCallback(async () => {
    const next = !paused
    setPaused(next)
    const pausedUntil = next ? new Date(Date.now() + 10 * 60 * 1000) : undefined
    const { error } = await pauseRequests(event.id, next, pausedUntil)
    if (error) setPaused(!next)
  }, [paused, event.id])

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between bg-surface-container-low border-b border-outline-variant">
        <div>
          <p className="text-on-surface-variant text-xs font-label uppercase tracking-wider">DJ Dashboard</p>
          <h1 className="font-headline font-bold text-lg text-on-surface truncate max-w-[200px]">{event.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSort((s) => s === 'newest' ? 'upvotes' : s === 'upvotes' ? 'tips' : 'newest')}
            className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant text-sm font-label"
          >
            {sort === 'newest' ? '↓ Newest' : sort === 'upvotes' ? '↑ Top Voted' : '💰 Tips First'}
          </button>
          <button
            onClick={handlePause}
            className={`px-3 py-1.5 rounded-full text-sm font-label font-semibold transition-colors ${
              paused ? 'bg-error text-on-error' : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            {paused ? 'Paused' : 'Pause'}
          </button>
        </div>
      </div>

      {/* Request feed */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-28">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
            <p className="text-lg font-label">Queue is empty</p>
            <p className="text-sm mt-1">New requests will appear here in real time</p>
          </div>
        ) : (
          sorted.map((req) => (
            <RequestCard key={req.id} request={req} onModerate={handleModerate} formatTimeAgo={formatTimeAgo} isPending={pendingId === req.id} />
          ))
        )}
      </div>

      {/* Undo toast */}
      {undoItem && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface-container-highest px-4 py-2.5 rounded-full shadow-lg">
          <span className="text-sm text-on-surface font-label capitalize">{undoItem.label}</span>
          <button onClick={handleUndo} className="text-secondary text-sm font-semibold font-label">
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

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
