import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import TiersClient from './TiersClient'

export default async function TiersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, state')
    .eq('id', id)
    .eq('organizer_id', user.id)
    .single()

  if (!event) notFound()

  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('id, name, price_cents, inventory, sold_count, active')
    .eq('event_id', id)
    .order('created_at', { ascending: true })

  return (
    <main className="px-4 py-6 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/events/${id}`} className="text-on-surface-variant">←</Link>
        <h1 className="font-headline text-xl font-bold flex-1">Ticket Tiers</h1>
      </div>
      <TiersClient eventId={id} initialTiers={tiers ?? []} isLive={event.state === 'live'} />
    </main>
  )
}
