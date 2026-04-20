'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'

export async function initiateStripeConnect(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_onboarded, stripe_connect_account_id')
    .eq('id', user.id)
    .single()

  if (userData?.stripe_connect_onboarded) return { error: 'Already connected' }

  const account = await stripe.accounts.create({ type: 'express' })

  const admin = createServiceClient()
  await admin
    .from('users')
    .update({ stripe_connect_account_id: account.id })
    .eq('id', user.id)

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/events?stripe=refresh`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/connect/callback?account_id=${account.id}`,
    type: 'account_onboarding',
  })

  return { url: accountLink.url }
}
