'use client'

import { useState } from 'react'
import Link from 'next/link'
import { goLive, endEvent } from '@/lib/actions/events'
import { Chip } from '@/components/ui/Chip'

type EventRow = {
  id: string
  title: string
  start_at: string
  state: string
  cover_image_url: string | null
  event_code: string
}

type Filter = 'all' | 'upcoming' | 'live' | 'past'

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Live', value: 'live' },
  { label: 'Past', value: 'past' },
]

function filterEvents(events: EventRow[], filter: Filter): EventRow[] {
  if (filter === 'all') return events
  if (filter === 'live') return events.filter(e => e.state === 'live')
  if (filter === 'upcoming') return events.filter(e => ['draft', 'published'].includes(e.state))
  return events.filter(e => ['ended', 'archived'].includes(e.state))
}

export default function EventList({ events }: { events: EventRow[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const visible = filterEvents(events, filter)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-label transition-colors ${
              filter === f.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-on-surface-variant text-center py-12">No events yet.</p>
      )}

      {visible.map(event => (
        <div key={event.id} className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-headline font-bold text-lg truncate">{event.title}</h2>
              <p className="text-on-surface-variant text-sm">
                {new Date(event.start_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </p>
            </div>
            <StateChip state={event.state} />
          </div>

          <div className="flex items-center gap-3">
            {event.state === 'published' && (
              <form action={goLive.bind(null, event.id) as unknown as (formData: FormData) => Promise<void>}>
                <button type="submit" className="text-tertiary text-sm font-label font-semibold">
                  Go Live →
                </button>
              </form>
            )}
            {event.state === 'live' && (
              <>
                <Link href={`/events/${event.id}/door`} className="text-secondary text-sm">
                  Manage Door →
                </Link>
                <form action={endEvent.bind(null, event.id) as unknown as (formData: FormData) => Promise<void>}>
                  <button type="submit" className="text-on-surface-variant text-sm">
                    End Event
                  </button>
                </form>
              </>
            )}
            {['ended', 'archived'].includes(event.state) && (
              <Link href={`/events/${event.id}`} className="text-secondary text-sm">
                View Report →
              </Link>
            )}
            {['draft', 'published'].includes(event.state) && (
              <Link href={`/events/${event.id}`} className="text-on-surface-variant text-sm">
                View Details →
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StateChip({ state }: { state: string }) {
  if (state === 'live') return <Chip variant="live">LIVE</Chip>
  if (state === 'published') return <Chip variant="pending">UPCOMING</Chip>
  if (state === 'draft') return <Chip variant="pending">DRAFT</Chip>
  return <Chip variant="played">ENDED</Chip>
}
