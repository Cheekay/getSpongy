import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QueueClient from './QueueClient'

export default async function QueuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/queue')

  const { data: events } = await supabase
    .from('events')
    .select('id, title, state, requests_paused, requests_paused_until')
    .or(`dj_id.eq.${user.id},organizer_id.eq.${user.id}`)
    .eq('state', 'live')
    .order('start_at', { ascending: false })

  if (!events || events.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <span className="text-4xl mb-4">🎧</span>
        <h1 className="font-headline text-2xl font-bold">No live events</h1>
        <p className="text-on-surface-variant mt-2">
          Your events will appear here when they go live.
        </p>
      </main>
    )
  }

  const activeEvent = events[0]
  const { data: requests } = await supabase
    .from('song_requests')
    .select('*')
    .eq('event_id', activeEvent.id)
    .in('state', ['pending', 'accepted'])
    .order('created_at', { ascending: false })

  return (
    <QueueClient
      event={activeEvent}
      initialRequests={requests ?? []}
    />
  )
}
