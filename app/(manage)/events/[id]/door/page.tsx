import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import DoorClient from './DoorClient'
import type { GuestRow } from '@/lib/actions/checkin'

export default async function DoorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, capacity, organizer_id')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  const { data: rsvps } = await supabase
    .from('rsvps')
    .select('id, status, checked_in_at, user:users!user_id(name, phone)')
    .eq('event_id', id)
    .neq('status', 'cancelled')
    .order('status', { ascending: true })

  return (
    <DoorClient
      eventId={id}
      eventTitle={event.title}
      capacity={event.capacity}
      initialGuests={(rsvps ?? []) as unknown as GuestRow[]}
    />
  )
}
