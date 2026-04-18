import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { format } from 'date-fns-tz'
import EventPageClient from './EventPageClient'

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const supabase = await createClient()
  const { data: event } = await supabase
    .from('events')
    .select('id, title, venue_name, start_at, timezone, cover_image_url')
    .eq('event_code', code)
    .single()

  if (!event) return { title: 'Event Not Found' }

  const dateStr = format(new Date(event.start_at), 'EEE MMM d · h:mm a', { timeZone: event.timezone })
  return {
    title: event.title,
    description: `${dateStr} · ${event.venue_name}`,
    openGraph: {
      title: event.title,
      description: `${dateStr} · ${event.venue_name}`,
      images: [
        {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/og?eventId=${event.id}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  }
}

export default async function EventCodePage({ params }: Props) {
  const { code } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select(`
      id, title, description, cover_image_url, start_at, end_at, timezone,
      venue_name, state, capacity, event_code, rsvp_type,
      organizer:users!organizer_id(name)
    `)
    .eq('event_code', code)
    .neq('state', 'draft')
    .single()

  if (!event) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  const [rsvpResult, countResult] = await Promise.all([
    user
      ? supabase.from('rsvps').select('id, qr_jwt').eq('event_id', event.id).eq('user_id', user.id).single()
      : Promise.resolve({ data: null }),
    supabase.from('rsvps').select('id', { count: 'exact', head: true }).eq('event_id', event.id).neq('status', 'cancelled'),
  ])

  const existingRsvp = rsvpResult.data ?? null
  const rsvpCount = countResult.count ?? 0
  const atCapacity = event.capacity !== null && rsvpCount >= event.capacity

  const hasProfile = user
    ? !!(await supabase.from('users').select('name').eq('id', user.id).single()).data?.name
    : false

  return (
    <EventPageClient
      event={event as any}
      user={user ? { id: user.id } : null}
      hasProfile={hasProfile}
      existingRsvp={existingRsvp}
      rsvpCount={rsvpCount}
      atCapacity={atCapacity}
      appUrl={process.env.NEXT_PUBLIC_APP_URL!}
    />
  )
}
