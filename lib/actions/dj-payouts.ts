'use server'

import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function getDjPayoutHistory(): Promise<{
  transfers?: Stripe.Transfer[]
  payouts?: Stripe.Payout[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_onboarded')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_connect_account_id || !userData.stripe_connect_onboarded) {
    return { error: 'Stripe not connected. Complete onboarding first.' }
  }

  const accountId = userData.stripe_connect_account_id

  const [transfersResult, payoutsResult] = await Promise.all([
    stripe.transfers.list({ destination: accountId, limit: 50 }),
    stripe.payouts.list({ limit: 50 }, { stripeAccount: accountId }),
  ])

  return {
    transfers: transfersResult.data,
    payouts: payoutsResult.data,
  }
}

export async function requestDjPayout(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_onboarded')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_connect_account_id || !userData.stripe_connect_onboarded) {
    return { error: 'Stripe not connected. Complete onboarding first.' }
  }

  try {
    await stripe.payouts.create(
      { currency: 'usd', method: 'instant' } as Parameters<typeof stripe.payouts.create>[0],
      { stripeAccount: userData.stripe_connect_account_id }
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Payout failed' }
  }

  return {}
}
