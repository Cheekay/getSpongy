// app/(manage)/events/[id]/analytics/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import CheckInChart from './CheckInChart'

type CheckInBucket = { hour: string; count: number }

function bucketByHour(rows: { checked_in_at: string | null }[]): CheckInBucket[] {
  const buckets: Record<string, number> = {}
  for (const row of rows) {
    if (!row.checked_in_at) continue
    const hour = new Date(row.checked_in_at).toISOString().slice(0, 13) + ':00'
    buckets[hour] = (buckets[hour] ?? 0) + 1
  }
  return Object.entries(buckets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, count]) => ({ hour, count }))
}

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, state, organizer_id')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  const admin = createServiceClient()

  const [
    attendedResult,
    revenueResult,
    requestsByStateResult,
    topTracksResult,
    checkInTimelineResult,
  ] = await Promise.all([
    admin
      .from('rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('status', 'checked_in'),

    admin
      .from('rsvps')
      .select('price_paid_cents')
      .eq('event_id', id)
      .in('status', ['paid', 'checked_in']),

    admin
      .from('song_requests')
      .select('state')
      .eq('event_id', id),

    admin
      .from('song_requests')
      .select('spotify_track_id, track_title, track_artist, album_art_url, upvote_count')
      .eq('event_id', id)
      .order('upvote_count', { ascending: false })
      .limit(10),

    admin
      .from('rsvps')
      .select('checked_in_at')
      .eq('event_id', id)
      .eq('status', 'checked_in'),
  ])

  const attended = attendedResult.count ?? 0
  const revenue = (revenueResult.data ?? []).reduce((sum, r) => sum + (r.price_paid_cents ?? 0), 0)

  const requestCounts = (requestsByStateResult.data ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.state] = (acc[r.state] ?? 0) + 1
    return acc
  }, {})

  const topTracks = topTracksResult.data ?? []
  const checkInBuckets = bucketByHour(checkInTimelineResult.data ?? [])

  const csvUrl = `/api/events/${id}/analytics/export`
  const recapUrl = `/api/events/${id}/recap`

  return (
    <main className="px-4 py-6 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/events/${id}`} className="text-on-surface-variant">←</Link>
        <h1 className="font-headline text-xl font-bold flex-1">Event Analytics</h1>
      </div>
      <p className="text-on-surface-variant text-sm font-label">{event.title}</p>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-container-low rounded-xl p-4">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Attended</p>
          <p className="font-headline text-3xl font-bold mt-1">{attended}</p>
        </div>
        <div className="bg-surface-container-low rounded-xl p-4">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Revenue</p>
          <p className="font-headline text-3xl font-bold mt-1">${(revenue / 100).toFixed(2)}</p>
        </div>
        <div className="bg-surface-container-low rounded-xl p-4">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Requests</p>
          <p className="font-headline text-3xl font-bold mt-1">
            {Object.values(requestCounts).reduce((a, b) => a + b, 0)}
          </p>
        </div>
        <div className="bg-surface-container-low rounded-xl p-4">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Played</p>
          <p className="font-headline text-3xl font-bold mt-1">{requestCounts.played ?? 0}</p>
        </div>
      </div>

      {/* Request breakdown */}
      <div className="bg-surface-container-low rounded-xl p-4 space-y-2">
        <p className="text-on-surface-variant text-xs uppercase tracking-wider">Requests by State</p>
        {['pending', 'accepted', 'played', 'rejected', 'withdrawn', 'expired'].map((state) => (
          requestCounts[state] ? (
            <div key={state} className="flex items-center justify-between">
              <span className="text-on-surface text-sm capitalize">{state}</span>
              <span className="font-label font-semibold text-on-surface">{requestCounts[state]}</span>
            </div>
          ) : null
        ))}
      </div>

      {/* Top tracks */}
      {topTracks.length > 0 && (
        <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Top 10 Requested Tracks</p>
          {topTracks.map((track, i) => (
            <div key={track.spotify_track_id} className="flex items-center gap-3">
              <span className="text-on-surface-variant text-sm w-5 shrink-0">{i + 1}.</span>
              {track.album_art_url && (
                <img src={track.album_art_url} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-label font-semibold text-on-surface text-sm truncate">{track.track_title}</p>
                <p className="text-on-surface-variant text-xs truncate">{track.track_artist}</p>
              </div>
              <span className="text-on-surface-variant text-xs shrink-0">↑ {track.upvote_count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Check-in timeline */}
      {checkInBuckets.length > 0 && (
        <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Check-in Timeline</p>
          <CheckInChart buckets={checkInBuckets} />
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <a href={csvUrl} download>
          <button className="w-full py-3 rounded-full bg-surface-container text-on-surface font-label font-semibold">
            Export CSV
          </button>
        </a>
        {event.state === 'ended' && (
          <a href={recapUrl} download>
            <button className="w-full py-3 rounded-full bg-primary text-on-primary font-label font-semibold">
              Share Recap ↗
            </button>
          </a>
        )}
      </div>
    </main>
  )
}
