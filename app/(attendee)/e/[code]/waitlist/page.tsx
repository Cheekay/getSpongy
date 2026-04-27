import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { joinWaitlist, leaveWaitlist } from '@/lib/actions/waitlist'

export default async function WaitlistPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/e/${code}/waitlist`)

  const { data: event } = await supabase
    .from('events')
    .select('id, title')
    .eq('event_code', code)
    .single()

  if (!event) notFound()

  const { data: existing } = await supabase
    .from('waitlist')
    .select('position')
    .eq('event_id', event.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return (
      <main className="px-4 py-12 text-center space-y-4">
        <h1 className="font-headline text-2xl font-bold">You're on the waitlist</h1>
        <p className="text-on-surface-variant">Position #{existing.position} for {event.title}</p>
        <p className="text-on-surface-variant text-sm">We'll text you if a spot opens up.</p>
        <form action={async () => { await leaveWaitlist(event.id) }}>
          <button type="submit" className="text-error text-sm font-label">Leave waitlist</button>
        </form>
      </main>
    )
  }

  return (
    <main className="px-4 py-12 text-center space-y-4">
      <h1 className="font-headline text-2xl font-bold">Join Waitlist</h1>
      <p className="text-on-surface-variant">{event.title} is sold out. Join the waitlist and we'll text you if a spot opens up.</p>
      <form action={async () => { await joinWaitlist({ eventId: event.id }) }}>
        <button
          type="submit"
          className="w-full py-3 rounded-full bg-primary text-on-primary font-label font-semibold"
        >
          Join Waitlist
        </button>
      </form>
    </main>
  )
}
