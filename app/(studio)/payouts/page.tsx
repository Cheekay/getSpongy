import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getDjPayoutHistory, requestDjPayout } from '@/lib/actions/dj-payouts'
import { initiateStripeConnect } from '@/lib/actions/stripe'
import { Chip } from '@/components/ui/Chip'

export default async function DjPayoutsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_onboarded, role_flags')
    .eq('id', user.id)
    .single()

  const isDj = (userData?.role_flags as Record<string, boolean> | null)?.dj === true
  if (!isDj) redirect('/explore')

  const isOnboarded = userData?.stripe_connect_onboarded === true

  const { transfers, payouts, error } = isOnboarded
    ? await getDjPayoutHistory()
    : { transfers: [], payouts: [], error: undefined }

  return (
    <main className="px-4 py-6 space-y-6">
      <h1 className="font-headline text-2xl font-bold">DJ Payouts</h1>

      {!isOnboarded && (
        <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <p className="text-on-surface-variant text-sm">Connect with Stripe to receive tips and payouts directly to your bank account.</p>
          <form action={async () => { await initiateStripeConnect() }}>
            <button type="submit" className="w-full py-3 rounded-full bg-primary text-on-primary font-label font-semibold">
              Connect with Stripe →
            </button>
          </form>
        </div>
      )}

      {isOnboarded && (
        <>
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-on-surface-variant text-xs uppercase tracking-wider">Status</p>
              <Chip variant="live">Connected</Chip>
            </div>
            <form action={async () => { await requestDjPayout() }}>
              <button type="submit" className="w-full py-2 rounded-full border border-primary text-primary font-label font-semibold text-sm">
                Request Instant Payout
              </button>
            </form>
          </div>

          {error && <p className="text-error text-sm">{error}</p>}

          {(transfers?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-on-surface-variant text-xs uppercase tracking-wider">Earnings</p>
              {transfers!.map(tr => (
                <div key={tr.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-on-surface text-sm">${(tr.amount / 100).toFixed(2)}</p>
                  <p className="text-on-surface-variant text-xs">{new Date((tr.created as number) * 1000).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}

          {(payouts?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-on-surface-variant text-xs uppercase tracking-wider">Bank Payouts</p>
              {payouts!.map(po => (
                <div key={po.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-on-surface text-sm">${(po.amount / 100).toFixed(2)}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-on-surface-variant text-xs">{new Date((po.created as number) * 1000).toLocaleDateString()}</p>
                    <Chip variant={po.status === 'paid' ? 'live' : 'pending'}>{(po.status as string).toUpperCase()}</Chip>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!transfers?.length && !payouts?.length && (
            <p className="text-on-surface-variant text-sm text-center py-8">No payout history yet.</p>
          )}
        </>
      )}
    </main>
  )
}
