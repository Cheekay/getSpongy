import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'

export default async function EventDetailPage({
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
    .select('id, title, start_at, end_at, timezone, venue_name, state, event_code, cover_image_url, description, organizer_id')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${event.event_code}`
  const storyUrl = `/api/story?eventId=${event.id}`

  return (
    <main className="px-4 py-6 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/events" className="text-on-surface-variant">←</Link>
        <h1 className="font-headline text-2xl font-bold flex-1 truncate">{event.title}</h1>
        <StateChip state={event.state} />
      </div>

      {event.cover_image_url && (
        <img
          src={event.cover_image_url}
          alt="Event cover"
          className="w-full aspect-video object-cover rounded-xl"
        />
      )}

      <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Share link</p>
          <div className="flex items-center gap-2">
            <p className="text-secondary text-sm truncate flex-1">{shareUrl}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {event.state === 'live' && (
          <Link href={`/events/${event.id}/door`}>
            <Button className="w-full">Manage Door →</Button>
          </Link>
        )}
        <a href={storyUrl} download>
          <Button variant="secondary" className="w-full">Download IG Story</Button>
        </a>
      </div>
    </main>
  )
}

function StateChip({ state }: { state: string }) {
  if (state === 'live') return <Chip variant="live">LIVE</Chip>
  if (state === 'published') return <Chip variant="pending">UPCOMING</Chip>
  if (state === 'draft') return <Chip variant="pending">DRAFT</Chip>
  return <Chip variant="played">ENDED</Chip>
}
