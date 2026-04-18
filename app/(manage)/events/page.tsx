import { createClient } from '@/lib/supabase/server'
import { autoFlipEvents } from '@/lib/actions/events'
import { redirect } from 'next/navigation'
import EventList from './EventList'

export default async function EventsPage() {
  await autoFlipEvents()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/events')

  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_at, state, cover_image_url, event_code')
    .eq('organizer_id', user.id)
    .order('start_at', { ascending: false })

  return (
    <main className="px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-headline text-3xl font-bold">My Events</h1>
        <a
          href="/events/new"
          className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-primary-container flex items-center justify-center text-on-primary-fixed font-bold text-xl"
        >
          +
        </a>
      </div>
      <EventList events={events ?? []} />
    </main>
  )
}
