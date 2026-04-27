import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createBillingPortalSession } from '@/lib/actions/subscription'
import { Chip } from '@/components/ui/Chip'

export default async function SubscriptionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status, subscription_period_end')
    .eq('id', user.id)
    .single()

  const status = userData?.subscription_status ?? 'free'
  const periodEnd = userData?.subscription_period_end
    ? new Date(userData.subscription_period_end).toLocaleDateString()
    : null

  return (
    <main className="px-4 py-6 space-y-6">
      <h1 className="font-headline text-2xl font-bold">Subscription</h1>

      <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-on-surface-variant text-sm uppercase tracking-wider">Current plan</span>
          <StatusChip status={status} />
        </div>
        {periodEnd && (
          <p className="text-on-surface-variant text-xs">
            {status === 'trialing' ? 'Trial ends' : status === 'canceled' ? 'Access until' : 'Renews'}: {periodEnd}
          </p>
        )}
      </div>

      {status === 'free' && (
        <a href="/upgrade" className="block w-full py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-semibold text-center">
          Upgrade to Pro
        </a>
      )}

      {status !== 'free' && (
        <form action={async () => { await createBillingPortalSession() }}>
          <button type="submit" className="w-full py-3 rounded-full border border-outline/30 text-on-surface font-label font-semibold">
            Manage billing →
          </button>
        </form>
      )}
    </main>
  )
}

function StatusChip({ status }: { status: string }) {
  if (status === 'active') return <Chip variant="live">PRO · ACTIVE</Chip>
  if (status === 'trialing') return <Chip variant="pending">PRO · TRIAL</Chip>
  if (status === 'past_due') return <Chip variant="played">PAST DUE</Chip>
  if (status === 'canceled') return <Chip variant="played">CANCELED</Chip>
  return <Chip variant="played">FREE</Chip>
}
