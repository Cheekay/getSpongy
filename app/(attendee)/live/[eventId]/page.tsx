import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LiveClient from './LiveClient'

export default async function LiveEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/live/${eventId}`)

  const [eventResult, rsvpResult, myRequestResult, queueResult] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, state, event_code, requests_paused, requests_paused_until, tips_enabled, min_tip_cents')
      .eq('id', eventId)
      .single(),
    supabase
      .from('rsvps')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .maybeSingle(),
    supabase
      .from('song_requests')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .in('state', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('song_requests')
      .select('*')
      .eq('event_id', eventId)
      .eq('state', 'accepted')
      .order('upvote_count', { ascending: false })
      .order('state_changed_at', { ascending: true }),
  ])

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

  const event = eventResult.data
  if (!event) {
    return (
      <main className="px-4 py-6 text-center">
        <p className="text-on-surface-variant">Event not found.</p>
      </main>
    )
  }

  if (event.state !== 'live') {
    return (
      <main className="px-4 py-6 text-center flex flex-col items-center justify-center min-h-screen">
        <h1 className="font-headline text-2xl font-bold">{event.title}</h1>
        <p className="text-on-surface-variant mt-2">This event isn't live yet.</p>
      </main>
    )
  }

  if (!rsvpResult.data) {
    redirect(`/e/${event.event_code}`)
  }

  return (
    <LiveClient
      event={event}
      userId={user.id}
      rsvpId={rsvpResult.data!.id}
      initialMyRequest={myRequestResult.data ?? null}
      initialQueue={initialQueue}
      initialUpvotedIds={initialUpvotedIds}
    />
  )
}
