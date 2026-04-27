import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createCheckoutSession } from '@/lib/actions/subscription'

export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', user.id)
    .single()

  if (['trialing', 'active'].includes(userData?.subscription_status ?? '')) {
    redirect('/manage/subscription')
  }

  return (
    <main className="px-4 py-6 space-y-8 max-w-md mx-auto">
      <h1 className="font-headline text-3xl font-bold">Go Pro</h1>

      <div className="bg-surface-container-low rounded-2xl p-6 space-y-4 ring-1 ring-primary/30">
        <div className="flex items-baseline gap-1">
          <span className="font-headline text-4xl font-bold text-primary">$19</span>
          <span className="text-on-surface-variant text-sm">/month</span>
        </div>
        <p className="text-on-surface-variant text-sm">14-day free trial · Cancel anytime</p>
        <ul className="space-y-2 text-sm text-on-surface">
          {[
            'Multi-event analytics dashboard',
            'Custom branding + no Spongy watermark',
            'Team seats (door staff + co-organizers)',
            'DJ payout via Stripe Connect',
            'Priority support',
          ].map(f => (
            <li key={f} className="flex gap-2"><span className="text-tertiary">✓</span>{f}</li>
          ))}
        </ul>
        <form action={async () => { await createCheckoutSession() }}>
          <button
            type="submit"
            className="w-full py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-semibold"
          >
            Start free trial
          </button>
        </form>
      </div>

      <div className="bg-surface-container-low rounded-2xl p-6 space-y-4">
        <p className="font-headline text-lg font-bold">Free</p>
        <ul className="space-y-2 text-sm text-on-surface-variant">
          {[
            'List unlimited free events',
            'Basic per-event analytics',
            'Spongy watermark on recap graphics',
            'Single organizer account',
          ].map(f => (
            <li key={f} className="flex gap-2"><span>·</span>{f}</li>
          ))}
        </ul>
      </div>
    </main>
  )
}
