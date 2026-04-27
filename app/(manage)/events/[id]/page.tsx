import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import DjAssignForm from './DjAssignForm'
import { publishEvent, updateTipSettings } from '@/lib/actions/events'
import { initiateStripeConnect } from '@/lib/actions/stripe'
import { stripe } from '@/lib/stripe'
import { unstable_cache } from 'next/cache'

const getCachedPayoutStatus = unstable_cache(
  async (id: string) => {
    try {
      const account = await stripe.accounts.retrieve(id)
      if (account.payouts_enabled) return 'connected' as const
      if (account.details_submitted) return 'pending' as const
      return 'not_connected' as const
    } catch {
      return 'not_connected' as const
    }
  },
  ['payout-status'],
  { revalidate: 300 }
)

async function getPayoutStatus(accountId: string): Promise<'not_connected' | 'pending' | 'connected'> {
  return getCachedPayoutStatus(accountId)
}

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
    .select('id, title, start_at, end_at, timezone, venue_name, state, event_code, cover_image_url, description, organizer_id, dj_id, rsvp_type, tips_enabled, min_tip_cents')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_onboarded')
    .eq('id', user.id)
    .single()

  let payoutStatus: 'not_connected' | 'pending' | 'connected' = 'not_connected'
  if (userData?.stripe_connect_account_id) {
    payoutStatus = await getPayoutStatus(userData.stripe_connect_account_id)
  }

  let djName: string | null = null
  if (event.dj_id) {
    const { data: djUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', event.dj_id)
      .single()
    djName = djUser?.name ?? null
  }

  const { count: pendingRefundCount } = await supabase
    .from('refund_requests')
    .select('id', { count: 'exact', head: true })
    .eq('rsvp.event_id', id)
    .eq('status', 'pending')

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${event.event_code}`
  const storyUrl = `/api/story?eventId=${event.id}`
  const isLiveOrEnded = ['live', 'ended'].includes(event.state)

  return (
    <main className="px-4 py-6 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/events" className="text-on-surface-variant">←</Link>
        <h1 className="font-headline text-2xl font-bold flex-1 truncate">{event.title}</h1>
        <StateChip state={event.state} />
      </div>

      {event.cover_image_url && (
        <img src={event.cover_image_url} alt="Event cover" className="w-full aspect-video object-cover rounded-xl" />
      )}

      <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Share link</p>
          <p className="text-secondary text-sm truncate">{shareUrl}</p>
        </div>
      </div>

      {/* Stripe Connect status */}
      <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <p className="text-on-surface-variant text-xs uppercase tracking-wider">Stripe Payouts</p>
        <div className="flex items-center justify-between">
          <PayoutChip status={payoutStatus} />
          {payoutStatus === 'not_connected' && (
            <form action={initiateStripeConnect as unknown as (formData: FormData) => Promise<void>}>
              <button type="submit" className="text-secondary text-sm font-label font-semibold">
                Connect Stripe →
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Tip settings (immutable once live) */}
      {event.rsvp_type === 'paid' && !isLiveOrEnded && (
        <form action={updateTipSettings.bind(null, event.id) as unknown as (formData: FormData) => Promise<void>} className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Tip Settings</p>
          <label className="flex items-center justify-between">
            <span className="text-on-surface text-sm">Allow tips</span>
            <input type="checkbox" name="tipsEnabled" defaultChecked={event.tips_enabled} className="accent-primary" />
          </label>
          <div className="space-y-1">
            <label className="text-on-surface-variant text-xs">Minimum tip (cents)</label>
            <input
              type="number"
              name="minTipCents"
              defaultValue={event.min_tip_cents}
              min={100}
              step={50}
              className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
          <button type="submit" className="text-secondary text-sm font-label font-semibold">Save</button>
        </form>
      )}

      {/* DJ assignment */}
      <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <p className="text-on-surface-variant text-xs uppercase tracking-wider">DJ</p>
        {djName ? (
          <p className="font-label font-semibold text-on-surface">{djName}</p>
        ) : (
          <p className="text-on-surface-variant text-sm">No DJ assigned</p>
        )}
        <DjAssignForm eventId={event.id} />
      </div>

      <div className="space-y-3">
        {event.state === 'draft' && (
          <form action={publishEvent.bind(null, event.id) as unknown as (formData: FormData) => Promise<void>}>
            <button type="submit" className="w-full py-3 rounded-full bg-primary text-on-primary font-label font-semibold">
              Publish Event
            </button>
          </form>
        )}
        {event.state === 'published' && (
          <Link href={`/manage/events/${event.id}/tiers`}>
            <Button variant="secondary" className="w-full">Manage Ticket Tiers →</Button>
          </Link>
        )}
        {event.state === 'live' && (
          <Link href={`/events/${event.id}/door`}>
            <Button className="w-full">Manage Door →</Button>
          </Link>
        )}
        {(event.state === 'live' || event.state === 'ended') && (
          <Link href="/queue">
            <Button variant="secondary" className="w-full">Open DJ Dashboard →</Button>
          </Link>
        )}
        {(event.state === 'published' || event.state === 'live' || event.state === 'ended') && (
          <Link href={`/manage/events/${event.id}/refunds`}>
            <Button variant="secondary" className="w-full relative">
              Refund Requests
              {(pendingRefundCount ?? 0) > 0 && (
                <span className="absolute top-1 right-3 bg-error text-on-error text-xs font-bold rounded-full px-1.5 py-0.5">
                  {pendingRefundCount}
                </span>
              )}
            </Button>
          </Link>
        )}
        {event.state === 'ended' && (
          <Link href={`/events/${event.id}/analytics`}>
            <Button variant="secondary" className="w-full">View Analytics →</Button>
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

function PayoutChip({ status }: { status: 'not_connected' | 'pending' | 'connected' }) {
  if (status === 'connected') return <Chip variant="live">Payouts Active</Chip>
  if (status === 'pending') return <Chip variant="pending">Verification Pending</Chip>
  return <Chip variant="played">Not Connected</Chip>
}
