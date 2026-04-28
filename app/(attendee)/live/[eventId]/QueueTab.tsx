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
              aria-label={voted ? `Remove upvote — ${track.upvote_count} upvotes` : `Upvote this song — ${track.upvote_count} upvotes`}
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
